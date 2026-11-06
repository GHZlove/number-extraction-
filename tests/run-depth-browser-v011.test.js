import test from 'node:test';
import assert from 'node:assert/strict';
import { browserStubs } from './helpers/browser-stubs.js';
import { SAVE_KEY } from '../dist/src/config.js';
import { defaultSave } from '../dist/src/storage.js';
import { Raid } from '../dist/src/game.js';
import { Renderer } from '../dist/src/renderer.js';
import { UI } from '../dist/src/ui.js';
import { makeEquipment } from '../dist/src/equipment.js';
import { createEnemy } from '../dist/src/world.js';

test('production action settings persist a maximum of three choices and configure the next raid',async t=>{
 const env=browserStubs(t);await import('../dist/src/main.js?run-depth-controls');
 const shelter=env.ids.get('shelter-screen'),action=(name,key)=>{
  const button=shelter.children.find(b=>b.dataset.action===name&&(key===undefined||b.dataset.key===key));assert.ok(button);shelter.dispatch('click',{target:button});
 };
 action('shelterTab','rules');assert.equal(shelter.dataset.tab,'rules');
 assert.equal(shelter.children.filter(b=>b.dataset.action==='toggleMutator').length,10);
 for(const id of ['glass','no_dodge','rich'])action('toggleMutator',id);
 action('toggleMutator','fog');let saved=JSON.parse(env.window.localStorage.getItem(SAVE_KEY));assert.deepEqual(saved.selectedMutators,['no_dodge','rich','glass']);
 action('toggleMutator','rich');action('toggleMutator','scarcity');
 saved=JSON.parse(env.window.localStorage.getItem(SAVE_KEY));assert.deepEqual(saved.selectedMutators,['no_dodge','glass','scarcity']);
 action('start');assert.equal(env.document.body.dataset.screen,'raid');assert.equal(env.ids.get('health-value').textContent,75);
 assert.match(env.ids.get('heat-value').textContent,/热度 0/);assert.match(env.ids.get('form-label').textContent,/轻巧/);
 env.ids.get('extract-brief-button').dispatch('click');const dialog=env.ids.get('dialog');
 assert.equal(env.ids.get('overlay').hidden,false);assert.match(dialog.innerHTML,/行动已暂停/);assert.equal((dialog.innerHTML.match(/class="exit-brief-item"/g)||[]).length,4);
 dialog.dispatch('click',{target:dialog.children.find(b=>b.dataset.action==='close')});assert.equal(env.ids.get('overlay').hidden,true);
});

test('failed settings writes leave the saved plan and display unchanged',async t=>{
 const env=browserStubs(t),save=defaultSave();save.selectedMutators=['rich'];env.window.localStorage.setItem(SAVE_KEY,JSON.stringify(save));
 await import('../dist/src/main.js?run-depth-write-failure');
 env.window.localStorage.setItem=()=>{throw Error('disk full');};const shelter=env.ids.get('shelter-screen');
 const button=shelter.children.find(b=>b.dataset.action==='toggleMutator'&&b.dataset.key==='glass');shelter.dispatch('click',{target:button});
 assert.deepEqual(JSON.parse(env.window.localStorage.getItem(SAVE_KEY)).selectedMutators,['rich']);
 const plan=shelter.innerHTML.match(/本局词条：([^<]+)/)?.[1];assert.equal(plan,'高价悬赏');
});

test('fog paints a radial mask, hides distant hostile labels and disables laser red aiming under jamming',t=>{
 const env=browserStubs(t),raid=new Raid(defaultSave(),52,{mutators:['fog','jammed']}),renderer=new Renderer(env.canvas,env.ids.get('minimap'));
 raid.player.laser=makeEquipment('laser');raid.world.enemies=[createEnemy('near',raid.player.x+100,raid.player.y,4,'hunter'),createEnemy('far',raid.player.x+400,raid.player.y,4,'hunter')];
 for(const e of raid.world.enemies)Object.assign(e,{hunter:true,state:'windup',aimX:raid.player.x,aimY:raid.player.y,timer:.3});
 renderer.draw(raid,1,1/60);
 assert.equal(env.drawCalls.filter(c=>c.method==='createRadialGradient').length,1);
 assert.equal(env.drawCalls.filter(c=>c.method==='fillText'&&String(c.args[0]).includes('追猎 · ')).length,1);
 assert.ok(env.drawCalls.some(c=>c.method==='stroke'&&c.strokeStyle==='#ffffff66'));
 assert.equal(env.drawCalls.some(c=>c.method==='stroke'&&c.strokeStyle==='#ff5d65cc'),false);
 const ui=new UI(new Proxy({},{get:()=>()=>{}}));ui.update(raid,defaultSave(),true,false);assert.equal(env.ids.get('boss-hud').hidden,true);
});

test('charge warnings cover haste-adjusted charge travel for ordinary and phase-two bosses',t=>{
 const env=browserStubs(t),renderer=new Renderer(env.canvas,env.ids.get('minimap'));
 renderer.drawTelegraph({...createEnemy('charge',300,300,8,'charger'),timer:.2,windup:.6,aimX:600,aimY:300},1,1.12);
 const normal=env.drawCalls.find(c=>c.method==='fillRect');assert.ok(normal.args[2]>=560*.65*1.12);
 env.drawCalls.length=0;renderer.drawBossTelegraph({x:300,y:300,aimX:600,aimY:300,timer:.2,windup:.6,bossMove:'shadowdash',bossPhase:2},1.12);
 const boss=env.drawCalls.find(c=>c.method==='fillRect');assert.ok(boss.args[2]>=740*.7*1.12+42);
});

test('extraction intelligence explains locked requirements, route premiums and key location before opening',t=>{
 const env=browserStubs(t),ui=new UI(new Proxy({},{get:()=>()=>{}}));let raid;
 for(let seed=0;seed<20;seed++){raid=new Raid(defaultSave(),seed,{pressure:false});if(raid.world.exits.some(e=>e.kind==='boss'))break;}
 const gate=raid.world.exits.find(e=>e.kind==='boss'),guardian=raid.world.enemies.find(e=>e.id===gate.bossId);assert.ok(guardian);
 ui.exits(raid);const html=env.ids.get('dialog').innerHTML;
 assert.match(html,/每70秒开放40秒/);assert.doesNotMatch(html,/开放30秒/);assert.ok(html.includes(guardian.bossName));
 assert.match(html,/前沿钥卡箱：[东西南北]+ · 距离 \d+ · 未搜索/);
 assert.match(html,/路线奖励 \+8%/);assert.match(html,/路线奖励 \+10%/);assert.match(html,/路线奖励 \+15%/);assert.match(html,/标准收益/);assert.match(html,/秒后开放/);
 assert.equal(env.ids.get('dialog').children[0].dataset.action,'close');
 raid.world.enemies=raid.world.enemies.filter(enemy=>enemy!==guardian);raid.elapsed=gate.opensAt;ui.exits(raid);
 assert.ok(env.ids.get('dialog').innerHTML.includes('已击败守门首领：'+guardian.bossName));assert.equal(raid.extractionReady(gate),true);
});

test('shelter recap explains the earned route bonus and exposes a reproducible seed without personal data',t=>{
 const env=browserStubs(t),ui=new UI(new Proxy({},{get:()=>()=>{}}));ui.shelter(defaultSave(),{lastResult:{success:true,value:110,materials:{alloy:4,core:0},warehouse:{stored:1,pending:0},extractedVia:'key',exitBonus:.1,seed:1551,heat:42,mutators:['fog']}});
 const html=env.ids.get('shelter-screen').innerHTML;assert.match(html,/钥卡通道/);assert.match(html,/路线奖励 \+10%（币与材料）/);assert.match(html,/复盘种子 1551/);assert.match(html,/结束热度 42/);
});
