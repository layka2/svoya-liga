import * as T from '../vendor/three.module.min.js';
import {createCharacter,animateCharacter,disposeObject} from './models.js';
import {createArena,createBall,COURT} from './arena.js';
import {REFEREE} from './roster.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const $=id=>document.getElementById(id);
export class CourtGame{
 constructor(canvas,callbacks={}){
  this.callbacks=callbacks;this.canvas=canvas;this.scene=new T.Scene();
  this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
  this.camera=new T.PerspectiveCamera(42,1,.1,130);createArena(this.scene);this.ballMesh=createBall();this.scene.add(this.ballMesh);
  this.referee=createCharacter(REFEREE,0);this.referee.position.set(0,0,-5.75);this.referee.rotation.y=0;this.scene.add(this.referee);
  this.players=[];this.running=false;this.paused=false;this.input={x:0,z:0};this.keys=new Set();this.soundOn=true;this.audio=null;this.raf=0;this.time=0;this.lastUI=0;this.noticeTimer=0;this.chargeStart=null;this.portraitAllowed=false;this.disposers=[];this.resize=this.resize.bind(this);window.addEventListener('resize',this.resize);this.installControls();this.resize();
 }
 start(roster){
  this.stop();for(const p of this.players){this.scene.remove(p.mesh);disposeObject(p.mesh);}this.players=[];$('player-labels').replaceChildren();
  roster.forEach((definition,i)=>{const team=i<2?0:1;const p={definition,team,index:i,x:0,z:0,vx:0,vz:0,energy:35,stamina:100,superUntil:0,stealUntil:0,blockUntil:0,shootUntil:0,passUntil:0,air:0,think:.2+i*.05,holdTime:0,stats:{points:0,assists:0,steals:0,shots:0,made:0},mesh:createCharacter(definition,team)};this.scene.add(p.mesh);const label=document.createElement('span');label.className='player-label'+(i===0?' self':'');label.textContent=(i===0?'▴ ':'')+definition.name;$('player-labels').append(label);p.label=label;this.players.push(p);});
  this.user=this.players[0];this.user.mesh.userData.ring.material.color.set(0xffda8d);this.user.mesh.userData.ring.scale.setScalar(1.22);this.score=[0,0];this.clock=180;this.shotClock=24;this.overtime=false;this.time=0;this.ball={mode:'held',owner:this.user,pos:new T.Vector3(),previousPass:null};this.possession=0;this.noticeTimer=0;this.paused=false;this.running=true;this.input={x:0,z:0};this.keys.clear();this.chargeStart=null;
  $('active-name').textContent=this.user.definition.name;$('active-ovr').textContent=this.user.definition.ovr;$('active-photo').src=this.user.definition.photo;$('active-photo').style.objectPosition=this.user.definition.photoPosition;
  this.resetPositions(0);this.inboundUntil=.9;this.notice('ТВОЙ ВЫХОД','Ты и '+this.players[1].definition.name+' · против '+this.players[2].definition.name+' и '+this.players[3].definition.name,2.6);this.resize();this.unlockAudio();this.lastFrame=performance.now();this.loop(this.lastFrame);
 }
 attackSign(team){return team===0?1:-1;}
 hoop(team){return {x:this.attackSign(team)*COURT.hoopX,z:0};}
 stat(p,key){let v=p.definition.stats[key];if(p.superUntil>this.time){switch(p.definition.super.id){case'flight':if(key==='jump'||key==='dunk')v+=16;break;case'dash':if(key==='handle')v+=20;if(key==='speed')v*=1.35;break;case'secondwind':if(key==='defense')v+=20;if(key==='speed')v*=1.2;break;case'anchor':if(key==='defense')v+=28;break;}}return v;}
 resetPositions(team){
  const dir=this.attackSign(team);const own=this.players.filter(p=>p.team===team),other=this.players.filter(p=>p.team!==team);
  own.forEach((p,i)=>{p.x=-dir*2.4;p.z=i===0?1.9:-2;p.vx=p.vz=0;p.holdTime=0;});other.forEach((p,i)=>{p.x=dir*1.8;p.z=i===0?1.5:-1.8;p.vx=p.vz=0;p.holdTime=0;});
  this.giveBall(own[0],false);this.shotClock=24;this.ball.previousPass=null;
 }
 giveBall(p,resetClock=true){const lastTeam=this.possession;this.ball.mode='held';this.ball.owner=p;this.ball.pos.set(p.x,1.2*p.definition.scale,p.z);this.possession=p.team;p.holdTime=0;if(resetClock&&lastTeam!==p.team)this.shotClock=24;}
 unlockAudio(){try{if(!this.audio){const AC=window.AudioContext||window.webkitAudioContext;if(AC)this.audio=new AC();}this.audio?.resume().catch(()=>{});}catch{}}
 tone(frequency=400,duration=.08,volume=.02){if(!this.soundOn||!this.audio||this.audio.state!=='running')return;try{const o=this.audio.createOscillator(),g=this.audio.createGain();o.type='sine';o.frequency.setValueAtTime(frequency,this.audio.currentTime);o.frequency.exponentialRampToValueAtTime(frequency*.6,this.audio.currentTime+duration);g.gain.setValueAtTime(volume,this.audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,this.audio.currentTime+duration);o.connect(g);g.connect(this.audio.destination);o.start();o.stop(this.audio.currentTime+duration);}catch{}}
 notice(title,sub='',seconds=1.5){$('callout').replaceChildren(document.createTextNode(title));if(sub){const el=document.createElement('small');el.textContent=sub;$('callout').append(el);}$('callout').classList.add('show');this.noticeTimer=seconds;}
 resize(){
  const w=this.canvas.clientWidth||innerWidth,h=this.canvas.clientHeight||innerHeight;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;
  if(w/h>1.45){const zoom=Math.max(1,1.88/(w/h));this.camera.position.set(0,13.9*zoom,14.8*zoom);this.camera.fov=43;}else{this.camera.position.set(0,24,25);this.camera.fov=48;}
  this.camera.lookAt(0,0,0);this.camera.updateProjectionMatrix();const rotate=w<h&&!this.portraitAllowed;const el=$('rotate');if(el)el.classList.toggle('hidden',!rotate);this.orientationBlocked=rotate;
 }
 loop(now){if(!this.running)return;const dt=Math.min(.05,Math.max(0,(now-this.lastFrame)/1000));this.lastFrame=now;if(!this.paused&&!this.orientationBlocked)this.update(dt);this.render();this.raf=requestAnimationFrame(t=>this.loop(t));}
 update(dt){
  this.time+=dt;if(this.noticeTimer>0){this.noticeTimer-=dt;if(this.noticeTimer<=0)$('callout').classList.remove('show');}
  if(this.inboundUntil>this.time){this.animatePlayers(dt);this.updateBall(dt);this.updateUI();return;}
  if(!this.overtime)this.clock=Math.max(0,this.clock-dt);this.shotClock-=dt;
  if(this.shotClock<=0&&this.ball.mode==='held'){this.notice('ВРЕМЯ АТАКИ','Мяч переходит сопернику');this.resetPositions(1-this.possession);this.inboundUntil=this.time+1.1;this.tone(1100,.15);return;}
  if(this.clock<=0&&!this.overtime&&this.ball.mode!=='shot'){if(this.score[0]===this.score[1]){this.overtime=true;this.notice('ДО ПЕРВОГО ПОПАДАНИЯ','Равный счёт · дополнительное время',2.6);}else{this.end();return;}}
  let ix=this.input.x,iz=this.input.z;if(this.keys.has('ArrowLeft')||this.keys.has('KeyA'))ix-=1;if(this.keys.has('ArrowRight')||this.keys.has('KeyD'))ix+=1;if(this.keys.has('ArrowUp')||this.keys.has('KeyW'))iz-=1;if(this.keys.has('ArrowDown')||this.keys.has('KeyS'))iz+=1;
  const length=Math.hypot(ix,iz);if(length>1){ix/=length;iz/=length;}
  for(const p of this.players){
   p.energy=Math.min(100,p.energy+dt*3.1);if(p===this.user){this.move(p,ix,iz,dt);}else{this.ai(p,dt);}
   if(p===this.ball.owner)p.holdTime+=dt;else p.holdTime=0;
  }
  this.resolveCollisions();this.updateBall(dt);this.animatePlayers(dt);this.updateUI();
 }
 move(p,dx,dz,dt){
  const magnitude=Math.min(1,Math.hypot(dx,dz));let speed=2.65+this.stat(p,'speed')*.029;const handles=p===this.ball.owner?(.86+.14*this.stat(p,'handle')/100):1;
  speed*=handles*(.72+.28*p.stamina/100);if(p.shootUntil>this.time)speed*=.25;
  p.vx=dx*speed;p.vz=dz*speed;p.x=clamp(p.x+p.vx*dt,-9.08,9.08);p.z=clamp(p.z+p.vz*dt,-4.98,4.98);
  p.stamina=clamp(p.stamina+(magnitude>.5?-(2.3-p.definition.stats.stamina*.012):4)*dt,0,100);
  if(magnitude>.12){const aim=Math.atan2(dx,dz);let diff=Math.atan2(Math.sin(aim-p.mesh.rotation.y),Math.cos(aim-p.mesh.rotation.y));p.mesh.rotation.y+=diff*Math.min(1,dt*13);}
 }
 ai(p,dt){
  const owner=this.ball.owner;const dir=this.attackSign(p.team);const hoop=this.hoop(p.team);let tx=p.x,tz=p.z;const mate=this.players.find(q=>q.team===p.team&&q!==p);
  if(this.ball.mode==='loose'){tx=this.ball.pos.x;tz=this.ball.pos.z;}
  else if(this.ball.mode==='shot'){tx=this.ball.target.x-dir*.6;tz=this.ball.target.z+(p.index%2?-.6:.6);if(this.ball.elapsed>this.ball.duration*.62&&distance(p,this.ball.pos)<1.7&&p.blockUntil<this.time&&this.ball.shooter.team!==p.team)this.block(p);}
  else if(owner===p){
   const d=distance(p,hoop);const defenders=this.players.filter(q=>q.team!==p.team);let nearest=defenders.reduce((a,b)=>distance(a,p)<distance(b,p)?a:b);const covered=distance(nearest,p)<1.35;
   tx=hoop.x-dir*.9;tz=Math.sin(this.time*.55+p.index*2)*.9;
   if(covered&&d>2.2){tz=clamp(p.z+(p.z>=nearest.z?1:-1)*1.9,-4,4);tx=p.x+dir*1.8;}
   p.think-=dt;if(p.think<=0){p.think=.22+Math.random()*.16;
    const mateNear=distance(mate,hoop);const openMate=Math.min(...defenders.map(q=>distance(q,mate)))>1.8;
    if(p.energy>=100&&d<7)this.activateSuper(p);
    const shotReady=p.holdTime>.8&&((d<1.85)||(d<5.5&&p.holdTime>1.4&&(!covered||Math.random()<.48))||(d<7.15&&p.definition.stats.three>84&&p.holdTime>1.5)||p.holdTime>4||this.shotClock<3);
    if(shotReady){this.shoot(p,.60+Math.random()*.26);}
    else if(p.holdTime>1.15&&p.passUntil<this.time&&distance(p,mate)<9&&(openMate||mateNear<d-.5||covered)&&Math.random()<.32){this.passBall(p,mate);}
   }
  }else if(owner&&owner.team===p.team){tx=hoop.x-dir*(2.9+(p.index%2)*1.7);tz=(owner.z>0?-1:1)*2.8;if(Math.abs(owner.x-tx)<1.5&&Math.abs(owner.z-tz)<1.5)tx-=dir*2.1;}
  else if(owner){
   const enemies=this.players.filter(q=>q.team!==p.team);const otherDef=this.players.find(q=>q.team===p.team&&q!==p);let mark=enemies[p.index%2];if(distance(owner,p)<distance(owner,otherDef)-1.3)mark=owner;
   const defensiveHoop=this.hoop(1-p.team);const mx=defensiveHoop.x-mark.x,mz=-mark.z,ml=Math.hypot(mx,mz)||1;tx=mark.x+mx/ml*.9;tz=mark.z+mz/ml*.9;
   if(owner===mark&&distance(owner,p)<1.03&&p.stealUntil<this.time)this.steal(p);
   if(p.energy>=100&&distance(owner,p)<2.6&&['anchor','secondwind','dash'].includes(p.definition.super.id))this.activateSuper(p);
  }
  let dx=tx-p.x,dz=tz-p.z;let d=Math.hypot(dx,dz);if(d>.18){dx/=d;dz/=d;let mag=Math.min(1,d*1.7);this.move(p,dx*mag,dz*mag,dt);}else this.move(p,0,0,dt);
 }
 resolveCollisions(){
  for(let a=0;a<this.players.length;a++)for(let b=a+1;b<this.players.length;b++){const p=this.players[a],q=this.players[b];let dx=q.x-p.x,dz=q.z-p.z,d=Math.hypot(dx,dz);if(d<.55){if(d<.001){dx=.01;dz=.005;d=Math.hypot(dx,dz);}const shift=(.55-d)*.5;const nx=dx/d,nz=dz/d;p.x=clamp(p.x-nx*shift,-9.08,9.08);p.z=clamp(p.z-nz*shift,-4.98,4.98);q.x=clamp(q.x+nx*shift,-9.08,9.08);q.z=clamp(q.z+nz*shift,-4.98,4.98);}}
 }
 passBall(from,to){
  if(this.ball.mode!=='held'||this.ball.owner!==from||from.passUntil>this.time)return false;
  const start=new T.Vector3(from.x,1.2*from.definition.scale,from.z);this.ball={...this.ball,mode:'pass',owner:null,start,target:new T.Vector3(to.x,1.3*to.definition.scale,to.z),to,from,elapsed:0,duration:clamp(distance(from,to)/15,.22,.72),pos:start.clone(),previousPass:{from,to,time:this.time}};from.passUntil=this.time+.8;from.energy=Math.min(100,from.energy+4);this.tone(360,.06,.009);return true;
 }
 pressPass(){if(!this.canAct())return;if(this.ball.mode==='held'){if(this.ball.owner===this.user){this.passBall(this.user,this.players[1]);}else if(this.ball.owner.team===0){this.passBall(this.ball.owner,this.user);this.notice('ПАС ТЕБЕ','',.8);}else this.steal(this.user);}}
 canAct(){return this.running&&!this.paused&&!this.orientationBlocked&&this.inboundUntil<=this.time;}
 pressShoot(){if(!this.canAct())return;if(this.ball.mode==='held'&&this.ball.owner===this.user){this.chargeStart=this.time;$('charge-wrap').classList.remove('hidden');}else this.block(this.user);}
 releaseShoot(){if(this.chargeStart===null)return;const timing=this.getCharge();this.chargeStart=null;$('charge-wrap').classList.add('hidden');if(this.canAct()&&this.ball.owner===this.user)this.shoot(this.user,timing);}
 getCharge(){return this.chargeStart===null?0:Math.min(1,(this.time-this.chargeStart)/.92);}
 shoot(p,timing=.75){
  if(this.ball.mode!=='held'||this.ball.owner!==p||p.shootUntil>this.time)return false;
  const hoop=this.hoop(p.team),d=distance(p,hoop),superActive=p.superUntil>this.time;const flight=superActive&&p.definition.super.id==='flight';const dunk=d<(flight?3.0:1.85)&&this.stat(p,'dunk')>=58;
  const three=d>COURT.threeDistance;let rating=this.stat(p,dunk?'dunk':three?'three':'mid');
  const defenders=this.players.filter(q=>q.team!==p.team);let contest=0;for(const q of defenders){const near=distance(p,q);if(near<1.6){contest=Math.max(contest,(1-near/1.6)*(.75+(q.definition.scale-p.definition.scale))*(q.blockUntil>this.time?1.3:1));}}
  const goodTiming=1-clamp(Math.abs(timing-.76)/.76,0,1);let chance=.14+rating*.006+goodTiming*.20-contest*.35-Math.max(0,d-7.3)*.065;
  if(dunk)chance=.23+rating*.0064+goodTiming*.09-contest*.22;
  if(superActive&&((p.definition.super.id==='sniper'&&three)||(p.definition.super.id==='focus'&&!three&&!dunk))){chance+=.25;p.superUntil=0;}
  chance=clamp(chance,.1,.97);const success=Math.random()<chance;const target=new T.Vector3(hoop.x,COURT.hoopY,0);
  if(!success){target.x+=(Math.random()-.5)*1.3;target.z+=(Math.random()>.5?1:-1)*(.5+Math.random()*.5);}
  const start=new T.Vector3(p.x,1.8*p.definition.scale,p.z);p.mesh.rotation.y=Math.atan2(hoop.x-p.x,-p.z);p.shootUntil=this.time+(dunk?.85:.65);p.blockUntil=Math.max(p.blockUntil,this.time+.55);p.energy=Math.min(100,p.energy+6);p.stats.shots++;
  this.ball={...this.ball,mode:'shot',owner:null,shooter:p,points:three?3:2,dunk,success,blocked:false,start,target,pos:start.clone(),elapsed:0,duration:dunk?.7:clamp(.75+d*.055,.9,1.45),arc:dunk?.5:1.4+d*.11,timing};
  if(p===this.user){if(dunk)this.notice(flight?'ВЗЛЁТ!':'ДАНК!','',.7);else if(timing>=.67&&timing<=.86)this.notice('ОТЛИЧНЫЙ МОМЕНТ','',.7);}
  this.tone(dunk?120:460,.07,.014);return true;
 }
 steal(p){
  const owner=this.ball.owner;if(this.ball.mode!=='held'||!owner||owner.team===p.team||p.stealUntil>this.time)return false;p.stealUntil=this.time+(p===this.user?1.05:2.4);
  if(distance(p,owner)>1.16)return false;const chance=clamp(.12+this.stat(p,'defense')*.0025-this.stat(owner,'handle')*.0021,.08,.6);
  if(Math.random()<chance){this.giveBall(p);this.ball.previousPass=null;p.energy=Math.min(100,p.energy+22);p.stats.steals++;this.notice(p===this.user?'ПЕРЕХВАТ!':p.definition.name+' · перехват','',1);this.tone(220,.06,.015);return true;}return false;
 }
 block(p){if(p.blockUntil>this.time)return;p.blockUntil=this.time+.68;}
 activateSuper(p=this.user){
  if(!this.canAct()||p.energy<99.9||p.superUntil>this.time)return false;p.energy=0;p.superUntil=this.time+p.definition.super.duration;if(p.definition.super.id==='secondwind')p.stamina=100;
  this.notice(p.definition.name.toUpperCase(),p.definition.super.name.toUpperCase(),1.7);this.tone(850,.22,.022);return true;
 }
 updateBall(dt){
  const b=this.ball;if(b.mode==='held'){
   const p=b.owner;const t=this.time*13;const moving=Math.hypot(p.vx,p.vz)>.1;const sideX=Math.cos(p.mesh.rotation.y)*.3,sideZ=-Math.sin(p.mesh.rotation.y)*.3;
   b.pos.set(p.x+sideX,p.definition.scale*(moving?.16+Math.abs(Math.sin(t))*.94:1.10),p.z+sideZ);this.ballMesh.rotation.x+=dt*4;
  }else if(b.mode==='pass'){
   b.elapsed+=dt;b.target.set(b.to.x,1.25*b.to.definition.scale,b.to.z);const t=Math.min(1,b.elapsed/b.duration);b.pos.copy(b.start).lerp(b.target,t);b.pos.y+=Math.sin(t*Math.PI)*.25;
   if(t>.16&&t<.9){for(const p of this.players){if(p.team!==b.from.team&&distance(p,b.pos)<.48&&p.stealUntil<this.time){p.stealUntil=this.time+1.8;if(Math.random()<.60){this.giveBall(p);this.ball.previousPass=null;p.energy=Math.min(100,p.energy+18);p.stats.steals++;this.notice('ПАС ПЕРЕХВАЧЕН','',1);break;}}}}
   if(this.ball.mode==='pass'&&t>=1)this.giveBall(b.to,false);
  }else if(b.mode==='shot'){
   b.elapsed+=dt;const t=Math.min(1,b.elapsed/b.duration);b.pos.copy(b.start).lerp(b.target,t);b.pos.y+=Math.sin(Math.PI*t)*b.arc;
   for(const p of this.players){if(p.team!==b.shooter.team&&p.blockUntil>this.time&&t>.03&&t<.75&&distance(p,b.pos)<.85){const reach=1.86*p.definition.scale+.28+this.stat(p,'jump')*.009;if(b.pos.y<reach){b.blocked=true;b.success=false;this.makeLoose(b.pos,new T.Vector3((Math.random()-.5)*4,1,(Math.random()-.5)*4),p.team);p.energy=Math.min(100,p.energy+20);this.notice('БЛОК!','',1.1);return;}}}
   if(t>=1){if(b.success){this.addScore(b.shooter,b.points,b.dunk,b.previousPass);}else{this.makeLoose(b.pos,new T.Vector3(-this.attackSign(b.shooter.team)*(1.3+Math.random()*2),1,(Math.random()-.5)*3),b.shooter.team);this.tone(180,.08,.014);}}
  }else if(b.mode==='loose'){
   b.velocity.y-=9.8*dt;b.pos.addScaledVector(b.velocity,dt);if(b.pos.y<.125){b.pos.y=.125;b.velocity.y=Math.abs(b.velocity.y)*.54;b.velocity.x*=.76;b.velocity.z*=.76;}
   if(Math.abs(b.pos.x)>9.35){b.pos.x=clamp(b.pos.x,-9.35,9.35);b.velocity.x*=-.65;}if(Math.abs(b.pos.z)>5.14){b.pos.z=clamp(b.pos.z,-5.14,5.14);b.velocity.z*=-.65;}
   let candidates=this.players.filter(p=>distance(p,b.pos)<((p.superUntil>this.time&&p.definition.super.id==='anchor')?1.55:.76)&&b.pos.y<1.9*p.definition.scale+(p.blockUntil>this.time?.7:0));
   if(candidates.length){candidates.sort((a,c)=>(distance(a,b.pos)-a.definition.scale*.16)-(distance(c,b.pos)-c.definition.scale*.16));const p=candidates[0];this.giveBall(p);this.shotClock=24;this.ball.previousPass=null;p.energy=Math.min(100,p.energy+9);this.notice(p===this.user?'ТВОЙ ПОДБОР':p.definition.name+' · подбор','',.85);}
  }
  this.ballMesh.position.copy(this.ball.pos);this.ballMesh.rotation.z+=dt*5;
 }
 makeLoose(pos,velocity,lastTeam){this.ball={mode:'loose',owner:null,pos:pos.clone(),velocity,lastTeam,previousPass:null};}
 addScore(p,points,dunk,pass){
  this.score[p.team]+=points;p.stats.points+=points;p.stats.made++;p.energy=Math.min(100,p.energy+20);if(pass&&pass.to===p&&this.time-pass.time<5){pass.from.stats.assists++;pass.from.energy=Math.min(100,pass.from.energy+12);}
  this.notice('+'+points+' · '+p.definition.name.toUpperCase(),dunk?'СВЕРХУ!':points===3?'ТРЁХОЧКОВЫЙ':'ПОПАДАНИЕ',1.45);this.tone(680,.16,.027);
  if(this.overtime||this.clock<=0&&this.score[0]!==this.score[1]){this.updateUI();this.end();return;}
  this.resetPositions(1-p.team);this.inboundUntil=this.time+1.3;
 }
 animatePlayers(dt){for(const p of this.players){const t=this.time;const jumpLeft=Math.max(0,p.blockUntil-t);p.air=jumpLeft>0?Math.sin((1-jumpLeft/.68)*Math.PI)*(.18+this.stat(p,'jump')*.0063):0;p.air=Math.max(0,p.air);
   const shootLeft=Math.max(0,p.shootUntil-t);animateCharacter(p.mesh,t+p.index*.9,Math.hypot(p.vx,p.vz)/5,p.air,Math.min(1,shootLeft*2),this.ball.owner===p);p.mesh.position.set(p.x,0,p.z);const active=p.superUntil>t;p.mesh.userData.ring.material.color.set(active?0xf5dd75:(p===this.user?0xffda8d:p.team===0?0xecb889:0x85d0c2));p.mesh.userData.ring.scale.setScalar(active?1.32+(Math.sin(t*5)*.06):(p===this.user?1.22:1));}
  const refX=clamp(this.ball.pos.x*.25,-3,3);this.referee.position.x+=(refX-this.referee.position.x)*Math.min(1,dt*1.2);this.referee.rotation.y=Math.atan2(this.ball.pos.x-this.referee.position.x,this.ball.pos.z-this.referee.position.z);animateCharacter(this.referee,this.time,.1,0,0,false);
 }
 updateUI(){
  $('score-home').textContent=this.score[0];$('score-away').textContent=this.score[1];const seconds=Math.ceil(this.clock);$('clock').textContent=this.overtime?'ОТ':Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');$('shot-clock').textContent=Math.max(0,Math.ceil(this.shotClock));
  $('stamina').style.width=this.user.stamina+'%';const owner=this.ball.owner;const own=owner?.team===0;
  $('pass-label').textContent=owner===this.user?'ПАС':own?'ПРОСИТЬ':'ПЕРЕХВАТ';$('shoot-label').textContent=owner===this.user?'БРОСОК':own?'ПРЫЖОК':'БЛОК';
  const active=this.user.superUntil>this.time;$('super').classList.toggle('ready',this.user.energy>=99.9);$('super').classList.toggle('active',active);$('super-percent').textContent=active?Math.ceil(this.user.superUntil-this.time)+'с':Math.floor(this.user.energy)+'%';$('super').setAttribute('aria-label',active?this.user.definition.super.name+' активен':'Суперприём '+this.user.definition.super.name+', '+Math.floor(this.user.energy)+' процентов');
  if(this.chargeStart!==null){$('charge-marker').style.left=(this.getCharge()*98)+'%';if(this.ball.owner!==this.user){this.chargeStart=null;$('charge-wrap').classList.add('hidden');}}
 }
 render(){
  this.renderer.render(this.scene,this.camera);const w=this.canvas.clientWidth,h=this.canvas.clientHeight,placed=[];for(const p of this.players){const pos=new T.Vector3(p.x,.02,p.z+.47).project(this.camera);const x=(pos.x*.5+.5)*w,half=p.definition.name.length*2.7+10;let y=(-pos.y*.5+.5)*h;for(let tries=0;tries<5;tries++){if(!placed.some(q=>Math.abs(x-q.x)<half+q.half&&Math.abs(y-q.y)<17))break;y+=17;}placed.push({x,y,half});p.label.style.left=x+'px';p.label.style.top=y+'px';p.label.style.display=pos.z>1?'none':'';}
 }
 setPaused(value){this.paused=value;this.input={x:0,z:0};this.keys.clear();this.chargeStart=null;$('charge-wrap').classList.add('hidden');$('stick').style.transform='';this.lastFrame=performance.now();}
 stop(){this.running=false;cancelAnimationFrame(this.raf);this.keys.clear();this.chargeStart=null;$('charge-wrap').classList.add('hidden');}
 end(){if(!this.running)return;const result={won:this.score[0]>this.score[1],score:[...this.score],players:this.players.map(p=>({name:p.definition.name,id:p.definition.id,team:p.team,...p.stats})),user:{...this.user.stats},hero:this.user.definition.id};this.stop();this.callbacks.onEnd?.(result);}
 installControls(){
  const on=(target,type,fn,opts)=>{target.addEventListener(type,fn,opts);this.disposers.push(()=>target.removeEventListener(type,fn,opts));};let stickPointer=null;
  const moveStick=e=>{if(e.pointerId!==stickPointer)return;const r=$('joystick').getBoundingClientRect();let dx=e.clientX-r.left-r.width/2,dz=e.clientY-r.top-r.height/2;let length=Math.hypot(dx,dz),limit=r.width*.34;if(length>limit){dx*=limit/length;dz*=limit/length;}this.input={x:dx/limit,z:dz/limit};$('stick').style.transform=`translate(${dx}px,${dz}px)`;};
  on($('joystick'),'pointerdown',e=>{e.preventDefault();this.unlockAudio();stickPointer=e.pointerId;$('joystick').setPointerCapture(e.pointerId);moveStick(e);});on($('joystick'),'pointermove',moveStick);
  const releaseStick=e=>{if(e.pointerId!==stickPointer)return;stickPointer=null;this.input={x:0,z:0};$('stick').style.transform='';};on($('joystick'),'pointerup',releaseStick);on($('joystick'),'pointercancel',releaseStick);on($('joystick'),'lostpointercapture',releaseStick);
  on($('shoot'),'pointerdown',e=>{e.preventDefault();this.unlockAudio();$('shoot').setPointerCapture(e.pointerId);this.pressShoot();});on($('shoot'),'pointerup',e=>{e.preventDefault();this.releaseShoot();});on($('shoot'),'pointercancel',()=>{this.chargeStart=null;$('charge-wrap').classList.add('hidden');});
  on($('pass'),'pointerdown',e=>{e.preventDefault();this.unlockAudio();this.pressPass();});on($('super'),'pointerdown',e=>{e.preventDefault();this.unlockAudio();this.activateSuper();});
  on($('pass'),'click',e=>{if(e.detail===0)this.pressPass();});on($('super'),'click',e=>{if(e.detail===0)this.activateSuper();});
  on(window,'keydown',e=>{if(!this.running||e.target.closest('dialog'))return;if(['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyW','KeyA','KeyS','KeyD','KeyE','KeyQ'].includes(e.code))e.preventDefault();if(e.repeat)return;this.keys.add(e.code);if(e.code==='Space')this.pressShoot();if(e.code==='KeyE')this.pressPass();if(e.code==='KeyQ')this.activateSuper();if(e.code==='Escape')this.callbacks.onPause?.();});on(window,'keyup',e=>{this.keys.delete(e.code);if(e.code==='Space')this.releaseShoot();});
  on(window,'blur',()=>{this.keys.clear();this.input={x:0,z:0};if(this.running&&!this.paused)this.callbacks.onPause?.();});on(document,'visibilitychange',()=>{if(document.hidden&&this.running&&!this.paused)this.callbacks.onPause?.();});
  on($('portrait-continue'),'click',()=>{this.portraitAllowed=true;this.resize();});on($('sound'),'click',()=>{this.soundOn=!this.soundOn;$('sound').setAttribute('aria-pressed',String(this.soundOn));$('sound').setAttribute('aria-label',this.soundOn?'Выключить звук':'Включить звук');$('sound').textContent=this.soundOn?'♪':'×♪';});
  on(this.canvas,'webglcontextlost',e=>{e.preventDefault();this.setPaused(true);this.callbacks.onError?.('Браузер освободил графическую память. Обнови страницу, чтобы продолжить игру.');});
 }
}
