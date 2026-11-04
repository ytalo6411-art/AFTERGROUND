export class InputController {
  constructor(canvas, camera, callbacks = {}) {
    this.canvas = canvas;
    this.camera = camera;
    this.callbacks = callbacks;

    this.hoverTile = null;
    this.dragStartTile = null;
    this.isPanning = false;
    this.isDraggingTool = false;
    this.panMoved = false;
    this.lastMouse = { x: 0, y: 0 };
    this.keysDown = new Set();

    this.bindEvents();
  }

  bindEvents() {
    if (!this.canvas || typeof window === 'undefined') return;

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('mousedown', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      this.lastMouse = { x: sx, y: sy };
      this.panMoved = false;
      const worldPos = this.camera.screenToWorld(sx, sy);
      this.hoverTile = { tx: worldPos.tx, ty: worldPos.ty };

      // Right-click or Middle-click pans camera (or cancels build tool on quick right-click)
      if (e.button === 1 || e.button === 2) {
        this.isPanning = true;
        return;
      }

      if (e.button === 0) {
        const activeTool = this.callbacks.getActiveTool ? this.callbacks.getActiveTool() : 'select';
        if (activeTool === 'excavate') {
          this.isDraggingTool = true;
          this.dragStartTile = { tx: worldPos.tx, ty: worldPos.ty };
        } else if (activeTool === 'select') {
          this.isPanning = true;
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const dx = sx - this.lastMouse.x;
      const dy = sy - this.lastMouse.y;

      if (this.isPanning) {
        if (Math.hypot(dx, dy) > 3) this.panMoved = true;
        this.camera.pan(dx, dy);
      }

      this.lastMouse = { x: sx, y: sy };
      const worldPos = this.camera.screenToWorld(sx, sy);
      this.hoverTile = { tx: worldPos.tx, ty: worldPos.ty };
      if (this.callbacks.onHoverTile) {
        this.callbacks.onHoverTile(this.hoverTile, sx, sy);
      }
    });

    window.addEventListener('mouseup', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const worldPos = this.camera.screenToWorld(sx, sy);

      if (e.button === 2 && !this.panMoved) {
        if (this.callbacks.onRightClick) this.callbacks.onRightClick();
      }

      if (e.button === 0) {
        if (this.isDraggingTool && this.dragStartTile) {
          if (this.callbacks.onExcavateArea) {
            this.callbacks.onExcavateArea(
              this.dragStartTile.tx,
              this.dragStartTile.ty,
              worldPos.tx,
              worldPos.ty
            );
          }
        } else if (!this.panMoved && e.target === this.canvas) {
          if (this.callbacks.onTileClick) {
            this.callbacks.onTileClick(worldPos.tx, worldPos.ty, worldPos.wx, worldPos.wy);
          }
        }
      }

      this.isPanning = false;
      this.isDraggingTool = false;
      this.dragStartTile = null;
    });

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.12 : 0.89;
        this.camera.setZoom(this.camera.zoom * factor, sx, sy);
      },
      { passive: false }
    );

    // Touch support for mobile & tablets
    this.canvas.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 1) {
          const touch = e.touches[0];
          const rect = this.canvas.getBoundingClientRect();
          const sx = touch.clientX - rect.left;
          const sy = touch.clientY - rect.top;
          this.lastMouse = { x: sx, y: sy };
          this.panMoved = false;
          this.isPanning = true;
          const worldPos = this.camera.screenToWorld(sx, sy);
          this.hoverTile = { tx: worldPos.tx, ty: worldPos.ty };
        }
      },
      { passive: true }
    );

    this.canvas.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length === 1 && this.isPanning) {
          const touch = e.touches[0];
          const rect = this.canvas.getBoundingClientRect();
          const sx = touch.clientX - rect.left;
          const sy = touch.clientY - rect.top;
          const dx = sx - this.lastMouse.x;
          const dy = sy - this.lastMouse.y;
          if (Math.hypot(dx, dy) > 4) this.panMoved = true;
          this.camera.pan(dx, dy);
          this.lastMouse = { x: sx, y: sy };
          const worldPos = this.camera.screenToWorld(sx, sy);
          this.hoverTile = { tx: worldPos.tx, ty: worldPos.ty };
        }
      },
      { passive: true }
    );

    this.canvas.addEventListener('touchend', () => {
      if (!this.panMoved && this.hoverTile && this.callbacks.onTileClick) {
        this.callbacks.onTileClick(
          this.hoverTile.tx,
          this.hoverTile.ty,
          this.hoverTile.tx * this.camera.tileSize,
          this.hoverTile.ty * this.camera.tileSize
        );
      }
      this.isPanning = false;
    });

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) {
        return;
      }
      this.keysDown.add(e.key.toLowerCase());
      if (this.callbacks.onKeyDown) {
        this.callbacks.onKeyDown(e.key, e);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.key.toLowerCase());
    });
  }

  updateKeyboardPan(dt) {
    const panSpeed = 420 * dt;
    let dx = 0;
    let dy = 0;
    if (this.keysDown.has('w') || this.keysDown.has('arrowup')) dy += panSpeed;
    if (this.keysDown.has('s') || this.keysDown.has('arrowdown')) dy -= panSpeed;
    if (this.keysDown.has('a') || this.keysDown.has('arrowleft')) dx += panSpeed;
    if (this.keysDown.has('d') || this.keysDown.has('arrowright')) dx -= panSpeed;
    if (dx !== 0 || dy !== 0) {
      this.camera.pan(dx, dy);
    }
  }
}
