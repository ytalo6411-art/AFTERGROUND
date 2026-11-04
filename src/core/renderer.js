import { spriteAtlas } from './sprites.js';
import { ChunkManager } from '../world/chunks.js';

export class GameRenderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.camera = camera;
    this.chunkManager = null;
    this.boundWorldMap = null;
    this.graphicsQuality = 'high'; // 'low' | 'medium' | 'high'
    this.animTime = 0;
    this.visibleChunksCount = 0;

    // Pre-allocated object pool for floating feedback texts (no per-frame allocation)
    this.floatingTexts = Array.from({ length: 24 }, () => ({
      active: false,
      x: 0,
      y: 0,
      text: '',
      color: '#4ade80',
      ttl: 0,
      maxTtl: 1.4
    }));

    // Pre-allocated weather particles pool
    this.weatherParticles = Array.from({ length: 60 }, (_, i) => ({
      x: (i * 73) % 1600,
      y: (i * 41) % 600,
      speedY: 140 + (i % 5) * 25,
      speedX: -25
    }));
  }

  bindState(gameState) {
    spriteAtlas.init();
    this.boundWorldMap = gameState.worldMap;
    this.chunkManager = new ChunkManager(
      gameState.worldMap,
      gameState.fog,
      this.camera.tileSize,
      16
    );
  }

  spawnFloatingText(tx, ty, text, color = '#4ade80') {
    for (const item of this.floatingTexts) {
      if (!item.active) {
        item.active = true;
        item.x = (tx + 0.5) * this.camera.tileSize;
        item.y = ty * this.camera.tileSize;
        item.text = text;
        item.color = color;
        item.ttl = 1.4;
        item.maxTtl = 1.4;
        return;
      }
    }
  }

  render(gameState, inputState, dt = 0.016) {
    if (!gameState || !this.ctx) return;
    if (this.boundWorldMap !== gameState.worldMap) {
      this.bindState(gameState);
    }

    this.animTime += dt;
    this.chunkManager.syncDirtyFromMap();

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const tileSize = this.camera.tileSize;

    // 1. Sky & Subterranean Strata Background
    this.drawAtmosphereBackground(ctx, w, h, gameState);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);
    ctx.imageSmoothingEnabled = false;

    // 2. Frustum Culling Bounds
    const bounds = this.camera.getVisibleTileBounds(2);
    const chunkSize = this.chunkManager.chunkSize;
    const minCx = Math.max(0, Math.floor(bounds.minTx / chunkSize));
    const maxCx = Math.min(this.chunkManager.chunksX - 1, Math.floor(bounds.maxTx / chunkSize));
    const minCy = Math.max(0, Math.floor(bounds.minTy / chunkSize));
    const maxCy = Math.min(this.chunkManager.chunksY - 1, Math.floor(bounds.maxTy / chunkSize));

    // Draw underground backdrop behind excavated tunnels inside visible bounds
    const surfPixelY = (gameState.worldMap.baseSurfaceY - 1) * tileSize;
    ctx.fillStyle = '#0c0a09';
    ctx.fillRect(
      bounds.minTx * tileSize,
      surfPixelY,
      (bounds.maxTx - bounds.minTx + 1) * tileSize,
      (bounds.maxTy - gameState.worldMap.baseSurfaceY + 2) * tileSize
    );

    // 3. Draw Visible Cached Chunks
    let chunksDrawn = 0;
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const chunkCanvas = this.chunkManager.getOrRenderChunk(cx, cy);
        if (chunkCanvas) {
          ctx.drawImage(
            chunkCanvas,
            cx * chunkSize * tileSize,
            cy * chunkSize * tileSize
          );
          chunksDrawn++;
        }
      }
    }
    this.visibleChunksCount = chunksDrawn;

    // 4. Draw Buildings within visible bounds
    const isPowered = gameState.powerStatus?.isPowered !== false;
    for (const b of gameState.buildingsManager.list) {
      if (
        b.x + b.width < bounds.minTx ||
        b.x > bounds.maxTx ||
        b.y + b.height < bounds.minTy ||
        b.y > bounds.maxTy
      ) {
        continue;
      }

      const def = gameState.buildingsManager.getDefinition(b.type);
      if (!def) continue;

      const px = b.x * tileSize;
      const py = b.y * tileSize;
      const bw = b.width * tileSize;
      const bh = b.height * tileSize;

      spriteAtlas.drawBuilding(ctx, b, def, px, py, bw, bh, this.animTime, isPowered);

      if (gameState.selectedBuildingId === b.id) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.strokeRect(px - 1, py - 1, bw + 2, bh + 2);
      }
    }

    // 5. Draw Active Excavation Tasks within visible bounds
    for (const task of gameState.worldMap.excavationTasks.values()) {
      if (
        task.x < bounds.minTx ||
        task.x > bounds.maxTx ||
        task.y < bounds.minTy ||
        task.y > bounds.maxTy
      ) {
        continue;
      }

      const px = task.x * tileSize;
      const py = task.y * tileSize;
      ctx.fillStyle = 'rgba(245, 158, 11, 0.28)';
      ctx.fillRect(px, py, tileSize, tileSize);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px + 1, py + 1, tileSize - 2, tileSize - 2);

      const pct = Math.max(0, Math.min(1, task.progress / Math.max(1, task.hardness)));
      ctx.fillStyle = '#090d16';
      ctx.fillRect(px + 2, py + tileSize - 5, tileSize - 4, 3);
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(px + 2, py + tileSize - 5, (tileSize - 4) * pct, 3);
    }

    // 6. Draw Citizens within visible bounds
    for (const c of gameState.populationManager.citizens) {
      if (c.onExpedition) continue;
      if (
        c.x < bounds.minTx - 1 ||
        c.x > bounds.maxTx + 1 ||
        c.y < bounds.minTy - 1 ||
        c.y > bounds.maxTy + 1
      ) {
        continue;
      }
      spriteAtlas.drawCitizen(
        ctx,
        c,
        tileSize,
        this.animTime,
        gameState.selectedCitizenId === c.id
      );
    }

    // 7. Draw Tool Previews (Build Ghost / Excavation Drag Box / Hover Tile)
    if (inputState && inputState.hoverTile) {
      const { tx, ty } = inputState.hoverTile;
      if (gameState.activeTool === 'build' && gameState.selectedBuildingType) {
        const check = gameState.constructionSystem.validatePlacement(
          gameState.selectedBuildingType,
          tx,
          ty
        );
        const def = gameState.buildingsManager.getDefinition(gameState.selectedBuildingType);
        if (def) {
          for (const cell of check.cells) {
            ctx.fillStyle = cell.valid
              ? 'rgba(74, 222, 128, 0.32)'
              : 'rgba(239, 68, 68, 0.38)';
            ctx.fillRect(cell.x * tileSize, cell.y * tileSize, tileSize, tileSize);
            ctx.strokeStyle = cell.valid ? '#4ade80' : '#ef4444';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(
              cell.x * tileSize + 0.5,
              cell.y * tileSize + 0.5,
              tileSize - 1,
              tileSize - 1
            );
          }
        }
      } else if (gameState.activeTool === 'excavate') {
        if (inputState.dragStartTile) {
          const x1 = Math.min(inputState.dragStartTile.tx, tx);
          const x2 = Math.max(inputState.dragStartTile.tx, tx);
          const y1 = Math.min(inputState.dragStartTile.ty, ty);
          const y2 = Math.max(inputState.dragStartTile.ty, ty);
          ctx.fillStyle = 'rgba(251, 191, 36, 0.24)';
          ctx.fillRect(
            x1 * tileSize,
            y1 * tileSize,
            (x2 - x1 + 1) * tileSize,
            (y2 - y1 + 1) * tileSize
          );
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2;
          ctx.strokeRect(
            x1 * tileSize,
            y1 * tileSize,
            (x2 - x1 + 1) * tileSize,
            (y2 - y1 + 1) * tileSize
          );
        } else {
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2;
          ctx.strokeRect(tx * tileSize, ty * tileSize, tileSize, tileSize);
        }
      } else if (gameState.activeTool === 'demolish') {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.28)';
        ctx.fillRect(tx * tileSize, ty * tileSize, tileSize, tileSize);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(tx * tileSize, ty * tileSize, tileSize, tileSize);
      } else {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
        ctx.lineWidth = 1;
        ctx.strokeRect(tx * tileSize, ty * tileSize, tileSize, tileSize);
      }
    }

    // 8. Floating Resource / Action Feedback Texts
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    for (const ft of this.floatingTexts) {
      if (!ft.active) continue;
      ft.ttl -= dt;
      ft.y -= 18 * dt;
      if (ft.ttl <= 0) {
        ft.active = false;
        continue;
      }
      ctx.globalAlpha = Math.max(0, ft.ttl / ft.maxTtl);
      ctx.fillStyle = '#090d16';
      ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // 9. Weather screen-space overlay (if quality is medium or high)
    if (this.graphicsQuality !== 'low') {
      this.drawWeatherOverlay(ctx, w, h, gameState.eventsManager.weather, dt);
    }
  }

  drawAtmosphereBackground(ctx, w, h, gameState) {
    const phase = gameState.getDayPhaseRatio(); // 0..1
    const isDay = phase >= 0.18 && phase <= 0.78;
    const weather = gameState.eventsManager.weather;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    if (weather === 'acid_storm') {
      grad.addColorStop(0, '#1a2e05');
      grad.addColorStop(0.5, '#365314');
      grad.addColorStop(1, '#090d16');
    } else if (isDay) {
      grad.addColorStop(0, '#0f2942');
      grad.addColorStop(0.45, '#1e3a5f');
      grad.addColorStop(1, '#090d16');
    } else {
      grad.addColorStop(0, '#030712');
      grad.addColorStop(0.5, '#0f172a');
      grad.addColorStop(1, '#05070c');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle stars at night
    if (!isDay && this.graphicsQuality === 'high') {
      ctx.fillStyle = 'rgba(226, 232, 240, 0.55)';
      for (let i = 0; i < 28; i++) {
        const sx = (i * 137) % w;
        const sy = (i * 53) % Math.floor(h * 0.45);
        ctx.fillRect(sx, sy, 2, 2);
      }
    }
  }

  drawWeatherOverlay(ctx, w, h, weather, dt) {
    if (weather === 'clear') return;

    const count = this.graphicsQuality === 'high' ? 45 : 22;
    ctx.strokeStyle =
      weather === 'acid_storm'
        ? 'rgba(163, 230, 53, 0.35)'
        : weather === 'rain'
        ? 'rgba(56, 189, 248, 0.38)'
        : weather === 'biolum_mist'
        ? 'rgba(192, 132, 252, 0.32)'
        : 'rgba(251, 146, 60, 0.22)';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const p = this.weatherParticles[i];
      p.y = (p.y + p.speedY * dt) % h;
      p.x = (p.x + p.speedX * dt + w) % w;
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 3, p.y + 9);
    }
    ctx.stroke();
  }
}
