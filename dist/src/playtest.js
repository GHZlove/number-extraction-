// Local, bounded observations. This module never sends data or edits game saves.
import { VERSION, DIFFICULTIES, MAP_LAYOUTS } from './config.js';
import { MUTATORS, normalizeMutators, EXIT_BONUSES } from './run-rules.js';
import { WEAPONS, RARITIES, ENCHANTS } from './equipment.js';

export const JOURNAL_KEY='number-extraction-playtest-v1';
export const JOURNAL_LIMIT=100;
export const BALANCE_VERSION='0.11.1';
const MAX_BYTES=262144;
export const EXTRACTION_REASONS=Object.freeze({
 pressure:'热度或敌人压力',resources:'资源已经足够',full_bag:'装备背包已满',time:'行动时间不足',
 nearby:'出口就在附近',boss:'已击败首领',test:'测试这条路线',other:'其他原因',
});
export const UNFAIR_REASONS=Object.freeze({
 none:'没有不公平或看不清',fog:'浓雾视野',explosion:'爆炸或残爆',telegraph:'攻击预警',
 offscreen:'画面外攻击',crowding:'敌群拥挤',terrain:'地形或卡位',other:'其他问题',
});
export const DEATH_CAUSES=Object.freeze({
 unknown:'其他或未知攻击',contact:'数字接触',melee:'近战攻击',slam:'巨像重击',blast:'爆破冲击',
 projectile:'敌方弹丸',boss_hit:'首领重击',boss_charge:'首领冲锋',boss_hazard:'首领区域攻击',
 poison:'首领毒雾',volatile:'敌人残爆',
});
const OUTCOMES=new Set(['in_progress','extracted','defeated','timeout','abandoned','interrupted']);
const FINISHED=new Set(['extracted','defeated','timeout','abandoned']);
const difficultyIds=new Set(DIFFICULTIES.map(item=>item.id));
const mapIds=new Set(MAP_LAYOUTS.map(item=>item.id));
const rarityIds=new Set(RARITIES.map(item=>item.id));
const own=(object,key)=>typeof key==='string'&&Object.hasOwn(object,key);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const metric=(value,max=7200,min=0)=>Number.isFinite(value)&&value>=min&&value<=max?value:null;
const whole=(value,max=1e9,min=0)=>Number.isInteger(value)&&value>=min&&value<=max?value:null;
const semanticVersion=value=>typeof value==='string'&&/^\d+\.\d+\.\d+$/.test(value)&&value.length<=20?value:null;
const runId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value)?value:null;
const rounded=value=>Math.round(value*1000)/1000;
const average=values=>values.length?rounded(values.reduce((sum,value)=>sum+value,0)/values.length):null;
const numberValue=value=>Number.isInteger(value)&&value>=1&&value<=2048&&Number.isInteger(Math.log2(value))?value:null;

export const emptyJournal=()=>({schema:1,enabled:true,nextSession:1,runs:[]});

function normalizeLoadout(value){
 const data=object(value)?value:{};
 const weapons=Array.isArray(data.weapons)?data.weapons.slice(0,2).filter(item=>object(item)&&own(WEAPONS,item.weapon)&&rarityIds.has(item.rarity)&&whole(item.level,5,1)!==null&&own(ENCHANTS,item.enchant)).map(item=>({weapon:item.weapon,rarity:item.rarity,level:item.level,enchant:item.enchant})):[];
 return{weapons,armorRarity:data.armorRarity==='none'||rarityIds.has(data.armorRarity)?data.armorRarity:null,laser:typeof data.laser==='boolean'?data.laser:null};
}
function normalizeFeedback(value){
 const data=object(value)?value:{};
 const rating=typeof data.pressure==='string'&&/^[1-5]$/.test(data.pressure)?Number(data.pressure):data.pressure;
 return{extractReason:own(EXTRACTION_REASONS,data.extractReason)?data.extractReason:null,pressure:whole(rating,5,1),unfair:own(UNFAIR_REASONS,data.unfair)?data.unfair:null};
}
function snapshot(value){
 const data=object(value)?value:{};
 return{
  buildVersion:semanticVersion(data.buildVersion),balanceVersion:semanticVersion(data.balanceVersion),
  seed:whole(data.seed,4294967295),difficulty:difficultyIds.has(data.difficulty)?data.difficulty:null,map:mapIds.has(data.map)?data.map:null,
  mutators:normalizeMutators(data.mutators),loadout:normalizeLoadout(data.loadout),
  duration:metric(data.duration),seconds:metric(data.seconds),number:numberValue(data.number),heat:metric(data.heat,100),hpPercent:metric(data.hpPercent,100),
  rawValue:whole(data.rawValue),gearCount:whole(data.gearCount,100),bagCapacity:whole(data.bagCapacity,100),chests:whole(data.chests,10000),
  huntersSpawned:whole(data.huntersSpawned,120),firstHunterAt:metric(data.firstHunterAt),hunterWaves:whole(data.hunterWaves,120),kills:whole(data.kills,1e6),
 };
}
function normalizeRun(value){
 if(!object(value)||!runId(value.id)||whole(value.session,1e9,1)===null)return null;
 const outcome=OUTCOMES.has(value.outcome)?value.outcome:'interrupted';
 return{id:value.id,session:value.session,...snapshot(value),outcome,
  deathCause:outcome==='defeated'?(own(DEATH_CAUSES,value.deathCause)?value.deathCause:'unknown'):null,
  exitType:outcome==='extracted'&&own(EXIT_BONUSES,value.exitType)?value.exitType:null,
  feedback:normalizeFeedback(value.feedback)};
}
export function normalizeJournal(value){
 const result=emptyJournal();
 if(!object(value)||value.schema!==1)return result;
 result.enabled=value.enabled!==false;
 const seenIds=new Set(),seenSessions=new Set();
 const candidates=Array.isArray(value.runs)?value.runs.map(normalizeRun).filter(Boolean).sort((a,b)=>b.session-a.session):[];
 result.runs=candidates.filter(run=>{
  if(seenIds.has(run.id)||seenSessions.has(run.session))return false;
  seenIds.add(run.id);seenSessions.add(run.session);return true;
 }).slice(0,JOURNAL_LIMIT);
 const greatest=result.runs.reduce((max,run)=>Math.max(max,run.session),0);
 result.nextSession=Math.max(greatest+1,whole(value.nextSession,1e9,1)||1);
 return result;
}
export function readJournal(storage){
 try{
  const text=storage.getItem(JOURNAL_KEY);
  if(text===null)return{journal:emptyJournal(),available:true};
  if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES)throw Error('Journal is too large');
  const data=JSON.parse(text);
  if(!object(data)||data.schema!==1)throw Error('Unsupported journal');
  return{journal:normalizeJournal(data),available:true};
 }catch{return{journal:emptyJournal(),available:false};}
}
export function writeJournal(storage,journal){
 try{
  const text=JSON.stringify(normalizeJournal(journal));
  if(new TextEncoder().encode(text).length>MAX_BYTES)return false;
  storage.setItem(JOURNAL_KEY,text);return true;
 }catch{return false;}
}
function usable(journal){return object(journal)&&journal.schema===1&&Array.isArray(journal.runs)&&journal.runs.every(object);}
export function recordStart(journal,value){
 if(!usable(journal)||journal.enabled===false||!object(value)||!runId(value.id)||journal.runs.some(run=>run.id===value.id))return false;
 const next=whole(journal.nextSession,1e9,1);
 if(next===null||next>=1e9)return false;
 const record={id:value.id,session:next,...snapshot(value),outcome:'in_progress',deathCause:null,exitType:null,feedback:normalizeFeedback(null)};
 record.buildVersion||=VERSION;record.balanceVersion||=BALANCE_VERSION;
 journal.nextSession=next+1;journal.runs.unshift(record);journal.runs.length=Math.min(journal.runs.length,JOURNAL_LIMIT);return true;
}
const observed=['seconds','number','heat','hpPercent','rawValue','gearCount','bagCapacity','chests','huntersSpawned','firstHunterAt','hunterWaves','kills'];
export function recordCheckpoint(journal,value){
 if(!usable(journal)||!object(value))return false;
 const record=journal.runs.find(run=>run.id===value.id&&run.outcome==='in_progress');
 if(!record)return false;
 const incoming=snapshot(value);let changed=false;
 if(incoming.seconds!==null&&record.seconds!==null&&incoming.seconds<record.seconds)return false;
 const counters=new Set(['seconds','heat','chests','huntersSpawned','hunterWaves','kills']);
 for(const key of observed){
  if(counters.has(key)&&incoming[key]!==null&&record[key]!==null&&incoming[key]<record[key])continue;
  if(incoming[key]!==null&&incoming[key]!==record[key]){record[key]=incoming[key];changed=true;}
 }
 return changed;
}
function causeOf(reason){
 const exact={
  '在数字碰撞中被击破':'contact','被近战攻击击破':'melee','被巨像重击击破':'slam','被爆破冲击击破':'blast',
  '被敌方弹丸击破':'projectile','被首领重击击破':'boss_hit','被首领冲锋击破':'boss_charge',
  '被首领毒雾侵蚀':'poison','被残爆击破':'volatile',
 };
 if(own(exact,reason))return exact[reason];
 // These are fixed labels created by boss-hazards.js, not user-provided text.
 const hazards=['危险区域','十字雷击','寒霜地带','扩散冰环','锁定轰炸','熔炉走廊','引力井','坍缩之环'];
 if(typeof reason==='string'&&hazards.some(label=>reason==='被'+label+'击破'))return'boss_hazard';
 return'unknown';
}
export function recordFinish(journal,result){
 if(!usable(journal)||!object(result)||!runId(result.id))return false;
 let record=journal.runs.find(run=>run.id===result.id);
 if(record&&record.outcome!=='in_progress')return false;
 const final=object(result.playtest)?result.playtest:{};
 if(!record){
  if(!recordStart(journal,{...final,id:result.id}))return false;
  record=journal.runs.find(run=>run.id===result.id);
 }
 const fields={...final,id:result.id};
 for(const key of ['seconds','number','heat','rawValue','kills'])if(result[key]!==undefined)fields[key]=result[key];
 recordCheckpoint(journal,fields);
 // A final missing observation is unknown, not evidence that a start-time zero
 // remained zero for the entire raid (especially for actual hunter arrivals).
 const finalObservation=snapshot(fields);
 for(const key of observed)if(finalObservation[key]===null)record[key]=null;
 record.outcome=result.success===true?'extracted':result.reason==='主动返回庇护所'?'abandoned':result.reason==='行动超时，信号失联'?'timeout':'defeated';
 record.deathCause=record.outcome==='defeated'?causeOf(result.reason):null;
 record.exitType=record.outcome==='extracted'&&own(EXIT_BONUSES,result.extractedVia)?result.extractedVia:null;
 return true;
}
export function interruptOpenRuns(journal){
 if(!usable(journal))return false;
 let changed=false;
 for(const run of journal.runs)if(run.outcome==='in_progress'){run.outcome='interrupted';run.deathCause=null;run.exitType=null;changed=true;}
 return changed;
}
export function setFeedback(journal,id,patch){
 if(!usable(journal)||!object(patch))return false;
 const record=journal.runs.find(run=>run.id===id);
 if(!record||!FINISHED.has(record.outcome))return false;
 const fields=Object.keys(patch);
 if(!fields.length||fields.some(key=>!['extractReason','pressure','unfair'].includes(key)))return false;
 if(record.outcome!=='extracted'&&Object.hasOwn(patch,'extractReason')&&patch.extractReason!==null&&patch.extractReason!=='')return false;
 const feedback=normalizeFeedback({...record.feedback,...patch});
 if(JSON.stringify(feedback)===JSON.stringify(record.feedback))return false;
 record.feedback=feedback;return true;
}
export function summarizeJournal(value){
 const journal=normalizeJournal(value),runs=journal.runs,finished=runs.filter(run=>FINISHED.has(run.outcome)),extracted=finished.filter(run=>run.outcome==='extracted'),defeated=finished.filter(run=>run.outcome==='defeated');
 const modifierCounts=Object.fromEntries(Object.keys(MUTATORS).map(key=>[key,0])),exitCounts=Object.fromEntries(Object.keys(EXIT_BONUSES).map(key=>[key,0]));
 const deathCounts=Object.fromEntries(Object.keys(DEATH_CAUSES).map(key=>[key,0])),extractionReasons=Object.fromEntries(Object.keys(EXTRACTION_REASONS).map(key=>[key,0])),unfairCounts=Object.fromEntries(Object.keys(UNFAIR_REASONS).map(key=>[key,0]));
 const combos=new Map();
 for(const run of runs){
  for(const id of run.mutators)modifierCounts[id]++;
  const key=run.mutators.join('+');if(!combos.has(key))combos.set(key,{mutators:[...run.mutators],count:0});combos.get(key).count++;
 }
 for(const run of extracted)if(run.exitType)exitCounts[run.exitType]++;
 for(const run of defeated)deathCounts[run.deathCause||'unknown']++;
 for(const run of extracted)if(run.feedback.extractReason)extractionReasons[run.feedback.extractReason]++;
 for(const run of finished)if(run.feedback.unfair!==null)unfairCounts[run.feedback.unfair]++;
 const pressure=finished.map(run=>run.feedback.pressure).filter(value=>value!==null);
 const late=extracted.filter(run=>run.duration!==null&&run.duration>0&&run.seconds!==null&&run.seconds>=run.duration*.75);
 const unhunted=run=>run.huntersSpawned===0;
 return{
  started:runs.length,finished:finished.length,extracted:extracted.length,defeated:defeated.length,
  timeouts:finished.filter(run=>run.outcome==='timeout').length,abandoned:finished.filter(run=>run.outcome==='abandoned').length,
  interrupted:runs.filter(run=>run.outcome==='interrupted').length,inProgress:runs.filter(run=>run.outcome==='in_progress').length,
  modifierCounts,comboCounts:[...combos.values()].sort((a,b)=>b.count-a.count||a.mutators.join('+').localeCompare(b.mutators.join('+'))),
  exitCounts,unknownExitExtractions:extracted.filter(run=>run.exitType===null).length,
  averageSeconds:average(finished.map(run=>run.seconds).filter(value=>value!==null)),
  averageFinalHeat:average(finished.map(run=>run.heat).filter(value=>value!==null)),
  unhuntedExtractions:extracted.filter(unhunted).length,lateExtractions:late.length,lateUnhuntedExtractions:late.filter(unhunted).length,
  fullBagUnhuntedExtractions:extracted.filter(run=>unhunted(run)&&run.gearCount!==null&&run.bagCapacity!==null&&run.bagCapacity>0&&run.gearCount>=run.bagCapacity).length,
  deathCounts,feedbackCount:finished.filter(run=>Object.values(run.feedback).some(value=>value!==null)).length,
  extractionReasons,extractionReasonResponses:extracted.filter(run=>run.feedback.extractReason!==null).length,
  pressureResponses:pressure.length,meanPressure:average(pressure),
  unfairResponses:finished.filter(run=>run.feedback.unfair!==null).length,unfairCounts,
 };
}
export function serializeJournal(value){
 const journal=normalizeJournal(value);
 const runs=journal.runs.map(({id,...anonymous})=>anonymous);
 const text=JSON.stringify({game:'number-extraction-playtest',schema:1,balanceVersion:BALANCE_VERSION,runs},null,2);
 if(new TextEncoder().encode(text).length>MAX_BYTES)throw Error('试玩记录超过256KB。');
 return text;
}
