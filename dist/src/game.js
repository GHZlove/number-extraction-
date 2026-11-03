import { RULES, WORLD, ENEMY_TYPES } from './config.js';
import {
  attackDamage, bagTotal, canMerge, clamp, distance, lineOfSight, maxEnemyHealth,
  moveEntity, seededRandom, segmentCircleFraction, firstWallFraction, inAttackArc, terrainSpeed,
} from './math.js';
import { createLoot, generateWorld, lootForEnemy } from './world.js';
import { makeEquipment, randomEquipment, activeWeapon, weaponOf, spreadOf, absorbDamage, equipmentValue } from './equipment.js';

export class Raid {
  constructor(save, seed = Date.now() >>> 0) {
    this.id = `${Date.now()}-${seed}`;
    this.random = seededRandom(seed ^ 0x5a91bd);
    this.world = generateWorld(seed);
    this.status = 'playing';
    this.elapsed = 0;
    this.result = null;
    const starter = type => ({ ...makeEquipment('weapon', type, 'white', `starter-${type}`), starter: true, value: 0 });
    this.player = {
      ...WORLD.spawn, radius: RULES.playerRadius, value: 1, hp: RULES.health, maxHp: RULES.health,
      dividers: RULES.startingDividers + save.upgrades.divider, medkits: RULES.startingMedkits,
      attackCooldown: 0, dashCooldown: 0, dashTime: 0, dashX: 1, dashY: 0,
      invulnerable: 0, facingX: 1, facingY: 0, aimAngle: 0,
      weapons: [starter('pistol'), starter('greatsword')], activeSlot: 0, armor: null, laser: null,
    };
    this.bag = [];
    this.capacity = RULES.bagCapacity + save.upgrades.capacity * 2;
    this.kills = 0; this.merges = 0; this.opened = 0;
    this.extractProgress = 0; this.searchProgress = 0; this.interactId = null;
    this.events = []; this.lastMessage = ''; this.lastMessageTime = -10;
    this.tutorial = { merge: false, chest: false, extraction: false };
    this.message('向右合成数字。鼠标瞄准，左键射击；1/2 切换武器，F 拾取装备，B 换装。');
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
      distance(this.player, enemy) <= range && lineOfSight(this.player, enemy, this.world.obstacles))
      .sort((a, b) => distance(this.player, a)-distance(this.player, b))[0] || null;
  }
  context() {
    const p = this.player;
    const exit = this.world.exits.find(target => distance(p, target) < target.radius);
    if (exit) return { kind: 'exit', target: exit, progress: this.extractProgress / RULES.extractSeconds };
    const chest = this.world.chests.filter(target => !target.opened && distance(p, target) < 75 && lineOfSight(p, target, this.world.obstacles))
      .sort((a, b) => distance(p, a)-distance(p, b))[0];
    return chest ? { kind: 'chest', target: chest, progress: this.searchProgress / 0.75 } : null;
  }
  nearbyGear() {
    return this.world.drops.filter(item => !item.dead && item.kind && item.kind !== 'loot' &&
      distance(this.player, item) < 75 && lineOfSight(this.player, item, this.world.obstacles))
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

  shoot(origin, angle, speed, range, owner, value, rarity = 'white') {
    this.world.projectiles.push({ x: origin.x, y: origin.y, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
      radius: owner === 'player' ? 3 : 6, life: range/speed, owner, value, rarity, dead: false });
  }
  attack() {
    const p = this.player;
    if (p.attackCooldown > 0 || this.status !== 'playing') return false;
    const item = activeWeapon(p), weapon = weaponOf(item);
    p.attackCooldown = weapon.interval;
    this.event('attack');
    if (weapon.mode === 'ranged') {
      const angle = p.aimAngle + (this.random()*2-1)*spreadOf(item, p.laser);
      this.shoot(p, angle, weapon.speed, weapon.range, 'player', p.value, item.rarity);
      this.effect(p.x, p.y, '', '#fff2c5', 'muzzle', 0.08, { angle: p.aimAngle });
    } else {
      this.effect(p.x, p.y, '', '#cde8e0', 'slash', 0.2, { angle: p.aimAngle, arc: weapon.arc, radius: weapon.range });
      for (const enemy of this.world.enemies) {
        if (!enemy.dead && inAttackArc(p, enemy, p.aimAngle, weapon.arc, weapon.range) && lineOfSight(p, enemy, this.world.obstacles)) {
          this.damageEnemy(enemy, attackDamage(p.value, enemy.value, enemy.maxHp, item.rarity));
        }
      }
    }
    return true;
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
    this.world.drops.push(lootForEnemy(enemy));
    if (this.random() < 0.42) {
      const gear = randomEquipment(this.random, Math.min(2, Math.floor(enemy.homeX/1067)), `gear-${enemy.id}`);
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
    enemy.stun = RULES.divideStun; enemy.state = 'idle'; enemy.timer = 0; enemy.chargeTime = 0; enemy.cooldown = 0.8;
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
    const hit = absorbDamage(amount, p.armor);
    if (p.armor) p.armor.durability = hit.durability;
    p.hp = Math.max(0, p.hp-hit.damage); p.invulnerable = 0.65;
    this.extractProgress = 0; this.searchProgress = 0;
    this.effect(p.x, p.y-35, `−${Math.round(hit.damage*10)/10}`, '#ef8a7c');
    if (hit.blocked) this.effect(p.x, p.y-58, `护甲 −${Math.round(hit.blocked)}`, '#8fc5ff');
    this.event('hurt');
    if (p.hp <= 0) this.finish(false, reason);
    return true;
  }
  clash(enemy) {
    const p = this.player;
    if (enemy.dead || enemy.contactCooldown > 0 || distance(p, enemy) > p.radius+enemy.radius ||
        !lineOfSight(p, enemy, this.world.obstacles) || this.status !== 'playing') return;
    enemy.contactCooldown = RULES.contactCooldown;
    // Snapshot both attacks so a lethal outgoing contact still has a reciprocal hit.
    const outgoing = attackDamage(p.value, enemy.value, enemy.maxHp, activeWeapon(p).rarity);
    const incoming = attackDamage(enemy.value, p.value, p.maxHp, enemy.rarity);
    const canRetaliate = enemy.stun <= 0;
    this.damageEnemy(enemy, outgoing);
    if (canRetaliate) this.hurt(incoming, '在数字碰撞中被击破');
  }
  resolveEnemyAttack(enemy, definition) {
    const p = this.player;
    const angle = Math.atan2(enemy.aimY-enemy.y, enemy.aimX-enemy.x);
    if (definition.pattern === 'strike' || definition.pattern === 'blast') {
      const radius = definition.pattern === 'blast' ? 118 : 64;
      this.effect(enemy.aimX, enemy.aimY, '', '#ed8d7e', 'impact', 0.35, { radius });
      if (distance(p, { x: enemy.aimX, y: enemy.aimY }) < radius+p.radius && lineOfSight(enemy, p, this.world.obstacles)) {
        this.hurt(attackDamage(enemy.value, p.value, p.maxHp, enemy.rarity), definition.pattern === 'blast' ? '被爆破冲击击破' : '被近战攻击击破');
      }
    } else if (definition.pattern === 'charge') {
      enemy.state = 'charge'; enemy.chargeTime = 0.65;
      enemy.chargeX = Math.cos(angle); enemy.chargeY = Math.sin(angle);
      return;
    } else {
      const offsets = definition.pattern === 'fan' ? [-0.24, 0, 0.24] : [0];
      for (const offset of offsets) this.shoot(enemy, angle+offset,
        definition.pattern === 'snipe' ? 1350 : 330, definition.pattern === 'snipe' ? 1150 : 800,
        'enemy', enemy.value, enemy.rarity);
    }
    enemy.state = 'idle'; enemy.cooldown = definition.cooldown;
  }
  updateEnemy(enemy, dt) {
    if (enemy.dead) return;
    const definition = ENEMY_TYPES[enemy.type] || ENEMY_TYPES.hunter;
    enemy.cooldown = Math.max(0, enemy.cooldown-dt);
    enemy.contactCooldown = Math.max(0, enemy.contactCooldown-dt);
    if (enemy.stun > 0) { enemy.stun = Math.max(0, enemy.stun-dt); return; }
    if (enemy.state === 'charge') {
      const before = { x: enemy.x, y: enemy.y };
      moveEntity(enemy, enemy.chargeX*560*dt, enemy.chargeY*560*dt, this.world.obstacles);
      enemy.chargeTime -= dt;
      if (enemy.chargeTime <= 0 || distance(before, enemy) < 0.1) { enemy.state = 'idle'; enemy.cooldown = definition.cooldown; }
      return;
    }
    if (enemy.state === 'windup') {
      enemy.timer -= dt;
      if (enemy.timer <= 0) this.resolveEnemyAttack(enemy, definition);
      return;
    }
    const p = this.player, d = distance(enemy, p), sight = lineOfSight(enemy, p, this.world.obstacles);
    if (d < definition.range && sight && enemy.cooldown === 0) {
      enemy.state = 'windup'; enemy.timer = definition.windup; enemy.aimX = p.x; enemy.aimY = p.y;
      return;
    }
    if (!definition.speed) return;
    let mx, my;
    if (d < Math.max(380, definition.range+100) && sight) {
      const sign = definition.pattern === 'fan' && d < 170 ? -1 : d > (definition.pattern === 'strike' ? 65 : 220) ? 1 : 0;
      mx = (p.x-enemy.x)/Math.max(d, 1)*sign; my = (p.y-enemy.y)/Math.max(d, 1)*sign;
    } else {
      const hx = enemy.homeX+Math.cos(this.elapsed*0.5+enemy.phase)*48;
      const hy = enemy.homeY+Math.sin(this.elapsed*0.45+enemy.phase)*48;
      const length = Math.hypot(hx-enemy.x, hy-enemy.y) || 1;
      mx = (hx-enemy.x)/length*0.35; my = (hy-enemy.y)/length*0.35;
    }
    const speed = definition.speed*terrainSpeed(enemy, this.world.terrain);
    moveEntity(enemy, mx*speed*dt, my*speed*dt, this.world.obstacles);
  }
  updateProjectiles(dt) {
    for (const bullet of this.world.projectiles) {
      if (bullet.dead) continue;
      const step = Math.min(dt, bullet.life);
      const next = { x: bullet.x+bullet.vx*step, y: bullet.y+bullet.vy*step };
      const wall = firstWallFraction(bullet, next, this.world.obstacles, bullet.radius);
      const targets = bullet.owner === 'player' ? this.world.enemies.filter(enemy => !enemy.dead) : [this.player];
      let victim = null, hitAt = Infinity;
      for (const target of targets) {
        const fraction = segmentCircleFraction(bullet, next, target, target.radius+bullet.radius);
        if (fraction < hitAt) { hitAt = fraction; victim = target; }
      }
      if (victim && hitAt < wall) {
        const damage = attackDamage(bullet.value, victim.value, victim.maxHp, bullet.rarity);
        if (bullet.owner === 'player') this.damageEnemy(victim, damage);
        else this.hurt(damage, '被敌方弹丸击破');
        bullet.dead = true;
      } else if (wall !== Infinity) bullet.dead = true;
      bullet.x = next.x; bullet.y = next.y; bullet.life -= step;
      if (bullet.life <= 0 || next.x < 0 || next.y < 0 || next.x > WORLD.width || next.y > WORLD.height) bullet.dead = true;
      if (this.status !== 'playing') return;
    }
    this.world.projectiles = this.world.projectiles.filter(bullet => !bullet.dead);
  }
  updateInteraction(input, dt) {
    const context = this.context();
    const stationary = Math.hypot(input.x || 0, input.y || 0) < 0.15 && this.player.dashTime <= 0;
    if (!context || !input.interact || !stationary) { this.extractProgress = 0; this.searchProgress = 0; this.interactId = null; return; }
    if (context.target.id !== this.interactId) { this.extractProgress = 0; this.searchProgress = 0; this.interactId = context.target.id; }
    if (context.kind === 'exit') {
      this.extractProgress += dt; this.tutorial.extraction = true;
      if (this.extractProgress >= RULES.extractSeconds) this.finish(true, '成功撤离');
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
    for (const key of ['attackCooldown', 'dashCooldown', 'invulnerable']) p[key] = Math.max(0, p[key]-dt);
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
      moveEntity(p, p.dashX*RULES.dashSpeed*dt, p.dashY*RULES.dashSpeed*dt, this.world.obstacles);
      p.dashTime = Math.max(0, p.dashTime-dt);
    } else {
      const speed = RULES.speed*terrainSpeed(p, this.world.terrain);
      moveEntity(p, mx*speed*dt, my*speed*dt, this.world.obstacles);
    }
    if (input.autoAim && input.attack) {
      const enemy = this.nearestEnemy(weaponOf(activeWeapon(p)).range);
      if (enemy) p.aimAngle = Math.atan2(enemy.y-p.y, enemy.x-p.x);
    }
    if (input.divide) this.divide();
    if (input.heal) this.heal();
    if (input.attack) this.attack();
    for (const tile of this.world.tiles) {
      if (!tile.dead && distance(p, tile) < p.radius+17 && canMerge(p.value, tile.value) && lineOfSight(p, tile, this.world.obstacles)) {
        tile.dead = true; const old = p.value; p.value *= 2; p.hp = Math.min(p.maxHp, p.hp+8);
        this.merges++; this.tutorial.merge = true;
        this.effect(p.x, p.y-35, `${old} + ${old} = ${p.value}`, '#a9edd1', 'text', 1.1); this.event('merge');
      }
    }
    for (const loot of this.world.drops) {
      if (loot.mustLeave) { if (distance(p, loot) > 70) loot.mustLeave = false; continue; }
      if (!loot.dead && (!loot.kind || loot.kind === 'loot') && distance(p, loot) < 42 &&
          lineOfSight(p, loot, this.world.obstacles) && this.addLoot(loot)) loot.dead = true;
    }
    for (const enemy of this.world.enemies) {
      this.updateEnemy(enemy, dt); this.clash(enemy);
      if (this.status !== 'playing') return;
    }
    this.updateProjectiles(dt);
    if (this.status !== 'playing') return;
    this.world.effects = this.world.effects.filter(effect => (effect.life -= dt) > 0);
    if (this.elapsed >= RULES.raidSeconds) { this.finish(false, '行动超时，信号失联'); return; }
    this.updateInteraction(input, dt);
  }
  finish(success, reason) {
    if (this.result) return;
    this.status = success ? 'success' : 'dead';
    const equipped = [...this.player.weapons, this.player.armor, this.player.laser].filter(item => item && !item.starter);
    this.result = { id: this.id, success, reason, value: this.carriedValue(), number: this.player.value,
      seconds: this.elapsed, kills: this.kills, merges: this.merges,
      loot: [...this.bag, ...equipped].map(item => ({ ...item })) };
    this.event('finish', { result: this.result });
  }
}
