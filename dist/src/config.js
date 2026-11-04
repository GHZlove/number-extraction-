// All balance values live here. Rendering never decides a game rule.
export const VERSION = '0.4.0';
export const LEGACY_WORLD = Object.freeze({ width: 3200, height: 2000 });
export const WORLD = Object.freeze({ width: 32000, height: 20000, spawn: { x: 300, y: 1060 } });
export const RULES = Object.freeze({
  fixedStep: 1 / 60, raidSeconds: 420, maxValue: 2048,
  playerRadius: 19, speed: 215, health: 100,
  attackRange: 112, attackCooldown: 0.46,
  dashSpeed: 660, dashDuration: 0.17, dashCooldown: 2.8,
  divideRange: 215, divideStun: 1.25, extractSeconds: 4,
  startingDividers: 2, startingMedkits: 1, bagCapacity: 8,
  equalDamageFraction: 0.25, contactCooldown: 0.85,
  energyPerMerge: 25, overloadSeconds: 7, activeEnemyRadius: 1500, summonBudget: 48,
});
export const DIFFICULTIES = Object.freeze([
  { id: 'scout', name: '边境巡查', rank: 1, color: '#9cddb7', width: 32000, height: 20000, enemyShift: 0, reward: 1, seconds: 600, description: '熟悉地形，积累第一批庇护所资源。' },
  { id: 'standard', name: '失序探索', rank: 2, color: '#7cbef2', width: 40000, height: 25000, enemyShift: 1, reward: 1.6, seconds: 720, description: '更大的区域，更高数字的守卫。' },
  { id: 'hard', name: '深层突袭', rank: 3, color: '#edc47a', width: 48000, height: 30000, enemyShift: 2, reward: 2.4, seconds: 840, description: '强敌守护高价值合金与核心。' },
  { id: 'severe', name: '核心危机', rank: 4, color: '#be9cf4', width: 56000, height: 35000, enemyShift: 3, reward: 3.6, seconds: 960, description: '利用运算节点与过载寻找突破口。' },
  { id: 'nightmare', name: '零点噩梦', rank: 5, color: '#f18f94', width: 64000, height: 40000, enemyShift: 4, reward: 5.2, seconds: 1080, description: '最大战区，最危险的数字与最高收益。' },
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
  scout: { name: '疾行斥候', pattern: 'strike', windup: 0.48, range: 92, cooldown: 0.95, speed: 175, glyph: '»' },
  brute: { name: '重装巨像', pattern: 'slam', windup: 1.5, range: 160, cooldown: 3.2, speed: 38, radius: 29, glyph: '▰' },
  skirmisher: { name: '游击射手', pattern: 'burst', windup: 0.65, range: 520, cooldown: 2.4, speed: 120, glyph: '≋' },
  medic: { name: '修复者', pattern: 'heal', windup: 1.25, range: 480, cooldown: 4, speed: 60, glyph: '+' },
  summoner: { name: '孵化者', pattern: 'summon', windup: 1.8, range: 650, cooldown: 7, speed: 32, glyph: '✧' },
  orbiter: { name: '环射守卫', pattern: 'ring', windup: 1.15, range: 420, cooldown: 2.7, speed: 74, glyph: '⊙' },
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

export const TERRAIN = Object.freeze({
  water: { name: '浅水', speed: 0.58, color: '#285565', line: '#7bbbc8', priority: 1 },
  mud: { name: '泥地', speed: 0.72, color: '#594b36', line: '#a38d62', priority: 1 },
  rubble: { name: '碎石', speed: 0.82, color: '#424956', line: '#9298a5', priority: 1 },
  brush: { name: '灌木掩护', speed: 0.9, color: '#284b3e', line: '#7cae82', priority: 1, concealment: 0.6 },
  ice: { name: '冰原', speed: 1.18, color: '#496a80', line: '#acd3e5', priority: 1 },
  road: { name: '公路', speed: 1.12, color: '#323d49', line: '#9baaa4', priority: 0 },
  bridge: { name: '桥面', speed: 1.12, color: '#6b5a40', line: '#d2ba87', priority: 10 },
});
