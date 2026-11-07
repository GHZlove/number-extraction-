import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { emptyJournal, recordStart, recordFinish, serializeJournal } from '../dist/src/playtest.js';
const require=createRequire(import.meta.url);
const {APP_URL,PLAYTEST_EXPORT_LIMIT,PLAYTEST_REVIEW_MAX_FILES,PLAYTEST_REVIEW_TOTAL_LIMIT}=require('../desktop/policy.cjs');

function anonymous(seed=505){
 const journal=emptyJournal(),snapshot={id:'private-native-'+seed,buildVersion:'0.11.2',balanceVersion:'0.11.1',seed,difficulty:'scout',map:'blocks',mutators:[],loadout:{weapons:[{weapon:'pistol',rarity:'white',level:1,enchant:'none'}],armorRarity:'none',laser:false},duration:240,seconds:62,number:16,heat:30,hpPercent:80,rawValue:80,gearCount:2,bagCapacity:8,chests:2,huntersSpawned:0,firstHunterAt:null,hunterWaves:0,kills:4};
 recordStart(journal,snapshot);recordFinish(journal,{id:snapshot.id,success:true,reason:'成功撤离',extractedVia:'key',seconds:62,heat:30,rawValue:80,number:16,kills:4,playtest:snapshot});return serializeJournal(journal);
}

async function harness(){
 const handlers=new Map(),dialogs=[],reads=[],stats=[],writes=[],errors=[];let instance,selection={canceled:false,filePaths:['/chosen/A.json','/chosen/B.json']};
 const files=new Map([['/chosen/A.json',anonymous(505)],['/chosen/B.json',anonymous(606)]]),sizes=new Map();let statFailure=false,readFailure=false,directory=false;
 class Window{constructor(options){this.options=options;instance=this;this.webContents={setWindowOpenHandler(){},on(){}};}on(){}once(){}show(){}async loadURL(){}}
 const app={setName(){},setAppUserModelId(){},getPath(){return'/mock-appdata';},setPath(){},requestSingleInstanceLock(){return true;},on(){},whenReady(){return Promise.resolve();},exit(code){errors.push('exit '+code);},quit(){}};
 const electron={app,BrowserWindow:Window,Menu:{setApplicationMenu(){}},protocol:{registerSchemesAsPrivileged(){},handle(){}},session:{defaultSession:{setPermissionRequestHandler(){},setPermissionCheckHandler(){},webRequest:{onBeforeRequest(){}}}},ipcMain:{on(){},handle:(name,handler)=>handlers.set(name,handler)},dialog:{async showOpenDialog(_window,options){dialogs.push(options);return selection;},showErrorBox:(title,message)=>errors.push(title+': '+message)},screen:{getPrimaryDisplay:()=>({workAreaSize:{width:1440,height:900}})}};
 const mocks={electron,'node:path':path,'node:fs':{mkdirSync(){}},'node:fs/promises':{
  async stat(file){stats.push(file);if(statFailure)throw Error('permission denied '+file);return{size:sizes.has(file)?sizes.get(file):Buffer.byteLength(files.get(file)||''),isFile:()=>!directory};},
  async readFile(file,encoding){reads.push({file,encoding});if(readFailure)throw Error('cannot read '+file);if(!files.has(file))throw Error('not found '+file);return files.get(file);},
  async writeFile(...args){writes.push(args);},
 },'./policy.cjs':require('../desktop/policy.cjs')};
 vm.runInNewContext(readFileSync(new URL('../desktop/main.cjs',import.meta.url),'utf8'),{require:name=>{if(!(name in mocks))throw Error('Unexpected require '+name);return mocks[name];},process:{env:{}},Buffer,__dirname:'/app/desktop'});
 await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(errors,[]);assert.ok(handlers.has('playtest:review-import'));
 return{handler:handlers.get('playtest:review-import'),dialogs,reads,stats,writes,files,sizes,event:{sender:instance.webContents,senderFrame:{url:APP_URL}},window:instance,
  select:value=>{selection=value;},failStat:value=>{statFailure=value;},failRead:value=>{readFailure=value;},directory:value=>{directory=value;}};
}

test('report review import exposes only fixed user-selected JSON contents and never renderer paths',async()=>{
 const env=await harness(),result=await env.handler(env.event,['/renderer/private.json']);assert.equal(result.ok,true);
 assert.deepEqual(Array.from(result.reports),[env.files.get('/chosen/A.json'),env.files.get('/chosen/B.json')]);assert.deepEqual(Object.keys(result).sort(),['ok','reports']);
 assert.deepEqual(env.reads.map(r=>r.file),['/chosen/A.json','/chosen/B.json']);assert.ok(env.reads.every(r=>r.encoding==='utf8'));
 assert.equal(env.dialogs.length,1);assert.deepEqual(Array.from(env.dialogs[0].properties),['openFile','multiSelections']);assert.equal(env.writes.length,0);
 assert.equal(JSON.stringify(result).includes('/chosen/'),false);assert.equal(JSON.stringify(result).includes('/renderer/'),false);
 assert.equal(env.window.options.webPreferences.nodeIntegration,false);assert.equal(env.window.options.webPreferences.sandbox,true);assert.equal(env.window.options.webPreferences.contextIsolation,true);
});

test('foreign senders and frame URLs cannot open or read a report selection',async()=>{
 const env=await harness();
 for(const event of [{sender:{},senderFrame:{url:APP_URL}},{sender:env.event.sender,senderFrame:{url:'https://example.com'}},{sender:env.event.sender,senderFrame:{url:APP_URL+'?untrusted=1'}},{sender:env.event.sender,senderFrame:{url:'nextract://game/other.html'}},{sender:env.event.sender}])assert.equal((await env.handler(event)).ok,false);
 assert.equal(env.dialogs.length,0);assert.equal(env.stats.length,0);assert.equal(env.reads.length,0);assert.equal(env.writes.length,0);
});

test('cancelled or empty report selection and excessive counts read nothing',async()=>{
 const env=await harness();
 for(const selection of [{canceled:true},{canceled:false,filePaths:[]},{canceled:false}]){env.select(selection);const result=await env.handler(env.event);assert.equal(result.ok,false);assert.equal(result.canceled,true);}
 env.select({canceled:false,filePaths:Array.from({length:9},(_,i)=>'/chosen/'+i+'.json')});const tooMany=await env.handler(env.event);assert.equal(tooMany.ok,false);assert.match(tooMany.error,/8/);
 assert.equal(env.stats.length,0);assert.equal(env.reads.length,0);assert.equal(env.writes.length,0);
 assert.equal(PLAYTEST_REVIEW_MAX_FILES,8);assert.equal(PLAYTEST_REVIEW_TOTAL_LIMIT,2*1024*1024);
});

test('malformed or private documents abort the entire batch without exposing a partial report list',async()=>{
 for(const invalid of ['{','null','[]',JSON.stringify({version:5,credits:123}),JSON.stringify({...JSON.parse(anonymous()),email:'private@example.com'})]){
  const env=await harness();env.files.set('/chosen/B.json',invalid);const result=await env.handler(env.event);assert.equal(result.ok,false);assert.equal(Object.hasOwn(result,'reports'),false);assert.match(result.error,/第2份/);
  assert.equal(env.writes.length,0);assert.equal(result.error.includes('/chosen/'),false);assert.equal(result.error.includes('private@example.com'),false);
 }
});

test('report size checks use actual UTF-8 bytes as well as stat and reject a file that grows',async()=>{
 const env=await harness();env.select({canceled:false,filePaths:['/chosen/A.json']});
 env.sizes.set('/chosen/A.json',PLAYTEST_EXPORT_LIMIT+1);let result=await env.handler(env.event);assert.equal(result.ok,false);assert.equal(env.reads.length,0);
 env.sizes.set('/chosen/A.json',2);env.files.set('/chosen/A.json','甲'.repeat(90000));result=await env.handler(env.event);assert.equal(result.ok,false);assert.match(result.error,/256KB/);assert.equal(Object.hasOwn(result,'reports'),false);
 env.files.set('/chosen/A.json',anonymous()+' '.repeat(PLAYTEST_EXPORT_LIMIT));result=await env.handler(env.event);assert.equal(result.ok,false);assert.equal(env.writes.length,0);
});

test('eight bounded reports are accepted without implicit de-duplication or local storage writes',async()=>{
 const env=await harness(),text=anonymous();const padded=text+' '.repeat(PLAYTEST_EXPORT_LIMIT-Buffer.byteLength(text));const paths=Array.from({length:8},(_,i)=>'/chosen/report-'+i+'.json');
 for(const file of paths)env.files.set(file,padded);env.select({canceled:false,filePaths:paths});const result=await env.handler(env.event);assert.equal(result.ok,true);assert.equal(result.reports.length,8);assert.ok(Array.from(result.reports).every(report=>Buffer.byteLength(report)===PLAYTEST_EXPORT_LIMIT));assert.equal(env.writes.length,0);
 // Repeated files stay explicit input to the renderer's canonical report analysis.
 env.select({canceled:false,filePaths:['/chosen/A.json','/chosen/A.json']});const repeated=await env.handler(env.event);assert.equal(repeated.ok,true);assert.equal(repeated.reports.length,2);assert.equal(repeated.reports[0],repeated.reports[1]);
});

test('file errors and directories are rejected with generic messages and no writes',async()=>{
 for(const mode of ['stat','read','directory']){
  const env=await harness();env.select({canceled:false,filePaths:['/chosen/private-user.json']});env.files.set('/chosen/private-user.json',anonymous());
  if(mode==='stat')env.failStat(true);if(mode==='read')env.failRead(true);if(mode==='directory')env.directory(true);
  const result=await env.handler(env.event);assert.equal(result.ok,false);assert.equal(Object.hasOwn(result,'reports'),false);assert.equal(result.error.includes('private-user'),false);assert.equal(result.error.includes('/chosen/'),false);assert.equal(env.writes.length,0);
 }
});
