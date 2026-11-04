import { PRESSURE } from './config.js';
import { seededRandom,distance,isFree,zoneAt } from './math.js';
import { obstaclesFor } from './spatial.js';
import { createEnemy } from './world.js';

export function pressureProfile(difficulty,elapsed,surge=false){
  const rank=difficulty.rank-1,stage=Math.min(8,Math.floor(elapsed/25));
  return {
    stage:stage+1,interval:Math.max(1.5,3.8-rank*.4-stage*.25),batch:7+rank*2+Math.floor(stage*1.5),
    nearCap:Math.min(240,64+rank*26+stage*8),speed:1+Math.min(.18,stage*.025)+(surge?.08:0),
    cooldown:Math.max(.55,.92-rank*.045-stage*.025),windup:Math.max(.78,1-rank*.025-stage*.015),
    label:surge?'围攻爆发':stage>=5?'高压追击':stage>=2?'怪潮增强':'怪潮逼近',
  };
}
export class PressureDirector {
  constructor(seed,difficulty){
    this.random=seededRandom(seed^0x32ac71);this.difficulty=difficulty;this.nextPulse=Math.max(3,PRESSURE.graceSeconds-(difficulty.rank-1)*.6);
    this.wave=0;this.lastSurge=0;this.surgeUntil=0;this.serial=0;this.cleanup=0;this.spawned=0;
  }
  profile(elapsed){return pressureProfile(this.difficulty,elapsed,elapsed<this.surgeUntil);}
  enemyType(elapsed){
    const choices=['hunter','hunter','hunter','scout','scout','charger'];
    if(elapsed>20)choices.push('gunner','skirmisher','bomber');
    if(elapsed>50)choices.push('orbiter','brute','brute','medic');
    if(elapsed>85)choices.push('summoner','sniper');
    return choices[Math.floor(this.random()*choices.length)];
  }
  enqueue(raid,count,profile){
    const w=raid.world,p=raid.player,near=w.enemies.filter(e=>!e.dead&&distance(e,p)<1500).length;
    const pending=w.spawnWarnings.length,budget=Math.max(0,Math.min(count,profile.nearCap-near-pending));
    const base=this.random()*Math.PI*2;
    for(let i=0;i<budget;i++){
      let point=null;
      for(let attempt=0;attempt<18;attempt++){
        const angle=base+i*Math.PI*2/Math.max(1,budget)+(this.random()-.5)*.6+attempt*.41;
        const radius=PRESSURE.spawnMin+this.random()*(PRESSURE.spawnMax-PRESSURE.spawnMin);
        const pos={x:p.x+Math.cos(angle)*radius,y:p.y+Math.sin(angle)*radius};
        if(isFree(pos.x,pos.y,34,obstaclesFor(w,pos,pos,34),w.bounds)&&w.spawnWarnings.every(other=>distance(other,pos)>65)&&w.enemies.every(e=>e.dead||distance(e,pos)>65)){point=pos;break;}
      }
      if(!point)continue;
      const type=this.enemyType(raid.elapsed),zone=zoneAt(point.x,w.zones),tier=Math.min(11,1+zone.id+this.difficulty.enemyShift+Math.floor(raid.elapsed/70));
      const elite=i===0&&raid.elapsed>30&&this.wave%3===0,offset=elite?2:this.random()<.35?-1:0;
      const value=2**Math.max(0,Math.min(13,tier+offset));
      w.spawnWarnings.push({...point,id:`horde-${++this.serial}`,type,value,zone:zone.id,elite,readyAt:raid.elapsed+PRESSURE.warningSeconds,duration:PRESSURE.warningSeconds,moveScale:(.9+this.random()*.2)*(1+(this.difficulty.rank-1)*.04)});
    }
  }
  update(raid,dt){
    if(raid.status!=='playing')return;
    const w=raid.world,p=raid.player;let near=w.enemies.filter(e=>!e.dead&&distance(e,p)<1500).length;
    const cap=this.profile(raid.elapsed).nearCap;
    for(const mark of w.spawnWarnings){
      if(mark.readyAt>raid.elapsed)continue;
      mark.done=true;
      if(near>=cap||w.enemies.filter(e=>!e.dead).length>=640||distance(mark,p)<PRESSURE.safetyRadius||!isFree(mark.x,mark.y,30,obstaclesFor(w,mark,mark,30),w.bounds)||w.enemies.some(e=>!e.dead&&distance(e,mark)<50))continue;
      const e=createEnemy(mark.id,mark.x,mark.y,mark.value,mark.type);
      Object.assign(e,{horde:true,elite:mark.elite,zone:mark.zone,moveScale:mark.moveScale,aggro:8,cooldown:.4,rarity:mark.elite?'yellow':'white'});
      w.enemies.push(e);this.spawned++;near++;
    }
    w.spawnWarnings=w.spawnWarnings.filter(mark=>!mark.done);
    const surge=Math.floor(raid.elapsed/PRESSURE.surgeEvery);
    if(surge>this.lastSurge){
      this.lastSurge=surge;this.surgeUntil=raid.elapsed+PRESSURE.surgeSeconds;this.nextPulse=Math.min(this.nextPulse,raid.elapsed);
      raid.message('围攻爆发！敌群从四周逼近，准备范围攻击与闪避。');
    }
    const profile=this.profile(raid.elapsed);
    if(raid.elapsed>=this.nextPulse){
      this.wave++;this.enqueue(raid,Math.ceil(profile.batch*(raid.elapsed<this.surgeUntil?1.5:1)),profile);this.nextPulse=raid.elapsed+profile.interval;
    }
    this.cleanup+=dt;
    if(this.cleanup>=PRESSURE.cleanupSeconds){
      this.cleanup=0;w.enemies=w.enemies.filter(e=>!e.dead&&(!e.horde||distance(e,p)<2400||['windup','charge','burst'].includes(e.state)));
      w.tiles=w.tiles.filter(t=>!t.dead);w.drops=w.drops.filter(t=>!t.dead);
    }
  }
}
