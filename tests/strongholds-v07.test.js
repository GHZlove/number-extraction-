import test from 'node:test';
import assert from 'node:assert/strict';
import { Raid } from '../dist/src/game.js';
import { createSectors, containsPoint, polygonArea } from '../dist/src/regions.js';
import { generateWorld, createEnemy, createLoot } from '../dist/src/world.js';
import { defaultSave, normalizeSave, readSave, writeSave, settleRun } from '../dist/src/storage.js';
import { SAVE_KEY, PREVIOUS_SAVE_KEY, DIFFICULTIES, MAP_LAYOUTS, RULES } from '../dist/src/config.js';
import { makeEquipment, decorateWeapon, knockbackFor, equipmentValue } from '../dist/src/equipment.js';
import { forgeWeapon, forgeCost, starterLoadout } from '../dist/src/shelter.js';
import { seededRandom, distance, zoneAt, isFree } from '../dist/src/math.js';
import { updateHazards } from '../dist/src/enchantments.js';
import { empowerBoss, BOSSES } from '../dist/src/bosses.js';
import { buyFromMerchant, SHOP, tradeValue } from '../dist/src/commerce.js';
import { Input } from '../dist/src/input.js';
import { Renderer } from '../dist/src/renderer.js';
import { browserStubs } from './helpers/browser-stubs.js';

const step=RULES.fixedStep;
function empty(pressure=false){
  const r=new Raid(defaultSave(),38,{pressure,layout:'tangram'});
  Object.assign(r.world,{enemies:[],obstacles:[],terrain:[],tiles:[],drops:[],chests:[],nodes:[],effects:[],projectiles:[],hazards:[],spawnWarnings:[],sites:[]});
  return r;
}
function enemy(r,dx=120,dy=0,value=4,id='target'){
  const e=createEnemy(id,r.player.x+dx,r.player.y+dy,value);e.cooldown=999;r.world.enemies.push(e);return e;
}
function advance(r,seconds,input={}){for(let i=0;i<Math.ceil(seconds/step);i++)r.update(step,input);}

test('all four map families cover rectangular bounds without gaps or overlapping interiors',()=>{
  const bounds={width:6400,height:4000},random=seededRandom(39),counts=new Set();
  for(const map of MAP_LAYOUTS.slice(1))for(let seed=0;seed<12;seed++){
    const pieces=createSectors(bounds,seededRandom(seed),[],map.id);counts.add(pieces.length);
    assert.ok(Math.abs(pieces.reduce((sum,p)=>sum+polygonArea(p.vertices),0)-bounds.width*bounds.height)<.01);
    for(let i=0;i<350;i++){
      const point={x:random()*bounds.width,y:random()*bounds.height};assert.equal(pieces.filter(p=>containsPoint(point,p.vertices)).length,1,`${map.id}/${seed}`);
    }
    assert.deepEqual(pieces,createSectors(bounds,seededRandom(seed),[],map.id));
  }
  assert.ok(counts.size>=4);
});

test('most enemies guard resource sites, with sparse wilderness populations and safe starting exits',()=>{
  for(const map of MAP_LAYOUTS.slice(1))for(const difficulty of DIFFICULTIES){
    const w=generateWorld(19,difficulty.id,{layout:map.id}),guards=w.enemies.filter(e=>e.guard);
    assert.ok(guards.length/w.enemies.length>.7);assert.ok(w.enemies.filter(e=>!e.guard).length<=30);
    assert.equal(w.layout,map.id);assert.ok(w.enemies.some(e=>e.boss));assert.equal(w.exits[0].safehouse,true);
    for(const guard of guards.filter(e=>!e.boss)){assert.ok(distance(guard,w.sites[guard.siteId])<470);assert.ok(guard.leash>0);}
    for(const exit of w.exits.filter(e=>e.safehouse))assert.ok(w.enemies.every(e=>distance(e,exit)>exit.safetyRadius));
  }
});

test('guards that leave their leash return toward home instead of following across the world',()=>{
  const r=empty(),e=enemy(r,300);e.guard=true;e.leash=400;e.homeX=e.x;e.x+=450;r.player.x=e.x+400;
  const before=Math.abs(e.x-e.homeX);
  for(let i=0;i<120;i++)r.updateEnemy(e,step);
  assert.ok(Math.abs(e.x-e.homeX)<before-150);assert.ok(e.returning);assert.equal(e.state,'idle');
});

test('cleared resource sites cannot continue calling garrison reinforcements',()=>{
  const r=empty(true);r.world.sites=[{x:r.player.x,y:r.player.y}];
  const guard=enemy(r,300);guard.guard=true;r.elapsed=60;r.director.update(r,.1);
  assert.ok(r.world.spawnWarnings.some(m=>m.guard));
  r.world.enemies=[];r.world.spawnWarnings=[];r.elapsed=120;r.director.nextPulse=120;r.director.update(r,.1);
  assert.ok(r.world.spawnWarnings.length<=2);assert.ok(r.world.spawnWarnings.every(m=>!m.guard));
});

test('pending warnings and summoned wilderness enemies share the ten-patrol budget',()=>{
  const r=empty(true);
  for(let i=0;i<9;i++){const e=enemy(r,1400+i*30,0,4,'patrol-'+i);e.horde=true;}
  r.world.spawnWarnings=[{id:'pending',x:3000,y:2000,readyAt:999,guard:false}];r.elapsed=50;r.director.update(r,.1);assert.equal(r.world.spawnWarnings.length,1);
  const summoner=r.world.enemies[0];summoner.type='summoner';r.resolveEnemyAttack(summoner,{pattern:'summon'});assert.equal(r.world.enemies.length,9);
});

test('gun knockback varies by gun, number advantage, quality, forged level and boss mass',()=>{
  assert.ok(knockbackFor('sniper',8,4)>knockbackFor('smg',8,4));
  assert.ok(knockbackFor('rifle',16,4)>knockbackFor('rifle',4,16));
  assert.ok(knockbackFor('rifle',8,4,'red',5)>knockbackFor('rifle',8,4,'white',1));
  const r=empty(),a=enemy(r),b=enemy(r,140,0,4,'boss');empowerBoss(b,'titan',1);
  r.damageEnemy(a,1,{weapon:'rifle',value:8,rarity:'green',level:3});r.damageEnemy(b,1,{weapon:'rifle',value:8,rarity:'green',level:3});
  assert.ok(a.knockX>b.knockX);assert.ok(a.recover>0);
});

test('projectiles keep fired weapon level, enchantment and number after the player switches or merges',()=>{
  const r=empty(),e=enemy(r,150);r.player.value=8;r.player.weapons[0]=decorateWeapon(makeEquipment('weapon','rifle'),'leech',3);r.player.hp=50;
  r.attack();const bullet=r.world.projectiles[0];assert.equal(bullet.level,3);assert.equal(bullet.enchant,'leech');assert.equal(bullet.value,8);
  r.player.value=1;r.switchWeapon(1);r.updateProjectiles(.2);assert.ok(e.hp<50);assert.ok(r.player.hp>50);assert.ok(e.knockX>0);
});

test('forging is atomic, capped and produces repeatable non-salvageable starting equipment',()=>{
  const save=defaultSave(),before=JSON.stringify(save);assert.equal(forgeWeapon(save),false);assert.equal(JSON.stringify(save),before);
  save.credits=100000;save.materials={alloy:1000,core:100};save.selectedEnchant='stun';
  for(let level=1;level<=5;level++){
    const cost=forgeCost(save),credits=save.credits;assert.ok(forgeWeapon(save));assert.equal(save.credits,credits-cost.credits);assert.equal(save.forged.pistol.level,level);
  }
  const capped=JSON.stringify(save);assert.equal(forgeWeapon(save),false);assert.equal(JSON.stringify(save),capped);
  const loadout=starterLoadout(save);assert.equal(loadout.weapons[0].enchant,'stun');assert.equal(loadout.weapons[0].level,5);assert.equal(loadout.weapons[0].rarity,'red');assert.equal(equipmentValue(loadout),0);
  const raid=new Raid(save,2,{pressure:false});raid.finish(false,'test');settleRun(save,raid.result);assert.equal(starterLoadout(save).weapons[0].level,5);
});

test('v0.6 progression migrates to an isolated save key and forged records are validated',()=>{
  const previous={version:2,credits:640,materials:{alloy:21,core:4},shelter:{workshop:2},selectedWeapon:'rifle'};
  const data=new Map([[PREVIOUS_SAVE_KEY,JSON.stringify(previous)]]),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  const loaded=readSave(storage);assert.ok(loaded.migrated);assert.equal(loaded.save.version,3);assert.equal(loaded.save.credits,640);writeSave(storage,loaded.save);
  assert.deepEqual(JSON.parse(data.get(PREVIOUS_SAVE_KEY)),previous);assert.ok(data.has(SAVE_KEY));
  const save=normalizeSave({...loaded.save,forged:{rifle:{level:3,enchant:'poison',rarity:'red'},pistol:{level:999},evil:{level:5}},selectedMap:'bad'});
  assert.deepEqual(save.forged,{rifle:{level:3,enchant:'poison',rarity:'green'}});assert.equal(save.selectedMap,'random');
  data.set(PREVIOUS_SAVE_KEY,JSON.stringify({...previous,credits:1}));assert.equal(readSave(storage).save.credits,640);
});

test('max-level enchanting charges a reforge cost without adding levels or downgrading workshop quality',()=>{
  const save=defaultSave();save.credits=1000;save.materials={alloy:100,core:10};save.shelter.workshop=6;
  save.forged.pistol={level:1,rarity:'white',enchant:'leech'};assert.equal(starterLoadout(save).weapons[0].rarity,'blue');
  save.forged.pistol={level:5,rarity:'red',enchant:'leech'};save.selectedEnchant='poison';
  assert.equal(forgeWeapon(save),true);assert.equal(save.credits,820);assert.equal(save.materials.core,9);assert.equal(save.forged.pistol.level,5);assert.equal(save.forged.pistol.enchant,'poison');
});

test('lifesteal heals from actual health lost and cannot farm dead enemies or overkill',()=>{
  const r=empty(),e=enemy(r);r.player.hp=40;e.hp=2;
  r.damageEnemy(e,10000,{weapon:'pistol',enchant:'leech'});assert.ok(Math.abs(r.player.hp-40.24)<1e-8);
  r.damageEnemy(e,10000,{weapon:'pistol',enchant:'leech'});assert.ok(Math.abs(r.player.hp-40.24)<1e-8);
});

test('lightning chains to two visible distinct enemies with a cooldown and no recursive procs',()=>{
  const r=empty(),first=enemy(r,100,0,4,'first'),second=enemy(r,220,0,4,'second'),third=enemy(r,340,0,4,'third'),last=enemy(r,450,0,4,'fourth');
  r.damageEnemy(first,10,{enchant:'lightning'});assert.equal(second.hp,96.5);assert.equal(third.hp,96.5);assert.equal(last.hp,100);
  r.damageEnemy(first,10,{enchant:'lightning'});assert.equal(second.hp,96.5);assert.equal(r.world.effects.filter(e=>e.kind==='lightning').length,2);
  r.player.enchantCooldowns.lightning=0;r.world.obstacles=[{x:r.player.x+160,y:r.player.y-80,w:30,h:160}];r.damageEnemy(first,10,{enchant:'lightning'});assert.equal(second.hp,96.5);
});

test('stun enchant interrupts attacks but cannot continuously stun-lock a boss',()=>{
  const r=empty(),normal=enemy(r),boss=enemy(r,200,0,4,'boss');empowerBoss(boss,'titan',1);
  normal.state='windup';r.damageEnemy(normal,1,{enchant:'stun',level:3});assert.equal(normal.state,'idle');assert.ok(normal.stun>.4);
  r.damageEnemy(boss,1,{enchant:'stun',level:3});assert.equal(boss.stun,0);
  r.player.enchantCooldowns.stun=0;boss.state='boss-charge';r.damageEnemy(boss,1,{enchant:'stun',level:3});assert.ok(boss.stun>0&&boss.stun<normal.stun);assert.equal(boss.state,'idle');
});

test('poison creates a bounded cloud, damages visible targets and expires without friendly fire',()=>{
  const r=empty(),first=enemy(r,100),covered=enemy(r,160,0,4,'covered');
  r.world.obstacles=[{x:first.x+20,y:first.y-80,w:20,h:160}];r.damageEnemy(first,1,{enchant:'poison',value:4,level:2});
  r.damageEnemy(first,1,{enchant:'poison',value:4});assert.equal(r.world.hazards.length,1);const hp=first.hp;
  for(let i=0;i<8;i++)updateHazards(r,.5);
  assert.ok(first.hp<hp);assert.equal(covered.hp,100);assert.equal(r.player.hp,100);assert.equal(r.world.hazards.length,0);
});

test('right mouse and C parry are single edges and releasing right does not cancel left fire',t=>{
  const env=browserStubs(t),input=new Input(env.canvas,()=>{});input.active=true;
  env.canvas.dispatch('pointerdown',{pointerType:'mouse',button:0,pointerId:1});
  env.canvas.dispatch('mousedown',{pointerType:'mouse',button:2,clientX:500,clientY:300});assert.equal(input.consume().parry,true);assert.equal(input.consume().parry,false);
  env.window.dispatch('pointerup',{button:2,pointerId:1});assert.equal(input.consume().attack,true);
  env.window.dispatch('keydown',{code:'KeyC',target:env.canvas});assert.equal(input.consume().parry,true);assert.equal(input.consume().parry,false);
  input.clear();assert.equal(input.consume().attack,false);assert.equal(input.consume().parry,false);
});

test('frontal timed parry prevents melee damage and counters once; rear attacks bypass it',()=>{
  const r=empty(),e=enemy(r,50);r.player.aimAngle=0;r.player.parryWindow=.18;r.player.parryCooldown=1;
  assert.equal(r.hurt(50,'test',{source:e,parryable:true}),false);assert.equal(r.player.hp,100);assert.ok(e.stun>0);assert.ok(e.hp<100);assert.equal(r.player.energy,12);assert.equal(r.player.parryWindow,0);
  const rear=enemy(r,-50,0,4,'rear');r.player.invulnerable=0;r.player.parryWindow=.18;assert.equal(r.hurt(10,'test',{source:rear,parryable:true}),true);assert.equal(r.player.hp,90);
});

test('parry reflects an approaching bullet along aim while a late parry still takes damage',()=>{
  const r=empty();r.player.aimAngle=0;r.player.parryWindow=.18;
  r.shoot({x:r.player.x+110,y:r.player.y},Math.PI,700,900,'enemy',4);r.updateProjectiles(.2);
  const reflected=r.world.projectiles[0];assert.equal(reflected.owner,'player');assert.ok(reflected.vx>0);assert.equal(r.player.hp,100);assert.ok(reflected.x>r.player.x);
  const late=empty();late.shoot({x:late.player.x+110,y:late.player.y},Math.PI,700,900,'enemy',4);late.updateProjectiles(.2);assert.ok(late.player.hp<100);
});

test('parry has a cooldown and its input survives a heavy hit-stop',()=>{
  const r=empty(),e=enemy(r,100,0,64);r.damageEnemy(e,1,{weapon:'warhammer'});r.update(step,{parry:true});
  r.update(step);r.update(step);assert.ok(r.player.parryWindow>0);const cooldown=r.player.parryCooldown;
  r.update(step,{parry:true});assert.ok(r.player.parryCooldown<cooldown);assert.ok(r.player.parryWindow<.18);
  advance(r,.25);assert.equal(r.player.parryWindow,0);assert.ok(r.player.parryCooldown>0);
});

test('safehouses protect, service once and disallow shooting without stopping the raid clock',()=>{
  const r=empty(),house=r.world.exits[0];Object.assign(r.player,{x:house.x,y:house.y,hp:20});
  r.player.armor=makeEquipment('armor');r.player.armor.durability=1;r.update(step);
  assert.equal(r.player.hp,45);assert.equal(r.player.armor.durability,16);assert.equal(r.attack(),false);assert.equal(r.hurt(100),false);
  r.world.hazards=[{owner:'enemy',x:house.x,y:house.y,radius:150,life:5,tick:0}];advance(r,1);assert.equal(r.player.hp,45);assert.ok(r.elapsed>.9);
  r.player.x+=300;r.update(step);r.player.hp=20;r.player.x=house.x;r.update(step);assert.equal(r.player.hp,20);
});

test('directors suppress safehouse spawns and cancel pending drops inside the protection circle',()=>{
  const r=empty(true),house=r.world.exits[0];Object.assign(r.player,{x:house.x,y:house.y});r.elapsed=100;r.director.update(r,.1);assert.equal(r.world.spawnWarnings.length,0);
  r.world.spawnWarnings=[{id:'bad-spawn',x:house.x,y:house.y,readyAt:0}];r.director.update(r,.1);assert.equal(r.world.enemies.length,0);
});

test('safehouses prevent contact farming, counters and queued bursts as well as direct fire',()=>{
  const r=empty(),e=enemy(r,0),house=r.world.exits[0];Object.assign(r.player,{x:house.x,y:house.y});Object.assign(e,{x:house.x+10,y:house.y});
  r.player.parryWindow=.18;r.clash(e);assert.equal(e.hp,100);assert.equal(r.player.hp,100);assert.equal(r.tryParry(e),false);
  r.bursts=[{remaining:2,wait:0,slot:0}];r.updateBursts(.1);assert.equal(r.world.projectiles.length,0);assert.equal(r.bursts.length,0);
});

test('boss-gated extraction unlocks once and boss loot settles only after successful extraction',()=>{
  const r=empty(),boss=empowerBoss(enemy(r,400,0,16),'titan',1),exit=r.world.exits[1];exit.bossId=boss.id;
  r.elapsed=100;Object.assign(r.player,{x:exit.x,y:exit.y});assert.equal(r.extractionReady(exit),false);assert.equal(r.context().bossLocked,true);
  r.damageEnemy(boss,100000);assert.equal(r.extractionReady(exit),true);assert.equal(r.world.chests.filter(c=>c.bossLoot).length,1);r.kill(boss);assert.equal(r.world.chests.filter(c=>c.bossLoot).length,1);
  const chest=r.world.chests.find(c=>c.bossLoot);Object.assign(r.player,{x:chest.x,y:chest.y});advance(r,.9,{interact:true});assert.ok(r.bag.some(i=>i.bossLoot));
  r.finish(true,'test');const save=defaultSave();assert.ok(settleRun(save,r.result));assert.ok(save.materials.core>=4);assert.ok(save.materials.alloy>=12);const credits=save.credits;assert.equal(settleRun(save,r.result),false);assert.equal(save.credits,credits);
});

test('all three bosses cycle different telegraphed attacks and enrage below half health',()=>{
  for(const kind of Object.keys(BOSSES)){
    const r=empty(true),e=empowerBoss(enemy(r,300,0,16),kind,1),seen=new Set();
    r.player.invulnerable=999;
    for(let turn=0;turn<3;turn++){
      e.cooldown=0;e.state='idle';e.stun=0;e.recover=0;r.updateEnemy(e,step);assert.equal(e.state,'windup');assert.ok(e.timer>=.9);seen.add(e.bossMove);
      for(let i=0;i<80;i++)r.updateEnemy(e,step);
    }
    assert.deepEqual([...seen],BOSSES[kind].moves);assert.equal(r.status,'playing');e.hp=e.maxHp*.4;e.state='idle';r.updateEnemy(e,step);assert.equal(e.bossPhase,2);
    if(kind==='prism')assert.ok(r.world.projectiles.length>10);
    if(kind==='venom'){assert.ok(r.world.hazards.length>=3);assert.ok(r.world.spawnWarnings.length>0);}
  }
});

test('division preserves boss health scale and applies its shorter interruption',()=>{
  const r=empty(),boss=empowerBoss(enemy(r,150,0,16),'prism',1),maxHp=boss.maxHp;boss.hp=maxHp*.6;
  r.divide();assert.equal(boss.value,8);assert.equal(boss.maxHp,maxHp);assert.equal(boss.hp,maxHp*.6);assert.ok(boss.stun<.5);
});

test('merchant spending is exact with partial loot stacks, capped stock and no shelter debit',()=>{
  const r=empty(),trader=r.world.merchants[0];Object.assign(r.player,{x:trader.x,y:trader.y});r.bag=[createLoot(0,0,0,20,'a'),createLoot(0,0,0,30,'b')];
  const medkits=r.player.medkits;assert.equal(buyFromMerchant(r,trader.id,'medkit'),true);assert.equal(tradeValue(r),26);assert.equal(r.player.medkits,medkits+1);assert.equal(trader.stock.medkit,2);
  assert.equal(buyFromMerchant(r,trader.id,'weapon'),false);assert.equal(tradeValue(r),26);
  r.bag=[createLoot(0,0,0,1000,'a')];for(let i=0;i<2;i++)assert.equal(buyFromMerchant(r,trader.id,'medkit'),true);assert.equal(buyFromMerchant(r,trader.id,'medkit'),false);
  r.player.x+=300;assert.equal(buyFromMerchant(r,trader.id,'laser'),false);
});

test('merchant checks capacity before taking payment and purchased equipment really carries an enchantment',()=>{
  const r=empty(),trader=r.world.merchants[0];Object.assign(r.player,{x:trader.x,y:trader.y});r.capacity=1;r.bag=[createLoot(0,0,0,200,'a'),makeEquipment('laser')];
  assert.equal(buyFromMerchant(r,trader.id,'weapon'),false);assert.equal(tradeValue(r),200);assert.equal(trader.stock.weapon,1);
  r.capacity=8;assert.equal(buyFromMerchant(r,trader.id,'weapon'),true);const weapon=r.bag.find(i=>i.kind==='weapon');assert.equal(weapon.level,2);assert.equal(weapon.enchant,'lightning');assert.equal(tradeValue(r),200-SHOP.weapon.cost);
});

test('forge and map choices persist through the actual application and become the next loadout',async t=>{
  const env=browserStubs(t),save=defaultSave();save.credits=1000;save.materials={alloy:40,core:3};env.window.localStorage.setItem(SAVE_KEY,JSON.stringify(save));
  await import('../dist/src/main.js?forge-contract-v07');const shelter=env.ids.get('shelter-screen');
  shelter.dispatch('change',{target:{dataset:{action:'selectMap'},value:'blocks'}});
  shelter.dispatch('change',{target:{dataset:{action:'selectEnchant'},value:'poison'}});
  shelter.dispatch('click',{target:shelter.children.find(b=>b.dataset.action==='forge')});
  const stored=JSON.parse(env.window.localStorage.getItem(SAVE_KEY));assert.equal(stored.selectedMap,'blocks');assert.equal(stored.forged.pistol.enchant,'poison');assert.equal(stored.credits,880);
  shelter.dispatch('click',{target:shelter.children.find(b=>b.dataset.action==='start')});assert.match(env.ids.get('quick-slot-0').innerHTML,/毒雾/);assert.match(env.ids.get('mission-name').textContent,/补给街区/);
});

test('walking to the western merchant and pressing E opens a paused trade dialog through the app',async t=>{
  // Application routes need a reproducible map, just like simulation tests.
  // Stop near the trader's centre rather than the edge of its interaction radius.
  t.mock.method(globalThis.crypto,'getRandomValues',array=>{array.fill(38);return array;});
  const env=browserStubs(t);await import('../dist/src/main.js?merchant-contract-v07');const shelter=env.ids.get('shelter-screen');
  shelter.dispatch('click',{target:shelter.children.find(b=>b.dataset.action==='start')});const frame=env.frames.find(fn=>fn.name==='frame');let now=0;frame(now);
  const key=(type,code)=>env.window.dispatch(type,{code,target:env.canvas});key('keydown','KeyW');for(let i=0;i<22;i++)frame(now+=100);key('keyup','KeyW');
  key('keydown','KeyD');for(let i=0;i<5;i++)frame(now+=100);key('keyup','KeyD');key('keydown','KeyE');frame(now+=100);
  assert.match(env.ids.get('dialog').innerHTML,/边境行商/);assert.equal(env.ids.get('overlay').hidden,false);
});

test('all layouts, boss telegraphs, poison, shops, safehouses and parry render finite coordinates',t=>{
  const env=browserStubs(t),renderer=new Renderer(env.canvas,env.ids.get('minimap'));
  for(const map of MAP_LAYOUTS.slice(1)){
    const r=new Raid(defaultSave(),44,{layout:map.id,pressure:false});
    for(const boss of r.world.enemies.filter(e=>e.boss)){
      r.player.x=boss.x-250;r.player.y=boss.y;renderer.camera={...r.player};r.player.parryWindow=.18;
      r.world.hazards=[{x:boss.x,y:boss.y,radius:90,owner:'enemy',life:3}];
      for(const move of BOSSES[boss.boss].moves){Object.assign(boss,{bossMove:move,state:'windup',timer:.4,windup:1,aimX:r.player.x,aimY:r.player.y});renderer.draw(r,move.length,step);}
    }
    Object.assign(r.player,r.world.merchants[0]);renderer.camera={...r.player};renderer.draw(r,15,step);
  }
});
