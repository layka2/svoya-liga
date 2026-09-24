// Shared motion clocks: the body, palm and ball sample the same phase.
export const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
export const mix=(a,b,t)=>a+(b-a)*t;
export const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const keyframe=(frames,t)=>{
 let i=1;while(i<frames.length-1&&t>frames[i][0])i++;
 const a=frames[i-1],b=frames[i],f=smooth(a[0],b[0],t);return a.slice(1).map((v,k)=>mix(v,b[k+1],f));
};
export const DUNK_NAMES={two:'ДВУМЯ РУКАМИ',one:'ОДНОЙ РУКОЙ',reverse:'ОБРАТНЫЙ ДАНК',tomahawk:'ТОМАГАВК'};
export function chooseDunk({rating,speed=0,side=0,pressure=0}){
 if(rating>=84&&Math.abs(side)>.95&&speed>.8)return 'reverse';
 if(rating>=90&&speed>2.3&&pressure<.42)return 'tomahawk';
 if(speed>1.05&&pressure<.65)return 'one';
 return 'two';
}
export function dribbleSample(clock,speed=0,hand=1,cross=null){
 const phase=((clock%1)+1)%1,running=clamp(speed/4.7),high=1.02-running*.13,low=.132;
 const u=phase<.5?phase*2:(phase-.5)*2;
 let y=phase<.5?high-(high-low)*u*u:low+(high-low)*(2*u-u*u);
 let x=hand*(.31+running*.025),z=.23+running*.16,palmY;
 const contact=phase<.20||phase>.84;
 palmY=contact?y+.115:.85+running*.02+Math.sin(phase*Math.PI)*.04;
 if(cross){const t=clamp(cross.t),f=smooth(0,1,t);x=mix(cross.from*.34,-cross.from*.34,f);z=.36;y=.135+.72*Math.pow(Math.abs(2*t-1),.7);palmY=Math.max(.76,y+.105);hand=t<.52?cross.from:-cross.from;}
 return {phase,hand,ball:[x,y,z],palm:[x,palmY,z+.008],contact,cross:!!cross,hip:Math.sin(phase*Math.PI*2)*.018};
}
export function dunkSample(style,t,hand=1){
 const base=[[0,hand*.18,1.03,.30],[.18,hand*.19,.98,.35],[.42,hand*.18,1.74,.34],[.55,hand*.10,2.00,.30],[.66,0,1.90,.34],[1,hand*.22,1.0,.25]];
 let frames=base;
 if(style==='two')frames=base.map(([t,x,y,z])=>[t,0,y,z]);
 if(style==='tomahawk')frames=[[0,hand*.27,1.02,.28],[.18,hand*.28,.96,.30],[.40,hand*.25,1.74,-.22],[.53,hand*.20,2.03,-.14],[.63,hand*.12,1.96,.36],[1,hand*.20,1.0,.28]];
 if(style==='reverse')frames=[[0,hand*.22,1.03,.28],[.19,hand*.20,1.10,.18],[.40,hand*.18,1.76,-.20],[.55,hand*.10,1.98,-.27],[.65,0,1.89,-.35],[1,hand*.20,1.0,.20]];
 const lift=smooth(.18,.51,t)*(1-smooth(.68,.97,t));
 const crouch=.19*Math.sin(clamp(t/.18)*Math.PI)*(t<.18?1:0)+.11*Math.sin(clamp((t-.89)/.11)*Math.PI)*(t>.89?1:0);
 return {ball:keyframe(frames,t),lift,crouch,travel:smooth(0,.61,t),turn:style==='reverse'?Math.PI*smooth(.22,.53,t):0,hang:t>.63&&t<.72,two:style==='two',t};
}
// A real parabola rather than a sine-shaped arc: gravity is constant in flight.
export function ballisticPoint(start,target,duration,elapsed,gravity=9.8){
 const t=clamp(elapsed,0,duration),f=t/duration,vy=(target.y-start.y+.5*gravity*duration*duration)/duration;
 return {x:mix(start.x,target.x,f),y:start.y+vy*t-.5*gravity*t*t,z:mix(start.z,target.z,f)};
}
export function logicalStickDelta(dx,dy,rotated){return rotated?{x:dy,z:-dx}:{x:dx,z:dy};}
