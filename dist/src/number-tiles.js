// Palette and raised faces inspired by the user's numbered-tile reference.
export const NUMBER_COLORS=Object.freeze({
  1:'#497db1',2:'#2d70c6',4:'#299fbe',8:'#20a363',16:'#e87d29',32:'#e93f58',64:'#c92937',
  128:'#cb28c5',256:'#7b3bbd',512:'#6826bd',1024:'#d3992d',2048:'#d3aa1c',4096:'#28566e',8192:'#47518c',16384:'#9857ac',
});
export const numberColor=value=>NUMBER_COLORS[value]||'#9857ac';
function shade(hex,amount){
  const n=parseInt(hex.slice(1),16);return '#'+[16,8,0].map(shift=>{
    const channel=(n>>shift)&255;return Math.round(amount>=0?channel+(255-channel)*amount:channel*(1+amount)).toString(16).padStart(2,'0');
  }).join('');
}
export function drawNumberTile(c,{x,y,size,value,stroke='#26334a',flash=false}){
  const color=flash?'#e8f4ff':numberColor(value),half=size/2,depth=Math.max(3,size*.105),radius=size*.2;
  c.save();c.translate(x,y);c.lineWidth=2;
  c.fillStyle='#17263a44';c.beginPath();c.roundRect(-half+2,-half+depth+3,size,size,radius);c.fill();
  c.fillStyle=shade(color,-.3);c.beginPath();c.roundRect(-half,-half+depth,size,size,radius);c.fill();
  const face=c.createLinearGradient(0,-half,0,half);face.addColorStop(0,shade(color,.24));face.addColorStop(.2,color);face.addColorStop(1,shade(color,-.04));
  c.fillStyle=face;c.strokeStyle=stroke;c.beginPath();c.roundRect(-half,-half,size,size,radius);c.fill();c.stroke();
  c.strokeStyle='#ffffff35';c.lineWidth=1;c.beginPath();c.roundRect(-half+3,-half+3,size-6,size-7,Math.max(2,radius-2));c.stroke();
  const digits=String(value).length,fontSize=size*(digits>=5?.26:digits===4?.31:digits===3?.4:.56);
  c.font=`900 ${fontSize}px Arial,sans-serif`;c.textAlign='center';c.fillStyle=flash?'#23364c':'#ffffff';
  c.shadowColor='#132035b0';c.shadowBlur=3;c.shadowOffsetY=2;c.fillText(String(value),0,fontSize*.34);c.restore();
}
