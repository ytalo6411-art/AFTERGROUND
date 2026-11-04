import eventsCatalog from '../data/events.json';
import balancingData from '../data/balancing.json';

export class EventsManager {
  constructor(resourceManager, populationManager, explorationManager) {
    this.resourceManager = resourceManager;
    this.populationManager = populationManager;
    this.explorationManager = explorationManager;
    this.weather = 'clear';
    this.weatherTimer = 50;
    this.eventCooldown = 55;
    this.activeDilemma = null;
    this.eventHistory = [];
  }

  update(dt, { day = 1, difficulty = 'normal', rand = Math.random } = {}) {
    // 1. Weather cycle
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      const weathers = ['clear', 'clear', 'rain', 'biolum_mist', 'heatwave', 'acid_storm'];
      this.weather = weathers[Math.floor(rand() * weathers.length)];
      this.weatherTimer = 45 + Math.floor(rand() * 35);
    }

    // 2. Dynamic narrative / hazard events
    if (this.activeDilemma) return null;

    const diffMult = balancingData.difficulties[difficulty]?.eventFrequencyMultiplier || 1.0;
    this.eventCooldown -= dt * diffMult;

    if (this.eventCooldown <= 0) {
      this.eventCooldown = 65 + Math.floor(rand() * 35);
      const candidates = eventsCatalog.events.filter((e) => day >= (e.minDay || 1));
      if (candidates.length > 0) {
        const chosen = candidates[Math.floor(rand() * candidates.length)];
        this.activeDilemma = chosen;
        if (chosen.weather) {
          this.weather = chosen.weather;
          this.weatherTimer = chosen.durationSec || 40;
        }
        return chosen;
      }
    }
    return null;
  }

  resolveChoice(choiceId) {
    if (!this.activeDilemma) return null;
    const ev = this.activeDilemma;
    const choice = ev.choices.find((c) => c.id === choiceId) || ev.choices[0];
    this.activeDilemma = null;

    if (!choice) return null;
    const eff = choice.effects || {};
    const outcomeNotes = [];

    if (eff.defenseCheck) {
      const colDef = this.populationManager.getDefenseRating();
      if (colDef >= eff.defenseCheck) {
        if (eff.resources) this.resourceManager.addBatch(eff.resources, 1);
        outcomeNotes.push('Defesa bem-sucedida!');
      } else {
        this.resourceManager.add('food', -20);
        this.resourceManager.add('metal', -10);
        outcomeNotes.push('Defesa insuficiente: perdemos alguns suprimentos.');
      }
    } else if (eff.resources) {
      for (const [resId, delta] of Object.entries(eff.resources)) {
        this.resourceManager.add(resId, delta);
      }
    }

    if (eff.addCitizens) {
      this.populationManager.addImmigrants(eff.addCitizens);
    }

    if (eff.happiness) {
      for (const c of this.populationManager.citizens) {
        c.happiness = Math.max(0, Math.min(100, c.happiness + eff.happiness));
      }
    }

    if (eff.health) {
      for (const c of this.populationManager.citizens) {
        c.health = Math.max(10, Math.min(100, c.health + eff.health));
      }
    }

    if (eff.unlockLore && this.explorationManager) {
      this.explorationManager.unlockedLoreIds.add(eff.unlockLore);
    }

    const record = {
      eventId: ev.id,
      choiceId: choice.id,
      outcomeNotes,
      timestamp: Date.now()
    };
    this.eventHistory.unshift(record);
    if (this.eventHistory.length > 20) this.eventHistory.pop();
    return record;
  }

  serialize() {
    return {
      weather: this.weather,
      weatherTimer: this.weatherTimer,
      eventCooldown: this.eventCooldown,
      activeDilemmaId: this.activeDilemma ? this.activeDilemma.id : null,
      eventHistory: this.eventHistory
    };
  }

  deserialize(data) {
    if (!data) return;
    this.weather = data.weather || 'clear';
    this.weatherTimer = data.weatherTimer || 45;
    this.eventCooldown = data.eventCooldown || 60;
    if (data.activeDilemmaId) {
      this.activeDilemma = eventsCatalog.events.find((e) => e.id === data.activeDilemmaId) || null;
    }
    if (Array.isArray(data.eventHistory)) {
      this.eventHistory = data.eventHistory;
    }
  }
}
