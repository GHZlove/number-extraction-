export const RARITIES = Object.freeze([
  { id: 'white', name: '白', color: '#e4e8e5', multiplier: 1 },
  { id: 'yellow', name: '黄', color: '#f0cc72', multiplier: 1.2 },
  { id: 'green', name: '绿', color: '#83dda8', multiplier: 1.4 },
  { id: 'blue', name: '蓝', color: '#7cbcff', multiplier: 1.6 },
  { id: 'purple', name: '紫', color: '#c6a0ff', multiplier: 1.8 },
  { id: 'red', name: '红', color: '#ff858b', multiplier: 2 },
]);

// White weapons share the same number-based damage rule. Weapon types differ in
// cadence, range, spread and melee coverage; ammunition is unlimited in v0.2.
export const WEAPONS = Object.freeze({
  pistol: { name: '手枪', short: 'PST', mode: 'ranged', interval: 0.46, range: 580, speed: 820, spread: 0.055 },
  smg: { name: '冲锋枪', short: 'SMG', mode: 'ranged', interval: 0.16, range: 350, speed: 760, spread: 0.19 },
  rifle: { name: '突击步枪', short: 'AR', mode: 'ranged', interval: 0.29, range: 720, speed: 980, spread: 0.085 },
  sniper: { name: '狙击枪', short: 'SNP', mode: 'ranged', interval: 1.15, range: 1150, speed: 1600, spread: 0.018 },
  greatsword: { name: '大剑', short: 'GS', mode: 'melee', interval: 0.85, range: 132, arc: Math.PI * 0.9 },
  dualblades: { name: '双刀', short: 'DB', mode: 'melee', interval: 0.24, range: 82, arc: Math.PI * 0.6 },
});

export const rarityOf = id => RARITIES.find(rarity => rarity.id === id) || RARITIES[0];
export const weaponOf = item => WEAPONS[item?.weapon] || WEAPONS.pistol;
export const spreadOf = (item, laser) => (weaponOf(item).spread || 0) * (laser ? 0.3 : 1);

export function makeEquipment(kind, type = 'pistol', rarity = 'white', id = 'equipment') {
  const grade = rarityOf(rarity);
  const rank = RARITIES.indexOf(grade);
  const base = { id, kind, rarity: grade.id, value: 28 + rank * 24, zone: 0 };
  if (kind === 'weapon') {
    const weapon = Object.hasOwn(WEAPONS, type) ? type : 'pistol';
    return { ...base, weapon, name: `${grade.name}品 · ${WEAPONS[weapon].name}` };
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
  return { ...makeEquipment('weapon', types[Math.floor(random() * types.length)], rarity, id), zone };
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
