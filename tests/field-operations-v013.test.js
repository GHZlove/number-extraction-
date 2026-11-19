import test from 'node:test';
import assert from 'node:assert/strict';
import { Raid } from '../dist/src/game.js';
import { defaultSave } from '../dist/src/storage.js';
import { createEnemy } from '../dist/src/world.js';
import { addPrototype, decorateWeapon, makeEquipment, weaponOf } from '../dist/src/equipment.js';
import { gearRecord, hydrateEquipment } from '../dist/src/warehouse.js';
import { actualNumber, gainEnergy, isLocked, numberShock, tickNumberPowers, useOperator } from '../dist/src/operations.js';
import { FieldEvents } from '../dist/src/field-events.js';
import { barterWeapon } from '../dist/src/commerce.js';
import { useNumberSkill } from '../dist/src/number-skills.js';
import { browserStubs } from './helpers/browser-stubs.js';

function empty(options={}) {
  const raid=new Raid(defaultSave(),312,{layout:'tangram',pressure:false,fieldSystems:false,...options});
  Object.assign(raid.world,{exits:[],obstacles:[],terrain:[],chests:[],tiles:[],drops:[],nodes:[],merchants:[],
    hazards:[],enemies:[],projectiles:[],effects:[]});
  return raid;
}
function enemy(raid,id='target',dx=120,value=8) {
  const e=createEnemy(id,raid.player.x+dx,raid.player.y,value,'hunter');
  e.hp=e.maxHp=200;raid.world.enemies.push(e);return e;
}
const gear=(name,enchant)=>decorateWeapon(makeEquipment('weapon',name,'white',name),enchant,1);
function strike(raid,e,slot,seconds,amount=8,options={}){
  raid.switchWeapon(slot);raid.elapsed=seconds;
  const action=raid.synergies.attack(raid.player),item=action.item;
  raid.damageEnemy(e,amount,{action,enchant:item.enchant,rarity:item.rarity,value:action.value,weapon:item.weapon,
    intrinsic:weaponOf(item).intrinsic,...options});
}
const procs=raid=>raid.events.filter(event=>event.type==='synergy');

test('temporary number satisfies a gate and expires without raising the permanent number',()=>{
  const raid=empty(),p=raid.player;p.value=32;raid.operators.amplify=1;
  const gate={id:'gate',kind:'number',requiredNumber:64,opensAt:0};
  assert.equal(raid.extractionStatus(gate).ready,false);
  assert.equal(useOperator(raid,'amplify'),true);
  assert.equal(raid.extractionStatus(gate).ready,true);
  assert.equal(actualNumber(p),32);
  raid.elapsed=10;tickNumberPowers(raid);
  assert.equal(p.value,32);assert.equal(raid.extractionStatus(gate).ready,false);
});

test('digit shield absorbs one hit and recovers on its own simulation clock',()=>{
  const raid=empty(),p=raid.player;p.value=128;tickNumberPowers(raid);
  assert.equal(p.digitShield,true);assert.equal(raid.hurt(12),false);assert.equal(p.hp,100);
  assert.equal(raid.hurt(12),true);assert.equal(p.hp,88);
  raid.elapsed=21.99;tickNumberPowers(raid);assert.equal(p.digitShield,false);
  raid.elapsed=22;tickNumberPowers(raid);assert.equal(p.digitShield,true);
});

test('LOCK blocks number changes and primes are interrupted without changing number',()=>{
  const raid=empty(),e=enemy(raid,'prime',80,7);e.prime=true;raid.operators.lock=1;
  raid.divide();assert.equal(e.value,7);assert.equal(e.stun,.4);
  assert.ok(useOperator(raid,'lock'));assert.ok(isLocked(raid,e));
  const before=raid.player.dividers;raid.divide();assert.equal(raid.player.dividers,before);
  raid.elapsed=8;assert.equal(isLocked(raid,e),false);
});

test('square-root and high-tier shock use permanent tiers with bounded area damage',()=>{
  const raid=empty(),e=enemy(raid,'elite',100,128);raid.player.value=8;
  raid.operators.equalize=1;assert.ok(useOperator(raid,'equalize'));
  assert.equal(raid.player.value,32);assert.equal(e.value,32);
  raid.player.value=2048;const distant=enemy(raid,'distant',1600,32);
  assert.ok(numberShock(raid));assert.equal(raid.player.value,1024);assert.equal(e.dead,true);
  assert.equal(distant.hp,200);assert.equal(numberShock(raid),false);
});

test('four extra enchantments resolve with actual rolls, chain exclusion, kill attribution and health damage',()=>{
  for(const [from,to,pair] of [['bleed','leech','sanguine'],['sunder','critical','fault'],
    ['gravity','lightning','cage'],['poison','detonate','toxic']]){
    const r=empty(),e=enemy(r,'prime-target',115),p=r.player;
    p.hp=58;p.value=8;p.weapons=[gear('pistol',from),gear('revolver',to)];
    r.random=()=>.05;
    const others=[enemy(r,'one',175),enemy(r,'two',197),enemy(r,'three',234)];
    strike(r,e,0,.2,10);
    assert.ok(r.synergies.indicators(r).some(v=>v.id===pair&&v.armed));
    strike(r,e,1,1,to==='detonate'?250:24);
    assert.equal(procs(r).length,1);assert.equal(procs(r)[0].pair,pair);
    assert.ok(procs(r)[0].bonus>0);
    if(pair==='cage')assert.ok(others.every(x=>x.hp<x.maxHp));
  }
});

test('weapon sets honour both directions, minimum marksman range and distinct target marks',()=>{
  for(const [first,second,pair,range]of [['shotgun','greatsword','breach',100],['crossbow','revolver','relay',350]]){
    const raid=empty(),target=enemy(raid,'target',range);
    raid.player.value=8;raid.player.weapons=[gear(first,'none'),gear(second,'none')];
    strike(raid,target,0,.1);
    strike(raid,target,1,1);
    assert.equal(procs(raid)[0].pair,pair);
  }
  const raid=empty(),target=enemy(raid,'near',120);
  raid.player.weapons=[gear('crossbow','none'),gear('revolver','none')];
  strike(raid,target,0,.1);strike(raid,target,1,1);
  assert.equal(procs(raid).length,0);
});

test('airdrop, storm and smuggler use timed state and map markers with a repeatable sequence',()=>{
  const raid=new Raid(defaultSave(),17,{layout:'delta',difficulty:'hard',pressure:false});
  assert.ok(raid.field.props.some(p=>p.kind==='nitrogen'));
  assert.ok(raid.field.props.some(p=>p.kind==='electric'));
  assert.ok(raid.field.props.some(p=>p.landing));
  for(let i=0;i<3;i++){
    raid.elapsed=raid.field.next;raid.field.update(raid,0);
    assert.ok(raid.field.active.length);
  }
  assert.equal(raid.field.sequence,3);
  assert.ok(raid.world.chests.some(c=>c.operator&&c.opensAt));
});

test('fusion is telegraphed, consumes one enemy and cannot produce loot',()=>{
  const raid=empty(),a=enemy(raid,'a',100),b=enemy(raid,'b',148);
  a.waveId=b.waveId='patrol-test';
  raid.tactics.updateFusion(raid);
  raid.elapsed=1.5;raid.tactics.updateFusion(raid);
  assert.ok(a.fusingUntil>0);assert.equal(a.fusingUntil,b.fusingUntil);
  raid.elapsed=3;raid.tactics.updateFusion(raid);
  assert.equal(a.value,16);assert.equal(a.hp,a.maxHp);assert.equal(b.dead,true);
  assert.equal(raid.kills,0);assert.equal(raid.world.drops.length,0);
});

test('remnants are consumed by fire and wind motion can hit enemies without minting duplicate loot',()=>{
  const raid=empty(),e=enemy(raid,'target',100);raid.field=new FieldEvents(raid,7);
  const fire={id:'fire',x:e.x-30,y:e.y,value:16,remnant:true};
  raid.world.tiles=[fire];raid.field.ignite(raid,fire);assert.equal(fire.dead,true);assert.ok(e.hp<200);
  const flying={id:'flying',x:e.x-55,y:e.y,value:8,remnant:true};
  raid.world.tiles=[flying];const before=e.hp;
  assert.ok(useNumberSkill(raid,'gust'));
  assert.ok(flying.flying);
  raid.field.moveRemnants(raid,.08);
  assert.equal(flying.flying,false);assert.ok(e.hp<before);
});

test('purple prototype traits survive a warehouse round trip and bartering consumes one spare weapon',()=>{
  const raid=empty(),p=raid.player;
  const weapon=addPrototype(decorateWeapon(makeEquipment('weapon','carbine','purple','special'),'burn',3),'lightweight');
  raid.bag=[weapon];p.armor=makeEquipment('armor');
  assert.equal(raid.equip(0,0),false);
  const record=gearRecord(weapon,'vault-1');assert.equal(hydrateEquipment(record).prototype,'lightweight');
  raid.world.merchants=[{id:'smuggler',x:p.x,y:p.y,expiresAt:30,barters:3}];
  assert.ok(barterWeapon(raid,'smuggler','operator:0'));assert.equal(raid.bag.length,0);
  assert.equal(Object.values(raid.operators).reduce((a,b)=>a+b),1);
});

test('the normal shelter training button opens a private timed range and Esc returns without saving or journaling',async t=>{
  const env=browserStubs(t);await import('../dist/src/main.js?training-v013');
  const shelter=env.ids.get('shelter-screen');
  shelter.dispatch('click',{target:shelter.children.find(button=>button.dataset.action==='startTraining')});
  assert.equal(env.document.body.dataset.screen,'raid');
  assert.equal(env.ids.get('time-value').textContent,'00:20');
  env.window.dispatch('keydown',{code:'Escape',target:env.canvas});
  assert.equal(env.document.body.dataset.screen,'shelter');
  assert.equal(env.window.localStorage.getItem('number-extraction-v11'),null);
});

test('magnetic energy is doubled per source and keeps the shared synergy cap',()=>{
  const raid=empty();raid.field={ambientRule:()=> 'magnetic'};
  assert.equal(gainEnergy(raid,11),22);
  assert.equal(gainEnergy(raid,4,6),6);
  assert.equal(raid.player.energy,28);
});
