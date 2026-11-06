export const RARITIES = Object.freeze([
  { id: 'white', name: '白', color: '#fffdf0', multiplier: 1 },
  { id: 'yellow', name: '黄', color: '#ffe047', multiplier: 1.2 },
  { id: 'green', name: '绿', color: '#79ed55', multiplier: 1.4 },
  { id: 'blue', name: '蓝', color: '#4db8ff', multiplier: 1.6 },
  { id: 'purple', name: '紫', color: '#b280ff', multiplier: 1.8 },
  { id: 'red', name: '红', color: '#ff4b61', multiplier: 2 },
]);

// White weapons share the same number-based damage rule. Weapon types differ in
// cadence, range, spread and melee coverage; ammunition is unlimited in this prototype.
export const WEAPONS = Object.freeze({
  pistol: { name: '手枪', short: 'PST', mode: 'ranged', interval: 0.46, range: 580, speed: 820, spread: 0.055, unlock: 0 },
  smg: { name: '冲锋枪', short: 'SMG', mode: 'ranged', interval: 0.16, range: 350, speed: 760, spread: 0.19, unlock: 1 },
  rifle: { name: '突击步枪', short: 'AR', mode: 'ranged', interval: 0.29, range: 720, speed: 980, spread: 0.085, unlock: 2 },
  sniper: { name: '狙击枪', short: 'SNP', mode: 'ranged', interval: 1.15, range: 1150, speed: 1600, spread: 0.018, unlock: 3 },
  greatsword: { name: '大剑', short: 'GS', mode: 'melee', interval: 0.85, range: 132, arc: Math.PI * 0.9, unlock: 0 },
  dualblades: { name: '双刀', short: 'DB', mode: 'melee', interval: 0.24, range: 82, arc: Math.PI * 0.6, unlock: 1 },
  shotgun: { name: '霰弹枪', short: 'SG', mode: 'ranged', interval: 0.88, range: 440, speed: 780, spread: 0.25, pellets: 5, unlock: 2 },
  carbine: { name: '脉冲卡宾枪', short: 'BST', mode: 'ranged', interval: 0.62, range: 820, speed: 1050, spread: 0.035, burst: 3, burstDelay: 0.075, unlock: 3 },
  lmg: { name: '轻机枪', short: 'LMG', mode: 'ranged', interval: 0.19, range: 800, speed: 1000, spread: 0.16, unlock: 4 },
  crossbow: { name: '复合弩', short: 'BOW', mode: 'ranged', interval: 0.95, range: 1000, speed: 1100, spread: 0.005, pierce: 1, unlock: 1 },
  grenade: { name: '榴弹发射器', short: 'GL', mode: 'ranged', interval: 1.55, range: 700, speed: 480, spread: 0.035, blast: 130, unlock: 5 },
  spear: { name: '长枪', short: 'SPR', mode: 'melee', interval: 0.64, range: 205, arc: Math.PI * 0.22, unlock: 0 },
  warhammer: { name: '战锤', short: 'HAM', mode: 'melee', interval: 1.35, range: 128, arc: Math.PI * 1.3, stun: 0.75, unlock: 3 },
  railgun: { name: '磁轨步枪', short: 'RAIL', mode: 'ranged', interval: 1.3, range: 1500, speed: 2200, spread: 0.008, pierce: 2, unlock: 4 },
  revolver: { name: '重型左轮', short: 'REV', mode: 'ranged', interval: .62, range: 780, speed: 1250, spread: .025, unlock: 1 },
  doublebarrel: { name: '双管霰弹枪', short: 'DBS', mode: 'ranged', interval: 1.1, range: 420, speed: 850, spread: .22, pellets: 4, burst: 2, burstDelay: .12, unlock: 2 },
  plasma: { name: '能量手枪', short: 'PLS', mode: 'ranged', interval: .38, range: 700, speed: 560, spread: .015, pierce: 1, radius: 6, unlock: 2 },
  flamethrower: { name: '火焰喷射器', short: 'FLM', mode: 'ranged', interval: .2, range: 245, speed: 420, spread: .22, pellets: 3, intrinsic: 'burn', radius: 7, unlock: 3 },
  rocket: { name: '火箭筒', short: 'RKT', mode: 'ranged', interval: 1.9, range: 1000, speed: 620, spread: .025, blast: 190, radius: 6, unlock: 5 },
  battleaxe: { name: '战斧', short: 'AXE', mode: 'melee', interval: 1.05, range: 155, arc: Math.PI*1.1, intrinsic: 'bleed', unlock: 2 },
});

export const rarityOf = id => RARITIES.find(rarity => rarity.id === id) || RARITIES[0];
export const weaponOf = item => WEAPONS[item?.weapon] || WEAPONS.pistol;
export const spreadOf = (item, laser) => (weaponOf(item).spread || 0) * (laser ? 0.3 : 1);
export const ENCHANTS = Object.freeze({
  none:{name:'无附魔',color:'#fffdf0',description:'基础武器。'},
  leech:{name:'吸血',color:'#ff5c88',description:'回复实际生命伤害的12%，每次命中最多4点。'},
  lightning:{name:'闪电',color:'#6eefff',description:'向附近最多两个可见目标传导35%伤害，冷却0.65秒。'},
  stun:{name:'眩晕',color:'#f5da52',description:'命中打断并眩晕，冷却1.1秒；首领抗性更高。'},
  poison:{name:'毒雾',color:'#b4fa53',description:'落点留下持续3.5秒的毒雾，冷却1.25秒。'},
  burn:{name:'烈焰',color:'#ff963e',description:'点燃目标3秒，持续伤害；刷新而不叠加。'},
  frost:{name:'寒霜',color:'#67dcff',description:'减速并积累寒霜，三次触发可短暂冻结；首领有抗性。'},
  bleed:{name:'流血',color:'#ec5271',description:'目标持续流血4秒，流血不消耗护甲，保留首领减伤。'},
  sunder:{name:'破甲',color:'#f5c06c',description:'削减护甲耐久，并施加3秒易伤；首领易伤减半。'},
  detonate:{name:'爆裂',color:'#ff7359',description:'击杀引爆附近可见敌人，爆炸不继续触发附魔。'},
  critical:{name:'暴击',color:'#f7d85c',description:'命中有20%起的暴击机会，追加50%基础伤害，限频判定。'},
  gravity:{name:'重力',color:'#aa83ff',description:'将落点周围可见敌人向中心牵引，受墙体与首领抗性约束。'},
  energize:{name:'回能',color:'#69efb1',description:'有效命中回复过载能量，冷却0.65秒，尸体不能充能。'},
});
export const ENCHANT_KEYS=Object.freeze(Object.keys(ENCHANTS).filter(key=>key!=='none'));
export function decorateWeapon(item,enchant='none',level=1){
  if(item.kind!=='weapon')return item;
  const effect=Object.hasOwn(ENCHANTS,enchant)?enchant:'none';
  const next={...item,enchant:effect,level:Math.max(1,Math.min(5,Math.floor(level)||1))};
  next.name=`${rarityOf(next.rarity).name}品 · ${weaponOf(next).name} Lv.${next.level}${effect==='none'?'':' · '+ENCHANTS[effect].name}`;
  return next;
}
export const weaponPower = item => 1+Math.max(0,(item?.level||1)-1)*.08;
export function knockbackFor(weapon,attacker,defender,rarity='white',level=1,mass=1){
  const relative=Math.max(.45,Math.min(1.85,1+Math.log2(Math.max(1,attacker)/Math.max(1,defender))*.13));
  return (HIT_FEEDBACK[weapon]?.knock||0)*relative*(1+(rarityOf(rarity).multiplier-1)*.4+Math.max(0,Math.min(4,level-1))*.14)*mass;
}

export function makeEquipment(kind, type = 'pistol', rarity = 'white', id = 'equipment') {
  const grade = rarityOf(rarity);
  const rank = RARITIES.indexOf(grade);
  const base = { id, kind, rarity: grade.id, value: 28 + rank * 24, zone: 0 };
  if (kind === 'weapon') {
    const weapon = Object.hasOwn(WEAPONS, type) ? type : 'pistol';
    return { ...base, weapon, level:1,enchant:'none', name: `${grade.name}品 · ${WEAPONS[weapon].name}` };
  }
  if (kind === 'armor') {
    const maxDurability = 40 + rank * 20;
    return { ...base, name: `${grade.name}品 · 战术护甲`, mitigation: 0.2 + rank * 0.05, durability: maxDurability, maxDurability };
  }
  return { ...base, kind: 'laser', rarity: 'white', name: '镭射瞄准器', value: 36 };
}

export function randomEquipment(random, zone, id) {
  const roll = random();
  const rank = Math.min(5, Math.max(0, zone + (roll > 0.96 ? 3 : roll > 0.72 ? 2 : roll > 0.36 ? 1 : 0)));
  const rarity = RARITIES[rank].id;
  const kind = random();
  if (kind < 0.25) return { ...makeEquipment('armor', '', rarity, id), zone };
  if (kind < 0.38) return { ...makeEquipment('laser', '', 'white', id), zone };
  const types = Object.keys(WEAPONS);
  const item={...makeEquipment('weapon', types[Math.floor(random() * types.length)], rarity, id),zone};
  return random()<.16+zone*.12?decorateWeapon(item,ENCHANT_KEYS[Math.floor(random()*ENCHANT_KEYS.length)],1+Math.floor(zone/2)):item;
}

export function absorbDamage(amount, armor) {
  const incoming = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const durability = Math.max(0, armor?.durability || 0);
  const mitigation = Math.max(0, Math.min(0.8, armor?.mitigation || 0));
  const blocked = Math.min(durability, incoming * mitigation);
  return { damage: incoming - blocked, blocked, durability: durability - blocked };
}

export function equipmentValue(player) {
  return [...(player.weapons || []), player.armor, player.laser]
    .filter(item => item && !item.starter)
    .reduce((sum, item) => sum + item.value, 0);
}

export function activeWeapon(player) {
  return player.weapons[player.activeSlot] || player.weapons[0];
}

// Feedback affects displacement and presentation, never the number damage formula.
export const HIT_FEEDBACK = Object.freeze({
  contact:{knock:0,strength:.35,stop:0},pistol:{knock:150,strength:.45,stop:0},smg:{knock:85,strength:.3,stop:0},
  rifle:{knock:180,strength:.5,stop:0},carbine:{knock:130,strength:.4,stop:0},lmg:{knock:140,strength:.5,stop:0},
  sniper:{knock:420,strength:1.05,stop:.025},shotgun:{knock:90,strength:.9,stop:.025},railgun:{knock:440,strength:1.1,stop:.03},
  crossbow:{knock:170,strength:.65,stop:0},grenade:{knock:260,strength:1.2,stop:.03},
  greatsword:{knock:250,strength:1,stop:.03},dualblades:{knock:75,strength:.55,stop:0},spear:{knock:180,strength:.7,stop:.016},
  warhammer:{knock:350,strength:1.35,stop:.03},
  revolver:{knock:300,strength:.85,stop:.016},doublebarrel:{knock:110,strength:1.1,stop:.025},
  plasma:{knock:130,strength:.65,stop:0},flamethrower:{knock:25,strength:.3,stop:0},
  rocket:{knock:380,strength:1.4,stop:.03},battleaxe:{knock:310,strength:1.15,stop:.025},
});
