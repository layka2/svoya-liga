import * as T from '../vendor/three.module.min.js';
export const COURT={halfLength:9.4,halfWidth:5.2,hoopX:8.5,hoopY:3.05,threeDistance:6.15};
function mat(color,extra={}){return new T.MeshStandardMaterial({color,roughness:.96,...extra});}
function box(scene,x,y,z,w,h,d,m){const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;scene.add(o);return o;}
function courtTexture(){
 const c=document.createElement('canvas');c.width=2048;c.height=1152;const q=c.getContext('2d');q.fillStyle='#a23f40';q.fillRect(0,0,c.width,c.height);
 let seed=45;function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
 for(let i=0;i<80000;i++){const v=random();q.fillStyle=v>.5?'#f8efd508':'#253d280e';q.fillRect(random()*2048,random()*1152,random()*2+.5,random()*2+.5);}
 const sx=2048/20.8,sy=1152/11.7;const X=x=>(x+10.4)*sx,Z=z=>(z+5.85)*sy;
 q.lineWidth=3.8;q.strokeStyle='#ffffff';q.fillStyle='#843435';
 for(const side of [-1,1]){const x0=side===-1?-9.4:5.4;q.fillRect(X(x0),Z(-2.15),4*sx,4.3*sy);}
 q.strokeRect(X(-9.4),Z(-5.2),18.8*sx,10.4*sy);q.beginPath();q.moveTo(X(0),Z(-5.2));q.lineTo(X(0),Z(5.2));q.stroke();q.beginPath();q.ellipse(X(0),Z(0),1.2*sx,1.2*sy,0,0,Math.PI*2);q.stroke();
 for(const side of [-1,1]){const start=side===-1?-9.4:5.4;q.strokeRect(X(start),Z(-2.15),4*sx,4.3*sy);q.beginPath();q.ellipse(X(side*5.4),Z(0),1.5*sx,1.5*sy,0,0,Math.PI*2);q.stroke();q.save();q.beginPath();q.rect(X(-9.38),Z(-5.18),18.76*sx,10.36*sy);q.clip();q.beginPath();q.ellipse(X(side*8.5),Z(0),6.15*sx,6.15*sy,0,side===-1?-Math.PI/2:Math.PI/2,side===-1?Math.PI/2:Math.PI*1.5);q.stroke();q.restore();q.beginPath();q.ellipse(X(side*8.5),Z(0),1.0*sx,1.0*sy,0,0,Math.PI*2);q.stroke();}
 q.save();q.translate(X(0),Z(0));q.rotate(-Math.PI/2);q.fillStyle='#ffffff';q.font='bold 21px Arial';q.textAlign='center';q.fillText('СВОЯ',0,-9);q.fillText('ЛИГА',0,15);q.restore();
 const tx=new T.CanvasTexture(c);tx.colorSpace=T.SRGBColorSpace;tx.anisotropy=4;return tx;
}
function bannerTexture(){const c=document.createElement('canvas');c.width=1024;c.height=160;const ctx=c.getContext('2d');ctx.fillStyle='#243b33';ctx.fillRect(0,0,1024,160);ctx.fillStyle='#ffffff';ctx.font='900 60px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('ПЛОЩАДКА ЛИЦЕЯ № 2',512,84);const tx=new T.CanvasTexture(c);tx.colorSpace=T.SRGBColorSpace;return tx;}
export function createArena(scene){
 const hoopActors=[];
 scene.background=new T.Color(0xb8c8cd);scene.fog=new T.Fog(0xb8c8cd,30,95);
 scene.add(new T.HemisphereLight(0xe8f2ff,0x586653,1.5));const sun=new T.DirectionalLight(0xffe3bd,2.6);sun.position.set(-7,15,7);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-15;sun.shadow.camera.right=15;sun.shadow.camera.top=12;sun.shadow.camera.bottom=-12;sun.shadow.normalBias=.012;sun.shadow.bias=-.0003;scene.add(sun);
 const ground=new T.Mesh(new T.PlaneGeometry(180,180),mat(0x859582));ground.rotation.x=-Math.PI/2;ground.position.y=-.04;ground.receiveShadow=true;scene.add(ground);
 const floor=new T.Mesh(new T.PlaneGeometry(20.8,11.7),mat(0xffffff,{map:courtTexture()}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
 const concrete=mat(0x85847c),metal=mat(0x515b59,{metalness:.55,roughness:.48}),orange=mat(0xd06a27,{metalness:.38,roughness:.45}),fence=mat(0x267340,{metalness:.15}),cream=mat(0xe1ddc4);
 const glass=mat(0xc4dde0,{transparent:true,opacity:.28,roughness:.15,metalness:.1,side:T.DoubleSide,depthWrite:false});
 box(scene,0,.23,-6.35,24,.5,.4,concrete);box(scene,-12,.2,0,.4,.4,14,concrete);box(scene,12,.2,0,.4,.4,14,concrete);
 for(let x=-12;x<=12;x+=3){box(scene,x,1.65,-6.35,.065,3.3,.065,fence);}
 for(let y=.7;y<=3.3;y+=.38){box(scene,0,y,-6.35,24,.018,.018,fence);}
 for(let x=-12;x<=12;x+=.4){box(scene,x,1.8,-6.35,.012,2.7,.012,fence);}
 // Side fences frame the court; the camera side remains open for visibility.
 for(const side of [-1,1]){
  for(let z=-6.35;z<=5.8;z+=3)box(scene,side*11.8,1.65,z,.065,3.3,.065,fence);
  const vertices=[];
  for(let y=.6;y<=3.3;y+=.38)vertices.push(side*11.8,y,-6.35,side*11.8,y,5.8);
  for(let z=-6.35;z<=5.8;z+=.38)vertices.push(side*11.8,.5,z,side*11.8,3.3,z);
  const wire=new T.BufferGeometry();wire.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  scene.add(new T.LineSegments(wire,new T.LineBasicMaterial({color:0x267340})));
 }
 const banner=new T.Mesh(new T.PlaneGeometry(8.5,1.32),new T.MeshStandardMaterial({map:bannerTexture(),roughness:1}));banner.position.set(0,2.05,-6.30);scene.add(banner);
 for(const side of [-1,1]){
  box(scene,side*9.8,1.65,0,.15,3.3,.16,metal);box(scene,side*9.3,3.13,0,1.1,.12,.12,metal);
  box(scene,side*9.00,3.53,0,.055,1.16,1.8,glass);
  for(const z of [-.89,.89])box(scene,side*9,3.53,z,.07,1.18,.035,metal);
  for(const y of [2.95,4.11])box(scene,side*9,y,0,.07,.035,1.80,metal);
  box(scene,side*9,2.95,0,.11,.1,1.83,mat(0x354b49));
  for(const z of [-.46,.46])box(scene,side*8.949,3.40,z,.02,.56,.035,orange);
  for(const y of [3.14,3.68])box(scene,side*8.949,y,0,.02,.035,.92,orange);
  const rim=new T.Mesh(new T.TorusGeometry(.38,.026,8,32),orange);rim.rotation.x=Math.PI/2;rim.position.set(side*8.5,3.05,0);scene.add(rim);const netParts=[rim];
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;let points=[new T.Vector3(side*8.5+Math.cos(a)*.38,3.02,Math.sin(a)*.38),new T.Vector3(side*8.5+Math.cos(a+.15)*.24,2.57,Math.sin(a+.15)*.24)];const strand=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:0xe4ddc4,transparent:true,opacity:.8}));scene.add(strand);netParts.push(strand);}
  for(const y of [2.74,2.9]){const net=new T.Mesh(new T.TorusGeometry(y===2.9?.33:.275,.008,4,24),cream);net.rotation.x=Math.PI/2;net.position.set(side*8.5,y,0);scene.add(net);netParts.push(net);}
  const rig=new T.Group();rig.position.set(side*8.5,3.05,0);scene.add(rig);scene.updateMatrixWorld(true);for(const part of netParts)rig.attach(part);hoopActors.push({rig,side,phase:10,strength:0});
 }
 for(const x of [-10.8,10.8]){box(scene,x,3.5,-5.8,.11,7,.11,metal);box(scene,x,7,-5.35,.6,.13,.8,cream);}
 for(const x of [-7,7]){box(scene,x,.52,-8.05,3.2,.15,.7,mat(0x8b7252));for(const dx of [-1.2,1.2])box(scene,x+dx,.25,-8.05,.08,.5,.55,metal);}
 // Low skyline and trees keep the arena readable without downloaded assets.
 for(let i=0;i<9;i++){const x=-25+i*6;box(scene,x,3.5+(i%3),-22,4.5,7+(i%3)*2,6,mat(i%2?0x80917e:0x96a28a));}
 for(const x of [-17,-13,13,17]){box(scene,x,1.4,-10,.24,2.8,.24,mat(0x626850));for(let k=0;k<3;k++){const crown=new T.Mesh(new T.IcosahedronGeometry(1.4+k*.18,1),mat(0x587b61));crown.position.set(x+Math.sin(k)*.55,3+k*.5,-10+k*.3);scene.add(crown);}}
 return {floor,sun,hoopActors,impact(team,dunk){const hoop=hoopActors.find(h=>h.side===(team===0?1:-1));hoop.phase=0;hoop.strength=dunk?1:.28;},update(dt){for(const h of hoopActors){h.phase+=dt;const decay=Math.exp(-h.phase*5.8)*h.strength;h.rig.rotation.z=Math.sin(h.phase*29)*decay*.03;h.rig.scale.y=1+Math.sin(h.phase*19)*decay*.22;}}};
}
export function createBall(){const root=new T.Group();const sphere=new T.Mesh(new T.SphereGeometry(.125,18,14),new T.MeshStandardMaterial({color:0xc56e36,roughness:.85}));sphere.castShadow=true;root.add(sphere);const dark=new T.MeshBasicMaterial({color:0x422d23});for(const rot of [[0,0,0],[Math.PI/2,0,0],[0,Math.PI/2,0]]){const line=new T.Mesh(new T.TorusGeometry(.1255,.004,4,32),dark);line.rotation.set(...rot);root.add(line);}return root;}
