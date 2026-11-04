export const CURRENT_SAVE_VERSION = 2;

export function computeSaveChecksum(payload) {
  const str = JSON.stringify({
    worldId: payload?.world?.id,
    day: payload?.meta?.day,
    year: payload?.meta?.year,
    pop: payload?.population?.citizens?.length || 0,
    buildings: payload?.buildings?.list?.length || 0
  });
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `ag_${h.toString(16)}`;
}

export function migrateSavePayload(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Formato de save inválido ou vazio.');
  }

  const cloned = JSON.parse(JSON.stringify(raw));
  const version = cloned.saveVersion || cloned.version || 1;

  if (version < 2) {
    // Migrate v1 -> v2
    cloned.saveVersion = 2;
    if (!cloned.meta) {
      cloned.meta = {
        day: cloned.day || 1,
        year: cloned.year || 2241,
        playTimeSeconds: cloned.playTimeSeconds || 0,
        difficulty: cloned.difficulty || 'normal',
        savedAt: new Date().toISOString()
      };
    }
    if (!cloned.progression) {
      cloned.progression = {
        completedMissions: [],
        unlockedAchievements: [],
        historySnapshots: []
      };
    }
  }

  cloned.saveVersion = CURRENT_SAVE_VERSION;
  cloned.checksum = computeSaveChecksum(cloned);
  return cloned;
}

export function validateSavePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, reason: 'JSON não é um objeto válido.' };
  }
  if (!payload.world || typeof payload.world.width !== 'number' || !Array.isArray(payload.world.tiles)) {
    return { valid: false, reason: 'Dados do mapa ausentes ou corrompidos.' };
  }
  if (!payload.resources || typeof payload.resources.amounts !== 'object') {
    return { valid: false, reason: 'Dados de recursos ausentes.' };
  }
  if (!payload.buildings || !Array.isArray(payload.buildings.list)) {
    return { valid: false, reason: 'Lista de construções ausente.' };
  }
  return { valid: true };
}
