#!/usr/bin/env node
// Reproducible finite-health combat fixtures, not human playtests or full raids.
// No production state is written. The controller uses normal Raid input only.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ownRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
function option(name,fallback){
 const exact=args.indexOf(name),inline=args.find(arg=>arg.startsWith(name+'='));
 return inline?inline.slice(name.length+1):exact>=0?args[exact+1]:fallback;
}
const source=resolve(option('--source',resolve(ownRoot,'dist/src')));
const output=option('--output','');
const horizon=Number(option('--seconds','60'));
if(!Number.isFinite(horizon)||horizon<=0||horizon>120)throw Error('--seconds must be within (0,120]');
const modules=await Promise.all(['game.js','storage.js','world.js','equipment.js','run-rules.js','config.js'].map(name=>import(pathToFileURL(resolve(source,name)))));
const [{Raid},{defaultSave},{createEnemy},{makeEquipment},{updateNumberForm},{VERSION}]=modules;
const sourceHash=createHash('sha256'),sourceFiles=(await readdir(source)).filter(name=>name.endsWith('.js')).sort();
for(const name of sourceFiles)sourceHash.update(name).update(await readFile(resolve(source,name)));
const configurations=[
 {id:'baseline',mutators:[],initialHeat:0},
 {id:'surge-scarcity-fog',mutators:['doubled','scarcity','fog'],initialHeat:0},
 {id:'bounty-haste-volatile',mutators:['rich','haste','volatile'],initialHeat:55},
 {id:'no-dodge-fog-glass',mutators:['no_dodge','fog','glass'],initialHeat:55},
];
const dt=1/30,round=(n,places=3)=>Number(n.toFixed(places));
const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function controller(raid,center,seed){
 const p=raid.player,w=raid.world,vision=raid.run.vision;
 const perceived=w.enemies.filter(e=>!e.dead&&length(e,p)<=vision).sort((a,b)=>length(a,p)-length(b,p));
 const target=perceived[0];let x=0,y=0,bulletDanger=false;
 if(target){
  const d=Math.max(1,length(target,p)),ax=(p.x-target.x)/d,ay=(p.y-target.y)/d;
  const retreat=d<380?Math.min(2,(380-d)/150+.3):d>500?-.65:0;
  const side=seed%2?1:-1;x=ax*retreat-ay*.85*side;y=ay*retreat+ax*.85*side;
  for(const e of perceived){const distance=Math.max(1,length(e,p));if(distance<165){const weight=(165-distance)/70;x+=(p.x-e.x)/distance*weight;y+=(p.y-e.y)/distance*weight;}}
 }else{
  const angle=raid.elapsed*.35+(seed%17);x=Math.cos(angle)*.55;y=Math.sin(angle)*.55;
 }
 for(const b of w.projectiles){
  if(b.owner!=='enemy'||length(b,p)>Math.min(500,vision))continue;
  const speedSquared=b.vx*b.vx+b.vy*b.vy;if(!speedSquared)continue;
  const eta=Math.max(0,Math.min(.35,((p.x-b.x)*b.vx+(p.y-b.y)*b.vy)/speedSquared));
  const bx=b.x+b.vx*eta,by=b.y+b.vy*eta,distance=Math.max(1,Math.hypot(p.x-bx,p.y-by));
  if(distance<p.radius+50){x+=(p.x-bx)/distance*1.5;y+=(p.y-by)/distance*1.5;bulletDanger=distance<p.radius+20;}
 }
 for(const h of w.hazards){
  if(!h.runHazard||h.done||length(h,p)>vision)continue;
  const d=Math.max(1,length(h,p));if(d<h.radius+p.radius+70){x+=(p.x-h.x)/d*2;y+=(p.y-h.y)/d*2;}
 }
 const fromCenter=length(p,center);
 if(fromCenter>1300){x+=(center.x-p.x)/fromCenter*1.4;y+=(center.y-p.y)/fromCenter*1.4;}
 const norm=Math.max(1,Math.hypot(x,y));x/=norm;y/=norm;
 const near=target&&length(target,p)<130,windup=target?.state==='windup'&&length(target,p)<170;
 return {x,y,attack:!!target,aimX:target?.x??p.x+x*200,aimY:target?.y??p.y+y*200,
  dash:!raid.run.noDodge&&p.dashCooldown<=0&&(near||windup||bulletDanger),parry:!!windup&&p.parryCooldown<=0,
  heal:p.hp<p.maxHp*.6&&p.medkits>0,divide:!!target&&target.value>p.value&&length(target,p)<200&&p.dividers>0,
  overload:p.energy>=100&&p.overload<=0};
}
function fixture(config,tier,seed){
 const save=defaultSave(),saveBefore=JSON.stringify(save);
 const raid=new Raid(save,seed,{difficulty:'hard',layout:'blocks',mutators:config.mutators});
 const w=raid.world,center={x:w.bounds.width*.5,y:w.bounds.height*.5};
 // Controlled open terrain; this intentionally excludes route choice, cover,
 // bosses, loot progression and safehouse/extraction decisions from the result.
 for(const name of ['enemies','tiles','chests','nodes','drops','obstacles','terrain','spawnWarnings','projectiles','effects','hazards','sites','exits','merchants'])w[name]=[];
 Object.assign(raid.player,center,{value:tier,armor:null,laser:null});
 raid.player.weapons[0]=makeEquipment('weapon','rifle','white','fixture-rifle');
 updateNumberForm(raid);raid.heat.value=config.initialHeat;
 const types=['hunter','scout','gunner','charger','hunter','scout','skirmisher','bomber'];
 for(const [i,type]of types.entries()){
  const angle=i*Math.PI*2/types.length+(seed%17)*.07,radius=440+(i%3)*65;
  const enemy=createEnemy('fixture-'+i,center.x+Math.cos(angle)*radius,center.y+Math.sin(angle)*radius,Math.max(1,tier/2)*raid.run.enemyNumbers,type);
  Object.assign(enemy,{horde:true,aggro:999,guard:false,zone:1});w.enemies.push(enemy);
 }
 const initial={number:raid.player.value,maxHp:raid.player.maxHp,hp:raid.player.hp,radius:raid.player.radius,walkingMultiplier:raid.player.form.speed*raid.run.playerSpeed,medkits:raid.player.medkits,heat:raid.heat.value};
 let ticks=0,hits=0,minHp=raid.player.hp,peakLive=0,peakHunters=0,peakPending=0,peakHeat=raid.heat.value;
 const maxTicks=Math.ceil(horizon/dt)*3;
 while(raid.status==='playing'&&raid.elapsed<horizon&&ticks<maxTicks){
  raid.update(dt,controller(raid,center,seed));ticks++;
  hits+=raid.events.filter(e=>e.type==='hurt').length;raid.events.length=0;
  minHp=Math.min(minHp,raid.player.hp);
  const live=w.enemies.filter(e=>!e.dead),hunters=live.filter(e=>e.hunter).length+w.spawnWarnings.filter(e=>e.hunter).length;
  peakLive=Math.max(peakLive,live.length);peakHunters=Math.max(peakHunters,hunters);peakPending=Math.max(peakPending,w.spawnWarnings.length);peakHeat=Math.max(peakHeat,raid.heat.value);
  for(const entity of [raid.player,...live,...w.projectiles,...w.spawnWarnings])if(!Number.isFinite(entity.x)||!Number.isFinite(entity.y))throw Error('Non-finite coordinate in '+config.id+'/'+tier+'/'+seed);
  if(!Number.isFinite(raid.player.hp)||peakLive>640||peakHunters>12)throw Error('Health / population invariant failed');
 }
 if(JSON.stringify(save)!==saveBefore)throw Error('Fixture changed banked save');
 if(ticks>=maxTicks)throw Error('Simulation did not reach its bounded horizon');
 return {configuration:config.id,mutators:[...config.mutators],seed,initial,seconds:round(raid.elapsed),ticks,status:raid.status,
  survivedHorizon:raid.status==='playing'&&raid.elapsed>=horizon,endHp:round(raid.player.hp),endHpPercent:round(100*raid.player.hp/raid.player.maxHp),minHp:round(minHp),endNumber:raid.player.value,
  kills:raid.kills,merges:raid.merges,hits,remainingMedkits:raid.player.medkits,peakHeat:round(peakHeat),hunterWaves:raid.heat.waves,
  scheduledHunters:raid.heat.total,peakLive,peakHuntersIncludingPending:peakHunters,peakPending,deathReason:raid.result?.reason??null};
}
const started=performance.now(),cases=[];
for(const config of configurations)for(const tier of [64,1024])for(const seed of [881,1777])cases.push(fixture(config,tier,seed));
const summary=configurations.map(config=>{
 const group=cases.filter(c=>c.configuration===config.id);
 return {configuration:config.id,fixtures:group.length,survivedHorizons:group.filter(c=>c.survivedHorizon).length,deaths:group.filter(c=>c.status==='dead').length,
  meanEndHpPercent:round(group.reduce((sum,c)=>sum+c.endHpPercent,0)/group.length),meanKills:round(group.reduce((sum,c)=>sum+c.kills,0)/group.length)};
});
const result={schema:1,version:VERSION,source,sourceFingerprint:sourceHash.digest('hex'),sourceFiles,method:'Finite-health synthetic open-arena combat, normal production Raid inputs and AI; not human playtesting, full-raid victories, extraction success rates or proof of balance.',
 limits:['Two fixed seeds, one difficulty, no cover/terrain/bosses or extraction routes.','Starting number and white-rifle equipment are fixture setup; no health replenishment or direct enemy damage is injected while running.','Movement, limited healing/division, dodge, parry and attacks use the same simple controller in each build.','Initial heat is zero for baseline/surge-scarcity-fog, 55 for the other two configurations; compare paired versions, not configuration scores as human difficulty.'],
 settings:{horizonSeconds:horizon,timestep:dt,difficulty:'hard',initialEnemies:8,weapon:'white level-1 rifle',armor:false,laser:false},summary,cases,wallSeconds:round((performance.now()-started)/1000)};
const text=JSON.stringify(result,null,2)+'\n';
if(output){await writeFile(resolve(output),text);console.log(JSON.stringify({output:resolve(output),version:VERSION,cases:cases.length,wallSeconds:result.wallSeconds,summary},null,2));}else process.stdout.write(text);
