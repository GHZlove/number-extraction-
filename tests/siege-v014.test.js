import test from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../dist/src/input.js';
import { UI } from '../dist/src/ui.js';
import { Raid } from '../dist/src/game.js';
import { defaultSave } from '../dist/src/storage.js';
import { createEnemy } from '../dist/src/world.js';
import { defenderNumber, hasAffix, hiddenEnemy } from '../dist/src/enemy-tactics.js';
import { ENEMY_TYPES, RULES } from '../dist/src/config.js';
import { decorateWeapon, makeEquipment } from '../dist/src/equipment.js';
import { buySiegeSupply } from '../dist/src/commerce.js';
import { advanceConduits } from '../dist/src/siege-conduits.js';
import { readSiegeScores, saveSiegeScore } from '../dist/src/siege-scores.js';
import { numberShock } from '../dist/src/operations.js';
import { browserStubs } from './helpers/browser-stubs.js';

const raidFor=mode=>new Raid(defaultSave(),515,{mode,layout:'tangram',pressure:false,fieldSystems:false});
function empty(){
  const raid=raidFor('extraction');
  Object.assign(raid.world,{enemies:[],obstacles:[],exits:[],hazards:[],tiles:[],drops:[],projectiles:[],effects:[]});
  return raid;
}
function spawn(raid,kind,id,dx=100,dy=0,value=8){
  const e=createEnemy(id,raid.player.x+dx,raid.player.y+dy,value,kind);
  raid.world.enemies.push(e);return e;
}

test('a shieldbearer absorbs front damage, while flank, splash and divide bypass its angle guard',()=>{
  const raid=empty(),enemy=spawn(raid,'shieldbearer','shield');
  enemy.shieldFacing=Math.PI;const hp=enemy.hp,shield=enemy.shieldHp;
  raid.damageEnemy(enemy,8,{angle:0,weapon:'pistol'});
  assert.equal(enemy.hp,hp);assert.equal(enemy.shieldHp,shield-8);
  raid.damageEnemy(enemy,5,{angle:Math.PI,weapon:'pistol'});
  assert.equal(enemy.hp,hp-5);
  raid.damageEnemy(enemy,7,{angle:0,weapon:'rocket',splash:true});
  assert.equal(enemy.hp,hp-12);
  raid.divide();
  assert.equal(enemy.shieldHp,(shield-8)*.5);
  assert.ok(enemy.shieldBrokenUntil>raid.elapsed&&enemy.stun>0);
});

test('command aura influences allies, and a kamikaze can be defused without an explosion',()=>{
  const raid=empty(),commander=spawn(raid,'commander','leader',200,90),k=spawn(raid,'kamikaze','k',55);
  raid.tactics.prepare(raid);
  assert.equal(raid.tactics.commandFor(k),commander);
  assert.equal(raid.enemyCooldown(ENEMY_TYPES.kamikaze,k),.8);
  raid.updateEnemy(k,.05);assert.equal(k.state,'detonating');
  assert.equal(raid.interruptEnemy(k,.3),true);
  assert.ok(k.dead);assert.equal(raid.tactics.fire.length,0);
  assert.ok(raid.world.tiles.some(tile=>tile.remnant));
});

test('uncancelled kamikaze damages nearby players and creates short-lived fire',()=>{
  const raid=empty(),k=spawn(raid,'kamikaze','blast',54);
  raid.updateEnemy(k,.05);raid.updateEnemy(k,1);
  assert.ok(k.dead&&raid.player.hp<100);
  assert.equal(raid.tactics.fire.length,1);
  assert.equal(raid.tactics.fire[0].until,3);
});

test('healer chooses the highest injured number and stops if a player intercepts the ray',()=>{
  const raid=empty(),healer=spawn(raid,'healer','healer',118,100);
  const low=spawn(raid,'hunter','low',120,150,8),high=spawn(raid,'hunter','high',320,100,64);
  healer.cooldown=0;low.hp/=2;high.hp/=2;
  raid.updateEnemy(healer,.01);
  assert.equal(healer.healLink.ally,high);
  const initial=high.hp;
  raid.elapsed=.5;raid.updateEnemy(healer,.01);
  assert.equal(high.hp,initial+high.maxHp*.03);
  raid.player.x=(healer.x+high.x)/2;raid.player.y=healer.y;
  raid.updateEnemy(healer,.01);
  assert.equal(healer.healLink,null);
});

test('corrupting bullets change defender number, and a phase buff clears the condition',()=>{
  const raid=empty(),p=raid.player;p.value=16;
  const corruptor=spawn(raid,'corruptor','corruptor',75);
  raid.shoot(corruptor,Math.PI,500,200,'enemy',8);
  raid.updateProjectiles(.2);
  assert.equal(p.corrupted,4);assert.equal(defenderNumber(p),8);assert.equal(p.value,16);
  p.buffs.phase=2;raid.hitStop=0;raid.update(RULES.fixedStep);
  assert.equal(p.corrupted,0);
});

test('late fusion respects the affix cap, yields one host, and can be interrupted',()=>{
  const raid=empty(),a=spawn(raid,'hunter','a',120),b=spawn(raid,'hunter','b',165);
  a.waveId=b.waveId='same';
  a.affixes=['stealth','unstoppable','blazing'];b.affixes=['blazing','stealth'];
  raid.tactics.updateFusion(raid);raid.elapsed=1.5;raid.tactics.updateFusion(raid);
  assert.equal(a.state,'merging');assert.equal(raid.interruptEnemy(a,1),false);
  raid.elapsed=2;raid.tactics.updateFusion(raid);assert.equal(a.state,'merging');
  assert.equal(raid.interruptEnemy(b,.4),true);raid.tactics.updateFusion(raid);
  assert.ok(raid.events.some(event=>event.type==='enemy-fuse-break'));
  b.stun=0;raid.elapsed=2.3;raid.tactics.updateFusion(raid);
  raid.elapsed=3.9;raid.tactics.updateFusion(raid);raid.elapsed=5.5;raid.tactics.updateFusion(raid);
  assert.equal(a.value,16);assert.ok(b.dead);assert.equal(a.affixes.length,3);
  assert.equal(a.damageResistance,.85);assert.equal(a.rewardScale,2);assert.ok(a.hp>=a.maxHp*.8);
});

test('stealth is revealed half a second before a distant attack',()=>{
  const raid=empty(),e=spawn(raid,'corruptor','ghost',320);
  e.affixes=['stealth'];e.cooldown=0;
  assert.ok(hiddenEnemy(raid,e)&&hasAffix(e,'stealth'));
  raid.updateEnemy(e,.01);assert.equal(e.state,'idle');assert.equal(hiddenEnemy(raid,e),false);
  raid.elapsed=.51;raid.updateEnemy(e,.01);assert.equal(e.state,'windup');
});

test('siege day and night begin at the expected time with a 500 HP central core',()=>{
  const raid=raidFor('siege'),s=raid.siege;
  assert.equal(raid.player.value,2);assert.equal(s.core.maxHp,500);
  assert.equal(s.mines.length,12);assert.equal(new Set(s.mines.map(mine=>mine.kind)).size,4);
  raid.elapsed=29;s.update(raid,.02);assert.equal(raid.world.enemies.length,0);
  raid.elapsed=30;s.update(raid,.02);
  assert.ok(!s.day&&raid.nightMode&&raid.world.enemies.length>0);
  assert.equal(s.deadline,75);
  const e=raid.world.enemies[0];
  assert.equal(s.goalFor(raid,e),s.core);
  e.attackedUntil=35;assert.equal(s.goalFor(raid,e),raid.player);
  raid.elapsed=75;s.update(raid,.02);
  assert.ok(s.day);assert.equal(s.completed,1);assert.equal(raid.world.enemies.length,0);
  s.core.hp=1;s.hitStructure(raid,e,s.core);
  assert.equal(raid.status,'dead');assert.equal(raid.result.siege,1);
});

test('trader supplies deployment packs, then two same-tier neighbours combine for data',()=>{
  const raid=raidFor('siege'),s=raid.siege,p=raid.player;
  Object.assign(p,raid.world.merchants[0]);
  assert.ok(buySiegeSupply(raid,'siege-trader','turret'));
  p.x=s.core.x;p.y=s.core.y+300;p.aimAngle=0;
  assert.ok(s.deploy(raid));
  p.y+=68;assert.ok(s.deploy(raid));
  const [first,second]=s.buildings,data=s.data;
  assert.ok(s.merge(raid,first,second));
  assert.equal(first.value,4);assert.equal(s.buildings.length,1);assert.ok(s.data<data);
  assert.ok(raid.world.effects.some(fx=>fx.kind==='tile-fusion'&&fx.fusionTarget));
});

test('rails advance 90 units per second, fuse equal tiles and charge receivers',()=>{
  const raid=raidFor('siege'),s=raid.siege,source={id:'source',x:0,y:10,interval:4};
  const receiver={x:300,y:10,charge:0};
  s.conduits=[{id:'line',source,receiver,length:300}];
  const a={id:'a',fromMine:'source',conduit:'line',beltAt:0,value:2,x:0,y:10};
  raid.world.tiles=[a];advanceConduits(raid,s,1);
  assert.equal(a.x,90);
  const b={id:'b',fromMine:'source',conduit:'line',beltAt:75,value:2,x:75,y:10};
  raid.world.tiles.push(b);advanceConduits(raid,s,.2);
  assert.equal(a.value,4);assert.equal(b.dead,true);
  raid.elapsed=4;advanceConduits(raid,s,3);
  assert.equal(receiver.charge,4);
});

test('an actual beacon-enhanced tower hit can prime the player finish',()=>{
  const raid=raidFor('siege'),s=raid.siege,p=raid.player;
  p.weapons[0]=decorateWeapon(makeEquipment('weapon','pistol'),'frost',1);
  const e=spawn(raid,'hunter','hot',90);e.hp=e.maxHp=200;
  const tower={x:p.x,y:p.y,value:8,kind:'turret',enchantCooldowns:{}};
  s.hitTower(raid,tower,e,.5,'burn');
  assert.match(raid.synergies.cue(raid,e).text,/寒霜/);
  const action=raid.synergies.attack(p);
  raid.damageEnemy(e,5,{action,enchant:'frost',weapon:'pistol'});
  assert.ok(raid.events.some(event=>event.type==='synergy'&&event.pair==='thermal'));
});

test('scores merge retries locally and rank completed nights',()=>{
  const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  let records=saveSiegeScore(storage,[],{id:'a',wave:1,coreHp:90,seconds:75});
  records=saveSiegeScore(storage,records,{id:'a',wave:2,coreHp:66,seconds:150});
  records=saveSiegeScore(storage,records,{id:'b',wave:2,coreHp:71,seconds:151});
  assert.deepEqual(records.map(e=>e.id),['b','a']);assert.deepEqual(readSiegeScores(storage),records);
});

test('wide-screen 2048 shock reaches a visible corner and spares offscreen foes',()=>{
  const raid=empty(),p=raid.player;p.value=2048;
  const on=spawn(raid,'hunter','on',1120,240),off=spawn(raid,'hunter','off',100,-510);
  raid.actionView={left:0,right:p.x+1200,top:p.y-450,bottom:p.y+400};
  assert.ok(numberShock(raid));assert.ok(on.dead);assert.equal(off.dead,false);
});

test('a browser flow starts Siege from the normal shelter and renders the core without altering saved gear',async t=>{
  const env=browserStubs(t);await import('../dist/src/main.js?siege-v014');
  const shelter=env.ids.get('shelter-screen');
  shelter.dispatch('click',{target:shelter.children.find(b=>b.dataset.action==='selectMode'&&b.dataset.key==='siege')});
  assert.match(shelter.innerHTML,/最高夜数榜单/);
  shelter.dispatch('click',{target:shelter.children.find(b=>b.dataset.action==='start')});
  assert.equal(env.document.body.dataset.screen,'raid');
  assert.equal(env.ids.get('siege-core').textContent,'核心 500 / 500 · 数字 2');
  assert.equal(env.ids.get('time-value').textContent,'00:30');
  env.frames.shift()(90);
  assert.equal(env.window.localStorage.getItem('number-extraction-v11'),null);
  assert.ok(env.drawCalls.some(call=>call.method==='fillText'&&call.args[0]==='核心'));
});

function interactionMine(raid,kind){
  const {siege,player,world}=raid;
  world.merchants=[];
  siege.core.x+=300;
  const [mine]=siege.mines=[{id:'interaction-mine',kind,x:player.x,y:player.y,readyAt:0}];
  return mine;
}

test('the crystal node explains its passive boost without advertising an E action', t=>{
  const env=browserStubs(t),ui=new UI({});
  const raid=raidFor('siege'),s=raid.siege,save=defaultSave();
  interactionMine(raid,'crystal_node');
  const {data,alloy}=s;
  ui.update(raid,save,true,false);
  assert.equal(env.ids.get('interaction').hidden,false);
  assert.equal(env.ids.get('interaction-key').hidden,true);
  assert.equal(env.ids.get('siege-interact-button').hidden,true);
  assert.equal(env.ids.get('interaction-track').hidden,true);
  assert.match(env.ids.get('interaction-text').textContent,/自动加快 250 范围/);
  raid.updateInteraction({interactPressed:true},RULES.fixedStep);
  assert.deepEqual([s.data,s.alloy],[data,alloy]);
  assert.match(raid.lastMessage,/自动加快 250 范围/);
});

test('a quick E tap survives hit stop and the on-screen E button harvests the same vein', t=>{
  const env=browserStubs(t), input=new Input(env.canvas,()=>{}),ui=new UI({siegeInteract:()=>input.pressInteract()});
  const raid=raidFor('siege'),s=raid.siege,save=defaultSave(),mine=interactionMine(raid,'data_vein'),initial=s.data;
  input.active=true;
  ui.update(raid,save,true,false);
  const button=env.ids.get('siege-interact-button');
  assert.equal(button.hidden,false);
  assert.match(env.ids.get('interaction-text').textContent,/采集 数据矿脉/);
  button.focus();
  env.window.dispatch('keydown',{target:button,code:'KeyE'});
  env.window.dispatch('keyup',{target:button,code:'KeyE'});
  const tapped=input.consume();
  assert.equal(tapped.interact,false);
  assert.equal(tapped.interactPressed,true);
  raid.hitStop=RULES.fixedStep;
  raid.update(RULES.fixedStep,tapped);
  assert.equal(s.data,initial);
  raid.update(RULES.fixedStep,input.consume());
  assert.equal(s.data,initial+9);
  assert.match(raid.lastMessage,/数据币 \+9/);
  ui.update(raid,save,true,false);
  assert.match(env.ids.get('interaction-text').textContent,/3 秒后可采集/);

  button.dispatch('click');
  raid.updateInteraction(input.consume(),RULES.fixedStep);
  assert.equal(s.data,initial+9);
  assert.match(raid.lastMessage,/再次采集/);
  raid.elapsed=mine.readyAt;
  button.dispatch('click');
  raid.updateInteraction(input.consume(),RULES.fixedStep);
  assert.equal(s.data,initial+18);
});

test('holding E does not repeat a Siege action, even after its cooldown elapses',()=>{
  const raid=raidFor('siege'),s=raid.siege,mine=interactionMine(raid,'alloy_vein'),initial=s.alloy;
  raid.updateInteraction({interact:true,interactPressed:true},RULES.fixedStep);
  assert.equal(s.alloy,initial+6);
  raid.elapsed=mine.readyAt;
  raid.updateInteraction({interact:true},RULES.fixedStep);
  assert.equal(s.alloy,initial+6);
  raid.updateInteraction({interact:false},RULES.fixedStep);
  raid.updateInteraction({interact:true,interactPressed:true},RULES.fixedStep);
  assert.equal(s.alloy,initial+12);
});
