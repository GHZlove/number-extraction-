import { clamp } from './math.js';
import { drawNumberTile, numberColor } from './number-tiles.js';

const TAU = 2 * Math.PI;
const smooth = t => t * t * (3 - 2 * t);
const mix = (start, end, t) => start + (end - start) * t;

export function fusionPose(effect, player) {
  const age = effect.maxLife - effect.life;
  const travel = effect.recycled ? .18 : .22;
  const collect = clamp(age / travel, 0, 1);
  const eased = smooth(collect);
  // Follow normal movement while collecting. A blink leaves the old fusion in place.
  const attached = Math.hypot(player.x - effect.originX, player.y - effect.originY) < 125;
  const targetX = attached ? player.x : effect.originX;
  const targetY = attached ? player.y : effect.originY;
  const direction = Math.atan2(effect.y - targetY, effect.x - targetX);
  const size = (effect.recycled ? 35 : 40) * (1 - .88 * eased);
  const liquid = smooth(clamp((collect - .2) / .55, 0, 1));
  const wave = clamp((age - travel * .72) / (effect.maxLife - travel * .72), 0, 1);
  const bounce = clamp((age - travel * .44) / .27, 0, 1);
  const squish = Math.sin(bounce * TAU * 1.35) * (1 - bounce) ** 2 * (effect.recycled ? .12 : .25);
  return {
    x: mix(effect.x, targetX, eased), y: mix(effect.y, targetY, eased),
    targetX, targetY, size, direction, collect, liquid, wave,
    radius: mix(effect.radius * .28, effect.radius + (effect.recycled ? 20 : 32), 1 - (1 - wave) ** 2),
    deformation: attached && bounce > 0 && bounce < 1
      ? { x: 1 + squish, y: 1 - squish * .78, angle: direction } : null,
  };
}

function drawLiquidNeck(c, effect, pose, sourceColor) {
  const gap = Math.hypot(pose.x - pose.targetX, pose.y - pose.targetY);
  if (gap < 3 || gap > effect.radius + pose.size * .55 + 11) return;

  const near = effect.radius * .54;
  const far = pose.size * .32;
  const waist = Math.min(near, far) * (.48 + pose.collect * .38);
  c.save();
  c.translate(pose.targetX, pose.targetY);
  c.rotate(Math.atan2(pose.y - pose.targetY, pose.x - pose.targetX));
  const tint = c.createLinearGradient(0, 0, gap, 0);
  tint.addColorStop(0, effect.color);
  tint.addColorStop(1, sourceColor);
  c.globalAlpha = (.58 + pose.liquid * .38) * (1 - pose.collect ** 4);
  c.fillStyle = tint;
  c.beginPath();
  c.moveTo(0, near);
  c.bezierCurveTo(gap * .32, near, gap * .58, waist, gap, far);
  c.lineTo(gap, -far);
  c.bezierCurveTo(gap * .58, -waist, gap * .32, -near, 0, -near);
  c.closePath();
  c.fill();
  c.restore();
}

export function drawTileFusion(c, effect, player, reducedMotion) {
  c.save();
  if (reducedMotion) {
    c.globalAlpha = .24 * effect.life / effect.maxLife;
    c.strokeStyle = effect.color;
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(effect.originX, effect.originY, effect.radius + 6, 0, TAU);
    c.stroke();
    c.restore();
    return null;
  }

  const pose = fusionPose(effect, player);
  if (pose.wave > 0 && pose.wave < 1) {
    c.beginPath();
    c.arc(effect.originX, effect.originY, pose.radius, 0, TAU);
    c.globalAlpha = .27 * (1 - pose.wave);
    c.strokeStyle = '#256f71';
    c.lineWidth = 4 - 2 * pose.wave;
    c.stroke();
    c.globalAlpha = .72 * (1 - pose.wave) ** 1.4;
    c.strokeStyle = effect.color;
    c.lineWidth = 2 - pose.wave;
    c.stroke();
  }

  if (pose.collect < 1) {
    const sourceColor = numberColor(effect.value);
    drawLiquidNeck(c, effect, pose, sourceColor);
    if (pose.liquid > 0) {
      c.save();
      c.translate(pose.x, pose.y);
      c.rotate(pose.direction);
      c.scale(1 + .48 * pose.liquid, 1 - .35 * pose.liquid);
      c.globalAlpha = pose.liquid * (1 - pose.collect ** 3);
      c.fillStyle = sourceColor;
      c.beginPath();
      c.arc(0, 0, pose.size * .51, 0, TAU);
      c.fill();
      c.fillStyle = effect.color;
      c.beginPath();
      c.arc(-pose.size * .13, -pose.size * .16, pose.size * .13, 0, TAU);
      c.fill();
      c.restore();
    }
    if (pose.liquid < .98) {
      c.globalAlpha = 1 - pose.liquid;
      drawNumberTile(c, {
        x: pose.x, y: pose.y, size: pose.size, value: effect.value,
        stroke: effect.color,
        deformation: { x: 1 + pose.collect * .28, y: 1 - pose.collect * .2, angle: pose.direction },
      });
    }
  }
  c.restore();
  return pose.deformation;
}
