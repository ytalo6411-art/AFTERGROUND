import techData from '../data/technologies.json';

export class ResearchManager {
  constructor() {
    this.unlocked = new Set();
    this.activeTechId = null;
    this.activeProgress = 0;
    this.currentEra = 1;
    this.techMap = new Map();
    for (const t of techData.technologies) {
      this.techMap.set(t.id, t);
    }
  }

  getEras() {
    return techData.eras;
  }

  getAllTechnologies() {
    return techData.technologies;
  }

  getTech(id) {
    return this.techMap.get(id) || null;
  }

  isUnlocked(id) {
    return this.unlocked.has(id);
  }

  canResearch(id) {
    const tech = this.getTech(id);
    if (!tech || this.unlocked.has(id)) return false;
    for (const req of tech.prerequisites || []) {
      if (!this.unlocked.has(req)) return false;
    }
    return true;
  }

  startResearch(id, resourceManager) {
    if (!this.canResearch(id)) {
      return { ok: false, reason: 'Pré-requisitos não atendidos ou já pesquisada' };
    }
    const tech = this.getTech(id);
    if (resourceManager.get('science') < tech.cost) {
      return { ok: false, reason: `Requer ${tech.cost} Ciência disponível` };
    }
    resourceManager.spend({ science: tech.cost });
    this.activeTechId = id;
    this.activeProgress = 0;
    return { ok: true, tech };
  }

  update(dt, scientistCount = 1) {
    if (!this.activeTechId) return null;
    const tech = this.getTech(this.activeTechId);
    if (!tech) {
      this.activeTechId = null;
      return null;
    }

    const speed = 1 + scientistCount * 0.35;
    this.activeProgress += dt * speed;

    if (this.activeProgress >= tech.duration) {
      const completedTech = tech;
      this.unlocked.add(tech.id);
      this.activeTechId = null;
      this.activeProgress = 0;
      if (tech.era >= this.currentEra) {
        this.currentEra = Math.min(5, Math.max(this.currentEra, tech.era + (this.countByEra(tech.era) >= 2 ? 1 : 0)));
      }
      return completedTech;
    }
    return null;
  }

  countByEra(era) {
    let count = 0;
    for (const id of this.unlocked) {
      const t = this.getTech(id);
      if (t && t.era === era) count++;
    }
    return count;
  }

  getModifiers() {
    const mods = {
      waterProductionBonus: 0,
      foodProductionBonus: 0,
      energyProductionBonus: 0,
      metalProductionBonus: 0,
      fuelProductionBonus: 0,
      partsProductionBonus: 0,
      scienceProductionBonus: 0,
      globalProductionBonus: 0,
      excavationSpeedBonus: 0,
      buildSpeedBonus: 0,
      healthRecoveryBonus: 0,
      tradeBonus: 0,
      citizenSpeedBonus: 0,
      expeditionSuccessBonus: 0,
      happinessFlatBonus: 0,
      colonyDefenseBonus: 0
    };

    for (const id of this.unlocked) {
      const tech = this.getTech(id);
      if (!tech || !tech.effects) continue;
      for (const [k, v] of Object.entries(tech.effects)) {
        if (typeof v === 'number' && k in mods) {
          mods[k] += v;
        }
      }
    }
    return mods;
  }

  serialize() {
    return {
      unlocked: Array.from(this.unlocked),
      activeTechId: this.activeTechId,
      activeProgress: this.activeProgress,
      currentEra: this.currentEra
    };
  }

  deserialize(data) {
    if (!data) return;
    this.unlocked = new Set(Array.isArray(data.unlocked) ? data.unlocked : []);
    this.activeTechId = data.activeTechId || null;
    this.activeProgress = data.activeProgress || 0;
    this.currentEra = data.currentEra || 1;
  }
}
