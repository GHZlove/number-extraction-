import { attackDamage, distance, isFree, segmentCircleFraction, clamp } from './math.js';
import { obstaclesFor } from './spatial.js';
import { ELEMENTS } from './elements.js';
import { markImpact, pushActor } from './impact-motion.js';

export const NUMBER_SKILLS = Object.freeze({
  storm: { key: '3', label: '残骸雷链', cooldown: 6, color: ELEMENTS.lightning.color },
  gust: { key: '4', label: '数字风压', cooldown: 6, color: ELEMENTS.wind.color },
  blink: { key: '5', label: '折跃', cooldown: 5, color: ELEMENTS.space.color },
  fireball: { key: '6', label: '余烬火球', cooldown: 5, color: ELEMENTS.fire.color }
});

const skillRange = (value, base, scale, maximum) =>
  Math.min(maximum, base + Math.max(0, Math.log2(value)) * scale);

function storm(raid) {
  const p = raid.player;
  const radius = skillRange(p.value, 275, 18, 455);
  const linkRange = radius * .75;
  const remnants = raid.world.tiles
    .filter(tile => tile.remnant && !tile.dead && distance(tile, p) <= radius && raid.visible(p, tile))
    .sort((a, b) => distance(p, a) - distance(p, b))
    .slice(0, 32);

  let chain = [];
  for (const first of remnants) {
    const candidate = [first];
    while (candidate.length < 6) {
      const from = candidate.at(-1);
      const next = remnants.find(tile =>
        tile.value === first.value && !candidate.includes(tile) &&
        distance(from, tile) <= linkRange && raid.visible(from, tile)
      );
      if (!next) break;
      candidate.push(next);
    }
    if (candidate.length > chain.length) chain = candidate;
    if (chain.length === 6) break;
  }
  if (chain.length < 2) {
    raid.message('附近需要两块同数敌人残骸才能连成雷链。');
    return false;
  }

  const hits = new Set();
  for (let i = 1; i < chain.length; i++) {
    const from = chain[i - 1], to = chain[i];
    raid.effect(from.x, from.y, '', NUMBER_SKILLS.storm.color, 'lightning', .44, { endX: to.x, endY: to.y });
    for (const enemy of raid.world.enemies) {
      if (enemy.dead || hits.has(enemy) || !raid.visible(from, enemy)) continue;
      const fraction = segmentCircleFraction(from, to, enemy, enemy.radius + 24);
      if (!Number.isFinite(fraction)) continue;
      hits.add(enemy);
      const value = Math.max(p.value, from.value);
      raid.damageEnemy(enemy, attackDamage(value, enemy.value, enemy.maxHp) * .9, {
        secondary: true, angle: Math.atan2(to.y - from.y, to.x - from.x), element: 'lightning'
      });
    }
  }
  return true;
}

function gust(raid) {
  const p = raid.player;
  const radius = skillRange(p.value, 175, 13, 310);
  for (const enemy of raid.world.enemies) {
    const d = distance(p, enemy);
    if (enemy.dead || d > radius + enemy.radius || !raid.visible(p, enemy)) continue;
    const ratio = clamp(Math.log2(p.value / enemy.value), -5, 5);
    const speed = 365 * 2 ** (ratio / 4) * (enemy.boss ? .27 : 1) * (1 - Math.min(d / radius, 1) * .45);
    const dx = enemy.x - p.x, dy = enemy.y - p.y;
    const angle = d > 0 ? Math.atan2(dy, dx) : p.aimAngle;
    pushActor(enemy, Math.cos(angle), Math.sin(angle), speed);
    markImpact(raid, enemy, 'contact', angle, speed / 400);
  }
  raid.effect(p.x, p.y, '', NUMBER_SKILLS.gust.color, 'gust', .36, { radius });
  return true;
}

function blink(raid) {
  const p = raid.player;
  if (raid.run.noDodge) {
    raid.message('本局词条同时限制闪避和折跃。');
    return false;
  }
  const start = { x: p.x, y: p.y };
  const reach = skillRange(p.value, 170, 8, 255);
  const dx = Math.cos(p.aimAngle), dy = Math.sin(p.aimAngle);
  const end = { x: start.x + dx * reach, y: start.y + dy * reach };
  const obstacles = obstaclesFor(raid.world, start, end, p.radius + 2);
  let target = start;
  // Check the whole swept disc so blink cannot cross a solid wall.
  for (let step = 7; step <= reach; step += 7) {
    const x = start.x + dx * step, y = start.y + dy * step;
    if (!isFree(x, y, p.radius, obstacles, raid.world.bounds)) break;
    target = { x, y };
  }
  const hasClearLanding = point => !raid.world.enemies.some(enemy =>
    !enemy.dead && distance(point, enemy) < p.radius + enemy.radius
  );
  while (distance(start, target) >= 14 && !hasClearLanding(target)) {
    target = { x: target.x - dx * 7, y: target.y - dy * 7 };
  }
  if (distance(start, target) < 14) {
    raid.message('折跃落点没有足够空间。');
    return false;
  }
  Object.assign(p, target, { knockX: 0, knockY: 0, dashTime: 0 });
  raid.extractProgress = 0;
  raid.searchProgress = 0;
  raid.nodeProgress = 0;
  raid.effect(start.x, start.y, '', NUMBER_SKILLS.blink.color, 'blink', .26, { endX: p.x, endY: p.y, value: p.value, radius: p.radius });
  return true;
}

function fireball(raid) {
  const p = raid.player;
  raid.shoot(p, p.aimAngle, 610, 580, 'player', p.value, 'white', {
    weapon: 'fireball', element: 'fire', intrinsic: 'burn', radius: 11, power: .95,
    blast: skillRange(p.value, 74, 4, 122)
  });
  return true;
}

const handlers = { storm, gust, blink, fireball };

export function useNumberSkill(raid, id) {
  const skill = Object.hasOwn(NUMBER_SKILLS, id) ? NUMBER_SKILLS[id] : null;
  if (!skill || raid.status !== 'playing' || raid.player.skillCooldowns[id] > 0) return false;
  if (raid.safehouseAt() && id !== 'blink') {
    raid.message('安全屋内无法释放攻击技能。');
    return false;
  }
  if (!handlers[id](raid)) return false;
  raid.player.skillCooldowns[id] = skill.cooldown;
  raid.event('skill', { skill: id });
  return true;
}

export function tickNumberSkills(player, dt) {
  for (const id of Object.keys(NUMBER_SKILLS)) {
    player.skillCooldowns[id] = Math.max(0, (player.skillCooldowns[id] || 0) - dt);
  }
}
