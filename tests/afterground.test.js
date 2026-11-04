import { describe, it, expect } from 'vitest';
import { generateProceduralWorld } from '../src/world/generation.js';
import { TILE_TYPES } from '../src/core/sprites.js';
import { GameState } from '../src/core/state.js';
import { migrateSavePayload, validateSavePayload, CURRENT_SAVE_VERSION } from '../src/save/migrations.js';
import { saveManager } from '../src/save/save.js';

describe('AFTERGROUND — Core Simulation & Systems Suite', () => {
  it('1. Generates a deterministic 200x100 procedural world with surface, shallow, mid and deep strata', () => {
    const worldA = generateProceduralWorld({ width: 200, height: 100, seed: 'TEST-SEED-2189' });
    const worldB = generateProceduralWorld({ width: 200, height: 100, seed: 'TEST-SEED-2189' });
    const worldC = generateProceduralWorld({ width: 200, height: 100, seed: 'DIFFERENT-SEED' });

    expect(worldA.width).toBe(200);
    expect(worldA.height).toBe(100);
    expect(worldA.tiles.length).toBe(20000);
    expect(Array.from(worldA.tiles)).toEqual(Array.from(worldB.tiles));
    expect(Array.from(worldA.tiles)).not.toEqual(Array.from(worldC.tiles));

    // Verify bedrock at bottom and starter tunnel gallery
    expect(worldA.tiles[(worldA.height - 1) * worldA.width + 50]).toBe(TILE_TYPES.BEDROCK);
    expect(worldA.tiles[worldA.galleryY * worldA.width + worldA.centerX]).toBe(TILE_TYPES.TUNNEL);
  });

  it('2. Initializes starter colony with Command Nexus, Access Ladders, 8 Citizens and 10 Resources', () => {
    const state = new GameState({ worldName: 'Colonia Alfa', seed: 'ALFA-1', difficulty: 'normal' });
    state.setupStarterColony();

    expect(state.populationManager.citizens.length).toBe(8);
    expect(state.buildingsManager.countByType('command_nexus', true)).toBe(1);
    expect(state.buildingsManager.countByType('access_ladder', true)).toBeGreaterThanOrEqual(4);

    // Check all 10 resources initialized
    const resKeys = ['food', 'water', 'energy', 'wood', 'stone', 'metal', 'fuel', 'money', 'science', 'parts'];
    for (const k of resKeys) {
      expect(state.resourceManager.get(k)).toBeGreaterThan(0);
    }
  });

  it('3. Validates building placement, progresses construction, upgrades and demolishes with refund', () => {
    const state = new GameState({ seed: 'BUILD-TEST' });
    state.setupStarterColony();

    const cx = state.worldMap.centerX;
    const surfY = state.worldMap.baseSurfaceY;

    // Invalid placement inside solid rock
    const invalidCheck = state.constructionSystem.validatePlacement('pod_shelter', cx, surfY + 12);
    expect(invalidCheck.valid).toBe(false);

    // Valid placement on excavated starter underground gallery (x = cx + 2, y = galleryY - 1, height = 2)
    const galY = state.worldMap.galleryY;
    const placeRes = state.constructionSystem.placeBuilding('pod_shelter', cx + 2, galY - 1);
    expect(placeRes.ok).toBe(true);
    expect(placeRes.building.completed).toBe(false);

    // Advance construction until completed
    state.constructionSystem.updateConstructionProgress(10, 3, 0);
    expect(placeRes.building.completed).toBe(true);

    // Upgrade building from Level 1 to Level 2
    const upgraded = state.buildingsManager.upgradeBuilding(placeRes.building.id, state.resourceManager);
    expect(upgraded).toBe(true);
    expect(placeRes.building.level).toBe(2);

    // Demolish and check partial refund
    const woodBefore = state.resourceManager.get('wood');
    const demoRes = state.constructionSystem.demolishBuilding(placeRes.building.id);
    expect(demoRes.ok).toBe(true);
    expect(state.resourceManager.get('wood')).toBeGreaterThan(woodBefore);
  });

  it('4. Excavates underground tiles, enforces tech locks on Hard Rock, and yields resources', () => {
    const state = new GameState({ seed: 'DIG-TEST' });
    state.setupStarterColony();

    const tx = state.worldMap.centerX;
    const ty = state.worldMap.baseSurfaceY + 2;
    state.worldMap.setTile(tx, ty, TILE_TYPES.ORE_METAL);

    const metalBefore = state.resourceManager.get('metal');
    const markRes = state.excavationSystem.toggleMarkTile(tx, ty);
    expect(markRes.action).toBe('marked');

    // Run excavation update until tile breaks
    const finished = state.excavationSystem.update(5, 4, 0);
    expect(finished.length).toBe(1);
    expect(state.worldMap.getTile(tx, ty)).toBe(TILE_TYPES.TUNNEL);
    expect(state.resourceManager.get('metal')).toBeGreaterThan(metalBefore);

    // Verify Hard Rock requires deep_drilling tech
    const deepY = 85;
    state.worldMap.setTile(tx, deepY, TILE_TYPES.HARD_ROCK);
    const blockedCheck = state.excavationSystem.canExcavateTile(tx, deepY);
    expect(blockedCheck.ok).toBe(false);

    state.researchManager.unlocked.add('deep_drilling');
    const unlockedCheck = state.excavationSystem.canExcavateTile(tx, deepY);
    expect(unlockedCheck.ok).toBe(true);
  });

  it('5. Simulates economy production chains, market trade, research tree and expeditions', () => {
    const state = new GameState({ seed: 'ECON-TEST' });
    state.setupStarterColony();

    // Buy & Sell in Market
    const buyRes = state.economyManager.executeTrade('metal', 'buy', 5);
    expect(buyRes.ok).toBe(true);
    const sellRes = state.economyManager.executeTrade('wood', 'sell', 5);
    expect(sellRes.ok).toBe(true);

    // Start & finish a Technology research
    state.resourceManager.add('science', 50);
    const startTech = state.researchManager.startResearch('basic_filtration', state.resourceManager);
    expect(startTech.ok).toBe(true);
    const completedTech = state.researchManager.update(30, 2);
    expect(completedTech?.id).toBe('basic_filtration');
    expect(state.researchManager.isUnlocked('basic_filtration')).toBe(true);

    // Launch & finish an Expedition
    const launch = state.explorationManager.launchExpedition('site_ash_valley', 0);
    expect(launch.ok).toBe(true);
    const expDone = state.explorationManager.update(30, () => 0.2);
    expect(expDone.length).toBe(1);
    expect(expDone[0].succeeded).toBe(true);
    expect(state.explorationManager.unlockedLoreIds.has('lore_convoy_2189')).toBe(true);
  });

  it('6. Computes A* pathfinding between surface and underground gallery via ladder shaft', () => {
    const state = new GameState({ seed: 'PATH-TEST' });
    state.setupStarterColony();

    const cx = state.worldMap.centerX;
    const surfY = state.worldMap.baseSurfaceY - 1;
    const galY = state.worldMap.galleryY;

    const path = state.pathfinder.findPath(cx, surfY, cx + 2, galY, 240);
    expect(path.length).toBeGreaterThan(0);
    const last = path[path.length - 1];
    expect(last.x).toBe(cx + 2);
    expect(last.y).toBe(galY);
  });

  it('7. Serializes, validates, migrates and restores full GameState accurately', async () => {
    const state = new GameState({ worldName: 'SaveTest', seed: 'SAVE-2241', difficulty: 'hard' });
    state.setupStarterColony();
    state.stepSimulation(2.0);

    const jsonStr = saveManager.exportToJSONString(state);
    const imported = await saveManager.importFromJSONString(jsonStr);
    expect(imported.saveVersion).toBe(CURRENT_SAVE_VERSION);
    expect(validateSavePayload(imported).valid).toBe(true);

    const restored = GameState.deserialize(imported);
    expect(restored.worldName).toBe('SaveTest');
    expect(restored.difficulty).toBe('hard');
    expect(restored.populationManager.citizens.length).toBe(state.populationManager.citizens.length);
  });
});
