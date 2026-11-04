// Static obstacle buckets keep movement and projectile checks local as maps grow.
export class SpatialGrid {
  constructor(source, cellSize = 320) {
    this.source = source; this.sourceLength = source.length; this.cellSize = cellSize; this.cells = new Map();
    for (const item of source) {
      for (let x = Math.floor(item.x/cellSize); x <= Math.floor((item.x+item.w)/cellSize); x++) {
        for (let y = Math.floor(item.y/cellSize); y <= Math.floor((item.y+item.h)/cellSize); y++) {
          const key = `${x},${y}`;
          if (!this.cells.has(key)) this.cells.set(key, []);
          this.cells.get(key).push(item);
        }
      }
    }
  }
  query(a, b = a, pad = 0) {
    const found = new Set(), size = this.cellSize;
    const left = Math.floor((Math.min(a.x,b.x)-pad)/size), right = Math.floor((Math.max(a.x,b.x)+pad)/size);
    const top = Math.floor((Math.min(a.y,b.y)-pad)/size), bottom = Math.floor((Math.max(a.y,b.y)+pad)/size);
    for (let x = left; x <= right; x++) for (let y = top; y <= bottom; y++) {
      for (const item of this.cells.get(`${x},${y}`) || []) found.add(item);
    }
    return [...found];
  }
}

export function obstaclesFor(world, a, b = a, pad = 0) {
  const grid = world.obstacleGrid;
  return grid && grid.source === world.obstacles && grid.sourceLength === world.obstacles.length
    ? grid.query(a,b,pad) : world.obstacles;
}
