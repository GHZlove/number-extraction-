import test from 'node:test';
import assert from 'node:assert/strict';
import { Raid } from './helpers/classic-raid.js';
import { defaultSave } from '../dist/src/storage.js';
import { createEnemy,generateWorld } from '../dist/src/world.js';
import { DIFFICULTIES,ENEMY_TYPES,PRESSURE,RULES } from '../dist/src/config.js';
import { pressureProfile } from '../dist/src/pressure.js';
import { NavigationField } from '../dist/src/navigation.js';
import { SpatialGrid,obstaclesFor } from '../dist/src/spatial.js';
import { distance,isFree } from '../dist/src/math.js';
const step=RULES.fixedStep;
function empty({difficulty='scout',pressure=true}={}){
  const r=new Raid(defaultSave(),41,{difficulty,pressure});
  Object.assign(r.world,{enemies:[],tiles:[],chests:[],nodes:[],drops:[],obstacles:[],terrain:[],spawnWarnings:[],projectiles:[],effects:[]});return r;
}
function advance(r,seconds,input={}){for(let i=0;i<Math.ceil(seconds/step);i++)r.update(step,input);}
function monster(r,x=200,type='hunter',id='target'){
  const e=createEnemy(id,r.player.x+x,r.player.y,1,type);e.cooldown=999;r.world.enemies.push(e);return e;
}

test('compact arenas retain dimensions with guards concentrated at resource sites',()=>{
  assert.deepEqual(DIFFICULTIES.map(d=>[d.width,d.height]),[[6400,4000],[7680,4800],[8960,5600],[10240,6400],[12800,8000]]);
  let totalNear=0;
  for(let seed=0;seed<10;seed++){
    const w=generateWorld(seed);totalNear+=w.enemies.filter(e=>distance(e,w.spawn)<1200).length;
    assert.ok(w.enemies.length>=90);assert.ok(w.sites.length>=12);
  }
  assert.ok(totalNear/10>=4&&totalNear/10<12);
});

test('time and difficulty increase wave size, movement pressure and attack cadence within caps',()=>{
  for(const d of DIFFICULTIES){
    const early=pressureProfile(d,0),late=pressureProfile(d,200),surge=pressureProfile(d,200,true);
    assert.ok(late.batch>early.batch);assert.ok(late.interval<early.interval);assert.ok(late.speed>early.speed);assert.ok(late.cooldown<early.cooldown);assert.ok(surge.speed>late.speed);
    assert.ok(late.nearCap<=240);assert.ok(late.windup>=.78);
  }
  assert.ok(pressureProfile(DIFFICULTIES[4],0).batch>pressureProfile(DIFFICULTIES[0],0).batch);
});

test('waves give a preparation window and visible spawn warnings before materializing',()=>{
  const r=empty();advance(r,PRESSURE.graceSeconds-.1);assert.equal(r.world.enemies.length,0);assert.equal(r.world.spawnWarnings.length,0);
  advance(r,.2);assert.ok(r.world.spawnWarnings.length>0);assert.equal(r.world.enemies.length,0);
  for(const mark of r.world.spawnWarnings){assert.ok(distance(mark,r.player)>=PRESSURE.spawnMin);assert.ok(isFree(mark.x,mark.y,30,r.world.obstacles,r.world.bounds));}
  advance(r,1);assert.ok(r.world.enemies.length>=1&&r.world.enemies.length<=2);assert.equal(r.director.wave,1);assert.ok(r.world.enemies.every(e=>e.horde));
});

test('walking onto a warned location cancels that spawn rather than creating an enemy on the player',()=>{
  const r=empty();r.elapsed=6;r.director.update(r,.1);const mark=r.world.spawnWarnings[0];
  r.world.spawnWarnings=[mark];r.player.x=mark.x;r.player.y=mark.y;r.elapsed=mark.readyAt+.01;r.director.update(r,.1);assert.equal(r.world.enemies.length,0);
});

test('warning placement and materialization both respect walls and the current map bounds',()=>{
  const r=empty();r.world.obstacles=[{x:800,y:0,w:120,h:4000},{x:0,y:1500,w:6400,h:90}];r.elapsed=6;r.director.update(r,.1);
  for(const mark of r.world.spawnWarnings)assert.ok(isFree(mark.x,mark.y,34,r.world.obstacles,r.world.bounds));
  const mark=r.world.spawnWarnings[0];assert.ok(mark);r.world.spawnWarnings=[mark];r.world.obstacles.push({x:mark.x-40,y:mark.y-40,w:80,h:80});
  r.elapsed=mark.readyAt+.01;r.director.update(r,.1);assert.equal(r.world.enemies.length,0);
});

test('nearby population and pending warnings obey the stage cap during long director runs',()=>{
  const r=empty({difficulty:'nightmare'});
  for(let i=0;i<900;i++){
    r.elapsed=i*.5;r.director.update(r,.5);
    const nearby=r.world.enemies.filter(e=>!e.dead&&distance(e,r.player)<1500).length;
    assert.ok(nearby<=r.director.profile(r.elapsed).nearCap);assert.ok(nearby+r.world.spawnWarnings.length<=r.director.profile(r.elapsed).nearCap);
  }
  assert.ok(r.director.spawned>=8&&r.director.spawned<=10);assert.ok(r.world.enemies.length<=10);
});

test('reinforcement surges are limited to occupied resource sites and expire',()=>{
  const r=empty(),site={x:r.player.x,y:r.player.y};r.world.sites=[site];const e=monster(r,300);e.guard=true;
  r.elapsed=60;r.director.update(r,.1);
  assert.equal(r.director.lastSurge,1);assert.ok(r.events.some(e=>e.type==='message'&&e.text.includes('据点呼叫增援')));
  assert.ok(r.director.profile(60).speed>pressureProfile(r.difficulty,60).speed);
  assert.equal(r.director.profile(69).speed,pressureProfile(r.difficulty,69).speed);
  const wilderness=empty();wilderness.world.sites=[];wilderness.elapsed=60;wilderness.director.update(wilderness,.1);assert.equal(wilderness.director.lastSurge,0);
});

test('wave composition starts with pursuers and adds ranged, support and elite enemies later',()=>{
  const r=empty(),early=new Set(),late=new Set();
  for(let i=0;i<500;i++){early.add(r.director.enemyType(0));late.add(r.director.enemyType(120));}
  assert.deepEqual([...early].sort(),['charger','hunter','scout']);
  for(const type of ['medic','summoner','sniper','orbiter','brute','skirmisher'])assert.ok(late.has(type));
});

test('extraction stays locked until the selected survival deadline and still needs four seconds',()=>{
  const r=empty({pressure:false});Object.assign(r.player,r.world.exits[0]);
  advance(r,2,{interact:true});assert.equal(r.context().locked,true);assert.equal(r.extractProgress,0);assert.equal(r.result,null);
  r.elapsed=r.difficulty.extractAt-.01;r.update(.02,{interact:true});assert.equal(r.context().locked,false);assert.ok(r.extractProgress<.03);
  advance(r,4.1,{interact:true});assert.equal(r.result.success,true);
});

test('faster attack profiles produce more actual shots while retaining readable windups',()=>{
  function count(late){
    const r=empty(),e=monster(r,200,'sentry');e.cooldown=0;r.pressureState=r.director.profile(late?200:0);
    for(let i=0;i<30/step;i++)r.updateEnemy(e,step);
    return r.world.projectiles.length;
  }
  assert.ok(count(false)>=14);assert.ok(count(true)>count(false));
  const r=empty({difficulty:'nightmare'}),e=monster(r,70,'scout');e.cooldown=0;r.pressureState=r.director.profile(200);r.updateEnemy(e,step);assert.ok(e.timer>=.28);
});

test('a horde hunter pursues beyond the former detection radius and around a blocking wall',()=>{
  const r=empty({pressure:false}),e=monster(r,500);e.horde=true;e.aggro=8;
  r.world.obstacles=[{x:r.player.x+200,y:r.player.y-180,w:32,h:360}];
  for(let i=0;i<12/step;i++){
    r.navigation.update(r.player,step);r.updateEnemy(e,step);
    assert.ok(isFree(e.x,e.y,e.radius,r.world.obstacles,r.world.bounds));
  }
  assert.ok(e.x<r.player.x+175);assert.ok(distance(e,r.player)<180);
});

test('navigation invalidates cached geometry when obstacles are replaced',()=>{
  const r=empty({pressure:false}),nav=new NavigationField(r.world),e=monster(r,500);
  nav.update(r.player,.1);assert.ok(nav.direction(e));
  r.world.obstacles=[{x:0,y:0,w:6400,h:4000}];nav.update(r.player,.5);assert.equal(nav.direction(e),null);
});

test('crowd steering separates coincident pursuers rather than leaving one overlapping stack',()=>{
  const r=empty({pressure:false}),enemies=Array.from({length:5},(_,i)=>monster(r,400,'hunter',`crowd-${i}`));enemies.forEach(e=>{e.horde=true;});
  for(let tick=0;tick<45;tick++){
    r.crowdGrid=new SpatialGrid(r.world.enemies,96);for(const e of enemies)r.updateEnemy(e,step);
  }
  assert.ok(new Set(enemies.map(e=>`${e.x.toFixed(1)},${e.y.toFixed(1)}`)).size===5);
  assert.ok(distance(enemies[0],enemies[4])>15);
});

test('horde kills charge Overload but use lighter loot drops than fixed guards',()=>{
  const r=empty();r.random=()=>.5;const h=monster(r);h.horde=true;r.player.energy=98;r.kill(h);
  assert.equal(r.player.energy,100);assert.equal(r.hordeKills,1);assert.equal(r.world.drops.length,0);assert.equal(r.world.tiles.length,1);
  const guard=monster(r,240,'hunter','guard');r.kill(guard);assert.equal(r.world.drops.filter(d=>d.kind==='loot').length,1);
});

test('cleanup retires corpses and distant horde enemies while preserving fixed guards and uncollected loot',()=>{
  const r=empty(),dead=monster(r),far=monster(r,3000,'hunter','far'),guard=monster(r,3000,'hunter','guard');dead.dead=true;far.horde=true;
  r.world.drops=[{id:'kept',dead:false},{id:'collected',dead:true}];r.elapsed=5;r.director.update(r,4.1);
  assert.ok(!r.world.enemies.includes(dead));assert.ok(!r.world.enemies.includes(far));assert.ok(r.world.enemies.includes(guard));assert.deepEqual(r.world.drops.map(d=>d.id),['kept']);
});

test('ended raids cannot create more warnings or enemies',()=>{
  const r=empty();r.finish(false,'test');r.elapsed=120;r.director.update(r,10);assert.equal(r.world.enemies.length,0);assert.equal(r.world.spawnWarnings.length,0);
});
