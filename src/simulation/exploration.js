import missionsData from '../data/missions.json';

export class ExplorationManager {
  constructor(resourceManager, populationManager, researchManager) {
    this.resourceManager = resourceManager;
    this.populationManager = populationManager;
    this.researchManager = researchManager;
    this.activeExpeditions = [];
    this.completedSiteIds = new Set();
    this.unlockedLoreIds = new Set(['lore_intro_2189']);
    this.totalCompleted = 0;
  }

  getSites() {
    return missionsData.expeditionSites;
  }

  getLoreEntries() {
    return missionsData.loreEntries;
  }

  canLaunch(siteId, teamSize = null) {
    const site = this.getSites().find((s) => s.id === siteId);
    if (!site) return { ok: false, reason: 'Destino desconhecido' };
    if (this.activeExpeditions.some((e) => e.siteId === siteId)) {
      return { ok: false, reason: 'Expedição já em andamento neste setor' };
    }

    const neededTeam = teamSize || site.minTeam;
    const freeCitizens = this.populationManager.citizens.filter((c) => !c.onExpedition);
    if (freeCitizens.length < neededTeam + 2) {
      return { ok: false, reason: `Mantenha ao menos 2 cidadãos na base (requer +${neededTeam})` };
    }

    if (!this.resourceManager.canAfford(site.supplyCost)) {
      return { ok: false, reason: 'Suprimentos insuficientes (Comida, Água ou Combustível)' };
    }

    return { ok: true, site, neededTeam };
  }

  launchExpedition(siteId, extraTeam = 0) {
    const site = this.getSites().find((s) => s.id === siteId);
    if (!site) return { ok: false, reason: 'Destino inválido' };
    const teamCount = site.minTeam + Math.max(0, extraTeam);
    const check = this.canLaunch(siteId, teamCount);
    if (!check.ok) return check;

    this.resourceManager.spend(site.supplyCost);

    const freeCitizens = this.populationManager.citizens.filter((c) => !c.onExpedition);
    const teamIds = [];
    for (let i = 0; i < teamCount; i++) {
      freeCitizens[i].onExpedition = true;
      freeCitizens[i].state = 'expedition';
      teamIds.push(freeCitizens[i].id);
    }
    this.populationManager.rebalanceAssignments();

    const techBonus = this.researchManager ? this.researchManager.getModifiers().expeditionSuccessBonus || 0 : 0;
    const extraTeamBonus = Math.max(0, extraTeam) * 0.05;
    const successChance = Math.min(0.98, site.baseSuccess + techBonus + extraTeamBonus);

    const exp = {
      id: `exp_${Date.now()}_${siteId}`,
      siteId: site.id,
      teamIds,
      progress: 0,
      duration: site.durationSec,
      successChance
    };

    this.activeExpeditions.push(exp);
    return { ok: true, expedition: exp, site };
  }

  update(dt, rand = Math.random) {
    const results = [];
    const remaining = [];

    for (const exp of this.activeExpeditions) {
      exp.progress += dt;
      if (exp.progress < exp.duration) {
        remaining.push(exp);
        continue;
      }

      // Release citizens back to colony
      for (const cid of exp.teamIds) {
        const c = this.populationManager.getCitizenById(cid);
        if (c) {
          c.onExpedition = false;
          c.state = 'idle';
          c.history.unshift(`Retornou de expedição (${exp.siteId}).`);
        }
      }
      this.populationManager.rebalanceAssignments();

      const site = this.getSites().find((s) => s.id === exp.siteId);
      const succeeded = rand() <= exp.successChance;
      const earned = {};

      if (site) {
        const mult = succeeded ? 1.0 : 0.45;
        for (const [k, val] of Object.entries(site.rewards || {})) {
          if (k === 'citizens') {
            if (succeeded) {
              this.populationManager.addImmigrants(val, rand);
              earned.citizens = val;
            }
          } else {
            const amt = Math.max(1, Math.round(val * mult));
            this.resourceManager.add(k, amt);
            earned[k] = amt;
          }
        }
        if (site.loreId) {
          this.unlockedLoreIds.add(site.loreId);
        }
        this.completedSiteIds.add(site.id);
      }

      this.totalCompleted++;
      results.push({
        expedition: exp,
        site,
        succeeded,
        earned
      });
    }

    this.activeExpeditions = remaining;
    return results;
  }

  serialize() {
    return {
      activeExpeditions: this.activeExpeditions.map((e) => ({ ...e })),
      completedSiteIds: Array.from(this.completedSiteIds),
      unlockedLoreIds: Array.from(this.unlockedLoreIds),
      totalCompleted: this.totalCompleted
    };
  }

  deserialize(data) {
    if (!data) return;
    this.activeExpeditions = Array.isArray(data.activeExpeditions) ? data.activeExpeditions : [];
    this.completedSiteIds = new Set(Array.isArray(data.completedSiteIds) ? data.completedSiteIds : []);
    this.unlockedLoreIds = new Set(
      Array.isArray(data.unlockedLoreIds) ? data.unlockedLoreIds : ['lore_intro_2189']
    );
    this.totalCompleted = data.totalCompleted || 0;
  }
}
