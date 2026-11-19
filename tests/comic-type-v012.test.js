import test from 'node:test';
import assert from 'node:assert/strict';
import { drawComicText } from '../dist/src/comic-type.js';
import { Renderer } from '../dist/src/renderer.js';
import { Raid } from '../dist/src/game.js';
import { defaultSave } from '../dist/src/storage.js';
import { createEnemy } from '../dist/src/world.js';
import { browserStubs } from './helpers/browser-stubs.js';

test('comic lettering fills a white face over both an outline and a black offset',t=>{
  const env=browserStubs(t);
  drawComicText(env.canvas.getContext('2d'),'护甲 −12',24,42,19,{impact:true});
  const outlines=env.drawCalls.filter(call=>call.method==='strokeText');
  const face=env.drawCalls.find(call=>call.method==='fillText');
  assert.equal(outlines.length,2);
  assert.ok(outlines.every(call=>call.strokeStyle==='#121216'));
  assert.ok(outlines[0].args[1]>24&&outlines[0].args[2]>42);
  assert.deepEqual(face.args,['护甲 −12',24,42]);
  assert.equal(face.fillStyle,'#fffefa');
  assert.match(face.font,/italic 900.*Arial Black.*Microsoft YaHei UI/);
});

test('battle damage, armour, enemy names and map labels share the same lettering',t=>{
  const env=browserStubs(t),raid=new Raid(defaultSave(),92,{layout:'tangram',pressure:false});
  Object.assign(raid.player,{x:1800,y:1400,value:2048});
  const enemy=createEnemy('type-test',1900,1400,128,'hunter');
  enemy.elite=true;
  Object.assign(raid.world,{enemies:[enemy],obstacles:[],obstacleGrid:null,tiles:[],chests:[]});
  raid.effect(1850,1400,'−36','#ff0000','text',.7,{heavy:true});
  raid.effect(1890,1410,'护甲 −8','#00ffff','text',.7);
  const renderer=new Renderer(env.canvas,env.ids.get('minimap'));
  renderer.camera={x:raid.player.x,y:raid.player.y};
  renderer.draw(raid,1);
  for(const caption of ['−36','护甲 −8','追猎者','2048','汽车','火车','直升机','火箭']){
    const strokes=env.drawCalls.filter(call=>call.method==='strokeText'&&call.args[0]===caption);
    const surfaces=env.drawCalls.filter(call=>call.method==='fillText'&&call.args[0]===caption);
    assert.equal(strokes.length,2,caption);
    assert.equal(surfaces.length,1,caption);
    assert.equal(surfaces[0].fillStyle,'#fffefa',caption);
  }
});
