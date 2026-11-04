const FIRST_NAMES = [
  'Kaelen', 'Lyra', 'Vance', 'Elena', 'Darius', 'Mira', 'Orion', 'Talia',
  'Soren', 'Nadia', 'Cassian', 'Freya', 'Juno', 'Mateo', 'Iris', 'Gideon',
  'Clara', 'Ronan', 'Selene', 'Lucas', 'Aurora', 'Viktor', 'Maya', 'Zane'
];

const LAST_NAMES = [
  'Voss', 'Kovac', 'Silva', 'Mercer', 'Chen', 'Solis', 'Valen', 'Rios',
  'Thorne', 'Aris', 'Moreau', 'Lind', 'Dantas', 'Sato', 'Kemp', 'ferro'
];

export const PROFESSIONS = [
  'worker',
  'builder',
  'miner',
  'farmer',
  'engineer',
  'scientist',
  'medic',
  'guard'
];

export function createCitizen({ id, x, y, profession = 'worker', rand = Math.random }) {
  const first = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)];
  return {
    id,
    name: `${first} ${last.charAt(0).toUpperCase() + last.slice(1)}`,
    age: 19 + Math.floor(rand() * 34),
    profession,
    x,
    y,
    targetX: x,
    targetY: y,
    path: [],
    health: 96,
    hunger: 12,     // 0 = well-fed, 100 = starving
    thirst: 10,     // 0 = hydrated, 100 = dehydrated
    happiness: 78,  // 0..100
    energy: 92,     // 0..100
    homeId: null,
    workplaceId: null,
    state: 'idle',
    onExpedition: false,
    taskTimer: 0,
    history: ['Ingressou na colônia em 2241 A.E.']
  };
}

export function stepCitizenMovement(citizen, dt, pathfinder, buildingsManager, worldMap, speedMult = 1.0) {
  if (citizen.onExpedition) {
    citizen.state = 'expedition';
    return;
  }

  const baseSpeed = 3.2 * speedMult; // tiles per second

  if (citizen.path && citizen.path.length > 0) {
    citizen.state = 'walking';
    const nextNode = citizen.path[0];
    const dx = nextNode.x - citizen.x;
    const dy = nextNode.y - citizen.y;
    const dist = Math.hypot(dx, dy);
    const stepDist = baseSpeed * dt;

    if (dist <= stepDist) {
      citizen.x = nextNode.x;
      citizen.y = nextNode.y;
      citizen.path.shift();
    } else {
      citizen.x += (dx / dist) * stepDist;
      citizen.y += (dy / dist) * stepDist;
    }
    return;
  }

  // Decide next destination when idle or timer expires
  citizen.taskTimer -= dt;
  if (citizen.taskTimer > 0) return;

  citizen.taskTimer = 4 + (citizen.id % 4);

  // 1. Low energy -> go rest at home or Command Nexus
  if (citizen.energy < 28 && citizen.homeId) {
    const home = buildingsManager.getBuildingById(citizen.homeId);
    if (home) {
      const gx = home.x + Math.floor(home.width / 2);
      const gy = home.y + home.height - 1;
      citizen.path = pathfinder.findPath(citizen.x, citizen.y, gx, gy, 180);
      citizen.state = 'resting';
      return;
    }
  }

  // 2. Builders prioritize unfinished buildings
  if (citizen.profession === 'builder') {
    const site = buildingsManager.list.find((b) => !b.completed);
    if (site) {
      const gx = site.x + Math.floor(site.width / 2);
      const gy = site.y + site.height - 1;
      citizen.path = pathfinder.findPath(citizen.x, citizen.y, gx, gy, 180);
      citizen.state = 'building';
      return;
    }
  }

  // 3. Miners prioritize active excavation tasks
  if (citizen.profession === 'miner' && worldMap.excavationTasks.size > 0) {
    const firstTask = worldMap.excavationTasks.values().next().value;
    if (firstTask) {
      citizen.path = pathfinder.findPath(citizen.x, citizen.y, firstTask.x, firstTask.y, 180);
      citizen.state = 'excavating';
      return;
    }
  }

  // 4. Go to assigned workplace
  if (citizen.workplaceId) {
    const work = buildingsManager.getBuildingById(citizen.workplaceId);
    if (work && work.completed && work.active !== false) {
      const gx = work.x + Math.floor(work.width / 2);
      const gy = work.y + work.height - 1;
      if (Math.abs(citizen.x - gx) > 1.5 || Math.abs(citizen.y - gy) > 1.5) {
        citizen.path = pathfinder.findPath(citizen.x, citizen.y, gx, gy, 180);
      }
      citizen.state = 'working';
      return;
    }
  }

  // 5. Patrol / wander near colony center
  const offset = ((citizen.id * 5 + Math.floor(Date.now() / 4000)) % 9) - 4;
  const targetX = Math.max(4, Math.min(worldMap.width - 5, worldMap.centerX + offset));
  const targetY = worldMap.baseSurfaceY - 1;
  citizen.path = pathfinder.findPath(citizen.x, citizen.y, targetX, targetY, 120);
  citizen.state = citizen.path.length > 0 ? 'walking' : 'idle';
}
