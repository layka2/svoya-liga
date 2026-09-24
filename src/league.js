import {PLAYERS} from './roster.js?v=0.5.0';

export const LEAGUE_KEY='svoya-liga-crown-v1';
export const DIVISIONS=[
 {id:'yard',name:'Двор',medal:'Бронза',title:'Король двора',need:0,color:'#d9a276',rivals:[['aziom','guest'],['demidok','aziom'],['gabar','demidok']]},
 {id:'school',name:'Лицей',medal:'Серебро',title:'Король лицея',need:1,color:'#c2d3d6',rivals:[['demidok','aziom'],['gabar','guest'],['kempil','gabar']]},
 {id:'legend',name:'Легенды',medal:'Золото',title:'Легенда площадки',need:3,color:'#e3c579',rivals:[['gabar','demidok'],['kempil','gabar'],['laika','kempil']]}
];
export const BADGES=[
 {id:'catch',name:'Лови и бросай',tag:'КОМАНДА',icon:'↗',description:'Точный бросок сразу после передачи получает до +6% к шансу попадания.'},
 {id:'step',name:'Первый шаг',tag:'ПРОХОД',icon:'»',description:'Рывок в течение 1,5 с после финта длится на 0,2 с дольше и стоит на 4 силы меньше.'},
 {id:'steady',name:'Спокойная кисть',tag:'БРОСОК',icon:'◎',description:'После остановки на 0,3 с окно точного среднего или дальнего броска шире.'},
 {id:'rebound',name:'Второй шанс',tag:'ПОД КОЛЬЦОМ',icon:'↥',description:'Точный бросок вблизи кольца в течение 3 с после подбора в атаке получает до +8%.'},
 {id:'defense',name:'Чистая защита',tag:'ЗАЩИТА',icon:'Ⅱ',description:'Успешный блок или перехват дополнительно возвращает 10 сил и 12% суперприёма.'},
 {id:'rest',name:'Запас сил',tag:'ВЫНОСЛИВОСТЬ',icon:'+',description:'Когда стоишь или медленно идёшь, выносливость восстанавливается на 50% быстрее.'}
];
const heroes=PLAYERS.map(p=>p.id),badgeIds=BADGES.map(b=>b.id),phases=['ready','playing','draft','won','lost'];
const count=v=>Number.isSafeInteger(v)&&v>=0?Math.min(v,1000000):0;
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v);
const scoreOK=s=>Array.isArray(s)&&s.length===2&&s.every(v=>Number.isSafeInteger(v)&&v>=0&&v<=500)&&s[0]!==s[1];
export const divisionById=id=>DIVISIONS.find(d=>d.id===id);
export const badgeById=id=>BADGES.find(b=>b.id===id);
export const matchKey=run=>`${run.id}-round-${run.round}`;
export const activeRun=career=>career?.active&&['ready','playing','draft'].includes(career.active.phase)?career.active:null;
export const divisionUnlocked=(id,career)=>!!divisionById(id)&&career.crowns>=divisionById(id).need;
export const collectionCount=career=>Object.values(career.trophies).filter(v=>v>0).length;
export function trophyTitle(career,hero){return [...DIVISIONS].reverse().find(d=>career.trophies[`${hero}-${d.id}`]>0)?.title||'';}

function randomFrom(seed){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
export function draftChoices(seed,round,taken=[]){
 const rng=randomFrom((seed+round*9937)>>>0),pool=badgeIds.filter(id=>!taken.includes(id));
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
 return pool.slice(0,3);
}
function normalizeRun(r){
 if(!r||!validId(r.id)||!heroes.includes(r.hero)||!(heroes.includes(r.mate)||r.mate==='mate')||r.hero===r.mate||!divisionById(r.division)||!phases.includes(r.phase)||!Number.isInteger(r.round)||r.round<0||r.round>2)return null;
 const badges=Array.isArray(r.badges)?r.badges:[],results=Array.isArray(r.results)?r.results:[];
 if(badges.some(id=>!badgeIds.includes(id))||new Set(badges).size!==badges.length||results.some(s=>!scoreOK(s)))return null;
 const finished=r.phase==='won'||r.phase==='lost',expectedResults=r.round+(finished?1:0),expectedBadges=r.round-(r.phase==='draft'?1:0);
 if(results.length!==expectedResults||badges.length!==expectedBadges||r.phase==='draft'&&r.round===0)return null;
 if(results.slice(0,r.phase==='lost'?-1:undefined).some(s=>s[0]<=s[1])||r.phase==='lost'&&results.at(-1)[0]>=results.at(-1)[1]||r.phase==='won'&&r.round!==2)return null;
 const seed=Number.isSafeInteger(r.seed)?r.seed>>>0:1;
 return {id:r.id,hero:r.hero,mate:r.mate,division:r.division,round:r.round,phase:r.phase,seed,badges:[...badges],results:results.map(s=>[...s]),offers:r.phase==='draft'?draftChoices(seed,r.round,badges):[]};
}
export function normalizeLeague(value){
 const trophies={};for(const hero of heroes)for(const d of DIVISIONS){const key=`${hero}-${d.id}`,n=count(value?.trophies?.[key]);if(n)trophies[key]=n;}
 const crowns=Object.values(trophies).reduce((a,b)=>a+b,0),career={version:1,crowns,trophies,runs:Math.max(crowns,count(value?.runs)),bestRound:Math.min(3,count(value?.bestRound)),completed:Array.isArray(value?.completed)?value.completed.filter(validId).slice(-40):[],active:normalizeRun(value?.active)};
 if(career.active&&!divisionUnlocked(career.active.division,career))career.active=null;
 return career;
}
export function readLeague(storage){try{return normalizeLeague(JSON.parse(storage.getItem(LEAGUE_KEY)));}catch{return normalizeLeague(null);}}
export function writeLeague(storage,career){try{storage.setItem(LEAGUE_KEY,JSON.stringify(normalizeLeague(career)));return true;}catch{return false;}}
export function createRun(career,{hero,mate='mate',division='yard',seed=Date.now(),id=`run-${Date.now()}-${Math.random().toString(36).slice(2,9)}`}){
 const next=normalizeLeague(career);if(activeRun(next)||!divisionUnlocked(division,next)||!heroes.includes(hero)||!(mate==='mate'||heroes.includes(mate))||hero===mate||!validId(id)||next.completed.includes(id))return next;
 next.active={id,hero,mate,division,seed:seed>>>0,round:0,phase:'ready',badges:[],results:[],offers:[]};return next;
}
export function markPlaying(career){const next=normalizeLeague(career);if(next.active?.phase==='ready')next.active.phase='playing';return next;}
export function chooseBadge(career,id){
 const next=normalizeLeague(career),r=next.active;if(r?.phase!=='draft'||!r.offers.includes(id)||r.badges.includes(id))return next;
 r.badges.push(id);r.offers=[];r.phase='ready';return next;
}
export function recordRound(career,result){
 const next=normalizeLeague(career),r=next.active;
 if(r?.phase!=='playing'||!result?.completed||result.mode!=='crown'||result.matchId!==matchKey(r)||!scoreOK(result.score)||next.completed.includes(r.id))return {career:next,awarded:false,newTrophy:false};
 r.results.push([...result.score]);const won=result.score[0]>result.score[1];
 if(won)next.bestRound=Math.max(next.bestRound,r.round+1);
 if(won&&r.round<2){r.round++;r.phase='draft';r.offers=draftChoices(r.seed,r.round,r.badges);}
 else{
  r.phase=won?'won':'lost';next.runs++;next.completed.push(r.id);next.completed=next.completed.slice(-40);
  if(won){const key=`${r.hero}-${r.division}`,newTrophy=!next.trophies[key];next.trophies[key]=(next.trophies[key]||0)+1;next.crowns++;return {career:next,awarded:true,newTrophy};}
 }
 return {career:next,awarded:true,newTrophy:false};
}
export function abandonRun(career){const next=normalizeLeague(career);if(activeRun(next)){next.runs++;next.completed=[...next.completed,next.active.id].slice(-40);}next.active=null;return next;}
export function rivalsFor(run){
 const preferred=divisionById(run.division).rivals[run.round],fallback=run.division==='yard'?['gabar','demidok','aziom','guest','piniv','kempil','laika']:['laika','kempil','gabar','demidok','aziom','guest','piniv'];
 return [...new Set([...preferred,...fallback])].filter(id=>id!==run.hero&&id!==run.mate).slice(0,2);
}
