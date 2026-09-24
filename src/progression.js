export const PROGRESS_KEY = 'svoya-liga-progress-v1';
export const UNLOCKS = [
  {id:'piniv', wins:0}, {id:'aziom', wins:1}, {id:'demidok', wins:3},
  {id:'gabar', wins:6}, {id:'kempil', wins:10}, {id:'laika', wins:15}
];
const integer = v => Number.isSafeInteger(v) && v >= 0 ? Math.min(v, 1000000) : 0;
export function normalizeProgress(value) {
  const matches = integer(value?.matches), wins = Math.min(integer(value?.wins), matches);
  return {version:1, matches, wins, completed:Array.isArray(value?.completed) ? value.completed.filter(v=>typeof v === 'string').slice(-40) : []};
}
export function readProgress(storage) {
  try {
    const current = JSON.parse(storage.getItem(PROGRESS_KEY));
    if (current?.version === 1) return normalizeProgress(current);
    // Existing completed wins count, but the old freely selected team grants nothing.
    return normalizeProgress(JSON.parse(storage.getItem('svoya-liga-results')));
  } catch { return normalizeProgress(null); }
}
export function isUnlocked(id, progress) {
  const gate = UNLOCKS.find(g=>g.id === id);
  return !!gate && progress.wins >= gate.wins;
}
export const nextUnlock = progress => UNLOCKS.find(g=>g.wins > progress.wins) ?? null;
export function recordResult(progress, result) {
  const before = normalizeProgress(progress), score = result?.score;
  if (!result?.completed || typeof result.matchId !== 'string' || !result.matchId || before.completed.includes(result.matchId)
    || !Array.isArray(score) || score.length !== 2 || !score.every(v=>Number.isSafeInteger(v) && v >= 0) || score[0] === score[1]) {
    return {progress:before, unlocked:[], awarded:false};
  }
  const after = {...before, matches:before.matches+1, wins:before.wins + (score[0] > score[1] ? 1 : 0), completed:[...before.completed,result.matchId].slice(-40)};
  return {progress:after, unlocked:UNLOCKS.filter(g=>g.wins > before.wins && g.wins <= after.wins).map(g=>g.id), awarded:true};
}
export function writeProgress(storage, progress) {
  try { storage.setItem(PROGRESS_KEY, JSON.stringify(progress)); return true; } catch { return false; }
}
