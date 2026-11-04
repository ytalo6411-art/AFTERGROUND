import { spriteAtlas, TILE_TYPES } from '../core/sprites.js';

export class ChunkManager {
  constructor(worldMap, fog, tileSize = 24, chunkSize = 16) {
    this.worldMap = worldMap;
    this.fog = fog;
    this.tileSize = tileSize;
    this.chunkSize = chunkSize;
    this.chunksX = Math.ceil(worldMap.width / chunkSize);
    this.chunksY = Math.ceil(worldMap.height / chunkSize);
    this.cache = new Map(); // "cx,cy" -> { canvas, dirty }
  }

  invalidateAll() {
    for (const entry of this.cache.values()) {
      entry.dirty = true;
    }
  }

  syncDirtyFromMap() {
    if (this.worldMap.dirtyChunks.size === 0) return;
    for (const key of this.worldMap.dirtyChunks) {
      const entry = this.cache.get(key);
      if (entry) entry.dirty = true;
    }
    this.worldMap.dirtyChunks.clear();
  }

  getOrRenderChunk(cx, cy) {
    const key = `${cx},${cy}`;
    let entry = this.cache.get(key);
    if (!entry && typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = this.chunkSize * this.tileSize;
      canvas.height = this.chunkSize * this.tileSize;
      entry = { canvas, dirty: true };
      this.cache.set(key, entry);
    }
    if (entry && entry.dirty) {
      this.renderChunk(entry.canvas, cx, cy);
      entry.dirty = false;
    }
    return entry ? entry.canvas : null;
  }

  renderChunk(canvas, cx, cy) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    const startX = cx * this.chunkSize;
    const startY = cy * this.chunkSize;
    const endX = Math.min(this.worldMap.width, startX + this.chunkSize);
    const endY = Math.min(this.worldMap.height, startY + this.chunkSize);

    for (let y = startY; y < endY; y++) {
      const py = (y - startY) * this.tileSize;
      for (let x = startX; x < endX; x++) {
        const px = (x - startX) * this.tileSize;
        const revealed = this.fog ? this.fog.isRevealed(x, y) : true;
        if (!revealed) {
          ctx.fillStyle = '#05070d';
          ctx.fillRect(px, py, this.tileSize, this.tileSize);
          continue;
        }
        const tile = this.worldMap.getTile(x, y);
        if (tile !== TILE_TYPES.AIR) {
          spriteAtlas.drawTile(ctx, tile, x, y, px, py);
        }
      }
    }
  }
}
