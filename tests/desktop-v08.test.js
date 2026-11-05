import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { defaultSave, readSave } from '../dist/src/storage.js';
import { SAVE_KEY } from '../dist/src/config.js';
import { BACKUP_KEY, serializeSave, parseSaveFile, commitSaveImport } from '../dist/src/save-transfer.js';
import { browserStubs } from './helpers/browser-stubs.js';
import { Raid } from '../dist/src/game.js';
import { UI } from '../dist/src/ui.js';
import { createEnemy } from '../dist/src/world.js';
import { empowerBoss } from '../dist/src/bosses.js';

const require=createRequire(import.meta.url),{isGameURL,resolveAsset,CSP,validSaveText}=require('../desktop/policy.cjs');
const root=path.resolve('dist');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('desktop origin accepts only local app URLs and rejects external, spoofed and credentialed origins',()=>{
  assert.equal(isGameURL('nextract://game/src/main.js'),true);
  for(const value of ['https://game/index.html','file:///C:/Windows/win.ini','nextract://game.evil/index.html','nextract://user:password@game/index.html','nextract://game:8080/index.html','not a URL'])assert.equal(isGameURL(value),false,value);
});

test('desktop asset paths stay inside dist and provide JavaScript/CSS MIME types',()=>{
  assert.deepEqual(resolveAsset(root,'nextract://game/src/main.js'),{file:path.join(root,'src/main.js'),type:'text/javascript; charset=utf-8'});
  assert.equal(resolveAsset(root,'nextract://game/').file,path.join(root,'index.html'));
  assert.equal(resolveAsset(root,'nextract://game/tactical.css').type,'text/css; charset=utf-8');
  for(const value of ['nextract://game/%2e%2e%2fdesktop/main.cjs','nextract://game/src%5c..%5cpackage.json','nextract://game/C:%5cWindows/win.ini','nextract://game/%00index.html','nextract://game/%zz','nextract://game/package.json','https://example.com/main.js'])assert.equal(resolveAsset(root,value),null,value);
});

test('desktop resource policy blocks remote connections, scripts, frames, objects and inline code',()=>{
  assert.match(CSP,/script-src 'self';/);assert.match(CSP,/connect-src 'none'/);assert.match(CSP,/frame-src 'none'/);assert.match(CSP,/object-src 'none'/);assert.doesNotMatch(CSP,/unsafe-eval/);
});

test('preload exposes only fixed save operations and a Boolean raid indicator',()=>{
  let exposed;const calls=[];
  vm.runInNewContext(readFileSync(new URL('../desktop/preload.cjs',import.meta.url),'utf8'),{require:name=>{
    assert.equal(name,'electron');return{contextBridge:{exposeInMainWorld:(name,api)=>{assert.equal(name,'numberExtractionDesktop');exposed=api;}},ipcRenderer:{invoke:(...args)=>calls.push(args),send:(...args)=>calls.push(args)}};
  }});
  assert.deepEqual(Object.keys(exposed).sort(),['exportSave','importSave','isDesktop','setRaidActive']);
  exposed.exportSave('json');exposed.importSave();exposed.setRaidActive('true');exposed.setRaidActive(true);
  assert.deepEqual(calls,[['save:export','json'],['save:import'],['raid:active',false],['raid:active',true]]);
});

test('export/import round trip retains progression and forged gear while dropping unrelated fields',()=>{
  const save=defaultSave();save.credits=780;save.materials={alloy:42,core:8};save.forged.pistol={level:3,rarity:'green',enchant:'lightning'};
  const text=serializeSave({...save,password:'not a saved game field'});assert.ok(validSaveText(text));assert.equal(parseSaveFile(text).credits,780);assert.deepEqual(parseSaveFile(text).forged,save.forged);assert.doesNotMatch(text,/password/);
});

test('invalid, oversized or unsupported save files cannot be imported',()=>{
  for(const text of ['{','null','[]','{"version":99,"credits":0}','{"version":3,"credits":-1}','{"version":3,"credits":"100"}','x'.repeat(131073)]){
    assert.throws(()=>parseSaveFile(text));assert.equal(validSaveText(text),false);
  }
  assert.equal(parseSaveFile('{"version":1,"credits":30,"upgrades":{"capacity":2}}').shelter.storage,2);
});

test('import saves a recoverable backup before replacing progress and can restore it',()=>{
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},original=defaultSave(),incoming=defaultSave();original.credits=37;incoming.credits=800;
  commitSaveImport(storage,original,incoming);assert.equal(readSave(storage).save.credits,800);assert.equal(parseSaveFile(data.get(BACKUP_KEY)).credits,37);
  commitSaveImport(storage,incoming,parseSaveFile(data.get(BACKUP_KEY)));assert.equal(readSave(storage).save.credits,37);
});

test('backup failure prevents canonical save replacement',()=>{
  const original=defaultSave(),incoming={...defaultSave(),credits:400},calls=[];
  assert.throws(()=>commitSaveImport({setItem:(key,value)=>{calls.push(key);throw Error('quota');}},original,incoming));assert.deepEqual(calls,[BACKUP_KEY]);assert.equal(original.credits,0);
});

test('shelter tabs, native export and previewed save migration work through the application',async t=>{
  const env=browserStubs(t),exports=[],active=[],incoming=serializeSave({...defaultSave(),credits:800});
  env.window.numberExtractionDesktop={isDesktop:true,setRaidActive:v=>active.push(v),exportSave:async text=>{exports.push(text);return{ok:true};},importSave:async()=>({ok:true,text:incoming})};
  await import('../dist/src/main.js?desktop-transfer-v08');const shelter=env.ids.get('shelter-screen'),dialog=env.ids.get('dialog');
  const shelterAction=(action,key)=>shelter.dispatch('click',{target:shelter.children.find(b=>b.dataset.action===action&&(key===undefined||b.dataset.key===key))});
  const dialogAction=action=>dialog.dispatch('click',{target:dialog.children.find(b=>b.dataset.action===action)});
  assert.equal(shelter.dataset.tab,'deploy');shelterAction('shelterTab','forge');assert.equal(shelter.dataset.tab,'forge');shelterAction('shelterTab','base');assert.equal(shelter.dataset.tab,'base');
  shelterAction('saves');dialogAction('exportSave');await tick();assert.equal(parseSaveFile(exports[0]).credits,0);
  dialogAction('importSave');await tick();assert.match(dialog.innerHTML,/待导入：800/);assert.equal(env.window.localStorage.getItem(SAVE_KEY),null);
  dialogAction('confirmImport');assert.equal(JSON.parse(env.window.localStorage.getItem(SAVE_KEY)).credits,800);assert.equal(parseSaveFile(env.window.localStorage.getItem(BACKUP_KEY)).credits,0);
  dialogAction('close');shelterAction('shelterTab','deploy');shelterAction('start');assert.equal(active.at(-1),true);assert.equal(env.document.body.dataset.screen,'raid');
});

test('dedicated boss HUD tracks the engaged boss and disappears after defeat',t=>{
  const env=browserStubs(t),save=defaultSave(),raid=new Raid(save,22,{pressure:false}),ui=new UI(new Proxy({},{get:()=>()=>{}}));
  const boss=empowerBoss(createEnemy('boss-ui',raid.player.x+200,raid.player.y,16),'prism',1);boss.hp=300;boss.bossPhase=2;raid.world.enemies=[boss];ui.update(raid,save,true,false);
  assert.equal(env.ids.get('boss-hud').hidden,false);assert.equal(env.ids.get('boss-name').textContent,boss.bossName);assert.equal(env.ids.get('boss-health-fill').style.width,'50%');assert.equal(env.ids.get('boss-stage').textContent,'阶段 2');
  boss.dead=true;ui.update(raid,save,true,false);assert.equal(env.ids.get('boss-hud').hidden,true);
});
