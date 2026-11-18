import test from 'node:test';
import assert from 'node:assert/strict';
import { Raid } from '../dist/src/game.js';
import { createEnemy } from '../dist/src/world.js';
import { defaultSave } from '../dist/src/storage.js';
import { useNumberSkill } from '../dist/src/number-skills.js';
import { collisionRecoil, impactScale } from '../dist/src/impact-motion.js';
import { analyzePlaytestReports } from '../dist/src/playtest-analysis.js';
import { weaponBackground } from '../dist/src/game-art.js';
import { WEAPONS } from '../dist/src/equipment.js';

function raidFixture() {
  const raid = new Raid(defaultSave(), 51, { pressure: false });
  Object.assign(raid.player, { x: 1600, y: 1600, value: 64, aimAngle: 0 });
  Object.assign(raid.world, {
    obstacles: [], obstacleGrid: null, enemies: [], tiles: [], drops: [], hazards: [],
    nodes: [], projectiles: [], chests: []
  });
  return raid;
}

const enemyAt = (id, x, y, value) => createEnemy(id, x, y, value, 'hunter');

test('contact preserves damage and bounces the lower number farther', () => {
  const raid = raidFixture();
  raid.player.value = 16;
  const enemy = enemyAt('contact', 1637, 1600, 4);
  raid.clash(enemy);
  assert.equal(enemy.hp, 25);
  assert.equal(raid.player.hp, 87.5);
  assert.ok(raid.player.knockX < 0);
  assert.ok(enemy.knockX > -raid.player.knockX * 2);
  raid.clash(enemy);
  assert.equal(enemy.hp, 25);

  const equal = collisionRecoil(8, 8);
  const reverse = collisionRecoil(4, 16);
  assert.equal(equal.player, equal.enemy);
  assert.ok(reverse.player > reverse.enemy);
});

test('heavy impact squashes, overshoots and recovers along the direction of impact', () => {
  const motion = { style: 'heavy', time: 1, angle: .6, strength: 1 };
  assert.ok(impactScale(motion, 1).x < 1);
  assert.ok(impactScale(motion, 1.1).x > 1);
  assert.equal(impactScale(motion, 1.5).x, 1);
  assert.equal(impactScale(motion, 1).angle, .6);
});

test('matching remnants link without being spent and hit an intersecting enemy once', () => {
  const raid = raidFixture();
  raid.world.tiles = [
    { x: 1660, y: 1500, value: 32, remnant: true },
    { x: 1660, y: 1700, value: 32, remnant: true },
    { x: 1680, y: 1585, value: 32, remnant: true }
  ];
  const enemy = enemyAt('chain', 1660, 1610, 64);
  const outside = enemyAt('outside', 1780, 1610, 64);
  raid.world.enemies = [enemy, outside];
  assert.equal(useNumberSkill(raid, 'storm'), true);
  assert.equal(enemy.hp, 77.5);
  assert.equal(outside.hp, 100);
  assert.ok(raid.world.tiles.every(tile => !tile.dead));
  assert.equal(useNumberSkill(raid, 'storm'), false);
});

test('invalid chains respect walls and retain their cooldown', () => {
  const raid = raidFixture();
  raid.world.tiles = [
    { x: 1660, y: 1500, value: 32, remnant: true },
    { x: 1660, y: 1700, value: 16, remnant: true }
  ];
  assert.equal(useNumberSkill(raid, 'storm'), false);
  raid.world.tiles[1].value = 32;
  raid.world.obstacles = [{ x: 1654, y: 1590, w: 20, h: 20 }];
  assert.equal(useNumberSkill(raid, 'storm'), false);
  assert.equal(raid.player.skillCooldowns.storm, undefined);
});

test('gust respects number advantage and walls', () => {
  const raid = raidFixture();
  const low = enemyAt('low', 1670, 1600, 8);
  const high = enemyAt('high', 1600, 1670, 512);
  const covered = enemyAt('covered', 1490, 1600, 8);
  raid.world.enemies = [low, high, covered];
  raid.world.obstacles = [{ x: 1530, y: 1580, w: 10, h: 40 }];
  assert.equal(useNumberSkill(raid, 'gust'), true);
  assert.ok(low.knockX > high.knockY * 2);
  assert.equal(covered.knockX, 0);
});

test('blink stops before walls, cancels extraction progress and honours no dodge', () => {
  const raid = raidFixture();
  raid.world.obstacles = [{ x: 1700, y: 1550, w: 8, h: 100 }];
  raid.extractProgress = 2;
  assert.equal(useNumberSkill(raid, 'blink'), true);
  assert.ok(raid.player.x > 1600 && raid.player.x <= 1681);
  assert.equal(raid.extractProgress, 0);
  const locked = raidFixture();
  locked.run.noDodge = true;
  assert.equal(useNumberSkill(locked, 'blink'), false);
  assert.equal(locked.player.x, 1600);
});

test('fireball snapshots its number, explodes once and applies fire through the shared burn status', () => {
  const raid = raidFixture();
  const target = enemyAt('fire', 1700, 1600, 64);
  const distant = enemyAt('distant', 1840, 1800, 64);
  raid.world.enemies = [target, distant];
  assert.equal(useNumberSkill(raid, 'fireball'), true);
  raid.player.value = 8;
  for (let i = 0; i < 16; i++) raid.updateProjectiles(1 / 60);
  assert.ok(target.hp < 100);
  assert.equal(target.afflictions.burn.value, 64);
  assert.equal(distant.hp, 100);
  assert.equal(raid.world.projectiles.length, 0);
  assert.equal(raid.world.effects.filter(effect => effect.kind === 'impact').length, 1);
});

test('a skill pressed during hit stop is cast once when simulation resumes', () => {
  const raid = raidFixture();
  raid.hitStop = .03;
  raid.update(1 / 60, { skill: 'fireball' });
  raid.update(1 / 60, {});
  raid.update(1 / 60, {});
  assert.equal(raid.world.projectiles.length, 1);
  assert.ok(raid.player.skillCooldowns.fireball > 0);
});

test('safehouses prevent offensive number skills', () => {
  const raid = raidFixture();
  raid.safehouseAt = () => true;
  for (const skill of ['storm', 'gust', 'fireball']) {
    assert.equal(useNumberSkill(raid, skill), false);
    assert.equal(raid.player.skillCooldowns[skill], undefined);
  }
});

test('both journal versions import and all weapon types point to atlas cells', () => {
  const report = version => JSON.stringify({
    game: 'number-extraction-playtest', schema: 1, balanceVersion: version, runs: []
  });
  assert.equal(analyzePlaytestReports([report('0.11.1'), report('0.12.0')]).acceptedReportCount, 2);
  for (const weapon of Object.keys(WEAPONS)) assert.match(weaponBackground(weapon), /weapons(?:-extra)?\.png/);
});
