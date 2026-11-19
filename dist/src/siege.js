import { ENEMY_TYPES } from './config.js';
import { createEnemy } from './world.js';
import { attackDamage, distance, isFree, seededRandom, segmentCircleFraction } from './math.js';
import { SpatialGrid, obstaclesFor } from './spatial.js';
import { NavigationField } from './navigation.js';
import { decorateWeapon, makeEquipment } from './equipment.js';
import { enemyTypeAt, equipEnemyAffixes, exposeAttack } from './enemy-tactics.js';
import { advanceConduits } from './siege-conduits.js';
import { BLUEPRINTS, BUILDINGS, MINES, SIEGE_GEAR } from './siege-catalog.js';

const PREP=30,CAP=56,MAX_BUILDINGS=40,MERGE_RANGE=90;
const roundLevel=value=>Math.log2(value);
const pointAt=(point,angle,radius)=>({x:point.x+Math.cos(angle)*radius,y:point.y+Math.sin(angle)*radius});
const near=(point,list,radius,predicate=()=>true)=>{
  let best=null;
  for(const item of list){
    if(item.dead||!predicate(item))continue;
    const gap=distance(point,item);
    if(gap<radius){radius=gap;best=item;}
  }
  return best;
};

export class Siege {
  constructor(raid,seed){
    const {world}=raid;
    this.random=seededRandom(seed^0x914bc5);
    this.core={id:'core',kind:'core',x:world.bounds.width/2,y:world.bounds.height/2,value:2,hp:500,maxHp:500,radius:53};
    this.mines=world.siegeMines;
    this.buildings=[];
    this.conduits=[];
    this.salvos=[];
    this.kits={turret:1,harvester:1,conduit:1};
    this.selected=null;
    this.routeStart=null;
    this.data=132;this.alloy=115;
    this.day=true;this.deadline=PREP;this.wave=0;this.completed=0;
    this.nextSpawn=Infinity;this.spawned=0;this.budget=0;this.serial=0;this.held=false;
    this.navigation=new NavigationField(world,73,25);
  }
  spend(data,alloy){
    if(this.data<data||this.alloy<alloy)return false;
    this.data-=data;this.alloy-=alloy;
    return true;
  }
  goalFor(raid,e){return distance(e,raid.player)<=240||e.attackedUntil>raid.elapsed?raid.player:this.core;}
  buy(raid,key){
    if(!this.day||raid.status!=='playing')return false;
    if(Object.hasOwn(BLUEPRINTS,key)){
      const item=BLUEPRINTS[key];
      if(!this.spend(item.cost,item.alloy))return false;
      this.kits[key]=(this.kits[key]||0)+1;
      this.select(key);
      return true;
    }
    const name=key.startsWith('gear-')?key.slice(5):'';
    if(!Object.hasOwn(SIEGE_GEAR,name)||raid.equipmentCount()>=raid.capacity)return false;
    const item=SIEGE_GEAR[name];
    if(!this.spend(item.cost,0))return false;
    raid.bag.push(decorateWeapon(makeEquipment('weapon',name,'green','siege-gear-'+(++this.serial)),item.enchant,2));
    return true;
  }
  select(key){
    if(key==='cancel'){this.selected=null;this.routeStart=null;return;}
    if(this.kits[key]>0){this.selected=key;this.routeStart=null;}
  }
  consumeKit(key){
    this.kits[key]--;
    if(!this.kits[key])this.selected=null;
  }
  context(raid){
    const p=raid.player,close=(list,radius)=>near(p,list,radius,item=>raid.visible(p,item));
    if(this.day&&this.selected){
      if(this.selected==='conduit'){
        const target=this.routeStart?close([this.core,...this.buildings],105):close(this.mines.filter(m=>m.kind==='number_well'),115);
        return {kind:'siege',action:this.routeStart?'linkFinish':'linkStart',target,
          label:this.routeStart?'到核心或攻击塔旁接轨':'在数字井旁设起点'};
      }
      return {kind:'siege',action:'build',label:'部署 '+BLUEPRINTS[this.selected].name};
    }
    const merchant=this.day&&close(raid.world.merchants,78);
    if(merchant)return {kind:'siege',action:'shop',target:merchant,label:'向核心补给官采购'};
    const building=close(this.buildings,82);
    if(this.day&&building){
      const other=near(building,this.buildings,MERGE_RANGE,other=>other!==building&&other.kind===building.kind&&other.value===building.value);
      return {kind:'siege',action:other?'merge':'repair',target:building,other,
        label:other?'合并至 '+2*building.value:'修复 '+BUILDINGS[building.kind].name};
    }
    if(this.day&&distance(p,this.core)<102)return {kind:'siege',action:'core',target:this.core,
      label:this.core.hp<this.core.maxHp-.01?'修复核心 · 8 合金':'核心升阶 · 数据币＋合金'};
    const mine=close(this.mines,78);
    if(mine)return {kind:'siege',action:'mine',target:mine,label:mine.kind==='crystal_node'?'晶簇增幅 · 250 范围':'采集 '+MINES[mine.kind].name};
    return null;
  }
  interact(raid,pressed){
    if(!pressed){this.held=false;return;}
    if(this.held)return;
    this.held=true;
    const context=this.context(raid);
    if(!context)return;
    const {action,target,other}=context;
    if(action==='shop'){raid.event('trade',{id:target.id});return;}
    if(action==='mine'){this.harvest(raid,target);return;}
    if(!this.day)return;
    if(action==='build')this.deploy(raid);
    else if(action==='linkStart'){
      if(!target||this.conduits.some(route=>route.source===target)){
        raid.message('请选择尚未连线的数字井。');return;
      }
      this.routeStart=target;raid.message('已选数字井。走到核心或攻击塔前按 E 接轨。');
    }else if(action==='linkFinish')this.link(raid,target);
    else if(action==='core'||action==='repair')this.repair(raid,target);
    else if(action==='merge')this.merge(raid,target,other);
  }
  deploy(raid){
    const key=this.selected,def=BLUEPRINTS[key],p=raid.player;
    if(!def||!this.kits[key]||this.buildings.length>=MAX_BUILDINGS)return false;
    const aim=p.aimTarget&&distance(p,p.aimTarget)>48&&distance(p,p.aimTarget)<117?p.aimTarget:pointAt(p,p.aimAngle,64);
    const mine=key==='harvester'?near(p,this.mines,125):null;
    if(key==='harvester'&&!mine){raid.message('采集器需要部署在矿点旁。');return false;}
    const point=mine?pointAt(mine,Math.atan2(aim.y-mine.y,aim.x-mine.x),33):{x:aim.x,y:aim.y};
    if(!isFree(point.x,point.y,29,obstaclesFor(raid.world,point,point,29),raid.world.bounds)||
       distance(point,p)<p.radius+23||distance(point,this.core)<this.core.radius+30||
       raid.world.merchants.some(m=>distance(point,m)<56)||this.buildings.some(b=>distance(point,b)<46)){
      raid.message('部署位置被占用。让准星离自己 48–117 单位，选择空地。');return false;
    }
    const building={...point,id:'build-'+(++this.serial),kind:def.kind||key,value:def.value,
      hp:def.hp,maxHp:def.hp,radius:23,charge:0,readyAt:raid.elapsed,enchant:def.enchant,mine,enchantCooldowns:{}};
    if(key==='barricade'){
      const rect={x:point.x-22,y:point.y-22,w:44,h:44,kind:'barrier'};
      raid.world.obstacles.push(rect);raid.world.obstacleGrid.insert(rect);building.obstacle=rect;
    }
    this.buildings.push(building);this.consumeKit(key);
    raid.effect(point.x,point.y,'部署','#d7efd0','pulse',.4);
    return true;
  }
  link(raid,target){
    const source=this.routeStart;
    if(!source||!target||(target!==this.core&&!BUILDINGS[target.kind]?.range))return false;
    const length=distance(source,target);
    if(length>1450||length<60||!raid.visible(source,target,4)){
      raid.message('导轨需要无障碍直线，最长 1450 单位。');return false;
    }
    this.conduits.push({id:'conduit-'+(++this.serial),source,receiver:target,length});
    this.routeStart=null;this.consumeKit('conduit');
    raid.message('导轨接通 · 90 单位/秒');
    return true;
  }
  remove(raid,building){
    building.dead=true;
    this.buildings=this.buildings.filter(b=>b!==building);
    if(!building.obstacle)return;
    raid.world.obstacles=raid.world.obstacles.filter(o=>o!==building.obstacle);
    raid.world.obstacleGrid=new SpatialGrid(raid.world.obstacles);
  }
  merge(raid,building,other){
    if(!this.day||building===other||!this.buildings.includes(building)||!this.buildings.includes(other)||building.kind!==other.kind||
       building.value!==other.value||building.value>=2048||distance(building,other)>=MERGE_RANGE||
       !this.spend(6+roundLevel(building.value)*3,0))return false;
    building.value*=2;
    building.maxHp=Math.round(building.maxHp*1.5);
    building.hp=Math.min(building.maxHp,Math.max(building.maxHp*.8,building.hp+other.hp));
    building.charge=Math.min(16,building.charge+other.charge);
    this.remove(raid,other);
    raid.effect(other.x,other.y,'','#bef7c5','tile-fusion',.46,{originX:building.x,originY:building.y,
      radius:building.radius,value:other.value,fusionTarget:{x:building.x,y:building.y,radius:building.radius}});
    raid.effect(building.x,building.y-24,'MERGE!','#baf4ca','comic',.8);
    raid.event('siege-merge');
    return true;
  }
  repair(raid,building){
    if(building.hp<building.maxHp-.01){
      const core=building===this.core;
      if(!this.spend(0,core?8:5)){raid.message('合金不足。');return false;}
      building.hp=Math.min(building.maxHp,building.hp+(core?125:65));
      raid.event('heal');return true;
    }
    if(building!==this.core||building.value>=1024||!this.spend(28+roundLevel(building.value)*12,21+roundLevel(building.value)*7))return false;
    building.value*=2;building.maxHp+=125;building.hp=building.maxHp;raid.event('siege-merge');return true;
  }
  harvest(raid,mine,level=1){
    if(!mine||mine.readyAt>raid.elapsed)return false;
    if(mine.kind==='number_well'){
      if(!this.emitNumber(raid,mine,level))return false;
    }else if(mine.kind==='alloy_vein')this.alloy+=4+level*2;
    else if(mine.kind==='data_vein')this.data+=6+level*3;
    else return false;
    mine.readyAt=raid.elapsed+3;
    raid.event('loot');return true;
  }
  emitNumber(raid,mine,level){
    if(raid.world.tiles.filter(tile=>!tile.dead&&tile.fromMine===mine.id).length>=5)return false;
    const route=this.conduits.find(link=>link.source===mine&&!link.receiver.dead);
    const value=2**Math.min(3,level),tile={x:mine.x,y:mine.y,id:'well-'+(++this.serial),value,fromMine:mine.id,dead:false};
    if(route){
      Object.assign(tile,{conduit:route.id,beltAt:0});
    }else{
      Object.assign(tile,pointAt(mine,this.random()*Math.PI*2,22+this.random()*27));
    }
    raid.world.tiles.push(tile);return true;
  }
  depositNumber(receiver,value){
    if(receiver===this.core){
      this.data+=roundLevel(value)*2;
      this.core.hp=Math.min(this.core.maxHp,this.core.hp+roundLevel(value)*3);
    }else receiver.charge=Math.min(16,receiver.charge+roundLevel(value)*2);
  }
  receiveKill(enemy){
    this.data+=Math.max(2,roundLevel(enemy.value)+2)*(enemy.rewardScale||1);
    this.alloy+=enemy.elite?4:2;
  }
  spawn(raid){
    const {width,height}=raid.world.bounds,wave=this.wave,count=Math.min(5,2+Math.floor(wave/2),this.budget-this.spawned);
    for(let i=0;i<count;i++){
      const side=(this.spawned+i)%4,axis=.09+this.random()*.82;
      const p=side===0?{x:50,y:axis*height}:side===1?{x:width-50,y:axis*height}:
        side===2?{x:axis*width,y:50}:{x:axis*width,y:height-50};
      const value=2**Math.min(11,1+Math.floor((wave-1)/2)+(i%3===0&&wave>=3?1:0));
      const type=enemyTypeAt(i%4===1?'scout':'hunter',1,wave,this.spawned+i);
      const enemy=createEnemy('siege-'+this.wave+'-'+(++this.serial),p.x,p.y,value,type);
      Object.assign(enemy,{siege:true,horde:true,waveId:'siege-'+wave,zone:Math.min(2,Math.floor(wave/2)),cooldown:.65});
      equipEnemyAffixes(enemy,wave+1,wave);raid.world.enemies.push(enemy);
    }
    this.spawned+=count;
  }
  hitStructure(raid,enemy,target,mult=.09){
    if(target.dead||raid.status!=='playing')return;
    target.hp=Math.max(0,target.hp-attackDamage(enemy.value,target.value,target.maxHp,enemy.rarity)*mult);
    if(target.hp)return;
    if(target===this.core){this.core.dead=true;raid.finish(false,'中央核心已摧毁');}
    else this.remove(raid,target);
  }
  blastStructures(raid,enemy,radius){
    for(const s of [this.core,...this.buildings])if(distance(s,enemy)<radius+s.radius&&raid.visible(enemy,s))
      this.hitStructure(raid,enemy,s,.26);
  }
  march(raid,enemy,dt){
    if(this.goalFor(raid,enemy)===raid.player)return false;
    const target=near(enemy,this.buildings,enemy.radius+61) || this.core,def=ENEMY_TYPES[enemy.type];
    const gap=distance(enemy,target);
    if(gap<enemy.radius+target.radius+23){
      if(enemy.cooldown<=0&&exposeAttack(raid,enemy)){
        this.hitStructure(raid,enemy,target);
        enemy.cooldown=Math.max(.6,raid.enemyCooldown(def,enemy));
      }
      return true;
    }
    const formation=enemy.formation?.until>raid.elapsed?enemy.formation:null;
    const toward=formation||target;
    const dir=!raid.visible(enemy,toward,enemy.radius+2)?this.navigation.direction(enemy,this.core):null;
    const d=distance(enemy,toward)||1;
    const slow=enemy.slowTime>0?(enemy.slowScale||1):1;
    const speed=Math.max(85,def.speed)*slow*(raid.tactics.commandFor(enemy)?1.15:1)*dt;
    raid.move(enemy,(dir?.x??(toward.x-enemy.x)/d)*speed,(dir?.y??(toward.y-enemy.y)/d)*speed);
    return true;
  }
  towerTargets(raid,tower,range){
    return (raid.crowdGrid?.query(tower,tower,range)||raid.world.enemies)
      .filter(e=>!e.dead&&distance(tower,e)<=range&&(tower.kind==='mortar'||raid.visible(tower,e)))
      .sort((a,b)=>distance(tower,a)-distance(tower,b));
  }
  hitTower(raid,tower,enemy,power,enchant,splash=false){
    raid.damageEnemy(enemy,attackDamage(tower.value,enemy.value,enemy.maxHp)*power,{angle:Math.atan2(enemy.y-tower.y,enemy.x-tower.x),
      tower,noKnock:true,splash,enchant,value:tower.value,level:Math.min(5,roundLevel(tower.value))});
  }
  attackTower(raid,tower,def,target,enchant,power){
    const c=raid.elapsed, color=enchant==='burn'?'#ffb97c':enchant==='frost'?'#a3eaff':enchant==='sunder'?'#ffe392':'#d5f1c5';
    if(tower.kind==='mortar'){
      this.salvos.push({tower,target:{x:target.x,y:target.y},start:c,end:c+.58,power,enchant});return;
    }
    if(tower.kind==='tesla'){
      let from=tower;
      const others=this.towerTargets(raid,target,130).filter(e=>e!==target).slice(0,2);
      for(const enemy of [target,...others]){
        this.hitTower(raid,tower,enemy,power*(enemy===target?1:.52),enchant);
        if(!enemy.dead){
          enemy.slowTime=Math.max(enemy.slowTime||0,1.05);enemy.slowScale=Math.min(enemy.slowScale||1,.66);
          if(enemy.state==='merging')raid.interruptEnemy(enemy,.3);
        }
        raid.effect(from.x,from.y,'','#b4e9ff','lightning',.32,{endX:enemy.x,endY:enemy.y});from=enemy;
      }
      return;
    }
    if(tower.kind==='prism'){
      const angle=Math.atan2(target.y-tower.y,target.x-tower.x);
      const edge=pointAt(tower,angle,def.range);
      const shots=this.towerTargets(raid,tower,def.range).filter(e=>Number.isFinite(segmentCircleFraction(tower,edge,e,e.radius+9)));
      for(const enemy of shots.slice(0,5))this.hitTower(raid,tower,enemy,power,enchant);
      const last=shots[Math.min(4,shots.length-1)]||target;
      raid.effect(tower.x,tower.y,'',color,'siege-beam',.21,{endX:last.x,endY:last.y});return;
    }
    this.hitTower(raid,tower,target,power,enchant);
    raid.effect(tower.x,tower.y,'',color,'siege-beam',.12,{endX:target.x,endY:target.y});
  }
  updateTower(raid,tower,dt){
    const def=BUILDINGS[tower.kind];if(!def.range)return;
    for(const key of Object.keys(tower.enchantCooldowns))tower.enchantCooldowns[key]=Math.max(0,tower.enchantCooldowns[key]-dt);
    if(tower.readyAt>raid.elapsed)return;
    const enemy=this.towerTargets(raid,tower,def.range)[0];if(!enemy)return;
    const beacon=near(tower,this.buildings,200,b=>b.kind==='beacon');
    const charge=tower.charge>0;
    const crystal=near(tower,this.mines,250,m=>m.kind==='crystal_node');
    const rank=roundLevel(tower.value)-roundLevel(def.value);
    tower.readyAt=raid.elapsed+def.interval/(1+rank*.16+(crystal?.25:0)+(charge?.28:0));
    if(charge)tower.charge--;
    this.attackTower(raid,tower,def,enemy,beacon?.enchant,def.power*(1+rank*.095));
  }
  update(raid,dt){
    const now=raid.elapsed;
    if(now>=this.deadline){
      if(this.day){
        this.day=false;this.wave++;this.spawned=0;this.budget=Math.min(CAP,8+this.wave*4);this.nextSpawn=now;
        this.deadline=now+Math.min(60,43+this.wave*2);
        this.routeStart=null;
        raid.message('第 '+this.wave+' 夜 · 敌潮逼近核心');
      }else{
        this.completed=this.wave;raid.event('siege-record');this.day=true;this.deadline=now+PREP;
        raid.world.enemies=raid.world.enemies.filter(e=>!e.siege);
        raid.world.projectiles=raid.world.projectiles.filter(b=>b.owner==='player');
        raid.tactics.pairs=[];this.salvos=[];
        this.data+=10+this.wave*3;this.alloy+=7+this.wave*2;
        raid.message('守住第 '+this.wave+' 夜 · 30 秒备战');
      }
      raid.nightMode=!this.day;raid.event('siege-phase');
    }
    if(!this.day&&now>=this.nextSpawn&&this.spawned<this.budget){
      this.spawn(raid);this.nextSpawn=now+Math.max(1.9,4.5-this.wave*.2);
    }
    this.navigation.update(this.core,dt);
    for(const mine of this.mines){
      const harvester=near(mine,this.buildings,52,b=>b.mine===mine);
      const level=harvester?roundLevel(harvester.value):1;
      if(mine.kind==='number_well'&&now>=mine.nextTile){
        mine.interval=Math.max(2.8,4.6-level*.5);
        this.emitNumber(raid,mine,level);mine.nextTile=now+mine.interval;
      }else if(harvester&&(mine.kind==='alloy_vein'||mine.kind==='data_vein')&&now>=mine.nextTile){
        this.harvest(raid,mine,level);mine.nextTile=now+Math.max(3.2,5.6-level*.55);
      }
    }
    if(this.conduits.length)advanceConduits(raid,this,dt);
  }
  updateDefences(raid,dt){
    for(const tower of this.buildings)this.updateTower(raid,tower,dt);
    this.salvos=this.salvos.filter(salvo=>{
      if(raid.elapsed<salvo.end)return true;
      for(const e of raid.crowdGrid?.query(salvo.target,salvo.target,145)||raid.world.enemies){
        if(!e.dead&&distance(e,salvo.target)<125+e.radius)this.hitTower(raid,salvo.tower,e,salvo.power,salvo.enchant,true);
      }
      raid.effect(salvo.target.x,salvo.target.y,'','#ffcc85','impact',.38,{radius:125});raid.event('explosion');
      return false;
    });
  }
}
