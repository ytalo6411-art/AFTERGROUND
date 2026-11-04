import { localDB } from './indexedDB.js';
import { cloudSync } from './cloudSync.js';
import { CURRENT_SAVE_VERSION, computeSaveChecksum, migrateSavePayload, validateSavePayload } from './migrations.js';

export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

class SaveManager {
  async listWorlds() {
    const worlds = await localDB.getAll('worlds');
    return worlds.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  }

  async listSavesForWorld(worldId) {
    const allSaves = await localDB.getAll('saves');
    return allSaves
      .filter((s) => s.worldId === worldId)
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  }

  async saveGameState(gameState, slotName = 'autosave') {
    const payload = gameState.serialize();
    payload.saveVersion = CURRENT_SAVE_VERSION;
    payload.checksum = computeSaveChecksum(payload);

    const nowIso = new Date().toISOString();
    const worldRecord = {
      id: gameState.worldId,
      name: gameState.worldName,
      seed: gameState.worldMap.seed,
      difficulty: gameState.difficulty,
      width: gameState.worldMap.width,
      height: gameState.worldMap.height,
      day: gameState.day,
      year: gameState.year,
      era: gameState.researchManager.currentEra,
      population: gameState.populationManager.citizens.length,
      playTimeSeconds: Math.round(gameState.playTimeSeconds),
      progressState: {
        techs: gameState.researchManager.unlocked.size,
        missions: gameState.progressionManager.completedMissions.size
      },
      createdAt: gameState.createdAt || nowIso,
      updatedAt: nowIso
    };

    const saveRecord = {
      key: `${gameState.worldId}:${slotName}`,
      worldId: gameState.worldId,
      slotName,
      saveVersion: CURRENT_SAVE_VERSION,
      day: gameState.day,
      year: gameState.year,
      population: gameState.populationManager.citizens.length,
      playTimeSeconds: Math.round(gameState.playTimeSeconds),
      checksum: payload.checksum,
      payload,
      updatedAt: nowIso
    };

    await localDB.put('worlds', worldRecord);
    await localDB.put('saves', saveRecord);
    await localDB.put('meta', {
      key: 'last_active_world',
      worldId: gameState.worldId,
      slotName,
      updatedAt: nowIso
    });

    const allWorlds = await this.listWorlds();
    const statsSummary = {
      playTimeSeconds: gameState.playTimeSeconds,
      worldsCreated: allWorlds.length,
      maxPopulation: Math.max(gameState.maxPopulationReached || 0, gameState.populationManager.citizens.length),
      buildingsCount: gameState.buildingsManager.list.filter((b) => b.completed).length,
      excavatedTiles: gameState.excavationSystem.totalExcavated,
      techsResearched: gameState.researchManager.unlocked.size,
      expeditionsCompleted: gameState.explorationManager.totalCompleted,
      daysSurvived: gameState.day,
      historySnapshots: gameState.progressionManager.historySnapshots
    };

    const unlockedAch = Array.from(gameState.progressionManager.unlockedAchievements.entries());
    cloudSync.syncWorldAndSave(worldRecord, saveRecord, statsSummary, unlockedAch);

    return { worldRecord, saveRecord };
  }

  async loadWorldSlot(worldId, slotName = 'autosave') {
    let record = await localDB.get('saves', `${worldId}:${slotName}`);
    if (!record) {
      const worldSaves = await this.listSavesForWorld(worldId);
      record = worldSaves[0] || null;
    }
    if (!record || !record.payload) return null;

    const migrated = migrateSavePayload(record.payload);
    const check = validateSavePayload(migrated);
    if (!check.valid) {
      throw new Error(check.reason);
    }
    return migrated;
  }

  async getLastActiveSave() {
    const lastMeta = await localDB.get('meta', 'last_active_world');
    if (lastMeta && lastMeta.worldId) {
      const loaded = await this.loadWorldSlot(lastMeta.worldId, lastMeta.slotName || 'autosave');
      if (loaded) return loaded;
    }
    const worlds = await this.listWorlds();
    if (worlds.length > 0) {
      return this.loadWorldSlot(worlds[0].id, 'autosave');
    }
    return null;
  }

  async deleteWorld(worldId) {
    await localDB.delete('worlds', worldId);
    const saves = await this.listSavesForWorld(worldId);
    for (const s of saves) {
      await localDB.delete('saves', s.key);
    }
    await cloudSync.deleteCloudWorld(worldId);
    return true;
  }

  exportToJSONString(gameState) {
    const payload = gameState.serialize();
    payload.saveVersion = CURRENT_SAVE_VERSION;
    payload.checksum = computeSaveChecksum(payload);
    return JSON.stringify(payload, null, 2);
  }

  async importFromJSONString(jsonString) {
    const raw = JSON.parse(jsonString);
    const migrated = migrateSavePayload(raw);
    const validation = validateSavePayload(migrated);
    if (!validation.valid) {
      throw new Error(validation.reason);
    }
    return migrated;
  }

  async saveSettings(settings) {
    await localDB.put('settings', { id: 'user_settings', ...settings });
    cloudSync.syncSettingsToCloud(settings);
  }

  async loadSettings() {
    const stored = await localDB.get('settings', 'user_settings');
    return (
      stored || {
        language: 'pt-BR',
        masterVolume: 0.8,
        musicVolume: 0.45,
        sfxVolume: 0.8,
        muted: false,
        graphicsQuality: 'high',
        fpsLimit: 60,
        autosaveIntervalSec: 45,
        showFps: true,
        accessibility: {
          highContrast: false,
          largeText: false,
          reducedMotion: false
        }
      }
    );
  }
}

export const saveManager = new SaveManager();
