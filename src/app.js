import {PLAYERS,REFEREE,STAT_LABELS,byId} from './roster.js';
const $=id=>document.getElementById(id);
let selected='laika',mate='gabar',role='player',opponents=['kempil','demidok'],game=null,preview=null,modalClose=null,toastTimer;
const storage={get(key){try{return JSON.parse(localStorage.getItem(key));}catch{return null;}},set(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}};
const saved=storage.get('svoya-liga-team');if(saved&&byId(saved.selected)&&byId(saved.mate)&&saved.selected!==saved.mate){selected=saved.selected;mate=saved.mate;pickOpponents(false);}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2300);}
function current(){return byId(role==='player'?selected:mate);}
function positionFeaturedPhoto(){const img=$('featured').querySelector('img');if(img)Object.assign(img.style,{width:'100%',height:'100%',left:'0',top:'0',objectFit:'cover',objectPosition:'50% 25%'});}
function pickOpponents(random=true){let available=PLAYERS.filter(p=>p.id!==selected&&p.id!==mate);if(random)available.sort(()=>Math.random()-.5);opponents=available.slice(0,2).map(p=>p.id);}
function render(){
 const p=current();$('featured').style.setProperty('--accent',p.color);$('featured').innerHTML=`<img class="feature-photo" src="${p.photo}" alt="${p.name}" style="object-position:${p.photoPosition}"><div class="feature-shade"></div><div class="rating-badge"><b>${p.ovr}</b><small>ОБЩ</small></div><span class="card-series">СВОЯ ЛИГА · 2×2</span><div class="card-bottom"><span class="card-role">${p.role}</span><h2 class="card-name">${p.name}</h2><div class="card-sub">${p.height} рост <span aria-hidden="true">·</span> № ${String(p.number).padStart(2,'0')}</div><div class="stats-grid">${Object.entries(STAT_LABELS).map(([key,label])=>`<div class="stat"><strong>${p.stats[key]}</strong><span>${label}</span></div>`).join('')}</div></div>`;
 $('featured').querySelector('img').addEventListener('load',positionFeaturedPhoto);positionFeaturedPhoto();
 $('roster').replaceChildren();for(const p of PLAYERS){const button=document.createElement('button');const isSelected=p.id===selected,isMate=p.id===mate;button.className='roster-card'+(p.id===current().id?' selected':'')+(isMate?' teammate':'');button.dataset.player=p.id;button.setAttribute('aria-label',`${p.name}, рейтинг ${p.ovr}${isSelected?', твой игрок':isMate?', напарник':''}`);button.setAttribute('aria-pressed',String(p.id===current().id));button.innerHTML=`<img src="${p.photo}" alt="" style="object-position:${p.photoPosition}"><b class="mini-ovr" style="color:${p.color}">${p.ovr}</b><span class="mini-name">${p.name}</span>${isSelected?'<span class="selection-tick">ТЫ</span>':isMate?'<span class="selection-tick mate">БОТ</span>':''}`;button.addEventListener('click',()=>choose(p.id));$('roster').append(button);}
 $('lineup-player').textContent=byId(selected).name;$('lineup-mate').textContent=byId(mate).name;$('opponents').textContent=opponents.map(id=>byId(id).name).join(' + ');
 for(const kind of ['player','mate']){$('role-'+kind).classList.toggle('active',role===kind);$('role-'+kind).setAttribute('aria-pressed',String(role===kind));}
 storage.set('svoya-liga-team',{selected,mate});
}
function choose(id){if(role==='player'){if(id===mate)mate=selected;selected=id;}else{if(id===selected){toast('Этот игрок уже у тебя. Выбери другого напарника.');return;}mate=id;}if(opponents.some(o=>o===selected||o===mate))pickOpponents(false);render();}
function showModal(content,onClose=null){modalClose=onClose;$('modal-content').innerHTML=content;if(!$('modal').open)$('modal').showModal();}
function closeModal(){if($('modal').open)$('modal').close();const fn=modalClose;modalClose=null;fn?.();}
$('close-modal').addEventListener('click',closeModal);$('modal').addEventListener('cancel',e=>{e.preventDefault();closeModal();});
$('role-player').addEventListener('click',()=>{role='player';render();});$('role-mate').addEventListener('click',()=>{role='mate';render();});$('shuffle').addEventListener('click',()=>{pickOpponents();render();});
$('help').addEventListener('click',()=>showModal(`<p class="eyebrow">ТВОЯ ПЕРВАЯ ИГРА</p><h2>Всё решается на площадке.</h2><ul><li>Держи телефон горизонтально. Слева — джойстик, справа — действия.</li><li><b>Бросок:</b> зажми кнопку и отпусти, когда отметка попадёт в зелёную зону. Вблизи кольца сильные данкеры бросают сверху.</li><li><b>Пас:</b> отдаёт мяч напарнику. Когда мяч у него — просит передачу тебе.</li><li><b>Защита:</b> кнопки меняются на блок и перехват. Подойди к сопернику, прежде чем отбирать мяч.</li><li><b>Супер:</b> заряжается со временем и за удачные действия. У каждого героя свой приём.</li><li>Матч длится 3 минуты. Дальние попадания — 3 очка, остальные — 2. При ничьей играем до следующего попадания.</li></ul><p>На компьютере: WASD или стрелки, пробел — бросок, E — пас, Q — супер.</p>`));
async function launch(){
 $('play').disabled=true;$('play').textContent='ГОТОВИМ ПЛОЩАДКУ…';
 try{if(!game){const {CourtGame}=await import('./game.js');game=new CourtGame($('court'),{onPause:pause,onEnd:finish,onError:message=>showModal('<h2>Матч на паузе</h2><p>'+message+'</p>',returnMenu)});}
  $('menu').classList.add('hidden');$('game-screen').classList.remove('hidden');window.scrollTo(0,0);game.start([byId(selected),byId(mate),...opponents.map(byId)]);
  if(new URLSearchParams(location.search).has('debug'))window.__courtGame=game;
 }catch(error){console.error(error);returnMenu();showModal('<h2>Не удалось открыть площадку</h2><p>Попробуй открыть игру в Safari или Chrome обычной вкладкой. Если проблема повторяется, обнови браузер.</p>');}
 finally{$('play').disabled=false;$('play').innerHTML='НА ПЛОЩАДКУ <span>↗</span>';}
}
$('play').addEventListener('click',launch);
function pause(){if(!game?.running||game.paused)return;game.setPaused(true);showModal(`<p class="eyebrow">ТАЙМ-АУТ</p><h2>Переведём дыхание.</h2><p><b>${game.user.definition.name} · ${game.user.definition.super.name}</b><br>${game.user.definition.super.description}</p><button id="resume" class="primary">ПРОДОЛЖИТЬ <span>↗</span></button><button id="leave" class="secondary">К выбору игроков</button>`,()=>game?.setPaused(false));$('resume').addEventListener('click',closeModal);$('leave').addEventListener('click',()=>{modalClose=null;closeModal();returnMenu();});}
$('pause').addEventListener('click',pause);
function returnMenu(){game?.stop();$('game-screen').classList.add('hidden');$('menu').classList.remove('hidden');}
function finish(result){const stats=storage.get('svoya-liga-results')||{matches:0,wins:0};stats.matches++;if(result.won)stats.wins++;storage.set('svoya-liga-results',stats);
 showModal(`<p class="eyebrow result-title">ФИНАЛЬНЫЙ СВИСТОК АСКАРА</p><h2 class="result-title">${result.won?'Это ваша игра.':'Следующая будет вашей.'}</h2><div class="result-score">${result.score[0]} : ${result.score[1]}</div><div class="result-stats"><div><b>${result.user.points}</b>ТВОИ ОЧКИ</div><div><b>${result.user.assists}</b>ПЕРЕДАЧИ</div><div><b>${result.user.steals}</b>ПЕРЕХВАТЫ</div></div><button id="again" class="primary">ЕЩЁ МАТЧ <span>↗</span></button><button id="roster-back" class="secondary">Выбрать другую команду</button>`,returnMenu);
 $('again').addEventListener('click',()=>{modalClose=null;closeModal();launch();});$('roster-back').addEventListener('click',closeModal);
}
async function openPreview(){
 const p=current();$('model-name').textContent=p.name;$('model-modal').showModal();
 try{const [T,M]=await Promise.all([import('../vendor/three.module.min.js'),import('./models.js')]);if(!$('model-modal').open)return;const canvas=$('model-canvas');const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 const scene=new T.Scene();const camera=new T.PerspectiveCamera(32,canvas.clientWidth/canvas.clientHeight,.04,30);camera.position.set(.10,1.26,3.9);camera.lookAt(0,1.03,0);
 scene.add(new T.HemisphereLight(0xe2edff,0x615443,1.45));const light=new T.DirectionalLight(0xffe7cd,2.7);light.position.set(-2,4,4);light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.camera.left=-1.5;light.shadow.camera.right=1.5;light.shadow.camera.top=3;light.shadow.camera.bottom=-1;light.shadow.normalBias=.006;scene.add(light);
 const fill=new T.DirectionalLight(0xa8caff,.9);fill.position.set(3,2,3);scene.add(fill);const rim=new T.DirectionalLight(0xffd3a3,2.0);rim.position.set(1,3,-2);scene.add(rim);
 const character=M.createCharacter(p,0);character.rotation.y=.12;scene.add(character);character.userData.ring.visible=false;
 const platform=new T.Mesh(new T.CylinderGeometry(.58,.61,.055,56),new T.MeshStandardMaterial({color:0x35423c,roughness:.85}));platform.position.y=-.034;platform.receiveShadow=true;scene.add(platform);let frame=0,pointer=null,lastX=0;
 const setView=face=>{const scale=p.scale;camera.position.set(face?.018:.10,face?1.685*scale:1.26,face?.87:3.9);camera.lookAt(0,face?1.66*scale:1.03,0);for(const [id,active]of [['model-full',!face],['model-face',face]]){$(id).classList.toggle('active',active);$(id).setAttribute('aria-pressed',String(active));}};
 const fullView=()=>setView(false),faceView=()=>setView(true);$('model-full').addEventListener('click',fullView);$('model-face').addEventListener('click',faceView);fullView();
 const down=e=>{pointer=e.pointerId;lastX=e.clientX;canvas.setPointerCapture(pointer);};const move=e=>{if(e.pointerId!==pointer)return;character.rotation.y+=(e.clientX-lastX)*.011;lastX=e.clientX;};const up=()=>pointer=null;
 const resize=()=>{renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);camera.aspect=canvas.clientWidth/canvas.clientHeight;camera.updateProjectionMatrix();};canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);window.addEventListener('resize',resize);
 const tick=time=>{if(!$('model-modal').open)return;M.animateCharacter(character,time/1000,0,0,0,false);renderer.render(scene,camera);frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);
 preview={close(){cancelAnimationFrame(frame);$('model-full').removeEventListener('click',fullView);$('model-face').removeEventListener('click',faceView);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);window.removeEventListener('resize',resize);M.disposeObject(scene);renderer.dispose();renderer.forceContextLoss();}};
 }catch(error){console.error(error);$('model-modal').close();toast('Не удалось открыть 3D-просмотр в этом браузере.');}
}
function closePreview(){preview?.close();preview=null;$('model-modal').close();}
$('view-model').addEventListener('click',openPreview);$('close-model').addEventListener('click',closePreview);$('model-modal').addEventListener('cancel',e=>{e.preventDefault();closePreview();});
new ResizeObserver(positionFeaturedPhoto).observe($('featured'));
render();
