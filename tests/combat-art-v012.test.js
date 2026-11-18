import test from 'node:test';
import assert from 'node:assert/strict';
import { Raid } from '../dist/src/game.js';
import { defaultSave } from '../dist/src/storage.js';
import { createEnemy } from '../dist/src/world.js';
import { ENEMY_TYPES } from '../dist/src/config.js';
import { makeEquipment } from '../dist/src/equipment.js';
import { projectileColor, playerShotColor, setWeaponMotion, weaponPose, drawProjectile } from '../dist/src/combat-art.js';
import { numberColor } from '../dist/src/number-tiles.js';
import { browserStubs } from './helpers/browser-stubs.js';

function range() {
  const raid = new Raid(defaultSave(), 24, { layout: 'tangram', pressure: false, runRules: false });
  raid.world.enemies = [];
  raid.world.obstacles = [];
  raid.world.obstacleGrid = null;
  return raid;
}

test('shot colours use the fired level or number snapshot and change side on reflection', () => {
  const raid = range();
  const p = raid.player;
  p.weapons[0] = { ...makeEquipment('weapon','pistol','blue','test'), level: 4 };
  raid.attack();
  const bullet = raid.world.projectiles[0];
  p.weapons[0].level = 5;
  assert.equal(projectileColor(bullet), playerShotColor(4));
  assert.equal(new Set([1, 2, 3, 4, 5].map(playerShotColor)).size, 5);

  raid.world.projectiles = [];
  const enemy = createEnemy('shooter', p.x + 110, p.y, 64, 'gunner');
  raid.shoot(enemy, Math.PI, 700, 900, 'enemy', enemy.value);
  const shot = raid.world.projectiles[0];
  enemy.value = 32;
  assert.equal(projectileColor(shot), numberColor(64));
  p.parryWindow = .18;
  raid.updateProjectiles(.2);
  assert.equal(shot.owner,'player');
  assert.equal(projectileColor(shot),playerShotColor(5));
  assert.equal(shot.level,1);
  assert.equal(p.hp,100);
});

test('heavy gun kick and alternating blades follow the weapon action only', () => {
  const p = {};
  const light = setWeaponMotion(p, 'smg', 0, 0);
  const heavy = setWeaponMotion(p, 'sniper', 0, 0);
  assert.ok(weaponPose(heavy,'sniper',0,0,false).x < weaponPose(light,'smg',0,0,false).x);
  assert.equal(weaponPose(heavy,'sniper',0,.5,false).x,0);
  assert.equal(weaponPose(heavy,'sniper',0,0,true).x,0);
  const one = setWeaponMotion(p,'dualblades',0,1);
  const two = setWeaponMotion(p,'dualblades',0,1.3);
  assert.equal(one.side,-two.side);
  assert.ok(weaponPose(one,'dualblades',0,1.07,false).angle *
    weaponPose(two,'dualblades',0,1.37,false).angle < 0);
  const thrust = setWeaponMotion(p,'spear',0,2);
  assert.ok(weaponPose(thrust,'spear',0,2.12,false).x > 12);
});

test('enemy ranged launches and targeted blasts create matching effects', () => {
  const raid = range(), p = raid.player;
  const enemy = createEnemy('bomber', p.x+210, p.y, 16, 'bomber');
  enemy.aimX=p.x+120;
  enemy.aimY=p.y;
  raid.resolveEnemyAttack(enemy,ENEMY_TYPES.bomber);
  const impact = raid.world.effects.find(effect=>effect.kind==='enemy-impact');
  assert.equal(impact.radius,118);
  assert.equal(impact.x,enemy.aimX);
  raid.resolveEnemyAttack(enemy,ENEMY_TYPES.gunner);
  const flash = raid.world.effects.find(effect=>effect.kind==='muzzle');
  assert.equal(flash.color,numberColor(enemy.value));
  assert.equal(raid.world.projectiles.length,3);
});

test('enemy projectiles use a diamond while player projectiles use a capsule', t => {
  const env = browserStubs(t), c = env.canvas.getContext('2d');
  const bullet = { x:12,y:14,vx:700,vy:0,radius:6,owner:'enemy',value:32 };
  drawProjectile(c,bullet,true);
  assert.ok(env.drawCalls.some(call=>call.method==='closePath'));
  env.drawCalls.length=0;
  drawProjectile(c,{ ...bullet, owner:'player',level:3 },true);
  assert.ok(env.drawCalls.some(call=>call.method==='roundRect'));
  assert.equal(env.drawCalls.some(call=>call.method==='lineTo'),false);
});
