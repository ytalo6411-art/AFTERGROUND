export function evaluatePowerGrid(resourceManager, buildingsManager, weather = 'clear', isDaytime = true) {
  let supply = 0;
  let demand = 0;
  let conduitCount = 0;

  for (const b of buildingsManager.list) {
    if (!b.completed || b.active === false) continue;
    const def = buildingsManager.getDefinition(b.type);
    if (!def) continue;
    if (def.isConduit) {
      conduitCount++;
      continue;
    }

    const levelMult = 1 + (b.level - 1) * 0.45;
    const workerRatio = def.workers > 0 ? Math.max(0.25, b.assignedWorkers / def.workers) : 1;

    if (def.production?.energy) {
      let eProd = def.production.energy * levelMult * workerRatio;
      if (def.id === 'solar_array') {
        if (!isDaytime) eProd *= 0.15;
        if (weather === 'acid_storm') eProd *= 0.4;
      }
      if (def.consumption?.fuel && resourceManager.get('fuel') <= 0.1) {
        eProd *= 0.2;
      }
      supply += eProd;
    }

    if (def.consumption?.energy) {
      demand += def.consumption.energy * levelMult;
    }
  }

  const storedEnergy = resourceManager.get('energy');
  const conduitBonus = Math.min(0.2, conduitCount * 0.015);
  const effectiveSupply = supply * (1 + conduitBonus);

  let gridRatio = 1.0;
  if (demand > effectiveSupply && storedEnergy <= 1) {
    gridRatio = demand > 0 ? Math.max(0.25, effectiveSupply / demand) : 1.0;
  }

  return {
    supply: effectiveSupply,
    demand,
    storedEnergy,
    conduitCount,
    conduitBonus,
    gridRatio,
    isPowered: gridRatio >= 0.5 || storedEnergy > 1
  };
}
