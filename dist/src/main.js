import { prepareWarehouseDeployment, selectWarehouseGear, claimPendingGear, recycleWarehouseGear, repairWarehouseGear } from './warehouse.js';
import { bossPool } from './bosses.js';
import { RULES, difficultyOf, MAP_LAYOUTS, SAVE_KEY } from './config.js';
import { Raid } from './game.js';
import { Input } from './input.js';
import { Renderer } from './renderer.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';
import { readSave,settleRun,writeSave } from './storage.js';
import { upgradeFacility,unlockedWeapons,forgeWeapon } from './shelter.js';
import { ENCHANTS } from './equipment.js';
import { buyFromMerchant } from './commerce.js';
import { BACKUP_KEY, serializeSave, parseSaveFile, commitSaveImport } from './save-transfer.js';

let storage=null;try{storage=window.localStorage;}catch{}
document.documentElement?.setAttribute('data-save-key',SAVE_KEY);
const initial=readSave(storage);let save=initial.save,saveAvailable=initial.available;
if(initial.migrated)saveAvailable=writeSave(storage,save);
let raid=null,view='shelter',paused=true,modal=null,accumulator=0,lastTime=0,lastUI=0,lastResult=null,merchantId=null,pendingSave=null,pendingRecycle=null;
const canvas=document.getElementById('game-canvas'),renderer=new Renderer(canvas,document.getElementById('minimap')),sound=new Sound();
const persist=()=>{saveAvailable=writeSave(storage,save);};
function clearInput(){input.active=false;input.clear();accumulator=0;}
function refreshShelter(){ui.shelter(save,{lastResult,saveAvailable});}
function enterShelter(){
  view='shelter';paused=true;modal=null;clearInput();
  window.numberExtractionDesktop?.setRaidActive(false);
  document.body.dataset.screen='shelter';document.getElementById('raid-screen').hidden=true;document.getElementById('shelter-screen').hidden=false;
  ui.hide(false);refreshShelter();
}
function start(){
  if(view==='raid')return;
  const seed=new Uint32Array(1);if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(seed);else seed[0]=Date.now();
  const prepared=prepareWarehouseDeployment(save),nextRaid=new Raid(prepared.save,seed[0],{warehouseGear:prepared.gear});
  if(prepared.count&&!writeSave(storage,prepared.save)){ui.toast('无法保存出击装备变更，请检查存档权限后再试。');return;}
  if(prepared.count){save=prepared.save;saveAvailable=true;}
  raid=nextRaid;view='raid';paused=false;modal=null;accumulator=0;
  window.numberExtractionDesktop?.setRaidActive(true);
  document.body.dataset.screen='raid';document.getElementById('shelter-screen').hidden=true;document.getElementById('raid-screen').hidden=false;
  renderer.resize();renderer.camera={...raid.player};renderer.lastMapDraw=-Infinity;input.clear();input.active=true;ui.hide();ui.update(raid,save,true,false);
}
function show(kind){
  if(view==='raid'){paused=true;clearInput();}modal=kind;
  if(kind==='inventory')ui.inventory(raid);else if(kind==='merchant')ui.shop(raid,merchantId);else if(kind==='saves')ui.saveTransfer(save,pendingSave);else if(kind==='pause')ui.pause();else if(kind==='abandonAsk')ui.abandonAsk();else ui.help();
}
function close(){
  modal=null;pendingRecycle=null;ui.hide(view==='raid');
  if(view==='shelter')document.getElementById('shelter-screen').querySelector('[data-action="help"]')?.focus();
  if(view==='raid'&&raid.status==='playing'){paused=false;input.clear();input.active=true;accumulator=0;}
}
function pause(){if(modal){close();return;}if(view==='raid'&&raid.status==='playing')show('pause');}
function inventory(){if(view!=='raid'||raid.status!=='playing')return;if(modal==='inventory')close();else show('inventory');}
const input=new Input(canvas,pause,inventory);
const ui=new UI({
  start,close,pause,inventory,help:()=>show('help'),abandonAsk:()=>show('abandonAsk'),
  shelterTab:key=>{if(view==='shelter'&&['deploy','base','forge','vault','bosses'].includes(key)){ui.shelterTab=key;refreshShelter();}},
  saves:()=>{if(view==='shelter'){pendingSave=null;show('saves');}},
  exportSave:async()=>{
    if(view!=='shelter')return;
    const text=serializeSave(save),desktop=window.numberExtractionDesktop;
    if(desktop){const result=await desktop.exportSave(text);if(result.ok)ui.toast('存档已导出。');else if(!result.canceled)ui.toast(result.error||'导出失败。');}
    else{
      const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='NumberExtraction-save.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),0);ui.toast('已生成JSON存档下载。');
    }
  },
  importSave:async()=>{
    if(view!=='shelter')return;
    if(window.numberExtractionDesktop){const result=await window.numberExtractionDesktop.importSave();if(result.ok)reviewImport(result.text);else if(!result.canceled)ui.toast(result.error||'导入失败。');}
    else document.getElementById('save-import-file').click();
  },
  confirmImport:()=>{
    if(view!=='shelter'||!pendingSave)return;
    try{save=commitSaveImport(storage,save,pendingSave);pendingSave=null;lastResult=null;refreshShelter();show('saves');ui.toast('存档已导入，原进度已备份。');}
    catch{ui.toast('无法保存或备份，未替换当前进度。请先检查存储权限。');}
  },
  restoreBackup:()=>{if(view==='shelter'){try{reviewImport(storage.getItem(BACKUP_KEY));}catch{ui.toast('没有可读取的导入前备份。');}}},
  abandon:()=>{if(raid?.status==='playing'){raid.finish(false,'主动返回庇护所');handleEvents();}},
  selectDifficulty:key=>{if(view!=='shelter')return;save.selectedDifficulty=difficultyOf(key).id;if(!bossPool(difficultyOf(key).rank).includes(save.selectedBoss))save.selectedBoss='random';persist();refreshShelter();},
  selectWeapon:key=>{if(view!=='shelter'||!unlockedWeapons(save).includes(key))return;save.selectedWeapon=key;persist();refreshShelter();},
  trackBoss:key=>{if(view==='shelter'&&bossPool(difficultyOf(save.selectedDifficulty).rank).includes(key)){save.selectedBoss=key;ui.shelterTab='deploy';persist();refreshShelter();ui.toast('首领追踪目标已设置。');}},
  selectBoss:key=>{if(view==='shelter'&&(key==='random'||bossPool(difficultyOf(save.selectedDifficulty).rank).includes(key))){save.selectedBoss=key;persist();refreshShelter();}},
  selectMap:key=>{if(view!=='shelter'||!MAP_LAYOUTS.some(m=>m.id===key))return;save.selectedMap=key;persist();refreshShelter();},
  selectEnchant:key=>{if(view!=='shelter'||!Object.hasOwn(ENCHANTS,key))return;save.selectedEnchant=key;persist();refreshShelter();},
  forge:()=>{if(view==='shelter'&&forgeWeapon(save)){persist();refreshShelter();ui.toast('武器打造完成，之后每次出击自动发放。');}},
  buy:key=>{if(view==='raid'&&modal==='merchant'&&buyFromMerchant(raid,merchantId,key)){ui.shop(raid,merchantId);ui.update(raid,save,true,true);sound.play('loot');}},
  upgradeFacility:key=>warehouseChange(next=>upgradeFacility(next,key),'设施升级完成。'),
  vaultSelect:key=>{const [slot,...id]=key.split(':');warehouseChange(next=>selectWarehouseGear(next,id.join(':'),slot),'出击装备选择已保存。');},
  claimPending:()=>warehouseChange(claimPendingGear,'待收装备已收纳。'),
  repairGear:key=>warehouseChange(next=>repairWarehouseGear(next,key),'护甲已修复。'),
  askRecycle:key=>{if(view==='shelter'){const item=[...save.warehouse.items,...save.warehouse.pending].find(i=>i.id===key);if(item){pendingRecycle=key;modal='recycle';ui.recycleConfirm(item);}}},
  confirmRecycle:()=>{const id=pendingRecycle;if(id&&warehouseChange(next=>recycleWarehouseGear(next,id),'装备已回收。')){pendingRecycle=null;modal=null;ui.hide(false);}},
  equip0:key=>equip(key,0),equip1:key=>equip(key,1),equip:key=>equip(key),
  drop:key=>{if(raid?.dropItem(Number(key)))show('inventory');},remove:key=>{if(raid?.removeEquipment(key))show('inventory');},
  slot:key=>{if(view==='raid'&&raid.switchWeapon(Number(key))){if(modal==='inventory')show('inventory');ui.update(raid,save,true,paused);}},
  overload:()=>{if(view==='raid'&&!paused)raid.activateOverload();},
  sound:()=>{const enabled=sound.toggle();document.getElementById('sound-state').textContent=enabled?'ON':'OFF';document.getElementById('sound-button').setAttribute('aria-label',enabled?'关闭音效':'开启音效');},
});
function warehouseChange(action,message){
  if(view!=='shelter')return false;
  const next=structuredClone(save);if(!action(next)){ui.toast('当前条件不足，未修改仓库。');return false;}
  if(!writeSave(storage,next)){saveAvailable=false;ui.toast('存档写入失败，仓库未变更。');return false;}
  save=next;saveAvailable=true;refreshShelter();ui.toast(message);return true;
}
function reviewImport(text){try{pendingSave=parseSaveFile(text);show('saves');}catch(error){ui.toast(error.message);}}
document.getElementById('save-import-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(view!=='shelter'||!file)return;
  if(file.size>524288)ui.toast('存档文件不能超过512KB。');else reviewImport(await file.text());event.target.value='';
});
function equip(key,slot){if(raid?.equip(Number(key),slot)){sound.play('loot');show('inventory');ui.update(raid,save,true,paused);}}
function handleEvents(){
  for(const event of raid.events.splice(0)){
    if(event.type==='message')ui.toast(event.text);
    else if(event.type==='trade'){merchantId=event.id;show('merchant');}
    else if(event.type==='finish'){if(settleRun(save,event.result))persist();lastResult=event.result;sound.play('finish');enterShelter();}
    else{sound.play(event.type,event);renderer.feedback(event);}
  }
}
function autoPause(){if(view==='raid'&&!paused)show('pause');}
window.addEventListener('blur',autoPause);document.addEventListener('visibilitychange',()=>{if(document.hidden)autoPause();});
function frame(timestamp){
  const dt=Math.min((timestamp-lastTime)/1000||0,0.1);lastTime=timestamp;
  if(view==='raid'){
    if(!paused&&raid.status==='playing'){
      accumulator+=dt;
      while(accumulator>=RULES.fixedStep&&!paused&&raid.status==='playing'){
        const controls=input.consume();
        if(controls.pointer){const point=renderer.screenToWorld(controls.pointer.x,controls.pointer.y);controls.aimX=point.x;controls.aimY=point.y;}
        raid.update(RULES.fixedStep,controls);accumulator-=RULES.fixedStep;handleEvents();
      }
    }else accumulator=0;
    if(view==='raid'){renderer.draw(raid,timestamp/1000,dt);if(timestamp-lastUI>80){ui.update(raid,save,true,paused);lastUI=timestamp;}}
  }
  ui.tick();requestAnimationFrame(frame);
}
enterShelter();requestAnimationFrame(frame);
