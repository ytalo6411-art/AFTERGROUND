import balancingData from '../data/balancing.json';
import { WorldMap } from '../world/map.js';
import { FogOfWar } from '../world/fog.js';
import { Pathfinder } from '../world/pathfinding.js';
import { createPRNG } from '../world/generation.js';
import { ResourceManager } from '../simulation/resources.js';
import { BuildingsManager } from '../simulation/buildings.js';
import { EconomyManager } from '../simulation/economy.js';
import { PopulationManager } from '../simulation/population.js';
import { ResearchManager } from '../simulation/research.js';
import { ExplorationManager } from '../simulation/exploration.js';
import { EventsManager } from '../simulation/events.js';
import { ConstructionSystem } from '../systems/construction.js';
import { ExcavationSystem } from '../systems/excavation.js';
import { ProgressionManager } from '../systems/achievements.js';
import { recalculateStorageCapacities } from '../systems/storage.js';
import { evaluateTransportNetwork } from '../systems/transport.js';
import { generateUUID } from '../save/save.js';

export class GameState {
  constructor({
    worldId = null,
    worldName = 'Nova Aegis',
    seed = 'AEGIS-2241',
    difficulty = 'normal',
    width = 200,
    height = 100
  } = {}) {
    this.worldId = worldId || generateUUID();
    this.worldName = worldName;
    this.difficulty = difficulty;
    this.createdAt = new Date().toISOString();

    this.day = 1;
    this.year = 2241;
    this.dayClock = 22; // 0..90s day cycle (starts morning)
    this.playTimeSeconds = 0;
    this.speed = 1; // 0 = paused, 1 = 1x, 2 = 2x, 4 = 4x

    this.rand = createPRNG(seed);
    this.worldMap = new WorldMap({ width, height, seed });
    this.fog = new FogOfWar(width, height, true);

    this.resourceManager = new ResourceManager(difficulty);
    this.buildingsManager = new BuildingsManager();
    this.researchManager = new ResearchManager();
    this.pathfinder = new Pathfinder(this.worldMap, this.buildingsManager);

    this.constructionSystem = new ConstructionSystem(
      this.worldMap,
      this.buildingsManager,
      this.resourceManager,
      this.researchManager,
      this.fog
    );
    this.excavationSystem = new ExcavationSystem(
      this.worldMap,
      this.resourceManager,
      this.researchManager,
      this.fog
    );
    this.economyManager = new EconomyManager(
      this.resourceManager,
      this.buildingsManager,
      this.researchManager
    );
    this.populationManager = new PopulationManager(
      this.worldMap,
      this.buildingsManager,
      this.resourceManager,
      this.pathfinder
    );
    this.explorationManager = new ExplorationManager(
      this.resourceManager,
      this.populationManager,
      this.researchManager
    );
    this.eventsManager = new EventsManager(
      this.resourceManager,
      this.populationManager,
      this.explorationManager
    );
    this.progressionManager = new ProgressionManager();

    this.activeTool = 'select'; // 'select' | 'build' | 'excavate' | 'demolish'
    this.selectedBuildingType = null;
    this.selectedBuildingId = null;
    this.selectedCitizenId = null;

    this.powerStatus = { supply: 3, demand: 0, gridRatio: 1, isPowered: true };
    this.transportStatus = { ladders: 0, bridges: 0, elevators: 0, movementBonus: 0 };
    this.maxPopulationReached = 8;

    this.econAccum = 0;
    this.needsAccum = 0;
  }

  setupStarterColony() {
    const cx = this.worldMap.centerX;
    const surfY = this.worldMap.baseSurfaceY;
    const galY = this.worldMap.galleryY;

    // Reveal sky band and initial colony radius
    this.fog.revealSkyAndSurfaceBand(this.worldMap.surfaceHeights, 4, this.worldMap);
    this.fog.revealCircle(cx, surfY + 2, 18, this.worldMap);

    // Place Command Nexus on the flat surface plateau
    this.constructionSystem.placeBuilding('command_nexus', cx - 1, surfY - 3, {
      instant: true,
      free: true
    });

    // Place vertical access ladder shaft from surface down into the underground starter gallery
    for (let ly = surfY - 1; ly <= galY; ly++) {
      this.constructionSystem.placeBuilding('access_ladder', cx - 3, ly, {
        instant: true,
        free: true
      });
    }

    recalculateStorageCapacities(this.resourceManager, this.buildingsManager);
    this.populationManager.spawnInitialPopulation(balancingData.citizens.initialCount, this.rand);
    this.maxPopulationReached = this.populationManager.citizens.length;

    // Initial snapshot
    this.progressionManager.recordSnapshot({
      day: this.day,
      year: this.year,
      population: this.populationManager.citizens.length,
      happiness: this.populationManager.getAverageHappiness(),
      food: this.resourceManager.get('food'),
      water: this.resourceManager.get('water'),
      energy: this.resourceManager.get('energy'),
      money: this.resourceManager.get('money'),
      science: this.resourceManager.get('science')
    });
  }

  isDaytime() {
    const dur = balancingData.world.dayDurationSeconds || 90;
    const ratio = (this.dayClock % dur) / dur;
    return ratio >= 0.18 && ratio <= 0.78;
  }

  getDayPhaseRatio() {
    const dur = balancingData.world.dayDurationSeconds || 90;
    return (this.dayClock % dur) / dur;
  }

  stepSimulation(dt, callbacks = {}) {
    if (this.speed <= 0) return;
    const scaledDt = dt * this.speed;
    this.playTimeSeconds += dt;
    this.dayClock += scaledDt;

    const dayDur = balancingData.world.dayDurationSeconds || 90;
    if (this.dayClock >= dayDur) {
      this.dayClock -= dayDur;
      this.day++;
      if (this.day > 30) {
        this.day = 1;
        this.year++;
      }
      this.economyManager.updateMarketDrift();
      this.progressionManager.recordSnapshot({
        day: this.day,
        year: this.year,
        population: this.populationManager.citizens.length,
        happiness: this.populationManager.getAverageHappiness(),
        food: this.resourceManager.get('food'),
        water: this.resourceManager.get('water'),
        energy: this.resourceManager.get('energy'),
        money: this.resourceManager.get('money'),
        science: this.resourceManager.get('science')
      });
      if (callbacks.onNewDay) callbacks.onNewDay(this.day, this.year);
    }

    const techMods = this.researchManager.getModifiers();
    this.transportStatus = evaluateTransportNetwork(this.buildingsManager);

    // 1. High-frequency step (10 Hz): Citizen movement, Construction progress, Excavation progress
    const totalSpeedBonus = (techMods.citizenSpeedBonus || 0) + this.transportStatus.movementBonus;
    this.populationManager.updateMovement(scaledDt, totalSpeedBonus);

    const builderCount =
      this.populationManager.countByProfession('builder') +
      Math.ceil(this.populationManager.countByProfession('worker') * 0.5);
    const finishedBuildings = this.constructionSystem.updateConstructionProgress(
      scaledDt,
      builderCount,
      techMods.buildSpeedBonus || 0
    );
    if (finishedBuildings.length > 0) {
      this.populationManager.rebalanceAssignments();
      recalculateStorageCapacities(this.resourceManager, this.buildingsManager);
      if (callbacks.onBuildingsCompleted) callbacks.onBuildingsCompleted(finishedBuildings);
    }

    const minerCount =
      this.populationManager.countByProfession('miner') +
      Math.ceil(this.populationManager.countByProfession('worker') * 0.5);
    const dugTiles = this.excavationSystem.update(
      scaledDt,
      minerCount,
      techMods.excavationSpeedBonus || 0
    );
    if (dugTiles.length > 0 && callbacks.onTilesExcavated) {
      callbacks.onTilesExcavated(dugTiles);
    }

    // 2. Medium-frequency step (2 Hz): Economy, Power, Research
    this.econAccum += scaledDt;
    if (this.econAccum >= 0.5) {
      const econDt = this.econAccum;
      this.econAccum = 0;

      this.powerStatus = this.economyManager.stepEconomy(econDt, {
        populationCount: this.populationManager.citizens.length,
        difficulty: this.difficulty,
        weather: this.eventsManager.weather,
        isDaytime: this.isDaytime(),
        lang: callbacks.lang || 'pt-BR'
      });

      const scientistCount = this.populationManager.countByProfession('scientist');
      const completedTech = this.researchManager.update(econDt, scientistCount);
      if (completedTech && callbacks.onTechCompleted) {
        callbacks.onTechCompleted(completedTech);
      }
    }

    // 3. Low-frequency step (1 Hz): Citizen Needs, Expeditions, Dynamic Events, Missions & Achievements
    this.needsAccum += scaledDt;
    if (this.needsAccum >= 1.0) {
      const needsDt = this.needsAccum;
      this.needsAccum = 0;

      const { newImmigrant } = this.populationManager.updateNeedsAndPopulation(needsDt, {
        difficulty: this.difficulty,
        techMods
      });
      if (newImmigrant && callbacks.onImmigrantArrived) {
        callbacks.onImmigrantArrived(newImmigrant);
      }

      if (this.populationManager.citizens.length > this.maxPopulationReached) {
        this.maxPopulationReached = this.populationManager.citizens.length;
      }

      const expResults = this.explorationManager.update(needsDt, this.rand);
      if (expResults.length > 0 && callbacks.onExpeditionsFinished) {
        callbacks.onExpeditionsFinished(expResults);
      }

      const triggeredEvent = this.eventsManager.update(needsDt, {
        day: this.day,
        difficulty: this.difficulty,
        rand: this.rand
      });
      if (triggeredEvent && callbacks.onEventTriggered) {
        callbacks.onEventTriggered(triggeredEvent);
      }

      const completedMissions = this.progressionManager.evaluateMissions({
        buildingsManager: this.buildingsManager,
        excavationSystem: this.excavationSystem,
        researchManager: this.researchManager,
        populationManager: this.populationManager,
        explorationManager: this.explorationManager,
        resourceManager: this.resourceManager
      });
      if (completedMissions.length > 0 && callbacks.onMissionsCompleted) {
        callbacks.onMissionsCompleted(completedMissions);
      }

      const unlockedAch = this.progressionManager.evaluateAchievements({
        buildingsManager: this.buildingsManager,
        excavationSystem: this.excavationSystem,
        researchManager: this.researchManager,
        populationManager: this.populationManager,
        explorationManager: this.explorationManager,
        resourceManager: this.resourceManager
      });
      if (unlockedAch.length > 0 && callbacks.onAchievementsUnlocked) {
        callbacks.onAchievementsUnlocked(unlockedAch);
      }
    }
  }

  serialize() {
    return {
      meta: {
        worldId: this.worldId,
        worldName: this.worldName,
        difficulty: this.difficulty,
        day: this.day,
        year: this.year,
        dayClock: this.dayClock,
        playTimeSeconds: this.playTimeSeconds,
        maxPopulationReached: this.maxPopulationReached,
        totalExcavated: this.excavationSystem.totalExcavated,
        createdAt: this.createdAt,
        savedAt: new Date().toISOString()
      },
      world: this.worldMap.serialize(),
      fog: this.fog.serialize(),
      resources: this.resourceManager.serialize(),
      buildings: this.buildingsManager.serialize(),
      economy: this.economyManager.serialize(),
      population: this.populationManager.serialize(),
      research: this.researchManager.serialize(),
      exploration: this.explorationManager.serialize(),
      events: this.eventsManager.serialize(),
      progression: this.progressionManager.serialize()
    };
  }

  static deserialize(payload) {
    const meta = payload.meta || {};
    const state = new GameState({
      worldId: meta.worldId || payload.world?.id,
      worldName: meta.worldName || 'Nova Aegis',
      seed: payload.world?.seed || 'AEGIS-2241',
      difficulty: meta.difficulty || 'normal',
      width: payload.world?.width || 200,
      height: payload.world?.height || 100
    });

    state.day = meta.day || 1;
    state.year = meta.year || 2241;
    state.dayClock = meta.dayClock ?? 22;
    state.playTimeSeconds = meta.playTimeSeconds || 0;
    state.maxPopulationReached = meta.maxPopulationReached || 8;
    state.createdAt = meta.createdAt || new Date().toISOString();

    state.worldMap = WorldMap.deserialize(payload.world);
    state.fog = FogOfWar.deserialize(payload.fog, state.worldMap.width, state.worldMap.height);
    state.pathfinder = new Pathfinder(state.worldMap, state.buildingsManager);

    state.resourceManager.deserialize(payload.resources);
    state.buildingsManager.deserialize(payload.buildings);
    state.researchManager.deserialize(payload.research);
    state.economyManager.deserialize(payload.economy);

    state.constructionSystem = new ConstructionSystem(
      state.worldMap,
      state.buildingsManager,
      state.resourceManager,
      state.researchManager,
      state.fog
    );
    state.excavationSystem = new ExcavationSystem(
      state.worldMap,
      state.resourceManager,
      state.researchManager,
      state.fog
    );
    state.excavationSystem.totalExcavated = meta.totalExcavated || 0;

    state.populationManager = new PopulationManager(
      state.worldMap,
      state.buildingsManager,
      state.resourceManager,
      state.pathfinder
    );
    state.populationManager.deserialize(payload.population);

    state.explorationManager = new ExplorationManager(
      state.resourceManager,
      state.populationManager,
      state.researchManager
    );
    state.explorationManager.deserialize(payload.exploration);

    state.eventsManager = new EventsManager(
      state.resourceManager,
      state.populationManager,
      state.explorationManager
    );
    state.eventsManager.deserialize(payload.events);

    state.progressionManager.deserialize(payload.progression);
    recalculateStorageCapacities(state.resourceManager, state.buildingsManager);
    state.populationManager.rebalanceAssignments();

    return state;
  }
}
