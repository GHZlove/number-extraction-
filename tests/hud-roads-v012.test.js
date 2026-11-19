import test from 'node:test';
import assert from 'node:assert/strict';
import { Raid } from '../dist/src/game.js';
import { defaultSave } from '../dist/src/storage.js';
import { DIFFICULTIES, PRESSURE } from '../dist/src/config.js';
import { roadNetwork, roadBridges, drawRoadNetwork } from '../dist/src/roads.js';
import { pressureProfile } from '../dist/src/pressure.js';
import { UI } from '../dist/src/ui.js';
import { browserStubs } from './helpers/browser-stubs.js';

test('the frame warns below twenty percent and a hit refreshes the red health meter',t=>{
  const env=browserStubs(t), ui=new UI({});
  const player={hp:20,maxHp:100};
  ui.updateHealth(player);
  assert.equal(env.ids.get('low-health-border').hidden,true);
  player.hp=19;ui.hit(player);
  assert.equal(env.ids.get('health-meter')['aria-valuenow'],19);
  assert.equal(env.ids.get('health-bar').style.width,'19%');
  assert.equal(env.ids.get('low-health-border').hidden,false);
  assert.equal(env.ids.get('arena').classList.contains('health-hit'),true);
  ui.updateHealth(player,true);
  assert.equal(env.ids.get('low-health-border').hidden,true);
});

test('the extraction clock follows presence in the exit while the raid clock stays active',t=>{
  const env=browserStubs(t),ui=new UI({}),save=defaultSave();
  const raid=new Raid(save,92,{layout:'tangram',pressure:false});
  const exit=raid.world.exits[0];
  ui.update(raid,save,true,false);
  assert.equal(env.ids.get('exit-timer').hidden,true);
  assert.equal(env.ids.get('time-value').textContent,'04:00');
  assert.doesNotMatch(env.ids.get('form-label').textContent,/\d/);
  Object.assign(raid.player,{x:exit.x,y:exit.y});
  ui.update(raid,save,true,false);
  assert.equal(env.ids.get('exit-timer').hidden,false);
  assert.match(env.ids.get('extract-time').textContent,/00:45/);
  raid.elapsed=raid.difficulty.extractAt+2;raid.extractProgress=1.5;
  ui.update(raid,save,true,false);
  assert.match(env.ids.get('exit-status').textContent,/汽车撤离/);
  assert.equal(env.ids.get('extract-time').textContent,'2.5s');
  raid.player.x+=exit.radius+5;
  ui.update(raid,save,true,false);
  assert.equal(env.ids.get('exit-timer').hidden,true);
});

test('the crossroads connect to the main spine and bridges require an actual crossing',t=>{
  const env=browserStubs(t),bounds={width:6400,height:4000},east={x:6000,y:2880};
  const {routes,roads}=roadNetwork(bounds,east);
  assert.deepEqual(routes[0].at(-1),[east.x,east.y]);
  assert.equal(routes[1][0][0],routes[0][2][0]);
  assert.equal(routes[2].at(-1)[1],east.y);
  assert.equal(roadBridges(roads,{x:100,y:2750,w:100,h:400}).length,0);
  const joins=roadBridges(roads,{x:3400,y:2700,w:220,h:550});
  assert.equal(joins.length,1);
  assert.deepEqual([joins[0].axis,joins[0].y,joins[0].h],['x',east.y-100,200]);
  drawRoadNetwork(env.canvas.getContext('2d'),routes);
  assert.equal(env.drawCalls.filter(call=>call.method==='bezierCurveTo').length,3);
});

test('scout density leaves three base guards per site and the field patrol cap is seven',()=>{
  const raid=new Raid(defaultSave(),102,{layout:'tangram',pressure:false});
  assert.equal(PRESSURE.patrolCap,7);
  assert.equal(pressureProfile(DIFFICULTIES[0],0).nearCap,24);
  assert.ok(raid.world.sites.every((site,index)=>
    raid.world.enemies.filter(enemy=>enemy.siteId===index).length<=3+site.zone));
});
