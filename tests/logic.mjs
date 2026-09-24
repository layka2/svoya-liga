import assert from 'node:assert/strict';
import {CourtGame} from '../src/game.js';
import {PLAYERS} from '../src/roster.js';
import * as T from '../vendor/three.module.min.js';
const nodes=new Map();
const node=()=>({textContent:'',style:{},classList:{add(){},remove(){},toggle(){}},replaceChildren(){},append(){},setAttribute(){}});
globalThis.document={getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createTextNode:node,createElement:node};globalThis.cancelAnimationFrame=()=>{};
function mesh(){const m=new T.Group();m.userData={body:new T.Group(),head:new T.Group(),elbows:[new T.Group(),new T.Group()],knees:[new T.Group(),new T.Group()],arms:[new T.Group(),new T.Group()],legs:[new T.Group(),new T.Group()],ring:{material:{color:new T.Color()},scale:new T.Vector3()},shadow:{material:{opacity:.2},scale:new T.Vector3()}};return m;}
function createMatch(ids=[0,2,1,3]){let g=Object.create(CourtGame.prototype);Object.assign(g,{time:0,score:[0,0],clock:180,shotClock:24,paused:false,running:true,orientationBlocked:false,overtime:false,input:{x:0,z:0},keys:new Set(),chargeStart:null,inboundUntil:0,noticeTimer:0,soundOn:false,callbacks:{onEnd(r){g.result=r;}},referee:mesh(),ballMesh:new T.Group(),players:[],possession:0});
 g.players=ids.map((n,i)=>({definition:PLAYERS[n],team:i<2?0:1,index:i,x:0,z:0,vx:0,vz:0,energy:35,stamina:100,superUntil:0,stealUntil:0,blockUntil:0,shootUntil:0,passUntil:0,air:0,think:.3,holdTime:0,stats:{points:0,assists:0,steals:0,shots:0,made:0},mesh:mesh()}));g.user=g.players[0];g.ball={mode:'held',owner:g.user,pos:new T.Vector3(),previousPass:null};g.resetPositions(0);return g;}
const originalRandom=Math.random;
try{
 let g=createMatch();Math.random=()=>.001;g.user.x=4;g.user.z=0;g.players[2].x=-8;g.players[3].x=-8;assert(g.shoot(g.user,.76));for(let i=0;i<130&&g.score[0]===0;i++){g.time+=1/60;g.updateBall(1/60);}assert.equal(g.score[0],2);assert.equal(g.ball.owner.team,1);console.log('PASS: two-point basket, score, change of possession.');
 g=createMatch();g.user.x=0;g.user.z=0;g.players[2].x=-8;g.players[3].x=-8;g.shoot(g.user,.76);for(let i=0;i<130&&g.score[0]===0;i++){g.time+=1/60;g.updateBall(1/60);}assert.equal(g.score[0],3);console.log('PASS: distant basket counts three points.');
 g=createMatch();const player=g.user;g.players[2].x=8;g.players[3].x=8;assert(g.passBall(player,g.players[1]));for(let i=0;i<60&&g.ball.mode==='pass';i++){g.time+=1/60;g.updateBall(1/60);}assert.equal(g.ball.owner,g.players[1]);assert.equal(g.user,player);g.pressPass();for(let i=0;i<60&&g.ball.mode==='pass';i++){g.time+=1/60;g.updateBall(1/60);}assert.equal(g.ball.owner,player);assert.equal(g.user,player);console.log('PASS: pass and request pass retain the same controlled hero.');
 for(let n=0;n<6;n++){g=createMatch([n,(n+1)%6,(n+2)%6,(n+3)%6]);g.user.energy=100;assert(g.activateSuper());assert.equal(g.user.energy,0);assert(g.user.superUntil>g.time);assert(!g.activateSuper());}console.log('PASS: all six supers activate and consume energy.');
 g=createMatch();g.shotClock=.01;g.update(.02);assert.equal(g.ball.owner.team,1);assert.equal(g.shotClock,24);console.log('PASS: shot clock violation changes possession.');
 g=createMatch();g.clock=0;g.score=[2,2];g.update(.02);assert(g.overtime);g.addScore(g.user,2,false,null);assert(g.result.won);assert.deepEqual(g.result.score,[4,2]);console.log('PASS: tied match enters sudden death and resolves.');
 let seed=624;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 g=createMatch();for(let i=0;i<13500&&g.running;i++){if(g.time>=g.inboundUntil)g.ai(g.user,1/60);g.update(1/60);for(const p of g.players){assert(Number.isFinite(p.x)&&Number.isFinite(p.z));assert(Math.abs(p.x)<=9.08&&Math.abs(p.z)<=4.98);}assert(Number.isFinite(g.ball.pos.y));}
 console.log('Simulation',g.score,g.time,g.players.map(p=>({name:p.definition.name,...p.stats})));assert(g.result,'Match should end');assert(g.score[0]+g.score[1]>0,'Bots should score');assert(g.players.every(p=>p.stats.shots>0),'Every bot participates');console.log('PASS: full simulated match',JSON.stringify({score:g.score,time:g.time,shots:g.players.map(p=>p.stats.shots)}));
}finally{Math.random=originalRandom;}
