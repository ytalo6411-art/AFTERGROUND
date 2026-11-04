export class Camera2D {
  constructor({ worldWidth = 200, worldHeight = 100, tileSize = 24 } = {}) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.tileSize = tileSize;
    this.zoom = 1.15;
    this.minZoom = 0.55;
    this.maxZoom = 2.25;
    this.x = (worldWidth * tileSize) / 2;
    this.y = 23 * tileSize;
    this.viewportWidth = 1280;
    this.viewportHeight = 720;
  }

  resize(width, height) {
    this.viewportWidth = Math.max(320, width);
    this.viewportHeight = Math.max(240, height);
    this.clamp();
  }

  centerOnTile(tx, ty) {
    this.x = (tx + 0.5) * this.tileSize;
    this.y = (ty + 0.5) * this.tileSize;
    this.clamp();
  }

  pan(dxScreen, dyScreen) {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
    this.clamp();
  }

  setZoom(nextZoom, pivotScreenX = this.viewportWidth / 2, pivotScreenY = this.viewportHeight / 2) {
    const beforeWorld = this.screenToWorld(pivotScreenX, pivotScreenY);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, nextZoom));
    const afterWorld = this.screenToWorld(pivotScreenX, pivotScreenY);
    this.x += beforeWorld.wx - afterWorld.wx;
    this.y += beforeWorld.wy - afterWorld.wy;
    this.clamp();
  }

  clamp() {
    const maxW = this.worldWidth * this.tileSize;
    const maxH = this.worldHeight * this.tileSize;
    this.x = Math.max(0, Math.min(maxW, this.x));
    this.y = Math.max(0, Math.min(maxH, this.y));
  }

  screenToWorld(sx, sy) {
    const wx = this.x + (sx - this.viewportWidth / 2) / this.zoom;
    const wy = this.y + (sy - this.viewportHeight / 2) / this.zoom;
    return {
      wx,
      wy,
      tx: Math.floor(wx / this.tileSize),
      ty: Math.floor(wy / this.tileSize)
    };
  }

  worldToScreen(wx, wy) {
    return {
      sx: (wx - this.x) * this.zoom + this.viewportWidth / 2,
      sy: (wy - this.y) * this.zoom + this.viewportHeight / 2
    };
  }

  getVisibleTileBounds(margin = 2) {
    const halfW = this.viewportWidth / 2 / this.zoom;
    const halfH = this.viewportHeight / 2 / this.zoom;
    const minTx = Math.max(0, Math.floor((this.x - halfW) / this.tileSize) - margin);
    const maxTx = Math.min(this.worldWidth - 1, Math.ceil((this.x + halfW) / this.tileSize) + margin);
    const minTy = Math.max(0, Math.floor((this.y - halfH) / this.tileSize) - margin);
    const maxTy = Math.min(this.worldHeight - 1, Math.ceil((this.y + halfH) / this.tileSize) + margin);
    return { minTx, maxTx, minTy, maxTy };
  }
}
