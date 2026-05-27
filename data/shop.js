const SHOP_ITEMS = [
    // ── Boosts temporários (compra com neurônios) ──────────────────────────────
    {
        id: 'boost_surge', name: 'Surto Neural', icon: '⚡',
        desc: 'Dobra toda a produção por 60 segundos.',
        type: 'boost', cost: 10000, currency: 'neurons',
        boostType: 'global_mult', boostValue: 2, duration: 60,
        category: 'boost', rarity: 'uncommon'
    },
    {
        id: 'boost_click', name: 'Frenesi de Clique', icon: '👆',
        desc: 'Multiplica o poder de clique por 5× por 30 segundos.',
        type: 'boost', cost: 100000, currency: 'neurons',
        boostType: 'click_mult', boostValue: 5, duration: 30,
        category: 'boost', rarity: 'uncommon'
    },
    {
        id: 'boost_overdrive', name: 'Overdrive Neural', icon: '🔥',
        desc: '10× produção global por 45 segundos.',
        type: 'boost', cost: 1000000, currency: 'neurons',
        boostType: 'global_mult', boostValue: 10, duration: 45,
        category: 'boost', rarity: 'rare'
    },
    {
        id: 'boost_hyperclick', name: 'Hiper-Clique', icon: '💥',
        desc: '20× poder de clique por 20 segundos.',
        type: 'boost', cost: 10000000, currency: 'neurons',
        boostType: 'click_mult', boostValue: 20, duration: 20,
        category: 'boost', rarity: 'epic'
    },
    {
        id: 'boost_singularity', name: 'Singularidade Temp.', icon: '🌌',
        desc: '25× produção global por 10 segundos.',
        type: 'boost', cost: 25000000, currency: 'neurons',
        boostType: 'global_mult', boostValue: 25, duration: 10,
        category: 'boost', rarity: 'legendary'
    },

    // ── Melhorias permanentes (compra com tokens) ──────────────────────────────
    {
        id: 'perm_offline', name: 'Módulo Offline', icon: '💤',
        desc: '+50% ganhos offline permanentemente.',
        type: 'permanent', cost: 5, currency: 'tokens',
        effect: 'offline_bonus', effectValue: 0.5,
        category: 'permanent', rarity: 'rare'
    },
    {
        id: 'perm_crit', name: 'Reflexos Aprimorados', icon: '🎯',
        desc: '+5% chance de clique crítico permanentemente.',
        type: 'permanent', cost: 10, currency: 'tokens',
        effect: 'crit_bonus', effectValue: 0.05,
        category: 'permanent', rarity: 'rare'
    },
    {
        id: 'perm_xp', name: 'Catalisador de XP', icon: '📚',
        desc: 'Dobra todos os ganhos de XP permanentemente.',
        type: 'permanent', cost: 15, currency: 'tokens',
        effect: 'xp_mult', effectValue: 2.0,
        category: 'permanent', rarity: 'epic'
    },
    {
        id: 'perm_global', name: 'Amplificador Neural', icon: '🧠',
        desc: '+25% produção global permanentemente.',
        type: 'permanent', cost: 25, currency: 'tokens',
        effect: 'global_bonus', effectValue: 0.25,
        category: 'permanent', rarity: 'epic'
    },
    {
        id: 'perm_token', name: 'Gerador de Tokens', icon: '💎',
        desc: '+20% tokens ganhos no prestígio.',
        type: 'permanent', cost: 50, currency: 'tokens',
        effect: 'token_bonus', effectValue: 0.2,
        category: 'permanent', rarity: 'legendary'
    },
];

// ── Pacotes de Diamantes (moeda premium) ──────────────────────────────────────
const DIAMOND_PACKS = [
    {
        id:       'diamonds_small',
        name:     'Pacote Inicial',
        icon:     '🔷',
        diamonds: 100,
        price:    'R$ 4,90',
        bonus:    null,
        bestValue: false,
        accent:   '#7b2fff',
        rarity:   'common',
    },
    {
        id:       'diamonds_medium',
        name:     'Pacote Médio',
        icon:     '🔷',
        diamonds: 300,
        price:    'R$ 9,90',
        bonus:    '+20% Bônus',
        bestValue: false,
        accent:   '#00f5ff',
        rarity:   'uncommon',
    },
    {
        id:       'diamonds_large',
        name:     'Pacote Grande',
        icon:     '🔷',
        diamonds: 700,
        price:    'R$ 19,90',
        bonus:    '+75% Bônus',
        bestValue: false,
        accent:   '#7b2fff',
        popular:  true,
        rarity:   'rare',
    },
    {
        id:       'diamonds_mega',
        name:     'Pacote MEGA',
        icon:     '🔷',
        diamonds: 2000,
        price:    'R$ 49,90',
        bonus:    '🔥 MELHOR VALOR',
        bestValue: true,
        accent:   '#ffd700',
        rarity:   'legendary',
    },
];
