import { FIELD_LABELS, FIELD_PROPS } from './field-events.js';
import { distance } from './math.js';

const TAU=Math.PI*2;
// Visual samples use coordinates and time, independent of the simulation RNG.
const phase=n=>((Math.sin(n*91.7+7.3)*17391)%1+1)%1;
const atmospheres={
  glacier:{color:'#e8fcff',vx:-65,vy:49},
  delta:{color:'#e1ffa1',vx:12,vy:-4},
  observatory:{color:'#b8ffba',vx:16,vy:4},
  fracture:{color:'#ffad65',vx:28,vy:-43},
  tangram:{color:'#ffdfaa',vx:18,vy:6},
  blocks:{color:'#b8e9ed',vx:35,vy:7},
  wilds:{color:'#e3eda8',vx:21,vy:-13},
};
const wrap=(n,d)=>(n%d+d)%d;
export function drawAtmosphere(c,raid,view,time,reduced){
  const layout=raid.world.layout,paint=atmospheres[layout];
  if(!paint||reduced)return;
  const {left,top,right,bottom}=view,w=raid.world.bounds.width,h=raid.world.bounds.height;
  const speed=layout==='glacier'?1:.8;
  c.save();c.strokeStyle=paint.color;c.fillStyle=paint.color;
  for(let i=0;i<240;i++){
    const x=wrap(phase(i*3+1)*w+time*paint.vx*speed,w),y=wrap(phase(i*3+2)*h+time*paint.vy*speed,h);
    if(x<left||x>right||y<top||y>bottom)continue;
    c.globalAlpha=.28+phase(i*3+3)*.43;
    c.lineWidth=layout==='glacier'?1.7:1.4;
    c.beginPath();
    c.moveTo(x,y);c.lineTo(x+paint.vx*.10,y+paint.vy*.10);c.stroke();
    if(layout==='delta'||layout==='wilds'){c.beginPath();c.arc(x,y,2.1+Math.sin(time*2+i)*.7,0,TAU);c.fill();}
  }
  if(layout==='observatory'){
    const y=top+wrap(time*27,bottom-top);
    c.globalAlpha=.34;c.lineWidth=2;
    c.beginPath();c.moveTo(left,y);c.lineTo(right,y);c.stroke();
  }
  if(layout==='delta'){
    for(const patch of raid.world.terrain){
      if(patch.kind!=='water'||patch.x<left-280||patch.x>right||patch.y<top-140||patch.y>bottom)continue;
      c.globalAlpha=.27;c.lineWidth=2;c.beginPath();
      const x=patch.x+8+wrap(time*8,Math.max(8,(patch.w||100)-12)),y=patch.y+20;
      c.moveTo(x-12,y);c.quadraticCurveTo(x,y-3,x+12,y);c.stroke();
    }
  }
  c.restore();
}

export function drawForm(c,p,time,reduced){
  if(p.value<64&&!p.digitShield)return;
  const radius=p.radius+9,rank=p.value>=2048?4:p.value>=1024?3:p.value>=256?2:1;
  const color=p.digitShield?'#9beeff':['','#b7ff98','#89cfff','#dfacff','#ffe69a'][rank];
  c.save();c.translate(p.x,p.y);c.lineWidth=p.digitShield?3:1.8;c.strokeStyle=color;c.fillStyle=color;
  c.globalAlpha=.65;
  c.beginPath();c.roundRect(-radius,-radius,radius*2,radius*2,8);c.stroke();
  if(rank>=2)for(const [x,y]of [[-1,-1],[1,-1],[1,1],[-1,1]]){
    c.fillRect(x*(radius-3)-4,y*(radius-4)-2,8,4);
    if(rank>=3&&!reduced){
      const twinkle=Math.sin(time*12+x*2+y)*3;
      c.beginPath();c.moveTo(x*(radius-2),y*radius);c.lineTo(x*(radius+4),y*(radius+4));c.lineTo(x*(radius+8),y*(radius+3+twinkle));c.stroke();
    }
  }
  if(rank===4)for(let i=0;i<10;i++){c.beginPath();c.arc(-radius+6+i*5,-radius+5,1.25,0,TAU);c.fill();}
  c.restore();
}

export function drawSkillSignature(c,e,progress,reduced){
  const p=reduced?.55:progress,variant=e.variant||0,r=(e.radius||60)*(.42+p*.8);
  c.save();c.translate(e.x,e.y);c.rotate(e.angle||0);c.globalAlpha=(1-progress)*.78;
  c.strokeStyle=e.color;c.fillStyle=e.color;c.lineWidth=2.6;
  if(e.branch==='wind'){
    for(let i=0;i<3+(variant%3);i++){
      const a=i*TAU/(3+variant%3)+p*2;
      c.beginPath();c.arc(0,0,r-i*4,a,a+.72+variant*.035);c.stroke();
    }
  }else if(e.branch==='space'){
    for(const offset of [0,15+variant]){
      c.beginPath();
      for(let i=0;i<=6;i++){
        const angle=i*TAU/6+p;
        const x=Math.cos(angle)*(r-offset),y=Math.sin(angle)*(r-offset)*.67;
        if(i===0)c.moveTo(x,y);else c.lineTo(x,y);
      }
      c.stroke();
    }
    c.beginPath();c.moveTo(-r*.68,4);c.lineTo(-r*.2,-8);c.lineTo(3,9);c.lineTo(r*.6,-11);c.stroke();
  }else if(e.branch==='fire'){
    c.globalAlpha=(1-progress)*.57;c.fillStyle='#452331';
    c.beginPath();c.ellipse(0,0,r,r*.5,0,0,TAU);c.fill();
    c.fillStyle=e.color;
    for(let i=0;i<6+variant;i++){
      const angle=phase(i+variant*11)*TAU;
      c.fillRect(Math.cos(angle)*r,Math.sin(angle)*r*.6,3+i%3,2);
    }
  }else{
    for(let i=0;i<3+variant%3;i++){
      const a=i*TAU/(3+variant%3);
      c.save();c.rotate(a);c.beginPath();
      c.moveTo(r*.12,0);c.lineTo(r*.38,-7);c.lineTo(r*.56,6);c.lineTo(r*.84,-6);c.lineTo(r,1);
      c.moveTo(r*.56,6);c.lineTo(r*.8,14+variant);c.stroke();c.restore();
    }
  }
  c.restore();
}

export function drawFieldFixture(renderer,prop){
  const c=renderer.ctx,{x,y,kind}=prop;
  if(prop.dead||!renderer.visible(x,y))return;
  const color=kind==='nitrogen'?'#aff0ff':kind==='electric'?'#ffe290':'#b8e4a6';
  c.save();c.strokeStyle='#15131e';c.lineWidth=3;
  renderer.rect(x-15,y-17,30,34,6,color,true);
  if(prop.landing){
    c.strokeStyle=color;c.lineWidth=2;c.setLineDash([9,7]);
    c.beginPath();c.moveTo(x,y);c.lineTo(prop.landing.x,prop.landing.y);c.stroke();c.setLineDash([]);
  }
  renderer.text(kind==='nitrogen'?'❄':kind==='electric'?'ϟ':'➜',x,y+6,20);
  renderer.text(FIELD_PROPS[kind],x,y+32,12);
  c.restore();
}
export function drawFieldEvents(renderer,raid){
  const c=renderer.ctx,p=raid.player;
  for(const prop of raid.field?.props||[])if(distance(prop,p)<=raid.run.vision)drawFieldFixture(renderer,prop);
  for(const event of raid.field?.active||[]){
    if(distance(event,p)>raid.run.vision||!renderer.visible(event.x,event.y,150))continue;
    c.save();c.strokeStyle=event.kind==='magnetic'?'#c9a5ff':'#b1edfb';c.lineWidth=2;
    const radius=event.radius||38;
    c.globalAlpha=.65;c.beginPath();c.arc(event.x,event.y,radius,0,TAU);c.stroke();c.restore();
    if(!event.temporary){
      const countdown=event.chest&&raid.elapsed<event.chest.opensAt?event.chest.opensAt:event.until;
      renderer.text(FIELD_LABELS[event.kind]+' '+Math.max(0,Math.ceil(countdown-raid.elapsed))+'s',event.x,event.y+44,13);
    }
  }
}
