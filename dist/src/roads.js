const WIDTH = 200;
const HALF = WIDTH / 2;

export function roadNetwork(bounds, east) {
  const relayX = bounds.width * .72;
  const routes = [
    [[310,530],[310,1060],[1870,1060],[1870,east.y],[east.x,east.y]],
    [[1870,bounds.height*.32],[bounds.width-400,bounds.height*.32]],
    [[relayX,bounds.height*.18-160],[relayX,east.y]],
  ];
  const roads = routes.flatMap(route=>route.slice(1).map(([x,y],i)=>{
    const [fromX,fromY]=route[i];
    return {
      x:Math.min(x,fromX)-HALF, y:Math.min(y,fromY)-HALF,
      w:Math.abs(x-fromX)+WIDTH, h:Math.abs(y-fromY)+WIDTH,
      axis:x===fromX?'y':'x',
    };
  }));
  return { routes, roads };
}

export function roadBridges(roads,water) {
  const bridges=[];
  for(const road of roads){
    const left=Math.max(road.x,water.x),right=Math.min(road.x+road.w,water.x+water.w);
    const top=Math.max(road.y,water.y),bottom=Math.min(road.y+road.h,water.y+water.h);
    if(right-left<18||bottom-top<18)continue;
    const across=road.axis==='x';
    bridges.push({
      x:across?Math.max(road.x,left-24):road.x,
      y:across?road.y:Math.max(road.y,top-24),
      w:across?Math.min(road.x+road.w,right+24)-Math.max(road.x,left-24):road.w,
      h:across?road.h:Math.min(road.y+road.h,bottom+24)-Math.max(road.y,top-24),
      kind:'bridge', axis:road.axis,
    });
  }
  return bridges;
}

function trace(c,routes) {
  c.beginPath();
  for(const route of routes){
    c.moveTo(...route[0]);
    for(let i=1;i<route.length-1;i++){
      const [x,y]=route[i],[a,b]=route[i-1],[d,e]=route[i+1];
      const cut=Math.min(96,Math.hypot(a-x,b-y)*.4,Math.hypot(d-x,e-y)*.4);
      c.lineTo(x+Math.sign(a-x)*cut,y+Math.sign(b-y)*cut);
      c.bezierCurveTo(x,y,x,y,x+Math.sign(d-x)*cut,y+Math.sign(e-y)*cut);
    }
    c.lineTo(...route.at(-1));
  }
}

export function drawRoadNetwork(c,routes){
  if(!routes?.length)return;
  c.save();
  c.lineJoin='round';c.lineCap='round';
  trace(c,routes);
  c.lineWidth=WIDTH+9;c.strokeStyle='#282238';c.stroke();
  c.lineWidth=WIDTH;c.strokeStyle='#948591';c.stroke();
  c.lineWidth=WIDTH-15;c.strokeStyle='#655d75';c.stroke();
  c.lineCap='butt';c.setLineDash([34,24]);
  c.lineWidth=3.2;c.strokeStyle='#f4d9a0cc';c.stroke();
  c.restore();
}
