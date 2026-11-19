import { RULES } from './config.js';
import { attackDamage, distance, clamp, maxEnemyHealth } from './math.js';
import { updateNumberForm } from './run-rules.js';

export const OPERATORS = {
  amplify: { key: 'Z', symbol: '×2', name: '临时增幅器', description: '数字翻倍 10 秒，移速降低 25%。', cost: 110, stock: 1 },
  equalize: { key: 'X', symbol: '√', name: '均分器', description: '与瞄准目标一起变为两数指数的中间档。', cost: 140, stock: 1 },
  lock: { key: 'V', symbol: 'LOCK', name: '锁定符', description: '锁定敌人 8 秒，阻止治疗、变级与繁殖。', cost: 95, stock: 1 },
};
export const actualNumber = player => player.ampBase ?? player.value;
export function gainEnergy(raid,amount,cap=Infinity) {
  const p=raid.player,previous=p.energy;
  const scale=raid.field?.ambientRule(raid,p)==='magnetic'?2:1;
  p.energy=Math.min(100,p.energy+Math.min(cap,amount*scale));
  return p.energy-previous;
}
export const isLocked = (raid, enemy) => (enemy.numberLockUntil || 0) > raid.elapsed;

export function tickNumberPowers(raid) {
  const p = raid.player;
  if (p.ampBase !== undefined && raid.elapsed >= p.ampUntil) {
    p.value = p.ampBase;
    delete p.ampBase;
    updateNumberForm(raid);
    raid.message('临时增幅已结束。');
  }
  p.digitShield = actualNumber(p) >= 128 && raid.elapsed >= (p.shieldReadyAt || 0);
}
export function useOperator(raid, key) {
  if (!Object.hasOwn(OPERATORS,key) || raid.status !== 'playing') return false;
  if (!(raid.operators[key] > 0)) { raid.message('背包里没有'+OPERATORS[key].name+'。'); return false; }
  const p = raid.player;
  if (key === 'amplify') {
    if (p.ampBase !== undefined || p.value === RULES.maxValue) return false;
    p.ampBase = p.value;
    p.ampUntil = raid.elapsed + 10;
    p.value = Math.min(RULES.maxValue, p.value*2);
    updateNumberForm(raid);
    raid.effect(p.x,p.y-44,'×2 · 10 秒','#f4df84','text',1);
  } else {
    if (raid.safehouseAt()) return false;
    const enemy = raid.divideTarget();
    if (!enemy) { raid.message('将准星指向 215 范围内的敌人。'); return false; }
    if (key === 'lock') {
      if (isLocked(raid,enemy)) return false;
      enemy.numberLockUntil = raid.elapsed + 8;
      raid.effect(enemy.x,enemy.y-46,'LOCK · 8 秒','#d3b5fb','text',1);
    } else {
      if (enemy.boss || enemy.prime || enemy.radixShield > 0 || isLocked(raid,enemy) || p.ampBase !== undefined) {
        raid.message('首领、质数、带盾、已锁定的敌人以及增幅状态无法参与均分。');
        return false;
      }
      const middle = 2 ** Math.floor((Math.log2(p.value) + Math.log2(enemy.value))/2);
      if (p.value === middle && enemy.value === middle) return false;
      const hp = enemy.hp/enemy.maxHp;
      p.value = clamp(middle,1,RULES.maxValue);
      enemy.value = p.value;
      enemy.maxHp = maxEnemyHealth(enemy.value);
      enemy.hp = hp*enemy.maxHp;
      updateNumberForm(raid);
      raid.effect(enemy.x,enemy.y-46,'√ → '+p.value,'#a8f4d0','text',1);
    }
  }
  tickNumberPowers(raid);
  raid.operators[key]--;
  raid.event('operator',{key});
  return true;
}

export function numberShock(raid) {
  const p = raid.player;
  if (raid.status !== 'playing' || actualNumber(p) !== 2048 || raid.safehouseAt()) return false;
  p.value = 1024;
  updateNumberForm(raid);
  const view=raid.actionView;
  const farthest=view?Math.hypot(
    Math.max(Math.abs(p.x-view.left),Math.abs(p.x-view.right)),
    Math.max(Math.abs(p.y-view.top),Math.abs(p.y-view.bottom)),
  ):1050;
  const range=Math.min(farthest,raid.run.vision);
  raid.effect(p.x,p.y,'','#b5e9ff','overload',.7,{radius:range});
  raid.effect(p.x,p.y-57,'2048 → 1024','#f3d7ff','comic',.85);
  for (const enemy of raid.world.enemies) {
    if(enemy.dead||distance(p,enemy)>range||!raid.visible(p,enemy))continue;
    if(view&&(enemy.x<view.left||enemy.x>view.right||enemy.y<view.top||enemy.y>view.bottom))continue;
    const base=attackDamage(2048,enemy.value,enemy.maxHp);
    const damage=enemy.boss?Math.min(enemy.maxHp*.2,base):base*(enemy.value<2048?3.2:2);
    raid.damageEnemy(enemy,damage,{secondary:true,element:'lightning'});
  }
  raid.event('overload');
  return true;
}
