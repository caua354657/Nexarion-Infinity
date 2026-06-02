const Config = {
    GAME_NAME: 'Nexarion Infinity',
    VERSION: '1.0.0',
    SAVE_KEY: 'nexuscore_save',
    AUTOSAVE_INTERVAL: 2000,      // autosave a cada 2s (LS síncrono ~1ms + IDB assíncrono)
    SERVER_SYNC_INTERVAL: 120000, // server save every 2 minutes
    TICK_RATE: 20,

    CLICK_COOLDOWN_MIN: 1000 / 30,
    CRITICAL_CHANCE: 0.04,
    CRITICAL_MULT: 5,
    COMBO_TIMEOUT: 2000,
    COMBO_LEVELS: [1, 2, 3, 5, 10],
    COMBO_THRESHOLDS: [0, 15, 35, 70, 150],

    OFFLINE_MAX_HOURS: 4,
    PRESTIGE_BASE: 50e6,   // 50 million — first prestige requires real investment
    PRESTIGE_SCALE: 10,    // each subsequent prestige costs 10× more

    COST_SCALE: 1.22,      // steeper generator cost curve (was 1.15)

    PARTICLE_MAX: 100,
    NOTIFICATION_MAX: 5,
    NOTIFICATION_DURATION: 4000,

    NEURAL_NODES: 30,
    NEURAL_CONNECTIONS: 80,

    COLORS: {
        bg: '#050510',
        cyan: '#00f5ff',
        purple: '#7b2fff',
        pink: '#ff0080',
        green: '#00ff88',
        orange: '#ff8800',
        gold: '#ffd700',
        panel: 'rgba(10,10,30,0.85)',
        border: 'rgba(0,245,255,0.2)',
    }
};
