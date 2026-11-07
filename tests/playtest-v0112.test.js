import test from 'node:test';
import assert from 'node:assert/strict';
import {
 JOURNAL_KEY,JOURNAL_LIMIT,BALANCE_VERSION,EXTRACTION_REASONS,UNFAIR_REASONS,DEATH_CAUSES,
 emptyJournal,normalizeJournal,readJournal,writeJournal,recordStart,recordCheckpoint,recordFinish,
 interruptOpenRuns,setFeedback,summarizeJournal,serializeJournal,
} from '../dist/src/playtest.js';
import { SAVE_KEY } from '../dist/src/config.js';

function memory(){
 const data=new Map();return{data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
}
function entry(id='run-1',extra={}){
 return{id,buildVersion:'0.11.2',balanceVersion:BALANCE_VERSION,seed:77,difficulty:'hard',map:'blocks',mutators:['fog','doubled'],
  loadout:{weapons:[{weapon:'rifle',rarity:'white',level:1,enchant:'none'}],armorRarity:'none',laser:false},
  duration:360,seconds:0,number:1,heat:0,hpPercent:100,rawValue:0,gearCount:0,bagCapacity:8,chests:0,huntersSpawned:0,firstHunterAt:null,hunterWaves:0,kills:0,...extra};
}
function end(journal,id,extra={}){
 const final=entry(id,{seconds:300,number:256,heat:80,hpPercent:60,rawValue:500,gearCount:4,chests:5,kills:20,...extra});
 const result={id,success:true,reason:'成功撤离',extractedVia:'key',seconds:final.seconds,heat:final.heat,number:final.number,rawValue:final.rawValue,kills:final.kills,playtest:final,...extra};
 return recordFinish(journal,result);
}
const exported=journal=>JSON.parse(serializeJournal(journal));

test('journal starts empty with honest missing-data averages and a separate storage key',()=>{
 const store=memory(),before=JSON.stringify({version:5,credits:17});store.setItem(SAVE_KEY,before);
 const read=readJournal(store);assert.equal(read.available,true);assert.equal(read.journal.runs.length,0);assert.equal(read.journal.enabled,true);
 const stats=summarizeJournal(read.journal);assert.equal(stats.started,0);assert.equal(stats.finished,0);assert.equal(stats.averageSeconds,null);assert.equal(stats.averageFinalHeat,null);assert.equal(stats.meanPressure,null);
 assert.equal(Object.keys(stats.modifierCounts).length,10);assert.equal(Object.keys(stats.exitCounts).length,5);
 assert.equal(writeJournal(store,read.journal),true);assert.ok(store.getItem(JOURNAL_KEY));assert.equal(store.getItem(SAVE_KEY),before);
});

test('starting and finishing are idempotent and do not accept a different caller identifier',()=>{
 const journal=emptyJournal(),snapshot=entry();assert.equal(recordStart(journal,snapshot),true);assert.equal(recordStart(journal,snapshot),false);
 assert.equal(journal.runs[0].outcome,'in_progress');assert.equal(journal.runs[0].session,1);
 assert.equal(end(journal,'run-1'),true);assert.equal(end(journal,'run-1'),false);assert.equal(journal.runs.length,1);
 assert.equal(recordFinish(journal,{id:'email@example.com',success:true}),false);assert.equal(journal.runs.length,1);
});

test('checkpoints preserve starting configuration, update observations and reject stale time',()=>{
 const journal=emptyJournal();recordStart(journal,entry());
 assert.equal(recordCheckpoint(journal,entry('run-1',{seconds:120,heat:50,huntersSpawned:3,firstHunterAt:101,hunterWaves:2,mutators:[],loadout:{weapons:[]}})),true);
 const run=journal.runs[0];assert.equal(run.seconds,120);assert.equal(run.huntersSpawned,3);assert.equal(run.firstHunterAt,101);assert.equal(run.outcome,'in_progress');
 assert.deepEqual(run.mutators,['doubled','fog']);assert.equal(run.loadout.weapons[0].weapon,'rifle');
 assert.equal(recordCheckpoint(journal,entry('run-1',{seconds:50,heat:20,huntersSpawned:1})),false);assert.equal(run.seconds,120);
 assert.equal(recordCheckpoint(journal,entry('run-1',{seconds:150,huntersSpawned:2,hpPercent:50})),true);
 assert.equal(run.huntersSpawned,3);assert.equal(run.hpPercent,50);assert.equal(recordCheckpoint(journal,entry('missing')),false);
});

test('disabled recording does not create rows but an already-started run can finish',()=>{
 const journal=emptyJournal();journal.enabled=false;
 assert.equal(recordStart(journal,entry()),false);assert.equal(end(journal,'run-1'),false);assert.equal(journal.nextSession,1);
 journal.enabled=true;recordStart(journal,entry());journal.enabled=false;assert.equal(end(journal,'run-1'),true);assert.equal(journal.runs.length,1);
});

test('bounded history keeps the newest hundred sessions without reusing their ordinal',()=>{
 const journal=emptyJournal();
 for(let i=1;i<=JOURNAL_LIMIT+3;i++)recordStart(journal,entry('run-'+i));
 assert.equal(journal.runs.length,100);assert.equal(journal.runs[0].session,103);assert.equal(journal.runs.at(-1).session,4);assert.equal(journal.nextSession,104);
 const restored=normalizeJournal({...journal,nextSession:1});assert.equal(restored.nextSession,104);
 recordStart(restored,entry('next'));assert.equal(restored.runs[0].session,104);
});

test('normalization removes duplicate rows, invalid tokens, unknown keys and invalid observations',()=>{
 const journal=emptyJournal();recordStart(journal,entry());const row=journal.runs[0];
 const restored=normalizeJournal({schema:1,nextSession:1,runs:[
  {...row,secret:'password',email:'person@example.com',seconds:Infinity,heat:-1,huntersSpawned:NaN,number:3,seed:-1,mutators:['unknown','fog','fog','rich','doubled','short'],feedback:{pressure:99,unfair:'<script>',note:'private'},loadout:{weapons:[{weapon:'rifle',rarity:'white',level:1,enchant:'none',id:'secret',name:'private'}],armorRarity:'red',laser:true}},
  {...row,seconds:900}, {...row,id:'other-token'}, {...row,id:'person@example.com',session:2}, null,
 ],email:'person@example.com'});
 assert.equal(restored.runs.length,1);const safe=restored.runs[0];
 assert.equal(safe.seconds,null);assert.equal(safe.heat,null);assert.equal(safe.huntersSpawned,null);assert.equal(safe.number,null);assert.equal(safe.seed,null);
 assert.deepEqual(safe.mutators,['doubled','fog','rich']);assert.deepEqual(safe.feedback,{extractReason:null,pressure:null,unfair:null});
 assert.equal(safe.secret,undefined);assert.equal(safe.loadout.weapons[0].id,undefined);assert.equal(safe.loadout.weapons[0].name,undefined);
 assert.deepEqual(normalizeJournal(null),emptyJournal());assert.deepEqual(normalizeJournal({schema:2}),emptyJournal());
});

test('interruption preserves the last observation but never becomes a death or terminal denominator',()=>{
 const journal=emptyJournal();recordStart(journal,entry('quit'));recordCheckpoint(journal,entry('quit',{seconds:80,heat:35,huntersSpawned:2,firstHunterAt:75}));
 assert.equal(interruptOpenRuns(journal),true);assert.equal(interruptOpenRuns(journal),false);
 const run=journal.runs[0];assert.equal(run.outcome,'interrupted');assert.equal(run.seconds,80);assert.equal(run.deathCause,null);
 assert.equal(end(journal,'quit'),false);const stats=summarizeJournal(journal);assert.equal(stats.started,1);assert.equal(stats.finished,0);assert.equal(stats.defeated,0);assert.equal(stats.interrupted,1);assert.equal(stats.averageSeconds,null);
});

test('outcomes distinguish abandonment and timeout from combat deaths',()=>{
 const journal=emptyJournal();
 for(const [id,reason,expected] of [['contact','在数字碰撞中被击破','defeated'],['quit','主动返回庇护所','abandoned'],['clock','行动超时，信号失联','timeout']]){
  recordStart(journal,entry(id));assert.equal(end(journal,id,{success:false,reason,extractedVia:'boss'}),true);assert.equal(journal.runs[0].outcome,expected);assert.equal(journal.runs[0].exitType,null);
 }
 const stats=summarizeJournal(journal);assert.equal(stats.finished,3);assert.equal(stats.defeated,1);assert.equal(stats.abandoned,1);assert.equal(stats.timeouts,1);assert.equal(stats.deathCounts.contact,1);
});

test('known combat causes use canonical codes without exporting arbitrary reason text',()=>{
 const journal=emptyJournal(),cases=[
  ['被敌方弹丸击破','projectile'],['被残爆击破','volatile'],['被首领毒雾侵蚀','poison'],
  ['被十字雷击击破','boss_hazard'],['被扩散冰环击破','boss_hazard'],['被首领冲锋击破','boss_charge'],
  ['private note person@example.com','unknown'],
 ];
 for(const [index,[reason,code]] of cases.entries()){
  const id='cause-'+index;recordStart(journal,entry(id));end(journal,id,{success:false,reason});
  assert.equal(journal.runs[0].deathCause,code);assert.ok(DEATH_CAUSES[code]);
 }
 assert.doesNotMatch(serializeJournal(journal),/person@example|private note/);
});

test('modifier picks use all observed starts while exit shares only count actual successful extractions',()=>{
 const journal=emptyJournal();
 recordStart(journal,entry('a',{mutators:['fog']}));end(journal,'a',{mutators:['fog'],extractedVia:'fallback'});
 recordStart(journal,entry('b',{mutators:[]}));end(journal,'b',{success:false,reason:'被敌方弹丸击破'});
 recordStart(journal,entry('c',{mutators:['rich']}));end(journal,'c',{extractedVia:'boss'});
 recordStart(journal,entry('d',{mutators:['fog']}));interruptOpenRuns(journal);
 recordStart(journal,entry('e',{mutators:['short']}));
 const stats=summarizeJournal(journal);
 assert.equal(stats.started,5);assert.equal(stats.finished,3);assert.equal(stats.extracted,2);assert.equal(stats.modifierCounts.fog,2);assert.equal(stats.modifierCounts.rich,1);assert.equal(stats.modifierCounts.short,1);assert.equal(stats.modifierCounts.doubled,0);
 assert.equal(stats.exitCounts.fallback,1);assert.equal(stats.exitCounts.boss,1);assert.equal(Object.values(stats.exitCounts).reduce((a,b)=>a+b,0),2);
 assert.deepEqual(stats.comboCounts.find(group=>group.mutators.length===0),{mutators:[],count:1});
});

test('actual hunter appearances remain distinct from queued waves and missing observations',()=>{
 const journal=emptyJournal();
 recordStart(journal,entry('safe'));end(journal,'safe',{huntersSpawned:0,hunterWaves:4,gearCount:8});
 recordStart(journal,entry('hunted'));end(journal,'hunted',{huntersSpawned:3,firstHunterAt:180,hunterWaves:4,gearCount:8});
 recordStart(journal,entry('early'));end(journal,'early',{seconds:100,huntersSpawned:0,gearCount:2});
 recordStart(journal,entry('unknown'));end(journal,'unknown',{huntersSpawned:null,firstHunterAt:null,hunterWaves:4,gearCount:8});
 const stats=summarizeJournal(journal);
 assert.equal(stats.extracted,4);assert.equal(stats.unhuntedExtractions,2);assert.equal(stats.lateExtractions,3);assert.equal(stats.lateUnhuntedExtractions,1);assert.equal(stats.fullBagUnhuntedExtractions,1);
 assert.equal(journal.runs.find(run=>run.id==='unknown').huntersSpawned,null,'a start-time zero does not prove zero arrivals by extraction');
});

test('unknown final hunter data does not manufacture an unobserved zero when no start observation exists',()=>{
 const journal=emptyJournal();recordFinish(journal,{id:'unknown',success:true,extractedVia:'key',seconds:300,playtest:{...entry('unknown'),huntersSpawned:null}});
 assert.equal(journal.runs[0].huntersSpawned,null);assert.equal(summarizeJournal(journal).unhuntedExtractions,0);
});

test('feedback is optional, structured, clearable and measured with response-specific denominators',()=>{
 const journal=emptyJournal();
 for(const id of ['a','b','c']){recordStart(journal,entry(id));end(journal,id,{success:id!=='c',reason:id==='c'?'被残爆击破':'成功撤离'});}
 assert.equal(setFeedback(journal,'a',{extractReason:'pressure',pressure:'4',unfair:'none'}),true);
 assert.equal(setFeedback(journal,'b',{pressure:2}),true);assert.equal(setFeedback(journal,'c',{unfair:'explosion'}),true);
 assert.equal(setFeedback(journal,'c',{extractReason:'boss'}),false);assert.equal(setFeedback(journal,'a',{email:'person@example.com'}),false);
 assert.equal(setFeedback(journal,'a',{pressure:4}),false);assert.equal(setFeedback(journal,'b',{pressure:''}),true);
 const stats=summarizeJournal(journal);assert.equal(stats.feedbackCount,2);assert.equal(stats.extractionReasonResponses,1);assert.equal(stats.extractionReasons.pressure,1);assert.equal(stats.pressureResponses,1);assert.equal(stats.meanPressure,4);assert.equal(stats.unfairResponses,2);assert.equal(stats.unfairCounts.none,1);assert.equal(stats.unfairCounts.explosion,1);
 assert.equal(Object.keys(EXTRACTION_REASONS).length,8);assert.equal(Object.keys(UNFAIR_REASONS).length,8);
 recordStart(journal,entry('active'));assert.equal(setFeedback(journal,'active',{pressure:2}),false);interruptOpenRuns(journal);assert.equal(setFeedback(journal,'active',{pressure:2}),false);
});

test('anonymous exports are bounded fixed-schema JSON with no internal identifier or absolute timestamp',()=>{
 const journal=emptyJournal(),privateId='1794000000000-77';recordStart(journal,entry(privateId));end(journal,privateId);
 const text=serializeJournal(journal),data=JSON.parse(text);
 assert.deepEqual(Object.keys(data),['game','schema','balanceVersion','runs']);assert.equal(data.game,'number-extraction-playtest');assert.equal(data.schema,1);assert.equal(data.balanceVersion,'0.11.1');assert.equal(data.runs[0].session,1);assert.equal(data.runs[0].seed,77);
 assert.equal(data.runs[0].id,undefined);assert.doesNotMatch(text,/1794000000000|timestamp|email|device|https?:|\/workspace/);
 assert.equal(data.runs[0].buildVersion,'0.11.2');assert.equal(new TextEncoder().encode(text).length<262144,true);
});

test('read failures, malformed versions and oversized records fail safely without editing the original save',()=>{
 const store=memory();store.setItem(SAVE_KEY,'original game');
 for(const value of ['{bad',JSON.stringify({schema:9}),'"'+ 'a'.repeat(262144)+'"']){
  store.setItem(JOURNAL_KEY,value);const result=readJournal(store);assert.equal(result.available,false);assert.equal(result.journal.runs.length,0);
 }
 assert.equal(readJournal({getItem(){throw Error('denied');}}).available,false);
 assert.equal(writeJournal({setItem(){throw Error('denied');}},emptyJournal()),false);
 assert.equal(store.getItem(SAVE_KEY),'original game');
});

test('storage round trips preserve feedback and newest-session order without taking ownership of warehouse data',()=>{
 const store=memory(),journal=emptyJournal();store.setItem(SAVE_KEY,JSON.stringify({version:5,credits:99,warehouse:{items:[{id:'private-gear'}]}}));
 recordStart(journal,entry('a'));end(journal,'a');setFeedback(journal,'a',{pressure:5,extractReason:'time'});
 recordStart(journal,entry('b'));end(journal,'b',{success:false,reason:'被首领重击击破'});
 assert.equal(writeJournal(store,journal),true);const restored=readJournal(store);assert.equal(restored.available,true);assert.deepEqual(restored.journal,journal);assert.equal(restored.journal.runs[1].feedback.pressure,5);
 assert.equal(JSON.parse(store.getItem(SAVE_KEY)).warehouse.items[0].id,'private-gear');assert.doesNotMatch(serializeJournal(restored.journal),/private-gear/);
});
