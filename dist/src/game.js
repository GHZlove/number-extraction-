import { Siege } from './siege.js';
import { EnemyTactics, defenderNumber, exposeAttack, guardDamage, hasAffix, interruptEnemy } from './enemy-tactics.js';
import { FieldEvents } from './field-events.js';
import { actualNumber, gainEnergy, isLocked, numberShock, tickNumberPowers, useOperator, OPERATORS } from './operations.js';
import { Synergies } from './synergies.js';
import { NUMBER_SKILLS, normalizeSkills } from './skill-tree.js';
import { detectsFlashlight } from './raid-light.js';
import { enemyShotColor, playerShotColor, setWeaponMotion, swingTime } from './combat-art.js';
import { impactElement } from './elements.js';
import { applyMomentum, bounceContact, markImpact, separateEnemyContacts } from './impact-motion.js';
import { tickNumberSkills, useNumberSkill } from './number-skills.js';
import { BALANCE_VERSION } from './playtest.js';
import { RUN_BALANCE, exitRewardMultiplier, runRules, updateNumberForm, configureExpedition, extractionStatus, updateRunHazards } from './run-rules.js';
import { HeatDirector } from './heat.js';
import { PressureDirector } from './pressure.js';
import { NavigationField } from './navigation.js';
import { VERSION, RULES, WORLD, ENEMY_TYPES, PRESSURE, difficultyOf } from './config.js';
import {
  attackDamage, bagTotal, canMerge, canRecycleRemnant, remnantCoins, clamp, distance, lineOfSight, maxEnemyHealth,
  moveEntity, seededRandom, segmentCircleFraction, firstWallFraction, inAttackArc, terrainSpeed, terrainAt, isFree, zoneAt,
} from './math.js';
import { createLoot, createEnemy, generateWorld, generateSiegeWorld, lootForEnemy } from './world.js';
import { randomEquipment, activeWeapon, weaponOf, spreadOf, absorbDamage, HIT_FEEDBACK, knockbackFor, weaponPower, decorateWeapon, makeEquipment, isEquipment, armorIncompatible } from './equipment.js';
import { applyEnchantment, updateHazards, updateAfflictions, slowMultiplier } from './enchantments.js';
import { updateBoss, BOSSES } from './bosses.js';
import { updateBossZones } from './boss-hazards.js';
import { applyWarehouseGear } from './warehouse.js';
import { facilityLevel, starterLoadout, rewardMultiplier, salvageMaterials } from './shelter.js';
import { SpatialGrid, obstaclesFor, terrainFor } from './spatial.js';

export class Raid {
  constructor(save, seed = Date.now() >>> 0, options = {}) {
    this.id = `${Date.now()}-${seed}`;
    this.daily = options.daily || null;
    this.training=options.training===true;
    this.mode=options.mode==='siege'&&!this.training&&!this.daily?'siege':'extraction';
    this.random = seededRandom(seed ^ 0x5a91bd);
    this.difficulty = difficultyOf(options.difficulty ?? save.selectedDifficulty);
    this.run=runRules(this.mode==='siege'?[]:options.mutators??save.selectedMutators,options.runRules!==false);
    this.nightMode = this.mode!=='siege'&&save.nightMode === true;
    this.equippedSkills = normalizeSkills(save.unlockedSkills, save.equippedSkills).equippedSkills;
    this.duration = this.mode==='siege'?Infinity:this.difficulty.seconds*this.run.duration;
    this.rewardMultiplier = rewardMultiplier(save,this.difficulty.id)*this.run.reward;
    const layout=options.layout||save.selectedMap;
    this.world = this.mode==='siege'?generateSiegeWorld(seed,this.difficulty,layout):generateWorld(seed,this.difficulty.id,{layout,boss:options.boss||save.selectedBoss});
    for(const e of this.world.enemies)e.value*=this.run.enemyNumbers;
    this.status = 'playing';this.bursts=[];this.hitStop=0;this.hitStopCooldown=0;this.pendingInput={};
    this.elapsed = 0;
    this.director=this.mode==='siege'||options.pressure===false?null:new PressureDirector(seed,this.difficulty);
    this.navigation=new NavigationField(this.world);
    this.pressureState=this.director?.profile(0)||{speed:1,cooldown:1,windup:1};
    this.pressureState.speed*=this.run.enemySpeed;
    this.heat=this.mode!=='siege'&&this.run.enabled?new HeatDirector(this.difficulty,this.run.heatRate):null;this.exitKeys=0;
    this.crowdGrid=null;this.projectileCandidates=[];this.projectileHits=[];this.hordeKills=0;
    this.synergies=options.synergies===false?null:new Synergies();this.synergyShelter=false;
    this.showHints=this.difficulty.id==='scout'||(save.extractions||0)+(save.deaths||0)<2;
    this.result = null;
    const loadout = applyWarehouseGear(starterLoadout(save,options.weapon),options.warehouseGear);
    const supply = facilityLevel(save,'supply');
    this.player = {
      ...this.world.spawn, radius: RULES.playerRadius, value: this.mode==='siege'?2:1, hp:this.run.health, maxHp:this.run.health,healAmount:this.run.scarcity?20:30,laserDisabled:this.run.jammed,
      dividers: RULES.startingDividers + supply, medkits: this.run.scarcity?0:RULES.startingMedkits + Math.floor(supply/2),
      attackCooldown: 0, dashCooldown: 0, dashTime: 0, dashX: 1, dashY: 0,
      invulnerable: 0, chilled:0, facingX: 1, facingY: 0, aimAngle: 0,
      ...loadout, activeSlot: 0, energy: 0, overload: 0, buffs: { fury: 0, phase: 0, magnet: 0 },
    };
    Object.assign(this.player,{skillCooldowns:{},flashlight:false,sectorId:zoneAt(this.player,this.world.zones).id,parryWindow:0,parryCooldown:0,enchantCooldowns:{}});this.sectorNotice=0;
    this.playtestMetrics={huntersSpawned:0,firstHunterAt:null};
    this.startingLoadout={weapons:this.player.weapons.filter(Boolean).map(({weapon,rarity,level=1,enchant='none'})=>({weapon,rarity,level,enchant})),armorRarity:this.player.armor?.rarity||'none',laser:!!this.player.laser};
    this.bag = [];
    this.capacity = RULES.bagCapacity + facilityLevel(save,'storage') * 2;
    this.kills = 0; this.merges = 0; this.opened = 0;
    this.recycled = 0; this.recycledValue = 0;
    this.extractProgress = 0; this.searchProgress = 0; this.nodeProgress = 0; this.interactId = null;
    this.events = []; this.lastMessage = ''; this.lastMessageTime = -10;
    this.tutorial = { merge: false, chest: false, extraction: false };
    this.nodesActivated = 0; this.combo = 0; this.lastMerge = -Infinity;
    this.operators={amplify:0,equalize:0,lock:0};
    this.tactics=new EnemyTactics();
    updateNumberForm(this);
    if(this.mode==='siege')this.siege=new Siege(this,seed);
    else configureExpedition(this,seed);
    this.field=options.fieldSystems!==false&&this.run.enabled?new FieldEvents(this,seed):null;
    if(this.siege){
      if(this.field)this.field.next=Infinity;
      this.message('核心防线 · 白昼 30 秒。按 E 采矿、采购和建造。');return;
    }
    if(this.field)this.tactics.seedGarrison(this);
    if(this.training){
      this.duration=20;this.nightMode=false;
      Object.assign(this.world,{chests:[],nodes:[],tiles:[],drops:[],enemies:[],exits:[],obstacles:[],terrain:[],roads:[],merchants:[],hazards:[]});
      this.director=null;this.heat=null;this.field=null;
      this.player.value=8;
      for(const [i,dx,dy] of [[0,100,-40],[1,330,35],[2,580,76]]){
        const enemy=createEnemy('dummy-'+i,this.player.x+dx,this.player.y+dy,8,'sentry');
        Object.assign(enemy,{trainingDummy:true,maxHp:240,hp:240});
        this.world.enemies.push(enemy);
      }
      this.message('庇护所靶场 · 20 秒。1 / 2 切枪试射，Esc 可提前返回。');
      return;
    }
    this.message(`守卫主要驻守资源点。${this.difficulty.extractAt} 秒后可撤离；右键弹反，西侧安全屋有商人。`);
  }

  playtestSnapshot(){
    return {id:this.id,buildVersion:VERSION,balanceVersion:BALANCE_VERSION,seed:this.world.seed,difficulty:this.difficulty.id,map:this.world.layout,mutators:[...this.run.ids],loadout:this.startingLoadout,
      duration:this.duration,seconds:this.elapsed,number:actualNumber(this.player),heat:this.heat?.value||0,hpPercent:100*this.player.hp/this.player.maxHp,rawValue:this.carriedValue(),gearCount:this.equipmentCount(),bagCapacity:this.capacity,chests:this.opened,kills:this.kills,
      huntersSpawned:this.playtestMetrics.huntersSpawned,firstHunterAt:this.playtestMetrics.firstHunterAt,hunterWaves:this.heat?.waves||0};
  }

  visible(a,b,pad=0) { return lineOfSight(a,b,obstaclesFor(this.world,a,b,pad),pad); }
  move(entity,dx,dy) {
    const end={x:entity.x+dx,y:entity.y+dy};
    const cell=this.projectileStep&&this.crowdGrid.pointOrder?.has(entity)?this.crowdGrid.pointCell(entity):null;
    moveEntity(entity,dx,dy,obstaclesFor(this.world,entity,end,entity.radius+1),this.world.bounds);
    if(cell!==null)this.crowdGrid.movePoint(entity,cell);
  }
  ground(entity=this.player){return terrainAt(entity,terrainFor(this.world,entity));}
  safehouseAt(point=this.player,pad=0){return this.world.exits.find(e=>e.safehouse&&distance(e,point)<e.safetyRadius+pad)||null;}
  extractionStatus(exit){return extractionStatus(this,exit);}
  extractionReady(exit=null){return exit?this.extractionStatus(exit).ready:this.world.exits.some(e=>this.extractionStatus(e).ready);}
  enemyMoveScale(){return this.run.enemySpeed;}
  pressureInfo(){
    const profile=this.director?.profile(this.elapsed)||{stage:1,label:'独立模拟'};
    return {...profile,heat:this.heat?.value||0,heatLevel:this.heat?.level||0,hunters:this.world.enemies.filter(e=>e.hunter&&!e.dead).length,huntNext:Math.max(0,(this.heat?.nextHunt||0)-this.elapsed),wave:this.director?.wave||0,near:this.world.enemies.filter(e=>!e.dead&&distance(e,this.player)<1000).length,next:Math.max(0,(this.director?.nextPulse||this.elapsed)-this.elapsed)};
  }
  enemyCooldown(definition,enemy){return definition.cooldown*this.pressureState.cooldown*(enemy&&this.tactics.commandFor(enemy) ? .8 : 1);}
  interruptEnemy(enemy,seconds,forced=false){return interruptEnemy(this,enemy,seconds,forced);}
  damagePower() { return this.run.weaponPower*(this.player.overload>0?1.25:1)*(this.player.buffs.fury>0?1.35:1); }
  activateOverload() {
    const p=this.player;
    if(this.status!=='playing'||p.energy<100||p.overload>0)return false;
    p.energy=0;p.overload=RULES.overloadSeconds;
    for(const enemy of this.world.enemies)if(!enemy.dead&&distance(p,enemy)<260&&this.visible(p,enemy)){
      this.interruptEnemy(enemy,.9);
    }
    this.effect(p.x,p.y,'过载','#d5f59c','overload',0.65,{radius:260});this.event('overload');
    this.message('过载启动：7 秒内伤害 +25%，攻击速度提升。');return true;
  }
  activateNode(node) {
    if(!node||node.used||!['fury','phase','magnet'].includes(node.kind)||this.status!=='playing')return false;
    node.used=true;this.nodesActivated++;this.heat?.add(2);
    const durations={fury:20,phase:16,magnet:30};
    this.player.buffs[node.kind]=durations[node.kind];gainEnergy(this,20);
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
  tileFusion(tile, recycled = false) {
    const { x, y, radius } = this.player;
    this.effect(tile.x, tile.y, '', recycled ? '#ffda7f' : '#c8ffe9', 'tile-fusion', .46, {
      originX: x, originY: y, radius, value: tile.value, recycled,
    });
  }
  nearestEnemy(range = RULES.divideRange, predicate = () => true) {
    return this.world.enemies.filter(enemy => !enemy.dead && predicate(enemy) &&
      distance(this.player, enemy) <= Math.min(range,this.run.vision) && this.visible(this.player, enemy))
      .sort((a, b) => distance(this.player, a)-distance(this.player, b))[0] || null;
  }
  context() {
    const p = this.player;
    if(this.siege)return this.siege.context(this);
    const exit = this.world.exits.find(target => distance(p, target) < target.radius);
    if (exit){const status=this.extractionStatus(exit);return {kind:'exit',target:exit,locked:!status.ready,bossLocked:status.bossLocked,status,progress:this.extractProgress/RULES.extractSeconds};}
    const fixture=this.field?.fixtureAt(p);
    if(fixture&&this.visible(p,fixture))return {kind:'crossing',target:fixture,progress:0};
    const merchant=this.world.merchants.find(m=>distance(p,m)<115&&this.visible(p,m));
    if(merchant)return{kind:'merchant',target:merchant,progress:0};
    const chest = this.world.chests.filter(target => !target.opened && distance(p, target) < 75 && this.visible(p, target))
      .sort((a, b) => distance(p, a)-distance(p, b))[0];
    if(chest)return {kind:'chest',target:chest,progress:this.searchProgress/0.75};
    const node=(this.world.nodes||[]).find(target=>!target.used&&distance(p,target)<85&&this.visible(p,target));
    return node?{kind:'node',target:node,progress:this.nodeProgress/0.9}:null;
  }
  parryThreat() {
    const p = this.player;
    if (p.parryCooldown > 0 || this.safehouseAt()) return false;
    const facing = point => Math.cos(Math.atan2(point.y-p.y,point.x-p.x)-p.aimAngle) >= .15;
    for (const bullet of this.world.projectiles) {
      if (bullet.dead || bullet.owner !== 'enemy' || bullet.blast || !facing(bullet)) continue;
      const step = Math.min(.38,bullet.life);
      const next = { x: bullet.x+bullet.vx*step, y: bullet.y+bullet.vy*step };
      const at = segmentCircleFraction(bullet,next,p,p.radius+bullet.radius);
      if (at < firstWallFraction(bullet,next,obstaclesFor(this.world,bullet,next,bullet.radius),bullet.radius)) return true;
    }
    for (const enemy of this.world.enemies) {
      if (enemy.dead || enemy.stun > 0 || !facing(enemy)) continue;
      const melee = ENEMY_TYPES[enemy.type];
      const windup = enemy.state === 'windup' && melee?.pattern === 'strike' && distance(p,enemy) <= melee.range + p.radius;
      const contact = enemy.contactCooldown <= 0 && distance(p,enemy) <= p.radius + enemy.radius + 28;
      if ((windup || contact) && this.visible(p,enemy)) return true;
    }
    return false;
  }
  nearbyGear() {
    return this.world.drops.filter(item => !item.dead && isEquipment(item) &&
      distance(this.player, item) < 75 && this.visible(this.player, item))
      .sort((a, b) => distance(this.player, a)-distance(this.player, b))[0] || null;
  }
  equipmentCount() { return this.bag.filter(isEquipment).length; }
  addLoot(item) {
    if (this.status !== 'playing' || item.dead) return false;
    if (isEquipment(item) && this.equipmentCount() >= this.capacity) { this.message('装备背包已满。资源袋不限量；按 B 换装或丢弃装备。'); return false; }
    const { x=this.player.x, y=this.player.y, dead, ...stored } = item;
    this.bag.push({ ...stored });
    this.event('loot'); this.effect(x, y, item.kind === 'loot' || !item.kind ? `+${item.value} ◇` : item.name, '#e7c381');
    return true;
  }
  emptyGearSlot(item) {
    if (item.kind === 'weapon') return this.player.weapons[1] || item.prototype==='lightweight'&&this.player.armor ? null : 1;
    if (item.kind==='armor'&&armorIncompatible(this.player))return null;
    return this.player[item.kind] ? null : item.kind;
  }
  pickupGear() {
    const item = this.nearbyGear();
    if (!item || this.status !== 'playing') return false;
    const slot = this.emptyGearSlot(item);
    if (slot !== null) {
      const { x, y, dead, ...gear } = item;
      if (slot === 1) {
        this.player.weapons[1] = gear;
        this.synergies?.changed(1);
      } else this.player[slot] = gear;
      item.dead = true;
      this.event('loot');
      this.effect(x, y, `装备 ${item.name}`, '#e7c381');
      return true;
    }
    if (!this.addLoot(item)) return false;
    item.dead = true;
    this.message(`拾取 ${item.name}，按 B 打开背包换装。`);
    return true;
  }
  equip(index, slot = this.player.activeSlot) {
    if (this.status !== 'playing' || !Number.isInteger(index)) return false;
    const item = this.bag[index];
    if (!item || !['weapon', 'armor', 'laser'].includes(item.kind)) return false;
    if (item.kind==='armor'&&armorIncompatible(this.player)||item.prototype==='lightweight'&&this.player.armor){
      this.message('轻量化武器不能与护甲一起装备。');return false;
    }
    let old;
    if (item.kind === 'weapon') {
      if (slot !== 0 && slot !== 1) return false;
      old = this.player.weapons[slot]; this.player.weapons[slot] = item;
      this.synergies?.changed(slot);
    } else { old = this.player[item.kind]; this.player[item.kind] = item; }
    this.bag.splice(index, 1);
    if (old && !old.starter) this.bag.splice(index, 0, old);
    this.event('equip'); return true;
  }
  removeEquipment(kind) {
    if (this.status !== 'playing' || !['armor', 'laser', 'secondary'].includes(kind)) return false;
    const item = kind === 'secondary' ? this.player.weapons[1] : this.player[kind];
    if (!item || this.equipmentCount() >= this.capacity) return false;
    this.bag.push(item);
    if (kind === 'secondary') {
      this.player.weapons[1] = null;
      this.player.activeSlot = 0;
      this.synergies?.changed(1);
    } else this.player[kind] = null;
    return true;
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
    if ((slot !== 0 && slot !== 1) || this.status !== 'playing' || !this.player.weapons[slot]) return false;
    if(this.player.activeSlot!==slot)this.synergies?.switched(slot);
    this.player.activeSlot = slot;
    // A shared cooldown prevents switching from bypassing the previous weapon's cadence.
    return true;
  }
  carriedValue() { return bagTotal(this.bag.filter(item=>!isEquipment(item))); }
  carriedEquipment() { return [...this.bag,...this.player.weapons,this.player.armor,this.player.laser].filter(item=>isEquipment(item)&&!item.starter); }

  shoot(origin, angle, speed, range, owner, value, rarity = 'white', options = {}) {
    this.world.projectiles.push({ x: origin.x, y: origin.y, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
      corrupting:owner==='enemy'&&origin.type==='corruptor',blazing:owner==='enemy'&&hasAffix(origin,'blazing'),
      radius: options.radius||(owner === 'player' ? 3 : 6), life: range/speed, owner, value, rarity, weapon:options.weapon||'',intrinsic:options.intrinsic||'',element:options.element||'',enchant:options.enchant||'none',level:options.level||1,action:options.action,power: options.power ?? 1, blast: options.blast || 0, pierce: options.pierce || 0, hitIds: [], dead: false });
  }
  attack() {
    const p = this.player;
    if (p.attackCooldown > 0 || this.status !== 'playing') return false;
    if(this.safehouseAt()){this.message('安全屋内收起武器。离开保护圈后可以攻击。');return false;}
    const item = activeWeapon(p), weapon = weaponOf(item), action = this.synergies?.attack(p);
    p.attackCooldown = weapon.interval*(p.overload>0?0.75:1)/(item.prototype==='overheat'?1.35:1);
    this.event('attack',{weapon:item.weapon});
    if (weapon.mode === 'ranged') {
      const power=this.damagePower()*weaponPower(item)/(weapon.burst||1);
      this.fireWeapon(item,p.aimAngle,power,action);
      if(weapon.burst)this.bursts.push({remaining:weapon.burst-1,wait:weapon.burstDelay,delay:weapon.burstDelay,item,angle:p.aimAngle,power,slot:p.activeSlot,action});
    } else {
      const { side } = setWeaponMotion(p, item.weapon, p.aimAngle, this.elapsed);
      this.effect(p.x, p.y, '', playerShotColor(item.level), 'slash', swingTime(item.weapon), {
        angle: p.aimAngle, arc: weapon.arc, radius: weapon.range, side, weapon: item.weapon,
      });
      for(const fixture of this.field?.props||[])if(!fixture.dead&&inAttackArc(p,fixture,p.aimAngle,weapon.arc,weapon.range)&&this.visible(p,fixture)){
        this.field.strike(this,fixture,26*weaponPower(item));
      }
      if(item.enchant==='burn'&&this.field)for(const tile of this.world.tiles){
        if(!tile.dead&&tile.remnant&&inAttackArc(p,tile,p.aimAngle,weapon.arc,weapon.range)&&this.visible(p,tile)){
          this.field.ignite(this,tile);break;
        }
      }
      const targets = this.world.enemies.filter(enemy => !enemy.dead &&
        inAttackArc(p, enemy, p.aimAngle, weapon.arc, weapon.range) && this.visible(p, enemy));
      targets.sort((a, b) => distance(p, a) - distance(p, b) || a.id.localeCompare(b.id));
      for (const enemy of targets) {
        this.damageEnemy(enemy, attackDamage(p.value, enemy.value, enemy.maxHp, item.rarity)*this.damagePower()*weaponPower(item),
          {weapon:item.weapon,intrinsic:weapon.intrinsic,angle:p.aimAngle,enchant:item.enchant,level:item.level,value:p.value,rarity:item.rarity,action});
        if(weapon.stun&&!enemy.dead)this.interruptEnemy(enemy,weapon.stun);
      }
    }
    return true;
  }
  fireWeapon(item,angle,power,action){
    if(item.prototype==='overheat')this.heat?.add(1.2);
    const weapon=weaponOf(item),pellets=weapon.pellets||1,p=this.player;
    for(let i=0;i<pellets;i++){
      const offset=pellets===1?this.random()*2-1:i/(pellets-1)*2-1;
      this.shoot(p,angle+offset*spreadOf(item,p.laser&&!p.laserDisabled),weapon.speed,weapon.range,'player',action?.value??p.value,item.rarity,{action,weapon:item.weapon,intrinsic:weapon.intrinsic,radius:weapon.radius,enchant:item.enchant,level:item.level,power:power/pellets,pierce:weapon.pierce||0,blast:weapon.blast||0});
    }
    setWeaponMotion(p, item.weapon, angle, this.elapsed);
    this.effect(p.x, p.y, '', playerShotColor(item.level), 'muzzle', .12, {
      angle, radius: p.radius - 19 + (weapon.range > 850 ? 61 : 48),
      heavy: (HIT_FEEDBACK[item.weapon]?.strength || 0) >= .85,
    });
  }
  updateBursts(dt){
    if(this.safehouseAt()){this.bursts=[];return;}
    for(const job of this.bursts){
      if(this.player.activeSlot!==job.slot||activeWeapon(this.player)!==job.item){job.remaining=0;continue;}
      job.wait-=dt;
      while(job.remaining>0&&job.wait<=0){this.event('attack',{weapon:job.item.weapon});this.fireWeapon(job.item,job.angle,job.power,job.action);job.remaining--;job.wait+=job.delay;}
    }
    this.bursts=this.bursts.filter(job=>job.remaining>0);
  }
  damageEnemy(enemy,amount,impact={}){
    if(enemy.dead)return;
    if(enemy.radixShield>0&&!impact.secondary&&amount>0){
      enemy.radixShield--;this.effect(enemy.x,enemy.y-33,'进制盾 '+enemy.radixShield,'#9ce5ff','text',.6);
      this.event('armorbreak',{strength:.5});return;
    }
    if(!impact.secondary&&!impact.tower)enemy.attackedUntil=this.elapsed+5;
    const angle=impact.angle??Math.atan2(enemy.y-this.player.y,enemy.x-this.player.x);
    const shield=guardDamage(this,enemy,amount,angle,impact);
    const vulnerability=enemy.sundered>0?(enemy.boss?1.06:1.12):1;
    const hit=absorbDamage(shield.amount*(enemy.damageResistance??1)*vulnerability,impact.ignoreArmor?null:enemy.armor),oldArmor=impact.ignoreArmor?0:enemy.armor?.durability||0,oldHp=enemy.hp;
    if(enemy.armor&&!impact.ignoreArmor)enemy.armor.durability=hit.durability;
    enemy.hp=Math.max(0,enemy.hp-hit.damage);enemy.hitFlash=.105;
    const weapon=impact.weapon||'contact',feel=HIT_FEEDBACK[weapon]||HIT_FEEDBACK.contact;
    const knock=impact.secondary||impact.noKnock?0:knockbackFor(weapon,impact.value||this.player.value,enemy.value,impact.rarity||'white',impact.level||1,enemy.boss?.25:enemy.type==='brute'?.6:1)*(shield.guarded?.15:1)*(hasAffix(enemy,'unstoppable')?.1:1);
    if (!impact.secondary || impact.element) markImpact(this, enemy, feel.strength >= .9 || impact.element ? 'heavy' : 'light', angle, feel.strength);
    enemy.knockX=(enemy.knockX||0)+Math.cos(angle)*knock;enemy.knockY=(enemy.knockY||0)+Math.sin(angle)*knock;
    const length=Math.hypot(enemy.knockX,enemy.knockY);if(length>700){enemy.knockX*=700/length;enemy.knockY*=700/length;}
    if(knock>0)enemy.recover=Math.max(enemy.recover||0,Math.min(.12,feel.strength*.06));
    const x=impact.x??enemy.x-Math.cos(angle)*enemy.radius*.5,y=impact.y??enemy.y-Math.sin(angle)*enemy.radius*.5;
    this.effect(x,y,'',hit.blocked?'#70d9ff':impactElement(impact)?.color||'#fff4c4','hit-spark',.18,{angle,radius:22+feel.strength*18,strength:feel.strength,seed:enemy.id.length*19+enemy.value});
    this.effect(enemy.x,enemy.y-20,`−${Math.round(hit.damage*10)/10}`,'#fff2c2','text',.7,{heavy:feel.strength>=.9});
    if(!impact.secondary)this.event('hit',{weapon,angle,strength:feel.strength,blocked:hit.blocked>0});
    if(feel.stop>0&&this.hitStopCooldown<=0){this.hitStop=feel.stop;this.hitStopCooldown=.18;}
    if(oldArmor>0&&hit.durability<=0){this.effect(enemy.x,enemy.y-45,'破甲','#7ad8ff','text',.9);this.event('armorbreak',{strength:1});}
    else if(hit.blocked)this.effect(enemy.x,enemy.y-42,'护甲','#8fc5ff');
    if(enemy.hp<=0)this.kill(enemy,impact);
    const lostHp = Math.min(oldHp,hit.damage);
    if(enemy.trainingDummy&&impact.action&&!impact.secondary&&lostHp>0){
      const action=impact.action,previous=this.trainingHit;
      this.trainingHit={action,damage:(previous?.action===action?previous.damage:0)+lostHp,
        distance:Math.round(distance(action,enemy)),range:weaponOf(action.item).range};
    }
    const applied = applyEnchantment(this,enemy,lostHp,{...impact,baseAmount:amount});
    if(impact.tower&&lostHp>0&&!enemy.dead)this.synergies?.primeTower(this,enemy,impact.tower,applied);
    if (impact.action && !impact.secondary && lostHp > 0) this.synergies?.hit(this,enemy,impact,applied,lostHp,knock,angle);
  }
  kill(enemy,impact={}){
    if(enemy.dead)return;
    enemy.dead=true;
    if(enemy.trainingDummy){enemy.respawnAt=this.elapsed+.7;this.effect(enemy.x,enemy.y-26,'木桩命中','#ffc98b','text',.8);return;}
    if(hasAffix(enemy,'blazing')&&!impact.defused)this.tactics.addFire(this,enemy,enemy);
    this.kills++;
    if(this.siege){this.siege.receiveKill(enemy);return;}
    this.heat?.add(enemy.boss?RUN_BALANCE.bossHeat:RUN_BALANCE.killHeat);
    if(this.run.volatile&&!enemy.boss&&!impact.defused&&this.world.hazards.filter(h=>h.runHazard).length<32)this.world.hazards.push({kind:'deathburst',runHazard:true,owner:'enemy',x:enemy.x,y:enemy.y,radius:RUN_BALANCE.burstRadius,age:0,warn:RUN_BALANCE.burstWarning,life:RUN_BALANCE.burstWarning+.2,color:'#ff8055',label:'残爆',done:false});this.event('kill',{weapon:impact.weapon,strength:HIT_FEEDBACK[impact.weapon]?.strength||.6});
    if(!impact.detonated)for(let i=0;i<(enemy.rewardScale||1);i++){
      this.world.tiles.push({id:i?`remnant-${enemy.id}-${i}`:`remnant-${enemy.id}`,x:enemy.x+i*18,y:enemy.y,value:enemy.value,
        remnant:true,coins:remnantCoins(enemy.value),dead:false});
    }
    gainEnergy(this,enemy.elite?8:enemy.horde?4:2);
    if(enemy.horde)this.hordeKills++;
    if(!enemy.horde||this.random()<.35){
      const loot=lootForEnemy(enemy,this.world.zones);loot.value*=enemy.rewardScale||1;this.world.drops.push(loot);
    }
    if(this.random()<(enemy.horde?.08:.42)){
      const gear=randomEquipment(this.random,enemy.zone??zoneAt(enemy,this.world.zones).risk,`gear-${enemy.id}`);this.world.drops.push({...gear,x:enemy.x,y:enemy.y,dead:false});
    }
    this.effect(enemy.x,enemy.y,'击破','#ffb4df');
    if((HIT_FEEDBACK[impact.weapon]?.strength||0)>=.9)this.effect(enemy.x+25,enemy.y-21,'BOOM!','#ffb4cf','comic',.72);
    this.effect(enemy.x,enemy.y,'','#ff73b6','shatter',.35,{radius:48,seed:enemy.id.length*17+enemy.value});
    if(enemy.boss){
      const loot={...createLoot(enemy.x,enemy.y,2,220+enemy.bossRank*100,`boss-loot-${enemy.id}`),bossLoot:true,name:'首领核心物资'};
      const definition=BOSSES[enemy.boss];
      const gear=decorateWeapon(makeEquipment('weapon',definition.weapon,'purple',`boss-weapon-${enemy.id}`),definition.enchant,3);
      for(const add of this.world.enemies)if(add.bossOwnerId===enemy.id)add.dead=true;
      this.world.hazards=this.world.hazards.filter(h=>h.sourceId!==enemy.id);
      this.world.chests.push({id:`boss-cache-${enemy.id}`,x:enemy.x,y:enemy.y,zone:2,value:loot.value,bossLoot:true,opened:false,gear:[gear],dividers:2,medkits:1});
      this.message(`${enemy.bossName}已击败！核心物资箱已出现，对应撤离点解除封锁。`);
    }
  }
  spawnBossAdds(boss,count,type){
    if(isLocked(this,boss))return 0;
    if(this.status!=='playing'||this.safehouseAt())return 0;
    let spawned=0;
    for(let n=0;n<count;n++){
      if((boss.summonedTotal||0)>=18||this.world.enemies.filter(e=>e.bossOwnerId===boss.id&&!e.dead).length>=6||this.world.enemies.filter(e=>e.bossOwnerId&&!e.dead).length>=24)break;
      for(let attempt=0;attempt<16;attempt++){
        const angle=(attempt+n*3+boss.bossStep)*Math.PI/8,point={x:boss.x+Math.cos(angle)*180,y:boss.y+Math.sin(angle)*180};
        if(this.safehouseAt(point,80)||!isFree(point.x,point.y,24,obstaclesFor(this.world,point,point,24),this.world.bounds)||distance(point,this.player)<100)continue;
        const serial=(this.world.bossAddSerial||0)+1;this.world.bossAddSerial=serial;
        const child=createEnemy(`boss-add-${serial}`,point.x,point.y,Math.max(1,boss.value/4),type);
        Object.assign(child,{bossOwnerId:boss.id,guard:true,horde:true,zone:boss.zone,sectorId:boss.sectorId,leash:550,cooldown:1.3});
        this.world.enemies.push(child);boss.summonedTotal=(boss.summonedTotal||0)+1;spawned++;break;
      }
    }
    return spawned;
  }
  divideTarget() {
    const p = this.player, aimX = Math.cos(p.aimAngle), aimY = Math.sin(p.aimAngle);
    const range = Math.min(RULES.divideRange, this.run.vision);
    let target = null, best = Infinity;
    for (const enemy of this.world.enemies) {
      if (enemy.dead || enemy.value <= 1) continue;
      const dx = enemy.x - p.x, dy = enemy.y - p.y, d = Math.hypot(dx,dy);
      if (d > range || !this.visible(p,enemy)) continue;
      const direction = d > 0 ? (dx*aimX + dy*aimY)/d : 0;
      const score = d + (1 - direction)*range*.75 - (enemy.value > p.value ? range*.18 : 0);
      if (score < best || (score === best && enemy.id < target.id)) { target = enemy; best = score; }
    }
    return target;
  }
  divide() {
    const p = this.player;
    if (!p.dividers) { this.message('没有 ÷2 道具了。补给箱中可能找到运算道具。'); return; }
    const enemy = this.divideTarget();
    if (!enemy) { this.message('÷2 需要 215 范围内、有视线且数字大于 1 的敌人。'); return; }
    if(isLocked(this,enemy)){this.message('目标数字已锁定。');return;}
    p.dividers--;
    const old = enemy.value, ratio = clamp(enemy.hp/enemy.maxHp, 0, 1), guarded=enemy.radixShield>0||enemy.shieldHp>0;
    if(guarded)enemy.radixShield=0;
    if(enemy.shieldHp>0){enemy.shieldHp*=.5;enemy.shieldBrokenUntil=this.elapsed+5;}
    if(!enemy.prime&&!guarded){
      enemy.value /= 2; enemy.maxHp = enemy.boss?enemy.maxHp:maxEnemyHealth(enemy.value); enemy.hp = ratio*enemy.maxHp;
    }
    this.interruptEnemy(enemy,enemy.prime?.4:enemy.boss?.35:RULES.divideStun,true);enemy.timer=0;enemy.cooldown=.8;
    this.effect(enemy.x, enemy.y-35, enemy.prime?'质数 · 打断':guarded?'进制盾解除':`${old} ÷ 2 → ${enemy.value}`, '#c3b4fa', 'text', 1.25);
    this.effect(enemy.x, enemy.y, '', '#b9a5f4', 'pulse', 0.4);
    this.event('divide'); this.message(enemy.prime?'质数不可减半，已暂时打断。':guarded?'进制护盾已解除。':`敌人 ${old} → ${enemy.value}，攻击已打断。`);
  }
  heal() {
    const p = this.player;
    if (p.medkits < 1) { this.message('修复剂已用完。'); return; }
    if (p.hp >= p.maxHp) { this.message('生命值已满，无需修复。'); return; }
    p.medkits--; p.hp = Math.min(p.maxHp, p.hp+p.healAmount); this.event('heal'); this.effect(p.x, p.y-30, `修复 +${p.healAmount}`);
  }
  tryParry(source,{projectile=false}={}){
    const p=this.player;if(p.parryWindow<=0||!source||this.status!=='playing'||this.safehouseAt())return false;
    const angle=Math.atan2(source.y-p.y,source.x-p.x);
    if(Math.cos(angle-p.aimAngle)<.15)return false;
    p.parryWindow=0;p.parryCooldown=Math.min(p.parryCooldown,.45);p.invulnerable=Math.max(p.invulnerable,.22);gainEnergy(this,12);
    this.effect(p.x,p.y,'','#8eefff','pulse',.35,{radius:90});this.effect(p.x,p.y-55,'弹反！','#8eefff','text',.65);this.effect(p.x+38,p.y-20,'CLANG!','#f9dd92','comic',.64);this.event('parry',{strength:1.2});
    if(!projectile&&this.world.enemies.includes(source)&&!source.dead){
      this.interruptEnemy(source,source.boss?.65:1,true);
      this.damageEnemy(source,attackDamage(p.value,source.value,source.maxHp)*1.25,{weapon:'contact'});
    }
    return true;
  }
  hurt(amount, reason = '遭到敌人击破', options={}) {
    const p = this.player;
    if(this.safehouseAt())return false;
    if(options.parryable&&this.tryParry(options.source))return false;
    if (p.invulnerable > 0 || p.dashTime > 0 || this.status !== 'playing') return false;
    if(amount>0&&p.digitShield){
      p.digitShield=false;p.shieldReadyAt=this.elapsed+22;
      this.effect(p.x,p.y-38,'数字护盾','#8be5f8','pulse',.5);this.event('armorbreak',{strength:.45});return false;
    }
    const hit = absorbDamage(amount*this.run.incomingDamage*(p.buffs.phase>0?0.7:1)*(p.form?.damage||1), p.armor);
    if (p.armor) p.armor.durability = hit.durability;
    const previousHp=p.hp;
    p.hp = Math.max(0, p.hp-hit.damage); p.invulnerable = 0.65;
    if(previousHp>p.hp&&(options.source?.blazing||hasAffix(options.source,'blazing')))this.tactics.ignitePlayer(this,options.source);
    if(previousHp>p.hp&&options.source?.corrupting&&!(p.buffs.phase>0))p.corrupted=4;
    const source = options.source;
    const angle = source ? Math.atan2(p.y - source.y, p.x - source.x) : p.aimAngle;
    markImpact(this, p, hit.damage >= 24 ? 'heavy' : 'light', angle);
    this.extractProgress = 0; this.searchProgress = 0; this.nodeProgress = 0;
    this.effect(p.x, p.y-35, `−${Math.round(hit.damage*10)/10}`, '#ef8a7c');
    if (hit.blocked) this.effect(p.x, p.y-58, `护甲 −${Math.round(hit.blocked)}`, '#8fc5ff');
    this.event('hurt',{damage:previousHp-p.hp});
    if (p.hp <= 0) this.finish(false, reason);
    return true;
  }
  clash(enemy) {
    const p = this.player;
    if (enemy.trainingDummy || enemy.dead || this.safehouseAt() || enemy.contactCooldown > 0 || distance(p, enemy) > p.radius+enemy.radius ||
        !this.visible(p, enemy) || this.status !== 'playing') return;
    enemy.contactCooldown = RULES.contactCooldown;
    if(enemy.stun<=0&&this.tryParry(enemy))return;
    // Snapshot both attacks so a lethal outgoing contact still has a reciprocal hit.
    const outgoing = attackDamage(p.value, enemy.value, enemy.maxHp, activeWeapon(p).rarity)*this.damagePower()*weaponPower(activeWeapon(p));
    const incoming = attackDamage(enemy.value, defenderNumber(p), p.maxHp, enemy.rarity);
    const canRetaliate = enemy.stun <= 0;
    this.damageEnemy(enemy, outgoing, { noKnock: true });
    if (canRetaliate) this.hurt(incoming, '在数字碰撞中被击破', { source: enemy });
    bounceContact(this, enemy, canRetaliate);
  }
  enemyLaunch(enemy, angle, pattern = 'shot') {
    this.effect(enemy.x, enemy.y, '', enemyShotColor(enemy.value), 'muzzle', pattern === 'rush' ? .24 : .16, {
      angle, pattern, radius: pattern === 'ring' ? enemy.radius + 16 : enemy.radius,
      heavy: enemy.boss || pattern === 'snipe' || pattern === 'rush',
    });
  }
  resolveEnemyAttack(enemy, definition) {
    const p=this.player,pattern=definition.pattern,angle=Math.atan2(enemy.aimY-enemy.y,enemy.aimX-enemy.x);
    if(['strike','blast','slam'].includes(pattern)){
      const radius=pattern==='slam'?175:pattern==='blast'?118:64;
      const color = pattern === 'blast' ? '#ff923f' : pattern === 'slam' ? '#f67657' : '#f26578';
      this.effect(enemy.aimX, enemy.aimY, '', color, 'enemy-impact', .38, { radius, heavy: pattern !== 'strike' });
      if(distance(p,{x:enemy.aimX,y:enemy.aimY})<radius+p.radius&&this.visible(enemy,p))this.hurt(attackDamage(enemy.value,defenderNumber(p),p.maxHp,enemy.rarity),pattern==='slam'?'被巨像重击击破':pattern==='blast'?'被爆破冲击击破':'被近战攻击击破',{source:enemy,parryable:pattern!=='blast'});
    }else if(pattern==='charge'){
      this.enemyLaunch(enemy, angle, 'rush');
      enemy.state='charge';enemy.chargeTime=0.65;enemy.chargeX=Math.cos(angle);enemy.chargeY=Math.sin(angle);return;
    }else if(pattern==='heal'){
      const ally=this.world.enemies.find(e=>e.id===enemy.healTarget&&!e.dead);
      if(ally&&ally!==enemy&&!isLocked(this,ally)&&distance(enemy,ally)<=definition.range&&this.visible(enemy,ally)){
        ally.hp=Math.min(ally.maxHp,ally.hp+ally.maxHp*.18);this.effect(ally.x,ally.y-30,'修复 +18%','#8fe5bc','text',1);
      }
      enemy.healTarget=null;
    }else if(pattern==='summon'&&!isLocked(this,enemy)){
      const living=this.world.enemies.filter(e=>!e.dead&&e.summonerId===enemy.id).length;
      for(let i=0;i<Math.min(2,4-living);i++){
        if((this.world.summonedCount||0)>=RULES.summonBudget||this.world.enemies.filter(e=>!e.dead).length>=640)break;
        if(enemy.horde&&!enemy.guard&&this.world.enemies.filter(e=>!e.dead&&e.horde&&!e.guard&&!e.hunter).length+this.world.spawnWarnings.filter(m=>!m.guard&&!m.hunter).length>=PRESSURE.patrolCap)break;
        if(this.director&&this.world.enemies.filter(e=>!e.dead&&distance(e,p)<1500).length>=this.director.profile(this.elapsed).nearCap)break;
        let child=null;
        for(let j=0;j<12;j++){
          const a=j*Math.PI/6+i*.4,point={x:enemy.x+Math.cos(a)*100,y:enemy.y+Math.sin(a)*100};
          if(distance(point,p)>p.radius+35&&isFree(point.x,point.y,24,obstaclesFor(this.world,point,point,24),this.world.bounds)&&this.world.enemies.every(e=>e.dead||distance(e,point)>50)){
            const count=(this.world.summonedCount||0)+1;this.world.summonedCount=count;
            child=createEnemy(`summoned-${count}`,point.x,point.y,Math.max(1,enemy.value/2),'scout');
            Object.assign(child,{summonerId:enemy.id,zone:enemy.zone,sectorId:zoneAt(point,this.world.zones).id,horde:!!enemy.horde,guard:!!enemy.guard,siteId:enemy.siteId,leash:850,aggro:8,moveScale:enemy.moveScale||1,cooldown:1.2});this.world.enemies.push(child);break;
          }
        }
        if(child)this.effect(child.x,child.y,'孵化','#c4a1f2','pulse',.6);
      }
    }else if(pattern==='summon'){
      this.effect(enemy.x,enemy.y-42,'LOCK','#d3b5fb','text',.5);
    }else if(pattern==='burst'){
      enemy.state='burst';enemy.burstLeft=3;enemy.burstTimer=0;return;
    }else{
      const offsets=pattern==='ring'?Array.from({length:8},(_,i)=>i*Math.PI/4):pattern==='fan'?[-.24,0,.24]:[0];
      this.enemyLaunch(enemy, angle, pattern);
      for(const offset of offsets)this.shoot(enemy,angle+offset,pattern==='snipe'?1350:pattern==='ring'?330:460,pattern==='snipe'?1150:800,'enemy',enemy.value,enemy.rarity);
    }
    enemy.state='idle';enemy.cooldown=this.enemyCooldown(definition,enemy);
  }
  updateEnemy(enemy,dt){
    if(enemy.trainingDummy){
      if(enemy.dead&&this.elapsed>=enemy.respawnAt){enemy.dead=false;enemy.hp=enemy.maxHp;enemy.afflictions={};}
      enemy.hitFlash=Math.max(0,(enemy.hitFlash||0)-dt);
      return;
    }
    if(enemy.dead)return;
    enemy.hitFlash=Math.max(0,(enemy.hitFlash||0)-dt);
    applyMomentum(this, enemy, dt);
    const definition=ENEMY_TYPES[enemy.type]||ENEMY_TYPES.hunter,pattern=definition.pattern;
    enemy.cooldown=Math.max(0,enemy.cooldown-dt);enemy.contactCooldown=Math.max(0,enemy.contactCooldown-dt);
    if(!this.siege&&distance(enemy,this.player)>RULES.activeEnemyRadius&&!['charge','windup','burst','healing','detonating'].includes(enemy.state)){enemy.stun=Math.max(0,enemy.stun-dt);return;}
    if(enemy.stun>0){enemy.stun=Math.max(0,enemy.stun-dt);return;}
    enemy.poisoned=Math.max(0,(enemy.poisoned||0)-dt);
    if((enemy.state==='detonating'||enemy.state==='healing')&&this.tactics.special(this,enemy,dt))return;
    if(enemy.recover>0){enemy.recover=Math.max(0,enemy.recover-dt);return;}
    if(enemy.boss){updateBoss(this,enemy,dt);return;}
    if(this.tactics.special(this,enemy,dt))return;
    if(enemy.fusingUntil>this.elapsed)return;
    if(this.siege?.march(this,enemy,dt))return;
    if(enemy.signalTarget?.until>this.elapsed&&!this.safehouseAt()){
      const d=distance(enemy,enemy.signalTarget);
      if(d>35){const speed=definition.speed*1.18*dt/d;
        this.move(enemy,(enemy.signalTarget.x-enemy.x)*speed,(enemy.signalTarget.y-enemy.y)*speed);return;
      }
    }
    if(enemy.guard&&distance(enemy,{x:enemy.homeX,y:enemy.homeY})>(enemy.leash||850))enemy.returning=true;
    if(enemy.returning&&distance(enemy,{x:enemy.homeX,y:enemy.homeY})<100)enemy.returning=false;
    if(this.safehouseAt(this.player)||enemy.returning){
      enemy.state='idle';enemy.aggro=0;const d=distance(enemy,{x:enemy.homeX,y:enemy.homeY});
      if(d>15)this.move(enemy,(enemy.homeX-enemy.x)/d*120*dt,(enemy.homeY-enemy.y)/d*120*dt);return;
    }
    if(enemy.state==='charge'){
      const before={x:enemy.x,y:enemy.y};
      const stride=560*this.run.enemySpeed*dt*slowMultiplier(enemy)*(this.field?.slow(this,enemy)??1);
      this.move(enemy,enemy.chargeX*stride,enemy.chargeY*stride);enemy.chargeTime-=dt;
      if(enemy.chargeTime<=0||distance(before,enemy)<.1){enemy.state='idle';enemy.cooldown=this.enemyCooldown(definition,enemy);}return;
    }
    if(enemy.state==='burst'){
      enemy.burstTimer-=dt;
      while(enemy.burstLeft>0&&enemy.burstTimer<=0){
        const angle=Math.atan2(enemy.aimY-enemy.y,enemy.aimX-enemy.x)+(enemy.burstLeft-2)*.065;
        this.enemyLaunch(enemy, angle);
        this.shoot(enemy,angle,700,950,'enemy',enemy.value,enemy.rarity);enemy.burstLeft--;enemy.burstTimer+=.12;
      }
      if(enemy.burstLeft===0){enemy.state='idle';enemy.cooldown=this.enemyCooldown(definition,enemy);}return;
    }
    if(enemy.state==='windup'){enemy.timer-=dt;if(enemy.timer<=0)this.resolveEnemyAttack(enemy,definition);return;}
    const p=this.player,d=distance(enemy,p),conceal=d>160?(this.ground(p)?.concealment||1):1;
    const visible=this.visible(enemy,p),sight=visible&&(d<Math.max(850,definition.range+180)*conceal*(this.nightMode?.57:1)||detectsFlashlight(p,enemy,this.field?.lampScale(this)??1));
    enemy.aggro=Math.max(0,(enemy.aggro||0)-dt);if(sight)enemy.aggro=5;
    const pursuing=enemy.horde||enemy.aggro>0;
    const readyToAttack=pattern!=='healer'&&pattern!=='kamikaze'&&enemy.cooldown===0;
    const beginWindup=()=>{enemy.state='windup';enemy.windup=Math.max(.28,definition.windup*this.pressureState.windup);enemy.timer=enemy.windup;};
    if(pattern==='heal'&&readyToAttack){
      const ally=this.world.enemies.filter(e=>e!==enemy&&!e.dead&&!isLocked(this,e)&&e.hp<e.maxHp&&distance(enemy,e)<=definition.range&&this.visible(enemy,e)).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
      if(ally&&exposeAttack(this,enemy)){enemy.healTarget=ally.id;enemy.aimX=ally.x;enemy.aimY=ally.y;beginWindup();return;}
    }else if(readyToAttack&&d<definition.range*conceal&&visible&&exposeAttack(this,enemy)){
      enemy.aimX=p.x;enemy.aimY=p.y;beginWindup();return;
    }
    if(!definition.speed)return;
    let mx,my;
    if(enemy.formation?.until>this.elapsed){
      const length=distance(enemy,enemy.formation)||1;mx=(enemy.formation.x-enemy.x)/length;my=(enemy.formation.y-enemy.y)/length;
    }else if(pursuing){
      const ranged=['fan','burst','heal','summon','ring'].includes(pattern),sign=ranged&&d<185?-1:d>(['strike','slam'].includes(pattern)?38:pattern==='heal'?330:240)?1:0;
      mx=(p.x-enemy.x)/Math.max(d,1)*sign;my=(p.y-enemy.y)/Math.max(d,1)*sign;
      if(!visible){const route=this.navigation.direction(enemy,p);if(route){mx=route.x;my=route.y;}}
      if(pattern==='burst'&&visible){
        const side=Math.sin(this.elapsed*1.4+enemy.phase)>.0?1:-1;
        mx+=-(p.y-enemy.y)/Math.max(d,1)*side*.7;my+=(p.x-enemy.x)/Math.max(d,1)*side*.7;
        const norm=Math.max(1,Math.hypot(mx,my));mx/=norm;my/=norm;
      }
    }else{
      const hx=enemy.homeX+Math.cos(this.elapsed*.5+enemy.phase)*48,hy=enemy.homeY+Math.sin(this.elapsed*.45+enemy.phase)*48;
      const length=Math.hypot(hx-enemy.x,hy-enemy.y)||1;mx=(hx-enemy.x)/length*.35;my=(hy-enemy.y)/length*.35;
    }
    if(this.crowdGrid){
      let sx=0,sy=0;
      for(const other of this.crowdGrid.query(enemy,enemy,75)){
        if(other===enemy||other.dead)continue;const d=distance(enemy,other),wanted=enemy.radius+other.radius+12;
        if(d<wanted){const angle=d<.01?enemy.phase+other.phase:0,side=enemy.id<other.id?1:-1;sx+=(d<.01?Math.cos(angle)*side:(enemy.x-other.x)/d)*(1-d/wanted);sy+=(d<.01?Math.sin(angle)*side:(enemy.y-other.y)/d)*(1-d/wanted);}
      }
      mx+=sx*.9;my+=sy*.9;const norm=Math.max(1,Math.hypot(mx,my));mx/=norm;my/=norm;
    }
    const speed=Math.min(PRESSURE.maxChaseSpeed,definition.speed*(enemy.moveScale||1)*this.pressureState.speed)*(this.tactics.commandFor(enemy)?1.15:1)*terrainSpeed(enemy,terrainFor(this.world,enemy))*slowMultiplier(enemy)*(this.field?.slow(this,enemy)??1)*(actualNumber(p)>=512&&enemy.value<actualNumber(p)&&d<240?.86:1);enemy.chaseSpeed=speed;this.move(enemy,mx*speed*dt,my*speed*dt);
  }
  explode(bullet,point){
    if(bullet.exploded)return;bullet.exploded=true;bullet.dead=true;
    this.effect(point.x,point.y,'',bullet.element==='fire'?'#ff9155':'#f4bf7e','impact',.45,{radius:bullet.blast});this.event('explosion',{weapon:'grenade',strength:1.25});
    if(bullet.owner==='player'){
      if(bullet.element==='fire'||bullet.intrinsic==='burn'||bullet.enchant==='burn')this.field?.igniteArea(this,point,bullet.blast);
      for(const prop of this.field?.props||[])if(!prop.dead&&distance(point,prop)<bullet.blast&&this.visible(point,prop)){
        this.field.strike(this,prop,30*bullet.power);
      }
    }
    for(const enemy of this.world.enemies){
      const d=distance(point,enemy);
      if(!enemy.dead&&d<=bullet.blast+enemy.radius&&this.visible(point,enemy)){
        const falloff=Math.max(.35,1-d/bullet.blast*.6);
        this.damageEnemy(enemy,attackDamage(bullet.value,enemy.value,enemy.maxHp,bullet.rarity)*bullet.power*falloff,{weapon:bullet.weapon||'grenade',splash:true,intrinsic:bullet.intrinsic,element:bullet.element,angle:Math.atan2(enemy.y-point.y,enemy.x-point.x),enchant:bullet.enchant,level:bullet.level,value:bullet.value,rarity:bullet.rarity,action:bullet.action});
      }
    }
  }
  updateProjectiles(dt) {
    const projectiles = this.world.projectiles;
    if (!projectiles.length) return;
    const bounds = this.world.bounds, grid = (this.crowdGrid ||= new SpatialGrid([],96));
    const candidates = this.projectileCandidates, hits = this.projectileHits;
    // Enemies have already moved and separated. Index their actual impact-time positions once.
    if (projectiles.some(bullet => !bullet.dead && bullet.owner === 'player')) grid.rebuildLivingPoints(this.world.enemies);
    this.projectileStep = true;
    for(const bullet of projectiles){
      if(bullet.dead)continue;
      const step=Math.min(dt,bullet.life),next={x:bullet.x+bullet.vx*step,y:bullet.y+bullet.vy*step};
      const wall=firstWallFraction(bullet,next,obstaclesFor(this.world,bullet,next,bullet.radius),bullet.radius);
      if (bullet.owner === 'player') {
        grid.queryPoints(bullet, next, grid.maxRadius + bullet.radius, candidates);
      } else {
        candidates.length = 1;
        candidates[0] = this.player;
      }
      hits.length = 0;
      for(const target of candidates){
        const id=target===this.player?'player':target.id;
        if(target.dead||bullet.hitIds.includes(id))continue;
        const at=segmentCircleFraction(bullet,next,target,target.radius+bullet.radius);
        if(at<wall)hits.push({target,id,at});
      }
      if (hits.length > 1) hits.sort((a,b) => a.at-b.at || grid.pointOrder.get(a.target)-grid.pointOrder.get(b.target));
      const fixture=this.field?.fixtureFraction(this,bullet,next,Math.min(wall,hits[0]?.at??Infinity));
      if(bullet.owner==='player'&&!bullet.blast&&(bullet.element==='fire'||bullet.intrinsic==='burn'||bullet.enchant==='burn')){
        const fraction=Math.min(1,wall,fixture?.at??Infinity,bullet.pierce?Infinity:(hits[0]?.at??Infinity));
        this.field?.igniteSweep(this,bullet,{x:bullet.x+(next.x-bullet.x)*fraction,y:bullet.y+(next.y-bullet.y)*fraction});
      }
      if(fixture){
        const point={x:bullet.x+(next.x-bullet.x)*fixture.at,y:bullet.y+(next.y-bullet.y)*fixture.at};
        if(bullet.blast)this.explode(bullet,point);
        else{this.field.strike(this,fixture.prop,Math.max(7,32*bullet.power));bullet.dead=true;}
        continue;
      }
      if(bullet.blast){
        const impact=hits[0]?.at??Infinity,t=Math.min(impact,wall);
        if(t!==Infinity)this.explode(bullet,{x:bullet.x+(next.x-bullet.x)*Math.max(0,t-.001),y:bullet.y+(next.y-bullet.y)*Math.max(0,t-.001)});
        else if(next.x<0||next.y<0||next.x>bounds.width||next.y>bounds.height)this.explode(bullet,{x:clamp(next.x,0,bounds.width),y:clamp(next.y,0,bounds.height)});
        else if(bullet.life<=dt)this.explode(bullet,next);
        bullet.x=next.x;bullet.y=next.y;bullet.life-=step;continue;
      }
      for(const hit of hits){
        if(hit.target.dead)continue;
        if(bullet.owner==='enemy'&&this.tryParry(bullet,{projectile:true})){
          const item=activeWeapon(this.player),speed=Math.max(700,Math.hypot(bullet.vx,bullet.vy)),a=this.player.aimAngle;
          Object.assign(bullet,{owner:'player',value:this.player.value,rarity:item.rarity,shotLevel:item.level,power:1.25,weapon:'pistol',vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,x:this.player.x+Math.cos(a)*34,y:this.player.y+Math.sin(a)*34,life:1.5,hitIds:[],reflected:true,action:undefined,corrupting:false,blazing:false});break;
        }
        const damage=attackDamage(bullet.value,bullet.owner==='enemy'?defenderNumber(this.player):hit.target.value,hit.target.maxHp,bullet.rarity)*bullet.power;
        if(bullet.owner==='player')this.damageEnemy(hit.target,damage,{weapon:bullet.weapon||'pistol',intrinsic:bullet.intrinsic,angle:Math.atan2(bullet.vy,bullet.vx),x:bullet.x+(next.x-bullet.x)*hit.at,y:bullet.y+(next.y-bullet.y)*hit.at,enchant:bullet.enchant,level:bullet.level,value:bullet.value,rarity:bullet.rarity,action:bullet.action});
        else if (this.hurt(damage, '被敌方弹丸击破', { source: bullet })) {
          const angle = Math.atan2(bullet.vy, bullet.vx);
          this.effect(bullet.x + (next.x - bullet.x) * hit.at, bullet.y + (next.y - bullet.y) * hit.at,
            '', enemyShotColor(bullet.value), 'hit-spark', .21, { angle, radius: 27, strength: .8 });
        }
        bullet.hitIds.push(hit.id);
        if(bullet.pierce>0)bullet.pierce--;else{bullet.dead=true;break;}
      }
      if(bullet.reflected){bullet.reflected=false;continue;}
      if(wall!==Infinity)bullet.dead=true;
      bullet.x=next.x;bullet.y=next.y;bullet.life-=step;
      if(bullet.life<=0||next.x<0||next.y<0||next.x>bounds.width||next.y>bounds.height)bullet.dead=true;
      if(this.status!=='playing')break;
    }
    this.projectileStep = false;
    hits.length = 0;
    candidates.length = 0;
    let remaining = 0;
    for (const bullet of projectiles) if (!bullet.dead) projectiles[remaining++] = bullet;
    projectiles.length = remaining;
  }
  updateInteraction(input, dt) {
    if(this.siege){this.siege.interact(this,input.interact);return;}
    const context = this.context();
    const skillId=typeof input.skill==='number'?this.equippedSkills[input.skill]:input.skill;
    const stationary = Math.hypot(input.x || 0, input.y || 0) < 0.15 && this.player.dashTime <= 0 &&
      Math.hypot(this.player.knockX || 0, this.player.knockY || 0) < 22 && !NUMBER_SKILLS[skillId]?.movement;
    if (!context || !input.interact || !stationary) { this.extractProgress = 0; this.searchProgress = 0; this.nodeProgress = 0; this.interactId = null; return; }
    if (context.target.id !== this.interactId) { this.extractProgress = 0; this.searchProgress = 0; this.nodeProgress = 0; this.interactId = context.target.id; }
    if(context.kind==='crossing'){
      if(this.field&&this.visible(this.player,context.target)){
        Object.assign(this.player,context.target.landing,{knockX:0,knockY:0,dashTime:0});this.event('dash');
      }
      return;
    }
    if(context.kind==='merchant'){this.event('trade',{id:context.target.id});return;}
    if (context.kind === 'exit') {
      if(context.locked){this.extractProgress=0;return;}
      if(this.extractProgress===0)this.field?.alarm(this,context.target);
      this.extractProgress += dt; this.tutorial.extraction = true;
      if (this.extractProgress >= RULES.extractSeconds){if(context.target.kind==='key')this.exitKeys--;this.extractedVia=context.target.kind||'classic';this.finish(true, '成功撤离');}
    } else if(context.kind==='node'){
      this.nodeProgress+=dt;if(this.nodeProgress>=0.9){this.activateNode(context.target);this.nodeProgress=0;}
    } else {
      if(context.target.opensAt>this.elapsed){this.searchProgress=0;return;}
      this.searchProgress += dt;
      if (this.searchProgress >= 0.75) {
        const chest = context.target;
        chest.opened = true; this.opened++;this.heat?.add(3);if(chest.keyCard)this.exitKeys++; this.tutorial.chest = true;
        this.addLoot({...createLoot(chest.x, chest.y, chest.zone, chest.value, chest.id),bossLoot:!!chest.bossLoot});
        this.player.dividers += chest.dividers; this.player.medkits += chest.medkits; this.searchProgress = 0;
        if(Object.hasOwn(OPERATORS,chest.operator)){
          this.operators[chest.operator]++;
          this.effect(chest.x,chest.y-34,OPERATORS[chest.operator].symbol+' +1','#d9bdff','text',.9);
        }
        for (const gear of chest.gear || []) this.world.drops.push({ ...gear, x: chest.x, y: chest.y+24, dead: false });
        this.message((chest.keyCard?'撤离钥卡 +1。':'')+(chest.gear?.length ? '资源已收入不限量资源袋，装备留在箱边。按 F 拾取，按 B 换装。' : '补给已收入不限量资源袋。左上方绿圈可以撤离。'));
      }
    }
  }
  update(dt, input = {}) {
    if (this.status !== 'playing') return;
    const p=this.player;this.hitStopCooldown=Math.max(0,this.hitStopCooldown-dt);
    if(this.hitStop>0){
      for(const key of ['attack','divide','heal','dash','pickup','overload','parry','flashlight','amplify','equalize','lock','numberShock'])if(input[key])this.pendingInput[key]=true;
      if(input.slot!==undefined)this.pendingInput.slot=input.slot;
      if(input.skill!==undefined)this.pendingInput.skill=input.skill;
      if(Number.isFinite(input.aimX)){this.pendingInput.aimX=input.aimX;this.pendingInput.aimY=input.aimY;}
      this.hitStop=Math.max(0,this.hitStop-dt);return;
    }
    const buffered=this.pendingInput;this.pendingInput={};
    for(const key of ['attack','divide','heal','dash','pickup','overload','parry','flashlight','amplify','equalize','lock','numberShock'])if(buffered[key])input={...input,[key]:true};
    if(buffered.slot!==undefined&&input.slot===undefined)input={...input,slot:buffered.slot};
    if(buffered.skill!==undefined&&input.skill===undefined)input={...input,skill:buffered.skill};
    if(buffered.aimX!==undefined&&!Number.isFinite(input.aimX))input={...input,aimX:buffered.aimX,aimY:buffered.aimY};
    updateNumberForm(this);
    this.elapsed += dt;this.siege?.update(this,dt);tickNumberPowers(this);this.field?.update(this,dt);tickNumberSkills(p,dt);this.sectorNotice=Math.max(0,this.sectorNotice-dt);
    for (const key of ['attackCooldown','dashCooldown','invulnerable','overload','parryWindow','parryCooldown']) p[key]=Math.max(0,p[key]-dt);
    for(const key of Object.keys(p.enchantCooldowns))p.enchantCooldowns[key]=Math.max(0,p.enchantCooldowns[key]-dt);
    p.chilled=Math.max(0,(p.chilled||0)-dt);
    p.corrupted=p.buffs.phase>0?0:Math.max(0,(p.corrupted||0)-dt);
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
    if(input.parry&&p.parryCooldown<=0){p.parryWindow=.18;p.parryCooldown=1.05;this.event('guard');}
    if (input.pickup) this.pickupGear();
    if(input.dash&&this.run.noDodge)this.message('本局词条禁用闪避，仍可使用弹反。');
    if (input.dash && !this.run.noDodge && p.dashCooldown <= 0) {
      p.dashTime = RULES.dashDuration; p.dashCooldown = RULES.dashCooldown;
      p.dashX = p.facingX; p.dashY = p.facingY; this.event('dash');
    }
    applyMomentum(this,p,dt);
    if (p.dashTime > 0) {
      this.move(p, p.dashX*RULES.dashSpeed*dt, p.dashY*RULES.dashSpeed*dt);
      p.dashTime = Math.max(0, p.dashTime-dt);
    } else {
      const speed = RULES.speed*(p.buffs.haste>0?1.32:1)*(p.ampBase!==undefined?.75:1)*
        (armorIncompatible(p)?1.15:1)*(this.field?.slow(this,p)??1)*this.run.playerSpeed*p.form.speed*(p.corrupted>0?.82:1)*terrainSpeed(p, terrainFor(this.world,p))*(p.chilled>0?.68:1);
      this.move(p, mx*speed*dt, my*speed*dt);
    }
    const sector=zoneAt(p,this.world.zones);
    const house=this.safehouseAt();
    if(house&&!this.synergyShelter)this.synergies?.clear();
    this.synergyShelter=!!house;
    if(house||p.buffs.phase>0)p.corrupted=0;
    if(house&&!house.serviced){house.serviced=true;p.hp=Math.min(p.maxHp,p.hp+25);if(p.armor)p.armor.durability=Math.min(p.armor.maxDurability,p.armor.durability+15);this.message('进入安全屋：回复25生命、修补15护甲。保护圈内无法攻击，可安全交易和等待撤离。');}
    if(p.sectorId!==sector.id){p.sectorId=sector.id;if(this.sectorNotice<=0){this.message(`进入 ${sector.name} · ${sector.riskLabel} / 箱子价值 ${sector.reward[0]}–${sector.reward[1]}`);this.sectorNotice=1.5;}}
    if (input.autoAim && input.attack) {
      const enemy = this.nearestEnemy(weaponOf(activeWeapon(p)).range);
      if (enemy) p.aimAngle = Math.atan2(enemy.y-p.y, enemy.x-p.x);
    }
    if (input.overload) this.activateOverload();
    if (input.flashlight && this.nightMode) p.flashlight = !p.flashlight;
    const equippedSkill = typeof input.skill==='number' ? this.equippedSkills[input.skill] : input.skill;
    if (equippedSkill && this.equippedSkills.includes(equippedSkill)) {
      if (useNumberSkill(this,equippedSkill) && NUMBER_SKILLS[equippedSkill].movement && this.safehouseAt()) {
        this.synergies?.clear();this.synergyShelter=true;
      }
    }
    for(const key of Object.keys(OPERATORS))if(input[key])useOperator(this,key);
    if(input.numberShock)numberShock(this);
    if (input.divide) this.divide();
    if (input.heal) this.heal();
    this.updateBursts(dt);
    if (input.attack) this.attack();
    for (const tile of this.world.tiles) {
      if (!tile.dead && !tile.flying && p.ampBase===undefined &&
        distance(p, tile) < (p.buffs.magnet>0?135:p.radius+17)+(this.run.enabled&&tile.remnant&&actualNumber(p)>=16?32:0) && canMerge(p.value, tile.value) && this.visible(p, tile)) {
        tile.dead = true; const old = p.value; p.value *= 2; p.hp = Math.min(p.maxHp, p.hp+8);
        updateNumberForm(this);this.tileFusion(tile);this.merges++; this.tutorial.merge = true;
        this.combo=this.elapsed-this.lastMerge<4?Math.min(5,this.combo+1):1;this.lastMerge=this.elapsed;
        gainEnergy(this,RULES.energyPerMerge+(this.combo-1)*2);
        this.effect(p.x, p.y-p.radius-17, `${old} + ${old} = ${p.value}`, '#a9edd1', 'text', 1.1); this.event('merge');
      } else if (!tile.flying && canRecycleRemnant(actualNumber(p),tile) && distance(p,tile)<(p.buffs.magnet>0?220:56)+(this.run.enabled&&actualNumber(p)>=16?36:0) && this.visible(p,tile)) {
        const value=tile.coins??remnantCoins(tile.value);
        if(this.addLoot({id:`coins-${tile.id}`,kind:'loot',currencyOnly:true,name:'残骸金币',value,x:tile.x,y:tile.y})){
          tile.dead=true;this.tileFusion(tile, true);this.recycled++;this.recycledValue+=value;
        }
      }
    }
    for (const loot of this.world.drops) {
      if (loot.mustLeave) { if (distance(p, loot) > 70) loot.mustLeave = false; continue; }
      if (!loot.dead && (!loot.kind || loot.kind === 'loot') && distance(p, loot) < (p.buffs.magnet>0?220:42) &&
          this.visible(p, loot) && this.addLoot(loot)) loot.dead = true;
    }
    this.navigation.update(p,dt);
    this.heat?.update(this,dt);
    this.director?.update(this,dt);this.pressureState=this.director?.profile(this.elapsed)||{speed:1,cooldown:1,windup:1};this.pressureState.speed*=this.run.enemySpeed;
    this.crowdGrid ||= new SpatialGrid([],96);
    this.crowdGrid.rebuildLivingPoints(this.world.enemies,this.siege?null:p,RULES.activeEnemyRadius);
    this.tactics.prepare(this);
    for (const enemy of this.world.enemies) {
      this.updateEnemy(enemy, dt); this.clash(enemy);
      if (this.status !== 'playing') return;
    }
    for (const enemy of this.world.enemies) separateEnemyContacts(this, enemy);
    this.siege?.updateDefences(this,dt);
    this.updateProjectiles(dt);
    if (this.status !== 'playing') return;
    updateHazards(this,dt);
    if (this.status !== 'playing') return;
    updateRunHazards(this,dt);
    if(this.status!=='playing')return;
    updateBossZones(this,dt);
    if (this.status !== 'playing') return;
    updateAfflictions(this,dt);
    this.tactics.updateFusion(this);this.tactics.updateHazards(this);
    if (this.status !== 'playing') return;
    this.world.effects = this.world.effects.filter(effect => (effect.life -= dt) > 0);
    if (this.elapsed >= this.duration) { this.finish(false, this.training?'试射结束':'行动超时，信号失联'); return; }
    this.updateInteraction(input, dt);
  }
  finish(success, reason) {
    if (this.result) return;
    this.status = success ? 'success' : 'dead';
    this.synergies?.clear();
    const equipped = [...this.player.weapons, this.player.armor, this.player.laser].filter(item => item && !item.starter);
    const items=[...this.bag,...equipped],materials=salvageMaterials(this.bag.filter(item=>!isEquipment(item)));
    const exitMultiplier=success?exitRewardMultiplier({kind:this.extractedVia}):1,multiplier=this.rewardMultiplier*exitMultiplier;
    this.result = { id:this.id,success,reason,exitBonus:exitMultiplier-1,rawValue:this.carriedValue(),value:Math.round(this.carriedValue()*multiplier),number:actualNumber(this.player),
      seconds:this.elapsed,kills:this.kills,hordeKills:this.hordeKills,waves:this.director?.wave||0,merges:this.merges,difficulty:this.difficulty.id,nodes:this.nodesActivated,recycled:this.recycled,recycledValue:this.recycledValue,mutators:[...this.run.ids],heat:this.heat?.value||0,seed:this.world.seed,extractedVia:this.extractedVia,
      materials:{alloy:Math.round(materials.alloy*multiplier),core:Math.round(materials.core*multiplier)},
      gear:this.carriedEquipment().map(item=>({...item})),loot:items.map(item=>({...item})) };
    this.result.playtest=this.playtestSnapshot();
    if (this.daily) this.result.daily = this.daily.date;
    if (this.siege) this.result.siege = this.siege.completed;
    this.event('finish', { result: this.result });
  }
}
