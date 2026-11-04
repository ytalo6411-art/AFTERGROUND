import { Camera2D } from './camera.js';
import { GameState } from './state.js';
import { GameRenderer } from './renderer.js';
import { InputController } from './input.js';
import { GameLoop } from './gameLoop.js';
import { audio } from './audio.js';
import { setLanguage, getLanguage, localize } from './i18n.js';
import { saveManager } from '../save/save.js';

export class AftergroundEngine {
  constructor(canvas, uiCallbacks = {}) {
    this.canvas = canvas;
    this.uiCallbacks = uiCallbacks;

    this.camera = new Camera2D({ worldWidth: 200, worldHeight: 100, tileSize: 24 });
    this.renderer = new GameRenderer(canvas, this.camera);
    this.state = null;
    this.settings = null;
    this.autosaveTimer = 0;
    this.uiRefreshTimer = 0;

    this.input = new InputController(canvas, this.camera, {
      getActiveTool: () => (this.state ? this.state.activeTool : 'select'),
      onTileClick: (tx, ty, wx, wy) => this.handleTileClick(tx, ty, wx, wy),
      onExcavateArea: (x1, y1, x2, y2) => this.handleExcavateArea(x1, y1, x2, y2),
      onRightClick: () => this.setTool('select'),
      onHoverTile: (tile, sx, sy) => {
        if (this.uiCallbacks.onHoverTile) this.uiCallbacks.onHoverTile(tile, sx, sy);
      },
      onKeyDown: (key, ev) => this.handleKeyDown(key, ev)
    });

    this.loop = new GameLoop({
      onUpdate: (dt) => this.update(dt),
      onRender: (dt) => this.render(dt)
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.handleResize());
      window.addEventListener('beforeunload', () => {
        if (this.state) {
          saveManager.saveGameState(this.state, 'autosave');
        }
      });
      this.handleResize();
    }
  }

  handleResize() {
    if (!this.canvas || typeof window === 'undefined') return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = w;
    this.canvas.height = h;
    this.camera.resize(w, h);
  }

  async init() {
    this.settings = await saveManager.loadSettings();
    this.applySettings(this.settings);
    this.loop.start();
  }

  applySettings(nextSettings) {
    this.settings = { ...this.settings, ...nextSettings };
    setLanguage(this.settings.language || 'pt-BR');
    audio.setVolumes({
      master: this.settings.masterVolume ?? 0.8,
      music: this.settings.musicVolume ?? 0.45,
      sfx: this.settings.sfxVolume ?? 0.8,
      muted: Boolean(this.settings.muted)
    });
    this.renderer.graphicsQuality = this.settings.graphicsQuality || 'high';
    this.loop.setFpsLimit(this.settings.fpsLimit || 60);
    if (this.uiCallbacks.onSettingsApplied) {
      this.uiCallbacks.onSettingsApplied(this.settings);
    }
  }

  startNewWorld({ worldName = 'Nova Aegis', seed = 'AEGIS-2241', difficulty = 'normal' } = {}) {
    this.state = new GameState({
      worldName: worldName.trim() || 'Nova Aegis',
      seed: seed.trim() || `AEGIS-${Math.floor(1000 + Math.random() * 9000)}`,
      difficulty
    });
    this.state.setupStarterColony();
    this.camera.worldWidth = this.state.worldMap.width;
    this.camera.worldHeight = this.state.worldMap.height;
    this.camera.centerOnTile(this.state.worldMap.centerX, this.state.worldMap.baseSurfaceY - 1);
    this.renderer.bindState(this.state);
    audio.startAmbientMusic();
    saveManager.saveGameState(this.state, 'autosave');
    if (this.uiCallbacks.onWorldLoaded) {
      this.uiCallbacks.onWorldLoaded(this.state);
    }
    return this.state;
  }

  loadFromPayload(payload) {
    this.state = GameState.deserialize(payload);
    this.camera.worldWidth = this.state.worldMap.width;
    this.camera.worldHeight = this.state.worldMap.height;
    this.camera.centerOnTile(this.state.worldMap.centerX, this.state.worldMap.baseSurfaceY - 1);
    this.renderer.bindState(this.state);
    audio.startAmbientMusic();
    if (this.uiCallbacks.onWorldLoaded) {
      this.uiCallbacks.onWorldLoaded(this.state);
    }
    return this.state;
  }

  setTool(tool, buildingType = null) {
    if (!this.state) return;
    this.state.activeTool = tool;
    this.state.selectedBuildingType = buildingType;
    audio.playClick();
    if (this.uiCallbacks.onToolChanged) {
      this.uiCallbacks.onToolChanged(tool, buildingType);
    }
  }

  handleTileClick(tx, ty, wx, wy) {
    if (!this.state) return;
    const st = this.state;

    if (st.activeTool === 'build' && st.selectedBuildingType) {
      const res = st.constructionSystem.placeBuilding(st.selectedBuildingType, tx, ty);
      if (res.ok) {
        audio.playBuild();
        this.renderer.spawnFloatingText(tx, ty, 'Obra Iniciada', '#fbbf24');
        if (this.uiCallbacks.onStateChanged) this.uiCallbacks.onStateChanged();
      } else {
        audio.playAlert();
        if (this.uiCallbacks.onNotify) {
          this.uiCallbacks.onNotify(res.reason, 'warning');
        }
      }
      return;
    }

    if (st.activeTool === 'excavate') {
      const res = st.excavationSystem.toggleMarkTile(tx, ty);
      if (res.action === 'marked') {
        audio.playDig();
      } else if (res.action === 'rejected' && res.reason) {
        if (this.uiCallbacks.onNotify) this.uiCallbacks.onNotify(res.reason, 'warning');
      }
      return;
    }

    if (st.activeTool === 'demolish') {
      const b = st.buildingsManager.getBuildingAt(tx, ty);
      if (b) {
        const res = st.constructionSystem.demolishBuilding(b.id);
        if (res.ok) {
          audio.playDig();
          st.selectedBuildingId = null;
          this.renderer.spawnFloatingText(tx, ty, 'Demolido', '#ef4444');
          if (this.uiCallbacks.onSelectionChanged) this.uiCallbacks.onSelectionChanged(null, null);
          if (this.uiCallbacks.onStateChanged) this.uiCallbacks.onStateChanged();
        } else if (this.uiCallbacks.onNotify) {
          this.uiCallbacks.onNotify(res.reason, 'warning');
        }
      }
      return;
    }

    // Default 'select' tool: check citizen first, then building
    const tileX = wx / this.camera.tileSize;
    const tileY = wy / this.camera.tileSize;
    let clickedCitizen = null;
    for (const c of st.populationManager.citizens) {
      if (c.onExpedition) continue;
      if (Math.hypot(c.x + 0.5 - tileX, c.y + 0.5 - tileY) <= 0.85) {
        clickedCitizen = c;
        break;
      }
    }

    if (clickedCitizen) {
      st.selectedCitizenId = clickedCitizen.id;
      st.selectedBuildingId = null;
      audio.playClick();
      if (this.uiCallbacks.onSelectionChanged) {
        this.uiCallbacks.onSelectionChanged('citizen', clickedCitizen);
      }
      return;
    }

    const clickedBuilding = st.buildingsManager.getBuildingAt(tx, ty);
    if (clickedBuilding) {
      st.selectedBuildingId = clickedBuilding.id;
      st.selectedCitizenId = null;
      audio.playClick();
      if (this.uiCallbacks.onSelectionChanged) {
        this.uiCallbacks.onSelectionChanged('building', clickedBuilding);
      }
      return;
    }

    st.selectedBuildingId = null;
    st.selectedCitizenId = null;
    if (this.uiCallbacks.onSelectionChanged) {
      this.uiCallbacks.onSelectionChanged(null, null);
    }
  }

  handleExcavateArea(x1, y1, x2, y2) {
    if (!this.state) return;
    if (x1 === x2 && y1 === y2) {
      const single = this.state.excavationSystem.toggleMarkTile(x1, y1);
      if (single.action === 'marked') audio.playDig();
      else if (single.action === 'rejected' && this.uiCallbacks.onNotify) {
        this.uiCallbacks.onNotify(single.reason, 'warning');
      }
      return;
    }
    const { markedCount, lastRejectedReason } = this.state.excavationSystem.markArea(x1, y1, x2, y2);
    if (markedCount > 0) {
      audio.playDig();
      if (this.uiCallbacks.onNotify) {
        this.uiCallbacks.onNotify(`${markedCount} blocos marcados para escavação.`, 'info');
      }
    } else if (lastRejectedReason && this.uiCallbacks.onNotify) {
      this.uiCallbacks.onNotify(lastRejectedReason, 'warning');
    }
  }

  handleKeyDown(key, ev) {
    if (!this.state) return;
    const k = key.toLowerCase();

    if (key === ' ') {
      ev.preventDefault();
      this.state.speed = this.state.speed === 0 ? 1 : 0;
      if (this.uiCallbacks.onStateChanged) this.uiCallbacks.onStateChanged();
    } else if (k === '1') {
      this.state.speed = 1;
      if (this.uiCallbacks.onStateChanged) this.uiCallbacks.onStateChanged();
    } else if (k === '2') {
      this.state.speed = 2;
      if (this.uiCallbacks.onStateChanged) this.uiCallbacks.onStateChanged();
    } else if (k === '3') {
      this.state.speed = 4;
      if (this.uiCallbacks.onStateChanged) this.uiCallbacks.onStateChanged();
    } else if (k === 'e') {
      this.setTool(this.state.activeTool === 'excavate' ? 'select' : 'excavate');
    } else if (k === 'x') {
      this.setTool(this.state.activeTool === 'demolish' ? 'select' : 'demolish');
    } else if (key === 'Escape') {
      this.setTool('select');
      this.state.selectedBuildingId = null;
      this.state.selectedCitizenId = null;
      if (this.uiCallbacks.onEscape) this.uiCallbacks.onEscape();
    }
  }

  update(dt) {
    this.input.updateKeyboardPan(dt);
    if (!this.state) return;

    const lang = getLanguage();
    this.state.stepSimulation(dt, {
      lang,
      onBuildingsCompleted: (list) => {
        audio.playComplete();
        for (const b of list) {
          const def = this.state.buildingsManager.getDefinition(b.type);
          const name = def ? localize(def.name, lang) : b.type;
          this.renderer.spawnFloatingText(b.x + 1, b.y, `${name} Pronto!`, '#4ade80');
          if (this.uiCallbacks.onNotify) {
            this.uiCallbacks.onNotify(`Construção concluída: ${name}`, 'success');
          }
        }
      },
      onTilesExcavated: (tiles) => {
        for (const t of tiles) {
          const entries = Object.entries(t.yieldEarned || {});
          if (entries.length > 0) {
            const [res, amt] = entries[0];
            this.renderer.spawnFloatingText(t.x, t.y, `+${amt} ${res.toUpperCase()}`, '#fbbf24');
          }
        }
      },
      onTechCompleted: (tech) => {
        audio.playResearch();
        if (this.uiCallbacks.onNotify) {
          this.uiCallbacks.onNotify(
            `Tecnologia Desbloqueada: ${localize(tech.name, lang)}!`,
            'success'
          );
        }
        saveManager.saveGameState(this.state, 'autosave');
      },
      onImmigrantArrived: (c) => {
        if (this.uiCallbacks.onNotify) {
          this.uiCallbacks.onNotify(
            `Novo sobrevivente juntou-se à colônia: ${c.name}`,
            'info'
          );
        }
      },
      onExpeditionsFinished: (results) => {
        audio.playComplete();
        for (const r of results) {
          const siteName = r.site ? localize(r.site.name, lang) : r.expedition.siteId;
          const summary = Object.entries(r.earned)
            .map(([k, v]) => `+${v} ${k}`)
            .join(', ');
          if (this.uiCallbacks.onNotify) {
            this.uiCallbacks.onNotify(
              `Expedição retornou (${siteName}): ${summary}`,
              'success'
            );
          }
        }
        saveManager.saveGameState(this.state, 'autosave');
      },
      onEventTriggered: (ev) => {
        audio.playAlert();
        if (this.uiCallbacks.onDilemmaTriggered) {
          this.uiCallbacks.onDilemmaTriggered(ev);
        }
      },
      onMissionsCompleted: (missions) => {
        audio.playComplete();
        for (const m of missions) {
          if (this.uiCallbacks.onNotify) {
            this.uiCallbacks.onNotify(
              `Objetivo Concluído: ${localize(m.title, lang)}! Recompensa recebida.`,
              'success'
            );
          }
        }
      },
      onAchievementsUnlocked: (achs) => {
        audio.playResearch();
        for (const a of achs) {
          if (this.uiCallbacks.onNotify) {
            this.uiCallbacks.onNotify(
              `Conquista Desbloqueada: ${localize(a.title, lang)}!`,
              'achievement'
            );
          }
        }
      }
    });

    // Periodic autosave
    const interval = this.settings?.autosaveIntervalSec || 45;
    this.autosaveTimer += dt;
    if (this.autosaveTimer >= interval) {
      this.autosaveTimer = 0;
      saveManager.saveGameState(this.state, 'autosave');
    }

    // Periodic HUD refresh (4 Hz so DOM stays super light)
    this.uiRefreshTimer += dt;
    if (this.uiRefreshTimer >= 0.25) {
      this.uiRefreshTimer = 0;
      if (this.uiCallbacks.onHudTick) {
        this.uiCallbacks.onHudTick(this.state, {
          fps: this.loop.fps,
          simMs: this.loop.simTimeMs,
          renderMs: this.loop.renderTimeMs,
          visibleChunks: this.renderer.visibleChunksCount
        });
      }
    }
  }

  render(dt) {
    if (!this.state) return;
    this.renderer.render(this.state, this.input, dt);
  }
}
