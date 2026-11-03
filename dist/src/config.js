// All balance values live here. Rendering never decides a game rule.
export const VERSION = '0.1.0';
export const WORLD = Object.freeze({ width: 3200, height: 2000, spawn: { x: 300, y: 1060 } });
export const RULES = Object.freeze({
  fixedStep: 1 / 60, raidSeconds: 420, maxValue: 2048,
  playerRadius: 19, speed: 215, health: 100,
  attackRange: 112, attackCooldown: 0.46,
  dashSpeed: 660, dashDuration: 0.17, dashCooldown: 2.8,
  divideRange: 215, divideStun: 1.25, extractSeconds: 4,
  startingDividers: 2, startingMedkits: 1, bagCapacity: 8,
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
