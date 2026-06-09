'use strict';

const _T = {
    'pt-BR': {
        // HUD
        'hud.level': 'NVL ', 'hud.xp': 'XP',
        // Nav groups
        'nav.generators': 'Geradores', 'nav.generators.sub': 'Fontes de Neurônios',
        'nav.upgrades': 'Melhorias',   'nav.upgrades.sub': 'Poder e Eficiência',
        'nav.skills': 'Habilidades',   'nav.skills.sub': 'Pontos de Habilidade',
        'nav.rebirth': 'Renascimento', 'nav.rebirth.sub': 'Prestígio Neural',
        'nav.missions': 'Missões',     'nav.missions.sub': 'Diárias e Semanais',
        'nav.achievements': 'Conquistas','nav.achievements.sub': 'Marcos do Jogo',
        'nav.leaderboard': 'Placar',   'nav.leaderboard.sub': 'Ranking Global',
        'nav.profile': 'Perfil',       'nav.profile.sub': 'Conta e Estatísticas',
        'nav.friends': 'Amigos',       'nav.friends.sub': 'Lista e Comparação',
        'nav.settings': 'Configurações','nav.settings.sub': 'Áudio e Salvamento',
        'nav.boss': 'Batalha',         'nav.boss.sub': 'Combater o Chefe',
        'nav.boss_upgrades': 'Melhorias','nav.boss_upgrades.sub': 'Poder de Ataque',
        'nav.boss_ranking': 'Placar',  'nav.boss_ranking.sub': 'Ranking de Dano',
        'nav.skills.click': 'Cliques','nav.skills.generator': 'Geradores','nav.skills.progress': 'Progressão',
        // Shop titles
        'shop.premium.title': 'PREMIUM', 'shop.premium.sub': 'Benefícios vitalícios exclusivos',
        'shop.diamonds.title': 'PACOTES DE DIAMANTES',
        'shop.diamonds.sub': 'Saldo atual',
        'shop.skins.title': 'SKINS & TEMAS', 'shop.skins.sub': 'Transforme completamente a atmosfera do núcleo',
        'shop.boosts.title': 'POTENCIADORES', 'shop.boosts.sub': 'Impulsos temporários · Clique para selecionar quantidade',
        // Skin dividers
        'skins.div.color': '🎨 Skins de Cor', 'skins.div.theme': '✨ Skins Temáticas',
        'skins.div.event': '🎭 Skins de Evento', 'skins.div.temp': '⏳ Skins Temporárias',
        // Rarity
        'rarity.common': 'Comum', 'rarity.uncommon': 'Incomum', 'rarity.rare': 'Raro',
        'rarity.ultra_rare': 'Ultra Raro', 'rarity.epic': 'Épico', 'rarity.mythic': 'Místico',
        'rarity.legendary': 'Lendário', 'rarity.limited': 'Ed. Limitada', 'rarity.default': 'Padrão',
        // Skin buttons
        'skin.equipped': '✓ EQUIPADA', 'skin.owned': '✓ Comprada',
        'skin.equip': 'Equipar', 'skin.buy': 'Adquirir', 'skin.get_free': 'Obter Grátis',
        'skin.active': '✓ ATIVO',
        // Default skin
        'skin.default.name': 'NEXUS PADRÃO', 'skin.default.desc': 'Tema original do núcleo — cyan neural clássico',
        // Timer
        'timer.expired': '⌛ Encerrada',
        // Free mode label
        'price.free': 'Grátis',
        // Settings
        'settings.audio': '🔊 Áudio',
        'settings.audio.on': '🔊 Som Ligado', 'settings.audio.off': '🔇 Som Desligado',
        'settings.sfx': 'Volume de Efeitos', 'settings.music': 'Volume da Música',
        'settings.save': '💾 Salvamento',
        'settings.export': '⬇ Exportar Save (.json)', 'settings.import': '⬆ Importar Save (.json)',
        'settings.desktop': '🖥️ Versão Desktop', 'settings.download': '⬇ Download (.exe)',
        'settings.windows': 'Versão standalone para Windows',
        'settings.danger': '⚠️ Zona de Perigo',
        'settings.reset': '🗑 Resetar Todo o Progresso', 'settings.delete': '🗑 Excluir Conta',
        'settings.version': 'Salva automaticamente a cada 3s',
        'settings.lang': '🌐 Idioma',
        // Boss notification
        'boss.notif.title': '⚠ UM NOVO CHEFE APARECEU!', 'boss.notif.battle': '⚔ Ir para Batalha',
        // Notification center
        'notif.center': 'Notificações',
        // Diamond
        'diamond.unit': 'Diamantes',
    },
    'en': {
        'hud.level': 'LVL ', 'hud.xp': 'XP',
        'nav.generators': 'Generators', 'nav.generators.sub': 'Neuron Sources',
        'nav.upgrades': 'Upgrades',     'nav.upgrades.sub': 'Power & Efficiency',
        'nav.skills': 'Skills',         'nav.skills.sub': 'Skill Points',
        'nav.rebirth': 'Rebirth',       'nav.rebirth.sub': 'Neural Prestige',
        'nav.missions': 'Missions',     'nav.missions.sub': 'Daily & Weekly',
        'nav.achievements': 'Achievements','nav.achievements.sub': 'Game Milestones',
        'nav.leaderboard': 'Leaderboard','nav.leaderboard.sub': 'Global Ranking',
        'nav.profile': 'Profile',       'nav.profile.sub': 'Account & Stats',
        'nav.friends': 'Friends',       'nav.friends.sub': 'List & Comparison',
        'nav.settings': 'Settings',     'nav.settings.sub': 'Audio & Save',
        'nav.boss': 'Battle',           'nav.boss.sub': 'Fight the Boss',
        'nav.boss_upgrades': 'Upgrades','nav.boss_upgrades.sub': 'Attack Power',
        'nav.boss_ranking': 'Rankings', 'nav.boss_ranking.sub': 'Damage Ranking',
        'nav.skills.click': 'Clicks',  'nav.skills.generator': 'Generators','nav.skills.progress': 'Progression',
        'shop.premium.title': 'PREMIUM', 'shop.premium.sub': 'Exclusive lifetime benefits',
        'shop.diamonds.title': 'DIAMOND PACKS',
        'shop.diamonds.sub': 'Current balance',
        'shop.skins.title': 'SKINS & THEMES', 'shop.skins.sub': 'Completely transform the core atmosphere',
        'shop.boosts.title': 'BOOSTERS', 'shop.boosts.sub': 'Temporary power-ups · Click to select quantity',
        'skins.div.color': '🎨 Color Skins', 'skins.div.theme': '✨ Thematic Skins',
        'skins.div.event': '🎭 Event Skins', 'skins.div.temp': '⏳ Temporary Skins',
        'rarity.common': 'Common', 'rarity.uncommon': 'Uncommon', 'rarity.rare': 'Rare',
        'rarity.ultra_rare': 'Ultra Rare', 'rarity.epic': 'Epic', 'rarity.mythic': 'Mythic',
        'rarity.legendary': 'Legendary', 'rarity.limited': 'Limited Ed.', 'rarity.default': 'Default',
        'skin.equipped': '✓ EQUIPPED', 'skin.owned': '✓ Owned',
        'skin.equip': 'Equip', 'skin.buy': 'Acquire', 'skin.get_free': 'Get Free',
        'skin.active': '✓ ACTIVE',
        'skin.default.name': 'DEFAULT NEXUS', 'skin.default.desc': 'Original core theme — classic neural cyan',
        'timer.expired': '⌛ Expired',
        'price.free': 'Free',
        'settings.audio': '🔊 Audio',
        'settings.audio.on': '🔊 Sound On', 'settings.audio.off': '🔇 Sound Off',
        'settings.sfx': 'Effects Volume', 'settings.music': 'Music Volume',
        'settings.save': '💾 Save',
        'settings.export': '⬇ Export Save (.json)', 'settings.import': '⬆ Import Save (.json)',
        'settings.desktop': '🖥️ Desktop Version', 'settings.download': '⬇ Download (.exe)',
        'settings.windows': 'Standalone version for Windows',
        'settings.danger': '⚠️ Danger Zone',
        'settings.reset': '🗑 Reset All Progress', 'settings.delete': '🗑 Delete Account',
        'settings.version': 'Auto-saves every 3 seconds',
        'settings.lang': '🌐 Language',
        'boss.notif.title': '⚠ A NEW BOSS APPEARED!', 'boss.notif.battle': '⚔ Go to Battle',
        'notif.center': 'Notifications',
        'diamond.unit': 'Diamonds',
    },
    'es': {
        'hud.level': 'NIV ', 'hud.xp': 'XP',
        'nav.generators': 'Generadores', 'nav.generators.sub': 'Fuentes de Neuronas',
        'nav.upgrades': 'Mejoras',       'nav.upgrades.sub': 'Poder y Eficiencia',
        'nav.skills': 'Habilidades',     'nav.skills.sub': 'Puntos de Habilidad',
        'nav.rebirth': 'Renacimiento',   'nav.rebirth.sub': 'Prestigio Neural',
        'nav.missions': 'Misiones',      'nav.missions.sub': 'Diarias y Semanales',
        'nav.achievements': 'Logros',    'nav.achievements.sub': 'Hitos del Juego',
        'nav.leaderboard': 'Clasificación','nav.leaderboard.sub': 'Clasificación Global',
        'nav.profile': 'Perfil',         'nav.profile.sub': 'Cuenta y Estadísticas',
        'nav.friends': 'Amigos',         'nav.friends.sub': 'Lista y Comparación',
        'nav.settings': 'Configuración', 'nav.settings.sub': 'Audio y Guardado',
        'nav.boss': 'Batalla',           'nav.boss.sub': 'Combatir al Jefe',
        'nav.boss_upgrades': 'Mejoras',  'nav.boss_upgrades.sub': 'Poder de Ataque',
        'nav.boss_ranking': 'Ranking',   'nav.boss_ranking.sub': 'Ranking de Daño',
        'nav.skills.click': 'Clics',    'nav.skills.generator': 'Generadores','nav.skills.progress': 'Progresión',
        'shop.premium.title': 'PREMIUM', 'shop.premium.sub': 'Beneficios vitalicios exclusivos',
        'shop.diamonds.title': 'PAQUETES DE DIAMANTES',
        'shop.diamonds.sub': 'Saldo actual',
        'shop.skins.title': 'SKINS Y TEMAS', 'shop.skins.sub': 'Transforma completamente la atmósfera del núcleo',
        'shop.boosts.title': 'POTENCIADORES', 'shop.boosts.sub': 'Impulsos temporales · Haz clic para seleccionar cantidad',
        'skins.div.color': '🎨 Skins de Color', 'skins.div.theme': '✨ Skins Temáticas',
        'skins.div.event': '🎭 Skins de Evento', 'skins.div.temp': '⏳ Skins Temporales',
        'rarity.common': 'Común', 'rarity.uncommon': 'Poco Común', 'rarity.rare': 'Raro',
        'rarity.ultra_rare': 'Ultra Raro', 'rarity.epic': 'Épico', 'rarity.mythic': 'Místico',
        'rarity.legendary': 'Legendario', 'rarity.limited': 'Ed. Limitada', 'rarity.default': 'Predeterminado',
        'skin.equipped': '✓ EQUIPADA', 'skin.owned': '✓ Comprada',
        'skin.equip': 'Equipar', 'skin.buy': 'Adquirir', 'skin.get_free': 'Obtener Gratis',
        'skin.active': '✓ ACTIVO',
        'skin.default.name': 'NEXO PREDETERMINADO', 'skin.default.desc': 'Tema original del núcleo — cian neural clásico',
        'timer.expired': '⌛ Expirada',
        'price.free': 'Gratis',
        'settings.audio': '🔊 Audio',
        'settings.audio.on': '🔊 Sonido Activado', 'settings.audio.off': '🔇 Sonido Desactivado',
        'settings.sfx': 'Volumen de Efectos', 'settings.music': 'Volumen de Música',
        'settings.save': '💾 Guardado',
        'settings.export': '⬇ Exportar Guardado (.json)', 'settings.import': '⬆ Importar Guardado (.json)',
        'settings.desktop': '🖥️ Versión Escritorio', 'settings.download': '⬇ Descargar (.exe)',
        'settings.windows': 'Versión independiente para Windows',
        'settings.danger': '⚠️ Zona de Peligro',
        'settings.reset': '🗑 Reiniciar Todo el Progreso', 'settings.delete': '🗑 Eliminar Cuenta',
        'settings.version': 'Se guarda automáticamente cada 3 segundos',
        'settings.lang': '🌐 Idioma',
        'boss.notif.title': '⚠ ¡APARECIÓ UN NUEVO JEFE!', 'boss.notif.battle': '⚔ Ir a la Batalla',
        'notif.center': 'Notificaciones',
        'diamond.unit': 'Diamantes',
    },
};

window.LANG = {
    current: localStorage.getItem('nexarion_lang') || 'pt-BR',
    t(key, fallback) {
        return _T[this.current]?.[key] ?? _T['pt-BR']?.[key] ?? fallback ?? key;
    },
    set(lang) {
        if (!['pt-BR', 'en', 'es'].includes(lang)) return;
        localStorage.setItem('nexarion_lang', lang);
        location.reload();
    },
    langName(code) {
        return { 'pt-BR': 'Português (Brasil)', 'en': 'English', 'es': 'Español' }[code] || code;
    },
    applyStatic() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const v = this.t(el.dataset.i18n);
            if (v !== el.dataset.i18n) el.textContent = v;
        });
        const htmlEl = document.documentElement;
        if (htmlEl) htmlEl.lang = this.current;
    },
};

document.addEventListener('DOMContentLoaded', () => window.LANG.applyStatic());
