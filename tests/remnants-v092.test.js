import test from 'node:test';
import assert from 'node:assert/strict';
import { Raid } from '../dist/src/game.js';
import { RULES } from '../dist/src/config.js';
import { createEnemy, createLoot } from '../dist/src/world.js';
import { defaultSave, settleRun } from '../dist/src/storage.js';
import { makeEquipment, isEquipment } from '../dist/src/equipment.js';
import { salvageMaterials } from '../dist/src/shelter.js';
import { buyFromMerchant, tradeValue } from '../dist/src/commerce.js';
import { UI } from '../dist/src/ui.js';
import { Renderer } from '../dist/src/renderer.js';
import { browserStubs } from './helpers/browser-stubs.js';

function empty(){
  const r=new Raid(defaultSave(),38,{pressure:false,layout:'tangram'});
  Object.assign(r.world,{enemies:[],obstacles:[],terrain:[],tiles:[],chests:[],nodes:[],drops:[],projectiles:[],effects:[],hazards:[],sites:[]});
  r.random=()=>.5;return r;
}
function tick(r,steps=1){for(let i=0;i<steps;i++)r.update(RULES.fixedStep,{});}
function remnant(r,value=16,dx=0){
  const e=createEnemy('fallen-'+r.kills,r.player.x+dx,r.player.y,value);r.world.enemies.push(e);r.kill(e);r.world.drops=[];return r.world.tiles.at(-1);
}
function fillGear(r,count=r.capacity){r.bag=Array.from({length:count},(_,i)=>makeEquipment('armor','','white','held-'+i));}
function coins(value=12){return {id:'coins',kind:'loot',name:'残骸金币',value,currencyOnly:true};}

test('kills create tier-priced remnants once without duplicating rewards',()=>{
  const r=empty();
  for(const [value,price]of[[1,4],[2,6],[16,12],[64,16],[512,22]]){
    const tile=remnant(r,value,200);assert.equal(tile.remnant,true);assert.equal(tile.coins,price);
    const count=r.world.tiles.length;r.kill(r.world.enemies.at(-1));assert.equal(r.world.tiles.length,count);
  }
});

test('lower remnants become carried coins with a full equipment bag and never pay twice',()=>{
  const r=empty();r.player.value=512;fillGear(r);const tile=remnant(r,64);r.player.energy=0;
  tick(r);assert.equal(tile.dead,true);assert.equal(r.equipmentCount(),r.capacity);assert.equal(tradeValue(r),16);
  assert.equal(r.player.value,512);assert.equal(r.player.energy,0);assert.equal(r.merges,0);assert.equal(r.recycled,1);
  tick(r,120);assert.equal(tradeValue(r),16);assert.equal(r.recycledValue,16);
  assert.deepEqual(salvageMaterials(r.bag.filter(i=>i.currencyOnly)),{alloy:0,core:0});
});

test('equal remnants merge before any recycling and retain growth rewards',()=>{
  const r=empty();r.player.value=16;const tile=remnant(r,16);r.player.energy=0;tick(r);
  assert.equal(tile.dead,true);assert.equal(r.player.value,32);assert.equal(r.merges,1);assert.equal(r.recycled,0);assert.equal(tradeValue(r),0);assert.ok(r.player.energy>=25);
});

test('higher remnants remain available and can be recycled after the player grows',()=>{
  const r=empty();r.player.value=4;const tile=remnant(r,16);tick(r);assert.equal(tile.dead,false);assert.equal(tradeValue(r),0);
  r.player.value=32;tick(r);assert.equal(tile.dead,true);assert.equal(tradeValue(r),12);
});

test('ordinary lower neutral tiles are preserved instead of minted into money',()=>{
  const r=empty();r.player.value=64;r.world.tiles=[{id:'neutral',x:r.player.x,y:r.player.y,value:16,dead:false}];
  tick(r);assert.equal(r.world.tiles[0].dead,false);assert.equal(tradeValue(r),0);assert.equal(r.recycled,0);
});

test('at the merge cap equal remnants recycle while equal neutral tiles stay intact',()=>{
  const r=empty();r.player.value=2048;const tile=remnant(r,2048);const neutral={id:'cap-neutral',x:r.player.x,y:r.player.y,value:2048,dead:false};r.world.tiles.push(neutral);
  tick(r);assert.equal(tile.dead,true);assert.equal(neutral.dead,false);assert.equal(r.player.value,2048);assert.equal(tradeValue(r),26);
});

test('recycling respects range and cover, including the collection node buff',()=>{
  const r=empty();r.player.value=64;const tile=remnant(r,16,80);tick(r);assert.equal(tile.dead,false);
  r.player.buffs.magnet=10;r.world.obstacles=[{x:r.player.x+30,y:r.player.y-50,w:10,h:100}];tick(r);assert.equal(tile.dead,false);
  r.world.obstacles=[];tick(r);assert.equal(tile.dead,true);assert.equal(tradeValue(r),12);
  const far=remnant(r,16,230);tick(r);assert.equal(far.dead,false);
});

test('a real damage kill can be collected as loot and remnant coins through updates',()=>{
  const r=empty();r.player.value=64;const e=createEnemy('combat',r.player.x+35,r.player.y,16);r.world.enemies.push(e);
  r.damageEnemy(e,100,{weapon:'pistol',value:64});tick(r,20);
  assert.equal(e.dead,true);assert.equal(r.kills,1);assert.equal(r.recycled,1);assert.equal(r.bag.filter(i=>i.currencyOnly).length,1);
  assert.ok(r.bag.some(i=>!i.currencyOnly&&i.kind==='loot'));assert.equal(r.equipmentCount(),0);
});

test('large amounts of fragments and coins auto-collect without equipment space',()=>{
  const r=empty();r.capacity=1;fillGear(r);
  r.world.drops=Array.from({length:500},(_,i)=>createLoot(r.player.x,r.player.y,i%3,16,'resource-'+i));
  r.world.drops.push({...coins(100),x:r.player.x,y:r.player.y,dead:false});tick(r);
  assert.ok(r.world.drops.every(i=>i.dead));assert.equal(r.equipmentCount(),1);assert.equal(tradeValue(r),8100);
  assert.equal(r.bag.length,502);
});

test('resources never block gear pickups but the equipment limit still preserves ground items',()=>{
  const r=empty();r.capacity=1;r.bag=Array.from({length:30},(_,i)=>createLoot(0,0,0,16,'data-'+i));
  const gun={...makeEquipment('weapon','rifle','green','gun'),x:r.player.x,y:r.player.y,dead:false};r.world.drops=[gun];
  assert.equal(r.pickupGear(),true);assert.equal(r.equipmentCount(),1);
  const second={...makeEquipment('armor','','white','second'),x:r.player.x,y:r.player.y,dead:false};r.world.drops.push(second);
  assert.equal(r.pickupGear(),false);assert.equal(second.dead,false);
  const index=r.bag.findIndex(i=>i.id==='gun');assert.equal(r.dropItem(index),true);assert.equal(r.equipmentCount(),0);
  assert.equal(r.pickupGear(),true);assert.equal(r.equipmentCount(),1);assert.equal(tradeValue(r),480);
});

test('unequipping and swapping count only equipment even with many resource records',()=>{
  const r=empty();r.capacity=1;r.bag=Array.from({length:30},(_,i)=>createLoot(0,0,0,16,'data-'+i));
  r.player.laser=makeEquipment('laser','','white','equipped-scope');assert.equal(r.removeEquipment('laser'),true);assert.equal(r.equipmentCount(),1);
  r.player.armor=makeEquipment('armor');assert.equal(r.removeEquipment('armor'),false);
  const index=r.bag.findIndex(isEquipment);assert.equal(r.equip(index),true);assert.equal(r.equipmentCount(),0);assert.equal(r.player.laser.id,'equipped-scope');
  assert.equal(tradeValue(r),480);
});

test('full equipment bags can search an armory and keep uncollected weapons on the ground',()=>{
  const r=empty();r.capacity=1;fillGear(r);const gear=makeEquipment('weapon','rocket','yellow','chest-gun');
  const chest={id:'armory',x:r.player.x,y:r.player.y,zone:0,value:24,opened:false,dividers:1,medkits:1,gear:[gear]};r.world.chests=[chest];
  for(let i=0;i<60;i++)r.update(RULES.fixedStep,{interact:true});
  assert.equal(chest.opened,true);assert.equal(tradeValue(r),24);assert.equal(r.player.dividers,3);assert.equal(r.player.medkits,2);
  assert.equal(r.equipmentCount(),1);assert.equal(r.pickupGear(),false);assert.ok(r.world.drops.some(i=>i.id==='chest-gun'&&!i.dead));
  tick(r,60);assert.equal(tradeValue(r),24);
});

test('merchant equipment uses only gear slots and rejected sales never debit funds or stock',()=>{
  const r=empty(),merchant=r.world.merchants[0];Object.assign(r.player,{x:merchant.x,y:merchant.y});r.capacity=1;
  r.bag=Array.from({length:20},(_,i)=>createLoot(0,0,0,16,'money-'+i));assert.equal(buyFromMerchant(r,merchant.id,'laser'),true);assert.equal(r.equipmentCount(),1);
  const before=JSON.stringify({bag:r.bag,stock:merchant.stock});assert.equal(buyFromMerchant(r,merchant.id,'revolver'),false);assert.equal(JSON.stringify({bag:r.bag,stock:merchant.stock}),before);
  assert.equal(buyFromMerchant(r,merchant.id,'medkit'),true);
});

test('merchants spend corpse coins first and preserve material-rich fragments when possible',()=>{
  const r=empty(),merchant=r.world.merchants[0];Object.assign(r.player,{x:merchant.x,y:merchant.y});
  const fragment=createLoot(0,0,2,100,'core');r.bag=[fragment,coins(40)];assert.equal(buyFromMerchant(r,merchant.id,'medkit'),true);
  assert.equal(fragment.value,100);assert.equal(r.bag.find(i=>i.currencyOnly).value,16);assert.equal(tradeValue(r),116);
  assert.deepEqual(salvageMaterials(r.bag),salvageMaterials([fragment]));
});

test('coin rewards settle once with difficulty yield and do not generate extra alloy or cores',()=>{
  const r=empty();r.player.value=32;remnant(r,16);tick(r);r.addLoot(createLoot(0,0,0,32,'fragment'));r.rewardMultiplier=1.6;r.finish(true,'extract');
  assert.equal(r.result.rawValue,44);assert.equal(r.result.value,70);assert.deepEqual(r.result.materials,{alloy:3,core:0});
  const save=defaultSave();assert.equal(settleRun(save,r.result),true);assert.equal(save.credits,70);assert.equal(save.materials.alloy,3);assert.equal(settleRun(save,r.result),false);assert.equal(save.credits,70);
});

test('death and timeout lose carried corpse coins while preserving shelter assets',()=>{
  for(const timeout of [false,true]){
    const r=empty();r.player.value=32;remnant(r,16);tick(r);const save=defaultSave();save.credits=123;save.materials={alloy:7,core:2};
    if(timeout){r.elapsed=r.duration;tick(r);}else r.hurt(100,'test');
    assert.equal(r.result.success,false);assert.equal(settleRun(save,r.result),true);assert.equal(save.credits,123);assert.deepEqual(save.materials,{alloy:7,core:2});
    const before=r.bag.length;assert.equal(r.addLoot(coins()),false);assert.equal(r.bag.length,before);
  }
});

test('inventory groups unlimited resources, shows gear-only counts and retains real equipment indices',t=>{
  const env=browserStubs(t),r=empty(),ui=new UI(new Proxy({},{get:()=>()=>{}}));
  r.bag=Array.from({length:500},(_,i)=>createLoot(0,0,i%3,16,'fragment-'+i));r.bag.splice(6,0,makeEquipment('weapon','revolver','yellow','shown-gun'));r.bag.push(coins(16));
  ui.inventory(r);ui.update(r,defaultSave(),true,true);const html=env.ids.get('dialog').innerHTML;
  assert.match(html,/资源袋 · 不限量/);assert.match(html,/装备背包 1 \/ 8/);assert.match(html,/data-action="equip0" data-key="6"/);
  assert.equal((html.match(/class="resource-stack"/g)||[]).length,4);assert.equal((html.match(/class="inventory-item"/g)||[]).length,1);assert.equal(env.ids.get('bag-count').textContent,'1 / 8');
  assert.equal(r.equip(6,0),true);assert.equal(r.player.weapons[0].id,'shown-gun');assert.equal(tradeValue(r),8016);
});

test('recyclable remnants render gold feedback and all remnant states keep finite coordinates',t=>{
  const env=browserStubs(t),r=empty(),renderer=new Renderer(env.canvas,env.ids.get('minimap'));r.player.value=64;
  remnant(r,16,90);remnant(r,64,140);remnant(r,128,180);renderer.camera={...r.player};renderer.draw(r,1,RULES.fixedStep);
  assert.ok(env.drawCalls.some(call=>call.method==='fillText'&&String(call.args[0]).includes('残骸 +12')));
  assert.ok(env.drawCalls.some(call=>call.method==='fillText'&&call.args[0]==='同数合成'));
});
