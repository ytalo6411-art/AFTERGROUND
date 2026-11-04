import { saveManager } from '../save/save.js';
import { authManager } from '../auth/authentication.js';
import { cloudSync } from '../save/cloudSync.js';
import { audio } from '../core/audio.js';
import { TUTORIAL_STEPS } from './tutorial.js';
import { getLanguage, localize } from '../core/i18n.js';

export function renderNewWorldModal(engine, closeModal, onStarted) {
  const randomSeed = `AEGIS-${Math.floor(1000 + Math.random() * 9000)}`;
  return {
    title: 'Fundar Nova Colônia — Geração Procedural',
    html: `
      <div class="ag-form-grid">
        <label class="ag-field">
          <span>Nome do Assentamento</span>
          <input type="text" id="inp-world-name" class="ag-input" value="Nova Aegis" maxlength="40" />
        </label>
        <label class="ag-field">
          <span>Seed Procedural (Reproduzível)</span>
          <div style="display:flex;gap:8px;">
            <input type="text" id="inp-world-seed" class="ag-input" value="${randomSeed}" maxlength="32" />
            <button type="button" class="ag-btn ag-btn-secondary" id="btn-rand-seed">🎲 Gerar</button>
          </div>
        </label>
        <label class="ag-field">
          <span>Nível de Dificuldade</span>
          <select id="sel-world-diff" class="ag-select">
            <option value="easy">Fácil — Reconstrução Assistida (+40% Recursos Iniciais, +25% Produção)</option>
            <option value="normal" selected>Normal — Padrão Aegis (Economia e Eventos Equilibrados)</option>
            <option value="hard">Difícil — Inverno de Cinzas (Escassez Severa e Eventos Frequentes)</option>
          </select>
        </label>
        <div class="ag-lore-box">
          <strong>Ano 2241 A.E. — Diretriz de Superfície:</strong>
          <p>52 anos após as catástrofes de 2189, seu grupo abre as comportas do Bunker Central. Construa abrigos, escave veios minerais, purifique água e lidere o renascimento da civilização.</p>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px;">
          <button type="button" class="ag-btn ag-btn-primary" id="btn-confirm-new-world">🚀 Iniciar Simulação</button>
        </div>
      </div>
    `,
    bind: (bodyEl) => {
      bodyEl.querySelector('#btn-rand-seed')?.addEventListener('click', () => {
        const inp = bodyEl.querySelector('#inp-world-seed');
        if (inp) inp.value = `AEGIS-${Math.floor(1000 + Math.random() * 9000)}`;
      });

      bodyEl.querySelector('#btn-confirm-new-world')?.addEventListener('click', () => {
        const worldName = bodyEl.querySelector('#inp-world-name')?.value || 'Nova Aegis';
        const seed = bodyEl.querySelector('#inp-world-seed')?.value || randomSeed;
        const difficulty = bodyEl.querySelector('#sel-world-diff')?.value || 'normal';
        engine.startNewWorld({ worldName, seed, difficulty });
        audio.playComplete();
        closeModal();
        if (onStarted) onStarted();
      });
    }
  };
}

export async function renderSavesModal(engine, refreshModal, closeModal, onLoaded) {
  const worlds = await saveManager.listWorlds();
  const currentWorldId = engine.state?.worldId;

  const worldsHtml =
    worlds.length === 0
      ? `<div class="ag-panel-banner">Nenhum mundo salvo encontrado ainda. Inicie uma nova colônia!</div>`
      : worlds
          .map((w) => {
            const isCurrent = w.id === currentWorldId;
            const dateStr = w.updatedAt ? new Date(w.updatedAt).toLocaleString() : '';
            return `
              <div class="ag-world-row ${isCurrent ? 'active' : ''}">
                <div>
                  <strong>${w.name}</strong> <span class="ag-badge">Seed: ${w.seed}</span>
                  <span class="ag-badge">${(w.difficulty || 'normal').toUpperCase()}</span>
                  <div class="ag-cit-sub">Dia ${w.day || 1}, Ano ${w.year || 2241} · Era ${w.era || 1} · População: ${w.population || 0} · Salvo: ${dateStr}</div>
                </div>
                <div class="ag-cit-controls">
                  <button class="ag-btn ag-btn-primary btn-load-world" data-wid="${w.id}">▶ Carregar</button>
                  <button class="ag-btn ag-btn-danger btn-del-world" data-wid="${w.id}">🗑 Excluir</button>
                </div>
              </div>
            `;
          })
          .join('');

  return {
    title: 'Gerenciador de Mundos, Slots de Save & Backup JSON',
    html: `
      ${
        engine.state
          ? `
        <div class="ag-panel-banner" style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <strong>Colônia Ativa: ${engine.state.worldName}</strong> (Dia ${engine.state.day}, Ano ${engine.state.year})
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            <button class="ag-btn ag-btn-primary" id="btn-save-slot-auto">💾 Salvar Autosave</button>
            <button class="ag-btn ag-btn-secondary" id="btn-save-slot-1">💾 Slot 1</button>
            <button class="ag-btn ag-btn-secondary" id="btn-save-slot-2">💾 Slot 2</button>
            <button class="ag-btn ag-btn-secondary" id="btn-export-json">⬇ Exportar JSON</button>
          </div>
        </div>
      `
          : ''
      }
      <div style="display:flex;justify-content:space-between;align-items:center;margin:10px 0;">
        <h4>Mundos Registrados (${worlds.length})</h4>
        <div style="display:flex;gap:8px;">
          <label class="ag-btn ag-btn-secondary" style="cursor:pointer;">
            ⬆ Importar Save JSON
            <input type="file" id="inp-import-json" accept=".json,application/json" style="display:none;" />
          </label>
          ${
            authManager.user
              ? `<button class="ag-btn ag-btn-secondary" id="btn-pull-cloud">☁ Sincronizar da Nuvem</button>`
              : ''
          }
        </div>
      </div>
      <div class="ag-cit-list">${worldsHtml}</div>
    `,
    bind: (bodyEl) => {
      const saveSlot = async (slot) => {
        if (!engine.state) return;
        await saveManager.saveGameState(engine.state, slot);
        audio.playComplete();
        if (engine.uiCallbacks.onNotify) {
          engine.uiCallbacks.onNotify(`Progresso salvo em ${slot.toUpperCase()}!`, 'success');
        }
        refreshModal();
      };

      bodyEl.querySelector('#btn-save-slot-auto')?.addEventListener('click', () => saveSlot('autosave'));
      bodyEl.querySelector('#btn-save-slot-1')?.addEventListener('click', () => saveSlot('slot_1'));
      bodyEl.querySelector('#btn-save-slot-2')?.addEventListener('click', () => saveSlot('slot_2'));

      bodyEl.querySelector('#btn-export-json')?.addEventListener('click', () => {
        if (!engine.state) return;
        const json = saveManager.exportToJSONString(engine.state);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${engine.state.worldName.toLowerCase().replace(/\s+/g, '_')}_day${engine.state.day}.afterground.json`;
        a.click();
        URL.revokeObjectURL(url);
      });

      bodyEl.querySelector('#inp-import-json')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const payload = await saveManager.importFromJSONString(text);
          engine.loadFromPayload(payload);
          await saveManager.saveGameState(engine.state, 'autosave');
          audio.playComplete();
          closeModal();
          if (onLoaded) onLoaded();
        } catch (err) {
          if (engine.uiCallbacks.onNotify) {
            engine.uiCallbacks.onNotify(`Erro ao importar JSON: ${err.message}`, 'warning');
          }
        }
      });

      bodyEl.querySelector('#btn-pull-cloud')?.addEventListener('click', async () => {
        await cloudSync.pullCloudWorldsAndSaves();
        refreshModal();
      });

      bodyEl.querySelectorAll('.btn-load-world').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const wid = btn.getAttribute('data-wid');
          const payload = await saveManager.loadWorldSlot(wid, 'autosave');
          if (payload) {
            engine.loadFromPayload(payload);
            audio.playComplete();
            closeModal();
            if (onLoaded) onLoaded();
          }
        });
      });

      bodyEl.querySelectorAll('.btn-del-world').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const wid = btn.getAttribute('data-wid');
          await saveManager.deleteWorld(wid);
          audio.playDig();
          refreshModal();
        });
      });
    }
  };
}

export function renderAuthModal(engine, refreshModal) {
  const user = authManager.user;
  const profile = authManager.profile;

  if (user) {
    return {
      title: 'Conta Cloud AFTERGROUND — Supabase Auth',
      html: `
        <div class="ag-panel-banner ag-banner-active">
          <h4>✔ Conectado como ${profile?.display_name || user.email}</h4>
          <p>E-mail: <strong>${user.email || 'Autenticado'}</strong> · ID: <code>${user.id.slice(0, 8)}...</code></p>
          <p>Status de Sincronização: <strong>${cloudSync.status.toUpperCase()}</strong></p>
        </div>
        <div style="display:flex;gap:10px;margin-top:14px;">
          <button class="ag-btn ag-btn-primary" id="btn-sync-now">☁ Sincronizar Mundos Agora</button>
          <button class="ag-btn ag-btn-danger" id="btn-signout">Sair da Conta</button>
        </div>
      `,
      bind: (bodyEl) => {
        bodyEl.querySelector('#btn-sync-now')?.addEventListener('click', async () => {
          if (engine.state) {
            await saveManager.saveGameState(engine.state, 'autosave');
          }
          await cloudSync.pullCloudWorldsAndSaves();
          if (engine.uiCallbacks.onNotify) {
            engine.uiCallbacks.onNotify('Sincronização com Supabase concluída!', 'success');
          }
          refreshModal();
        });

        bodyEl.querySelector('#btn-signout')?.addEventListener('click', async () => {
          await authManager.signOut();
          refreshModal();
        });
      }
    };
  }

  return {
    title: 'Autenticação Cloud — Google OAuth & Conta Supabase',
    html: `
      <div class="ag-form-grid">
        <div class="ag-panel-banner">
          Sincronize seus mundos, conquistas, estatísticas e configurações na nuvem Supabase com segurança RLS. O jogo também salva automaticamente offline via IndexedDB!
        </div>

        <button type="button" class="ag-btn ag-btn-google" id="btn-oauth-google">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 15.64 5 12c0-3.64 3.36-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"/></svg>
          Entrar com Google (Supabase OAuth)
        </button>

        <div id="auth-feedback-box" class="ag-auth-feedback" style="display:none;"></div>

        <hr style="border-color:#1e293b;margin:8px 0;" />

        <h5>Ou Entre / Crie sua Conta Cloud por E-mail</h5>
        <label class="ag-field">
          <span>E-mail</span>
          <input type="email" id="inp-auth-email" class="ag-input" placeholder="comandante@afterground.io" />
        </label>
        <label class="ag-field">
          <span>Senha (mín. 6 caracteres)</span>
          <input type="password" id="inp-auth-pass" class="ag-input" placeholder="••••••••" />
        </label>
        <div style="display:flex;gap:10px;">
          <button type="button" class="ag-btn ag-btn-primary" id="btn-email-signin">Entrar na Conta</button>
          <button type="button" class="ag-btn ag-btn-secondary" id="btn-email-signup">Criar Nova Conta</button>
        </div>
      </div>
    `,
    bind: (bodyEl) => {
      const showFeedback = (msg, isError = true) => {
        const box = bodyEl.querySelector('#auth-feedback-box');
        if (!box) return;
        box.style.display = 'block';
        box.style.borderColor = isError ? '#f59e0b' : '#4ade80';
        box.innerHTML = msg;
      };

      bodyEl.querySelector('#btn-oauth-google')?.addEventListener('click', async () => {
        const res = await authManager.signInWithGoogle();
        if (!res.ok) {
          showFeedback(
            `<strong>Configuração Google OAuth:</strong> ${res.reason}<br/><small>Callback URL do projeto: <code>${res.callbackUrl || ''}</code></small>`,
            true
          );
        }
      });

      bodyEl.querySelector('#btn-email-signin')?.addEventListener('click', async () => {
        const email = bodyEl.querySelector('#inp-auth-email')?.value;
        const pass = bodyEl.querySelector('#inp-auth-pass')?.value;
        const res = await authManager.signInWithEmail(email, pass);
        if (res.ok) {
          audio.playComplete();
          await cloudSync.pullCloudWorldsAndSaves();
          refreshModal();
        } else {
          showFeedback(res.reason, true);
        }
      });

      bodyEl.querySelector('#btn-email-signup')?.addEventListener('click', async () => {
        const email = bodyEl.querySelector('#inp-auth-email')?.value;
        const pass = bodyEl.querySelector('#inp-auth-pass')?.value;
        const res = await authManager.signUpWithEmail(email, pass);
        if (res.ok) {
          audio.playComplete();
          showFeedback('Conta criada e autenticada com sucesso!', false);
          setTimeout(() => refreshModal(), 600);
        } else {
          showFeedback(res.reason, true);
        }
      });
    }
  };
}

export function renderSettingsModal(engine, refreshModal) {
  const s = engine.settings || {};
  return {
    title: 'Configurações, Desempenho & Acessibilidade',
    html: `
      <div class="ag-form-grid">
        <label class="ag-field">
          <span>Idioma / Language</span>
          <select id="set-lang" class="ag-select">
            <option value="pt-BR" ${s.language === 'pt-BR' ? 'selected' : ''}>Português Brasileiro (pt-BR)</option>
            <option value="en-US" ${s.language === 'en-US' ? 'selected' : ''}>English (en-US)</option>
          </select>
        </label>

        <label class="ag-field">
          <span>Volume Geral (${Math.round((s.masterVolume ?? 0.8) * 100)}%)</span>
          <input type="range" id="set-vol-master" min="0" max="1" step="0.05" value="${s.masterVolume ?? 0.8}" />
        </label>

        <label class="ag-field">
          <span>Volume da Música Ambiente (${Math.round((s.musicVolume ?? 0.45) * 100)}%)</span>
          <input type="range" id="set-vol-music" min="0" max="1" step="0.05" value="${s.musicVolume ?? 0.45}" />
        </label>

        <label class="ag-field">
          <span>Volume dos Efeitos Sonoros (${Math.round((s.sfxVolume ?? 0.8) * 100)}%)</span>
          <input type="range" id="set-vol-sfx" min="0" max="1" step="0.05" value="${s.sfxVolume ?? 0.8}" />
        </label>

        <label class="ag-field">
          <span>Qualidade Gráfica (Otimização para Computadores Modestos)</span>
          <select id="set-quality" class="ag-select">
            <option value="high" ${s.graphicsQuality === 'high' ? 'selected' : ''}>Alta (Estrelas, Clima Completo e Iluminação)</option>
            <option value="medium" ${s.graphicsQuality === 'medium' ? 'selected' : ''}>Média (Partículas Reduzidas)</option>
            <option value="low" ${s.graphicsQuality === 'low' ? 'selected' : ''}>Econômica / PC Antigo (Sem Partículas Climáticas)</option>
          </select>
        </label>

        <label class="ag-field">
          <span>Limite de Taxa de Quadros (FPS)</span>
          <select id="set-fps" class="ag-select">
            <option value="60" ${s.fpsLimit !== 30 ? 'selected' : ''}>60 FPS (Padrão)</option>
            <option value="30" ${s.fpsLimit === 30 ? 'selected' : ''}>30 FPS Estáveis (Economia de Energia / CPU)</option>
          </select>
        </label>

        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:6px;">
          <button type="button" class="ag-btn ag-btn-primary" id="btn-save-settings">✔ Aplicar e Salvar</button>
          <button type="button" class="ag-btn ag-btn-secondary" id="btn-fullscreen">⛶ Alternar Tela Cheia</button>
        </div>
      </div>
    `,
    bind: (bodyEl) => {
      bodyEl.querySelector('#btn-save-settings')?.addEventListener('click', async () => {
        const next = {
          ...engine.settings,
          language: bodyEl.querySelector('#set-lang')?.value || 'pt-BR',
          masterVolume: Number(bodyEl.querySelector('#set-vol-master')?.value ?? 0.8),
          musicVolume: Number(bodyEl.querySelector('#set-vol-music')?.value ?? 0.45),
          sfxVolume: Number(bodyEl.querySelector('#set-vol-sfx')?.value ?? 0.8),
          graphicsQuality: bodyEl.querySelector('#set-quality')?.value || 'high',
          fpsLimit: Number(bodyEl.querySelector('#set-fps')?.value || 60)
        };
        engine.applySettings(next);
        await saveManager.saveSettings(next);
        audio.playComplete();
        refreshModal();
      });

      bodyEl.querySelector('#btn-fullscreen')?.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        } else {
          document.exitFullscreen?.().catch(() => {});
        }
      });
    }
  };
}

export function renderTutorialAndCreditsModal() {
  const lang = getLanguage();
  const stepsHtml = TUTORIAL_STEPS.map(
    (s) => `
      <div class="ag-lore-card unlocked">
        <h5>${localize(s.title, lang)}</h5>
        <p>${localize(s.body, lang)}</p>
      </div>
    `
  ).join('');

  return {
    title: 'Manual do Comandante, Atalhos & Créditos — AFTERGROUND',
    html: `
      <div class="ag-two-col">
        <div>
          <h4>Guia Rápido de Operação</h4>
          <div class="ag-lore-list">${stepsHtml}</div>
        </div>
        <div>
          <h4>Atalhos de Teclado & Controles</h4>
          <div class="ag-lore-card unlocked">
            <p><strong>WASD / Setas / Arrastar Botão Direito:</strong> Mover Câmera</p>
            <p><strong>Roda do Mouse:</strong> Zoom In / Out</p>
            <p><strong>Espaço:</strong> Pausar / Retomar Simulação</p>
            <p><strong>Teclas 1, 2, 3:</strong> Velocidade 1x, 2x, 4x</p>
            <p><strong>Tecla E:</strong> Ferramenta de Escavação (clique ou arraste)</p>
            <p><strong>Tecla X:</strong> Ferramenta de Demolição</p>
            <p><strong>ESC:</strong> Cancelar ferramenta ativa / Fechar janela</p>
          </div>
          <h4 style="margin-top:14px;">Sobre AFTERGROUND</h4>
          <div class="ag-lore-card unlocked">
            <h5>AFTERGROUND — Rebuild What Remains (v1.0.0)</h5>
            <p>Desenvolvido com arquitetura modular em HTML5 Canvas 2D (Chunk Caching + Frustum Culling), Web Audio API procedural, persistência híbrida offline-first IndexedDB + Supabase Cloud RLS.</p>
          </div>
        </div>
      </div>
    `
  };
}
