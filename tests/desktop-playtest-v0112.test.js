import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { emptyJournal, recordStart, recordFinish, serializeJournal } from '../dist/src/playtest.js';
import { WEAPONS, ENCHANTS } from '../dist/src/equipment.js';
const require=createRequire(import.meta.url);
const {APP_URL,validPlaytestText,validSaveText,PLAYTEST_EXPORT_LIMIT}=require('../desktop/policy.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
function sample(){
 const journal=emptyJournal(),snapshot={id:'private-run-12345',buildVersion:'0.11.2',balanceVersion:'0.11.1',seed:123,difficulty:'hard',map:'tangram',mutators:['fog'],loadout:{weapons:[{weapon:'rifle',rarity:'white',level:1,enchant:'none'}],armorRarity:'none',laser:false},duration:360,seconds:62,number:16,heat:34,hpPercent:70,rawValue:100,gearCount:2,bagCapacity:8,chests:3,huntersSpawned:2,firstHunterAt:49,hunterWaves:1,kills:4};
 recordStart(journal,snapshot);recordFinish(journal,{id:snapshot.id,success:true,reason:'成功撤离',extractedVia:'key',seconds:62,heat:34,number:16,rawValue:100,kills:4,playtest:snapshot});return JSON.parse(serializeJournal(journal));
}

test('desktop playtest export accepts the actual anonymous schema and remains separate from progress saves',()=>{
 const data=sample(),text=JSON.stringify(data);assert.equal(validPlaytestText(text),true);assert.equal(validSaveText(text),false);
 assert.equal(validPlaytestText(JSON.stringify({version:5,credits:37})),false);assert.equal(validPlaytestText(JSON.stringify(emptyJournal())),false);
 assert.equal(validPlaytestText(serializeJournal(emptyJournal())),true);assert.equal(text.includes('private-run-12345'),false);
});

test('desktop export rejects private and unknown fields at every nested boundary',()=>{
 for(const mutate of [
  data=>{data.email='private@example.com';},data=>{data.runs[0].id='1700000000-seed';},data=>{data.runs[0].timestamp='2026-11-07';},
  data=>{data.runs[0].loadout.account='player';},data=>{data.runs[0].loadout.weapons[0].path='/private/file';},
  data=>{data.runs[0].feedback.comment='my address';},data=>{data.runs[0].deathCause='private@example.com';},
  data=>{data.runs[0].buildVersion='/private/profile';},data=>{data.runs[0].map='https://example.com';},
 ]){const data=sample();mutate(data);assert.equal(validPlaytestText(JSON.stringify(data)),false);}
});

test('desktop export enforces bounded records, finite observations, controlled choices and the UTF-8 size limit',()=>{
 const base=sample();
 for(const mutate of [
  data=>{data.schema=2;},data=>{data.balanceVersion='0.12.0';},data=>{data.runs=Array.from({length:101},(_,i)=>({...clone(base.runs[0]),session:i+1}));},
  data=>{data.runs.push(clone(data.runs[0]));},data=>{data.runs[0].session=0;},data=>{data.runs[0].heat=101;},data=>{data.runs[0].hpPercent=-1;},
  data=>{data.runs[0].number=3;},data=>{data.runs[0].seconds=7201;},data=>{data.runs[0].huntersSpawned=121;},
  data=>{data.runs[0].mutators=['fog','fog'];},data=>{data.runs[0].mutators=['arbitrary'];},data=>{data.runs[0].feedback.pressure=6;},data=>{data.runs[0].feedback.unfair='free text';},
 ]){const data=clone(base);mutate(data);assert.equal(validPlaytestText(JSON.stringify(data)),false);}
 for(const value of ['{','null','[]',true,undefined])assert.equal(validPlaytestText(value),false);
 assert.equal(validPlaytestText(JSON.stringify(base)+' '.repeat(PLAYTEST_EXPORT_LIMIT)),false);
 const unknown=clone(base);for(const key of ['duration','seconds','firstHunterAt','heat','hpPercent','number','rawValue','gearCount','bagCapacity','chests','huntersSpawned','hunterWaves','kills'])unknown.runs[0][key]=null;
 assert.equal(validPlaytestText(JSON.stringify(unknown)),true);
 const full=clone(base);full.runs=Array.from({length:100},(_,i)=>({...clone(base.runs[0]),session:i+1}));assert.equal(validPlaytestText(JSON.stringify(full)),true);
});

test('desktop anonymous schema accepts every existing weapon and enchantment without arbitrary text fields',()=>{
 for(const weapon of Object.keys(WEAPONS))for(const enchant of Object.keys(ENCHANTS)){
  const data=sample();data.runs[0].loadout.weapons[0]={weapon,enchant,rarity:'red',level:5};assert.equal(validPlaytestText(JSON.stringify(data)),true,weapon+'/'+enchant);
 }
});

async function desktopHarness(){
 const handlers=new Map(),writes=[],dialogs=[],errors=[];let instance,selection={canceled:false,filePath:'/chosen/NumberExtraction-playtest.json'},failWrite=false;
 class Window {
  constructor(options){this.options=options;instance=this;this.webContents={setWindowOpenHandler(){},on(){}};}
  on(){}once(){}show(){}async loadURL(){}
 }
 const app={setName(){},setAppUserModelId(){},getPath(){return'/mock-appdata';},setPath(){},requestSingleInstanceLock(){return true;},on(){},whenReady(){return Promise.resolve();},exit(code){errors.push('exit '+code);},quit(){}};
 const electron={app,BrowserWindow:Window,Menu:{setApplicationMenu(){}},protocol:{registerSchemesAsPrivileged(){},handle(){}},session:{defaultSession:{setPermissionRequestHandler(){},setPermissionCheckHandler(){},webRequest:{onBeforeRequest(){}}}},ipcMain:{on(){},handle:(name,handler)=>handlers.set(name,handler)},dialog:{async showSaveDialog(_window,options){dialogs.push(options);return selection;},showErrorBox:(title,message)=>errors.push(title+': '+message)},screen:{getPrimaryDisplay:()=>({workAreaSize:{width:1440,height:900}})}};
 const mocks={electron,'node:path':path,'node:fs':{mkdirSync(){}},'node:fs/promises':{async writeFile(...args){if(failWrite)throw Error('disk full');writes.push(args);}},'./policy.cjs':require('../desktop/policy.cjs')};
 vm.runInNewContext(readFileSync(new URL('../desktop/main.cjs',import.meta.url),'utf8'),{require:name=>{if(!(name in mocks))throw Error('Unexpected require '+name);return mocks[name];},process:{env:{}},__dirname:'/app/desktop'});
 await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(errors,[]);assert.ok(handlers.has('playtest:export'));
 return{handlers,writes,dialogs,event:{sender:instance.webContents,senderFrame:{url:APP_URL}},setSelection:value=>{selection=value;},setWriteFailure:value=>{failWrite=value;},window:instance};
}

test('native playtest export rejects foreign senders and invalid documents before opening a dialog',async()=>{
 const env=await desktopHarness(),handler=env.handlers.get('playtest:export'),text=JSON.stringify(sample());
 for(const event of [{sender:{},senderFrame:{url:APP_URL}},{sender:env.event.sender,senderFrame:{url:'https://example.com'}},{sender:env.event.sender,senderFrame:{url:'nextract://game/other.html'}}]){
  assert.equal((await handler(event,text)).ok,false);
 }
 assert.equal((await handler(env.event,JSON.stringify({schema:1,game:'number-extraction-playtest',id:'private'}))).ok,false);
 assert.equal(env.dialogs.length,0);assert.equal(env.writes.length,0);
 assert.equal(env.window.options.webPreferences.nodeIntegration,false);assert.equal(env.window.options.webPreferences.contextIsolation,true);assert.equal(env.window.options.webPreferences.sandbox,true);
});

test('native playtest export writes only the user-selected file and handles cancellation or write failure',async()=>{
 const env=await desktopHarness(),handler=env.handlers.get('playtest:export'),text=JSON.stringify(sample());
 assert.equal((await handler(env.event,text,'/renderer/attack.json')).ok,true);
 assert.equal(env.dialogs[0].defaultPath,'NumberExtraction-playtest.json');assert.deepEqual(env.writes[0],['/chosen/NumberExtraction-playtest.json',text,'utf8']);
 env.setSelection({canceled:true});assert.equal((await handler(env.event,text)).canceled,true);assert.equal(env.writes.length,1);
 env.setSelection({canceled:false,filePath:'/chosen/report.json'});env.setWriteFailure(true);const failed=await handler(env.event,text);assert.equal(failed.ok,false);assert.match(failed.error,/无法写入/);assert.equal(env.writes.length,1);
});
