import { RULES, WORLD, ZONES } from './config.js';

export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const tier = value => Math.log2(value);
export const isPowerOfTwo = value => Number.isInteger(value) && value > 0 && Number.isInteger(Math.log2(value));
export const canMerge = (a, b) => isPowerOfTwo(a) && a === b && a < RULES.maxValue;
export const zoneAt = x => ZONES.find(z => x >= z.from && x < z.to) || ZONES[2];
export const maxEnemyHealth = value => 20 + 6 * tier(value);
export const enemyDamage = value => 12 + 4 * tier(value);
export function attackDamage(playerValue, enemyValue) {
  const gap = Math.max(0, tier(enemyValue) - tier(playerValue));
  return Math.max(2, Math.round((8 + 4 * tier(playerValue)) * Math.pow(0.55, gap)));
}
export const bagTotal = bag => bag.reduce((sum, item) => sum + item.value, 0);
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function circleRect(x, y, radius, rect) {
  const nx = clamp(x, rect.x, rect.x + rect.w);
  const ny = clamp(y, rect.y, rect.y + rect.h);
  return (x - nx) ** 2 + (y - ny) ** 2 < radius ** 2;
}
export function isFree(x, y, radius, obstacles) {
  return x >= radius && y >= radius && x <= WORLD.width - radius && y <= WORLD.height - radius &&
    !obstacles.some(o => circleRect(x, y, radius, o));
}
// Segment versus padded AABB: attacks and division cannot pass through walls.
export function lineOfSight(a, b, obstacles, pad = 0) {
  return !obstacles.some(o => {
    let lo = 0, hi = 1;
    for (const [p, d, min, max] of [[a.x, b.x-a.x, o.x-pad, o.x+o.w+pad], [a.y, b.y-a.y, o.y-pad, o.y+o.h+pad]]) {
      if (Math.abs(d) < 1e-8) { if (p < min || p > max) return false; }
      else {
        let t1 = (min-p)/d, t2 = (max-p)/d;
        if (t1 > t2) [t1,t2] = [t2,t1];
        lo = Math.max(lo,t1); hi = Math.min(hi,t2);
        if (lo > hi) return false;
      }
    }
    return true;
  });
}
// Substeps prevent dash movement tunnelling through thin obstacles.
export function moveEntity(entity, dx, dy, obstacles) {
  const r = entity.radius || RULES.playerRadius;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (r / 2)));
  for (let i=0; i<steps; i++) {
    const x = clamp(entity.x + dx/steps, r, WORLD.width-r);
    if (isFree(x, entity.y, r, obstacles)) entity.x = x;
    const y = clamp(entity.y + dy/steps, r, WORLD.height-r);
    if (isFree(entity.x, y, r, obstacles)) entity.y = y;
  }
}
