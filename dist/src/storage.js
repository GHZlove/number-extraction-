import { normalizeMutators } from './run-rules.js';
import { bossPool } from './bosses.js';
import { defaultWarehouse, normalizeWarehouse, normalizeDeployment, warehouseCapacity, storeExtractedGear } from './warehouse.js';
import { SAVE_KEY, PREVIOUS_SAVE_KEY, OLDER_SAVE_KEY, LEGACY_SAVE_KEY, V09_SAVE_KEY, V10_SAVE_KEY, UPGRADES, FACILITIES, difficultyOf, MAP_LAYOUTS } from './config.js';
import { unlockedWeapons } from './shelter.js';
import { ENCHANTS, WEAPONS, RARITIES } from './equipment.js';

const integer = (value, max = 1e9) => Number.isFinite(value) ? Math.max(0,Math.min(max,Math.floor(value))) : 0;
export const defaultSave = () => ({
  version: 5, credits: 0, extractions: 0, deaths: 0, best: 1,
  upgrades: { capacity: 0, divider: 0 }, materials: { alloy: 0, core: 0 },
  shelter: { warehouse:0, storage: 0, supply: 0, workshop: 0, recycler: 0 },
  warehouse:defaultWarehouse(),deployment:{},selectedBoss:'random',selectedMutators:[],
  selectedDifficulty: 'scout', selectedWeapon: 'pistol', selectedMap:'random',selectedEnchant:'leech',forged:{},lastRuns: [],
});

export function normalizeSave(data) {
  if (!data || ![1,2,3,4,5].includes(data.version)) return defaultSave();
  const save = defaultSave();
  for (const key of ['credits','extractions','deaths']) save[key] = integer(data[key]);
  save.best = Math.max(1,integer(data.best,2048));
  for (const key of Object.keys(UPGRADES)) save.upgrades[key] = integer(data.upgrades?.[key],UPGRADES[key].max);
  for (const key of Object.keys(FACILITIES)) {
    const fallback = key === 'storage' ? save.upgrades.capacity : key === 'supply' ? save.upgrades.divider : 0;
    save.shelter[key] = Math.max(fallback,integer(data.shelter?.[key],FACILITIES[key].max));
  }
  save.materials.alloy = integer(data.materials?.alloy); save.materials.core = integer(data.materials?.core);
  save.selectedDifficulty = difficultyOf(data.selectedDifficulty).id;
  save.selectedWeapon = unlockedWeapons(save).includes(data.selectedWeapon) ? data.selectedWeapon : 'pistol';
  save.selectedMap=MAP_LAYOUTS.some(m=>m.id===data.selectedMap)?data.selectedMap:'random';
  save.selectedEnchant=Object.hasOwn(ENCHANTS,data.selectedEnchant)?data.selectedEnchant:'leech';
  for(const key of Object.keys(WEAPONS)){
    const item=data.forged?.[key];if(!item||!Number.isInteger(item.level)||item.level<1||item.level>5)continue;
    save.forged[key]={level:item.level,rarity:RARITIES[item.level===5?5:item.level-1].id,enchant:Object.hasOwn(ENCHANTS,item.enchant)?item.enchant:'none'};
  }
  save.selectedMutators=normalizeMutators(data.selectedMutators);
  save.warehouse=normalizeWarehouse(data.warehouse);
  const excess=save.warehouse.items.splice(warehouseCapacity(save));save.warehouse.pending.unshift(...excess);
  save.deployment=normalizeDeployment(save,data.deployment);
  save.selectedBoss=bossPool(difficultyOf(save.selectedDifficulty).rank).includes(data.selectedBoss)?data.selectedBoss:'random';
  save.lastRuns = Array.isArray(data.lastRuns) ? data.lastRuns.slice(0,6).filter(run => run && typeof run.id === 'string').map(run => ({
    id: run.id.slice(0,100), success: run.success === true, value: integer(run.value),
    number: Math.max(1,integer(run.number,2048)), seconds: integer(run.seconds,1200),
    difficulty: difficultyOf(run.difficulty).id,
    materials: { alloy: integer(run.materials?.alloy), core: integer(run.materials?.core) },
    warehouse:{stored:integer(run.warehouse?.stored),pending:integer(run.warehouse?.pending)},
    mutators:normalizeMutators(run.mutators),heat:integer(run.heat,100),seed:integer(run.seed,4294967295),
  })) : [];
  return save;
}
export function readSave(storage) {
  try {
    const current=storage.getItem(SAVE_KEY),legacy=current===null?(storage.getItem(V10_SAVE_KEY)??storage.getItem(V09_SAVE_KEY)??storage.getItem(PREVIOUS_SAVE_KEY)??storage.getItem(OLDER_SAVE_KEY)??storage.getItem(LEGACY_SAVE_KEY)):null;
    return { save:normalizeSave(JSON.parse(current??legacy)),available:true,migrated:current===null&&legacy!==null };
  }
  catch { return { save: defaultSave(), available: false }; }
}
export function writeSave(storage, save) {
  try { storage.setItem(SAVE_KEY,JSON.stringify(save)); return true; } catch { return false; }
}
export function settleRun(save, result) {
  if (save.lastRuns.some(run => run.id === result.id)) return false;
  const materials = result.success ? { alloy: integer(result.materials?.alloy), core: integer(result.materials?.core) } : { alloy: 0, core: 0 };
  if (result.success) {
    save.credits += result.value; save.extractions++;
    save.materials.alloy += materials.alloy; save.materials.core += materials.core;
    if(result.gear)result.warehouse=storeExtractedGear(save,result.gear);
  } else save.deaths++;
  save.best = Math.max(save.best,result.number);
  save.lastRuns.unshift({ id: result.id, success: result.success, value: result.success ? result.value : 0,
    number: result.number, seconds: Math.floor(result.seconds), difficulty: difficultyOf(result.difficulty).id, materials, warehouse:result.warehouse||{stored:0,pending:0},mutators:normalizeMutators(result.mutators),heat:integer(result.heat,100),seed:integer(result.seed,4294967295) });
  save.lastRuns = save.lastRuns.slice(0,6);
  return true;
}
// Retain the old upgrade API for v0.1/v0.2 tools and saves.
export function buyUpgrade(save, key) {
  const definition = UPGRADES[key];
  if (!definition) return false;
  const level = save.upgrades[key];
  if (level >= definition.max || save.credits < definition.cost(level)) return false;
  save.credits -= definition.cost(level); save.upgrades[key]++;
  if (key === 'capacity') save.shelter.storage = Math.max(save.shelter.storage,save.upgrades.capacity);
  if (key === 'divider') save.shelter.supply = Math.max(save.shelter.supply,save.upgrades.divider);
  return true;
}
