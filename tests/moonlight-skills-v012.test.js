import test from 'node:test';
import assert from 'node:assert/strict';
import { NUMBER_SKILLS, researchSkill, toggleLoadoutSkill } from '../dist/src/skill-tree.js';
import { useNumberSkill } from '../dist/src/number-skills.js';
import { defaultSave, normalizeSave } from '../dist/src/storage.js';
import { Raid } from '../dist/src/game.js';
import { createEnemy } from '../dist/src/world.js';
import { detectsFlashlight } from '../dist/src/raid-light.js';
import { exitVehicle } from '../dist/src/raid-art.js';
import { Renderer } from '../dist/src/renderer.js';
import { browserStubs } from './helpers/browser-stubs.js';

function arena(save=defaultSave()){
  const raid=new Raid(save,914,{layout:'tangram',pressure:false});
  Object.assign(raid.world,{obstacles:[],obstacleGrid:null,terrain:[],terrainGrid:null,drops:[],enemies:[],tiles:[],chests:[],nodes:[],effects:[],projectiles:[]});
  Object.assign(raid.player,{x:3000,y:1800,aimAngle:0});
  return raid;
}

test('skills migrate, unlock through prerequisites and cap the active loadout at two',()=>{
  const save=normalizeSave({version:5,credits:450});
  assert.equal(save.unlockedSkills.length,4);
  assert.equal(Object.keys(NUMBER_SKILLS).length,28);
  assert.equal(researchSkill(save,'fork'),false);
  assert.equal(researchSkill(save,'spark'),true);
  assert.equal(researchSkill(save,'fork'),true);
  assert.equal(save.credits,130);
  assert.equal(toggleLoadoutSkill(save,'spark'),false);
  assert.equal(toggleLoadoutSkill(save,'storm'),true);
  assert.equal(toggleLoadoutSkill(save,'spark'),true);
  assert.deepEqual(normalizeSave(save).equippedSkills,['gust','spark']);
  assert.deepEqual(normalizeSave({...save,equippedSkills:['gust','gust','spark','fireball']}).equippedSkills,['gust','spark']);
});

test('all twenty-eight skills have a usable cast and cooldown',()=>{
  for(const id of Object.keys(NUMBER_SKILLS)){
    const raid=arena(),p=raid.player;
    p.value=16;
    raid.world.tiles=[{x:p.x+80,y:p.y-30,value:16,remnant:true},{x:p.x+150,y:p.y+30,value:16,remnant:true}];
    for(let i=0;i<3;i++)raid.world.enemies.push(createEnemy('target'+i,p.x+104+i*50,p.y+40,8));
    assert.equal(useNumberSkill(raid,id),true,id);
    assert.equal(p.skillCooldowns[id],NUMBER_SKILLS[id].cooldown,id);
    assert.equal(useNumberSkill(raid,id),false,id);
  }
});

test('only supplied slots cast and flashlight draws attention down the beam on moonlit runs',()=>{
  const raid=arena({...defaultSave(),nightMode:true,equippedSkills:['fireball','gust']});
  const p=raid.player;
  const enemy=createEnemy('far',p.x+590,p.y,4);
  raid.world.enemies=[enemy];
  raid.update(1/60,{skill:'blink'});
  assert.equal(p.skillCooldowns.blink,undefined);
  assert.equal(enemy.aggro,0);
  raid.update(1/60,{skill:0,flashlight:true});
  assert.equal(p.flashlight,true);
  assert.equal(detectsFlashlight(p,enemy),true);
  assert.ok(enemy.aggro>0);
  assert.equal(p.skillCooldowns.fireball>0,true);
  raid.update(1/60,{flashlight:true});
  assert.equal(p.flashlight,false);
  const day=arena();day.update(1/60,{flashlight:true});
  assert.equal(day.player.flashlight,false);
});

test('moonlit raid draws four distinct exit types and has no white aim guide',t=>{
  const env=browserStubs(t),raid=arena({...defaultSave(),nightMode:true});
  assert.equal(new Set(raid.world.exits.map(exit=>exitVehicle(exit).kind)).size,4);
  raid.player.flashlight=true;
  raid.player.aimTarget={x:raid.player.x+125,y:raid.player.y};
  const renderer=new Renderer(env.canvas,env.ids.get('minimap'));
  renderer.draw(raid,1);
  assert.ok(env.drawCalls.some(call=>call.method==='createRadialGradient'));
  env.drawCalls.length=0;
  renderer.drawAim(raid.player,raid.world);
  assert.equal(env.drawCalls.filter(call=>call.method==='lineTo').length,4);
  assert.ok(env.drawCalls.some(call=>call.method==='arc'&&call.args[2]===8));
});
