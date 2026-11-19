import { ENEMY_TYPES } from './config.js';
import { AFFIXES, hasAffix, hiddenEnemy } from './enemy-tactics.js';
import { distance } from './math.js';
import { BUILDINGS, MINES } from './siege-catalog.js';

const TAU=Math.PI*2,INK='#21192b';

function ring(c,x,y,r,color,width=2){
  c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.arc(x,y,r,0,TAU);c.stroke();
}
function line(c,a,b,color,width=2){
  c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();
}

export function drawEnemyField(renderer,raid,time){
  const c=renderer.ctx;
  c.save();
  for(const fire of raid.tactics?.fire||[]){
    if(!renderer.visible(fire.x,fire.y,fire.radius)||distance(raid.player,fire)>raid.run.vision)continue;
    c.fillStyle='#f06f553d';c.beginPath();c.arc(fire.x,fire.y,fire.radius,0,TAU);c.fill();
    ring(c,fire.x,fire.y,fire.radius,'#ff9b70ac',2);
  }
  for(const pair of raid.tactics?.pairs||[]){
    if(pair.readyAt==null||pair.a.dead||pair.b.dead||hiddenEnemy(raid,pair.a)||hiddenEnemy(raid,pair.b)||
       distance(pair.a,raid.player)>raid.run.vision||distance(pair.b,raid.player)>raid.run.vision)continue;
    const {a,b}=pair,length=distance(a,b)||1,nx=(b.y-a.y)/length,ny=(a.x-b.x)/length;
    c.strokeStyle='#ffbddd';c.lineWidth=2.5;c.beginPath();c.moveTo(a.x,a.y);
    for(let i=1;i<6;i++){
      const t=i/6,zig=(i%2?7:-7)*(renderer.reduced?1:.75+Math.sin(time*15)*.25);
      c.lineTo(a.x+(b.x-a.x)*t+nx*zig,a.y+(b.y-a.y)*t+ny*zig);
    }
    c.lineTo(b.x,b.y);c.stroke();
    const progress=1-Math.max(0,pair.readyAt-raid.elapsed)/1.5;
    for(const e of [a,b]){
      ring(c,e.x,e.y,e.radius+11,'#ffb7d557',2);
      c.strokeStyle='#ffb7d5';c.beginPath();c.arc(e.x,e.y,e.radius+11,-Math.PI/2,-Math.PI/2+progress*TAU);c.stroke();
    }
  }
  c.restore();
}

export function drawEnemyTrait(renderer,raid,enemy,time){
  const c=renderer.ctx,{x,y}=enemy;
  c.save();
  if(enemy.type==='shieldbearer'&&enemy.shieldHp>0&&!(enemy.shieldBrokenUntil>raid.elapsed)){
    const half=ENEMY_TYPES.shieldbearer.shieldArc/2;
    const start=enemy.shieldFacing-half,end=enemy.shieldFacing+half;
    c.lineWidth=8;c.strokeStyle='#2d637fe3';c.beginPath();c.arc(x,y,enemy.radius+10,start,end);c.stroke();
    c.lineWidth=3;c.strokeStyle='#b3f4ffff';c.beginPath();c.arc(x,y,enemy.radius+11,start,end);c.stroke();
  }
  if(enemy.type==='commander'){
    c.setLineDash([10,7]);ring(c,x,y,320,'#ffdbac73',2);c.setLineDash([]);
  }
  if(enemy.state==='healing'&&enemy.healLink?.ally&&!enemy.healLink.ally.dead){
    line(c,enemy,enemy.healLink.ally,'#327c69bd',7);
    line(c,enemy,enemy.healLink.ally,'#b9ffd9f0',2.5);
  }
  if(enemy.state==='detonating'){
    c.fillStyle='#ff5d6553';c.beginPath();c.arc(x,y,128,0,TAU);c.fill();
    ring(c,x,y,128,'#ff858d',3);
    const p=1-Math.max(0,enemy.timer)/.9;
    c.strokeStyle='#ffe9d7';c.lineWidth=3;c.beginPath();c.arc(x,y,enemy.radius+12,-Math.PI/2,-Math.PI/2+p*TAU);c.stroke();
  }
  if(hasAffix(enemy,'unstoppable')){
    const d=enemy.radius+4;
    c.strokeStyle=INK;c.lineWidth=5;c.beginPath();c.roundRect(x-d,y-d,d*2,d*2,5);c.stroke();
    c.strokeStyle='#ded4e8';c.lineWidth=2;c.beginPath();c.moveTo(x-d,y);c.lineTo(x-d,y-d);c.lineTo(x,y-d);c.stroke();
  }
  if(hasAffix(enemy,'blazing')){
    ring(c,x,y,75,'#ffad754d',2);
    for(let i=0;i<6;i++){
      const angle=i*TAU/6+(renderer.reduced?0:time*.9),r=enemy.radius+7+i%3*4;
      c.fillStyle=i%2?'#ffc58f':'#ef795f';c.fillRect(x+Math.cos(angle)*r,y+Math.sin(angle)*r-4,3,5);
    }
  }
  if(enemy.affixes?.length)renderer.text(enemy.affixes.map(id=>AFFIXES[id]).join(' · '),x,y+enemy.radius+28,11);
  c.restore();
}

function structure(renderer,site,main){
  const c=renderer.ctx,{x,y,radius}=site;
  const def=BUILDINGS[site.kind],hue=main?'#93eece':site.kind==='beacon'?'#ead0ff':'#b9cabf';
  c.save();c.lineWidth=3;
  renderer.rect(x-radius,y-radius+4,radius*2,radius*2,8,'#181728',INK);
  renderer.rect(x-radius,y-radius,radius*2,radius*2,8,hue,INK);
  renderer.text(main?'核心':def.glyph,x,y+5,main?20:18,{impact:main});
  renderer.text(String(site.value),x,y+radius-5,main?17:12);
  const width=radius*1.68;
  renderer.rect(x-width/2,y+radius+10,width,6,2,INK);
  if(site.hp>0)renderer.rect(x-width/2,y+radius+10,width*site.hp/site.maxHp,6,2,'#9eebb2');
  if(site.charge>0)renderer.text('+'+site.charge,x+radius+9,y-7,12);
  c.restore();
}

export function drawSiegeField(renderer,raid){
  const s=raid.siege;if(!s)return;
  const c=renderer.ctx;
  c.save();
  for(const route of s.conduits){
    line(c,route.source,route.receiver,'#2b2338',11);
    c.setLineDash([13,7]);line(c,route.source,route.receiver,'#bde6bdee',5);c.setLineDash([]);
  }
  if(s.routeStart)ring(c,s.routeStart.x,s.routeStart.y,37,'#d9ffd4',2.5);
  for(const mine of s.mines){
    if(!renderer.visible(mine.x,mine.y))continue;
    const {x,y,kind}=mine,def=MINES[kind];
    renderer.rect(x-25,y-25,50,50,11,def.color,INK);
    renderer.text(def.glyph,x,y+6,18);
    renderer.text(def.name,x,y+38,12);
    if(kind==='crystal_node'&&distance(raid.player,mine)<300)ring(c,x,y,250,'#c6a5ed68',1.8);
  }
  for(const site of [s.core,...s.buildings])if(renderer.visible(site.x,site.y)){
    structure(renderer,site,site===s.core);
  }
  for(const {tower,target,start,end} of s.salvos){
    const t=Math.max(0,Math.min(1,(raid.elapsed-start)/(end-start)));
    const x=tower.x+(target.x-tower.x)*t,y=tower.y+(target.y-tower.y)*t-Math.sin(t*Math.PI)*118;
    renderer.rect(x-5,y-5,10,10,4,'#ffbf93',INK);
    ring(c,target.x,target.y,122,'#ffb47488',2);
  }
  c.restore();
}

export function drawSiegeMap(c,raid,sx,sy){
  const siege=raid.siege;if(!siege)return;
  c.save();
  for(const rail of siege.conduits)line(c,{x:rail.source.x*sx,y:rail.source.y*sy},{x:rail.receiver.x*sx,y:rail.receiver.y*sy},'#2f6658',1.25);
  for(const mine of siege.mines){c.fillStyle=MINES[mine.kind].color;c.fillRect(mine.x*sx-2,mine.y*sy-2,4,4);}
  c.fillStyle='#509966';
  for(const site of siege.buildings)c.fillRect(site.x*sx-2.5,site.y*sy-2.5,5,5);
  c.fillStyle='#88ffd9';c.fillRect(siege.core.x*sx-5,siege.core.y*sy-5,10,10);
  c.strokeStyle=INK;c.strokeRect(siege.core.x*sx-5,siege.core.y*sy-5,10,10);
  c.restore();
}
