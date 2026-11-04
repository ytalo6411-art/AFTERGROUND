import { supabase } from '../auth/supabase.js';
import { authManager } from '../auth/authentication.js';
import { localDB } from './indexedDB.js';

class CloudSyncManager {
  constructor() {
    this.status = 'offline'; // 'offline' | 'syncing' | 'synced' | 'error'
    this.lastSyncedAt = null;
    this.listeners = new Set();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.flushPendingQueue());
      window.addEventListener('offline', () => this.setStatus('offline'));
    }

    authManager.onChange(({ user }) => {
      if (user && typeof navigator !== 'undefined' && navigator.onLine !== false) {
        this.flushPendingQueue();
      } else {
        this.setStatus('offline');
      }
    });
  }

  onStatusChange(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  setStatus(nextStatus) {
    this.status = nextStatus;
    if (nextStatus === 'synced') {
      this.lastSyncedAt = new Date().toISOString();
    }
    for (const cb of this.listeners) {
      try {
        cb({ status: this.status, lastSyncedAt: this.lastSyncedAt });
      } catch {
        // ignore listener error
      }
    }
  }

  isOnlineAndAuthenticated() {
    const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    return Boolean(supabase && authManager.user && online);
  }

  async syncWorldAndSave(worldRecord, saveRecord, statsSummary = null, unlockedAchievements = []) {
    if (!this.isOnlineAndAuthenticated()) {
      await localDB.put('meta', {
        key: `pending_sync_${worldRecord.id}`,
        worldId: worldRecord.id,
        slotName: saveRecord.slotName,
        queuedAt: new Date().toISOString()
      });
      this.setStatus('offline');
      return { ok: false, offline: true };
    }

    this.setStatus('syncing');
    const userId = authManager.user.id;

    try {
      // 1. Upsert World metadata in public.worlds
      const { error: worldErr } = await supabase.from('worlds').upsert(
        {
          id: worldRecord.id,
          user_id: userId,
          name: worldRecord.name,
          seed: worldRecord.seed,
          difficulty: worldRecord.difficulty || 'normal',
          map_width: worldRecord.width || 200,
          map_height: worldRecord.height || 100,
          day: worldRecord.day || 1,
          year: worldRecord.year || 2241,
          era: worldRecord.era || 1,
          population: worldRecord.population || 0,
          play_time_seconds: Math.round(worldRecord.playTimeSeconds || 0),
          progress_state: worldRecord.progressState || {},
          updated_at: worldRecord.updatedAt || new Date().toISOString()
        },
        { onConflict: 'id' }
      );
      if (worldErr) throw worldErr;

      // 2. Check for cloud conflict before overwriting game_saves
      const { data: existingCloudSave } = await supabase
        .from('game_saves')
        .select('id, updated_at, play_time_seconds, save_data')
        .eq('user_id', userId)
        .eq('world_id', worldRecord.id)
        .eq('slot_name', saveRecord.slotName)
        .maybeSingle();

      if (existingCloudSave && existingCloudSave.save_data) {
        const cloudTime = new Date(existingCloudSave.updated_at).getTime();
        const localTime = new Date(saveRecord.updatedAt).getTime();
        if (
          cloudTime > localTime + 5000 &&
          (existingCloudSave.play_time_seconds || 0) > (saveRecord.playTimeSeconds || 0) + 15
        ) {
          // Preserve local conflicting save in backup slot so ZERO progress is ever lost
          await localDB.put('saves', {
            ...saveRecord,
            key: `${worldRecord.id}:conflict_backup`,
            slotName: 'conflict_backup'
          });
        }
      }

      // 3. Upsert Save data in public.game_saves
      const { error: saveErr } = await supabase.from('game_saves').upsert(
        {
          user_id: userId,
          world_id: worldRecord.id,
          slot_name: saveRecord.slotName,
          save_version: saveRecord.saveVersion || 2,
          day: saveRecord.day || 1,
          year: saveRecord.year || 2241,
          population: saveRecord.population || 0,
          play_time_seconds: Math.round(saveRecord.playTimeSeconds || 0),
          checksum: saveRecord.checksum || null,
          save_data: saveRecord.payload,
          updated_at: saveRecord.updatedAt || new Date().toISOString()
        },
        { onConflict: 'user_id,world_id,slot_name' }
      );
      if (saveErr) throw saveErr;

      // 4. Sync Achievements if any
      if (Array.isArray(unlockedAchievements) && unlockedAchievements.length > 0) {
        const achRows = unlockedAchievements.map(([achKey, unlockedAt]) => ({
          user_id: userId,
          achievement_key: achKey,
          unlocked_at: unlockedAt || new Date().toISOString(),
          progress: 100
        }));
        await supabase.from('achievements').upsert(achRows, {
          onConflict: 'user_id,achievement_key'
        });
      }

      // 5. Sync Player Statistics if provided
      if (statsSummary) {
        await supabase.from('player_statistics').upsert(
          {
            user_id: userId,
            total_play_time_seconds: Math.round(statsSummary.playTimeSeconds || 0),
            worlds_created: statsSummary.worldsCreated || 1,
            max_population_reached: statsSummary.maxPopulation || 0,
            total_buildings_constructed: statsSummary.buildingsCount || 0,
            total_tiles_excavated: statsSummary.excavatedTiles || 0,
            total_technologies_researched: statsSummary.techsResearched || 0,
            total_expeditions_completed: statsSummary.expeditionsCompleted || 0,
            total_days_survived: statsSummary.daysSurvived || 1,
            history_snapshots: statsSummary.historySnapshots || [],
            updated_at: new Date().toISOString()
          },
          { onConflict: 'user_id' }
        );
      }

      await localDB.delete('meta', `pending_sync_${worldRecord.id}`);
      this.setStatus('synced');
      return { ok: true };
    } catch (err) {
      this.setStatus('error');
      return { ok: false, error: err?.message || 'Cloud sync error' };
    }
  }

  async pullCloudWorldsAndSaves() {
    if (!this.isOnlineAndAuthenticated()) return [];
    this.setStatus('syncing');
    const userId = authManager.user.id;

    try {
      const { data: cloudWorlds, error: wErr } = await supabase
        .from('worlds')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (wErr) throw wErr;

      const { data: cloudSaves, error: sErr } = await supabase
        .from('game_saves')
        .select('*')
        .eq('user_id', userId);

      if (sErr) throw sErr;

      for (const cw of cloudWorlds || []) {
        const localW = await localDB.get('worlds', cw.id);
        const cloudUpdated = new Date(cw.updated_at).getTime();
        const localUpdated = localW ? new Date(localW.updatedAt).getTime() : 0;

        if (!localW || cloudUpdated > localUpdated) {
          await localDB.put('worlds', {
            id: cw.id,
            name: cw.name,
            seed: cw.seed,
            difficulty: cw.difficulty,
            width: cw.map_width,
            height: cw.map_height,
            day: cw.day,
            year: cw.year,
            era: cw.era,
            population: cw.population,
            playTimeSeconds: cw.play_time_seconds,
            progressState: cw.progress_state,
            createdAt: cw.created_at,
            updatedAt: cw.updated_at
          });
        }
      }

      for (const cs of cloudSaves || []) {
        const key = `${cs.world_id}:${cs.slot_name}`;
        const localS = await localDB.get('saves', key);
        const cloudUpdated = new Date(cs.updated_at).getTime();
        const localUpdated = localS ? new Date(localS.updatedAt).getTime() : 0;

        if (!localS || cloudUpdated > localUpdated) {
          await localDB.put('saves', {
            key,
            worldId: cs.world_id,
            slotName: cs.slot_name,
            saveVersion: cs.save_version,
            day: cs.day,
            year: cs.year,
            population: cs.population,
            playTimeSeconds: cs.play_time_seconds,
            checksum: cs.checksum,
            payload: cs.save_data,
            updatedAt: cs.updated_at
          });
        }
      }

      this.setStatus('synced');
      return cloudWorlds || [];
    } catch {
      this.setStatus('error');
      return [];
    }
  }

  async deleteCloudWorld(worldId) {
    if (!this.isOnlineAndAuthenticated()) return false;
    try {
      await supabase
        .from('worlds')
        .delete()
        .eq('id', worldId)
        .eq('user_id', authManager.user.id);
      return true;
    } catch {
      return false;
    }
  }

  async syncSettingsToCloud(settings) {
    if (!this.isOnlineAndAuthenticated()) return false;
    try {
      await supabase.from('game_settings').upsert(
        {
          user_id: authManager.user.id,
          language: settings.language || 'pt-BR',
          master_volume: settings.masterVolume ?? 0.8,
          music_volume: settings.musicVolume ?? 0.5,
          sfx_volume: settings.sfxVolume ?? 0.8,
          graphics_quality: settings.graphicsQuality || 'high',
          fps_limit: settings.fpsLimit || 60,
          autosave_interval_sec: settings.autosaveIntervalSec || 60,
          accessibility: settings.accessibility || {},
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id' }
      );
      return true;
    } catch {
      return false;
    }
  }

  async flushPendingQueue() {
    if (!this.isOnlineAndAuthenticated()) return;
    const allMeta = await localDB.getAll('meta');
    const pendings = allMeta.filter((m) => m.key && m.key.startsWith('pending_sync_'));
    for (const item of pendings) {
      const world = await localDB.get('worlds', item.worldId);
      const save = await localDB.get('saves', `${item.worldId}:${item.slotName || 'autosave'}`);
      if (world && save) {
        await this.syncWorldAndSave(world, save);
      } else {
        await localDB.delete('meta', item.key);
      }
    }
  }
}

export const cloudSync = new CloudSyncManager();
