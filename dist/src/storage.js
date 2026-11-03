import { SAVE_KEY, UPGRADES } from './config.js';

const integer = (value, max=1e9) => Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
export const defaultSave = () => ({ version: 1, credits: 0, extractions: 0, deaths: 0, best: 1, upgrades: {capacity: 0, divider: 0}, lastRuns: [] });
export function normalizeSave(data) {
  if (!data || data.version !== 1) return defaultSave();
  const save = defaultSave();
  for (const key of ['credits','extractions','deaths']) save[key] = integer(data[key]);
  save.best = Math.max(1, integer(data.best, 2048));
  for (const key of Object.keys(UPGRADES)) save.upgrades[key] = integer(data.upgrades?.[key], UPGRADES[key].max);
  save.lastRuns = Array.isArray(data.lastRuns) ? data.lastRuns.slice(0,6).filter(r => r && typeof r.id === 'string').map(r => ({
    id:r.id.slice(0,100), success:r.success === true, value:integer(r.value), number:Math.max(1,integer(r.number,2048)), seconds:integer(r.seconds,420),
  })) : [];
  return save;
}
export function readSave(storage) {
  try { return { save: normalizeSave(JSON.parse(storage.getItem(SAVE_KEY))), available: true }; }
  catch { return { save: defaultSave(), available: false }; }
}
export function writeSave(storage, save) {
  try { storage.setItem(SAVE_KEY, JSON.stringify(save)); return true; } catch { return false; }
}
// Settlement is idempotent: reopening a result screen cannot mint more credits.
export function settleRun(save, result) {
  if (save.lastRuns.some(run => run.id === result.id)) return false;
  if (result.success) { save.credits += result.value; save.extractions++; }
  else save.deaths++;
  save.best = Math.max(save.best, result.number);
  save.lastRuns.unshift({ id:result.id, success:result.success, value:result.success ? result.value : 0, number:result.number, seconds:Math.floor(result.seconds) });
  save.lastRuns = save.lastRuns.slice(0,6);
  return true;
}
export function buyUpgrade(save, key) {
  const definition = UPGRADES[key];
  if (!definition) return false;
  const level = save.upgrades[key];
  if (level >= definition.max) return false;
  const cost = definition.cost(level);
  if (save.credits < cost) return false;
  save.credits -= cost; save.upgrades[key]++;
  return true;
}
