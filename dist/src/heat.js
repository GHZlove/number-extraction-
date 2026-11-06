import { zoneAt } from './math.js';

export class HeatDirector{
 constructor(difficulty,scale=1){this.value=0;this.scale=scale;this.rate=.28+(difficulty.rank-1)*.025;this.level=0;this.nextHunt=0;this.total=0;this.waves=0;}
 add(amount){this.value=Math.min(100,this.value+Math.max(0,amount)*this.scale);}
 update(raid,dt){
  if(raid.status!=='playing')return;
  const sheltered=!!raid.safehouseAt(raid.player,120);this.add(this.rate*dt*(sheltered?.5:1));
  const level=Math.min(4,Math.floor(this.value/25));
  if(level>this.level){this.level=level;raid.message(`热度 ${Math.floor(this.value)}：追猎等级 ${level}，追猎队将寻找你。`);}
  if(sheltered){raid.world.spawnWarnings=raid.world.spawnWarnings.filter(mark=>!mark.hunter);return;}
  if(!level||!raid.director||raid.elapsed<this.nextHunt||this.total>=120)return;
  const population=raid.world.enemies.filter(e=>e.hunter&&!e.dead).length+raid.world.spawnWarnings.filter(m=>m.hunter).length;
  const count=Math.max(0,Math.min(level+1,12-population,120-this.total));
  if(count){
   const start=raid.world.spawnWarnings.length;raid.director.enqueue(raid,count,raid.director.profile(raid.elapsed),null,{hunter:true,warning:1.3});
   const marks=raid.world.spawnWarnings.slice(start);const types=['hunter','scout','charger','skirmisher'];
   for(const [i,mark]of marks.entries()){
    const tier=Math.min(11,Math.max(1,Math.floor(Math.log2(raid.player.value))+level-2));
    Object.assign(mark,{type:types[(this.waves+i)%Math.min(types.length,level+1)],value:2**tier*raid.run.enemyNumbers,elite:level>=3,moveScale:mark.moveScale*1.12,zone:zoneAt(mark,raid.world.zones).risk});
   }
   this.total+=marks.length;if(marks.length){this.waves++;raid.message(`追猎队接近：${marks.length}名猎手，1.3秒出生预警。`);}
  }
  this.nextHunt=raid.elapsed+Math.max(22,40-level*5);
 }
}
