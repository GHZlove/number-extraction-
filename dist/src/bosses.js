import { attackDamage, distance, inAttackArc } from './math.js';
import { slowMultiplier } from './enchantments.js';
import { bossZone } from './boss-hazards.js';

export const BOSS_MOVES=Object.freeze({slam:'震地重击',dash:'巨像冲锋',ring:'环形弹幕',fan:'扇面齐射',snipe:'精准狙击',poison:'瘴雾领域',reinforce:'守卫增援',
  cross:'十字雷击',spears:'雷矛齐射',spiral:'缺口电幕',icefield:'寒霜地带',icewave:'扩散冰环',shards:'冰晶散射',
  cleave:'影刃横斩',shadowdash:'影袭冲锋',crescent:'双速弯月',bombard:'锁定轰炸',sentries:'部署炮台',furnace:'熔炉走廊',
  well:'引力井',collapse:'坍缩之环',orbit:'轨道弹阵',hatch:'孵化虫群',consume:'汲取修复',spores:'孢子齐射'});
export const BOSSES=Object.freeze({
  titan:{name:'裂地巨像',color:'#ff944b',glyph:'▰',type:'brute',minRank:1,moves:['slam','dash','ring'],weapon:'warhammer',enchant:'stun',tip:'侧移避开震地，正面弹反冲锋后输出。'},
  prism:{name:'棱镜督军',color:'#ac7aff',glyph:'◇',type:'orbiter',minRank:1,moves:['fan','ring','snipe'],weapon:'railgun',enchant:'lightning',tip:'留意弹幕空隙，利用掩体避开狙击。'},
  venom:{name:'瘴雾女王',color:'#bdff36',glyph:'♣',type:'summoner',minRank:1,moves:['poison','fan','reinforce'],weapon:'grenade',enchant:'poison',tip:'离开毒区，清理增援，避免在死角停留。'},
  storm:{name:'雷暴主宰',color:'#f3ce35',glyph:'ϟ',type:'sniper',minRank:2,moves:['cross','spears','spiral'],weapon:'plasma',enchant:'lightning',tip:'十字雷击锁定旧位置，斜向移动；从电幕缺口穿出。'},
  frost:{name:'霜核守望者',color:'#55d4ee',glyph:'❄',type:'gunner',minRank:1,moves:['icefield','icewave','shards'],weapon:'doublebarrel',enchant:'frost',tip:'避开减速地带，闪避穿过扩散冰环。'},
  reaper:{name:'影刃收割者',color:'#e46abb',glyph:'☽',type:'charger',minRank:3,moves:['cleave','shadowdash','crescent'],weapon:'battleaxe',enchant:'bleed',tip:'绕到横斩背后；把弹反留给影袭，注意快慢两层弹。'},
  forge:{name:'熔炉执政官',color:'#e55c35',glyph:'▣',type:'sentry',minRank:2,moves:['bombard','sentries','furnace'],weapon:'rocket',enchant:'burn',tip:'离开锁定轰炸，先拆炮台，不要站在熔炉走廊。'},
  gravity:{name:'引力奇点',color:'#7d72f0',glyph:'⊙',type:'orbiter',minRank:4,moves:['well','collapse','orbit'],weapon:'sniper',enchant:'gravity',tip:'远离引力井，观察收缩圆环，向内穿过环带。'},
  brood:{name:'虫巢母体',color:'#55bc81',glyph:'✣',type:'summoner',minRank:1,moves:['hatch','consume','spores'],weapon:'lmg',enchant:'leech',tip:'先击杀虫群，阻止母体汲取回血，再寻找输出窗口。'},
});
export const bossPool=rank=>Object.keys(BOSSES).filter(key=>BOSSES[key].minRank<=rank);
export function empowerBoss(enemy,kind,rank){
  return Object.assign(enemy,{boss:kind,bossName:BOSSES[kind].name,radius:42,maxHp:500+rank*100,hp:500+rank*100,
    elite:true,guard:true,leash:1200,bossStep:0,bossPhase:1,bossCast:0,resolvedCast:-1,cooldown:1.5,damageResistance:.3,bossRank:rank,rarity:'white'});
}
function planZones(raid,e){
  const rage=e.bossPhase===2,angle=Math.atan2(e.aimY-e.y,e.aimX-e.x),color=BOSSES[e.boss].color,label=BOSS_MOVES[e.bossMove];
  const add=spec=>bossZone(raid,e,{color,label,...spec});
  if(e.bossMove==='cross')for(const offset of [0,Math.PI/2])add({kind:'line',angle:angle+offset,length:850,width:rage?65:45,radius:450});
  if(e.bossMove==='icefield'){const count=rage?3:2;for(let i=0;i<count;i++)add({kind:'frost',x:e.aimX+(i-(count-1)/2)*150,y:e.aimY,radius:95,duration:4,power:.18});}
  if(e.bossMove==='icewave')add({kind:'ring',x:e.x,y:e.y,startRadius:50,endRadius:rage?420:340,radius:440,width:38,duration:1.8,power:.65});
  if(e.bossMove==='bombard')for(let i=0;i<(rage?5:3);i++)add({x:e.aimX+Math.cos(angle+Math.PI/2)*(i-(rage?2:1))*125,y:e.aimY+Math.sin(angle+Math.PI/2)*(i-(rage?2:1))*125,radius:80});
  if(e.bossMove==='furnace')add({kind:'line',x:(e.x+e.aimX)/2,y:(e.y+e.aimY)/2,angle,length:700,width:rage?130:95,radius:400,duration:3,power:.4});
  if(e.bossMove==='well')add({kind:'gravity',radius:rage?210:170,duration:3.5,power:.16});
  if(e.bossMove==='collapse')add({kind:'ring',x:e.x,y:e.y,startRadius:390,endRadius:65,radius:420,width:45,duration:2.2,power:.7});
}
export function bossShotPattern(e){
  if(!['ring','spiral','orbit','fan','shards','snipe','spears','crescent','spores'].includes(e.bossMove))return [];
  const angle=Math.atan2(e.aimY-e.y,e.aimX-e.x),enraged=e.bossPhase===2,ring=['ring','spiral','orbit'].includes(e.bossMove),gap=e.bossMove==='spiral'||e.bossMove==='orbit';
  const count=ring?(enraged?18:12):e.bossMove==='fan'||e.bossMove==='shards'?(enraged?9:5):e.bossMove==='spores'?7:e.bossMove==='spears'?5:3;
  const layers=['crescent','spores'].includes(e.bossMove)?2:1,shots=[];
  for(let layer=0;layer<layers;layer++)for(let i=0;i<count;i++){
    if(gap&&i<2)continue;
    const offset=ring?i*Math.PI*2/count:(i-(count-1)/2)*(e.bossMove==='snipe'?.09:.17);
    shots.push({angle:angle+offset+(layer?.12:0),speed:e.bossMove==='snipe'||e.bossMove==='spears'?1100:layers>1?(layer?600:240):370});
  }
  return shots;
}
function resolve(raid,e){
  const p=raid.player,angle=Math.atan2(e.aimY-e.y,e.aimX-e.x),enraged=e.bossPhase===2;e.resolvedCast=e.bossCast;
  if(e.bossMove==='slam'||e.bossMove==='cleave'){
    const cleave=e.bossMove==='cleave',radius=cleave?210:enraged?220:175;
    raid.effect(e.aimX,e.aimY,'',BOSSES[e.boss].color,'impact',.5,{radius});
    const hit=cleave?inAttackArc(e,p,angle,Math.PI*1.15,radius):distance(p,{x:e.aimX,y:e.aimY})<radius+p.radius;
    if(hit&&raid.visible(e,p))raid.hurt(attackDamage(e.value,p.value,p.maxHp)*.7,'被首领重击击破',{source:e,parryable:true});
  }else if(e.bossMove==='dash'||e.bossMove==='shadowdash'){
    e.state='boss-charge';e.chargeTime=enraged?.7:.5;e.chargeSpeed=e.bossMove==='shadowdash'?740:590;e.chargeX=Math.cos(angle);e.chargeY=Math.sin(angle);return;
  }else if(e.bossMove==='poison'){
    const count=enraged?5:3;for(let i=0;i<count;i++){
      const a=i*Math.PI*2/count;raid.world.hazards.push({kind:'poison',owner:'enemy',x:e.aimX+Math.cos(a)*90,y:e.aimY+Math.sin(a)*90,radius:92,life:5,tick:.5});
    }
  }else if(e.bossMove==='reinforce'){
    if(raid.director)raid.director.enqueue(raid,enraged?4:2,raid.director.profile(raid.elapsed),e);
  }else if(e.bossMove==='sentries'||e.bossMove==='hatch'){
    raid.spawnBossAdds(e,enraged?4:2,e.bossMove==='sentries'?'sentry':'scout');
  }else if(e.bossMove==='consume'){
    const adds=raid.world.enemies.filter(a=>a.bossOwnerId===e.id&&!a.dead&&distance(a,e)<600&&raid.visible(e,a));
    const before=e.hp;if(adds.length){adds[0].dead=true;e.hp=Math.min(e.maxHp,e.hp+e.maxHp*(enraged?.12:.08));}
    raid.effect(e.x,e.y-70,e.hp>before?`汲取 +${Math.round(e.hp-before)}`:'无虫群可汲取',BOSSES[e.boss].color,'text',.8);
  }else if(['cross','icefield','icewave','bombard','furnace','well','collapse'].includes(e.bossMove)){
    // Their persistent warning zones own the matching damage geometry.
  }else{
    for(const shot of bossShotPattern(e))raid.shoot(e,shot.angle,shot.speed,1400,'enemy',e.value,'white',{power:.65});
  }
  e.state='idle';e.cooldown=enraged?1.1:1.8;
}
export function updateBoss(raid,e,dt){
  const p=raid.player,d=distance(e,p);
  if(e.hp<=e.maxHp*.5&&e.bossPhase===1){e.bossPhase=2;raid.message(e.bossName+'进入第二阶段！');raid.effect(e.x,e.y,'狂暴','#ff42a2','pulse',.6);}
  if(raid.safehouseAt(p)&&['windup','boss-charge'].includes(e.state)){e.state='idle';e.chargeTime=0;e.cooldown=1.5;}
  if(e.state==='boss-charge'){
    const before={x:e.x,y:e.y};raid.move(e,e.chargeX*(e.chargeSpeed||590)*dt*slowMultiplier(e),e.chargeY*(e.chargeSpeed||590)*dt*slowMultiplier(e));e.chargeTime-=dt;
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
    const definition=BOSSES[e.boss];e.bossMove=definition.moves[e.bossStep++%definition.moves.length];e.bossCast++;
    e.state='windup';e.windup=['dash','shadowdash','furnace'].includes(e.bossMove)?1.1:.95;e.timer=e.windup;e.aimX=p.x;e.aimY=p.y;planZones(raid,e);
    raid.effect(e.x,e.y-75,BOSS_MOVES[e.bossMove],definition.color,'text',.8);return;
  }
  if(d>190){
    const route=raid.navigation.direction(e),a=Math.atan2(p.y-e.y,p.x-e.x),speed=e.bossPhase===2?135:105;
    raid.move(e,(route?.x??Math.cos(a))*speed*dt*slowMultiplier(e),(route?.y??Math.sin(a))*speed*dt*slowMultiplier(e));
  }
}
