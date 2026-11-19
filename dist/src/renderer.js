import { drawComicText } from './comic-type.js';
import { drawRoadNetwork } from './roads.js';
import { drawMoonlight, FLASHLIGHT_REACH } from './raid-light.js';
import { drawVehicle, drawBooster, exitVehicle, nodeLabel, mapBadge, drawSupplyCache, drawVendor, drawPickupBadge } from './raid-art.js';
import { drawProjectile, drawMeleeTrail, drawAttackWarning, drawEnemyImpact, drawMuzzleFlash, weaponPose } from './combat-art.js';
import { drawScenery, terrainPath, drawTerrainTexture, drawWeaponSprite } from './game-art.js';
import { impactScale } from './impact-motion.js';
import { drawTileFusion } from './fusion-motion.js';
import { RULES, WORLD, ZONES, ENEMY_TYPES, TERRAIN, PAINT } from './config.js';
import { clamp, distance, tier, zoneAt, firstWallFraction, canRecycleRemnant } from './math.js';
import { activeWeapon, weaponOf, spreadOf, rarityOf, ENCHANTS } from './equipment.js';
import { obstaclesFor, terrainFor } from './spatial.js';
import { drawNumberTile } from './number-tiles.js';
import { BOSSES, BOSS_MOVES, bossShotPattern } from './bosses.js';
import { bossZoneRadius } from './boss-hazards.js';

const TAU=Math.PI*2;
function polygon(c,vertices,sx=1,sy=1){
  c.beginPath();vertices.forEach((p,i)=>{if(i===0)c.moveTo(p.x*sx,p.y*sy);else c.lineTo(p.x*sx,p.y*sy);});c.lineTo(vertices[0].x*sx,vertices[0].y*sy);
}
export class Renderer {
  constructor(canvas,minimap) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.map=minimap;this.mctx=minimap.getContext('2d');
    this.width=1;this.height=1;this.scale=1;this.camera={x:300,y:1060};this.shake=0;this.bounds=WORLD;this.zones=ZONES;this.lastMapDraw=-Infinity;
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas.parentElement);this.resize();
  }
  feedback(event){
    if(this.reduced)return;
    const strength=event.strength||.5;
    if(event.type==='hit')this.shake=Math.max(this.shake,strength*2.8);
    if(event.type==='kill')this.shake=Math.max(this.shake,strength*3.8);
    if(event.type==='armorbreak')this.shake=Math.max(this.shake,3.5);
    if(event.type==='explosion')this.shake=Math.max(this.shake,5);
    if(event.type==='hurt')this.shake=Math.max(this.shake,event.damage>0?8:4);
    if(event.type==='parry')this.shake=Math.max(this.shake,4.5);
  }
  resize() {
    this.width=Math.max(1,this.canvas.parentElement.clientWidth);this.height=Math.max(1,this.canvas.parentElement.clientHeight);
    this.dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.round(this.width*this.dpr);this.canvas.height=Math.round(this.height*this.dpr);
    this.scale=clamp(this.width/1500,0.7,1.05)*1.22;
  }
  screenToWorld(clientX,clientY){
    const rect=this.canvas.getBoundingClientRect();
    return {x:(clientX-rect.left-rect.width/2)/this.scale+this.camera.x,
      y:(clientY-rect.top-rect.height/2)/this.scale+this.camera.y};
  }
  rect(x,y,w,h,r,fill,stroke) {
    const c=this.ctx;c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}
  }
  text(text,x,y,size,options) {
    drawComicText(this.ctx,text,x,y,size,options);
  }
  visible(x,y,pad=100) {return Math.abs(x-this.camera.x)<this.width/this.scale/2+pad&&Math.abs(y-this.camera.y)<this.height/this.scale/2+pad;}
  rectVisible(r){
    const hw=this.width/this.scale/2,hh=this.height/this.scale/2;
    return r.x+r.w>=this.camera.x-hw&&r.x<=this.camera.x+hw&&r.y+r.h>=this.camera.y-hh&&r.y<=this.camera.y+hh;
  }
  draw(raid,time,dt=0.016) {
    if(!raid)return;
    const c=this.ctx,p=raid.player,w=raid.world;this.bounds=w.bounds||WORLD;this.zones=w.zones||ZONES;
    const halfW=this.width/this.scale/2,halfH=this.height/this.scale/2;
    const follow=this.reduced?1:1-Math.exp(-dt*12);
    this.camera.x+=(clamp(p.x,halfW,this.bounds.width-halfW)-this.camera.x)*follow;
    this.camera.y+=(clamp(p.y,halfH,this.bounds.height-halfH)-this.camera.y)*follow;
    this.shake=Math.max(0,this.shake-dt*20);
    c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,this.width,this.height);c.fillStyle=PAINT.ink;c.fillRect(0,0,this.width,this.height);
    c.save();c.translate(this.width/2+(this.reduced?0:Math.sin(time*90)*this.shake),this.height/2+(this.reduced?0:Math.cos(time*113)*this.shake*.55));c.scale(this.scale,this.scale);c.translate(-this.camera.x,-this.camera.y);
    const left=this.camera.x-halfW,top=this.camera.y-halfH,right=left+2*halfW,bottom=top+2*halfH;
    for(const zone of this.zones){if(!zone.vertices)continue;polygon(c,zone.vertices);c.fillStyle=zone.floor||PAINT.ground[zone.risk];c.fill();}
    this.drawGroundDetails(w,{left,top,right,bottom});
    this.drawTerrain(w,time);
    this.simulationTime=raid.elapsed;
    for(const cloud of w.hazards||[])if(this.visible(cloud.x,cloud.y,cloud.radius+30)){
      if(cloud.bossZone||cloud.runHazard){this.drawBossZone(cloud);continue;}
      c.fillStyle=cloud.owner==='player'?'#a8f43255':'#a849cf66';c.strokeStyle=cloud.owner==='player'?'#4c8c20':'#9d2eaa';c.lineWidth=2;
      c.beginPath();c.arc(cloud.x,cloud.y,cloud.radius,0,TAU);c.fill();c.stroke();
      this.text(cloud.owner==='player'?'附魔毒雾':'危险毒雾',cloud.x,cloud.y+5,11);
    }
    // Sector borders remain visible without a screen-wide grid.
    c.setLineDash([14,9]);c.lineWidth=2;
    for(const zone of this.zones){if(!zone.vertices)continue;polygon(c,zone.vertices);c.strokeStyle=zone.color+'99';c.stroke();}
    c.setLineDash([]);c.strokeStyle=PAINT.ink+'77';c.lineWidth=2;c.strokeRect(12,12,this.bounds.width-24,this.bounds.height-24);
    c.setLineDash([3,9]);c.strokeStyle='#36274688';c.lineWidth=1;c.beginPath();c.moveTo(260,1060);c.lineTo(655,1060);c.stroke();c.setLineDash([]);

    for(const mark of w.spawnWarnings||[]){
      if(!this.visible(mark.x,mark.y,90))continue;
      const progress=clamp(1-(mark.readyAt-raid.elapsed)/mark.duration,0,1);
      c.fillStyle='#ff42a233';c.strokeStyle=PAINT.pink;c.lineWidth=3;c.beginPath();c.arc(mark.x,mark.y,38,0,TAU);c.fill();c.stroke();
      c.beginPath();c.arc(mark.x,mark.y,38*(1-progress),0,TAU);c.stroke();this.text('!',mark.x,mark.y+7,22,{impact:true});
    }
    for(const exit of w.exits)if(this.visible(exit.x,exit.y,140))this.drawExit(exit,raid,time);
    for(const merchant of w.merchants||[])if(this.visible(merchant.x,merchant.y,130))drawVendor(c,merchant);
    for(const obstacle of obstaclesFor(w,{x:left,y:top},{x:right,y:bottom},20))if(this.rectVisible(obstacle))this.drawObstacle(obstacle);
    for(const chest of w.chests)if(this.visible(chest.x,chest.y))this.drawChest(chest,p,time);
    for(const node of w.nodes||[])if(this.visible(node.x,node.y,140))this.drawNode(node,time);
    for(const tile of w.tiles)if(!tile.dead&&distance(tile,p)<raid.run.vision&&this.visible(tile.x,tile.y))this.drawTile(tile,p,time);
    for(const loot of w.drops)if(!loot.dead&&distance(loot,p)<raid.run.vision&&this.visible(loot.x,loot.y))this.drawDrop(loot,p,time);
    for(const enemy of w.enemies)if(!enemy.dead&&enemy.state==='windup'&&distance(enemy,p)<raid.run.vision&&this.visible(enemy.x,enemy.y,800))this.drawTelegraph(enemy,time,raid.enemyMoveScale());
    const selected=raid.nearestEnemy(RULES.divideRange,e=>e.value>p.value)||raid.nearestEnemy(RULES.divideRange,e=>e.value>1);
    for(const enemy of w.enemies)if(!enemy.dead&&distance(enemy,p)<raid.run.vision&&this.visible(enemy.x,enemy.y))this.drawEnemy(enemy,p,time,enemy===selected);
    for (const bullet of w.projectiles) {
      if (!bullet.dead && this.visible(bullet.x,bullet.y,60)) drawProjectile(c, bullet, this.reduced);
    }
    let fusionDeformation = null;
    for (const effect of w.effects) {
      if (effect.kind !== 'tile-fusion' || !this.visible(effect.originX,effect.originY,245)) continue;
      fusionDeformation = drawTileFusion(c, effect, p, this.reduced) || fusionDeformation;
    }
    this.drawPlayer(p,time,fusionDeformation);
    for(const e of w.effects) {
      if (e.kind === 'tile-fusion') continue;
      const progress=1-e.life/e.maxLife;c.globalAlpha=Math.min(1,e.life/e.maxLife*2);
      if(e.kind==='text'){
        if(e.text==='击破')this.inkSplat(e.x,e.y,38+progress*20,PAINT.pink,.3,Math.min(.75,e.life/e.maxLife));
        const armor=e.text.startsWith('护甲');
        const damage=/^[−-]\d/.test(e.text);
        const size=damage?(e.heavy?27:21):armor?17:15;
        this.text(e.text,e.x,e.y-progress*25,size,{impact:damage||armor});
      }
      else if(e.kind==='gravity'){c.strokeStyle=e.color;c.lineWidth=3;c.beginPath();c.arc(e.x,e.y,e.radius*(1-progress*.7),0,TAU);c.stroke();}
      else if(e.kind==='gust'){
        c.strokeStyle=e.color;c.lineWidth=5*(1-progress)+1;
        for(let i=0;i<4;i++){
          const angle=i*TAU/4+progress*1.6;
          c.beginPath();c.arc(e.x,e.y,e.radius*(.18+progress*.82),angle,angle+1.15);c.stroke();
        }
      }else if(e.kind==='blink'){
        for(let i=0;i<4;i++){
          const t=i/4,x=e.x+(e.endX-e.x)*t,y=e.y+(e.endY-e.y)*t;
          c.globalAlpha=(.16+t*.18)*(1-progress);
          drawNumberTile(c,{x,y,size:e.radius*2+6,value:e.value,stroke:e.color});
        }
      }else if(e.kind==='lightning'){
        c.strokeStyle='#dbfbff';c.lineWidth=4;c.beginPath();c.moveTo(e.x,e.y);
        for(let i=1;i<5;i++){const t=i/5;c.lineTo(e.x+(e.endX-e.x)*t+(i%2?10:-10),e.y+(e.endY-e.y)*t+(i%2?-10:10));}
        c.lineTo(e.endX,e.endY);c.stroke();
      }else if(e.kind==='hit-spark'){
        const count=e.strength>=.9?10:6;c.strokeStyle=e.color;c.lineWidth=e.strength>=.9?3:2;
        for(let i=0;i<count;i++){
          const a=(e.angle||0)+i*TAU/count+(e.seed||0)*.017,r=(e.radius||30)*progress;
          c.beginPath();c.moveTo(e.x+Math.cos(a)*r*.35,e.y+Math.sin(a)*r*.35);c.lineTo(e.x+Math.cos(a)*(r+8),e.y+Math.sin(a)*(r+8));c.stroke();
        }
      }else if(e.kind==='shatter'){
        for(let i=0;i<8;i++){const a=i*TAU/8+(e.seed||0)*.01,r=e.radius*progress;this.rect(e.x+Math.cos(a)*r-3,e.y+Math.sin(a)*r-3,6*(1-progress)+1,6*(1-progress)+1,1,i%2?PAINT.yellow:PAINT.pink,PAINT.ink);}
      }
      else if(e.kind==='slash') drawMeleeTrail(c, e, progress, this.reduced);
      else if(e.kind==='muzzle') drawMuzzleFlash(c, e, progress, this.reduced);
      else if(e.kind==='enemy-impact') drawEnemyImpact(c, e, progress, this.reduced);
      else {if(e.kind==='impact')this.inkSplat(e.x,e.y,(e.radius||64)*(.45+progress*.5),PAINT.orange,progress,Math.min(.6,e.life/e.maxLife));c.strokeStyle=e.color;c.lineWidth=e.kind==='impact'?3:2;c.beginPath();c.arc(e.x,e.y,e.kind==='pulse'?22+progress*90:(e.radius||64)*(.8+progress*.2),0,TAU);c.stroke();}
    }
    c.globalAlpha=1;
    if (raid.nightMode) {
      let reach=0;
      if(p.flashlight){
        const end={x:p.x+Math.cos(p.aimAngle)*FLASHLIGHT_REACH,y:p.y+Math.sin(p.aimAngle)*FLASHLIGHT_REACH};
        const wall=firstWallFraction(p,end,obstaclesFor(w,p,end));
        reach=FLASHLIGHT_REACH*(wall===Infinity?1:wall);
      }
      drawMoonlight(c,p,{left,top,right,bottom},reach);
    }
    this.drawAim(p,w,'laser');
    if(Number.isFinite(raid.run.vision)){
      const radius=raid.run.vision,fog=c.createRadialGradient(p.x,p.y,radius*.6,p.x,p.y,radius);
      fog.addColorStop(0,'#09131a00');fog.addColorStop(1,'#09131aff');c.fillStyle=fog;c.fillRect(left,top,right-left,bottom-top);
    }
    this.drawAim(p,w,'cursor');
    c.restore();
    if(raid.carriedValue()>0)this.drawExitArrow(raid);
    if(time-this.lastMapDraw>0.15){this.drawMap(raid);this.lastMapDraw=time;}
  }
  inkSplat(x,y,r,color,angle=0,alpha=1){
    const c=this.ctx;
    c.save();
    c.translate(x,y);
    c.rotate(angle);
    c.globalAlpha=alpha;
    c.fillStyle=color;
    c.strokeStyle=PAINT.ink;
    c.lineWidth=1.5;
    c.beginPath();
    for(let i=0;i<=14;i++){
      const a=i*TAU/14;
      const radius=r*(i%2 ? .42 : .76+(i%3)*.12);
      const px=Math.cos(a)*radius,py=Math.sin(a)*radius;
      if(i===0)c.moveTo(px,py);else c.lineTo(px,py);
    }
    c.fill();
    c.stroke();
    c.restore();
  }
  drawGroundDetails(world,view){
    const c=this.ctx,cell=300;
    // Deterministic scattered shapes follow the map seed without consuming combat RNG.
    for(let gx=Math.max(0,Math.floor(view.left/cell)-1);gx<=Math.floor(view.right/cell)+1;gx++){
      for(let gy=Math.max(0,Math.floor(view.top/cell)-1);gy<=Math.floor(view.bottom/cell)+1;gy++){
        const hash=(Math.imul(gx+17,73856093)^Math.imul(gy+31,19349663)^world.seed)>>>0;
        const x=gx*cell+40+hash%215,y=gy*cell+40+(hash>>>8)%215;
        if(x>this.bounds.width||y>this.bounds.height||!this.visible(x,y,64))continue;
        const risk=zoneAt({x,y},this.zones).risk;
        c.fillStyle=['#82958643','#a1937443','#9b7b9743'][risk];
        c.beginPath();
        c.moveTo(x-65,y+6);
        c.lineTo(x-41,y-19);
        c.lineTo(x-9,y-22);
        c.lineTo(x+19,y-12);
        c.lineTo(x+56,y-17);
        c.lineTo(x+33,y+14);
        c.lineTo(x-22,y+28);
        c.lineTo(x-65,y+6);
        c.fill();
        c.save();
        c.globalAlpha=.5;
        const kind=['gravel','fern','tree'][hash%3];
        drawScenery(c,kind,x+17,y-8,kind==='tree'?36:43,31);
        c.restore();
      }
    }
  }
  drawTerrain(world,time){
    const c=this.ctx,hw=this.width/this.scale/2,hh=this.height/this.scale/2;
    const a={x:this.camera.x-hw,y:this.camera.y-hh},b={x:this.camera.x+hw,y:this.camera.y+hh};
    const patches=terrainFor(world,a,b).filter(p=>this.rectVisible(p)).sort((a,b)=>(TERRAIN[a.kind]?.priority||0)-(TERRAIN[b.kind]?.priority||0));
    let roadsDrawn=false;
    for(const patch of patches){
      if(patch.kind==='road')continue;
      const info=TERRAIN[patch.kind]||TERRAIN.mud,water=patch.kind==='water',bridge=patch.kind==='bridge';
      if(bridge&&!roadsDrawn){drawRoadNetwork(c,world.roadRoutes);roadsDrawn=true;}
      terrainPath(c,patch);
      c.fillStyle=info.color+(bridge?'':'d6');
      c.fill();
      const illustrated=drawTerrainTexture(c,patch,time,this.reduced);
      terrainPath(c,patch);
      c.strokeStyle=water?'#244955':PAINT.ink+'73';
      c.lineWidth=water?2.4:1.2;
      c.lineJoin='round';
      c.stroke();
      c.strokeStyle=info.line+'99';
      c.lineWidth=1;
      if(bridge){
        const horizontal=patch.axis?patch.axis==='x':patch.w>=patch.h;
        const from=horizontal?Math.max(patch.x,Math.floor(a.x/22)*22):Math.max(patch.y,Math.floor(a.y/22)*22);
        const to=horizontal?Math.min(patch.x+patch.w,b.x):Math.min(patch.y+patch.h,b.y);
        for(let n=from;n<to;n+=22){
          c.beginPath();
          if(horizontal){c.moveTo(n,patch.y+4);c.lineTo(n,patch.y+patch.h-4);}
          else{c.moveTo(patch.x+4,n);c.lineTo(patch.x+patch.w-4,n);}
          c.stroke();
        }
      }else if(water&&!illustrated){
        // Keep a simple current visible before the atlas has loaded.
        for(let i=1;i<4;i++){
          const y=patch.y+patch.h*i/4+(this.reduced?0:Math.sin(time+i)*3);
          c.beginPath();c.moveTo(patch.x+8,y);c.lineTo(patch.x+patch.w*.43,y-2);c.lineTo(patch.x+patch.w-8,y+1);c.stroke();
        }
      }

    }
    if(!roadsDrawn)drawRoadNetwork(c,world.roadRoutes);
  }
  drawAim(player,world,layer){
    const c=this.ctx,item=activeWeapon(player),weapon=weaponOf(item);
    const laser=!!player.laser&&!player.laserDisabled;
    const angle=player.aimAngle;
    c.save();
    if(laser&&layer!=='cursor'){
      const far={x:player.x+Math.cos(angle)*weapon.range,y:player.y+Math.sin(angle)*weapon.range};
      const wall=firstWallFraction(player,far,obstaclesFor(world,player,far));
      const length=weapon.range*Math.min(1,wall===Infinity?1:wall);
      c.beginPath();c.moveTo(player.x+Math.cos(angle)*26,player.y+Math.sin(angle)*26);
      c.lineTo(player.x+Math.cos(angle)*length,player.y+Math.sin(angle)*length);
      c.strokeStyle=PAINT.ink+'88';c.lineWidth=3.5;c.stroke();c.strokeStyle='#ff5d65cc';c.lineWidth=1.5;c.stroke();
      if(weapon.mode==='ranged'){
        c.strokeStyle='#ff5d6528';
        for(const side of [-1,1]){const a=angle+side*spreadOf(item,true);c.beginPath();c.moveTo(player.x,player.y);c.lineTo(player.x+Math.cos(a)*length,player.y+Math.sin(a)*length);c.stroke();}
      }
    }
    if(player.aimTarget&&layer!=='laser'){
      const {x,y}=player.aimTarget;
      c.beginPath();c.arc(x,y,8,0,TAU);
      c.moveTo(x-17,y);c.lineTo(x-10,y);c.moveTo(x+10,y);c.lineTo(x+17,y);
      c.moveTo(x,y-17);c.lineTo(x,y-10);c.moveTo(x,y+10);c.lineTo(x,y+17);
      c.lineWidth=5;c.strokeStyle=PAINT.ink;c.stroke();
      c.lineWidth=2.5;c.strokeStyle=laser?'#ff737b':'#fff4dc';c.stroke();
    }
    c.restore();
  }
  drawObstacle(o) {
    const c=this.ctx;
    const rock=o.material==='rock'||o.material==='ridge';
    const tree=o.material==='tree';
    const fill=rock?'#9f8493':tree?'#8c9e63':o.material==='barricade'?'#aea194':'#957a87';
    const cut=Math.min(9,o.w*.20,o.h*.20);
    const outline=()=>{
      c.beginPath();
      c.moveTo(o.x+cut,o.y);
      c.lineTo(o.x+o.w-cut,o.y+1);
      c.lineTo(o.x+o.w,o.y+cut);
      c.lineTo(o.x+o.w-1,o.y+o.h-cut);
      c.lineTo(o.x+o.w-cut,o.y+o.h);
      c.lineTo(o.x+cut,o.y+o.h-1);
      c.lineTo(o.x,o.y+o.h-cut);
      c.lineTo(o.x+1,o.y+cut);
      c.lineTo(o.x+cut,o.y);
    };
    c.save();
    c.translate(3,4);
    outline();
    c.fillStyle='#24212d42';
    c.fill();
    c.restore();
    outline();
    c.fillStyle=fill;
    c.fill();
    c.save();
    c.clip();
    const illustrated=Math.max(o.w/o.h,o.h/o.w)<6&&drawScenery(c,o.material,o.x,o.y,o.w,o.h);
    c.restore();
    outline();
    c.strokeStyle=PAINT.ink;
    c.lineWidth=2.3;
    c.lineJoin='round';
    c.stroke();
    if(!illustrated){
      c.strokeStyle='#f5e4c499';
      c.lineWidth=1.5;
      c.beginPath();
      c.moveTo(o.x+cut,o.y+cut/2);
      c.lineTo(o.x+o.w*.45,o.y+cut*.65);
      c.lineTo(o.x+o.w-cut,o.y+cut*.42);
      c.stroke();
    }
  }
  drawExit(e,raid,time) {
    const c=this.ctx,ready=raid.extractionReady(e),active=distance(e,raid.player)<e.radius;
    c.save();
    if(e.safehouse){
      c.fillStyle='#21dfd329';c.strokeStyle='#38bda9';c.lineWidth=2;
      c.beginPath();c.arc(e.x,e.y,e.safetyRadius,0,TAU);c.fill();c.stroke();
    }
    c.fillStyle=ready?'#d9ff7755':'#ffb47430';
    c.strokeStyle=ready?'#427447':'#a85242';c.lineWidth=active?4:2.5;
    c.setLineDash([12,7]);c.lineDashOffset=this.reduced?0:-time*8;
    c.beginPath();c.arc(e.x,e.y,e.radius,0,TAU);c.fill();c.stroke();
    c.restore();
    drawVehicle(c,e,ready);
  }
  drawChest(chest,p) {
    drawSupplyCache(this.ctx,chest,distance(p,chest)<80);
  }
  drawNode(node,time){
    drawBooster(this.ctx,node,time,this.reduced);
  }
  drawDrop(item,p,time){
    const c=this.ctx,gear=item.kind&&item.kind!=='loot',color=gear?rarityOf(item.rarity).color:PAINT.yellow;
    const y=item.y+(this.reduced?0:Math.sin(time*2+item.x)*2);
    c.save();c.translate(item.x,y);
    if(item.kind==='weapon'){
      this.rect(-16,-13,32,26,5,PAINT.ink,color);
      if(!drawWeaponSprite(c,item.weapon,-13,0,26,23)){
        this.text(weaponOf(item).short,0,4,9);
      }
    }else drawPickupBadge(c,item,color);
    c.restore();

  }
  drawTile(tile,p,time) {
    const c=this.ctx,equal=tile.value===p.value&&p.value<RULES.maxValue,recycle=canRecycleRemnant(p.value,tile),size=equal?40:35;
    const y=tile.y+(this.reduced?0:Math.sin(time*2.5+tile.x)*2);
    if(equal){c.strokeStyle='#43a62c99';c.lineWidth=2;c.beginPath();c.arc(tile.x,y,29,0,TAU);c.stroke();}
    drawNumberTile(c,{x:tile.x,y,size,value:tile.value,stroke:equal?'#83e951':recycle?'#e8bb46':'#ffffffaa'});
    if(recycle){
      this.text('◇',tile.x+16,y-14,12);

    }
  }
  drawTelegraph(e,time,speed=1) {
    const c=this.ctx,definition=ENEMY_TYPES[e.type]||ENEMY_TYPES.hunter;
    if(e.boss){this.drawBossTelegraph(e,speed);return;}
    const progress=clamp(1-e.timer/(e.windup||definition.windup),0,1),angle=Math.atan2(e.aimY-e.y,e.aimX-e.x);
    c.lineWidth=definition.pattern==='snipe'?3:2;c.strokeStyle=definition.pattern==='snipe'?'#b91259':'#b73345';
    if(['strike','blast','slam'].includes(definition.pattern)){
      const radius=definition.pattern==='slam'?175:definition.pattern==='blast'?118:64;
      drawAttackWarning(c, e.aimX, e.aimY, radius, progress, definition.pattern==='blast'?'#d66b2b':'#b73345', this.reduced);
      const marker = definition.pattern==='blast'?'爆破':definition.pattern==='slam'?'重击':'近击';
      this.text(marker,e.aimX,e.aimY+6,16,{impact:true});
    }else if(['heal','summon','ring'].includes(definition.pattern)){
      const support=definition.pattern==='heal',x=support?e.aimX:e.x,y=support?e.aimY:e.y,r=support?60:definition.pattern==='summon'?110:150;
      c.strokeStyle=support?'#008b70':'#8310d2';c.beginPath();c.arc(x,y,r,0,TAU);c.stroke();c.beginPath();c.arc(x,y,r*(1-progress),0,TAU);c.stroke();
      this.text(support?'+':definition.pattern==='summon'?'孵化':'环射',x,y+5,14);
    }else if(definition.pattern==='charge'){
      c.save();c.translate(e.x,e.y);c.rotate(angle);c.fillStyle='#ff5a4b44';const length=560*.65*speed+e.radius;c.fillRect(0,-24,length,48);c.setLineDash([8,6]);c.strokeRect(0,-24,length,48);
      c.setLineDash([]);c.beginPath();c.moveTo(length-19,-9);c.lineTo(length-5,0);c.lineTo(length-19,9);c.stroke();c.restore();
    }else{
      const offsets=definition.pattern==='fan'?[-.24,0,.24]:[0];c.setLineDash([6,6]);
      for(const offset of offsets){c.beginPath();c.moveTo(e.x,e.y);c.lineTo(e.x+Math.cos(angle+offset)*definition.range,e.y+Math.sin(angle+offset)*definition.range);c.stroke();}c.setLineDash([]);
    }
  }
  drawBossZone(zone){
    const c=this.ctx,warning=zone.age<zone.warn,color=zone.color||'#e95769';
    c.save();c.strokeStyle=color;c.fillStyle=color+(warning?'22':'66');c.lineWidth=2;
    if(warning)c.setLineDash([7,6]);
    if(zone.kind==='line'){
      c.translate(zone.x,zone.y);c.rotate(zone.angle);c.fillRect(-zone.length/2,-zone.width/2,zone.length,zone.width);c.strokeRect(-zone.length/2,-zone.width/2,zone.length,zone.width);
    }else if(zone.kind==='ring'){
      const radius=bossZoneRadius(zone);c.lineWidth=zone.width;c.strokeStyle=color+(warning?'44':'88');c.beginPath();c.arc(zone.x,zone.y,radius,0,TAU);c.stroke();
      c.lineWidth=2;c.strokeStyle=color;c.beginPath();c.arc(zone.x,zone.y,Math.max(1,radius-zone.width/2),0,TAU);c.stroke();c.beginPath();c.arc(zone.x,zone.y,radius+zone.width/2,0,TAU);c.stroke();
    }else{
      c.beginPath();c.arc(zone.x,zone.y,zone.radius,0,TAU);c.fill();c.stroke();
      if(zone.kind==='gravity'){c.beginPath();c.arc(zone.x,zone.y,25+Math.sin(zone.age*4)*8,0,TAU);c.stroke();}
    }
    c.restore();this.text((warning?'预警 · ':'')+zone.label,zone.x,zone.y-12,12);
  }
  drawBossTelegraph(e,speed=1){
    const c=this.ctx,progress=clamp(1-e.timer/e.windup,0,1),a=Math.atan2(e.aimY-e.y,e.aimX-e.x);
    c.lineWidth=3;c.strokeStyle='#e92c57';c.fillStyle='#ff406733';
    if(['cross','icefield','icewave','bombard','furnace','well','collapse'].includes(e.bossMove))return;
    if(e.bossMove==='cleave'){
      c.beginPath();c.moveTo(e.x,e.y);c.arc(e.x,e.y,210,a-Math.PI*.575,a+Math.PI*.575);c.lineTo(e.x,e.y);c.fill();c.stroke();
    }else if(['slam','poison'].includes(e.bossMove)){
      const r=e.bossMove==='poison'?205:e.bossPhase===2?220:175;
      drawAttackWarning(c, e.aimX, e.aimY, r, progress, e.bossMove==='poison'?'#825487':'#b72947', this.reduced);
      this.text(e.bossMove==='poison'?'毒雾 · 离开红圈':'震地 · 闪避 / 弹反',e.aimX,e.aimY,13);
    }else if(['dash','shadowdash'].includes(e.bossMove)){
      const length=(e.bossMove==='shadowdash'?740:590)*(e.bossPhase===2?.7:.5)*speed+42;
      c.save();c.translate(e.x,e.y);c.rotate(a);c.fillRect(0,-48,length,96);c.strokeRect(0,-48,length,96);c.restore();
    }else{
      c.setLineDash([8,7]);
      for(const shot of bossShotPattern(e)){c.beginPath();c.moveTo(e.x,e.y);c.lineTo(e.x+Math.cos(shot.angle)*450,e.y+Math.sin(shot.angle)*450);c.stroke();}c.setLineDash([]);
      this.text(BOSS_MOVES[e.bossMove],e.x,e.y-85,13,{impact:true});
    }
  }
  drawEnemy(e,p,time,selected) {
    const c=this.ctx,strong=e.value>p.value,s=(e.radius||21)*2-1;
    if (!this.reduced && (e.state === 'charge' || e.state === 'boss-charge')) {
      c.save();
      c.translate(e.x,e.y);
      c.rotate(Math.atan2(e.chargeY,e.chargeX));
      c.strokeStyle='#de6247';
      c.lineWidth=2.5;
      for (const edge of [-1, 1]) {
        const y = edge * s * .32;
        c.globalAlpha=.58;
        c.beginPath();c.moveTo(-s*.3,y);c.lineTo(-s*1.05,y);c.stroke();
      }
      c.restore();
    }
    const stroke=strong?'#ed3e72':'#d94a65',named=selected||e.elite||e.boss||e.hunter;
    const flash=!this.reduced&&(e.hitFlash||0)>.035;
    drawNumberTile(c,{x:e.x,y:e.y,size:s,value:e.value,stroke,flash,deformation:this.reduced?null:impactScale(e.impactMotion,this.simulationTime)});
    c.fillStyle='#e82d59';c.beginPath();c.arc(e.x+s/2-2,e.y-s/2+1,5,0,TAU);c.fill();
    this.text('!',e.x+s/2-2,e.y-s/2+4,9);
    const definition=ENEMY_TYPES[e.type]||ENEMY_TYPES.hunter;
    if(named){this.rect(e.x-45,e.y-s/2-27,90,17,4,PAINT.ink);}
    if(named)this.text((e.state==='windup'?'! ':'')+(e.bossName||(e.hunter?'追猎 · ':'')+definition.name),e.x,e.y-s/2-14,e.boss?15:12);
    if(e.boss){
      const glyph=BOSSES[e.boss].glyph;this.rect(e.x-s/2-17,e.y-s/2-17,22,22,5,BOSSES[e.boss].color,PAINT.ink);this.text(glyph,e.x-s/2-6,e.y-s/2,16);
      c.strokeStyle=BOSSES[e.boss].color;c.lineWidth=4;c.strokeRect(e.x-s/2-6,e.y-s/2-6,s+12,s+12);
      this.rect(e.x-75,e.y-s/2-52,150,10,4,PAINT.ink);this.rect(e.x-75,e.y-s/2-52,150*e.hp/e.maxHp,10,4,BOSSES[e.boss].color);
      this.text(`BOSS / 阶段 ${e.bossPhase}`,e.x,e.y+s/2+48,13);
    }
    if(e.poisoned>0)this.text('毒',e.x+s/2+12,e.y-16,12);
    if(e.afflictions?.burn)this.text('焰',e.x-s/2-10,e.y+3,12);
    if(e.afflictions?.bleed)this.text('血',e.x-s/2-10,e.y+18,12);
    if(e.slowTime>0){c.strokeStyle='#79d6ff';c.lineWidth=2;c.beginPath();c.arc(e.x,e.y,s*.7,0,TAU);c.stroke();}
    if(e.sundered>0)this.text('破',e.x+s/2+11,e.y+20,12);
    if(named&&definition.glyph)this.text(definition.glyph,e.x+s/2+12,e.y+5,16);

    if(['sentry','gunner','sniper'].includes(e.type)){c.fillStyle=stroke;c.fillRect(e.x-3,e.y-28,6,10);}
    if(e.armor?.durability>0){this.rect(e.x-20,e.y+36,40,3,1,'#142c3f');this.rect(e.x-20,e.y+36,40*e.armor.durability/e.armor.maxDurability,3,1,'#25bdff');}
    if(e.hp<e.maxHp){this.rect(e.x-20,e.y+30,40,3,1,'#0f1c16');this.rect(e.x-20,e.y+30,40*e.hp/e.maxHp,3,1,PAINT.pink);}
    if(e.stun>0)this.text('眩晕',e.x,e.y-42,12);
    if(selected){c.strokeStyle='#7021cbbb';c.lineWidth=1;for(const [sx,sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){c.beginPath();c.moveTo(e.x+sx*30,e.y+sy*20);c.lineTo(e.x+sx*30,e.y+sy*30);c.lineTo(e.x+sx*20,e.y+sy*30);c.stroke();}}
  }
  drawPlayer(p,time,fusionDeformation=null) {
    const c=this.ctx,t=tier(p.value),size=p.radius*2+6;
    if(p.parryWindow>0){c.strokeStyle='#e9fdff';c.lineWidth=7;c.beginPath();c.arc(p.x,p.y,48,p.aimAngle-1.42,p.aimAngle+1.42);c.stroke();}
    if(p.overload>0||p.energy>=100){c.strokeStyle=p.overload>0?'#edcf8bbb':'#edcf8b55';c.lineWidth=2;c.beginPath();c.arc(p.x,p.y,34+(this.reduced?0:Math.sin(time*6)*2),0,TAU);c.stroke();}
    if(p.buffs.phase>0){c.strokeStyle='#8bbcf488';c.lineWidth=2;c.beginPath();c.arc(p.x,p.y,42,0,TAU);c.stroke();}
    if(p.buffs.magnet>0){c.strokeStyle='#c1a5f025';c.lineWidth=1;c.beginPath();c.arc(p.x,p.y,135,0,TAU);c.stroke();}const tint=t>=6?PAINT.yellow:t>=3?PAINT.lime:PAINT.cyan;
    if(p.invulnerable>0&&Math.floor(time*16)%2===0&&!this.reduced)c.globalAlpha=.55;
    if(p.dashTime>0){this.rect(p.x-20-p.dashX*22,p.y-20-p.dashY*22,40,40,7,tint+'44');}
    const hitDeformation = impactScale(p.impactMotion,this.simulationTime);
    const deformation = hitDeformation.x !== 1 ? hitDeformation : fusionDeformation;
    drawNumberTile(c,{x:p.x,y:p.y,size,value:p.value,stroke:'#ffffff',deformation:this.reduced?null:deformation});
    c.strokeStyle='#18a49b';c.lineWidth=2;c.strokeRect(p.x-size/2-4,p.y-size/2-4,size+8,size+8);
    this.rect(p.x-16,p.y-size/2-26,32,14,4,PAINT.ink);this.text('YOU',p.x,p.y-size/2-16,9);
    const equipped=activeWeapon(p),weapon=weaponOf(equipped);c.save();c.translate(p.x,p.y);
    const pose=weaponPose(p.weaponMotion,equipped.weapon,p.aimAngle,this.simulationTime,this.reduced);
    c.rotate(pose.angle);
    c.translate(p.radius-19+pose.x,pose.y);
    const spriteWidth=weapon.mode==='melee'?(equipped.weapon==='spear'?88:58):(weapon.range>850?58:43);
    const drewSprite=drawWeaponSprite(c,equipped.weapon,14,0,spriteWidth,weapon.mode==='melee'?38:31);
    if(!drewSprite&&weapon.mode==='ranged'){
      const length={pistol:20,smg:25,rifle:33,sniper:44,shotgun:31,railgun:48,carbine:32,lmg:40,crossbow:34,grenade:26,revolver:29,doublebarrel:35,plasma:26,flamethrower:39,rocket:52}[equipped.weapon]||25;
      this.rect(14,-5,length,10,2,'#302541',rarityOf(equipped.rarity).color);
      c.fillStyle=equipped.enchant&&equipped.enchant!=='none'?ENCHANTS[equipped.enchant].color:equipped.weapon==='railgun'?PAINT.cyan:'#ff7bc0';c.fillRect(17,-3,length-8,3);
      if(equipped.weapon==='crossbow'){c.strokeStyle='#b3d3db';c.lineWidth=3;c.beginPath();c.moveTo(45,-21);c.lineTo(30,0);c.lineTo(45,21);c.stroke();}
      if(equipped.weapon==='grenade')this.rect(22,-9,24,18,5,'#615945','#f5c47e');
      if(equipped.weapon==='lmg')this.rect(20,6,19,14,3,'#34495b','#90a7b3');
      if(equipped.weapon==='shotgun'||equipped.weapon==='doublebarrel'){c.strokeStyle='#a2bfc7';c.lineWidth=2;c.beginPath();c.moveTo(26,-3);c.lineTo(49,-3);c.moveTo(26,3);c.lineTo(49,3);c.stroke();}
      if(equipped.weapon==='revolver')this.rect(21,-8,14,16,5,'#71677c','#b8c7d8');
      if(equipped.weapon==='plasma'){this.rect(18,-7,20,14,5,'#35577c','#79eeff');c.fillStyle='#9bfaff';c.beginPath();c.arc(40,0,5,0,TAU);c.fill();}
      if(equipped.weapon==='flamethrower'){this.rect(14,6,22,20,5,'#d88c44','#443440');this.rect(42,-8,12,16,3,'#8a6257','#e5b775');}
      if(equipped.weapon==='rocket')this.rect(18,-10,49,20,6,'#56794e','#bcdda3');
      if(equipped.weapon==='sniper'||equipped.weapon==='railgun')this.rect(24,-10,13,5,2,'#253e4b','#8aa9b5');
    }else if(!drewSprite){
      c.strokeStyle=rarityOf(equipped.rarity).color;c.lineWidth=equipped.weapon==='greatsword'?7:3;
      c.beginPath();c.moveTo(16,0);c.lineTo(equipped.weapon==='spear'?105:equipped.weapon==='greatsword'?62:equipped.weapon==='warhammer'||equipped.weapon==='battleaxe'?62:41,0);if(equipped.weapon==='dualblades'){c.moveTo(15,12);c.lineTo(40,16);}c.stroke();
      if(equipped.weapon==='spear'){c.beginPath();c.moveTo(105,-6);c.lineTo(120,0);c.lineTo(105,6);c.stroke();}
      if(equipped.weapon==='battleaxe'){c.fillStyle='#bfdae4';c.strokeStyle=rarityOf(equipped.rarity).color;c.lineWidth=2;c.beginPath();c.moveTo(44,-22);c.lineTo(66,-17);c.lineTo(67,18);c.lineTo(44,23);c.lineTo(51,0);c.fill();c.stroke();}
      if(equipped.weapon==='warhammer')this.rect(47,-15,27,30,4,'#586f7c',rarityOf(equipped.rarity).color);
      if(equipped.weapon==='greatsword'){c.strokeStyle='#789aa2';c.lineWidth=3;c.beginPath();c.moveTo(25,-9);c.lineTo(25,9);c.stroke();}
    }c.restore();
    c.fillStyle=tint;c.beginPath();const ax=p.x+p.facingX*32,ay=p.y+p.facingY*32;
    c.moveTo(ax+p.facingX*5,ay+p.facingY*5);c.lineTo(ax-p.facingY*3,ay+p.facingX*3);c.lineTo(ax+p.facingY*3,ay-p.facingX*3);c.fill();
    c.globalAlpha=1;
  }
  drawExitArrow(raid) {
    const c=this.ctx,p=raid.player,exit=[...raid.world.exits].sort((a,b)=>Number(raid.extractionReady(b))-Number(raid.extractionReady(a))||distance(p,a)-distance(p,b))[0];
    if(distance(p,exit)<100)return;
    const x=25,y=this.height-(matchMedia('(pointer: coarse)').matches?290:190);
    c.save();c.translate(x+9,y-3);c.rotate(Math.atan2(exit.y-p.y,exit.x-p.x));c.fillStyle='#bed3df';c.beginPath();c.moveTo(7,0);c.lineTo(-5,-5);c.lineTo(-2,0);c.lineTo(-5,5);c.fill();c.restore();
    this.text(`${exitVehicle(exit).label} · ${raid.extractionReady(exit)?"可撤离":raid.extractionStatus(exit).label} · ${Math.round(distance(p,exit))}`,x+24,y,10,{align:'left'});
  }
  drawMap(raid) {
    const c=this.mctx,w=this.map.width,h=this.map.height,sx=w/this.bounds.width,sy=h/this.bounds.height;
    c.clearRect(0,0,w,h);
    for(const z of this.zones){if(!z.vertices)continue;polygon(c,z.vertices,sx,sy);c.fillStyle=z.floor;c.fill();c.strokeStyle=z.color;c.lineWidth=1;c.stroke();}
    for(const patch of raid.world.terrain||[]){c.fillStyle=(TERRAIN[patch.kind]?.line||'#93734d')+'55';c.fillRect(patch.x*sx,patch.y*sy,patch.w*sx,patch.h*sy);}
    for(const o of raid.world.obstacles){c.fillStyle='#3f315b88';c.fillRect(o.x*sx,o.y*sy,o.w*sx,o.h*sy);}
    for(const site of raid.world.sites||[]){c.fillStyle='#603bc799';c.fillRect(site.x*sx-1,site.y*sy-1,2,2);}
    for(const chest of raid.world.chests)if(!chest.opened){c.fillStyle=chest.keyCard?'#e7bc13':'#c68a00cc';const size=chest.keyCard?5:2;c.fillRect(chest.x*sx-size/2,chest.y*sy-size/2,size,size);if(chest.keyCard)drawComicText(c,'K',chest.x*sx+5,chest.y*sy+3,9,{align:'left'});}
    for(const enemy of raid.world.enemies)if(!enemy.dead&&distance(enemy,raid.player)<Math.min(450,raid.run.vision)){c.fillStyle='#ef228d';c.fillRect(enemy.x*sx-1.5,enemy.y*sy-1.5,3,3);}
    for(const node of raid.world.nodes||[])if(!node.used&&distance(node,raid.player)<2000){c.fillStyle='#7d2ad2';c.fillRect(node.x*sx-1,node.y*sy-1,2,2);}
    for(const e of raid.world.exits){c.save();c.translate(e.x*sx,e.y*sy);c.rotate(Math.PI/4);c.fillStyle=e.safehouse?PAINT.cyan:raid.extractionReady(e)?'#52a80c':'#df8517';c.fillRect(-4,-4,8,8);c.restore();}
    for(const merchant of raid.world.merchants||[]){c.fillStyle='#ffe64d';c.strokeStyle=PAINT.ink;c.lineWidth=1;c.fillRect(merchant.x*sx-3,merchant.y*sy-3,6,6);c.strokeRect(merchant.x*sx-3,merchant.y*sy-3,6,6);}
    for(const boss of raid.world.enemies.filter(e=>e.boss&&!e.dead&&distance(e,raid.player)<raid.run.vision)){c.fillStyle='#ee126c';c.beginPath();c.arc(boss.x*sx,boss.y*sy,4,0,TAU);c.fill();}
    const p=raid.player;c.fillStyle=PAINT.ink;c.beginPath();c.arc(p.x*sx,p.y*sy,4,0,TAU);c.fill();c.fillStyle=PAINT.cyan;c.beginPath();c.arc(p.x*sx,p.y*sy,2.5,0,TAU);c.fill();
    for(const exit of raid.world.exits){
      const vehicle=exitVehicle(exit);
      mapBadge(c,vehicle.short,exit.x*sx,exit.y*sy-12,w,h,raid.extractionReady(exit)?'#e0ffa0':vehicle.color);
    }
    const features=[...(raid.world.nodes||[]).filter(node=>!node.used),
      ...(raid.world.landmarks||[])];
    const near=features.reduce((best,point)=>{
      const gap=distance(point,p);
      return gap < (best?.gap ?? 560) ? {point,gap} : best;
    },null)?.point;
    if(near&&!raid.world.exits.some(exit=>distance(exit,near)<550))
      mapBadge(c,near.name||nodeLabel(near),near.x*sx,near.y*sy+12,w,h,'#e3cafd');
    c.strokeStyle='#30234599';c.lineWidth=.6;c.strokeRect((this.camera.x-this.width/this.scale/2)*sx,(this.camera.y-this.height/this.scale/2)*sy,this.width/this.scale*sx,this.height/this.scale*sy);
  }
}
