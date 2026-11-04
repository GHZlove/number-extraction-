import { attackDamage, distance } from './math.js';

export function applyEnchantment(raid,enemy,damage,impact){
  const p=raid.player,key=impact.enchant,level=impact.level||1;
  if(!key||key==='none'||impact.secondary||damage<=0)return;
  if(key==='leech'){
    const heal=Math.min(4,damage*.12),before=p.hp;p.hp=Math.min(p.maxHp,p.hp+heal);
    if(p.hp>before)raid.effect(p.x,p.y-40,'吸血 +'+(p.hp-before).toFixed(1),'#ff85a9','text',.55);
    return;
  }
  if((p.enchantCooldowns[key]||0)>0)return;
  if(key==='lightning'){
    p.enchantCooldowns[key]=.65;let from=enemy;const seen=new Set([enemy.id]);
    for(let i=0;i<2;i++){
      const next=raid.world.enemies.filter(e=>!e.dead&&!seen.has(e.id)&&distance(from,e)<190&&raid.visible(from,e)).sort((a,b)=>distance(from,a)-distance(from,b))[0];
      if(!next)break;
      raid.effect(from.x,from.y,'','#8eefff','lightning',.2,{endX:next.x,endY:next.y});
      raid.damageEnemy(next,damage*.35,{secondary:true,weapon:'contact'});seen.add(next.id);from=next;
    }
  }else if(key==='stun'&&!enemy.dead){
    p.enchantCooldowns[key]=1.1;enemy.stun=Math.max(enemy.stun,(.32+level*.06)*(enemy.boss?.4:1));
    enemy.state='idle';enemy.chargeTime=0;enemy.burstLeft=0;
    raid.effect(enemy.x,enemy.y-48,'眩晕','#ffe64d','text',.6);
  }else if(key==='poison'){
    p.enchantCooldowns[key]=1.25;
    raid.world.hazards.push({kind:'poison',owner:'player',x:enemy.x,y:enemy.y,radius:90+level*5,life:3.5,tick:0,value:impact.value||p.value,rarity:impact.rarity||'white',power:.07+level*.01});
  }
}

export function updateHazards(raid,dt){
  for(const cloud of raid.world.hazards){
    cloud.life-=dt;cloud.tick-=dt;if(cloud.tick>0)continue;cloud.tick=.5;
    if(cloud.owner==='player'){
      for(const enemy of raid.world.enemies)if(!enemy.dead&&distance(enemy,cloud)<cloud.radius+enemy.radius&&raid.visible(cloud,enemy)){
        raid.damageEnemy(enemy,attackDamage(cloud.value,enemy.value,enemy.maxHp,cloud.rarity)*cloud.power,{secondary:true,weapon:'contact'});enemy.poisoned=.6;
      }
    }else if(distance(raid.player,cloud)<cloud.radius+raid.player.radius&&raid.visible(cloud,raid.player))raid.hurt(6,'被首领毒雾侵蚀');
  }
  raid.world.hazards=raid.world.hazards.filter(h=>h.life>0);
}
