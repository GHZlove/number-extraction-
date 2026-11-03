// All balance values live here. Rendering never decides a game rule.
export const VERSION = '0.2.0';
export const WORLD = Object.freeze({ width: 3200, height: 2000, spawn: { x: 300, y: 1060 } });
export const RULES = Object.freeze({
  fixedStep: 1 / 60, raidSeconds: 420, maxValue: 2048,
  playerRadius: 19, speed: 215, health: 100,
  attackRange: 112, attackCooldown: 0.46,
  dashSpeed: 660, dashDuration: 0.17, dashCooldown: 2.8,
  divideRange: 215, divideStun: 1.25, extractSeconds: 4,
  startingDividers: 2, startingMedkits: 1, bagCapacity: 8,
  equalDamageFraction: 0.25, contactCooldown: 0.85,
});
export const ENEMY_TYPES = Object.freeze({
  hunter: { name: '追猎者', pattern: 'strike', windup: 0.72, range: 104, cooldown: 1.3, speed: 90 },
  sentry: { name: '哨戒炮', pattern: 'shot', windup: 0.9, range: 380, cooldown: 1.9, speed: 0 },
  gunner: { name: '散射手', pattern: 'fan', windup: 0.95, range: 410, cooldown: 2.1, speed: 62 },
  charger: { name: '冲锋者', pattern: 'charge', windup: 1, range: 440, cooldown: 2.8, speed: 70 },
  bomber: { name: '爆破者', pattern: 'blast', windup: 1.35, range: 310, cooldown: 3.1, speed: 48 },
  sniper: { name: '狙击手', pattern: 'snipe', windup: 1.4, range: 690, cooldown: 2.7, speed: 0 },
});
export const ZONES = Object.freeze([
  { id: 0, name: '边缘缓冲区', en: 'THE OUTSKIRTS', from: 0, to: 1050, risk: '低危', color: '#80d9bc', reward: [14, 26], values: [1, 1, 2, 2, 4, 8] },
  { id: 1, name: '失序工业带', en: 'THE FRACTURE', from: 1050, to: 2150, risk: '中危', color: '#e6bb72', reward: [35, 65], values: [2, 4, 4, 8, 16, 32] },
  { id: 2, name: '零点核心', en: 'ZERO CORE', from: 2150, to: 3200, risk: '高危', color: '#ec8d80', reward: [80, 130], values: [8, 16, 16, 32, 64, 128] },
]);
export const LOOT = Object.freeze([
  { name: '数据碎片', short: 'DATA', color: '#80d9bc' },
  { name: '运算晶体', short: 'CRYSTAL', color: '#e6bb72' },
  { name: '零点核心', short: 'CORE', color: '#ec8d80' },
]);
export const UPGRADES = Object.freeze({
  capacity: { name: '扩容背包', max: 3, cost: level => 80 + level * 80 },
  divider: { name: '运算工具包', max: 2, cost: level => 120 + level * 120 },
});
export const SAVE_KEY = 'number-extraction-v01';
