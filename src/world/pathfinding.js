import { TILE_TYPES } from '../core/sprites.js';

export class Pathfinder {
  constructor(worldMap, buildingsManager) {
    this.worldMap = worldMap;
    this.buildingsManager = buildingsManager;
    this.cache = new Map();
    this.lastVersion = -1;
    this.maxCacheEntries = 200;
  }

  isWalkable(x, y) {
    if (!this.worldMap.inBounds(x, y)) return false;
    const tile = this.worldMap.getTile(x, y);

    // Check if there is a climbable or walkable infrastructure at (x, y)
    if (this.buildingsManager) {
      const b = this.buildingsManager.getBuildingAt(x, y);
      if (b) {
        const def = this.buildingsManager.getDefinition(b.type);
        if (def?.climbable || def?.walkable) return true;
      }
    }

    // Open space (air, tunnel, cave, vegetation) is walkable if supported from below or inside a tunnel/cave/building
    if (
      tile === TILE_TYPES.TUNNEL ||
      tile === TILE_TYPES.CAVE ||
      tile === TILE_TYPES.VEGETATION ||
      tile === TILE_TYPES.AIR
    ) {
      if (tile === TILE_TYPES.TUNNEL || tile === TILE_TYPES.CAVE) return true;
      const belowTile = this.worldMap.getTile(x, y + 1);
      if (this.worldMap.isSolid(x, y + 1) || belowTile === TILE_TYPES.TUNNEL) return true;
      if (this.buildingsManager) {
        const belowB = this.buildingsManager.getBuildingAt(x, y + 1);
        if (belowB) return true;
        const hereB = this.buildingsManager.getBuildingAt(x, y);
        if (hereB) return true;
      }
    }
    return false;
  }

  canClimb(x, y) {
    if (!this.worldMap.inBounds(x, y)) return false;
    if (this.buildingsManager) {
      const b = this.buildingsManager.getBuildingAt(x, y);
      if (b) {
        const def = this.buildingsManager.getDefinition(b.type);
        if (def?.climbable) return true;
      }
    }
    const tile = this.worldMap.getTile(x, y);
    return tile === TILE_TYPES.TUNNEL || tile === TILE_TYPES.CAVE;
  }

  findPath(startX, startY, goalX, goalY, maxSteps = 320) {
    const sx = Math.round(startX);
    const sy = Math.round(startY);
    const gx = Math.round(goalX);
    const gy = Math.round(goalY);

    if (sx === gx && sy === gy) return [{ x: gx, y: gy }];

    const currentVer = this.worldMap.version + (this.buildingsManager ? this.buildingsManager.version : 0);
    if (currentVer !== this.lastVersion) {
      this.cache.clear();
      this.lastVersion = currentVer;
    }

    const cacheKey = `${sx},${sy}->${gx},${gy}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey).map((p) => ({ ...p }));
    }

    const open = [{ x: sx, y: sy, g: 0, f: Math.abs(gx - sx) + Math.abs(gy - sy) }];
    const cameFrom = new Map();
    const gScore = new Map();
    const startKey = `${sx},${sy}`;
    gScore.set(startKey, 0);
    const closed = new Set();

    let bestNode = { x: sx, y: sy };
    let bestDist = Math.abs(gx - sx) + Math.abs(gy - sy);
    let iterations = 0;

    const dirs = [
      { dx: 1, dy: 0, cost: 1 },
      { dx: -1, dy: 0, cost: 1 },
      { dx: 0, dy: 1, cost: 1.1 },
      { dx: 0, dy: -1, cost: 1.1 },
      { dx: 1, dy: -1, cost: 1.45 },
      { dx: -1, dy: -1, cost: 1.45 },
      { dx: 1, dy: 1, cost: 1.45 },
      { dx: -1, dy: 1, cost: 1.45 }
    ];

    while (open.length > 0 && iterations < maxSteps) {
      iterations++;
      // Pop lowest f
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i;
      }
      const current = open.splice(bestIdx, 1)[0];
      const cKey = `${current.x},${current.y}`;

      const distToGoal = Math.abs(gx - current.x) + Math.abs(gy - current.y);
      if (distToGoal < bestDist) {
        bestDist = distToGoal;
        bestNode = { x: current.x, y: current.y };
      }

      if (current.x === gx && current.y === gy) {
        bestNode = { x: gx, y: gy };
        break;
      }

      closed.add(cKey);

      for (const d of dirs) {
        const nx = current.x + d.dx;
        const ny = current.y + d.dy;
        const nKey = `${nx},${ny}`;
        if (closed.has(nKey)) continue;

        const isGoalNeighbor = Math.abs(nx - gx) <= 1 && Math.abs(ny - gy) <= 1;
        if (!this.isWalkable(nx, ny) && !(nx === gx && ny === gy && isGoalNeighbor)) continue;

        if (d.dy !== 0 && d.dx === 0) {
          if (!this.canClimb(current.x, current.y) && !this.canClimb(nx, ny)) continue;
        }

        const tentativeG = current.g + d.cost;
        const prevG = gScore.get(nKey);
        if (prevG === undefined || tentativeG < prevG) {
          cameFrom.set(nKey, current);
          gScore.set(nKey, tentativeG);
          const h = Math.abs(gx - nx) + Math.abs(gy - ny);
          open.push({ x: nx, y: ny, g: tentativeG, f: tentativeG + h * 1.15 });
        }
      }
    }

    // Reconstruct path from bestNode
    const path = [];
    let cur = bestNode;
    while (cur && !(cur.x === sx && cur.y === sy)) {
      path.push({ x: cur.x, y: cur.y });
      cur = cameFrom.get(`${cur.x},${cur.y}`);
    }
    path.reverse();

    if (this.cache.size >= this.maxCacheEntries) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(cacheKey, path);
    return path.map((p) => ({ ...p }));
  }
}
