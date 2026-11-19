const FACE = '"Arial Black","Segoe UI Black","Microsoft YaHei UI","PingFang SC","Noto Sans CJK SC",sans-serif';
const INK = '#121216';
const PAPER = '#fffefa';

export function drawComicText(ctx, value, x, y, size, options = {}) {
  const { align = 'center', impact = false } = options;
  const word = String(value);
  const edge = Math.max(1.5, size * .135);
  const depth = Math.max(.85, Math.min(3.8, size * (impact ? .17 : .115)));
  ctx.save();
  ctx.font = `${impact ? 'italic ' : ''}900 ${size}px ${FACE}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeStyle = INK;
  ctx.lineWidth = edge + depth * .43;
  ctx.strokeText(word, x + depth * .72, y + depth);
  ctx.lineWidth = edge;
  ctx.strokeText(word, x, y);
  ctx.fillStyle = PAPER;
  ctx.fillText(word, x, y);
  ctx.restore();
}
