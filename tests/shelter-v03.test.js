import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD,LEGACY_WORLD,DIFFICULTIES,FACILITIES,SAVE_KEY,LEGACY_SAVE_KEY,RULES } from '../dist/src/config.js';
import { Raid } from '../dist/src/game.js';
import { generateWorld,createEnemy,createLoot } from '../dist/src/world.js';
import { isFree,lineOfSight,firstWallFraction,seededRandom,distance } from '../dist/src/math.js';
import { SpatialGrid,obstaclesFor } from '../dist/src/spatial.js';
import { defaultSave,normalizeSave,readSave,writeSave,settleRun } from '../dist/src/storage.js';
import { facilityCost,upgradeFacility,canUpgradeFacility,unlockedWeapons,starterLoadout } from '../dist/src/shelter.js';
import { makeEquipment } from '../dist/src/equipment.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function empty(save=defaultSave(),options={}){
  const raid=new Raid(save,1234,{pressure:false,...options});
  Object.assign(raid.world,{obstacles:[],terrain:[],enemies:[],tiles:[],chests:[],nodes:[],drops:[],projectiles:[]});
  raid.random=()=>0.5;return raid;
}
function advance(raid,seconds,input={}){for(let i=0;i<Math.ceil(seconds/RULES.fixedStep);i++)raid.update(RULES.fixedStep,input);}
function target(raid,x=180,id='target'){
  const enemy=createEnemy(id,raid.player.x+x,raid.player.y,raid.player.value);enemy.cooldown=999;raid.world.enemies.push(enemy);return enemy;
}

test('compact difficulty maps and enemy tiers grow monotonically',()=>{
  assert.equal(WORLD.width,LEGACY_WORLD.width*2);assert.equal(WORLD.height,LEGACY_WORLD.height*2);
  let area=0,maxEnemy=0;
  for(const mission of DIFFICULTIES){
    const world=generateWorld(42,mission.id),current=world.bounds.width*world.bounds.height;
    assert.ok(current>area);assert.ok(current>=LEGACY_WORLD.width*LEGACY_WORLD.height*4);
    const ceiling=Math.max(...world.enemies.map(enemy=>enemy.value));assert.ok(ceiling>maxEnemy);
    area=current;maxEnemy=ceiling;
    assert.equal(world.bounds.width,mission.width);assert.equal(world.difficulty.id,mission.id);
    for(const item of [...world.tiles,...world.chests,...world.nodes,...world.enemies])assert.ok(isFree(item.x,item.y,22,obstaclesFor(world,item,item,22),world.bounds),`${mission.id}: ${item.id}`);
  }
  assert.equal(area,12800*8000);assert.equal(maxEnemy,2048);
});

test('both extraction points remain reachable across all five map sizes',()=>{
  const cell=80;
  for(const mission of DIFFICULTIES){
    const world=generateWorld(71,mission.id),cols=world.bounds.width/cell,rows=world.bounds.height/cell;
    const sx=Math.floor(WORLD.spawn.x/cell),sy=Math.floor(WORLD.spawn.y/cell),queue=[[sx,sy]],seen=new Set([`${sx},${sy}`]);
    for(let head=0;head<queue.length;head++){
      const[x,y]=queue[head],a={x:x*cell+40,y:y*cell+40};
      for(const[nx,ny]of[[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){
        const key=`${nx},${ny}`;if(nx<0||ny<0||nx>=cols||ny>=rows||seen.has(key))continue;
        const b={x:nx*cell+40,y:ny*cell+40},obstacles=obstaclesFor(world,a,b,22);
        if(isFree(b.x,b.y,22,obstacles,world.bounds)&&lineOfSight(a,b,obstacles,22)){seen.add(key);queue.push([nx,ny]);}
      }
    }
    for(const exit of world.exits)assert.ok(seen.has(`${Math.floor(exit.x/cell)},${Math.floor(exit.y/cell)}`),`${mission.id} ${exit.id}`);
  }
});

test('movement and bullets use the selected map bounds beyond the old global boundary',()=>{
  const r=empty(defaultSave(),{difficulty:'nightmare'});r.player.x=12000;r.player.y=4000;
  r.update(0.1,{x:1});assert.ok(r.player.x>12000);
  const enemy=target(r,140);r.attack();r.updateProjectiles(0.3);near(enemy.hp,75);
  r.player.x=12790;r.update(1,{x:1});assert.equal(r.player.x,12800-r.player.radius);
});

test('spatial obstacle queries preserve full-scan line and projectile intersections',()=>{
  const world=generateWorld(91,'nightmare'),random=seededRandom(123);
  for(let i=0;i<180;i++){
    const a={x:random()*world.bounds.width,y:random()*world.bounds.height};
    const b={x:a.x+(random()-.5)*1800,y:a.y+(random()-.5)*1800};
    const local=obstaclesFor(world,a,b,8);
    assert.equal(lineOfSight(a,b,local,8),lineOfSight(a,b,world.obstacles,8));
    assert.equal(firstWallFraction(a,b,local,8),firstWallFraction(a,b,world.obstacles,8));
  }
  const source=[{x:10,y:10,w:20,h:20}],grid=new SpatialGrid(source),changed={obstacles:source,obstacleGrid:grid};
  source.push({x:500,y:500,w:20,h:20});assert.equal(obstaclesFor(changed,{x:500,y:500}),source);
});

test('v1 saves migrate currency, upgrades and history without overwriting the legacy save',()=>{
  const original={version:1,credits:432,extractions:3,deaths:2,best:128,upgrades:{capacity:2,divider:1},lastRuns:[{id:'old',success:true,value:24,number:8,seconds:20}]};
  const stored=new Map([[LEGACY_SAVE_KEY,JSON.stringify(original)]]);
  const storage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)};
  const loaded=readSave(storage).save;
  assert.equal(loaded.version,4);assert.equal(loaded.credits,432);assert.equal(loaded.best,128);
  assert.equal(loaded.shelter.storage,2);assert.equal(loaded.shelter.supply,1);assert.deepEqual(loaded.materials,{alloy:0,core:0});
  assert.equal(loaded.lastRuns[0].id,'old');writeSave(storage,loaded);assert.equal(JSON.parse(stored.get(SAVE_KEY)).credits,432);assert.deepEqual(JSON.parse(stored.get(LEGACY_SAVE_KEY)),original);
});

test('invalid shelter data and locked loadouts normalize to bounded, usable values',()=>{
  const save=normalizeSave({version:2,credits:40,materials:{alloy:-2,core:Infinity},shelter:{storage:999,workshop:0,recycler:-3},selectedDifficulty:'invalid',selectedWeapon:'railgun'});
  assert.equal(save.shelter.storage,FACILITIES.storage.max);assert.equal(save.shelter.recycler,0);
  assert.equal(save.selectedDifficulty,'scout');assert.equal(save.selectedWeapon,'pistol');assert.deepEqual(save.materials,{alloy:0,core:0});
});

test('facility upgrades debit all resources atomically and unlock real starter weapons',()=>{
  const save=defaultSave();save.credits=1000;save.materials={alloy:100,core:10};
  assert.deepEqual(facilityCost('workshop',0),{credits:120,alloy:4,core:0});
  assert.equal(upgradeFacility(save,'workshop'),true);
  assert.equal(save.credits,880);assert.equal(save.materials.alloy,96);assert.equal(save.materials.core,10);
  assert.equal(save.shelter.workshop,1);assert.ok(unlockedWeapons(save).includes('smg'));assert.ok(unlockedWeapons(save).includes('dualblades'));
  save.materials.alloy=0;const before=JSON.stringify(save);
  assert.equal(upgradeFacility(save,'storage'),false);assert.equal(JSON.stringify(save),before);
  save.shelter.workshop=FACILITIES.workshop.max;assert.equal(canUpgradeFacility(save,'workshop'),false);
});

test('workshop loadouts enforce unlocks and grant non-sellable upgraded starting equipment',()=>{
  const save=defaultSave();assert.equal(starterLoadout(save,'railgun').weapons[0].weapon,'pistol');
  save.shelter.workshop=2;let loadout=starterLoadout(save,'shotgun');
  assert.equal(loadout.weapons[0].weapon,'shotgun');assert.equal(loadout.weapons[0].rarity,'yellow');assert.ok(loadout.armor);assert.equal(loadout.laser,null);
  save.shelter.workshop=4;loadout=starterLoadout(save,'railgun');
  assert.equal(loadout.weapons[0].weapon,'railgun');assert.ok(loadout.laser);
  assert.ok([...loadout.weapons,loadout.armor,loadout.laser].every(item=>item.starter&&item.value===0));
});

test('shelter storage and supplies affect the next raid and recycler multiplies extracted resources once',()=>{
  const save=defaultSave();Object.assign(save.shelter,{storage:5,supply:4,recycler:4});
  const r=empty(save,{difficulty:'hard'});
  assert.equal(r.capacity,18);assert.equal(r.player.dividers,6);assert.equal(r.player.medkits,3);
  r.bag=[createLoot(r.player.x,r.player.y,0,24,'cargo')];r.finish(true,'success');
  assert.equal(r.result.value,69);assert.equal(r.result.materials.alloy,3);
  settleRun(save,r.result);settleRun(save,r.result);assert.equal(save.credits,69);assert.equal(save.materials.alloy,3);
});

test('failure preserves the shelter and does not bank raid materials',()=>{
  const save=defaultSave();save.credits=80;save.materials={alloy:7,core:2};save.shelter.workshop=2;
  const r=empty(save);r.bag=[createLoot(r.player.x,r.player.y,2,100,'core-loot')];r.finish(false,'failure');settleRun(save,r.result);
  assert.equal(save.credits,80);assert.deepEqual(save.materials,{alloy:7,core:2});assert.equal(save.shelter.workshop,2);
});

test('four tutorial merges charge Overload, which spends energy and temporarily boosts attacks',()=>{
  const r=new Raid(defaultSave(),8);r.world.enemies=[];
  for(let i=0;i<4;i++){
    const tile=r.world.tiles.find(item=>item.id===`tutorial-${i}`);r.player.x=tile.x;r.player.y=tile.y;r.update(RULES.fixedStep,{});
  }
  assert.equal(r.player.value,16);assert.equal(r.player.energy,100);
  assert.equal(r.activateOverload(),true);assert.equal(r.player.energy,0);assert.equal(r.player.overload,7);assert.equal(r.activateOverload(),false);
  Object.assign(r.world,{obstacles:[],terrain:[],tiles:[],nodes:[],chests:[],enemies:[],drops:[],projectiles:[]});r.random=()=>0.5;
  const enemy=target(r,180);r.attack();r.updateProjectiles(0.5);near(enemy.hp,68.75);near(r.player.attackCooldown,0.46*0.75);
  advance(r,7.2);assert.equal(r.player.overload,0);
});

test('operation nodes are single use and phase mitigation expires',()=>{
  const r=empty(),node={id:'phase',x:r.player.x+20,y:r.player.y,kind:'phase',used:false};r.world.nodes=[node];
  advance(r,1,{interact:true});assert.equal(node.used,true);assert.equal(r.nodesActivated,1);assert.equal(r.player.energy,20);
  assert.equal(r.activateNode(node),false);r.hurt(50);near(r.player.hp,65);
  advance(r,17);r.hurt(50);near(r.player.hp,15);
  assert.equal(r.activateNode({used:false,kind:'unknown'}),false);
});

test('magnet nodes extend collection and equal-number merging but respect walls',()=>{
  const r=empty();r.activateNode({used:false,kind:'magnet',x:r.player.x,y:r.player.y});
  r.world.tiles=[{id:'merge',x:r.player.x+100,y:r.player.y,value:1,dead:false}];
  r.world.drops=[createLoot(r.player.x+180,r.player.y,0,12,'nearby')];r.update(RULES.fixedStep,{});
  assert.equal(r.player.value,2);assert.equal(r.bag.length,1);
  r.world.drops=[createLoot(r.player.x+160,r.player.y,0,24,'blocked')];
  r.world.obstacles=[{x:r.player.x+80,y:r.player.y-100,w:10,h:200}];r.update(RULES.fixedStep,{});assert.equal(r.bag.length,1);
});

test('a shotgun shares base damage across pellets and a laser concentrates the spread',()=>{
  const hits=[];
  for(const laser of[false,true]){
    const r=empty();r.player.weapons[0]=makeEquipment('weapon','shotgun');r.player.laser=laser?makeEquipment('laser'):null;
    const enemy=target(r,300);r.attack();assert.equal(r.world.projectiles.length,5);r.updateProjectiles(0.5);hits.push(100-enemy.hp);
  }
  assert.ok(hits[1]>hits[0]);near(hits[1],25);
});

test('railgun penetrates three distinct targets, never re-hits them, and stops at walls',()=>{
  const r=empty();r.player.weapons[0]=makeEquipment('weapon','railgun');
  const targets=[100,160,220,280].map((x,i)=>target(r,x,String(i)));r.attack();r.updateProjectiles(0.3);
  assert.deepEqual(targets.map(enemy=>enemy.hp),[75,75,75,100]);
  const blocked=empty();blocked.player.weapons[0]=makeEquipment('weapon','railgun');
  const first=target(blocked,80,'a'),second=target(blocked,180,'b');
  blocked.world.obstacles=[{x:blocked.player.x+120,y:blocked.player.y-100,w:10,h:200}];blocked.attack();blocked.updateProjectiles(0.3);
  assert.equal(first.hp,75);assert.equal(second.hp,100);
});

test('distant enemy AI stays dormant and wakes when the player approaches',()=>{
  const r=empty(),enemy=target(r,5000);enemy.cooldown=0;
  const before={x:enemy.x,y:enemy.y};r.update(0.5,{});assert.equal(distance(before,enemy),0);
  r.player.x=enemy.x-200;r.update(RULES.fixedStep,{});assert.ok(enemy.x<before.x);
});


test('old-version play cannot overwrite the canonical shelter save',()=>{
  const stored=new Map(),storage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)};
  const save=defaultSave();save.credits=777;save.shelter.workshop=3;writeSave(storage,save);
  stored.set(LEGACY_SAVE_KEY,JSON.stringify({version:1,credits:9,upgrades:{capacity:0,divider:0}}));
  const restored=readSave(storage).save;assert.equal(restored.credits,777);assert.equal(restored.shelter.workshop,3);
});
