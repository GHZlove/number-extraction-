// Open structures and terrain pockets give large maps places to navigate toward.
export function buildLandscapes(world,rand,addObstacle){
  const {width,height}=world.bounds,rank=world.difficulty.rank-1,sites=[];
  const spacing=2600+rank*200;
  for(const zone of world.zones){
    let index=0;
    for(let cy=1600;cy<height-1100;cy+=spacing){
      for(let cx=zone.from+1400;cx<zone.to-1000;cx+=spacing){
        const x=cx+rand(-260,260),y=cy+rand(-260,260),kind=index++%6,cluster=`site-${zone.id}-${index}`;
        const place=(dx,dy,w,h,material)=>addObstacle({x:x+dx,y:y+dy,w,h,material,cluster});
        const patch=(dx,dy,w,h,ground)=>world.terrain.push({x:x+dx,y:y+dy,w,h,kind:ground});
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
        sites.push({x,y,zone:zone.id,kind,name});world.landmarks.push({x,y:y-350,name,kind});
      }
    }
    // Rivers have frequent plank crossings, including each main-road intersection.
    const riverX=zone.from+(zone.to-zone.from)*0.66;
    for(let y=350;y<height-400;y+=1100){
      const x=riverX+Math.sin(y/1800+zone.id)*220;
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
