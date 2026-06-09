const RANDOM_EVENTS = [
    {
        id: 'neural_surge',
        name: 'Surto Neural!',     name_en: 'Neural Surge!',      name_es: '¡Oleada Neural!',
        icon: '⚡',
        desc: 'Um surto repentino de energia neural! Toda produção ×3 por 30 segundos.',
        desc_en: 'A sudden burst of neural energy! All production ×3 for 30 seconds.',
        desc_es: '¡Un estallido repentino de energía neural! Toda la producción ×3 por 30 segundos.',
        duration: 30000,
        effect: { type: 'global_mult', value: 3 },
        weight: 30,
        color: '#00f5ff'
    },
    {
        id: 'click_frenzy',
        name: 'Frenesi de Cliques!', name_en: 'Click Frenzy!',    name_es: '¡Frenesí de Clics!',
        icon: '🖱️',
        desc: 'Cada clique vale 777× por 13 segundos — clique como louco!',
        desc_en: 'Each click is worth 777× for 13 seconds — click like crazy!',
        desc_es: '¡Cada clic vale 777× durante 13 segundos — haz clic como loco!',
        duration: 13000,
        effect: { type: 'click_mult', value: 777 },
        weight: 10,
        color: '#ffd700'
    },
    {
        id: 'quantum_flux',
        name: 'Fluxo Quântico',   name_en: 'Quantum Flux',       name_es: 'Flujo Cuántico',
        icon: '🌀',
        desc: 'Efeitos quânticos multiplicam a produção por 7× por 20 segundos.',
        desc_en: 'Quantum effects multiply production by 7× for 20 seconds.',
        desc_es: 'Los efectos cuánticos multiplican la producción por 7× durante 20 segundos.',
        duration: 20000,
        effect: { type: 'global_mult', value: 7 },
        weight: 15,
        color: '#7b2fff'
    },
    {
        id: 'data_storm',
        name: 'Tempestade de Dados', name_en: 'Data Storm',       name_es: 'Tormenta de Datos',
        icon: '🌩',
        desc: 'Uma tempestade de dados te concede neurônios equivalentes a 10 minutos de produção!',
        desc_en: 'A data storm grants you neurons equal to 10 minutes of production!',
        desc_es: '¡Una tormenta de datos te otorga neuronas equivalentes a 10 minutos de producción!',
        duration: 0,
        effect: { type: 'instant_neurons', value: 600 },
        weight: 20,
        color: '#ff8800'
    },
    {
        id: 'synaptic_echo',
        name: 'Eco Sináptico',    name_en: 'Synaptic Echo',      name_es: 'Eco Sináptico',
        icon: '🔁',
        desc: 'Cada clique é duplicado por 15 segundos.',
        desc_en: 'Each click is duplicated for 15 seconds.',
        desc_es: 'Cada clic se duplica durante 15 segundos.',
        duration: 15000,
        effect: { type: 'click_duplicate', value: 2 },
        weight: 25,
        color: '#ff0080'
    },
    {
        id: 'neural_token_drop',
        name: 'Token Caindo!',    name_en: 'Token Drop!',        name_es: '¡Token Cayendo!',
        icon: '💎',
        desc: 'Um token neural apareceu! Colete-o rápido!',
        desc_en: 'A neural token appeared! Collect it fast!',
        desc_es: '¡Apareció un token neural! ¡Recógelo rápido!',
        duration: 10000,
        effect: { type: 'free_token', value: 1 },
        weight: 5,
        color: '#ffd700',
        clickable: true
    },
];

const EVENT_MIN_INTERVAL = 180000;
const EVENT_MAX_INTERVAL = 600000;
