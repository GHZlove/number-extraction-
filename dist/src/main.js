import { RULES } from './config.js';
import { Raid } from './game.js';
import { Input } from './input.js';
import { Renderer } from './renderer.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';
import { buyUpgrade, readSave, settleRun, writeSave } from './storage.js';

let storage=null;try{storage=window.localStorage;}catch{/* Sandboxed contexts may disable local storage. */}
const initial=readSave(storage);let save=initial.save,saveAvailable=initial.available;
let raid=new Raid(save,204801),started=false,paused=true,modal='home',accumulator=0,lastTime=0,lastUI=0;
const canvas=document.getElementById('game-canvas');
const renderer=new Renderer(canvas,document.getElementById('minimap'));
const sound=new Sound();
const persist=()=>{saveAvailable=writeSave(storage,save);};
function clearInput(){input.active=false;input.clear();accumulator=0;}
function start(){
  const seed=new Uint32Array(1);if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(seed);else seed[0]=Date.now();
  raid=new Raid(save,seed[0]);started=true;paused=false;modal=null;accumulator=0;input.clear();input.active=true;ui.hide();
  renderer.camera={...raid.player};ui.update(raid,save,started,paused);
}
function show(kind){
  paused=true;modal=kind;clearInput();
  if(kind==='vault')ui.vault(save,started&&raid.status==='playing',saveAvailable);
  else if(kind==='help')ui.help();else if(kind==='pause')ui.pause();else if(kind==='abandonAsk')ui.abandonAsk();
  else if(kind==='result')ui.result(raid.result,save,saveAvailable);else ui.home(saveAvailable);
  if(!document.getElementById('dialog-title'))document.querySelector('#dialog h1')?.setAttribute('id','dialog-title');
}
function close(){
  if(started&&raid.status==='playing'){paused=false;modal=null;input.clear();input.active=true;accumulator=0;ui.hide();}
  else if(raid.result)show('result');else show('home');
}
function pause(){if(!started||raid.status!=='playing')return;if(modal)close();else show('pause');}
const input=new Input(canvas,pause);
const ui=new UI({start,close,pause,help:()=>show('help'),vault:()=>show('vault'),abandonAsk:()=>show('abandonAsk'),
  abandon:()=>{raid.finish(false,'主动放弃行动');handleEvents();},
  upgrade:key=>{if(started&&raid.status==='playing')return;if(buyUpgrade(save,key)){persist();sound.play('loot');show('vault');ui.update(raid,save,started,paused);}},
  sound:()=>{const enabled=sound.toggle();document.getElementById('sound-state').textContent=enabled?'ON':'OFF';document.getElementById('sound-button').setAttribute('aria-label',enabled?'关闭音效':'开启音效');},
});
function handleEvents(){
  for(const event of raid.events.splice(0)) {
    if(event.type==='message')ui.toast(event.text);
    else if(event.type==='finish'){
      if(settleRun(save,event.result))persist();
      sound.play(event.type);show('result');ui.update(raid,save,started,paused);
    }else {sound.play(event.type);if(event.type==='hurt')renderer.shake=4;}
  }
}
function autoPause(){if(started&&raid.status==='playing'&&!paused)show('pause');}
window.addEventListener('blur',autoPause);
document.addEventListener('visibilitychange',()=>{if(document.hidden)autoPause();});

// A fixed simulation step keeps timers, movement and damage independent of FPS.
function frame(timestamp){
  const dt=Math.min((timestamp-lastTime)/1000||0,0.1);lastTime=timestamp;
  if(started&&!paused&&raid.status==='playing'){
    accumulator+=dt;
    while(accumulator>=RULES.fixedStep&&!paused&&raid.status==='playing'){
      raid.update(RULES.fixedStep,input.consume());accumulator-=RULES.fixedStep;handleEvents();
    }
  }else accumulator=0;
  renderer.draw(raid,timestamp/1000,dt);
  if(timestamp-lastUI>80){ui.update(raid,save,started,paused);lastUI=timestamp;}
  requestAnimationFrame(frame);
}
show('home');ui.update(raid,save,started,paused);requestAnimationFrame(frame);
