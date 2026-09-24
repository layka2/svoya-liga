import assert from 'node:assert/strict';
import {CourtGame} from '../src/game.js';
import {byId,PLAYERS} from '../src/roster.js';
import {chooseDunk,dribbleSample,dunkSample,ballisticPoint,logicalStickDelta} from '../src/motion.js';
import {shotProfile,botRelease} from '../src/mechanics.js';
import {PROGRESS_KEY,readProgress,writeProgress,isUnlocked,recordResult,normalizeProgress} from '../src/progression.js';
import * as T from '../vendor/three.module.min.js';
const nodes=new Map(),node=()=>({textContent:'',style:{},dataset:{},classList:{add(){},remove(){},toggle(){}},replaceChildren(){},append(){},setAttribute(){}});
globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createTextNode:node,createElement:node};globalThis.cancelAnimationFrame=()=>{};
function mesh(){const m=new T.Group();m.userData={body:new T.Group(),head:new T.Group(),elbows:[new T.Group(),new T.Group()],knees:[new T.Group(),new T.Group()],arms:[new T.Group(),new T.Group()],legs:[new T.Group(),new T.Group()],ring:{material:{color:new T.Color()},scale:new T.Vector3()},shadow:{material:{opacity:.2},scale:new T.Vector3()}};return m;}
function createMatch(ids=['piniv','mate','aziom','guest']){
 let g=Object.create(CourtGame.prototype);Object.assign(g,{time:0,score:[0,0],clock:180,shotClock:24,paused:false,running:true,orientationBlocked:false,overtime:false,input:{x:0,z:0},keys:new Set(),chargeStart:null,chargeMovement:0,inboundUntil:0,noticeTimer:0,feedbackUntil:0,soundOn:false,matchId:'test',callbacks:{onEnd(r){g.result=r;}},referee:mesh(),ballMesh:new T.Group(),players:[],possession:0});
 g.players=ids.map((id,i)=>({definition:byId(id),team:i<2?0:1,index:i,x:0,z:0,vx:0,vz:0,energy:0,stamina:100,hand:1,dribbleClock:0,cross:null,crossReady:0,action:null,approachSpeed:0,approachAt:-10,cutUntil:0,superUntil:0,stealUntil:0,blockUntil:0,blockReady:0,shootUntil:0,passUntil:0,stunUntil:0,burstUntil:0,burstReady:0,fakeUntil:0,fakeReady:0,catchUntil:0,protectedUntil:0,air:0,think:.15+i*.08,holdTime:0,settled:1,gait:i*.7,aiShot:null,reactionAt:0,stats:{points:0,assists:0,steals:0,blocks:0,rebounds:0,shots:0,made:0,threes:0,threesMade:0},mesh:mesh()}));g.user=g.players[0];g.ball={mode:'held',owner:g.user,pos:new T.Vector3(),previousPass:null};g.resetPositions(0);return g;
}
function seedRandom(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const originalRandom=Math.random;
// Stationary dribble must still animate; motion and grip share the same phase.
const idleA=dribbleSample(0,0),idleB=dribbleSample(.18,0);assert.notEqual(idleA.ball[1],idleB.ball[1]);assert.notEqual(idleA.palm[1],idleB.palm[1]);
for(let i=0;i<100;i++){const d=dribbleSample(i/100,3.5);assert(d.ball[1]>=.125);if(d.contact)assert(Math.abs(d.palm[1]-d.ball[1]-.115)<1e-6);}
assert.equal(chooseDunk({rating:75,speed:0}),'two');assert.equal(chooseDunk({rating:80,speed:2}),'one');assert.equal(chooseDunk({rating:95,speed:3}),'tomahawk');assert.equal(chooseDunk({rating:95,speed:2,side:1.2}),'reverse');
assert(dunkSample('tomahawk',.40).ball[2]<0);assert(dunkSample('reverse',.6).turn>3);assert.equal(dunkSample('two',1).lift,0);
const start={x:0,y:2.2,z:0},target={x:6,y:3.05,z:0};assert.deepEqual(ballisticPoint(start,target,1.3,0),start);assert(Math.abs(ballisticPoint(start,target,1.3,1.3).y-3.05)<1e-10);assert(ballisticPoint(start,target,1.3,.65).y>3.5);
assert.deepEqual(logicalStickDelta(0,30,true),{x:30,z:-0});assert.deepEqual(logicalStickDelta(-30,0,true),{x:0,z:30});console.log('PASS synchronized idle dribble, four dunk styles, real ball trajectory and rotated controls');

try{
 const base={rating:96,distance:6.5,kind:'three',timing:.72},best=shotProfile(base);
 assert(best.chance<.6&&best.chance>.45);assert(shotProfile({...base,rating:34}).chance<best.chance*.6);
 for(const penalty of [{timing:.22},{timing:1},{movement:1},{contest:.8},{stamina:10},{distance:10}])assert(shotProfile({...base,...penalty}).chance<best.chance*.8);
 assert(shotProfile({...base,boost:.11}).chance<=.68);assert(shotProfile({...base,timing:.22,boost:.11}).chance<.04);
 assert(shotProfile({...base,contest:1}).greenWidth<best.greenWidth);
 console.log('PASS timing, range, movement, fatigue, contest, rating and super caps');
 const rng=seedRandom(71),timings=Array.from({length:300},()=>botRelease(80,rng));assert(Math.min(...timings)<.55&&Math.max(...timings)>.9);
 // Mirrored positions and identical rating give either team exactly the same odds.
 let g=createMatch(['kempil','mate','kempil','guest']);g.players[0].x=2;g.players[0].z=0;g.players[2].x=-2;g.players[2].z=0;g.players[1].z=g.players[3].z=4;
 assert.equal(g.shotInfo(g.players[0]).chance,g.shotInfo(g.players[2]).chance);
 Math.random=seedRandom(21);let made=0;for(let i=0;i<400;i++){g.giveBall(g.user);g.user.shootUntil=0;g.user.stamina=100;g.shoot(g.user,.72);made+=Number(g.ball.success);}assert(made>150&&made<270);console.log('PASS shared shooting formula and mixed makes/misses:',made,'/ 400 elite open threes');
 // Old selected hero grants no unlock; valid historical wins survive migration.
 let mem=new Map([['svoya-liga-team',JSON.stringify({selected:'laika'})]]),disk={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v)};
 let p=readProgress(disk);assert(isUnlocked('piniv',p));assert(!isUnlocked('laika',p));mem.set('svoya-liga-results',JSON.stringify({wins:6,matches:10}));p=readProgress(disk);assert.equal(p.wins,6);assert(isUnlocked('gabar',p));assert(!isUnlocked('kempil',p));assert(writeProgress(disk,p));mem.set('svoya-liga-results','{}');assert.equal(readProgress(disk).wins,6);
 p=normalizeProgress(null);assert(!recordResult(p,{completed:false,matchId:'quit',score:[10,0]}).awarded);assert(!recordResult(p,{completed:true,matchId:'tie',score:[2,2]}).awarded);
 for(let n=1;n<=15;n++){const r={completed:true,matchId:'win-'+n,score:[10,8]},next=recordResult(p,r);assert.equal(next.progress.wins,n);assert(!recordResult(next.progress,r).awarded);p=next.progress;if(n===1)assert.deepEqual(next.unlocked,['aziom']);if(n===14)assert(!isUnlocked('laika',p));if(n===15)assert.deepEqual(next.unlocked,['laika']);}
 p=recordResult(p,{completed:true,matchId:'loss',score:[4,8]}).progress;assert.equal(p.wins,15);assert.equal(p.matches,16);assert(!writeProgress({setItem(){throw Error('blocked');}},p));assert.equal(readProgress({getItem(){throw Error('blocked');}}).wins,0);console.log('PASS fresh start, migration, 15-win ladder, losses, quit and duplicate rewards');
 Math.random=()=>.001;
 g=createMatch();g.time=1;g.pressShoot();g.time+=.08;g.releaseShoot();assert.equal(g.user.stats.shots,0);assert(g.user.fakeUntil>g.time);assert(g.burst());assert(!g.burst());assert(g.user.stamina<90);g.time=5;g.user.stamina=5;assert(!g.burst());assert(!g.block(g.user));
 g=createMatch();assert(g.block(g.user));assert(!g.block(g.user));g.time=1.5;assert(g.block(g.user));g.pressShoot();g.setPaused(true);assert.equal(g.chargeStart,null);console.log('PASS pump fake, burst cost/cooldown, block cooldown and pause cancellation');
 for(const [x,points] of [[4,2],[1,3]]){
  g=createMatch();g.user.x=x;g.user.z=0;g.players[2].x=g.players[3].x=-8;g.shoot(g.user,.72);for(let i=0;i<180&&g.ball.mode!=='held';i++){g.time+=1/60;g.updateBall(1/60);}assert.equal(g.score[0],points);assert.equal(g.ball.owner.team,1);assert(g.ball.owner.protectedUntil>g.time);
 }console.log('PASS 2/3 points, ball through hoop and protected inbound');
 // The ball remains in the hands during gathering; blocks can interrupt a dunk before the rim.
 g=createMatch();g.user.x=4;g.players[2].x=g.players[3].x=-8;g.updateBall(0);g.shoot(g.user,.72);g.time=.29;g.updateBall(.29);assert.equal(g.ball.mode,'gather');assert.equal(g.ball.owner,g.user);g.time=.32;g.updateBall(.03);assert.equal(g.ball.mode,'shot');assert.equal(g.ball.owner,null);
 for(const outcome of ['make','miss','block']){
  Math.random=()=>outcome==='miss'?.999:.001;g=createMatch(['laika','mate','kempil','guest']);g.user.x=6.9;g.user.z=0;g.user.vx=3.8;g.players[2].x=g.players[3].x=-8;g.updateBall(0);assert(g.shoot(g.user,.72));assert.equal(g.ball.mode,'dunk');
  g.time=.40;g.updateBall(.40);
  if(outcome==='block'){const defender=g.players[2];defender.x=g.ball.pos.x;defender.z=g.ball.pos.z;defender.blockStart=g.time-.25;defender.blockUntil=g.time+.3;g.updateBall(0);assert.equal(g.ball.mode,'loose');assert.equal(defender.stats.blocks,1);}
  for(let i=0;i<70;i++){g.time+=1/60;g.updateBall(1/60);}
  assert.equal(g.score[0],outcome==='make'?2:0);assert.equal(g.user.stats.dunks||0,outcome==='make'?1:0);
 }
 Math.random=()=>.001;g=createMatch();g.time=1;assert(g.crossover());assert(!g.crossover());const originalHand=g.user.hand;g.update(.5);assert.equal(g.user.hand,-originalHand);assert.equal(g.user.cross,null);
 console.log('PASS gathering, dunk completion/miss/block and crossover cooldown');
 g=createMatch();g.players[2].x=g.players[3].x=8;const user=g.user;assert(g.passBall(user,g.players[1]));for(let i=0;i<60&&['passGather','pass'].includes(g.ball.mode);i++){g.time+=1/60;g.updateBall(1/60);}assert.equal(g.ball.owner,g.players[1]);g.pressPass();for(let i=0;i<60&&['passGather','pass'].includes(g.ball.mode);i++){g.time+=1/60;g.updateBall(1/60);}assert.equal(g.ball.owner,user);assert.equal(g.user,user);
 // Stay on the pass line at 240 FPS: each defender gets one chance, not 240 chances.
 g=createMatch();g.user.x=-3;g.user.z=0;g.players[1].x=3;g.players[1].z=0;g.players[2].x=0;g.players[2].z=0;g.players[3].z=4;Math.random=()=>.99;g.passBall(g.user,g.players[1]);const flight=g.ball;let randomCalls=0;Math.random=()=>{randomCalls++;return .99;};for(let i=0;i<240&&['passGather','pass'].includes(g.ball.mode);i++){g.time+=1/240;g.updateBall(1/240);}assert.equal(randomCalls,1);assert.deepEqual(flight.attempted,[2]);assert.equal(g.ball.owner,g.players[1]);
 g=createMatch();g.players[2].x=g.players[3].x=8;g.passBall(g.user,g.players[1]);g.players[1].x=8;for(let i=0;i<60&&['passGather','pass'].includes(g.ball.mode);i++){g.time+=1/60;g.updateBall(1/60);}assert.equal(g.ball.mode,'loose');console.log('PASS passing, requesting, one intercept attempt and non-homing missed catch');
 g=createMatch();g.shotClock=.01;g.update(.02);assert.equal(g.ball.owner.team,1);assert.equal(g.shotClock,24);
 g=createMatch();g.clock=0;g.score=[2,2];g.update(.02);assert(g.overtime);g.addScore(g.user,2,false,null);assert(g.result.won&&g.result.completed);assert.deepEqual(g.result.score,[4,2]);console.log('PASS shot clock and completed sudden death');
 for(const hero of PLAYERS){g=createMatch([hero.id,'mate','guest','aziom']);g.user.energy=100;assert(g.activateSuper());assert(!g.activateSuper());assert.equal(g.user.energy,0);}console.log('PASS all six super abilities');
 // Calling a screen never freezes a defender; only contact with a set screener does.
 g=createMatch();g.time=5;g.user.x=0;g.user.z=0;g.players[1].x=-1;g.players[1].z=2;g.players[2].x=1.3;g.players[2].z=0;g.players[3].x=-8;g.players[3].z=-4;
 assert(g.callScreen());assert(!g.callScreen());assert.equal(g.players[2].stunUntil,0);assert.equal(g.players[1].stats.screens||0,0);
 for(let i=0;i<270&&g.screenPlays[0]?.phase==='approach';i++){g.time+=1/60;g.updatePlays();g.ai(g.players[1],1/60);}
 let play=g.screenPlays[0],screener=g.players[1];assert.equal(play.phase,'set');g.time+=.24;screener.vx=screener.vz=0;g.updatePlays();const planted={x:screener.x,z:screener.z};
 g.players[2].x=screener.x+.30;g.players[2].z=screener.z;g.players[2].vx=-1.5;g.players[2].vz=0;g.resolveCollisions();assert.equal(screener.stats.screens,1);assert.equal(screener.x,planted.x);assert(g.players[2].stunUntil>g.time);assert(g.screenPlays[0].engaged);assert.equal(g.score[0],0);
 g.time+=.3;g.updatePlays();assert.equal(g.screenPlays[0].phase,'roll');g.giveBall(g.players[2]);assert(!g.screenPlays[0]);assert(!screener.screenSet);
 // Tactical badges apply to the allied team, require their action and keep shot ceilings.
 g=createMatch(['kempil','mate','aziom','guest']);g.time=2;g.user.x=2;g.user.z=0;g.players[2].x=g.players[3].x=-8;const normal=g.shotInfo(g.user);
 g.badges=new Set(['catch']);assert.equal(g.shotInfo(g.user).chance,normal.chance);g.user.catchUntil=3;assert(g.shotInfo(g.user).chance>normal.chance);assert(g.shotInfo(g.user).chance<=.68);assert(g.shotInfo(g.user,.1).chance<.06);assert(!g.hasBadge(g.players[2],'catch'));
 g.badges=new Set(['steady']);g.user.catchUntil=0;assert(g.shotInfo(g.user).greenWidth>normal.greenWidth);g.user.settled=0;assert.equal(g.shotInfo(g.user).greenWidth,normal.greenWidth);
 g=createMatch();g.time=2;g.badges=new Set(['rest']);g.user.stamina=50;g.move(g.user,0,0,1);assert.equal(g.user.stamina,59);
 g.badges=new Set(['defense']);g.user.stamina=50;g.user.energy=5;g.defensiveReward(g.user);assert.equal(g.user.stamina,60);assert.equal(g.user.energy,17);
 g.badges=new Set(['step']);assert(g.crossover());g.user.stamina=17;assert(g.burst());assert.equal(g.user.stamina,5);assert(Math.abs(g.user.burstUntil-g.time-.78)<1e-9);
 g=createMatch();g.time=2;g.user.x=6.5;g.user.z=0;g.players[2].x=g.players[3].x=-8;g.badges=new Set(['rebound']);const beforeRebound=g.shotInfo(g.user).chance;g.user.reboundUntil=3;assert(g.shotInfo(g.user).chance>beforeRebound);g.time=4;assert.equal(g.shotInfo(g.user).chance,beforeRebound);
 g=createMatch(['laika','mate','aziom','guest']);g.time=2;g.badges=new Set(['catch']);g.user.x=3;g.user.z=0;g.user.catchUntil=3;g.user.superUntil=9;g.shoot(g.user,.72);assert.equal(g.user.superUntil,9,'A badge must not consume a different super ability');
 g=createMatch();g.matchMode='crown';g.targetScore=7;g.clock=90;g.score=[6,4];g.addScore(g.user,2,false,null);assert(g.result.completed&&g.result.won);assert.equal(g.result.mode,'crown');assert.equal(g.clock,90);
 console.log('PASS physical screen, roll, possession cancellation, six conditional badges and score-limit victory');
 // Exercise all four AI players through complete seeded matches and real rule transitions.
 const summaries=[];
 for(const [seed,ids] of [[624,['piniv','mate','aziom','guest']],[725,['laika','gabar','kempil','demidok']],[823,['aziom','mate','demidok','guest']]]){
  Math.random=seedRandom(seed);g=createMatch(ids);const baseMove=g.move;let inside=false;
  g.move=function(p,x,z,dt){if(p===this.user&&!inside){inside=true;this.ai(p,dt);inside=false;}else baseMove.call(this,p,x,z,dt);};
  for(let i=0;i<20000&&g.running;i++){g.update(1/60);for(const p of g.players){assert(Number.isFinite(p.x)&&Number.isFinite(p.z));assert(Math.abs(p.x)<=9.08&&Math.abs(p.z)<=4.98);}assert(Number.isFinite(g.ball.pos.y));}
  const summary={seed,score:g.score,time:Math.round(g.time),players:g.players.map(p=>({id:p.definition.id,...p.stats}))};summaries.push(summary);assert(g.result?.completed,'Match must finish');assert(g.players.every(p=>p.stats.shots>0),'Every player should shoot');assert(g.players.reduce((a,p)=>a+p.stats.shots-p.stats.made,0)>5,'Misses must happen');
 }
 console.log('PASS full matches',JSON.stringify(summaries,null,2));
}finally{Math.random=originalRandom;}
