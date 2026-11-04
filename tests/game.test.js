import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, WORLD } from '../dist/src/config.js';
import { Raid } from '../dist/src/game.js';
import { attackDamage, canMerge, distance, isFree, lineOfSight, moveEntity } from '../dist/src/math.js';
import { createEnemy, generateWorld } from '../dist/src/world.js';
import { obstaclesFor } from '../dist/src/spatial.js';
import { buyUpgrade, defaultSave, normalizeSave, readSave, settleRun, writeSave } from '../dist/src/storage.js';

function emptyRaid(){const r=new Raid(defaultSave(),42,{pressure:false});Object.assign(r.world,{enemies:[],tiles:[],chests:[],obstacles:[],terrain:[],drops:[],projectiles:[]});return r;}
function advance(raid,seconds,input={}){for(let i=0;i<Math.ceil(seconds/RULES.fixedStep);i++)raid.update(RULES.fixedStep,input);}
function place(raid,target){raid.player.x=target.x;raid.player.y=target.y;}

test('only equal powers of two merge, with an explicit 2048 cap',()=>{
  assert.equal(canMerge(1,1),true);assert.equal(canMerge(2,2),true);
  for(const pair of [[1,2],[4,2],[3,3],[0,0],[-1,-1],[2048,2048]])assert.equal(canMerge(...pair),false);
});
test('neutral merge raises value, heals eight, and cannot repeat',()=>{
  const r=emptyRaid();r.player.hp=80;r.world.tiles=[{...r.player,value:1,dead:false}];
  r.update(RULES.fixedStep,{});assert.equal(r.player.value,2);assert.equal(r.player.hp,88);assert.equal(r.merges,1);
  r.update(RULES.fixedStep,{});assert.equal(r.player.value,2);
});
test('unequal tiles and living equal enemies cannot auto-merge',()=>{
  const r=emptyRaid();r.world.tiles=[{...r.player,value:2,dead:false}];
  r.world.enemies=[createEnemy('same',r.player.x,r.player.y,1)];
  r.update(RULES.fixedStep,{});assert.equal(r.player.value,1);assert.equal(r.world.tiles[0].dead,false);assert.equal(r.world.enemies[0].dead,false);
});
test('small numbers deal positive damage to larger enemies; division improves it',()=>{
  assert.equal(attackDamage(1,1),25);assert.equal(attackDamage(1,8),6.25);assert.equal(attackDamage(1,2),25);
  assert.ok(attackDamage(4,4)>attackDamage(4,16));
});
test('division consumes one charge, preserves health ratio, interrupts and stuns',()=>{
  const r=emptyRaid(),e=createEnemy('e',r.player.x+100,r.player.y,8);r.world.enemies=[e];e.hp=e.maxHp/2;e.state='windup';
  r.divide();assert.equal(e.value,4);assert.equal(e.hp/e.maxHp,.5);assert.equal(e.stun,RULES.divideStun);assert.equal(e.state,'idle');assert.equal(r.player.dividers,1);
});
test('invalid division does not consume charges, including value one and occlusion',()=>{
  const r=emptyRaid();r.divide();assert.equal(r.player.dividers,2);
  const e=createEnemy('one',r.player.x+100,r.player.y,1);r.world.enemies=[e];r.divide();assert.equal(r.player.dividers,2);
  e.value=8;r.world.obstacles=[{x:r.player.x+50,y:r.player.y-100,w:15,h:200}];r.divide();assert.equal(e.value,8);assert.equal(r.player.dividers,2);
});
test('attacks respect walls and cooldown, and enemy kills produce pickups',()=>{
  const r=emptyRaid(),e=createEnemy('victim',r.player.x+70,r.player.y,1);r.world.enemies=[e];r.switchWeapon(1);
  r.world.obstacles=[{x:r.player.x+35,y:r.player.y-40,w:10,h:80}];r.attack();assert.equal(e.hp,e.maxHp);
  r.world.obstacles=[];r.player.attackCooldown=0;r.attack();const remaining=e.hp;r.attack();assert.equal(e.hp,remaining);
  for(let i=0;i<3;i++){r.player.attackCooldown=0;r.attack();}assert.equal(e.dead,true);assert.equal(r.world.tiles[0].value,1);assert.equal(r.world.drops.filter(item=>item.kind==='loot').length,1);
});
test('dash collision substeps stop at thin obstacles and world bounds',()=>{
  const entity={x:100,y:100,radius:19};moveEntity(entity,600,0,[{x:200,y:50,w:10,h:100}]);assert.ok(entity.x<=181);
  moveEntity(entity,-1000,0,[]);assert.equal(entity.x,19);
  moveEntity(entity,0,WORLD.height*2,[]);assert.equal(entity.y,WORLD.height-19);
});
test('diagonal movement has the same total speed as straight movement',()=>{
  const a=emptyRaid(),b=emptyRaid(),origin={...a.player};advance(a,1,{x:1});advance(b,1,{x:1,y:1});
  assert.ok(Math.abs(distance(a.player,origin)-distance(b.player,origin))<.001);
});
test('damage interrupts extraction and respects dash immunity',()=>{
  const r=emptyRaid();r.extractProgress=2;r.hurt(20);assert.equal(r.extractProgress,0);assert.equal(r.player.hp,80);
  r.player.invulnerable=0;r.player.dashTime=.1;r.hurt(40);assert.equal(r.player.hp,80);
});
test('chest grants fixed loot once; full bags cannot consume a chest',()=>{
  const r=emptyRaid(),c={id:'box',...r.player,zone:0,value:24,opened:false,dividers:1,medkits:1};r.world.chests=[c];
  advance(r,.8,{interact:true});assert.equal(c.opened,true);assert.equal(r.bag.length,1);assert.equal(r.bag[0].value,24);assert.equal(r.player.dividers,3);
  advance(r,1,{interact:true});assert.equal(r.bag.length,1);
  c.opened=false;r.capacity=1;advance(r,1,{interact:true});assert.equal(c.opened,false);assert.equal(r.bag.length,1);
});
test('extraction needs four continuous stationary seconds; release resets it',()=>{
  const r=emptyRaid();r.elapsed=r.difficulty.extractAt;place(r,r.world.exits[0]);advance(r,2,{interact:true});assert.equal(r.result,null);
  r.update(RULES.fixedStep,{});assert.equal(r.extractProgress,0);
  advance(r,2,{interact:true});r.update(RULES.fixedStep,{interact:true,x:1});assert.equal(r.extractProgress,0);
  advance(r,4.1,{interact:true});assert.equal(r.result.success,true);
});
test('a full tutorial loot-extract cycle banks 24 once and carries upgrades next raid',()=>{
  const save=defaultSave(),r=new Raid(save,99,{pressure:false});r.world.enemies=[];
  for(const id of ['tutorial-0','tutorial-1','tutorial-2']){place(r,r.world.tiles.find(t=>t.id===id));r.update(RULES.fixedStep,{});}
  assert.equal(r.player.value,8);
  place(r,r.world.chests.find(c=>c.id==='starter-chest'));advance(r,1,{interact:true});r.elapsed=r.difficulty.extractAt;place(r,r.world.exits[0]);advance(r,4.1,{interact:true});
  assert.equal(r.result.value,24);assert.equal(settleRun(save,r.result),true);assert.equal(save.credits,24);assert.equal(settleRun(save,r.result),false);assert.equal(save.credits,24);
  save.credits=200;assert.equal(buyUpgrade(save,'capacity'),true);assert.equal(save.credits,120);
  const next=new Raid(save,100);assert.equal(next.capacity,10);assert.equal(next.player.value,1);assert.equal(next.bag.length,0);
});
test('lethal damage and deadline lose raid loot without consuming existing bank',()=>{
  const save=defaultSave();save.credits=60;const r=emptyRaid();r.bag=[{name:'data',value:90,zone:0}];r.hurt(100);settleRun(save,r.result);
  assert.equal(r.result.success,false);assert.equal(r.result.value,90);assert.equal(save.credits,60);assert.equal(save.deaths,1);
  const timeout=emptyRaid();timeout.elapsed=timeout.duration-.01;place(timeout,timeout.world.exits[0]);timeout.extractProgress=3.999;
  timeout.update(RULES.fixedStep,{interact:true});assert.equal(timeout.result.success,false);assert.match(timeout.result.reason,/超时/);
});
test('healing at full health does not spend a medkit; damaged health clamps',()=>{
  const r=emptyRaid();r.heal();assert.equal(r.player.medkits,1);r.player.hp=90;r.heal();assert.equal(r.player.hp,100);assert.equal(r.player.medkits,0);
});
test('save roundtrip, corruption, denied storage and upgrade limits are safe',()=>{
  let raw=null;const storage={getItem:()=>raw,setItem:(_,value)=>{raw=value;}};
  const save=defaultSave();save.credits=123;assert.equal(writeSave(storage,save),true);assert.equal(readSave(storage).save.credits,123);
  raw='{bad';assert.equal(readSave(storage).save.credits,0);
  const invalid=normalizeSave({version:1,credits:-99,extractions:Infinity,upgrades:{capacity:99,divider:'oops'},lastRuns:[null,{}]});
  assert.equal(invalid.credits,0);assert.equal(invalid.upgrades.capacity,3);assert.equal(invalid.upgrades.divider,0);
  assert.equal(writeSave(null,save),false);assert.equal(readSave(null).available,false);
  save.credits=1;assert.equal(buyUpgrade(save,'capacity'),false);assert.equal(buyUpgrade(save,'unknown'),false);
  save.credits=9999;save.upgrades.capacity=3;assert.equal(buyUpgrade(save,'capacity'),false);
});
test('line-of-sight geometry handles parallel, diagonal and clear paths',()=>{
  const wall=[{x:50,y:50,w:30,h:50}];assert.equal(lineOfSight({x:0,y:75},{x:100,y:75},wall),false);
  assert.equal(lineOfSight({x:0,y:0},{x:100,y:100},wall),false);assert.equal(lineOfSight({x:0,y:40},{x:100,y:40},wall),true);
});
test('100 seeded maps have safe spawns, unblocked tutorial objects and exits',()=>{
  for(let seed=0;seed<100;seed++){
    const w=generateWorld(seed);assert.ok(isFree(WORLD.spawn.x,WORLD.spawn.y,22,w.obstacles));
    for(const object of [...w.tiles,...w.chests,...w.enemies])assert.ok(isFree(object.x,object.y,22,w.obstacles),`seed ${seed} object ${object.id}`);
    for(const exit of w.exits)assert.ok(isFree(exit.x,exit.y,exit.radius,w.obstacles));
    assert.ok(lineOfSight(WORLD.spawn,w.exits[0],w.obstacles,22));
    for(const x of [405,520,655])assert.ok(isFree(x,1060,22,w.obstacles));
  }
});
test('both exits remain reachable in 25 random maps using an 80px navigation grid',()=>{
  const cell=80,cols=WORLD.width/cell,rows=WORLD.height/cell;
  for(let seed=0;seed<25;seed++){
    const world=generateWorld(seed),sx=Math.floor(WORLD.spawn.x/cell),sy=Math.floor(WORLD.spawn.y/cell),queue=[[sx,sy]],seen=new Set([`${sx},${sy}`]);
    for(let head=0;head<queue.length;head++){
      const [x,y]=queue[head];
      for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){
        const key=`${nx},${ny}`;
        if(nx<0||ny<0||nx>=cols||ny>=rows||seen.has(key))continue;
        const a={x:x*cell+20,y:y*cell+20},b={x:nx*cell+20,y:ny*cell+20};
        if(isFree(b.x,b.y,22,obstaclesFor(world,b,b,22),world.bounds)&&lineOfSight(a,b,obstaclesFor(world,a,b,22),22)){seen.add(key);queue.push([nx,ny]);}
      }
    }
    for(const exit of world.exits)assert.ok(seen.has(`${Math.floor(exit.x/cell)},${Math.floor(exit.y/cell)}`),`unreachable ${exit.id} seed ${seed}`);
  }
});
