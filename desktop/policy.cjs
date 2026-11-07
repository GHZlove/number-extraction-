const path = require('node:path');

const ORIGIN = 'nextract://game';
const APP_URL = `${ORIGIN}/index.html`;
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
const TYPES = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};

function isGameURL(value) {
  try { const u = new URL(value); return u.protocol === 'nextract:' && u.hostname === 'game' && !u.username && !u.password && !u.port; }
  catch { return false; }
}
function resolveAsset(root, value) {
  if (!isGameURL(value)) return null;
  let decoded;
  try { decoded = decodeURIComponent(new URL(value).pathname); } catch { return null; }
  if (/[\\\0:]/.test(decoded) || decoded.split('/').includes('..')) return null;
  const file = path.resolve(root, '.' + (decoded === '/' ? '/index.html' : decoded));
  const relative = path.relative(path.resolve(root), file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !TYPES[path.extname(file)]) return null;
  return {file,type:TYPES[path.extname(file)]};
}
function validSaveText(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text,'utf8') > 524288) return false;
  try {
    const data = JSON.parse(text);
    return !!data && !Array.isArray(data) && [1,2,3,4,5].includes(data.version) && Number.isFinite(data.credits) && data.credits >= 0;
  } catch { return false; }
}

// This export boundary accepts only the anonymous, finite playtest schema.
// It never accepts progress saves, local run identifiers, free text or file paths.
const PLAYTEST_EXPORT_LIMIT = 262144;
const PLAYTEST_REVIEW_MAX_FILES = 8;
const PLAYTEST_REVIEW_TOTAL_LIMIT = PLAYTEST_EXPORT_LIMIT * PLAYTEST_REVIEW_MAX_FILES;
const RUN_KEYS = ['session','buildVersion','balanceVersion','seed','difficulty','map','mutators','loadout','duration','seconds','number','heat','hpPercent','rawValue','gearCount','bagCapacity','chests','huntersSpawned','firstHunterAt','hunterWaves','kills','outcome','deathCause','exitType','feedback'];
const WEAPON_KEYS = ['pistol','smg','rifle','sniper','greatsword','dualblades','shotgun','carbine','lmg','crossbow','grenade','spear','warhammer','railgun','revolver','doublebarrel','plasma','flamethrower','rocket','battleaxe'];
const ENCHANT_KEYS = ['none','leech','lightning','stun','poison','burn','frost','bleed','sunder','detonate','critical','gravity','energize'];
const RARITY_KEYS = ['white','yellow','green','blue','purple','red'];
const MODIFIER_KEYS = ['doubled','no_dodge','fog','rich','glass','haste','scarcity','short','jammed','volatile'];
const OUTCOMES = ['in_progress','extracted','defeated','timeout','abandoned','interrupted'];
const DEATH_KEYS = ['unknown','contact','melee','slam','blast','projectile','boss_hit','boss_charge','boss_hazard','poison','volatile'];
const EXIT_KEYS = ['fallback','window','key','number','boss'];
const EXTRACT_REASONS = ['pressure','resources','full_bag','time','nearby','boss','test','other'];
const UNFAIR_REASONS = ['none','fog','explosion','telegraph','offscreen','crowding','terrain','other'];
const exactKeys = (value,keys) => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key=>Object.hasOwn(value,key));
const finite = (value,min,max,integer=false) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
const optionalNumber = (value,min,max,integer=false) => value === null || finite(value,min,max,integer);
const optionalEnum = (value,values) => value === null || values.includes(value);
const version = value => value === null || typeof value === 'string' && value.length <= 20 && /^\d+\.\d+\.\d+$/.test(value);
function validPlaytestText(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text,'utf8') > PLAYTEST_EXPORT_LIMIT) return false;
  let data;try { data=JSON.parse(text); } catch { return false; }
  if (!exactKeys(data,['game','schema','balanceVersion','runs']) || data.game !== 'number-extraction-playtest' || data.schema !== 1 || data.balanceVersion !== '0.11.1' || !Array.isArray(data.runs) || data.runs.length > 100) return false;
  if (new Set(data.runs.map(run=>run?.session)).size !== data.runs.length) return false;
  return data.runs.every(run=>{
    if (!exactKeys(run,RUN_KEYS) || !finite(run.session,1,1e9,true) || !version(run.buildVersion) || !version(run.balanceVersion) || !optionalNumber(run.seed,0,4294967295,true)) return false;
    if (!optionalEnum(run.difficulty,['scout','standard','hard','severe','nightmare']) || !optionalEnum(run.map,['random','tangram','fracture','blocks','wilds'])) return false;
    if (!Array.isArray(run.mutators) || run.mutators.length > 3 || new Set(run.mutators).size !== run.mutators.length || !run.mutators.every(key=>MODIFIER_KEYS.includes(key))) return false;
    const loadout=run.loadout;
    if (!exactKeys(loadout,['weapons','armorRarity','laser']) || !Array.isArray(loadout.weapons) || loadout.weapons.length > 2 || !optionalEnum(loadout.armorRarity,['none',...RARITY_KEYS]) || !(loadout.laser === null || typeof loadout.laser === 'boolean')) return false;
    if (!loadout.weapons.every(weapon=>exactKeys(weapon,['weapon','rarity','level','enchant']) && WEAPON_KEYS.includes(weapon.weapon) && RARITY_KEYS.includes(weapon.rarity) && finite(weapon.level,1,5,true) && ENCHANT_KEYS.includes(weapon.enchant))) return false;
    if (!optionalNumber(run.duration,0,7200) || !optionalNumber(run.seconds,0,7200) || !optionalNumber(run.firstHunterAt,0,7200) || !optionalNumber(run.heat,0,100) || !optionalNumber(run.hpPercent,0,100)) return false;
    if (!(run.number === null || finite(run.number,1,2048,true) && Number.isInteger(Math.log2(run.number)))) return false;
    for (const [key,max] of Object.entries({rawValue:1e9,gearCount:100,bagCapacity:100,chests:10000,huntersSpawned:120,hunterWaves:120,kills:1e6})) if (!optionalNumber(run[key],0,max,true)) return false;
    if (!OUTCOMES.includes(run.outcome) || !optionalEnum(run.deathCause,DEATH_KEYS) || !optionalEnum(run.exitType,EXIT_KEYS)) return false;
    const feedback=run.feedback;
    return exactKeys(feedback,['extractReason','pressure','unfair']) && optionalEnum(feedback.extractReason,EXTRACT_REASONS) && optionalNumber(feedback.pressure,1,5,true) && optionalEnum(feedback.unfair,UNFAIR_REASONS);
  });
}
module.exports = {APP_URL,ORIGIN,CSP,isGameURL,resolveAsset,validSaveText,validPlaytestText,PLAYTEST_EXPORT_LIMIT,PLAYTEST_REVIEW_MAX_FILES,PLAYTEST_REVIEW_TOTAL_LIMIT};
