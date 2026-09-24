import * as T from '../vendor/three.module.min.js';
import {createCharacter,animateCharacter,disposeObject} from './models.js?v=0.3.0';
import {createArena,createBall,COURT} from './arena.js?v=0.3.0';
import {REFEREE} from './roster.js?v=0.3.0';
import {clamp,shotProfile,botRelease,distanceToSegment} from './mechanics.js?v=0.3.0';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const $=id=>document.getElementById(id);
const speedOf=p=>Math.hypot(p.vx,p.vz);
export class CourtGame {
 constructor(canvas,callbacks={}) {
  this.callbacks=callbacks;this.canvas=canvas;this.scene=new T.Scene();
  this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));this.renderer.shadowMap.enabled=true;
  this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.outputColorSpace=T.SRGBColorSpace;
  this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.03;
  this.camera=new T.PerspectiveCamera(51,1,.1,130);this.cameraMode='close';this.cameraFocus=new T.Vector3();
  createArena(this.scene);this.ballMesh=createBall();this.scene.add(this.ballMesh);
  this.referee=createCharacter(REFEREE,0);this.referee.position.set(0,0,-5.75);this.scene.add(this.referee);
  this.players=[];this.running=false;this.paused=false;this.input={x:0,z:0};this.keys=new Set();
  this.soundOn=true;this.audio=null;this.raf=0;this.time=0;this.noticeTimer=0;this.chargeStart=null;
  this.chargeMovement=0;this.portraitAllowed=false;this.disposers=[];this.resize=this.resize.bind(this);
  window.addEventListener('resize',this.resize);this.installControls();this.resize();
 }
 start(roster,options={}) {
  this.stop();for(const p of this.players){this.scene.remove(p.mesh);disposeObject(p.mesh);}
  $('player-labels').replaceChildren();this.players=[];
  roster.forEach((definition,i)=>{
   const p={definition,team:i<2?0:1,index:i,x:0,z:0,vx:0,vz:0,energy:0,stamina:100,
    superUntil:0,stealUntil:0,blockUntil:0,blockReady:0,shootUntil:0,passUntil:0,stunUntil:0,
    burstUntil:0,burstReady:0,fakeUntil:0,fakeReady:0,catchUntil:0,protectedUntil:0,
    air:0,think:.15+i*.08,holdTime:0,settled:1,gait:i*.7,aiShot:null,reactionAt:0,
    stats:{points:0,assists:0,steals:0,blocks:0,rebounds:0,shots:0,made:0,threes:0,threesMade:0},
    mesh:createCharacter(definition,i<2?0:1)};
   this.scene.add(p.mesh);const label=document.createElement('span');
   label.className='player-label'+(i===0?' self':'');label.textContent=(i===0?'▴ ':'')+definition.name;
   $('player-labels').append(label);p.label=label;this.players.push(p);
  });
  this.user=this.players[0];this.score=[0,0];this.clock=180;this.shotClock=24;this.overtime=false;
  this.time=0;this.matchId=options.matchId??`match-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  this.ball={mode:'held',owner:this.user,pos:new T.Vector3(),previousPass:null};this.possession=0;
  this.noticeTimer=0;this.paused=false;this.running=true;this.input={x:0,z:0};this.keys.clear();this.cancelCharge();
  $('active-name').textContent=this.user.definition.name;$('active-ovr').textContent=this.user.definition.ovr;
  $('active-photo').src=this.user.definition.photo;$('active-photo').style.objectPosition=this.user.definition.photoPosition;
  $('shot-feedback').textContent='';this.feedbackUntil=0;this.resetPositions(0);this.inboundUntil=.9;
  this.notice('ЛИЦЕЙ № 2','Остановись перед броском · атакуй свободное кольцо',2.6);
  this.resize();this.updateCamera(1,true);this.unlockAudio();this.lastFrame=performance.now();this.loop(this.lastFrame);
 }
 attackSign(team){return team===0?1:-1;}
 hoop(team){return {x:this.attackSign(team)*COURT.hoopX,z:0};}
 stat(p,key){
  let v=p.definition.stats[key];if(p.superUntil>this.time){switch(p.definition.super.id){
   case 'flight':if(key==='jump'||key==='dunk')v+=12;break;
   case 'dash':if(key==='handle')v+=18;if(key==='speed')v*=1.24;break;
   case 'secondwind':if(key==='defense')v+=15;if(key==='speed')v*=1.12;break;
   case 'anchor':if(key==='defense')v+=22;break;
  }}return v;
 }
 resetPositions(team){
  const dir=this.attackSign(team),own=this.players.filter(p=>p.team===team),other=this.players.filter(p=>p.team!==team);
  own.forEach((p,i)=>{p.x=-dir*2.4;p.z=i===0?1.8:-2.1;p.vx=p.vz=0;p.holdTime=0;p.aiShot=null;});
  other.forEach((p,i)=>{p.x=dir*1.8;p.z=i===0?1.3:-1.9;p.vx=p.vz=0;p.holdTime=0;p.aiShot=null;});
  this.giveBall(own[0],false);this.shotClock=24;this.ball.previousPass=null;
 }
 inbound(team){
  // Defenders stay in the play rather than teleporting to the centre after every basket.
  const dir=this.attackSign(team),own=this.players.filter(p=>p.team===team);
  own.forEach((p,i)=>{p.x=-dir*(i===0?7.9:5.4);p.z=i===0?1.1:-2.5;p.vx=p.vz=0;p.aiShot=null;});
  this.giveBall(own[0]);own[0].protectedUntil=this.time+1.45;this.ball.previousPass=null;
  this.shotClock=24;this.inboundUntil=this.time+.65;
 }
 giveBall(p,resetClock=true){
  const previousTeam=this.possession;this.ball.mode='held';this.ball.owner=p;
  this.ball.pos.set(p.x,1.1*p.definition.scale,p.z);this.possession=p.team;p.holdTime=0;p.aiShot=null;
  if(resetClock&&previousTeam!==p.team)this.shotClock=24;if(p!==this.user)this.cancelCharge();
 }
 unlockAudio(){try{if(!this.audio){const AC=window.AudioContext||window.webkitAudioContext;if(AC)this.audio=new AC();}this.audio?.resume().catch(()=>{});}catch{}}
 tone(frequency=400,duration=.08,volume=.02){
  if(!this.soundOn||!this.audio||this.audio.state!=='running')return;
  try{const o=this.audio.createOscillator(),g=this.audio.createGain();o.type='sine';o.frequency.setValueAtTime(frequency,this.audio.currentTime);o.frequency.exponentialRampToValueAtTime(frequency*.6,this.audio.currentTime+duration);g.gain.setValueAtTime(volume,this.audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,this.audio.currentTime+duration);o.connect(g);g.connect(this.audio.destination);o.start();o.stop(this.audio.currentTime+duration);}catch{}
 }
 notice(title,sub='',seconds=1.5){
  $('callout').replaceChildren(document.createTextNode(title));if(sub){const el=document.createElement('small');el.textContent=sub;$('callout').append(el);}
  $('callout').classList.add('show');this.noticeTimer=seconds;
 }
 resize(){
  const w=this.canvas.clientWidth||innerWidth,h=this.canvas.clientHeight||innerHeight;
  this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.updateCamera(1,true);
  const rotate=w<h&&!this.portraitAllowed;$('rotate').classList.toggle('hidden',!rotate);this.orientationBlocked=rotate;
 }
 updateCamera(dt,snap=false){
  if(!this.camera)return;const close=this.cameraMode==='close',portrait=this.camera.aspect<1;
  const ux=this.user?.x??0,uz=this.user?.z??0,bx=this.ball?.pos.x??0;
  const tx=close?clamp(ux*.65+bx*.25+1,-5.1,5.1):0,tz=close?clamp(uz*.2,-.7,.7):0;
  const focus=this.cameraFocus,a=snap?1:1-Math.exp(-dt*3.7);
  focus.x+=(tx-focus.x)*a;focus.z+=(tz-focus.z)*a;const offset=portrait?1.38:1;
  this.camera.position.set(focus.x-(close?1.6:0),(close?5.0:9.8)*offset,focus.z+(close?9.5:14.3)*offset);
  this.camera.fov=close?51:46;this.camera.lookAt(focus.x+(close?.9:0),close?.95:.35,focus.z);
  this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
 }
 loop(now){
  if(!this.running)return;const dt=Math.min(.05,Math.max(0,(now-this.lastFrame)/1000));this.lastFrame=now;
  if(!this.paused&&!this.orientationBlocked)this.update(dt);this.render();this.raf=requestAnimationFrame(t=>this.loop(t));
 }
 update(dt){
  this.time+=dt;if(this.noticeTimer>0){this.noticeTimer-=dt;if(this.noticeTimer<=0)$('callout').classList.remove('show');}
  if(this.inboundUntil>this.time||this.ball.mode==='scored'){
   this.animatePlayers(dt);this.updateBall(dt);this.updateCamera(dt);this.updateUI();return;
  }
  if(!this.overtime)this.clock=Math.max(0,this.clock-dt);this.shotClock-=dt;
  if(this.shotClock<=0&&this.ball.mode==='held'){
   this.notice('ВРЕМЯ АТАКИ','Мяч переходит сопернику');this.cancelCharge();this.resetPositions(1-this.possession);
   this.inboundUntil=this.time+.9;this.tone(1100,.15);return;
  }
  if(this.clock<=0&&!this.overtime&&this.ball.mode!=='shot'){
   if(this.score[0]===this.score[1]){this.overtime=true;this.notice('ДО ПЕРВОГО ПОПАДАНИЯ','Дополнительное время',2.6);}else{this.end();return;}
  }
  let ix=this.input.x,iz=this.input.z;
  if(this.keys.has('ArrowLeft')||this.keys.has('KeyA'))ix-=1;if(this.keys.has('ArrowRight')||this.keys.has('KeyD'))ix+=1;
  if(this.keys.has('ArrowUp')||this.keys.has('KeyW'))iz-=1;if(this.keys.has('ArrowDown')||this.keys.has('KeyS'))iz+=1;
  const length=Math.hypot(ix,iz);if(length>1){ix/=length;iz/=length;}
  // Translate screen-relative controls into the ground plane of the oblique camera.
  if(this.camera){const e=this.camera.matrixWorld.elements,rx=e[0],rz=e[2],l=Math.hypot(rx,rz)||1,x=ix;ix=(rx*x-rz*iz)/l;iz=(rz*x+rx*iz)/l;}
  for(const p of this.players){
   p.energy=Math.min(100,p.energy+dt*.65);if(p===this.user)this.move(p,ix,iz,dt);else this.ai(p,dt);
   if(p===this.ball.owner)p.holdTime+=dt;else{p.holdTime=0;p.aiShot=null;}
  }
  this.resolveCollisions();this.updateBall(dt);this.animatePlayers(dt);this.updateCamera(dt);this.updateUI();
 }
 move(p,dx,dz,dt){
  const magnitude=Math.min(1,Math.hypot(dx,dz));let speed=2.15+this.stat(p,'speed')*.025;
  if(this.ball.owner===p)speed*=.84+.16*this.stat(p,'handle')/100;speed*=.78+.22*p.stamina/100;
  if(p.burstUntil>this.time)speed*=1.38;if(p.stunUntil>this.time)speed*=.22;
  if(p.shootUntil>this.time||p.aiShot||p===this.user&&this.chargeStart!==null)speed*=.42;
  if(p.blockUntil>this.time)speed*=.52;
  const response=1-Math.exp(-(magnitude>.05?9:14)*dt);p.vx+=(dx*speed-p.vx)*response;p.vz+=(dz*speed-p.vz)*response;
  p.x=clamp(p.x+p.vx*dt,-9.08,9.08);p.z=clamp(p.z+p.vz*dt,-4.98,4.98);
  const moving=speedOf(p);p.settled=moving<.45?(p.settled??0)+dt:0;p.gait=(p.gait??0)+moving*dt*.30;
  p.stamina=clamp(p.stamina+(magnitude>.5?-(1.75-p.definition.stats.stamina*.010):7)*dt,0,100);
  if(moving>.15){const aim=Math.atan2(p.vx,p.vz),diff=Math.atan2(Math.sin(aim-p.mesh.rotation.y),Math.cos(aim-p.mesh.rotation.y));p.mesh.rotation.y+=diff*(1-Math.exp(-dt*9));}
 }
 contest(p){
  const hoop=this.hoop(p.team),hx=hoop.x-p.x,hz=-p.z,hl=Math.hypot(hx,hz)||1;let pressure=0;
  for(const q of this.players){if(q.team===p.team)continue;const d=distance(p,q);if(d>2.05)continue;
   const front=((q.x-p.x)*hx+(q.z-p.z)*hz)/(d*hl||1),position=front>-.1?1:.24;
   const height=clamp(.85+(q.definition.scale-p.definition.scale)*1.5,.55,1.2),hands=q.blockUntil>this.time?1.25:.88;
   pressure=Math.max(pressure,(1-d/2.05)*position*height*hands*(.65+this.stat(q,'defense')*.005));
  }return clamp(pressure,0,1);
 }
 shotInfo(p,timing=.72,movement=speedOf(p)/4.5){
  const d=distance(p,this.hoop(p.team)),active=p.superUntil>this.time,flight=active&&p.definition.super.id==='flight';
  const dunk=d<(flight?2.5:1.45)&&this.stat(p,'dunk')>=55&&p.stamina>18;
  const kind=dunk?'dunk':d>COURT.threeDistance?'three':d<2.1?'layup':'mid';
  const rating=this.stat(p,dunk?'dunk':kind==='three'?'three':'mid');
  const boost=active&&((p.definition.super.id==='sniper'&&kind==='three')||(p.definition.super.id==='focus'&&kind==='mid'))?.11:0;
  return {kind,distance:d,rating,boost,...shotProfile({rating,distance:d,kind,timing,contest:this.contest(p),movement,
   stamina:p.stamina,settled:p.settled??0,boost,catchBonus:p.catchUntil>this.time})};
 }
 ai(p,dt){
  const b=this.ball,owner=b.owner,dir=this.attackSign(p.team),hoop=this.hoop(p.team),mate=this.players.find(q=>q.team===p.team&&q!==p);let tx=p.x,tz=p.z;
  if(owner!==p)p.aiShot=null;
  if(b.mode==='pass'&&b.to===p){tx=b.target.x;tz=b.target.z;}
  else if(b.mode==='loose'){tx=b.pos.x;tz=b.pos.z;}
  else if(b.mode==='shot'){
   tx=b.target.x-dir*.7;tz=b.target.z+(p.index%2?-.7:.7);
   if(b.shooter.team!==p.team&&b.elapsed/b.duration<.30&&distance(p,b.pos)<1.3&&Math.abs(p.x-b.shooter.x)<1.7)this.block(p);
  }else if(owner===p){
   const d=distance(p,hoop),covered=this.contest(p)>.48,defenders=this.players.filter(q=>q.team!==p.team);
   if(p.aiShot){this.move(p,0,0,dt);p.mesh.rotation.y=Math.atan2(hoop.x-p.x,-p.z);if(this.time>=p.aiShot.releaseAt){const timing=p.aiShot.timing;p.aiShot=null;this.shoot(p,timing);}return;}
   const perimeter=p.definition.stats.three>=78||p.definition.stats.three>p.definition.stats.mid+5;
   tx=hoop.x-dir*(perimeter&&d>4.8?6.0:1.1);tz=perimeter&&d>4.8?(p.index%2?-2.0:2.0):Math.sin(this.time*.65+p.index)*.6;
   if(covered&&d>2){const closest=defenders.reduce((a,c)=>distance(a,p)<distance(c,p)?a:c);tz=clamp(p.z+(p.z>=closest.z?1:-1)*1.7,-4.1,4.1);tx=p.x+dir*1.0;}
   p.think-=dt;if(p.think<=0){
    p.think=.22+Math.random()*.16;const openMate=Math.min(...defenders.map(q=>distance(q,mate)))>1.5;
    const clearPass=defenders.every(q=>distanceToSegment(q,p,mate)>.68);if(p.energy>=100&&d<7)this.activateSuper(p);
    const inRange=d<1.9||(perimeter?d<7.0:d<5.2),shooting=p.holdTime>.9&&((inRange&&!covered)||(d<1.7&&this.contest(p)<.65)||this.shotClock<2.5||p.holdTime>9);
    if(covered&&openMate&&clearPass&&p.holdTime>.8&&p.passUntil<this.time&&Math.random()<.60)this.passBall(p,mate);
    else if(shooting){p.aiShot={releaseAt:this.time+.34+Math.random()*.22,timing:botRelease(p.definition.stats[d>COURT.threeDistance?'three':'mid']),started:this.time};this.move(p,0,0,dt);return;}
    else if(openMate&&clearPass&&distance(mate,hoop)<d-1.2&&p.holdTime>1.3&&Math.random()<.40)this.passBall(p,mate);
    else if(covered&&p.burstReady<this.time&&Math.random()<.2)this.burst(p);
   }
  }else if(owner?.team===p.team){
   const preferThree=p.definition.stats.three>75;tx=hoop.x-dir*(preferThree?5.7:3.0);tz=(owner.z>0?-1:1)*(preferThree?2.9:2.5);
   if(distance(owner,{x:tx,z:tz})<2)tx-=dir*1.8;
  }else if(owner){
   const defenders=this.players.filter(q=>q.team===p.team),enemies=this.players.filter(q=>q.team!==p.team);
   const primary=distance(defenders[0],owner)<=distance(defenders[1],owner)?defenders[0]:defenders[1];
   const mark=p===primary?owner:enemies.find(q=>q!==owner),ownHoop=this.hoop(1-p.team);
   const mx=ownHoop.x-mark.x,mz=-mark.z,ml=Math.hypot(mx,mz)||1;tx=mark.x+mx/ml*1.12;tz=mark.z+mz/ml*1.12;
   const winding=mark.aiShot||mark===this.user&&this.chargeStart!==null||mark.fakeUntil>this.time;
   if(winding&&distance(p,mark)<1.9){if(!p.reactionAt)p.reactionAt=this.time+.20+(100-p.definition.stats.defense)*.002+Math.random()*.13;if(this.time>=p.reactionAt){this.block(p);p.reactionAt=this.time+1.5;}}
   else p.reactionAt=0;
   p.think-=dt;if(p.think<=0){p.think=.3+Math.random()*.2;if(owner===mark&&distance(owner,p)<1.05&&Math.random()<.35)this.steal(p);}
   if(p.energy>=100&&distance(owner,p)<2.5&&['anchor','secondwind'].includes(p.definition.super.id))this.activateSuper(p);
  }
  const dx=tx-p.x,dz=tz-p.z,d=Math.hypot(dx,dz);this.move(p,d>.14?dx/d*Math.min(1,d*1.8):0,d>.14?dz/d*Math.min(1,d*1.8):0,dt);
 }
 resolveCollisions(){
  for(let a=0;a<this.players.length;a++)for(let b=a+1;b<this.players.length;b++){
   const p=this.players[a],q=this.players[b];let dx=q.x-p.x,dz=q.z-p.z,d=Math.hypot(dx,dz),radius=.25*(p.definition.scale+q.definition.scale);
   if(d<radius){if(d<.001){dx=.01;dz=.005;d=Math.hypot(dx,dz);}const shift=(radius-d)*.5,nx=dx/d,nz=dz/d;
    p.x=clamp(p.x-nx*shift,-9.08,9.08);p.z=clamp(p.z-nz*shift,-4.98,4.98);q.x=clamp(q.x+nx*shift,-9.08,9.08);q.z=clamp(q.z+nz*shift,-4.98,4.98);
   }
  }
 }
 passBall(from,to){
  if(this.ball.mode!=='held'||this.ball.owner!==from||from.passUntil>this.time||from.aiShot)return false;
  const start=new T.Vector3(from.x,1.25*from.definition.scale,from.z),duration=clamp(distance(from,to)/13,.24,.8),error=(100-from.definition.stats.pass)*.004;
  const target=new T.Vector3(clamp(to.x+to.vx*duration*.85+(Math.random()-.5)*error,-9.08,9.08),1.2*to.definition.scale,clamp(to.z+to.vz*duration*.85+(Math.random()-.5)*error,-4.98,4.98));
  this.ball={...this.ball,mode:'pass',owner:null,start,target,to,from,elapsed:0,duration,pos:start.clone(),attempted:[],previousPass:{from,to,time:this.time}};
  from.passUntil=this.time+.75;this.cancelCharge();this.tone(360,.06,.009);return true;
 }
 pressPass(){
  if(!this.canAct())return;const b=this.ball;
  if(b.mode==='held'){if(b.owner===this.user)this.passBall(this.user,this.players[1]);else if(b.owner.team===0){b.owner.aiShot=null;this.passBall(b.owner,this.user);this.notice('ПАС ТЕБЕ','Откройся на свободное место',.9);}else this.steal(this.user);}
 }
 canAct(){return this.running&&!this.paused&&!this.orientationBlocked&&this.inboundUntil<=this.time&&this.ball.mode!=='scored';}
 pressShoot(){
  if(!this.canAct())return;
  if(this.ball.mode==='held'&&this.ball.owner===this.user){if(this.chargeStart!==null||this.user.shootUntil>this.time||this.user.fakeUntil>this.time)return;this.chargeStart=this.time;this.chargeMovement=clamp(speedOf(this.user)/4.5,0,1);$('charge-wrap').classList.remove('hidden');}
  else this.block(this.user);
 }
 cancelCharge(){this.chargeStart=null;this.chargeMovement=0;$('charge-wrap').classList.add('hidden');}
 releaseShoot(){
  if(this.chargeStart===null)return;const timing=this.getCharge(),movement=Math.max(speedOf(this.user)/4.5,this.chargeMovement*.7);
  this.cancelCharge();if(!this.canAct()||this.ball.owner!==this.user)return;
  if(timing<.13){this.pumpFake(this.user);return;}this.shoot(this.user,timing,movement);
 }
 getCharge(){return this.chargeStart===null?0:Math.min(1,(this.time-this.chargeStart)/.96);}
 pumpFake(p){
  if(p.fakeReady>this.time)return false;p.fakeUntil=this.time+.4;p.fakeReady=this.time+1;p.stamina=Math.max(0,p.stamina-2);
  if(p===this.user)this.notice('ОБМАННЫЙ БРОСОК','Подожди прыжка защитника — и проходи',1.2);return true;
 }
 shoot(p,timing=.72,movement=speedOf(p)/4.5){
  if(this.ball.mode!=='held'||this.ball.owner!==p||p.shootUntil>this.time)return false;
  const info=this.shotInfo(p,timing,movement),hoop=this.hoop(p.team),dunk=info.kind==='dunk',three=info.kind==='three';
  const success=Math.random()<info.chance,target=new T.Vector3(hoop.x,COURT.hoopY,0);
  if(success){target.x+=(Math.random()-.5)*.16;target.z+=(Math.random()-.5)*.16;}
  else{target.x+=(Math.random()-.5)*.8;target.z+=(Math.random()>.5?1:-1)*(.42+Math.random()*.40);}
  const start=new T.Vector3(p.x,1.88*p.definition.scale,p.z);p.mesh.rotation.y=Math.atan2(hoop.x-p.x,-p.z);
  p.shootUntil=this.time+(dunk?.82:.64);p.shotStart=this.time;p.shotKind=info.kind;p.aiShot=null;p.stamina=Math.max(0,p.stamina-(dunk?8:4));
  p.stats.shots++;if(three)p.stats.threes++;if(info.boost)p.superUntil=0;
  this.ball={...this.ball,mode:'shot',owner:null,shooter:p,points:three?3:2,dunk,success,blocked:false,start,target,
   pos:start.clone(),elapsed:0,duration:dunk?.74:clamp(.86+info.distance*.049,.96,1.55),arc:dunk?.7:1.6+info.distance*.115,timing,info};
  if(p===this.user){$('shot-feedback').textContent=info.release+' · '+(movement>.35?'На ходу':info.pressure);$('shot-feedback').dataset.quality=info.perfect?'good':'bad';this.feedbackUntil=this.time+2.7;if(dunk)this.notice('АТАКА СВЕРХУ','',.75);}
  this.tone(dunk?120:460,.07,.014);return true;
 }
 steal(p){
  const owner=this.ball.owner;
  if(this.ball.mode!=='held'||!owner||owner.team===p.team||p.stealUntil>this.time||owner.protectedUntil>this.time)return false;
  p.stealUntil=this.time+1.4;p.stunUntil=this.time+.32;p.stamina=Math.max(0,p.stamina-5);
  const d=distance(p,owner),facing=((owner.x-p.x)*Math.sin(p.mesh.rotation.y)+(owner.z-p.z)*Math.cos(p.mesh.rotation.y))/(d||1);
  if(d>1.1||facing<-.15){if(p===this.user)this.notice('НЕ ДОТЯНУЛСЯ','Подойди к мячу',.8);return false;}
  const lowBounce=Math.abs(Math.sin(this.time*13))<.45,protection=owner.burstUntil>this.time?this.stat(owner,'handle')*.0014:0;
  const chance=clamp(.18+this.stat(p,'defense')*.003-this.stat(owner,'handle')*.0024+(lowBounce?.12:0)-protection,.07,.56);
  if(Math.random()<chance){this.giveBall(p);this.ball.previousPass=null;p.stunUntil=0;p.energy=Math.min(100,p.energy+18);p.stats.steals++;this.notice(p===this.user?'ПЕРЕХВАТ!':p.definition.name+' · перехват','',.9);this.tone(220,.06,.015);return true;}
  if(p===this.user)this.notice('МИМО МЯЧА','Соперник получил пространство',.8);return false;
 }
 block(p){if(p.blockReady>this.time||p.stamina<7)return false;p.blockStart=this.time;p.blockUntil=this.time+.66;p.blockReady=this.time+1.3;p.stamina=Math.max(0,p.stamina-7);return true;}
 burst(p=this.user){
  if(!this.canAct()||p.burstReady>this.time||p.stamina<18||p.aiShot||p===this.user&&this.chargeStart!==null)return false;
  p.burstUntil=this.time+.58;p.burstReady=this.time+2.8;p.stamina-=16;return true;
 }
 activateSuper(p=this.user){
  if(!this.canAct()||p.energy<99.9||p.superUntil>this.time)return false;
  p.energy=0;p.superUntil=this.time+p.definition.super.duration;if(p.definition.super.id==='secondwind')p.stamina=100;
  this.notice(p.definition.name.toUpperCase(),p.definition.super.name.toUpperCase(),1.6);this.tone(850,.22,.022);return true;
 }
 updateBall(dt){
  const b=this.ball;
  if(b.mode==='held'){
   const p=b.owner,moving=speedOf(p)>.2,charging=p.aiShot||p===this.user&&this.chargeStart!==null||p.fakeUntil>this.time;
   const sideX=Math.cos(p.mesh.rotation.y)*.29,sideZ=-Math.sin(p.mesh.rotation.y)*.29;
   b.pos.set(p.x+sideX,p.definition.scale*(charging?1.58:moving?.15+Math.abs(Math.sin(this.time*13))*.87:1.05),p.z+sideZ);
  }else if(b.mode==='pass'){
   b.elapsed+=dt;const t=Math.min(1,b.elapsed/b.duration);b.pos.copy(b.start).lerp(b.target,t);b.pos.y+=Math.sin(t*Math.PI)*.20;
   if(t>.14&&t<.96)for(const p of this.players){if(p.team!==b.from.team&&distance(p,b.pos)<.58&&!b.attempted.includes(p.index)){
    b.attempted.push(p.index); // One attempt per defender and pass, independent of FPS.
    const chance=clamp(.23+this.stat(p,'defense')*.004-(p.stunUntil>this.time?.25:0),.1,.64);
    if(Math.random()<chance){this.giveBall(p);this.ball.previousPass=null;p.stats.steals++;p.energy=Math.min(100,p.energy+16);this.notice('ПАС ПЕРЕХВАЧЕН','Проверь линию передачи',1);break;}
   }}
   if(this.ball.mode==='pass'&&t>=1){if(distance(b.to,b.target)<1.5){this.giveBall(b.to,false);b.to.catchUntil=this.time+1.05;}else{this.makeLoose(b.pos,new T.Vector3(0,.3,0),b.from.team,false);this.notice('НЕТ ПРИЁМА','Мяч свободен',.8);}}
  }else if(b.mode==='shot'){
   b.elapsed+=dt;const t=Math.min(1,b.elapsed/b.duration);b.pos.copy(b.start).lerp(b.target,t);b.pos.y+=Math.sin(Math.PI*t)*b.arc;
   for(const p of this.players){const jumpAge=this.time-(p.blockStart??-10),reach=1.92*p.definition.scale+.16+this.stat(p,'jump')*.006;
    if(p.team!==b.shooter.team&&p.blockUntil>this.time&&jumpAge>.12&&jumpAge<.50&&t>.03&&t<.70&&distance(p,b.pos)<.72&&b.pos.y<reach){
     b.blocked=true;b.success=false;this.makeLoose(b.pos,new T.Vector3((Math.random()-.5)*3,1,(Math.random()-.5)*3),b.shooter.team,false);
     p.stats.blocks++;p.energy=Math.min(100,p.energy+18);this.notice('БЛОК!','Защитник успел к выпуску',1);return;
    }
   }
   if(t>=1){if(b.success)this.addScore(b.shooter,b.points,b.dunk,b.previousPass);else{this.makeLoose(b.pos,new T.Vector3(-this.attackSign(b.shooter.team)*(1.2+Math.random()*1.8),.8,(Math.random()-.5)*2.6),b.shooter.team,true);this.tone(180,.08,.014);}}
  }else if(b.mode==='scored'){
   b.elapsed+=dt;b.pos.y=Math.max(.14,COURT.hoopY-.1-b.elapsed*3.5);if(b.elapsed>.68)this.inbound(1-b.scoringTeam);
  }else if(b.mode==='loose'){
   b.velocity.y-=9.8*dt;b.pos.addScaledVector(b.velocity,dt);
   if(b.pos.y<.125){b.pos.y=.125;b.velocity.y=Math.abs(b.velocity.y)*.48;b.velocity.x*=.78;b.velocity.z*=.78;}
   if(Math.abs(b.pos.x)>9.35){b.pos.x=clamp(b.pos.x,-9.35,9.35);b.velocity.x*=-.60;}if(Math.abs(b.pos.z)>5.14){b.pos.z=clamp(b.pos.z,-5.14,5.14);b.velocity.z*=-.60;}
   const candidates=this.players.filter(p=>distance(p,b.pos)<(p.superUntil>this.time&&p.definition.super.id==='anchor'?1.25:.69)&&b.pos.y<1.7*p.definition.scale+(p.blockUntil>this.time?.65:0));
   if(candidates.length){candidates.sort((a,c)=>(distance(a,b.pos)-a.definition.scale*.1)-(distance(c,b.pos)-c.definition.scale*.1));
    const p=candidates[0],sameTeam=p.team===b.lastTeam,rim=b.rim;this.giveBall(p);if(rim&&sameTeam)this.shotClock=14;this.ball.previousPass=null;p.stats.rebounds++;p.energy=Math.min(100,p.energy+7);
    this.notice(p===this.user?'ТВОЙ ПОДБОР':p.definition.name+' · подбор','',.65);
   }
  }
  this.ballMesh.position.copy(this.ball.pos);this.ballMesh.rotation.z+=dt*5;
 }
 makeLoose(pos,velocity,lastTeam,rim=false){this.ball={mode:'loose',owner:null,pos:pos.clone(),velocity,lastTeam,rim,previousPass:null};}
 addScore(p,points,dunk,pass){
  this.score[p.team]+=points;p.stats.points+=points;p.stats.made++;if(points===3)p.stats.threesMade++;p.energy=Math.min(100,p.energy+15);
  if(pass&&pass.to===p&&this.time-pass.time<4){pass.from.stats.assists++;pass.from.energy=Math.min(100,pass.from.energy+14);}
  this.notice('+'+points+' · '+p.definition.name.toUpperCase(),dunk?'СВЕРХУ!':points===3?'ТРЁХОЧКОВЫЙ':'ПОПАДАНИЕ',1.35);this.tone(680,.16,.027);
  if(this.overtime||this.clock<=0&&this.score[0]!==this.score[1]){this.updateUI();this.end();return;}
  this.ball={mode:'scored',owner:null,pos:new T.Vector3(this.hoop(p.team).x,COURT.hoopY,0),elapsed:0,scoringTeam:p.team};this.cancelCharge();
 }
 animatePlayers(dt){
  for(const p of this.players){const jumpAge=this.time-(p.blockStart??-10);let air=p.blockUntil>this.time?Math.sin(clamp(jumpAge/.66,0,1)*Math.PI)*(.14+this.stat(p,'jump')*.0054):0;
   const shootLeft=Math.max(0,p.shootUntil-this.time);if(shootLeft>0){const dunk=p.shotKind==='dunk',duration=dunk?.82:.64;air=Math.max(air,Math.sin(clamp((this.time-p.shotStart)/duration,0,1)*Math.PI)*(dunk?.80+this.stat(p,'jump')*.002:.12+this.stat(p,'jump')*.0015));}
   let pose=Math.min(1,shootLeft*1.5);if(p.aiShot||p===this.user&&this.chargeStart!==null)pose=.42;if(p.fakeUntil>this.time)pose=.5;if(p.blockUntil>this.time)pose=Math.max(pose,.9);
   p.air=Math.max(0,air);animateCharacter(p.mesh,p.gait??this.time,speedOf(p)/4.5,p.air,pose,this.ball.owner===p,p.shotKind);
   p.mesh.position.set(p.x,0,p.z);const active=p.superUntil>this.time;p.mesh.userData.ring.material.color.set(active?0xf7dd77:p===this.user?0xffda8d:p.team===0?0xefb984:0x84cad6);p.mesh.userData.ring.scale.setScalar(p===this.user?1.12:1);
  }
  this.referee.position.x+=(clamp(this.ball.pos.x*.33,-4,4)-this.referee.position.x)*(1-Math.exp(-dt*1.4));
  this.referee.rotation.y=Math.atan2(this.ball.pos.x-this.referee.position.x,this.ball.pos.z-this.referee.position.z);animateCharacter(this.referee,this.time,.05,0,0,false);
 }
 updateUI(){
  $('score-home').textContent=this.score[0];$('score-away').textContent=this.score[1];const seconds=Math.ceil(this.clock);
  $('clock').textContent=this.overtime?'ОТ':Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');$('shot-clock').textContent=Math.max(0,Math.ceil(this.shotClock));
  $('stamina').style.width=this.user.stamina+'%';const owner=this.ball.owner,own=owner?.team===0;
  $('pass-label').textContent=owner===this.user?'ПАС':own?'ПРОСИТЬ':'ПЕРЕХВАТ';$('shoot-label').textContent=owner===this.user?'БРОСОК':own?'ПРЫЖОК':'БЛОК';
  const active=this.user.superUntil>this.time;$('super').classList.toggle('ready',this.user.energy>=99.9);$('super').classList.toggle('active',active);
  $('super-percent').textContent=active?Math.ceil(this.user.superUntil-this.time)+'с':Math.floor(this.user.energy)+'%';$('super').setAttribute('aria-label','Суперприём '+this.user.definition.super.name+', '+Math.floor(this.user.energy)+' процентов');
  const cooldown=Math.max(0,this.user.burstReady-this.time);$('dash-label').textContent=cooldown>0?cooldown.toFixed(1)+'с':'РЫВОК';$('dash').classList.toggle('cooldown',cooldown>0||this.user.stamina<18);
  if(owner===this.user){const info=this.shotInfo(this.user,this.getCharge(),Math.max(speedOf(this.user)/4.5,this.chargeMovement*.7));
   $('shot-advice').textContent=info.distance>8?'Далеко — подойди к кольцу':speedOf(this.user)>1?'Остановись для точного броска':info.pressure==='Свободно'?'Свободно · атака вправо →':info.pressure+' · найди пространство';
   $('green-zone').style.left=(info.center-info.greenWidth)*100+'%';$('green-zone').style.width=info.greenWidth*200+'%';
  }else $('shot-advice').textContent=own?'Откройся и попроси пас':'Встань между соперником и кольцом';
  if(this.chargeStart!==null){$('charge-marker').style.left=this.getCharge()*98+'%';if(owner!==this.user)this.cancelCharge();}
  if(this.feedbackUntil<this.time)$('shot-feedback').textContent='';
 }
 render(){
  this.renderer.render(this.scene,this.camera);const w=this.canvas.clientWidth,h=this.canvas.clientHeight,placed=[];
  for(const p of this.players){const pos=new T.Vector3(p.x,.03,p.z+.40).project(this.camera),x=(pos.x*.5+.5)*w,half=p.definition.name.length*2.7+10;let y=(-pos.y*.5+.5)*h;
   for(let tries=0;tries<5;tries++){if(!placed.some(q=>Math.abs(x-q.x)<half+q.half&&Math.abs(y-q.y)<17))break;y+=17;}
   placed.push({x,y,half});p.label.style.left=x+'px';p.label.style.top=y+'px';p.label.style.display=pos.z>1||Math.abs(pos.x)>1.1||Math.abs(pos.y)>1.1?'none':'';
  }
 }
 setPaused(value){this.paused=value;this.input={x:0,z:0};this.keys.clear();this.cancelCharge();$('stick').style.transform='';this.lastFrame=performance.now();}
 stop(){this.running=false;cancelAnimationFrame(this.raf);this.keys.clear();this.cancelCharge();}
 end(){
  if(!this.running)return;const result={completed:this.clock<=0&&this.score[0]!==this.score[1],matchId:this.matchId,won:this.score[0]>this.score[1],score:[...this.score],
   players:this.players.map(p=>({name:p.definition.name,id:p.definition.id,team:p.team,...p.stats})),user:{...this.user.stats},hero:this.user.definition.id};
  this.stop();this.callbacks.onEnd?.(result);
 }
 installControls(){
  const on=(target,type,fn,opts)=>{target.addEventListener(type,fn,opts);this.disposers.push(()=>target.removeEventListener(type,fn,opts));};let stickPointer=null,shootPointer=null;
  const moveStick=e=>{if(e.pointerId!==stickPointer)return;const r=$('joystick').getBoundingClientRect();let dx=e.clientX-r.left-r.width/2,dz=e.clientY-r.top-r.height/2,length=Math.hypot(dx,dz),limit=r.width*.34;
   if(length>limit){dx*=limit/length;dz*=limit/length;}this.input={x:dx/limit,z:dz/limit};$('stick').style.transform=`translate(${dx}px,${dz}px)`;};
  on($('joystick'),'pointerdown',e=>{e.preventDefault();this.unlockAudio();if(stickPointer!==null)return;stickPointer=e.pointerId;$('joystick').setPointerCapture(e.pointerId);moveStick(e);});on($('joystick'),'pointermove',moveStick);
  const releaseStick=e=>{if(e.pointerId!==stickPointer)return;stickPointer=null;this.input={x:0,z:0};$('stick').style.transform='';};on($('joystick'),'pointerup',releaseStick);on($('joystick'),'pointercancel',releaseStick);on($('joystick'),'lostpointercapture',releaseStick);
  on($('shoot'),'pointerdown',e=>{e.preventDefault();if(shootPointer!==null)return;shootPointer=e.pointerId;this.unlockAudio();$('shoot').setPointerCapture(e.pointerId);this.pressShoot();});
  on($('shoot'),'pointerup',e=>{if(e.pointerId!==shootPointer)return;e.preventDefault();shootPointer=null;this.releaseShoot();});
  const cancelShoot=e=>{if(e.pointerId!==shootPointer)return;shootPointer=null;this.cancelCharge();};on($('shoot'),'pointercancel',cancelShoot);on($('shoot'),'lostpointercapture',cancelShoot);
  for(const [id,action]of [['pass',()=>this.pressPass()],['super',()=>this.activateSuper()],['dash',()=>this.burst()]]){on($(id),'pointerdown',e=>{e.preventDefault();this.unlockAudio();action();});on($(id),'click',e=>{if(e.detail===0)action();});}
  const cameraChange=()=>{this.cameraMode=this.cameraMode==='close'?'wide':'close';$('camera-mode').textContent=this.cameraMode==='close'?'БЛИЗКО':'ОБЗОР';this.updateCamera(1,true);};on($('camera-mode'),'click',cameraChange);
  on(window,'keydown',e=>{if(!this.running||e.target.closest('dialog'))return;
   if(['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyW','KeyA','KeyS','KeyD','KeyE','KeyQ','ShiftLeft','ShiftRight','KeyC'].includes(e.code))e.preventDefault();
   if(e.repeat)return;this.keys.add(e.code);if(e.code==='Space')this.pressShoot();if(e.code==='KeyE')this.pressPass();if(e.code==='KeyQ')this.activateSuper();if(e.code.startsWith('Shift'))this.burst();if(e.code==='KeyC')cameraChange();if(e.code==='Escape')this.callbacks.onPause?.();
  });
  on(window,'keyup',e=>{this.keys.delete(e.code);if(e.code==='Space')this.releaseShoot();});
  on(window,'blur',()=>{this.keys.clear();this.input={x:0,z:0};if(this.running&&!this.paused)this.callbacks.onPause?.();});
  on(document,'visibilitychange',()=>{if(document.hidden&&this.running&&!this.paused)this.callbacks.onPause?.();});
  on($('portrait-continue'),'click',()=>{this.portraitAllowed=true;this.resize();});
  on($('sound'),'click',()=>{this.soundOn=!this.soundOn;$('sound').setAttribute('aria-pressed',String(this.soundOn));$('sound').setAttribute('aria-label',this.soundOn?'Выключить звук':'Включить звук');$('sound').textContent=this.soundOn?'♪':'×♪';});
  on(this.canvas,'webglcontextlost',e=>{e.preventDefault();this.setPaused(true);this.callbacks.onError?.('Браузер освободил графическую память. Обнови страницу, чтобы продолжить игру.');});
 }
}
