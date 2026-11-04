import { RULES, WORLD, ZONES, TERRAIN } from './config.js';
import { rarityOf } from './equipment.js';

export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const tier = value => Math.log2(value);
export const isPowerOfTwo = value => Number.isInteger(value) && value > 0 && Number.isInteger(Math.log2(value));
export const canMerge = (a, b) => isPowerOfTwo(a) && a === b && a < RULES.maxValue;
export const zoneAt = (x, zones = ZONES) => zones.find(z => x >= z.from && x < z.to) || zones[zones.length-1];
export const maxEnemyHealth = () => 100;
export function damageFraction(attackerValue, defenderValue) {
  if (!isPowerOfTwo(attackerValue) || !isPowerOfTwo(defenderValue)) return 0;
  const gap = tier(attackerValue) - tier(defenderValue);
  if (gap === 0) return RULES.equalDamageFraction;
  return gap > 0 ? 1 - 2 ** -gap : 2 ** (gap - 1);
}
export function attackDamage(attackerValue, defenderValue, targetMaxHp = 100, rarity = 'white') {
  return Math.max(0, targetMaxHp) * damageFraction(attackerValue, defenderValue) * rarityOf(rarity).multiplier;
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
export function isFree(x, y, radius, obstacles, bounds = WORLD) {
  return x >= radius && y >= radius && x <= bounds.width - radius && y <= bounds.height - radius &&
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
export function moveEntity(entity, dx, dy, obstacles, bounds = WORLD) {
  const r = entity.radius || RULES.playerRadius;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (r / 2)));
  for (let i=0; i<steps; i++) {
    const x = clamp(entity.x + dx/steps, r, bounds.width-r);
    if (isFree(x, entity.y, r, obstacles, bounds)) entity.x = x;
    const y = clamp(entity.y + dy/steps, r, bounds.height-r);
    if (isFree(entity.x, y, r, obstacles, bounds)) entity.y = y;
  }
}

export function segmentCircleFraction(a, b, center, radius) {
  const x = a.x - center.x, y = a.y - center.y;
  const dx = b.x - a.x, dy = b.y - a.y;
  const c = x * x + y * y - radius * radius;
  if (c <= 0) return 0;
  const aa = dx * dx + dy * dy;
  if (aa === 0) return Infinity;
  const bb = 2 * (x * dx + y * dy);
  const discriminant = bb * bb - 4 * aa * c;
  if (discriminant < 0) return Infinity;
  const t = (-bb - Math.sqrt(discriminant)) / (2 * aa);
  return t >= 0 && t <= 1 ? t : Infinity;
}

export function firstWallFraction(a, b, obstacles, pad = 0) {
  let nearest = Infinity;
  for (const o of obstacles) {
    let lo = 0, hi = 1;
    for (const [p, d, min, max] of [[a.x, b.x-a.x, o.x-pad, o.x+o.w+pad], [a.y, b.y-a.y, o.y-pad, o.y+o.h+pad]]) {
      if (Math.abs(d) < 1e-8) {
        if (p < min || p > max) { lo = Infinity; break; }
      } else {
        let t1 = (min-p)/d, t2 = (max-p)/d;
        if (t1 > t2) [t1,t2] = [t2,t1];
        lo = Math.max(lo,t1); hi = Math.min(hi,t2);
        if (lo > hi) { lo = Infinity; break; }
      }
    }
    nearest = Math.min(nearest, lo);
  }
  return nearest;
}

export function inAttackArc(origin, target, angle, arc, range) {
  const delta = Math.atan2(target.y-origin.y, target.x-origin.x) - angle;
  const wrapped = Math.atan2(Math.sin(delta), Math.cos(delta));
  return distance(origin, target) <= range + (target.radius || 0) && Math.abs(wrapped) <= arc / 2;
}

export function terrainAt(entity, terrain = []) {
  let selected=null;
  for(const patch of terrain){
    if(entity.x<patch.x||entity.x>patch.x+patch.w||entity.y<patch.y||entity.y>patch.y+patch.h)continue;
    const info=TERRAIN[patch.kind];if(!info)continue;
    if(!selected||info.priority>selected.priority||(info.priority===selected.priority&&info.speed<selected.speed))selected={...info,kind:patch.kind};
  }
  return selected;
}
export const terrainSpeed = (entity,terrain=[]) => terrainAt(entity,terrain)?.speed ?? 1;
