import { clamp } from './math.js';

export const MAX_RECOIL_SPEED = 720;
export const MOTION_DRAG = 18;
const RESPONSE_DURATION = { light: .24, heavy: .36, contact: .32 };

export function markImpact(raid, actor, style, angle, strength = 1) {
  const time = raid.elapsed;
  const old = actor.impactMotion;
  if (old && old.time === time && old.strength > strength) return;
  actor.impactMotion = { style, angle, strength: clamp(strength, .25, 1), time };
}

export function impactScale(motion, elapsed) {
  if (!motion) return { x: 1, y: 1, angle: 0 };
  const age = elapsed - motion.time;
  const duration = RESPONSE_DURATION[motion.style] || RESPONSE_DURATION.light;
  if (age < 0 || age >= duration) return { x: 1, y: 1, angle: motion.angle };
  const phase = age / duration;
  const amplitude = (motion.style === 'heavy' ? .27 : motion.style === 'contact' ? .23 : .15) * motion.strength;
  const squash = Math.cos(phase * Math.PI * 3.7) * (1 - phase) ** 2 * amplitude;
  return { x: 1 - squash, y: 1 + squash * .68, angle: motion.angle };
}

export function pushActor(actor, x, y, speed) {
  const n = Math.hypot(x, y);
  if (n < 1e-6 || speed <= 0) return;
  const vx = (actor.knockX || 0) + x / n * speed;
  const vy = (actor.knockY || 0) + y / n * speed;
  const factor = Math.min(1, MAX_RECOIL_SPEED / Math.hypot(vx, vy));
  actor.knockX = vx * factor;
  actor.knockY = vy * factor;
}

export function applyMomentum(raid, actor, dt, drag = MOTION_DRAG) {
  const vx = actor.knockX || 0, vy = actor.knockY || 0;
  if (Math.hypot(vx, vy) < 1) {
    actor.knockX = 0;
    actor.knockY = 0;
    return;
  }
  const x = actor.x, y = actor.y;
  raid.move(actor, vx * dt, vy * dt);
  const decay = Math.exp(-dt * drag);
  actor.knockX = Math.abs(actor.x - x - vx * dt) < .1 ? vx * decay : 0;
  actor.knockY = Math.abs(actor.y - y - vy * dt) < .1 ? vy * decay : 0;
}

export function collisionRecoil(playerValue, enemyValue) {
  const diff = clamp(Math.log2(playerValue / enemyValue), -6, 6);
  return {
    player: 170 * 2 ** (-diff / 3),
    enemy: 170 * 2 ** (diff / 3)
  };
}

export function bounceContact(raid, enemy, canRetaliate = true) {
  const p = raid.player;
  let x = enemy.x - p.x, y = enemy.y - p.y;
  if (Math.hypot(x, y) < 1e-6) {
    x = Math.cos(p.aimAngle || 0);
    y = Math.sin(p.aimAngle || 0);
  }
  const angle = Math.atan2(y, x);
  const speeds = collisionRecoil(p.value, enemy.value);
  const resistance = enemy.boss ? .34 : enemy.type === 'brute' ? .72 : 1;
  if (canRetaliate) {
    pushActor(p, -x, -y, speeds.player);
    markImpact(raid, p, 'contact', angle, speeds.player / 280);
  }
  if (!enemy.dead) {
    pushActor(enemy, x, y, speeds.enemy * resistance);
    markImpact(raid, enemy, 'contact', angle, speeds.enemy / 280);
  }
  raid.effect((p.x + enemy.x) / 2, (p.y + enemy.y) / 2, '', '#edfdff', 'hit-spark', .24, {
    angle, radius: 34, strength: .75, seed: enemy.value
  });
}

export function separateEnemyContacts(raid, enemy) {
  if (!raid.crowdGrid || enemy.dead ||
      Math.hypot(enemy.x - raid.player.x, enemy.y - raid.player.y) > 850) return;
  for (const other of raid.crowdGrid.query(enemy, enemy, 96)) {
    if (other.dead || other.id <= enemy.id || !raid.visible(enemy, other)) continue;
    let x = other.x - enemy.x, y = other.y - enemy.y;
    const length = Math.hypot(x, y);
    const overlap = enemy.radius + other.radius - length;
    if (overlap <= 2) continue;
    if (length < 1e-6) { x = Math.cos(enemy.phase); y = Math.sin(enemy.phase); }
    const response = collisionRecoil(enemy.value, other.value);
    const push = Math.min(1, overlap / 22) * .27;
    const vx = x / (Math.hypot(x, y) || 1), vy = y / (Math.hypot(x, y) || 1);
    const total = response.player + response.enemy;
    const share = response.player / total;
    const separation = Math.min(overlap, 10);
    raid.move(enemy, -vx * separation * share, -vy * separation * share);
    raid.move(other, vx * separation * (1 - share), vy * separation * (1 - share));
    pushActor(enemy, -x, -y, response.player * push * (enemy.boss ? .34 : 1));
    pushActor(other, x, y, response.enemy * push * (other.boss ? .34 : 1));
  }
}
