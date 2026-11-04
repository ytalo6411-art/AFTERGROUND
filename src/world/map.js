import { TILE_TYPES } from '../core/sprites.js';
import { generateProceduralWorld } from './generation.js';
import balancingData from '../data/balancing.json';

export class WorldMap {
  constructor({ width = 200, height = 100, seed = 'AEGIS-2241', generated = null } = {}) {
    const gen = generated || generateProceduralWorld({ width, height, seed });
    this.width = gen.width;
    this.height = gen.height;
    this.seed = gen.seed;
    this.centerX = gen.centerX;
    this.baseSurfaceY = gen.baseSurfaceY;
    this.galleryY = gen.galleryY;
    this.surfaceHeights = gen.surfaceHeights;
    this.tiles = gen.tiles;
    this.excavationTasks = new Map(); // key "x,y" -> { x, y, progress, hardness }
    this.version = 1;
    this.dirtyChunks = new Set();
  }

  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  idx(x, y) {
    return y * this.width + x;
  }

  getTile(x, y) {
    if (!this.inBounds(x, y)) return TILE_TYPES.BEDROCK;
    return this.tiles[y * this.width + x];
  }

  setTile(x, y, type) {
    if (!this.inBounds(x, y)) return false;
    const index = y * this.width + x;
    if (this.tiles[index] === type) return false;
    this.tiles[index] = type;
    this.version++;
    this.markChunkDirtyAtTile(x, y);
    return true;
  }

  markChunkDirtyAtTile(x, y) {
    const chunkSize = balancingData.world.chunkSize || 16;
    const cx = Math.floor(x / chunkSize);
    const cy = Math.floor(y / chunkSize);
    this.dirtyChunks.add(`${cx},${cy}`);
  }

  isSolid(x, y) {
    const t = this.getTile(x, y);
    const info = balancingData.terrain[String(t)];
    return info ? Boolean(info.solid) : false;
  }

  isOpenSpace(x, y) {
    const t = this.getTile(x, y);
    return (
      t === TILE_TYPES.AIR ||
      t === TILE_TYPES.TUNNEL ||
      t === TILE_TYPES.CAVE ||
      t === TILE_TYPES.VEGETATION
    );
  }

  getSurfaceY(x) {
    if (x < 0 || x >= this.width) return this.baseSurfaceY;
    return this.surfaceHeights[x] || this.baseSurfaceY;
  }

  serialize() {
    return {
      width: this.width,
      height: this.height,
      seed: this.seed,
      centerX: this.centerX,
      baseSurfaceY: this.baseSurfaceY,
      galleryY: this.galleryY,
      surfaceHeights: Array.from(this.surfaceHeights),
      tiles: Array.from(this.tiles),
      excavationTasks: Array.from(this.excavationTasks.values())
    };
  }

  static deserialize(data) {
    const map = new WorldMap({
      width: data.width,
      height: data.height,
      seed: data.seed,
      generated: {
        width: data.width,
        height: data.height,
        seed: data.seed,
        centerX: data.centerX ?? Math.floor(data.width / 2),
        baseSurfaceY: data.baseSurfaceY ?? 22,
        galleryY: data.galleryY ?? 26,
        surfaceHeights: new Uint8Array(data.surfaceHeights || []),
        tiles: new Uint8Array(data.tiles || [])
      }
    });
    if (Array.isArray(data.excavationTasks)) {
      for (const task of data.excavationTasks) {
        map.excavationTasks.set(`${task.x},${task.y}`, { ...task });
      }
    }
    return map;
  }
}
