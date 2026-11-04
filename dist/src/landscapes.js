import { zoneAt } from './math.js';
// Open structures and terrain pockets give large maps places to navigate toward.
export function buildLandscapes(world,rand,addObstacle){
  const {width,height}=world.bounds,rank=world.difficulty.rank-1,sites=[];
  const spacing=1000+rank*100,scale=.6;let serial=0;
  let index=0;
    for(let cy=900;cy<height-550;cy+=spacing){
      for(let cx=650;cx<width-450;cx+=spacing){
        const x=cx+rand(-130,130),y=cy+rand(-130,130),sector=zoneAt({x,y},world.zones),kind=serial++%6,cluster=`site-${sector.id}-${index++}`;
        const place=(dx,dy,w,h,material)=>addObstacle({x:x+dx*scale,y:y+dy*scale,w:w*scale,h:h*scale,material,cluster});
        const patch=(dx,dy,w,h,ground)=>world.terrain.push({x:x+dx*scale,y:y+dy*scale,w:w*scale,h:h*scale,kind:ground});
        let name;
        if(kind===0){
          name='工业庭院';
          place(-310,-230,230,28,'warehouse');place(80,-230,230,28,'warehouse');
          place(-310,202,230,28,'warehouse');place(80,202,230,28,'warehouse');
          place(-310,-202,28,404,'warehouse');place(282,-202,28,404,'warehouse');
          place(-14,-130,28,260,'ruin');patch(-280,-200,560,400,'rubble');
        }else if(kind===1){
          name='集装箱巷道';
          for(let row=0;row<3;row++)for(let col=0;col<3;col++)place(-350+col*250,-240+row*210,150,70,'container');
          patch(-390,-280,860,650,'rubble');
        }else if(kind===2){
          name='断层岩脊';
          for(let i=0;i<7;i++)place(-440+i*135,-180+(i%2)*230,95,170,'ridge');
          patch(-500,-280,1120,680,'ice');
        }else if(kind===3){
          name='河湾栈桥';patch(-480,-300,960,600,'water');patch(-520,-72,1040,144,'bridge');
          place(-490,-340,170,65,'rock');place(310,275,170,65,'rock');
        }else if(kind===4){
          name='隐蔽林地';
          for(let i=0;i<7;i++){const dx=rand(-400,300),dy=rand(-300,260);patch(dx,dy,180,150,'brush');place(dx+70,dy+65,34,34,'tree');}
        }else{
          name='运算中继站';
          place(-35,-35,70,70,'relay');
          for(const[dx,dy]of[[-260,-210],[140,-210],[-260,170],[140,170]])place(dx,dy,120,40,'barricade');
          patch(-360,-280,720,560,'mud');
        }
        sites.push({x,y,zone:sector.risk,sectorId:sector.id,kind,name});world.landmarks.push({x,y:y-230,name,kind});
      }
    }
  // Two winding waterways cross polygon sectors instead of defining fixed strips.
  for(let river=0;river<2;river++){
    const riverX=width*(.25+river*.5);
    for(let y=350;y<height-400;y+=1100){
      const x=riverX+(y/height-.5)*width*.18+Math.sin(y/1200+river)*160;
      world.terrain.push({x,y,w:210,h:1080,kind:'water'});
      world.terrain.push({x:x-90,y:y+470,w:390,h:140,kind:'bridge'});
      for(const road of world.roads)if(road.w>road.h&&y<road.y+road.h&&y+1080>road.y){
        world.terrain.push({x:x-90,y:road.y,w:390,h:road.h,kind:'bridge'});
      }
    }
  }
  for(const road of world.roads)world.terrain.unshift({...road,kind:'road'});
  return sites;
}
