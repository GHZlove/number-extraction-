// All balance values live here. Rendering never decides a game rule.
export const VERSION = '0.3.0';
export const LEGACY_WORLD = Object.freeze({ width: 3200, height: 2000 });
export const WORLD = Object.freeze({ width: 12800, height: 8000, spawn: { x: 300, y: 1060 } });
export const RULES = Object.freeze({
  fixedStep: 1 / 60, raidSeconds: 420, maxValue: 2048,
  playerRadius: 19, speed: 215, health: 100,
  attackRange: 112, attackCooldown: 0.46,
  dashSpeed: 660, dashDuration: 0.17, dashCooldown: 2.8,
  divideRange: 215, divideStun: 1.25, extractSeconds: 4,
  startingDividers: 2, startingMedkits: 1, bagCapacity: 8,
  equalDamageFraction: 0.25, contactCooldown: 0.85,
  energyPerMerge: 25, overloadSeconds: 7, activeEnemyRadius: 1500,
});
export const DIFFICULTIES = Object.freeze([
  { id: 'scout', name: '边境巡查', rank: 1, color: '#9cddb7', width: 12800, height: 8000, enemyShift: 0, reward: 1, seconds: 480, description: '熟悉地形，积累第一批庇护所资源。' },
  { id: 'standard', name: '失序探索', rank: 2, color: '#7cbef2', width: 16000, height: 10000, enemyShift: 1, reward: 1.6, seconds: 570, description: '更大的区域，更高数字的守卫。' },
  { id: 'hard', name: '深层突袭', rank: 3, color: '#edc47a', width: 19200, height: 12000, enemyShift: 2, reward: 2.4, seconds: 660, description: '强敌守护高价值合金与核心。' },
  { id: 'severe', name: '核心危机', rank: 4, color: '#be9cf4', width: 22400, height: 14000, enemyShift: 3, reward: 3.6, seconds: 750, description: '利用运算节点与过载寻找突破口。' },
  { id: 'nightmare', name: '零点噩梦', rank: 5, color: '#f18f94', width: 25600, height: 16000, enemyShift: 4, reward: 5.2, seconds: 840, description: '最大战区，最危险的数字与最高收益。' },
]);
export const difficultyOf = id => DIFFICULTIES.find(item => item.id === id) || DIFFICULTIES[0];
export const FACILITIES = Object.freeze({
  storage: { name: '储备仓', en: 'STORAGE', icon: 'storage', max: 20, base: 80, alloy: 3, description: '每级增加 2 格局内背包。' },
  supply: { name: '补给站', en: 'SUPPLIES', icon: 'medical', max: 20, base: 90, alloy: 3, description: '增加开局运算道具与修复剂。' },
  workshop: { name: '武器工坊', en: 'WORKSHOP', icon: 'weapon', max: 6, base: 120, alloy: 4, description: '解锁出击武器，提高基础装备品质。' },
  recycler: { name: '回收中心', en: 'RECYCLER', icon: 'core', max: 20, base: 100, alloy: 4, description: '每级提高 5% 撤离资源收益。' },
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
  { id: 0, name: '边缘缓冲区', en: 'THE OUTSKIRTS', from: 0, to: WORLD.width/3, risk: '低危', color: '#80d9bc', reward: [14, 26], values: [1, 1, 2, 2, 4, 8] },
  { id: 1, name: '失序工业带', en: 'THE FRACTURE', from: WORLD.width/3, to: WORLD.width*2/3, risk: '中危', color: '#e6bb72', reward: [35, 65], values: [2, 4, 4, 8, 16, 32] },
  { id: 2, name: '零点核心', en: 'ZERO CORE', from: WORLD.width*2/3, to: WORLD.width, risk: '高危', color: '#ec8d80', reward: [80, 130], values: [8, 16, 16, 32, 64, 128] },
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
export const LEGACY_SAVE_KEY = 'number-extraction-v01';
export const SAVE_KEY = 'number-extraction-v03';
