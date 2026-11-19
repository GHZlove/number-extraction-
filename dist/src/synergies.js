import { attackDamage, distance } from './math.js';
import { ENCHANTS, WEAPONS, weaponOf, weaponPower } from './equipment.js';
import { gainEnergy } from './operations.js';
import { pushActor } from './impact-motion.js';

const REACTIONS = {
  thermal: { label:'热震', glyph:'◈', color:'#ffbc89', from:'burn', to:'frost', seconds:2.5, cooldown:3, coefficient:.30, cap:.08 },
  sanguine: { label:'血偿', glyph:'♥', color:'#ffa4b9', from:'bleed', to:'leech', seconds:3, cooldown:3 },
  fault: { label:'弱点断层', glyph:'✦', color:'#ffe292', from:'sunder', to:'critical', seconds:2, cooldown:2.5, coefficient:.20, cap:.06 },
  cage: { label:'电弧囚笼', glyph:'ϟ', color:'#a4edff', from:'gravity', to:'lightning', seconds:2, cooldown:4, coefficient:.15, cap:.05 },
  toxic: { label:'毒性爆破', glyph:'✹', color:'#cef486', from:'poison', to:'detonate', seconds:3.5, cooldown:4, coefficient:.10, cap:.04 },
  circuit: { label:'接地回路', glyph:'⌁', color:'#a4edff', from:'stun', to:'energize', seconds:1.5, cooldown:4 },
  breach: { label:'破门组合', glyph:'❯', color:'#ffc49a', from:'shotgun', to:'greatsword', seconds:2, cooldown:4, coefficient:.20, cap:.06, set:true },
  relay: { label:'精射接力', glyph:'⊙', color:'#b7e5fb', from:'crossbow', to:'revolver', seconds:2.5, cooldown:3, set:true },
};
const PAIRS = Object.entries(REACTIONS);

function directions(player, def, slot) {
  const a=player.weapons[slot], b=player.weapons[1-slot];
  if (!a || !b || a===b) return null;
  if (def.set) return a.weapon===def.from&&b.weapon===def.to?{from:def.from,to:def.to}:null;
  if ((a.enchant===def.from || (['burn','bleed'].includes(def.from)&&weaponOf(a).intrinsic===def.from)) && b.enchant===def.to) {
    return {from:def.from,to:def.to};
  }
  if (def.from==='burn' && a.enchant==='frost' && b.enchant==='burn') return {from:'frost',to:'burn'};
  return null;
}

export class Synergies {
  constructor() {
    this.revisions=[0,0];
    this.readyAt={any:0};
    this.damageBudget=new WeakMap();
    this.clear();
  }
  attack(player) {
    const slot=player.activeSlot,item=player.weapons[slot];
    if(!item)return null;
    return {slot,item,value:player.value,rarity:item.rarity,power:weaponPower(item),x:player.x,y:player.y,
      revisions:[...this.revisions],spent:false};
  }
  changed(slot) { this.revisions[slot]++;this.clear(); }
  switched(slot) {
    for(const [pair,mark] of Object.entries(this.setMarks))if(mark.action.slot===slot)delete this.setMarks[pair];
  }
  clear() {
    this.primers=new WeakMap();
    this.towerPrimers=new WeakMap();
    this.setMarks={};
    this.focus={};
  }
  valid(player,action) {
    return action && player.weapons[action.slot]===action.item && !!player.weapons[1-action.slot] &&
      player.weapons[1-action.slot]!==action.item && action.revisions.every((revision,slot)=>revision===this.revisions[slot]);
  }
  mark(raid,enemy,pair) {
    const def=REACTIONS[pair],marks=def.set?this.setMarks:this.primers.get(enemy);
    const mark=marks?.[pair];
    if(!mark || mark.enemy!==enemy || enemy.dead && !['sanguine','toxic','circuit'].includes(pair) ||
       raid.elapsed>mark.expires || !this.valid(raid.player,mark.action))return null;
    if (['burn','bleed'].includes(mark.from) && !(enemy.afflictions?.[mark.from]?.life>0)) return null;
    if (mark.from==='frost' && !(enemy.slowTime>0)) return null;
    if (mark.from==='sunder' && !(enemy.sundered>0)) return null;
    return mark;
  }
  towerRoute(tag){
    if(tag==='burn')return {pair:'thermal',from:'burn',to:'frost'};
    if(tag==='frost')return {pair:'thermal',from:'frost',to:'burn'};
    if(tag==='sunder')return {pair:'fault',from:'sunder',to:'critical'};
    return null;
  }
  primeTower(raid,enemy,tower,tag){
    const route=this.towerRoute(tag);
    if(!route||tower.dead||!raid.siege||!raid.player.weapons.some(item=>item?.enchant===route.to))return;
    const marks=this.towerPrimers.get(enemy)||{};
    marks[route.pair]={...route,tower,expires:raid.elapsed+REACTIONS[route.pair].seconds};
    this.towerPrimers.set(enemy,marks);
    this.focus[route.pair]=enemy;
  }
  towerMark(raid,enemy,pair){
    const mark=this.towerPrimers.get(enemy)?.[pair];
    if(!mark||mark.tower.dead||enemy.dead||raid.elapsed>mark.expires)return null;
    if(mark.from==='burn'&&!enemy.afflictions?.burn?.life||mark.from==='frost'&&!(enemy.slowTime>0)||
       mark.from==='sunder'&&!(enemy.sundered>0))return null;
    return mark;
  }
  cueText(raid,mark,def){
    const slot=mark.action?2-mark.action.slot:raid.player.weapons.findIndex(item=>item?.enchant===mark.to)+1;
    if(!slot)return null;
    const names=def.set?WEAPONS:ENCHANTS;
    return {color:def.color,text:`[${slot}] ${names[mark.to].name}`};
  }
  available(raid,pair){return raid.elapsed>=this.readyAt.any&&raid.elapsed>=(this.readyAt[pair]||0);}
  cue(raid,enemy) {
    if(!this.primers.has(enemy)&&!this.towerPrimers.has(enemy)&&!Object.values(this.setMarks).some(mark=>mark.enemy===enemy))return null;
    for(const [pair,def] of PAIRS){
      const mark=this.mark(raid,enemy,pair)||this.towerMark(raid,enemy,pair);
      if(mark&&this.available(raid,pair))return this.cueText(raid,mark,def);
    }
    return null;
  }
  aimCue(raid,point,visible){
    let nearest=140, cue=null;
    for(const [id,def] of PAIRS){
      const enemy=this.focus[id];
      if(!enemy||enemy.dead||!visible(enemy)||distance(raid.player,enemy)>raid.run.vision)continue;
      const gap=distance(point,enemy),mark=this.mark(raid,enemy,id)||this.towerMark(raid,enemy,id);
      if(gap>=nearest||!mark||!this.available(raid,id))continue;
      const hint=this.cueText(raid,mark,def);
      if(hint){cue=hint;nearest=gap;}
    }
    return cue;
  }
  indicators(raid) {
    return PAIRS.flatMap(([id,def])=>{
      const enemy=this.focus[id], mark=enemy&&!enemy.dead&&(this.mark(raid,enemy,id)||this.towerMark(raid,enemy,id));
      const direction=directions(raid.player,def,0)||directions(raid.player,def,1)||mark;
      if(!direction)return [];
      const ready=this.available(raid,id),names=def.set?WEAPONS:ENCHANTS;
      return [{id,label:def.label,glyph:def.glyph,color:def.color,armed:ready&&!!mark,ready,
        remaining:mark?Math.max(0,mark.expires-raid.elapsed):0,
        description:`${names[direction.from].name} → ${names[direction.to].name} · ${def.seconds}s`}];
    });
  }
  hit(raid,enemy,impact,applied,damage=0,knock=0,angle=0) {
    const action=impact.action;
    if(raid.safehouseAt()){this.clear();return;}
    if(!this.valid(raid.player,action))return;
    const tag=applied?.tag||applied;
    for(const [pair,def] of PAIRS){
      const mark=this.mark(raid,enemy,pair)||this.towerMark(raid,enemy,pair);
      if(!mark||action.spent||mark.action===action||mark.action?.slot===action.slot||!this.available(raid,pair))continue;
      if(def.set ? action.item.weapon!==mark.to : tag!==mark.to)continue;
      if(pair==='relay'&&distance(action,enemy)<220)continue;
      if(pair==='toxic'&&!enemy.dead)continue;
      action.spent=true;
      this.readyAt.any=raid.elapsed+.35;this.readyAt[pair]=raid.elapsed+def.cooldown;
      delete (mark.tower?this.towerPrimers.get(enemy):def.set?this.setMarks:this.primers.get(enemy))[pair];
      this.resolve(raid,enemy,pair,def,action,applied,damage,knock,angle);
      return;
    }
    if(enemy.dead){this.primers.delete(enemy);return;}
    for(const [pair,def] of PAIRS){
      const route=directions(raid.player,def,action.slot);
      if(!route)continue;
      if(def.set){
        if(action.armedSet || pair==='relay'&&distance(action,enemy)<300)continue;
        action.armedSet=true;
        this.setMarks[pair]={...route,enemy,action,expires:raid.elapsed+def.seconds};
      }else{
        if(tag!==route.from && !(impact.intrinsic===route.from&&['burn','bleed'].includes(route.from)))continue;
        const marks=this.primers.get(enemy)||{};
        const previous=marks[pair];
        if(previous?.action===action)continue;
        marks[pair]={...route,enemy,action,expires:raid.elapsed+def.seconds};
        this.primers.set(enemy,marks);
      }
      this.focus[pair]=enemy;
    }
  }

  bonusDamage(raid,enemy,def,action,element) {
    const recent=(this.damageBudget.get(enemy)||[]).filter(entry=>raid.elapsed-entry.at<2);
    const used=recent.reduce((sum,entry)=>sum+entry.amount,0);
    const boss=enemy.boss?.5:1;
    const normal=attackDamage(action.value,enemy.value,enemy.maxHp,action.rarity)*action.power;
    const amount=Math.max(0,Math.min(normal*def.coefficient*boss,enemy.maxHp*def.cap*boss,
      enemy.maxHp*.12*boss-used));
    if(!amount)return 0;
    recent.push({at:raid.elapsed,amount});
    this.damageBudget.set(enemy,recent);
    const hp=enemy.hp;
    raid.damageEnemy(enemy,amount,{secondary:true,origin:'synergy',action,element});
    return hp-enemy.hp;
  }
  resolve(raid,enemy,pair,def,action,applied,damage,knock,angle) {
    let bonus=0;
    const p=raid.player;
    if(pair==='sanguine'){
      const before=p.hp;
      p.hp=Math.min(p.maxHp,p.hp+Math.min(3,.06*damage)*(enemy.boss?.5:1));
      bonus=p.hp-before;
    }else if(pair==='circuit'){
      bonus=gainEnergy(raid,enemy.boss?2:4,6);
    }else if(pair==='relay'){
      pushActor(enemy,Math.cos(angle),Math.sin(angle),knock*.25);
      const speed=Math.hypot(enemy.knockX||0,enemy.knockY||0);
      if(speed>700){enemy.knockX*=700/speed;enemy.knockY*=700/speed;}
      bonus=knock*.25;
    }else if(pair==='cage'||pair==='toxic'){
      const arc=pair==='cage', radius=arc?150:Math.min(applied.radius,145);
      const targets=raid.world.enemies.filter(e=>!e.dead&&e!==enemy&&!applied.seen?.has(e.id)&&
        distance(enemy,e)<=radius&&raid.visible(enemy,e)).sort((a,b)=>distance(enemy,a)-distance(enemy,b)||a.id.localeCompare(b.id));
      for(const e of targets.slice(0,arc?1:3)){
        if(arc)raid.effect(enemy.x,enemy.y,'',def.color,'lightning',.28,{endX:e.x,endY:e.y});
        bonus+=this.bonusDamage(raid,e,def,action,arc?'lightning':'poison');
      }
    }else bonus=this.bonusDamage(raid,enemy,def,action,pair==='thermal'?'fire':undefined);
    if(pair!=='toxic')raid.effect(enemy.x,enemy.y,'',def.color,'pulse',.38);
    raid.effect(enemy.x,enemy.y-enemy.radius-24,pair==='circuit'?`${def.label} +${bonus}`:def.label,def.color,'text',.85);
    raid.effect(enemy.x+26,enemy.y-13,['circuit','cage'].includes(pair)?'ZAP!':pair==='thermal'||pair==='toxic'?'BOOM!':'CRACK!',def.color,'comic',.62);
    raid.event('synergy',{pair,bonus});
  }
}
