import test from 'node:test';
import assert from 'node:assert/strict';
import { browserStubs } from './helpers/browser-stubs.js';
import { SAVE_KEY } from '../dist/src/config.js';
import { defaultSave } from '../dist/src/storage.js';
import { emptyJournal, recordStart, recordFinish, writeJournal, serializeJournal, JOURNAL_KEY } from '../dist/src/playtest.js';
import { analyzePlaytestReports } from '../dist/src/playtest-analysis.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function journal(count=1,prefix='outside',difficulty='scout'){
 const log=emptyJournal();
 for(let index=0;index<count;index++){
  const start={id:`${prefix}-${index}`,buildVersion:'0.11.2',balanceVersion:'0.11.1',seed:1000+index+(prefix==='owner'?100:0),difficulty,map:'blocks',mutators:index%2?['fog']:[],loadout:{weapons:[{weapon:'pistol',rarity:'white',level:1,enchant:'none'}],armorRarity:'none',laser:false},duration:240,seconds:0,number:1,heat:0,hpPercent:100,rawValue:0,gearCount:0,bagCapacity:8,chests:0,huntersSpawned:0,firstHunterAt:null,hunterWaves:0,kills:0};
  recordStart(log,start);const end={...start,seconds:62,number:16,heat:30,rawValue:80,chests:1,kills:4};recordFinish(log,{id:start.id,success:true,reason:'成功撤离',extractedVia:'key',seconds:62,heat:30,number:16,rawValue:80,kills:4,playtest:end});
 }
 return log;
}
function setup(env,importPlaytests){
 const game=defaultSave();game.credits=123;env.window.localStorage.setItem(SAVE_KEY,JSON.stringify(game));writeJournal(env.window.localStorage,journal(1,'owner'));
 env.window.numberExtractionDesktop={isDesktop:true,setRaidActive(){},importPlaytests};
 const before=[env.window.localStorage.getItem(SAVE_KEY),env.window.localStorage.getItem(JOURNAL_KEY)];return()=>assert.deepEqual([env.window.localStorage.getItem(SAVE_KEY),env.window.localStorage.getItem(JOURNAL_KEY)],before);
}
function click(env,name,key){const box=env.ids.get('shelter-screen'),button=box.children.find(b=>b.dataset.action===name&&(key===undefined||b.dataset.key===key));assert.ok(button,name);box.dispatch('click',{target:button});}
const html=env=>env.ids.get('shelter-screen').innerHTML;

test('real import action analyzes duplicate reports once without adding owner records or writing storage',async t=>{
 const env=browserStubs(t),text=serializeJournal(journal()),unchanged=setup(env,async()=>({ok:true,reports:[text,text]}));
 await import('../dist/src/main.js?review-import-deduplicate');click(env,'shelterTab','journal');click(env,'importPlaytestReports');await tick();
 assert.match(html(env),/class="playtest-review" data-finished="1" data-reports="2" data-duplicates="1"/);assert.match(html(env),/class="review-status" data-ready="false"/);assert.match(html(env),/不足10/);unchanged();
});

test('cancelled or malformed imports preserve the prior review and both persistent stores',async t=>{
 const env=browserStubs(t);let result={ok:true,reports:[serializeJournal(journal())]};const unchanged=setup(env,async()=>result);
 await import('../dist/src/main.js?review-invalid-preserve');click(env,'importPlaytestReports');await tick();const before=html(env);
 result={ok:false,canceled:true};click(env,'importPlaytestReports');await tick();assert.equal(html(env),before);
 result={ok:true,reports:['not valid JSON']};click(env,'importPlaytestReports');await tick();assert.equal(html(env),before);unchanged();
});

test('clearing an in-memory review does not delete reports or let a late import repopulate it',async t=>{
 const env=browserStubs(t);let release;const unchanged=setup(env,()=>new Promise(resolve=>{release=resolve;}));
 await import('../dist/src/main.js?review-clear-stale');click(env,'reviewLocalJournal');assert.match(html(env),/class="playtest-review"/);
 click(env,'importPlaytestReports');click(env,'clearReview');assert.doesNotMatch(html(env),/class="playtest-review"/);release({ok:true,reports:[serializeJournal(journal())]});await tick();assert.doesNotMatch(html(env),/class="playtest-review"/);unchanged();
});

test('reviewing the owner journal is an explicit snapshot and reopening does not restore imported review state',async t=>{
 const env=browserStubs(t),unchanged=setup(env,async()=>({ok:false,canceled:true}));await import('../dist/src/main.js?review-owner-snapshot');click(env,'reviewLocalJournal');assert.match(html(env),/data-finished="1" data-reports="1" data-duplicates="0"/);unchanged();
 await import('../dist/src/main.js?review-owner-reopen');assert.doesNotMatch(html(env),/class="playtest-review"/);unchanged();
});

test('cohort selection keeps small groups insufficient even when pooled totals reach ten',async t=>{
 const env=browserStubs(t),reports=[serializeJournal(journal(5,'outside','scout')),serializeJournal(journal(5,'outside-hard','hard'))],unchanged=setup(env,async()=>({ok:true,reports}));
 await import('../dist/src/main.js?review-cohort-selection');click(env,'importPlaytestReports');await tick();assert.match(html(env),/data-finished="10"/);assert.match(html(env),/class="review-status" data-ready="false"/);
 const review=analyzePlaytestReports(reports),cohort=review.cohorts.find(item=>item.difficulty==='hard');env.ids.get('shelter-screen').dispatch('change',{target:{dataset:{action:'selectReviewCohort'},value:cohort.key}});
 assert.match(html(env),/此组仅5局/);assert.match(html(env),/样本不足10/);unchanged();
});

test('browser file input enforces its limits before reading and never imports reports as saves',async t=>{
 const env=browserStubs(t);const game=defaultSave();game.credits=7;env.window.localStorage.setItem(SAVE_KEY,JSON.stringify(game));await import('../dist/src/main.js?review-web-files');
 const input=env.ids.get('playtest-review-files');let read=false;input.dispatch('change',{target:{files:[{size:262145,async text(){read=true;return'';}}],value:'ignored'}});await tick();assert.equal(read,false);assert.doesNotMatch(html(env),/class="playtest-review"/);
 const text=serializeJournal(journal());input.dispatch('change',{target:{files:[{size:text.length,async text(){return text;}}],value:'ignored'}});await tick();assert.match(html(env),/data-finished="1"/);assert.equal(JSON.parse(env.window.localStorage.getItem(SAVE_KEY)).credits,7);assert.equal(env.window.localStorage.getItem(JOURNAL_KEY),null);
});
