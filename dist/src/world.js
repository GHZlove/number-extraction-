import { WORLD, ZONES, LOOT } from './config.js';
import { seededRandom, isFree, distance, zoneAt, maxEnemyHealth } from './math.js';

export function createEnemy(id, x, y, value, type = 'hunter') {
  return {id, x, y, homeX:x, homeY:y, value, type, hp:maxEnemyHealth(value), maxHp:maxEnemyHealth(value), radius:21,
    state:'idle', timer:0, cooldown:0.7, stun:0, aimX:0, aimY:0, dead:false, phase:(id.length*0.73)%6.28};
}
export function generateWorld(seed) {
  const random = seededRandom(seed);
  const rand = (a,b) => a+random()*(b-a);
  const pick = list => list[Math.floor(random()*list.length)];
  const world = { seed, obstacles:[], tiles:[], chests:[], enemies:[], drops:[], projectiles:[], effects:[],
    exits:[{id:'west',x:310,y:530,radius:70,name:'西侧闸门',label:'EXIT A'},{id:'east',x:2800,y:1540,radius:76,name:'核心升降梯',label:'EXIT B'}] };
  // Reserve the tutorial lane and exit plazas before procedural placement.
  const reserved = (x,y,r=80) => (x>100-r && x<840+r && y>860-r && y<1300+r) ||
    world.exits.some(e=>Math.hypot(x-e.x,y-e.y)<180+r) ||
    (x<450+r && y>460-r && y<1100+r);
  for (let i=0;i<52;i++) {
    for (let attempt=0;attempt<80;attempt++) {
      const o = {x:rand(140,WORLD.width-220),y:rand(140,WORLD.height-200),w:rand(65,145),h:rand(55,120)};
      const cx=o.x+o.w/2, cy=o.y+o.h/2;
      if (!reserved(cx,cy,100) && isFree(cx,cy,150,world.obstacles)) {world.obstacles.push(o);break;}
    }
  }
  const occupied = [];
  function spot(zone, radius=35, enemy=false) {
    for (let i=0;i<500;i++) {
      const p = { x:rand(zone.from+90,zone.to-90), y:rand(100,WORLD.height-100) };
      if (isFree(p.x,p.y,radius,world.obstacles) && !reserved(p.x,p.y,25) &&
        occupied.every(other=>distance(other,p)>70) && (!enemy || distance(p,WORLD.spawn)>560)) {
        occupied.push(p); return p;
      }
    }
    return null;
  }
  for (const zone of ZONES) {
    for (let i=0;i<30;i++) {
      const p=spot(zone,30); if(p) world.tiles.push({...p,id:`tile-${zone.id}-${i}`,value:pick(zone.values),dead:false});
    }
    for (let i=0;i<7;i++) {
      const p=spot(zone,40); if(p) world.chests.push({...p,id:`chest-${zone.id}-${i}`,zone:zone.id,value:Math.round(rand(...zone.reward)),opened:false,
        dividers:random()<0.6 ? 1:0,medkits:random()<0.25 ? 1:0});
    }
    for (let i=0;i<8;i++) {
      const p=spot(zone,35,true); if(p) world.enemies.push(createEnemy(`enemy-${zone.id}-${i}`,p.x,p.y,pick(zone.values.filter(v=>v>=2)),i%3===0?'sentry':'hunter'));
    }
  }
  // A deterministic first minute, inside an otherwise different world each raid.
  for (const [i,x,y,value] of [[0,405,1060,1],[1,520,1060,2],[2,655,1030,4]]) {
    world.tiles.push({id:`tutorial-${i}`,x,y,value,dead:false});
  }
  world.chests.push({id:'starter-chest',x:485,y:1190,zone:0,value:24,opened:false,dividers:1,medkits:0});
  world.enemies.push(createEnemy('tutorial-guard',795,1190,8,'hunter'));
  return world;
}
export function createLoot(x,y,zone,value,id) {
  return {id,x,y,zone,value,name:LOOT[zone].name,dead:false};
}
export function lootForEnemy(enemy) {
  const zone=zoneAt(enemy.x).id;
  return createLoot(enemy.x+26,enemy.y+24,zone,Math.round(5+Math.log2(enemy.value)*5+zone*12),`loot-${enemy.id}`);
}
