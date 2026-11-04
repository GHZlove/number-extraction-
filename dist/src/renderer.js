import { RULES, WORLD, ZONES, ENEMY_TYPES, TERRAIN, PAINT } from './config.js';
import { clamp, distance, tier, zoneAt, firstWallFraction } from './math.js';
import { activeWeapon, weaponOf, spreadOf, rarityOf, ENCHANTS } from './equipment.js';
import { obstaclesFor, terrainFor } from './spatial.js';
import { BOSSES } from './bosses.js';

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
    if(event.type==='hurt')this.shake=Math.max(this.shake,5);
    if(event.type==='parry')this.shake=Math.max(this.shake,4.5);
  }
  resize() {
    this.width=Math.max(1,this.canvas.parentElement.clientWidth);this.height=Math.max(1,this.canvas.parentElement.clientHeight);
    this.dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.round(this.width*this.dpr);this.canvas.height=Math.round(this.height*this.dpr);
    this.scale=clamp(this.width/1500,0.7,1.05);
  }
  screenToWorld(clientX,clientY){
    const rect=this.canvas.getBoundingClientRect();
    return {x:(clientX-rect.left-rect.width/2)/this.scale+this.camera.x,
      y:(clientY-rect.top-rect.height/2)/this.scale+this.camera.y};
  }
  rect(x,y,w,h,r,fill,stroke) {
    const c=this.ctx;c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}
  }
  text(text,x,y,size,color,weight='400',align='center',font='monospace') {
    const c=this.ctx;c.font=`${weight} ${size}px ${font}`;c.fillStyle=color;c.textAlign=align;c.fillText(text,x,y);
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
    this.drawTerrain(w,time);
    for(const cloud of w.hazards||[])if(this.visible(cloud.x,cloud.y,cloud.radius+30)){
      c.fillStyle=cloud.owner==='player'?'#a8f43255':'#a849cf66';c.strokeStyle=cloud.owner==='player'?'#4c8c20':'#9d2eaa';c.lineWidth=2;
      c.beginPath();c.arc(cloud.x,cloud.y,cloud.radius,0,TAU);c.fill();c.stroke();
      this.text(cloud.owner==='player'?'附魔毒雾':'危险毒雾',cloud.x,cloud.y+5,11,PAINT.ink,'800');
    }
    this.drawPaint(w,{left,top,right,bottom});
    // A surveying grid and hand-placed route make the map readable at a glance.
    c.lineWidth=1;
    for(let x=Math.floor(left/48)*48;x<right;x+=48){c.strokeStyle=x%240===0?'#30244d18':'#30244d08';c.beginPath();c.moveTo(x,Math.max(0,top));c.lineTo(x,Math.min(this.bounds.height,bottom));c.stroke();}
    for(let y=Math.floor(top/48)*48;y<bottom;y+=48){c.strokeStyle=y%240===0?'#30244d18':'#30244d08';c.beginPath();c.moveTo(Math.max(0,left),y);c.lineTo(Math.min(this.bounds.width,right),y);c.stroke();}
    for(let i=0;i<170;i++) {
      const x=(i*397+87)%this.bounds.width,y=(i*263+133)%this.bounds.height;if(!this.visible(x,y,20))continue;
      c.fillStyle=['#12b99c44','#b98d1744','#a365c444'][zoneAt({x,y},this.zones).risk];c.fillRect(x,y,3+(i%5)*3,2);c.fillRect(x+4,y+9,2,6);
      if(i%3===0){c.strokeStyle='#624f9c28';c.beginPath();c.arc(x,y,9,0,TAU);c.stroke();}
    }
    c.setLineDash([14,9]);c.lineWidth=3;
    for(const zone of this.zones){if(!zone.vertices)continue;polygon(c,zone.vertices);c.strokeStyle=zone.color+'bb';c.stroke();}
    c.setLineDash([]);c.strokeStyle=PAINT.ink+'77';c.lineWidth=2;c.strokeRect(12,12,this.bounds.width-24,this.bounds.height-24);
    for(const zone of this.zones){if(zone.center&&this.visible(zone.center.x,zone.center.y,350)){
      this.text(`${zone.en} / ${zone.riskLabel}`,zone.center.x,zone.center.y-22,20,zone.color+'99','800');
      this.text(zone.name,zone.center.x,zone.center.y+5,25,PAINT.ink+'45','800','center','sans-serif');
    }}
    c.setLineDash([3,9]);c.strokeStyle='#36274688';c.lineWidth=1;c.beginPath();c.moveTo(260,1060);c.lineTo(655,1060);c.stroke();c.setLineDash([]);
    this.text('ENTRY / 001',245,1120,9,'#362746aa','400','left');
    for(const mark of w.spawnWarnings||[]){
      if(!this.visible(mark.x,mark.y,90))continue;
      const progress=clamp(1-(mark.readyAt-raid.elapsed)/mark.duration,0,1);
      c.fillStyle='#ff42a233';c.strokeStyle=PAINT.pink;c.lineWidth=3;c.beginPath();c.arc(mark.x,mark.y,38,0,TAU);c.fill();c.stroke();
      c.beginPath();c.arc(mark.x,mark.y,38*(1-progress),0,TAU);c.stroke();this.text('!',mark.x,mark.y+7,22,PAINT.ink,'900');
    }
    for(const exit of w.exits)if(this.visible(exit.x,exit.y,140))this.drawExit(exit,raid,time);
    for(const merchant of w.merchants||[])if(this.visible(merchant.x,merchant.y,130)){
      this.rect(merchant.x-28,merchant.y-25,56,48,8,PAINT.yellow,PAINT.ink);this.text('◇',merchant.x,merchant.y+8,28,PAINT.ink,'900');
      this.text(distance(merchant,p)<120?'E · 与商人交易':merchant.name,merchant.x,merchant.y+44,12,PAINT.ink,'800');
    }
    for(const obstacle of obstaclesFor(w,{x:left,y:top},{x:right,y:bottom},20))if(this.rectVisible(obstacle))this.drawObstacle(obstacle);
    for(const chest of w.chests)if(this.visible(chest.x,chest.y))this.drawChest(chest,p,time);
    for(const node of w.nodes||[])if(this.visible(node.x,node.y,140))this.drawNode(node,p,time);
    for(const tile of w.tiles)if(!tile.dead&&this.visible(tile.x,tile.y))this.drawTile(tile,p,time);
    for(const loot of w.drops)if(!loot.dead&&this.visible(loot.x,loot.y))this.drawDrop(loot,p,time);
    for(const enemy of w.enemies)if(!enemy.dead&&enemy.state==='windup'&&this.visible(enemy.x,enemy.y,800))this.drawTelegraph(enemy,time);
    const selected=raid.nearestEnemy(RULES.divideRange,e=>e.value>p.value)||raid.nearestEnemy(RULES.divideRange,e=>e.value>1);
    for(const enemy of w.enemies)if(!enemy.dead&&this.visible(enemy.x,enemy.y))this.drawEnemy(enemy,p,time,enemy===selected);
    for(const bullet of w.projectiles){const color=bullet.blast?PAINT.orange:bullet.owner==='player'?PAINT.cyan:PAINT.pink;c.fillStyle=color;c.beginPath();c.arc(bullet.x,bullet.y,bullet.radius,0,TAU);c.fill();c.strokeStyle=color+'66';c.lineWidth=bullet.owner==='player'?2:4;c.beginPath();c.moveTo(bullet.x,bullet.y);c.lineTo(bullet.x-bullet.vx*.025,bullet.y-bullet.vy*.025);c.stroke();}
    this.drawAim(p,w);
    this.drawPlayer(p,time);
    for(const e of w.effects) {
      const progress=1-e.life/e.maxLife;c.globalAlpha=Math.min(1,e.life/e.maxLife*2);
      if(e.kind==='text'){
        if(e.text==='击破')this.inkSplat(e.x,e.y,38+progress*20,PAINT.pink,.3,Math.min(.75,e.life/e.maxLife));
        const badgeWidth=Math.min(190,Math.max(42,e.text.length*11));
        this.rect(e.x-badgeWidth/2,e.y-progress*25-15,badgeWidth,22,5,PAINT.ink);
        this.text(e.text,e.x+1,e.y-progress*25+1,14,PAINT.ink,'800');
        this.text(e.text,e.x,e.y-progress*25,e.heavy?18:14,e.color,'900');
      }
      else if(e.kind==='lightning'){
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
      else if(e.kind==='slash'){c.strokeStyle=e.color;c.lineWidth=5*(1-progress)+1;c.beginPath();c.arc(e.x,e.y,e.radius*(.8+progress*.2),e.angle-e.arc/2,e.angle+e.arc/2);c.stroke();}
      else if(e.kind==='muzzle'){
        c.save();c.translate(e.x+Math.cos(e.angle)*37,e.y+Math.sin(e.angle)*37);c.rotate(e.angle);c.fillStyle=PAINT.yellow;c.strokeStyle=PAINT.ink;c.lineWidth=1;
        c.beginPath();c.moveTo(-3,-5);c.lineTo(8,-3);c.lineTo(18,0);c.lineTo(8,3);c.lineTo(-3,5);c.lineTo(2,0);c.fill();c.stroke();c.restore();
      }
      else {if(e.kind==='impact')this.inkSplat(e.x,e.y,(e.radius||64)*(.45+progress*.5),PAINT.orange,progress,Math.min(.6,e.life/e.maxLife));c.strokeStyle=e.color;c.lineWidth=e.kind==='impact'?3:2;c.beginPath();c.arc(e.x,e.y,e.kind==='pulse'?22+progress*90:(e.radius||64)*(.8+progress*.2),0,TAU);c.stroke();}
    }
    c.globalAlpha=1;c.restore();
    // Slight edge shading preserves HUD readability without dimming the play space.
    const edge=c.createLinearGradient(0,0,0,this.height);edge.addColorStop(0,'#21153833');edge.addColorStop(.25,'#00000000');edge.addColorStop(.75,'#00000000');edge.addColorStop(1,'#21153822');c.fillStyle=edge;c.fillRect(0,0,this.width,this.height);
    if(raid.carriedValue()>0)this.drawExitArrow(raid);
    if(time-this.lastMapDraw>0.15){this.drawMap(raid);this.lastMapDraw=time;}
  }
  inkSplat(x,y,r,color,angle=0,alpha=1){
    const c=this.ctx;c.save();c.translate(x,y);c.rotate(angle);c.fillStyle=color;c.globalAlpha=alpha;
    c.beginPath();c.arc(0,0,r*.65,0,TAU);c.fill();
    for(let i=0;i<6;i++){
      const a=i*TAU/6,d=r*(i%2?.7:.48);c.beginPath();c.arc(Math.cos(a)*d,Math.sin(a)*d,r*(i%2?.2:.36),0,TAU);c.fill();
    }
    for(const[dx,dy,size]of[[1.05,-.4,.12],[-.8,.9,.16],[.45,1.1,.09]]){c.beginPath();c.arc(dx*r,dy*r,size*r,0,TAU);c.fill();}
    c.restore();
  }
  drawPaint(world,view){
    // Stateless hashes decorate visible cells without consuming the game's RNG.
    const cell=350;
    for(let gx=Math.floor(view.left/cell)-1;gx<=Math.floor(view.right/cell)+1;gx++){
      for(let gy=Math.floor(view.top/cell)-1;gy<=Math.floor(view.bottom/cell)+1;gy++){
        if(gx<0||gy<0||gx*cell>this.bounds.width||gy*cell>this.bounds.height)continue;
        const hash=(Math.imul(gx+17,73856093)^Math.imul(gy+31,19349663)^world.seed)>>>0;
        if(hash%4===0)continue;
        const x=gx*cell+70+hash%190,y=gy*cell+70+(hash>>>8)%190;
        this.inkSplat(x,y,30+(hash>>>16)%60,PAINT.stains[hash%PAINT.stains.length],hash%628/100,.3);
      }
    }
  }
  drawTerrain(world,time){
    const c=this.ctx,hw=this.width/this.scale/2,hh=this.height/this.scale/2;
    const a={x:this.camera.x-hw,y:this.camera.y-hh},b={x:this.camera.x+hw,y:this.camera.y+hh};
    const patches=terrainFor(world,a,b).filter(p=>this.rectVisible(p)).sort((a,b)=>(TERRAIN[a.kind]?.priority||0)-(TERRAIN[b.kind]?.priority||0));
    for(const patch of patches){
      const info=TERRAIN[patch.kind]||TERRAIN.mud,water=patch.kind==='water',bridge=patch.kind==='bridge',road=patch.kind==='road';
      this.rect(patch.x,patch.y,patch.w,patch.h,bridge||road?4:25,info.color+(bridge?'ee':road?'66':'88'),PAINT.ink+'44');
      c.strokeStyle=info.line+'66';c.lineWidth=1;
      if(bridge){
        for(let x=Math.max(patch.x,Math.floor(a.x/22)*22);x<Math.min(patch.x+patch.w,b.x);x+=22){c.beginPath();c.moveTo(x,patch.y+4);c.lineTo(x,patch.y+patch.h-4);c.stroke();}
        c.lineWidth=4;c.strokeRect(patch.x,patch.y,patch.w,patch.h);
      }else if(road){
        c.setLineDash([16,28]);c.beginPath();
        if(patch.w>patch.h){c.moveTo(patch.x,patch.y+patch.h/2);c.lineTo(patch.x+patch.w,patch.y+patch.h/2);}else{c.moveTo(patch.x+patch.w/2,patch.y);c.lineTo(patch.x+patch.w/2,patch.y+patch.h);}c.stroke();c.setLineDash([]);
      }else if(patch.kind==='brush'){
        for(let i=0;i<12;i++){const x=patch.x+18+(i*47)%(patch.w-30),y=patch.y+20+(i*31)%(patch.h-35);c.beginPath();c.arc(x,y,12+i%3*4,0,TAU);c.stroke();}
      }else{
        for(let i=1;i<5;i++){const offset=water&&!this.reduced?Math.sin(time*.7+i)*3:0;c.beginPath();c.moveTo(patch.x+15,patch.y+patch.h*i/5+offset);c.lineTo(patch.x+patch.w-20,patch.y+patch.h*i/5+offset+(patch.kind==='ice'?30:0));c.stroke();}
      }
      if(this.visible(patch.x+patch.w/2,patch.y+patch.h/2,30)&&!road)this.text(info.name+(info.speed<1?' · 减速':info.speed>1?' · 加速':''),patch.x+patch.w/2,patch.y+patch.h/2,10,PAINT.ink+'dd','400','center','sans-serif');
    }
    for(const mark of world.landmarks||[])if(this.visible(mark.x,mark.y))this.text(mark.name,mark.x,mark.y,12,'#493354cc','500','center','sans-serif');
  }
  drawAim(player,world){
    const c=this.ctx,item=activeWeapon(player),weapon=weaponOf(item);
    const laser=!!player.laser;
    const angle=player.aimAngle;
    const far={x:player.x+Math.cos(angle)*weapon.range,y:player.y+Math.sin(angle)*weapon.range};
    const wall=firstWallFraction(player,far,obstaclesFor(world,player,far));
    const length=weapon.range*Math.min(1,wall===Infinity?1:wall);
    c.save();
    if(!laser)c.setLineDash([5,7]);
    c.beginPath();c.moveTo(player.x+Math.cos(angle)*26,player.y+Math.sin(angle)*26);c.lineTo(player.x+Math.cos(angle)*length,player.y+Math.sin(angle)*length);c.strokeStyle=PAINT.ink+'88';c.lineWidth=3.5;c.stroke();c.strokeStyle=laser?'#ff5d65cc':'#ffffff66';c.lineWidth=laser?1.5:1;c.stroke();
    c.setLineDash([]);
    if(weapon.mode==='ranged'){
      c.strokeStyle=laser?'#ff5d6528':'#ffffff13';
      for(const side of [-1,1]){const a=angle+side*spreadOf(item,laser);c.beginPath();c.moveTo(player.x,player.y);c.lineTo(player.x+Math.cos(a)*length,player.y+Math.sin(a)*length);c.stroke();}
    }
    if(player.aimTarget){const point=player.aimTarget;c.beginPath();c.arc(point.x,point.y,6,0,TAU);c.moveTo(point.x-11,point.y);c.lineTo(point.x-5,point.y);c.moveTo(point.x+5,point.y);c.lineTo(point.x+11,point.y);c.moveTo(point.x,point.y-11);c.lineTo(point.x,point.y-5);c.moveTo(point.x,point.y+5);c.lineTo(point.x,point.y+11);c.lineWidth=3.5;c.strokeStyle=PAINT.ink;c.stroke();c.lineWidth=1.5;c.strokeStyle=laser?'#ff737b':'#ffffff';c.stroke();}
    c.restore();
  }
  drawObstacle(o) {
    const c=this.ctx,zone=zoneAt({x:o.x+o.w/2,y:o.y+o.h/2},this.zones).risk;
    if(o.material==='tree'){
      this.rect(o.x+10,o.y+7,13,30,3,'#884f6b');c.fillStyle='#73d78c';c.strokeStyle=PAINT.ink;c.beginPath();c.arc(o.x+17,o.y+8,29,0,TAU);c.fill();c.stroke();return;
    }
    if(o.material==='ridge'||o.material==='rock'){
      this.rect(o.x+4,o.y+7,o.w,o.h,18,'#060d1855');this.rect(o.x,o.y,o.w,o.h,15,o.material==='ridge'?'#9d93c4':'#8aafc1',PAINT.ink);
      c.strokeStyle='#ffffff99';c.beginPath();c.moveTo(o.x+13,o.y+o.h*.3);c.lineTo(o.x+o.w*.6,o.y+13);c.lineTo(o.x+o.w-12,o.y+o.h*.6);c.stroke();return;
    }
    this.rect(o.x+5,o.y+8,o.w,o.h,7,'#05130d45');
    this.rect(o.x,o.y,o.w,o.h,5,['#6ac9c6','#efb955','#bc89dc'][zone],PAINT.ink);
    c.fillStyle=['#b8f7e8','#fff18a','#ffbfe7'][zone];c.fillRect(o.x+7,o.y+7,o.w-14,4);
    c.strokeStyle='#0c20164d';c.beginPath();c.moveTo(o.x+o.w/2,o.y+15);c.lineTo(o.x+o.w/2,o.y+o.h-8);c.stroke();
    for(const [x,y] of [[o.x+8,o.y+15],[o.x+o.w-9,o.y+15],[o.x+8,o.y+o.h-9],[o.x+o.w-9,o.y+o.h-9]]){c.fillStyle='#fffbea99';c.fillRect(x,y,2,2);}
    if(o.material==='container'){for(let x=o.x+12;x<o.x+o.w-6;x+=14){c.strokeStyle='#34274688';c.beginPath();c.moveTo(x,o.y+10);c.lineTo(x,o.y+o.h-8);c.stroke();}}
    if(o.w>90)this.text(o.material==='barricade'?'掩体':'B—'+Math.floor(o.x/50),o.x+10,o.y+o.h-12,8,'#31223dcc','400','left');
  }
  drawExit(e,raid,time) {
    const c=this.ctx,active=distance(e,raid.player)<e.radius,phase=this.reduced?0:time,ready=raid.extractionReady(e),bossLocked=!!e.bossId&&raid.world.enemies.some(b=>b.id===e.bossId&&!b.dead);
    if(e.safehouse){
      c.fillStyle='#21dfd32b';c.strokeStyle=PAINT.cyan;c.lineWidth=3;c.beginPath();c.arc(e.x,e.y,e.safetyRadius,0,TAU);c.fill();c.stroke();
      this.rect(e.x-60,e.y-48,120,92,14,'#d9fff044',PAINT.ink);this.text('安全屋 / SAFE',e.x,e.y-e.safetyRadius-40,14,PAINT.ink,'900');
    }
    c.fillStyle='#b7ff3b33';c.beginPath();c.arc(e.x,e.y,e.radius+22,0,TAU);c.fill();
    c.strokeStyle=ready?(active?PAINT.lime:'#408b27dd'):PAINT.orange;c.lineWidth=active?2.5:1.5;
    c.setLineDash([9,7]);c.lineDashOffset=-phase*10;c.beginPath();c.arc(e.x,e.y,e.radius,0,TAU);c.stroke();c.setLineDash([]);c.lineDashOffset=0;
    c.strokeStyle='#3f822877';c.lineWidth=1;c.beginPath();c.arc(e.x,e.y,e.radius-10,0,TAU);c.stroke();
    this.rect(e.x-22,e.y-25,44,44,5,ready?PAINT.lime:PAINT.orange,PAINT.ink);
    this.text('↑',e.x,e.y+5,28,PAINT.ink);this.text(e.label,e.x,e.y+40,9,PAINT.ink);
    this.text(e.name,e.x,e.y-e.radius-20,13,PAINT.ink,'500','center','sans-serif');
    if(active)this.text(bossLocked?'击败首领，解除封锁':ready?'静止 · 按住 E 4 秒':`撤离校准 · ${Math.max(0,Math.ceil(raid.difficulty.extractAt-raid.elapsed))} 秒`,e.x,e.y+e.radius+25,11,'#234e19','400','center','sans-serif');
    for(const [x,y] of [[-1,-1],[1,-1],[-1,1],[1,1]])this.rect(e.x+x*82-3,e.y+y*82-3,6,6,1,PAINT.lime);
  }
  drawChest(chest,p,time) {
    const c=this.ctx;const color=[PAINT.lime,PAINT.yellow,PAINT.pink][chest.zone];
    if(chest.opened){this.rect(chest.x-15,chest.y-12,30,24,4,'#a4a2ac',PAINT.ink);this.text('空',chest.x,chest.y+4,10,'#4d435f','400','center','sans-serif');return;}
    const near=distance(p,chest)<80;
    c.shadowColor=color+'40';c.shadowBlur=near?15:0;
    this.rect(chest.x-19,chest.y-15,38,30,5,color,PAINT.ink);c.shadowBlur=0;
    c.fillStyle='#fffbee99';c.fillRect(chest.x-15,chest.y-9,30,4);c.fillStyle=PAINT.ink;c.fillRect(chest.x-3,chest.y-5,6,13);
    this.text(near?(chest.armory?'按住 E 开装备箱':'按住 E 搜索'):(chest.armory?'装备补给箱':'补给箱'),chest.x,chest.y+36,near?11:9,PAINT.ink,'400','center','sans-serif');
  }
  drawNode(node,p,time){
    const c=this.ctx,colors={fury:PAINT.orange,phase:PAINT.cyan,magnet:PAINT.purple},labels={fury:'增幅节点',phase:'相位节点',magnet:'牵引节点'};
    const color=node.used?'#858092':colors[node.kind],phase=this.reduced?0:Math.sin(time*2)*4;
    c.save();c.translate(node.x,node.y);
    if(!node.used){c.strokeStyle=color+'44';c.lineWidth=1;c.beginPath();c.arc(0,0,42+phase,0,TAU);c.stroke();}
    c.rotate(Math.PI/4);this.rect(-19,-19,38,38,5,color,PAINT.ink);this.rect(-8,-8,16,16,2,node.used?'#645c75':PAINT.paper);c.restore();
    this.text(node.used?'节点已使用':distance(p,node)<100?'E · '+labels[node.kind]:labels[node.kind],node.x,node.y+63,11,PAINT.ink,'400','center','sans-serif');
  }
  drawDrop(item,p,time){
    const c=this.ctx,gear=item.kind&&item.kind!=='loot',color=gear?rarityOf(item.rarity).color:PAINT.yellow;
    const y=item.y+(this.reduced?0:Math.sin(time*2+item.x)*2);
    c.save();c.translate(item.x,y);
    if(gear){
      this.rect(-16,-13,32,26,5,PAINT.ink,color);
      this.text(item.kind==='weapon'?weaponOf(item).short:item.kind==='armor'?'▱':'⊕',0,4,item.kind==='weapon'?9:18,color,'600');
    }else{c.rotate(Math.PI/4);this.rect(-8,-8,16,16,2,color,PAINT.ink);}
    c.restore();
    this.text(gear?(distance(p,item)<80?'F · '+item.name:rarityOf(item.rarity).name+'品装备'):`${item.value}◇`,item.x,y+30,gear?10:9,PAINT.ink,'400','center','sans-serif');
  }
  drawTile(tile,p,time) {
    const c=this.ctx,equal=tile.value===p.value&&p.value<RULES.maxValue,s=equal?34:29;
    const y=tile.y+(this.reduced?0:Math.sin(time*2.5+tile.x)*2);
    if(equal){c.shadowColor='#c6ff4599';c.shadowBlur=18;c.strokeStyle='#559b1e88';c.lineWidth=1;c.beginPath();c.arc(tile.x,y,28,0,TAU);c.stroke();}
    this.rect(tile.x-s/2,y-s/2,s,s,5,equal?PAINT.lime:PAINT.paper,PAINT.ink);c.shadowBlur=0;
    this.text(String(tile.value),tile.x,y+6,tile.value>99?13:17,PAINT.ink,'600');
    if(equal&&distance(p,tile)<155)this.text('同数合成',tile.x,y-30,10,'#365b22','400','center','sans-serif');
  }
  drawTelegraph(e,time) {
    const c=this.ctx,definition=ENEMY_TYPES[e.type]||ENEMY_TYPES.hunter;
    if(e.boss){this.drawBossTelegraph(e);return;}
    const progress=clamp(1-e.timer/(e.windup||definition.windup),0,1),angle=Math.atan2(e.aimY-e.y,e.aimX-e.x);
    c.lineWidth=2;c.strokeStyle=definition.pattern==='snipe'?'#ee005fff':'#e94009ff';c.fillStyle=`rgba(255,72,60,${0.13+progress*.2})`;
    if(['strike','blast','slam'].includes(definition.pattern)){
      const radius=definition.pattern==='slam'?175:definition.pattern==='blast'?118:64;
      c.beginPath();c.arc(e.aimX,e.aimY,radius,0,TAU);c.fill();c.stroke();c.beginPath();c.arc(e.aimX,e.aimY,radius*(1-progress),0,TAU);c.stroke();this.text(definition.pattern==='blast'?'爆':'!',e.aimX,e.aimY+6,20,'#9b1936','600','center','sans-serif');
    }else if(['heal','summon','ring'].includes(definition.pattern)){
      const support=definition.pattern==='heal',x=support?e.aimX:e.x,y=support?e.aimY:e.y,r=support?60:definition.pattern==='summon'?110:150;
      c.strokeStyle=support?'#008b70':'#8310d2';c.beginPath();c.arc(x,y,r,0,TAU);c.stroke();c.beginPath();c.arc(x,y,r*(1-progress),0,TAU);c.stroke();
      this.text(support?'+':definition.pattern==='summon'?'孵化':'环射',x,y+5,14,support?'#008b70':'#8310d2','600','center','sans-serif');
    }else if(definition.pattern==='charge'){
      c.save();c.translate(e.x,e.y);c.rotate(angle);c.fillStyle='#ff5a4b44';c.fillRect(0,-24,350,48);c.setLineDash([8,6]);c.strokeRect(0,-24,350,48);c.restore();
    }else{
      const offsets=definition.pattern==='fan'?[-.24,0,.24]:[0];c.setLineDash([6,6]);
      for(const offset of offsets){c.beginPath();c.moveTo(e.x,e.y);c.lineTo(e.x+Math.cos(angle+offset)*definition.range,e.y+Math.sin(angle+offset)*definition.range);c.stroke();}c.setLineDash([]);
    }
  }
  drawBossTelegraph(e){
    const c=this.ctx,progress=clamp(1-e.timer/e.windup,0,1),a=Math.atan2(e.aimY-e.y,e.aimX-e.x);
    c.lineWidth=3;c.strokeStyle='#e92c57';c.fillStyle='#ff406733';
    if(['slam','poison'].includes(e.bossMove)){
      const r=e.bossMove==='poison'?205:e.bossPhase===2?220:175;
      c.beginPath();c.arc(e.aimX,e.aimY,r,0,TAU);c.fill();c.stroke();c.beginPath();c.arc(e.aimX,e.aimY,r*(1-progress),0,TAU);c.stroke();
      this.text(e.bossMove==='poison'?'毒雾 · 离开红圈':'震地 · 闪避 / 弹反',e.aimX,e.aimY,12,PAINT.ink,'900');
    }else if(e.bossMove==='dash'){
      c.save();c.translate(e.x,e.y);c.rotate(a);c.fillRect(0,-48,430,96);c.strokeRect(0,-48,430,96);c.restore();
    }else{
      c.setLineDash([8,7]);
      const count=e.bossMove==='ring'?12:e.bossMove==='fan'?7:3;
      for(let i=0;i<count;i++){const angle=a+(e.bossMove==='ring'?i*TAU/count:(i-(count-1)/2)*.14);c.beginPath();c.moveTo(e.x,e.y);c.lineTo(e.x+Math.cos(angle)*450,e.y+Math.sin(angle)*450);c.stroke();}c.setLineDash([]);
    }
  }
  drawEnemy(e,p,time,selected) {
    const c=this.ctx,strong=e.value>p.value,s=(e.radius||21)*2-1;
    const fills={hunter:PAINT.orange,scout:PAINT.pink,brute:PAINT.purple,sentry:'#ffbf42',gunner:'#fd70b3',charger:'#ff795b',bomber:PAINT.yellow,sniper:'#ab79ff',skirmisher:'#ea69ed',medic:'#65e398',summoner:'#b895ff',orbiter:'#ff9e4a'};
    const fill=fills[e.type]||PAINT.pink,stroke=PAINT.ink;
    const flash=this.reduced?0:clamp((e.hitFlash||0)/.105,0,1),sw=s*(1+flash*.13),sh=s*(1-flash*.1);
    c.lineWidth=3;this.rect(e.x-s/2+4,e.y-s/2+6,s,s,8,'#241b3a55');
    this.rect(e.x-sw/2,e.y-sh/2,sw,sh,8,flash>.25?'#fffefa':e.stun>0?'#d8c0ff':fill,stroke);
    c.fillStyle='#ffffff88';c.fillRect(e.x-14,e.y-15,28,4);
    this.text(String(e.value),e.x,e.y+7,e.value>=100?16:21,PAINT.ink,'900');
    const definition=ENEMY_TYPES[e.type]||ENEMY_TYPES.hunter;
    if(strong){this.rect(e.x-29,e.y-s/2-27,58,16,3,PAINT.ink);}
    this.text((e.state==='windup'?'! ':'')+(e.bossName||definition.name),e.x,e.y-s/2-14,10,strong?PAINT.paper:PAINT.ink,'700','center','sans-serif');
    if(e.boss){
      c.strokeStyle=BOSSES[e.boss].color;c.lineWidth=4;c.strokeRect(e.x-s/2-6,e.y-s/2-6,s+12,s+12);
      this.rect(e.x-75,e.y-s/2-52,150,10,4,PAINT.ink);this.rect(e.x-75,e.y-s/2-52,150*e.hp/e.maxHp,10,4,BOSSES[e.boss].color);
      this.text(`BOSS / 阶段 ${e.bossPhase}`,e.x,e.y+s/2+48,12,PAINT.ink,'900');
    }
    if(e.poisoned>0)this.text('毒',e.x+s/2+12,e.y-16,14,'#467b12','900');
    if(definition.glyph)this.text(definition.glyph,e.x+s/2+12,e.y+5,16,PAINT.ink,'900');
    if(definition.speed)this.text(`${Math.round(e.chaseSpeed??definition.speed*(e.moveScale||1))}速`,e.x,e.y+s/2+27,8,'#423753cc','500','center','sans-serif');
    if(['sentry','gunner','sniper'].includes(e.type)){c.fillStyle=stroke;c.fillRect(e.x-3,e.y-28,6,10);}
    if(e.armor?.durability>0){this.rect(e.x-20,e.y+36,40,3,1,'#142c3f');this.rect(e.x-20,e.y+36,40*e.armor.durability/e.armor.maxDurability,3,1,'#25bdff');}
    if(e.hp<e.maxHp){this.rect(e.x-20,e.y+30,40,3,1,'#0f1c16');this.rect(e.x-20,e.y+30,40*e.hp/e.maxHp,3,1,PAINT.pink);}
    if(e.stun>0)this.text('眩晕',e.x,e.y-42,12,'#681eb8');
    if(selected){c.strokeStyle='#7021cbbb';c.lineWidth=1;for(const [sx,sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){c.beginPath();c.moveTo(e.x+sx*30,e.y+sy*20);c.lineTo(e.x+sx*30,e.y+sy*30);c.lineTo(e.x+sx*20,e.y+sy*30);c.stroke();}}
  }
  drawPlayer(p,time) {
    const c=this.ctx,t=tier(p.value),size=40;
    if(p.parryWindow>0){c.strokeStyle='#e9fdff';c.lineWidth=7;c.beginPath();c.arc(p.x,p.y,48,p.aimAngle-1.42,p.aimAngle+1.42);c.stroke();}
    if(p.overload>0||p.energy>=100){c.strokeStyle=p.overload>0?'#edcf8bbb':'#edcf8b55';c.lineWidth=2;c.beginPath();c.arc(p.x,p.y,34+(this.reduced?0:Math.sin(time*6)*2),0,TAU);c.stroke();}
    if(p.buffs.phase>0){c.strokeStyle='#8bbcf488';c.lineWidth=2;c.beginPath();c.arc(p.x,p.y,42,0,TAU);c.stroke();}
    if(p.buffs.magnet>0){c.strokeStyle='#c1a5f025';c.lineWidth=1;c.beginPath();c.arc(p.x,p.y,135,0,TAU);c.stroke();}const tint=t>=6?PAINT.yellow:t>=3?PAINT.lime:PAINT.cyan;
    if(p.invulnerable>0&&Math.floor(time*16)%2===0&&!this.reduced)c.globalAlpha=.55;
    if(p.dashTime>0){this.rect(p.x-20-p.dashX*22,p.y-20-p.dashY*22,40,40,7,tint+'44');}
    c.shadowColor=tint+'55';c.shadowBlur=20;c.lineWidth=3;this.rect(p.x-size/2+3,p.y-size/2+5,size,size,9,'#241b3a66');this.rect(p.x-size/2,p.y-size/2,size,size,9,tint,PAINT.ink);c.shadowBlur=0;
    if(t>=4){c.strokeStyle=tint+'66';c.lineWidth=1;c.strokeRect(p.x-25,p.y-25,50,50);}
    this.text(String(p.value),p.x,p.y+8,p.value>=1000?13:p.value>=100?17:24,PAINT.ink,'600');
    this.text('YOU',p.x,p.y-33,10,PAINT.ink,'900');
    const equipped=activeWeapon(p),weapon=weaponOf(equipped);c.save();c.translate(p.x,p.y);
    const kick=clamp((p.recoil||0)/(p.recoilMax||.1),0,1);c.rotate(p.aimAngle+(weapon.mode==='melee'?Math.sin(kick*Math.PI)*.5:0));
    c.translate(-kick*(weapon.mode==='ranged'?8:2),0);
    if(weapon.mode==='ranged'){
      const length={pistol:20,smg:25,rifle:33,sniper:44,shotgun:31,railgun:48,carbine:32,lmg:40,crossbow:34,grenade:26}[equipped.weapon]||25;
      this.rect(14,-5,length,10,2,'#302541',rarityOf(equipped.rarity).color);
      c.fillStyle=equipped.enchant&&equipped.enchant!=='none'?ENCHANTS[equipped.enchant].color:equipped.weapon==='railgun'?PAINT.cyan:'#ff7bc0';c.fillRect(17,-3,length-8,3);
      if(equipped.weapon==='crossbow'){c.strokeStyle='#b3d3db';c.lineWidth=3;c.beginPath();c.moveTo(45,-21);c.lineTo(30,0);c.lineTo(45,21);c.stroke();}
      if(equipped.weapon==='grenade')this.rect(22,-9,24,18,5,'#615945','#f5c47e');
      if(equipped.weapon==='lmg')this.rect(20,6,19,14,3,'#34495b','#90a7b3');
      if(equipped.weapon==='shotgun'){c.strokeStyle='#a2bfc7';c.lineWidth=2;c.beginPath();c.moveTo(26,-3);c.lineTo(49,-3);c.moveTo(26,3);c.lineTo(49,3);c.stroke();}
      if(equipped.weapon==='sniper'||equipped.weapon==='railgun')this.rect(24,-10,13,5,2,'#253e4b','#8aa9b5');
    }else{
      c.strokeStyle=rarityOf(equipped.rarity).color;c.lineWidth=equipped.weapon==='greatsword'?7:3;
      c.beginPath();c.moveTo(16,0);c.lineTo(equipped.weapon==='spear'?105:equipped.weapon==='greatsword'?62:equipped.weapon==='warhammer'?62:41,0);if(equipped.weapon==='dualblades'){c.moveTo(15,12);c.lineTo(40,16);}c.stroke();
      if(equipped.weapon==='spear'){c.beginPath();c.moveTo(105,-6);c.lineTo(120,0);c.lineTo(105,6);c.stroke();}
      if(equipped.weapon==='warhammer')this.rect(47,-15,27,30,4,'#586f7c',rarityOf(equipped.rarity).color);
      if(equipped.weapon==='greatsword'){c.strokeStyle='#789aa2';c.lineWidth=3;c.beginPath();c.moveTo(25,-9);c.lineTo(25,9);c.stroke();}
    }c.restore();
    c.fillStyle=tint;c.beginPath();const ax=p.x+p.facingX*32,ay=p.y+p.facingY*32;
    c.moveTo(ax+p.facingX*5,ay+p.facingY*5);c.lineTo(ax-p.facingY*3,ay+p.facingX*3);c.lineTo(ax+p.facingY*3,ay-p.facingX*3);c.fill();
    c.globalAlpha=1;
  }
  drawExitArrow(raid) {
    const c=this.ctx,p=raid.player,exit=[...raid.world.exits].sort((a,b)=>distance(p,a)-distance(p,b))[0];
    if(distance(p,exit)<100)return;
    const x=25,y=this.height-(matchMedia('(pointer: coarse)').matches?245:155);
    c.save();c.translate(x+9,y-3);c.rotate(Math.atan2(exit.y-p.y,exit.x-p.x));c.fillStyle=PAINT.ink;c.beginPath();c.moveTo(7,0);c.lineTo(-5,-5);c.lineTo(-2,0);c.lineTo(-5,5);c.fill();c.restore();
    this.text(`${exit.name} · 距离 ${Math.round(distance(p,exit))}`,x+24,y,9,PAINT.ink,'400','left','sans-serif');
  }
  drawMap(raid) {
    const c=this.mctx,w=this.map.width,h=this.map.height,sx=w/this.bounds.width,sy=h/this.bounds.height;
    c.clearRect(0,0,w,h);
    for(const z of this.zones){if(!z.vertices)continue;polygon(c,z.vertices,sx,sy);c.fillStyle=z.floor;c.fill();c.strokeStyle=z.color;c.lineWidth=1;c.stroke();}
    for(const patch of raid.world.terrain||[]){c.fillStyle=(TERRAIN[patch.kind]?.line||'#93734d')+'55';c.fillRect(patch.x*sx,patch.y*sy,patch.w*sx,patch.h*sy);}
    for(const o of raid.world.obstacles){c.fillStyle='#3f315b88';c.fillRect(o.x*sx,o.y*sy,o.w*sx,o.h*sy);}
    for(const site of raid.world.sites||[]){c.fillStyle='#603bc799';c.fillRect(site.x*sx-1,site.y*sy-1,2,2);}
    for(const chest of raid.world.chests)if(!chest.opened){c.fillStyle='#c68a00cc';c.fillRect(chest.x*sx-1,chest.y*sy-1,2,2);}
    for(const enemy of raid.world.enemies)if(!enemy.dead&&distance(enemy,raid.player)<450){c.fillStyle='#ef228d';c.fillRect(enemy.x*sx-1.5,enemy.y*sy-1.5,3,3);}
    for(const node of raid.world.nodes||[])if(!node.used&&distance(node,raid.player)<2000){c.fillStyle='#7d2ad2';c.fillRect(node.x*sx-1,node.y*sy-1,2,2);}
    for(const e of raid.world.exits){c.save();c.translate(e.x*sx,e.y*sy);c.rotate(Math.PI/4);c.fillStyle=e.safehouse?PAINT.cyan:raid.extractionReady(e)?'#52a80c':'#df8517';c.fillRect(-4,-4,8,8);c.restore();}
    for(const merchant of raid.world.merchants||[]){c.fillStyle='#ffe64d';c.strokeStyle=PAINT.ink;c.lineWidth=1;c.fillRect(merchant.x*sx-3,merchant.y*sy-3,6,6);c.strokeRect(merchant.x*sx-3,merchant.y*sy-3,6,6);}
    for(const boss of raid.world.enemies.filter(e=>e.boss&&!e.dead)){c.fillStyle='#ee126c';c.beginPath();c.arc(boss.x*sx,boss.y*sy,4,0,TAU);c.fill();}
    const p=raid.player;c.fillStyle=PAINT.ink;c.beginPath();c.arc(p.x*sx,p.y*sy,4,0,TAU);c.fill();c.fillStyle=PAINT.cyan;c.beginPath();c.arc(p.x*sx,p.y*sy,2.5,0,TAU);c.fill();
    c.strokeStyle='#30234599';c.lineWidth=.6;c.strokeRect((this.camera.x-this.width/this.scale/2)*sx,(this.camera.y-this.height/this.scale/2)*sy,this.width/this.scale*sx,this.height/this.scale*sy);
  }
}
