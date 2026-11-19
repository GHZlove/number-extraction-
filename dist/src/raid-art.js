const INK='#241d30', PAPER='#fff0ce';
const vehicles={
  west:{label:'汽车撤离',short:'汽车',color:'#e9a951',kind:'car'},
  relay:{label:'火车撤离',short:'火车',color:'#91d6e7',kind:'train'},
  field:{label:'直升机撤离',short:'直升机',color:'#aee49d',kind:'heli'},
  east:{label:'火箭撤离',short:'火箭',color:'#e8a4ba',kind:'rocket'},
};
const nodes={
  fury:{label:'增幅节点',color:'#ffc16f'},
  phase:{label:'相位节点',color:'#89e8ee'},
  magnet:{label:'牵引节点',color:'#d3a4f5'},
};
export const exitVehicle = exit => vehicles[exit.id] || vehicles.west;
export const nodeLabel = node => nodes[node.kind]?.label || '运算节点';

function shape(c, points, fill) {
  c.beginPath();
  c.moveTo(...points[0]);
  for (const point of points.slice(1)) c.lineTo(...point);
  c.closePath(); c.fillStyle=fill;c.fill();c.stroke();
}
function box(c,x,y,w,h,r,fill){
  c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();c.stroke();
}
function disc(c,x,y,r,fill){
  c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=fill;c.fill();c.stroke();
}
function line(c,...points){
  c.beginPath();c.moveTo(...points[0]);for(const point of points.slice(1)) c.lineTo(...point);c.stroke();
}

export function drawVehicle(c,exit,ready) {
  const {kind,color}=exitVehicle(exit);
  c.save(); c.translate(exit.x,exit.y); c.strokeStyle=INK;c.lineWidth=2.7;c.lineJoin='round';
  c.fillStyle='#221b3850';c.beginPath();c.roundRect(-61,6,124,23,10);c.fill();
  if(kind==='car'){
    shape(c,[[-57,11],[-58,-8],[-34,-13],[-19,-32],[18,-32],[36,-14],[53,-8],[59,10],[43,17],[-42,17]],color);
    shape(c,[[-27,-14],[-16,-28],[4,-28],[4,-14]],'#86cbd8');
    shape(c,[[9,-14],[9,-28],[16,-28],[29,-14]],'#b5e4e3');
    box(c,46,-8,10,7,2,PAPER);
    line(c,[-51,5],[23,5]);
    for(const x of [-35,35]){disc(c,x,15,11,INK);disc(c,x,15,4,'#c6b6b8');}
  }else if(kind==='train'){
    for(const y of [20,30])line(c,[-68,y],[68,y]);
    for(const x of [-60,-36,-12,12,36,60])line(c,[x,20],[x,31]);
    shape(c,[[-64,6],[-64,-28],[28,-28],[49,-20],[63,-4],[63,12],[-57,12]],color);
    for(const x of [-52,-30,-8,14])box(c,x,-19,15,11,2,'#405b7e');
    shape(c,[[35,-19],[47,-16],[53,-8],[35,-8]],'#fff2cd');
    line(c,[-58,3],[60,3]);for(const x of [-43,-20,28,47])disc(c,x,15,6,INK);
  }else if(kind==='heli'){
    shape(c,[[-62,-10],[-27,-5],[-7,-25],[23,-24],[49,-11],[56,3],[39,12],[-16,12],[-29,5],[-61,-3]],color);
    shape(c,[[10,-20],[22,-20],[44,-9],[49,0],[11,0]],'#8fcce3');
    line(c,[-32,19],[42,19],[50,15]);line(c,[-16,11],[-15,19]);line(c,[29,11],[29,19]);
    line(c,[1,-24],[1,-38]);line(c,[-56,-38],[59,-38]);line(c,[-64,-19],[-62,2]);
  }else{
    box(c,-38,21,76,9,3,'#a49bb0'); line(c,[-26,21],[-26,-29],[-12,-29]);
    shape(c,[[0,-57],[-14,-41],[-17,0],[-29,18],[-15,15],[-9,7],[9,7],[15,15],[29,18],[17,0],[14,-41]],color);
    disc(c,0,-29,7,'#a6e0ee');box(c,-7,7,14,9,2,'#896982');line(c,[-14,-10],[14,-10]);
  }
  const flagX=kind==='rocket'?33:52;
  box(c,flagX,-39,15,10,3,ready?'#ddf89f':'#ffb48b');
  c.restore();
}

export function drawBooster(c,node,time,reduced) {
  const color = node.used ? '#aaa0b2' : nodes[node.kind]?.color||PAPER;
  c.save();c.translate(node.x,node.y);
  c.strokeStyle=INK;c.lineWidth=2.5;c.lineJoin='round';
  if(!node.used){
    c.strokeStyle=color+'ab';c.beginPath();c.arc(0,0,37+(reduced?0:Math.sin(time*2.6)*3),0,Math.PI*2);c.stroke();c.strokeStyle=INK;
  }
  shape(c,[[-29,18],[-22,8],[22,8],[29,18],[24,24],[-24,24]],'#65576d');
  shape(c,[[-20,-19],[-11,-28],[12,-28],[21,-20],[21,10],[12,18],[-12,18],[-21,10]],color);
  box(c,-14,-17,28,25,5,node.used?'#776b84':'#342d45');
  c.strokeStyle=node.used?'#a395ae':color;c.lineWidth=3;
  if(node.kind==='fury')line(c,[3,-14],[-5,-4],[3,-4],[-3,4]);
  else if(node.kind==='phase'){c.beginPath();c.arc(0,-4,7,0,Math.PI*2);c.stroke();line(c,[-5,1],[5,-10]);}
  else line(c,[-8,-10],[-8,-4],[0,3],[8,-4],[8,-10]);
  c.restore();
}

export function mapBadge(c,text,x,y,width,height,color=PAPER){
  const w=Math.min(104,text.length*11+10);
  x=Math.max(w/2+1,Math.min(width-w/2-1,x));
  y=Math.max(8,Math.min(height-8,y));
  c.save();c.strokeStyle=INK;c.lineWidth=1;
  box(c,x-w/2,y-7,w,14,3,'#242037ed');
  c.font='900 10px sans-serif';c.textAlign='center';c.fillStyle=color;c.fillText(text,x,y+3.4);
  c.restore();
}
