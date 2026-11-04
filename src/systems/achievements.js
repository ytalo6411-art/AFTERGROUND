import missionsData from '../data/missions.json';

export class ProgressionManager {
  constructor() {
    this.completedMissions = new Set();
    this.unlockedAchievements = new Map(); // id -> unlockedAt ISO string
    this.historySnapshots = [];
  }

  getMissions() {
    return missionsData.missions;
  }

  getAchievementsCatalog() {
    return missionsData.achievements;
  }

  evaluateMissions({ buildingsManager, excavationSystem, researchManager, populationManager, explorationManager, resourceManager }) {
    const newlyCompleted = [];

    for (const m of missionsData.missions) {
      if (this.completedMissions.has(m.id)) continue;
      const g = m.goal;
      let done = false;

      if (g.type === 'building_count') {
        done = buildingsManager.countByType(g.buildingId, true) >= g.target;
      } else if (g.type === 'buildings_combo') {
        done = Object.entries(g.targets).every(
          ([bId, count]) => buildingsManager.countByType(bId, true) >= count
        );
      } else if (g.type === 'excavated_tiles') {
        done = excavationSystem.totalExcavated >= g.target;
      } else if (g.type === 'tech_count') {
        done = researchManager.unlocked.size >= g.target;
      } else if (g.type === 'tech_unlocked') {
        done = researchManager.isUnlocked(g.techId);
      } else if (g.type === 'population') {
        done = populationManager.citizens.length >= g.target;
      } else if (g.type === 'expeditions_completed') {
        done = explorationManager.totalCompleted >= g.target;
      }

      if (done) {
        this.completedMissions.add(m.id);
        if (m.reward && resourceManager) {
          resourceManager.addBatch(m.reward, 1);
        }
        newlyCompleted.push(m);
      }
    }

    return newlyCompleted;
  }

  evaluateAchievements({ buildingsManager, excavationSystem, researchManager, populationManager, explorationManager, resourceManager }) {
    const newlyUnlocked = [];
    const completedBuildings = buildingsManager.list.filter((b) => b.completed).length;
    const popCount = populationManager.citizens.length;

    const checks = {
      ach_first_dig: excavationSystem.totalExcavated >= 1,
      ach_deep_miner: excavationSystem.totalExcavated >= 50,
      ach_builder_5: completedBuildings >= 5,
      ach_builder_15: completedBuildings >= 15,
      ach_pop_15: popCount >= 15,
      ach_pop_30: popCount >= 30,
      ach_pop_60: popCount >= 60,
      ach_first_tech: researchManager.unlocked.size >= 1,
      ach_era_3: researchManager.currentEra >= 3,
      ach_era_5: researchManager.currentEra >= 5,
      ach_first_expedition: explorationManager.totalCompleted >= 1,
      ach_wealthy: resourceManager.get('money') >= 1000
    };

    for (const ach of missionsData.achievements) {
      if (this.unlockedAchievements.has(ach.id)) continue;
      if (checks[ach.id]) {
        const nowIso = new Date().toISOString();
        this.unlockedAchievements.set(ach.id, nowIso);
        newlyUnlocked.push(ach);
      }
    }

    return newlyUnlocked;
  }

  recordSnapshot({ day, year, population, happiness, food, water, energy, money, science }) {
    this.historySnapshots.push({
      day,
      year,
      population,
      happiness,
      food: Math.round(food),
      water: Math.round(water),
      energy: Math.round(energy),
      money: Math.round(money),
      science: Math.round(science)
    });
    if (this.historySnapshots.length > 60) {
      this.historySnapshots.shift();
    }
  }

  serialize() {
    return {
      completedMissions: Array.from(this.completedMissions),
      unlockedAchievements: Array.from(this.unlockedAchievements.entries()),
      historySnapshots: this.historySnapshots
    };
  }

  deserialize(data) {
    if (!data) return;
    this.completedMissions = new Set(Array.isArray(data.completedMissions) ? data.completedMissions : []);
    this.unlockedAchievements = new Map(
      Array.isArray(data.unlockedAchievements) ? data.unlockedAchievements : []
    );
    this.historySnapshots = Array.isArray(data.historySnapshots) ? data.historySnapshots : [];
  }
}
