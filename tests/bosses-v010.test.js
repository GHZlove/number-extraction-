import test from 'node:test';
import assert from 'node:assert/strict';
import { Raid } from './helpers/classic-raid.js';
import { RULES, MAP_LAYOUTS } from '../dist/src/config.js';
import { defaultSave } from '../dist/src/storage.js';
import { BOSSES, BOSS_MOVES, bossPool, empowerBoss, bossShotPattern } from '../dist/src/bosses.js';
import { bossZone, bossZoneRadius, updateBossZones } from '../dist/src/boss-hazards.js';
import { createEnemy, generateWorld } from '../dist/src/world.js';
import { Renderer } from '../dist/src/renderer.js';
import { UI } from '../dist/src/ui.js';
import { browserStubs } from './helpers/browser-stubs.js';
const step=RULES.fixedStep;
function arena(kind='storm',dx=300){
 const r=new Raid(defaultSave(),81,{pressure:false});Object.assign(r.world,{enemies:[],tiles:[],drops:[],obstacles:[],terrain:[],chests:[],nodes:[],projectiles:[],hazards:[],effects:[],sites:[]});r.random=()=>.5;
 const e=empowerBoss(createEnemy('boss',r.player.x+dx,r.player.y,16,BOSSES[kind].type),kind,2);r.world.enemies.push(e);r.player.value=16;return {r,e};
}
function begin(r,e,move){e.bossStep=BOSSES[e.boss].moves.indexOf(move);e.cooldown=0;e.state='idle';e.recover=0;e.stun=0;r.updateEnemy(e,step);assert.equal(e.bossMove,move);assert.equal(e.state,'windup');}
function resolve(r,e){e.timer=.001;r.updateEnemy(e,.01);}
function activeZone(r,e,spec){e.bossCast=1;e.resolvedCast=1;e.windup=0;e.state='idle';bossZone(r,e,{x:r.player.x,y:r.player.y,warn:0,duration:2,...spec});return r.world.hazards.at(-1);}

test('nine boss archetypes have named moves, distinct rewards, tactics and difficulty pools',()=>{
 assert.equal(Object.keys(BOSSES).length,9);assert.equal(new Set(Object.values(BOSSES).map(b=>b.weapon)).size,9);
 for(const [key,b]of Object.entries(BOSSES)){assert.equal(b.moves.length,3);assert.ok(b.moves.every(m=>BOSS_MOVES[m]));assert.ok(b.tip.length>8);assert.ok(bossPool(5).includes(key));}
 assert.ok(!bossPool(1).includes('gravity'));assert.ok(bossPool(1).includes('frost'));assert.ok(bossPool(1).includes('brood'));
});

test('tracked bosses appear at the first generated boss site across all map families',()=>{
 for(const layout of MAP_LAYOUTS.slice(1))for(const key of Object.keys(BOSSES)){
   const w=generateWorld(44,'nightmare',{layout:layout.id,boss:key}),bosses=w.enemies.filter(e=>e.boss);
   assert.ok(bosses.length>0,layout.id+'/'+key);assert.equal(bosses[0].boss,key);assert.ok(bosses.every(e=>Object.hasOwn(BOSSES,e.boss)));
 }
 const low=generateWorld(44,'scout',{boss:'gravity'});assert.ok(low.enemies.filter(e=>e.boss).every(e=>BOSSES[e.boss].minRank===1));
});

test('storm cross has a harmless warning and leaves diagonal escape space',()=>{
 const {r,e}=arena();begin(r,e,'cross');assert.equal(r.world.hazards.length,2);const hp=r.player.hp;updateBossZones(r,.5);assert.equal(r.player.hp,hp);
 resolve(r,e);updateBossZones(r,.46);assert.ok(r.player.hp<hp);
 const {r:other,e:boss}=arena();begin(other,boss,'cross');other.player.x+=160;other.player.y+=160;resolve(other,boss);updateBossZones(other,1);assert.equal(other.player.hp,100);
});

test('ice fields apply a temporary slow that changes real movement and then expires',()=>{
 const {r,e}=arena('frost');activeZone(r,e,{kind:'frost',radius:100,tick:99,power:0});updateBossZones(r,.1);assert.ok(r.player.chilled>0);
 r.world.hazards=[];const start=r.player.x;for(let i=0;i<60;i++)r.update(step,{x:1});const travelled=r.player.x-start;
 assert.ok(travelled>150&&travelled<200,travelled);assert.equal(r.player.chilled,0);
});

test('expanding and collapsing rings hit only their visible annular band',()=>{
 const {r,e}=arena('frost');const z=activeZone(r,e,{kind:'ring',x:r.player.x,y:r.player.y,startRadius:100,endRadius:200,width:30,duration:2,power:.5});updateBossZones(r,.5);assert.equal(bossZoneRadius(z),125);assert.equal(r.player.hp,100);
 r.player.x=z.x+150;updateBossZones(r,.5);assert.ok(r.player.hp<100);
 const {r:other,e:boss}=arena('gravity');const collapse=activeZone(other,boss,{kind:'ring',startRadius:300,endRadius:100,width:30,duration:2});updateBossZones(other,.5);assert.equal(bossZoneRadius(collapse),250);assert.equal(other.player.hp,100);
});

test('ground zones cannot be parried but dodging and safehouses protect the player',()=>{
 const {r,e}=arena();activeZone(r,e,{kind:'blast',radius:100});r.player.parryWindow=.18;updateBossZones(r,.02);assert.ok(r.player.hp<100);assert.equal(r.player.parryWindow,.18);
 const {r:dash,e:boss}=arena();activeZone(dash,boss,{kind:'blast',radius:100});dash.player.dashTime=.2;updateBossZones(dash,.02);assert.equal(dash.player.hp,100);
 const {r:house,e:source}=arena('gravity');const exit=house.world.exits[0];Object.assign(house.player,{x:exit.x,y:exit.y});activeZone(house,source,{kind:'gravity',x:exit.x+50,y:exit.y,radius:200});const before={x:house.player.x,y:house.player.y};updateBossZones(house,.2);assert.equal(house.player.hp,100);assert.equal(house.player.x,before.x);assert.equal(house.player.y,before.y);
});

test('gravity wells respect walls, pull gradually and interrupt stationary channels',()=>{
 const {r,e}=arena('gravity');const start=r.player.x;activeZone(r,e,{kind:'gravity',x:start-180,y:r.player.y,radius:220,tick:99,power:0});r.world.obstacles=[{x:start-60,y:r.player.y-80,w:20,h:160}];updateBossZones(r,.2);assert.equal(r.player.x,start);
 r.world.obstacles=[];r.extractProgress=2;r.searchProgress=.5;updateBossZones(r,.2);assert.ok(r.player.x<start&&r.player.x>=start-23);assert.equal(r.extractProgress,0);assert.equal(r.searchProgress,0);
});

test('division cancels an unreleased boss zone instead of leaving an invisible attack',()=>{
 const {r,e}=arena('storm',180);r.player.value=1;begin(r,e,'cross');assert.equal(r.world.hazards.length,2);const charges=r.player.dividers;r.divide();assert.equal(r.player.dividers,charges-1);assert.equal(e.state,'idle');
 updateBossZones(r,.02);assert.equal(r.world.hazards.length,0);assert.equal(r.player.hp,100);
});

test('boss death cancels its ground zones and removes surviving summoned adds',()=>{
 const {r,e}=arena('brood');r.spawnBossAdds(e,2,'scout');activeZone(r,e,{kind:'gravity',radius:200});assert.ok(r.world.enemies.some(a=>a.bossOwnerId===e.id&&!a.dead));
 r.damageEnemy(e,100000);assert.ok(r.world.enemies.filter(a=>a.bossOwnerId===e.id).every(a=>a.dead));assert.equal(r.world.hazards.filter(h=>h.bossZone).length,0);
 const count=r.world.chests.length;r.kill(e);assert.equal(r.world.chests.length,count);
});

test('summoned bosses have per-owner alive, lifetime and global add budgets',()=>{
 const {r,e}=arena('brood');r.spawnBossAdds(e,30,'scout');assert.equal(r.world.enemies.filter(a=>a.bossOwnerId&&!a.dead).length,6);
 for(let turn=0;turn<8;turn++){for(const a of r.world.enemies)if(a.bossOwnerId)a.dead=true;r.spawnBossAdds(e,30,'scout');}
 assert.equal(e.summonedTotal,18);assert.equal(r.world.enemies.filter(a=>a.bossOwnerId).length,18);
 const boss=empowerBoss(createEnemy('forged',r.player.x+600,r.player.y,32,'sentry'),'forge',2);r.world.enemies.push(boss);assert.equal(r.spawnBossAdds(boss,2,'sentry'),2);
 const house=r.world.exits[0];Object.assign(r.player,{x:house.x,y:house.y});assert.equal(r.spawnBossAdds(boss,2,'sentry'),0);
});

test('brood consumption heals only while a living visible summoned unit can be sacrificed',()=>{
 const {r,e}=arena('brood');r.spawnBossAdds(e,2,'scout');e.hp=e.maxHp*.6;const before=e.hp;begin(r,e,'consume');resolve(r,e);assert.equal(e.hp,before+e.maxHp*.08);assert.equal(r.world.enemies.filter(a=>a.bossOwnerId&&!a.dead).length,1);
 for(const a of r.world.enemies)if(a.bossOwnerId)a.dead=true;const second=e.hp;begin(r,e,'consume');resolve(r,e);assert.equal(e.hp,second);
});

test('reaper cleave is directional and a well-timed frontal parry counters it',()=>{
 const {r,e}=arena('reaper',180);begin(r,e,'cleave');r.player.x=e.x+100;resolve(r,e);assert.equal(r.player.hp,100);
 const {r:counter,e:boss}=arena('reaper',180);begin(counter,boss,'cleave');counter.player.parryWindow=.18;counter.player.aimAngle=0;const hp=boss.hp;resolve(counter,boss);assert.equal(counter.player.hp,100);assert.ok(boss.hp<hp);
});

test('shared boss shot patterns preserve escape gaps and distinct slow and fast layers',()=>{
 for(const move of ['spiral','orbit']){const e={bossMove:move,bossPhase:1,x:0,y:0,aimX:100,aimY:0};const shots=bossShotPattern(e);assert.equal(shots.length,10);assert.ok(shots.every(s=>Number.isFinite(s.angle)&&s.speed>0));}
 const {r,e}=arena('reaper');begin(r,e,'crescent');const planned=bossShotPattern(e);resolve(r,e);assert.equal(r.world.projectiles.length,planned.length);assert.equal(new Set(planned.map(s=>s.speed)).size,2);
});

test('forge bombardment and phase changes produce more warned targets without instant damage',()=>{
 const {r,e}=arena('forge');begin(r,e,'bombard');assert.equal(r.world.hazards.length,3);assert.equal(r.player.hp,100);r.world.hazards=[];e.hp=e.maxHp*.4;begin(r,e,'bombard');assert.equal(e.bossPhase,2);assert.equal(r.world.hazards.length,5);
 assert.equal(new Set(r.world.hazards.map(z=>z.x+':'+z.y)).size,5);
});

test('each boss drops the advertised enchanted weapon as an actual collectible item',()=>{
 for(const [key,definition]of Object.entries(BOSSES)){
   const {r,e}=arena(key);r.damageEnemy(e,100000);const chest=r.world.chests.find(c=>c.bossLoot);assert.ok(chest);const item=chest.gear[0];assert.equal(item.weapon,definition.weapon);assert.equal(item.enchant,definition.enchant);assert.equal(item.level,3);assert.equal(item.rarity,'purple');
 }
});

test('new zone geometry, boss telegraphs and the nine-card codex all render finite coordinates',t=>{
 const env=browserStubs(t),renderer=new Renderer(env.canvas,env.ids.get('minimap')),ui=new UI(new Proxy({},{get:()=>()=>{}}));
 for(const [key,definition]of Object.entries(BOSSES)){
   const {r,e}=arena(key);renderer.camera={...r.player};
   for(const move of definition.moves){r.world.hazards=[];begin(r,e,move);renderer.draw(r,1,step);for(const z of r.world.hazards){z.age=z.warn+.2;z.life=2;}renderer.draw(r,2,step);}
 }
 ui.shelterTab='bosses';ui.shelter(defaultSave(),{});const html=env.ids.get('shelter-screen').innerHTML;assert.equal((html.match(/class="boss-card"/g)||[]).length,9);assert.match(html,/设为出击目标/);assert.match(html,/难度4起可追踪/);
});

test('tracking a boss through the real shelter persists a valid deployment target',async t=>{
 const env=browserStubs(t);await import('../dist/src/main.js?boss-tracking-v010');const shelter=env.ids.get('shelter-screen');
 const click=(action,key)=>shelter.dispatch('click',{target:shelter.children.find(b=>b.dataset.action===action&&(key===undefined||b.dataset.key===key))});
 click('shelterTab','bosses');click('trackBoss','frost');assert.equal(shelter.dataset.tab,'deploy');
 const {SAVE_KEY}=await import('../dist/src/config.js');const stored=JSON.parse(env.window.localStorage.getItem(SAVE_KEY));assert.equal(stored.selectedBoss,'frost');
});
