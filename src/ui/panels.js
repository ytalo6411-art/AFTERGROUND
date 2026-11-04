import { localize, getLanguage, t } from '../core/i18n.js';
import { PROFESSIONS } from '../simulation/citizens.js';
import { audio } from '../core/audio.js';

export function formatCostMap(costObj = {}, lang = getLanguage()) {
  const entries = Object.entries(costObj);
  if (entries.length === 0) return lang === 'en-US' ? 'None' : 'Nenhum';
  return entries.map(([k, v]) => `${v} ${k.toUpperCase()}`).join(' · ');
}

export function renderBuildingInspector(container, engine, building, onUpdate) {
  if (!container || !building || !engine.state) return;
  const lang = getLanguage();
  const st = engine.state;
  const def = st.buildingsManager.getDefinition(building.type);
  if (!def) return;

  const upgradeCost = st.buildingsManager.getUpgradeCost(building);
  const canUpgrade = upgradeCost && st.resourceManager.canAfford(upgradeCost);
  const levelMult = (1 + (building.level - 1) * 0.45).toFixed(2);

  const prodHtml = Object.entries(def.production || {})
    .map(([k, v]) => `<span class="ag-tag ag-tag-pos">+${(v * levelMult * (building.efficiency || 1)).toFixed(1)}/s ${k.toUpperCase()}</span>`)
    .join(' ');
  const consHtml = Object.entries(def.consumption || {})
    .map(([k, v]) => `<span class="ag-tag ag-tag-neg">-${(v * levelMult).toFixed(1)}/s ${k.toUpperCase()}</span>`)
    .join(' ');

  container.innerHTML = `
    <div class="ag-inspector-card">
      <div class="ag-inspector-header">
        <div>
          <span class="ag-badge" style="background:${def.accentColor || '#f59e0b'}22;color:${def.accentColor || '#f59e0b'};border:1px solid ${def.accentColor || '#f59e0b'}">
            ${t('level')} ${building.level}/3
          </span>
          <h4>${localize(def.name, lang)} <small>#${building.id}</small></h4>
        </div>
        <button class="ag-icon-btn" id="btn-close-inspector" title="Fechar">✕</button>
      </div>
      <p class="ag-inspector-desc">${localize(def.description, lang)}</p>

      ${
        !building.completed
          ? `<div class="ag-progress-box">
               <div class="ag-progress-label">Construindo... ${Math.round((building.buildProgress / building.buildTime) * 100)}%</div>
               <div class="ag-progress-bar"><div style="width:${Math.min(100, (building.buildProgress / building.buildTime) * 100)}%"></div></div>
             </div>`
          : `
      <div class="ag-inspector-stats">
        <div><span>Estado:</span> <strong style="color:${building.active !== false ? '#4ade80' : '#f87171'}">${building.active !== false ? 'Operacional' : 'Pausado'}</strong></div>
        <div><span>Eficiência:</span> <strong>${Math.round((building.efficiency || 0) * 100)}%</strong></div>
        <div><span>${t('workers')}:</span> <strong>${building.assignedWorkers} / ${def.workers || 0}</strong></div>
        <div><span>Integridade:</span> <strong>${Math.round(building.condition)}%</strong></div>
        ${def.housingCapacity ? `<div><span>Capacidade Moradia:</span> <strong>+${Math.round(def.housingCapacity * levelMult)}</strong></div>` : ''}
      </div>

      ${prodHtml ? `<div class="ag-inspector-row"><small>Produção:</small><div>${prodHtml}</div></div>` : ''}
      ${consHtml ? `<div class="ag-inspector-row"><small>Consumo:</small><div>${consHtml}</div></div>` : ''}
      `
      }

      <div class="ag-inspector-actions">
        ${
          building.completed
            ? `
          <button class="ag-btn ag-btn-secondary" id="btn-toggle-bldg">
            ${building.active !== false ? '⏸ Pausar Prédio' : '▶ Ativar Prédio'}
          </button>
          ${
            building.level < 3
              ? `<button class="ag-btn ag-btn-primary" id="btn-upgrade-bldg" ${canUpgrade ? '' : 'disabled'}>
                   ⬆ ${t('upgrade')} (${formatCostMap(upgradeCost, lang)})
                 </button>`
              : `<span class="ag-badge">Nível Máximo Atingido</span>`
          }
          ${
            building.condition < 95
              ? `<button class="ag-btn ag-btn-secondary" id="btn-repair-bldg">🔧 ${t('repair')} (4 STONE, 2 METAL)</button>`
              : ''
          }
          <button class="ag-btn ag-btn-danger" id="btn-demolish-bldg">🗑 ${t('demolishRefund')}</button>
        `
            : `<button class="ag-btn ag-btn-danger" id="btn-demolish-bldg">✕ ${t('cancelBuild')}</button>`
        }
      </div>
    </div>
  `;

  container.querySelector('#btn-close-inspector')?.addEventListener('click', () => {
    st.selectedBuildingId = null;
    container.innerHTML = '';
  });

  container.querySelector('#btn-toggle-bldg')?.addEventListener('click', () => {
    st.buildingsManager.toggleBuildingActive(building.id);
    st.populationManager.rebalanceAssignments();
    audio.playClick();
    onUpdate();
  });

  container.querySelector('#btn-upgrade-bldg')?.addEventListener('click', () => {
    if (st.buildingsManager.upgradeBuilding(building.id, st.resourceManager)) {
      audio.playComplete();
      onUpdate();
    }
  });

  container.querySelector('#btn-repair-bldg')?.addEventListener('click', () => {
    if (st.buildingsManager.repairBuilding(building.id, st.resourceManager)) {
      audio.playBuild();
      onUpdate();
    }
  });

  container.querySelector('#btn-demolish-bldg')?.addEventListener('click', () => {
    const res = st.constructionSystem.demolishBuilding(building.id);
    if (res.ok) {
      audio.playDig();
      st.selectedBuildingId = null;
      container.innerHTML = '';
      onUpdate();
    }
  });
}

export function renderCitizenInspector(container, engine, citizen, onUpdate) {
  if (!container || !citizen || !engine.state) return;
  const lang = getLanguage();
  const st = engine.state;
  const home = citizen.homeId ? st.buildingsManager.getBuildingById(citizen.homeId) : null;
  const work = citizen.workplaceId ? st.buildingsManager.getBuildingById(citizen.workplaceId) : null;
  const homeDef = home ? st.buildingsManager.getDefinition(home.type) : null;
  const workDef = work ? st.buildingsManager.getDefinition(work.type) : null;

  const profOptions = PROFESSIONS.map(
    (p) =>
      `<option value="${p}" ${citizen.profession === p ? 'selected' : ''}>${t(`professions.${p}`, p)}</option>`
  ).join('');

  container.innerHTML = `
    <div class="ag-inspector-card">
      <div class="ag-inspector-header">
        <div>
          <span class="ag-badge">${t(`professions.${citizen.profession}`, citizen.profession)}</span>
          <h4>${citizen.name} <small>(${citizen.age} anos)</small></h4>
        </div>
        <button class="ag-icon-btn" id="btn-close-cit-inspector">✕</button>
      </div>

      <div class="ag-inspector-stats">
        <div><span>Atividade:</span> <strong>${t(`states.${citizen.state}`, citizen.state)}</strong></div>
        <div><span>Moradia:</span> <strong>${homeDef ? `${localize(homeDef.name, lang)} #${home.id}` : 'Sem abrigo fixo'}</strong></div>
        <div><span>Posto:</span> <strong>${workDef ? `${localize(workDef.name, lang)} #${work.id}` : 'Equipe Geral'}</strong></div>
      </div>

      <div class="ag-bars-list">
        <div class="ag-stat-bar-row">
          <span>❤ Saúde (${Math.round(citizen.health)}%)</span>
          <div class="ag-mini-bar"><div style="width:${citizen.health}%;background:#4ade80"></div></div>
        </div>
        <div class="ag-stat-bar-row">
          <span>🌾 Nutrição (${Math.round(100 - citizen.hunger)}%)</span>
          <div class="ag-mini-bar"><div style="width:${100 - citizen.hunger}%;background:#84cc16"></div></div>
        </div>
        <div class="ag-stat-bar-row">
          <span>💧 Hidratação (${Math.round(100 - citizen.thirst)}%)</span>
          <div class="ag-mini-bar"><div style="width:${100 - citizen.thirst}%;background:#38bdf8"></div></div>
        </div>
        <div class="ag-stat-bar-row">
          <span>⚡ Energia (${Math.round(citizen.energy)}%)</span>
          <div class="ag-mini-bar"><div style="width:${citizen.energy}%;background:#fbbf24"></div></div>
        </div>
        <div class="ag-stat-bar-row">
          <span>😊 Felicidade (${Math.round(citizen.happiness)}%)</span>
          <div class="ag-mini-bar"><div style="width:${citizen.happiness}%;background:#c084fc"></div></div>
        </div>
      </div>

      <div class="ag-inspector-row" style="margin-top:8px;">
        <label style="font-size:12px;color:#94a3b8;">Designar Profissão Manual:</label>
        <select id="sel-cit-prof" class="ag-select">${profOptions}</select>
      </div>

      <div class="ag-citizen-history">
        ${(citizen.history || []).slice(0, 3).map((h) => `<div>• ${h}</div>`).join('')}
      </div>
    </div>
  `;

  container.querySelector('#btn-close-cit-inspector')?.addEventListener('click', () => {
    st.selectedCitizenId = null;
    container.innerHTML = '';
  });

  container.querySelector('#sel-cit-prof')?.addEventListener('change', (e) => {
    st.populationManager.setCitizenProfession(citizen.id, e.target.value);
    audio.playClick();
    onUpdate();
  });
}

export function renderResearchModalContent(engine, refreshModal) {
  const st = engine.state;
  const lang = getLanguage();
  const rm = st.researchManager;
  const eras = rm.getEras();
  const allTechs = rm.getAllTechnologies();
  const activeTech = rm.activeTechId ? rm.getTech(rm.activeTechId) : null;

  let activeBanner = `<div class="ag-panel-banner">Nenhuma pesquisa ativa no momento. Selecione uma tecnologia abaixo para iniciar! (Ciência disponível: <strong>${Math.floor(st.resourceManager.get('science'))}</strong>)</div>`;
  if (activeTech) {
    const pct = Math.min(100, Math.round((rm.activeProgress / activeTech.duration) * 100));
    activeBanner = `
      <div class="ag-panel-banner ag-banner-active">
        <div><strong>Pesquisando: ${localize(activeTech.name, lang)}</strong> (${pct}%)</div>
        <div class="ag-progress-bar"><div style="width:${pct}%"></div></div>
      </div>
    `;
  }

  const erasHtml = eras
    .map((era) => {
      const techs = allTechs.filter((tItem) => tItem.era === era.id);
      const cards = techs
        .map((tech) => {
          const unlocked = rm.isUnlocked(tech.id);
          const isCurrent = rm.activeTechId === tech.id;
          const canStart = rm.canResearch(tech.id);
          const affordable = st.resourceManager.get('science') >= tech.cost;

          const prereqNames = (tech.prerequisites || [])
            .map((pid) => {
              const pt = rm.getTech(pid);
              return pt ? localize(pt.name, lang) : pid;
            })
            .join(', ');

          return `
            <div class="ag-tech-card ${unlocked ? 'unlocked' : canStart ? 'available' : 'locked'}">
              <div class="ag-tech-top">
                <h5>${localize(tech.name, lang)}</h5>
                <span class="ag-badge">${tech.cost} CIÊNCIA · ${tech.duration}s</span>
              </div>
              <p>${localize(tech.description, lang)}</p>
              ${prereqNames ? `<div class="ag-tech-req">Requer: ${prereqNames}</div>` : ''}
              <div class="ag-tech-footer">
                ${
                  unlocked
                    ? `<span class="ag-status-ok">✔ Desbloqueada</span>`
                    : isCurrent
                    ? `<span class="ag-status-active">🔬 Em Andamento...</span>`
                    : canStart
                    ? `<button class="ag-btn ag-btn-primary btn-start-tech" data-tech="${tech.id}" ${affordable ? '' : 'disabled'}>
                         Pesquisar (${tech.cost} Ciência)
                       </button>`
                    : `<span class="ag-status-locked">🔒 Bloqueada</span>`
                }
              </div>
            </div>
          `;
        })
        .join('');

      return `
        <div class="ag-era-block">
          <h4 class="ag-era-title">${localize(era.name, lang)}</h4>
          <div class="ag-tech-grid">${cards}</div>
        </div>
      `;
    })
    .join('');

  return {
    title: 'Árvore de Pesquisa & Tecnologia (5 Eras)',
    html: `${activeBanner}<div class="ag-eras-scroll">${erasHtml}</div>`,
    bind: (bodyEl) => {
      bodyEl.querySelectorAll('.btn-start-tech').forEach((btn) => {
        btn.addEventListener('click', () => {
          const techId = btn.getAttribute('data-tech');
          const res = st.researchManager.startResearch(techId, st.resourceManager);
          if (res.ok) {
            audio.playClick();
            refreshModal();
          } else if (engine.uiCallbacks.onNotify) {
            engine.uiCallbacks.onNotify(res.reason, 'warning');
          }
        });
      });
    }
  };
}

export function renderExplorationModalContent(engine, refreshModal) {
  const st = engine.state;
  const lang = getLanguage();
  const ex = st.explorationManager;
  const sites = ex.getSites();
  const loreList = ex.getLoreEntries();

  const sitesHtml = sites
    .map((site) => {
      const activeExp = ex.activeExpeditions.find((e) => e.siteId === site.id);
      const completed = ex.completedSiteIds.has(site.id);
      const check = ex.canLaunch(site.id);

      const rewardsStr = Object.entries(site.rewards || {})
        .map(([k, v]) => `+${v} ${k.toUpperCase()}`)
        .join(' · ');

      return `
        <div class="ag-site-card ${completed ? 'completed' : ''}">
          <div class="ag-site-header">
            <div>
              <h5>${localize(site.name, lang)}</h5>
              <small>Distância: ${site.distanceKm} km · Duração: ${site.durationSec}s · Risco: ${site.riskLevel}</small>
            </div>
            <span class="ag-badge">${Math.round(site.baseSuccess * 100)}% Base</span>
          </div>
          <p>${localize(site.description, lang)}</p>
          <div class="ag-site-meta">
            <div><strong>Custo Suprimentos:</strong> ${formatCostMap(site.supplyCost, lang)} (Equipe: ${site.minTeam} colonos)</div>
            <div><strong>Recompensas Estimadas:</strong> ${rewardsStr}</div>
          </div>
          ${
            activeExp
              ? `<div class="ag-progress-box">
                   <div class="ag-progress-label">Equipe em campo... ${Math.round((activeExp.progress / activeExp.duration) * 100)}%</div>
                   <div class="ag-progress-bar"><div style="width:${Math.min(100, (activeExp.progress / activeExp.duration) * 100)}%"></div></div>
                 </div>`
              : `<div class="ag-site-actions">
                   <button class="ag-btn ag-btn-primary btn-launch-exp" data-site="${site.id}" ${check.ok ? '' : 'disabled'}>
                     🧭 Enviar Expedição (${site.minTeam} Colonos)
                   </button>
                   ${!check.ok ? `<small class="ag-warn-inline">${check.reason}</small>` : ''}
                 </div>`
          }
        </div>
      `;
    })
    .join('');

  const codexHtml = loreList
    .map((entry) => {
      const unlocked = ex.unlockedLoreIds.has(entry.id);
      return `
        <div class="ag-lore-card ${unlocked ? 'unlocked' : 'locked'}">
          <div class="ag-lore-year">${entry.year}</div>
          <h5>${unlocked ? localize(entry.title, lang) : 'Arquivo Criptografado // Descubra em Expedições'}</h5>
          <p>${unlocked ? localize(entry.text, lang) : 'Conclua expedições às ruínas da superfície para decodificar este documento histórico.'}</p>
        </div>
      `;
    })
    .join('');

  return {
    title: 'Central de Exploração, Expedições & Arquivos de 2189',
    html: `
      <div class="ag-two-col">
        <div>
          <h4>Setores de Expedição Externa</h4>
          <div class="ag-sites-list">${sitesHtml}</div>
        </div>
        <div>
          <h4>Códice Histórico da Queda (2189–2241)</h4>
          <div class="ag-lore-list">${codexHtml}</div>
        </div>
      </div>
    `,
    bind: (bodyEl) => {
      bodyEl.querySelectorAll('.btn-launch-exp').forEach((btn) => {
        btn.addEventListener('click', () => {
          const siteId = btn.getAttribute('data-site');
          const res = ex.launchExpedition(siteId, 0);
          if (res.ok) {
            audio.playComplete();
            refreshModal();
          } else if (engine.uiCallbacks.onNotify) {
            engine.uiCallbacks.onNotify(res.reason, 'warning');
          }
        });
      });
    }
  };
}

export function renderEconomyModalContent(engine, refreshModal) {
  const st = engine.state;
  const lang = getLanguage();
  const rm = st.resourceManager;
  const em = st.economyManager;
  const catalog = rm.getCatalog();

  const rowsHtml = catalog
    .map((r) => {
      const amt = Math.floor(rm.get(r.id));
      const cap = rm.getCapacity(r.id);
      const prod = rm.production[r.id] || 0;
      const cons = rm.consumption[r.id] || 0;
      const net = rm.net[r.id] || 0;
      const bd = rm.breakdown[r.id] || { producers: [], consumers: [] };
      const buyPrice = em.getMarketPrice(r.id, 'buy');
      const sellPrice = em.getMarketPrice(r.id, 'sell');

      const prodDetails =
        bd.producers.map((p) => `${p.label} (+${p.rate.toFixed(1)}/s)`).join(', ') || 'Nenhum';
      const consDetails =
        bd.consumers.map((c) => `${c.label} (-${c.rate.toFixed(1)}/s)`).join(', ') || 'Nenhum';

      return `
        <div class="ag-econ-card">
          <div class="ag-econ-main">
            <div>
              <span class="ag-dot" style="background:${r.color}"></span>
              <strong>${localize(r.name, lang)}</strong>
              <span class="ag-econ-qty">${amt} ${r.storable ? `/ ${cap}` : ''}</span>
            </div>
            <div class="ag-econ-rates">
              <span class="ag-tag ag-tag-pos">+${prod.toFixed(1)}/s</span>
              <span class="ag-tag ag-tag-neg">-${cons.toFixed(1)}/s</span>
              <strong style="color:${net >= 0 ? '#4ade80' : '#f87171'}">Saldo: ${net >= 0 ? '+' : ''}${net.toFixed(1)}/s</strong>
            </div>
          </div>
          <div class="ag-econ-breakdown">
            <div><small>Fontes:</small> ${prodDetails}</div>
            <div><small>Consumo:</small> ${consDetails}</div>
          </div>
          ${
            r.id !== 'money'
              ? `<div class="ag-econ-trade">
                   <button class="ag-btn ag-btn-secondary btn-trade" data-res="${r.id}" data-act="buy" data-qty="10">
                     Comprar +10 (${buyPrice * 10} Cr)
                   </button>
                   <button class="ag-btn ag-btn-secondary btn-trade" data-res="${r.id}" data-act="sell" data-qty="10">
                     Vender -10 (+${sellPrice * 10} Cr)
                   </button>
                 </div>`
              : ''
          }
        </div>
      `;
    })
    .join('');

  return {
    title: `Balanço Econômico, Cadeias Produtivas & Mercado (Créditos: ${Math.floor(rm.get('money'))})`,
    html: `<div class="ag-econ-grid">${rowsHtml}</div>`,
    bind: (bodyEl) => {
      bodyEl.querySelectorAll('.btn-trade').forEach((btn) => {
        btn.addEventListener('click', () => {
          const resId = btn.getAttribute('data-res');
          const act = btn.getAttribute('data-act');
          const qty = Number(btn.getAttribute('data-qty') || 10);
          const result = em.executeTrade(resId, act, qty);
          if (result.ok) {
            audio.playClick();
            refreshModal();
          } else if (engine.uiCallbacks.onNotify) {
            engine.uiCallbacks.onNotify(result.reason, 'warning');
          }
        });
      });
    }
  };
}

export function renderPopulationModalContent(engine, refreshModal) {
  const st = engine.state;
  const pm = st.populationManager;
  const housingCap = pm.getHousingCapacity();

  const listHtml = pm.citizens
    .map((c) => {
      const profOptions = PROFESSIONS.map(
        (p) =>
          `<option value="${p}" ${c.profession === p ? 'selected' : ''}>${t(`professions.${p}`, p)}</option>`
      ).join('');

      return `
        <div class="ag-cit-row">
          <div>
            <strong>${c.name}</strong> <small>(${c.age}a)</small>
            <div class="ag-cit-sub">${t(`states.${c.state}`, c.state)} · ❤ ${Math.round(c.health)}% · 😊 ${Math.round(c.happiness)}%</div>
          </div>
          <div class="ag-cit-controls">
            <select class="ag-select sel-row-prof" data-cid="${c.id}">${profOptions}</select>
            <button class="ag-btn ag-btn-secondary btn-focus-cit" data-cid="${c.id}">🎯 Focar</button>
          </div>
        </div>
      `;
    })
    .join('');

  return {
    title: `Gestão de Cidadãos & Empregos (${pm.citizens.length} / ${housingCap} Vagas de Moradia)`,
    html: `
      <div class="ag-panel-banner" style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <strong>Distribuição Automática de Trabalhadores:</strong>
          <span>Aloca automaticamente colonos nos edifícios construídos conforme sua profissão.</span>
        </div>
        <button class="ag-btn ${pm.autoAssignWorkers ? 'ag-btn-primary' : 'ag-btn-secondary'}" id="btn-toggle-auto-assign">
          ${pm.autoAssignWorkers ? '✔ Automático Ativo' : 'Manual'}
        </button>
      </div>
      <div class="ag-cit-list">${listHtml}</div>
    `,
    bind: (bodyEl, closeModal) => {
      bodyEl.querySelector('#btn-toggle-auto-assign')?.addEventListener('click', () => {
        pm.autoAssignWorkers = !pm.autoAssignWorkers;
        pm.rebalanceAssignments();
        audio.playClick();
        refreshModal();
      });

      bodyEl.querySelectorAll('.sel-row-prof').forEach((sel) => {
        sel.addEventListener('change', () => {
          const cid = Number(sel.getAttribute('data-cid'));
          pm.setCitizenProfession(cid, sel.value);
          audio.playClick();
          refreshModal();
        });
      });

      bodyEl.querySelectorAll('.btn-focus-cit').forEach((btn) => {
        btn.addEventListener('click', () => {
          const cid = Number(btn.getAttribute('data-cid'));
          const cit = pm.getCitizenById(cid);
          if (cit) {
            engine.camera.centerOnTile(cit.x, cit.y);
            st.selectedCitizenId = cit.id;
            closeModal();
          }
        });
      });
    }
  };
}

export function renderProgressionModalContent(engine) {
  const st = engine.state;
  const lang = getLanguage();
  const prog = st.progressionManager;

  const missionsHtml = prog
    .getMissions()
    .map((m) => {
      const done = prog.completedMissions.has(m.id);
      return `
        <div class="ag-mission-card ${done ? 'done' : ''}">
          <div>
            <span class="ag-badge">Era ${m.era}</span>
            <strong>${localize(m.title, lang)}</strong>
            <p>${localize(m.description, lang)}</p>
            <small>Recompensa: ${formatCostMap(m.reward, lang)}</small>
          </div>
          <div>${done ? '<span class="ag-status-ok">✔ Concluído</span>' : '<span class="ag-status-active">Em Progresso</span>'}</div>
        </div>
      `;
    })
    .join('');

  const achHtml = prog
    .getAchievementsCatalog()
    .map((a) => {
      const unlockedAt = prog.unlockedAchievements.get(a.id);
      return `
        <div class="ag-ach-card ${unlockedAt ? 'unlocked' : 'locked'}">
          <strong>🏆 ${localize(a.title, lang)}</strong>
          <p>${localize(a.description, lang)}</p>
          <small>${unlockedAt ? `Desbloqueada` : 'Bloqueada'}</small>
        </div>
      `;
    })
    .join('');

  return {
    title: 'Objetivos da Colônia, Conquistas & Estatísticas',
    html: `
      <div class="ag-stats-summary-bar">
        <div><span>Dias Sobrevividos:</span> <strong>${st.day} (Ano ${st.year})</strong></div>
        <div><span>População Máxima:</span> <strong>${st.maxPopulationReached}</strong></div>
        <div><span>Blocos Escavados:</span> <strong>${st.excavationSystem.totalExcavated}</strong></div>
        <div><span>Edifícios Erguidos:</span> <strong>${st.buildingsManager.list.length}</strong></div>
        <div><span>Tecnologias:</span> <strong>${st.researchManager.unlocked.size} / 20</strong></div>
      </div>
      <div class="ag-two-col">
        <div>
          <h4>Objetivos de Campanha</h4>
          <div class="ag-missions-list">${missionsHtml}</div>
        </div>
        <div>
          <h4>Conquistas (${prog.unlockedAchievements.size} / ${prog.getAchievementsCatalog().length})</h4>
          <div class="ag-ach-grid">${achHtml}</div>
        </div>
      </div>
    `
  };
}
