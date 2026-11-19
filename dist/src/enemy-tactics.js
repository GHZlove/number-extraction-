import { ENEMY_TYPES } from './config.js';
import { attackDamage, clamp, distance, maxEnemyHealth, segmentCircleFraction } from './math.js';
import { detectsFlashlight } from './raid-light.js';
import { isLocked } from './operations.js';

export const MAX_AFFIXES=3;
export const AFFIXES={stealth:'幽影',unstoppable:'铁壁',blazing:'炽核'};
const ADVANCED=['shieldbearer','commander','kamikaze','healer','corruptor'];
const FUSE_HOLD=1.5;
export const hasAffix=(enemy,affix)=>enemy?.affixes?.includes(affix)===true;
export const defenderNumber=player=>player.corrupted>0?Math.max(1,player.value/2):player.value;
export const hiddenEnemy=(raid,enemy)=>hasAffix(enemy,'stealth')&&distance(raid.player,enemy)>260&&
  (enemy.revealUntil||0)<=raid.elapsed&&!['windup','healing','detonating','charge','burst','merging'].includes(enemy.state)&&
  !detectsFlashlight(raid.player,enemy,raid.field?.lampScale(raid)??1);
const numericSeed=id=>Array.from(id).reduce((n,c)=>Math.imul(n^c.charCodeAt(0),16777619)>>>0,2166136261);

export function enemyTypeAt(defaultType,risk,wave,serial){
  const tier=Math.max(1,risk-1,wave),pool=ADVANCED.slice(0,Math.min(5,tier+1));
  if(tier<2||serial%Math.max(2,6-Math.floor(tier/2))!==0)return defaultType;
  // Always give corruption a slot once late waves can support it.
  if(tier>=5&&serial%4===0)return 'corruptor';
  return pool[(Math.floor(serial/2)+wave)%pool.length];
}
export function equipEnemyAffixes(enemy,threat,wave=0){
  enemy.affixes ||= [];
  if(enemy.boss||threat<3)return;
  const roll=numericSeed(enemy.id+':'+wave);
  if(roll%10>=Math.min(8,threat+1))return;
  const pool=Object.keys(AFFIXES),count=Math.min(threat>=8?3:threat>=5?2:1,1+(roll>>>8)%3);
  enemy.affixes=Array.from({length:count},(_,i)=>pool[(roll+i)%pool.length]);
}
export function setEnemyClass(enemy,type){
  const def=ENEMY_TYPES[type];
  if(!def)return enemy;
  enemy.type=type;
  enemy.radius=def.radius||21;
  enemy.affixes ||= [];
  if(def.shieldArc){
    enemy.shieldMax=Math.max(24,enemy.maxHp*.64);
    enemy.shieldHp=enemy.shieldMax;
    enemy.shieldFacing=0;
  }
  return enemy;
}

export function guardDamage(raid,enemy,amount,angle,impact){
  const arc=ENEMY_TYPES[enemy.type]?.shieldArc;
  if(!arc||!enemy.shieldHp||amount<=0||impact.splash||impact.secondary||
    (enemy.shieldBrokenUntil||0)>raid.elapsed||
    Math.cos(angle+Math.PI-enemy.shieldFacing)<Math.cos(arc/2))return {amount,guarded:false};
  const blocked=Math.min(enemy.shieldHp,amount);
  enemy.shieldHp-=blocked;
  raid.effect(enemy.x,enemy.y-enemy.radius-24,enemy.shieldHp?'格挡':'矩阵盾破裂','#a6edff','text',.55);
  if(!enemy.shieldHp)raid.event('armorbreak',{strength:.7});
  return {amount:amount-blocked,guarded:true};
}

export function exposeAttack(raid,enemy){
  if(!hiddenEnemy(raid,enemy)&&!enemy.ambushAt)return true;
  if(!enemy.ambushAt){
    enemy.ambushAt=raid.elapsed+.5;
    enemy.revealUntil=enemy.ambushAt+.3;
  }
  if(raid.elapsed<enemy.ambushAt)return false;
  enemy.ambushAt=0;
  return true;
}

export function interruptEnemy(raid,enemy,duration,forced=false){
  if(enemy.dead)return false;
  if(hasAffix(enemy,'unstoppable')&&!forced){
    enemy.stun=Math.max(enemy.stun||0,duration*.2);
    return false;
  }
  enemy.interrupts=(enemy.interrupts||0)+1;
  if(enemy.state==='detonating'){
    raid.effect(enemy.x,enemy.y-34,'FIZZ!','#bcf5f7','comic',.7);
    raid.kill(enemy,{defused:true});
    return true;
  }
  const before=enemy.stun||0,active=['windup','charge','burst','healing','merging'].includes(enemy.state);
  enemy.stun=Math.max(before,duration);
  enemy.state='idle';enemy.chargeTime=0;enemy.burstLeft=0;enemy.healTarget=null;enemy.healLink=null;enemy.ambushAt=0;
  return active||enemy.stun>before;
}

const clearHealLink=(raid,source,ally)=>raid.visible(source,ally)&&
  !Number.isFinite(segmentCircleFraction(source,ally,raid.player,raid.player.radius*.91));

export class EnemyTactics {
  constructor(){
    this.commanders=[];
    this.pairs=[];
    this.fire=[];
    this.seekAt=0;
  }
  prepare(raid){
    this.commanders=raid.world.enemies.filter(e=>!e.dead&&e.type==='commander'&&!(e.stun>0));
  }
  commandFor(enemy){return this.commanders.find(leader=>leader!==enemy&&!leader.dead&&distance(leader,enemy)<=320);}
  seedGarrison(raid){
    let index=0;
    for(const e of raid.world.enemies){
      if(e.boss||e.prime)continue;
      if(e.guard||e.fuser)e.waveId='garrison-'+(e.siteId??e.sectorId);
      if(e.zone>=1&&raid.difficulty.rank>=2){
        const threat=raid.difficulty.rank+e.zone-1;
        const type=enemyTypeAt(e.type,threat,threat,++index);
        if(type!==e.type)setEnemyClass(e,type);
        equipEnemyAffixes(e,threat);
      }
    }
  }
  addFire(raid,point,source,radius=75){
    if(this.fire.length>=32)this.fire.shift();
    this.fire.push({x:point.x,y:point.y,radius,until:raid.elapsed+3,value:source.value,rarity:source.rarity});
  }
  ignitePlayer(raid,source){
    const p=raid.player;
    if(raid.safehouseAt()||raid.status!=='playing')return;
    if(!p.enemyBurn)p.enemyBurn={tick:raid.elapsed+.7};
    p.enemyBurn.until=raid.elapsed+2.25;
    p.enemyBurn.value=Math.max(p.enemyBurn.value||1,source.value||1);
    p.enemyBurn.rarity=source.rarity||'white';
  }
  updateHazards(raid){
    const p=raid.player;
    this.fire=this.fire.filter(fire=>fire.until>raid.elapsed);
    if(raid.safehouseAt()){
      p.enemyBurn=null;
      return;
    }
    const fire=this.fire.find(zone=>distance(p,zone)<zone.radius+p.radius&&raid.visible(zone,p));
    if(fire)this.ignitePlayer(raid,fire);
    const burn=p.enemyBurn;
    if(!burn)return;
    if(raid.elapsed>=burn.until){p.enemyBurn=null;return;}
    if(raid.elapsed>=burn.tick){
      burn.tick+=.75;
      raid.hurt(attackDamage(burn.value,defenderNumber(p),p.maxHp,burn.rarity)*.13,'被炽核灼烧击破',{dot:true});
    }
  }
  special(raid,e,dt){
    const p=raid.player,now=raid.elapsed,def=ENEMY_TYPES[e.type];
    if(e.type==='shieldbearer'&&e.state==='idle'){
      const angle=Math.atan2(p.y-e.y,p.x-e.x);
      if(!e.shieldTracking){e.shieldFacing=angle;e.shieldTracking=true;}
      const delta=Math.atan2(Math.sin(angle-e.shieldFacing),Math.cos(angle-e.shieldFacing));
      e.shieldFacing+=clamp(delta,-2.8*dt,2.8*dt);
    }
    if(hasAffix(e,'blazing')&&distance(p,e)<75+p.radius&&raid.visible(e,p))this.ignitePlayer(raid,e);
    if(e.type==='kamikaze'){
      const target=raid.siege?.goalFor(raid,e)||p;
      if(e.state==='detonating'){
        e.timer-=dt;
        if(e.timer>0)return true;
        const radius=128;
        if(distance(p,e)<radius+p.radius&&raid.visible(e,p)){
          raid.hurt(attackDamage(e.value,defenderNumber(p),p.maxHp,e.rarity)*1.55,'被过载裂变击破',{source:e});
        }
        raid.siege?.blastStructures(raid,e,radius);
        this.addFire(raid,e,e,100);
        raid.effect(e.x,e.y,'','#ff725d','enemy-impact',.45,{radius,heavy:true});
        raid.effect(e.x,e.y-15,'BOOM!','#ff987e','comic',.7);
        raid.event('explosion',{strength:1.1});
        raid.kill(e,{detonated:true});
        return true;
      }
      if(distance(e,target)<=75&&raid.visible(e,target)&&exposeAttack(raid,e)){
        e.state='detonating';e.timer=.9;e.windup=.9;return true;
      }
    }
    if(e.type==='healer'){
      if(e.state==='healing'){
        const link=e.healLink,ally=link?.ally;
        if(!ally||ally.dead||isLocked(raid,ally)||distance(e,ally)>480||!clearHealLink(raid,e,ally)){
          this.endHeal(raid,e);return false;
        }
        if(now>=link.tick&&link.remaining>0){
          ally.hp=Math.min(ally.maxHp,ally.hp+ally.maxHp*.03);
          link.tick+=.5;link.remaining--;
          if(link.remaining===0)this.endHeal(raid,e);
        }
        return true;
      }
      if(e.cooldown<=0&&!isLocked(raid,e)){
        let ally=null;
        for(const candidate of raid.crowdGrid?.query(e,e,480)||raid.world.enemies){
          if(candidate===e||candidate.dead||candidate.hp>=candidate.maxHp||isLocked(raid,candidate)||
             distance(e,candidate)>480||!clearHealLink(raid,e,candidate))continue;
          if(!ally||candidate.value>ally.value||candidate.value===ally.value&&candidate.id<ally.id)ally=candidate;
        }
        if(ally&&exposeAttack(raid,e)){
          e.state='healing';e.healLink={ally,tick:now+.5,remaining:6};
          raid.event('heal-link');return true;
        }
      }
    }
    return false;
  }
  endHeal(raid,enemy){
    enemy.state='idle';enemy.healLink=null;enemy.cooldown=raid.enemyCooldown(ENEMY_TYPES.healer,enemy);
  }
  mergeEligible(raid,enemy){
    return !enemy.dead&&!enemy.boss&&!enemy.prime&&!enemy.trainingDummy&&!isLocked(raid,enemy)&&
      !(enemy.stun>0&&!hasAffix(enemy,'unstoppable'))&&enemy.value<2048&&
      !['windup','charge','burst','detonating','healing'].includes(enemy.state)&&
      (raid.siege||distance(enemy,raid.player)<1200)&&!raid.safehouseAt(enemy);
  }
  compatible(a,b){
    if(a===b||a.value!==b.value)return false;
    return a.waveId!=null&&a.waveId===b.waveId||!!this.commandFor(a)&&this.commandFor(a)===this.commandFor(b);
  }
  finishPair(raid,pair){
    const {a,b}=pair,full=a.affixes?.length>=MAX_AFFIXES||b.affixes?.length>=MAX_AFFIXES;
    const health=(a.hp+b.hp)/(a.maxHp+b.maxHp);
    b.dead=true;
    a.value*=2;a.maxHp=maxEnemyHealth(a.value);a.hp=a.maxHp*Math.max(.8,clamp(health,0,1));
    a.affixes=[...new Set([...(a.affixes||[]),...(b.affixes||[])])].slice(0,MAX_AFFIXES);
    if(full){
      a.damageResistance=Math.max(.55,(a.damageResistance??1)*.85);
      a.rewardScale=2;
    }
    a.elite=true;a.cooldown=.65;
    raid.effect(a.x,a.y,'MERGE!','#ffb6db','comic',.8);
    raid.effect(a.x,a.y,'','#ef9dd8','pulse',.48);
    raid.event('enemy-merge');
  }
  updateFusion(raid){
    const now=raid.elapsed;
    this.pairs=this.pairs.filter(pair=>{
      const {a,b}=pair,forming=pair.readyAt==null;
      const valid=this.mergeEligible(raid,a)&&this.mergeEligible(raid,b)&&this.compatible(a,b)&&
        distance(a,b)<(forming?85:120)&&raid.visible(a,b)&&
        (a.interrupts||0)===pair.interruptA&&(b.interrupts||0)===pair.interruptB;
      if(valid&&forming&&now-pair.since>=FUSE_HOLD){
        pair.readyAt=now+FUSE_HOLD;a.state=b.state='merging';a.fusingUntil=b.fusingUntil=pair.readyAt;
        raid.event('enemy-fuse-start');
      }
      if(valid&&(pair.readyAt==null||now<pair.readyAt))return true;
      if(valid)this.finishPair(raid,pair);
      else if(!forming){raid.event('enemy-fuse-break');raid.effect(a.x,a.y,'断链','#bcf5f7','text',.5);}
      if(a.state==='merging')a.state='idle';if(b.state==='merging')b.state='idle';
      a.fusingUntil=b.fusingUntil=0;
      return false;
    });
    if(now<this.seekAt||this.pairs.length>=3)return;
    this.seekAt=now+.16;
    const occupied=new Set(this.pairs.flatMap(pair=>[pair.a,pair.b]));
    for(const a of raid.world.enemies){
      if(occupied.has(a)||!this.mergeEligible(raid,a))continue;
      const commander=this.commandFor(a);
      if(!commander&&a.waveId==null)continue;
      const range=commander?170:85;
      const neighbors=raid.crowdGrid?.query(a,a,range)||raid.world.enemies;
      const candidate=neighbors.find(b=>!occupied.has(b)&&this.compatible(a,b)&&this.mergeEligible(raid,b)&&distance(a,b)<range&&raid.visible(a,b));
      if(!candidate)continue;
      const b=candidate,d=distance(a,b);
      if(d>=85&&commander){
        const middle={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
        a.formation={...middle,until:now+.3};b.formation={...middle,until:now+.3};
        continue;
      }
      occupied.add(a);occupied.add(b);
      this.pairs.push({a,b,since:now,readyAt:null,interruptA:a.interrupts||0,interruptB:b.interrupts||0});
      if(this.pairs.length>=3)break;
    }
  }
}
