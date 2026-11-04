import { WORLD, ZONES, LOOT, ENEMY_TYPES, difficultyOf } from './config.js';
import { seededRandom, isFree, distance, zoneAt, maxEnemyHealth } from './math.js';
import { makeEquipment, randomEquipment } from './equipment.js';
import { SpatialGrid } from './spatial.js';

export function createEnemy(id, x, y, value, type = 'hunter') {
  const enemyType = Object.hasOwn(ENEMY_TYPES,type) ? type : 'hunter';
  return { id, x, y, homeX: x, homeY: y, value, type: enemyType,
    hp: maxEnemyHealth(value), maxHp: maxEnemyHealth(value), radius: 21,
    state: 'idle', timer: 0, cooldown: 0.7, contactCooldown: 0, stun: 0,
    aimX: x, aimY: y, dead: false, phase: (id.length*0.73)%6.28,
    rarity: 'white', armor: null, chargeTime: 0, chargeX: 0, chargeY: 0 };
}
const overlap = (a,b,pad=0) => a.x < b.x+b.w+pad && a.x+a.w > b.x-pad && a.y < b.y+b.h+pad && a.y+a.h > b.y-pad;

export function generateWorld(seed, difficulty = 'scout') {
  const mission = difficultyOf(typeof difficulty === 'string' ? difficulty : difficulty?.id);
  const bounds = { width: mission.width, height: mission.height };
  const zones = ZONES.map((zone,index) => ({ ...zone, from: bounds.width*index/3, to: bounds.width*(index+1)/3 }));
  const random = seededRandom(seed), rand = (a,b) => a+random()*(b-a), pick = list => list[Math.floor(random()*list.length)];
  const east = { x: bounds.width-400, y: Math.round(bounds.height*0.72) };
  const world = {
    seed, difficulty: mission, bounds, zones, spawn: { ...WORLD.spawn },
    theme: pick(['雨后废墟','断层工业区','荒原补给线']),
    obstacles: [], terrain: [], landmarks: [], tiles: [], chests: [], nodes: [], enemies: [], drops: [], projectiles: [], effects: [],
    exits: [{ id:'west',x:310,y:530,radius:80,name:'西侧闸门',label:'EXIT A' },
      { id:'east',...east,radius:90,name:'核心升降梯',label:'EXIT B' }],
    roads: [{ x:210,y:430,w:200,h:760 },{ x:210,y:960,w:1760,h:200 },
      { x:1770,y:960,w:200,h:east.y-960+100 },{ x:1770,y:east.y-100,w:east.x-1770+120,h:200 }],
  };
  const reserved = rect => overlap(rect,{x:100,y:860,w:800,h:500},40) ||
    overlap(rect,{x:1060,y:1150,w:240,h:240},35) ||
    world.roads.some(road => overlap(rect,road,35)) ||
    world.exits.some(exit => overlap(rect,{x:exit.x-180,y:exit.y-180,w:360,h:360},30));
  function addObstacle(rect) {
    if (rect.x < 50 || rect.y < 50 || rect.x+rect.w > bounds.width-50 || rect.y+rect.h > bounds.height-50 || reserved(rect)) return false;
    if (world.obstacles.some(other => (rect.cluster === undefined || other.cluster !== rect.cluster) && overlap(rect,other,20))) return false;
    world.obstacles.push(rect); return true;
  }
  const rank = mission.rank-1;
  for (const zone of zones) {
    for (let group=0;group<12+rank*3;group++) {
      const x=rand(zone.from+160,zone.to-460),y=rand(160,bounds.height-520);
      const width=rand(200,340),height=rand(160,280),material=group%2?'ruin':'warehouse',cluster=`${zone.id}-${group}`;
      const pieces=[{x,y,w:width,h:26,material,cluster},{x,y:y+26,w:26,h:height,material,cluster},
        {x:x+width-26,y:y+height/2,w:26,h:height/2+26,material,cluster}];
      let placed=0;for(const piece of pieces)if(addObstacle(piece))placed++;
      if(placed)world.landmarks.push({x:x+width/2,y:y+height/2,name:material==='ruin'?'破碎庭院':'废弃仓储'});
    }
    for(let i=0;i<55+rank*16;i++) addObstacle({x:rand(zone.from+90,zone.to-180),y:rand(90,bounds.height-200),
      w:rand(55,140),h:rand(45,120),material:pick(['rock','container','barricade'])});
    for(let i=0;i<16+rank*5;i++){
      const patch={x:rand(zone.from+80,zone.to-320),y:rand(100,bounds.height-360),w:rand(150,350),h:rand(100,260),kind:i%2?'mud':'water'};
      if(!reserved(patch))world.terrain.push(patch);
    }
  }
  world.obstacleGrid=new SpatialGrid(world.obstacles);
  const occupied=[];
  function spot(zone,radius=35,enemy=false){
    for(let i=0;i<500;i++){
      const p={x:rand(zone.from+100,zone.to-100),y:rand(100,bounds.height-100)};
      const inTutorial=p.x<1400&&p.y>800&&p.y<1450;
      const nearby=world.obstacleGrid.query(p,p,radius);
      if(isFree(p.x,p.y,radius,nearby,bounds)&&!inTutorial&&occupied.every(other=>distance(other,p)>90)&&(!enemy||distance(p,WORLD.spawn)>700)){
        occupied.push(p);return p;
      }
    }
    return null;
  }
  const types=Object.keys(ENEMY_TYPES),scale=2**mission.enemyShift;
  for(const zone of zones){
    for(let i=0;i<150+rank*55;i++){
      const p=spot(zone,30);if(p)world.tiles.push({...p,id:`tile-${zone.id}-${i}`,value:Math.min(2048,pick(zone.values)*scale),dead:false});
    }
    for(let i=0;i<18+rank*5;i++){
      const p=spot(zone,40);if(p)world.chests.push({...p,id:`chest-${zone.id}-${i}`,zone:zone.id,value:Math.round(rand(...zone.reward)),opened:false,
        dividers:random()<0.6?1:0,medkits:random()<0.3?1:0,gear:[randomEquipment(random,zone.id,`chest-gear-${zone.id}-${i}`)]});
    }
    for(let i=0;i<32+rank*16;i++){
      const p=spot(zone,35,true);if(!p)continue;
      const elite=i===0;
      const value=elite?Math.max(...zone.values)*scale*4:pick(zone.values.filter(value=>value>=2))*scale;
      const enemy=createEnemy(`enemy-${zone.id}-${i}`,p.x,p.y,value,types[(i+zone.id*2+rank)%types.length]);
      enemy.rarity=zone.id===2?(rank>=3?'blue':'green'):zone.id===1?'yellow':'white';enemy.elite=elite;enemy.zone=zone.id;
      if((zone.id===2||rank>=2)&&i%3===0)enemy.armor=makeEquipment('armor','',rank>=3?'green':'yellow',`armor-${enemy.id}`);
      world.enemies.push(enemy);
    }
    for(let i=0;i<9+rank*3;i++){
      const p=spot(zone,30);if(p)world.drops.push({...randomEquipment(random,zone.id,`field-gear-${zone.id}-${i}`),...p,dead:false});
    }
    for(let i=0;i<4+rank*2;i++){
      const p=spot(zone,45);if(p)world.nodes.push({...p,id:`node-${zone.id}-${i}`,kind:pick(['fury','phase','magnet']),used:false});
    }
  }
  for(const[i,x,y,value]of[[0,405,1060,1],[1,520,1060,2],[2,655,1030,4],[3,790,1060,8]])world.tiles.push({id:`tutorial-${i}`,x,y,value,dead:false});
  world.chests.push({id:'starter-chest',x:485,y:1190,zone:0,value:24,opened:false,dividers:1,medkits:0,gear:[]});
  world.chests.push({id:'starter-armory',x:620,y:1260,zone:0,value:12,opened:false,dividers:0,medkits:0,armory:true,
    gear:[makeEquipment('weapon','rifle','yellow','tutorial-rifle'),makeEquipment('armor','','white','tutorial-armor'),makeEquipment('laser','','white','tutorial-laser')]});
  const guard=createEnemy('tutorial-guard',900,1280,8*scale,'hunter');guard.zone=0;world.enemies.push(guard);
  world.nodes.push({id:'tutorial-node',x:1180,y:1270,kind:'fury',used:false});
  return world;
}

export function createLoot(x,y,zone,value,id){
  return{id,kind:'loot',x,y,zone,value,name:LOOT[zone].name,dead:false};
}
export function lootForEnemy(enemy,zones=ZONES){
  const zone=enemy.zone??zoneAt(enemy.x,zones).id;
  return createLoot(enemy.x,enemy.y,zone,Math.round(5+Math.log2(enemy.value)*5+zone*12),`loot-${enemy.id}`);
}
