import resourcesCatalog from '../data/resources.json';

export function recalculateStorageCapacities(resourceManager, buildingsManager) {
  const baseCaps = {};
  for (const r of resourcesCatalog.resources) {
    baseCaps[r.id] = r.baseCapacity;
  }

  if (buildingsManager) {
    for (const b of buildingsManager.list) {
      if (!b.completed || b.active === false) continue;
      const def = buildingsManager.getDefinition(b.type);
      if (!def || !def.storageBonus) continue;
      const levelMult = 1 + (b.level - 1) * 0.45;
      for (const [resId, bonus] of Object.entries(def.storageBonus)) {
        if (resId in baseCaps) {
          baseCaps[resId] += Math.round(bonus * levelMult);
        }
      }
    }
  }

  for (const [resId, cap] of Object.entries(baseCaps)) {
    resourceManager.capacities[resId] = cap;
    if (resourceManager.amounts[resId] > cap) {
      resourceManager.amounts[resId] = cap;
    }
  }
}
