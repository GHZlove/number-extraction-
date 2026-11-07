import { attackDamage, distance } from './math.js';

function afflict(enemy,kind,impact,power,duration){
  if(enemy.dead)return;
  enemy.afflictions||={};
  const old=enemy.afflictions[kind],next={life:duration,tick:old?.tick??.5,value:impact.value||1,rarity:impact.rarity||'white',power};
  const potency=status=>attackDamage(status.value,enemy.value,enemy.maxHp,status.rarity)*status.power;
  // Refresh a single status, keeping its cadence and the stronger snapshot.
  enemy.afflictions[kind]=old&&potency(old)>potency(next)?{...old,life:duration}:next;
}
export const slowMultiplier=enemy=>enemy.slowTime>0?(enemy.slowScale||1):1;

export function applyEnchantment(raid,enemy,damage,impact){
  const p=raid.player,key=impact.enchant,level=impact.level||1;
  if(impact.secondary||damage<=0)return;
  const snapshot={...impact,value:impact.value||p.value};
  if(impact.intrinsic==='burn')afflict(enemy,'burn',snapshot,.035,3);
  if(impact.intrinsic==='bleed')afflict(enemy,'bleed',snapshot,.035,4);
  if(!key||key==='none')return;
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
  }else if(key==='burn'||key==='bleed'){
    p.enchantCooldowns[key]=.45;
    afflict(enemy,key,snapshot,key==='burn'?.06+level*.005:.04+level*.005,key==='burn'?3:4);
  }else if(key==='frost'&&!enemy.dead){
    p.enchantCooldowns[key]=.45;enemy.slowTime=2.5+level*.2;enemy.slowScale=enemy.boss?.8:.55;
    enemy.chillStacks=(enemy.chillStacks||0)+1;
    if(enemy.chillStacks>=3&&(enemy.freezeCooldown||0)<=0){
      enemy.stun=Math.max(enemy.stun,enemy.boss?.18:.5);enemy.chillStacks=0;enemy.freezeCooldown=3;
      enemy.state='idle';enemy.chargeTime=0;enemy.burstLeft=0;raid.effect(enemy.x,enemy.y-48,'冻结','#89e8ff','text',.65);
    }
  }else if(key==='sunder'&&!enemy.dead){
    p.enchantCooldowns[key]=.6;enemy.sundered=3;
    const before=enemy.armor?.durability||0;
    if(before>0){enemy.armor.durability=Math.max(0,before-8-level*2);if(enemy.armor.durability===0)raid.event('armorbreak',{strength:1});}
    raid.effect(enemy.x,enemy.y-48,'破甲 / 易伤','#f5c06c','text',.7);
  }else if(key==='detonate'&&enemy.dead){
    p.enchantCooldowns[key]=.8;const radius=125+level*8;
    raid.effect(enemy.x,enemy.y,'','#ff8a55','impact',.4,{radius});raid.event('explosion',{strength:.8});
    for(const next of raid.world.enemies)if(!next.dead&&distance(enemy,next)<radius+next.radius&&raid.visible(enemy,next)){
      raid.damageEnemy(next,attackDamage(snapshot.value,next.value,next.maxHp,snapshot.rarity||'white')*.45,{secondary:true});
    }
  }else if(key==='critical'&&!enemy.dead){
    p.enchantCooldowns[key]=.35;
    if(raid.random()<.2+(level-1)*.02){
      raid.damageEnemy(enemy,(impact.baseAmount??damage)*.5,{secondary:true});raid.effect(enemy.x,enemy.y-56,'暴击！','#ffdb67','text',.8,{heavy:true});raid.event('critical');
    }
  }else if(key==='gravity'){
    p.enchantCooldowns[key]=1;const radius=175+level*5;
    raid.effect(enemy.x,enemy.y,'','#b493ff','gravity',.45,{radius});
    for(const next of raid.world.enemies)if(next!==enemy&&!next.dead&&distance(enemy,next)<radius&&raid.visible(enemy,next)){
      const d=distance(enemy,next),pull=Math.min(Math.max(0,d-28),30+level*6)*(next.boss?.25:1);
      if(d>0)raid.move(next,(enemy.x-next.x)/d*pull,(enemy.y-next.y)/d*pull);
    }
  }else if(key==='energize'){
    p.enchantCooldowns[key]=.65;const gain=3+level;p.energy=Math.min(100,p.energy+gain);
    raid.effect(p.x,p.y-42,'能量 +'+gain,'#6befb1','text',.55);
  }
}

export function updateAfflictions(raid,dt){
  for(const enemy of raid.world.enemies){
    if(enemy.dead)continue;
    for(const key of ['slowTime','sundered','freezeCooldown'])enemy[key]=Math.max(0,(enemy[key]||0)-dt);
    if(!enemy.slowTime)enemy.chillStacks=0;
    for(const[kind,status]of Object.entries(enemy.afflictions||{})){
      if(enemy.dead)break;
      status.life-=dt;status.tick-=dt;
      if(status.tick<=0){
        status.tick+=.5;
        raid.damageEnemy(enemy,attackDamage(status.value,enemy.value,enemy.maxHp,status.rarity)*status.power,{secondary:true,ignoreArmor:kind==='bleed'});
      }
      if(status.life<=0)delete enemy.afflictions[kind];
    }
  }
}
export function updateHazards(raid,dt){
  for(const cloud of raid.world.hazards){
    if(cloud.bossZone||cloud.runHazard)continue;
    cloud.life-=dt;cloud.tick-=dt;if(cloud.tick>0)continue;cloud.tick=.5;
    if(cloud.owner==='player'){
      for(const enemy of raid.world.enemies)if(!enemy.dead&&distance(enemy,cloud)<cloud.radius+enemy.radius&&raid.visible(cloud,enemy)){
        raid.damageEnemy(enemy,attackDamage(cloud.value,enemy.value,enemy.maxHp,cloud.rarity)*cloud.power,{secondary:true,weapon:'contact'});enemy.poisoned=.6;
      }
    }else if(distance(raid.player,cloud)<cloud.radius+raid.player.radius&&raid.visible(cloud,raid.player))raid.hurt(6,'被首领毒雾侵蚀');
  }
  raid.world.hazards=raid.world.hazards.filter(h=>h.life>0);
}
