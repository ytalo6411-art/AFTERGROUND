import resourcesCatalog from '../data/resources.json';
import balancingData from '../data/balancing.json';

export class ResourceManager {
  constructor(difficulty = 'normal') {
    this.difficulty = difficulty;
    const diffMult = balancingData.difficulties[difficulty]?.resourceMultiplier || 1.0;

    this.amounts = {};
    this.capacities = {};
    this.production = {};
    this.consumption = {};
    this.net = {};
    this.wasted = {};
    this.breakdown = {}; // resourceId -> { producers: [], consumers: [] }

    for (const res of resourcesCatalog.resources) {
      const startVal = res.id === 'science' ? res.initial : Math.round(res.initial * diffMult);
      this.amounts[res.id] = startVal;
      this.capacities[res.id] = res.baseCapacity;
      this.production[res.id] = 0;
      this.consumption[res.id] = 0;
      this.net[res.id] = 0;
      this.wasted[res.id] = 0;
      this.breakdown[res.id] = { producers: [], consumers: [] };
    }
  }

  getCatalog() {
    return resourcesCatalog.resources;
  }

  get(id) {
    return this.amounts[id] || 0;
  }

  getCapacity(id) {
    return this.capacities[id] || 99999;
  }

  canAfford(costObj = {}) {
    for (const [resId, needed] of Object.entries(costObj)) {
      if ((this.amounts[resId] || 0) < needed) return false;
    }
    return true;
  }

  spend(costObj = {}) {
    if (!this.canAfford(costObj)) return false;
    for (const [resId, needed] of Object.entries(costObj)) {
      this.amounts[resId] = Math.max(0, (this.amounts[resId] || 0) - needed);
    }
    return true;
  }

  add(resId, amount) {
    if (!(resId in this.amounts) || amount === 0) return 0;
    const prev = this.amounts[resId];
    const cap = this.capacities[resId] ?? 99999;
    const next = Math.max(0, Math.min(cap, prev + amount));
    if (prev + amount > cap) {
      this.wasted[resId] = (this.wasted[resId] || 0) + (prev + amount - cap);
    }
    this.amounts[resId] = next;
    return next - prev;
  }

  addBatch(batchObj = {}, multiplier = 1) {
    for (const [resId, val] of Object.entries(batchObj)) {
      this.add(resId, val * multiplier);
    }
  }

  resetCycleRates() {
    for (const res of resourcesCatalog.resources) {
      this.production[res.id] = 0;
      this.consumption[res.id] = 0;
      this.net[res.id] = 0;
      this.breakdown[res.id] = { producers: [], consumers: [] };
    }
  }

  recordRate(resId, deltaPerSec, label) {
    if (!(resId in this.amounts) || Math.abs(deltaPerSec) < 0.001) return;
    if (deltaPerSec > 0) {
      this.production[resId] += deltaPerSec;
      this.breakdown[resId].producers.push({ label, rate: deltaPerSec });
    } else {
      const abs = Math.abs(deltaPerSec);
      this.consumption[resId] += abs;
      this.breakdown[resId].consumers.push({ label, rate: abs });
    }
    this.net[resId] = this.production[resId] - this.consumption[resId];
  }

  serialize() {
    return {
      difficulty: this.difficulty,
      amounts: { ...this.amounts },
      capacities: { ...this.capacities },
      wasted: { ...this.wasted }
    };
  }

  deserialize(data) {
    if (!data) return;
    if (data.difficulty) this.difficulty = data.difficulty;
    if (data.amounts) {
      for (const [k, v] of Object.entries(data.amounts)) {
        if (k in this.amounts && typeof v === 'number' && !Number.isNaN(v)) {
          this.amounts[k] = v;
        }
      }
    }
    if (data.capacities) {
      for (const [k, v] of Object.entries(data.capacities)) {
        if (k in this.capacities && typeof v === 'number') {
          this.capacities[k] = v;
        }
      }
    }
  }
}
