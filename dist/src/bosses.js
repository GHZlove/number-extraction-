import { attackDamage, distance } from './math.js';
import { slowMultiplier } from './enchantments.js';

export const BOSSES=Object.freeze({
  titan:{name:'裂地巨像',color:'#ff944b',moves:['slam','dash','ring']},
  prism:{name:'棱镜督军',color:'#ac7aff',moves:['fan','ring','snipe']},
  venom:{name:'瘴雾女王',color:'#bdff36',moves:['poison','fan','reinforce']},
});
export function empowerBoss(enemy,kind,rank){
  return Object.assign(enemy,{boss:kind,bossName:BOSSES[kind].name,radius:42,maxHp:500+rank*100,hp:500+rank*100,
    elite:true,guard:true,leash:1200,bossStep:0,bossPhase:1,cooldown:1.5,damageResistance:.3,bossRank:rank,rarity:'white'});
}
function resolve(raid,e){
  const p=raid.player,angle=Math.atan2(e.aimY-e.y,e.aimX-e.x),enraged=e.bossPhase===2;
  if(e.bossMove==='slam'){
    const radius=enraged?220:175;raid.effect(e.aimX,e.aimY,'','#ff944b','impact',.5,{radius});
    if(distance(p,{x:e.aimX,y:e.aimY})<radius+p.radius&&raid.visible(e,p))raid.hurt(attackDamage(e.value,p.value,p.maxHp)*.7,'被首领震地击破',{source:e,parryable:true});
  }else if(e.bossMove==='dash'){
    e.state='boss-charge';e.chargeTime=enraged?.7:.5;e.chargeX=Math.cos(angle);e.chargeY=Math.sin(angle);return;
  }else if(e.bossMove==='poison'){
    for(let i=0;i<(enraged?5:3);i++){
      const a=i*Math.PI*2/3;raid.world.hazards.push({kind:'poison',owner:'enemy',x:e.aimX+Math.cos(a)*90,y:e.aimY+Math.sin(a)*90,radius:92,life:5,tick:.5});
    }
  }else if(e.bossMove==='reinforce'){
    // Finite reinforcement budget shared with the normal encounter director.
    if(raid.director)raid.director.enqueue(raid,enraged?4:2,raid.director.profile(raid.elapsed),e);
  }else{
    const count=e.bossMove==='ring'?(enraged?16:12):e.bossMove==='fan'?(enraged?9:5):3;
    for(let i=0;i<count;i++){
      const offset=e.bossMove==='ring'?i*Math.PI*2/count:(i-(count-1)/2)*(e.bossMove==='snipe'?.09:.17);
      raid.shoot(e,angle+offset,e.bossMove==='snipe'?1100:370,1300,'enemy',e.value,'white',{power:.65});
    }
  }
  e.state='idle';e.cooldown=(enraged?1.1:1.8);
}
export function updateBoss(raid,e,dt){
  const p=raid.player,d=distance(e,p);
  if(e.hp<=e.maxHp*.5&&e.bossPhase===1){e.bossPhase=2;raid.message(e.bossName+'进入第二阶段！');raid.effect(e.x,e.y,'狂暴','#ff42a2','pulse',.6);}
  if(e.state==='boss-charge'){
    const before={x:e.x,y:e.y};raid.move(e,e.chargeX*590*dt*slowMultiplier(e),e.chargeY*590*dt*slowMultiplier(e));e.chargeTime-=dt;
    if(d<e.radius+p.radius+12)raid.hurt(attackDamage(e.value,p.value,p.maxHp)*.65,'被首领冲锋击破',{source:e,parryable:true});
    if(e.chargeTime<=0||distance(before,e)<.1){e.state='idle';e.cooldown=1.4;}return;
  }
  if(e.state==='windup'){e.timer-=dt;if(e.timer<=0)resolve(raid,e);return;}
  const home={x:e.homeX,y:e.homeY};
  if(distance(e,home)>e.leash||raid.safehouseAt(p)){
    const a=Math.atan2(home.y-e.y,home.x-e.x);if(distance(e,home)>30)raid.move(e,Math.cos(a)*110*dt,Math.sin(a)*110*dt);return;
  }
  if(d>900&&e.hp===e.maxHp)return;
  if(e.cooldown<=0&&d<700&&raid.visible(e,p)){
    const definition=BOSSES[e.boss];e.bossMove=definition.moves[e.bossStep++%definition.moves.length];
    e.state='windup';e.windup=e.bossMove==='dash'?1.1:.95;e.timer=e.windup;e.aimX=p.x;e.aimY=p.y;
    raid.effect(e.x,e.y-75,e.bossMove==='poison'?'毒雾预警':e.bossMove==='reinforce'?'召集守卫':'首领蓄力',definition.color,'text',.8);return;
  }
  if(d>190){
    const route=raid.navigation.direction(e),a=Math.atan2(p.y-e.y,p.x-e.x),speed=e.bossPhase===2?135:105;
    raid.move(e,(route?.x??Math.cos(a))*speed*dt*slowMultiplier(e),(route?.y??Math.sin(a))*speed*dt*slowMultiplier(e));
  }
}
