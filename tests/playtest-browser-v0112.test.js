import test from 'node:test';
import assert from 'node:assert/strict';
import { browserStubs } from './helpers/browser-stubs.js';
import { defaultSave } from '../dist/src/storage.js';
import { SAVE_KEY } from '../dist/src/config.js';
import { Raid } from '../dist/src/game.js';
import { emptyJournal, readJournal, writeJournal, recordStart, recordFinish, summarizeJournal, JOURNAL_KEY } from '../dist/src/playtest.js';

function controls(env){
 const shelter=env.ids.get('shelter-screen'),dialog=env.ids.get('dialog');
 const click=(element,action,key)=>{const button=element.children.find(b=>b.dataset.action===action&&(key===undefined||b.dataset.key===key));assert.ok(button,action);element.dispatch('click',{target:button});};
 return{action:(action,key)=>click(shelter,action,key),abandon:()=>{env.window.dispatch('keydown',{code:'Escape',target:env.canvas});click(dialog,'abandonAsk');click(dialog,'abandon');}};
}
function storeGame(env){const save=defaultSave();save.credits=123;save.materials={alloy:7,core:1};env.window.localStorage.setItem(SAVE_KEY,JSON.stringify(save));return save;}
function finishedFixture(){
 const journal=emptyJournal(),snapshot={id:'1770000000000-private-id',buildVersion:'0.11.2',balanceVersion:'0.11.1',seed:505,difficulty:'scout',map:'blocks',mutators:['fog'],duration:240,seconds:0,number:1,heat:0,hpPercent:100,rawValue:0,gearCount:0,bagCapacity:8,chests:0,huntersSpawned:0,firstHunterAt:null,hunterWaves:0};
 recordStart(journal,snapshot);recordFinish(journal,{id:snapshot.id,success:true,reason:'成功撤离',extractedVia:'key',seconds:62,heat:30,rawValue:80,value:88,kills:4,number:16,playtest:{...snapshot,seconds:62,heat:30,rawValue:80,number:16}});return journal;
}

test('actual application starts a journal row and separates voluntary return from combat death',async t=>{
 const env=browserStubs(t);storeGame(env);await import('../dist/src/main.js?playtest-real-start-finish');const c=controls(env);
 c.action('start');let journal=readJournal(env.window.localStorage).journal;assert.equal(journal.runs.length,1);assert.equal(journal.runs[0].outcome,'in_progress');assert.equal(journal.runs[0].buildVersion,'0.11.2');
 c.abandon();journal=readJournal(env.window.localStorage).journal;assert.equal(journal.runs.length,1);assert.equal(journal.runs[0].outcome,'abandoned');const summary=summarizeJournal(journal);assert.equal(summary.finished,1);assert.equal(summary.defeated,0);assert.equal(summary.abandoned,1);
 const saved=JSON.parse(env.window.localStorage.getItem(SAVE_KEY));assert.equal(saved.credits,123);assert.deepEqual(saved.materials,{alloy:7,core:1});
 c.action('shelterTab','journal');assert.equal(env.ids.get('shelter-screen').dataset.tab,'journal');assert.match(env.ids.get('shelter-screen').innerHTML,/不自动上传/);
});

test('pausing checkpoints observations and reopening classifies a pending run as interrupted',async t=>{
 const env=browserStubs(t);await import('../dist/src/main.js?playtest-checkpoint-first');const c=controls(env);c.action('start');
 const frame=env.frames.find(fn=>fn.name==='frame');frame(100);frame(200);env.window.dispatch('keydown',{code:'Escape',target:env.canvas});
 const observed=readJournal(env.window.localStorage).journal.runs[0].seconds;assert.ok(observed>0);
 await import('../dist/src/main.js?playtest-checkpoint-reopen');const journal=readJournal(env.window.localStorage).journal;assert.equal(journal.runs.length,1);assert.equal(journal.runs[0].outcome,'interrupted');assert.equal(journal.runs[0].seconds,observed);assert.equal(summarizeJournal(journal).finished,0);assert.equal(summarizeJournal(journal).defeated,0);
});

test('recording opt-out persists separately and does not block playing or alter stored resources',async t=>{
 const env=browserStubs(t);storeGame(env);await import('../dist/src/main.js?playtest-opt-out');const c=controls(env),before=env.window.localStorage.getItem(SAVE_KEY);
 c.action('toggleRecording');assert.equal(readJournal(env.window.localStorage).journal.enabled,false);assert.equal(env.window.localStorage.getItem(SAVE_KEY),before);
 c.action('start');c.abandon();assert.equal(readJournal(env.window.localStorage).journal.runs.length,0);assert.equal(JSON.parse(env.window.localStorage.getItem(SAVE_KEY)).credits,123);
});

test('failed journal writes leave progress saving usable and offer the in-memory journal for export',async t=>{
 const env=browserStubs(t);storeGame(env);const set=env.window.localStorage.setItem.bind(env.window.localStorage);env.window.localStorage.setItem=(key,value)=>{if(key===JOURNAL_KEY)throw Error('quota');set(key,value);};
 let exported;env.window.numberExtractionDesktop={isDesktop:true,setRaidActive(){},async exportPlaytest(text){exported=text;return{ok:true};}};
 await import('../dist/src/main.js?playtest-storage-failure');const c=controls(env);c.action('start');c.abandon();c.action('shelterTab','journal');
 assert.match(env.ids.get('shelter-screen').innerHTML,/本机记录未能写入/);assert.equal(JSON.parse(env.window.localStorage.getItem(SAVE_KEY)).credits,123);assert.equal(readJournal(env.window.localStorage).journal.runs.length,0);
 c.action('exportPlaytest');await Promise.resolve();const report=JSON.parse(exported);assert.equal(report.runs.length,1);assert.equal(report.runs[0].outcome,'abandoned');assert.equal(Object.hasOwn(report,'credits'),false);assert.equal(Object.hasOwn(report.runs[0],'id'),false);
});

test('actual feedback controls persist structured answers and desktop export strips private identifiers',async t=>{
 const env=browserStubs(t);storeGame(env);writeJournal(env.window.localStorage,finishedFixture());let exported;
 env.window.numberExtractionDesktop={isDesktop:true,setRaidActive(){},async exportPlaytest(text){exported=text;return{ok:true};}};
 await import('../dist/src/main.js?playtest-feedback-export');const c=controls(env);c.action('shelterTab','journal');const shelter=env.ids.get('shelter-screen'),id=readJournal(env.window.localStorage).journal.runs[0].id;
 shelter.dispatch('change',{target:{dataset:{action:'playtestFeedback',key:id,field:'pressure'},value:'4'}});shelter.dispatch('change',{target:{dataset:{action:'playtestFeedback',key:id,field:'extractReason'},value:'pressure'}});
 const run=readJournal(env.window.localStorage).journal.runs[0];assert.equal(run.feedback.pressure,4);assert.equal(run.feedback.extractReason,'pressure');assert.match(shelter.innerHTML,/压力评分 4.0/);
 c.action('exportPlaytest');await Promise.resolve();assert.ok(exported);assert.equal(exported.includes(id),false);assert.equal(JSON.parse(exported).runs[0].feedback.pressure,4);assert.equal(JSON.parse(env.window.localStorage.getItem(SAVE_KEY)).credits,123);
});

function arena(){const raid=new Raid(defaultSave(),52);Object.assign(raid.world,{obstacles:[],terrain:[],tiles:[],enemies:[],drops:[],hazards:[],sites:[],spawnWarnings:[]});Object.assign(raid.player,{x:2400,y:2400});raid.director.nextPulse=Infinity;return raid;}

test('hunter observations count materialisation rather than warnings cancelled by a safehouse',()=>{
 const safe=arena();safe.heat.add(100);safe.heat.update(safe,0);assert.ok(safe.world.spawnWarnings.length);assert.equal(safe.playtestSnapshot().huntersSpawned,0);assert.equal(safe.playtestSnapshot().firstHunterAt,null);
 Object.assign(safe.player,{x:safe.world.exits[0].x,y:safe.world.exits[0].y});safe.heat.update(safe,0);safe.elapsed=2;safe.director.update(safe,.1);assert.equal(safe.world.spawnWarnings.length,0);assert.equal(safe.playtestSnapshot().huntersSpawned,0);
 const live=arena();live.heat.add(100);live.heat.update(live,0);live.elapsed=1.31;live.director.update(live,.01);const spawned=live.world.enemies.filter(e=>e.hunter).length;assert.ok(spawned>0);assert.equal(live.playtestSnapshot().huntersSpawned,spawned);assert.equal(live.playtestSnapshot().firstHunterAt,1.31);
 live.extractedVia='fallback';live.finish(true,'成功撤离');const journal=emptyJournal();recordFinish(journal,live.result);assert.equal(journal.runs[0].huntersSpawned,spawned);assert.equal(summarizeJournal(journal).unhuntedExtractions,0);
});

test('a real lethal hit persists its canonical cause without writing combat parameters or player saves',()=>{
 const raid=arena(),save=defaultSave(),before=JSON.stringify(save),journal=emptyJournal();recordStart(journal,raid.playtestSnapshot());raid.hurt(200,'被敌方弹丸击破');assert.equal(raid.status,'dead');recordFinish(journal,raid.result);
 const run=journal.runs[0];assert.equal(run.outcome,'defeated');assert.equal(run.deathCause,'projectile');assert.equal(run.hpPercent,0);assert.equal(JSON.stringify(save),before);
});
