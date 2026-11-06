import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { defaultSave, normalizeSave, readSave, writeSave, settleRun } from '../dist/src/storage.js';
import { SAVE_KEY, V09_SAVE_KEY } from '../dist/src/config.js';
import { makeEquipment, decorateWeapon } from '../dist/src/equipment.js';
import { warehouseCapacity, storeExtractedGear, plannedWarehouseGear, prepareWarehouseDeployment, selectWarehouseGear, claimPendingGear, recycleWarehouseGear, repairWarehouseGear, hydrateEquipment } from '../dist/src/warehouse.js';
import { upgradeFacility } from '../dist/src/shelter.js';
import { serializeSave, parseSaveFile, commitSaveImport, BACKUP_KEY } from '../dist/src/save-transfer.js';
import { Raid } from './helpers/classic-raid.js';
import { UI } from '../dist/src/ui.js';
import { browserStubs } from './helpers/browser-stubs.js';
const {validSaveText}=createRequire(import.meta.url)('../desktop/policy.cjs');
const gun=(id='field-gun')=>decorateWeapon(makeEquipment('weapon','plasma','purple',id),'frost',3);
function raid(save=defaultSave(),gear){const r=new Raid(save,817,{pressure:false,warehouseGear:gear});Object.assign(r.world,{enemies:[],tiles:[],drops:[],obstacles:[],terrain:[],chests:[],nodes:[],hazards:[]});return r;}
function memory(){const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};}

test('warehouse starts with 24 slots and upgrades capacity with exact resource debits',()=>{
 const s=defaultSave();assert.equal(warehouseCapacity(s),24);assert.equal(upgradeFacility(s,'warehouse'),false);
 s.credits=1000;s.materials.alloy=100;assert.equal(upgradeFacility(s,'warehouse'),true);assert.equal(warehouseCapacity(s),36);assert.equal(s.credits,840);assert.equal(s.materials.alloy,95);
 s.shelter.warehouse=10;assert.equal(warehouseCapacity(s),144);assert.equal(upgradeFacility(s,'warehouse'),false);
});

test('successful extraction stores carried and worn gear without converting it to money or materials',()=>{
 const s=defaultSave(),r=raid(),armor=makeEquipment('armor','','green','damaged');armor.durability=17;
 r.bag=[gun(),{kind:'loot',name:'碎片',value:32}];r.player.armor=armor;r.player.laser=makeEquipment('laser','','white','scope');r.finish(true,'extract');
 assert.equal(r.result.value,32);assert.deepEqual(r.result.materials,{alloy:2,core:0});assert.equal(settleRun(s,r.result),true);
 assert.equal(s.credits,32);assert.equal(s.warehouse.items.length,3);const weapon=s.warehouse.items.find(i=>i.kind==='weapon');
 assert.equal(weapon.weapon,'plasma');assert.equal(weapon.level,3);assert.equal(weapon.enchant,'frost');assert.equal(weapon.rarity,'purple');assert.equal(s.warehouse.items.find(i=>i.kind==='armor').durability,17);
 assert.equal(settleRun(s,r.result),false);assert.equal(s.warehouse.items.length,3);
});

test('issued starters, forged starters and trial equipment cannot enter the warehouse',()=>{
 const s=defaultSave();s.bag=[];const r=raid();r.bag=[{...gun('trial'),starter:true,value:0},{...gun('forged'),starter:true,forged:true,value:0}];r.finish(true,'test');settleRun(s,r.result);
 assert.equal(s.warehouse.items.length,0);assert.equal(s.warehouse.pending.length,0);assert.equal(s.credits,0);
});

test('full warehouses preserve excess gear in a pending area and claim it after expansion',()=>{
 const s=defaultSave();storeExtractedGear(s,Array.from({length:27},(_,i)=>gun('drop-'+i)));
 assert.equal(s.warehouse.items.length,24);assert.equal(s.warehouse.pending.length,3);assert.equal(claimPendingGear(s),0);
 const id=s.warehouse.pending[0].id;assert.equal(selectWarehouseGear(s,id,'0'),false);
 s.credits=1000;s.materials.alloy=100;upgradeFacility(s,'warehouse');assert.equal(claimPendingGear(s),3);assert.equal(s.warehouse.items.length,27);assert.equal(s.warehouse.pending.length,0);
 assert.equal(selectWarehouseGear(s,id,'0'),true);
});

test('loadout selection has unique ownership and checks slot kinds and broken armour',()=>{
 const s=defaultSave();const armor=makeEquipment('armor','','blue','plate');armor.durability=0;storeExtractedGear(s,[gun(),armor,makeEquipment('laser','','white','scope')]);
 const [weapon,plate,laser]=s.warehouse.items;assert.equal(selectWarehouseGear(s,weapon.id,'armor'),false);assert.equal(selectWarehouseGear(s,plate.id,'armor'),false);
 assert.equal(selectWarehouseGear(s,weapon.id,'0'),true);assert.equal(selectWarehouseGear(s,weapon.id,'1'),true);assert.equal(s.deployment['0'],undefined);assert.equal(s.deployment['1'],weapon.id);
 assert.equal(selectWarehouseGear(s,laser.id,'laser'),true);assert.equal(selectWarehouseGear(s,'missing','0'),false);assert.equal(selectWarehouseGear(s,'','1'),true);assert.equal(plannedWarehouseGear(s).weapons[1],null);
});

test('preparing deployment is pure and removes selected gear only in the next save',()=>{
 const s=defaultSave();storeExtractedGear(s,[gun(),makeEquipment('armor','','green','armor')]);selectWarehouseGear(s,s.warehouse.items[0].id,'0');
 const before=serializeSave(s),prepared=prepareWarehouseDeployment(s);assert.equal(serializeSave(s),before);assert.equal(prepared.count,1);assert.equal(prepared.save.warehouse.items.length,1);assert.deepEqual(prepared.save.deployment,{});
 const r=raid(prepared.save,prepared.gear);assert.equal(r.player.weapons[0].weapon,'plasma');assert.equal(r.player.weapons[0].enchant,'frost');assert.equal(r.player.weapons[0].starter,undefined);assert.equal(r.player.weapons[1].starter,true);
});

test('warehouse gear survives successful redeployment with actual remaining armour durability',()=>{
 const s=defaultSave();storeExtractedGear(s,[gun(),makeEquipment('armor','','blue','armor')]);selectWarehouseGear(s,s.warehouse.items[0].id,'0');selectWarehouseGear(s,s.warehouse.items[1].id,'armor');
 const prepared=prepareWarehouseDeployment(s),r=raid(prepared.save,prepared.gear);r.player.armor.durability=9;r.finish(true,'extract');settleRun(prepared.save,r.result);
 assert.equal(prepared.save.warehouse.items.length,2);assert.equal(prepared.save.warehouse.items.find(i=>i.kind==='armor').durability,9);assert.equal(prepared.save.credits,0);assert.deepEqual(prepared.save.materials,{alloy:0,core:0});
});

test('death loses checked-out gear but leaves other stored equipment intact',()=>{
 const s=defaultSave();s.credits=99;storeExtractedGear(s,[gun('take'),gun('leave')]);selectWarehouseGear(s,s.warehouse.items[0].id,'0');
 const prepared=prepareWarehouseDeployment(s),r=raid(prepared.save,prepared.gear);r.finish(false,'defeat');settleRun(prepared.save,r.result);
 assert.equal(prepared.save.warehouse.items.length,1);assert.equal(prepared.save.credits,99);assert.equal(prepared.save.deaths,1);
});

test('recycling is explicit, cannot pay twice and does not create a trader buy-salvage profit',()=>{
 const s=defaultSave();storeExtractedGear(s,[makeEquipment('armor','','green','armor')]);const id=s.warehouse.items[0].id;selectWarehouseGear(s,id,'armor');
 assert.equal(recycleWarehouseGear(s,id),true);assert.equal(s.credits,26);assert.equal(s.materials.alloy,3);assert.deepEqual(s.deployment,{});assert.equal(recycleWarehouseGear(s,id),false);assert.ok(s.credits<65);
});

test('damaged armour can be repaired atomically and repair state round trips',()=>{
 const s=defaultSave(),armor=makeEquipment('armor','','white','armor');armor.durability=7;storeExtractedGear(s,[armor]);const id=s.warehouse.items[0].id;
 assert.equal(repairWarehouseGear(s,id),false);assert.equal(s.warehouse.items[0].durability,7);s.credits=50;assert.equal(repairWarehouseGear(s,id),true);assert.equal(s.credits,35);assert.equal(s.warehouse.items[0].durability,40);assert.equal(repairWarehouseGear(s,id),false);
 const loaded=normalizeSave(s);assert.equal(loaded.warehouse.items[0].durability,40);
});

test('v0.9 progress migrates without overwriting old keys and cannot erase a newer warehouse',()=>{
 const storage=memory(),old={version:3,credits:700,materials:{alloy:22,core:3},shelter:{storage:2},forged:{pistol:{level:2,enchant:'leech'}}};storage.setItem(V09_SAVE_KEY,JSON.stringify(old));
 const result=readSave(storage);assert.equal(result.migrated,true);assert.equal(result.save.version,5);assert.equal(result.save.credits,700);assert.equal(result.save.shelter.storage,2);assert.equal(result.save.forged.pistol.level,2);
 storeExtractedGear(result.save,[gun()]);writeSave(storage,result.save);storage.setItem(V09_SAVE_KEY,JSON.stringify({...old,credits:0}));const next=readSave(storage);
 assert.equal(next.save.credits,700);assert.equal(next.save.warehouse.items.length,1);assert.equal(next.migrated,false);assert.equal(storage.data.get(V09_SAVE_KEY),JSON.stringify({...old,credits:0}));
});

test('normalization removes invalid or duplicate gear and moves over-capacity inventory to pending',()=>{
 const s=defaultSave();storeExtractedGear(s,Array.from({length:30},(_,i)=>gun('id-'+i)));s.warehouse.items.push(...s.warehouse.pending);s.warehouse.pending=[];
 s.warehouse.items.push({...s.warehouse.items[0]},{id:'vault-99',kind:'weapon',weapon:'unknown',rarity:'red'},{id:'vault-100',kind:'password',rarity:'white'});
 const loaded=normalizeSave(s);assert.equal(loaded.warehouse.items.length,24);assert.equal(loaded.warehouse.pending.length,6);assert.equal(new Set([...loaded.warehouse.items,...loaded.warehouse.pending].map(i=>i.id)).size,30);
 storeExtractedGear(loaded,[gun('new')]);assert.equal(loaded.warehouse.pending.at(-1).id,'vault-31');
});

test('warehouse exports include large pending inventories under the shared 512KB boundary',()=>{
 const s=defaultSave();storeExtractedGear(s,Array.from({length:1800},(_,i)=>gun('item-'+i)));const text=serializeSave(s);
 assert.ok(new TextEncoder().encode(text).length>131072);assert.equal(validSaveText(text),true);const loaded=parseSaveFile(text);assert.equal(loaded.warehouse.pending.length,1776);assert.equal(loaded.warehouse.items.length,24);
 const oversized=JSON.stringify({version:4,credits:0,note:'甲'.repeat(180000)});assert.equal(validSaveText(oversized),false);assert.throws(()=>parseSaveFile(oversized));
});

test('import backup and restore retain warehouse selections, pending gear and durability',()=>{
 const original=defaultSave();storeExtractedGear(original,[gun()]);selectWarehouseGear(original,original.warehouse.items[0].id,'0');const incoming=defaultSave();incoming.credits=999;
 const storage=memory();commitSaveImport(storage,original,incoming);const backup=parseSaveFile(storage.getItem(BACKUP_KEY));assert.equal(backup.warehouse.items.length,1);assert.equal(plannedWarehouseGear(backup).weapons[0].enchant,'frost');
 const restored=commitSaveImport(storage,incoming,backup);assert.equal(restored.credits,0);assert.equal(restored.warehouse.items.length,1);
});

test('warehouse UI separates pending gear and displays actionable repair, selection and upgrade controls',t=>{
 const env=browserStubs(t),s=defaultSave();storeExtractedGear(s,Array.from({length:25},(_,i)=>gun('item-'+i)));s.credits=1000;s.materials.alloy=100;
 const ui=new UI(new Proxy({},{get:()=>()=>{}}));ui.shelterTab='vault';ui.shelter(s,{});const html=env.ids.get('shelter-screen').innerHTML;
 assert.match(html,/战备仓库/);assert.match(html,/24 \/ 24 格/);assert.match(html,/待收区 · 1件/);assert.match(html,/data-action="vaultSelect" data-key="0:vault-1"/);assert.match(html,/data-action="askRecycle"/);
});

test('actual application checks out selected equipment before starting and persists the withdrawal',async t=>{
 const env=browserStubs(t),s=defaultSave();storeExtractedGear(s,[gun()]);selectWarehouseGear(s,s.warehouse.items[0].id,'0');env.window.localStorage.setItem(SAVE_KEY,JSON.stringify(s));
 await import('../dist/src/main.js?warehouse-start');const shelter=env.ids.get('shelter-screen');shelter.dispatch('click',{target:shelter.children.find(b=>b.dataset.action==='start')});
 const stored=JSON.parse(env.window.localStorage.getItem(SAVE_KEY));assert.equal(stored.warehouse.items.length,0);assert.deepEqual(stored.deployment,{});assert.match(env.ids.get('quick-slot-0').innerHTML,/能量手枪/);assert.match(env.ids.get('quick-slot-0').innerHTML,/寒霜/);
});

test('failed save writes prevent warehouse deployment and preserve ownership',async t=>{
 const env=browserStubs(t),s=defaultSave();storeExtractedGear(s,[gun()]);selectWarehouseGear(s,s.warehouse.items[0].id,'0');env.window.localStorage.setItem(SAVE_KEY,JSON.stringify(s));
 await import('../dist/src/main.js?warehouse-write-failure');t.mock.method(env.window.localStorage,'setItem',()=>{throw Error('quota');});const shelter=env.ids.get('shelter-screen');shelter.dispatch('click',{target:shelter.children.find(b=>b.dataset.action==='start')});
 assert.equal(env.document.body.dataset.screen,'shelter');assert.equal(JSON.parse(env.window.localStorage.getItem(SAVE_KEY)).warehouse.items.length,1);assert.match(env.ids.get('message').textContent,/无法保存/);
});

test('warehouse selection and recycle confirmation work through the actual shelter controls',async t=>{
 const env=browserStubs(t),s=defaultSave();storeExtractedGear(s,[gun()]);env.window.localStorage.setItem(SAVE_KEY,JSON.stringify(s));await import('../dist/src/main.js?warehouse-controls');const shelter=env.ids.get('shelter-screen'),dialog=env.ids.get('dialog');
 const click=(action,key)=>shelter.dispatch('click',{target:shelter.children.find(b=>b.dataset.action===action&&(key===undefined||b.dataset.key===key))});
 click('shelterTab','vault');click('vaultSelect','0:vault-1');assert.equal(JSON.parse(env.window.localStorage.getItem(SAVE_KEY)).deployment['0'],'vault-1');
 click('askRecycle','vault-1');assert.match(dialog.innerHTML,/回收这件装备/);assert.equal(JSON.parse(env.window.localStorage.getItem(SAVE_KEY)).warehouse.items.length,1);
 dialog.dispatch('click',{target:dialog.children.find(b=>b.dataset.action==='close')});assert.equal(JSON.parse(env.window.localStorage.getItem(SAVE_KEY)).warehouse.items.length,1);click('askRecycle','vault-1');
 dialog.dispatch('click',{target:dialog.children.find(b=>b.dataset.action==='confirmRecycle')});assert.equal(JSON.parse(env.window.localStorage.getItem(SAVE_KEY)).warehouse.items.length,0);
});
