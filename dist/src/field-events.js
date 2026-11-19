import { attackDamage, distance, isFree, maxEnemyHealth, seededRandom, segmentCircleFraction, zoneAt } from './math.js';
import { obstaclesFor } from './spatial.js';
import { isLocked } from './operations.js';
import { WORLD } from './config.js';

const inField=(raid,p,r=18)=>!raid.safehouseAt(p,20)&&isFree(p.x,p.y,r,obstaclesFor(raid.world,p,p,r),raid.world.bounds);
const RARE_PRIMES=[3,5,7,13];
const BROADCASTS=['drop','weather','smuggler'];
export const FIELD_LABELS={drop:'空投运算舱',magnetic:'区域磁暴',cold:'局部寒潮',smuggler:'限时走私商'};
export const FIELD_PROPS={nitrogen:'液氮罐',electric:'高压电箱',zip:'单向滑索',spring:'跨区跳板'};

function interrupt(enemy,seconds){
  enemy.stun=Math.max(enemy.stun||0,seconds*(enemy.boss?.35:1));
  enemy.state='idle';enemy.chargeTime=0;enemy.burstLeft=0;
}

export class FieldEvents {
  constructor(raid,seed){
    this.random=seededRandom(seed^0x36ac145e);
    this.next=60+this.random()*30;
    this.order=BROADCASTS.map(id=>({id,rank:this.random()})).sort((a,b)=>a.rank-b.rank).map(v=>v.id);
    this.sequence=0;this.active=[];this.props=[];this.fusionPairs=[];this.drifting=[];
    this.nextFusion=0;
    const {world}=raid;
    const guards=world.enemies.filter(e=>e.guard&&!e.boss&&e.zone>=1);
    for(const [i,enemy] of guards.entries()){
      if(i%15===0){
        enemy.prime=true;enemy.elite=true;
        enemy.value=RARE_PRIMES[Math.min(3,Math.floor(raid.difficulty.rank/2)+Math.floor(this.random()*2))];
        enemy.maxHp=maxEnemyHealth(enemy.value)*1.45;enemy.hp=enemy.maxHp;enemy.moveScale*=1.11;
      }else if(i%15===6){
        enemy.radixShield=2+Math.min(1,raid.difficulty.rank-1);enemy.elite=true;
      }else if(i%6===3)enemy.fuser=true;
    }
    const chests=world.chests.filter(c=>c.zone>0&&!c.armory);
    for(let i=0;i<chests.length;i++)if(i%9===2)chests[i].operator=['amplify','equalize','lock'][Math.floor(this.random()*3)];

    const sites=world.sites||[];
    for(const [index,site] of sites.entries()){
      if(index%2!==0)continue;
      const point=this.findSpot(raid,site,38,160);
      if(point)this.props.push({...point,id:'fixture-'+index,radius:23,kind:index%4?'electric':'nitrogen',hp:25});
    }
    if(['delta','glacier'].includes(world.layout)){
      for(const [idx,site] of sites.filter(s=>s.zone>0).slice(0,4).entries()){
        const takeoff=this.findSpot(raid,site,52,160);
        if(!takeoff)continue;
        const landing=this.findSpot(raid,takeoff,245,510,true);
        if(landing)this.props.push({...takeoff,id:'crossing-'+idx,radius:38,kind:world.layout==='delta'?'zip':'spring',landing});
      }
    }
  }

  findSpot(raid,point,min,max,otherSector=false,risk=null){
    const zone=zoneAt(point,raid.world.zones);
    for(let attempt=0;attempt<22;attempt++){
      const angle=this.random()*Math.PI*2,length=min+this.random()*(max-min);
      const candidate={x:point.x+Math.cos(angle)*length,y:point.y+Math.sin(angle)*length};
      if(!inField(raid,candidate,27))continue;
      const sector=zoneAt(candidate,raid.world.zones);
      if((!otherSector||sector.id!==zone.id)&&(risk===null||sector.risk===risk))return candidate;
    }
    return null;
  }

  fixtureAt(point){
    return this.props.find(prop=>prop.landing&&distance(point,prop)<prop.radius+14);
  }

  fixtureFraction(raid,bullet,next,limit){
    if(bullet.owner!=='player')return null;
    let hit=null,at=limit;
    for(const prop of this.props){
      if(prop.dead||prop.landing)continue;
      const t=segmentCircleFraction(bullet,next,prop,prop.radius+bullet.radius);
      if(t<at){hit=prop;at=t;}
    }
    return hit?{prop:hit,at}:null;
  }

  strike(raid,prop,damage){
    if(prop.dead||prop.landing)return;
    prop.hp-=damage;
    if(prop.hp>0)return;
    prop.dead=true;
    const frost=prop.kind==='nitrogen';
    if(frost)this.active.push({kind:'nitrogen',x:prop.x,y:prop.y,radius:145,until:raid.elapsed+5,temporary:true});
    else for(const enemy of raid.world.enemies)if(!enemy.dead&&distance(prop,enemy)<=155&&raid.visible(prop,enemy)){
      interrupt(enemy,1.35);
      raid.effect(prop.x,prop.y,'','#a9efff','lightning',.33,{endX:enemy.x,endY:enemy.y});
    }
    raid.effect(prop.x,prop.y,frost?'FSSSH!':'ZAP!',frost?'#bbeaff':'#e4db9a','comic',.75);
    raid.event('operator',{key:frost?'frost':'electric'});
  }

  ambientRule(raid,actor){
    const weather=this.active.find(event=>event.kind==='cold'||event.kind==='magnetic');
    return weather&&weather.zoneId===zoneAt(actor,raid.world.zones).id?weather.kind:null;
  }
  slow(raid,actor){
    return this.ambientRule(raid,actor)==='cold'||this.active.some(event=>event.kind==='nitrogen'&&
      distance(actor,event)<event.radius)? .76 : 1;
  }
  lampScale(raid){return this.ambientRule(raid,raid.player)==='magnetic'?.63:1;}

  lure(raid,point,range,time,max,onlyIdle=false){
    const targets=raid.world.enemies.filter(e=>!e.dead&&!e.boss&&!e.guard&&!e.hunter&&distance(point,e)<=range&&
      (!onlyIdle||(!(e.aggro>0)&&e.state==='idle'))).sort((a,b)=>distance(point,a)-distance(point,b));
    for(const e of targets.slice(0,max))e.signalTarget={x:point.x,y:point.y,until:raid.elapsed+time};
  }
  alarm(raid,exit){
    if(!['window','boss'].includes(exit.kind)||exit.alarmSent)return;
    exit.alarmSent=true;
    this.lure(raid,exit,850,7,5,true);
    raid.effect(exit.x,exit.y-38,'撤离警报','#ffc486','comic',.8);
    raid.event('alarm');
  }
  broadcast(raid){
    const type=this.order[this.sequence%this.order.length],id='broadcast-'+(++this.sequence);
    const {world}=raid,risk=type==='drop'?2:1;
    const sites=(world.sites||[]).filter(site=>site.zone===risk&&distance(site,WORLD.spawn)>400);
    const anchor=sites[Math.floor(this.random()*sites.length)];
    if(!anchor)return;
    const point=this.findSpot(raid,anchor,40,170,false,risk) || (inField(raid,anchor,26)?anchor:null);
    if(!point)return;
    const now=raid.elapsed,zone=zoneAt(point,world.zones);
    let event={id,...point,zoneId:zone.id,until:now+32};
    if(type==='drop'){
      const chest={id,zone:2,value:420+raid.difficulty.rank*55,dividers:2,medkits:1,opened:false,name:'空投运算舱',
        operator:['amplify','equalize','lock'][Math.floor(this.random()*3)],...point,opensAt:now+5};
      world.chests.push(chest); event={...event,kind:'drop',chest};
      this.lure(raid,point,1250,24,9);
    }else if(type==='weather'){
      event.kind=this.random()<.5?'magnetic':'cold';
      event.until=now+26;
    }else{
      const merchant={...point,id,name:'限时走私商',stock:{},barters:3,expiresAt:event.until};
      world.merchants.push(merchant);event={...event,kind:'smuggler',merchant};
    }
    this.active.push(event);
    raid.message('战区广播 · '+FIELD_LABELS[event.kind]+' · '+zone.name);
    raid.event('alarm');
  }

  fuse(raid){
    const {world,elapsed:now}=raid;
    const canFuse=e=>e&&!e.dead&&!e.boss&&!e.prime&&!e.radixShield&&e.value<512&&
      !isLocked(raid,e)&&!(e.stun>0)&&distance(e,raid.player)<1000&&!raid.safehouseAt(e);
    this.fusionPairs=this.fusionPairs.filter(pair=>{
      const {a,b,readyAt}=pair;
      if(!canFuse(a)||!canFuse(b)||a.value!==b.value||distance(a,b)>93||!raid.visible(a,b)){
        a.fusingUntil=b.fusingUntil=0;return false;
      }
      if(now<readyAt)return true;
      b.dead=true; a.fusingUntil=b.fusingUntil=0;
      a.value*=2;a.maxHp=maxEnemyHealth(a.value)*1.15;a.hp=a.maxHp;
      a.elite=true;a.fuser=false;a.cooldown=.65;
      raid.effect(a.x,a.y,'双体融合','#ffb6db','comic',.85);
      raid.effect(a.x,a.y,'','#ef9dd8','pulse',.5);
      return false;
    });
    if(this.fusionPairs.length>=3)return;
    for(const a of world.enemies){
      if(!a.fuser||a.fusingUntil>now||!canFuse(a))continue;
      const b=world.enemies.find(e=>e!==a&&e.value===a.value&&!(e.fusingUntil>now)&&
        distance(a,e)<75&&canFuse(e)&&raid.visible(a,e));
      if(!b)continue;
      const readyAt=now+2.4;
      a.fusingUntil=b.fusingUntil=readyAt;
      a.state=b.state='idle';
      this.fusionPairs.push({a,b,readyAt});
      if(this.fusionPairs.length>=3)break;
    }
  }

  ignite(raid,tile){
    if(tile.dead||!tile.remnant)return;
    tile.dead=true;
    const radius=82;
    raid.effect(tile.x,tile.y,'','#ffb178','cinder-mark',1,{radius});
    raid.effect(tile.x,tile.y,'POW!','#ffba81','comic',.56);
    for(const enemy of raid.world.enemies)if(!enemy.dead&&distance(tile,enemy)<radius+enemy.radius&&raid.visible(tile,enemy)){
      const damage=attackDamage(Math.max(tile.value,raid.player.value),enemy.value,enemy.maxHp)*.31;
      raid.damageEnemy(enemy,damage,{secondary:true,element:'fire'});
    }
  }
  igniteArea(raid,point,radius){
    let remaining=4;
    for(const tile of raid.world.tiles){
      if(!tile.dead&&tile.remnant&&distance(point,tile)<=radius&&raid.visible(point,tile)){
        this.ignite(raid,tile);if(--remaining===0)break;
      }
    }
  }
  igniteSweep(raid,bullet,end){
    if(bullet.element!=='fire'&&bullet.intrinsic!=='burn'&&bullet.enchant!=='burn')return;
    let remaining=3;
    for(const tile of raid.world.tiles){
      if(!tile.dead&&tile.remnant&&Number.isFinite(segmentCircleFraction(bullet,end,tile,bullet.radius+21))){
        this.ignite(raid,tile);if(--remaining===0)break;
      }
    }
  }
  gustRemnants(raid){
    const p=raid.player;
    let remaining=8;
    for(const tile of raid.world.tiles){
      const d=tile.remnant&&!tile.dead?distance(p,tile):Infinity;
      if(d>190||tile.flying||!raid.visible(p,tile))continue;
      const angle=d>1?Math.atan2(tile.y-p.y,tile.x-p.x):p.aimAngle;
      Object.assign(tile,{flying:true,vx:Math.cos(angle)*580,vy:Math.sin(angle)*580,airUntil:raid.elapsed+.42});
      this.drifting.push(tile);
      if(--remaining===0)break;
    }
  }
  moveRemnants(raid,dt){
    this.drifting=this.drifting.filter(tile=>{
      if(tile.dead||raid.elapsed>=tile.airUntil){tile.flying=false;return false;}
      const next={x:tile.x+tile.vx*dt,y:tile.y+tile.vy*dt};
      if(!inField(raid,next,14)){tile.flying=false;return false;}
      let hit=null,first=Infinity;
      for(const e of raid.world.enemies){
        if(e.dead)continue;
        const at=segmentCircleFraction(tile,next,e,e.radius+14);
        if(at<first){hit=e;first=at;}
      }
      tile.x=next.x;tile.y=next.y;
      if(!hit)return true;
      raid.damageEnemy(hit,attackDamage(tile.value,hit.value,hit.maxHp)*.54,{secondary:true,element:'wind'});
      raid.effect(tile.x,tile.y,'','#b4efdc','gust',.28,{radius:52});
      tile.flying=false;
      return false;
    });
  }
  update(raid,dt){
    if(raid.elapsed>=this.next){
      this.broadcast(raid);this.next=raid.elapsed+60+this.random()*30;
    }
    this.active=this.active.filter(event=>{
      if(raid.elapsed<event.until)return true;
      if(event.chest)event.chest.opened=true;
      if(event.merchant)raid.world.merchants=raid.world.merchants.filter(m=>m!==event.merchant);
      return false;
    });
    if(raid.elapsed>=this.nextFusion){this.nextFusion=raid.elapsed+.2;this.fuse(raid);}
    if(this.drifting.length)this.moveRemnants(raid,dt);
  }
}
