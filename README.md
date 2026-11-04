# AFTERGROUND — Rebuild What Remains

![AFTERGROUND Logo](public/assets/logo/logo-main.svg)

**AFTERGROUND** é um jogo completo 2D lateral de construção de cidades, sobrevivência, gerenciamento de colônia subterrânea e de superfície, exploração e estratégia, ambientado em **2241 A.E.** (52 anos após as catástrofes globais de 2189).

---

## 1. Arquitetura e Organização Modular

O motor de simulação e renderização foi projetado em **HTML5 + JavaScript ES Modules + Canvas 2D otimizado + Vite**, totalmente desacoplado da interface DOM/CSS e sem dependência de servidor Node em execução contínua:

```text
/public
  /assets
    /logo          # Logotipo principal, símbolo, horizontal, compacto e favicon (SVG + PNG)
    /sprites       # Atlas e recursos visuais
/src
  /core
    engine.js      # Orquestrador principal do motor, câmera, input, autosave e callbacks UI
    gameLoop.js    # Loop desacoplado com controle de FPS (60/30), throttle em background e telemetria
    state.js       # Estado completo da partida e ticks escalonados (10Hz / 2Hz / 1Hz)
    camera.js      # Câmera 2D com pan suave, zoom no cursor e Frustum Culling
    input.js       # Controles de mouse, teclado e toque (mobile/tablet)
    renderer.js    # Renderizador Canvas 2D com Chunk Caching, Frustum Culling e Object Pooling
    sprites.js     # Gerador procedural de Atlas Pixel Art (terrenos, edifícios animados e cidadãos)
    audio.js       # Sintetizador Web Audio API (trilha ambiente subterrânea + efeitos sonoros)
    i18n.js        # Internacionalização Português Brasileiro (pt-BR) e Inglês (en-US)
  /world
    generation.js  # Gerador procedural determinístico (Mulberry32 + Perlin/Value Noise 2D)
    map.js         # Mapa 200x100 em TypedArrays (Uint8Array) com controle de versão e chunks sujos
    chunks.js      # Cache de chunks 16x16 em Offscreen Canvas (só redesenha quando modificado)
    fog.js         # Névoa de guerra e revelação progressiva
    pathfinding.js # Pathfinding A* 2D lateral com suporte a túneis, escadas, pontes e elevadores
  /simulation
    resources.js   # 10 recursos interdependentes, capacidades, taxas e diagnóstico por fonte
    economy.js     # Cadeias produtivas, consumo vital, mercado dinâmico e comércio automático
    buildings.js   # Gerenciamento de edifícios, níveis (1–3), integridade, reparo e trabalhadores
    citizens.js    # Cidadãos individuais com necessidades, profissões, histórico e locomoção
    population.js  # Alocação automática/manual de empregos, moradia, saúde, felicidade e imigração
    research.js    # Árvore tecnológica interativa dividida em 5 Eras (20 tecnologias)
    exploration.js # Expedições externas, equipes, suprimentos, riscos e Códice de 2189
    events.js      # Clima dinâmico e eventos narrativos com escolhas e consequências
  /systems
    construction.js # Validação de terreno, pré-visualização, construção por etapas e demolição
    excavation.js   # Escavação individual ou em área com dureza por estrato e coleta de minérios
    power.js        # Cálculo de rede elétrica, geração solar/combustível/geotérmica e dutos
    storage.js      # Cálculo dinâmico de capacidade de armazenamento
    transport.js    # Bônus logístico de escadas, passarelas e eixos de elevador
    achievements.js # Missões de campanha por Era, 12 conquistas e histórico estatístico
  /ui
    ui.js           # Controlador da barra superior, dock lateral, gaveta de obras e modais
    menus.js        # Menu inicial, criação de mundo, saves, login Google/Cloud e configurações
    panels.js       # Inspetores contextuais de prédios/cidadãos e painéis de gestão
    notifications.js # Sistema de notificações toast
    tutorial.js     # Manual interativo do Comandante
  /data
    buildings.json    # 22 construções distribuídas nas 13 categorias obrigatórias
    resources.json    # 10 recursos (Comida, Água, Energia, Madeira, Pedra, Metal, Combustível, Créditos, Ciência, Peças)
    technologies.json # 20 tecnologias distribuídas em 5 Eras
    events.json       # Eventos climáticos e dilemas narrativos
    missions.json     # Objetivos de campanha, conquistas, expedições e documentos de 2189
    balancing.json    # Dificuldades (Fácil, Normal, Difícil), estratos e parâmetros vitais
  /save
    save.js         # Gerenciador de múltiplos mundos, slots e exportação/importação JSON
    indexedDB.js    # Persistência local offline-first via IndexedDB
    cloudSync.js    # Sincronização bidirecional e fila offline com Supabase
    migrations.js   # Controle de versão de save, migração e validação por checksum
  /auth
    supabase.js       # Cliente público @supabase/supabase-js
    authentication.js # Login Google OAuth, E-mail/Senha e perfil do jogador
/supabase
  schema.sql        # Esquema SQL completo com Row Level Security (RLS)
  migrations/       # Migrações SQL versionadas
/tests
  afterground.test.js # Suite automatizada Vitest
```

---

## 2. Engenharia de Desempenho (PCs Modestos)

- **Chunk Caching (`16 × 16` tiles):** Os 20.000 blocos do mapa (`200 × 100`) não são redesenhados a cada frame. Cada chunk possui seu próprio canvas em memória que só é atualizado quando um bloco daquele chunk é escavado ou revelado pela névoa.
- **Frustum Culling Rigoroso:** Apenas os chunks, construções e cidadãos visíveis dentro da janela da câmera são processados na renderização.
- **Simulação em Frequências Escalonadas:**
  - `10 Hz`: Locomoção de cidadãos, progresso de obras e escavação.
  - `2 Hz`: Cadeias de produção econômica, balanço elétrico e avanço de pesquisa.
  - `1 Hz`: Necessidades fisiológicas, imigração, expedições, clima, missões e conquistas.
- **Object Pooling:** Partículas climáticas e textos flutuantes utilizam pools fixos pré-alocados sem gerar lixo de memória (GC) no loop.

---

## 3. Banco de Dados Supabase, RLS e Autenticação Google OAuth

O esquema em `supabase/schema.sql` cria e protege com **Row Level Security (`auth.uid() = user_id`)** as 6 tabelas:
1. `public.profiles`
2. `public.worlds`
3. `public.game_saves`
4. `public.game_settings`
5. `public.achievements`
6. `public.player_statistics`

### Como ativar o provedor Google OAuth no painel do Supabase:
1. No [Google Cloud Console](https://console.cloud.google.com/apis/credentials), crie um **OAuth 2.0 Client ID (Web Application)**.
2. Adicione em **Authorized redirect URIs**:
   `https://ztqwdwnauffdsqvgnqpr.supabase.co/auth/v1/callback`
3. No painel do Supabase (`Authentication → Providers → Google`), ative **Enable Sign in with Google** e cole o **Client ID** e **Client Secret**.
4. Em `Authentication → URL Configuration`, garanta que a URL da Vercel e `http://localhost:5173` estejam em **Redirect URLs**.

---

## 4. Comandos de Desenvolvimento e Testes

```bash
# Instalar dependências
npm install

# Executar servidor de desenvolvimento
npm run dev

# Executar testes automatizados (Vitest)
npm test

# Gerar build otimizado de produção
npm run build
```

---

## 5. Checklist de Testes Manuais (Critérios de Aceitação)

- [x] Iniciar uma nova partida na tela de título com nome, seed e dificuldade customizados.
- [x] Movimentar a câmera (WASD / Setas / Botão Direito) e aplicar Zoom (roda do mouse / botões `🔍+` e `🔍-`).
- [x] Selecionar `🔨 Construir`, visualizar prévia verde/vermelha e erguer construções na superfície e no subsolo.
- [x] Selecionar `⛏ Escavar (E)`, clicar ou arrastar sobre terra/pedra/minérios/ruínas e observar a extração de recursos.
- [x] Clicar em qualquer construção ou cidadão para abrir o Inspetor Contextual, melhorar nível, pausar prédio ou mudar profissão.
- [x] Pausar (`Espaço`) e alternar velocidades (`1x`, `2x`, `4x`).
- [x] Abrir `🔬 Pesquisa` e desbloquear tecnologias nas 5 Eras.
- [x] Abrir `🧭 Expedições`, enviar uma equipe e ler os registros desbloqueados do Códice de 2189.
- [x] Salvar/Carregar localmente (IndexedDB), exportar/importar arquivo `.json` e sincronizar na nuvem Supabase.
