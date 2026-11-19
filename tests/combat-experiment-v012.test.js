import test from 'node:test';
import assert from 'node:assert/strict';
import { Raid } from '../dist/src/game.js';
import { defaultSave } from '../dist/src/storage.js';
import { decorateWeapon, makeEquipment } from '../dist/src/equipment.js';
import { createEnemy } from '../dist/src/world.js';
import { numberSkillPreview, useNumberSkill } from '../dist/src/number-skills.js';
import { updateNumberForm } from '../dist/src/run-rules.js';
import { Sound } from '../dist/src/audio.js';
import { NUMBER_SKILLS } from '../dist/src/skill-tree.js';
import { dailyChallenge, readDaily, recordDaily } from '../dist/src/daily.js';

function arena() {
  const raid = new Raid(defaultSave(), 42, { pressure: false, layout: 'tangram' });
  Object.assign(raid.world, { obstacles: [], enemies: [], exits: [], effects: [], projectiles: [], drops: [], tiles: [] });
  raid.player.value = 8;
  raid.random = () => .5;
  return raid;
}
function target(raid, id = 'target', dx = 150, dy = 0) {
  const enemy = createEnemy(id, raid.player.x + dx, raid.player.y + dy, 8);
  enemy.hp = enemy.maxHp = 100;
  raid.world.enemies.push(enemy);
  return enemy;
}
function weapon(id, enchant, kind = 'pistol') {
  return decorateWeapon(makeEquipment('weapon',kind,'white',id),enchant,1);
}
function act(raid, slot, seconds) {
  raid.elapsed = seconds;
  raid.switchWeapon(slot);
  const action = raid.synergies.attack(raid.player);
  const { enchant, rarity, level } = action.item;
  return { action, enchant, rarity, level, value: action.value };
}
const procs = raid => raid.events.filter(event => event.type === 'synergy');

test('distinct equipped weapons trigger thermal rupture in both explicit orders', () => {
  for (const [first, finish] of [['burn','frost'], ['frost','burn']]) {
    const raid = arena(), enemy = target(raid);
    raid.player.weapons = [weapon('one',first), weapon('two',finish)];
    raid.damageEnemy(enemy, 1, act(raid,0,0));
    assert.ok(raid.synergies.cue(raid,enemy));
    raid.damageEnemy(enemy, 1, act(raid,1,1));
    assert.deepEqual(procs(raid).map(event=>event.pair), ['thermal']);
    assert.equal(enemy.hp, 90.5);
    assert.equal(raid.synergies.cue(raid,enemy), null);
  }
});

test('expiry, equipment replacement, same slot and safehouse prevent thermal rupture', () => {
  for (const invalid of ['expired','replaced','same','safehouse']) {
    const raid = arena(), enemy = target(raid);
    raid.player.weapons = [weapon('one','burn'), weapon('two','frost')];
    raid.damageEnemy(enemy, 1, act(raid,0,0));
    if (invalid === 'replaced') {
      raid.bag.push(weapon('another','burn'));
      raid.equip(0,0);
    }
    if (invalid === 'safehouse') raid.safehouseAt = () => ({});
    const impact = act(raid,invalid === 'same' ? 0 : 1,invalid === 'expired' ? 3 : 1);
    raid.damageEnemy(enemy, 1, { ...impact, enchant:'frost' });
    assert.equal(procs(raid).length, 0, invalid);
  }
});

test('grounded circuit requires an actual interrupt and grants capped energy once for an action', () => {
  const raid = arena(), first=target(raid,'a'), second=target(raid,'b');
  raid.player.weapons = [weapon('one','stun'), weapon('two','energize')];
  first.state='windup';
  raid.damageEnemy(first, 1, act(raid,0,0));
  assert.equal(first.state,'idle');
  raid.player.enchantCooldowns.stun=0;
  raid.damageEnemy(second, 1, act(raid,0,.1));
  raid.player.energy=94;
  const follow = act(raid,1,1.2);
  raid.damageEnemy(first, 1, follow);
  assert.equal(raid.player.energy,100);
  assert.deepEqual(procs(raid).map(event=>event.bonus),[2]);
  raid.elapsed=1.3;
  raid.player.enchantCooldowns.energize=0;
  raid.damageEnemy(second,1,follow);
  assert.equal(procs(raid).length,1);
});

test('a burst snapshots one action across every projectile and respects shared attack cooldown', () => {
  const raid=arena();
  raid.player.weapons=[weapon('burst','frost','doublebarrel'),weapon('offhand','burn')];
  assert.ok(raid.attack());
  const shot=raid.world.projectiles[0];
  assert.ok(shot.action);
  raid.updateBursts(.5);
  assert.ok(raid.world.projectiles.length>1);
  assert.ok(raid.world.projectiles.every(bullet=>bullet.action===shot.action));
  raid.switchWeapon(1);
  assert.equal(raid.attack(),false);
});

test('skill previews report storm readiness and reuse the exact blink and aimed pulse positions', () => {
  const raid=arena();
  assert.equal(numberSkillPreview(raid,'storm').ready,false);
  raid.world.tiles=[40,80].map(dx=>({x:raid.player.x+dx,y:raid.player.y,value:8,remnant:true}));
  assert.equal(numberSkillPreview(raid,'storm').chain.length,2);
  for(const id of ['groundWire','thunder']) {
    raid.player.aimTarget={x:raid.player.x+147,y:raid.player.y};
    const preview=numberSkillPreview(raid,id);
    assert.ok(preview.ready);
    assert.ok(useNumberSkill(raid,id));
    const effect=raid.world.effects.at(-1);
    assert.deepEqual([effect.x,effect.y,effect.radius],[preview.target.x,preview.target.y,preview.radius]);
  }
  const blink=numberSkillPreview(raid,'blink');
  assert.ok(useNumberSkill(raid,'blink'));
  assert.deepEqual([raid.player.x,raid.player.y],[blink.target.x,blink.target.y]);
});

test('every skill has a synthesized sound', () => {
  const sound=new Sound();
  sound.context={currentTime:0};sound.enabled=true;
  let tones=0;sound.tone=()=>tones++;sound.noise=()=>{};
  for(const skill of Object.keys(NUMBER_SKILLS)) {
    sound.play('skill',{skill});sound.context.currentTime++;
  }
  assert.equal(tones,28);
});

test('divide favors aim over proximity, and the swept projectile grid covers distant and large enemies', () => {
  const raid=arena();
  const close=target(raid,'close',-18), far=target(raid,'far',187);
  far.value=64;
  assert.equal(raid.divideTarget(),far);
  raid.divide();assert.equal(far.value,32);assert.equal(close.value,8);
  const ranged=target(raid,'ranged',2150,43);
  ranged.radius=49;
  raid.shoot(raid.player,0,2500,2600,'player',8);
  raid.world.enemies=[ranged];
  raid.updateProjectiles(.9);
  assert.ok(ranged.hp<ranged.maxHp);
});

test('empty armor, laser and secondary slots equip on pickup even when the bag is full', () => {
  const raid=arena();
  assert.ok(raid.removeEquipment('secondary'));
  raid.capacity=1;
  for (const kind of ['armor','laser','weapon']) {
    const item={...makeEquipment(kind,'pistol','white',kind),x:raid.player.x,y:raid.player.y};
    raid.world.drops=[item];
    assert.ok(raid.pickupGear());
    assert.equal(item.dead,true);
    assert.equal(raid.equipmentCount(),1);
    assert.equal((kind==='weapon'?raid.player.weapons[1]:raid.player[kind]).id,kind);
  }
});

test('a number form announces its mobility and protection once per change', () => {
  const raid=arena();
  raid.player.value=256;
  updateNumberForm(raid);
  assert.match(raid.player.formNotice,/重装.*94%.*8%/);
  const effects=raid.world.effects.length;
  updateNumberForm(raid);
  assert.equal(raid.world.effects.length,effects);
});

test('UTC daily seeds, success-only local leaderboards and tie breaking are reproducible', () => {
  const challenge=dailyChallenge(new Date('2026-11-19T22:30:00Z'));
  assert.deepEqual(challenge,dailyChallenge(new Date('2026-11-19T01:00:00Z')));
  assert.notEqual(challenge.seed,dailyChallenge(new Date('2026-11-20T00:00:00Z')).seed);
  const data=new Map(), storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  let daily=readDaily(storage);
  for(const [id,value,seconds,success] of [['a',100,70,true],['b',80,61,true],['c',100,72,true],['fail',200,60,false]]) {
    daily=recordDaily(storage,daily,challenge,{id,value,seconds,success});
  }
  const entry=readDaily(storage).scores[challenge.date];
  assert.deepEqual(entry.value.map(row=>row.id),['a','c','b']);
  assert.deepEqual(entry.time.map(row=>row.id),['b','a','c']);
});
