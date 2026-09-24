import * as T from '../vendor/three.module.min.js';
import {APPEARANCE} from './appearance.js?v=0.3.0';
const TAU=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a+(b-a)*t;
const gauss=(x,y,cx,cy,wx,wy)=>Math.exp(-(((x-cx)/wx)**2+((y-cy)/wy)**2));
function material(color,extra={}){return new T.MeshStandardMaterial({color,roughness:.73,...extra});}
function mesh(parent,g,m,x=0,y=0,z=0,sx=1,sy=1,sz=1){const o=new T.Mesh(g,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
function ellipsoid(parent,m,x,y,z,sx,sy,sz){return mesh(parent,new T.SphereGeometry(1,18,12),m,x,y,z,sx,sy,sz);}
function curve(parent,m,points,radius=.002,segments=18){return mesh(parent,new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),segments,radius,5,false),m);}
function interpolate(profile,y){for(let i=1;i<profile.length;i++)if(y<=profile[i][0]){const a=profile[i-1],b=profile[i],t=clamp((y-a[0])/(b[0]-a[0]),0,1),p=profile[Math.max(0,i-2)],q=profile[Math.min(profile.length-1,i+1)],span=b[0]-a[0],m0=(b[1]-p[1])/(b[0]-p[0]),m1=(q[1]-a[1])/(q[0]-a[0]);return (2*t*t*t-3*t*t+1)*a[1]+(t*t*t-2*t*t+t)*span*m0+(-2*t*t*t+3*t*t)*b[1]+(t*t*t-t*t)*span*m1;}return profile.at(-1)[1];}
function geometry(positions,indices,uv=null,colors=null){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);if(uv)g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));if(colors)g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;}
// Bake only the static children of each joint, retaining the articulated rig.
// This keeps hundreds of small sculpt details to a few material draw calls.
function batch(group){
 const batches=new Map();
 for(const child of [...group.children]){if(!child.isMesh)continue;child.updateMatrix();let g=child.geometry.clone().applyMatrix4(child.matrix);if(g.index){const next=g.toNonIndexed();g.dispose();g=next;}const k=child.material.uuid;if(!batches.has(k))batches.set(k,{material:child.material,list:[]});batches.get(k).list.push(g);group.remove(child);child.geometry.dispose();}
 for(const {material:m,list} of batches.values()){
  const count=list.reduce((n,g)=>n+g.attributes.position.count,0),p=new Float32Array(count*3),n=new Float32Array(count*3),uv=new Float32Array(count*2),col=new Float32Array(count*3).fill(1);let offset=0;
  for(const g of list){p.set(g.attributes.position.array,offset*3);n.set(g.attributes.normal.array,offset*3);if(g.attributes.uv)uv.set(g.attributes.uv.array,offset*2);if(g.attributes.color)col.set(g.attributes.color.array,offset*3);offset+=g.attributes.position.count;g.dispose();}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(p,3));g.setAttribute('normal',new T.BufferAttribute(n,3));g.setAttribute('uv',new T.BufferAttribute(uv,2));if(m.vertexColors)g.setAttribute('color',new T.BufferAttribute(col,3));mesh(group,g,m);
 }
}
function widthAt(a,y){return a.width*interpolate([[-1,.01],[-.93,a.chin*.63],[-.80,a.chin],[-.62,a.jaw],[-.33,.98],[.02,1],[.32,.97],[.61,.96],[.83,.79],[.95,.44],[1,.01]],clamp(y/a.height,-1,1));}
function faceZ(a,x,y){
 const yn=y/a.height,w=widthAt(a,y),front=interpolate([[-1,.015],[-.9,.064],[-.72,.074],[-.47,.084],[-.20,.084],[.12,.084],[.36,.078],[.63,.077],[.85,.057],[1,.005]],yn);
 const side=clamp(1-(x/w)**2,0,1);let z=front*Math.sqrt(side);
 z+=a.nose*.52*gauss(x,y,0,.004,a.noseWidth*.8,.035);
 z+=a.nose*.66*gauss(x,y,0,a.noseY,a.noseWidth,.013);
 for(const s of [-1,1]){
  z+=.005*gauss(x,y,s*a.noseWidth*.78,a.noseY-.005,a.noseWidth*.70,.008);
  z-=.010*gauss(x,y,s*a.eyeGap,a.eyeY,.027,.017);
  z+=.005*gauss(x,y,s*a.eyeGap,a.eyeY+.018,.030,.011);
  z+=a.cheek*gauss(x,y,s*a.width*.60,-.023,.026,.028);
 }
 z+=.003*gauss(x,y,0,-.056,.037,.025)+.004*gauss(x,y,0,-.108,.035,.018);
 return z;
}
function sculptHead(a,skin){
 const pos=[],idx=[],colors=[],rows=62,cols=72,base=new T.Color(a.skin),flush=new T.Color(0xc48376);
 for(let j=0;j<=rows;j++){const yn=-1+2*j/rows,y=yn*a.height,w=widthAt(a,y),back=.100*Math.sqrt(Math.max(.001,1-yn*yn));
  for(let i=0;i<=cols;i++){const angle=i/cols*TAU,c=Math.cos(angle),x=Math.sin(angle)*w;let z=c>=0?faceZ(a,x,y):c*back-.006;
   const blush=c>0?.09*(gauss(Math.abs(x),y,a.width*.63,-.03,.032,.028))+.045*gauss(x,y,0,a.noseY,.02,.03):0;
   const socket=c>0?gauss(Math.abs(x),y,a.eyeGap,a.eyeY,.023,.018):0,underNose=c>0?gauss(x,y,0,a.noseY-.014,.017,.006):0;const color=base.clone().lerp(flush,blush).multiplyScalar(1-socket*.08-underNose*.12);pos.push(x,y,z);colors.push(color.r,color.g,color.b);
  }
 }
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const n=j*(cols+1)+i;idx.push(n,n+1,n+cols+1,n+1,n+cols+2,n+cols+1);}
 return new T.Mesh(geometry(pos,idx,null,colors),skin);
}
function makeEye(head,a,s,m){
 const cx=s*a.eyeGap,cy=a.eyeY,w=a.eyeWidth*.76,h=a.eyeHeight*.78,z=faceZ(a,cx,cy)+.001;
 // Almond-shaped visible eyeball, with sculpted eyelid rims, not a white sphere.
 const p=[cx,cy,z+.0045],idx=[];const upper=[],lower=[];
 for(let i=0;i<=28;i++){const t=i/28*Math.PI*2,x=cx+Math.cos(t)*w,y=cy+Math.sin(t)*h,zz=faceZ(a,x,y)+.002;p.push(x,y,zz);if(i<28)idx.push(0,i+1,i+2);}
 mesh(head,geometry(p,idx),m.white);
 for(let i=0;i<=16;i++){const t=i/16,x=cx+(t*2-1)*w,offset=Math.sin(t*Math.PI);upper.push([x,cy+h*offset,faceZ(a,x,cy+h*offset)+.003]);lower.push([x,cy-h*.86*offset,faceZ(a,x,cy-h*.86*offset)+.003]);}
 curve(head,m.skin,upper,.0018);curve(head,m.skin,lower,.0012);curve(head,m.lid,upper.map(v=>[v[0],v[1]-.0009,v[2]+.001]),.00035);
 ellipsoid(head,m.iris,cx,cy,z+.005,.0063,.0065,.0012);ellipsoid(head,m.pupil,cx,cy,z+.006,.0026,.0029,.0008);
 ellipsoid(head,m.white,cx-.0018,cy+.0025,z+.0067,.0012,.0012,.0006);
 const brow=[];for(let i=0;i<=14;i++){const t=i/14,x=cx+(t*2-1)*w*1.11,y=cy+.018+Math.sin(t*Math.PI)*.005+(s<0?t:1-t)*.001;const zz=faceZ(a,x,y)+.002;brow.push([x,y,zz]);}
 curve(head,m.hair,brow,a.brow*.65);
 for(let i=0;i<16;i++){const t=(i+.2)/16,x=cx+(t*2-1)*w,y=cy+.019+Math.sin(t*Math.PI)*.005;curve(head,m.hair,[[x,y-.001,faceZ(a,x,y)+.003],[x+.002,y+.002,faceZ(a,x+.002,y+.002)+.002]],.0007,3);}
}
function makeMouth(head,a,m){
 const width=a.mouth,cy=-.065,smile=a.smile;
 const seam=[];
 for(let i=0;i<=26;i++){const u=-1+2*i/26,x=u*width,y=cy+smile*u*u;seam.push([x,y,faceZ(a,x,y)+.003]);}
 if(!a.open)curve(head,m.mouth,seam,.00045);
 for(const s of [-1,1]){const pos=[],idx=[];for(let j=0;j<=5;j++){const v=j/5;for(let i=0;i<=30;i++){const u=-1+2*i/30,x=u*width,weight=Math.sqrt(Math.max(0,1-u*u));const cupid=s===1?(1-.24*Math.exp(-((u/.2)**2))):.95;const y=cy+smile*u*u+s*(a.lip*cupid*weight*v+a.open*.5);pos.push(x,y,faceZ(a,x,y)+.003+Math.sin(v*Math.PI)*.0025*weight);}}
  for(let j=0;j<5;j++)for(let i=0;i<30;i++){const n=j*31+i;idx.push(n,n+1,n+31,n+1,n+32,n+31);}const lip=mesh(head,geometry(pos,idx),m.lip);lip.material.side=T.DoubleSide;
 }
 if(a.open>0){const pos=[],idx=[];for(let j=0;j<2;j++)for(let i=0;i<=24;i++){const u=-1+i/12,x=u*width*.88,y=cy+smile*u*u+(j?1:-1)*a.open*.45*Math.sqrt(Math.max(0,1-u*u));pos.push(x,y,faceZ(a,x,y)+.0036);}for(let i=0;i<24;i++)idx.push(i,i+1,i+25,i+1,i+26,i+25);mesh(head,geometry(pos,idx),m.teeth);}
 for(const s of [-1,1]){const x=s*a.noseWidth*.77,y=a.noseY-.009;ellipsoid(head,m.nostril,x,y,faceZ(a,x,y)+.0006,a.noseWidth*.30,.0014,.0007);}
}
function makeEars(head,a,m){
 for(const s of [-1,1]){
  const ear=new T.Group();ear.position.set(s*(a.width*.97),-.006,-.003);ear.rotation.y=s*.2;head.add(ear);
  ellipsoid(ear,m.skin,s*.006,0,0,.015*a.ears,.031*a.ears,.013);
  ellipsoid(ear,m.ear,s*.008,.003,.010,.0085*a.ears,.021*a.ears,.003);
  const rim=[];for(let i=0;i<=22;i++){const t=i/22*TAU;rim.push([s*(.005+Math.sin(t)*.011*a.ears),Math.cos(t)*.026*a.ears,.011]);}curve(ear,m.skin,rim,.0028);
  ellipsoid(ear,m.skin,0,-.013,.014,.005,.008,.004);batch(ear);
 }
}
// Sculpted tapered hair locks follow authored flows. No photo texture or billboards.
function hairLock(parent,m,points,width,depth=.004){
 const path=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),pos=[],idx=[],steps=9,sides=6;
 for(let j=0;j<=steps;j++){const t=j/steps,c=path.getPoint(t),tangent=path.getTangent(t),normal=c.clone().setY(c.y*.65).normalize();let sideways=new T.Vector3().crossVectors(tangent,normal).normalize();if(sideways.lengthSq()<.1)sideways.set(1,0,0);const out=new T.Vector3().crossVectors(sideways,tangent).normalize();const taper=Math.pow(1-t,.62)*(.63+.38*Math.sin(t*Math.PI));
  for(let k=0;k<=sides;k++){const angle=k/sides*TAU,v=c.clone().addScaledVector(sideways,Math.cos(angle)*width*taper).addScaledVector(out,Math.sin(angle)*depth*taper);pos.push(v.x,v.y,v.z);}
 }
 for(let j=0;j<steps;j++)for(let k=0;k<sides;k++){const n=j*(sides+1)+k;idx.push(n,n+1,n+sides+1,n+1,n+sides+2,n+sides+1);}mesh(parent,geometry(pos,idx),m);
}
function makeHair(head,a,m){
 const hair=new T.Group();head.add(hair);let seed=a.seed;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const wave=a.hair==='waves',straight=a.hair==='fringe',crop=a.hair==='crop',swept=a.hair==='swept',spiky=a.hair==='spikes',wisps=a.hair==='wisps';
 const W=a.width*(wave?1.31:straight?1.25:1.21),H=a.height+(wave?.033:spiky?.031:crop?.022:.026),D=.132;
 const pos=[],idx=[],cols=88,rows=32;
 for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
  const az=i/cols*TAU,front=Math.max(0,Math.cos(az)),end=mix(1.72,straight?1.24:swept?1.09:wave?1.18:1.05,front),phi=j/rows*end;
  const bump=(wave?.006:.003)*Math.sin(az*11+phi*8)*Math.sin(az*7-phi*11),groove=.001*Math.sin(az*85+phi*10);
  pos.push(Math.sin(az)*Math.sin(phi)*(W+bump+groove),Math.cos(phi)*(H+bump),Math.cos(az)*Math.sin(phi)*(D+bump+groove)-.015);
 }
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const n=j*(cols+1)+i;idx.push(n,n+cols+1,n+1,n+1,n+cols+1,n+cols+2);}mesh(hair,geometry(pos,idx),m.hair);
 // Small layered locks originate on the scalp and remain close to its surface.
 for(let i=0;i<110;i++){
  const az=rand()*TAU,phi=.18+rand()*1.18,front=Math.max(0,Math.cos(az)),limit=mix(1.77,1.05,front),length=.18+rand()*.24,start=Math.min(phi,limit-length),pts=[];
  for(let k=0;k<=4;k++){const t=k/4,f=start+t*length,ang=az+(swept?-.22:wave?Math.sin(t*Math.PI)*.18:.08)*t,lift=.004+Math.sin(t*Math.PI)*(wave?.012:spiky?.02:crop?.007:.010);pts.push([Math.sin(ang)*Math.sin(f)*(W+lift),Math.cos(f)*(H+lift)+(spiky?t*.008:0),Math.cos(ang)*Math.sin(f)*(D+lift)-.015]);}
  hairLock(hair,m.hairs[i%3],pts,wave?.012:.0085,wave?.005:.003);
 }
 const count=wave?22:straight?30:32;
 for(let i=0;i<count;i++){
  const u=-1+2*i/(count-1),arc=Math.sqrt(Math.max(0,1-u*u)),x=u*W*.97,jitter=(rand()-.5)*.014;
  const endY=straight?.044+.018*u*u+jitter*.3:wave?.057+.025*u*u+Math.sin(u*10)*.011:crop?.058+.012*u*u+jitter:swept?.069+.027*u+jitter*.4:spiky?.098+jitter:.054+.012*u*u+jitter;
  const shift=swept?-.02:wave?Math.sin(u*12)*.013:wisps?-.006:.003;
  const z=.119*arc+.002,startY=endY+.029+rand()*.02;
  hairLock(hair,m.hairs[i%3],[[x-shift,startY,.114*arc-.002],[x,startY+.005,z+.008],[x+shift,endY+.018,z+.012],[x+shift*.8,endY,z]],wave?.012:straight?.005:.0065,wave?.004:.0022);
 }
 batch(hair);
}
function createHead(p,a){
 const head=new T.Group(),skin=material(a.skin),painted=material(0xffffff,{vertexColors:true,roughness:.67});
 const baseHair=new T.Color(a.hairColor);
 const m={skin,hair:material(a.hairColor,{roughness:.83}),hairs:[.91,1.03,1.16].map(v=>material(baseHair.clone().multiplyScalar(v),{roughness:.82})),white:material(0xe4e1d6,{roughness:.3}),iris:material(a.iris,{roughness:.4}),pupil:material(0x181a17),lid:material(new T.Color(a.skin).multiplyScalar(.64)),lip:material(new T.Color(a.skin).lerp(new T.Color(0x99534e),.36)),mouth:material(0x926757),teeth:material(0xdfd9c9),nostril:material(0x95705c),ear:material(new T.Color(a.skin).lerp(new T.Color(0x99483e),.25))};
 const face=sculptHead(a,painted);face.castShadow=true;face.receiveShadow=true;head.add(face);
 makeEars(head,a,m);for(const s of [-1,1])makeEye(head,a,s,m);makeMouth(head,a,m);makeHair(head,a,m);
 if(p.glasses){const frame=material(0xa39576,{metalness:.75,roughness:.28});for(const s of [-1,1]){const cx=s*a.eyeGap,cy=a.eyeY+.001,z=.113,points=[];for(let i=0;i<=40;i++){const t=i/40*TAU;points.push([cx+Math.sin(t)*.039,cy+Math.cos(t)*.033,z-.005*Math.sin(t)**2]);}curve(head,frame,points,.0015,40);curve(head,frame,[[s*(a.eyeGap+.037),cy+.005,z-.002],[s*(a.width+.003),cy+.009,.063],[s*(a.width+.008),cy+.004,-.009]],.0015,12);}curve(head,frame,[[-.007,a.eyeY+.004,.114],[0,a.eyeY+.011,.119],[.007,a.eyeY+.004,.114]],.0014,12);}
 batch(head);head.userData.appearance=a;return head;
}
function ringsGeometry(rings,segments=28,deform=null){
 const pos=[],idx=[],uv=[];rings.forEach(([y,rx,rz,z=0],j)=>{for(let i=0;i<=segments;i++){const ang=i/segments*TAU,x=Math.sin(ang)*rx;let yy=y,zz=Math.cos(ang)*rz+z;if(deform){const d=deform(x,yy,zz,ang,j/(rings.length-1));yy=d[0];zz=d[1];}pos.push(x,yy,zz);uv.push(i/segments,j/(rings.length-1));}});
 for(let j=0;j<rings.length-1;j++)for(let i=0;i<segments;i++){const n=j*(segments+1)+i;if(rings[1][0]>rings[0][0])idx.push(n,n+1,n+segments+1,n+1,n+segments+2,n+segments+1);else idx.push(n,n+segments+1,n+1,n+1,n+segments+1,n+segments+2);}return geometry(pos,idx,uv);
}
function fabricTexture(referee=false){
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle=referee?'#d9d9d0':'#ffffff';ctx.fillRect(0,0,256,256);
 if(referee){ctx.fillStyle='#252927';for(let i=0;i<256;i+=32)ctx.fillRect(i,0,16,256);}
 for(let y=0;y<256;y+=4)for(let x=0;x<256;x+=4){ctx.fillStyle=(x+y)%8?'#0000000c':'#00000019';ctx.fillRect(x+(y%8)/4,y,1,2);}
 const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(referee?1:2,2);tex.anisotropy=2;return tex;
}
function numberTexture(number,team){const c=document.createElement('canvas');c.width=256;c.height=256;const ctx=c.getContext('2d');ctx.clearRect(0,0,256,256);ctx.fillStyle=team===0?'#274d43':'#f0e6d3';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 170px Arial';ctx.fillText(String(number),128,132);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;return tex;}
export function createCharacter(p,team=0){
 const a=APPEARANCE[p.id],root=new T.Group();root.scale.setScalar(p.scale);const body=new T.Group();root.add(body);
 const skin=material(a.skin,{roughness:.72}),cloth=material(p.referee?0xffffff:team===0?0xd4cfc0:0x205c79,{map:fabricTexture(p.referee),roughness:.95}),trim=material(team===0?0x34554e:0xe4d9bd),dark=material(0x242c2c),sole=material(0xd3d1c2),sock=material(0xdbd9d0),rubber=material(0x43372c);
 const torsoRings=[[.985,.161,.106],[1.01,.159,.105],[1.06,.150,.101],[1.17,.166,.108],[1.31,.186,.111],[1.40,.199,.102],[1.47,.180,.085],[1.515,.069,.058]].map(([y,x,z])=>[y,x*a.build,z*a.build]);
 mesh(body,ringsGeometry(torsoRings),skin);
 mesh(body,ringsGeometry(torsoRings.slice(0,-1).map(([y,x,z])=>[y,x+.007,z+.009]),36,(x,y,z,ang,v)=>[y-(v>.8?(v-.8)/.2*.080*Math.max(0,Math.cos(ang))*(1-Math.abs(Math.sin(ang))):0),z+Math.sin(ang*11+v*2)*.0015]),cloth);

 if(!p.referee)for(const side of [-1,1]){
  const positions=[],indices=[];
  for(let j=0;j<=14;j++){const t=j/14,z=-.103+.21*t,y=1.443+Math.sin(t*Math.PI)*.031;for(const edge of [-1,1])positions.push((side*.140+edge*.030)*a.build,y,z*a.build);}
  for(let j=0;j<14;j++){let n=j*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}const strap=mesh(body,geometry(positions,indices),cloth);strap.material.side=T.DoubleSide;
 }
 // Jersey neckline follows the chest; separate shoulder straps leave the arms exposed.
 for(const s of [-1,1]){const points=[[s*.191*a.build,1.411,-.075],[s*.146*a.build,1.47,-.039],[s*.133*a.build,1.461,.045],[s*.102*a.build,1.412,.091],[s*.052*a.build,1.385,.114],[0,1.377,.119*a.build]];curve(body,trim,points,.005,28);}
 mesh(body,ringsGeometry([[1.48,a.neck*1.12,.058],[1.52,a.neck,.056],[1.57,a.neck*.85,.052]],24),skin);
 mesh(body,ringsGeometry([[.958,.173*a.build,.115*a.build],[.999,.173*a.build,.115*a.build]],28),p.referee?dark:cloth);
 const head=createHead(p,a);head.position.y=1.68;head.scale.set(.90,.82,.88);body.add(head);
 const arms=[],legs=[],elbows=[],knees=[];
 for(const s of [-1,1]){
  const arm=new T.Group();arm.position.set(s*.200*a.shoulders*a.build,1.425,0);arm.rotation.z=s*.055;arm.rotation.x=-.05;body.add(arm);arms.push(arm);
  ellipsoid(arm,skin,0,-.012,0,.053*a.build,.050,.050*a.build);
  mesh(arm,ringsGeometry([[-.005,.044,.047],[-.045,.053,.051],[-.115,.048,.047],[-.21,.040,.040],[-.28,.035,.033]].map(([y,x,z])=>[y,x*a.build,z*a.build]),24),skin);
  ellipsoid(arm,skin,0,-.282,0,.034*a.build,.039,.034*a.build);
  if(p.referee)mesh(arm,ringsGeometry([[-.012,.053,.054],[-.10,.059,.057],[-.145,.054,.054]],24),cloth);
  const forearm=new T.Group();forearm.position.y=-.282;forearm.rotation.x=-.16;arm.add(forearm);elbows.push(forearm);
  mesh(forearm,ringsGeometry([[0,.034,.034],[-.06,.040,.037],[-.15,.030,.028],[-.25,.022,.021]].map(([y,x,z])=>[y,x*a.build,z*a.build]),22),skin);
  const hand=new T.Group();hand.position.set(0,-.27,.005);forearm.add(hand);
  ellipsoid(hand,skin,0,-.015,0,.030,.043,.016);
  for(let f=0;f<4;f++){const x=-.021+f*.014,len=[.047,.053,.050,.040][f];curve(hand,skin,[[x,-.031,.001],[x,-.053,.010],[x,-.031-len,.013]],.0068,6);}
  curve(hand,skin,[[s*.022,.005,.004],[s*.041,-.015,.020],[s*.038,-.032,.023]],.009,8);
  if(p.id==='laika'||p.id==='demidok')mesh(forearm,ringsGeometry([[-.207,.027,.025],[-.246,.025,.024]],20),p.id==='laika'?trim:dark);
  batch(hand);batch(forearm);batch(arm);
  const leg=new T.Group();leg.position.set(s*.086*a.build,.946,0);body.add(leg);legs.push(leg);
  mesh(leg,ringsGeometry([[.03,.083,.084],[-.10,.083,.083],[-.21,.068,.064],[-.36,.047,.048],[-.40,.043,.042]].map(([y,x,z])=>[y,x*a.build,z*a.build]),24),skin);
  const shortRings=[[.035,.096,.106],[-.055,.100,.108],[-.16,.094,.097],[-.255,.081,.088]].map(([y,x,z])=>[y,x*a.build,z*a.build]);mesh(leg,ringsGeometry(shortRings,28),p.referee?dark:cloth);
  mesh(leg,ringsGeometry([[-.235,.086*a.build,.093*a.build],[-.255,.085*a.build,.092*a.build]],28),p.referee?dark:trim);
  ellipsoid(leg,skin,0,-.404,.006,.044*a.build,.05,.044*a.build);
  const calf=new T.Group();calf.position.y=-.403;leg.add(calf);knees.push(calf);
  mesh(calf,ringsGeometry([[0,.043,.040],[-.09,.054,.043],[-.18,.047,.038],[-.30,.029,.030],[-.40,.025,.025]].map(([y,x,z])=>[y,x*a.build,z*a.build,y>-.23?-.006:0]),24),skin);
  mesh(calf,ringsGeometry([[-.28,.032,.031],[-.39,.029,.029]],22),sock);
  const shoe=new T.Group();shoe.position.set(0,-.441,.035);calf.add(shoe);
  ellipsoid(shoe,dark,0,.015,.008,.050,.043,.113);ellipsoid(shoe,sole,0,-.013,.013,.052,.014,.116);
  ellipsoid(shoe,rubber,0,-.022,.013,.050,.007,.111);
  for(let f=0;f<4;f++)curve(shoe,trim,[[-.025,.044-f*.001,-.012+f*.012],[0,.048-f*.001,f*.012],[.025,.044-f*.001,-.012+f*.012]],.002,5);
  batch(shoe);batch(calf);batch(leg);
 }
 if(!p.referee){const numberMat=new T.MeshStandardMaterial({map:numberTexture(p.number,team),transparent:true,alphaTest:.3,roughness:.9,depthWrite:false});const front=mesh(body,new T.PlaneGeometry(.130,.154),numberMat,0,1.22,.145*a.build);const back=mesh(body,new T.PlaneGeometry(.168,.195),numberMat,0,1.25,-.141*a.build);back.rotation.y=Math.PI;}
 else{curve(body,dark,[[-.050,1.50,.047],[0,1.251,.144],[.05,1.5,.047]],.003);mesh(body,new T.BoxGeometry(.026,.036,.017),material(0xa2a9a6,{metalness:.8,roughness:.3}),0,1.246,.151);}
 batch(body);
 const shadow=new T.Mesh(new T.CircleGeometry(.32,32),new T.MeshBasicMaterial({color:0x101615,transparent:true,opacity:.23,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.010;root.add(shadow);
 const ring=new T.Mesh(new T.RingGeometry(.36,.382,40),new T.MeshBasicMaterial({color:team===0?0xf6d091:0x87d5ce,transparent:true,opacity:.85,side:T.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.018;root.add(ring);ring.visible=!p.referee;
 root.userData={p,body,head,arms,legs,elbows,knees,ring,shadow,appearance:a};return root;
}
export function animateCharacter(root,time,speed,air=0,shooting=0,dribbling=false,shotKind='mid'){
 const a=root.userData,moving=Math.min(1,speed),phase=time*10,stride=Math.sin(phase)*moving*.43;
 a.legs[0].rotation.x=stride-.035;a.legs[1].rotation.x=-stride-.035;
 a.arms[0].rotation.x=-stride*.7;a.arms[1].rotation.x=stride*.7;
 for(let i=0;i<2;i++){if(a.knees)a.knees[i].rotation.x=.065+Math.max(0,Math.sin(phase+i*Math.PI))*.88*moving;if(a.elbows)a.elbows[i].rotation.x=-.14-moving*.28;a.arms[i].rotation.z=(i===0?-1:1)*(.055+moving*.03);}
 if(dribbling){a.arms[1].rotation.x=-.33+Math.sin(time*13)*.12;if(a.elbows)a.elbows[1].rotation.x=-.38+Math.sin(time*13)*.20;}
 if(shooting>0){for(let i=0;i<2;i++){const balance=i===0&&(shotKind==='dunk'||shotKind==='layup');a.arms[i].rotation.x=-.10-(balance?1.1:2.45)*shooting;if(a.elbows)a.elbows[i].rotation.x=-(balance?.6:.3)*shooting;}}
 a.body.position.y=air-.012+Math.abs(Math.sin(phase))*.015*moving;a.body.rotation.z=stride*.028;a.body.rotation.y=Math.sin(phase)*moving*.065;a.body.rotation.x=.025+moving*.055;
 a.head.rotation.y=Math.sin(time*.65)*.018*(1-moving);a.shadow.scale.setScalar(1-air*.16);a.shadow.material.opacity=Math.max(.06,.23-air*.1);
}
export function disposeObject(root){const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});geometries.forEach(g=>g.dispose());materials.forEach(m=>{if(m.map)textures.add(m.map);m.dispose();});textures.forEach(t=>t.dispose());}
