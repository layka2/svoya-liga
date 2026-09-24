import {PLAYERS,TEAMMATE,GUEST,STAT_LABELS,byId} from './roster.js?v=0.5.0';
import {UNLOCKS,readProgress,writeProgress,isUnlocked,nextUnlock,recordResult} from './progression.js?v=0.5.0';
import {BADGES,DIVISIONS,readLeague,writeLeague,activeRun,createRun,markPlaying,chooseBadge,recordRound,abandonRun,divisionUnlocked,divisionById,badgeById,rivalsFor,matchKey,collectionCount,trophyTitle} from './league.js?v=0.5.0';
const $=id=>document.getElementById(id);
// Keep play available when browser storage is disabled.
const disk={getItem(key){try{return localStorage.getItem(key);}catch{return null;}},setItem(key,value){localStorage.setItem(key,value);}};
const storage={get(key){try{return JSON.parse(disk.getItem(key));}catch{return null;}},set(key,value){try{disk.setItem(key,JSON.stringify(value));return true;}catch{return false;}}};
let progress=readProgress(disk),selected='piniv',mate='mate',role='player',inspected='piniv',opponents=[],game=null,preview=null,modalClose=null,toastTimer;
let career=readLeague(disk),mode=storage.get('svoya-liga-mode')==='quick'?'quick':'crown',division=storage.get('svoya-liga-division')||'yard';
if(!divisionUnlocked(division,career))division='yard';
const saved=storage.get('svoya-liga-team');
if(saved&&isUnlocked(saved.selected,progress))selected=saved.selected;
if(saved&&(saved.mate==='mate'||isUnlocked(saved.mate,progress))&&saved.mate!==selected)mate=saved.mate;
if(activeRun(career)&&(!isUnlocked(career.active.hero,progress)||career.active.mate!=='mate'&&!isUnlocked(career.active.mate,progress)))career=abandonRun(career);
if(mode==='crown'&&activeRun(career)){selected=career.active.hero;mate=career.active.mate;division=career.active.division;}
inspected=selected;writeProgress(disk,progress);
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600);}
function current(){return byId(inspected);}
function available(id){return id==='mate'||isUnlocked(id,progress);}
function positionFeaturedPhoto(){const img=$('featured').querySelector('img');if(img)Object.assign(img.style,{width:'100%',height:'100%',left:'0',top:'0',objectFit:'cover',objectPosition:current().photoPosition});}
function pickOpponents(random=true){
 if(mode==='crown'){opponents=rivalsFor(activeRun(career)||{hero:selected,mate,division,round:0});return;}
 // Early matches teach the fundamentals before the elite shooters enter the pool.
 const tier=progress.wins<3?['aziom','guest']:progress.wins<6?['demidok','aziom','guest']:progress.wins<10?['gabar','demidok','aziom']:progress.wins<15?['kempil','gabar','demidok']:['laika','kempil','gabar'];
 let pool=tier.filter(id=>id!==selected&&id!==mate);
 for(const id of ['guest','piniv','aziom','demidok','gabar'])if(pool.length<2&&!pool.includes(id)&&id!==selected&&id!==mate)pool.push(id);
 if(random)for(let i=pool.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
 opponents=pool.slice(0,2);
}
function render(){
 if(mode==='crown'){const r=activeRun(career);if(r){selected=r.hero;mate=r.mate;division=r.division;}pickOpponents(false);}
 const p=current(),locked=!available(p.id),gate=UNLOCKS.find(g=>g.id===p.id),next=nextUnlock(progress);
 $('featured').style.setProperty('--accent',p.color);
 $('featured').innerHTML=`<img class="feature-photo" src="${p.photo}" alt="${p.name}" style="object-position:${p.photoPosition}"><div class="feature-shade"></div><div class="rating-badge"><b>${p.ovr}</b><small>ОБЩ</small></div><span class="card-series">${locked?'ЦЕЛЬ · '+gate.wins+' ПОБЕД':trophyTitle(career,p.id)||'СВОЯ ЛИГА · 2×2'}</span><div class="card-bottom"><span class="card-role">${p.role}</span><h2 class="card-name">${p.name}</h2><div class="card-sub">${p.height} рост <span aria-hidden="true">·</span> № ${String(p.number).padStart(2,'0')}</div><div class="stats-grid">${Object.entries(STAT_LABELS).map(([key,label])=>`<div class="stat"><strong>${p.stats[key]}</strong><span>${label}</span></div>`).join('')}</div></div>`;
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
 storage.set('svoya-liga-team',{selected,mate});renderLeague();
}
function choose(id){
 inspected=id;
 if(!available(id)){render();return;}
 if(mode==='crown'&&activeRun(career)){toast('Состав закреплён до конца серии. Новый герой — в следующем забеге.');render();return;}
 if(role==='player'){if(id==='mate')return;if(id===mate)mate=selected;selected=id;}
 else{if(id===selected){toast('Этот игрок уже у тебя. Выбери другого напарника.');render();return;}mate=id;}
 if(opponents.some(o=>o===selected||o===mate))pickOpponents(false);render();
}
function showModal(content,onClose=null){modalClose=onClose;$('modal-content').innerHTML=content;if(!$('modal').open)$('modal').showModal();}
function closeModal(){if($('modal').open)$('modal').close();const fn=modalClose;modalClose=null;fn?.();}
$('close-modal').addEventListener('click',closeModal);$('modal').addEventListener('cancel',e=>{e.preventDefault();closeModal();});
for(const kind of ['player','mate'])$('role-'+kind).addEventListener('click',()=>{role=kind;inspected=kind==='player'?selected:mate;render();});
$('shuffle').addEventListener('click',()=>{pickOpponents();render();});
for(const name of ['crown','quick'])$('mode-'+name).addEventListener('click',()=>{mode=name;storage.set('svoya-liga-mode',mode);pickOpponents(false);render();});
$('help').addEventListener('click',()=>showModal(`<p class="eyebrow">ТВОЯ ПЕРВАЯ ИГРА</p><h2>Создай свой момент.</h2><ul><li>Слева — движение, справа — действия. Нажми ↻ для горизонтального режима, даже если автоповорот телефона выключен.</li><li><b>Бросок:</b> остановись, зажми кнопку и отпусти в зелёной зоне. Защитник, движение, усталость и большая дистанция снижают точность. Даже точный выпуск не гарантирует трёшку.</li><li><b>Обман:</b> быстро коснись броска — герой покажет замах. Соперник может прыгнуть, открыв проход.</li><li><b>Финт:</b> смени ведущую руку перед защитником и выбери другую сторону прохода. У сильных дриблёров движение быстрее восстанавливается.</li><li><b>Данк:</b> разгонись к кольцу, удержи бросок и отпусти в точный момент, когда кнопка показывает «ДАНК». Вид завершения зависит от захода и героя. Если не хватает прыжка или пространства, получится проход с броском.</li><li><b>Рывок:</b> короткое ускорение за выносливость. Есть перерыв между рывками; остановка восстанавливает силы.</li><li><b>Заслон:</b> с мячом подойди к защитнику и нажми «ЗАСЛОН». Дождись, пока напарник остановится у отметки, обойди его и ищи пас под кольцо. Кнопка не останавливает соперника сама по себе.</li><li><b>Пас:</b> передай напарнику или попроси мяч у него. Не отдавай через защитника. Лови передачу на свободном месте для прибавки к точности.</li><li><b>Защита:</b> блокируй во время выпуска мяча. Перехват делай рядом с соперником; неудачный отбор на мгновение замедлит тебя.</li><li><b>Супер:</b> заряжается со временем и за удачные действия. Особый приём усиливает героя, но не отменяет выбор момента.</li><li><b>Король площадки:</b> выиграй три матча подряд до 7 очков или за 90 секунд. Между победами выбирай усиления на серию. Титулы открывают лиги и пополняют коллекцию трофеев каждого героя. После поражения можно начать новую серию.</li><li>Обычный матч длится 3 минуты. В обоих режимах — 24 секунды на атаку, при ничьей до следующего попадания. Каждая доигранная победа открывает героев: 1 / 3 / 6 / 10 / 15.</li></ul><p>Компьютер: WASD / стрелки, пробел — бросок, E — пас, Shift — рывок, Q — супер, F — финт, G — заслон, C — камера, R — поворот.</p><p class="small-note">Прогресс сохраняется в этом браузере. Начатый и брошенный матч не считается победой.</p>`));
async function launch(){
 if(mode==='crown'&&activeRun(career)?.phase==='draft'){showDraft();return;}
 if(!isUnlocked(selected,progress))selected='piniv';
 $('play').disabled=true;$('play').textContent='ГОТОВИМ ПЛОЩАДКУ…';
 try{if(!game){const {CourtGame}=await import('./game.js?v=0.5.0');game=new CourtGame($('court'),{onPause:pause,onEnd:finish,onError:message=>showModal('<h2>Матч на паузе</h2><p>'+message+'</p>',returnMenu)});}
  let options={title:trophyTitle(career,selected)};
  if(mode==='crown'){if(!activeRun(career))career=createRun(career,{hero:selected,mate,division});const r=activeRun(career);if(!r)throw Error('Не удалось начать серию');selected=r.hero;mate=r.mate;opponents=rivalsFor(r);career=markPlaying(career);saveCareer();options={mode:'crown',round:r.round,badges:r.badges,matchId:matchKey(r),title:trophyTitle(career,selected)};}
  $('menu').classList.add('hidden');$('game-screen').classList.remove('hidden');window.scrollTo(0,0);game.start([byId(selected),byId(mate),...opponents.map(byId)],options);
  if(new URLSearchParams(location.search).has('debug'))window.__courtGame=game;
 }catch(error){console.error(error);returnMenu();showModal('<h2>Не удалось открыть площадку</h2><p>Попробуй открыть игру в Safari или Chrome обычной вкладкой. Если проблема повторяется, обнови браузер.</p>');}
 finally{$('play').disabled=false;renderLeague();}
}
$('play').addEventListener('click',launch);
function pause(){if(!game?.running||game.paused)return;game.setPaused(true);showModal(`<p class="eyebrow">ТАЙМ-АУТ</p><h2>Переведём дыхание.</h2><p><b>${game.user.definition.name} · ${game.user.definition.super.name}</b><br>${game.user.definition.super.description}</p><button id="resume" class="primary">ПРОДОЛЖИТЬ <span>↗</span></button><button id="leave" class="secondary">${game.matchMode==='crown'?'В меню · сохранить серию':'К выбору игроков'}</button>${game.matchMode==='crown'?'<p class="pause-save-note">Раунды и усиления сохранятся. Текущий матч начнётся заново.</p>':''}`,()=>game?.setPaused(false));$('resume').addEventListener('click',closeModal);$('leave').addEventListener('click',()=>{modalClose=null;closeModal();returnMenu();});}
$('pause').addEventListener('click',pause);
function returnMenu(){game?.stop();game?.display.exit();$('game-screen').classList.add('hidden');$('menu').classList.remove('hidden');render();}
function finish(result){
 const reward=recordResult(progress,result);progress=reward.progress;
 if(reward.awarded&&!writeProgress(disk,progress))toast('Браузер не сохранил прогресс. Он останется до закрытия вкладки.');
 if(result.mode==='crown'){const round=recordRound(career,result);career=round.career;saveCareer();if(round.awarded)showRoundResult(result,reward,round.newTrophy);else returnMenu();return;}
 const next=nextUnlock(progress),opened=reward.unlocked.map(byId),nextText=next?`До ${byId(next.id).name}: ещё ${next.wins-progress.wins} побед.`:'Все герои открыты!';
 const rewardHTML=opened.length?`<div class="unlock-reward"><span>НОВЫЙ ИГРОК</span><b>${opened.map(p=>p.name).join(', ')}</b><p>Открыт за ${progress.wins} ${progress.wins===1?'победу':progress.wins<5?'победы':'побед'}. Теперь его можно выбрать.</p></div>`:`<p class="result-progress">Побед: <b>${progress.wins}</b> · ${nextText}</p>`;
 showModal(`<p class="eyebrow result-title">ФИНАЛЬНЫЙ СВИСТОК АСКАРА</p><h2 class="result-title">${result.won?'Это ваша игра.':'Следующая будет вашей.'}</h2><div class="result-score">${result.score[0]} : ${result.score[1]}</div><div class="result-stats"><div><b>${result.user.points}</b>ТВОИ ОЧКИ</div><div><b>${result.user.made}/${result.user.shots}</b>ПОПАДАНИЯ</div><div><b>${result.user.rebounds}</b>ПОДБОРЫ</div></div>${rewardHTML}<button id="again" class="primary">${opened.length?'ИГРАТЬ ЗА '+opened[0].name.toUpperCase():'ЕЩЁ МАТЧ'} <span>↗</span></button><button id="roster-back" class="secondary">Выбрать другую команду</button>`,returnMenu);
 $('again').addEventListener('click',()=>{if(opened.length){selected=opened[0].id;if(mate===selected)mate='mate';inspected=selected;}pickOpponents();render();modalClose=null;closeModal();launch();});$('roster-back').addEventListener('click',()=>{pickOpponents();closeModal();});
}
function saveCareer(){if(!writeLeague(disk,career))toast('Серия сохранится только до закрытия вкладки: браузер запретил сохранения.');}
function renderLeague(){
 const r=activeRun(career),d=divisionById(r?.division||division),crown=mode==='crown';
 document.body.classList.toggle('crown-selected',crown);$('crown-hub').classList.toggle('hidden',!crown);
 for(const name of ['crown','quick'])$('mode-'+name).setAttribute('aria-pressed',String(mode===name));
 $('shuffle').classList.toggle('hidden',crown);$('match-rule').textContent=crown?'ДО 7 ОЧКОВ · 90 СЕКУНД':'3 МИНУТЫ · ДВА КОЛЬЦА';
 $('play').innerHTML=(crown?(r?.phase==='draft'?'ВЫБРАТЬ УСИЛЕНИЕ':r?`ПРОДОЛЖИТЬ · ${r.round+1}/3`:'НАЧАТЬ СЕРИЮ'):'НА ПЛОЩАДКУ')+' <span>↗</span>';
 if(!crown)return;
 $('crown-hub').innerHTML=`<div class="crown-heading"><div><p class="eyebrow">ТРИ ПОБЕДЫ. ОДИН ТИТУЛ.</p><h2>Король площадки</h2><p class="crown-intro">Создай свою связку усилений и забери кубок.</p></div><button id="trophies" class="trophy-button" aria-label="Открыть коллекцию трофеев"><span>♛</span><b>${collectionCount(career)} / 18</b><small>ТРОФЕИ</small></button></div><div class="league-levels" role="group" aria-label="Уровень турнира">${DIVISIONS.map(level=>`<button data-division="${level.id}" aria-pressed="${level.id===d.id}" class="${divisionUnlocked(level.id,career)?'':'level-locked'}">${level.medal} · ${level.name}${divisionUnlocked(level.id,career)?'':` <small>${level.need} ${level.need===1?'титул':'титула'}</small>`}</button>`).join('')}</div><ol class="run-road">${[0,1,2].map(i=>{const sample={hero:r?.hero||selected,mate:r?.mate||mate,division:d.id,round:i},done=r&&i<r.round,score=r?.results[i];return `<li class="${done?'done':i===(r?.round||0)?'current':''}"><b>${done?'✓':String(i+1).padStart(2,'0')}</b><span>${i===2?'ФИНАЛ':i===1?'ПОЛУФИНАЛ':'РАЗМИНКА'}<small>${rivalsFor(sample).map(id=>byId(id).name).join(' + ')}</small></span>${score?`<em>${score[0]}:${score[1]}</em>`:''}</li>`;}).join('')}</ol><div class="crown-bottom"><p>${r?.badges.length?r.badges.map(id=>`<span class="badge-chip">${badgeById(id).name}</span>`).join(''):r?.phase==='draft'?'Победа! Выбери усиление перед следующим матчем.':`Титулов: <b>${career.crowns}</b> · Усиление после каждой из первых двух побед.`}</p>${r?'<button id="reset-run" class="text-button">Новая серия ↻</button>':''}</div>`;
 $('trophies').addEventListener('click',showTrophies);
 for(const button of $('crown-hub').querySelectorAll('[data-division]'))button.addEventListener('click',()=>{const id=button.dataset.division;if(r){toast('Заверши текущую серию или начни новую.');return;}if(!divisionUnlocked(id,career)){const level=divisionById(id);toast(`Для этой лиги нужно титулов: ${level.need}. Сейчас: ${career.crowns}.`);return;}division=id;storage.set('svoya-liga-division',id);pickOpponents(false);render();});
 $('reset-run')?.addEventListener('click',()=>{showModal('<p class="eyebrow">НОВАЯ ПОПЫТКА</p><h2>Начать серию заново?</h2><p>Раунды и усиления текущего забега сбросятся. Открытые герои и полученные трофеи останутся.</p><button id="confirm-reset-run" class="primary">НОВАЯ СЕРИЯ <span>↗</span></button><button id="keep-run" class="secondary">Продолжить текущую</button>');$('keep-run').addEventListener('click',closeModal);$('confirm-reset-run').addEventListener('click',()=>{career=abandonRun(career);saveCareer();closeModal();render();});});
}
function showTrophies(){
 showModal(`<p class="eyebrow">ТВОЯ КОЛЛЕКЦИЯ · ${collectionCount(career)}/18</p><h2>Титул для каждого.</h2><p class="trophy-intro">Выиграй три матча подряд одним героем. Его лучший титул появится на карточке и во время игры.</p><div class="trophy-table"><div class="trophy-row trophy-head"><span>ГЕРОЙ</span>${DIVISIONS.map(d=>`<span>${d.medal}</span>`).join('')}</div>${[...PLAYERS].reverse().map(p=>`<div class="trophy-row"><b>${p.name}</b>${DIVISIONS.map(d=>{const n=career.trophies[p.id+'-'+d.id]||0;return `<span class="trophy-cell ${n?'earned':''}" style="--metal:${d.color}" aria-label="${p.name}, ${d.medal}: ${n?'завоёвано '+n:'не получено'}"><i>${n?'♛':'◇'}</i><small>${n?'×'+n:'—'}</small></span>`;}).join('')}</div>`).join('')}</div>`);
}
function showDraft(){
 const r=activeRun(career);if(!r||r.phase!=='draft')return;
 const score=r.results.at(-1);showModal(`<div class="draft-header"><p class="eyebrow">ПОБЕДА ${score[0]}:${score[1]} · ДАЛЬШЕ МАТЧ ${r.round+1}/3</p><h2>Выбери свой стиль.</h2><p>Усиление работает у вашей команды до конца серии. Выбор сразу запускает следующий матч.</p></div><div class="draft-choices">${r.offers.map(id=>{const b=badgeById(id);return `<button class="draft-card" data-badge="${b.id}" aria-label="Выбрать усиление ${b.name}"><span class="draft-icon">${b.icon}</span><small>${b.tag}</small><b>${b.name}</b><p>${b.description}</p><span class="draft-pick">ВЫБРАТЬ ↗</span></button>`;}).join('')}</div><button id="draft-later" class="secondary">Сохранить выбор на потом</button>`,returnMenu);
 for(const button of $('modal-content').querySelectorAll('[data-badge]'))button.addEventListener('click',()=>{const next=chooseBadge(career,button.dataset.badge);if(next.active?.phase!=='ready')return;career=next;saveCareer();modalClose=null;closeModal();launch();});
 $('draft-later').addEventListener('click',closeModal);
}
function showRoundResult(result,reward,newTrophy){
 const r=career.active,d=divisionById(r.division),win=result.won,champion=r.phase==='won',opened=reward.unlocked.map(id=>byId(id).name),newLeague=champion?DIVISIONS.find(level=>level.need===career.crowns):null;
 const title=champion?d.title:win?'Ещё шаг к титулу.':'Серия завершена.';
 const extra=champion?`<div class="crown-reward"><span>♛</span><div><small>${newTrophy?'НОВЫЙ ТРОФЕЙ':'ТИТУЛ ЗАЩИЩЁН'} · ${d.medal}</small><b>${byId(r.hero).name}</b><p>${newLeague?'Открыта лига «'+newLeague.name+'».':'Трофеев в коллекции: '+collectionCount(career)+'/18.'}</p></div></div>`:`<p class="result-progress">${win?`Побед в серии: ${r.round}/3. Выбери усиление перед следующим матчем.`:`Побед в этой серии: ${r.round}/3. Попробуй другой розыгрыш или героя.`}</p>`;
 showModal(`<p class="eyebrow result-title">КОРОЛЬ ПЛОЩАДКИ · ${d.name}</p><h2 class="result-title">${title}</h2><div class="result-score">${result.score[0]} : ${result.score[1]}</div><div class="result-stats"><div><b>${result.user.points}</b>ОЧКИ</div><div><b>${result.user.assists}</b>ПЕРЕДАЧИ</div><div><b>${result.user.blocks+result.user.steals}</b>БЛОКИ / ОТБОРЫ</div></div>${extra}${opened.length?`<p class="round-unlock">Открыт новый герой: ${opened.join(', ')}.</p>`:''}<button id="round-next" class="primary">${r.phase==='draft'?'ВЫБРАТЬ УСИЛЕНИЕ':'НОВАЯ СЕРИЯ'} <span>↗</span></button><button id="round-menu" class="secondary">В меню</button>`,returnMenu);
 $('round-next').addEventListener('click',()=>{modalClose=null;closeModal();if(r.phase==='draft')showDraft();else launch();});$('round-menu').addEventListener('click',closeModal);
}
async function openPreview(){
 const p=current();$('model-name').textContent=p.name;$('model-modal').showModal();
 try{const [T,M]=await Promise.all([import('../vendor/three.module.min.js'),import('./models.js?v=0.5.0')]);if(!$('model-modal').open)return;const canvas=$('model-canvas');const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
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
