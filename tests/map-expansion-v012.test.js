import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_LAYOUTS } from '../dist/src/config.js';
import { defaultSave, normalizeSave } from '../dist/src/storage.js';
import { generateWorld } from '../dist/src/world.js';

const newMaps = [
  { id: 'delta', landmark: '河湾栈桥', kind: 'water' },
  { id: 'observatory', landmark: '观星阵列', kind: 'rubble' },
  { id: 'glacier', landmark: '冰隙前哨', kind: 'ice' },
];

test('new map choices persist and deploy with their own terrain and landmarks', () => {
  assert.equal(MAP_LAYOUTS.filter(map => map.id !== 'random').length, 7);
  for (const map of newMaps) {
    const save = normalizeSave({ ...defaultSave(), selectedMap: map.id });
    assert.equal(save.selectedMap, map.id);
    const world = generateWorld(721, 'scout', { layout: save.selectedMap });
    assert.equal(world.layout, map.id);
    assert.equal(world.theme, MAP_LAYOUTS.find(layout => layout.id === map.id).name);
    assert.ok(world.sites.some(site => site.name === map.landmark), map.id);
    assert.ok(world.terrain.some(patch => patch.kind === map.kind), map.id);
    assert.ok(world.zones.some(zone => zone.risk === 2), map.id);
    assert.ok(world.enemies.some(enemy => enemy.boss), map.id);
  }
});
