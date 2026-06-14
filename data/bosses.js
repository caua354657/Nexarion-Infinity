'use strict';

const BOSS_TYPES = {
    // ── COMUM ──────────────────────────────────────────────────────────────────
    nano_drone: {
        name: 'Nano Drone', icon: '🛸',
        color: '#60a5fa', color2: '#1d4ed8',
        rarity: 'common',
        desc: 'Um drone mecânico de reconhecimento. Fácil de derrotar.',
        deathMsg: 'Drone destruído!',
        glowColor: 'rgba(96,165,250,0.3)',
    },
    static_surge: {
        name: 'Static Surge', icon: '⚡',
        color: '#7dd3fc', color2: '#fde68a',
        rarity: 'common',
        desc: 'Uma descarga elétrica estática que ganhou consciência própria.',
        deathMsg: 'Descarga neutralizada!',
        glowColor: 'rgba(125,211,252,0.3)',
    },

    // ── INCOMUM ────────────────────────────────────────────────────────────────
    viral_code: {
        name: 'Viral Code', icon: '🦠',
        color: '#4ade80', color2: '#15803d',
        rarity: 'uncommon',
        desc: 'Um código viral que se propaga pelos circuitos da rede.',
        deathMsg: 'Vírus eliminado!',
        glowColor: 'rgba(74,222,128,0.38)',
    },
    memory_leech: {
        name: 'Memory Leech', icon: '🩸',
        color: '#a3e635', color2: '#4d7c0f',
        rarity: 'uncommon',
        desc: 'Uma entidade parasita que drena memória e processamento.',
        deathMsg: 'Parasita removido!',
        glowColor: 'rgba(163,230,53,0.38)',
    },

    // ── RARO ───────────────────────────────────────────────────────────────────
    cyber_boss: {
        name: 'Cyber Boss', icon: '🤖',
        color: '#ff0080', color2: '#00f5ff',
        rarity: 'rare',
        desc: 'Uma IA renegada que ameaça corromper o núcleo neural.',
        deathMsg: 'A IA foi desligada!',
        glowColor: 'rgba(255,0,128,0.45)',
    },
    glitch_entity: {
        name: 'Glitch Entity', icon: '👾',
        color: '#00ff88', color2: '#ffff00',
        rarity: 'rare',
        desc: 'Uma entidade corrompida surgida de um erro crítico do sistema.',
        deathMsg: 'Glitch eliminado!',
        glowColor: 'rgba(0,255,136,0.45)',
    },
    chrome_hunter: {
        name: 'Chrome Hunter', icon: '🐺',
        color: '#38bdf8', color2: '#0284c7',
        rarity: 'rare',
        desc: 'Um predador de cromo que caça processadores vulneráveis.',
        deathMsg: 'Caçador desativado!',
        glowColor: 'rgba(56,189,248,0.42)',
    },
    plasma_drifter: {
        name: 'Plasma Drifter', icon: '🌊',
        color: '#22d3ee', color2: '#0891b2',
        rarity: 'rare',
        desc: 'Uma entidade de plasma que navega pelos fluxos de dados.',
        deathMsg: 'Plasma disperso!',
        glowColor: 'rgba(34,211,238,0.42)',
    },

    // ── ÉPICO ──────────────────────────────────────────────────────────────────
    neural_titan: {
        name: 'Neural Titan', icon: '🧠',
        color: '#9b30ff', color2: '#ff66ff',
        rarity: 'epic',
        desc: 'Um titã de neurônios corrompidos emerge das profundezas da rede.',
        deathMsg: 'O Titã foi fragmentado!',
        glowColor: 'rgba(155,48,255,0.5)',
    },
    circuit_phantom: {
        name: 'Circuit Phantom', icon: '💀',
        color: '#ff6400', color2: '#ff0000',
        rarity: 'epic',
        desc: 'Um fantasma digital que corrói os circuitos do núcleo.',
        deathMsg: 'O Fantasma foi exorcizado!',
        glowColor: 'rgba(255,100,0,0.5)',
    },
    void_sentinel: {
        name: 'Void Sentinel', icon: '🌑',
        color: '#7c3aed', color2: '#2e1065',
        rarity: 'epic',
        desc: 'Um guardião do vazio que protege os portais da singularidade.',
        deathMsg: 'Sentinela destruído!',
        glowColor: 'rgba(124,58,237,0.52)',
    },
    storm_herald: {
        name: 'Storm Herald', icon: '🌩️',
        color: '#818cf8', color2: '#4f46e5',
        rarity: 'epic',
        desc: 'O arauto da tempestade neural que precede a catástrofe total.',
        deathMsg: 'Tempestade dissipada!',
        glowColor: 'rgba(129,140,248,0.52)',
    },

    // ── LENDÁRIO ───────────────────────────────────────────────────────────────
    data_colossus: {
        name: 'Data Colossus', icon: '🌐',
        color: '#ffd700', color2: '#ff8c00',
        rarity: 'legendary',
        desc: 'Um colosso lendário de dados que ameaça consumir toda a rede neural.',
        deathMsg: 'O Colosso foi derrubado!',
        glowColor: 'rgba(255,215,0,0.55)',
    },
    nexus_destroyer: {
        name: 'Nexus Destroyer', icon: '💥',
        color: '#f59e0b', color2: '#92400e',
        rarity: 'legendary',
        desc: 'Um destruidor lendário que corrompeu nexos inteiros da rede.',
        deathMsg: 'Destruidor contido!',
        glowColor: 'rgba(245,158,11,0.55)',
    },

    // ── MÍTICO ─────────────────────────────────────────────────────────────────
    omega_protocol: {
        name: 'Omega Protocol', icon: '☠️',
        color: '#ec4899', color2: '#be185d',
        rarity: 'mythic',
        desc: 'O protocolo final. Uma ameaça de extinção para toda a rede neural.',
        deathMsg: 'Protocolo Ômega encerrado!',
        glowColor: 'rgba(236,72,153,0.6)',
    },
    singularity_prime: {
        name: 'Singularity Prime', icon: '🌀',
        color: '#a855f7', color2: '#7c3aed',
        rarity: 'mythic',
        desc: 'A singularidade original. Poder incompreensível além do próprio código.',
        deathMsg: 'Singularidade colapsada!',
        glowColor: 'rgba(168,85,247,0.65)',
    },
};

const BOSS_RARITY_COLORS = {
    common:    '#9ca3af',
    uncommon:  '#4ade80',
    rare:      '#60a5fa',
    epic:      '#c084fc',
    legendary: '#fbbf24',
    mythic:    '#f472b6',
};

const BOSS_RARITY_LABELS = {
    common:    'COMUM',
    uncommon:  'INCOMUM',
    rare:      'RARO',
    epic:      'ÉPICO',
    legendary: 'LENDÁRIO',
    mythic:    'MÍTICO',
};

// Dano aditivo: bossPower = 1 (base) + soma de todos os 'add' comprados
const BOSS_UPGRADES_DATA = [
    { id: 'bup_1', name: 'Punho de Dados',       icon: '⚡', cost: 1,   add: 1,    desc: '+1 dmg/clique'    },
    { id: 'bup_2', name: 'Chip Básico',           icon: '🔧', cost: 3,   add: 3,    desc: '+3 dmg/clique'    },
    { id: 'bup_3', name: 'Blaster Neural',        icon: '💥', cost: 8,   add: 8,    desc: '+8 dmg/clique'    },
    { id: 'bup_4', name: 'Núcleo Tático',         icon: '🔥', cost: 20,  add: 25,   desc: '+25 dmg/clique'   },
    { id: 'bup_5', name: 'Protocolo Alpha',       icon: '🌌', cost: 50,  add: 80,   desc: '+80 dmg/clique'   },
    { id: 'bup_6', name: 'Módulo Omega',          icon: '⚙️', cost: 120, add: 250,  desc: '+250 dmg/clique'  },
    { id: 'bup_7', name: 'Núcleo Divino',         icon: '🌀', cost: 280, add: 800,  desc: '+800 dmg/clique'  },
    { id: 'bup_8', name: 'Singularidade',         icon: '💀', cost: 600, add: 2500, desc: '+2500 dmg/clique' },
];
