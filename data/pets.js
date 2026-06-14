'use strict';

const PET_RARITIES = {
    common:     { label: 'Comum',      color: '#9ca3af', glow: 'rgba(156,163,175,0.5)',  dropWeight: 50  },
    uncommon:   { label: 'Incomum',    color: '#4ade80', glow: 'rgba(74,222,128,0.5)',   dropWeight: 28  },
    rare:       { label: 'Raro',       color: '#60a5fa', glow: 'rgba(96,165,250,0.5)',   dropWeight: 14  },
    ultra_rare: { label: 'Ultra Raro', color: '#22d3ee', glow: 'rgba(34,211,238,0.55)',  dropWeight: 5   },
    epic:       { label: 'Épico',      color: '#c084fc', glow: 'rgba(192,132,252,0.6)',  dropWeight: 2   },
    mythic:     { label: 'Mítico',     color: '#fb923c', glow: 'rgba(251,146,60,0.6)',   dropWeight: 0.7 },
    legendary:  { label: 'Lendário',   color: '#fbbf24', glow: 'rgba(251,191,36,0.65)', dropWeight: 0.3 },
};

// bonus.type: 'click' | 'nps' | 'boss' | 'xp' | 'diamond' | 'all'
const PETS = [
    // ── COMUM ──────────────────────────────────────────────────────────────────
    {
        id: 'micro_bot', name: 'Micro Bot', icon: '🤖', rarity: 'common',
        desc: 'Um pequeno robô que amplifica seus cliques.',
        bonus: { type: 'click', label: '+{v}% poder de clique', baseVal: 5, perLevel: 1 },
    },
    {
        id: 'data_sprite', name: 'Data Sprite', icon: '✨', rarity: 'common',
        desc: 'Um sprite digital que acelera a produção de neurônios.',
        bonus: { type: 'nps', label: '+{v}% produção N/s', baseVal: 4, perLevel: 0.8 },
    },
    {
        id: 'pixel_slime', name: 'Pixel Slime', icon: '🟢', rarity: 'common',
        desc: 'Um slime pixelado com sorte para encontrar diamantes.',
        bonus: { type: 'diamond', label: '+{v}% chance de diamante', baseVal: 1, perLevel: 0.2 },
    },

    // ── INCOMUM ────────────────────────────────────────────────────────────────
    {
        id: 'circuit_fox', name: 'Circuit Fox', icon: '🦊', rarity: 'uncommon',
        desc: 'Uma raposa de circuitos que amplifica o ganho de XP.',
        bonus: { type: 'xp', label: '+{v}% ganho de XP', baseVal: 8, perLevel: 1.5 },
    },
    {
        id: 'nano_cat', name: 'Nano Cat', icon: '🐱', rarity: 'uncommon',
        desc: 'Uma gatinha nanomecânica que potencializa os cliques.',
        bonus: { type: 'click', label: '+{v}% poder de clique', baseVal: 10, perLevel: 2 },
    },
    {
        id: 'byte_bird', name: 'Byte Bird', icon: '🐦', rarity: 'uncommon',
        desc: 'Um pássaro de bytes que acelera a renda neural passiva.',
        bonus: { type: 'nps', label: '+{v}% produção N/s', baseVal: 8, perLevel: 1.5 },
    },

    // ── RARO ───────────────────────────────────────────────────────────────────
    {
        id: 'plasma_wolf', name: 'Plasma Wolf', icon: '🐺', rarity: 'rare',
        desc: 'Um lobo de plasma que inflige mais dano aos bosses.',
        bonus: { type: 'boss', label: '+{v}% dano ao boss', baseVal: 12, perLevel: 2.5 },
    },
    {
        id: 'data_dragon', name: 'Data Dragon', icon: '🐉', rarity: 'rare',
        desc: 'Um dragão de dados que amplifica todos os ganhos neurais.',
        bonus: { type: 'nps', label: '+{v}% produção N/s', baseVal: 15, perLevel: 3 },
    },
    {
        id: 'echo_panda', name: 'Echo Panda', icon: '🐼', rarity: 'rare',
        desc: 'Um panda ecológico com afinidade por XP e aprendizado.',
        bonus: { type: 'xp', label: '+{v}% ganho de XP', baseVal: 15, perLevel: 3 },
    },

    // ── ULTRA RARO ─────────────────────────────────────────────────────────────
    {
        id: 'quantum_phoenix', name: 'Quantum Phoenix', icon: '🦅', rarity: 'ultra_rare',
        desc: 'Uma fênix quântica que ressurge com mais poder de clique.',
        bonus: { type: 'click', label: '+{v}% poder de clique', baseVal: 20, perLevel: 4 },
    },
    {
        id: 'void_bunny', name: 'Void Bunny', icon: '🐰', rarity: 'ultra_rare',
        desc: 'Um coelho do vazio que encontra diamantes com mais frequência.',
        bonus: { type: 'diamond', label: '+{v}% chance de diamante', baseVal: 5, perLevel: 1 },
    },
    {
        id: 'cyber_shark', name: 'Cyber Shark', icon: '🦈', rarity: 'ultra_rare',
        desc: 'Um tubarão cibernético devastador contra bosses.',
        bonus: { type: 'boss', label: '+{v}% dano ao boss', baseVal: 25, perLevel: 5 },
    },

    // ── ÉPICO ──────────────────────────────────────────────────────────────────
    {
        id: 'neural_tiger', name: 'Neural Tiger', icon: '🐯', rarity: 'epic',
        desc: 'Um tigre neural que potencializa massivamente os cliques.',
        bonus: { type: 'click', label: '+{v}% poder de clique', baseVal: 30, perLevel: 6 },
    },
    {
        id: 'circuit_unicorn', name: 'Circuit Unicorn', icon: '🦄', rarity: 'epic',
        desc: 'Um unicórnio de circuitos com ganho extraordinário de XP.',
        bonus: { type: 'xp', label: '+{v}% ganho de XP', baseVal: 30, perLevel: 6 },
    },
    {
        id: 'storm_lion', name: 'Storm Lion', icon: '🦁', rarity: 'epic',
        desc: 'Um leão da tempestade com dano épico a bosses.',
        bonus: { type: 'boss', label: '+{v}% dano ao boss', baseVal: 40, perLevel: 8 },
    },

    // ── MÍTICO ─────────────────────────────────────────────────────────────────
    {
        id: 'omega_serpent', name: 'Omega Serpent', icon: '🐍', rarity: 'mythic',
        desc: 'Uma serpente ômega que domina a produção de neurônios.',
        bonus: { type: 'nps', label: '+{v}% produção N/s', baseVal: 50, perLevel: 10 },
    },
    {
        id: 'singularity_owl', name: 'Singularity Owl', icon: '🦉', rarity: 'mythic',
        desc: 'Uma coruja da singularidade com poder mítico de clique.',
        bonus: { type: 'click', label: '+{v}% poder de clique', baseVal: 55, perLevel: 11 },
    },

    // ── LENDÁRIO ───────────────────────────────────────────────────────────────
    {
        id: 'nexus_dragon', name: 'Nexus Dragon', icon: '🌟', rarity: 'legendary',
        desc: 'O dragão lendário do Nexarion. Amplifica todos os atributos.',
        bonus: { type: 'all', label: '+{v}% em tudo', baseVal: 25, perLevel: 5 },
    },
    {
        id: 'infinity_fox', name: 'Infinity Fox', icon: '🌌', rarity: 'legendary',
        desc: 'A raposa infinita — poder de clique lendário sem limites.',
        bonus: { type: 'click', label: '+{v}% poder de clique', baseVal: 80, perLevel: 15 },
    },
    {
        id: 'cosmos_whale', name: 'Cosmos Whale', icon: '🐋', rarity: 'legendary',
        desc: 'A baleia do cosmos que inunda o universo neural com renda passiva.',
        bonus: { type: 'nps', label: '+{v}% produção N/s', baseVal: 80, perLevel: 15 },
    },
];

// Total XP required to reach each level (index = target level, 0-indexed)
const PET_LEVEL_XP = [0, 0, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000];
const PET_MAX_LEVEL = PET_LEVEL_XP.length - 1; // 10

// XP granted by a duplicate drop
const PET_DUPE_XP = {
    common:     20,
    uncommon:   50,
    rare:       120,
    ultra_rare: 300,
    epic:       700,
    mythic:     1500,
    legendary:  3000,
};

// Base drop chance per boss defeat (%)
const PET_DROP_BASE_CHANCE = 30;
