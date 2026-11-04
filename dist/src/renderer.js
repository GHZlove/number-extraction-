import { RULES, WORLD, ZONES, ENEMY_TYPES } from './config.js';
import { clamp, distance, tier, zoneAt, firstWallFraction } from './math.js';
import { activeWeapon, weaponOf, spreadOf, rarityOf } from './equipment.js';
import { obstaclesFor } from './spatial.js';

const TAU=Math.PI*2;
export class Renderer {
  constructor(canvas,minimap) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.map=minimap;this.mctx=minimap.getContext('2d');
    this.width=1;this.height=1;this.scale=1;this.camera={x:300,y:1060};this.shake=0;this.bounds=WORLD;this.zones=ZONES;this.lastMapDraw=-Infinity;
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas.parentElement);this.resize();
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
  draw(raid,time,dt=0.016) {
    if(!raid)return;
    const c=this.ctx,p=raid.player,w=raid.world;this.bounds=w.bounds||WORLD;this.zones=w.zones||ZONES;
    const halfW=this.width/this.scale/2,halfH=this.height/this.scale/2;
    const follow=this.reduced?1:1-Math.exp(-dt*12);
    this.camera.x+=(clamp(p.x,halfW,this.bounds.width-halfW)-this.camera.x)*follow;
    this.camera.y+=(clamp(p.y,halfH,this.bounds.height-halfH)-this.camera.y)*follow;
    this.shake=Math.max(0,this.shake-dt*20);
    c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,this.width,this.height);c.fillStyle='#101b24';c.fillRect(0,0,this.width,this.height);
    c.save();c.translate(this.width/2+(this.reduced?0:Math.sin(time*90)*this.shake),this.height/2);c.scale(this.scale,this.scale);c.translate(-this.camera.x,-this.camera.y);
    const left=this.camera.x-halfW,top=this.camera.y-halfH,right=left+2*halfW,bottom=top+2*halfH;
    for(const zone of this.zones){c.fillStyle=['#14232b','#29282b','#2d202b'][zone.id];c.fillRect(zone.from,0,zone.to-zone.from,this.bounds.height);}
    this.drawTerrain(w,time);
    // A surveying grid and hand-placed route make the map readable at a glance.
    c.lineWidth=1;
    for(let x=Math.floor(left/48)*48;x<right;x+=48){c.strokeStyle=x%240===0?'#779e7820':'#83a4820c';c.beginPath();c.moveTo(x,Math.max(0,top));c.lineTo(x,Math.min(this.bounds.height,bottom));c.stroke();}
    for(let y=Math.floor(top/48)*48;y<bottom;y+=48){c.strokeStyle=y%240===0?'#779e7820':'#83a4820c';c.beginPath();c.moveTo(Math.max(0,left),y);c.lineTo(Math.min(this.bounds.width,right),y);c.stroke();}
    for(let i=0;i<170;i++) {
      const x=(i*397+87)%this.bounds.width,y=(i*263+133)%this.bounds.height;if(!this.visible(x,y,20))continue;
      c.fillStyle=['#66826518','#9d82541a','#9964501a'][zoneAt(x,this.zones).id];c.fillRect(x,y,3+(i%5)*3,2);c.fillRect(x+4,y+9,2,6);
      if(i%3===0){c.strokeStyle='#7c9d7920';c.beginPath();c.arc(x,y,9,0,TAU);c.stroke();}
    }
    for(const x of [this.zones[0].to,this.zones[1].to]){c.setLineDash([7,13]);c.strokeStyle=x===this.zones[0].to?'#dfb56c50':'#e5917b50';c.beginPath();c.moveTo(x,0);c.lineTo(x,this.bounds.height);c.stroke();c.setLineDash([]);}
    c.strokeStyle='#8aac8230';c.lineWidth=2;c.strokeRect(12,12,this.bounds.width-24,this.bounds.height-24);
    for(const zone of this.zones){if(this.visible(zone.from+250,850,400)){this.text(`0${zone.id+1} / ${zone.en}`,zone.from+100,820,20,zone.color+'25','500','left');this.text('NO SIGNAL BEYOND THE BORDER',zone.from+100,841,8,zone.color+'20','400','left');}}
    c.setLineDash([3,9]);c.strokeStyle='#b2c79e38';c.lineWidth=1;c.beginPath();c.moveTo(260,1060);c.lineTo(655,1060);c.stroke();c.setLineDash([]);
    this.text('ENTRY / 001',245,1120,9,'#8eb2996b','400','left');
    for(const exit of w.exits)if(this.visible(exit.x,exit.y,140))this.drawExit(exit,raid,time);
    for(const obstacle of w.obstacles)if(this.visible(obstacle.x,obstacle.y,180))this.drawObstacle(obstacle);
    for(const chest of w.chests)if(this.visible(chest.x,chest.y))this.drawChest(chest,p,time);
    for(const node of w.nodes||[])if(this.visible(node.x,node.y,140))this.drawNode(node,p,time);
    for(const tile of w.tiles)if(!tile.dead&&this.visible(tile.x,tile.y))this.drawTile(tile,p,time);
    for(const loot of w.drops)if(!loot.dead&&this.visible(loot.x,loot.y))this.drawDrop(loot,p,time);
    for(const enemy of w.enemies)if(!enemy.dead&&enemy.state==='windup')this.drawTelegraph(enemy,time);
    const selected=raid.nearestEnemy(RULES.divideRange,e=>e.value>p.value)||raid.nearestEnemy(RULES.divideRange,e=>e.value>1);
    for(const enemy of w.enemies)if(!enemy.dead&&this.visible(enemy.x,enemy.y))this.drawEnemy(enemy,p,time,enemy===selected);
    for(const bullet of w.projectiles){const color=bullet.owner==='player'?'#d6f8dd':'#ffad88';c.fillStyle=color;c.beginPath();c.arc(bullet.x,bullet.y,bullet.radius,0,TAU);c.fill();c.strokeStyle=color+'66';c.lineWidth=bullet.owner==='player'?2:4;c.beginPath();c.moveTo(bullet.x,bullet.y);c.lineTo(bullet.x-bullet.vx*.025,bullet.y-bullet.vy*.025);c.stroke();}
    this.drawAim(p,w);
    this.drawPlayer(p,time);
    for(const e of w.effects) {
      const progress=1-e.life/e.maxLife;c.globalAlpha=Math.min(1,e.life/e.maxLife*2);
      if(e.kind==='text')this.text(e.text,e.x,e.y-progress*25,14,e.color,'600');
      else if(e.kind==='slash'){c.strokeStyle=e.color;c.lineWidth=5*(1-progress)+1;c.beginPath();c.arc(e.x,e.y,e.radius*(.8+progress*.2),e.angle-e.arc/2,e.angle+e.arc/2);c.stroke();}
      else if(e.kind==='muzzle'){c.fillStyle=e.color;c.beginPath();c.arc(e.x+Math.cos(e.angle)*29,e.y+Math.sin(e.angle)*29,5,0,TAU);c.fill();}
      else {c.strokeStyle=e.color;c.lineWidth=e.kind==='impact'?3:2;c.beginPath();c.arc(e.x,e.y,e.kind==='pulse'?22+progress*90:(e.radius||64)*(.8+progress*.2),0,TAU);c.stroke();}
    }
    c.globalAlpha=1;c.restore();
    // Slight edge shading preserves HUD readability without dimming the play space.
    const edge=c.createLinearGradient(0,0,0,this.height);edge.addColorStop(0,'#06110d44');edge.addColorStop(.25,'#00000000');edge.addColorStop(.75,'#00000000');edge.addColorStop(1,'#06110d33');c.fillStyle=edge;c.fillRect(0,0,this.width,this.height);
    if(raid.carriedValue()>0)this.drawExitArrow(raid);
    if(time-this.lastMapDraw>0.15){this.drawMap(raid);this.lastMapDraw=time;}
  }
  drawTerrain(world,time){
    const c=this.ctx;
    for(const road of world.roads||[]){this.rect(road.x,road.y,road.w,road.h,12,'#a9b49a0b');}
    for(const patch of world.terrain||[]){
      if(!this.visible(patch.x+patch.w/2,patch.y+patch.h/2,300))continue;
      const water=patch.kind==='water';
      this.rect(patch.x,patch.y,patch.w,patch.h,Math.min(25,patch.h/3),water?'#294e526b':'#5d493855',water?'#71a9ad45':'#947d5940');
      c.strokeStyle=water?'#8bbecb33':'#b29d6e22';c.lineWidth=1;
      for(let i=1;i<5;i++){const offset=this.reduced?0:Math.sin(time*.7+i)*3;c.beginPath();c.moveTo(patch.x+15,patch.y+patch.h*i/5+offset);c.lineTo(patch.x+patch.w-20,patch.y+patch.h*i/5+offset);c.stroke();}
      this.text(water?'浅水 · 减速':'泥地 · 减速',patch.x+patch.w/2,patch.y+patch.h/2,9,water?'#8abbbd88':'#c8b08a77','400','center','sans-serif');
    }
    for(const mark of world.landmarks||[])if(this.visible(mark.x,mark.y))this.text(mark.name,mark.x,mark.y,10,'#c9c3a133','400','center','sans-serif');
  }
  drawAim(player,world){
    const c=this.ctx,item=activeWeapon(player),weapon=weaponOf(item);
    const laser=!!player.laser;
    const angle=player.aimAngle;
    const far={x:player.x+Math.cos(angle)*weapon.range,y:player.y+Math.sin(angle)*weapon.range};
    const wall=firstWallFraction(player,far,obstaclesFor(world,player,far));
    const length=weapon.range*Math.min(1,wall===Infinity?1:wall);
    c.save();c.strokeStyle=laser?'#ff5d65cc':'#ffffff66';c.lineWidth=laser?1.5:1;
    if(!laser)c.setLineDash([5,7]);
    c.beginPath();c.moveTo(player.x+Math.cos(angle)*26,player.y+Math.sin(angle)*26);c.lineTo(player.x+Math.cos(angle)*length,player.y+Math.sin(angle)*length);c.stroke();
    c.setLineDash([]);
    if(weapon.mode==='ranged'){
      c.strokeStyle=laser?'#ff5d6528':'#ffffff13';
      for(const side of [-1,1]){const a=angle+side*spreadOf(item,laser);c.beginPath();c.moveTo(player.x,player.y);c.lineTo(player.x+Math.cos(a)*length,player.y+Math.sin(a)*length);c.stroke();}
    }
    if(player.aimTarget){const point=player.aimTarget;c.strokeStyle=laser?'#ff737b':'#e8eee8';c.beginPath();c.arc(point.x,point.y,6,0,TAU);c.moveTo(point.x-11,point.y);c.lineTo(point.x-5,point.y);c.moveTo(point.x+5,point.y);c.lineTo(point.x+11,point.y);c.moveTo(point.x,point.y-11);c.lineTo(point.x,point.y-5);c.moveTo(point.x,point.y+5);c.lineTo(point.x,point.y+11);c.stroke();}
    c.restore();
  }
  drawObstacle(o) {
    const c=this.ctx,zone=zoneAt(o.x,this.zones).id;
    this.rect(o.x+5,o.y+8,o.w,o.h,7,'#05130d45');
    this.rect(o.x,o.y,o.w,o.h,5,['#293d45','#3a3b3c','#433640'][zone],['#53674c','#6b6344','#705144'][zone]);
    c.fillStyle=['#496343','#5a5839','#604539'][zone];c.fillRect(o.x+7,o.y+7,o.w-14,4);
    c.strokeStyle='#0c20164d';c.beginPath();c.moveTo(o.x+o.w/2,o.y+15);c.lineTo(o.x+o.w/2,o.y+o.h-8);c.stroke();
    for(const [x,y] of [[o.x+8,o.y+15],[o.x+o.w-9,o.y+15],[o.x+8,o.y+o.h-9],[o.x+o.w-9,o.y+o.h-9]]){c.fillStyle='#b4ba8b40';c.fillRect(x,y,2,2);}
    if(o.material==='container'){for(let x=o.x+12;x<o.x+o.w-6;x+=14){c.strokeStyle='#b4be9155';c.beginPath();c.moveTo(x,o.y+10);c.lineTo(x,o.y+o.h-8);c.stroke();}}
    if(o.w>90)this.text(o.material==='barricade'?'掩体':'B—'+Math.floor(o.x/50),o.x+10,o.y+o.h-12,8,'#9dac7d60','400','left');
  }
  drawExit(e,raid,time) {
    const c=this.ctx,active=distance(e,raid.player)<e.radius,phase=this.reduced?0:time;
    c.fillStyle='#98d4aa0c';c.beginPath();c.arc(e.x,e.y,e.radius+22,0,TAU);c.fill();
    c.strokeStyle=active?'#b5f0ce':'#80b596aa';c.lineWidth=active?2.5:1.5;
    c.setLineDash([9,7]);c.lineDashOffset=-phase*10;c.beginPath();c.arc(e.x,e.y,e.radius,0,TAU);c.stroke();c.setLineDash([]);c.lineDashOffset=0;
    c.strokeStyle='#a9e9cd22';c.lineWidth=1;c.beginPath();c.arc(e.x,e.y,e.radius-10,0,TAU);c.stroke();
    this.rect(e.x-22,e.y-25,44,44,5,'#7db48f18','#a3dab389');
    this.text('↑',e.x,e.y+5,28,'#b3e1bb');this.text(e.label,e.x,e.y+40,9,'#9cbca1');
    this.text(e.name,e.x,e.y-e.radius-20,13,'#b4d4b6','500','center','sans-serif');
    if(active)this.text('静止 · 按住 E 4 秒',e.x,e.y+e.radius+25,11,'#b9e9c4','400','center','sans-serif');
    for(const [x,y] of [[-1,-1],[1,-1],[-1,1],[1,1]])this.rect(e.x+x*82-3,e.y+y*82-3,6,6,1,'#96c09c88');
  }
  drawChest(chest,p,time) {
    const c=this.ctx;const color=['#9bcca7','#ddbf7e','#e8a18d'][chest.zone];
    if(chest.opened){this.rect(chest.x-15,chest.y-12,30,24,4,'#16251e','#4d64504a');this.text('空',chest.x,chest.y+4,10,'#71836e55','400','center','sans-serif');return;}
    const near=distance(p,chest)<80;
    c.shadowColor=color+'40';c.shadowBlur=near?15:0;
    this.rect(chest.x-19,chest.y-15,38,30,5,'#293d2b',color+'a0');c.shadowBlur=0;
    c.fillStyle=color+'50';c.fillRect(chest.x-15,chest.y-9,30,4);c.fillStyle=color;c.fillRect(chest.x-3,chest.y-5,6,13);
    this.text(near?(chest.armory?'按住 E 开装备箱':'按住 E 搜索'):(chest.armory?'装备补给箱':'补给箱'),chest.x,chest.y+36,near?11:9,near?'#dce4c4':color+'a0','400','center','sans-serif');
  }
  drawNode(node,p,time){
    const c=this.ctx,colors={fury:'#ecc67f',phase:'#8cbdf4',magnet:'#bc9ae9'},labels={fury:'增幅节点',phase:'相位节点',magnet:'牵引节点'};
    const color=node.used?'#546a75':colors[node.kind],phase=this.reduced?0:Math.sin(time*2)*4;
    c.save();c.translate(node.x,node.y);
    if(!node.used){c.strokeStyle=color+'44';c.lineWidth=1;c.beginPath();c.arc(0,0,42+phase,0,TAU);c.stroke();}
    c.rotate(Math.PI/4);this.rect(-19,-19,38,38,5,'#142635',color);this.rect(-8,-8,16,16,2,node.used?'#253b46':color);c.restore();
    this.text(node.used?'节点已使用':distance(p,node)<100?'E · '+labels[node.kind]:labels[node.kind],node.x,node.y+63,11,color,'400','center','sans-serif');
  }
  drawDrop(item,p,time){
    const c=this.ctx,gear=item.kind&&item.kind!=='loot',color=gear?rarityOf(item.rarity).color:'#e5c27a';
    const y=item.y+(this.reduced?0:Math.sin(time*2+item.x)*2);
    c.save();c.translate(item.x,y);
    if(gear){
      this.rect(-16,-13,32,26,5,'#14251d',color+'bb');
      this.text(item.kind==='weapon'?weaponOf(item).short:item.kind==='armor'?'▱':'⊕',0,4,item.kind==='weapon'?9:18,color,'600');
    }else{c.rotate(Math.PI/4);this.rect(-8,-8,16,16,2,color,'#f3ddb0');}
    c.restore();
    this.text(gear?(distance(p,item)<80?'F · '+item.name:rarityOf(item.rarity).name+'品装备'):`${item.value}◇`,item.x,y+30,gear?10:9,color,'400','center','sans-serif');
  }
  drawTile(tile,p,time) {
    const c=this.ctx,equal=tile.value===p.value&&p.value<RULES.maxValue,s=equal?34:29;
    const y=tile.y+(this.reduced?0:Math.sin(time*2.5+tile.x)*2);
    if(equal){c.shadowColor='#b9efc755';c.shadowBlur=18;c.strokeStyle='#b7ecc32b';c.lineWidth=1;c.beginPath();c.arc(tile.x,y,28,0,TAU);c.stroke();}
    this.rect(tile.x-s/2,y-s/2,s,s,5,equal?'#c2dfb1':'#b1bc92',equal?'#e5f5ce':'#d5dab05c');c.shadowBlur=0;
    this.text(String(tile.value),tile.x,y+6,tile.value>99?13:17,'#263a28','600');
    if(equal&&distance(p,tile)<155)this.text('同数合成',tile.x,y-30,10,'#b8dbb3','400','center','sans-serif');
  }
  drawTelegraph(e,time) {
    const c=this.ctx,definition=ENEMY_TYPES[e.type]||ENEMY_TYPES.hunter;
    const progress=clamp(1-e.timer/definition.windup,0,1),angle=Math.atan2(e.aimY-e.y,e.aimX-e.x);
    c.lineWidth=2;c.strokeStyle=definition.pattern==='snipe'?'#ff697fcc':'#ef987daa';c.fillStyle=`rgba(238,129,99,${0.08+progress*.15})`;
    if(['strike','blast'].includes(definition.pattern)){
      const radius=definition.pattern==='blast'?118:64;
      c.beginPath();c.arc(e.aimX,e.aimY,radius,0,TAU);c.fill();c.stroke();c.beginPath();c.arc(e.aimX,e.aimY,radius*(1-progress),0,TAU);c.stroke();this.text(definition.pattern==='blast'?'爆':'!',e.aimX,e.aimY+6,20,'#ffc4a8','600','center','sans-serif');
    }else if(definition.pattern==='charge'){
      c.save();c.translate(e.x,e.y);c.rotate(angle);c.fillStyle='#ed987a22';c.fillRect(0,-24,350,48);c.setLineDash([8,6]);c.strokeRect(0,-24,350,48);c.restore();
    }else{
      const offsets=definition.pattern==='fan'?[-.24,0,.24]:[0];c.setLineDash([6,6]);
      for(const offset of offsets){c.beginPath();c.moveTo(e.x,e.y);c.lineTo(e.x+Math.cos(angle+offset)*definition.range,e.y+Math.sin(angle+offset)*definition.range);c.stroke();}c.setLineDash([]);
    }
  }
  drawEnemy(e,p,time,selected) {
    const c=this.ctx,strong=e.value>p.value,s=41;const fill=strong?'#9d5b49':'#8a7650',stroke=strong?'#e0a086':'#d9bf82';
    this.rect(e.x-s/2+3,e.y-s/2+5,s,s,7,'#09140d50');
    this.rect(e.x-s/2,e.y-s/2,s,s,7,e.stun>0?'#786a94':fill,e.stun>0?'#cebcf1':stroke);
    c.fillStyle='#f9deb520';c.fillRect(e.x-14,e.y-15,28,3);
    this.text(String(e.value),e.x,e.y+7,e.value>=100?16:21,'#f9e7ca','600');
    const definition=ENEMY_TYPES[e.type]||ENEMY_TYPES.hunter;
    this.text((e.state==='windup'?'! ':'')+definition.name,e.x,e.y-34,9,stroke+'dd','400','center','sans-serif');
    if(['sentry','gunner','sniper'].includes(e.type)){c.fillStyle=stroke;c.fillRect(e.x-3,e.y-28,6,10);}
    if(e.armor?.durability>0){this.rect(e.x-20,e.y+36,40,3,1,'#142c3f');this.rect(e.x-20,e.y+36,40*e.armor.durability/e.armor.maxDurability,3,1,'#85c5ff');}
    if(e.hp<e.maxHp){this.rect(e.x-20,e.y+30,40,3,1,'#0f1c16');this.rect(e.x-20,e.y+30,40*e.hp/e.maxHp,3,1,stroke);}
    if(e.stun>0)this.text('÷2',e.x,e.y-42,12,'#dcc9ff');
    if(selected){c.strokeStyle='#c3b1ef99';c.lineWidth=1;for(const [sx,sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){c.beginPath();c.moveTo(e.x+sx*30,e.y+sy*20);c.lineTo(e.x+sx*30,e.y+sy*30);c.lineTo(e.x+sx*20,e.y+sy*30);c.stroke();}}
  }
  drawPlayer(p,time) {
    const c=this.ctx,t=tier(p.value),size=40;
    if(p.overload>0||p.energy>=100){c.strokeStyle=p.overload>0?'#edcf8bbb':'#edcf8b55';c.lineWidth=2;c.beginPath();c.arc(p.x,p.y,34+(this.reduced?0:Math.sin(time*6)*2),0,TAU);c.stroke();}
    if(p.buffs.phase>0){c.strokeStyle='#8bbcf488';c.lineWidth=2;c.beginPath();c.arc(p.x,p.y,42,0,TAU);c.stroke();}
    if(p.buffs.magnet>0){c.strokeStyle='#c1a5f025';c.lineWidth=1;c.beginPath();c.arc(p.x,p.y,135,0,TAU);c.stroke();}const tint=t>=6?'#efe2ac':t>=3?'#bce9c9':'#aae9cf';
    if(p.invulnerable>0&&Math.floor(time*16)%2===0&&!this.reduced)c.globalAlpha=.55;
    if(p.dashTime>0){this.rect(p.x-20-p.dashX*22,p.y-20-p.dashY*22,40,40,7,tint+'44');}
    c.shadowColor=tint+'55';c.shadowBlur=20;this.rect(p.x-size/2,p.y-size/2,size,size,8,tint,'#edf9dc');c.shadowBlur=0;
    if(t>=4){c.strokeStyle=tint+'66';c.lineWidth=1;c.strokeRect(p.x-25,p.y-25,50,50);}
    this.text(String(p.value),p.x,p.y+8,p.value>=1000?13:p.value>=100?17:24,'#1a3b2e','600');
    this.text('YOU',p.x,p.y-33,8,tint,'500');
    const equipped=activeWeapon(p),weapon=weaponOf(equipped);c.save();c.translate(p.x,p.y);c.rotate(p.aimAngle);
    if(weapon.mode==='ranged'){
      const length={pistol:20,smg:25,rifle:33,sniper:44,shotgun:31,railgun:48}[equipped.weapon]||25;
      this.rect(14,-5,length,10,2,'#182e3a',rarityOf(equipped.rarity).color);
      c.fillStyle=equipped.weapon==='railgun'?'#92d6f2':'#5e8391';c.fillRect(17,-3,length-8,3);
      if(equipped.weapon==='shotgun'){c.strokeStyle='#a2bfc7';c.lineWidth=2;c.beginPath();c.moveTo(26,-3);c.lineTo(49,-3);c.moveTo(26,3);c.lineTo(49,3);c.stroke();}
      if(equipped.weapon==='sniper'||equipped.weapon==='railgun')this.rect(24,-10,13,5,2,'#253e4b','#8aa9b5');
    }else{
      c.strokeStyle=rarityOf(equipped.rarity).color;c.lineWidth=equipped.weapon==='greatsword'?7:3;
      c.beginPath();c.moveTo(16,0);c.lineTo(equipped.weapon==='greatsword'?62:41,0);if(equipped.weapon==='dualblades'){c.moveTo(15,12);c.lineTo(40,16);}c.stroke();
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
    c.save();c.translate(x+9,y-3);c.rotate(Math.atan2(exit.y-p.y,exit.x-p.x));c.fillStyle='#b8e3bc';c.beginPath();c.moveTo(7,0);c.lineTo(-5,-5);c.lineTo(-2,0);c.lineTo(-5,5);c.fill();c.restore();
    this.text(`${exit.name} · 距离 ${Math.round(distance(p,exit))}`,x+24,y,9,'#b5d9b3','400','left','sans-serif');
  }
  drawMap(raid) {
    const c=this.mctx,w=this.map.width,h=this.map.height,sx=w/this.bounds.width,sy=h/this.bounds.height;
    c.clearRect(0,0,w,h);
    for(const z of this.zones){c.fillStyle=['#243e30','#3e3a29','#412f2b'][z.id];c.fillRect(z.from*sx,0,(z.to-z.from)*sx,h);}
    for(const patch of raid.world.terrain||[]){c.fillStyle=patch.kind==='water'?'#487c8a55':'#93734d44';c.fillRect(patch.x*sx,patch.y*sy,patch.w*sx,patch.h*sy);}
    for(const o of raid.world.obstacles){c.fillStyle='#77916e50';c.fillRect(o.x*sx,o.y*sy,o.w*sx,o.h*sy);}
    for(const chest of raid.world.chests)if(!chest.opened){c.fillStyle='#ccbf7b99';c.fillRect(chest.x*sx-1,chest.y*sy-1,2,2);}
    for(const enemy of raid.world.enemies)if(!enemy.dead&&distance(enemy,raid.player)<450){c.fillStyle='#f3a085';c.fillRect(enemy.x*sx-1.5,enemy.y*sy-1.5,3,3);}
    for(const node of raid.world.nodes||[])if(!node.used&&distance(node,raid.player)<2000){c.fillStyle='#b79cde';c.fillRect(node.x*sx-1,node.y*sy-1,2,2);}
    for(const e of raid.world.exits){c.save();c.translate(e.x*sx,e.y*sy);c.rotate(Math.PI/4);c.fillStyle='#b2edc8';c.fillRect(-3,-3,6,6);c.restore();}
    const p=raid.player;c.fillStyle='#fff7d5';c.beginPath();c.arc(p.x*sx,p.y*sy,3,0,TAU);c.fill();
    c.strokeStyle='#d0e4c14d';c.lineWidth=.6;c.strokeRect((this.camera.x-this.width/this.scale/2)*sx,(this.camera.y-this.height/this.scale/2)*sy,this.width/this.scale*sx,this.height/this.scale*sy);
  }
}
