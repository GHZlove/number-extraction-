import { drawComicText } from './comic-type.js';
import { drawNumberSprite } from './game-art.js';

export const NUMBER_COLORS = Object.freeze({
  1: '#4e83b9', 2: '#4e83b9', 4: '#36a9aa', 8: '#6aaf6f', 16: '#d6935b',
  32: '#d57371', 64: '#b75468', 128: '#ca75ab', 256: '#9276bf', 512: '#8f83c0',
  1024: '#d49e5c', 2048: '#e8c565', 4096: '#4b8091', 8192: '#667c9d', 16384: '#8f75a9'
});
export const numberColor = value => NUMBER_COLORS[value] || '#8f75a9';
const INK = '#24212d';

export function drawNumberTile(ctx, { x, y, size, value, stroke = INK, flash = false, deformation = null }) {
  const half = size / 2;
  ctx.save();
  ctx.translate(x, y);
  // Use a constant contact shadow while the body deforms above it.
  ctx.fillStyle = '#24212d2b';
  ctx.beginPath();
  ctx.roundRect(-half * .82, half * .68, size * .84, size * .22, size * .07);
  ctx.fill();
  if (deformation && (deformation.x !== 1 || deformation.y !== 1)) {
    ctx.rotate(deformation.angle);
    ctx.scale(deformation.x, deformation.y);
    ctx.rotate(-deformation.angle);
  }
  const inset = Math.max(1, size * .045);
  const drewSprite = drawNumberSprite(ctx, value, -half, -half, size);
  if (!drewSprite || flash) {
    ctx.fillStyle = flash ? (drewSprite ? '#fffad99c' : '#fff5cd') : numberColor(value);
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.6, size * .058);
    ctx.beginPath();
    ctx.roundRect(-half + inset, -half + inset, size - 2 * inset, size - 2 * inset, size * .13);
    ctx.fill();
    if (!drewSprite) ctx.stroke();
  }
  // Role outline stays secondary so the ink edge of the illustration reads first.
  if (stroke !== INK && stroke !== '#ffffffaa') {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, size * .024);
    ctx.beginPath();
    ctx.roundRect(-half - 1, -half - 1, size + 2, size + 2, size * .14);
    ctx.stroke();
  }
  const digits = String(value).length;
  const fontSize = size * (digits >= 5 ? .24 : digits === 4 ? .31 : digits === 3 ? .4 : .56);
  drawComicText(ctx, value, 0, fontSize * .33, fontSize);
  ctx.restore();
}
