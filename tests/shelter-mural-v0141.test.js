import test from 'node:test';
import assert from 'node:assert/strict';
import { browserStubs } from './helpers/browser-stubs.js';

test('the illustrated shelter keeps eight tabs, twelve numbers and the restored portal launch path',async t=>{
  const env=browserStubs(t);
  await import('../dist/src/main.js?mural-portal-v0141');
  const shelter=env.ids.get('shelter-screen');
  const press=(action,key)=>shelter.dispatch('click',{target:shelter.children.find(b=>
    b.dataset.action===action&&(key===undefined||b.dataset.key===key))});
  assert.match(shelter.innerHTML,/class="shelter-stage">\s*<figure class="shelter-illustration">/);
  assert.match(shelter.innerHTML,/src="\.\/art\/shelter-workshop\.png"/);
  assert.match(shelter.innerHTML,/class="portal-hotspot" data-action="start"/);
  assert.match(shelter.innerHTML,/class="shelter-stage-card"/);
  assert.equal((shelter.innerHTML.match(/class="preview-number"/g)||[]).length,12);
  const tabs=shelter.innerHTML.split('<nav class="shelter-tabs"')[1].split('</nav>')[0];
  assert.equal((tabs.match(/data-action="shelterTab"/g)||[]).length,8);
  assert.match(tabs,/data-key="journal"/);
  press('selectMode','siege');
  assert.match(shelter.innerHTML,/class="portal-hotspot"[^>]+aria-label="启动核心防线，/);
  assert.equal(shelter.children.filter(b=>b.dataset.action==='start').length,2);
  press('start');
  assert.equal(env.document.body.dataset.screen,'raid');
  assert.equal(env.ids.get('siege-core').textContent,'核心 500 / 500 · 数字 2');
});

test('the shelter stage trial also opens the 20-second range under a Siege selection',async t=>{
  const env=browserStubs(t);
  await import('../dist/src/main.js?mural-trial-v0141');
  const shelter=env.ids.get('shelter-screen');
  shelter.dispatch('click',{target:shelter.children.find(b=>b.dataset.action==='selectMode'&&b.dataset.key==='siege')});
  const stage=shelter.innerHTML.split('<div class="shelter-stage-card">')[1].split('<div class="shelter-display">')[0];
  assert.match(stage,/data-action="startTraining">20 秒试射/);
  shelter.dispatch('click',{target:shelter.children.find(b=>b.dataset.action==='startTraining')});
  assert.equal(env.ids.get('time-value').textContent,'00:20');
  assert.equal(env.ids.get('siege-hud').hidden,true);
});
