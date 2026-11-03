import { WORLD, ZONES, LOOT, ENEMY_TYPES } from './config.js';
import { seededRandom, isFree, distance, zoneAt, maxEnemyHealth } from './math.js';
import { makeEquipment, randomEquipment } from './equipment.js';

export function createEnemy(id, x, y, value, type = 'hunter') {
  const enemyType = Object.hasOwn(ENEMY_TYPES, type) ? type : 'hunter';
  return {
    id, x, y, homeX: x, homeY: y, value, type: enemyType,
    hp: maxEnemyHealth(value), maxHp: maxEnemyHealth(value), radius: 21,
    state: 'idle', timer: 0, cooldown: 0.7, contactCooldown: 0, stun: 0,
    aimX: x, aimY: y, dead: false, phase: (id.length * 0.73) % 6.28,
    rarity: 'white', armor: null, chargeTime: 0, chargeX: 0, chargeY: 0,
  };
}

const overlap = (a, b, pad = 0) => a.x < b.x+b.w+pad && a.x+a.w > b.x-pad && a.y < b.y+b.h+pad && a.y+a.h > b.y-pad;

export function generateWorld(seed) {
  const random = seededRandom(seed);
  const rand = (a, b) => a + random() * (b-a);
  const pick = list => list[Math.floor(random() * list.length)];
  const world = {
    seed, theme: pick(['雨后废墟', '断层工业区', '荒原补给线']),
    obstacles: [], terrain: [], landmarks: [], tiles: [], chests: [], enemies: [],
    drops: [], projectiles: [], effects: [],
    exits: [
      { id: 'west', x: 310, y: 530, radius: 70, name: '西侧闸门', label: 'EXIT A' },
      { id: 'east', x: 2800, y: 1540, radius: 76, name: '核心升降梯', label: 'EXIT B' },
    ],
    // Continuous clear corridors connect the tutorial and both exits. Buildings
    // can shape the approaches without sealing a generated exit away.
    roads: [
      { x: 230, y: 460, w: 150, h: 680 },
      { x: 230, y: 990, w: 840, h: 140 },
      { x: 930, y: 990, w: 140, h: 620 },
      { x: 930, y: 1470, w: 1950, h: 140 },
    ],
  };
  const reserved = rect => overlap(rect, { x: 100, y: 860, w: 800, h: 470 }, 30) ||
    world.roads.some(road => overlap(rect, road, 30)) ||
    world.exits.some(exit => overlap(rect, { x: exit.x-170, y: exit.y-170, w: 340, h: 340 }, 20));
  function addObstacle(rect) {
    if (rect.x < 50 || rect.y < 50 || rect.x+rect.w > WORLD.width-50 || rect.y+rect.h > WORLD.height-50) return false;
    if (reserved(rect) || world.obstacles.some(other => (rect.cluster === undefined || other.cluster !== rect.cluster) && overlap(rect, other, 20))) return false;
    world.obstacles.push(rect);
    return true;
  }
  // Open courtyard ruins, broken walls, containers and rock cover form distinct
  // points of interest instead of only scattering identical rectangular blocks.
  for (const zone of ZONES) {
    for (let group = 0; group < 4; group++) {
      const x = rand(zone.from+140, zone.to-330), y = rand(160, WORLD.height-420);
      const width = rand(170, 250), height = rand(130, 210);
      const material = group % 2 ? 'ruin' : 'warehouse';
      const cluster = `${zone.id}-${group}`;
      const pieces = [
        { x, y, w: width, h: 24, material, cluster },
        { x, y: y+24, w: 24, h: height, material, cluster },
        { x: x+width-24, y: y+height/2, w: 24, h: height/2+24, material, cluster },
      ];
      let placed = 0;
      for (const piece of pieces) if (addObstacle(piece)) placed++;
      if (placed) world.landmarks.push({ x: x+width/2, y: y+height/2, name: material === 'ruin' ? '破碎庭院' : '废弃仓储' });
    }
    for (let i = 0; i < 20; i++) {
      addObstacle({ x: rand(zone.from+90, zone.to-170), y: rand(90, WORLD.height-180),
        w: rand(48, 112), h: rand(35, 100), material: pick(['rock', 'container', 'barricade']) });
    }
    for (let i = 0; i < 6; i++) {
      const patch = { x: rand(zone.from+80, zone.to-200), y: rand(100, WORLD.height-240),
        w: rand(100, 230), h: rand(70, 160), kind: i % 2 ? 'mud' : 'water' };
      if (!reserved(patch)) world.terrain.push(patch);
    }
  }
  const occupied = [];
  function spot(zone, radius = 35, enemy = false) {
    for (let i = 0; i < 500; i++) {
      const p = { x: rand(zone.from+90, zone.to-90), y: rand(100, WORLD.height-100) };
      const inTutorial = p.x < 900 && p.y > 820 && p.y < 1360;
      if (isFree(p.x, p.y, radius, world.obstacles) && !inTutorial &&
          occupied.every(other => distance(other, p) > 70) &&
          (!enemy || distance(p, WORLD.spawn) > 560)) {
        occupied.push(p);
        return p;
      }
    }
    return null;
  }
  const types = Object.keys(ENEMY_TYPES);
  for (const zone of ZONES) {
    for (let i = 0; i < 30; i++) {
      const p = spot(zone, 30);
      if (p) world.tiles.push({ ...p, id: `tile-${zone.id}-${i}`, value: pick(zone.values), dead: false });
    }
    for (let i = 0; i < 8; i++) {
      const p = spot(zone, 40);
      if (p) world.chests.push({ ...p, id: `chest-${zone.id}-${i}`, zone: zone.id,
        value: Math.round(rand(...zone.reward)), opened: false,
        dividers: random() < 0.6 ? 1 : 0, medkits: random() < 0.25 ? 1 : 0,
        gear: [randomEquipment(random, zone.id, `chest-gear-${zone.id}-${i}`)] });
    }
    for (let i = 0; i < 10; i++) {
      const p = spot(zone, 35, true);
      if (!p) continue;
      const enemy = createEnemy(`enemy-${zone.id}-${i}`, p.x, p.y,
        pick(zone.values.filter(value => value >= 2)), types[(i+zone.id*2) % types.length]);
      enemy.rarity = zone.id === 2 ? 'green' : zone.id === 1 ? 'yellow' : 'white';
      if (zone.id === 2 && i % 3 === 0) enemy.armor = makeEquipment('armor', '', 'yellow', `armor-${enemy.id}`);
      world.enemies.push(enemy);
    }
    for (let i = 0; i < 5; i++) {
      const p = spot(zone, 30);
      if (p) world.drops.push({ ...randomEquipment(random, zone.id, `field-gear-${zone.id}-${i}`), ...p, dead: false });
    }
  }
  for (const [i, x, y, value] of [[0,405,1060,1], [1,520,1060,2], [2,655,1030,4]]) {
    world.tiles.push({ id: `tutorial-${i}`, x, y, value, dead: false });
  }
  world.chests.push({ id: 'starter-chest', x: 485, y: 1190, zone: 0, value: 24,
    opened: false, dividers: 1, medkits: 0, gear: [] });
  world.chests.push({ id: 'starter-armory', x: 620, y: 1260, zone: 0, value: 12,
    opened: false, dividers: 0, medkits: 0, armory: true,
    gear: [makeEquipment('weapon', 'rifle', 'yellow', 'tutorial-rifle'),
      makeEquipment('armor', '', 'white', 'tutorial-armor'),
      makeEquipment('laser', '', 'white', 'tutorial-laser')] });
  world.enemies.push(createEnemy('tutorial-guard', 820, 1250, 8, 'hunter'));
  return world;
}

export function createLoot(x, y, zone, value, id) {
  return { id, kind: 'loot', x, y, zone, value, name: LOOT[zone].name, dead: false };
}

export function lootForEnemy(enemy) {
  const zone = zoneAt(enemy.x).id;
  return createLoot(enemy.x, enemy.y, zone, Math.round(5+Math.log2(enemy.value)*5+zone*12), `loot-${enemy.id}`);
}
