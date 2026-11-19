import { attackDamage } from './math.js';
import { weaponPower } from './equipment.js';

const reactions = {
  thermal: { label: '热震', color: '#ffbc89', window: 2.5, cooldown: 3 },
  circuit: { label: '接地回路', color: '#a4edff', window: 1.5, cooldown: 4 },
};

export class Synergies {
  constructor() {
    this.primers = new WeakMap();
    this.readyAt = { any: 0, thermal: 0, circuit: 0 };
    this.revisions = [0, 0];
  }

  attack(player) {
    const slot = player.activeSlot, item = player.weapons[slot];
    if (!item) return null;
    return {
      slot, item, value: player.value, rarity: item.rarity, power: weaponPower(item),
      revisions: [...this.revisions], spent: false,
    };
  }

  changed(slot) {
    this.revisions[slot]++;
    this.clear();
  }

  clear() {
    this.primers = new WeakMap();
  }

  valid(player, action) {
    return action && player.weapons[action.slot] === action.item &&
      !!player.weapons[1 - action.slot] && player.weapons[1 - action.slot] !== action.item &&
      action.revisions.every((revision, slot) => revision === this.revisions[slot]);
  }

  mark(raid, enemy, pair) {
    const primer = this.primers.get(enemy)?.[pair];
    if (!primer || raid.elapsed > primer.expires || !this.valid(raid.player, primer.action)) return null;
    if (primer.tag === 'burn' && !(enemy.afflictions?.burn?.life > 0)) return null;
    if (primer.tag === 'frost' && !(enemy.slowTime > 0)) return null;
    return primer;
  }

  cue(raid, enemy) {
    if (!this.primers.has(enemy)) return null;
    for (const pair of ['thermal', 'circuit']) {
      const primer = this.mark(raid, enemy, pair);
      if (primer) {
        const next = primer.tag === 'burn' ? '寒霜' : primer.tag === 'frost' ? '烈焰' : '回能';
        return { color: reactions[pair].color, text: `[${2 - primer.action.slot}] ${next}` };
      }
    }
    return null;
  }

  hit(raid, enemy, impact, applied) {
    const action = impact.action;
    if (raid.safehouseAt()) {
      this.clear();
      return;
    }
    if (!this.valid(raid.player, action)) return;
    const now = raid.elapsed, player = raid.player;
    const thermal = this.mark(raid, enemy, 'thermal'), circuit = this.mark(raid, enemy, 'circuit');
    const other = primer => primer && primer.action !== action && primer.action.slot !== action.slot;
    const ruptures = !enemy.dead && other(thermal) && (
      (thermal.tag === 'burn' && applied === 'frost') ||
      (thermal.tag === 'frost' && applied === 'burn')
    );
    const grounds = other(circuit) && applied === 'energize';
    const pair = ruptures ? 'thermal' : grounds ? 'circuit' : null;
    if (pair && !action.spent && now >= this.readyAt.any && now >= this.readyAt[pair]) {
      action.spent = true;
      this.readyAt.any = now + .35;
      this.readyAt[pair] = now + reactions[pair].cooldown;
      delete this.primers.get(enemy)[pair];
      this.resolve(raid, enemy, pair, action);
      return;
    }
    if (enemy.dead) {
      this.primers.delete(enemy);
      return;
    }

    const partner = player.weapons[1 - action.slot];
    let primerPair, tag;
    if ((applied === 'burn' || impact.intrinsic === 'burn') && partner.enchant === 'frost') {
      primerPair = 'thermal'; tag = 'burn';
    } else if (applied === 'frost' && partner.enchant === 'burn') {
      primerPair = 'thermal'; tag = 'frost';
    } else if (applied === 'stun' && partner.enchant === 'energize') {
      primerPair = 'circuit'; tag = 'stun';
    }
    if (!primerPair) return;
    const marks = this.primers.get(enemy) || {};
    marks[primerPair] = { action, tag, expires: now + reactions[primerPair].window };
    this.primers.set(enemy, marks);
  }

  resolve(raid, enemy, pair, action) {
    const { label, color } = reactions[pair];
    let bonus;
    if (pair === 'thermal') {
      // The pair cooldown exceeds the two-second rolling damage budget window.
      const power = attackDamage(action.value, enemy.value, enemy.maxHp, action.rarity) * action.power;
      bonus = Math.min(power * (enemy.boss ? .15 : .30), enemy.maxHp * (enemy.boss ? .04 : .08));
      const hp = enemy.hp;
      raid.damageEnemy(enemy, bonus, { secondary: true, origin: 'synergy', action, element: 'fire' });
      bonus = hp - enemy.hp;
    } else {
      // The four-second circuit cooldown also enforces the three-second energy budget.
      const previous = raid.player.energy;
      raid.player.energy = Math.min(100, previous + (enemy.boss ? 2 : 4));
      bonus = raid.player.energy - previous;
    }
    raid.effect(enemy.x, enemy.y, '', color, 'pulse', .38);
    raid.effect(enemy.x, enemy.y - enemy.radius - 24, pair === 'circuit' ? `${label} +${bonus}` : label, color, 'text', .85);
    raid.event('synergy', { pair, bonus });
  }
}
