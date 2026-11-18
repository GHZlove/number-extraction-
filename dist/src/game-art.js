const TILE_SHEET = new URL('../art/number-tiles.png', import.meta.url).href;
const SCENERY_SHEET = new URL('../art/scenery.png', import.meta.url).href;
const TERRAIN_SHEET = new URL('../art/terrain.png', import.meta.url).href;
const WEAPON_SHEETS = [
  new URL('../art/weapons.png', import.meta.url).href,
  new URL('../art/weapons-extra.png', import.meta.url).href
];
const weapons = [
  ['pistol', 'smg', 'rifle', 'sniper', 'doublebarrel', 'plasma', 'rocket', 'flamethrower',
    'greatsword', 'dualblades', 'battleaxe', 'warhammer'],
  ['shotgun', 'railgun', 'carbine', 'lmg', 'crossbow', 'grenade', 'revolver', 'spear']
];
const images = new Map();

function load(url) {
  if (typeof Image === 'undefined') return null;
  if (!images.has(url)) {
    const image = new Image();
    image.src = url;
    images.set(url, image);
  }
  const image = images.get(url);
  return image.complete && image.naturalWidth > 0 ? image : null;
}

const tileIndex = value => Math.min(11, Math.max(0, Math.floor(Math.log2(value)) - 1));

function background(url, index, rows) {
  const col = index % 4, row = Math.floor(index / 4);
  return `--art:url('${url}');--art-height:${rows * 100}%;--art-x:${100 * col / 3}%;--art-y:${100 * row / (rows - 1)}%`;
}

export const numberBackground = value => background(TILE_SHEET, tileIndex(value), 3);

function weaponCell(id) {
  for (let sheet = 0; sheet < weapons.length; sheet++) {
    const index = weapons[sheet].indexOf(id);
    if (index >= 0) return { url: WEAPON_SHEETS[sheet], index, rows: weapons[sheet].length / 4 };
  }
  return null;
}

export function weaponBackground(id) {
  const cell = weaponCell(id);
  return cell ? background(cell.url, cell.index, cell.rows) : '';
}

export function drawNumberSprite(ctx, value, x, y, size) {
  const image = load(TILE_SHEET);
  if (!image) return false;
  const index = tileIndex(value), side = 80;
  ctx.drawImage(image, (index % 4) * side, Math.floor(index / 4) * side, side, side, x, y, size, size);
  return true;
}

export function drawWeaponSprite(ctx, id, x, y, width, height) {
  const cell = weaponCell(id);
  if (!cell) return false;
  const image = load(cell.url);
  if (!image) return false;
  const side = 88;
  ctx.drawImage(image, (cell.index % 4) * side, Math.floor(cell.index / 4) * side, side, side,
    x, y - height / 2, width, height);
  return true;
}

const terrainIndex = { water: 0, rubble: 1, mud: 1, brush: 2, ice: 3 };
const surfaces = new Map();
const patterns = new WeakMap();

function terrainPattern(ctx, index) {
  const atlas = load(TERRAIN_SHEET);
  if (!atlas) return null;
  if (!patterns.has(ctx)) patterns.set(ctx, new Map());
  const cache = patterns.get(ctx);
  if (cache.has(index)) return cache.get(index);
  const d = 144;
  if (!surfaces.has(index)) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = d * 2;
    const draw = canvas.getContext('2d');
    if (!draw) return null;
    // Mirrored edges meet without a seam when the surface scrolls.
    for (const y of [0, 1]) for (const x of [0, 1]) {
      draw.save();
      draw.translate(x * d * 2, y * d * 2);
      draw.scale(x ? -1 : 1, y ? -1 : 1);
      draw.drawImage(atlas, (index % 2) * d, Math.floor(index / 2) * d, d, d, 0, 0, d, d);
      draw.restore();
    }
    surfaces.set(index, canvas);
  }
  const pattern = ctx.createPattern(surfaces.get(index), 'repeat');
  if (pattern) cache.set(index, pattern);
  return pattern;
}

const scenery = { container: 0, warehouse: 0, barricade: 1, rock: 2, ridge: 2, ruin: 3, tree: 4, fern: 5, hatch: 6, gravel: 7 };

export function drawScenery(ctx, kind, x, y, width, height) {
  if (!Object.hasOwn(scenery, kind)) return false;
  const image = load(SCENERY_SHEET);
  if (!image) return false;
  const cell = scenery[kind], side = 104;
  const vertical = height > width * 1.35;
  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  if (vertical) ctx.rotate(Math.PI / 2);
  const w = vertical ? height : width, h = vertical ? width : height;
  ctx.drawImage(image, (cell % 4) * side, Math.floor(cell / 4) * side, side, side, -w / 2, -h / 2, w, h);
  ctx.restore();
  return true;
}

export function terrainPath(ctx, patch) {
  const { x, y, w, h, kind } = patch;
  ctx.beginPath();
  if (kind === 'bridge' || kind === 'road') {
    ctx.roundRect(x, y, w, h, 3);
    return;
  }
  const cut = Math.min(13, w * .16, h * .16);
  const points = [
    [cut, 0], [w * .27, cut * .18], [w * .52, 0], [w * .73, cut * .22], [w - cut, cut * .1],
    [w, cut], [w - cut * .18, h * .59], [w, h - cut], [w - cut * .93, h],
    [w * .72, h - cut * .15], [w * .46, h], [w * .24, h - cut * .24], [cut, h],
    [0, h - cut * .9], [cut * .16, h * .46], [0, cut]
  ];
  for (const [i, [dx, dy]] of points.entries()) {
    if (i === 0) ctx.moveTo(x + dx, y + dy);
    else ctx.lineTo(x + dx, y + dy);
  }
  ctx.lineTo(x + points[0][0], y + points[0][1]);
}

export function drawTerrainTexture(ctx, patch, time, reducedMotion) {
  const index = terrainIndex[patch.kind];
  if (index === undefined || typeof document === 'undefined' || typeof document.createElement !== 'function') return;
  const pattern = terrainPattern(ctx, index);
  if (!pattern) return;

  const { x, y, w, h } = patch;
  const water = patch.kind === 'water', vertical = h > w && water;
  const shift = water && !reducedMotion ? time * 23 % 288 : 0;
  ctx.save();
  terrainPath(ctx, patch);
  ctx.clip();
  ctx.globalAlpha = water ? .9 : .63;
  ctx.translate(x, y);
  if (vertical) ctx.rotate(Math.PI / 2);
  ctx.translate(shift, 0);
  ctx.fillStyle = pattern;
  if (vertical) ctx.fillRect(-shift, -w, h, w);
  else ctx.fillRect(-shift, 0, w, h);
  ctx.restore();
  return true;
}
