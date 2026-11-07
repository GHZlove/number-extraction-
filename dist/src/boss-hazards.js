import { attackDamage, distance } from './math.js';

export function bossZone(raid,boss,spec){
  if(raid.world.hazards.filter(h=>h.bossZone).length>=48)return;
  const zone={bossZone:true,kind:'blast',owner:'enemy',sourceId:boss.id,cast:boss.bossCast,age:0,warn:boss.windup,duration:.25,
    x:boss.aimX,y:boss.aimY,radius:90,power:.65,tick:0,value:boss.value,color:'#ff7b59',label:'危险区域',...spec};
  zone.life=zone.warn+zone.duration;raid.world.hazards.push(zone);
}
export function bossZoneRadius(zone){
  if(zone.kind!=='ring')return zone.radius;
  const progress=Math.max(0,Math.min(1,(zone.age-zone.warn)/zone.duration));
  return zone.startRadius+(zone.endRadius-zone.startRadius)*progress;
}
export function inBossZone(point,zone){
  const padding=point.radius||0;
  if(zone.kind==='line'){
    const dx=point.x-zone.x,dy=point.y-zone.y,c=Math.cos(zone.angle),s=Math.sin(zone.angle);
    return Math.abs(dx*c+dy*s)<=zone.length/2+padding&&Math.abs(-dx*s+dy*c)<=zone.width/2+padding;
  }
  const d=distance(point,zone);
  return zone.kind==='ring'?Math.abs(d-bossZoneRadius(zone))<=zone.width/2+padding:d<=zone.radius+padding;
}
export function updateBossZones(raid,dt){
  for(const zone of raid.world.hazards){
    if(!zone.bossZone)continue;
    const source=raid.world.enemies.find(e=>e.id===zone.sourceId&&!e.dead);
    if(!source||zone.age<zone.warn&&source.state!=='windup'&&source.resolvedCast!==zone.cast){zone.life=0;continue;}
    zone.age+=dt;zone.life=zone.warn+zone.duration-zone.age;
    if(zone.age<zone.warn||zone.life<=0)continue;
    const p=raid.player;if(raid.safehouseAt(p)||p.dashTime>0||!inBossZone(p,zone)||!raid.visible(zone,p))continue;
    if(zone.kind==='gravity'){
      const d=distance(p,zone),pull=Math.min(Math.max(0,d-20),110*dt);
      if(d>0){raid.move(p,(zone.x-p.x)/d*pull,(zone.y-p.y)/d*pull);raid.extractProgress=0;raid.searchProgress=0;raid.nodeProgress=0;}
    }
    if(zone.kind==='frost'){p.chilled=Math.max(p.chilled||0,.55);}
    zone.tick-=dt;
    if(zone.tick<=0){zone.tick=.7;raid.hurt(attackDamage(zone.value,p.value,p.maxHp)*zone.power,`被${zone.label}击破`);}
  }
  raid.world.hazards=raid.world.hazards.filter(h=>h.life>0);
}
