import buildingsCatalog from '../data/buildings.json';

export class BuildingsManager {
  constructor() {
    this.list = [];
    this.nextId = 1;
    this.version = 1;
    this.definitions = new Map();
    for (const def of buildingsCatalog.buildings) {
      this.definitions.set(def.id, def);
    }
  }

  getCategories() {
    return buildingsCatalog.categories;
  }

  getAllDefinitions() {
    return buildingsCatalog.buildings;
  }

  getDefinition(typeId) {
    return this.definitions.get(typeId) || null;
  }

  getBuildingById(id) {
    return this.list.find((b) => b.id === id) || null;
  }

  getBuildingAt(tx, ty) {
    for (const b of this.list) {
      if (tx >= b.x && tx < b.x + b.width && ty >= b.y && ty < b.y + b.height) {
        return b;
      }
    }
    return null;
  }

  countByType(typeId, completedOnly = true) {
    let count = 0;
    for (const b of this.list) {
      if (b.type === typeId && (!completedOnly || b.completed)) {
        count++;
      }
    }
    return count;
  }

  addBuilding({ type, x, y, completed = false, level = 1 }) {
    const def = this.getDefinition(type);
    if (!def) return null;

    const building = {
      id: this.nextId++,
      type: def.id,
      x,
      y,
      width: def.width,
      height: def.height,
      level,
      completed,
      buildProgress: completed ? def.buildTime : 0,
      buildTime: def.buildTime || 5,
      assignedWorkers: 0,
      maxWorkers: def.workers || 0,
      condition: 100,
      active: true,
      efficiency: 1.0,
      createdAt: Date.now()
    };

    this.list.push(building);
    this.version++;
    return building;
  }

  removeBuilding(id) {
    const idx = this.list.findIndex((b) => b.id === id);
    if (idx === -1) return null;
    const [removed] = this.list.splice(idx, 1);
    this.version++;
    return removed;
  }

  getUpgradeCost(building) {
    const def = this.getDefinition(building.type);
    if (!def || building.level >= 3) return null;
    const mult = building.level === 1 ? 1.35 : 1.85;
    const cost = {};
    for (const [resId, val] of Object.entries(def.cost)) {
      cost[resId] = Math.ceil(val * mult);
    }
    if (building.level === 2 && !cost.parts) {
      cost.parts = 6;
    }
    return cost;
  }

  upgradeBuilding(id, resourceManager) {
    const b = this.getBuildingById(id);
    if (!b || !b.completed || b.level >= 3) return false;
    const cost = this.getUpgradeCost(b);
    if (!cost || !resourceManager.spend(cost)) return false;
    b.level++;
    b.condition = 100;
    this.version++;
    return true;
  }

  repairBuilding(id, resourceManager) {
    const b = this.getBuildingById(id);
    if (!b || b.condition >= 99) return false;
    const repairCost = { stone: 4, metal: 2 };
    if (!resourceManager.spend(repairCost)) return false;
    b.condition = 100;
    return true;
  }

  toggleBuildingActive(id) {
    const b = this.getBuildingById(id);
    if (!b) return false;
    b.active = !b.active;
    this.version++;
    return b.active;
  }

  serialize() {
    return {
      nextId: this.nextId,
      list: this.list.map((b) => ({ ...b }))
    };
  }

  deserialize(data) {
    if (!data) return;
    this.nextId = data.nextId || 1;
    this.list = Array.isArray(data.list) ? data.list.map((b) => ({ ...b })) : [];
    this.version++;
  }
}
