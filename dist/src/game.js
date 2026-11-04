import { RULES, WORLD, ENEMY_TYPES, difficultyOf } from './config.js';
import {
  attackDamage, bagTotal, canMerge, clamp, distance, lineOfSight, maxEnemyHealth,
  moveEntity, seededRandom, segmentCircleFraction, firstWallFraction, inAttackArc, terrainSpeed, terrainAt, isFree,
} from './math.js';
import { createLoot, createEnemy, generateWorld, lootForEnemy } from './world.js';
import { randomEquipment, activeWeapon, weaponOf, spreadOf, absorbDamage, equipmentValue } from './equipment.js';
import { facilityLevel, starterLoadout, rewardMultiplier, salvageMaterials } from './shelter.js';
import { obstaclesFor, terrainFor } from './spatial.js';

export class Raid {
  constructor(save, seed = Date.now() >>> 0, options = {}) {
    this.id = `${Date.now()}-${seed}`;
    this.random = seededRandom(seed ^ 0x5a91bd);
    this.difficulty = difficultyOf(options.difficulty ?? save.selectedDifficulty);
    this.duration = this.difficulty.seconds;
    this.rewardMultiplier = rewardMultiplier(save,this.difficulty.id);
    this.world = generateWorld(seed,this.difficulty.id);
    this.status = 'playing';this.bursts=[];
    this.elapsed = 0;
    this.result = null;
    const loadout = starterLoadout(save,options.weapon);
    const supply = facilityLevel(save,'supply');
    this.player = {
      ...WORLD.spawn, radius: RULES.playerRadius, value: 1, hp: RULES.health, maxHp: RULES.health,
      dividers: RULES.startingDividers + supply, medkits: RULES.startingMedkits + Math.floor(supply/2),
      attackCooldown: 0, dashCooldown: 0, dashTime: 0, dashX: 1, dashY: 0,
      invulnerable: 0, facingX: 1, facingY: 0, aimAngle: 0,
      ...loadout, activeSlot: 0, energy: 0, overload: 0, buffs: { fury: 0, phase: 0, magnet: 0 },
    };
    this.bag = [];
    this.capacity = RULES.bagCapacity + facilityLevel(save,'storage') * 2;
    this.kills = 0; this.merges = 0; this.opened = 0;
    this.extractProgress = 0; this.searchProgress = 0; this.nodeProgress = 0; this.interactId = null;
    this.events = []; this.lastMessage = ''; this.lastMessageTime = -10;
    this.tutorial = { merge: false, chest: false, extraction: false };
    this.nodesActivated = 0; this.combo = 0; this.lastMerge = -Infinity;
    this.message('合成积累能量，满能量按 G 过载。E 启用运算节点，F 拾取，B 换装。');
  }

  visible(a,b,pad=0) { return lineOfSight(a,b,obstaclesFor(this.world,a,b,pad),pad); }
  move(entity,dx,dy) {
    const end={x:entity.x+dx,y:entity.y+dy};
    moveEntity(entity,dx,dy,obstaclesFor(this.world,entity,end,entity.radius+1),this.world.bounds);
  }
  ground(entity=this.player){return terrainAt(entity,terrainFor(this.world,entity));}
  damagePower() { return (this.player.overload>0?1.25:1)*(this.player.buffs.fury>0?1.35:1); }
  activateOverload() {
    const p=this.player;
    if(this.status!=='playing'||p.energy<100||p.overload>0)return false;
    p.energy=0;p.overload=RULES.overloadSeconds;
    for(const enemy of this.world.enemies)if(!enemy.dead&&distance(p,enemy)<260&&this.visible(p,enemy)){
      enemy.stun=Math.max(enemy.stun,0.9);enemy.state='idle';enemy.chargeTime=0;
    }
    this.effect(p.x,p.y,'过载','#d5f59c','overload',0.65,{radius:260});this.event('overload');
    this.message('过载启动：7 秒内伤害 +25%，攻击速度提升。');return true;
  }
  activateNode(node) {
    if(!node||node.used||!['fury','phase','magnet'].includes(node.kind)||this.status!=='playing')return false;
    node.used=true;this.nodesActivated++;
    const durations={fury:20,phase:16,magnet:30};
    this.player.buffs[node.kind]=durations[node.kind];this.player.energy=Math.min(100,this.player.energy+20);
    const names={fury:'增幅：伤害 +35%',phase:'相位：承受伤害降低30%',magnet:'牵引：扩大合成和物资拾取范围'};
    this.effect(node.x,node.y,names[node.kind],'#a5c7ff','text',1.6);this.event('node');this.message(names[node.kind]);return true;
  }
  event(type, extra = {}) { this.events.push({ type, ...extra }); }
  message(text) {
    if (text !== this.lastMessage || this.elapsed-this.lastMessageTime > 2.5) {
      this.event('message', { text }); this.lastMessage = text; this.lastMessageTime = this.elapsed;
    }
  }
  effect(x, y, text, color = '#9fe5cc', kind = 'text', duration = 0.85, extra = {}) {
    this.world.effects.push({ x, y, text, color, kind, life: duration, maxLife: duration, ...extra });
  }
  nearestEnemy(range = RULES.divideRange, predicate = () => true) {
    return this.world.enemies.filter(enemy => !enemy.dead && predicate(enemy) &&
      distance(this.player, enemy) <= range && this.visible(this.player, enemy))
      .sort((a, b) => distance(this.player, a)-distance(this.player, b))[0] || null;
  }
  context() {
    const p = this.player;
    const exit = this.world.exits.find(target => distance(p, target) < target.radius);
    if (exit) return { kind: 'exit', target: exit, progress: this.extractProgress / RULES.extractSeconds };
    const chest = this.world.chests.filter(target => !target.opened && distance(p, target) < 75 && this.visible(p, target))
      .sort((a, b) => distance(p, a)-distance(p, b))[0];
    if(chest)return {kind:'chest',target:chest,progress:this.searchProgress/0.75};
    const node=(this.world.nodes||[]).find(target=>!target.used&&distance(p,target)<85&&this.visible(p,target));
    return node?{kind:'node',target:node,progress:this.nodeProgress/0.9}:null;
  }
  nearbyGear() {
    return this.world.drops.filter(item => !item.dead && item.kind && item.kind !== 'loot' &&
      distance(this.player, item) < 75 && this.visible(this.player, item))
      .sort((a, b) => distance(this.player, a)-distance(this.player, b))[0] || null;
  }
  addLoot(item) {
    if (this.bag.length >= this.capacity) { this.message('背包已满。按 B 换装或丢弃物品。'); return false; }
    const { x, y, dead, ...stored } = item;
    this.bag.push({ ...stored });
    this.event('loot'); this.effect(x, y, item.kind === 'loot' || !item.kind ? `+${item.value} ◇` : item.name, '#e7c381');
    return true;
  }
  pickupGear() {
    const item = this.nearbyGear();
    if (item && this.addLoot(item)) { item.dead = true; this.message(`拾取 ${item.name}，按 B 打开背包换装。`); return true; }
    return false;
  }
  equip(index, slot = this.player.activeSlot) {
    if (this.status !== 'playing' || !Number.isInteger(index)) return false;
    const item = this.bag[index];
    if (!item || !['weapon', 'armor', 'laser'].includes(item.kind)) return false;
    let old;
    if (item.kind === 'weapon') {
      if (slot !== 0 && slot !== 1) return false;
      old = this.player.weapons[slot]; this.player.weapons[slot] = item;
    } else { old = this.player[item.kind]; this.player[item.kind] = item; }
    this.bag.splice(index, 1);
    if (old && !old.starter) this.bag.splice(index, 0, old);
    this.event('equip'); return true;
  }
  removeEquipment(kind) {
    if (this.status !== 'playing' || !['armor', 'laser'].includes(kind)) return false;
    const item = this.player[kind];
    if (!item || this.bag.length >= this.capacity) return false;
    this.bag.push(item); this.player[kind] = null; return true;
  }
  dropItem(index) {
    if (this.status !== 'playing' || !Number.isInteger(index) || !this.bag[index]) return false;
    const [item] = this.bag.splice(index, 1);
    this.world.drops.push({ ...item, x: this.player.x, y: this.player.y, dead: false,
      // Currency drops must be left behind before they can be auto-collected again.
      mustLeave: item.kind === 'loot' || !item.kind });
    return true;
  }
  switchWeapon(slot) {
    if ((slot !== 0 && slot !== 1) || this.status !== 'playing') return false;
    this.player.activeSlot = slot;
    // A shared cooldown prevents switching from bypassing the previous weapon's cadence.
    return true;
  }
  carriedValue() { return bagTotal(this.bag) + equipmentValue(this.player); }

  shoot(origin, angle, speed, range, owner, value, rarity = 'white', options = {}) {
    this.world.projectiles.push({ x: origin.x, y: origin.y, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
      radius: owner === 'player' ? 3 : 6, life: range/speed, owner, value, rarity, power: options.power ?? 1, blast: options.blast || 0, pierce: options.pierce || 0, hitIds: [], dead: false });
  }
  attack() {
    const p = this.player;
    if (p.attackCooldown > 0 || this.status !== 'playing') return false;
    const item = activeWeapon(p), weapon = weaponOf(item);
    p.attackCooldown = weapon.interval*(p.overload>0?0.75:1);
    this.event('attack');
    if (weapon.mode === 'ranged') {
      const power=this.damagePower()/(weapon.burst||1);
      this.fireWeapon(item,p.aimAngle,power);
      if(weapon.burst)this.bursts.push({remaining:weapon.burst-1,wait:weapon.burstDelay,delay:weapon.burstDelay,item:{...item},angle:p.aimAngle,power,slot:p.activeSlot});
    } else {
      this.effect(p.x, p.y, '', '#cde8e0', 'slash', 0.2, { angle: p.aimAngle, arc: weapon.arc, radius: weapon.range });
      for (const enemy of this.world.enemies) {
        if (!enemy.dead && inAttackArc(p, enemy, p.aimAngle, weapon.arc, weapon.range) && this.visible(p, enemy)) {
          this.damageEnemy(enemy, attackDamage(p.value, enemy.value, enemy.maxHp, item.rarity)*this.damagePower());
          if(weapon.stun&&!enemy.dead){enemy.stun=Math.max(enemy.stun,weapon.stun);enemy.state='idle';enemy.chargeTime=0;enemy.burstLeft=0;}
        }
      }
    }
    return true;
  }
  fireWeapon(item,angle,power){
    const weapon=weaponOf(item),pellets=weapon.pellets||1,p=this.player;
    for(let i=0;i<pellets;i++){
      const offset=pellets===1?this.random()*2-1:i/(pellets-1)*2-1;
      this.shoot(p,angle+offset*spreadOf(item,p.laser),weapon.speed,weapon.range,'player',p.value,item.rarity,{power:power/pellets,pierce:weapon.pierce||0,blast:weapon.blast||0});
    }
    this.effect(p.x,p.y,'','#fff2c5','muzzle',0.08,{angle});
  }
  updateBursts(dt){
    for(const job of this.bursts){
      if(this.player.activeSlot!==job.slot||activeWeapon(this.player).id!==job.item.id){job.remaining=0;continue;}
      job.wait-=dt;
      while(job.remaining>0&&job.wait<=0){this.fireWeapon(job.item,job.angle,job.power);job.remaining--;job.wait+=job.delay;}
    }
    this.bursts=this.bursts.filter(job=>job.remaining>0);
  }
  damageEnemy(enemy, amount) {
    if (enemy.dead) return;
    const hit = absorbDamage(amount, enemy.armor);
    if (enemy.armor) enemy.armor.durability = hit.durability;
    enemy.hp = Math.max(0, enemy.hp-hit.damage);
    this.effect(enemy.x, enemy.y-20, `−${Math.round(hit.damage*10)/10}`, '#f6e6ca');
    if (hit.blocked) this.effect(enemy.x, enemy.y-42, '护甲', '#8fc5ff');
    if (enemy.hp <= 0) this.kill(enemy);
  }
  kill(enemy) {
    if (enemy.dead) return;
    enemy.dead = true; this.kills++; this.event('kill');
    this.world.tiles.push({ id: `remnant-${enemy.id}`, x: enemy.x, y: enemy.y, value: enemy.value, dead: false });
    this.world.drops.push(lootForEnemy(enemy,this.world.zones));
    if (this.random() < 0.42) {
      const gear = randomEquipment(this.random, enemy.zone ?? this.world.zones.find(zone=>enemy.homeX>=zone.from&&enemy.homeX<zone.to)?.id ?? 2, `gear-${enemy.id}`);
      this.world.drops.push({ ...gear, x: enemy.x, y: enemy.y, dead: false });
    }
    this.effect(enemy.x, enemy.y, '击破', '#efac8d');
  }
  divide() {
    const p = this.player;
    if (!p.dividers) { this.message('没有 ÷2 道具了。补给箱中可能找到运算道具。'); return; }
    const enemy = this.nearestEnemy(RULES.divideRange, e => e.value > p.value) || this.nearestEnemy(RULES.divideRange, e => e.value > 1);
    if (!enemy) { this.message('÷2 需要 215 范围内、有视线且数字大于 1 的敌人。'); return; }
    p.dividers--;
    const old = enemy.value, ratio = clamp(enemy.hp/enemy.maxHp, 0, 1);
    enemy.value /= 2; enemy.maxHp = maxEnemyHealth(enemy.value); enemy.hp = ratio*enemy.maxHp;
    enemy.stun = RULES.divideStun; enemy.state = 'idle'; enemy.timer = 0; enemy.chargeTime = 0; enemy.burstLeft=0;enemy.healTarget=null;enemy.cooldown = 0.8;
    this.effect(enemy.x, enemy.y-35, `${old} ÷ 2 → ${enemy.value}`, '#c3b4fa', 'text', 1.25);
    this.effect(enemy.x, enemy.y, '', '#b9a5f4', 'pulse', 0.4);
    this.event('divide'); this.message(`敌人 ${old} → ${enemy.value}，攻击已打断。`);
  }
  heal() {
    const p = this.player;
    if (p.medkits < 1) { this.message('修复剂已用完。'); return; }
    if (p.hp >= p.maxHp) { this.message('生命值已满，无需修复。'); return; }
    p.medkits--; p.hp = Math.min(p.maxHp, p.hp+30); this.event('heal'); this.effect(p.x, p.y-30, '修复 +30');
  }
  hurt(amount, reason = '遭到敌人击破') {
    const p = this.player;
    if (p.invulnerable > 0 || p.dashTime > 0 || this.status !== 'playing') return false;
    const hit = absorbDamage(amount*(p.buffs.phase>0?0.7:1), p.armor);
    if (p.armor) p.armor.durability = hit.durability;
    p.hp = Math.max(0, p.hp-hit.damage); p.invulnerable = 0.65;
    this.extractProgress = 0; this.searchProgress = 0; this.nodeProgress = 0;
    this.effect(p.x, p.y-35, `−${Math.round(hit.damage*10)/10}`, '#ef8a7c');
    if (hit.blocked) this.effect(p.x, p.y-58, `护甲 −${Math.round(hit.blocked)}`, '#8fc5ff');
    this.event('hurt');
    if (p.hp <= 0) this.finish(false, reason);
    return true;
  }
  clash(enemy) {
    const p = this.player;
    if (enemy.dead || enemy.contactCooldown > 0 || distance(p, enemy) > p.radius+enemy.radius ||
        !this.visible(p, enemy) || this.status !== 'playing') return;
    enemy.contactCooldown = RULES.contactCooldown;
    // Snapshot both attacks so a lethal outgoing contact still has a reciprocal hit.
    const outgoing = attackDamage(p.value, enemy.value, enemy.maxHp, activeWeapon(p).rarity)*this.damagePower();
    const incoming = attackDamage(enemy.value, p.value, p.maxHp, enemy.rarity);
    const canRetaliate = enemy.stun <= 0;
    this.damageEnemy(enemy, outgoing);
    if (canRetaliate) this.hurt(incoming, '在数字碰撞中被击破');
  }
  resolveEnemyAttack(enemy, definition) {
    const p=this.player,pattern=definition.pattern,angle=Math.atan2(enemy.aimY-enemy.y,enemy.aimX-enemy.x);
    if(['strike','blast','slam'].includes(pattern)){
      const radius=pattern==='slam'?175:pattern==='blast'?118:64;
      this.effect(enemy.aimX,enemy.aimY,'','#ed8d7e','impact',0.45,{radius});
      if(distance(p,{x:enemy.aimX,y:enemy.aimY})<radius+p.radius&&this.visible(enemy,p))this.hurt(attackDamage(enemy.value,p.value,p.maxHp,enemy.rarity),pattern==='slam'?'被巨像重击击破':pattern==='blast'?'被爆破冲击击破':'被近战攻击击破');
    }else if(pattern==='charge'){
      enemy.state='charge';enemy.chargeTime=0.65;enemy.chargeX=Math.cos(angle);enemy.chargeY=Math.sin(angle);return;
    }else if(pattern==='heal'){
      const ally=this.world.enemies.find(e=>e.id===enemy.healTarget&&!e.dead);
      if(ally&&ally!==enemy&&distance(enemy,ally)<=definition.range&&this.visible(enemy,ally)){
        ally.hp=Math.min(ally.maxHp,ally.hp+ally.maxHp*.18);this.effect(ally.x,ally.y-30,'修复 +18%','#8fe5bc','text',1);
      }
      enemy.healTarget=null;
    }else if(pattern==='summon'){
      const living=this.world.enemies.filter(e=>!e.dead&&e.summonerId===enemy.id).length;
      for(let i=0;i<Math.min(2,4-living);i++){
        if((this.world.summonedCount||0)>=RULES.summonBudget)break;
        let child=null;
        for(let j=0;j<12;j++){
          const a=j*Math.PI/6+i*.4,point={x:enemy.x+Math.cos(a)*100,y:enemy.y+Math.sin(a)*100};
          if(isFree(point.x,point.y,24,obstaclesFor(this.world,point,point,24),this.world.bounds)&&this.world.enemies.every(e=>e.dead||distance(e,point)>50)){
            const count=(this.world.summonedCount||0)+1;this.world.summonedCount=count;
            child=createEnemy(`summoned-${count}`,point.x,point.y,Math.max(1,enemy.value/2),'scout');
            Object.assign(child,{summonerId:enemy.id,zone:enemy.zone,moveScale:enemy.moveScale||1,cooldown:1.2});this.world.enemies.push(child);break;
          }
        }
        if(child)this.effect(child.x,child.y,'孵化','#c4a1f2','pulse',.6);
      }
    }else if(pattern==='burst'){
      enemy.state='burst';enemy.burstLeft=3;enemy.burstTimer=0;return;
    }else{
      const offsets=pattern==='ring'?Array.from({length:8},(_,i)=>i*Math.PI/4):pattern==='fan'?[-.24,0,.24]:[0];
      for(const offset of offsets)this.shoot(enemy,angle+offset,pattern==='snipe'?1350:pattern==='ring'?270:330,pattern==='snipe'?1150:800,'enemy',enemy.value,enemy.rarity);
    }
    enemy.state='idle';enemy.cooldown=definition.cooldown;
  }
  updateEnemy(enemy,dt){
    if(enemy.dead)return;
    const definition=ENEMY_TYPES[enemy.type]||ENEMY_TYPES.hunter,pattern=definition.pattern;
    enemy.cooldown=Math.max(0,enemy.cooldown-dt);enemy.contactCooldown=Math.max(0,enemy.contactCooldown-dt);
    if(distance(enemy,this.player)>RULES.activeEnemyRadius&&!['charge','windup','burst'].includes(enemy.state)){enemy.stun=Math.max(0,enemy.stun-dt);return;}
    if(enemy.stun>0){enemy.stun=Math.max(0,enemy.stun-dt);return;}
    if(enemy.state==='charge'){
      const before={x:enemy.x,y:enemy.y};this.move(enemy,enemy.chargeX*560*dt,enemy.chargeY*560*dt);enemy.chargeTime-=dt;
      if(enemy.chargeTime<=0||distance(before,enemy)<.1){enemy.state='idle';enemy.cooldown=definition.cooldown;}return;
    }
    if(enemy.state==='burst'){
      enemy.burstTimer-=dt;
      while(enemy.burstLeft>0&&enemy.burstTimer<=0){
        const angle=Math.atan2(enemy.aimY-enemy.y,enemy.aimX-enemy.x)+(enemy.burstLeft-2)*.065;
        this.shoot(enemy,angle,610,950,'enemy',enemy.value,enemy.rarity);enemy.burstLeft--;enemy.burstTimer+=.12;
      }
      if(enemy.burstLeft===0){enemy.state='idle';enemy.cooldown=definition.cooldown;}return;
    }
    if(enemy.state==='windup'){enemy.timer-=dt;if(enemy.timer<=0)this.resolveEnemyAttack(enemy,definition);return;}
    const p=this.player,d=distance(enemy,p),conceal=d>160?(this.ground(p)?.concealment||1):1;
    const sight=d<Math.max(380,definition.range+100)*conceal&&this.visible(enemy,p);
    if(pattern==='heal'&&enemy.cooldown===0){
      const ally=this.world.enemies.filter(e=>e!==enemy&&!e.dead&&e.hp<e.maxHp&&distance(enemy,e)<=definition.range&&this.visible(enemy,e)).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
      if(ally){enemy.healTarget=ally.id;enemy.aimX=ally.x;enemy.aimY=ally.y;enemy.state='windup';enemy.timer=definition.windup;return;}
    }else if(pattern!=='heal'&&d<definition.range*conceal&&sight&&enemy.cooldown===0){
      enemy.state='windup';enemy.timer=definition.windup;enemy.aimX=p.x;enemy.aimY=p.y;return;
    }
    if(!definition.speed)return;
    let mx,my;
    if(sight&&pattern!=='heal'){
      const ranged=['fan','burst'].includes(pattern),sign=ranged&&d<190?-1:d>(['strike','slam'].includes(pattern)?65:240)?1:0;
      mx=(p.x-enemy.x)/Math.max(d,1)*sign;my=(p.y-enemy.y)/Math.max(d,1)*sign;
      if(pattern==='burst'){
        const side=Math.sin(this.elapsed*1.4+enemy.phase)>.0?1:-1;
        mx+=-(p.y-enemy.y)/Math.max(d,1)*side*.7;my+=(p.x-enemy.x)/Math.max(d,1)*side*.7;
        const norm=Math.max(1,Math.hypot(mx,my));mx/=norm;my/=norm;
      }
    }else{
      const hx=enemy.homeX+Math.cos(this.elapsed*.5+enemy.phase)*48,hy=enemy.homeY+Math.sin(this.elapsed*.45+enemy.phase)*48;
      const length=Math.hypot(hx-enemy.x,hy-enemy.y)||1;mx=(hx-enemy.x)/length*.35;my=(hy-enemy.y)/length*.35;
    }
    const speed=definition.speed*(enemy.moveScale||1)*terrainSpeed(enemy,terrainFor(this.world,enemy));this.move(enemy,mx*speed*dt,my*speed*dt);
  }
  explode(bullet,point){
    if(bullet.exploded)return;bullet.exploded=true;bullet.dead=true;
    this.effect(point.x,point.y,'','#f4bf7e','impact',.45,{radius:bullet.blast});
    for(const enemy of this.world.enemies){
      const d=distance(point,enemy);
      if(!enemy.dead&&d<=bullet.blast+enemy.radius&&this.visible(point,enemy)){
        const falloff=Math.max(.35,1-d/bullet.blast*.6);
        this.damageEnemy(enemy,attackDamage(bullet.value,enemy.value,enemy.maxHp,bullet.rarity)*bullet.power*falloff);
      }
    }
  }
  updateProjectiles(dt) {
    const bounds=this.world.bounds;
    for(const bullet of this.world.projectiles){
      if(bullet.dead)continue;
      const step=Math.min(dt,bullet.life),next={x:bullet.x+bullet.vx*step,y:bullet.y+bullet.vy*step};
      const wall=firstWallFraction(bullet,next,obstaclesFor(this.world,bullet,next,bullet.radius),bullet.radius);
      const targets=bullet.owner==='player'?this.world.enemies.filter(enemy=>!enemy.dead):[this.player];
      const hits=[];
      for(const target of targets){
        const id=target===this.player?'player':target.id;
        if(bullet.hitIds.includes(id))continue;
        const at=segmentCircleFraction(bullet,next,target,target.radius+bullet.radius);
        if(at<wall)hits.push({target,id,at});
      }
      hits.sort((a,b)=>a.at-b.at);
      if(bullet.blast){
        const impact=hits[0]?.at??Infinity,t=Math.min(impact,wall);
        if(t!==Infinity)this.explode(bullet,{x:bullet.x+(next.x-bullet.x)*Math.max(0,t-.001),y:bullet.y+(next.y-bullet.y)*Math.max(0,t-.001)});
        else if(next.x<0||next.y<0||next.x>bounds.width||next.y>bounds.height)this.explode(bullet,{x:clamp(next.x,0,bounds.width),y:clamp(next.y,0,bounds.height)});
        else if(bullet.life<=dt)this.explode(bullet,next);
        bullet.x=next.x;bullet.y=next.y;bullet.life-=step;continue;
      }
      for(const hit of hits){
        const damage=attackDamage(bullet.value,hit.target.value,hit.target.maxHp,bullet.rarity)*bullet.power;
        if(bullet.owner==='player')this.damageEnemy(hit.target,damage);else this.hurt(damage,'被敌方弹丸击破');
        bullet.hitIds.push(hit.id);
        if(bullet.pierce>0)bullet.pierce--;else{bullet.dead=true;break;}
      }
      if(wall!==Infinity)bullet.dead=true;
      bullet.x=next.x;bullet.y=next.y;bullet.life-=step;
      if(bullet.life<=0||next.x<0||next.y<0||next.x>bounds.width||next.y>bounds.height)bullet.dead=true;
      if(this.status!=='playing')return;
    }
    this.world.projectiles=this.world.projectiles.filter(bullet=>!bullet.dead);
  }
  updateInteraction(input, dt) {
    const context = this.context();
    const stationary = Math.hypot(input.x || 0, input.y || 0) < 0.15 && this.player.dashTime <= 0;
    if (!context || !input.interact || !stationary) { this.extractProgress = 0; this.searchProgress = 0; this.nodeProgress = 0; this.interactId = null; return; }
    if (context.target.id !== this.interactId) { this.extractProgress = 0; this.searchProgress = 0; this.nodeProgress = 0; this.interactId = context.target.id; }
    if (context.kind === 'exit') {
      this.extractProgress += dt; this.tutorial.extraction = true;
      if (this.extractProgress >= RULES.extractSeconds) this.finish(true, '成功撤离');
    } else if(context.kind==='node'){
      this.nodeProgress+=dt;if(this.nodeProgress>=0.9){this.activateNode(context.target);this.nodeProgress=0;}
    } else {
      if (this.bag.length >= this.capacity) { this.message('背包已满，无法开启补给箱。'); return; }
      this.searchProgress += dt;
      if (this.searchProgress >= 0.75) {
        const chest = context.target;
        chest.opened = true; this.opened++; this.tutorial.chest = true;
        this.addLoot(createLoot(chest.x, chest.y, chest.zone, chest.value, chest.id));
        this.player.dividers += chest.dividers; this.player.medkits += chest.medkits; this.searchProgress = 0;
        for (const gear of chest.gear || []) this.world.drops.push({ ...gear, x: chest.x, y: chest.y+24, dead: false });
        this.message(chest.gear?.length ? '装备已掉落在箱边。按 F 拾取，按 B 换装，1/2 切换武器。' : '补给已收入背包。左上方绿圈可以撤离。');
      }
    }
  }
  update(dt, input = {}) {
    if (this.status !== 'playing') return;
    const p = this.player;
    this.elapsed += dt;
    for (const key of ['attackCooldown','dashCooldown','invulnerable','overload']) p[key]=Math.max(0,p[key]-dt);
    for(const key of Object.keys(p.buffs))p.buffs[key]=Math.max(0,p.buffs[key]-dt);
    let mx = input.x || 0, my = input.y || 0;
    const length = Math.hypot(mx, my);
    if (length > 1) { mx /= length; my /= length; }
    if (length > 0.12) { p.facingX = mx/(Math.hypot(mx, my) || 1); p.facingY = my/(Math.hypot(mx, my) || 1); }
    if (Number.isFinite(input.aimX) && Number.isFinite(input.aimY)) {
      if (Math.hypot(input.aimX-p.x, input.aimY-p.y) > 1) p.aimAngle = Math.atan2(input.aimY-p.y, input.aimX-p.x);
      p.aimTarget = { x: input.aimX, y: input.aimY };
    } else { p.aimTarget = null; if (length > 0.12) p.aimAngle = Math.atan2(my, mx); }
    if (input.slot !== undefined) this.switchWeapon(input.slot);
    if (input.pickup) this.pickupGear();
    if (input.dash && p.dashCooldown <= 0) {
      p.dashTime = RULES.dashDuration; p.dashCooldown = RULES.dashCooldown;
      p.dashX = p.facingX; p.dashY = p.facingY; this.event('dash');
    }
    if (p.dashTime > 0) {
      this.move(p, p.dashX*RULES.dashSpeed*dt, p.dashY*RULES.dashSpeed*dt);
      p.dashTime = Math.max(0, p.dashTime-dt);
    } else {
      const speed = RULES.speed*terrainSpeed(p, terrainFor(this.world,p));
      this.move(p, mx*speed*dt, my*speed*dt);
    }
    if (input.autoAim && input.attack) {
      const enemy = this.nearestEnemy(weaponOf(activeWeapon(p)).range);
      if (enemy) p.aimAngle = Math.atan2(enemy.y-p.y, enemy.x-p.x);
    }
    if (input.overload) this.activateOverload();
    if (input.divide) this.divide();
    if (input.heal) this.heal();
    this.updateBursts(dt);
    if (input.attack) this.attack();
    for (const tile of this.world.tiles) {
      if (!tile.dead && distance(p, tile) < (p.buffs.magnet>0?135:p.radius+17) && canMerge(p.value, tile.value) && this.visible(p, tile)) {
        tile.dead = true; const old = p.value; p.value *= 2; p.hp = Math.min(p.maxHp, p.hp+8);
        this.merges++; this.tutorial.merge = true;
        this.combo=this.elapsed-this.lastMerge<4?Math.min(5,this.combo+1):1;this.lastMerge=this.elapsed;
        p.energy=Math.min(100,p.energy+RULES.energyPerMerge+(this.combo-1)*2);
        this.effect(p.x, p.y-35, `${old} + ${old} = ${p.value}`, '#a9edd1', 'text', 1.1); this.event('merge');
      }
    }
    for (const loot of this.world.drops) {
      if (loot.mustLeave) { if (distance(p, loot) > 70) loot.mustLeave = false; continue; }
      if (!loot.dead && (!loot.kind || loot.kind === 'loot') && distance(p, loot) < (p.buffs.magnet>0?220:42) &&
          this.visible(p, loot) && this.addLoot(loot)) loot.dead = true;
    }
    for (const enemy of this.world.enemies) {
      this.updateEnemy(enemy, dt); this.clash(enemy);
      if (this.status !== 'playing') return;
    }
    this.updateProjectiles(dt);
    if (this.status !== 'playing') return;
    this.world.effects = this.world.effects.filter(effect => (effect.life -= dt) > 0);
    if (this.elapsed >= this.duration) { this.finish(false, '行动超时，信号失联'); return; }
    this.updateInteraction(input, dt);
  }
  finish(success, reason) {
    if (this.result) return;
    this.status = success ? 'success' : 'dead';
    const equipped = [...this.player.weapons, this.player.armor, this.player.laser].filter(item => item && !item.starter);
    const items=[...this.bag,...equipped],materials=salvageMaterials(items);
    this.result = { id:this.id,success,reason,rawValue:this.carriedValue(),value:Math.round(this.carriedValue()*this.rewardMultiplier),number:this.player.value,
      seconds:this.elapsed,kills:this.kills,merges:this.merges,difficulty:this.difficulty.id,nodes:this.nodesActivated,
      materials:{alloy:Math.round(materials.alloy*this.rewardMultiplier),core:Math.round(materials.core*this.rewardMultiplier)},
      loot:items.map(item=>({...item})) };
    this.event('finish', { result: this.result });
  }
}
