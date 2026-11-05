// All balance values live here. Rendering never decides a game rule.
export const VERSION = '0.8.0';
export const MAP_LAYOUTS = Object.freeze([
  {id:'random',name:'随机战区'}, {id:'tangram',name:'七巧遗迹'},
  {id:'fracture',name:'裂谷放射'}, {id:'blocks',name:'补给街区'}, {id:'wilds',name:'多心荒原'},
]);
export const LEGACY_WORLD = Object.freeze({ width: 3200, height: 2000 });
export const WORLD = Object.freeze({ width: 6400, height: 4000, spawn: { x: 300, y: 1060 } });
export const RULES = Object.freeze({
  fixedStep: 1 / 60, raidSeconds: 420, maxValue: 2048,
  playerRadius: 19, speed: 215, health: 100,
  attackRange: 112, attackCooldown: 0.46,
  dashSpeed: 660, dashDuration: 0.17, dashCooldown: 2.8,
  divideRange: 215, divideStun: 1.25, extractSeconds: 4,
  startingDividers: 2, startingMedkits: 1, bagCapacity: 8,
  equalDamageFraction: 0.25, contactCooldown: 0.85,
  energyPerMerge: 25, overloadSeconds: 7, activeEnemyRadius: 1800, summonBudget: 48,
});
export const DIFFICULTIES = Object.freeze([
  { id: 'scout', name: '边境巡查', rank: 1, color: '#b5f93b', width: 6400, height: 4000, enemyShift: 0, reward: 1, seconds: 240, extractAt: 45, description: '低风险成长，探索据点与安全屋。' },
  { id: 'standard', name: '失序探索', rank: 2, color: '#20d7e8', width: 7680, height: 4800, enemyShift: 1, reward: 1.6, seconds: 300, extractAt: 60, description: '据点守卫增强，物资收益提高。' },
  { id: 'hard', name: '深层突袭', rank: 3, color: '#ffdc43', width: 8960, height: 5600, enemyShift: 2, reward: 2.4, seconds: 360, extractAt: 75, description: '强敌守护高价值合金与核心。' },
  { id: 'severe', name: '核心危机', rank: 4, color: '#b280ff', width: 10240, height: 6400, enemyShift: 3, reward: 3.6, seconds: 420, extractAt: 90, description: '利用运算节点与过载寻找突破口。' },
  { id: 'nightmare', name: '零点噩梦', rank: 5, color: '#ff5ca8', width: 12800, height: 8000, enemyShift: 4, reward: 5.2, seconds: 480, extractAt: 105, description: '精锐据点与狂暴首领，高风险高收益。' },
]);
export const difficultyOf = id => DIFFICULTIES.find(item => item.id === id) || DIFFICULTIES[0];
export const FACILITIES = Object.freeze({
  storage: { name: '储备仓', en: 'STORAGE', icon: 'storage', max: 20, base: 80, alloy: 3, description: '每级增加 2 格局内背包。' },
  supply: { name: '补给站', en: 'SUPPLIES', icon: 'medical', max: 20, base: 90, alloy: 3, description: '增加开局运算道具与修复剂。' },
  workshop: { name: '武器工坊', en: 'WORKSHOP', icon: 'weapon', max: 6, base: 120, alloy: 4, description: '解锁出击武器，提高基础装备品质。' },
  recycler: { name: '回收中心', en: 'RECYCLER', icon: 'core', max: 20, base: 100, alloy: 4, description: '每级提高 5% 撤离资源收益。' },
});
export const ENEMY_TYPES = Object.freeze({
  hunter: { name: '追猎者', pattern: 'strike', windup: 0.46, range: 104, cooldown: 0.8, speed: 170 },
  sentry: { name: '哨戒炮', pattern: 'shot', windup: 0.6, range: 380, cooldown: 1.15, speed: 0 },
  gunner: { name: '散射手', pattern: 'fan', windup: 0.62, range: 410, cooldown: 1.2, speed: 115 },
  charger: { name: '冲锋者', pattern: 'charge', windup: 0.68, range: 440, cooldown: 1.7, speed: 150 },
  bomber: { name: '爆破者', pattern: 'blast', windup: 0.85, range: 310, cooldown: 1.9, speed: 105 },
  scout: { name: '疾行斥候', pattern: 'strike', windup: 0.32, range: 92, cooldown: 0.58, speed: 235, glyph: '»' },
  brute: { name: '重装巨像', pattern: 'slam', windup: 1.05, range: 160, cooldown: 2, speed: 90, radius: 29, glyph: '▰' },
  skirmisher: { name: '游击射手', pattern: 'burst', windup: 0.45, range: 520, cooldown: 1.5, speed: 170, glyph: '≋' },
  medic: { name: '修复者', pattern: 'heal', windup: 0.9, range: 480, cooldown: 2.8, speed: 100, glyph: '+' },
  summoner: { name: '孵化者', pattern: 'summon', windup: 1.2, range: 650, cooldown: 4.8, speed: 78, glyph: '✧' },
  orbiter: { name: '环射守卫', pattern: 'ring', windup: 0.75, range: 420, cooldown: 1.7, speed: 130, glyph: '⊙' },
  sniper: { name: '狙击手', pattern: 'snipe', windup: 0.95, range: 690, cooldown: 1.8, speed: 0 },
});
export const ZONES = Object.freeze([
  { id: 0, risk: 0, name: '边缘缓冲区', en: 'THE OUTSKIRTS', riskLabel: '低危', color: '#00c9bd', reward: [14, 26], values: [1, 1, 2, 2, 4, 8] },
  { id: 1, risk: 1, name: '失序工业带', en: 'THE FRACTURE', riskLabel: '中危', color: '#ebbc10', reward: [35, 65], values: [2, 4, 4, 8, 16, 32] },
  { id: 2, risk: 2, name: '零点核心', en: 'ZERO CORE', riskLabel: '高危', color: '#e72b8d', reward: [80, 130], values: [8, 16, 16, 32, 64, 128] },
]);
export const LOOT = Object.freeze([
  { name: '数据碎片', short: 'DATA', color: '#00c9bd' },
  { name: '运算晶体', short: 'CRYSTAL', color: '#ebbc10' },
  { name: '零点核心', short: 'CORE', color: '#e72b8d' },
]);
export const UPGRADES = Object.freeze({
  capacity: { name: '扩容背包', max: 3, cost: level => 80 + level * 80 },
  divider: { name: '运算工具包', max: 2, cost: level => 120 + level * 120 },
});
export const LEGACY_SAVE_KEY = 'number-extraction-v01';
export const PREVIOUS_SAVE_KEY = 'number-extraction-v03';
export const SAVE_KEY = 'number-extraction-v07';

export const TERRAIN = Object.freeze({
  water: { name: '浅水', speed: 0.58, color: '#50bed5', line: '#d3fbff', priority: 1 },
  mud: { name: '泥地', speed: 0.72, color: '#9d74ad', line: '#e8b9ef', priority: 1 },
  rubble: { name: '碎石', speed: 0.82, color: '#899db3', line: '#dfe5ff', priority: 1 },
  brush: { name: '灌木掩护', speed: 0.9, color: '#4ebd80', line: '#c0ff77', priority: 1, concealment: 0.6 },
  ice: { name: '冰原', speed: 1.18, color: '#9addec', line: '#effdff', priority: 1 },
  road: { name: '公路', speed: 1.12, color: '#596384', line: '#fff181', priority: 0 },
  bridge: { name: '桥面', speed: 1.12, color: '#e8a05c', line: '#ffedb8', priority: 10 },
});

// Presentation-only palette. Paint never changes collision, damage or progression.
export const PAINT = Object.freeze({
  ink:'#221a3a', paper:'#fffbee', cyan:'#12ded4', pink:'#ff42a2', lime:'#bdff36',
  yellow:'#ffe64d', purple:'#ac7aff', orange:'#ff944b',
  ground:['#d5e4dc','#e5dfcd','#e1d9ec'],
  stains:['#fc52ad','#11d9d0','#b4ee2d','#8d6bf6','#ffac4b'],
});

export const PRESSURE = Object.freeze({
  graceSeconds:6, warningSeconds:0.9, spawnMin:650, spawnMax:1000,
  safetyRadius:240, surgeEvery:60, surgeSeconds:8, cleanupSeconds:4, maxChaseSpeed:300,
});
