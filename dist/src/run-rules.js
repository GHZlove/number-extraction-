import { RULES } from './config.js';
import { isFree, seededRandom, zoneAt } from './math.js';
import { obstaclesFor } from './spatial.js';

// v0.11.1 tuning, shared by simulation and its visible briefing.
export const RUN_BALANCE=Object.freeze({
 heatRate:.24,heatRankStep:.02,killHeat:.2,bossHeat:5,hunterIntervalBase:45,hunterIntervalMin:25,
 fogVision:360,burstWarning:1.3,burstRadius:85,windowSeconds:40,windowPeriod:70,specialOpenMin:5,specialOpenRange:11,
});
export const EXIT_BONUSES=Object.freeze({fallback:0,window:.08,key:.10,number:.10,boss:.15});
export const exitRewardMultiplier=exit=>1+(EXIT_BONUSES[exit?.kind]||0);

export const MUTATORS=Object.freeze({
 doubled:{name:'数字暴走',description:'所有敌人数值翻倍；奖励 +20%。',reward:.2,enemyNumbers:2},
 no_dodge:{name:'禁用闪避',description:'无法使用闪避，仍可弹反；奖励 +25%。',reward:.25,noDodge:true},
 fog:{name:'战区浓雾',description:`视野缩至${RUN_BALANCE.fogVision}，远处敌人和首领标记隐藏；奖励 +20%。`,reward:.2,vision:RUN_BALANCE.fogVision},
 rich:{name:'高价悬赏',description:'热度增长加快50%；奖励 +25%。',reward:.25,heatRate:1.5},
 glass:{name:'玻璃火力',description:'武器直击 +35%，最大生命75，承受伤害 +25%；奖励 +10%。',reward:.1,weaponPower:1.35,health:75,incomingDamage:1.25},
 haste:{name:'急行战场',description:'步行与敌人追击速度 +12%；奖励 +10%。',reward:.1,playerSpeed:1.12,enemySpeed:1.12},
 scarcity:{name:'补给短缺',description:'开局无修复剂，修复量降至20；奖励 +15%。',reward:.15,scarcity:true},
 short:{name:'限时行动',description:'行动时限缩短20%；奖励 +15%。',reward:.15,duration:.8},
 jammed:{name:'镭射干扰',description:'镭射聚拢与红线瞄准在本局失效；奖励 +10%。',reward:.1,jammed:true},
 volatile:{name:'残爆怪群',description:`普通敌人死亡后延迟${RUN_BALANCE.burstWarning}秒爆炸；奖励 +20%。`,reward:.2,volatile:true},
});
export function normalizeMutators(ids){return Object.keys(MUTATORS).filter(id=>Array.isArray(ids)&&ids.includes(id)).slice(0,3);}
export function runRules(ids=[],enabled=true){
 const rules={enabled,ids:enabled?normalizeMutators(ids):[],reward:1,enemyNumbers:1,heatRate:1,weaponPower:1,incomingDamage:1,health:100,playerSpeed:1,enemySpeed:1,duration:1,vision:Infinity,noDodge:false,scarcity:false,jammed:false,volatile:false};
 for(const id of rules.ids){const m=MUTATORS[id];rules.reward+=m.reward;for(const key of ['enemyNumbers','heatRate','weaponPower','incomingDamage','health','playerSpeed','enemySpeed','duration','vision','noDodge','scarcity','jammed','volatile'])if(m[key]!==undefined)rules[key]=m[key];}
 return rules;
}
export const NUMBER_FORMS=Object.freeze([
 {id:'light',name:'轻巧',from:1,radius:19,speed:1,damage:1},
 {id:'assault',name:'冲锋',from:64,radius:21,speed:1.04,damage:1},
 {id:'heavy',name:'重装',from:256,radius:24,speed:.94,damage:.92},
 {id:'core',name:'核心',from:1024,radius:26,speed:.90,damage:.86},
]);
export const numberForm=value=>NUMBER_FORMS.findLast(form=>value>=form.from)||NUMBER_FORMS[0];
export function updateNumberForm(raid){
 const p=raid.player,form=raid.run.enabled?numberForm(p.value):NUMBER_FORMS[0];p.form=form;
 // Expand only where the real collision body fits. Never push through a wall.
 p.formPending=false;
 if(p.radius!==form.radius){if(form.radius<p.radius||isFree(p.x,p.y,form.radius,obstaclesFor(raid.world,p,p,form.radius),raid.world.bounds))p.radius=form.radius;else p.formPending=true;}
}
export function configureExpedition(raid,seed){
 if(!raid.run.enabled)return;
 const w=raid.world,random=seededRandom(seed^0x71ca38),special=w.exits.slice(1),kinds=random()<.5?['window','key','number']:['window','key','boss'];
 for(let i=kinds.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[kinds[i],kinds[j]]=[kinds[j],kinds[i]];}
 const field=special.find(e=>e.id==='field'),relay=special.find(e=>e.id==='relay');
 const relocate=(exit,point)=>{if(exit&&isFree(point.x,point.y,100,obstaclesFor(w,point,point,100),w.bounds)){Object.assign(exit,point);exit.safehouse=zoneAt(point,w.zones).risk===0;}};
 relocate(field,{x:Math.max(2000,Math.min(w.bounds.width-400,w.bounds.width*(.26+random()*.22))),y:w.bounds.height*.32});
 relocate(relay,{x:w.bounds.width*.72,y:w.bounds.height*.18-90+random()*(w.bounds.height*.1+90)});
 const fallback=w.exits[0];Object.assign(fallback,{kind:'fallback',opensAt:raid.difficulty.extractAt,safehouse:true,bossId:null});
 for(const [i,exit]of special.entries()){
  const kind=kinds[i];Object.assign(exit,{kind,opensAt:raid.difficulty.extractAt+RUN_BALANCE.specialOpenMin+Math.floor(random()*RUN_BALANCE.specialOpenRange),bossId:null});
  if(kind==='window')Object.assign(exit,{windowSeconds:RUN_BALANCE.windowSeconds,period:RUN_BALANCE.windowPeriod});
  if(kind==='number')exit.requiredNumber=2**(4+raid.difficulty.enemyShift);
  if(kind==='boss'){
   const guardian=w.enemies.filter(e=>e.boss).sort((a,b)=>Math.hypot(a.x-exit.x,a.y-exit.y)-Math.hypot(b.x-exit.x,b.y-exit.y))[0];
   if(guardian)Object.assign(exit,{bossId:guardian.id,guardianName:guardian.bossName});
   else Object.assign(exit,{kind:'number',requiredNumber:2**(4+raid.difficulty.enemyShift)});
  }
 }
 const cache=w.chests.find(c=>c.id==='expansion-cache')||w.chests.find(c=>!c.armory);
 if(cache){cache.keyCard=true;cache.name='撤离钥卡箱';}
}
export function extractionStatus(raid,exit){
 const opens=exit?.opensAt??raid.difficulty.extractAt,remaining=Math.max(0,opens-raid.elapsed);
 const bossLocked=!!exit?.bossId&&raid.world.enemies.some(e=>e.id===exit.bossId&&!e.dead);
 if(remaining>0)return{ready:false,label:`${Math.ceil(remaining)}秒后开放`,wait:remaining,bossLocked};
 if(bossLocked)return{ready:false,label:'击败守门首领',wait:0,bossLocked:true};
 if(exit?.kind==='key'&&raid.exitKeys<1)return{ready:false,label:'需要1张撤离钥卡',wait:0,bossLocked:false};
 if(exit?.kind==='number'&&raid.player.value<exit.requiredNumber)return{ready:false,label:`需要数字 ${exit.requiredNumber}`,wait:0,bossLocked:false};
 if(exit?.kind==='window'){
  const phase=(raid.elapsed-opens)%exit.period,left=exit.windowSeconds-phase,needed=RULES.extractSeconds-(raid.interactId===exit.id?raid.extractProgress:0);
  if(phase>=exit.windowSeconds)return{ready:false,label:`窗口 ${Math.ceil(exit.period-phase)}秒后重开`,wait:exit.period-phase,bossLocked:false};
  if(left+1e-6<needed)return{ready:false,label:`窗口不足${RULES.extractSeconds}秒，等待下轮`,wait:exit.period-phase,bossLocked:false};
  return{ready:true,label:`窗口剩余 ${Math.ceil(left)}秒`,wait:0,bossLocked:false,windowLeft:left};
 }
 return{ready:true,label:exit?.kind==='key'?'完成撤离消耗1张钥卡':'可以撤离',wait:0,bossLocked:false};
}
export const exitKindName=exit=>({fallback:'保底出口',window:'限时接应',key:'钥卡通道',number:'数字闸门',boss:'首领通道'}[exit.kind]||'常规出口');
export function updateRunHazards(raid,dt){
 for(const zone of raid.world.hazards){
  if(!zone.runHazard)continue;zone.age+=dt;zone.life=zone.warn+.2-zone.age;
  if(!zone.done&&zone.age>=zone.warn){zone.done=true;raid.effect(zone.x,zone.y,'','#ff8d54','impact',.3,{radius:zone.radius});
   if(Math.hypot(raid.player.x-zone.x,raid.player.y-zone.y)<zone.radius+raid.player.radius&&raid.visible(zone,raid.player))raid.hurt(raid.player.maxHp*.15,'被残爆击破');
  }
 }
 raid.world.hazards=raid.world.hazards.filter(h=>h.life>0);
}
