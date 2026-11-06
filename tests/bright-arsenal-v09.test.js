import test from 'node:test';
import assert from 'node:assert/strict';
import { Raid } from '../dist/src/game.js';
import { defaultSave, readSave, writeSave, normalizeSave } from '../dist/src/storage.js';
import { SAVE_KEY, PREVIOUS_SAVE_KEY, OLDER_SAVE_KEY } from '../dist/src/config.js';
import { ENCHANT_KEYS, ENCHANTS, WEAPONS, makeEquipment, decorateWeapon, randomEquipment } from '../dist/src/equipment.js';
import { createEnemy, generateWorld } from '../dist/src/world.js';
import { empowerBoss } from '../dist/src/bosses.js';
import { updateAfflictions, slowMultiplier } from '../dist/src/enchantments.js';
import { seededRandom, distance, isFree } from '../dist/src/math.js';
import { forgeWeapon, starterLoadout, salvageMaterials } from '../dist/src/shelter.js';
import { buyFromMerchant } from '../dist/src/commerce.js';
import { NUMBER_COLORS, numberColor, drawNumberTile } from '../dist/src/number-tiles.js';
import { Renderer } from '../dist/src/renderer.js';
import { UI } from '../dist/src/ui.js';
import { browserStubs } from './helpers/browser-stubs.js';

function empty(){
  const r=new Raid(defaultSave(),47,{pressure:false});
  Object.assign(r.world,{enemies:[],obstacles:[],terrain:[],tiles:[],chests:[],nodes:[],drops:[],projectiles:[],hazards:[],effects:[]});return r;
}
function enemy(r,dx=120,dy=0,id='target'){
  const e=createEnemy(id,r.player.x+dx,r.player.y+dy,4);e.cooldown=999;r.world.enemies.push(e);return e;
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('catalog contains twenty weapons and twelve real enchantments available to random drops',()=>{
  assert.equal(Object.keys(WEAPONS).length,20);assert.equal(ENCHANT_KEYS.length,12);
  const seen=new Set(),random=seededRandom(831);
  for(let i=0;i<2000;i++){const item=randomEquipment(random,2,'loot-'+i);if(item.enchant&&item.enchant!=='none')seen.add(item.enchant);}
  assert.deepEqual([...seen].sort(),[...ENCHANT_KEYS].sort());
});

test('all twelve enchantments can be forged, issued and survive save validation',()=>{
  for(const enchant of ENCHANT_KEYS){
    const save=defaultSave();save.credits=1000;save.materials={alloy:100,core:10};save.selectedEnchant=enchant;
    assert.ok(forgeWeapon(save));const loadout=starterLoadout(normalizeSave(JSON.parse(JSON.stringify(save))));
    assert.equal(loadout.weapons[0].enchant,enchant);assert.match(loadout.weapons[0].name,new RegExp(ENCHANTS[enchant].name));
  }
});

test('burn refreshes one status without resetting tick cadence or stacking infinitely',()=>{
  const r=empty(),e=enemy(r);r.player.value=4;
  r.damageEnemy(e,1,{enchant:'burn',value:4});updateAfflictions(r,.3);const hp=e.hp;
  r.player.enchantCooldowns.burn=0;r.damageEnemy(e,1,{enchant:'burn',value:4});updateAfflictions(r,.21);
  assert.ok(e.hp<hp-1);assert.deepEqual(Object.keys(e.afflictions),['burn']);
  for(let i=0;i<8;i++)updateAfflictions(r,.5);assert.equal(e.afflictions.burn,undefined);
});

test('afflictions preserve the stronger number snapshot when a weaker hit refreshes them',()=>{
  const r=empty(),e=enemy(r);r.damageEnemy(e,1,{enchant:'burn',value:16});
  r.player.enchantCooldowns.burn=0;r.damageEnemy(e,1,{enchant:'burn',value:1});assert.equal(e.afflictions.burn.value,16);
  r.player.value=1;const hp=e.hp;updateAfflictions(r,.5);near(hp-e.hp,75*.065);
});

test('bleed bypasses armour without consuming or deleting its durability',()=>{
  const r=empty(),e=enemy(r);e.armor=makeEquipment('armor');r.damageEnemy(e,1,{enchant:'bleed',value:4});
  const armor=e.armor.durability,hp=e.hp;updateAfflictions(r,.5);near(hp-e.hp,25*.045);near(e.armor.durability,armor);
  const boss=empowerBoss(enemy(r,200,0,'boss'),'titan',1);boss.armor=makeEquipment('armor');r.player.enchantCooldowns.bleed=0;r.damageEnemy(boss,1,{enchant:'bleed',value:4});
  const before=boss.hp;updateAfflictions(r,.5);near(before-boss.hp,boss.maxHp*.25*.045*.3);
});

test('frost slows, freezes after three applications, respects boss resistance and expires',()=>{
  const r=empty(),e=enemy(r),boss=empowerBoss(enemy(r,220,0,'boss'),'prism',1);
  for(let i=0;i<3;i++){r.player.enchantCooldowns.frost=0;r.damageEnemy(e,1,{enchant:'frost'});}
  near(slowMultiplier(e),.55);assert.ok(e.stun>=.5);assert.equal(e.chillStacks,0);assert.ok(e.freezeCooldown>0);
  r.player.enchantCooldowns.frost=0;r.damageEnemy(boss,1,{enchant:'frost'});near(slowMultiplier(boss),.8);
  for(let i=0;i<7;i++)updateAfflictions(r,.5);assert.equal(slowMultiplier(e),1);assert.equal(e.chillStacks,0);
});

test('frost changes actual pursuit movement and cannot indefinitely freeze a boss',()=>{
  const a=empty(),fast=enemy(a,400);fast.horde=true;const b=empty(),slow=enemy(b,400);slow.horde=true;
  b.damageEnemy(slow,1,{enchant:'frost'});
  for(let i=0;i<30;i++){a.updateEnemy(fast,1/60);b.updateEnemy(slow,1/60);}
  assert.ok(distance(fast,a.player)<distance(slow,b.player));
  const boss=empowerBoss(enemy(b,500,0,'boss'),'titan',1);
  for(let i=0;i<10;i++){b.player.enchantCooldowns.frost=0;b.damageEnemy(boss,1,{enchant:'frost'});}
  assert.ok(boss.stun<=.18);assert.ok(boss.freezeCooldown>0);
});

test('sunder breaks armour once and its vulnerability expires',()=>{
  const r=empty(),e=enemy(r);e.armor=makeEquipment('armor');e.armor.durability=3;
  r.damageEnemy(e,1,{enchant:'sunder'});assert.equal(e.armor.durability,0);assert.equal(r.events.filter(e=>e.type==='armorbreak').length,1);
  const hp=e.hp;r.damageEnemy(e,10);near(hp-e.hp,11.2);
  updateAfflictions(r,3.1);const normal=e.hp;r.damageEnemy(e,10);near(normal-e.hp,10);
});

test('detonation is on-kill, respects cover and does not recursively trigger explosions',()=>{
  const r=empty(),first=enemy(r,100,0,'first'),next=enemy(r,170,0,'next'),covered=enemy(r,240,0,'covered');
  first.hp=1;next.hp=1;r.world.obstacles=[{x:r.player.x+200,y:r.player.y-80,w:20,h:160}];
  r.damageEnemy(first,2,{enchant:'detonate',value:4});assert.ok(first.dead);assert.ok(next.dead);assert.equal(covered.hp,100);
  assert.equal(r.events.filter(e=>e.type==='explosion').length,1);
});

test('critical hits add fifty percent raw damage with bounded rolls and correct boss resistance',()=>{
  const r=empty(),e=enemy(r);r.random=()=>0;
  r.damageEnemy(e,10,{enchant:'critical'});near(e.hp,85);r.damageEnemy(e,10,{enchant:'critical'});near(e.hp,75);
  r.player.enchantCooldowns.critical=0;r.random=()=>.99;r.damageEnemy(e,10,{enchant:'critical'});near(e.hp,65);
  const boss=empowerBoss(enemy(r,300,0,'boss'),'titan',1),hp=boss.hp;r.player.enchantCooldowns.critical=0;r.random=()=>0;
  r.damageEnemy(boss,10,{enchant:'critical'});near(hp-boss.hp,4.5);
});

test('gravity pulls visible targets while respecting walls and boss mass',()=>{
  const r=empty(),center=enemy(r,100,0,'center'),normal=enemy(r,180,50,'normal'),boss=empowerBoss(enemy(r,180,-50,'boss'),'titan',1),covered=enemy(r,260,0,'covered');
  r.world.obstacles=[{x:r.player.x+215,y:r.player.y-30,w:20,h:60}];const n=distance(normal,center),b=distance(boss,center),x=covered.x;
  r.damageEnemy(center,1,{enchant:'gravity'});assert.ok(distance(normal,center)<n);assert.ok(distance(boss,center)<b);
  assert.ok(n-distance(normal,center)>b-distance(boss,center));assert.equal(covered.x,x);
  for(const e of r.world.enemies)assert.ok(isFree(e.x,e.y,e.radius,r.world.obstacles,r.world.bounds));
});

test('energize clamps energy and cannot gain energy from cooldown hits or corpses',()=>{
  const r=empty(),e=enemy(r);r.player.energy=99;r.damageEnemy(e,1,{enchant:'energize',level:3});assert.equal(r.player.energy,100);
  r.player.energy=0;r.damageEnemy(e,1,{enchant:'energize'});assert.equal(r.player.energy,0);
  r.kill(e);r.player.energy=0;r.damageEnemy(e,999,{enchant:'energize'});assert.equal(r.player.energy,0);
});

test('revolver fires a precise heavy round using the unchanged base number ratio',()=>{
  const r=empty(),e=enemy(r,150);r.player.value=4;r.player.weapons[0]=makeEquipment('weapon','revolver');r.attack();r.updateProjectiles(.2);
  near(e.hp,75);assert.ok(e.knockX>200);assert.ok(WEAPONS.revolver.spread<WEAPONS.rifle.spread);
});

test('double barrel emits two four-pellet volleys sharing one attack damage budget',()=>{
  const r=empty(),e=enemy(r,120);e.radius=70;r.player.value=4;r.player.weapons[0]=makeEquipment('weapon','doublebarrel');
  r.attack();assert.equal(r.world.projectiles.length,4);r.updateProjectiles(.2);r.updateBursts(.13);assert.equal(r.world.projectiles.length,4);r.updateProjectiles(.2);near(e.hp,75);assert.equal(r.attack(),false);
});

test('plasma pierces two targets but never hits through a wall',()=>{
  const r=empty(),first=enemy(r,100,0,'first'),second=enemy(r,200,0,'second'),behind=enemy(r,350,0,'behind');
  r.player.value=4;r.player.weapons[0]=makeEquipment('weapon','plasma');r.world.obstacles=[{x:r.player.x+270,y:r.player.y-80,w:20,h:160}];
  r.attack();assert.equal(r.world.projectiles[0].radius,6);r.updateProjectiles(.7);near(first.hp,75);near(second.hp,75);near(behind.hp,100);
});

test('flamethrower applies intrinsic burn even without an enchantment',()=>{
  const r=empty(),e=enemy(r,100);r.player.weapons[0]=makeEquipment('weapon','flamethrower');r.attack();assert.equal(r.world.projectiles.length,3);r.updateProjectiles(.3);
  assert.ok(e.afflictions?.burn);const hp=e.hp;updateAfflictions(r,.5);assert.ok(e.hp<hp);
});

test('rocket splash is larger than grenade splash, blocked by cover and explodes once',()=>{
  const r=empty(),e=enemy(r,150),covered=enemy(r,260,0,'covered');r.player.value=4;r.player.weapons[0]=makeEquipment('weapon','rocket');r.attack();
  const bullet=r.world.projectiles[0];assert.ok(bullet.blast>WEAPONS.grenade.blast);r.world.obstacles=[{x:r.player.x+210,y:r.player.y-100,w:20,h:200}];
  r.explode(bullet,{x:e.x,y:e.y});r.explode(bullet,{x:e.x,y:e.y});assert.ok(e.hp<100);assert.equal(covered.hp,100);assert.equal(r.world.effects.filter(e=>e.kind==='impact').length,1);
});

test('battleaxe has directional reach and intrinsic bleeding, with no rear hit',()=>{
  const r=empty(),front=enemy(r,145,0,'front'),rear=enemy(r,-110,0,'rear');r.player.weapons[0]=makeEquipment('weapon','battleaxe');r.attack();
  assert.ok(front.hp<100);assert.ok(front.afflictions?.bleed);assert.equal(rear.hp,100);
});

test('new trial cache exposes the six weapons and eight additions without allowing free salvage',()=>{
  const w=generateWorld(5),cache=w.chests.find(c=>c.id==='arsenal-cache');assert.ok(cache);assert.equal(cache.gear.length,8);
  for(const key of ['revolver','doublebarrel','plasma','flamethrower','rocket','battleaxe'])assert.ok(cache.gear.some(i=>i.weapon===key));
  assert.equal(new Set(cache.gear.map(i=>i.enchant)).size,8);assert.ok(cache.gear.every(i=>i.starter&&i.value===0));assert.deepEqual(salvageMaterials(cache.gear),{alloy:0,core:0});
});

test('merchants sell the new enchanted weapons with correct capacity and stock checks',()=>{
  const r=empty(),merchant=r.world.merchants[0];Object.assign(r.player,{x:merchant.x,y:merchant.y});r.bag=[{id:'loot',kind:'loot',value:400}];
  assert.ok(buyFromMerchant(r,merchant.id,'revolver'));assert.equal(r.bag.find(i=>i.weapon==='revolver').enchant,'critical');assert.equal(buyFromMerchant(r,merchant.id,'revolver'),false);
  assert.ok(buyFromMerchant(r,merchant.id,'plasma'));assert.equal(r.bag.find(i=>i.weapon==='plasma').enchant,'frost');
});

test('v0.9 migrates v0.7/v0.8 once and keeps new forged types safe from older writes',()=>{
  const old={...defaultSave(),credits:400},data=new Map([[PREVIOUS_SAVE_KEY,JSON.stringify(old)],[OLDER_SAVE_KEY,JSON.stringify({...old,credits:900})]]),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  const loaded=readSave(storage);assert.ok(loaded.migrated);assert.equal(loaded.save.credits,400);loaded.save.forged.plasma={level:2,rarity:'yellow',enchant:'frost'};writeSave(storage,loaded.save);
  data.set(PREVIOUS_SAVE_KEY,JSON.stringify({...old,credits:1}));assert.equal(readSave(storage).save.credits,400);assert.equal(readSave(storage).save.forged.plasma.enchant,'frost');assert.notEqual(SAVE_KEY,PREVIOUS_SAVE_KEY);
  data.delete(SAVE_KEY);data.delete(PREVIOUS_SAVE_KEY);assert.equal(readSave(storage).save.credits,900);
});

test('reference tile palette provides twelve distinct faces and finite raised-tile drawing',t=>{
  const env=browserStubs(t),values=[2,4,8,16,32,64,128,256,512,1024,2048,4096];assert.equal(new Set(values.map(numberColor)).size,12);
  for(const [index,value]of values.entries()){
    assert.match(NUMBER_COLORS[value],/^#[a-f0-9]{6}$/);drawNumberTile(env.canvas.getContext('2d'),{x:50+index*50,y:100,size:40,value});
  }
  assert.equal(env.drawCalls.filter(c=>c.method==='fillText').length,12);
});

test('bright shelter preview and all new gun/status/effect render paths remain usable',t=>{
  const env=browserStubs(t),ui=new UI(new Proxy({},{get:()=>()=>{}})),save=defaultSave();ui.shelter(save,{});
  assert.equal((env.ids.get('shelter-screen').innerHTML.match(/class="preview-number"/g)||[]).length,12);
  const r=empty(),e=enemy(r);e.slowTime=2;e.sundered=2;e.afflictions={burn:{life:2},bleed:{life:2}};r.effect(e.x,e.y,'','#aa83ff','gravity',.45,{radius:180});
  const renderer=new Renderer(env.canvas,env.ids.get('minimap'));
  for(const type of ['revolver','doublebarrel','plasma','flamethrower','rocket','battleaxe']){r.player.weapons[0]=decorateWeapon(makeEquipment('weapon',type),'burn');renderer.draw(r,1,1/60);}
});
