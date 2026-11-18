const TILE_SHEET = new URL('../art/number-tiles.png', import.meta.url).href;
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

export function drawTerrainTexture(ctx, patch, time, reducedMotion) {
  const index = terrainIndex[patch.kind];
  if (index === undefined || typeof document === 'undefined' || typeof document.createElement !== 'function') return;
  const pattern = terrainPattern(ctx, index);
  if (!pattern) return;

  const { x, y, w, h } = patch;
  const water = patch.kind === 'water', vertical = h > w && water;
  const shift = water && !reducedMotion ? time * 32 % 288 : 0;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(25, w / 2, h / 2));
  ctx.clip();
  ctx.globalAlpha = water ? .62 : .42;
  ctx.translate(x, y);
  if (vertical) ctx.rotate(Math.PI / 2);
  ctx.translate(shift, 0);
  ctx.fillStyle = pattern;
  if (vertical) ctx.fillRect(-shift, -w, h, w);
  else ctx.fillRect(-shift, 0, w, h);
  ctx.restore();
}
