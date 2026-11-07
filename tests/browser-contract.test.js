import test from 'node:test';
import assert from 'node:assert/strict';
import { browserStubs } from './helpers/browser-stubs.js';
import { Input } from '../dist/src/input.js';
import { Renderer } from '../dist/src/renderer.js';
import { UI } from '../dist/src/ui.js';
import { Raid } from './helpers/classic-raid.js';
import { defaultSave } from '../dist/src/storage.js';
import { makeEquipment, WEAPONS } from '../dist/src/equipment.js';
import { ENEMY_TYPES } from '../dist/src/config.js';
import { createEnemy } from '../dist/src/world.js';

// These are Node contract tests, not real browser or device validation.
test('mouse release does not cancel keyboard fire; key edges are consumed once', t => {
  const env = browserStubs(t), input = new Input(env.canvas, () => {}); input.active = true;
  env.window.dispatch('keydown', { code: 'Space', target: env.canvas });
  env.canvas.dispatch('pointerdown', { pointerType: 'mouse', button: 0, pointerId: 1, clientX: 450, clientY: 300 });
  env.window.dispatch('pointerup', { pointerId: 1 });
  assert.equal(input.consume().attack, true);
  env.window.dispatch('keyup', { code: 'Space' }); assert.equal(input.consume().attack, false);
  env.window.dispatch('keydown', { code: 'KeyF', target: env.canvas });
  assert.equal(input.consume().pickup, true); assert.equal(input.consume().pickup, false);
});

test('inventory shortcuts respect typing and blur clears all movement and firing', t => {
  const env = browserStubs(t); let opened = 0;
  const input = new Input(env.canvas, () => {}, () => opened++); input.active = true;
  env.window.dispatch('keydown', { code: 'KeyB', target: { tagName: 'INPUT' } }); assert.equal(opened, 0);
  env.window.dispatch('keydown', { code: 'KeyB', target: env.canvas }); assert.equal(opened, 1);
  env.window.dispatch('keydown', { code: 'KeyD', target: env.canvas });
  env.canvas.dispatch('pointerdown', { pointerType: 'mouse', button: 0, pointerId: 1, clientX: 600, clientY: 300 });
  env.window.dispatch('blur');
  const state = input.consume(); assert.equal(state.x, 0); assert.equal(state.attack, false); assert.equal(state.pointer, null);
});

test('releasing one touch fire control does not cancel another pointer', t => {
  const env = browserStubs(t), input = new Input(env.canvas, () => {}); input.active = true;
  const attack = env.controls.find(button => button.touch && button.dataset.control === 'Space');
  attack.dispatch('pointerdown', { pointerId: 11 }); attack.dispatch('pointerdown', { pointerId: 12 });
  attack.dispatch('pointerup', { pointerId: 11 });
  assert.equal(input.consume().attack, true); assert.equal(input.consume().autoAim, true);
  attack.dispatch('pointercancel', { pointerId: 12 }); assert.equal(input.consume().attack, false);
});

test('screen-to-world aiming accounts for the camera, CSS size and zoom without doubling DPR', t => {
  const env = browserStubs(t), renderer = new Renderer(env.canvas, env.ids.get('minimap'));
  renderer.camera = { x: 800, y: 600 }; renderer.scale = 0.9;
  assert.deepEqual(renderer.screenToWorld(550, 380), { x: 800, y: 600 });
  assert.deepEqual(renderer.screenToWorld(640, 560), { x: 900, y: 800 });
});

test('render paths cover all weapon types, enemy warnings and white/red aim guides with finite coordinates', t => {
  const env = browserStubs(t), renderer = new Renderer(env.canvas, env.ids.get('minimap'));
  const raid = new Raid(defaultSave(), 52);
  raid.world.enemies = Object.keys(ENEMY_TYPES).map((type, index) => {
    const enemy = createEnemy(type, raid.player.x+150+index*50, raid.player.y, 4, type);
    Object.assign(enemy, { state: 'windup', aimX: raid.player.x, aimY: raid.player.y, timer: 0.3 });
    return enemy;
  });
  for (const type of Object.keys(WEAPONS)) {
    raid.player.weapons[0] = makeEquipment('weapon', type, 'red'); raid.player.activeSlot = 0;
    renderer.draw(raid, 1, 1/60);
  }
  raid.world.spawnWarnings=[{x:raid.player.x+250,y:raid.player.y+80,readyAt:.8,duration:.9}];
  raid.player.weapons[0] = makeEquipment('weapon', 'rifle'); raid.player.laser = makeEquipment('laser');
  renderer.draw(raid, 1, 1/60);
  assert.ok(env.drawCalls.some(call => call.method === 'stroke' && call.strokeStyle === '#ffffff66'));
  assert.ok(env.drawCalls.some(call => call.method === 'stroke' && call.strokeStyle === '#ff5d65cc'));
  for(const site of raid.world.sites.slice(0,6)){
    raid.player.x=site.x;raid.player.y=site.y;renderer.camera={x:site.x,y:site.y};
    renderer.draw(raid,2,1/60);
  }
});

test('HUD and equipment dialog use actual HTML ids and display equipped values and quality labels', t => {
  const env = browserStubs(t), save = defaultSave(), raid = new Raid(save, 5);
  const actions = new Proxy({}, { get: () => () => {} });
  const ui = new UI(actions);
  raid.bag = [makeEquipment('weapon', 'sniper', 'purple', 'picked')];
  raid.player.armor = makeEquipment('armor', '', 'blue'); raid.player.laser = makeEquipment('laser');
  ui.update(raid, save, true, true); ui.inventory(raid);
  assert.match(env.ids.get('dialog').innerHTML, /紫品 · 狙击枪/);
  assert.match(env.ids.get('dialog').innerHTML, /data-action="equip0"/);
  assert.match(env.ids.get('laser-label').textContent, /红线/);
  assert.equal(Number(env.ids.get('loot-value').textContent), raid.carriedValue());
});

test('main module starts, routes Start and B inventory controls, and advances a frame without missing DOM contracts', async t => {
  const env = browserStubs(t);
  await import('../dist/src/main.js?contract-test-v03');
  const dialog=env.ids.get('dialog'),shelter=env.ids.get('shelter-screen');
  assert.match(shelter.innerHTML,/确认出击/);
  const help=shelter.children.find(button=>button.dataset.action==='help');
  shelter.dispatch('click',{target:help});
  assert.equal(env.ids.get('overlay').hidden,false);
  dialog.dispatch('click',{target:dialog.children.find(button=>button.dataset.action==='close')});
  assert.equal(env.document.activeElement,help);
  const start=shelter.children.find(button=>button.dataset.action==='start');
  shelter.dispatch('click',{target:start});
  assert.equal(env.document.body.dataset.screen,'raid');
  assert.equal(shelter.hidden,true);
  assert.equal(env.ids.get('raid-screen').hidden,false);
  assert.equal(env.ids.get('overlay').hidden, true);
  const frame = env.frames.find(callback => callback.name === 'frame'); assert.ok(frame);
  frame(100); frame(120);
  env.window.dispatch('keydown', { code: 'KeyB', target: env.canvas });
  assert.match(dialog.innerHTML, /局内装备/);
  env.window.dispatch('keydown', { code: 'KeyB', target: env.canvas });
  assert.equal(env.ids.get('overlay').hidden, true);
});

test('shelter difficulty and workshop selections persist and apply to the next expedition', async t => {
  const env=browserStubs(t),save=defaultSave();save.credits=1000;save.materials={alloy:100,core:10};
  env.window.localStorage.setItem('number-extraction-v11',JSON.stringify(save));
  await import('../dist/src/main.js?shelter-flow-v03');
  const shelter=env.ids.get('shelter-screen');
  const action=(name,key)=>shelter.dispatch('click',{target:shelter.children.find(button=>button.dataset.action===name&&(key===undefined||button.dataset.key===key))});
  action('upgradeFacility','workshop');
  shelter.dispatch('change',{target:{dataset:{action:'selectWeapon'},value:'smg'}});
  action('selectDifficulty','nightmare');
  const stored=JSON.parse(env.window.localStorage.getItem('number-extraction-v11'));
  assert.equal(stored.shelter.workshop,1);assert.equal(stored.selectedWeapon,'smg');assert.equal(stored.selectedDifficulty,'nightmare');
  assert.equal(stored.credits,880);assert.match(shelter.innerHTML,/12800 × 8000/);
  action('start');assert.equal(env.document.body.dataset.screen,'raid');assert.match(env.ids.get('mission-name').textContent,/零点噩梦/);
  assert.match(env.ids.get('quick-slot-0').innerHTML,/冲锋枪/);
});

test('ending a raid returns directly to the shelter and preserves banked resources', async t => {
  const env=browserStubs(t),save=defaultSave();save.credits=91;save.materials={alloy:8,core:2};
  env.window.localStorage.setItem('number-extraction-v11',JSON.stringify(save));
  await import('../dist/src/main.js?return-shelter-v03');
  const shelter=env.ids.get('shelter-screen'),dialog=env.ids.get('dialog');
  shelter.dispatch('click',{target:shelter.children.find(button=>button.dataset.action==='start')});
  env.window.dispatch('keydown',{code:'Escape',target:env.canvas});
  dialog.dispatch('click',{target:dialog.children.find(button=>button.dataset.action==='abandonAsk')});
  dialog.dispatch('click',{target:dialog.children.find(button=>button.dataset.action==='abandon')});
  assert.equal(env.document.body.dataset.screen,'shelter');assert.equal(env.ids.get('raid-screen').hidden,true);assert.equal(shelter.hidden,false);
  assert.match(shelter.innerHTML,/已返回庇护所/);assert.equal(env.ids.get('overlay').hidden,true);
  const stored=JSON.parse(env.window.localStorage.getItem('number-extraction-v11'));
  assert.equal(stored.credits,91);assert.deepEqual(stored.materials,{alloy:8,core:2});assert.equal(stored.deaths,1);
});

test('camera and minimap use the largest expedition bounds rather than the minimum map',t=>{
  const env=browserStubs(t),renderer=new Renderer(env.canvas,env.ids.get('minimap'));
  const raid=new Raid(defaultSave(),49,{difficulty:'nightmare'});raid.player.x=12000;raid.player.y=7400;
  renderer.camera={x:12000,y:7400};renderer.draw(raid,10,1/60);
  assert.ok(renderer.camera.x>11000);assert.ok(renderer.camera.y>7000);assert.equal(renderer.bounds.width,12800);
});
