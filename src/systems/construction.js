import { TILE_TYPES } from '../core/sprites.js';

export class ConstructionSystem {
  constructor(worldMap, buildingsManager, resourceManager, researchManager, fog) {
    this.worldMap = worldMap;
    this.buildingsManager = buildingsManager;
    this.resourceManager = resourceManager;
    this.researchManager = researchManager;
    this.fog = fog;
  }

  validatePlacement(typeId, tx, ty, ignoreCost = false) {
    const def = this.buildingsManager.getDefinition(typeId);
    if (!def) {
      return { valid: false, reason: 'Construção inválida / Invalid building', cells: [] };
    }

    // Check required technology
    if (def.requiredTech && this.researchManager && !this.researchManager.isUnlocked(def.requiredTech)) {
      return {
        valid: false,
        reason: `Requer tecnologia: ${def.requiredTech}`,
        cells: []
      };
    }

    const w = def.width;
    const h = def.height;
    const cells = [];
    let allCellsValid = true;
    let failReason = '';

    // Bounds check
    if (tx < 1 || ty < 2 || tx + w >= this.worldMap.width - 1 || ty + h >= this.worldMap.height - 1) {
      return { valid: false, reason: 'Fora dos limites do mapa / Out of bounds', cells: [] };
    }

    // Surface vs Underground placement rule
    const surfY = this.worldMap.getSurfaceY(tx + Math.floor(w / 2));
    if (def.placement === 'surface' && ty + h > surfY + 1) {
      return {
        valid: false,
        reason: 'Deve ser construído na superfície / Must be built on surface',
        cells: []
      };
    }
    if (def.placement === 'underground' && ty < surfY) {
      return {
        valid: false,
        reason: 'Deve ser construído no subsolo / Must be built underground',
        cells: []
      };
    }

    const isInfraOverlay =
      def.id === 'access_ladder' ||
      def.id === 'structural_bridge' ||
      def.id === 'utility_conduit' ||
      def.id === 'elevator_shaft';

    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const cx = tx + dx;
        const cy = ty + dy;
        let cellOk = true;

        if (this.fog && !this.fog.isRevealed(cx, cy)) {
          cellOk = false;
          failReason = 'Área coberta por névoa não explorada / Unexplored fog';
        }

        const existing = this.buildingsManager.getBuildingAt(cx, cy);
        if (existing) {
          cellOk = false;
          failReason = 'Espaço já ocupado por outra estrutura / Space occupied';
        }

        const tile = this.worldMap.getTile(cx, cy);
        if (isInfraOverlay) {
          // Ladders, bridges, conduits and elevators can be placed in open air, tunnels, caves, or water (for bridges)
          const allowedTile =
            tile === TILE_TYPES.AIR ||
            tile === TILE_TYPES.TUNNEL ||
            tile === TILE_TYPES.CAVE ||
            tile === TILE_TYPES.VEGETATION ||
            (def.id === 'structural_bridge' && tile === TILE_TYPES.WATER);
          if (!allowedTile) {
            cellOk = false;
            failReason = 'Escave a rocha primeiro / Excavate rock first';
          }
        } else {
          // Standard buildings require open space (AIR, TUNNEL, CAVE, VEGETATION)
          const open =
            tile === TILE_TYPES.AIR ||
            tile === TILE_TYPES.TUNNEL ||
            tile === TILE_TYPES.CAVE ||
            tile === TILE_TYPES.VEGETATION;
          if (!open) {
            cellOk = false;
            failReason = 'Terreno sólido no local: escave primeiro / Solid terrain: excavate first';
          }
        }

        if (!cellOk) allCellsValid = false;
        cells.push({ x: cx, y: cy, valid: cellOk });
      }
    }

    // Check floor support for standard multi-tile buildings
    if (allCellsValid && !isInfraOverlay) {
      let supportedCount = 0;
      const floorY = ty + h;
      for (let dx = 0; dx < w; dx++) {
        const fx = tx + dx;
        const solidBelow = this.worldMap.isSolid(fx, floorY);
        const bridgeBelow = this.buildingsManager.getBuildingAt(fx, floorY);
        if (solidBelow || bridgeBelow) {
          supportedCount++;
        }
      }
      if (supportedCount < Math.ceil(w * 0.6)) {
        allCellsValid = false;
        failReason = 'Sem fundação sólida abaixo (construa ponte ou apoie no solo) / Needs solid floor';
        for (const c of cells) c.valid = false;
      }
    }

    if (allCellsValid && !ignoreCost && !this.resourceManager.canAfford(def.cost)) {
      return {
        valid: false,
        reason: 'Recursos insuficientes para construir / Insufficient resources',
        cells
      };
    }

    return {
      valid: allCellsValid,
      reason: allCellsValid ? 'Posição válida / Valid placement' : failReason,
      cells
    };
  }

  placeBuilding(typeId, tx, ty, { instant = false, free = false } = {}) {
    const check = this.validatePlacement(typeId, tx, ty, free);
    if (!check.valid) return { ok: false, reason: check.reason };

    const def = this.buildingsManager.getDefinition(typeId);
    if (!free && !this.resourceManager.spend(def.cost)) {
      return { ok: false, reason: 'Recursos insuficientes / Insufficient resources' };
    }

    // Clear surface vegetation in footprint
    for (let dy = 0; dy < def.height; dy++) {
      for (let dx = 0; dx < def.width; dx++) {
        const cx = tx + dx;
        const cy = ty + dy;
        if (this.worldMap.getTile(cx, cy) === TILE_TYPES.VEGETATION) {
          this.worldMap.setTile(cx, cy, TILE_TYPES.AIR);
          this.resourceManager.add('wood', 2);
        }
      }
    }

    const building = this.buildingsManager.addBuilding({
      type: typeId,
      x: tx,
      y: ty,
      completed: instant,
      level: 1
    });

    if (this.fog) {
      this.fog.revealCircle(tx + def.width / 2, ty + def.height / 2, 11, this.worldMap);
    }

    return { ok: true, building };
  }

  demolishBuilding(buildingId) {
    const b = this.buildingsManager.getBuildingById(buildingId);
    if (!b) return { ok: false, reason: 'Estrutura não encontrada' };
    if (b.type === 'command_nexus' && this.buildingsManager.countByType('command_nexus', false) <= 1) {
      return { ok: false, reason: 'Não é possível demolir o único Núcleo de Comando!' };
    }

    const def = this.buildingsManager.getDefinition(b.type);
    const refundRatio = b.completed ? 0.6 : 1.0;
    const refunded = {};
    if (def && def.cost) {
      for (const [resId, val] of Object.entries(def.cost)) {
        const amount = Math.floor(val * refundRatio);
        if (amount > 0) {
          this.resourceManager.add(resId, amount);
          refunded[resId] = amount;
        }
      }
    }

    this.buildingsManager.removeBuilding(buildingId);
    return { ok: true, refunded, wasCompleted: b.completed };
  }

  updateConstructionProgress(dt, builderCount = 1, techSpeedBonus = 0) {
    const completedNow = [];
    const activeSites = this.buildingsManager.list.filter((b) => !b.completed);
    if (activeSites.length === 0) return completedNow;

    // Colony automated construction drone + builders work together so progress is smooth and responsive
    const totalPower = (1.1 + builderCount * 0.75) * (1 + techSpeedBonus);
    const perSiteRate = totalPower / Math.max(1, Math.min(3, activeSites.length));

    for (const b of activeSites) {
      b.buildProgress += perSiteRate * dt;
      if (b.buildProgress >= b.buildTime) {
        b.buildProgress = b.buildTime;
        b.completed = true;
        this.buildingsManager.version++;
        completedNow.push(b);
      }
    }
    return completedNow;
  }
}
