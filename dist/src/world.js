import { createSectors, sampleSector, containsPoint } from './regions.js';
import { WORLD, ZONES, LOOT, ENEMY_TYPES, difficultyOf } from './config.js';
import { seededRandom, isFree, distance, zoneAt, maxEnemyHealth } from './math.js';
import { makeEquipment, randomEquipment } from './equipment.js';
import { buildLandscapes } from './landscapes.js';
import { SpatialGrid } from './spatial.js';

export function createEnemy(id, x, y, value, type = 'hunter') {
  const enemyType = Object.hasOwn(ENEMY_TYPES,type) ? type : 'hunter';
  return { id, x, y, homeX: x, homeY: y, value, type: enemyType,
    hp: maxEnemyHealth(value), maxHp: maxEnemyHealth(value), radius: ENEMY_TYPES[enemyType].radius || 21, moveScale: 1, hitFlash:0,knockX:0,knockY:0,
    state: 'idle', timer: 0, cooldown: 0.7, contactCooldown: 0, stun: 0,
    aimX: x, aimY: y, dead: false, phase: (id.length*0.73)%6.28,
    rarity: 'white', armor: null, chargeTime: 0, chargeX: 0, chargeY: 0, burstLeft: 0, burstTimer: 0 };
}
const overlap = (a,b,pad=0) => a.x < b.x+b.w+pad && a.x+a.w > b.x-pad && a.y < b.y+b.h+pad && a.y+a.h > b.y-pad;

export function generateWorld(seed, difficulty = 'scout') {
  const mission = difficultyOf(typeof difficulty === 'string' ? difficulty : difficulty?.id);
  const bounds = { width: mission.width, height: mission.height };
  const random = seededRandom(seed), rand = (a,b) => a+random()*(b-a), pick = list => list[Math.floor(random()*list.length)];
  const protectedPoints=[WORLD.spawn,{x:405,y:1060},{x:790,y:1060},{x:485,y:1190},{x:620,y:1260},{x:1500,y:1420},{x:1900,y:1450},{x:1180,y:1270}];
  const zones=createSectors(bounds,random,protectedPoints);
  const east = { x: bounds.width-400, y: Math.round(bounds.height*0.72) };
  const world = {
    seed, difficulty: mission, bounds, zones, sectors:zones, spawn: { ...WORLD.spawn },
    theme: pick(['雨后废墟','断层工业区','荒原补给线']),
    spawnWarnings: [], obstacles: [], terrain: [], landmarks: [], tiles: [], chests: [], nodes: [], enemies: [], drops: [], projectiles: [], effects: [],
    exits: [{ id:'west',x:310,y:530,radius:80,name:'西侧闸门',label:'EXIT A' },
      { id:'east',...east,radius:90,name:'核心升降梯',label:'EXIT B' },
      { id:'field',x:Math.round(bounds.width*.36),y:Math.round(bounds.height*.32),radius:85,name:'野外接应点',label:'EXIT C' },
      { id:'relay',x:Math.round(bounds.width*.72),y:Math.round(bounds.height*.18),radius:85,name:'北部中继门',label:'EXIT D' }],
    roads: [{ x:210,y:430,w:200,h:760 },{ x:210,y:960,w:1760,h:200 },
      { x:1770,y:960,w:200,h:east.y-960+100 },{ x:1770,y:east.y-100,w:east.x-1770+120,h:200 },
      {x:1770,y:bounds.height*.32-100,w:bounds.width-2100,h:200},
      {x:bounds.width*.72-100,y:bounds.height*.18-160,w:200,h:bounds.height*.54+260}],
  };
  const reserved = rect => overlap(rect,{x:100,y:860,w:800,h:500},40) ||
    overlap(rect,{x:1060,y:1150,w:240,h:240},35) ||
    overlap(rect,{x:1320,y:1240,w:450,h:400},40) ||
    world.roads.some(road => overlap(rect,road,35)) ||
    world.exits.some(exit => overlap(rect,{x:exit.x-180,y:exit.y-180,w:360,h:360},30));
  world.obstacleGrid=new SpatialGrid(world.obstacles);
  function addObstacle(rect) {
    if (rect.x < 50 || rect.y < 50 || rect.x+rect.w > bounds.width-50 || rect.y+rect.h > bounds.height-50 || reserved(rect)) return false;
    if (world.obstacleGrid.query(rect,{x:rect.x+rect.w,y:rect.y+rect.h},20).some(other => (rect.cluster === undefined || other.cluster !== rect.cluster) && overlap(rect,other,20))) return false;
    world.obstacles.push(rect);world.obstacleGrid.insert(rect);return true;
  }
  const rank = mission.rank-1;
  const share=zone=>zone.area/(bounds.width*bounds.height)*3;
  const weightedArea=zones.reduce((sum,z)=>sum+z.area*z.density,0);
  const enemyShare=zone=>zone.area*zone.density/weightedArea*3;
  for (const zone of zones) {
    for (let group=0;group<Math.max(1,Math.round((5+rank*2)*share(zone)));group++) {
      const{x,y}=sampleSector(zone,random);
      const width=rand(200,340),height=rand(160,280),material=group%2?'ruin':'warehouse',cluster=`${zone.id}-${group}`;
      const pieces=[{x,y,w:width,h:26,material,cluster},{x,y:y+26,w:26,h:height,material,cluster},
        {x:x+width-26,y:y+height/2,w:26,h:height/2+26,material,cluster}];
      let placed=0;for(const piece of pieces)if(addObstacle(piece))placed++;
      if(placed)world.landmarks.push({x:x+width/2,y:y+height/2,name:material==='ruin'?'破碎庭院':'废弃仓储'});
    }
    for(let i=0;i<Math.round((18+rank*6)*share(zone));i++) addObstacle({...sampleSector(zone,random),
      w:rand(55,140),h:rand(45,120),material:pick(['rock','container','barricade'])});
    for(let i=0;i<Math.round((9+rank*3)*share(zone));i++){
      const patch={...sampleSector(zone,random),w:rand(150,350),h:rand(100,260),kind:i%2?'mud':'water'};
      if(!reserved(patch))world.terrain.push(patch);
    }
  }
  const sites=buildLandscapes(world,rand,addObstacle);
  world.sites=sites;
  for(const patch of world.terrain){
    const right=Math.min(bounds.width,patch.x+patch.w),bottom=Math.min(bounds.height,patch.y+patch.h);
    patch.x=Math.max(0,patch.x);patch.y=Math.max(0,patch.y);patch.w=Math.max(0,right-patch.x);patch.h=Math.max(0,bottom-patch.y);
  }
  world.terrain=world.terrain.filter(p=>p.w>0&&p.h>0);world.terrainGrid=new SpatialGrid(world.terrain);
  const occupied=[],occupiedGrid=new SpatialGrid(occupied,100);
  function spot(zone,radius=35,enemy=false,center=null){
    for(let i=0;i<500;i++){
      const p=center?{x:rand(center.x-350,center.x+350),y:rand(center.y-300,center.y+300)}:sampleSector(zone,random);
      const inTutorial=p.x<1400&&p.y>800&&p.y<1450;
      const nearby=world.obstacleGrid.query(p,p,radius);
      if(containsPoint(p,zone.vertices)&&isFree(p.x,p.y,radius,nearby,bounds)&&!inTutorial&&occupiedGrid.query(p,p,90).every(other=>distance(other,p)>90)&&(!enemy||distance(p,WORLD.spawn)>700)){
        occupied.push(p);occupiedGrid.insert(p);return p;
      }
    }
    return null;
  }
  const types=Object.keys(ENEMY_TYPES),scale=2**mission.enemyShift;
  for(const zone of zones){
    for(let i=0;i<Math.round((120+rank*32)*share(zone));i++){
      const p=spot(zone,30);if(p)world.tiles.push({...p,id:`tile-${zone.id}-${i}`,value:Math.min(2048,pick(zone.values)*scale),dead:false});
    }
    for(let i=0;i<Math.max(1,Math.round((12+rank*4)*share(zone)));i++){
      const p=spot(zone,40);if(p)world.chests.push({...p,id:`chest-${zone.id}-${i}`,zone:zone.risk,sectorId:zone.id,value:Math.round(rand(...zone.reward)),opened:false,
        dividers:random()<0.6?1:0,medkits:random()<0.3?1:0,gear:[randomEquipment(random,zone.risk,`chest-gear-${zone.id}-${i}`)]});
    }
    for(let i=0;i<Math.max(2,Math.round((40+rank*10)*enemyShare(zone)));i++){
      const p=spot(zone,35,true);if(!p)continue;
      const elite=i===0;
      const value=elite?Math.max(...zone.values)*scale*4:pick(zone.values.filter(value=>value>=2))*scale;
      const enemy=createEnemy(`enemy-${zone.id}-${i}`,p.x,p.y,value,types[(i+zone.id*2+rank)%types.length]);
      enemy.moveScale=rand(.88,1.12)*(1+rank*.04);
      enemy.rarity=zone.risk===2?(rank>=3?'blue':'green'):zone.risk===1?'yellow':'white';enemy.elite=elite;enemy.zone=zone.risk;enemy.sectorId=zone.id;
      if(enemy.type==='brute'||((zone.risk===2||rank>=2)&&i%3===0))enemy.armor=makeEquipment('armor','',rank>=3?'green':'yellow',`armor-${enemy.id}`);
      world.enemies.push(enemy);
    }
    for(let i=0;i<Math.max(1,Math.round((8+rank*2)*share(zone)));i++){
      const p=spot(zone,30);if(p)world.drops.push({...randomEquipment(random,zone.risk,`field-gear-${zone.id}-${i}`),...p,dead:false});
    }
    for(let i=0;i<Math.max(1,Math.round((4+rank*2)*share(zone)));i++){
      const p=spot(zone,45);if(p)world.nodes.push({...p,id:`node-${zone.id}-${i}`,kind:pick(['fury','phase','magnet']),used:false});
    }
  }
  // Cluster useful objects around landmarks instead of leaving enlarged maps empty.
  for(const[index,site]of sites.entries()){
    const zone=zones.find(z=>z.id===site.sectorId);
    for(let i=0;i<3;i++){const p=spot(zone,35,false,site);if(p)world.tiles.push({...p,id:`site-tile-${index}-${i}`,value:Math.min(2048,pick(zone.values)*scale),dead:false});}
    const p=spot(zone,40,false,site);
    if(p)world.chests.push({...p,id:`site-chest-${index}`,zone:zone.risk,sectorId:zone.id,value:Math.round(rand(...zone.reward)*1.15),opened:false,dividers:1,medkits:index%3===0?1:0,gear:[randomEquipment(random,zone.risk,`site-gear-${index}`)]});
    const ep=spot(zone,40,true,site);
    if(ep){const e=createEnemy(`site-enemy-${index}`,ep.x,ep.y,pick(zone.values.filter(n=>n>=2))*scale,types[index%types.length]);e.zone=zone.risk;e.sectorId=zone.id;e.moveScale=rand(.88,1.12)*(1+rank*.04);if(e.type==='brute')e.armor=makeEquipment('armor','','blue',`site-armor-${index}`);world.enemies.push(e);}
    if(index%4===0){const np=spot(zone,45,false,site);if(np)world.nodes.push({...np,id:`site-node-${index}`,kind:pick(['fury','phase','magnet']),used:false});}
  }
  world.summonedCount=0;
  for(const[i,x,y,value]of[[0,405,1060,1],[1,520,1060,2],[2,655,1030,4],[3,790,1060,8]])world.tiles.push({id:`tutorial-${i}`,x,y,value,dead:false});
  world.chests.push({id:'starter-chest',x:485,y:1190,zone:0,value:24,opened:false,dividers:1,medkits:0,gear:[]});
  world.chests.push({id:'starter-armory',x:620,y:1260,zone:0,value:12,opened:false,dividers:0,medkits:0,armory:true,
    gear:[makeEquipment('weapon','rifle','yellow','tutorial-rifle'),makeEquipment('armor','','white','tutorial-armor'),makeEquipment('laser','','white','tutorial-laser')]});
  world.chests.push({id:'expansion-cache',x:1500,y:1420,zone:0,value:18,opened:false,dividers:1,medkits:1,armory:true,
    gear:['carbine','grenade','spear','warhammer'].map((type,i)=>makeEquipment('weapon',type,i<2?'yellow':'white',`expansion-weapon-${type}`))});
  const scout=createEnemy('frontier-scout',1900,1450,4*scale,'scout');scout.zone=0;world.enemies.push(scout);
  const guard=createEnemy('tutorial-guard',900,1280,8*scale,'hunter');guard.zone=0;world.enemies.push(guard);
  world.nodes.push({id:'tutorial-node',x:1180,y:1270,kind:'fury',used:false});
  for(const item of [...world.tiles,...world.chests,...world.nodes,...world.enemies,...world.drops]){const sector=zoneAt(item,zones);item.sectorId=sector.id;}
  return world;
}

export function createLoot(x,y,zone,value,id){
  return{id,kind:'loot',x,y,zone,value,name:LOOT[zone].name,dead:false};
}
export function lootForEnemy(enemy,zones=ZONES){
  const zone=enemy.zone??zoneAt(enemy,zones).risk;
  return createLoot(enemy.x,enemy.y,zone,Math.round(5+Math.log2(enemy.value)*5+zone*12),`loot-${enemy.id}`);
}
