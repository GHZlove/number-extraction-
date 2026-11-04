import test from 'node:test';
import assert from 'node:assert/strict';
import { Raid } from '../dist/src/game.js';
import { generateWorld,createEnemy } from '../dist/src/world.js';
import { defaultSave } from '../dist/src/storage.js';
import { ENEMY_TYPES,TERRAIN,RULES } from '../dist/src/config.js';
import { makeEquipment,WEAPONS } from '../dist/src/equipment.js';
import { terrainSpeed,terrainAt,distance,isFree,seededRandom } from '../dist/src/math.js';
import { terrainFor,obstaclesFor } from '../dist/src/spatial.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function empty(){const r=new Raid(defaultSave(),29,{pressure:false});Object.assign(r.world,{enemies:[],obstacles:[],terrain:[],tiles:[],chests:[],nodes:[],drops:[],projectiles:[],effects:[]});r.random=()=>.5;return r;}
function target(r,x=150,type='hunter',id=type){const e=createEnemy(id,r.player.x+x,r.player.y,1,type);e.hp=e.maxHp=100;e.cooldown=999;r.world.enemies.push(e);return e;}
function weapon(r,key){r.player.weapons[0]=makeEquipment('weapon',key,'white',key);}

test('large worlds contain six kinds of landmark, seven functional surfaces and four safe exits',()=>{
  for(const difficulty of ['scout','nightmare']){
    const w=generateWorld(51,difficulty);
    assert.equal(new Set(w.sites.map(s=>s.kind)).size,6);
    assert.deepEqual([...new Set(w.terrain.map(t=>t.kind))].sort(),Object.keys(TERRAIN).sort());
    assert.ok(w.sites.length>=6);assert.equal(w.exits.length,4);
    for(const e of w.exits)assert.ok(isFree(e.x,e.y,50,obstaclesFor(w,e,e,50),w.bounds));
    assert.ok(w.chests.filter(c=>c.id.startsWith('site-')).length>=w.sites.length*.9);
    for(const p of w.terrain)assert.ok(p.x>=0&&p.y>=0&&p.x+p.w<=w.bounds.width&&p.y+p.h<=w.bounds.height);
  }
  assert.deepEqual(generateWorld(51).sites,generateWorld(51).sites);
  assert.notDeepEqual(generateWorld(51).sites,generateWorld(52).sites);
});

test('bridges override water, rough ground overrides roads and ice changes real movement',()=>{
  const p={x:10,y:10},patch=kind=>({x:0,y:0,w:100,h:100,kind});
  near(terrainSpeed(p,[patch('water'),patch('bridge')]),1.12);
  near(terrainSpeed(p,[patch('bridge'),patch('water')]),1.12);
  near(terrainSpeed(p,[patch('mud'),patch('road')]),.72);
  const r=empty();r.world.terrain=[{x:0,y:0,w:3000,h:3000,kind:'ice'}];const x=r.player.x;r.update(.1,{x:1});near(r.player.x-x,RULES.speed*.1*1.18);
});

test('terrain index returns the same surface rules as a full scan on the largest map',()=>{
  const w=generateWorld(8,'nightmare'),random=seededRandom(8);
  for(let i=0;i<400;i++){const p={x:random()*w.bounds.width,y:random()*w.bounds.height};assert.deepEqual(terrainAt(p,terrainFor(w,p)),terrainAt(p,w.terrain));}
});

test('scouts and giants move at distinct speeds, with seeded variation among generated enemies',()=>{
  const moved={};
  for(const type of ['scout','hunter','brute']){
    const r=empty(),e=target(r,300,type);const x=e.x;r.updateEnemy(e,.1);moved[type]=x-e.x;
  }
  near(moved.scout,23.5);near(moved.hunter,17);near(moved.brute,9);
  const w=generateWorld(42);assert.equal(new Set(w.enemies.map(e=>e.type)).size,12);
  assert.ok(new Set(w.enemies.filter(e=>e.type==='hunter').map(e=>e.moveScale)).size>1);
});

test('bush concealment reduces distant detection but does not make nearby players invisible',()=>{
  for(const concealed of [false,true]){
    const r=empty(),e=target(r,700);e.phase=0;e.homeX=e.x+100;
    if(concealed)r.world.terrain=[{x:r.player.x-80,y:r.player.y-80,w:160,h:160,kind:'brush'}];
    const x=e.x;r.updateEnemy(e,.1);assert.equal(e.x>x,concealed);
    e.x=r.player.x+80;e.cooldown=0;r.updateEnemy(e,.01);assert.equal(e.state,'windup');
  }
});

test('medics telegraph and heal a living ally without exceeding maximum health',()=>{
  const r=empty(),medic=target(r,200,'medic'),ally=target(r,260,'hunter','ally');medic.cooldown=0;ally.hp=90;
  r.updateEnemy(medic,.01);assert.equal(medic.state,'windup');assert.equal(medic.healTarget,'ally');
  r.updateEnemy(medic,1.3);assert.equal(ally.hp,100);assert.equal(medic.hp,100);
  ally.dead=true;medic.state='windup';medic.healTarget='ally';medic.timer=0;r.updateEnemy(medic,.1);assert.equal(ally.dead,true);assert.equal(ally.hp,100);
});

test('medics cannot heal an ally through a wall',()=>{
  const r=empty(),medic=target(r,200,'medic'),ally=target(r,300,'hunter','ally');ally.hp=30;
  r.world.obstacles=[{x:r.player.x+250,y:r.player.y-100,w:10,h:200}];
  medic.healTarget=ally.id;r.resolveEnemyAttack(medic,ENEMY_TYPES.medic);assert.equal(ally.hp,30);
});

test('summoners create distinct scouts on free ground and respect per-parent and raid budgets',()=>{
  const r=empty(),s=target(r,400,'summoner');s.zone=1;
  for(let i=0;i<4;i++)r.resolveEnemyAttack(s,ENEMY_TYPES.summoner);
  const children=r.world.enemies.filter(e=>e.summonerId===s.id);assert.equal(children.length,4);assert.equal(new Set(children.map(e=>e.id)).size,4);
  assert.ok(children.every(e=>e.type==='scout'&&e.zone===1&&isFree(e.x,e.y,e.radius,r.world.obstacles,r.world.bounds)));
  children.forEach(e=>{e.dead=true;});r.world.summonedCount=RULES.summonBudget;
  r.resolveEnemyAttack(s,ENEMY_TYPES.summoner);assert.equal(r.world.enemies.length,5);
});

test('skirmishers fire three separated shots and division cancels the remaining burst',()=>{
  const r=empty(),e=target(r,180,'skirmisher');e.value=4;e.aimX=r.player.x;e.aimY=r.player.y;
  r.resolveEnemyAttack(e,ENEMY_TYPES.skirmisher);r.updateEnemy(e,.01);assert.equal(r.world.projectiles.length,1);assert.equal(e.burstLeft,2);
  r.divide();assert.equal(e.state,'idle');assert.equal(e.burstLeft,0);r.updateEnemy(e,.3);assert.equal(r.world.projectiles.length,1);
  e.stun=0;r.resolveEnemyAttack(e,ENEMY_TYPES.skirmisher);r.updateEnemy(e,.3);assert.equal(r.world.projectiles.length,4);
});

test('ring guards fire eight directions and giant impacts can be dodged',()=>{
  const r=empty(),e=target(r,300,'orbiter');e.aimX=r.player.x;e.aimY=r.player.y;
  r.resolveEnemyAttack(e,ENEMY_TYPES.orbiter);assert.equal(r.world.projectiles.length,8);
  assert.equal(new Set(r.world.projectiles.map(b=>Math.atan2(b.vy,b.vx).toFixed(3))).size,8);
  for(const dodged of [false,true]){
    const g=empty(),brute=target(g,120,'brute');brute.aimX=g.player.x;brute.aimY=g.player.y;
    if(dodged)g.player.y+=230;g.resolveEnemyAttack(brute,ENEMY_TYPES.brute);near(g.player.hp,dodged?100:75);
  }
});

test('carbines emit a timed three-shot burst with one shared damage budget and cancel on switching',()=>{
  const r=empty();weapon(r,'carbine');r.attack();assert.equal(r.world.projectiles.length,1);
  r.updateBursts(.07);assert.equal(r.world.projectiles.length,1);r.updateBursts(.01);assert.equal(r.world.projectiles.length,2);r.updateBursts(.08);assert.equal(r.world.projectiles.length,3);
  near(r.world.projectiles.reduce((n,b)=>n+b.power,0),1);assert.equal(r.bursts.length,0);
  r.player.attackCooldown=0;r.attack();r.switchWeapon(1);r.updateBursts(1);assert.equal(r.world.projectiles.length,4);assert.equal(r.bursts.length,0);assert.equal(r.attack(),false);
});

test('crossbows pierce exactly two targets and LMG hits retain the white damage rule',()=>{
  const r=empty();weapon(r,'crossbow');const enemies=[target(r,150,'hunter','a'),target(r,230,'hunter','b'),target(r,310,'hunter','c')];
  r.attack();r.updateProjectiles(.5);near(enemies[0].hp,75);near(enemies[1].hp,75);near(enemies[2].hp,100);
  const l=empty();weapon(l,'lmg');const e=target(l);l.attack();l.updateProjectiles(.3);near(e.hp,75);assert.ok(WEAPONS.lmg.interval<WEAPONS.rifle.interval);assert.ok(WEAPONS.lmg.range>WEAPONS.smg.range);
});

test('grenades apply splash once, hit nearby targets and cannot splash through cover',()=>{
  const r=empty();weapon(r,'grenade');const a=target(r,120,'hunter','a'),b=target(r,170,'hunter','b'),behind=target(r,225,'hunter','c');
  r.world.obstacles=[{x:r.player.x+200,y:r.player.y-180,w:12,h:360}];r.attack();r.updateProjectiles(.7);
  assert.ok(a.hp<100&&b.hp<100);near(behind.hp,100);assert.equal(r.world.projectiles.length,0);
  const hp=a.hp;r.updateProjectiles(1);near(a.hp,hp);assert.equal(r.world.effects.filter(e=>e.kind==='impact').length,1);
});

test('grenades detonate at maximum range and are removed at the selected map boundary',()=>{
  const r=empty();weapon(r,'grenade');const x=r.player.x;r.attack();r.updateProjectiles(2);
  assert.equal(r.world.projectiles.length,0);near(r.world.effects.find(e=>e.kind==='impact').x,x+WEAPONS.grenade.range);
  r.player.attackCooldown=0;r.player.x=r.world.bounds.width-10;r.attack();r.updateProjectiles(.2);assert.equal(r.world.projectiles.length,0);
  assert.ok(r.world.effects.filter(e=>e.kind==='impact').every(e=>e.x<=r.world.bounds.width));
});

test('spears reward narrow long-range aim and warhammers interrupt a surviving enemy',()=>{
  const r=empty();weapon(r,'spear');const front=target(r,190,'hunter','front'),side=target(r,20,'hunter','side');side.y+=140;
  r.attack();near(front.hp,75);near(side.hp,100);
  weapon(r,'warhammer');r.player.attackCooldown=0;front.x=r.player.x+90;front.state='burst';front.burstLeft=2;front.chargeTime=.4;
  r.attack();assert.ok(front.stun>0);assert.equal(front.state,'idle');assert.equal(front.burstLeft,0);assert.equal(front.chargeTime,0);
});


test('the protected frontier cache exposes four new weapons through normal search and pickup',()=>{
  const r=new Raid(defaultSave(),9);r.world.enemies=[];
  const chest=r.world.chests.find(c=>c.id==='expansion-cache');r.player.x=chest.x;r.player.y=chest.y;
  for(let i=0;i<60;i++)r.update(RULES.fixedStep,{interact:true});
  assert.equal(chest.opened,true);
  const gear=r.world.drops.filter(item=>item.id.startsWith('expansion-weapon-'));
  assert.deepEqual(gear.map(item=>item.weapon).sort(),['carbine','grenade','spear','warhammer']);
  for(let i=0;i<4;i++)assert.equal(r.pickupGear(),true);
  assert.equal(r.bag.filter(item=>item.kind==='weapon').length,4);
});
