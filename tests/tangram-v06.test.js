import test from 'node:test';
import assert from 'node:assert/strict';
import { createSectors, containsPoint, polygonArea, sampleSector, sectorAt } from '../dist/src/regions.js';
import { seededRandom, zoneAt, attackDamage, isFree } from '../dist/src/math.js';
import { generateWorld, createEnemy } from '../dist/src/world.js';
import { DIFFICULTIES, RULES } from '../dist/src/config.js';
import { Raid } from '../dist/src/game.js';
import { defaultSave } from '../dist/src/storage.js';
import { makeEquipment } from '../dist/src/equipment.js';
import { Renderer } from '../dist/src/renderer.js';
import { Sound } from '../dist/src/audio.js';
import { browserStubs } from './helpers/browser-stubs.js';

const bounds={width:6400,height:4000},step=RULES.fixedStep;
function empty(pressure=false){
  const r=new Raid(defaultSave(),73,{pressure});
  Object.assign(r.world,{enemies:[],tiles:[],chests:[],nodes:[],drops:[],obstacles:[],terrain:[],projectiles:[],effects:[],spawnWarnings:[]});
  return r;
}
function target(r,value=4){
  const e=createEnemy('impact-target',r.player.x+100,r.player.y,value);e.cooldown=999;r.world.enemies.push(e);return e;
}

test('all eight tangram orientations tile the entire map without interior gaps or overlaps',()=>{
  for(let orientation=0;orientation<8;orientation++){
    const pieces=createSectors(bounds,()=> (orientation+.1)/8);
    assert.equal(pieces.length,7);
    assert.deepEqual(pieces.map(p=>p.area/(bounds.width*bounds.height)).sort((a,b)=>a-b),[1/16,1/16,1/8,1/8,1/8,1/4,1/4]);
    assert.equal(pieces.reduce((sum,p)=>sum+polygonArea(p.vertices),0),bounds.width*bounds.height);
    for(let x=0;x<40;x++)for(let y=0;y<30;y++){
      // Unequal fractional offsets avoid sampling shared edges.
      const point={x:(x+.317)*bounds.width/40,y:(y+.613)*bounds.height/30};
      assert.equal(pieces.filter(p=>containsPoint(point,p.vertices)).length,1,JSON.stringify({orientation,point}));
    }
    for(const point of [{x:0,y:0},{x:6400,y:0},{x:0,y:4000},{x:6400,y:4000},{x:3200,y:2000}])assert.ok(sectorAt(point,pieces));
    assert.equal(sectorAt({x:-1,y:1500},pieces),null);
  }
});

test('seeded pieces and risks repeat, vary between seeds and sample within their own polygons',()=>{
  const layouts=new Set();
  for(let seed=1;seed<=40;seed++){
    const a=createSectors(bounds,seededRandom(seed)),b=createSectors(bounds,seededRandom(seed));
    assert.deepEqual(a,b);layouts.add(JSON.stringify(a.map(p=>[p.orientation,p.risk])));
    for(const piece of a){const random=seededRandom(seed+piece.id);for(let i=0;i<20;i++)assert.ok(containsPoint(sampleSector(piece,random),piece.vertices));}
  }
  assert.ok(layouts.size>20);
});

test('sector lookup uses both coordinates rather than a three-column x lookup',()=>{
  const pieces=createSectors(bounds,()=>.01);
  const top=zoneAt({x:bounds.width*.5,y:bounds.height*.1},pieces),bottom=zoneAt({x:bounds.width*.5,y:bounds.height*.9},pieces);
  assert.notEqual(top.id,bottom.id);
});

test('generated entities retain sector membership and risk rewards across all difficulties',()=>{
  for(const difficulty of DIFFICULTIES)for(let seed=0;seed<8;seed++){
    const w=generateWorld(seed,difficulty.id);
    assert.equal(w.sectors.length,7);assert.deepEqual([...new Set(w.sectors.map(s=>s.risk))].sort(),[0,1,2]);
    assert.equal(zoneAt(w.spawn,w.sectors).risk,0);
    for(const item of [...w.tiles,...w.chests,...w.nodes,...w.enemies,...w.drops]){
      const sector=zoneAt(item,w.sectors);assert.equal(item.sectorId,sector.id);
      if(item.zone!==undefined)assert.equal(item.zone,sector.risk,`${difficulty.id}/${seed}/${item.id}`);
    }
    for(const site of w.sites)assert.equal(site.sectorId,zoneAt(site,w.sectors).id);
  }
});

test('higher-risk pieces generate larger and faster waves and preserve spawn metadata',()=>{
  const waves=[];
  for(const risk of [0,1,2]){
    const r=empty(true),sector=r.world.sectors.find(s=>s.risk===risk);Object.assign(r.player,sector.center);
    r.elapsed=10;r.director.update(r,.1);
    const marks=[...r.world.spawnWarnings];assert.ok(marks.length>0);
    waves.push({count:marks.length,wait:r.director.nextPulse-r.elapsed});
    for(const mark of marks){const actual=zoneAt(mark,r.world.sectors);assert.equal(mark.zone,actual.risk);assert.equal(mark.sectorId,actual.id);}
    r.elapsed=11;r.director.update(r,.1);
    assert.equal(r.world.enemies.length,marks.length);
    for(const enemy of r.world.enemies){const mark=marks.find(m=>m.id===enemy.id);assert.equal(enemy.zone,mark.zone);assert.equal(enemy.sectorId,mark.sectorId);}
  }
  assert.ok(waves[2].count>waves[0].count);assert.ok(waves[2].wait<waves[1].wait&&waves[1].wait<waves[0].wait);
});

test('heavy weapon feedback preserves the agreed number damage ratios and emits one armour break',()=>{
  const r=empty(),e=target(r);r.player.value=8;r.player.weapons[0]=makeEquipment('weapon','greatsword');r.player.aimAngle=0;
  r.attack();assert.equal(e.hp,e.maxHp*.5);assert.ok(e.hitFlash>0);assert.ok(e.knockX>0);assert.ok(r.hitStop>0);
  e.armor=makeEquipment('armor','','white');e.armor.durability=1;
  r.damageEnemy(e,10,{weapon:'pistol'});r.damageEnemy(e,1,{weapon:'pistol'});
  assert.equal(r.events.filter(event=>event.type==='armorbreak').length,1);
  const other=target(r,16);const before=other.hp;r.damageEnemy(other,attackDamage(4,16,other.maxHp),{weapon:'sniper'});assert.equal(before-other.hp,other.maxHp/8);
});

test('directional recoil pushes away from impact and cannot carry an enemy through a wall',()=>{
  const r=empty(),e=target(r,64);e.stun=3;
  const start=e.x;r.world.obstacles=[{x:e.x+e.radius+5,y:e.y-90,w:32,h:180}];
  r.damageEnemy(e,1,{weapon:'warhammer',angle:0});
  for(let i=0;i<30;i++){r.updateEnemy(e,step);assert.ok(isFree(e.x,e.y,e.radius,r.world.obstacles,r.world.bounds));}
  assert.ok(e.x>start);assert.ok(e.x<start+6);
  r.world.obstacles=[];e.knockX=0;e.knockY=0;const y=e.y;
  r.damageEnemy(e,1,{weapon:'sniper',angle:Math.PI/2});r.updateEnemy(e,step);assert.ok(e.y>y);
});

test('heavy hit-stop is brief, rate limited and replays buffered actions exactly once',()=>{
  const r=empty(),e=target(r,64);let divisions=0;r.divide=()=>divisions++;
  r.damageEnemy(e,1,{weapon:'warhammer'});assert.ok(r.hitStop<=.03);
  let paused=0;
  while(r.hitStop>0){r.update(step,{divide:true,slot:1});paused++;assert.equal(r.elapsed,0);assert.ok(paused<=2);}
  r.update(step);assert.equal(divisions,1);assert.equal(r.player.activeSlot,1);assert.ok(r.elapsed>0);
  r.update(step);assert.equal(divisions,1);
  r.damageEnemy(e,1,{weapon:'warhammer'});assert.equal(r.hitStop,0);
  for(let i=0;i<15;i++)r.update(step);
  r.damageEnemy(e,1,{weapon:'warhammer'});assert.ok(r.hitStop>0);
});

test('rendering covers polygon minimaps, impacts, armour breaks, fragments and weapon recoil',t=>{
  const env=browserStubs(t),renderer=new Renderer(env.canvas,env.ids.get('minimap')),r=empty(),e=target(r,64);
  e.armor=makeEquipment('armor','','white');e.armor.durability=1;
  r.player.weapons[0]=makeEquipment('weapon','warhammer');r.attack();r.damageEnemy(e,10000,{weapon:'warhammer',angle:0});
  for(const event of r.events)renderer.feedback(event);
  assert.ok(renderer.shake>0);assert.ok(r.world.effects.some(e=>e.kind==='shatter'));
  renderer.draw(r,1,step);
  for(const sector of r.world.sectors){Object.assign(r.player,sector.center);renderer.camera={...sector.center};renderer.draw(r,2+sector.id,step);}
  assert.ok(env.drawCalls.filter(c=>c.method==='lineTo').length>40);
});

test('reduced-motion rendering suppresses hit shake while keeping damage and fragments',t=>{
  const env=browserStubs(t),renderer=new Renderer(env.canvas,env.ids.get('minimap')),r=empty(),e=target(r);
  renderer.reduced=true;r.damageEnemy(e,10000,{weapon:'sniper'});
  for(const event of r.events)renderer.feedback(event);
  assert.equal(renderer.shake,0);assert.ok(e.dead);renderer.draw(r,1,step);
});

function fakeAudio(env){
  const log={contexts:0,buffers:0,tones:[],filters:[],sources:0,stops:[]};
  const param=kind=>({value:0,setValueAtTime(value){assert.ok(Number.isFinite(value));if(kind)log[kind].push(value);},exponentialRampToValueAtTime(value){assert.ok(value>0&&Number.isFinite(value));}});
  const node=()=>({connect(){}});
  env.window.AudioContext=class{
    constructor(){log.contexts++;this.currentTime=1;this.sampleRate=24000;this.destination=node();}
    resume(){return Promise.resolve();}
    createGain(){return{...node(),gain:param()};}
    createOscillator(){return{...node(),frequency:param('tones'),start(){},stop(time){log.stops.push(time);}};}
    createBuffer(channels,length){log.buffers++;return{getChannelData:()=>new Float32Array(length)};}
    createBufferSource(){log.sources++;return{...node(),start(){},stop(time){log.stops.push(time);}};}
    createBiquadFilter(){return{...node(),frequency:param('filters')};}
  };
  return log;
}

test('audio remains off until opted in, reuses its context and tolerates unavailable audio',t=>{
  const env=browserStubs(t),log=fakeAudio(env),sound=new Sound();
  sound.play('attack',{weapon:'rifle'});assert.equal(log.contexts,0);
  assert.equal(sound.toggle(),true);assert.equal(log.contexts,1);
  assert.equal(sound.toggle(),false);const count=log.tones.length;sound.play('hit');assert.equal(log.tones.length,count);
  assert.equal(sound.toggle(),true);assert.equal(log.contexts,1);
  delete env.window.AudioContext;assert.equal(new Sound().toggle(),false);
});

test('weapon sounds differ and dense hit events are rate limited with a reusable noise buffer',t=>{
  const env=browserStubs(t),log=fakeAudio(env),sound=new Sound();sound.toggle();
  sound.play('attack',{weapon:'pistol'});const pistol=log.tones.at(-1);
  sound.play('attack',{weapon:'sniper'});assert.notEqual(log.tones.at(-1),pistol);assert.equal(log.buffers,1);
  sound.play('hit',{strength:1});const count=log.sources;
  for(let i=0;i<100;i++)sound.play('hit',{strength:1});assert.equal(log.sources,count);
  sound.context.currentTime+=.05;sound.play('hit',{blocked:true});assert.ok(log.sources>count);
  for(const type of ['armorbreak','explosion','kill','overload'])sound.play(type);
  assert.equal(log.buffers,1);assert.ok(log.stops.every(time=>time<=sound.context.currentTime+.3));
  sound.context.createOscillator=()=>{throw Error('unsupported');};assert.doesNotThrow(()=>sound.play('heal'));
});
