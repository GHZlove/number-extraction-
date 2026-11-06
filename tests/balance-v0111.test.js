import test from 'node:test';
import assert from 'node:assert/strict';
import { Raid } from '../dist/src/game.js';
import { RULES, DIFFICULTIES, SAVE_KEY } from '../dist/src/config.js';
import { defaultSave, settleRun, readSave, writeSave } from '../dist/src/storage.js';
import { serializeSave, parseSaveFile } from '../dist/src/save-transfer.js';
import { createEnemy } from '../dist/src/world.js';
import { makeEquipment } from '../dist/src/equipment.js';
import { updateNumberForm } from '../dist/src/run-rules.js';

const step=RULES.fixedStep;
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
function clear(r){
 Object.assign(r.world,{enemies:[],tiles:[],chests:[],nodes:[],drops:[],obstacles:[],terrain:[],spawnWarnings:[],projectiles:[],effects:[],hazards:[],sites:[]});
 Object.assign(r.player,{x:2400,y:2400,armor:null});return r;
}
function empty(mutators=[],options={}){return clear(new Raid(defaultSave(),3101,{pressure:false,...options,mutators}));}
function advance(r,seconds,input={}){for(let i=0;i<Math.ceil(seconds/step);i++)r.update(step,input);}
function memory(){const data=new Map();return{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};}
function shot(r,value=1,rarity='white'){
 r.shoot({x:r.player.x+80,y:r.player.y},Math.PI,460,800,'enemy',value,rarity);r.updateProjectiles(.2);
}
function route(kind){
 const save=defaultSave();save.selectedDifficulty='hard';save.selectedMutators=['rich'];save.credits=7;save.materials={alloy:9,core:2};
 let r,exit,guardian;
 for(let seed=1;seed<40;seed++){
  const candidate=new Raid(save,seed,{pressure:false});const target=candidate.world.exits.find(e=>e.kind===kind);
  if(!target)continue;r=candidate;exit=target;guardian=r.world.enemies.find(e=>e.id===target.bossId);break;
 }
 assert.ok(r&&exit,`No seeded ${kind} route found`);clear(r);
 if(guardian){r.world.enemies=[guardian];r.kill(guardian);}
 r.elapsed=exit.opensAt;Object.assign(r.player,{x:exit.x,y:exit.y});
 if(kind==='number'){r.player.value=exit.requiredNumber;updateNumberForm(r);}
 if(kind==='key')r.exitKeys=1;
 const gear=makeEquipment('weapon','rifle','purple','extracted-cargo');
 r.bag=[{kind:'loot',name:'核心物资',value:101,zone:2,bossLoot:true},gear];
 return{r,exit,save,gear};
}

test('glass has a real equal-contact survival cost measured as a fraction of maximum health',()=>{
 const normal=empty(),glass=empty(['glass']);
 for(const r of [normal,glass]){
  const e=createEnemy('equal-contact',r.player.x,r.player.y,1,'hunter');r.world.enemies=[e];r.clash(e);
 }
 near((normal.player.maxHp-normal.player.hp)/normal.player.maxHp,.25);
 near((glass.player.maxHp-glass.player.hp)/glass.player.maxHp,.3125);
 assert.ok(glass.player.hp/glass.player.maxHp<normal.player.hp/normal.player.maxHp);
});

test('glass also increases percentage-health damage from actual enemy projectiles',()=>{
 const normal=empty(),glass=empty(['glass']);shot(normal);shot(glass);
 near(normal.player.hp,75);near(glass.player.maxHp,75);near(glass.player.hp,51.5625);
 near((glass.player.maxHp-glass.player.hp)/glass.player.maxHp,.3125);
 assert.equal(glass.world.projectiles.length,0);
});

test('glass core survives the full-health 4096 yellow hunter boundary but remains critically threatened',()=>{
 const r=empty(['doubled','glass']);r.player.value=1024;updateNumberForm(r);shot(r,4096,'yellow');
 near((r.player.maxHp-r.player.hp)/r.player.maxHp,.9675);
 near(r.player.hp,2.4375);assert.equal(r.status,'playing');assert.ok(r.player.hp<r.player.maxHp*.04);
});

test('core movement and physical size improve without removing its defence or dash tradeoff',()=>{
 const r=empty();r.player.value=1024;updateNumberForm(r);assert.equal(r.player.radius,26);
 const x=r.player.x;r.update(step,{x:1});near(r.player.x-x,193.5*step);
 r.hurt(25);near(r.player.hp,78.5);
 r.player.invulnerable=0;const before=r.player.x;r.update(step,{x:1,dash:true});near(r.player.x-before,RULES.dashSpeed*step);
});

test('a core with no dodge can leave a volatile blast in open shallow water after a 200ms reaction',()=>{
 const r=empty(['no_dodge','volatile']);r.player.value=1024;updateNumberForm(r);
 r.world.terrain=[{x:1800,y:1800,w:2000,h:2000,kind:'water'}];
 const origin={x:r.player.x,y:r.player.y};const e=createEnemy('water-remnant',origin.x,origin.y,1,'hunter');r.world.enemies=[e];r.kill(e);
 // This deliberately starts at the blast centre, not a favourable ranged-kill distance.
 r.world.tiles=[];r.world.drops=[];advance(r,.2);assert.equal(r.player.hp,100);
 advance(r,1.35,{x:1,dash:true});assert.equal(r.player.dashTime,0);assert.equal(r.player.hp,100);
 assert.ok(r.player.x-origin.x>111);assert.equal(r.world.hazards.length,0);
});

test('standing in the same warned volatile blast still causes damage once',()=>{
 const r=empty(['no_dodge','volatile']);r.player.value=1024;updateNumberForm(r);
 r.world.terrain=[{x:1800,y:1800,w:2000,h:2000,kind:'water'}];
 const e=createEnemy('stationary-remnant',r.player.x,r.player.y,1,'hunter');r.world.enemies=[e];r.kill(e);r.world.tiles=[];r.world.drops=[];
 advance(r,1.2);assert.equal(r.player.hp,100);advance(r,.35);near(r.player.hp,87.1);assert.equal(r.world.hazards.length,0);
});

test('fog allows a 350-unit target to be perceived but still conceals targets outside its 360-unit radius',()=>{
 const r=empty(['doubled','scarcity','fog']);const e=createEnemy('fog-edge',r.player.x+350,r.player.y,2,'hunter');r.world.enemies=[e];
 assert.equal(r.nearestEnemy(800),e);e.x=r.player.x+365;assert.equal(r.nearestEnemy(800),null);assert.equal(r.player.medkits,0);
});

test('ordinary defensive kills add half the previous heat while bosses and rich scaling remain meaningful',()=>{
 const normal=empty(),rich=empty(['rich']);
 for(const r of [normal,rich])for(let i=0;i<10;i++){const e=createEnemy(`defence-${i}`,r.player.x+150+i*3,r.player.y,2,'hunter');r.world.enemies.push(e);r.kill(e);}
 near(normal.heat.value,2);near(rich.heat.value,3);
 const r=empty();const source=new Raid(defaultSave(),72,{pressure:false}),boss=source.world.enemies.find(e=>e.boss);assert.ok(boss);r.world.enemies=[boss];r.kill(boss);near(r.heat.value,5);
});

test('passive heat retains difficulty scaling and long nightmare stays still attract level-four hunters',()=>{
 for(const difficulty of DIFFICULTIES){const r=empty([],{difficulty:difficulty.id});r.heat.update(r,60);near(r.heat.value,(.24+(difficulty.rank-1)*.02)*60);}
 const r=empty([],{pressure:true,difficulty:'nightmare'});r.director.nextPulse=Infinity;r.elapsed=320;r.heat.update(r,320);
 assert.equal(r.heat.value,100);assert.equal(r.heat.level,4);assert.equal(r.world.spawnWarnings.filter(m=>m.hunter).length,5);
 advance(r,1.5);assert.ok(r.world.enemies.some(e=>e.hunter));assert.ok(r.world.enemies.filter(e=>e.hunter&&!e.dead).length<=12);
});

test('hunter scheduling preserves increasing pressure with forty-to-twenty-five-second intervals',()=>{
 for(const [heat,interval,count]of [[25,40,2],[50,35,3],[75,30,4],[100,25,5]]){
  const r=empty([],{pressure:true});r.elapsed=20;r.director.nextPulse=Infinity;r.heat.add(heat);r.heat.update(r,0);
  assert.equal(r.heat.nextHunt,20+interval);assert.equal(r.world.spawnWarnings.filter(m=>m.hunter).length,count);
 }
});

const rewards={fallback:{bonus:0,value:303,alloy:54,core:12},window:{bonus:.08,value:327,alloy:58,core:13},key:{bonus:.10,value:333,alloy:59,core:13},number:{bonus:.10,value:333,alloy:59,core:13},boss:{bonus:.15,value:348,alloy:62,core:14}};
for(const [kind,expected]of Object.entries(rewards))test(`${kind} route pays its extraction bonus only after the real channel and preserves gear and field funds`,()=>{
 const {r,exit,save,gear}=route(kind),originalGear=JSON.stringify(gear);assert.equal(r.carriedValue(),101);near(r.rewardMultiplier,3);
 advance(r,1.8,{interact:true});assert.equal(r.result,null);assert.equal(r.carriedValue(),101);assert.equal(save.credits,7);
 advance(r,2.4,{interact:true});assert.equal(r.result.success,true);assert.equal(r.result.extractedVia,kind);near(r.result.exitBonus,expected.bonus);
 assert.equal(r.result.rawValue,101);assert.equal(r.result.value,expected.value);assert.deepEqual(r.result.materials,{alloy:expected.alloy,core:expected.core});
 assert.equal(r.result.gear.length,1);assert.equal(JSON.stringify(gear),originalGear);assert.equal(r.result.gear[0].rarity,'purple');assert.equal(r.result.gear[0].level,1);
 if(kind==='key')assert.equal(r.exitKeys,0);
 assert.equal(settleRun(save,r.result),true);assert.equal(save.credits,7+expected.value);assert.deepEqual(save.materials,{alloy:9+expected.alloy,core:2+expected.core});assert.equal(save.warehouse.items.length,1);
 const settled=serializeSave(save);assert.equal(settleRun(save,r.result),false);r.finish(true,'repeat');assert.equal(serializeSave(save),settled);
 const restored=parseSaveFile(settled);assert.equal(restored.version,5);assert.equal(restored.lastRuns[0].extractedVia,kind);near(restored.lastRuns[0].exitBonus,expected.bonus);assert.equal(restored.warehouse.items[0].rarity,'purple');
 const storage=memory();assert.equal(writeSave(storage,restored),true);assert.ok(storage.getItem(SAVE_KEY));const loaded=readSave(storage).save;assert.equal(loaded.lastRuns[0].extractedVia,kind);near(loaded.lastRuns[0].exitBonus,expected.bonus);
});

test('failed and interrupted extractions cannot award a route premium or bank unextracted gear',()=>{
 const {r,exit,save}=route('key');advance(r,1.5,{interact:true});assert.equal(r.result,null);assert.equal(r.exitKeys,1);
 r.update(step,{x:1});assert.equal(r.extractProgress,0);assert.equal(save.credits,7);
 // Even a stale route label must not turn a defeat into a premium settlement.
 r.extractedVia='key';r.finish(false,'defeat');near(r.result.exitBonus,0);assert.equal(r.result.value,303);assert.equal(r.exitKeys,1);
 assert.equal(settleRun(save,r.result),true);assert.equal(save.credits,7);assert.deepEqual(save.materials,{alloy:9,core:2});assert.equal(save.warehouse.items.length,0);
 assert.equal(settleRun(save,r.result),false);r.finish(true,'late recovery');assert.equal(r.result.success,false);
});

test('the extended timed window still allows a route premium after the old thirty-second closing time',()=>{
 const {r,exit}=route('window');r.elapsed=exit.opensAt+31;assert.equal(r.extractionReady(exit),true);advance(r,4.2,{interact:true});
 assert.equal(r.result.success,true);assert.equal(r.result.extractedVia,'window');near(r.result.exitBonus,.08);
});
