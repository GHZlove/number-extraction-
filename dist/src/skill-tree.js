const branches = [
  ['lightning', '雷电', '#9be8ff', '⚡', [
    ['storm','残骸雷链',6,'连接同数残骸，伤害路径上的敌人。'],
    ['spark','连锁电弧',7,'在至多三名附近敌人间跳跃。'],
    ['staticPulse','静电脉冲',8,'近身电击并短暂震慑。'],
    ['fork','分岔闪电',9,'从自身同时击中三名近敌。'],
    ['groundWire','导雷桩',9,'在瞄准方向的落点引发带震慑的电击。'],
    ['arcWard','电弧护盾',13,'短暂减伤、补充过载能量，并电击近敌。'],
    ['thunder','落雷阵',14,'在较远的瞄准位置引发强力范围闪电。'],
  ]],
  ['wind', '风压', '#b9efe2', '≋', [
    ['gust','数字风压',6,'按数字差把近敌向外推开。'],
    ['airStep','轻风疾行',8,'增加三秒移动速度。'],
    ['vortex','负压漩涡',8,'将附近敌人向自身方向牵引。'],
    ['windWall','风切屏障',9,'清除身前近处的敌方弹丸。'],
    ['cyclone','旋风冲击',10,'击退并伤害周围的敌人。'],
    ['pressure','压缩气刃',11,'向前方扇区打出伤害和短暂震慑。'],
    ['tempest','风暴眼',14,'同时击退近敌并吹散周围弹丸。'],
  ]],
  ['space', '相位', '#d4baff', '✧', [
    ['blink','折跃',5,'沿瞄准方向瞬移，受墙体阻挡。'],
    ['backstep','逆向闪现',6,'朝瞄准反方向瞬移。'],
    ['phaseShift','相位外壳',10,'获得短时减伤。'],
    ['swapGate','回响折跃',8,'折跃后从落点向外震退敌人。'],
    ['anchor','修复锚点',13,'恢复生命并获得短时减伤。'],
    ['stasis','凝滞光场',12,'在前方落点震慑敌人。'],
    ['eventHorizon','视界跃迁',15,'较远折跃，落点爆发伤害与震慑。'],
  ]],
  ['fire', '余烬', '#ffba80', '✦', [
    ['fireball','余烬火球',5,'发射会爆炸并施加灼烧的火球。'],
    ['fireFan','烬羽散射',7,'向扇面发射三枚小火球。'],
    ['emberRing','环焰',8,'在自身周围点燃敌人。'],
    ['torch','灼热长矛',9,'发射可穿透一名敌人的炎矛。'],
    ['cinderBurst','焦痕爆裂',10,'在瞄准位置引发小范围爆燃。'],
    ['meteor','坠火',12,'投射较慢、爆炸范围更大的火球。'],
    ['phoenix','浴火回生',16,'在自身周围爆燃，并恢复少量生命。'],
  ]],
];

export const SKILL_BRANCHES = branches.map(([id,label,color,glyph,rows]) => ({ id,label,color,glyph,ids:rows.map(row=>row[0]) }));
const ranks = [1, 2, 2, 3, 3, 4, 5];
const parents = [[], [0], [0], [1], [2], [3, 4], [5]];
export const NUMBER_SKILLS = Object.freeze(Object.fromEntries(branches.flatMap(([branch,,color,glyph,rows]) =>
  rows.map(([id,label,cooldown,description], index) => [id, Object.freeze({
    branch, label, cooldown, description, color, glyph, rank:ranks[index],
    requires:parents[index].map(parent=>rows[parent][0]),
    movement:['blink','backstep','swapGate','eventHorizon'].includes(id),
    defensive:['blink','backstep','airStep','phaseShift'].includes(id),
  })]))));
export const STARTER_SKILLS = SKILL_BRANCHES.map(branch=>branch.ids[0]);
export const DEFAULT_SKILLS = ['storm','gust'];

export function normalizeSkills(unlocked, loadout) {
  const requested = Array.isArray(unlocked) ? new Set(unlocked) : new Set();
  const owned = [];
  for (const [id,skill] of Object.entries(NUMBER_SKILLS)) {
    if (STARTER_SKILLS.includes(id) || (requested.has(id) && skill.requires.every(parent=>owned.includes(parent)))) owned.push(id);
  }
  const selected = [...new Set((Array.isArray(loadout)?loadout:DEFAULT_SKILLS).filter(id=>owned.includes(id)))].slice(0,2);
  return { unlockedSkills:owned, equippedSkills:selected };
}

export const skillCost = skill => [0, 0, 100, 220, 420, 700][skill.rank];

export function researchSkill(save,id) {
  if (!Object.hasOwn(NUMBER_SKILLS,id) || save.unlockedSkills.includes(id)) return false;
  const skill = NUMBER_SKILLS[id], cost = skillCost(skill);
  if (save.credits < cost || !skill.requires.every(parent=>save.unlockedSkills.includes(parent))) return false;
  save.credits -= cost;
  save.unlockedSkills.push(id);
  return true;
}

export function toggleLoadoutSkill(save,id) {
  if (!save.unlockedSkills.includes(id)) return false;
  const index = save.equippedSkills.indexOf(id);
  if (index >= 0) {
    save.equippedSkills.splice(index,1);
    return true;
  }
  if (save.equippedSkills.length >= 2) return false;
  save.equippedSkills.push(id);
  return true;
}
