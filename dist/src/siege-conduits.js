import { canMerge, distance } from './math.js';

const SPEED=90,JOIN_RANGE=23;

export function advanceConduits(raid,siege,dt){
  const incoming=new Map();
  for(const conduit of siege.conduits){
    if(!conduit.receiver.dead)incoming.set(conduit.id,[]);
  }
  // Release unconsumed tiles intact when their receiver is destroyed.
  for(const tile of raid.world.tiles){
    if(tile.dead||!tile.conduit)continue;
    if(!incoming.has(tile.conduit)){delete tile.conduit;delete tile.beltAt;continue;}
    incoming.get(tile.conduit).push(tile);
  }
  for(const route of siege.conduits){
    const tiles=incoming.get(route.id);
    if(!tiles)continue;
    const {source,receiver,length}=route;
    tiles.sort((a,b)=>b.beltAt-a.beltAt);
    let leading=null;
    for(const tile of tiles){
      const limit=leading?Math.max(0,leading.beltAt-JOIN_RANGE):length;
      tile.beltAt=Math.min(limit,tile.beltAt+SPEED*dt);
      const ratio=tile.beltAt/length;
      tile.x=source.x+(receiver.x-source.x)*ratio;tile.y=source.y+(receiver.y-source.y)*ratio;
      if(leading&&distance(tile,leading)<=JOIN_RANGE+.1&&canMerge(leading.value,tile.value)){
        const original=tile.value;
        leading.value*=2;tile.dead=true;
        leading.waitUntil=raid.elapsed+.85;
        raid.effect(tile.x,tile.y,'','#d0f9ce','tile-fusion',.46,{originX:leading.x,originY:leading.y,
          radius:18,value:original,fusionTarget:{x:leading.x,y:leading.y,radius:18}});
        raid.event('merge');
        continue;
      }
      if(tile.beltAt>=length){
        // The receiver's one-tile buffer lets the next production cycle catch up.
        tile.waitUntil??=raid.elapsed+(source.interval||4)+1;
        if(raid.elapsed>=tile.waitUntil){
          siege.depositNumber(receiver,tile.value);
          tile.dead=true;continue;
        }
      }
      leading=tile;
    }
  }
  siege.conduits=siege.conduits.filter(conduit=>!conduit.receiver.dead);
}
