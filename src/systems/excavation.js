import { TILE_TYPES } from '../core/sprites.js';
import balancingData from '../data/balancing.json';

export class ExcavationSystem {
  constructor(worldMap, resourceManager, researchManager, fog) {
    this.worldMap = worldMap;
    this.resourceManager = resourceManager;
    this.researchManager = researchManager;
    this.fog = fog;
    this.totalExcavated = 0;
  }

  canExcavateTile(x, y) {
    if (!this.worldMap.inBounds(x, y) || y >= this.worldMap.height - 1) {
      return { ok: false, reason: 'Rocha Matriz intransponível / Unbreakable Bedrock' };
    }
    const tile = this.worldMap.getTile(x, y);
    if (tile === TILE_TYPES.AIR || tile === TILE_TYPES.TUNNEL || tile === TILE_TYPES.CAVE) {
      return { ok: false, reason: 'Espaço já aberto / Already open' };
    }
    if (tile === TILE_TYPES.BEDROCK) {
      return { ok: false, reason: 'Rocha Matriz / Bedrock' };
    }

    const tInfo = balancingData.terrain[String(tile)];
    if (!tInfo || tInfo.hardness <= 0) {
      return { ok: false, reason: 'Não escavável / Not excavatable' };
    }

    if (tInfo.requiresTech && this.researchManager && !this.researchManager.isUnlocked(tInfo.requiresTech)) {
      return {
        ok: false,
        reason: `Requer tecnologia: ${tInfo.requiresTech}`
      };
    }

    return { ok: true, tile, info: tInfo };
  }

  toggleMarkTile(x, y) {
    const key = `${x},${y}`;
    if (this.worldMap.excavationTasks.has(key)) {
      this.worldMap.excavationTasks.delete(key);
      return { action: 'unmarked', x, y };
    }

    const check = this.canExcavateTile(x, y);
    if (!check.ok) {
      return { action: 'rejected', reason: check.reason, x, y };
    }

    this.worldMap.excavationTasks.set(key, {
      x,
      y,
      progress: 0,
      hardness: check.info.hardness,
      tileType: check.tile
    });
    return { action: 'marked', x, y };
  }

  markArea(x1, y1, x2, y2) {
    const minX = Math.max(1, Math.min(x1, x2));
    const maxX = Math.min(this.worldMap.width - 2, Math.max(x1, x2));
    const minY = Math.max(1, Math.min(y1, y2));
    const maxY = Math.min(this.worldMap.height - 2, Math.max(y1, y2));

    let markedCount = 0;
    let lastRejectedReason = null;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const key = `${x},${y}`;
        if (this.worldMap.excavationTasks.has(key)) continue;
        const check = this.canExcavateTile(x, y);
        if (check.ok) {
          this.worldMap.excavationTasks.set(key, {
            x,
            y,
            progress: 0,
            hardness: check.info.hardness,
            tileType: check.tile
          });
          markedCount++;
        } else {
          lastRejectedReason = check.reason;
        }
      }
    }

    return { markedCount, lastRejectedReason };
  }

  update(dt, minerCount = 1, techSpeedBonus = 0) {
    const finished = [];
    if (this.worldMap.excavationTasks.size === 0) return finished;

    // Base automated mining drone + active miners
    const digPowerPerSec = (24 + minerCount * 16) * (1 + techSpeedBonus);
    const activeBatch = Array.from(this.worldMap.excavationTasks.values()).slice(0, 4);
    const powerPerTile = digPowerPerSec / Math.max(1, activeBatch.length);

    for (const task of activeBatch) {
      task.progress += powerPerTile * dt;
      if (task.progress >= task.hardness) {
        const currentTile = this.worldMap.getTile(task.x, task.y);
        const tInfo = balancingData.terrain[String(currentTile)];
        const surfY = this.worldMap.getSurfaceY(task.x);
        const newTile = task.y < surfY ? TILE_TYPES.AIR : TILE_TYPES.TUNNEL;

        this.worldMap.setTile(task.x, task.y, newTile);
        this.worldMap.excavationTasks.delete(`${task.x},${task.y}`);
        this.totalExcavated++;

        const yieldEarned = {};
        if (tInfo && tInfo.yield) {
          for (const [resId, val] of Object.entries(tInfo.yield)) {
            this.resourceManager.add(resId, val);
            yieldEarned[resId] = val;
          }
        }

        if (this.fog) {
          this.fog.revealCircle(task.x, task.y, 7, this.worldMap);
        }

        finished.push({
          x: task.x,
          y: task.y,
          oldTile: currentTile,
          yieldEarned
        });
      }
    }

    return finished;
  }
}
