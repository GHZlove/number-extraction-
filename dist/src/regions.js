import { ZONES } from './config.js';

// Exact unit-square tangram tiling, stretched to the expedition's rectangle.
const PIECES=[
  {shape:'large-triangle',name:'斜角广场',points:[[0,0],[1,0],[.5,.5]]},
  {shape:'large-triangle',name:'折影庭院',points:[[0,0],[.5,.5],[0,1]]},
  {shape:'medium-triangle',name:'尖顶工区',points:[[1,1],[.5,1],[1,.5]]},
  {shape:'square',name:'菱形中继',points:[[.5,.5],[.75,.25],[1,.5],[.75,.75]]},
  {shape:'small-triangle',name:'三角前哨',points:[[1,0],[1,.5],[.75,.25]]},
  {shape:'small-triangle',name:'楔形营地',points:[[.5,.5],[.25,.75],[.75,.75]]},
  {shape:'parallelogram',name:'平行廊道',points:[[0,1],[.25,.75],[.75,.75],[.5,1]]},
];
export function polygonArea(vertices){
  let sum=0;for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length];sum+=a.x*b.y-b.x*a.y;}return Math.abs(sum)/2;
}
export function containsPoint(point,vertices){
  if(!vertices?.length)return false;let inside=false;
  for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
    const a=vertices[j],b=vertices[i],cross=(point.x-a.x)*(b.y-a.y)-(point.y-a.y)*(b.x-a.x);
    if(Math.abs(cross)<1e-5&&point.x>=Math.min(a.x,b.x)-1e-7&&point.x<=Math.max(a.x,b.x)+1e-7&&point.y>=Math.min(a.y,b.y)-1e-7&&point.y<=Math.max(a.y,b.y)+1e-7)return true;
    if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
export const sectorAt=(point,sectors)=>sectors.find(sector=>containsPoint(point,sector.vertices))||null;
export function sampleSector(sector,random){
  const b=sector.bounds;
  for(let i=0;i<150;i++){
    const p={x:b.x+random()*b.w,y:b.y+random()*b.h};if(containsPoint(p,sector.vertices))return p;
  }
  return {...sector.center};
}
function clipPolygon(vertices,nx,ny,limit){
  const out=[];
  for(let i=0;i<vertices.length;i++){
    const a=vertices[i],b=vertices[(i+1)%vertices.length],da=a[0]*nx+a[1]*ny-limit,db=b[0]*nx+b[1]*ny-limit;
    if(da<=1e-9)out.push(a);
    if((da<0&&db>0)||(da>0&&db<0)){const t=da/(da-db);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
  }
  return out;
}

const MAP_SECTOR_NAMES = {
  blocks: ['补给街坊', '集装箱区', '仓储广场'],
  fracture: ['裂谷坡地', '扇形高地', '断层营区'],
  wilds: ['荒野盆地', '林间前哨', '资源群落'],
  delta: ['芦苇浅滩', '冲积滩地', '双河岸线'],
  observatory: ['测绘环廊', '观星外环', '望远阵列'],
  glacier: ['寒脊冰带', '碎冰坡地', '钻探营区'],
};

function deltaPieces(random) {
  const top = [0, .25 + random() * .09, .59 + random() * .10, 1];
  const bottom = [0, .31 + random() * .09, .66 + random() * .10, 1];
  const point = (column, y) => [top[column] + (bottom[column] - top[column]) * y, y];
  return top.slice(0, -1).flatMap((_, column) => {
    const rows = [0, .23 + random() * .15, .58 + random() * .16, 1];
    return rows.slice(0, -1).map((y, row) => {
      const next = rows[row + 1];
      return [point(column, y), point(column + 1, y), point(column + 1, next), point(column, next)];
    });
  });
}

function observatoryPieces(random) {
  const rim = [[0, 0], [.5, 0], [1, 0], [1, .5], [1, 1], [.5, 1], [0, 1], [0, .5]];
  const center = [.42 + random() * .16, .42 + random() * .16];
  const scale = .31 + random() * .1;
  const ring = rim.map(([x, y], index) => {
    const radius = scale * (index % 2 === 0 ? .68 : 1);
    return [center[0] + (x - .5) * radius, center[1] + (y - .5) * radius];
  });
  return [
    ring,
    ...rim.map((point, index) => {
      const next = (index + 1) % rim.length;
      return [point, rim[next], ring[next], ring[index]];
    }),
  ];
}

function glacierPieces(random) {
  const square = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const slope = .60 + random() * .12;
  const stops = [0, .37, .64, .97, 1.25, 1 + slope];
  return stops.slice(0, -1).flatMap((low, index) => {
    const strip = clipPolygon(clipPolygon(square, -1, -slope, -low), 1, slope, stops[index + 1]);
    const ys = strip.map(point => point[1]);
    const first = Math.min(...ys), last = Math.max(...ys);
    const split = first + (last - first) * (.43 + random() * .14);
    return [clipPolygon(strip, 0, 1, split), clipPolygon(strip, 0, -1, -split)];
  });
}

const EXTRA_LAYOUTS = { delta: deltaPieces, observatory: observatoryPieces, glacier: glacierPieces };

function layoutPieces(layout,random){
  if(layout==='tangram')return PIECES;
  let shapes=[];
  if (Object.hasOwn(EXTRA_LAYOUTS, layout)) {
    shapes = EXTRA_LAYOUTS[layout](random);
  } else if(layout==='blocks'){
    shapes=[[[0,0],[1,0],[1,1],[0,1]]];
    const count=7+Math.floor(random()*5);
    while(shapes.length<count){
      const index=shapes.reduce((best,s,i)=>polygonArea(s.map(([x,y])=>({x,y})))>polygonArea(shapes[best].map(([x,y])=>({x,y})))?i:best,0);
      const piece=shapes.splice(index,1)[0],xs=piece.map(p=>p[0]),ys=piece.map(p=>p[1]);
      const vertical=random()<.5,from=Math.min(...(vertical?xs:ys)),to=Math.max(...(vertical?xs:ys)),cut=from+(to-from)*(.35+random()*.3);
      shapes.push(clipPolygon(piece,vertical?1:0,vertical?0:1,cut),clipPolygon(piece,vertical?-1:0,vertical?0:-1,-cut));
    }
  }else if(layout==='fracture'){
    const center=[.35+random()*.3,.35+random()*.3],edge=[];
    for(let side=0;side<4;side++){
      const stops=[0,.25+random()*.5];if(random()<.65)stops.push(.78+random()*.12);
      for(const t of stops.sort((a,b)=>a-b))edge.push(side===0?[t,0]:side===1?[1,t]:side===2?[1-t,1]:[0,1-t]);
    }
    shapes=edge.map((p,i)=>[center,p,edge[(i+1)%edge.length]]);
  }else{
    const centers=[];
    for(let row=0;row<3;row++)for(let col=0;col<3;col++)centers.push([(col+.25+random()*.5)/3,(row+.25+random()*.5)/3]);
    if(random()<.6)centers.push([.3+random()*.4,.3+random()*.4]);
    shapes=centers.map((a,index)=>{
      let poly=[[0,0],[1,0],[1,1],[0,1]];
      for(const[bIndex,b]of centers.entries())if(index!==bIndex)poly=clipPolygon(poly,b[0]-a[0],b[1]-a[1],(b[0]*b[0]+b[1]*b[1]-a[0]*a[0]-a[1]*a[1])/2);
      return poly;
    });
  }
  const names = MAP_SECTOR_NAMES[layout] || MAP_SECTOR_NAMES.wilds;
  return shapes.map((points, i) => ({
    points, shape: layout,
    name: layout === 'observatory' && i === 0 ? '中央观星台' : names[i % names.length] + (Math.floor(i / 3) + 1),
  }));
}
export function createSectors(bounds,random,protectedPoints=[],layout='tangram'){
  const orientation=Math.floor(random()*8),rotate=orientation%4,mirror=orientation>=4;
  const sectors=layoutPieces(layout,random).map((piece,id)=>{
    const vertices=piece.points.map(([px,py])=>{
      let x=mirror?1-px:px,y=py;for(let i=0;i<rotate;i++){const nx=1-y;y=x;x=nx;}
      return{x:x*bounds.width,y:y*bounds.height};
    });
    const xs=vertices.map(p=>p.x),ys=vertices.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys);
    return {id,name:piece.name,en:`PIECE ${String(id+1).padStart(2,'0')}`,shape:piece.shape,vertices,area:polygonArea(vertices),orientation,
      bounds:{x,y,w:Math.max(...xs)-x,h:Math.max(...ys)-y},center:{x:xs.reduce((a,b)=>a+b)/xs.length,y:ys.reduce((a,b)=>a+b)/ys.length}};
  });
  // Keep teaching anchors safe; shuffle risk independently of shape and size.
  const safe=new Set(protectedPoints.map(p=>sectorAt(p,sectors)?.id)),remaining=sectors.filter(s=>!safe.has(s.id));
  const high=remaining.length>=4?2:1,medium=remaining.length>=4?2:Math.max(0,remaining.length-high);
  const risks=[...Array(high).fill(2),...Array(medium).fill(1),...Array(Math.max(0,remaining.length-high-medium)).fill(0)];
  for(let i=risks.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[risks[i],risks[j]]=[risks[j],risks[i]];}
  const tones=[['#b6c5b4','#bcc8a8','#acc4be','#b4bfd0'],['#d6c59f','#d7b79b','#cdbf9f','#c0c4a1'],['#c9afc8','#d1aebb','#b7b0cb','#cfb5aa']];let index=0;
  for(const sector of sectors){
    const risk=safe.has(sector.id)?0:risks[index++],definition=ZONES[risk];
    Object.assign(sector,{risk,riskLabel:definition.riskLabel,color:definition.color,reward:definition.reward,values:definition.values,
      floor:tones[risk][Math.floor(random()*tones[risk].length)],density:1+risk*.3});
  }
  return sectors;
}
