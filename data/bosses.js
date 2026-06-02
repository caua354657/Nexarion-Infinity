const BOSS_TYPES = {
    cyber_boss: {
        name:    'Cyber Boss',
        icon:    '🤖',
        color:   '#ff0080',
        color2:  '#00f5ff',
        rarity:  'rare',
        desc:    'Uma IA renegada que ameaça corromper o núcleo neural.',
        deathMsg:'A IA foi desligada!',
        glowColor: 'rgba(255,0,128,0.45)',
    },
    glitch_entity: {
        name:    'Glitch Entity',
        icon:    '👾',
        color:   '#00ff88',
        color2:  '#ffff00',
        rarity:  'rare',
        desc:    'Uma entidade corrompida surgiu de um erro crítico do sistema.',
        deathMsg:'Glitch eliminado!',
        glowColor: 'rgba(0,255,136,0.45)',
    },
    neural_titan: {
        name:    'Neural Titan',
        icon:    '🧠',
        color:   '#9b30ff',
        color2:  '#ff66ff',
        rarity:  'epic',
        desc:    'Um titã de neurônios corrompidos emerge das profundezas da rede.',
        deathMsg:'O Titã foi fragmentado!',
        glowColor: 'rgba(155,48,255,0.5)',
    },
    circuit_phantom: {
        name:    'Circuit Phantom',
        icon:    '💀',
        color:   '#ff6400',
        color2:  '#ff0000',
        rarity:  'epic',
        desc:    'Um fantasma digital que corrói os circuitos do núcleo.',
        deathMsg:'O Fantasma foi exorcizado!',
        glowColor: 'rgba(255,100,0,0.5)',
    },
    data_colossus: {
        name:    'Data Colossus',
        icon:    '🌐',
        color:   '#ffd700',
        color2:  '#ff8c00',
        rarity:  'legendary',
        desc:    'Um colosso lendário de dados que ameaça consumir toda a rede neural.',
        deathMsg:'O Colosso foi derrubado!',
        glowColor: 'rgba(255,215,0,0.55)',
    },
};

const BOSS_RARITY_COLORS = {
    rare:      '#00f5ff',
    epic:      '#9b30ff',
    legendary: '#ffd700',
};

const BOSS_RARITY_LABELS = {
    rare:      'RARO',
    epic:      'ÉPICO',
    legendary: 'LENDÁRIO',
};

// Dano aditivo: bossPower = 1 (base) + soma de todos os 'add' comprados
// Custo em DIAMANTES (💎) — calibrado para ser acessível durante o jogo normal
const BOSS_UPGRADES_DATA = [
    { id: 'bup_1', name: 'Punho de Dados',    icon: '⚡', cost: 1,   add: 1,    desc: '+1 dmg/clique'    },
    { id: 'bup_2', name: 'Chip Básico',       icon: '🔧', cost: 3,   add: 3,    desc: '+3 dmg/clique'    },
    { id: 'bup_3', name: 'Blaster Neural',    icon: '💥', cost: 8,   add: 8,    desc: '+8 dmg/clique'    },
    { id: 'bup_4', name: 'Núcleo Tático',     icon: '🔥', cost: 20,  add: 25,   desc: '+25 dmg/clique'   },
    { id: 'bup_5', name: 'Protocolo Alpha',   icon: '🌌', cost: 50,  add: 80,   desc: '+80 dmg/clique'   },
    { id: 'bup_6', name: 'Módulo Omega',      icon: '⚙️', cost: 120, add: 250,  desc: '+250 dmg/clique'  },
    { id: 'bup_7', name: 'Núcleo Divino',     icon: '🌀', cost: 280, add: 800,  desc: '+800 dmg/clique'  },
    { id: 'bup_8', name: 'Singularidade',     icon: '💀', cost: 600, add: 2500, desc: '+2500 dmg/clique' },
];
