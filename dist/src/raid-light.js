import { distance } from './math.js';

export const FLASHLIGHT_REACH = 650;
export const FLASHLIGHT_ARC = .41;

export function detectsFlashlight(player,enemy) {
  if (!player.flashlight) return false;
  const d = distance(player,enemy);
  if (d <= 205) return true;
  if (d > FLASHLIGHT_REACH) return false;
  const bearing = Math.atan2(enemy.y-player.y,enemy.x-player.x);
  return Math.cos(bearing-player.aimAngle) >= Math.cos(FLASHLIGHT_ARC);
}

export function drawMoonlight(c,p,view,beamReach) {
  const {left,top,right,bottom}=view;
  const beam=p.flashlight && beamReach>1;
  c.save();
  c.fillStyle='#111d4f55';
  if (beam) {
    c.beginPath();
    c.moveTo(left,top);c.lineTo(right,top);c.lineTo(right,bottom);c.lineTo(left,bottom);c.closePath();
    c.moveTo(p.x,p.y);
    c.arc(p.x,p.y,beamReach,p.aimAngle-FLASHLIGHT_ARC,p.aimAngle+FLASHLIGHT_ARC);
    c.closePath();
    c.fill('evenodd');
    const lamp=c.createRadialGradient(p.x,p.y,8,p.x,p.y,beamReach);
    lamp.addColorStop(0,'#fff3be43');lamp.addColorStop(.65,'#fff0b83b');lamp.addColorStop(1,'#fff0b800');
    c.fillStyle=lamp;c.beginPath();c.moveTo(p.x,p.y);
    c.arc(p.x,p.y,beamReach,p.aimAngle-FLASHLIGHT_ARC,p.aimAngle+FLASHLIGHT_ARC);
    c.closePath();c.fill();
  } else {
    c.fillRect(left,top,right-left,bottom-top);
  }
  const haze=c.createRadialGradient(p.x,p.y,95,p.x,p.y,Math.hypot(right-left,bottom-top)*.65);
  haze.addColorStop(0,'#a3bcff08');haze.addColorStop(.55,'#94a5e42b');haze.addColorStop(1,'#2023487b');
  c.fillStyle=haze;c.fillRect(left,top,right-left,bottom-top);
  c.restore();
}
