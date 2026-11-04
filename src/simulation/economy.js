import balancingData from '../data/balancing.json';
import { recalculateStorageCapacities } from '../systems/storage.js';
import { evaluatePowerGrid } from '../systems/power.js';
import { localize } from '../core/i18n.js';

export class EconomyManager {
  constructor(resourceManager, buildingsManager, researchManager) {
    this.resourceManager = resourceManager;
    this.buildingsManager = buildingsManager;
    this.researchManager = researchManager;
    this.marketMultipliers = {};
    this.autoTradeRules = {}; // resId -> { mode: 'none'|'buy'|'sell', threshold: number }
    this.tradeHistory = [];

    for (const res of resourceManager.getCatalog()) {
      this.marketMultipliers[res.id] = 1.0;
      this.autoTradeRules[res.id] = { mode: 'none', threshold: 100 };
    }
  }

  getMarketPrice(resId, action = 'buy') {
    const cat = this.resourceManager.getCatalog().find((r) => r.id === resId);
    if (!cat) return 10;
    const mult = this.marketMultipliers[resId] || 1.0;
    const tradeBonus = this.researchManager ? this.researchManager.getModifiers().tradeBonus : 0;
    const hasOutpost = this.buildingsManager.countByType('trade_outpost', true) > 0;
    const spreadDiscount = Math.min(0.25, tradeBonus + (hasOutpost ? 0.1 : 0));

    if (action === 'buy') {
      return Math.max(1, Math.round(cat.basePrice * mult * (1.25 - spreadDiscount)));
    }
    return Math.max(1, Math.round(cat.basePrice * mult * (0.78 + spreadDiscount * 0.6)));
  }

  executeTrade(resId, action, quantity = 10) {
    if (resId === 'money' || quantity <= 0) return { ok: false, reason: 'Recurso inválido' };
    const unitPrice = this.getMarketPrice(resId, action);
    const totalCredits = unitPrice * quantity;

    if (action === 'buy') {
      if (this.resourceManager.get('money') < totalCredits) {
        return { ok: false, reason: 'Créditos insuficientes / Not enough Credits' };
      }
      const spaceLeft = this.resourceManager.getCapacity(resId) - this.resourceManager.get(resId);
      if (spaceLeft <= 0) {
        return { ok: false, reason: 'Armazém cheio para este recurso / Storage full' };
      }
      const actualQty = Math.min(quantity, Math.floor(spaceLeft));
      const actualCost = actualQty * unitPrice;
      this.resourceManager.spend({ money: actualCost });
      this.resourceManager.add(resId, actualQty);
      this.marketMultipliers[resId] = Math.min(1.65, (this.marketMultipliers[resId] || 1) + 0.03);
      this.recordTrade(resId, 'buy', actualQty, actualCost);
      return { ok: true, quantity: actualQty, credits: actualCost };
    }

    if (action === 'sell') {
      const available = this.resourceManager.get(resId);
      if (available < 1) {
        return { ok: false, reason: 'Estoque insuficiente para vender / Insufficient stock' };
      }
      const actualQty = Math.min(quantity, Math.floor(available));
      const earned = actualQty * unitPrice;
      this.resourceManager.spend({ [resId]: actualQty });
      this.resourceManager.add('money', earned);
      this.marketMultipliers[resId] = Math.max(0.55, (this.marketMultipliers[resId] || 1) - 0.03);
      this.recordTrade(resId, 'sell', actualQty, earned);
      return { ok: true, quantity: actualQty, credits: earned };
    }

    return { ok: false, reason: 'Ação desconhecida' };
  }

  recordTrade(resId, action, quantity, credits) {
    this.tradeHistory.unshift({
      resId,
      action,
      quantity,
      credits,
      timestamp: Date.now()
    });
    if (this.tradeHistory.length > 20) this.tradeHistory.pop();
  }

  updateMarketDrift() {
    for (const k of Object.keys(this.marketMultipliers)) {
      const cur = this.marketMultipliers[k];
      this.marketMultipliers[k] = cur + (1.0 - cur) * 0.08;
    }
  }

  stepEconomy(dt, { populationCount = 0, difficulty = 'normal', weather = 'clear', isDaytime = true, lang = 'pt-BR' } = {}) {
    recalculateStorageCapacities(this.resourceManager, this.buildingsManager);
    this.resourceManager.resetCycleRates();

    const diffCfg = balancingData.difficulties[difficulty] || balancingData.difficulties.normal;
    const techMods = this.researchManager ? this.researchManager.getModifiers() : {};
    const powerStatus = evaluatePowerGrid(this.resourceManager, this.buildingsManager, weather, isDaytime);

    // Academy global efficiency bonus
    const academies = this.buildingsManager.countByType('technical_academy', true);
    const academyBonus = academies * 0.12;
    const globalProdMult =
      diffCfg.productionMultiplier * (1 + (techMods.globalProductionBonus || 0) + academyBonus);

    // 1. Evaluate each completed active building
    for (const b of this.buildingsManager.list) {
      if (!b.completed || b.active === false) {
        b.efficiency = 0;
        continue;
      }

      const def = this.buildingsManager.getDefinition(b.type);
      if (!def) continue;

      const label = `${localize(def.name, lang)} #${b.id}`;
      const levelMult = 1 + (b.level - 1) * 0.45;
      const workerRatio = def.workers > 0 ? b.assignedWorkers / def.workers : 1;

      if (def.workers > 0 && workerRatio <= 0) {
        b.efficiency = 0;
        continue;
      }

      // Check if inputs are available
      let inputFactor = 1.0;
      if (def.consumption) {
        for (const [inRes, inRate] of Object.entries(def.consumption)) {
          if (inRes === 'energy') {
            inputFactor = Math.min(inputFactor, powerStatus.gridRatio);
          } else {
            const neededNow = inRate * levelMult * workerRatio * dt;
            const haveNow = this.resourceManager.get(inRes);
            if (haveNow < neededNow) {
              inputFactor = Math.min(inputFactor, haveNow > 0 ? haveNow / neededNow : 0);
            }
          }
        }
      }

      b.efficiency = Math.max(0, Math.min(1.5, workerRatio * inputFactor));

      // Consume inputs
      if (def.consumption && b.efficiency > 0) {
        for (const [inRes, inRate] of Object.entries(def.consumption)) {
          const actualConsPerSec = inRate * levelMult * b.efficiency;
          this.resourceManager.add(inRes, -actualConsPerSec * dt);
          this.resourceManager.recordRate(inRes, -actualConsPerSec, label);
        }
      }

      // Produce outputs
      if (def.production && b.efficiency > 0) {
        for (const [outRes, outRate] of Object.entries(def.production)) {
          let specificBonus = 0;
          if (outRes === 'water') specificBonus = techMods.waterProductionBonus || 0;
          else if (outRes === 'food') specificBonus = techMods.foodProductionBonus || 0;
          else if (outRes === 'energy') specificBonus = techMods.energyProductionBonus || 0;
          else if (outRes === 'metal') specificBonus = techMods.metalProductionBonus || 0;
          else if (outRes === 'fuel') specificBonus = techMods.fuelProductionBonus || 0;
          else if (outRes === 'parts') specificBonus = techMods.partsProductionBonus || 0;
          else if (outRes === 'science') specificBonus = techMods.scienceProductionBonus || 0;

          let weatherMult = 1.0;
          if (def.id === 'solar_array') {
            if (!isDaytime) weatherMult *= 0.15;
            if (weather === 'acid_storm') weatherMult *= 0.4;
          }
          if (outRes === 'water') {
            if (weather === 'rain') weatherMult *= 1.3;
            else if (weather === 'heatwave') weatherMult *= 0.75;
          }
          if (outRes === 'science' && weather === 'biolum_mist') {
            weatherMult *= 1.25;
          }

          const actualProdPerSec =
            outRate * levelMult * b.efficiency * globalProdMult * (1 + specificBonus) * weatherMult;
          this.resourceManager.add(outRes, actualProdPerSec * dt);
          this.resourceManager.recordRate(outRes, actualProdPerSec, label);
        }
      }

      // Mild building wear over time
      b.condition = Math.max(25, b.condition - 0.008 * dt);
    }

    // 2. Citizen vital consumption (Food & Water)
    if (populationCount > 0) {
      const foodConsPerSec =
        populationCount * balancingData.citizens.foodPerCitizenPerCycle * diffCfg.consumptionMultiplier;
      const waterConsPerSec =
        populationCount *
        balancingData.citizens.waterPerCitizenPerCycle *
        diffCfg.consumptionMultiplier *
        (weather === 'heatwave' ? 1.2 : 1.0);

      const popLabel = lang === 'en-US' ? `Citizens (${populationCount})` : `Cidadãos (${populationCount})`;
      this.resourceManager.add('food', -foodConsPerSec * dt);
      this.resourceManager.recordRate('food', -foodConsPerSec, popLabel);

      this.resourceManager.add('water', -waterConsPerSec * dt);
      this.resourceManager.recordRate('water', -waterConsPerSec, popLabel);
    }

    // 3. Execute automatic trade contracts if Trade Outpost is operational
    if (this.buildingsManager.countByType('trade_outpost', true) > 0) {
      for (const [resId, rule] of Object.entries(this.autoTradeRules)) {
        if (!rule || rule.mode === 'none') continue;
        const cur = this.resourceManager.get(resId);
        if (rule.mode === 'buy' && cur < rule.threshold && this.resourceManager.get('money') >= 50) {
          this.executeTrade(resId, 'buy', 5);
        } else if (rule.mode === 'sell' && cur > rule.threshold) {
          this.executeTrade(resId, 'sell', 5);
        }
      }
    }

    return powerStatus;
  }

  serialize() {
    return {
      marketMultipliers: { ...this.marketMultipliers },
      autoTradeRules: JSON.parse(JSON.stringify(this.autoTradeRules)),
      tradeHistory: this.tradeHistory.slice(0, 15)
    };
  }

  deserialize(data) {
    if (!data) return;
    if (data.marketMultipliers) this.marketMultipliers = { ...this.marketMultipliers, ...data.marketMultipliers };
    if (data.autoTradeRules) this.autoTradeRules = { ...this.autoTradeRules, ...data.autoTradeRules };
    if (Array.isArray(data.tradeHistory)) this.tradeHistory = data.tradeHistory;
  }
}
