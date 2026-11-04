import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, ENEMY_TYPES } from '../dist/src/config.js';
import { Raid } from '../dist/src/game.js';
import { attackDamage, damageFraction, distance } from '../dist/src/math.js';
import { createEnemy, generateWorld } from '../dist/src/world.js';
import { RARITIES, WEAPONS, makeEquipment, absorbDamage, spreadOf } from '../dist/src/equipment.js';
import { defaultSave, settleRun } from '../dist/src/storage.js';

function raid() {
  const r = new Raid(defaultSave(), 2468);
  Object.assign(r.world, { enemies: [], tiles: [], chests: [], obstacles: [], terrain: [], drops: [], projectiles: [] });
  r.random = () => 0.5;
  return r;
}
const near = (actual, expected) => assert.ok(Math.abs(actual-expected) < 1e-8, `${actual} != ${expected}`);
function enemy(r, value = 4, x = 200, y = 0, type = 'hunter') {
  const e = createEnemy(`enemy-${r.world.enemies.length}`, r.player.x+x, r.player.y+y, value, type);
  e.cooldown = 999; r.world.enemies.push(e); return e;
}
function advance(r, seconds, input = {}) {
  for (let i = 0; i < Math.ceil(seconds/RULES.fixedStep); i++) r.update(RULES.fixedStep, input);
}

test('white damage reproduces both directions of the requested examples', () => {
  near(attackDamage(8, 4), 50); near(attackDamage(4, 8), 25);
  near(attackDamage(16, 4), 75); near(attackDamage(4, 16), 12.5);
  near(attackDamage(32, 4), 87.5); near(attackDamage(4, 32), 6.25);
  near(attackDamage(4, 4), 25);
  near(attackDamage(8, 4, 200), 100);
  assert.equal(damageFraction(0, 4), 0);
  assert.equal(damageFraction(3, 4), 0);
});

test('six quality tiers increase the base damage by 20 percentage points per tier', () => {
  const expected = { white: 50, yellow: 60, green: 70, blue: 80, purple: 90, red: 100 };
  for (const [rarity, damage] of Object.entries(expected)) near(attackDamage(8, 4, 100, rarity), damage);
  assert.equal(RARITIES.length, 6);
});

for (const [playerValue, expectedEnemyHp, expectedPlayerHp] of [[8, 50, 75], [16, 25, 87.5]]) {
  test(`body contact exchanges damage simultaneously: ${playerValue} versus 4`, () => {
    const r = raid(); r.player.value = playerValue;
    const e = enemy(r, 4, 35);
    r.update(RULES.fixedStep, {});
    near(e.hp, expectedEnemyHp); near(r.player.hp, expectedPlayerHp);
    advance(r, 0.2);
    near(e.hp, expectedEnemyHp); near(r.player.hp, expectedPlayerHp);
  });
}

test('armor absorbs a fraction, spends durability and cannot absorb more than it has', () => {
  const armor = makeEquipment('armor', '', 'white');
  const hit = absorbDamage(50, armor);
  near(hit.damage, 40); near(hit.blocked, 10); near(hit.durability, 30);
  armor.durability = 3;
  const broken = absorbDamage(50, armor);
  near(broken.damage, 47); near(broken.durability, 0);
  near(absorbDamage(50, { ...armor, durability: 0 }).damage, 50);
  const r = raid(); r.player.armor = armor; r.hurt(50);
  near(r.player.hp, 53); near(r.player.armor.durability, 0);
});

test('contact quality and armor are applied on each side independently', () => {
  const r = raid(); r.player.value = 8;
  r.player.weapons[0] = makeEquipment('weapon', 'pistol', 'yellow');
  const e = enemy(r, 4, 35); e.armor = makeEquipment('armor', '', 'white');
  r.update(RULES.fixedStep, {});
  near(e.hp, 52); near(e.armor.durability, 28); near(r.player.hp, 75);
});

for (const type of ['pistol', 'smg', 'rifle', 'sniper']) {
  test(`${type} fires a real directional projectile using the white damage rule`, () => {
    const r = raid(); r.player.value = 8;
    r.player.weapons[0] = makeEquipment('weapon', type, 'white');
    const e = enemy(r, 4, 180);
    r.attack(); assert.equal(e.hp, 100); assert.equal(r.world.projectiles.length, 1);
    r.updateProjectiles(1);
    near(e.hp, 50);
  });
}

test('aiming away misses an enemy and changing aim determines the hit direction', () => {
  const r = raid(), e = enemy(r, 1, 150);
  r.player.aimAngle = Math.PI/2;
  r.attack(); r.updateProjectiles(0.5); near(e.hp, 100);
  r.player.attackCooldown = 0; r.player.aimAngle = 0;
  r.attack(); r.updateProjectiles(0.5); near(e.hp, 75);
});

test('projectiles hit the nearest target once, including long single-frame movement', () => {
  const r = raid(), a = enemy(r, 1, 80), b = enemy(r, 1, 160);
  r.player.weapons[0] = makeEquipment('weapon', 'sniper', 'white');
  r.attack(); r.updateProjectiles(0.4);
  near(a.hp, 75); near(b.hp, 100);
});

test('walls block bullets, but an enemy before the wall is hit first', () => {
  for (const [position, expected] of [[80, 75], [180, 100]]) {
    const r = raid(), e = enemy(r, 1, position);
    r.world.obstacles = [{ x: r.player.x+120, y: r.player.y-100, w: 10, h: 200 }];
    r.attack(); r.updateProjectiles(0.5); near(e.hp, expected);
  }
});

test('melee attacks use their direction, arc and range rather than automatic nearest targeting', () => {
  const r = raid(); r.player.value = 8; r.switchWeapon(1);
  const front = enemy(r, 4, 110), behind = enemy(r, 4, -70);
  r.attack(); near(front.hp, 50); near(behind.hp, 100);
  r.player.weapons[1] = makeEquipment('weapon', 'dualblades', 'white');
  r.player.attackCooldown = 0; r.attack(); near(front.hp, 50);
  front.x = r.player.x+60; r.player.attackCooldown = 0; r.attack();
  assert.equal(front.dead, true); near(behind.hp, 100);
});

test('a laser narrows the actual projectile spread by 70 percent', () => {
  const gun = makeEquipment('weapon', 'smg', 'white'), laser = makeEquipment('laser');
  near(spreadOf(gun, laser), spreadOf(gun, null)*0.3);
  const angles = [];
  for (const installed of [false, true]) {
    const r = raid(); r.random = () => 1; r.player.weapons[0] = gun;
    r.player.laser = installed ? laser : null; r.attack();
    angles.push(Math.atan2(r.world.projectiles[0].vy, r.world.projectiles[0].vx));
  }
  near(angles[1], angles[0]*0.3);
});

test('switching weapons or equipping does not bypass an active attack cooldown', () => {
  const r = raid(); r.attack(); const cooldown = r.player.attackCooldown;
  r.switchWeapon(1); assert.equal(r.attack(), false);
  r.bag.push(makeEquipment('weapon', 'dualblades', 'red', 'replacement'));
  assert.equal(r.equip(0, 1), true); assert.equal(r.attack(), false);
  near(r.player.attackCooldown, cooldown);
});

test('equipping swaps owned items without duplicating them and retains armor durability', () => {
  const r = raid();
  r.player.weapons[0] = makeEquipment('weapon', 'pistol', 'yellow', 'old');
  r.bag = [makeEquipment('weapon', 'rifle', 'blue', 'new')];
  assert.equal(r.equip(0, 0), true); assert.equal(r.player.weapons[0].id, 'new');
  assert.deepEqual(r.bag.map(item => item.id), ['old']);
  r.player.armor = { ...makeEquipment('armor', '', 'white', 'old-armor'), durability: 7 };
  r.bag.push(makeEquipment('armor', '', 'blue', 'new-armor'));
  r.equip(1); assert.equal(r.bag[1].id, 'old-armor'); assert.equal(r.bag[1].durability, 7);
  r.equip(1); assert.equal(r.player.armor.durability, 7);
});

test('invalid equipment actions and full-bag removal preserve ownership', () => {
  const r = raid(); r.player.laser = makeEquipment('laser', '', 'white', 'scope');
  r.bag = Array.from({ length: r.capacity }, () => ({ name: 'loot', value: 1, kind: 'loot' }));
  const before = JSON.stringify({ bag: r.bag, laser: r.player.laser });
  assert.equal(r.removeEquipment('laser'), false); assert.equal(r.equip(0), false);
  assert.equal(r.equip(-1), false); assert.equal(r.equip(0.5), false);
  assert.equal(JSON.stringify({ bag: r.bag, laser: r.player.laser }), before);
});

test('F picks up one reachable equipment item; full bags leave it on the ground', () => {
  const r = raid();
  const item = { ...makeEquipment('weapon', 'rifle', 'green', 'field'), x: r.player.x+40, y: r.player.y, dead: false };
  r.world.drops = [item]; r.bag = Array.from({ length: r.capacity }, () => ({ name: 'data', value: 1 }));
  assert.equal(r.pickupGear(), false); assert.equal(item.dead, false);
  r.bag.pop(); assert.equal(r.pickupGear(), true); assert.equal(item.dead, true);
  assert.equal(r.bag.filter(gear => gear.id === 'field').length, 1);
  assert.equal(r.pickupGear(), false);
});

test('gear pickup is blocked by a wall and does not auto-collect without F', () => {
  const r = raid(), item = { ...makeEquipment('armor'), x: r.player.x+40, y: r.player.y, dead: false };
  r.world.drops = [item]; r.update(RULES.fixedStep, {}); assert.equal(r.bag.length, 0);
  r.world.obstacles = [{ x: r.player.x+20, y: r.player.y-30, w: 10, h: 60 }];
  assert.equal(r.pickupGear(), false); assert.equal(item.dead, false);
});

test('extracted equipped gear is converted once; a new raid starts with fresh starter weapons', () => {
  const save = defaultSave(), r = raid();
  const gun = makeEquipment('weapon', 'rifle', 'yellow', 'extract-gun');
  const armor = makeEquipment('armor', '', 'green', 'extract-armor');
  r.bag = [gun, armor, { name: 'data', kind: 'loot', value: 24 }];
  r.equip(0, 0); r.equip(0);
  const value = gun.value+armor.value+24;
  assert.equal(r.carriedValue(), value); r.finish(true, 'test extraction');
  assert.equal(r.result.value, value); assert.equal(settleRun(save, r.result), true);
  assert.equal(settleRun(save, r.result), false); assert.equal(save.credits, value);
  const next = new Raid(save, 999);
  assert.equal(next.player.armor, null); assert.equal(next.player.laser, null);
  assert.ok(next.player.weapons.every(item => item.starter && item.rarity === 'white'));
});

test('death does not bank the value of equipped weapons or armor', () => {
  const r = raid(), save = defaultSave(); save.credits = 17;
  r.player.weapons[0] = makeEquipment('weapon', 'sniper', 'red');
  r.finish(false, 'defeat'); settleRun(save, r.result);
  assert.equal(save.credits, 17); assert.equal(save.deaths, 1);
});

test('the tutorial armory drops a rifle, armor and laser exactly once', () => {
  const r = new Raid(defaultSave(), 77); r.world.enemies = [];
  const box = r.world.chests.find(item => item.id === 'starter-armory');
  r.player.x = box.x; r.player.y = box.y; advance(r, 0.9, { interact: true });
  assert.equal(box.opened, true);
  assert.equal(r.world.drops.filter(item => item.id.startsWith('tutorial-')).length, 3);
  advance(r, 1, { interact: true });
  assert.equal(r.world.drops.filter(item => item.id.startsWith('tutorial-')).length, 3);
});

test('scatter enemies fire a fan and snipers fire a faster aimed projectile', () => {
  const velocities = [];
  for (const type of ['gunner', 'sniper']) {
    const r = raid(), e = enemy(r, 4, 250, 0, type);
    Object.assign(e, { state: 'windup', timer: 0.001, aimX: r.player.x, aimY: r.player.y });
    r.updateEnemy(e, RULES.fixedStep);
    assert.equal(r.world.projectiles.length, type === 'gunner' ? 3 : 1);
    const bullet = r.world.projectiles[0]; velocities.push(Math.hypot(bullet.vx, bullet.vy));
    if (type === 'gunner') assert.notEqual(r.world.projectiles[0].vy, r.world.projectiles[2].vy);
  }
  assert.ok(velocities[1] > velocities[0]*3);
});

test('a charge is telegraphed, moves, stops at walls and is interruptible by division', () => {
  const r = raid(), e = enemy(r, 8, 250, 0, 'charger');
  Object.assign(e, { state: 'windup', timer: 0.001, aimX: r.player.x, aimY: r.player.y });
  r.updateEnemy(e, RULES.fixedStep); assert.equal(e.state, 'charge');
  const start = e.x;
  r.world.obstacles = [{ x: r.player.x+120, y: r.player.y-200, w: 10, h: 400 }];
  for (let i = 0; i < 45; i++) r.updateEnemy(e, RULES.fixedStep);
  assert.ok(e.x < start); assert.ok(e.x >= r.player.x+151-0.01);
  r.world.obstacles = []; e.x = r.player.x+100; e.state = 'charge'; e.chargeTime = 0.5;
  r.divide(); assert.equal(e.state, 'idle'); assert.equal(e.chargeTime, 0); assert.ok(e.stun > 0);
});

test('blast attacks use the warned position so moving away avoids the explosion', () => {
  for (const dodged of [false, true]) {
    const r = raid(), e = enemy(r, 1, 220, 0, 'bomber');
    Object.assign(e, { state: 'windup', timer: 0.001, aimX: r.player.x, aimY: r.player.y });
    if (dodged) r.player.y += 200;
    r.updateEnemy(e, RULES.fixedStep);
    near(r.player.hp, dodged ? 100 : 75);
  }
});

test('water affects simulation movement rather than only changing map appearance', () => {
  const dry = raid(), wet = raid(), start = { ...dry.player };
  wet.world.terrain = [{ x: 0, y: 0, w: 2000, h: 2000, kind: 'water' }];
  advance(dry, 1, { x: 1 }); advance(wet, 1, { x: 1 });
  near(distance(start, wet.player), distance(start, dry.player)*0.58);
});

test('generated maps vary terrain and contain all six enemy patterns and weapon types', () => {
  const types = new Set(), weapons = new Set(), rarities = new Set(), terrain = new Set();
  for (let seed = 0; seed < 40; seed++) {
    const world = generateWorld(seed);
    world.enemies.forEach(item => types.add(item.type));
    world.terrain.forEach(item => terrain.add(item.kind));
    const items = [...world.drops, ...world.chests.flatMap(box => box.gear || [])];
    for (const item of items) { if (item.weapon) weapons.add(item.weapon); rarities.add(item.rarity); }
    assert.ok(world.obstacles.some(item => item.material === 'ruin' || item.material === 'warehouse'));
  }
  assert.deepEqual([...types].sort(), Object.keys(ENEMY_TYPES).sort());
  assert.deepEqual([...weapons].sort(), Object.keys(WEAPONS).sort());
  assert.equal(rarities.size, 6); assert.deepEqual([...terrain].sort(), ['mud', 'water']);
  assert.notDeepEqual(generateWorld(1).obstacles, generateWorld(2).obstacles);
});
