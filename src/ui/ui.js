import { NotificationCenter } from './notifications.js';
import {
  renderBuildingInspector,
  renderCitizenInspector,
  renderResearchModalContent,
  renderExplorationModalContent,
  renderEconomyModalContent,
  renderPopulationModalContent,
  renderProgressionModalContent,
  formatCostMap
} from './panels.js';
import {
  renderNewWorldModal,
  renderSavesModal,
  renderAuthModal,
  renderSettingsModal,
  renderTutorialAndCreditsModal
} from './menus.js';
import { localize, getLanguage, t } from '../core/i18n.js';
import { audio } from '../core/audio.js';
import { authManager } from '../auth/authentication.js';
import { cloudSync } from '../save/cloudSync.js';
import { saveManager } from '../save/save.js';

export class GameUI {
  constructor(engine) {
    this.engine = engine;
    this.activeCategory = 'housing';
    this.buildDrawerOpen = false;
    this.activeModalKey = null;

    this.toastCenter = new NotificationCenter(document.getElementById('ag-toast-container'));
    this.bindStaticElements();

    authManager.onChange(() => this.updateAuthIndicators());
    cloudSync.onStatusChange(() => this.updateAuthIndicators());
  }

  notify(msg, type = 'info') {
    this.toastCenter.push(msg, type);
  }

  bindStaticElements() {
    // Title Screen buttons
    document.getElementById('btn-title-continue')?.addEventListener('click', async () => {
      audio.playClick();
      const lastSave = await saveManager.getLastActiveSave();
      if (lastSave) {
        this.engine.loadFromPayload(lastSave);
        this.hideTitleScreen();
      } else {
        this.engine.startNewWorld({ worldName: 'Nova Aegis', seed: 'AEGIS-2241', difficulty: 'normal' });
        this.hideTitleScreen();
      }
    });

    document.getElementById('btn-title-new')?.addEventListener('click', () => {
      audio.playClick();
      this.openModal('new_world');
    });

    document.getElementById('btn-title-saves')?.addEventListener('click', () => {
      audio.playClick();
      this.openModal('saves');
    });

    document.getElementById('btn-title-auth')?.addEventListener('click', () => {
      audio.playClick();
      this.openModal('auth');
    });

    document.getElementById('btn-title-settings')?.addEventListener('click', () => {
      audio.playClick();
      this.openModal('settings');
    });

    document.getElementById('btn-title-credits')?.addEventListener('click', () => {
      audio.playClick();
      this.openModal('credits');
    });

    // Left Dock buttons
    document.getElementById('dock-btn-build')?.addEventListener('click', () => {
      this.buildDrawerOpen = !this.buildDrawerOpen;
      this.renderBuildDrawer();
    });

    document.getElementById('dock-btn-excavate')?.addEventListener('click', () => {
      this.buildDrawerOpen = false;
      this.renderBuildDrawer();
      const next = this.engine.state?.activeTool === 'excavate' ? 'select' : 'excavate';
      this.engine.setTool(next);
    });

    document.getElementById('dock-btn-infra')?.addEventListener('click', () => {
      this.activeCategory = 'infrastructure';
      this.buildDrawerOpen = true;
      this.renderBuildDrawer();
    });

    document.getElementById('dock-btn-research')?.addEventListener('click', () => {
      this.openModal('research');
    });

    document.getElementById('dock-btn-exploration')?.addEventListener('click', () => {
      this.openModal('exploration');
    });

    document.getElementById('dock-btn-economy')?.addEventListener('click', () => {
      this.openModal('economy');
    });

    document.getElementById('dock-btn-citizens')?.addEventListener('click', () => {
      this.openModal('population');
    });

    document.getElementById('dock-btn-missions')?.addEventListener('click', () => {
      this.openModal('progression');
    });

    document.getElementById('dock-btn-demolish')?.addEventListener('click', () => {
      this.buildDrawerOpen = false;
      this.renderBuildDrawer();
      const next = this.engine.state?.activeTool === 'demolish' ? 'select' : 'demolish';
      this.engine.setTool(next);
    });

    // Speed buttons
    document.querySelectorAll('.ag-speed-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!this.engine.state) return;
        const spd = Number(btn.getAttribute('data-speed'));
        this.engine.state.speed = spd;
        audio.playClick();
        this.updateHud(this.engine.state);
      });
    });

    // Bottom-right quick controls
    document.getElementById('btn-cam-home')?.addEventListener('click', () => {
      if (!this.engine.state) return;
      this.engine.camera.centerOnTile(
        this.engine.state.worldMap.centerX,
        this.engine.state.worldMap.baseSurfaceY - 1
      );
      audio.playClick();
    });

    document.getElementById('btn-cam-zoom-in')?.addEventListener('click', () => {
      this.engine.camera.setZoom(this.engine.camera.zoom * 1.2);
    });

    document.getElementById('btn-cam-zoom-out')?.addEventListener('click', () => {
      this.engine.camera.setZoom(this.engine.camera.zoom * 0.84);
    });

    document.getElementById('btn-quick-save')?.addEventListener('click', async () => {
      if (!this.engine.state) return;
      await saveManager.saveGameState(this.engine.state, 'autosave');
      audio.playComplete();
      this.notify('Progresso salvo localmente e enfileirado na nuvem!', 'success');
    });

    document.getElementById('btn-open-saves')?.addEventListener('click', () => {
      this.openModal('saves');
    });

    document.getElementById('btn-open-auth')?.addEventListener('click', () => {
      this.openModal('auth');
    });

    document.getElementById('btn-open-settings')?.addEventListener('click', () => {
      this.openModal('settings');
    });

    document.getElementById('btn-open-help')?.addEventListener('click', () => {
      this.openModal('credits');
    });

    document.getElementById('btn-open-title')?.addEventListener('click', () => {
      this.showTitleScreen();
    });

    document.getElementById('btn-cancel-tool')?.addEventListener('click', () => {
      this.engine.setTool('select');
    });

    // Modal close button
    document.getElementById('ag-modal-close')?.addEventListener('click', () => {
      this.closeModal();
    });
    document.getElementById('ag-modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'ag-modal-backdrop') {
        this.closeModal();
      }
    });
  }

  showTitleScreen() {
    const el = document.getElementById('ag-title-screen');
    if (el) el.classList.remove('hidden');
    this.updateAuthIndicators();
  }

  hideTitleScreen() {
    const el = document.getElementById('ag-title-screen');
    if (el) el.classList.add('hidden');
    this.updateHud(this.engine.state);
  }

  updateAuthIndicators() {
    const user = authManager.user;
    const profile = authManager.profile;
    const syncBadge = document.getElementById('ag-sync-indicator');
    const titleAuthBtn = document.getElementById('btn-title-auth');

    if (syncBadge) {
      if (user) {
        const label =
          cloudSync.status === 'syncing'
            ? '☁ Sincronizando...'
            : cloudSync.status === 'synced'
            ? `☁ Cloud: ${profile?.display_name || user.email?.split('@')[0]}`
            : '☁ Cloud Conectado';
        syncBadge.textContent = label;
        syncBadge.className = 'ag-sync-pill synced';
      } else {
        syncBadge.textContent = '💾 Local (IndexedDB)';
        syncBadge.className = 'ag-sync-pill offline';
      }
    }

    if (titleAuthBtn) {
      titleAuthBtn.textContent = user
        ? `☁ Conta: ${profile?.display_name || user.email?.split('@')[0]}`
        : '☁ Entrar com Google / Conta Cloud';
    }
  }

  renderBuildDrawer() {
    const drawer = document.getElementById('ag-build-drawer');
    if (!drawer) return;
    if (!this.buildDrawerOpen || !this.engine.state) {
      drawer.classList.add('hidden');
      return;
    }
    drawer.classList.remove('hidden');

    const st = this.engine.state;
    const lang = getLanguage();
    const categories = st.buildingsManager.getCategories();
    const allBuildings = st.buildingsManager.getAllDefinitions();

    const catsHtml = categories
      .map(
        (c) => `
        <button class="ag-cat-tab ${this.activeCategory === c.id ? 'active' : ''}" data-cat="${c.id}">
          ${localize(c.name, lang)}
        </button>
      `
      )
      .join('');

    const filtered = allBuildings.filter((b) => b.category === this.activeCategory);
    const itemsHtml = filtered
      .map((def) => {
        const unlocked = !def.requiredTech || st.researchManager.isUnlocked(def.requiredTech);
        const affordable = st.resourceManager.canAfford(def.cost);
        const isSelected =
          st.activeTool === 'build' && st.selectedBuildingType === def.id;

        const prodTags = Object.entries(def.production || {})
          .map(([k, v]) => `+${v} ${k.toUpperCase()}`)
          .join(' ');

        return `
          <div class="ag-bldg-item ${isSelected ? 'selected' : ''} ${!unlocked ? 'locked' : ''}" data-btype="${def.id}">
            <div class="ag-bldg-item-top">
              <span class="ag-bldg-swatch" style="background:${def.accentColor || '#f59e0b'}"></span>
              <strong>${localize(def.name, lang)}</strong>
              <small>${def.width}×${def.height}</small>
            </div>
            <p>${localize(def.description, lang)}</p>
            <div class="ag-bldg-meta">
              <span class="${affordable ? 'cost-ok' : 'cost-missing'}">Custo: ${formatCostMap(def.cost, lang)}</span>
              ${prodTags ? `<span class="ag-tag ag-tag-pos">${prodTags}</span>` : ''}
              ${def.housingCapacity ? `<span class="ag-tag">+${def.housingCapacity} Moradia</span>` : ''}
            </div>
            ${
              !unlocked
                ? `<div class="ag-lock-note">🔒 Requer Pesquisa: ${def.requiredTech}</div>`
                : ''
            }
          </div>
        `;
      })
      .join('');

    drawer.innerHTML = `
      <div class="ag-drawer-header">
        <h4>Catálogo de Construções (${categories.length} Categorias)</h4>
        <button class="ag-icon-btn" id="btn-close-build-drawer">✕</button>
      </div>
      <div class="ag-cat-tabs">${catsHtml}</div>
      <div class="ag-bldg-list">${itemsHtml}</div>
    `;

    drawer.querySelector('#btn-close-build-drawer')?.addEventListener('click', () => {
      this.buildDrawerOpen = false;
      drawer.classList.add('hidden');
    });

    drawer.querySelectorAll('.ag-cat-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        this.activeCategory = tab.getAttribute('data-cat');
        audio.playClick();
        this.renderBuildDrawer();
      });
    });

    drawer.querySelectorAll('.ag-bldg-item').forEach((card) => {
      card.addEventListener('click', () => {
        const btype = card.getAttribute('data-btype');
        const def = st.buildingsManager.getDefinition(btype);
        if (def?.requiredTech && !st.researchManager.isUnlocked(def.requiredTech)) {
          this.notify(`Bloqueado! Pesquise "${def.requiredTech}" no Laboratório.`, 'warning');
          return;
        }
        this.engine.setTool('build', btype);
        this.renderBuildDrawer();
      });
    });
  }

  updateToolStatusBar(hoverTile = null) {
    const bar = document.getElementById('ag-tool-banner');
    const textEl = document.getElementById('ag-tool-banner-text');
    if (!bar || !textEl || !this.engine.state) return;

    const st = this.engine.state;
    const lang = getLanguage();

    if (st.activeTool === 'select') {
      bar.classList.add('hidden');
      return;
    }

    bar.classList.remove('hidden');

    if (st.activeTool === 'build' && st.selectedBuildingType) {
      const def = st.buildingsManager.getDefinition(st.selectedBuildingType);
      const bName = def ? localize(def.name, lang) : st.selectedBuildingType;
      let statusMsg = `Construindo: ${bName} (${formatCostMap(def?.cost, lang)})`;
      if (hoverTile) {
        const check = st.constructionSystem.validatePlacement(
          st.selectedBuildingType,
          hoverTile.tx,
          hoverTile.ty
        );
        statusMsg += ` — [${check.reason}]`;
      }
      textEl.textContent = statusMsg;
    } else if (st.activeTool === 'excavate') {
      textEl.textContent =
        'Modo Escavação Ativo: Clique ou arraste sobre blocos subterrâneos para escavar túneis e extrair minérios.';
    } else if (st.activeTool === 'demolish') {
      textEl.textContent =
        'Modo Demolição Ativo: Clique sobre uma estrutura para demoli-la e recuperar recursos.';
    }
  }

  updateSelectionInspector(kind = null, entity = null) {
    const container = document.getElementById('ag-inspector-container');
    if (!container || !this.engine.state) return;

    const st = this.engine.state;
    if (!kind) {
      if (st.selectedBuildingId) {
        const b = st.buildingsManager.getBuildingById(st.selectedBuildingId);
        if (b) {
          renderBuildingInspector(container, this.engine, b, () =>
            this.updateSelectionInspector('building', b)
          );
          return;
        }
      }
      if (st.selectedCitizenId) {
        const c = st.populationManager.getCitizenById(st.selectedCitizenId);
        if (c) {
          renderCitizenInspector(container, this.engine, c, () =>
            this.updateSelectionInspector('citizen', c)
          );
          return;
        }
      }
      container.innerHTML = '';
      return;
    }

    if (kind === 'building' && entity) {
      renderBuildingInspector(container, this.engine, entity, () =>
        this.updateSelectionInspector('building', entity)
      );
    } else if (kind === 'citizen' && entity) {
      renderCitizenInspector(container, this.engine, entity, () =>
        this.updateSelectionInspector('citizen', entity)
      );
    } else {
      container.innerHTML = '';
    }
  }

  updateHud(state, telemetry = null) {
    if (!state) return;
    const lang = getLanguage();
    const rm = state.resourceManager;

    // 1. Update 10 resources strip
    const resStrip = document.getElementById('ag-resource-strip');
    if (resStrip) {
      const html = rm
        .getCatalog()
        .map((r) => {
          const val = Math.floor(rm.get(r.id));
          const cap = rm.getCapacity(r.id);
          const net = rm.net[r.id] || 0;
          const netStr = `${net >= 0 ? '+' : ''}${net.toFixed(1)}/s`;
          const netClass = net > 0.05 ? 'pos' : net < -0.05 ? 'neg' : 'neutral';

          return `
            <div class="ag-res-pill" title="${localize(r.name, lang)}: ${val}${r.storable ? ` / ${cap}` : ''} (${netStr})">
              <span class="ag-res-dot" style="background:${r.color}"></span>
              <div class="ag-res-info">
                <span class="ag-res-name">${localize(r.name, lang)}</span>
                <span class="ag-res-val">${val}${r.storable ? `<small>/${cap}</small>` : ''}</span>
              </div>
              <span class="ag-res-rate ${netClass}">${netStr}</span>
            </div>
          `;
        })
        .join('');
      resStrip.innerHTML = html;
    }

    // 2. Update Colony Status (Population, Happiness, Day/Year/Era/Weather)
    const popEl = document.getElementById('hud-pop-val');
    if (popEl) {
      const count = state.populationManager.citizens.length;
      const cap = state.populationManager.getHousingCapacity();
      popEl.textContent = `${count} / ${cap}`;
    }

    const happyEl = document.getElementById('hud-happy-val');
    if (happyEl) {
      happyEl.textContent = `${state.populationManager.getAverageHappiness()}%`;
    }

    const dateEl = document.getElementById('hud-date-val');
    if (dateEl) {
      const isDay = state.isDaytime();
      const weatherLabel = t(`weather.${state.eventsManager.weather}`, state.eventsManager.weather);
      dateEl.textContent = `${isDay ? '☀' : '🌙'} Dia ${state.day}, Ano ${state.year} · Era ${state.researchManager.currentEra} · ${weatherLabel}`;
    }

    // 3. Speed buttons active state
    document.querySelectorAll('.ag-speed-btn').forEach((btn) => {
      const spd = Number(btn.getAttribute('data-speed'));
      btn.classList.toggle('active', state.speed === spd);
    });

    // 4. Dock active tool highlight
    document
      .getElementById('dock-btn-excavate')
      ?.classList.toggle('active', state.activeTool === 'excavate');
    document
      .getElementById('dock-btn-demolish')
      ?.classList.toggle('active', state.activeTool === 'demolish');
    document
      .getElementById('dock-btn-build')
      ?.classList.toggle('active', this.buildDrawerOpen || state.activeTool === 'build');

    // 5. Telemetry pill
    if (telemetry) {
      const perfEl = document.getElementById('ag-perf-pill');
      if (perfEl) {
        perfEl.textContent = `${telemetry.fps} FPS · Sim ${telemetry.simMs.toFixed(1)}ms · ${telemetry.visibleChunks} Chunks`;
      }
    }

    // Refresh inspector if open
    if (state.selectedBuildingId || state.selectedCitizenId) {
      this.updateSelectionInspector();
    }
  }

  async openModal(key) {
    this.activeModalKey = key;
    const backdrop = document.getElementById('ag-modal-backdrop');
    const titleEl = document.getElementById('ag-modal-title');
    const bodyEl = document.getElementById('ag-modal-body');
    if (!backdrop || !titleEl || !bodyEl) return;

    const refresh = () => this.openModal(key);
    const close = () => this.closeModal();

    let descriptor = null;
    if (key === 'new_world') {
      descriptor = renderNewWorldModal(this.engine, close, () => this.hideTitleScreen());
    } else if (key === 'saves') {
      descriptor = await renderSavesModal(this.engine, refresh, close, () => this.hideTitleScreen());
    } else if (key === 'auth') {
      descriptor = renderAuthModal(this.engine, refresh);
    } else if (key === 'settings') {
      descriptor = renderSettingsModal(this.engine, refresh);
    } else if (key === 'credits') {
      descriptor = renderTutorialAndCreditsModal();
    } else if (this.engine.state) {
      if (key === 'research') {
        descriptor = renderResearchModalContent(this.engine, refresh);
      } else if (key === 'exploration') {
        descriptor = renderExplorationModalContent(this.engine, refresh);
      } else if (key === 'economy') {
        descriptor = renderEconomyModalContent(this.engine, refresh);
      } else if (key === 'population') {
        descriptor = renderPopulationModalContent(this.engine, refresh);
      } else if (key === 'progression') {
        descriptor = renderProgressionModalContent(this.engine);
      }
    }

    if (!descriptor) return;
    titleEl.textContent = descriptor.title;
    bodyEl.innerHTML = descriptor.html;
    backdrop.classList.remove('hidden');

    if (descriptor.bind) {
      descriptor.bind(bodyEl, close);
    }
  }

  openDilemmaModal(eventObj) {
    if (!eventObj || !this.engine.state) return;
    const lang = getLanguage();
    const backdrop = document.getElementById('ag-modal-backdrop');
    const titleEl = document.getElementById('ag-modal-title');
    const bodyEl = document.getElementById('ag-modal-body');
    if (!backdrop || !titleEl || !bodyEl) return;

    titleEl.textContent = `⚠ Acontecimento na Colônia: ${localize(eventObj.title, lang)}`;
    const choicesHtml = (eventObj.choices || [])
      .map(
        (c) => `
        <button class="ag-btn ag-btn-primary btn-dilemma-choice" data-cid="${c.id}" style="width:100%;text-align:left;padding:12px;">
          ▶ ${localize(c.label, lang)}
        </button>
      `
      )
      .join('');

    bodyEl.innerHTML = `
      <div class="ag-lore-box">
        <p style="font-size:15px;line-height:1.5;">${localize(eventObj.description, lang)}</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px;">
        ${choicesHtml}
      </div>
    `;
    backdrop.classList.remove('hidden');

    bodyEl.querySelectorAll('.btn-dilemma-choice').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = btn.getAttribute('data-cid');
        this.engine.state.eventsManager.resolveChoice(cid);
        audio.playComplete();
        this.closeModal();
        this.updateHud(this.engine.state);
      });
    });
  }

  closeModal() {
    this.activeModalKey = null;
    const backdrop = document.getElementById('ag-modal-backdrop');
    if (backdrop) backdrop.classList.add('hidden');
  }
}
