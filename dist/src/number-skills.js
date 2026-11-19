import { attackDamage, distance, isFree, segmentCircleFraction, clamp } from './math.js';
import { obstaclesFor } from './spatial.js';
import { markImpact, pushActor } from './impact-motion.js';

import { NUMBER_SKILLS } from './skill-tree.js';
export { NUMBER_SKILLS } from './skill-tree.js';

const skillRange = (value, base, scale, maximum) =>
  Math.min(maximum, base + Math.max(0, Math.log2(value)) * scale);

function storm(raid) {
  const p = raid.player;
  const radius = skillRange(p.value, 275, 18, 455);
  const linkRange = radius * .75;
  const remnants = raid.world.tiles
    .filter(tile => tile.remnant && !tile.dead && distance(tile, p) <= radius && raid.visible(p, tile))
    .sort((a, b) => distance(p, a) - distance(p, b))
    .slice(0, 32);

  let chain = [];
  for (const first of remnants) {
    const candidate = [first];
    while (candidate.length < 6) {
      const from = candidate.at(-1);
      const next = remnants.find(tile =>
        tile.value === first.value && !candidate.includes(tile) &&
        distance(from, tile) <= linkRange && raid.visible(from, tile)
      );
      if (!next) break;
      candidate.push(next);
    }
    if (candidate.length > chain.length) chain = candidate;
    if (chain.length === 6) break;
  }
  if (chain.length < 2) {
    raid.message('附近需要两块同数敌人残骸才能连成雷链。');
    return false;
  }

  const hits = new Set();
  for (let i = 1; i < chain.length; i++) {
    const from = chain[i - 1], to = chain[i];
    raid.effect(from.x, from.y, '', NUMBER_SKILLS.storm.color, 'lightning', .44, { endX: to.x, endY: to.y });
    for (const enemy of raid.world.enemies) {
      if (enemy.dead || hits.has(enemy) || !raid.visible(from, enemy)) continue;
      const fraction = segmentCircleFraction(from, to, enemy, enemy.radius + 24);
      if (!Number.isFinite(fraction)) continue;
      hits.add(enemy);
      const value = Math.max(p.value, from.value);
      raid.damageEnemy(enemy, attackDamage(value, enemy.value, enemy.maxHp) * .9, {
        secondary: true, angle: Math.atan2(to.y - from.y, to.x - from.x), element: 'lightning'
      });
    }
  }
  return true;
}

function gust(raid) {
  const p = raid.player;
  const radius = skillRange(p.value, 175, 13, 310);
  for (const enemy of raid.world.enemies) {
    const d = distance(p, enemy);
    if (enemy.dead || d > radius + enemy.radius || !raid.visible(p, enemy)) continue;
    const ratio = clamp(Math.log2(p.value / enemy.value), -5, 5);
    const speed = 365 * 2 ** (ratio / 4) * (enemy.boss ? .27 : 1) * (1 - Math.min(d / radius, 1) * .45);
    const dx = enemy.x - p.x, dy = enemy.y - p.y;
    const angle = d > 0 ? Math.atan2(dy, dx) : p.aimAngle;
    pushActor(enemy, Math.cos(angle), Math.sin(angle), speed);
    markImpact(raid, enemy, 'contact', angle, speed / 400);
  }
  raid.effect(p.x, p.y, '', NUMBER_SKILLS.gust.color, 'gust', .36, { radius });
  return true;
}

function blink(raid, reverse = false, extended = false) {
  const p = raid.player;
  if (raid.run.noDodge) {
    raid.message('本局词条同时限制闪避和折跃。');
    return false;
  }
  const start = { x: p.x, y: p.y };
  const reach = skillRange(p.value, extended ? 230 : 170, 8, extended ? 320 : 255);
  const direction = reverse ? -1 : 1;
  const dx = Math.cos(p.aimAngle) * direction, dy = Math.sin(p.aimAngle) * direction;
  const end = { x: start.x + dx * reach, y: start.y + dy * reach };
  const obstacles = obstaclesFor(raid.world, start, end, p.radius + 2);
  let target = start;
  // Check the whole swept disc so blink cannot cross a solid wall.
  for (let step = 7; step <= reach; step += 7) {
    const x = start.x + dx * step, y = start.y + dy * step;
    if (!isFree(x, y, p.radius, obstacles, raid.world.bounds)) break;
    target = { x, y };
  }
  const hasClearLanding = point => !raid.world.enemies.some(enemy =>
    !enemy.dead && distance(point, enemy) < p.radius + enemy.radius
  );
  while (distance(start, target) >= 14 && !hasClearLanding(target)) {
    target = { x: target.x - dx * 7, y: target.y - dy * 7 };
  }
  if (distance(start, target) < 14) {
    raid.message('折跃落点没有足够空间。');
    return false;
  }
  Object.assign(p, target, { knockX: 0, knockY: 0, dashTime: 0 });
  raid.extractProgress = 0;
  raid.searchProgress = 0;
  raid.nodeProgress = 0;
  raid.effect(start.x, start.y, '', NUMBER_SKILLS.blink.color, 'blink', .26, { endX: p.x, endY: p.y, value: p.value, radius: p.radius });
  return true;
}

function fireball(raid) {
  const p = raid.player;
  raid.shoot(p, p.aimAngle, 610, 580, 'player', p.value, 'white', {
    weapon: 'fireball', element: 'fire', intrinsic: 'burn', radius: 11, power: .95,
    blast: skillRange(p.value, 74, 4, 122)
  });
  return true;
}

const nearest = (raid,radius,point=raid.player) => raid.world.enemies
  .filter(enemy=>!enemy.dead && distance(point,enemy)<=radius+enemy.radius && raid.visible(point,enemy))
  .sort((a,b)=>distance(point,a)-distance(point,b));
function hit(raid,enemy,power,element,stun=0) {
  const p=raid.player, angle=Math.atan2(enemy.y-p.y,enemy.x-p.x);
  if (power>0) raid.damageEnemy(enemy,attackDamage(p.value,enemy.value,enemy.maxHp)*power,{
    secondary:element!=='fire', noKnock:true, angle, value:p.value, element,
    enchant:element==='fire'?'burn':'none',
  });
  if (!enemy.dead && stun) enemy.stun=Math.max(enemy.stun,stun*(enemy.boss?.35:1));
}
function ahead(raid,reach) {
  const p=raid.player, dx=Math.cos(p.aimAngle),dy=Math.sin(p.aimAngle);
  const wanted=p.aimTarget?Math.min(reach,distance(p,p.aimTarget)):reach;
  let point={x:p.x,y:p.y};
  for(let n=12;n<=wanted;n+=12){
    const next={x:p.x+dx*n,y:p.y+dy*n};
    if(!isFree(next.x,next.y,4,obstaclesFor(raid.world,point,next,5),raid.world.bounds))break;
    point=next;
  }
  return point;
}
function pulse(raid,id,element,base,power,stun=0,reach=0,cone=false) {
  const p=raid.player,point=reach?ahead(raid,reach):p;
  const radius=skillRange(p.value,base,5,base+45);
  raid.effect(point.x,point.y,'',NUMBER_SKILLS[id].color,cone?'enemy-impact':element==='fire'?'impact':element==='wind'?'gust':'overload',.4,{
    radius, angle:p.aimAngle, ...(cone?{arc:2*Math.acos(.64)}:{}),
  });
  for(const enemy of nearest(raid,radius,point)){
    if(cone && Math.cos(Math.atan2(enemy.y-p.y,enemy.x-p.x)-p.aimAngle)<.64)continue;
    hit(raid,enemy,power,element,stun);
  }
  return true;
}
function arcBurst(raid,id,forked) {
  const p=raid.player,radius=skillRange(p.value,245,15,415);
  let from=p;
  const hitSet=new Set();
  for(let i=0;i<3;i++){
    const enemy=nearest(raid,i===0||forked?radius:175,from).find(target=>!hitSet.has(target));
    if(!enemy)break;
    raid.effect(from.x,from.y,'',NUMBER_SKILLS[id].color,'lightning',.36,{endX:enemy.x,endY:enemy.y});
    hit(raid,enemy,forked?.62:.73,'lightning',forked?.14:0);hitSet.add(enemy);
    if(!forked)from=enemy;
  }
  if(!hitSet.size)raid.message('附近没有可被电弧锁定的敌人。');
  return hitSet.size>0;
}
function clearShots(raid,frontOnly) {
  const p=raid.player, radius=skillRange(p.value,170,10,265);
  for(const bullet of raid.world.projectiles){
    if(bullet.owner!=='enemy'||bullet.dead||distance(p,bullet)>radius||!raid.visible(p,bullet))continue;
    if(frontOnly&&Math.cos(Math.atan2(bullet.y-p.y,bullet.x-p.x)-p.aimAngle)<.42)continue;
    bullet.dead=true;
  }
  raid.effect(p.x,p.y,'',NUMBER_SKILLS.windWall.color,'gust',.36,{radius});
  return true;
}
function shootFlame(raid,angles,options={}) {
  const p=raid.player;
  for(const offset of angles) raid.shoot(p,p.aimAngle+offset,options.speed??580,options.range??550,
    'player',p.value,'white',{
      weapon:'fireball',element:'fire',intrinsic:'burn',radius:options.radius??8,
      blast:options.blast??0,pierce:options.pierce??0,power:options.power??.8,
    });
  return true;
}
function buff(p,id,seconds) {
  p.buffs[id]=Math.max(seconds,p.buffs[id]||0);
  return true;
}
const handlers = {
  storm, gust, blink, fireball,
  spark:r=>arcBurst(r,'spark',false),
  staticPulse:r=>pulse(r,'staticPulse','lightning',128,.6,.75),
  fork:r=>arcBurst(r,'fork',true),
  groundWire:r=>pulse(r,'groundWire','lightning',103,.77,.55,300),
  arcWard:r=>{buff(r.player,'phase',3.5);r.player.energy=Math.min(100,r.player.energy+18);return pulse(r,'arcWard','lightning',125,.37,.2);},
  thunder:r=>pulse(r,'thunder','lightning',152,1.25,.52,415),
  airStep:r=>buff(r.player,'haste',3.4),
  vortex:r=>{
    for(const enemy of nearest(r,skillRange(r.player.value,205,11,320))){
      const angle=Math.atan2(r.player.y-enemy.y,r.player.x-enemy.x);
      pushActor(enemy,Math.cos(angle),Math.sin(angle),enemy.boss?72:285);
    }
    r.effect(r.player.x,r.player.y,'',NUMBER_SKILLS.vortex.color,'gravity',.39,{radius:195});
    return true;
  },
  windWall:r=>clearShots(r,true),
  cyclone:r=>gust(r)&&pulse(r,'cyclone','wind',148,.67),
  pressure:r=>pulse(r,'pressure','wind',235,.85,.38,0,true),
  tempest:r=>gust(r)&&clearShots(r,false),
  backstep:r=>blink(r,true),
  phaseShift:r=>buff(r.player,'phase',4.5),
  swapGate:r=>blink(r)&&gust(r),
  anchor:r=>{r.player.hp=Math.min(r.player.maxHp,r.player.hp+20);return buff(r.player,'phase',2.4);},
  stasis:r=>pulse(r,'stasis','space',123,0,1.3,295),
  eventHorizon:r=>blink(r,false,true)&&pulse(r,'eventHorizon','space',155,1.05,.85),
  fireFan:r=>shootFlame(r,[-.24,0,.24],{blast:44,power:.31}),
  emberRing:r=>pulse(r,'emberRing','fire',140,.64),
  torch:r=>shootFlame(r,[0],{speed:980,range:680,pierce:1,power:.83,radius:6}),
  cinderBurst:r=>pulse(r,'cinderBurst','fire',98,.88,0,340),
  meteor:r=>shootFlame(r,[0],{speed:310,range:500,blast:skillRange(r.player.value,125,5,178),power:1.25,radius:14}),
  phoenix:r=>{r.player.hp=Math.min(r.player.maxHp,r.player.hp+13);return pulse(r,'phoenix','fire',173,1.06);},
};

export function useNumberSkill(raid, id) {
  const skill = Object.hasOwn(NUMBER_SKILLS, id) ? NUMBER_SKILLS[id] : null;
  if (!skill || raid.status !== 'playing' || raid.player.skillCooldowns[id] > 0) return false;
  if (skill.movement && raid.run.noDodge) { raid.message('本局词条禁用折跃。'); return false; }
  if (raid.safehouseAt() && !skill.defensive) {
    raid.message('安全屋内无法释放攻击技能。');
    return false;
  }
  if (!handlers[id](raid)) return false;
  raid.player.skillCooldowns[id] = skill.cooldown;
  raid.event('skill', { skill: id });
  return true;
}

export function tickNumberSkills(player, dt) {
  for (const id of Object.keys(player.skillCooldowns)) {
    player.skillCooldowns[id] = Math.max(0, (player.skillCooldowns[id] || 0) - dt);
  }
}
