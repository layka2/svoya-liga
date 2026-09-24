import {PLAYERS,TEAMMATE,GUEST,STAT_LABELS,byId} from './roster.js?v=0.4.0';
import {UNLOCKS,readProgress,writeProgress,isUnlocked,nextUnlock,recordResult} from './progression.js?v=0.4.0';
const $=id=>document.getElementById(id);
// Keep play available when browser storage is disabled.
const disk={getItem(key){try{return localStorage.getItem(key);}catch{return null;}},setItem(key,value){localStorage.setItem(key,value);}};
const storage={get(key){try{return JSON.parse(disk.getItem(key));}catch{return null;}},set(key,value){try{disk.setItem(key,JSON.stringify(value));return true;}catch{return false;}}};
let progress=readProgress(disk),selected='piniv',mate='mate',role='player',inspected='piniv',opponents=[],game=null,preview=null,modalClose=null,toastTimer;
const saved=storage.get('svoya-liga-team');
if(saved&&isUnlocked(saved.selected,progress))selected=saved.selected;
if(saved&&(saved.mate==='mate'||isUnlocked(saved.mate,progress))&&saved.mate!==selected)mate=saved.mate;
inspected=selected;writeProgress(disk,progress);
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600);}
function current(){return byId(inspected);}
function available(id){return id==='mate'||isUnlocked(id,progress);}
function positionFeaturedPhoto(){const img=$('featured').querySelector('img');if(img)Object.assign(img.style,{width:'100%',height:'100%',left:'0',top:'0',objectFit:'cover',objectPosition:current().photoPosition});}
function pickOpponents(random=true){
 // Early matches teach the fundamentals before the elite shooters enter the pool.
 const tier=progress.wins<3?['aziom','guest']:progress.wins<6?['demidok','aziom','guest']:progress.wins<10?['gabar','demidok','aziom']:progress.wins<15?['kempil','gabar','demidok']:['laika','kempil','gabar'];
 let pool=tier.filter(id=>id!==selected&&id!==mate);
 for(const id of ['guest','piniv','aziom','demidok','gabar'])if(pool.length<2&&!pool.includes(id)&&id!==selected&&id!==mate)pool.push(id);
 if(random)for(let i=pool.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
 opponents=pool.slice(0,2);
}
function render(){
 const p=current(),locked=!available(p.id),gate=UNLOCKS.find(g=>g.id===p.id),next=nextUnlock(progress);
 $('featured').style.setProperty('--accent',p.color);
 $('featured').innerHTML=`<img class="feature-photo" src="${p.photo}" alt="${p.name}" style="object-position:${p.photoPosition}"><div class="feature-shade"></div><div class="rating-badge"><b>${p.ovr}</b><small>ОБЩ</small></div><span class="card-series">${locked?'ЦЕЛЬ · '+gate.wins+' ПОБЕД':'СВОЯ ЛИГА · 2×2'}</span><div class="card-bottom"><span class="card-role">${p.role}</span><h2 class="card-name">${p.name}</h2><div class="card-sub">${p.height} рост <span aria-hidden="true">·</span> № ${String(p.number).padStart(2,'0')}</div><div class="stats-grid">${Object.entries(STAT_LABELS).map(([key,label])=>`<div class="stat"><strong>${p.stats[key]}</strong><span>${label}</span></div>`).join('')}</div></div>`;
 $('featured').querySelector('img').addEventListener('load',positionFeaturedPhoto);positionFeaturedPhoto();
 $('unlock-hint').textContent=locked?`${p.name} откроется после ${gate.wins} побед. Осталось: ${gate.wins-progress.wins}.`:p.id==='mate'?'Надёжный напарник доступен с первого матча.':`${p.name} доступен для игры.`;
 $('unlock-hint').classList.toggle('locked',locked);
 $('progress-panel').innerHTML=`<div class="progress-heading"><span>ТВОЯ ЛИГА</span><b>${progress.wins} <small>ПОБЕД</small></b></div><div class="career-track" role="progressbar" aria-label="Победы до открытия Лайки" aria-valuemin="0" aria-valuemax="15" aria-valuenow="${Math.min(15,progress.wins)}"><i style="width:${Math.min(100,progress.wins/15*100)}%"></i></div><p>${next?`Следующий — <b>${byId(next.id).name}</b> · ещё ${next.wins-progress.wins} ${next.wins-progress.wins===1?'победа':next.wins-progress.wins<5?'победы':'побед'}`:'Все герои открыты. Собери свою лучшую двойку.'}</p>`;
 $('roster').replaceChildren();
 const pool=UNLOCKS.map(g=>byId(g.id));if(role==='mate')pool.unshift(TEAMMATE);
 for(const hero of pool){
  const button=document.createElement('button'),isSelected=hero.id===selected,isMate=hero.id===mate,locked=!available(hero.id),wins=UNLOCKS.find(g=>g.id===hero.id)?.wins;
  button.className='roster-card'+(hero.id===inspected?' selected':'')+(isMate?' teammate':'')+(locked?' locked-card':'');button.dataset.player=hero.id;
  button.setAttribute('aria-label',`${hero.name}, рейтинг ${hero.ovr}${locked?', закрыт до '+wins+' побед':isSelected?', твой игрок':isMate?', напарник':''}`);button.setAttribute('aria-pressed',String(hero.id===(role==='player'?selected:mate)));
  button.innerHTML=`<img src="${hero.photo}" alt="" style="object-position:${hero.photoPosition}"><b class="mini-ovr" style="color:${hero.color}">${hero.ovr}</b><span class="mini-name">${hero.name}</span>${locked?`<span class="unlock-cost">${wins} ${wins===1?'победа':wins===3?'победы':'побед'}</span>`:isSelected?'<span class="selection-tick">ТЫ</span>':isMate?'<span class="selection-tick mate">БОТ</span>':''}`;
  button.addEventListener('click',()=>choose(hero.id));$('roster').append(button);
 }
 $('lineup-player').textContent=byId(selected).name;$('lineup-mate').textContent=byId(mate).name;$('opponents').textContent=opponents.map(id=>byId(id).name).join(' + ');
 for(const kind of ['player','mate']){$('role-'+kind).classList.toggle('active',role===kind);$('role-'+kind).setAttribute('aria-pressed',String(role===kind));}
 storage.set('svoya-liga-team',{selected,mate});
}
function choose(id){
 inspected=id;
 if(!available(id)){render();return;}
 if(role==='player'){if(id==='mate')return;if(id===mate)mate=selected;selected=id;}
 else{if(id===selected){toast('Этот игрок уже у тебя. Выбери другого напарника.');render();return;}mate=id;}
 if(opponents.some(o=>o===selected||o===mate))pickOpponents(false);render();
}
function showModal(content,onClose=null){modalClose=onClose;$('modal-content').innerHTML=content;if(!$('modal').open)$('modal').showModal();}
function closeModal(){if($('modal').open)$('modal').close();const fn=modalClose;modalClose=null;fn?.();}
$('close-modal').addEventListener('click',closeModal);$('modal').addEventListener('cancel',e=>{e.preventDefault();closeModal();});
for(const kind of ['player','mate'])$('role-'+kind).addEventListener('click',()=>{role=kind;inspected=kind==='player'?selected:mate;render();});
$('shuffle').addEventListener('click',()=>{pickOpponents();render();});
$('help').addEventListener('click',()=>showModal(`<p class="eyebrow">ТВОЯ ПЕРВАЯ ИГРА</p><h2>Создай свой момент.</h2><ul><li>Слева — движение, справа — действия. Нажми ↻ для горизонтального режима, даже если автоповорот телефона выключен.</li><li><b>Бросок:</b> остановись, зажми кнопку и отпусти в зелёной зоне. Защитник, движение, усталость и большая дистанция снижают точность. Даже точный выпуск не гарантирует трёшку.</li><li><b>Обман:</b> быстро коснись броска — герой покажет замах. Соперник может прыгнуть, открыв проход.</li><li><b>Финт:</b> смени ведущую руку перед защитником и выбери другую сторону прохода. У сильных дриблёров движение быстрее восстанавливается.</li><li><b>Данк:</b> разгонись к кольцу, удержи бросок и отпусти в точный момент, когда кнопка показывает «ДАНК». Вид завершения зависит от захода и героя. Если не хватает прыжка или пространства, получится проход с броском.</li><li><b>Рывок:</b> короткое ускорение за выносливость. Есть перерыв между рывками; остановка восстанавливает силы.</li><li><b>Пас:</b> передай напарнику или попроси мяч у него. Не отдавай через защитника. Лови передачу на свободном месте для прибавки к точности.</li><li><b>Защита:</b> блокируй во время выпуска мяча. Перехват делай рядом с соперником; неудачный отбор на мгновение замедлит тебя.</li><li><b>Супер:</b> заряжается со временем и за удачные действия. Особый приём усиливает героя, но не отменяет выбор момента.</li><li>3 минуты, 24 секунды на атаку. При ничьей — до следующего попадания. Доигранные победы открывают героев: 1 / 3 / 6 / 10 / 15.</li></ul><p>Компьютер: WASD / стрелки, пробел — бросок, E — пас, Shift — рывок, Q — супер, F — финт, C — камера, R — поворот.</p><p class="small-note">Прогресс сохраняется в этом браузере. Начатый и брошенный матч не считается победой.</p>`));
async function launch(){
 if(!isUnlocked(selected,progress))selected='piniv';
 $('play').disabled=true;$('play').textContent='ГОТОВИМ ПЛОЩАДКУ…';
 try{if(!game){const {CourtGame}=await import('./game.js?v=0.4.0');game=new CourtGame($('court'),{onPause:pause,onEnd:finish,onError:message=>showModal('<h2>Матч на паузе</h2><p>'+message+'</p>',returnMenu)});}
  $('menu').classList.add('hidden');$('game-screen').classList.remove('hidden');window.scrollTo(0,0);game.start([byId(selected),byId(mate),...opponents.map(byId)]);
  if(new URLSearchParams(location.search).has('debug'))window.__courtGame=game;
 }catch(error){console.error(error);returnMenu();showModal('<h2>Не удалось открыть площадку</h2><p>Попробуй открыть игру в Safari или Chrome обычной вкладкой. Если проблема повторяется, обнови браузер.</p>');}
 finally{$('play').disabled=false;$('play').innerHTML='НА ПЛОЩАДКУ <span>↗</span>';}
}
$('play').addEventListener('click',launch);
function pause(){if(!game?.running||game.paused)return;game.setPaused(true);showModal(`<p class="eyebrow">ТАЙМ-АУТ</p><h2>Переведём дыхание.</h2><p><b>${game.user.definition.name} · ${game.user.definition.super.name}</b><br>${game.user.definition.super.description}</p><button id="resume" class="primary">ПРОДОЛЖИТЬ <span>↗</span></button><button id="leave" class="secondary">К выбору игроков</button>`,()=>game?.setPaused(false));$('resume').addEventListener('click',closeModal);$('leave').addEventListener('click',()=>{modalClose=null;closeModal();returnMenu();});}
$('pause').addEventListener('click',pause);
function returnMenu(){game?.stop();game?.display.exit();$('game-screen').classList.add('hidden');$('menu').classList.remove('hidden');render();}
function finish(result){
 const reward=recordResult(progress,result);progress=reward.progress;
 if(reward.awarded&&!writeProgress(disk,progress))toast('Браузер не сохранил прогресс. Он останется до закрытия вкладки.');
 const next=nextUnlock(progress),opened=reward.unlocked.map(byId),nextText=next?`До ${byId(next.id).name}: ещё ${next.wins-progress.wins} побед.`:'Все герои открыты!';
 const rewardHTML=opened.length?`<div class="unlock-reward"><span>НОВЫЙ ИГРОК</span><b>${opened.map(p=>p.name).join(', ')}</b><p>Открыт за ${progress.wins} ${progress.wins===1?'победу':progress.wins<5?'победы':'побед'}. Теперь его можно выбрать.</p></div>`:`<p class="result-progress">Побед: <b>${progress.wins}</b> · ${nextText}</p>`;
 showModal(`<p class="eyebrow result-title">ФИНАЛЬНЫЙ СВИСТОК АСКАРА</p><h2 class="result-title">${result.won?'Это ваша игра.':'Следующая будет вашей.'}</h2><div class="result-score">${result.score[0]} : ${result.score[1]}</div><div class="result-stats"><div><b>${result.user.points}</b>ТВОИ ОЧКИ</div><div><b>${result.user.made}/${result.user.shots}</b>ПОПАДАНИЯ</div><div><b>${result.user.rebounds}</b>ПОДБОРЫ</div></div>${rewardHTML}<button id="again" class="primary">${opened.length?'ИГРАТЬ ЗА '+opened[0].name.toUpperCase():'ЕЩЁ МАТЧ'} <span>↗</span></button><button id="roster-back" class="secondary">Выбрать другую команду</button>`,returnMenu);
 $('again').addEventListener('click',()=>{if(opened.length){selected=opened[0].id;if(mate===selected)mate='mate';inspected=selected;}pickOpponents();render();modalClose=null;closeModal();launch();});$('roster-back').addEventListener('click',()=>{pickOpponents();closeModal();});
}
async function openPreview(){
 const p=current();$('model-name').textContent=p.name;$('model-modal').showModal();
 try{const [T,M]=await Promise.all([import('../vendor/three.module.min.js'),import('./models.js?v=0.4.0')]);if(!$('model-modal').open)return;const canvas=$('model-canvas');const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
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
pickOpponents(false);render();
