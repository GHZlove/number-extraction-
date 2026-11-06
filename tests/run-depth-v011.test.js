import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Raid } from '../dist/src/game.js';
import { MUTATORS, normalizeMutators, runRules, numberForm, updateNumberForm, updateRunHazards } from '../dist/src/run-rules.js';
import { HeatDirector } from '../dist/src/heat.js';
import { DIFFICULTIES, ENEMY_TYPES, PRESSURE, RULES, SAVE_KEY, V10_SAVE_KEY } from '../dist/src/config.js';
import { defaultSave, normalizeSave, readSave, writeSave, settleRun } from '../dist/src/storage.js';
import { createEnemy } from '../dist/src/world.js';
import { makeEquipment, decorateWeapon, spreadOf } from '../dist/src/equipment.js';
import { storeExtractedGear, selectWarehouseGear, prepareWarehouseDeployment } from '../dist/src/warehouse.js';
import { serializeSave, parseSaveFile } from '../dist/src/save-transfer.js';
import { distance, isFree, attackDamage } from '../dist/src/math.js';
import { Renderer } from '../dist/src/renderer.js';
import { UI } from '../dist/src/ui.js';
import { browserStubs } from './helpers/browser-stubs.js';
const {validSaveText}=createRequire(import.meta.url)('../desktop/policy.cjs');
const step=RULES.fixedStep;
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
function empty(mutators=[],pressure=false,difficulty='scout'){
 const r=new Raid(defaultSave(),153,{pressure,mutators,difficulty});
 Object.assign(r.world,{enemies:[],tiles:[],chests:[],nodes:[],drops:[],obstacles:[],terrain:[],spawnWarnings:[],projectiles:[],effects:[],hazards:[],sites:[]});
 Object.assign(r.player,{x:2400,y:2400});return r;
}
function advance(r,seconds,input={}){for(let i=0;i<Math.ceil(seconds/step);i++)r.update(step,input);}
function target(r,value=4,type='hunter',offset=150,id='target'){
 const e=createEnemy(id,r.player.x+offset,r.player.y,value,type);e.cooldown=999;r.world.enemies.push(e);return e;
}
function memory(){const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};}

test('production raids enable run depth by default with ten opt-in mutators and a deterministic three-slot limit',()=>{
 const r=new Raid(defaultSave(),9);assert.equal(r.run.enabled,true);assert.ok(r.heat instanceof HeatDirector);assert.equal(Object.keys(MUTATORS).length,10);assert.deepEqual(r.run.ids,[]);
 assert.deepEqual(normalizeMutators(['glass','bogus','glass','rich','fog','doubled']),['doubled','fog','rich']);
 for(const input of [null,{},'fog',17])assert.deepEqual(normalizeMutators(input),[]);
 const s=defaultSave();s.selectedMutators=['short','glass'];assert.deepEqual(new Raid(s,9).run.ids,['glass','short']);
});

test('risk rewards add once at settlement and do not inflate field money or warehouse gear',()=>{
 const r=empty(['doubled','rich','short']);r.bag=[{kind:'loot',name:'materials',value:100},makeEquipment('weapon','rifle','purple','field-rifle')];
 near(r.run.reward,1.6);assert.equal(r.carriedValue(),100);r.heat.add(31);r.finish(true,'test');
 assert.equal(r.result.rawValue,100);assert.equal(r.result.value,160);assert.equal(r.result.gear.length,1);assert.deepEqual(r.result.mutators,['doubled','rich','short']);assert.equal(r.result.seed,153);assert.equal(r.result.heat,46.5);
 const s=defaultSave();assert.equal(settleRun(s,r.result),true);assert.equal(s.credits,160);assert.equal(s.warehouse.items.length,1);assert.deepEqual(s.lastRuns[0].mutators,r.run.ids);assert.equal(settleRun(s,r.result),false);
});

test('doubled enemies change initial guards and bosses exactly once without changing neutral merge tiles',()=>{
 const normal=new Raid(defaultSave(),502),double=new Raid(defaultSave(),502,{mutators:['doubled']});assert.ok(normal.world.enemies.some(e=>e.boss));
 assert.deepEqual(double.world.enemies.map(e=>[e.id,e.value]),normal.world.enemies.map(e=>[e.id,e.value*2]));
 assert.deepEqual(double.world.tiles.map(e=>e.value),normal.world.tiles.map(e=>e.value));assert.deepEqual(double.world.enemies.map(e=>e.maxHp),normal.world.enemies.map(e=>e.maxHp));
});

test('doubled patrol spawns and heat hunters receive one number multiplier and legal warnings',()=>{
 const normal=empty([],true),double=empty(['doubled'],true);
 for(const r of [normal,double]){r.elapsed=12;r.director.update(r,.1);}
 assert.ok(normal.world.spawnWarnings.length);assert.deepEqual(double.world.spawnWarnings.map(e=>e.value),normal.world.spawnWarnings.map(e=>e.value*2));
 for(const r of [normal,double]){r.world.spawnWarnings=[];r.heat.add(100);r.player.value=64;r.heat.update(r,.1);}
 assert.ok(normal.world.spawnWarnings.length);assert.deepEqual(double.world.spawnWarnings.map(e=>e.value),normal.world.spawnWarnings.map(e=>e.value*2));
 for(const mark of double.world.spawnWarnings){assert.ok(mark.hunter);near(mark.readyAt-double.elapsed,1.3);assert.ok(distance(mark,double.player)>=PRESSURE.spawnMin);assert.ok(isFree(mark.x,mark.y,34,double.world.obstacles,double.world.bounds));}
});

test('number multiplier is inherited once by summoner offspring and boss adds',()=>{
 const normal=empty(),double=empty(['doubled']);
 for(const r of [normal,double]){
  const summoner=target(r,16*r.run.enemyNumbers,'summoner',300);summoner.zone=0;r.resolveEnemyAttack(summoner,ENEMY_TYPES.summoner);
 }
 const values=r=>r.world.enemies.filter(e=>e.summonerId).map(e=>e.value);
 assert.ok(values(normal).length);assert.deepEqual(values(double),values(normal).map(v=>v*2));
 for(const r of [normal,double]){const boss=target(r,64*r.run.enemyNumbers,'hunter',600,'boss');boss.bossStep=0;boss.zone=0;r.spawnBossAdds(boss,2,'scout');}
 const adds=r=>r.world.enemies.filter(e=>e.bossOwnerId).map(e=>e.value);assert.ok(adds(normal).length);assert.deepEqual(adds(double),adds(normal).map(v=>v*2));
});

test('no-dodge blocks actual dash movement but leaves timed parry available',()=>{
 const normal=empty(),blocked=empty(['no_dodge']),origin={...normal.player};normal.update(step,{dash:true,x:1});blocked.update(step,{dash:true,x:1,parry:true});
 assert.ok(distance(normal.player,origin)>distance(blocked.player,origin)*2);assert.equal(blocked.player.dashTime,0);assert.equal(blocked.player.dashCooldown,0);assert.ok(blocked.player.parryWindow>0);
 const enemy=target(blocked,1,'hunter',30);enemy.state='windup';assert.equal(blocked.tryParry(enemy),true);assert.ok(enemy.stun>0);
});

test('glass changes real maximum health, projectile power and healing cap',()=>{
 const r=empty(['glass']);assert.equal(r.player.hp,75);assert.equal(r.player.maxHp,75);r.player.hp=70;r.heal();assert.equal(r.player.hp,75);
 r.attack();assert.ok(r.world.projectiles.length);near(r.world.projectiles[0].power,1.35);
 r.player.hp=72;r.world.tiles=[{id:'merge',...r.player,value:1,dead:false}];r.update(step,{});assert.equal(r.player.hp,75);assert.equal(r.player.value,2);
});

test('haste speeds actual walking and enemy pursuit without shortening dash distance',()=>{
 const normal=empty(),fast=empty(['haste']),a={...normal.player},b={...fast.player};advance(normal,1,{x:1});advance(fast,1,{x:1});near(distance(fast.player,b)/distance(normal.player,a),1.12);
 const regular=target(normal,1,'hunter',300),quick=target(fast,1,'hunter',300);regular.horde=quick.horde=true;regular.aggro=quick.aggro=999;
 const before=[regular.x,quick.x];normal.updateEnemy(regular,step);fast.updateEnemy(quick,step);near((before[1]-quick.x)/(before[0]-regular.x),1.12);
 for(const r of [normal,fast]){r.player.dashCooldown=0;r.player.dashTime=0;}
 const starts=[normal.player.x,fast.player.x];normal.update(step,{dash:true,x:1});fast.update(step,{dash:true,x:1});near(normal.player.x-starts[0],fast.player.x-starts[1]);
});

test('scarcity removes starting medkits even after supply upgrades and reduces actual repairs',()=>{
 const s=defaultSave();s.shelter.supply=5;const r=new Raid(s,91,{mutators:['scarcity'],pressure:false});Object.assign(r.player,{x:2400,y:2400,hp:40});
 assert.equal(r.player.medkits,0);r.heal();assert.equal(r.player.hp,40);r.player.medkits=1;r.heal();assert.equal(r.player.hp,60);assert.equal(r.player.medkits,0);
});

test('short runs time out at eighty percent while fallback extraction remains reachable before deadline',()=>{
 for(const difficulty of DIFFICULTIES){const r=empty(['short'],false,difficulty.id);near(r.duration,difficulty.seconds*.8);assert.ok(r.world.exits[0].opensAt+RULES.extractSeconds<r.duration);r.elapsed=r.duration-step/2;r.update(step,{});assert.equal(r.status,'dead');assert.equal(r.result.success,false);}
});

test('jammed lasers retain their equipment but shoot with the unmodified spread',()=>{
 const normal=empty(),jammed=empty(['jammed']);
 for(const r of [normal,jammed]){r.player.laser=makeEquipment('laser','','white','owned-laser');r.player.weapons[0]=makeEquipment('weapon','rifle');r.random=()=>1;r.attack();}
 const angle=r=>Math.atan2(r.world.projectiles[0].vy,r.world.projectiles[0].vx);
 near(angle(normal),spreadOf(normal.player.weapons[0],normal.player.laser));near(angle(jammed),spreadOf(jammed.player.weapons[0],false));assert.ok(angle(jammed)>angle(normal));assert.equal(jammed.player.laser.id,'owned-laser');
 jammed.finish(true,'test');assert.ok(jammed.result.gear.some(e=>e.id==='owned-laser'));
});

test('fog limits auto-targeting and hides distant enemy numbers in the real renderer path',t=>{
 const env=browserStubs(t),r=empty(['fog']),renderer=new Renderer(env.canvas,env.ids.get('minimap'));r.world.enemies=[createEnemy('hidden',r.player.x+400,r.player.y,4096,'hunter')];
 assert.equal(r.nearestEnemy(800),null);const close=target(r,8,'hunter',200,'near');assert.equal(r.nearestEnemy(800),close);
 renderer.camera={x:r.player.x,y:r.player.y};renderer.draw(r,1,step);assert.ok(env.drawCalls.some(c=>c.method==='createRadialGradient'));assert.ok(!env.drawCalls.some(c=>c.method==='fillText'&&String(c.args[0])==='4096'));
});

test('volatile deaths warn first then hurt once, expire, respect walls and never chain enemy kills',()=>{
 const r=empty(['volatile']),e=target(r,1,'hunter',30),bystander=target(r,1,'hunter',50,'bystander');r.kill(e);assert.equal(r.world.hazards.length,1);assert.equal(r.player.hp,100);
 updateRunHazards(r,.89);assert.equal(r.player.hp,100);updateRunHazards(r,.02);assert.equal(r.player.hp,85);assert.equal(bystander.dead,false);r.player.invulnerable=0;updateRunHazards(r,.1);assert.equal(r.player.hp,85);updateRunHazards(r,.1);assert.equal(r.world.hazards.length,0);
 const covered=empty(['volatile']);const foe=target(covered,1,'hunter',70);covered.world.obstacles=[{x:covered.player.x+35,y:covered.player.y-80,w:10,h:160}];covered.kill(foe);updateRunHazards(covered,1);assert.equal(covered.player.hp,100);
});

test('volatile fields are bounded and bosses do not create death bursts',()=>{
 const r=empty(['volatile']);for(let i=0;i<40;i++)r.kill(target(r,1,'hunter',200+i*3,'victim-'+i));assert.equal(r.world.hazards.length,32);
 const base=empty(['volatile']),boss=new Raid(defaultSave(),7).world.enemies.find(e=>e.boss);base.world.enemies=[boss];base.kill(boss);assert.equal(base.world.hazards.filter(h=>h.runHazard).length,0);
});

test('rich speeds heat from time and activity while safehouses halve its time growth',()=>{
 const normal=empty(),rich=empty(['rich']);normal.heat.update(normal,10);rich.heat.update(rich,10);near(rich.heat.value/normal.heat.value,1.5);
 const sheltered=empty();Object.assign(sheltered.player,{x:sheltered.world.exits[0].x,y:sheltered.world.exits[0].y});sheltered.heat.update(sheltered,10);near(sheltered.heat.value,normal.heat.value/2);
 const before=rich.heat.value;rich.kill(target(rich));near(rich.heat.value-before,.6);rich.heat.add(1000);assert.equal(rich.heat.value,100);rich.heat.add(-50);assert.equal(rich.heat.value,100);
});

test('heat escalates four levels and warning-backed hunters materialize with a twelve-person cap',()=>{
 const r=empty([],true);r.director.nextPulse=Infinity;r.heat.add(100);r.heat.update(r,step);assert.equal(r.heat.level,4);assert.equal(r.world.spawnWarnings.length,5);assert.equal(r.world.enemies.length,0);
 r.elapsed=1;r.director.update(r,step);assert.equal(r.world.enemies.length,0);r.elapsed=1.31;r.director.update(r,step);assert.equal(r.world.enemies.length,5);assert.ok(r.world.enemies.every(e=>e.hunter&&e.horde&&e.aggro===999));
 for(let i=0;i<10;i++){r.elapsed+=23;r.heat.update(r,step);r.elapsed+=1.4;r.director.update(r,step);assert.ok(r.world.enemies.filter(e=>e.hunter&&!e.dead).length+r.world.spawnWarnings.filter(m=>m.hunter).length<=12);}
 assert.equal(r.world.enemies.filter(e=>e.hunter&&!e.dead).length,12);
});

test('hunters honor the lifetime budget, warn safely and cancel when player enters a safehouse',()=>{
 const r=empty([],true);r.director.nextPulse=Infinity;r.heat.add(100);
 for(let i=0;i<100;i++){r.elapsed=i*23;r.world.enemies=[];r.world.spawnWarnings=[];r.heat.update(r,step);assert.ok(r.heat.total<=120);}
 assert.equal(r.heat.total,120);assert.equal(r.heat.waves,24);r.heat.nextHunt=0;r.world.spawnWarnings=[];r.heat.update(r,step);assert.equal(r.world.spawnWarnings.length,0);
 const safe=empty([],true);safe.heat.add(80);safe.heat.update(safe,step);assert.ok(safe.world.spawnWarnings.some(m=>m.hunter));Object.assign(safe.player,{x:safe.world.exits[0].x,y:safe.world.exits[0].y});safe.heat.update(safe,step);assert.ok(safe.world.spawnWarnings.every(m=>!m.hunter));safe.elapsed=200;safe.director.update(safe,step);assert.equal(safe.world.enemies.length,0);
});

test('heat and existing directors share nearby capacity and never spawn directly on the player',()=>{
 const r=empty([],true);r.heat.add(100);const cap=r.director.profile(r.elapsed).nearCap;
 for(let i=0;i<cap-1;i++)target(r,1,'hunter',400+i*3,'crowd-'+i);
 r.heat.update(r,step);assert.ok(r.world.spawnWarnings.length<=1);const mark=r.world.spawnWarnings[0];assert.ok(mark);r.player.x=mark.x;r.player.y=mark.y;r.elapsed=mark.readyAt+.01;r.director.nextPulse=Infinity;r.director.update(r,step);assert.equal(r.world.enemies.filter(e=>e.hunter).length,0);
});

test('completed raids freeze heat and cannot schedule additional hunters',()=>{
 const r=empty([],true);r.heat.add(80);r.finish(false,'test');const heat=r.heat.value;r.elapsed=200;r.heat.update(r,30);r.update(1,{});assert.equal(r.heat.value,heat);assert.equal(r.world.spawnWarnings.length,0);
});

test('number identities change physical size, real movement and incoming damage at explicit thresholds',()=>{
 const cases=[[32,19,1,1],[64,21,1.04,1],[128,21,1.04,1],[256,24,.94,.92],[512,24,.94,.92],[1024,28,.86,.86],[2048,28,.86,.86]];
 for(const [value,radius,speed,damage]of cases){const r=empty();r.player.value=value;updateNumberForm(r);assert.equal(r.player.radius,radius);assert.equal(numberForm(value),r.player.form);const x=r.player.x;r.update(step,{x:1});near(r.player.x-x,RULES.speed*speed*step);r.hurt(25);near(r.player.hp,100-25*damage);}
 assert.equal(attackDamage(8,4),50);assert.equal(attackDamage(4,8),25);assert.equal(attackDamage(16,4),75);assert.equal(attackDamage(4,16),12.5);
});

test('growing near a wall defers collision expansion until open space without teleporting',()=>{
 const r=empty();r.world.obstacles=[{x:r.player.x+20,y:r.player.y-100,w:20,h:200}];const origin={x:r.player.x,y:r.player.y};r.player.value=1024;updateNumberForm(r);
 assert.equal(r.player.form.id,'core');assert.equal(r.player.radius,19);assert.equal(r.player.formPending,true);assert.deepEqual({x:r.player.x,y:r.player.y},origin);assert.ok(isFree(r.player.x,r.player.y,r.player.radius,r.world.obstacles,r.world.bounds));
 r.update(step,{x:-1});advance(r,.1,{x:-1});assert.equal(r.player.radius,28);assert.equal(r.player.formPending,false);assert.ok(isFree(r.player.x,r.player.y,r.player.radius,r.world.obstacles,r.world.bounds));
});

test('mutator and form changes do not rewrite carried equipment or persistent forge records',()=>{
 const s=defaultSave();s.forged.rifle={level:3,rarity:'green',enchant:'frost'};const gun=decorateWeapon(makeEquipment('weapon','rifle','purple','owned'),'lightning',4),laser=makeEquipment('laser','','white','laser');const original=JSON.stringify({s,gun,laser});
 const r=new Raid(s,72,{pressure:false,mutators:['glass','haste','jammed'],warehouseGear:{weapons:[gun,null],laser}});r.player.value=1024;updateNumberForm(r);assert.equal(JSON.stringify({s,gun,laser}),original);assert.equal(r.player.weapons[0].level,4);assert.equal(r.player.weapons[0].enchant,'lightning');
});

test('seeded exits vary conditions and positions but always retain one permanent west fallback',()=>{
 const describe=r=>r.world.exits.map(e=>({id:e.id,x:e.x,y:e.y,kind:e.kind,bossId:e.bossId,opensAt:e.opensAt,requiredNumber:e.requiredNumber}));
 const variations=new Set();for(let seed=1;seed<=12;seed++){
  const r=new Raid(defaultSave(),seed,{pressure:false}),same=new Raid(defaultSave(),seed,{pressure:false});assert.deepEqual(describe(r),describe(same));assert.equal(r.world.exits.length,4);const fallback=r.world.exits[0];assert.equal(fallback.kind,'fallback');assert.equal(fallback.safehouse,true);assert.equal(fallback.bossId,null);assert.equal(fallback.opensAt,r.difficulty.extractAt);
  r.elapsed=r.duration-5;assert.equal(r.extractionReady(fallback),true);assert.ok(r.world.exits.some(e=>e.kind==='window'));assert.ok(r.world.exits.some(e=>e.kind==='key'));variations.add(JSON.stringify(describe(r).slice(1)));
 }
 assert.ok(variations.size>=8);
});

test('every difficulty and map family has legal exit collision bodies and a reachable fallback deadline',()=>{
 for(const difficulty of DIFFICULTIES)for(const layout of ['tangram','fracture','blocks','wilds']){
  const r=new Raid(defaultSave(),103,{pressure:false,difficulty:difficulty.id,layout});
  for(const exit of r.world.exits)assert.ok(isFree(exit.x,exit.y,28,r.world.obstacles,r.world.bounds),`${difficulty.id}/${layout}/${exit.id}`);
  assert.ok(r.world.chests.some(c=>c.keyCard));r.elapsed=r.difficulty.extractAt;assert.equal(r.extractionReady(r.world.exits[0]),true);
 }
});

test('fallback extraction succeeds without a key, number or dead boss after four stationary seconds',()=>{
 const r=empty();r.elapsed=r.difficulty.extractAt;Object.assign(r.player,{x:r.world.exits[0].x,y:r.world.exits[0].y});advance(r,2,{interact:true});assert.equal(r.result,null);r.update(step,{});assert.equal(r.extractProgress,0);advance(r,4.1,{interact:true});assert.equal(r.result.success,true);assert.equal(r.result.extractedVia,'fallback');assert.equal(r.exitKeys,0);
});

test('timed exits reject short windows, reopen predictably, and allow a complete four-second channel',()=>{
 const r=empty(),exit=r.world.exits.find(e=>e.kind==='window');Object.assign(r.player,{x:exit.x,y:exit.y});r.elapsed=exit.opensAt+27;assert.equal(r.extractionReady(exit),false);r.updateInteraction({interact:true},.1);assert.equal(r.extractProgress,0);
 r.elapsed=exit.opensAt+30;assert.equal(r.extractionReady(exit),false);assert.equal(r.extractionStatus(exit).wait,40);
 r.elapsed=exit.opensAt+70+25;advance(r,4.1,{interact:true});assert.equal(r.result.success,true);assert.equal(r.result.extractedVia,'window');
});

test('a timed exit that closes or takes damage cancels extraction without leaving stale progress',()=>{
 const r=empty(),exit=r.world.exits.find(e=>e.kind==='window');Object.assign(r.player,{x:exit.x,y:exit.y});r.elapsed=exit.opensAt+10;r.updateInteraction({interact:true},1);assert.equal(r.extractProgress,1);
 r.elapsed=exit.opensAt+30;r.updateInteraction({interact:true},.1);assert.equal(r.extractProgress,0);assert.equal(r.result,null);r.elapsed=exit.opensAt+70;r.updateInteraction({interact:true},1);r.hurt(1);assert.equal(r.extractProgress,0);assert.equal(r.result,null);
});

test('key cache grants one raid-only card; locked or interrupted extraction never consumes it',()=>{
 const r=empty(),exit=r.world.exits.find(e=>e.kind==='key');r.elapsed=exit.opensAt;Object.assign(r.player,{x:exit.x,y:exit.y});r.updateInteraction({interact:true},4);assert.equal(r.result,null);assert.equal(r.exitKeys,0);
 const cache={id:'key-test',x:r.player.x+300,y:r.player.y,zone:0,value:10,opened:false,dividers:0,medkits:0,keyCard:true};r.world.chests=[cache];Object.assign(r.player,{x:cache.x,y:cache.y});advance(r,.8,{interact:true});assert.equal(r.exitKeys,1);advance(r,1,{interact:true});assert.equal(r.exitKeys,1);
 Object.assign(r.player,{x:exit.x,y:exit.y});advance(r,1,{interact:true});assert.equal(r.exitKeys,1);r.update(step,{});assert.equal(r.extractProgress,0);advance(r,4.1,{interact:true});assert.equal(r.exitKeys,0);assert.equal(r.result.success,true);assert.equal(r.result.extractedVia,'key');assert.ok(!r.result.gear.some(i=>i.keyCard));
});

test('number-gated and boss-gated exits evaluate their actual requirement independently of fallback',()=>{
 let number,boss;for(let seed=0;seed<10&&(!number||!boss);seed++){const r=new Raid(defaultSave(),seed,{pressure:false});if(r.world.exits.some(e=>e.kind==='number'))number=r;else boss=r;}
 assert.ok(number&&boss);const numberExit=number.world.exits.find(e=>e.kind==='number');number.elapsed=numberExit.opensAt;number.player.value=numberExit.requiredNumber/2;assert.equal(number.extractionReady(numberExit),false);number.player.value=numberExit.requiredNumber;assert.equal(number.extractionReady(numberExit),true);
 const bossExit=boss.world.exits.find(e=>e.kind==='boss');boss.elapsed=bossExit.opensAt;assert.equal(boss.extractionReady(bossExit),false);assert.equal(boss.extractionStatus(bossExit).bossLocked,true);boss.world.enemies.find(e=>e.id===bossExit.bossId).dead=true;assert.equal(boss.extractionReady(bossExit),true);assert.equal(boss.extractionReady(boss.world.exits[0]),true);
});

test('v0.10 schema-four migration preserves warehouse overflow, selected gear, durability and old data',()=>{
 const storage=memory(),old=defaultSave();old.version=4;delete old.selectedMutators;old.credits=743;old.shelter.warehouse=1;old.forged.rifle={level:3,rarity:'green',enchant:'poison'};
 const armor=makeEquipment('armor','','purple','worn');armor.durability=11;storeExtractedGear(old,[decorateWeapon(makeEquipment('weapon','plasma','purple','owned'),'frost',3),armor,...Array.from({length:40},(_,i)=>makeEquipment('weapon','rifle','blue','extra-'+i))]);selectWarehouseGear(old,old.warehouse.items[0].id,'0');selectWarehouseGear(old,old.warehouse.items[1].id,'armor');const original=JSON.stringify(old);storage.setItem(V10_SAVE_KEY,original);
 const result=readSave(storage);assert.equal(result.migrated,true);assert.equal(result.save.version,5);assert.equal(result.save.credits,743);assert.deepEqual(result.save.selectedMutators,[]);assert.deepEqual(result.save.warehouse,old.warehouse);assert.deepEqual(result.save.deployment,old.deployment);assert.deepEqual(result.save.forged,old.forged);
 assert.equal(storage.getItem(V10_SAVE_KEY),original);assert.equal(writeSave(storage,result.save),true);storage.setItem(V10_SAVE_KEY,JSON.stringify({version:4,credits:1}));assert.equal(readSave(storage).save.credits,743);assert.ok(storage.getItem(SAVE_KEY));
 const prepared=prepareWarehouseDeployment(result.save),r=new Raid(prepared.save,10,{pressure:false,warehouseGear:prepared.gear});assert.equal(r.player.weapons[0].enchant,'frost');assert.equal(r.player.armor.durability,11);
});

test('v0.11 save export/import retains selected mutators and rejects unsupported future schemas',()=>{
 const s=defaultSave();s.selectedMutators=['glass','jammed','short'];const text=serializeSave(s);assert.equal(validSaveText(text),true);assert.deepEqual(parseSaveFile(text).selectedMutators,['glass','short','jammed']);
 assert.deepEqual(normalizeSave({...s,selectedMutators:['unknown','rich','rich','no_dodge','fog','short']}).selectedMutators,['no_dodge','fog','rich']);assert.equal(validSaveText(JSON.stringify({...s,version:6})),false);assert.throws(()=>parseSaveFile(JSON.stringify({...s,version:6})));
});

test('live HUD and paused intel reflect heat, form, maximum health and all four exit requirements',t=>{
 const env=browserStubs(t),ui=new UI(new Proxy({},{get:()=>()=>{}})),r=empty(['glass','fog']);r.player.value=1024;updateNumberForm(r);r.heat.add(80);r.heat.update(r,0);r.player.hp=37.5;ui.update(r,defaultSave(),true,false);
 assert.equal(env.ids.get('health-bar').style.width,'50%');assert.match(env.ids.get('form-label').textContent,/核心/);assert.match(env.ids.get('heat-value').textContent,/80/);ui.exits(r);assert.equal((env.ids.get('dialog').innerHTML.match(/class="exit-brief-item"/g)||[]).length,4);assert.match(env.ids.get('dialog').innerHTML,/行动已暂停/);
});

test('action settings show ten controls, explicit bonuses and a disabled fourth choice',t=>{
 const env=browserStubs(t),ui=new UI(new Proxy({},{get:()=>()=>{}})),s=defaultSave();s.selectedMutators=['rich','glass','short'];ui.shelterTab='rules';ui.shelter(s,{});const html=env.ids.get('shelter-screen').innerHTML;
 const cards=[...html.matchAll(/<button class="mutator-card[^>]*>/g)].map(m=>m[0]);assert.equal(cards.length,10);assert.equal(cards.filter(c=>/aria-pressed="true"/.test(c)).length,3);assert.equal(cards.filter(c=>/ disabled/.test(c)).length,7);assert.match(html,/结算奖励 \+50%/);assert.match(html,/data-action="shelterTab" data-key="rules"/);
});

test('real shelter actions persist up to three choices, roll back failed writes and apply them on deployment',async t=>{
 const env=browserStubs(t);await import('../dist/src/main.js?run-depth-actions-v011');const shelter=env.ids.get('shelter-screen'),dialog=env.ids.get('dialog');
 const action=(name,key)=>{const button=shelter.children.find(b=>b.dataset.action===name&&(key===undefined||b.dataset.key===key));assert.ok(button,`${name}/${key}`);shelter.dispatch('click',{target:button});};
 action('shelterTab','rules');assert.equal(shelter.dataset.tab,'rules');for(const key of ['rich','glass','short'])action('toggleMutator',key);
 assert.deepEqual(JSON.parse(env.window.localStorage.getItem(SAVE_KEY)).selectedMutators,['rich','glass','short']);action('toggleMutator','fog');assert.deepEqual(JSON.parse(env.window.localStorage.getItem(SAVE_KEY)).selectedMutators,['rich','glass','short']);
 const write=env.window.localStorage.setItem;env.window.localStorage.setItem=()=>{throw Error('simulated disk failure');};action('toggleMutator','rich');assert.deepEqual(JSON.parse(env.window.localStorage.getItem(SAVE_KEY)).selectedMutators,['rich','glass','short']);assert.match(shelter.innerHTML,/本局词条：高价悬赏 · 玻璃火力 · 限时行动/);
 env.window.localStorage.setItem=write;action('toggleMutator','rich');assert.deepEqual(JSON.parse(env.window.localStorage.getItem(SAVE_KEY)).selectedMutators,['glass','short']);action('shelterTab','deploy');action('start');assert.equal(env.document.body.dataset.screen,'raid');assert.equal(env.ids.get('health-value').textContent,75);assert.equal(env.ids.get('time-value').textContent,'03:12');assert.match(env.ids.get('heat-value').textContent,/热度 0/);
 env.ids.get('extract-brief-button').dispatch('click');assert.equal(env.ids.get('overlay').hidden,false);assert.match(dialog.innerHTML,/撤离情报/);assert.match(dialog.innerHTML,/行动已暂停/);const before=env.ids.get('time-value').textContent;const frame=env.frames.find(fn=>fn.name==='frame');frame(100);frame(400);assert.equal(env.ids.get('time-value').textContent,before);
 dialog.dispatch('click',{target:dialog.children.find(b=>b.dataset.action==='close')});assert.equal(env.ids.get('overlay').hidden,true);
});
