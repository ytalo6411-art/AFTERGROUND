export class FogOfWar {
  constructor(width, height, enabled = true) {
    this.width = width;
    this.height = height;
    this.enabled = enabled;
    this.grid = new Uint8Array(width * height);
  }

  isRevealed(x, y) {
    if (!this.enabled) return true;
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    return this.grid[y * this.width + x] === 1;
  }

  revealCircle(cx, cy, radius, worldMap = null) {
    const r2 = radius * radius;
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(this.width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(this.height - 1, Math.ceil(cy + radius));
    let newlyRevealed = 0;

    for (let y = minY; y <= maxY; y++) {
      const dy = y - cy;
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= r2) {
          const idx = y * this.width + x;
          if (this.grid[idx] === 0) {
            this.grid[idx] = 1;
            newlyRevealed++;
            if (worldMap) worldMap.markChunkDirtyAtTile(x, y);
          }
        }
      }
    }
    return newlyRevealed;
  }

  revealSkyAndSurfaceBand(surfaceHeights, margin = 4, worldMap = null) {
    for (let x = 0; x < this.width; x++) {
      const sy = (surfaceHeights && surfaceHeights[x]) || 22;
      for (let y = 0; y <= Math.min(this.height - 1, sy - 2); y++) {
        const idx = y * this.width + x;
        if (this.grid[idx] === 0) {
          this.grid[idx] = 1;
          if (worldMap) worldMap.markChunkDirtyAtTile(x, y);
        }
      }
    }
  }

  serialize() {
    return {
      width: this.width,
      height: this.height,
      enabled: this.enabled,
      grid: Array.from(this.grid)
    };
  }

  static deserialize(data, fallbackW = 200, fallbackH = 100) {
    const fog = new FogOfWar(data?.width || fallbackW, data?.height || fallbackH, data?.enabled ?? true);
    if (Array.isArray(data?.grid) && data.grid.length === fog.grid.length) {
      fog.grid.set(data.grid);
    }
    return fog;
  }
}
