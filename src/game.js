import * as T from '../vendor/three.module.min.js';
import {createCharacter,animateCharacter,poseCharacter,disposeObject} from './models.js?v=0.5.0';
import {createArena,createBall,COURT} from './arena.js?v=0.5.0';
import {REFEREE} from './roster.js?v=0.5.0';
import {clamp,shotProfile,botRelease,distanceToSegment} from './mechanics.js?v=0.5.0';
import {dribbleSample,dunkSample,chooseDunk,DUNK_NAMES,ballisticPoint,logicalStickDelta,smooth,mix} from './motion.js?v=0.5.0';
import {GameDisplay} from './display.js?v=0.5.0';
import {BADGES} from './league.js?v=0.5.0';
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
  this.arena=createArena(this.scene);this.ballMesh=createBall();this.scene.add(this.ballMesh);
  this.playMarker=new T.Mesh(new T.RingGeometry(.36,.395,32),new T.MeshBasicMaterial({color:0xd7c895,transparent:true,opacity:.75,side:T.DoubleSide,depthWrite:false}));this.playMarker.rotation.x=-Math.PI/2;this.playMarker.visible=false;this.scene.add(this.playMarker);
  this.referee=createCharacter(REFEREE,0);this.referee.position.set(0,0,-5.75);this.scene.add(this.referee);
  this.players=[];this.running=false;this.paused=false;this.input={x:0,z:0};this.keys=new Set();
  this.soundOn=true;this.audio=null;this.raf=0;this.time=0;this.noticeTimer=0;this.chargeStart=null;
  this.chargeMovement=0;this.portraitAllowed=false;this.disposers=[];this.resize=this.resize.bind(this);
  this.display=new GameDisplay($('game-screen'),view=>this.resize(view));this.installControls();this.resize();
 }
 start(roster,options={}) {
  this.stop();for(const p of this.players){this.scene.remove(p.mesh);disposeObject(p.mesh);}
  $('player-labels').replaceChildren();this.players=[];
  roster.forEach((definition,i)=>{
   const p={definition,team:i<2?0:1,index:i,x:0,z:0,vx:0,vz:0,energy:0,stamina:100,
    superUntil:0,stealUntil:0,blockUntil:0,blockReady:0,shootUntil:0,passUntil:0,stunUntil:0,
    burstUntil:0,burstReady:0,fakeUntil:0,fakeReady:0,catchUntil:0,protectedUntil:0,
    hand:1,dribbleClock:0,cross:null,crossReady:0,action:null,approachSpeed:0,approachAt:-10,cutUntil:0,air:0,think:.15+i*.08,holdTime:0,settled:1,gait:i*.7,aiShot:null,reactionAt:0,
    stats:{points:0,assists:0,steals:0,blocks:0,rebounds:0,shots:0,made:0,threes:0,threesMade:0,dunks:0,screens:0},
    mesh:createCharacter(definition,i<2?0:1)};
   this.scene.add(p.mesh);const label=document.createElement('span');
   label.className='player-label'+(i===0?' self':'');label.textContent=(i===0?'▴ ':'')+definition.name;
   $('player-labels').append(label);p.label=label;this.players.push(p);
  });
  this.matchMode=options.mode==='crown'?'crown':'quick';this.matchRound=clamp(options.round??0,0,2);this.targetScore=this.matchMode==='crown'?7:0;
  this.badges=new Set(this.matchMode==='crown'?(options.badges||[]).filter(id=>BADGES.some(b=>b.id===id)):[]);this.heroTitle=options.title||'';
  this.screenPlays=[null,null];this.screenReady=[0,0];this.playMarker.visible=false;
  this.user=this.players[0];this.score=[0,0];this.clock=this.matchMode==='crown'?90:180;this.shotClock=24;this.overtime=false;
  this.time=0;this.matchId=options.matchId??`match-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  this.ball={mode:'held',owner:this.user,pos:new T.Vector3(),previousPass:null};this.possession=0;
  this.noticeTimer=0;this.paused=false;this.running=true;this.input={x:0,z:0};this.keys.clear();this.cancelCharge();
  $('active-name').textContent=this.user.definition.name;$('active-ovr').textContent=this.user.definition.ovr;
  $('active-photo').src=this.user.definition.photo;$('active-photo').style.objectPosition=this.user.definition.photoPosition;
  $('shot-feedback').textContent='';this.feedbackUntil=0;this.resetPositions(0);this.inboundUntil=.9;
  this.notice(this.matchMode==='crown'?`КОРОЛЬ ПЛОЩАДКИ · ${this.matchRound+1}/3`:'ЛИЦЕЙ № 2',this.matchMode==='crown'?'До 7 очков · 90 секунд':'Владей мячом · попроси заслон · создай момент',1.8);this.display.enter();
  this.resize();this.updateCamera(1,true);this.unlockAudio();this.lastFrame=performance.now();this.loop(this.lastFrame);
 }
 attackSign(team){return team===0?1:-1;}
 hoop(team){return {x:this.attackSign(team)*COURT.hoopX,z:0};}
 hasBadge(p,id){return p.team===0&&!!this.badges?.has(id);}
 defensiveReward(p){if(this.hasBadge(p,'defense')){p.stamina=Math.min(100,p.stamina+10);p.energy=Math.min(100,p.energy+12);}}
 stat(p,key){
  let v=p.definition.stats[key];if(p.superUntil>this.time){switch(p.definition.super.id){
   case 'flight':if(key==='jump'||key==='dunk')v+=12;break;
   case 'dash':if(key==='handle')v+=18;if(key==='speed')v*=1.24;break;
   case 'secondwind':if(key==='defense')v+=15;if(key==='speed')v*=1.12;break;
   case 'anchor':if(key==='defense')v+=22;break;
  }}return v;
 }
 resetPositions(team){
  this.screenPlays=[null,null];for(const p of this.players)p.screenSet=false;
  const dir=this.attackSign(team),own=this.players.filter(p=>p.team===team),other=this.players.filter(p=>p.team!==team);
  own.forEach((p,i)=>{p.x=-dir*2.4;p.z=i===0?1.8:-2.1;p.vx=p.vz=0;p.holdTime=0;p.aiShot=null;p.action=null;});
  other.forEach((p,i)=>{p.x=dir*1.8;p.z=i===0?1.3:-1.9;p.vx=p.vz=0;p.holdTime=0;p.aiShot=null;p.action=null;});
  this.giveBall(own[0],false);this.shotClock=24;this.ball.previousPass=null;
 }
 inbound(team){
  this.screenPlays=[null,null];for(const p of this.players)p.screenSet=false;
  // Defenders stay in the play rather than teleporting to the centre after every basket.
  const dir=this.attackSign(team),own=this.players.filter(p=>p.team===team);
  own.forEach((p,i)=>{p.x=-dir*(i===0?7.9:5.4);p.z=i===0?1.1:-2.5;p.vx=p.vz=0;p.aiShot=null;p.action=null;});
  this.giveBall(own[0]);own[0].protectedUntil=this.time+1.45;this.ball.previousPass=null;
  this.shotClock=24;this.inboundUntil=this.time+.65;
 }
 giveBall(p,resetClock=true){
  const previousTeam=this.possession,previous=this.ball,catchOrigin=previous.pos.clone();
  this.ball={mode:'held',owner:p,pos:catchOrigin,previousPass:previous.previousPass};this.possession=p.team;p.holdTime=0;p.aiShot=null;
  p.dribbleClock=0;p.cross=null;p.catchStart=this.time;p.catchOrigin=catchOrigin;p.approachSpeed=0;
  p.reboundUntil=0;if(previousTeam!==p.team){this.screenPlays=[null,null];for(const q of this.players)q.screenSet=false;}
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
 resize(view){
  if(!view&&this.display?.active){this.display.layout();return;}
  const w=view?.width||this.canvas.clientWidth||innerWidth,h=view?.height||this.canvas.clientHeight||innerHeight;
  this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.updateCamera(1,true);
  this.orientationBlocked=!!view?.blocked;
 }
 updateCamera(dt,snap=false){
  if(!this.camera)return;const close=this.cameraMode==='close',portrait=this.camera.aspect<1;
  const ux=this.user?.x??0,uz=this.user?.z??0,bx=this.ball?.pos.x??0;
  const tx=close?clamp(ux*.65+bx*.25+1,-5.1,5.1):0,tz=close?clamp(uz*.2,-.7,.7):0;
  const focus=this.cameraFocus,a=snap?1:1-Math.exp(-dt*3.7);
  focus.x+=(tx-focus.x)*a;focus.z+=(tz-focus.z)*a;const offset=portrait?1.38:1;
  this.camera.position.set(focus.x-(close?1.6:0),(close?3.9:9.8)*offset,focus.z+(close?9.8:14.3)*offset);
  this.camera.fov=close?49:46;this.camera.lookAt(focus.x+(close?.9:0),close?1.08:.35,focus.z);
  this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
 }
 loop(now){
  if(!this.running)return;const dt=Math.min(.05,Math.max(0,(now-this.lastFrame)/1000));this.lastFrame=now;
  if(!this.paused&&!this.orientationBlocked)this.update(dt);this.render();this.raf=requestAnimationFrame(t=>this.loop(t));
 }
 update(dt){
  this.time+=dt;for(const p of this.players){p.dribbleClock=(p.dribbleClock||0)+dt*(1.45+speedOf(p)*.13);if(p.cross&&this.time>p.cross.start+.48){p.hand=-p.cross.from;p.cross=null;p.dribbleClock=.22;}}if(this.noticeTimer>0){this.noticeTimer-=dt;if(this.noticeTimer<=0)$('callout').classList.remove('show');}
  if(this.inboundUntil>this.time||this.ball.mode==='scored'){
   this.updateBall(dt);this.animatePlayers(dt);this.updateCamera(dt);this.updateUI();return;
  }
  if(!this.overtime)this.clock=Math.max(0,this.clock-dt);this.shotClock-=dt;
  if(this.shotClock<=0&&this.ball.mode==='held'){
   this.notice('ВРЕМЯ АТАКИ','Мяч переходит сопернику');this.cancelCharge();this.resetPositions(1-this.possession);
   this.inboundUntil=this.time+.9;this.tone(1100,.15);return;
  }
  if(this.clock<=0&&!this.overtime&&!['shot','gather','dunk'].includes(this.ball.mode)){
   if(this.score[0]===this.score[1]){this.overtime=true;this.notice('ДО ПЕРВОГО ПОПАДАНИЯ','Дополнительное время',2.6);}else{this.end();return;}
  }
  let ix=this.input.x,iz=this.input.z;
  if(this.keys.has('ArrowLeft')||this.keys.has('KeyA'))ix-=1;if(this.keys.has('ArrowRight')||this.keys.has('KeyD'))ix+=1;
  if(this.keys.has('ArrowUp')||this.keys.has('KeyW'))iz-=1;if(this.keys.has('ArrowDown')||this.keys.has('KeyS'))iz+=1;
  const length=Math.hypot(ix,iz);if(length>1){ix/=length;iz/=length;}
  // Translate screen-relative controls into the ground plane of the oblique camera.
  if(this.camera){const e=this.camera.matrixWorld.elements,rx=e[0],rz=e[2],l=Math.hypot(rx,rz)||1,x=ix;ix=(rx*x-rz*iz)/l;iz=(rz*x+rx*iz)/l;}
  this.updatePlays();for(const p of this.players){
   p.energy=Math.min(100,p.energy+dt*.65);if(p===this.user)this.move(p,ix,iz,dt);else this.ai(p,dt);
   if(p===this.ball.owner)p.holdTime+=dt;else{p.holdTime=0;p.aiShot=null;}
  }
  this.resolveCollisions();this.updateBall(dt);this.animatePlayers(dt);this.updateCamera(dt);this.updateUI();
 }
 move(p,dx,dz,dt){
  if(p.action&&this.time<p.action.start+p.action.duration&&['jumper','layup','dunk'].includes(p.action.kind)){p.vx=p.vz=0;return;}
  const magnitude=Math.min(1,Math.hypot(dx,dz)),owner=this.ball.owner,defending=this.possession!==p.team;
  let speed=2.45+this.stat(p,'speed')*.022;
  if(owner===p)speed*=.85+.15*this.stat(p,'handle')/100;speed*=.76+.24*p.stamina/100;
  if(p.burstUntil>this.time)speed*=1.44;if(p.stunUntil>this.time)speed*=.20;
  const charge=p.aiShot||p===this.user&&this.chargeStart!==null;
  if(charge)speed*=distance(p,this.hoop(p.team))<2.8?.75:.26;
  if(p.blockUntil>this.time)speed*=.32;if(p.cross)speed*=.8;
  const acceleration=magnitude>.05?6.5+this.stat(p,'handle')*.033:11.5,response=1-Math.exp(-acceleration*dt);
  p.vx+=(dx*speed-p.vx)*response;p.vz+=(dz*speed-p.vz)*response;
  p.x=clamp(p.x+p.vx*dt,-9.08,9.08);p.z=clamp(p.z+p.vz*dt,-4.98,4.98);
  const moving=speedOf(p);p.settled=moving<.42?(p.settled??0)+dt:0;p.gait=(p.gait??0)+moving*dt*(4.9-.4*Math.min(4.5,moving));
  p.stamina=clamp(p.stamina+(magnitude>.5?-(1.8-p.definition.stats.stamina*.010):this.hasBadge(p,'rest')?9:6)*dt,0,100);
  let aim=null;
  if(charge){const h=this.hoop(p.team);aim=Math.atan2(h.x-p.x,-p.z);}
  else if(defending&&owner&&distance(p,owner)<4.5)aim=Math.atan2(owner.x-p.x,owner.z-p.z);
  else if(moving>.18)aim=Math.atan2(p.vx,p.vz);
  if(aim!==null){const diff=Math.atan2(Math.sin(aim-p.mesh.rotation.y),Math.cos(aim-p.mesh.rotation.y));p.mesh.rotation.y+=diff*(1-Math.exp(-dt*10));}
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
  const approach=Math.max(speedOf(p),this.time-(p.approachAt??-10)<1.65?p.approachSpeed||0:0),ratingDunk=this.stat(p,'dunk');
  const movingFinish=approach>1.05&&d<(ratingDunk>=80?2.35:1.65)+(flight?.65:0);
  const standingFinish=d<.86&&ratingDunk>=72;
  const dunk=(movingFinish||standingFinish)&&ratingDunk>=55&&this.stat(p,'jump')>=48&&p.stamina>24&&this.contest(p)<.85;
  const kind=dunk?'dunk':d>COURT.threeDistance?'three':d<2.6?'layup':'mid',rating=this.stat(p,dunk?'dunk':kind==='three'?'three':'mid');
  const superBoost=active&&((p.definition.super.id==='sniper'&&kind==='three')||(p.definition.super.id==='focus'&&kind==='mid'))?.11:0;
  const jumper=kind==='mid'||kind==='three',catchBoost=this.hasBadge(p,'catch')&&p.catchUntil>this.time&&jumper?.06:0,reboundBoost=this.hasBadge(p,'rebound')&&p.reboundUntil>this.time&&d<3?.08:0;
  const releaseAid=this.hasBadge(p,'steady')&&(p.settled??0)>=.3&&jumper?.012:0,boost=superBoost+catchBoost+reboundBoost;
  return {kind,distance:d,rating,boost,superBoost,approach,badge:catchBoost?'Лови и бросай':reboundBoost?'Второй шанс':releaseAid?'Спокойная кисть':'',...shotProfile({rating,distance:d,kind,timing,contest:this.contest(p),movement,stamina:p.stamina,settled:p.settled??0,boost,releaseAid,catchBonus:p.catchUntil>this.time})};
 }
 callScreen(p=this.user){
  this.screenPlays??=[null,null];this.screenReady??=[0,0];
  if(!this.canAct()||this.ball.mode!=='held'||this.ball.owner!==p||this.screenReady[p.team]>this.time||p.aiShot||p===this.user&&this.chargeStart!==null)return false;
  const mate=this.players.find(q=>q.team===p.team&&q!==p),defenders=this.players.filter(q=>q.team!==p.team),mark=defenders.reduce((a,b)=>distance(a,p)<distance(b,p)?a:b);
  if(!mate||mate===this.user||mate.stamina<10||mate.action||distance(p,this.hoop(p.team))<1.8||distance(p,mark)>4.5){if(p===this.user)this.notice('ЗАСЛОН ПОКА НЕ НУЖЕН','Подойди к защитнику с мячом',.8);return false;}
  const hoop=this.hoop(p.team),length=distance(p,hoop)||1,dx=(hoop.x-p.x)/length,dz=-p.z/length,side=(mate.x-p.x)*(-dz)+(mate.z-p.z)*dx>=0?1:-1;
  const x=clamp(mark.x-dx*.30-dz*side*.65,-8.6,8.6),z=clamp(mark.z-dz*.30+dx*side*.65,-4.5,4.5);
  this.screenPlays[p.team]={carrier:p.index,screener:mate.index,defender:mark.index,x,z,dx,dz,side,phase:'approach',start:this.time,until:this.time+6.5,setAt:0,engaged:false};this.screenReady[p.team]=this.time+8;mate.stamina-=7;
  if(p===this.user)this.notice('НАПАРНИК ИДЁТ НА ЗАСЛОН','Обойди его с мячом, затем ищи пас под кольцо',1.5);return true;
 }
 updatePlays(){
  this.screenPlays??=[null,null];for(const p of this.players)p.screenSet=false;
  for(let team=0;team<2;team++){
   const play=this.screenPlays[team];if(!play)continue;const carrier=this.players[play.carrier],mate=this.players[play.screener],b=this.ball;
   if(this.time>play.until||this.possession!==team||!['held','passGather','pass'].includes(b.mode)||!carrier||!mate){this.screenPlays[team]=null;continue;}
   if(b.owner===mate||b.to===mate&&['passGather','pass'].includes(b.mode)){play.phase='roll';play.rollAt??=this.time;}
   if(play.phase==='approach'&&distance(mate,play)<.25&&speedOf(mate)<.8){play.phase='set';play.setAt=this.time;}
   if(play.phase==='set'){
    mate.screenSet=true;const past=(carrier.x-play.x)*play.dx+(carrier.z-play.z)*play.dz;
    if(this.time-play.setAt>1.8||play.engaged&&this.time-play.engagedAt>.22||past>.5&&distance(carrier,play)>1.0){play.phase='roll';play.rollAt=this.time;mate.screenSet=false;mate.cutUntil=this.time+2.3;}
   }
  }
  const current=this.screenPlays[0];if(this.playMarker){this.playMarker.visible=!!current&&current.phase!=='roll';if(current)this.playMarker.position.set(current.x,.022,current.z);}
 }
 ai(p,dt){
  const b=this.ball,owner=b.owner,dir=this.attackSign(p.team),hoop=this.hoop(p.team),mate=this.players.find(q=>q.team===p.team&&q!==p);let tx=p.x,tz=p.z;
  if(owner!==p)p.aiShot=null;if(p.action&&this.time<p.action.start+p.action.duration&&['jumper','layup','dunk'].includes(p.action.kind)){this.move(p,0,0,dt);return;}
  const play=this.screenPlays?.[p.team];
  if(play&&play.screener===p.index&&owner?.team===p.team&&owner!==p&&['held','passGather'].includes(b.mode)){
   tx=play.phase==='roll'?hoop.x-dir*1.0:play.x;tz=play.phase==='roll'?play.side*1.0:play.z;
   const dx=tx-p.x,dz=tz-p.z,d=Math.hypot(dx,dz);this.move(p,play.phase==='set'?0:dx/(d||1)*Math.min(1,d*2.3),play.phase==='set'?0:dz/(d||1)*Math.min(1,d*2.3),dt);
   if(play.phase==='set')p.mesh.rotation.y=Math.atan2(owner.x-p.x,owner.z-p.z);return;
  }
  if(b.mode==='pass'&&b.to===p){tx=b.target.x;tz=b.target.z;}
  else if(b.mode==='loose'){tx=b.pos.x;tz=b.pos.z;}
  else if(['shot','gather','dunk'].includes(b.mode)){
   const target=b.target||this.hoop(b.shooter?.team??b.owner?.team??this.possession);tx=target.x-dir*.7;tz=target.z+(p.index%2?-.7:.7);
   const shooter=b.shooter||b.owner;if(shooter?.team!==p.team&&distance(p,b.pos)<1.5&&this.time-(b.started??this.time)>.18)this.block(p);
  }else if(owner===p){
   const d=distance(p,hoop),covered=this.contest(p)>.48,defenders=this.players.filter(q=>q.team!==p.team);
   if(p.aiShot){this.move(p,0,0,dt);p.mesh.rotation.y=Math.atan2(hoop.x-p.x,-p.z);if(this.time>=p.aiShot.releaseAt){const timing=p.aiShot.timing;p.aiShot=null;this.shoot(p,timing);}return;}
   const perimeter=p.definition.stats.three>=78||p.definition.stats.three>p.definition.stats.mid+5;
   tx=hoop.x-dir*(perimeter&&d>4.8?6.0:1.1);tz=perimeter&&d>4.8?(p.index%2?-2.0:2.0):Math.sin(this.time*.65+p.index)*.6;
   if(covered&&d>2){const closest=defenders.reduce((a,c)=>distance(a,p)<distance(c,p)?a:c);tz=clamp(p.z+(p.z>=closest.z?1:-1)*1.7,-4.1,4.1);tx=p.x+dir*1.0;}
   if(play&&play.carrier===p.index&&play.phase!=='roll'){
    if(play.phase==='approach'){tx=p.x;tz=p.z;}
    else{tx=play.x+play.dx*1.15-play.dz*play.side*.64;tz=play.z+play.dz*1.15+play.dx*play.side*.64;}
   }
   p.think-=dt;if(p.think<=0){
    p.think=.22+Math.random()*.16;const openMate=Math.min(...defenders.map(q=>distance(q,mate)))>1.5;
    const clearPass=defenders.every(q=>distanceToSegment(q,p,mate)>.68);if(p.energy>=100&&d<7)this.activateSuper(p);
    const inRange=d<1.9||(perimeter?d<7.0:d<5.2),shooting=p.holdTime>.9&&((inRange&&!covered)||(d<1.7&&this.contest(p)<.65)||this.shotClock<2.5||p.holdTime>9);
    if(covered&&openMate&&clearPass&&p.holdTime>.8&&p.passUntil<this.time&&Math.random()<.60)this.passBall(p,mate);
    else if(shooting){p.approachSpeed=speedOf(p);p.approachAt=this.time;p.aiShot={releaseAt:this.time+.34+Math.random()*.22,timing:botRelease(p.definition.stats[d>COURT.threeDistance?'three':'mid']),started:this.time};this.move(p,0,0,dt);return;}
    else if(openMate&&clearPass&&distance(mate,hoop)<d-1.2&&p.holdTime>1.3&&Math.random()<.40)this.passBall(p,mate);
    else if(p.team===1&&covered&&d>3&&p.holdTime>.9&&!play&&Math.random()<.18)this.callScreen(p);
    else if(covered&&p.crossReady<this.time&&Math.random()<.23)this.crossover(p);else if(covered&&p.burstReady<this.time&&Math.random()<.2)this.burst(p);
   }
  }else if(owner?.team===p.team){
   const preferThree=p.definition.stats.three>75;tx=hoop.x-dir*(preferThree?5.7:3.0);tz=(owner.z>0?-1:1)*(preferThree?2.9:2.5);
   if(p.cutUntil>this.time){tx=hoop.x-dir*1.1;tz=(owner.z>0?-1:1)*1.35;}if(distance(owner,{x:tx,z:tz})<2)tx-=dir*1.8;
  }else if(owner){
   const defenders=this.players.filter(q=>q.team===p.team),enemies=this.players.filter(q=>q.team!==p.team);
   const primary=distance(defenders[0],owner)<=distance(defenders[1],owner)?defenders[0]:defenders[1];
   const mark=p===primary?owner:enemies.find(q=>q!==owner),ownHoop=this.hoop(1-p.team);
   const mx=ownHoop.x-mark.x,mz=-mark.z,ml=Math.hypot(mx,mz)||1;tx=mark.x+mx/ml*1.12;tz=mark.z+mz/ml*1.12;
   const winding=mark.aiShot||mark===this.user&&this.chargeStart!==null||mark.fakeUntil>this.time||mark.action&&['dunk','layup','jumper'].includes(mark.action.kind);
   if(winding&&distance(p,mark)<1.9){if(!p.reactionAt)p.reactionAt=this.time+.20+(100-p.definition.stats.defense)*.002+Math.random()*.13;if(this.time>=p.reactionAt){this.block(p);p.reactionAt=this.time+1.5;}}
   else p.reactionAt=0;
   p.think-=dt;if(p.think<=0){p.think=.3+Math.random()*.2;if(owner===mark&&distance(owner,p)<1.05&&Math.random()<.35)this.steal(p);}
   if(p.energy>=100&&distance(owner,p)<2.5&&['anchor','secondwind'].includes(p.definition.super.id))this.activateSuper(p);
  }
  const dx=tx-p.x,dz=tz-p.z,d=Math.hypot(dx,dz);this.move(p,d>.14?dx/d*Math.min(1,d*1.8):0,d>.14?dz/d*Math.min(1,d*1.8):0,dt);
 }
 resolveCollisions(){
  for(let a=0;a<this.players.length;a++)for(let b=a+1;b<this.players.length;b++){
   const p=this.players[a],q=this.players[b];let dx=q.x-p.x,dz=q.z-p.z,d=Math.hypot(dx,dz),radius=.29*(p.definition.scale+q.definition.scale);
   if(p.air>.4||q.air>.4)continue;if(d<radius){if(d<.001){dx=.01;dz=.005;d=Math.hypot(dx,dz);}const nx=dx/d,nz=dz/d;
    const anchor=p.screenSet&&p.team!==q.team?p:q.screenSet&&p.team!==q.team?q:null,play=anchor?this.screenPlays?.[anchor.team]:null;
    if(anchor&&play&&this.time-play.setAt>.18&&speedOf(anchor)<.8){
     const defender=anchor===p?q:p,sign=anchor===p?1:-1,penetration=radius-d,approaching=speedOf(defender)>.65;
     defender.x=clamp(defender.x+nx*penetration*sign,-9.08,9.08);defender.z=clamp(defender.z+nz*penetration*sign,-4.98,4.98);defender.vx*=.52;defender.vz*=.52;
     if(!play.engaged&&approaching){play.engaged=true;play.engagedAt=this.time;defender.stunUntil=Math.max(defender.stunUntil,this.time+.22);anchor.stats.screens=(anchor.stats.screens||0)+1;anchor.energy=Math.min(100,anchor.energy+6);if(anchor.team===0)this.notice('ЗАСЛОН СРАБОТАЛ','Проходи или отдай открывшемуся напарнику',1.0);}
    }else{
     const shift=(radius-d)*.5;p.x=clamp(p.x-nx*shift,-9.08,9.08);p.z=clamp(p.z-nz*shift,-4.98,4.98);q.x=clamp(q.x+nx*shift,-9.08,9.08);q.z=clamp(q.z+nz*shift,-4.98,4.98);const pv=p.vx*nx+p.vz*nz,qv=q.vx*nx+q.vz*nz;if(pv>0){p.vx-=nx*pv*.6;p.vz-=nz*pv*.6;}if(qv<0){q.vx-=nx*qv*.6;q.vz-=nz*qv*.6;}
    }
   }
  }
 }
 passBall(from,to){
  if(this.ball.mode!=='held'||this.ball.owner!==from||from.passUntil>this.time||from.aiShot)return false;
  const duration=clamp(distance(from,to)/12,.25,.8),error=(100-from.definition.stats.pass)*.004;
  const target=new T.Vector3(clamp(to.x+to.vx*(duration+.12)*.85+(Math.random()-.5)*error,-9.08,9.08),1.20*to.definition.scale,clamp(to.z+to.vz*(duration+.12)*.85+(Math.random()-.5)*error,-4.98,4.98));
  from.mesh.rotation.y=Math.atan2(to.x-from.x,to.z-from.z);from.action={kind:'pass',start:this.time,duration:.42};
  this.ball={...this.ball,mode:'passGather',owner:from,from,to,target,gripFrom:this.ball.pos.clone(),started:this.time,elapsed:0,duration,attempted:[],previousPass:{from,to,time:this.time}};
  from.passUntil=this.time+.75;from.cutUntil=this.time+2.8;this.cancelCharge();return true;
 }
 pressPass(){
  if(!this.canAct())return;const b=this.ball;
  if(b.mode==='held'){if(b.owner===this.user)this.passBall(this.user,this.players[1]);else if(b.owner.team===0){b.owner.aiShot=null;this.passBall(b.owner,this.user);this.notice('ПАС ТЕБЕ','Откройся на свободное место',.9);}else this.steal(this.user);}
 }
 canAct(){return this.running&&!this.paused&&!this.orientationBlocked&&this.inboundUntil<=this.time&&this.ball.mode!=='scored';}
 pressShoot(){
  if(!this.canAct())return;
  if(this.ball.mode==='held'&&this.ball.owner===this.user){if(this.chargeStart!==null||this.user.shootUntil>this.time||this.user.fakeUntil>this.time)return;this.user.approachSpeed=speedOf(this.user);this.user.approachAt=this.time;this.chargeStart=this.time;this.chargeMovement=clamp(speedOf(this.user)/4.5,0,1);$('charge-wrap').classList.remove('hidden');}
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
  const info=this.shotInfo(p,timing,movement),hoop=this.hoop(p.team),dunk=info.kind==='dunk',layup=info.kind==='layup',three=info.kind==='three',dir=this.attackSign(p.team);
  const success=Math.random()<info.chance,target=new T.Vector3(hoop.x,COURT.hoopY,0);
  if(!dunk){if(success){target.x+=(Math.random()-.5)*.10;target.z+=(Math.random()-.5)*.10;}else{target.x+=(Math.random()-.5)*.60;target.z+=(Math.random()>.5?1:-1)*(.36+Math.random()*.22);}}
  const duration=dunk?1.22:layup?.94:.80,facing=Math.atan2(hoop.x-p.x,-p.z),from={x:p.x,z:p.z};
  const reach=dunk?Math.min(1.9,Math.max(.15,info.distance-.34)):layup?Math.min(1.0,Math.max(0,info.distance-.52)):Math.min(.20,speedOf(p)*.035);
  const dx=(hoop.x-p.x)/(info.distance||1),dz=-p.z/(info.distance||1),end={x:clamp(p.x+dx*reach,-9.08,9.08),z:clamp(p.z+dz*reach,-4.98,4.98)};
  const style=dunk?chooseDunk({rating:this.stat(p,'dunk'),speed:info.approach,side:p.z,pressure:this.contest(p)}):null;
  p.mesh.rotation.y=facing;p.action={kind:dunk?'dunk':layup?'layup':'jumper',start:this.time,duration,from,end,facing,style,hand:p.hand||1,release:dunk?.655:layup?.48:.31,airHeight:dunk?3.38-p.definition.scale*1.98:layup?.40:.21+this.stat(p,'jump')*.0007};
  p.shootUntil=this.time+duration;p.shotStart=this.time;p.shotKind=info.kind;p.aiShot=null;p.cross=null;p.stamina=Math.max(0,p.stamina-(dunk?13:layup?7:4));
  p.stats.shots++;if(three)p.stats.threes++;if(info.superBoost)p.superUntil=0;
  this.ball={...this.ball,mode:dunk?'dunk':'gather',owner:p,shooter:p,points:three?3:2,dunk,success,blocked:false,target,gripFrom:this.ball.pos.clone(),started:this.time,pos:this.ball.pos.clone(),elapsed:0,duration:dunk?duration:layup?.68:clamp(.88+info.distance*.048,1.0,1.48),timing,info,action:p.action};
  if(p===this.user){$('shot-feedback').textContent=(dunk?DUNK_NAMES[style]+' · ':'')+info.release+' · '+(info.badge||info.pressure);$('shot-feedback').dataset.quality=info.perfect?'good':'bad';this.feedbackUntil=this.time+2.5;}
  return true;
 }
 crossover(p=this.user){
  if(!this.canAct()||this.ball.mode!=='held'||this.ball.owner!==p||p.crossReady>this.time||p.stamina<6||p.aiShot||p===this.user&&this.chargeStart!==null)return false;
  p.cross={start:this.time,from:p.hand||1};p.lastCross=this.time;p.crossReady=this.time+1.1+(100-this.stat(p,'handle'))*.005;p.stamina-=6;return true;
 }
 steal(p){
  const owner=this.ball.owner;
  if(this.ball.mode!=='held'||!owner||owner.team===p.team||p.stealUntil>this.time||owner.protectedUntil>this.time)return false;
  p.stealUntil=this.time+1.4;p.stunUntil=this.time+.32;p.stamina=Math.max(0,p.stamina-5);
  const d=distance(p,owner),facing=((owner.x-p.x)*Math.sin(p.mesh.rotation.y)+(owner.z-p.z)*Math.cos(p.mesh.rotation.y))/(d||1);
  if(d>1.1||facing<-.15){if(p===this.user)this.notice('НЕ ДОТЯНУЛСЯ','Подойди к мячу',.8);return false;}
  const lowBounce=Math.abs(((owner.dribbleClock||0)%1)-.5)<.13,protection=owner.burstUntil>this.time||owner.cross?this.stat(owner,'handle')*.0014:0;
  const chance=clamp(.18+this.stat(p,'defense')*.003-this.stat(owner,'handle')*.0024+(lowBounce?.12:0)-protection,.07,.56);
  if(Math.random()<chance){this.giveBall(p);this.ball.previousPass=null;p.stunUntil=0;p.energy=Math.min(100,p.energy+18);p.stats.steals++;this.defensiveReward(p);this.notice(p===this.user?'ПЕРЕХВАТ!':p.definition.name+' · перехват','',.9);this.courtSound('catch');return true;}
  if(p===this.user)this.notice('МИМО МЯЧА','Соперник получил пространство',.8);return false;
 }
 block(p){if(p.action&&['dunk','jumper','layup'].includes(p.action.kind))return false;if(p.blockReady>this.time||p.stamina<7)return false;p.blockStart=this.time;p.blockUntil=this.time+.66;p.blockReady=this.time+1.3;p.stamina=Math.max(0,p.stamina-7);return true;}
 burst(p=this.user){
  const extra=this.hasBadge(p,'step')&&this.time-(p.lastCross??-10)<1.5;
  if(!this.canAct()||p.burstReady>this.time||p.stamina<(extra?14:18)||p.aiShot||p.action&&['dunk','jumper','layup'].includes(p.action.kind)||p===this.user&&this.chargeStart!==null)return false;
  p.burstUntil=this.time+.58+(extra?.2:0);p.burstReady=this.time+2.8;p.stamina-=extra?12:16;return true;
 }
 activateSuper(p=this.user){
  if(!this.canAct()||p.energy<99.9||p.superUntil>this.time)return false;
  p.energy=0;p.superUntil=this.time+p.definition.super.duration;if(p.definition.super.id==='secondwind')p.stamina=100;
  this.notice(p.definition.name.toUpperCase(),p.definition.super.name.toUpperCase(),1.6);this.tone(850,.22,.022);return true;
 }
 rootPoint(p,local){return new T.Vector3(...local).multiplyScalar(p.definition.scale).applyAxisAngle(new T.Vector3(0,1,0),p.mesh.rotation.y).add(new T.Vector3(p.x,0,p.z));}
 advanceActions(){
  for(const p of this.players){
   const jumpAge=(this.time-(p.blockStart??-10))/.66;p.air=p.blockUntil>this.time?Math.sin(clamp(jumpAge,0,1)*Math.PI)*(.28+this.stat(p,'jump')*.0046):0;
   const a=p.action;if(!a)continue;const t=clamp((this.time-a.start)/a.duration,0,1);
   if(a.kind==='dunk'){
    const pose=dunkSample(a.style,t,a.hand);p.air=a.airHeight*pose.lift;p.x=mix(a.from.x,a.end.x,pose.travel);p.z=mix(a.from.z,a.end.z,pose.travel);p.mesh.rotation.y=a.facing+pose.turn;a.pose=pose;
   }else if(a.kind==='jumper'||a.kind==='layup'){
    const start=a.kind==='layup'?.14:.05,end=a.kind==='layup'?.90:.86;
    p.air=Math.sin(clamp((t-start)/(end-start),0,1)*Math.PI)*a.airHeight;
    const travel=smooth(0,a.kind==='layup'?.72:.65,t);p.x=mix(a.from.x,a.end.x,travel);p.z=mix(a.from.z,a.end.z,travel);p.mesh.rotation.y=a.facing;
   }
   if(t>=1){p.action=null;p.air=0;}
  }
 }
 checkBlock(b){
  for(const p of this.players){const age=this.time-(p.blockStart??-10),shooter=b.shooter||b.owner,reach=1.98*p.definition.scale+p.air;
   if(p.team!==shooter.team&&p.blockUntil>this.time&&age>.12&&age<.51&&distance(p,b.pos)<.65&&b.pos.y<reach&&b.pos.y>1.3){
    if(b.mode==='dunk'&&(this.time-b.started)/b.action.duration>.61)continue;
    if(b.mode==='shot'&&b.elapsed/b.duration>.56)continue;
    this.makeLoose(b.pos,new T.Vector3(-this.attackSign(shooter.team)*2.3,1.1,(Math.random()-.5)*2.5),shooter.team,false);
    if(shooter.action)shooter.action.interrupted=true;p.stats.blocks++;p.energy=Math.min(100,p.energy+18);this.defensiveReward(p);this.notice('БЛОК',p.definition.name,1.0);this.courtSound('rim');return true;
   }
  }return false;
 }
 updateBall(dt){
  this.advanceActions();const b=this.ball;
  if(b.mode==='held'){
   const p=b.owner,charging=p.aiShot||p===this.user&&this.chargeStart!==null,faking=p.fakeUntil>this.time;
   if(charging||faking){
    const amount=faking?Math.sin(clamp((this.time-(p.fakeUntil-.4))/.4,0,1)*Math.PI):p.aiShot?smooth(p.aiShot.started,p.aiShot.releaseAt,this.time):smooth(0,.72,this.getCharge());
    p.dribbleVisual=null;p.heldLocal=[.025,1.05+amount*.53,.35];b.pos.copy(this.rootPoint(p,p.heldLocal));
   }else{
    const cross=p.cross?{t:(this.time-p.cross.start)/.48,from:p.cross.from}:null,d=dribbleSample(p.dribbleClock,speedOf(p),p.hand||1,cross);p.dribbleVisual=d;p.heldLocal=null;
    const target=this.rootPoint(p,d.ball),catching=p.catchOrigin&&this.time-p.catchStart<.16;
    b.pos.copy(catching?p.catchOrigin.clone().lerp(target,smooth(0,.16,this.time-p.catchStart)):target);
    if(catching){p.heldLocal=this.localBall(p,b.pos);p.dribbleVisual=null;}
    const cycle=Math.floor(p.dribbleClock-.5);if(p.lastBounce!==undefined&&cycle!==p.lastBounce)this.courtSound('bounce');p.lastBounce=cycle;
   }
  }else if(b.mode==='passGather'){
   const p=b.owner,t=clamp((this.time-b.started)/.14,0,1),local=[0,1.20+.12*t,.29+.18*t];b.pos.copy(b.gripFrom).lerp(this.rootPoint(p,local),smooth(0,1,t));
   if(t>=1){b.mode='pass';b.owner=null;b.start=b.pos.clone();b.elapsed=0;this.courtSound('pass');}
  }else if(b.mode==='gather'){
   const p=b.shooter,a=b.action,age=this.time-b.started,t=clamp(age/a.release,0,1),layup=a.kind==='layup';
   const local=[layup?a.hand*.16:.065,mix(1.52,layup?1.94:1.87,smooth(0,1,t))+p.air/p.definition.scale,mix(.32,.39,t)];
   b.pos.copy(b.gripFrom).lerp(this.rootPoint(p,local),smooth(0,.60,t));
   if(this.checkBlock(b)){this.ballMesh.position.copy(this.ball.pos);return;}
   if(t>=1){b.mode='shot';b.owner=null;b.start=b.pos.clone();b.elapsed=0;this.courtSound('release');}
  }else if(b.mode==='dunk'){
   const p=b.shooter,a=b.action,t=clamp((this.time-b.started)/a.duration,0,1),pose=dunkSample(a.style,t,a.hand);
   const local=[...pose.ball];local[1]+=p.air/p.definition.scale;
   const worldPoint=this.rootPoint(p,local);b.pos.copy(t<.16?b.gripFrom.clone().lerp(worldPoint,smooth(0,.16,t)):worldPoint);
   if(t>.49){const rim=new T.Vector3(this.hoop(p.team).x,3.38-.42*smooth(.57,.655,t),0);b.pos.lerp(rim,smooth(.49,.62,t));}
   if(this.checkBlock(b)){this.ballMesh.position.copy(this.ball.pos);return;}
   if(t>=a.release){
    if(b.success)this.addScore(p,2,true,b.previousPass);
    else{a.interrupted=true;this.makeLoose(b.pos,new T.Vector3(-this.attackSign(p.team)*2.1,1.8,(Math.random()-.5)*1.7),p.team,true);this.arena?.impact?.(p.team,true);this.courtSound('rim');this.notice('НЕ ЗАВЕРШИЛ',b.info.pressure,.9);}
   }
  }else if(b.mode==='pass'){
   b.elapsed+=dt;const t=Math.min(1,b.elapsed/b.duration);b.pos.copy(b.start).lerp(b.target,t);b.pos.y+=Math.sin(t*Math.PI)*.12;
   if(t>.14&&t<.96)for(const p of this.players){if(p.team!==b.from.team&&distance(p,b.pos)<.55&&!b.attempted.includes(p.index)){
    b.attempted.push(p.index);const chance=clamp(.23+this.stat(p,'defense')*.004-(p.stunUntil>this.time?.25:0),.1,.64);
    if(Math.random()<chance){this.giveBall(p);this.ball.previousPass=null;p.stats.steals++;p.energy=Math.min(100,p.energy+16);this.defensiveReward(p);this.notice('ПЕРЕХВАТ',p.definition.name,.9);this.courtSound('catch');break;}
   }}
   if(this.ball.mode==='pass'&&t>=1){if(distance(b.to,b.target)<1.3){this.giveBall(b.to,false);b.to.catchUntil=this.time+1.05;this.courtSound('catch');}else this.makeLoose(b.pos,new T.Vector3(0,.3,0),b.from.team,false);}
  }else if(b.mode==='shot'){
   b.elapsed+=dt;const point=ballisticPoint(b.start,b.target,b.duration,b.elapsed);b.pos.set(point.x,point.y,point.z);
   if(this.checkBlock(b)){this.ballMesh.position.copy(this.ball.pos);return;}
   if(b.elapsed>=b.duration){if(b.success)this.addScore(b.shooter,b.points,false,b.previousPass);else{
    this.makeLoose(b.pos,new T.Vector3(-this.attackSign(b.shooter.team)*(1.1+Math.random()*1.4),1.3,(Math.random()-.5)*2.9),b.shooter.team,true);this.arena?.impact?.(b.shooter.team,false);this.courtSound('rim');
   }}
  }else if(b.mode==='scored'){
   b.elapsed+=dt;b.pos.y=Math.max(.13,b.rimY-1.9*b.elapsed-4.9*b.elapsed*b.elapsed);if(b.elapsed>.62)this.inbound(1-b.scoringTeam);
  }else if(b.mode==='loose'){
   b.velocity.y-=9.8*dt;b.pos.addScaledVector(b.velocity,dt);
   if(b.pos.y<.125){b.pos.y=.125;if(Math.abs(b.velocity.y)>1.2)this.courtSound('bounce');b.velocity.y=Math.abs(b.velocity.y)*.56;b.velocity.x*=.83;b.velocity.z*=.83;}
   if(Math.abs(b.pos.x)>9.35){b.pos.x=clamp(b.pos.x,-9.35,9.35);b.velocity.x*=-.60;}if(Math.abs(b.pos.z)>5.14){b.pos.z=clamp(b.pos.z,-5.14,5.14);b.velocity.z*=-.60;}
   const candidates=this.players.filter(p=>!p.action&&distance(p,b.pos)<(p.superUntil>this.time&&p.definition.super.id==='anchor'?1.16:.63)&&b.pos.y<1.72*p.definition.scale+p.air);
   if(candidates.length){candidates.sort((a,c)=>(distance(a,b.pos)-a.air*.18)-(distance(c,b.pos)-c.air*.18));const p=candidates[0],sameTeam=p.team===b.lastTeam,rim=b.rim;
    this.giveBall(p);if(rim&&sameTeam)this.shotClock=14;this.ball.previousPass=null;p.stats.rebounds++;p.reboundUntil=sameTeam?this.time+3:0;p.energy=Math.min(100,p.energy+7);this.courtSound('catch');if(p===this.user)this.notice('ПОДБОР','',.55);
   }
  }
  this.ballMesh.position.copy(this.ball.pos);this.ballMesh.rotation.z+=dt*(this.ball.mode==='shot'?-7:4);this.arena?.update?.(dt);
 }
 localBall(p,pos){return pos.clone().sub(new T.Vector3(p.x,0,p.z)).applyAxisAngle(new T.Vector3(0,1,0),-p.mesh.rotation.y).divideScalar(p.definition.scale).toArray();}
 courtSound(kind){
  if(!this.soundOn||!this.audio||this.audio.state!=='running')return;
  const now=this.audio.currentTime;if(kind==='bounce'&&now-(this.lastBounceAudio??-1)<.10)return;if(kind==='bounce')this.lastBounceAudio=now;
  try{
   const ctx=this.audio,volume=kind==='dunk'?.10:kind==='bounce'?.038:kind==='rim'?.045:.017,length=kind==='dunk'?.23:kind==='swish'?.23:.10;
   if(!this.noise){this.noise=ctx.createBuffer(1,ctx.sampleRate*.35,ctx.sampleRate);const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;}
   const noise=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();noise.buffer=this.noise;filter.type='bandpass';filter.frequency.value=kind==='swish'?2500:kind==='rim'?680:kind==='bounce'?230:1200;filter.Q.value=kind==='rim'?5:.8;
   gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.0001,now+length);noise.connect(filter);filter.connect(gain);gain.connect(ctx.destination);noise.start(now);noise.stop(now+length);
   if(kind==='bounce'||kind==='dunk'){const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.setValueAtTime(kind==='dunk'?100:155,now);o.frequency.exponentialRampToValueAtTime(55,now+.1);g.gain.setValueAtTime(volume,now);g.gain.exponentialRampToValueAtTime(.0001,now+.14);o.connect(g);g.connect(ctx.destination);o.start(now);o.stop(now+.15);}
  }catch{}
 }
 makeLoose(pos,velocity,lastTeam,rim=false){this.ball={mode:'loose',owner:null,pos:pos.clone(),velocity,lastTeam,rim,previousPass:null};}
 addScore(p,points,dunk,pass){
  this.score[p.team]+=points;p.stats.points+=points;p.stats.made++;if(points===3)p.stats.threesMade++;if(dunk)p.stats.dunks=(p.stats.dunks||0)+1;p.energy=Math.min(100,p.energy+15);
  if(pass&&pass.to===p&&this.time-pass.time<4){pass.from.stats.assists++;pass.from.energy=Math.min(100,pass.from.energy+14);}
  this.notice('+'+points+'  '+p.definition.name,dunk?DUNK_NAMES[p.action?.style]||'ДАНК':points===3?'ТРЁХОЧКОВЫЙ':'',1.1);this.arena?.impact?.(p.team,dunk);this.courtSound(dunk?'dunk':'swish');
  if(this.overtime||this.targetScore&&this.score[p.team]>=this.targetScore||this.clock<=0&&this.score[0]!==this.score[1]){this.updateUI();this.end();return;}
  this.ball={mode:'scored',owner:null,pos:new T.Vector3(this.hoop(p.team).x,3.02,0),rimY:3.02,elapsed:0,scoringTeam:p.team};this.cancelCharge();
 }
 plantedFeet(p){
  const speed=speedOf(p),scale=p.definition.scale;
  if(speed<.15||p.air>.06||p.action&&['jumper','dunk','layup'].includes(p.action.kind)){p.footPlants=null;return null;}
  const turn=p.mesh.rotation.y,cycleTime=Math.PI*2/(speed*(4.9-.4*Math.min(4.5,speed))),spread=(this.possession!==p.team?.16:.125)*scale;
  p.footPlants??=[null,null];const result=[];
  for(let i=0;i<2;i++){
   const sign=i===0?-1:1,phase=((p.gait+i*Math.PI)%(Math.PI*2))/(Math.PI*2),stance=phase<.47;
   const sideX=Math.cos(turn)*sign*spread,sideZ=-Math.sin(turn)*sign*spread;
   let foot=p.footPlants[i];
   if(!foot){foot={stance,plant:new T.Vector3(p.x+sideX+p.vx*cycleTime*.21,.034*scale,p.z+sideZ+p.vz*cycleTime*.21),from:null};p.footPlants[i]=foot;}
   if(stance&&!foot.stance){foot.plant=foot.last.clone();foot.plant.y=.034*scale;}
   let position;
   if(stance)position=foot.plant.clone();else{
    if(foot.stance||!foot.from)foot.from=foot.plant.clone();const t=(phase-.47)/.53;
    const remaining=cycleTime*(1-phase+.21),target=new T.Vector3(p.x+sideX+p.vx*remaining,.034*scale,p.z+sideZ+p.vz*remaining);
    position=foot.from.clone().lerp(target,smooth(0,1,t));position.y+=Math.sin(t*Math.PI)*(.12+Math.min(1,speed/4.7)*.065)*scale;
   }
   foot.stance=stance;foot.last=position;result.push(this.localBall(p,position));
  }return result;
 }
 animatePlayers(dt){
  for(const p of this.players){
   const a=p.action,b=this.ball,own=b.owner===p,defending=this.possession!==p.team,angle=p.mesh.rotation.y,vx=p.vx,vz=p.vz,speed=speedOf(p),forward=speed>.1?(Math.sin(angle)*vx+Math.cos(angle)*vz)/speed:1,sideways=speed>.1?(Math.cos(angle)*vx-Math.sin(angle)*vz)/speed:0;
   const state={screen:p.screenSet,feetLocal:this.plantedFeet(p),time:this.time,gait:p.gait||0,speed,air:p.air/p.definition.scale,own,defending,forward,sideways,hand:p.hand||1,lean:sideways,dribble:own&&b.mode==='held'?p.dribbleVisual:null};
   if(own&&b.mode==='held'&&p.heldLocal){state.ballLocal=p.heldLocal;state.crouch=.04;}
   if(b.shooter===p&&['gather','dunk'].includes(b.mode)||b.from===p&&b.mode==='passGather'){state.ballLocal=this.localBall(p,b.pos);state.oneHand=b.mode==='dunk'?a.style!=='two':a?.kind==='layup';state.hand=a?.hand||p.hand;state.overhead=b.mode==='dunk';}
   if(a){const age=this.time-a.start,t=age/a.duration;
    if(a.kind==='dunk'){state.overhead=true;state.crouch=a.pose?.crouch||0;state.speed=t<.18?2.6:0;
     if(!a.interrupted&&t>=a.release&&t<.75){const h=this.hoop(p.team);state.ballLocal=this.localBall(p,new T.Vector3(h.x,3.12,0));state.oneHand=a.style!=='two';state.hand=a.hand;}
    }else if(a.kind==='jumper'||a.kind==='layup'){state.crouch=age<.10?.09*(1-age/.10):0;if(age>a.release){state.followThrough=1-smooth(a.release+.10,a.duration,age);}}
    else if(a.kind==='pass'&&b.from===p&&b.mode==='pass'&&age<.32){state.ballLocal=[0,1.3,.49];}
   }
   if(p.blockUntil>this.time)state.block=true;if(p.label){const play=this.screenPlays?.[p.team],call=play?.screener===p.index?(play.phase==='set'?' · ЗАСЛОН':play.phase==='roll'?' · ОТКРЫВАЕТСЯ':''):'';p.label.textContent=(p===this.user?(this.heroTitle?'♛ ':'▴ '):'')+p.definition.name+call;}
   p.mesh.position.set(p.x,0,p.z);poseCharacter(p.mesh,state);
   const active=p.superUntil>this.time;p.mesh.userData.ring.visible=p===this.user;p.mesh.userData.ring.material.color.set(active?0xe4c47c:0xf2ede1);p.mesh.userData.ring.scale.setScalar(1.03);
  }
  this.referee.position.x+=(clamp(this.ball.pos.x*.33,-4,4)-this.referee.position.x)*(1-Math.exp(-dt*1.4));this.referee.rotation.y=Math.atan2(this.ball.pos.x-this.referee.position.x,this.ball.pos.z-this.referee.position.z);animateCharacter(this.referee,this.time,.03,0,0,false);
 }
 updateUI(){
  $('round-label').textContent=this.matchMode==='crown'?`${this.matchRound+1}/3 · ДО 7`:'МАТЧ';$('active-title').textContent=this.heroTitle||'';
  $('score-home').textContent=this.score[0];$('score-away').textContent=this.score[1];const seconds=Math.ceil(this.clock);
  $('clock').textContent=this.overtime?'ОТ':Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');$('shot-clock').textContent=Math.max(0,Math.ceil(this.shotClock));
  $('stamina').style.width=this.user.stamina+'%';const owner=this.ball.owner,own=owner?.team===0;
  $('pass-label').textContent=owner===this.user?'ПАС':own?'ПРОСИТЬ':'ПЕРЕХВАТ';$('shoot-label').textContent=owner===this.user?(this.shotInfo(this.user).kind==='dunk'?'ДАНК':this.shotInfo(this.user).kind==='layup'?'ПРОХОД':'БРОСОК'):own?'ПРЫЖОК':'БЛОК';$('crossover').disabled=owner!==this.user||this.ball.mode!=='held'||this.user.crossReady>this.time;
  const active=this.user.superUntil>this.time;$('super').classList.toggle('ready',this.user.energy>=99.9);$('super').classList.toggle('active',active);
  $('super-percent').textContent=active?Math.ceil(this.user.superUntil-this.time)+'с':Math.floor(this.user.energy)+'%';$('super').setAttribute('aria-label','Суперприём '+this.user.definition.super.name+', '+Math.floor(this.user.energy)+' процентов');
  const cooldown=Math.max(0,this.user.burstReady-this.time);$('dash-label').textContent=cooldown>0?cooldown.toFixed(1)+'с':'РЫВОК';$('dash').classList.toggle('cooldown',cooldown>0||this.user.stamina<18);
  const play=this.screenPlays?.[0],screenWait=Math.max(0,(this.screenReady?.[0]||0)-this.time);$('screen-label').textContent=play?'РОЗЫГРЫШ':screenWait>0?Math.ceil(screenWait)+'с':'ЗАСЛОН';$('screen').disabled=owner!==this.user||this.ball.mode!=='held'||screenWait>0;
  $('play-advice').textContent=play?(play.phase==='approach'?'Напарник идёт на заслон':play.phase==='set'?'Обойди напарника с мячом':'Напарник открывается к кольцу · ищи пас'):'';
  if(owner===this.user){const info=this.shotInfo(this.user,this.getCharge(),Math.max(speedOf(this.user)/4.5,this.chargeMovement*.7));
   $('shot-advice').textContent=info.kind==='dunk'?'ДАНК · удержи и отпусти бросок':info.distance>8?'Подойди к кольцу':speedOf(this.user)>1?'Остановись для точного броска':info.pressure==='Свободно'?'Свободно · атака вправо →':info.pressure+' · найди пространство';
   $('green-zone').style.left=(info.center-info.greenWidth)*100+'%';$('green-zone').style.width=info.greenWidth*200+'%';
  }else $('shot-advice').textContent=own?'Откройся и попроси пас':'Встань между соперником и кольцом';
  if(this.chargeStart!==null){$('charge-marker').style.left=this.getCharge()*98+'%';if(owner!==this.user)this.cancelCharge();}
  if(this.feedbackUntil<this.time)$('shot-feedback').textContent='';
 }
 render(){
  this.renderer.render(this.scene,this.camera);const w=this.canvas.clientWidth,h=this.canvas.clientHeight,placed=[];
  for(const p of this.players){const pos=new T.Vector3(p.x,.03,p.z+.40).project(this.camera),x=(pos.x*.5+.5)*w,half=p.definition.name.length*2.7+10;let y=(-pos.y*.5+.5)*h;
   for(let tries=0;tries<5;tries++){if(!placed.some(q=>Math.abs(x-q.x)<half+q.half&&Math.abs(y-q.y)<17))break;y+=17;}
   placed.push({x,y,half});p.label.style.left=x+'px';p.label.style.top=y+'px';p.label.style.opacity=p===this.user||p===this.ball.owner?'1':'.55';p.label.style.display=pos.z>1||Math.abs(pos.x)>1.1||Math.abs(pos.y)>1.1?'none':'';
  }
 }
 setPaused(value){this.paused=value;this.input={x:0,z:0};this.keys.clear();this.cancelCharge();$('stick').style.transform='';this.lastFrame=performance.now();}
 stop(){this.running=false;cancelAnimationFrame(this.raf);this.keys.clear();this.cancelCharge();}
 end(){
  if(!this.running)return;const result={completed:(this.clock<=0||this.targetScore&&Math.max(...this.score)>=this.targetScore)&&this.score[0]!==this.score[1],mode:this.matchMode||'quick',round:this.matchRound||0,matchId:this.matchId,won:this.score[0]>this.score[1],score:[...this.score],
   players:this.players.map(p=>({name:p.definition.name,id:p.definition.id,team:p.team,...p.stats})),user:{...this.user.stats},hero:this.user.definition.id};
  this.stop();this.callbacks.onEnd?.(result);
 }
 installControls(){
  const on=(target,type,fn,opts)=>{target.addEventListener(type,fn,opts);this.disposers.push(()=>target.removeEventListener(type,fn,opts));};let stickPointer=null,shootPointer=null;
  const moveStick=e=>{if(e.pointerId!==stickPointer)return;const r=$('joystick').getBoundingClientRect();const delta=logicalStickDelta(e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2,!!this.display?.rotated);let dx=delta.x,dz=delta.z,length=Math.hypot(dx,dz),limit=r.width*.34;
   if(length>limit){dx*=limit/length;dz*=limit/length;}this.input={x:dx/limit,z:dz/limit};$('stick').style.transform=`translate(${dx}px,${dz}px)`;};
  on($('joystick'),'pointerdown',e=>{e.preventDefault();this.unlockAudio();if(stickPointer!==null)return;stickPointer=e.pointerId;$('joystick').setPointerCapture(e.pointerId);moveStick(e);});on($('joystick'),'pointermove',moveStick);
  const releaseStick=e=>{if(e.pointerId!==stickPointer)return;stickPointer=null;this.input={x:0,z:0};$('stick').style.transform='';};on($('joystick'),'pointerup',releaseStick);on($('joystick'),'pointercancel',releaseStick);on($('joystick'),'lostpointercapture',releaseStick);
  on($('shoot'),'pointerdown',e=>{e.preventDefault();if(shootPointer!==null)return;shootPointer=e.pointerId;this.unlockAudio();$('shoot').setPointerCapture(e.pointerId);this.pressShoot();});
  on($('shoot'),'pointerup',e=>{if(e.pointerId!==shootPointer)return;e.preventDefault();shootPointer=null;this.releaseShoot();});
  const cancelShoot=e=>{if(e.pointerId!==shootPointer)return;shootPointer=null;this.cancelCharge();};on($('shoot'),'pointercancel',cancelShoot);on($('shoot'),'lostpointercapture',cancelShoot);
  for(const [id,action]of [['pass',()=>this.pressPass()],['super',()=>this.activateSuper()],['dash',()=>this.burst()],['crossover',()=>this.crossover()],['screen',()=>this.callScreen()]]){on($(id),'pointerdown',e=>{e.preventDefault();this.unlockAudio();action();});on($(id),'click',e=>{if(e.detail===0)action();});}
  const cameraChange=()=>{this.cameraMode=this.cameraMode==='close'?'wide':'close';$('camera-mode').textContent=this.cameraMode==='close'?'БЛИЗКО':'ОБЗОР';this.updateCamera(1,true);};on($('camera-mode'),'click',cameraChange);
  on(window,'keydown',e=>{if(!this.running||e.target.closest('dialog'))return;
   if(['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyW','KeyA','KeyS','KeyD','KeyE','KeyQ','ShiftLeft','ShiftRight','KeyC','KeyF','KeyG','KeyR'].includes(e.code))e.preventDefault();
   if(e.repeat)return;this.keys.add(e.code);if(e.code==='Space')this.pressShoot();if(e.code==='KeyE')this.pressPass();if(e.code==='KeyQ')this.activateSuper();if(e.code.startsWith('Shift'))this.burst();if(e.code==='KeyC')cameraChange();if(e.code==='KeyF')this.crossover();if(e.code==='KeyG')this.callScreen();if(e.code==='KeyR')this.display.toggle();if(e.code==='Escape')this.callbacks.onPause?.();
  });
  on(window,'keyup',e=>{this.keys.delete(e.code);if(e.code==='Space')this.releaseShoot();});
  on(window,'blur',()=>{this.keys.clear();this.input={x:0,z:0};if(this.running&&!this.paused)this.callbacks.onPause?.();});
  on(document,'visibilitychange',()=>{if(document.hidden&&this.running&&!this.paused)this.callbacks.onPause?.();});
  on($('portrait-continue'),'click',()=>this.display.portrait());on($('landscape-start'),'click',()=>this.display.landscape());on($('rotate-screen'),'click',()=>this.display.toggle());
  on($('sound'),'click',()=>{this.soundOn=!this.soundOn;$('sound').setAttribute('aria-pressed',String(this.soundOn));$('sound').setAttribute('aria-label',this.soundOn?'Выключить звук':'Включить звук');$('sound').textContent=this.soundOn?'♪':'×♪';});
  on(this.canvas,'webglcontextlost',e=>{e.preventDefault();this.setPaused(true);this.callbacks.onError?.('Браузер освободил графическую память. Обнови страницу, чтобы продолжить игру.');});
 }
}
