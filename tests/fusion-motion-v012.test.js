import test from 'node:test';
import assert from 'node:assert/strict';
import { Raid } from '../dist/src/game.js';
import { drawTileFusion, fusionPose } from '../dist/src/fusion-motion.js';
import { RULES } from '../dist/src/config.js';
import { defaultSave } from '../dist/src/storage.js';
import { browserStubs } from './helpers/browser-stubs.js';

test('merging a tile and recycling a remnant trigger fusion without delaying either reward', () => {
  const raid = new Raid(defaultSave(), 895, { layout: 'tangram', runRules: false, pressure: false });
  const p = raid.player;
  raid.world.enemies = [];
  raid.world.drops = [];
  const tile = { id: 'equal', x: p.x + 18, y: p.y, value: 1 };
  const remnant = { id: 'smaller', x: p.x, y: p.y + 22, value: 1, remnant: true, coins: 4 };
  raid.world.tiles = [tile, remnant];
  p.hp = 50;
  raid.update(RULES.fixedStep);
  assert.equal(tile.dead, true);
  assert.equal(remnant.dead, true);
  assert.equal(p.value, 2);
  assert.equal(p.hp, 58);
  assert.equal(raid.merges, 1);
  assert.equal(raid.recycledValue, 4);
  const effects = raid.world.effects.filter(effect => effect.kind === 'tile-fusion');
  assert.deepEqual(effects.map(effect => [effect.x, effect.y, effect.recycled]), [
    [tile.x, tile.y, false], [remnant.x, remnant.y, true],
  ]);
  for (let i = 0; i < 30; i++) raid.update(RULES.fixedStep);
  assert.equal(raid.world.effects.some(effect => effect.kind === 'tile-fusion'), false);
});

const duration = .46;
const player = { x: 60, y: 50 };
const effectAt = age => ({
  x: 96, y: 50, originX: player.x, originY: player.y,
  radius: 19, value: 4, color: '#c8ffe9', recycled: false, life: duration-age, maxLife: duration,
});

test('the droplet moves inward and its ripple grows outward from inside the body', () => {
  const start = fusionPose(effectAt(0), player);
  const midway = fusionPose(effectAt(.11), player);
  const joined = fusionPose(effectAt(.22), player);
  const dissipating = fusionPose(effectAt(.39), player);
  assert.equal(start.x, 96);
  assert.ok(midway.x > player.x && midway.x < start.x);
  assert.ok(midway.liquid > start.liquid && midway.size < start.size);
  assert.equal(joined.x, player.x);
  assert.ok(midway.deformation.x > 1 && midway.deformation.y < 1);
  assert.ok(joined.radius < dissipating.radius);
  assert.ok(start.radius < effectAt(0).radius);
  assert.equal(dissipating.deformation, null);
  const blink = fusionPose(effectAt(.22), { x: 500, y: 400 });
  assert.equal(blink.x, player.x);
  assert.equal(blink.deformation, null);
});

test('regular drawing uses a curved liquid neck and reduced motion uses a fixed fading ring', t => {
  const env = browserStubs(t);
  const ctx = env.canvas.getContext('2d');
  drawTileFusion(ctx, effectAt(.08), player, false);
  assert.ok(env.drawCalls.some(call => call.method === 'bezierCurveTo'));

  env.drawCalls.length = 0;
  const first = drawTileFusion(ctx, effectAt(.07), player, true);
  const later = drawTileFusion(ctx, effectAt(.31), player, true);
  assert.equal(first, null);
  assert.equal(later, null);
  assert.equal(env.drawCalls.some(call => call.method === 'bezierCurveTo'), false);
  const rings = env.drawCalls.filter(call => call.method === 'arc').map(call => call.args);
  assert.equal(rings.length, 2);
  assert.deepEqual(rings[0], rings[1]);
});
