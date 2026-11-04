import { RULES, difficultyOf } from './config.js';
import { Raid } from './game.js';
import { Input } from './input.js';
import { Renderer } from './renderer.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';
import { readSave,settleRun,writeSave } from './storage.js';
import { upgradeFacility,unlockedWeapons } from './shelter.js';

let storage=null;try{storage=window.localStorage;}catch{}
const initial=readSave(storage);let save=initial.save,saveAvailable=initial.available;
if(initial.migrated)saveAvailable=writeSave(storage,save);
let raid=null,view='shelter',paused=true,modal=null,accumulator=0,lastTime=0,lastUI=0,lastResult=null;
const canvas=document.getElementById('game-canvas'),renderer=new Renderer(canvas,document.getElementById('minimap')),sound=new Sound();
const persist=()=>{saveAvailable=writeSave(storage,save);};
function clearInput(){input.active=false;input.clear();accumulator=0;}
function refreshShelter(){ui.shelter(save,{lastResult,saveAvailable});}
function enterShelter(){
  view='shelter';paused=true;modal=null;clearInput();
  document.body.dataset.screen='shelter';document.getElementById('raid-screen').hidden=true;document.getElementById('shelter-screen').hidden=false;
  ui.hide(false);refreshShelter();
}
function start(){
  if(view==='raid')return;
  const seed=new Uint32Array(1);if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(seed);else seed[0]=Date.now();
  raid=new Raid(save,seed[0]);view='raid';paused=false;modal=null;accumulator=0;
  document.body.dataset.screen='raid';document.getElementById('shelter-screen').hidden=true;document.getElementById('raid-screen').hidden=false;
  renderer.resize();renderer.camera={...raid.player};renderer.lastMapDraw=-Infinity;input.clear();input.active=true;ui.hide();ui.update(raid,save,true,false);
}
function show(kind){
  if(view==='raid'){paused=true;clearInput();}modal=kind;
  if(kind==='inventory')ui.inventory(raid);else if(kind==='pause')ui.pause();else if(kind==='abandonAsk')ui.abandonAsk();else ui.help();
}
function close(){
  modal=null;ui.hide(view==='raid');
  if(view==='shelter')document.getElementById('shelter-screen').querySelector('[data-action="help"]')?.focus();
  if(view==='raid'&&raid.status==='playing'){paused=false;input.clear();input.active=true;accumulator=0;}
}
function pause(){if(modal){close();return;}if(view==='raid'&&raid.status==='playing')show('pause');}
function inventory(){if(view!=='raid'||raid.status!=='playing')return;if(modal==='inventory')close();else show('inventory');}
const input=new Input(canvas,pause,inventory);
const ui=new UI({
  start,close,pause,inventory,help:()=>show('help'),abandonAsk:()=>show('abandonAsk'),
  abandon:()=>{if(raid?.status==='playing'){raid.finish(false,'主动返回庇护所');handleEvents();}},
  selectDifficulty:key=>{if(view!=='shelter')return;save.selectedDifficulty=difficultyOf(key).id;persist();refreshShelter();},
  selectWeapon:key=>{if(view!=='shelter'||!unlockedWeapons(save).includes(key))return;save.selectedWeapon=key;persist();refreshShelter();},
  upgradeFacility:key=>{if(view==='shelter'&&upgradeFacility(save,key)){persist();sound.play('loot');refreshShelter();ui.toast('设施升级完成，下一次出击即生效。');}},
  equip0:key=>equip(key,0),equip1:key=>equip(key,1),equip:key=>equip(key),
  drop:key=>{if(raid?.dropItem(Number(key)))show('inventory');},remove:key=>{if(raid?.removeEquipment(key))show('inventory');},
  slot:key=>{if(view==='raid'&&raid.switchWeapon(Number(key))){if(modal==='inventory')show('inventory');ui.update(raid,save,true,paused);}},
  overload:()=>{if(view==='raid'&&!paused)raid.activateOverload();},
  sound:()=>{const enabled=sound.toggle();document.getElementById('sound-state').textContent=enabled?'ON':'OFF';document.getElementById('sound-button').setAttribute('aria-label',enabled?'关闭音效':'开启音效');},
});
function equip(key,slot){if(raid?.equip(Number(key),slot)){sound.play('loot');show('inventory');ui.update(raid,save,true,paused);}}
function handleEvents(){
  for(const event of raid.events.splice(0)){
    if(event.type==='message')ui.toast(event.text);
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
