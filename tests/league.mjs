import assert from 'node:assert/strict';
import {BADGES,DIVISIONS,LEAGUE_KEY,normalizeLeague,readLeague,writeLeague,activeRun,createRun,markPlaying,chooseBadge,recordRound,abandonRun,divisionUnlocked,rivalsFor,matchKey,collectionCount,trophyTitle} from '../src/league.js';

let career=normalizeLeague(null);assert.equal(career.crowns,0);assert(!activeRun(career));assert(divisionUnlocked('yard',career));assert(!divisionUnlocked('school',career));
assert(!createRun(career,{hero:'piniv',division:'school'}).active);assert(!createRun(career,{hero:'missing'}).active);assert(!createRun(career,{hero:'piniv',mate:'piniv'}).active);
const mem=new Map(),disk={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v)};
function finishRound(c,win=true){return recordRound(c,{completed:true,mode:'crown',matchId:matchKey(c.active),score:win?[8,4]:[4,7]});}
for(let attempt=1;attempt<=3;attempt++){
 career=createRun(career,{hero:'piniv',division:'yard',seed:71+attempt,id:'run-'+attempt});assert.equal(career.active.phase,'ready');assert.equal(career.active.badges.length,0);
 for(let round=0;round<3;round++){
  assert.equal(career.active.round,round);assert.equal(career.active.badges.length,round);career=markPlaying(career);
  for(const altered of [{completed:false},{mode:'quick'},{matchId:'unrelated'},{score:[7,7]}])assert(!recordRound(career,{completed:true,mode:'crown',matchId:matchKey(career.active),score:[7,3],...altered}).awarded);
  const outcome=finishRound(career);assert(outcome.awarded);career=outcome.career;assert(!finishRound(career).awarded,'A repeated result cannot award a round or trophy');
  if(round<2){
   assert.equal(career.active.phase,'draft');assert.equal(career.active.offers.length,3);assert.equal(new Set(career.active.offers).size,3);assert(career.active.offers.every(id=>!career.active.badges.includes(id)));
   const offers=[...career.active.offers];assert(writeLeague(disk,career));career=readLeague(disk);assert.deepEqual(career.active.offers,offers,'Reload must preserve the choices');
   assert.equal(chooseBadge(career,'invalid').active.phase,'draft');career=chooseBadge(career,offers[0]);assert.equal(career.active.phase,'ready');assert.equal(chooseBadge(career,offers[1]).active.badges.length,round+1);
  }else{assert.equal(career.active.phase,'won');assert.equal(outcome.newTrophy,attempt===1);}
 }
 assert.equal(career.crowns,attempt);assert.equal(career.runs,attempt);assert.equal(career.trophies['piniv-yard'],attempt);assert.equal(collectionCount(career),1);assert.equal(trophyTitle(career,'piniv'),'Король двора');
}
assert(divisionUnlocked('school',career));assert(divisionUnlocked('legend',career));assert.equal(career.bestRound,3);
career=createRun(career,{hero:'demidok',division:'legend',id:'lose-run',seed:13});career=markPlaying(career);const first=finishRound(career);career=chooseBadge(first.career,first.career.active.offers[0]);career=markPlaying(career);career=finishRound(career,false).career;
assert.equal(career.active.phase,'lost');assert.equal(career.crowns,3);assert.equal(career.runs,4);assert.equal(career.active.results.length,2);
career=createRun(career,{hero:'gabar',division:'school',id:'quit-run'});career=abandonRun(career);assert.equal(career.crowns,3);assert.equal(career.runs,5);assert(!career.active);assert.equal(abandonRun(career).runs,5);
assert(writeLeague(disk,career));assert.deepEqual(readLeague(disk),career);assert(!writeLeague({setItem(){throw Error('blocked');}},career));assert.equal(readLeague({getItem(){throw Error('blocked');}}).crowns,0);
mem.set(LEAGUE_KEY,'{bad');assert.equal(readLeague(disk).crowns,0);
for(const bad of [{hero:'unknown'},{mate:'piniv'},{round:99},{phase:'unknown'},{badges:['guaranteed_basket']},{phase:'draft',round:0}]){
 const base=createRun(normalizeLeague(null),{hero:'piniv',id:'validation'});assert(!normalizeLeague({...base,active:{...base.active,...bad}}).active);
}
for(const hero of ['laika','kempil','gabar','demidok','aziom','piniv'])for(const division of DIVISIONS)for(let round=0;round<3;round++){
 const rivals=rivalsFor({hero,mate:'mate',division:division.id,round});assert.equal(rivals.length,2);assert.equal(new Set(rivals).size,2);assert(!rivals.includes(hero));
}
assert.equal(BADGES.length,6);console.log('PASS three-round series, stable draft, defeat, replay protection, resume, trophies, division gates and unavailable storage');
