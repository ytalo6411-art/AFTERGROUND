export function evaluateTransportNetwork(buildingsManager) {
  let ladders = 0;
  let bridges = 0;
  let elevators = 0;

  for (const b of buildingsManager.list) {
    if (!b.completed) continue;
    if (b.type === 'access_ladder') ladders++;
    else if (b.type === 'structural_bridge') bridges++;
    else if (b.type === 'elevator_shaft') elevators++;
  }

  const movementBonus = Math.min(0.6, elevators * 0.08 + bridges * 0.015 + ladders * 0.01);
  return {
    ladders,
    bridges,
    elevators,
    movementBonus
  };
}
