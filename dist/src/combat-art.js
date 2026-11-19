import { HIT_FEEDBACK, WEAPONS } from './equipment.js';
import { clamp } from './math.js';
import { numberColor } from './number-tiles.js';

const TAU = Math.PI * 2;
const INK = '#302339';
const THREAT = '#ac293f';
const SHOT_COLORS = ['#fff2c5', '#7be495', '#51d8f5', '#c395ff', '#ffbf4d'];

export const playerShotColor = level => SHOT_COLORS[clamp(Math.floor(level) || 1, 1, 5) - 1];
export const enemyShotColor = value => value === 1 ? '#a7c8e0' : numberColor(value);
export const projectileColor = bullet => bullet.owner === 'enemy' ? enemyShotColor(bullet.value)
  : bullet.weapon === 'fireball' ? '#ff813b' : playerShotColor(bullet.shotLevel ?? bullet.level);
export const swingTime = id => id === 'dualblades' ? .21 : id === 'spear' ? .28 : .36;

export function setWeaponMotion(player, weapon, angle, time) {
  const previous = player.weaponMotion;
  const side = weapon === 'dualblades' && previous?.weapon === weapon ? -previous.side : 1;
  player.weaponMotion = { weapon, angle, time, side };
  return player.weaponMotion;
}

export function weaponPose(motion, id, aimAngle, elapsed, reduced) {
  const rest = { angle: aimAngle, x: 0, y: 0 };
  if (reduced || motion?.weapon !== id) return rest;
  const age = (elapsed ?? motion.time) - motion.time;
  const strength = HIT_FEEDBACK[id]?.strength ?? .5;
  if (WEAPONS[id]?.mode === 'melee') {
    const phase = clamp(age / swingTime(id), 0, 1);
    if (phase === 1) return rest;
    const arc = WEAPONS[id].arc;
    const sweep = 1 - (1 - phase) ** 5;
    const recovery = clamp((phase - .46) / .54, 0, 1);
    const snap = (sweep - .26) * (1 - recovery ** 1.4);
    return {
      angle: motion.angle + (id === 'spear' ? 0 : motion.side * arc * snap * .67),
      x: Math.sin(Math.PI * phase) ** 2 * (id === 'spear' ? 22 : 7 + strength * 5),
      y: 0,
    };
  }

  const duration = .12 + strength * .08;
  if (age >= duration) return rest;
  const phase = clamp(age / duration, 0, 1);
  const damping = (1 - phase) ** 2;
  const spring = Math.cos(phase * Math.PI * 3.4) * damping;
  return {
    angle: aimAngle - spring * (.045 + strength * .115),
    x: -spring * (4 + strength * 16),
    y: Math.sin(phase * TAU * 2) * damping * (1 + strength * 2.5),
  };
}

export function drawProjectile(c, bullet, reduced) {
  const enemy = bullet.owner === 'enemy';
  const skill = bullet.weapon === 'fireball';
  const color = projectileColor(bullet);
  const speed = Math.hypot(bullet.vx, bullet.vy);
  const r = Math.max(enemy ? 7.3 : 4.6, bullet.radius * 1.18);
  const tail = reduced ? 0 : clamp(speed * (skill ? .046 : .027), 7, 42);
  c.save();
  c.translate(bullet.x, bullet.y);
  c.rotate(Math.atan2(bullet.vy, bullet.vx));
  if (tail > 0) {
    c.strokeStyle = color + '9c';
    c.lineWidth = r * .88;
    c.beginPath();
    c.moveTo(-r * .42, 0);
    c.lineTo(-tail - r * .42, 0);
    c.stroke();
  }

  c.fillStyle = color;
  c.strokeStyle = enemy ? THREAT : INK;
  c.lineWidth = enemy ? 2.6 : 1.7;
  c.beginPath();
  if (enemy) {
    c.moveTo(r * 1.2, 0);
    c.lineTo(0, r);
    c.lineTo(-r * 1.12, 0);
    c.lineTo(0, -r);
    c.closePath();
  } else if (bullet.blast || skill) {
    c.arc(0, 0, r, 0, TAU);
  } else {
    c.roundRect(-r * 1.25, -r * .68, r * 2.5, r * 1.36, r * .64);
  }
  c.fill();
  c.stroke();
  c.fillStyle = enemy ? '#fff0dc' : bullet.intrinsic === 'burn' || skill ? '#ff9a57' : '#fffdee';
  c.beginPath();
  c.arc(r * .34, -r * .12, Math.max(.9, r * .29), 0, TAU);
  c.fill();
  c.restore();
}

export function drawMeleeTrail(c, effect, progress, reduced) {
  const { angle, arc, radius, color, side, weapon } = effect;
  const thrust = weapon === 'spear';
  c.save();
  c.translate(effect.x, effect.y);
  c.rotate(angle);
  const sweep = reduced ? .82 : clamp(.22 + progress * 1.95, 0, 1);
  const front = side * (sweep - .5) * arc;
  const back = side * (Math.max(0, sweep - .57) - .5) * arc;
  c.globalAlpha = (1 - progress) ** 1.7 * (reduced ? .45 : .95);
  c.lineWidth = weapon === 'dualblades' ? 5 : radius * .1;
  c.strokeStyle = color;
  c.beginPath();
  if (thrust) {
    c.moveTo(radius * .27, 0);
    c.lineTo(radius * (.65 + sweep * .35), 0);
  } else {
    c.arc(0, 0, radius * .84, Math.min(front, back), Math.max(front, back));
  }
  c.stroke();
  c.strokeStyle = '#fff6de';
  c.lineWidth = thrust ? 2.8 : 2.1;
  c.beginPath();
  if (thrust) {
    c.moveTo(radius * .46, 0);
    c.lineTo(radius * (.71 + sweep * .29), 0);
  } else {
    c.arc(0, 0, radius * .91, Math.min(front, back), Math.max(front, back));
  }
  c.stroke();
  c.restore();
}

export function drawAttackWarning(c, x, y, radius, progress, color, reduced) {
  c.save();
  c.fillStyle = color;
  c.strokeStyle = color;
  c.globalAlpha = reduced ? .16 : .09 + progress * .18;
  c.beginPath();
  c.arc(x, y, radius, 0, TAU);
  c.fill();
  c.globalAlpha = .95;
  c.lineWidth = 2.6;
  c.stroke();
  if (!reduced) {
    c.globalAlpha = .28 + progress * .35;
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(x, y, radius * (1 - .9 * progress), 0, TAU);
    c.stroke();
  }
  c.restore();
}

export function drawEnemyImpact(c, effect, progress, reduced) {
  const { x, y, radius, angle = 0, arc = TAU, color, heavy } = effect;
  const start = angle - arc / 2, end = angle + arc / 2;
  const reach = reduced ? radius : radius * (.26 + .74 * (1 - (1 - progress) ** 2));
  c.save();
  c.globalAlpha = (1 - progress) ** 2;
  c.strokeStyle = color;
  c.lineWidth = heavy ? 6 : 3.5;
  c.beginPath();
  c.arc(x, y, reach, start, end);
  c.stroke();
  if (!reduced) {
    c.strokeStyle = '#ffd9aa';
    c.lineWidth = heavy ? 3 : 1.7;
    const count = heavy ? 9 : 5;
    for (let i = 0; i < count; i++) {
      const a = start + arc * (i + .4) / count;
      const tip = Math.min(radius, reach + (heavy ? 18 : 9));
      c.beginPath();
      c.moveTo(x + Math.cos(a) * reach * .82, y + Math.sin(a) * reach * .82);
      c.lineTo(x + Math.cos(a) * tip, y + Math.sin(a) * tip);
      c.stroke();
    }
  }
  c.restore();
}

export function drawMuzzleFlash(c, effect, progress, reduced) {
  const { x, y, angle, radius, color, pattern, heavy } = effect;
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.globalAlpha = (reduced ? .48 : 1) * (1 - progress);
  c.strokeStyle = color;
  if (pattern === 'ring') {
    c.lineWidth = 3;
    c.beginPath();
    c.arc(0, 0, radius * (reduced ? 1 : .62 + .5 * progress), 0, TAU);
    c.stroke();
  } else {
    c.translate(radius, 0);
    const length = heavy ? 29 : 17;
    const width = heavy ? 10 : 6;
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(-7, 0);
    c.lineTo(1, -width);
    c.lineTo(length * (1 - progress * .45), 0);
    c.lineTo(1, width);
    c.closePath();
    c.fill();
    c.strokeStyle = '#fff6de';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-2, 0);
    c.lineTo(length * .45, 0);
    c.stroke();
  }
  c.restore();
}
