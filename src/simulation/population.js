import { createCitizen, PROFESSIONS, stepCitizenMovement } from './citizens.js';
import balancingData from '../data/balancing.json';

export class PopulationManager {
  constructor(worldMap, buildingsManager, resourceManager, pathfinder) {
    this.worldMap = worldMap;
    this.buildingsManager = buildingsManager;
    this.resourceManager = resourceManager;
    this.pathfinder = pathfinder;
    this.citizens = [];
    this.nextId = 1;
    this.autoAssignWorkers = true;
    this.immigrationTimer = 0;
    this.totalDeaths = 0;
    this.totalImmigrants = 0;
  }

  spawnInitialPopulation(count = 8, rand = Math.random) {
    const startProfessions = [
      'builder',
      'miner',
      'farmer',
      'farmer',
      'engineer',
      'scientist',
      'worker',
      'worker'
    ];
    const spawnY = this.worldMap.baseSurfaceY - 1;
    for (let i = 0; i < count; i++) {
      const spawnX = this.worldMap.centerX - 3 + (i % 7);
      const prof = startProfessions[i % startProfessions.length];
      this.citizens.push(
        createCitizen({
          id: this.nextId++,
          x: spawnX,
          y: spawnY,
          profession: prof,
          rand
        })
      );
    }
    this.rebalanceAssignments();
  }

  addImmigrants(count = 1, rand = Math.random) {
    const added = [];
    const spawnY = this.worldMap.baseSurfaceY - 1;
    for (let i = 0; i < count; i++) {
      const prof = PROFESSIONS[Math.floor(rand() * PROFESSIONS.length)];
      const c = createCitizen({
        id: this.nextId++,
        x: this.worldMap.centerX + (i % 5) - 2,
        y: spawnY,
        profession: prof,
        rand
      });
      c.history.unshift('Chegou à colônia em uma caravana de sobreviventes.');
      this.citizens.push(c);
      this.totalImmigrants++;
      added.push(c);
    }
    this.rebalanceAssignments();
    return added;
  }

  getCitizenById(id) {
    return this.citizens.find((c) => c.id === id) || null;
  }

  setCitizenProfession(citizenId, newProfession) {
    const c = this.getCitizenById(citizenId);
    if (!c || !PROFESSIONS.includes(newProfession)) return false;
    c.profession = newProfession;
    c.history.unshift(`Designado como ${newProfession}.`);
    if (c.history.length > 8) c.history.pop();
    this.rebalanceAssignments();
    return true;
  }

  assignCitizenToBuilding(citizenId, buildingId) {
    const c = this.getCitizenById(citizenId);
    const b = this.buildingsManager.getBuildingById(buildingId);
    if (!c || !b || !b.completed) return false;
    const def = this.buildingsManager.getDefinition(b.type);
    if (!def || def.workers <= 0) return false;
    c.workplaceId = b.id;
    if (def.profession) c.profession = def.profession;
    this.rebalanceAssignments();
    return true;
  }

  getHousingCapacity() {
    let cap = 0;
    for (const b of this.buildingsManager.list) {
      if (!b.completed || b.active === false) continue;
      const def = this.buildingsManager.getDefinition(b.type);
      if (def?.housingCapacity) {
        const levelMult = 1 + (b.level - 1) * 0.4;
        cap += Math.round(def.housingCapacity * levelMult);
      }
    }
    return cap;
  }

  getDefenseRating(techDefenseBonus = 0) {
    let defRating = techDefenseBonus;
    for (const b of this.buildingsManager.list) {
      if (!b.completed || b.active === false) continue;
      const def = this.buildingsManager.getDefinition(b.type);
      if (def?.defenseRating) {
        defRating += def.defenseRating * b.level;
      }
    }
    for (const c of this.citizens) {
      if (!c.onExpedition && c.profession === 'guard') {
        defRating += 6;
      }
    }
    return defRating;
  }

  rebalanceAssignments() {
    // 1. Assign housing
    const housingBuildings = [];
    for (const b of this.buildingsManager.list) {
      if (!b.completed || b.active === false) continue;
      const def = this.buildingsManager.getDefinition(b.type);
      if (def?.housingCapacity > 0) {
        const slots = Math.round(def.housingCapacity * (1 + (b.level - 1) * 0.4));
        housingBuildings.push({ building: b, slotsLeft: slots });
      }
    }

    for (const c of this.citizens) {
      c.homeId = null;
      for (const h of housingBuildings) {
        if (h.slotsLeft > 0) {
          c.homeId = h.building.id;
          h.slotsLeft--;
          break;
        }
      }
    }

    // 2. Reset building worker counts
    for (const b of this.buildingsManager.list) {
      b.assignedWorkers = 0;
    }

    const availableCitizens = this.citizens.filter((c) => !c.onExpedition);

    // Keep valid manual workplace assignments first
    const unassigned = [];
    for (const c of availableCitizens) {
      if (c.workplaceId) {
        const b = this.buildingsManager.getBuildingById(c.workplaceId);
        const def = b ? this.buildingsManager.getDefinition(b.type) : null;
        if (b && b.completed && b.active !== false && def && b.assignedWorkers < def.workers) {
          b.assignedWorkers++;
          continue;
        }
        c.workplaceId = null;
      }
      unassigned.push(c);
    }

    if (!this.autoAssignWorkers) return;

    // Auto-fill open building slots matching profession first, then any available citizen
    for (const b of this.buildingsManager.list) {
      if (!b.completed || b.active === false) continue;
      const def = this.buildingsManager.getDefinition(b.type);
      if (!def || def.workers <= 0) continue;

      while (b.assignedWorkers < def.workers && unassigned.length > 0) {
        let idx = unassigned.findIndex((c) => c.profession === def.profession);
        if (idx === -1) {
          idx = unassigned.findIndex((c) => c.profession === 'worker');
        }
        if (idx === -1) {
          idx = 0;
        }
        const chosen = unassigned.splice(idx, 1)[0];
        chosen.workplaceId = b.id;
        b.assignedWorkers++;
      }
    }
  }

  updateMovement(dt, speedBonus = 0) {
    const mult = 1 + speedBonus;
    for (const c of this.citizens) {
      stepCitizenMovement(c, dt, this.pathfinder, this.buildingsManager, this.worldMap, mult);
    }
  }

  updateNeedsAndPopulation(dt, { difficulty = 'normal', techMods = {} } = {}) {
    const cfg = balancingData.citizens;
    const diffCfg = balancingData.difficulties[difficulty] || balancingData.difficulties.normal;
    const hasFood = this.resourceManager.get('food') > 1;
    const hasWater = this.resourceManager.get('water') > 1;

    // Calculate medical & leisure bonuses from buildings
    let healthBuildingBonus = 0;
    let happinessBuildingBonus = (diffCfg.happinessBonus || 0) + (techMods.happinessFlatBonus || 0);

    for (const b of this.buildingsManager.list) {
      if (!b.completed || b.active === false) continue;
      const def = this.buildingsManager.getDefinition(b.type);
      if (!def) continue;
      if (def.healthBonus && b.assignedWorkers > 0) healthBuildingBonus += def.healthBonus;
      if (def.happinessBonus) happinessBuildingBonus += def.happinessBonus;
    }

    const housingCap = this.getHousingCapacity();
    const survivors = [];

    for (const c of this.citizens) {
      if (c.onExpedition) {
        survivors.push(c);
        continue;
      }

      // Hunger & Thirst update
      if (hasFood) {
        c.hunger = Math.max(0, c.hunger - 2.4 * dt);
      } else {
        c.hunger = Math.min(100, c.hunger + cfg.hungerIncreasePerSec * dt);
      }

      if (hasWater) {
        c.thirst = Math.max(0, c.thirst - 2.8 * dt);
      } else {
        c.thirst = Math.min(100, c.thirst + cfg.thirstIncreasePerSec * dt);
      }

      // Energy update
      if (c.state === 'resting' || c.state === 'idle') {
        c.energy = Math.min(100, c.energy + cfg.energyRecoverRestPerSec * dt);
      } else {
        c.energy = Math.max(10, c.energy - cfg.energyDrainWorkPerSec * dt);
      }

      // Health update
      let healthDelta = 0.25 + healthBuildingBonus * 0.04 * (1 + (techMods.healthRecoveryBonus || 0));
      if (c.hunger > 80) healthDelta -= cfg.starvationHealthLossPerSec;
      if (c.thirst > 80) healthDelta -= cfg.dehydrationHealthLossPerSec;
      c.health = Math.max(0, Math.min(100, c.health + healthDelta * dt));

      // Happiness target calculation
      let targetHappy = 68 + happinessBuildingBonus;
      if (!c.homeId) targetHappy -= 15;
      if (c.hunger > 50) targetHappy -= 20;
      if (c.thirst > 50) targetHappy -= 25;
      if (c.health < 50) targetHappy -= 15;
      targetHappy = Math.max(5, Math.min(100, targetHappy));
      c.happiness += (targetHappy - c.happiness) * Math.min(1, dt * 0.25);

      if (c.health > 0) {
        survivors.push(c);
      } else {
        this.totalDeaths++;
      }
    }

    if (survivors.length !== this.citizens.length) {
      this.citizens = survivors;
      this.rebalanceAssignments();
    }

    // Periodic natural immigration if housing and food/water are available
    this.immigrationTimer += dt;
    let newImmigrant = null;
    if (this.immigrationTimer >= cfg.immigrationCheckIntervalSec) {
      this.immigrationTimer = 0;
      const avgHappy = this.getAverageHappiness();
      if (
        this.citizens.length < housingCap &&
        avgHappy >= cfg.minHappinessForImmigration &&
        this.resourceManager.get('food') >= 40 &&
        this.resourceManager.get('water') >= 40
      ) {
        const added = this.addImmigrants(1);
        newImmigrant = added[0] || null;
      }
    }

    return { newImmigrant };
  }

  getAverageHappiness() {
    if (this.citizens.length === 0) return 0;
    let sum = 0;
    for (const c of this.citizens) sum += c.happiness;
    return Math.round(sum / this.citizens.length);
  }

  getAverageHealth() {
    if (this.citizens.length === 0) return 0;
    let sum = 0;
    for (const c of this.citizens) sum += c.health;
    return Math.round(sum / this.citizens.length);
  }

  countByProfession(prof) {
    let count = 0;
    for (const c of this.citizens) {
      if (!c.onExpedition && c.profession === prof) count++;
    }
    return count;
  }

  serialize() {
    return {
      nextId: this.nextId,
      autoAssignWorkers: this.autoAssignWorkers,
      totalDeaths: this.totalDeaths,
      totalImmigrants: this.totalImmigrants,
      citizens: this.citizens.map((c) => ({ ...c, path: [] }))
    };
  }

  deserialize(data) {
    if (!data) return;
    this.nextId = data.nextId || 1;
    this.autoAssignWorkers = data.autoAssignWorkers ?? true;
    this.totalDeaths = data.totalDeaths || 0;
    this.totalImmigrants = data.totalImmigrants || 0;
    this.citizens = Array.isArray(data.citizens)
      ? data.citizens.map((c) => ({ ...c, path: [] }))
      : [];
    this.rebalanceAssignments();
  }
}
