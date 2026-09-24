// Shared by every shooter. No separate accuracy multiplier for the opponent.
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const RELEASE_CENTER = .72;

export function shotProfile({rating, distance, kind = 'mid', timing = RELEASE_CENTER, contest = 0, movement = 0, stamina = 100, settled = 1, boost = 0, catchBonus = false, releaseAid = 0}) {
  rating = clamp(rating, 1, 99);
  contest = clamp(contest, 0, 1);
  movement = clamp(movement, 0, 1);
  const fatigue = 1 - clamp(stamina, 0, 100) / 100;
  releaseAid = clamp(releaseAid, 0, .012);
  const greenWidth = clamp(.044 + rating * .00026 - contest * .023 - fatigue * .018 + releaseAid, .027, .085);
  const error = Math.abs(timing - RELEASE_CENTER);
  const quality = Math.exp(-Math.pow(error / ((kind === 'layup' || kind === 'dunk' ? .235 : .185) + releaseAid * 2.3), 2));
  const ceilings = {three: .12 + rating * .0046, mid: .23 + rating * .0053, layup: .44 + rating * .0042, dunk: .48 + rating * .0046};
  let chance = (ceilings[kind] ?? ceilings.mid) * (.035 + .965 * quality);
  chance *= 1 - contest * (kind === 'dunk' ? .55 : .76);
  chance *= 1 - movement * (kind === 'layup' || kind === 'dunk' ? .10 : .43);
  chance *= 1 - fatigue * .32;
  if (kind === 'mid' || kind === 'three') chance *= .83 + .17 * clamp(settled / .28, 0, 1);
  chance *= Math.exp(-Math.max(0, distance - (kind === 'three' ? 6.9 : 5.3)) * .39);
  // Supers reward a good release; they cannot rescue a tap or guarantee a basket.
  chance += boost * quality * (1 - contest * .7);
  if (catchBonus && (kind === 'mid' || kind === 'three')) chance += .035 * quality * (1 - contest);
  const cap = kind === 'three' ? .68 : kind === 'dunk' ? .94 : .90;
  chance = clamp(chance, .003, cap);
  return {chance, quality, greenWidth, center: RELEASE_CENTER, perfect: error <= greenWidth,
    release: error <= greenWidth ? 'Точный выпуск' : timing < RELEASE_CENTER ? 'Рано' : 'Поздно',
    pressure: contest > .55 ? 'Плотная защита' : contest > .2 ? 'Под давлением' : 'Свободно'};
}

export function botRelease(rating, random = Math.random) {
  // A broad, triangular spread includes early/late releases at every rating.
  return clamp(RELEASE_CENTER + (random() + random() - 1) * (.35 - rating * .0011), .13, .99);
}

export function distanceToSegment(point, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = clamp(((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t);
}
