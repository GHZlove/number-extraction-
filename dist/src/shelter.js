import { FACILITIES, difficultyOf } from './config.js';
import { WEAPONS, RARITIES, makeEquipment, decorateWeapon, ENCHANTS } from './equipment.js';

export function facilityLevel(save, key) {
  const legacy = key === 'storage' ? save.upgrades?.capacity : key === 'supply' ? save.upgrades?.divider : 0;
  const value = save.shelter?.[key] ?? legacy ?? 0;
  return Math.max(0, Math.min(FACILITIES[key]?.max || 0, Number.isFinite(value) ? Math.floor(value) : 0));
}

export function facilityCost(key, level) {
  const definition = FACILITIES[key];
  if (!definition || level >= definition.max || !Number.isInteger(level) || level < 0) return null;
  return {
    credits: Math.round(definition.base * (level+1) ** 1.35),
    alloy: Math.ceil(definition.alloy * (level+1) ** 1.1),
    core: level >= 2 ? Math.floor((level+1)/3) : 0,
  };
}

export function canUpgradeFacility(save, key) {
  const cost = facilityCost(key, facilityLevel(save,key));
  return !!cost && save.credits >= cost.credits && (save.materials?.alloy || 0) >= cost.alloy && (save.materials?.core || 0) >= cost.core;
}

export function upgradeFacility(save, key) {
  if (!canUpgradeFacility(save,key)) return false;
  const level = facilityLevel(save,key), cost = facilityCost(key,level);
  save.credits -= cost.credits; save.materials.alloy -= cost.alloy; save.materials.core -= cost.core;
  save.shelter[key] = level+1;
  if (key === 'storage') save.upgrades.capacity = Math.min(3,level+1);
  if (key === 'supply') save.upgrades.divider = Math.min(2,level+1);
  return true;
}

export function unlockedWeapons(save) {
  const level = facilityLevel(save,'workshop');
  return Object.keys(WEAPONS).filter(key => WEAPONS[key].unlock <= level);
}

export function workshopGrade(save) {
  return RARITIES[Math.min(3,Math.floor(facilityLevel(save,'workshop')/2))];
}

export function starterLoadout(save, requested = save.selectedWeapon) {
  const unlocked = unlockedWeapons(save), primary = unlocked.includes(requested) ? requested : 'pistol';
  const secondary = WEAPONS[primary].mode === 'melee' ? 'pistol' : 'greatsword';
  const grade = workshopGrade(save).id, level = facilityLevel(save,'workshop');
  const starter = (kind,type,rarity,id) => ({ ...makeEquipment(kind,type,rarity,id), starter: true, value: 0 });
  const forged=save.forged?.[primary];
  const primaryGrade=forged?RARITIES[Math.max(RARITIES.findIndex(r=>r.id===forged.rarity),RARITIES.findIndex(r=>r.id===grade))].id:grade;
  const issued=starter('weapon',primary,primaryGrade,'starter-primary');
  return {
    weapons: [forged?{...decorateWeapon(issued,forged.enchant,forged.level),forged:true}:issued,starter('weapon',secondary,grade,'starter-secondary')],
    armor: level >= 2 ? starter('armor','',RARITIES[Math.min(2,Math.floor(level/3))].id,'starter-armor') : null,
    laser: level >= 4 ? starter('laser','','white','starter-laser') : null,
  };
}

export const rewardMultiplier = (save, difficulty) => difficultyOf(difficulty).reward * (1+facilityLevel(save,'recycler')*0.05);
export const shelterLevel = save => 1+Math.floor(Object.keys(FACILITIES).reduce((sum,key) => sum+facilityLevel(save,key),0)/3);
export function forgeCost(save,weapon=save.selectedWeapon){
  if(!unlockedWeapons(save).includes(weapon))return null;
  const record=save.forged?.[weapon],level=record?.level||0;
  if(level>=5)return record.enchant!==save.selectedEnchant?{credits:180,alloy:8,core:1}:null;
  return{credits:Math.round(120*(level+1)**1.4),alloy:6*(level+1),core:level>=2?level-1:0};
}
export function canForge(save){
  const cost=forgeCost(save);return !!cost&&save.credits>=cost.credits&&save.materials.alloy>=cost.alloy&&save.materials.core>=cost.core;
}
export function forgeWeapon(save){
  if(!canForge(save)||!Object.hasOwn(ENCHANTS,save.selectedEnchant))return false;
  const cost=forgeCost(save),level=Math.min(5,(save.forged?.[save.selectedWeapon]?.level||0)+1);
  save.credits-=cost.credits;save.materials.alloy-=cost.alloy;save.materials.core-=cost.core;
  save.forged||={};save.forged[save.selectedWeapon]={level,rarity:RARITIES[level===5?5:level-1].id,enchant:save.selectedEnchant};return true;
}
export function facilityBenefit(key, level) {
  if (key === 'storage') return `装备背包 ${8+level*2} 格 · 资源袋不限量`;
  if (key === 'supply') return `开局 ÷2 ${2+level} · 修复 ${1+Math.floor(level/2)}`;
  if (key === 'recycler') return `撤离资源收益 +${level*5}%`;
  const count = Object.values(WEAPONS).filter(weapon => weapon.unlock <= level).length;
  return `${count} 类出击武器 · ${RARITIES[Math.min(3,Math.floor(level/2))].name}品基础装备`;
}

export function salvageMaterials(items) {
  const result = { alloy: 0, core: 0 };
  for (const item of items) {
    if (item.starter || item.currencyOnly) continue;
    const rank = RARITIES.findIndex(grade => grade.id === item.rarity);
    result.alloy += item.kind === 'loot' || !item.kind ? Math.max(1,Math.floor(item.value/16)) : Math.max(1,rank+1);
    result.core += item.zone === 2 || rank >= 4 ? 1 : 0;
    if(item.bossLoot){result.alloy+=12;result.core+=3;}
  }
  return result;
}
