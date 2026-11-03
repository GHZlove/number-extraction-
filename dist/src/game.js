import { RULES, WORLD } from './config.js';
import { attackDamage, bagTotal, canMerge, clamp, distance, enemyDamage, lineOfSight, maxEnemyHealth, moveEntity, zoneAt } from './math.js';
import { createLoot, generateWorld, lootForEnemy } from './world.js';

export class Raid {
  constructor(save, seed = Date.now() >>> 0) {
    this.id = `${Date.now()}-${seed}`;
    this.world = generateWorld(seed);
    this.status = 'playing'; this.elapsed = 0; this.result = null;
    this.player = { ...WORLD.spawn, radius:RULES.playerRadius, value:1, hp:RULES.health, maxHp:RULES.health,
      dividers:RULES.startingDividers+save.upgrades.divider, medkits:RULES.startingMedkits,
      attackCooldown:0,dashCooldown:0,dashTime:0,dashX:1,dashY:0,invulnerable:0,facingX:1,facingY:0 };
    this.bag = []; this.capacity = RULES.bagCapacity+save.upgrades.capacity*2;
    this.kills=0; this.merges=0; this.opened=0;
    this.extractProgress=0; this.searchProgress=0; this.interactId=null;
    this.events=[]; this.lastMessage=''; this.lastMessageTime=-10;
    this.tutorial={merge:false,chest:false,extraction:false};
    this.message('先向右移动，触碰数字 1 完成第一次合成。');
  }
  event(type, extra={}) { this.events.push({type,...extra}); }
  message(text) {
    if(text!==this.lastMessage || this.elapsed-this.lastMessageTime>2.5) {
      this.event('message',{text}); this.lastMessage=text;this.lastMessageTime=this.elapsed;
    }
  }
  effect(x,y,text,color='#9fe5cc',kind='text',duration=0.85) {
    this.world.effects.push({x,y,text,color,kind,life:duration,maxLife:duration});
  }
  nearestEnemy(range=RULES.divideRange, predicate=()=>true) {
    return this.world.enemies.filter(e=>!e.dead&&predicate(e)&&distance(this.player,e)<=range&&lineOfSight(this.player,e,this.world.obstacles))
      .sort((a,b)=>distance(this.player,a)-distance(this.player,b))[0] || null;
  }
  context() {
    const p=this.player;
    const exit=this.world.exits.find(e=>distance(p,e)<e.radius);
    if(exit) return {kind:'exit',target:exit,progress:this.extractProgress/RULES.extractSeconds};
    const chest=this.world.chests.filter(c=>!c.opened&&distance(p,c)<75&&lineOfSight(p,c,this.world.obstacles))
      .sort((a,b)=>distance(p,a)-distance(p,b))[0];
    if(chest) return {kind:'chest',target:chest,progress:this.searchProgress/0.75};
    return null;
  }
  addLoot(loot) {
    if(this.bag.length>=this.capacity) {this.message('背包已满，剩余物资留在地面。可以前往撤离点。');return false;}
    this.bag.push({name:loot.name,value:loot.value,zone:loot.zone});
    this.event('loot'); this.effect(loot.x,loot.y,`+${loot.value} ◇`,'#e7c381'); return true;
  }
  attack() {
    const p=this.player;
    if(p.attackCooldown>0) return;
    p.attackCooldown=RULES.attackCooldown;
    this.effect(p.x,p.y,'','#b0efd8','pulse',0.24); this.event('attack');
    const enemy=this.nearestEnemy(RULES.attackRange);
    if(!enemy) return;
    const damage=attackDamage(p.value,enemy.value);
    enemy.hp-=damage;
    this.effect(enemy.x,enemy.y-18,`−${damage}`,'#f6e6ca');
    if(enemy.hp<=0) this.kill(enemy);
  }
  kill(enemy) {
    if(enemy.dead) return;
    enemy.dead=true;this.kills++;this.event('kill');
    this.world.tiles.push({id:`remnant-${enemy.id}`,x:enemy.x-12,y:enemy.y,value:enemy.value,dead:false});
    this.world.drops.push(lootForEnemy(enemy));
    this.effect(enemy.x,enemy.y,'击破','#efac8d');
  }
  divide() {
    const p=this.player;
    if(!p.dividers) {this.message('没有 ÷2 道具了。补给箱中可能找到运算道具。');return;}
    const enemy=this.nearestEnemy(RULES.divideRange,e=>e.value>p.value) || this.nearestEnemy(RULES.divideRange,e=>e.value>1);
    if(!enemy) {this.message('÷2 需要 215 范围内、有视线且数字大于 1 的敌人。');return;}
    p.dividers--;
    const old=enemy.value,ratio=clamp(enemy.hp/enemy.maxHp,0,1);
    enemy.value/=2;enemy.maxHp=maxEnemyHealth(enemy.value);enemy.hp=Math.max(1,ratio*enemy.maxHp);
    enemy.stun=RULES.divideStun;enemy.state='idle';enemy.timer=0;enemy.cooldown=0.8;
    this.effect(enemy.x,enemy.y-35,`${old} ÷ 2 → ${enemy.value}`,'#c3b4fa', 'text',1.25);
    this.effect(enemy.x,enemy.y,'','#b9a5f4','pulse',0.4);
    this.event('divide');this.message(`敌人 ${old} → ${enemy.value}，已打断攻击并眩晕 1.25 秒。`);
  }
  heal() {
    const p=this.player;
    if(p.medkits<1) {this.message('修复剂已用完。');return;}
    if(p.hp>=p.maxHp) {this.message('生命值已满，无需修复。');return;}
    p.medkits--;p.hp=Math.min(p.maxHp,p.hp+30);this.event('heal');this.effect(p.x,p.y-30,'修复 +30');
  }
  hurt(amount,reason='遭到敌人击破') {
    const p=this.player;
    if(p.invulnerable>0||p.dashTime>0||this.status!=='playing')return;
    p.hp=Math.max(0,p.hp-amount);p.invulnerable=0.65;
    this.extractProgress=0;this.searchProgress=0;
    this.effect(p.x,p.y-35,`−${amount}`,'#ef8a7c');this.event('hurt');
    if(p.hp<=0)this.finish(false,reason);
  }
  updateEnemy(enemy,dt) {
    if(enemy.dead)return;
    enemy.cooldown=Math.max(0,enemy.cooldown-dt);
    if(enemy.stun>0){enemy.stun=Math.max(0,enemy.stun-dt);return;}
    const p=this.player,d=distance(enemy,p);
    if(enemy.state==='windup') {
      enemy.timer-=dt;
      if(enemy.timer<=0) {
        if(enemy.type==='sentry') {
          const length=Math.hypot(enemy.aimX-enemy.x,enemy.aimY-enemy.y)||1;
          this.world.projectiles.push({x:enemy.x,y:enemy.y,vx:(enemy.aimX-enemy.x)/length*250,vy:(enemy.aimY-enemy.y)/length*250,
            radius:7,damage:enemyDamage(enemy.value),life:2.6,dead:false});
        } else {
          this.effect(enemy.aimX,enemy.aimY,'','#ed8d7e','impact',0.3);
          if(distance(p,{x:enemy.aimX,y:enemy.aimY})<64+p.radius&&lineOfSight(enemy,p,this.world.obstacles))this.hurt(enemyDamage(enemy.value));
        }
        enemy.state='idle';enemy.cooldown=enemy.type==='sentry'?1.9:1.25;
      }
      return;
    }
    const sight=lineOfSight(enemy,p,this.world.obstacles);
    const range=enemy.type==='sentry'?330:104;
    if(d<range&&sight&&enemy.cooldown===0) {
      enemy.state='windup';enemy.timer=enemy.type==='sentry'?0.9:0.72;
      enemy.aimX=p.x;enemy.aimY=p.y;return;
    }
    if(enemy.type==='hunter') {
      let mx=0,my=0,speed=78+zoneAt(enemy.homeX).id*14;
      if(d<340&&sight) {mx=(p.x-enemy.x)/Math.max(d,1);my=(p.y-enemy.y)/Math.max(d,1);}
      else {const hx=enemy.homeX+Math.cos(this.elapsed*0.5+enemy.phase)*48,hy=enemy.homeY+Math.sin(this.elapsed*0.45+enemy.phase)*48;
        const h=Math.hypot(hx-enemy.x,hy-enemy.y)||1;mx=(hx-enemy.x)/h*0.35;my=(hy-enemy.y)/h*0.35;}
      if(d>60||!sight)moveEntity(enemy,mx*speed*dt,my*speed*dt,this.world.obstacles);
    }
  }
  updateInteraction(input,dt) {
    const context=this.context();
    const stationary=Math.hypot(input.x||0,input.y||0)<0.15&&this.player.dashTime<=0;
    if(!context||!input.interact||!stationary) {this.extractProgress=0;this.searchProgress=0;this.interactId=null;return;}
    if(context.target.id!==this.interactId) {this.extractProgress=0;this.searchProgress=0;this.interactId=context.target.id;}
    if(context.kind==='exit') {
      this.extractProgress+=dt;this.tutorial.extraction=true;
      if(this.extractProgress>=RULES.extractSeconds)this.finish(true,'成功撤离');
    } else {
      if(this.bag.length>=this.capacity) {this.message('背包已满，无法开启补给箱。请先撤离。');return;}
      this.searchProgress+=dt;
      if(this.searchProgress>=0.75) {
        const c=context.target;c.opened=true;this.opened++;this.tutorial.chest=true;
        const loot=createLoot(c.x,c.y,c.zone,c.value,c.id);this.addLoot(loot);
        this.player.dividers+=c.dividers;this.player.medkits+=c.medkits;this.searchProgress=0;
        this.message(`获得 ${loot.name} ${c.value}◇${c.dividers?' · ÷2 +1':''}${c.medkits?' · 修复剂 +1':''}。左上方绿圈可以撤离。`);
      }
    }
  }
  update(dt,input={}) {
    if(this.status!=='playing')return;
    const p=this.player;this.elapsed+=dt;
    for(const key of ['attackCooldown','dashCooldown','invulnerable'])p[key]=Math.max(0,p[key]-dt);
    let mx=input.x||0,my=input.y||0;
    const length=Math.hypot(mx,my);
    if(length>1){mx/=length;my/=length;}
    if(length>0.12){p.facingX=mx/(Math.hypot(mx,my)||1);p.facingY=my/(Math.hypot(mx,my)||1);}
    if(input.dash&&p.dashCooldown<=0) {
      p.dashTime=RULES.dashDuration;p.dashCooldown=RULES.dashCooldown;p.dashX=p.facingX;p.dashY=p.facingY;this.event('dash');
    }
    if(p.dashTime>0) {moveEntity(p,p.dashX*RULES.dashSpeed*dt,p.dashY*RULES.dashSpeed*dt,this.world.obstacles);p.dashTime=Math.max(0,p.dashTime-dt);}
    else moveEntity(p,mx*RULES.speed*dt,my*RULES.speed*dt,this.world.obstacles);
    if(input.divide)this.divide();if(input.heal)this.heal();if(input.attack)this.attack();
    for(const tile of this.world.tiles) {
      if(!tile.dead&&distance(p,tile)<p.radius+17&&canMerge(p.value,tile.value)&&lineOfSight(p,tile,this.world.obstacles)) {
        tile.dead=true;const old=p.value;p.value*=2;p.hp=Math.min(p.maxHp,p.hp+8);this.merges++;this.tutorial.merge=true;
        this.effect(p.x,p.y-35,`${old} + ${old} = ${p.value}`,'#a9edd1', 'text',1.1);this.event('merge');
        if(this.merges===1)this.message('合成成功！继续寻找数字 2，向下可找到补给箱。');
      }
    }
    for(const loot of this.world.drops) if(!loot.dead&&distance(p,loot)<42&&lineOfSight(p,loot,this.world.obstacles)&&this.addLoot(loot))loot.dead=true;
    for(const enemy of this.world.enemies) {this.updateEnemy(enemy,dt);if(this.status!=='playing')return;}
    for(const bullet of this.world.projectiles) {
      if(bullet.dead)continue;
      const next={x:bullet.x+bullet.vx*dt,y:bullet.y+bullet.vy*dt};bullet.life-=dt;
      if(!lineOfSight(bullet,next,this.world.obstacles,bullet.radius)||next.x<0||next.y<0||next.x>WORLD.width||next.y>WORLD.height||bullet.life<=0){bullet.dead=true;continue;}
      bullet.x=next.x;bullet.y=next.y;
      if(distance(p,bullet)<p.radius+bullet.radius){bullet.dead=true;this.hurt(bullet.damage,'被哨戒炮台击破');}
      if(this.status!=='playing')return;
    }
    this.world.projectiles=this.world.projectiles.filter(b=>!b.dead);
    this.world.effects=this.world.effects.filter(e=>(e.life-=dt)>0);
    // Deadline and fatal damage win ties against a last-frame extraction.
    if(this.elapsed>=RULES.raidSeconds){this.finish(false,'行动超时，信号失联');return;}
    this.updateInteraction(input,dt);
  }
  finish(success,reason) {
    if(this.result)return;
    this.status=success?'success':'dead';
    this.result={id:this.id,success,reason,value:bagTotal(this.bag),number:this.player.value,seconds:this.elapsed,kills:this.kills,merges:this.merges,
      loot:this.bag.map(item=>({...item}))};
    this.event('finish',{result:this.result});
  }
}
