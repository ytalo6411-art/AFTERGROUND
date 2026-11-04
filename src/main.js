import './styles.css';
import { AftergroundEngine } from './core/engine.js';
import { GameUI } from './ui/ui.js';
import { authManager } from './auth/authentication.js';
import { saveManager } from './save/save.js';
import { cloudSync } from './save/cloudSync.js';

async function bootstrap() {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) return;

  let ui = null;

  const engine = new AftergroundEngine(canvas, {
    onHudTick: (state, telemetry) => {
      if (ui) ui.updateHud(state, telemetry);
    },
    onHoverTile: (tile) => {
      if (ui) ui.updateToolStatusBar(tile);
    },
    onToolChanged: () => {
      if (ui) {
        ui.updateToolStatusBar();
        ui.updateHud(engine.state);
      }
    },
    onSelectionChanged: (kind, entity) => {
      if (ui) ui.updateSelectionInspector(kind, entity);
    },
    onStateChanged: () => {
      if (ui) ui.updateHud(engine.state);
    },
    onNotify: (msg, type) => {
      if (ui) ui.notify(msg, type);
    },
    onDilemmaTriggered: (ev) => {
      if (ui) ui.openDilemmaModal(ev);
    },
    onEscape: () => {
      if (ui) {
        ui.closeModal();
        ui.buildDrawerOpen = false;
        ui.renderBuildDrawer();
        ui.updateSelectionInspector(null, null);
      }
    }
  });

  ui = new GameUI(engine);
  await engine.init();
  await authManager.init();

  if (authManager.user) {
    await cloudSync.pullCloudWorldsAndSaves();
  }

  // Load last active world in background so the live canvas behind the title screen is already alive!
  const existingSave = await saveManager.getLastActiveSave();
  if (existingSave) {
    engine.loadFromPayload(existingSave);
  } else {
    engine.startNewWorld({
      worldName: 'Nova Aegis',
      seed: 'AEGIS-2241',
      difficulty: 'normal'
    });
  }

  ui.updateHud(engine.state);
  ui.updateAuthIndicators();
}

bootstrap();
