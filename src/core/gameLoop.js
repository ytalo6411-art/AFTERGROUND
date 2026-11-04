export class GameLoop {
  constructor({ onUpdate, onRender }) {
    this.onUpdate = onUpdate;
    this.onRender = onRender;
    this.running = false;
    this.rafId = null;
    this.fpsLimit = 60;
    this.lastTimestamp = 0;
    this.frameAccum = 0;

    // Telemetry
    this.fps = 60;
    this.framesThisSec = 0;
    this.fpsTimer = 0;
    this.simTimeMs = 0.2;
    this.renderTimeMs = 1.2;
  }

  setFpsLimit(limit) {
    this.fpsLimit = limit === 30 ? 30 : 60;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTimestamp = performance.now();
    this.rafId = requestAnimationFrame((ts) => this.tick(ts));
  }

  stop() {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  tick(timestamp) {
    if (!this.running) return;

    const rawDt = Math.min(0.25, Math.max(0.001, (timestamp - this.lastTimestamp) / 1000));
    this.lastTimestamp = timestamp;

    const isHidden = typeof document !== 'undefined' && document.hidden;
    const minFrameInterval = isHidden ? 0.25 : this.fpsLimit === 30 ? 1 / 31 : 0;
    this.frameAccum += rawDt;

    if (this.frameAccum >= minFrameInterval) {
      const dt = Math.min(0.1, this.frameAccum);
      this.frameAccum = 0;

      const t0 = performance.now();
      if (this.onUpdate) this.onUpdate(dt);
      const t1 = performance.now();

      if (!isHidden && this.onRender) {
        this.onRender(dt);
      }
      const t2 = performance.now();

      this.simTimeMs = this.simTimeMs * 0.85 + (t1 - t0) * 0.15;
      this.renderTimeMs = this.renderTimeMs * 0.85 + (t2 - t1) * 0.15;

      this.framesThisSec++;
      this.fpsTimer += dt;
      if (this.fpsTimer >= 1.0) {
        this.fps = Math.round(this.framesThisSec / this.fpsTimer);
        this.framesThisSec = 0;
        this.fpsTimer = 0;
      }
    }

    this.rafId = requestAnimationFrame((ts) => this.tick(ts));
  }
}
