// Read-only review of deliberately exported anonymous reports. No storage or network.
import { DIFFICULTIES, MAP_LAYOUTS } from './config.js';
import { MUTATORS, EXIT_BONUSES } from './run-rules.js';
import { WEAPONS, RARITIES, ENCHANTS } from './equipment.js';
import { DEATH_CAUSES, EXTRACTION_REASONS, UNFAIR_REASONS, BALANCE_VERSION } from './playtest.js';

export const MAX_REVIEW_REPORTS=8;
export const MAX_REPORT_BYTES=262144;
export const MAX_REVIEW_BYTES=2097152;
export const REVIEW_GATES=Object.freeze({finished:10,known:5,fallbackShare:.2,beforeHunterShare:.5,dominantDeathShare:.6,patchInvestigations:2});
const RUN_KEYS=['session','buildVersion','balanceVersion','seed','difficulty','map','mutators','loadout','duration','seconds','number','heat','hpPercent','rawValue','gearCount','bagCapacity','chests','huntersSpawned','firstHunterAt','hunterWaves','kills','outcome','deathCause','exitType','feedback'];
const METRICS={duration:[7200,false],seconds:[7200,false],heat:[100,false],hpPercent:[100,false],rawValue:[1e9,true],gearCount:[100,true],bagCapacity:[100,true],chests:[10000,true],huntersSpawned:[120,true],firstHunterAt:[7200,false],hunterWaves:[120,true],kills:[1e6,true]};
const OUTCOMES=['in_progress','extracted','defeated','timeout','abandoned','interrupted'];
const FINISHED=new Set(['extracted','defeated','timeout','abandoned']);
const difficultyIds=DIFFICULTIES.map(value=>value.id),mapIds=MAP_LAYOUTS.map(value=>value.id),rarityIds=RARITIES.map(value=>value.id);
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const enumOrNull=(value,values)=>value===null||values.includes(value);
const finite=(value,max,integer=false,min=0)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max&&(!integer||Number.isInteger(value));
const optionalNumber=(value,max,integer=false)=>value===null||finite(value,max,integer);
const version=value=>value===null||typeof value==='string'&&value.length<=20&&/^\d+\.\d+\.\d+$/.test(value);
const own=(values,key)=>typeof key==='string'&&Object.hasOwn(values,key);
const countBy=(rows,key,allowed)=>{const counts=Object.fromEntries(allowed.map(value=>[value,0]));for(const row of rows)if(own(counts,row[key]))counts[row[key]]++;return counts;};
const average=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
const ratio=(count,total)=>total?count/total:null;
function invalid(){throw Error('报告不是受支持的匿名试玩JSON，或包含无效、额外及矛盾字段。');}

export function parseAnonymousReport(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_REPORT_BYTES)throw Error('每份匿名试玩报告不能超过256KB。');
 let data;try{data=JSON.parse(text);}catch{invalid();}
 if(!exact(data,['game','schema','balanceVersion','runs'])||data.game!=='number-extraction-playtest'||data.schema!==1||data.balanceVersion!==BALANCE_VERSION||!Array.isArray(data.runs)||data.runs.length>100)invalid();
 const sessions=new Set(),modifierOrder=Object.keys(MUTATORS);
 const runs=data.runs.map(value=>{
  if(!exact(value,RUN_KEYS)||!finite(value.session,1e9,true,1)||sessions.has(value.session)||!version(value.buildVersion)||!version(value.balanceVersion)||!optionalNumber(value.seed,4294967295,true))invalid();
  sessions.add(value.session);
  if(!enumOrNull(value.difficulty,difficultyIds)||!enumOrNull(value.map,mapIds))invalid();
  if(!Array.isArray(value.mutators)||value.mutators.length>3||new Set(value.mutators).size!==value.mutators.length||!value.mutators.every(id=>own(MUTATORS,id)))invalid();
  const loadout=value.loadout;
  if(!exact(loadout,['weapons','armorRarity','laser'])||!Array.isArray(loadout.weapons)||loadout.weapons.length>2||!enumOrNull(loadout.armorRarity,['none',...rarityIds])||!(loadout.laser===null||typeof loadout.laser==='boolean'))invalid();
  const weapons=loadout.weapons.map(weapon=>{
   if(!exact(weapon,['weapon','rarity','level','enchant'])||!own(WEAPONS,weapon.weapon)||!rarityIds.includes(weapon.rarity)||!finite(weapon.level,5,true,1)||!own(ENCHANTS,weapon.enchant))invalid();
   return{weapon:weapon.weapon,rarity:weapon.rarity,level:weapon.level,enchant:weapon.enchant};
  });
  for(const [key,[max,integer]]of Object.entries(METRICS))if(!optionalNumber(value[key],max,integer))invalid();
  if(!(value.number===null||finite(value.number,2048,true,1)&&Number.isInteger(Math.log2(value.number))))invalid();
  if(!OUTCOMES.includes(value.outcome)||!enumOrNull(value.deathCause,Object.keys(DEATH_CAUSES))||!enumOrNull(value.exitType,Object.keys(EXIT_BONUSES)))invalid();
  if(value.outcome!=='defeated'&&value.deathCause!==null||value.outcome!=='extracted'&&value.exitType!==null)invalid();
  const feedback=value.feedback;
  if(!exact(feedback,['extractReason','pressure','unfair'])||!enumOrNull(feedback.extractReason,Object.keys(EXTRACTION_REASONS))||!(feedback.pressure===null||finite(feedback.pressure,5,true,1))||!enumOrNull(feedback.unfair,Object.keys(UNFAIR_REASONS)))invalid();
  if(value.outcome!=='extracted'&&feedback.extractReason!==null||!FINISHED.has(value.outcome)&&Object.values(feedback).some(answer=>answer!==null))invalid();
  if(value.huntersSpawned===0&&value.firstHunterAt!==null||value.firstHunterAt!==null&&value.seconds!==null&&value.firstHunterAt>value.seconds+1)invalid();
  if(value.seconds!==null&&value.duration!==null&&value.seconds>value.duration+1)invalid();
  const run=Object.fromEntries(RUN_KEYS.map(key=>[key,value[key]]));
  run.mutators=modifierOrder.filter(id=>value.mutators.includes(id));
  run.loadout={weapons,armorRarity:loadout.armorRarity,laser:loadout.laser};
  run.feedback={extractReason:feedback.extractReason,pressure:feedback.pressure,unfair:feedback.unfair};
  return run;
 }).sort((a,b)=>b.session-a.session);
 return{game:'number-extraction-playtest',schema:1,balanceVersion:data.balanceVersion,runs};
}
function loadoutLabel(loadout){
 const weapons=loadout.weapons.length?loadout.weapons.map(item=>`${item.weapon}/${item.rarity}/L${item.level}/${item.enchant}`).join(' + '):'unknown weapons';
 return`${weapons}; armour=${loadout.armorRarity??'unknown'}; laser=${loadout.laser===null?'unknown':loadout.laser?'yes':'no'}`;
}
function summarizeCohort(key,rows,overlapCount){
 const first=rows[0],finished=rows.filter(row=>FINISHED.has(row.outcome)),extracted=finished.filter(row=>row.outcome==='extracted'),defeated=finished.filter(row=>row.outcome==='defeated');
 const exitCounts=countBy(extracted,'exitType',Object.keys(EXIT_BONUSES)),deathCounts=countBy(defeated,'deathCause',Object.keys(DEATH_CAUSES));
 const modifierCounts=Object.fromEntries(Object.keys(MUTATORS).map(id=>[id,0]));
 for(const run of rows)for(const id of run.mutators)modifierCounts[id]++;
 const unusedModifiers=Object.keys(modifierCounts).filter(id=>modifierCounts[id]===0),combos=new Map();
 for(const run of rows){const key=run.mutators.join('+');if(!combos.has(key))combos.set(key,{mutators:[...run.mutators],count:0});combos.get(key).count++;}
 const knownExits=extracted.filter(row=>row.exitType!==null).length,knownHunters=extracted.filter(row=>row.huntersSpawned!==null),beforeHunters=knownHunters.filter(row=>row.huntersSpawned===0);
 const late=extracted.filter(row=>row.duration!==null&&row.duration>0&&row.seconds!==null&&row.seconds>=row.duration*.75);
 const knownDeaths=defeated.filter(row=>row.deathCause!==null&&row.deathCause!=='unknown');
 const dominant=Object.entries(deathCounts).filter(([cause,count])=>cause!=='unknown'&&count>0).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0];
 const maps=countBy(rows,'map',mapIds),loadouts=new Map();
 for(const run of rows){const label=loadoutLabel(run.loadout);loadouts.set(label,(loadouts.get(label)||0)+1);}
 const ready=finished.length>=REVIEW_GATES.finished&&!overlapCount&&first.buildVersion!==null&&first.balanceVersion!==null&&first.difficulty!==null;
 const findings=[];
 const add=(code,title,detail,qualifies=false)=>findings.push({code,title,detail,severity:ready&&qualifies?'watch':'info'});
 if(finished.length<REVIEW_GATES.finished)add('insufficient_sample','完成样本不足10局',`本组有${finished.length}局已结束记录，只展示描述；先补足10—20局。`);
 if(overlapCount)add('possible_overlap','先核对可能重叠的报告',`跨报告发现${overlapCount}组相同对局内容，不能据此自动确认是同一玩家；排查前暂停调整建议。`);
 if(first.buildVersion===null||first.balanceVersion===null||first.difficulty===null)add('unknown_cohort','分组信息不完整','版本或难度未知，不能与有明确配置的样本混合判断。');
 const fallbackShare=ratio(exitCounts.fallback,knownExits),beforeHunterShare=ratio(beforeHunters.length,knownHunters.length);
 if(knownExits>=REVIEW_GATES.known&&fallbackShare<REVIEW_GATES.fallbackShare)add('fallback_low','西侧保底出口占比较低',`已知出口的${knownExits}次成功撤离中，西侧${exitCounts.fallback}次（${Math.round(fallbackShare*100)}%）。核对路线距离、条件与奖励；低于20%只是排查信号，不证明特殊出口太安全。`,true);
 if(knownHunters.length>=REVIEW_GATES.known&&beforeHunterShare>REVIEW_GATES.beforeHunterShare)add('unhunted_majority','多数已知样本在追猎出现前撤离',`${knownHunters.length}次有追猎计数的成功撤离中，${beforeHunters.length}次未刷出追猎队。先比较撤离时长、安全屋与压力评分，不能仅凭这一项认定热度无效。`,true);
 if(unusedModifiers.length)add('unused_modifiers','本组存在尚未选用的词条',`在${rows.length}局出击中尚未使用：${unusedModifiers.map(id=>MUTATORS[id].name).join('、')}。这不是全体玩家偏好；先核对测试安排、说明和选择动机，再考虑奖励。`,rows.length>=REVIEW_GATES.finished);
 if(dominant&&knownDeaths.length>=REVIEW_GATES.known&&dominant[1]/knownDeaths.length>=REVIEW_GATES.dominantDeathShare)add('dominant_death','一种已知死因较集中',`${knownDeaths.length}次已知攻击死因中，${DEATH_CAUSES[dominant[0]]}占${dominant[1]}次（${Math.round(dominant[1]/knownDeaths.length*100)}%）。核对敌人暴露、预警、装备及不公平反馈；这不是自动削弱依据。`,true);
 if(extracted.length>knownExits)add('unknown_exits','部分撤离缺少出口类型',`${extracted.length-knownExits}次成功撤离的出口未知。西侧比例使用${knownExits}次已知出口作分母，并单列未知记录。`);
 if(extracted.length>knownHunters.length)add('unknown_hunters','部分撤离缺少追猎观测',`${extracted.length-knownHunters.length}次成功撤离的实际追猎数未知，不把它们记成零。`);
 const pressure=finished.map(row=>row.feedback.pressure).filter(value=>value!==null);
 const priority={dominant_death:4,fallback_low:3,unhunted_majority:2,unused_modifiers:1};
 const reviewQueue=ready?findings.filter(item=>item.severity==='watch').sort((a,b)=>(priority[b.code]||0)-(priority[a.code]||0)).slice(0,REVIEW_GATES.patchInvestigations):[];
 return{key,buildVersion:first.buildVersion,balanceVersion:first.balanceVersion,difficulty:first.difficulty,started:rows.length,finished:finished.length,extracted:extracted.length,defeated:defeated.length,
  timeouts:finished.filter(row=>row.outcome==='timeout').length,abandoned:finished.filter(row=>row.outcome==='abandoned').length,interrupted:rows.filter(row=>row.outcome==='interrupted').length,inProgress:rows.filter(row=>row.outcome==='in_progress').length,
  knownExits,unknownExitExtractions:extracted.length-knownExits,exitCounts,fallbackShare,knownHunterExtractions:knownHunters.length,beforeHunterExtractions:beforeHunters.length,beforeHunterShare,
  lateExtractions:late.length,lateUnhuntedExtractions:late.filter(row=>row.huntersSpawned===0).length,modifierCounts,unusedModifiers,comboCounts:[...combos.values()].sort((a,b)=>b.count-a.count||a.mutators.join('+').localeCompare(b.mutators.join('+'))),deathCounts,knownDeathCount:knownDeaths.length,
  dominantDeath:dominant?{cause:dominant[0],count:dominant[1],share:ratio(dominant[1],knownDeaths.length)}:null,
  maps,unknownMaps:rows.filter(row=>row.map===null).length,loadouts:[...loadouts].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label)),
  averageSeconds:average(finished.map(row=>row.seconds).filter(value=>value!==null)),averageFinalHeat:average(finished.map(row=>row.heat).filter(value=>value!==null)),
  extractionReasons:countBy(extracted.map(row=>row.feedback),'extractReason',Object.keys(EXTRACTION_REASONS)),extractionReasonResponses:extracted.filter(row=>row.feedback.extractReason!==null).length,
  feedbackCount:finished.filter(row=>Object.values(row.feedback).some(value=>value!==null)).length,pressureResponses:pressure.length,meanPressure:average(pressure),
  unfairResponses:finished.filter(row=>row.feedback.unfair!==null).length,unfairCounts:countBy(finished.map(row=>row.feedback),'unfair',Object.keys(UNFAIR_REASONS)),
  findings,reviewQueue,ready};
}
export function analyzePlaytestReports(texts){
 if(!Array.isArray(texts)||texts.length>MAX_REVIEW_REPORTS)throw Error('一次最多分析8份匿名试玩报告。');
 if(texts.some(text=>typeof text!=='string')||texts.reduce((sum,text)=>sum+new TextEncoder().encode(text).length,0)>MAX_REVIEW_BYTES)throw Error('报告总量不能超过2MB。');
 const fingerprints=new Set(),reports=[];let duplicateReportCount=0;
 for(const [index,text]of texts.entries()){
  let parsed;try{parsed=parseAnonymousReport(text);}catch(error){throw Error(`报告${index+1}：${error.message}`);}
  const fingerprint=JSON.stringify(parsed);
  if(fingerprints.has(fingerprint)){duplicateReportCount++;continue;}
  fingerprints.add(fingerprint);reports.push(parsed);
 }
 const observed=new Map();
 for(const [index,report]of reports.entries())for(const row of report.runs){
  const {feedback,...gameplay}=row,fingerprint=JSON.stringify(gameplay);
  if(!observed.has(fingerprint))observed.set(fingerprint,new Set());observed.get(fingerprint).add(index);
 }
 const overlapCount=[...observed.values()].filter(sources=>sources.size>1).length;
 const warnings=[];
 if(!texts.length)warnings.push({code:'no_reports',message:'尚未导入报告。请先收集实际试玩导出的匿名JSON。'});
 if(duplicateReportCount)warnings.push({code:'duplicate_reports',message:`${duplicateReportCount}份内容完全相同的报告已跳过；文件内容不等于玩家身份。`});
 if(overlapCount)warnings.push({code:'possible_overlap',message:`发现${overlapCount}组跨报告相同的对局内容。未自动删除或识别玩家；请移除同一来源的旧版重叠导出后再审查。`});
 const grouped=new Map();
 for(const report of reports)for(const row of report.runs){const key=JSON.stringify([row.buildVersion,row.balanceVersion,row.difficulty]);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row);}
 const cohorts=[...grouped].map(([key,rows])=>summarizeCohort(key,rows,overlapCount)).sort((a,b)=>a.key.localeCompare(b.key));
 return{schema:1,reportCount:texts.length,acceptedReportCount:reports.length,duplicateReportCount,totalStarted:reports.reduce((sum,report)=>sum+report.runs.length,0),totalFinished:cohorts.reduce((sum,cohort)=>sum+cohort.finished,0),overlapCount,warnings,cohorts};
}
