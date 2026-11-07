import { isFree,lineOfSight } from './math.js';
import { obstaclesFor } from './spatial.js';

// A local reverse breadth-first field lets a crowd share routes around cover.
export class NavigationField {
  constructor(world,cell=80,radius=18){
    this.world=world;this.cell=cell;this.radius=radius;this.age=Infinity;this.freeCells=new Map();this.steps=new Map();this.source=null;this.sourceLength=-1;this.targetCell='';
  }
  update(target,dt){this.age+=dt;this.target=target;}
  point(x,y){return {x:(x+.5)*this.cell,y:(y+.5)*this.cell};}
  free(x,y){
    const key=`${x},${y}`;
    if(!this.freeCells.has(key)){
      const p=this.point(x,y);this.freeCells.set(key,isFree(p.x,p.y,25,obstaclesFor(this.world,p,p,25),this.world.bounds));
    }
    return this.freeCells.get(key);
  }
  rebuild(target){
    const w=this.world;
    if(this.source!==w.obstacles||this.sourceLength!==w.obstacles.length){this.freeCells.clear();this.source=w.obstacles;this.sourceLength=w.obstacles.length;}
    const tx=Math.floor(target.x/this.cell),ty=Math.floor(target.y/this.cell);this.targetCell=`${tx},${ty}`;this.age=0;this.steps.clear();
    let root=null,best=Infinity;
    for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++){
      const x=tx+dx,y=ty+dy,p=this.point(x,y),d=Math.hypot(p.x-target.x,p.y-target.y);
      if(d<best&&this.free(x,y)&&lineOfSight(target,p,obstaclesFor(w,target,p,24),24)){root={x,y,p,cost:0,next:p};best=d;}
    }
    if(!root)return;
    const queue=[root];this.steps.set(`${root.x},${root.y}`,root);
    for(let head=0;head<queue.length;head++){
      const here=queue[head];
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
        const x=here.x+dx,y=here.y+dy,key=`${x},${y}`;
        if(Math.abs(x-tx)>this.radius||Math.abs(y-ty)>this.radius||this.steps.has(key)||!this.free(x,y))continue;
        const p=this.point(x,y);if(!lineOfSight(here.p,p,obstaclesFor(w,here.p,p,25),25))continue;
        const step={x,y,p,cost:here.cost+1,next:here.p};this.steps.set(key,step);queue.push(step);
      }
    }
  }
  direction(entity,target=this.target){
    if(!target)return null;
    const key=`${Math.floor(target.x/this.cell)},${Math.floor(target.y/this.cell)}`;
    if(this.age>.45||this.targetCell!==key||this.source!==this.world.obstacles||this.sourceLength!==this.world.obstacles.length)this.rebuild(target);
    const ex=Math.floor(entity.x/this.cell),ey=Math.floor(entity.y/this.cell);let best=null,cost=Infinity;
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
      const step=this.steps.get(`${ex+dx},${ey+dy}`);if(!step)continue;
      for(const p of [step.next]){
        const d=Math.hypot(p.x-entity.x,p.y-entity.y),score=(step.cost-1)*this.cell*3+d;
        if(d>4&&score<cost&&lineOfSight(entity,p,obstaclesFor(this.world,entity,p,entity.radius+2),entity.radius+2)){best=p;cost=score;}
      }
    }
    if(!best)return null;const d=Math.hypot(best.x-entity.x,best.y-entity.y)||1;return {x:(best.x-entity.x)/d,y:(best.y-entity.y)/d};
  }
}
