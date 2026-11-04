const DICTIONARY = {
  'pt-BR': {
    subtitle: 'Rebuild What Remains.',
    continueGame: 'Continuar Partida',
    newWorld: 'Novo Mundo',
    loadGame: 'Mundos & Saves',
    achievements: 'Conquistas',
    statistics: 'Estatísticas & Códice',
    settings: 'Configurações',
    credits: 'Créditos & Lore',
    signInGoogle: 'Entrar com Google',
    signInEmail: 'Entrar / Criar Conta Cloud',
    signOut: 'Sair da Conta',
    cloudConnected: 'Nuvem Sincronizada',
    cloudOffline: 'Modo Local / Offline (IndexedDB)',
    syncing: 'Sincronizando...',
    saveNow: 'Salvar Agora',
    exportSave: 'Exportar JSON',
    importSave: 'Importar JSON',
    worldName: 'Nome da Colônia',
    worldSeed: 'Seed Procedural',
    difficulty: 'Dificuldade',
    startColony: 'Fundar Colônia',
    day: 'Dia',
    year: 'Ano',
    era: 'Era',
    population: 'População',
    happiness: 'Felicidade',
    health: 'Saúde',
    defense: 'Defesa',
    build: 'Construir',
    excavate: 'Escavar',
    infrastructure: 'Infraestrutura',
    research: 'Pesquisa',
    exploration: 'Expedições',
    economy: 'Economia',
    citizens: 'Cidadãos',
    missions: 'Objetivos',
    trade: 'Mercado',
    demolish: 'Demolir',
    cancelTool: 'Cursor / Selecionar (ESC)',
    pause: 'Pausar',
    speed1: 'Velocidade 1x',
    speed2: 'Velocidade 2x',
    speed4: 'Velocidade 4x',
    workers: 'Trabalhadores',
    level: 'Nível',
    upgrade: 'Melhorar Nível',
    repair: 'Reparar',
    toggleActive: 'Ativar / Pausar Prédio',
    demolishRefund: 'Demolir (60% reembolso)',
    cancelBuild: 'Cancelar Obra (100% reembolso)',
    professions: {
      worker: 'Operário',
      builder: 'Construtor',
      miner: 'Minerador',
      farmer: 'Agricultor',
      engineer: 'Engenheiro',
      scientist: 'Cientista',
      medic: 'Médico',
      guard: 'Guarda'
    },
    states: {
      idle: 'Aguardando tarefa',
      walking: 'Deslocando-se',
      working: 'Produzindo no posto',
      building: 'Construindo estrutura',
      excavating: 'Escavando subsolo',
      resting: 'Descansando no abrigo',
      eating: 'Alimentando-se',
      expedition: 'Em expedição externa'
    },
    weather: {
      clear: 'Céu Estável',
      rain: 'Chuva Condensada (+Água)',
      acid_storm: 'Tempestade Ácida (-Solar)',
      heatwave: 'Onda Térmica (-Água)',
      biolum_mist: 'Névoa Bioluminescente (+Ciência)'
    }
  },
  'en-US': {
    subtitle: 'Rebuild What Remains.',
    continueGame: 'Continue Colony',
    newWorld: 'New World',
    loadGame: 'Worlds & Saves',
    achievements: 'Achievements',
    statistics: 'Statistics & Codex',
    settings: 'Settings',
    credits: 'Credits & Lore',
    signInGoogle: 'Sign in with Google',
    signInEmail: 'Cloud Account Sign In / Up',
    signOut: 'Sign Out',
    cloudConnected: 'Cloud Synced',
    cloudOffline: 'Local / Offline Mode (IndexedDB)',
    syncing: 'Syncing...',
    saveNow: 'Save Now',
    exportSave: 'Export JSON',
    importSave: 'Import JSON',
    worldName: 'Colony Name',
    worldSeed: 'Procedural Seed',
    difficulty: 'Difficulty',
    startColony: 'Found Colony',
    day: 'Day',
    year: 'Year',
    era: 'Era',
    population: 'Population',
    happiness: 'Happiness',
    health: 'Health',
    defense: 'Defense',
    build: 'Build',
    excavate: 'Excavate',
    infrastructure: 'Infrastructure',
    research: 'Research',
    exploration: 'Expeditions',
    economy: 'Economy',
    citizens: 'Citizens',
    missions: 'Objectives',
    trade: 'Market',
    demolish: 'Demolish',
    cancelTool: 'Select / Inspect (ESC)',
    pause: 'Pause',
    speed1: 'Speed 1x',
    speed2: 'Speed 2x',
    speed4: 'Speed 4x',
    workers: 'Workers',
    level: 'Level',
    upgrade: 'Upgrade Level',
    repair: 'Repair',
    toggleActive: 'Toggle Building Power',
    demolishRefund: 'Demolish (60% refund)',
    cancelBuild: 'Cancel Construction (100% refund)',
    professions: {
      worker: 'Worker',
      builder: 'Builder',
      miner: 'Miner',
      farmer: 'Farmer',
      engineer: 'Engineer',
      scientist: 'Scientist',
      medic: 'Medic',
      guard: 'Guard'
    },
    states: {
      idle: 'Awaiting task',
      walking: 'Moving',
      working: 'Working at station',
      building: 'Constructing structure',
      excavating: 'Excavating subsoil',
      resting: 'Resting in shelter',
      eating: 'Consuming rations',
      expedition: 'On surface expedition'
    },
    weather: {
      clear: 'Stable Sky',
      rain: 'Condensing Rain (+Water)',
      acid_storm: 'Acid Ash Storm (-Solar)',
      heatwave: 'Thermal Wave (-Water)',
      biolum_mist: 'Bioluminescent Mist (+Science)'
    }
  }
};

let currentLanguage = 'pt-BR';

export function setLanguage(lang) {
  if (DICTIONARY[lang]) {
    currentLanguage = lang;
  }
  return currentLanguage;
}

export function getLanguage() {
  return currentLanguage;
}

export function t(key, fallback = '') {
  const parts = key.split('.');
  let node = DICTIONARY[currentLanguage] || DICTIONARY['pt-BR'];
  for (const p of parts) {
    if (node && typeof node === 'object' && p in node) {
      node = node[p];
    } else {
      return fallback || key;
    }
  }
  return typeof node === 'string' ? node : fallback || key;
}

export function localize(obj, lang = currentLanguage) {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  return obj[lang] || obj['pt-BR'] || obj['en-US'] || '';
}
