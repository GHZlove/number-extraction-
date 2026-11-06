import { FACILITIES } from './config.js';
import { WEAPONS, RARITIES, ENCHANTS, isEquipment, makeEquipment, decorateWeapon } from './equipment.js';

export const WAREHOUSE_SLOTS=['0','1','armor','laser'];
export const defaultWarehouse=()=>({items:[],pending:[],nextId:1});
export const warehouseCapacity=save=>24+12*Math.max(0,Math.min(FACILITIES.warehouse.max,Math.floor(save.shelter?.warehouse||0)));
export function gearRecord(item,id=item?.id){
  if(!isEquipment(item)||item.starter||!RARITIES.some(r=>r.id===item.rarity)||item.kind==='weapon'&&!Object.hasOwn(WEAPONS,item.weapon))return null;
  const record={id,kind:item.kind,rarity:item.kind==='laser'?'white':item.rarity};
  if(item.kind==='weapon')Object.assign(record,{weapon:item.weapon,level:Math.max(1,Math.min(5,Math.floor(item.level)||1)),enchant:Object.hasOwn(ENCHANTS,item.enchant)?item.enchant:'none'});
  if(item.kind==='armor'){
    const max=makeEquipment('armor','',item.rarity).maxDurability;
    record.durability=Number.isFinite(item.durability)?Math.max(0,Math.min(max,item.durability)):max;
  }
  return record;
}
export function hydrateEquipment(record){
  const item=makeEquipment(record.kind,record.weapon,record.rarity,record.id);
  if(record.kind==='weapon')return decorateWeapon(item,record.enchant,record.level);
  if(record.kind==='armor')item.durability=record.durability;
  return item;
}
export function normalizeWarehouse(data){
  const vault=defaultWarehouse(),seen=new Set();let largest=0;
  for(const key of ['items','pending'])for(const item of Array.isArray(data?.[key])?data[key]:[]){
    const serial=typeof item?.id==='string'&&/^vault-[1-9]\d{0,8}$/.test(item.id)?Number(item.id.slice(6)):0;
    const record=serial&&gearRecord(item);
    if(!record||seen.has(record.id))continue;
    seen.add(record.id);largest=Math.max(largest,serial);vault[key].push(record);
  }
  vault.nextId=Math.max(largest+1,Number.isSafeInteger(data?.nextId)&&data.nextId>0?Math.min(1e9,data.nextId):1);
  return vault;
}
export function normalizeDeployment(save,data){
  const plan={},seen=new Set();
  for(const slot of WAREHOUSE_SLOTS){
    const item=save.warehouse.items.find(i=>i.id===data?.[slot]);
    if(!item||seen.has(item.id)||item.kind!==(slot==='0'||slot==='1'?'weapon':slot)||item.kind==='armor'&&item.durability<=0)continue;
    plan[slot]=item.id;seen.add(item.id);
  }
  return plan;
}
export function storeExtractedGear(save,items){
  const vault=save.warehouse,seen=new Set();let stored=0,pending=0;
  for(const item of items){
    if(item?.id&&seen.has(item.id))continue;
    const record=gearRecord(item,`vault-${vault.nextId}`);if(!record)continue;
    if(item.id)seen.add(item.id);vault.nextId++;
    if(vault.items.length<warehouseCapacity(save)){vault.items.push(record);stored++;}
    else{vault.pending.push(record);pending++;}
  }
  return {stored,pending};
}
export function selectWarehouseGear(save,id,slot){
  if(!WAREHOUSE_SLOTS.includes(slot))return false;
  if(!id){delete save.deployment[slot];return true;}
  const item=save.warehouse.items.find(i=>i.id===id);
  if(!item||item.kind!==(slot==='0'||slot==='1'?'weapon':slot)||item.kind==='armor'&&item.durability<=0)return false;
  for(const key of WAREHOUSE_SLOTS)if(save.deployment[key]===id)delete save.deployment[key];
  save.deployment[slot]=id;return true;
}
export function plannedWarehouseGear(save){
  const gear={weapons:[null,null],armor:null,laser:null};
  for(const [slot,id]of Object.entries(normalizeDeployment(save,save.deployment))){
    const item=hydrateEquipment(save.warehouse.items.find(i=>i.id===id));
    if(slot==='0'||slot==='1')gear.weapons[Number(slot)]=item;else gear[slot]=item;
  }
  return gear;
}
export function applyWarehouseGear(loadout,gear){
  if(!gear)return loadout;
  if(gear.weapons?.[0]&&!gear.weapons?.[1]){
    const secondary=WEAPONS[gear.weapons[0].weapon].mode==='melee'?'pistol':'greatsword';
    loadout.weapons[1]={...makeEquipment('weapon',secondary,loadout.weapons[1].rarity,'starter-secondary'),starter:true,value:0};
  }
  for(const slot of [0,1])if(gear.weapons?.[slot])loadout.weapons[slot]={...gear.weapons[slot]};
  for(const key of ['armor','laser'])if(gear[key])loadout[key]={...gear[key]};
  return loadout;
}
export function prepareWarehouseDeployment(save){
  const next=structuredClone(save),gear=plannedWarehouseGear(next),ids=new Set(Object.values(normalizeDeployment(next,next.deployment)));
  next.warehouse.items=next.warehouse.items.filter(item=>!ids.has(item.id));next.deployment={};
  return {save:next,gear,count:ids.size};
}
export function claimPendingGear(save){
  const free=Math.max(0,warehouseCapacity(save)-save.warehouse.items.length),items=save.warehouse.pending.splice(0,free);
  save.warehouse.items.push(...items);return items.length;
}
export function recycleWarehouseGear(save,id){
  for(const key of ['items','pending']){
    const index=save.warehouse[key].findIndex(i=>i.id===id);if(index<0)continue;
    const item=hydrateEquipment(save.warehouse[key][index]),rank=RARITIES.findIndex(r=>r.id===item.rarity);
    save.warehouse[key].splice(index,1);save.credits+=Math.max(1,Math.floor(item.value*.35));save.materials.alloy+=Math.max(1,rank+1);if(rank>=4)save.materials.core++;
    for(const slot of WAREHOUSE_SLOTS)if(save.deployment[slot]===id)delete save.deployment[slot];return true;
  }
  return false;
}
export function warehouseRepairCost(record){
  if(record.kind!=='armor')return 0;
  const max=makeEquipment('armor','',record.rarity).maxDurability;
  return record.durability<max?Math.max(5,Math.ceil((max-record.durability)*.45)):0;
}
export function repairWarehouseGear(save,id){
  const item=[...save.warehouse.items,...save.warehouse.pending].find(i=>i.id===id);
  if(!item)return false;const cost=warehouseRepairCost(item);if(!cost||save.credits<cost)return false;
  save.credits-=cost;item.durability=makeEquipment('armor','',item.rarity).maxDurability;return true;
}
