'use strict';

const WorldUI = (function () {

    let _activeTab = 'map';
    let _activeAlbumCat = 'worlds';

    function render(game, container) {
        container.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'wu-wrap';
        wrap.innerHTML = _buildHtml(game);
        container.appendChild(wrap);
        _bindEvents(wrap, game);
    }

    function _buildHtml(game) {
        return `
        <div class="wu-tabs">
            <button class="wu-tab ${_activeTab === 'map'   ? 'wu-tab--active' : ''}" data-wu-tab="map">🌍 Mundos</button>
            <button class="wu-tab ${_activeTab === 'album' ? 'wu-tab--active' : ''}" data-wu-tab="album">📖 Álbum</button>
        </div>
        <div class="wu-body">
            ${_activeTab === 'map' ? _buildMap(game) : _buildAlbum(game)}
        </div>`;
    }

    // ── World Map ──────────────────────────────────────────────────────────────
    function _buildMap(game) {
        const worlds  = typeof WORLDS_DATA !== 'undefined' ? WORLDS_DATA : [];
        const bonuses = game.worlds.getWorldBonuses();
        const level   = game.level.level;

        const bonusSummary = _buildBonusSummary(bonuses);
        const cards = worlds.map((w, i) => _buildWorldCard(w, game, level, i, worlds.length)).join('');

        return `
        <div class="wu-map">
            ${bonusSummary}
            <div class="wu-worlds-list">
                ${cards}
            </div>
        </div>`;
    }

    function _buildBonusSummary(b) {
        const fmt = v => v > 1 ? `+${Math.round((v - 1) * 100)}%` : '—';
        return `
        <div class="wu-bonus-bar">
            <span class="wu-bonus-title">Bônus Ativos dos Mundos</span>
            <div class="wu-bonus-items">
                <span class="wu-bonus-item">👆 Clique <strong>${fmt(b.click)}</strong></span>
                <span class="wu-bonus-item">⚡ Produção <strong>${fmt(b.production)}</strong></span>
                <span class="wu-bonus-item">⬆️ XP <strong>${fmt(b.xp)}</strong></span>
                <span class="wu-bonus-item">💎 Prestígio <strong>${fmt(b.prestige)}</strong></span>
            </div>
        </div>`;
    }

    function _buildWorldCard(w, game, level, idx, total) {
        const unlocked  = game.worlds.isUnlocked(w.id);
        const canUnlock = level >= w.unlockLevel;
        const cls       = unlocked ? 'wu-world--unlocked' : (canUnlock ? 'wu-world--ready' : 'wu-world--locked');
        const pct       = unlocked ? 100 : Math.min(99, Math.floor((level / w.unlockLevel) * 100));

        const bonusFmt = `${w.bonusIcon} ${w.bonusLabel}`;

        if (unlocked) {
            return `
            <div class="wu-world ${cls}" style="--w-accent:${w.accent};--w-glow:${w.glow};--w-bg:${w.bg}">
                <div class="wu-world-icon">${w.emoji}</div>
                <div class="wu-world-info">
                    <div class="wu-world-name">${w.name}</div>
                    <div class="wu-world-sub">${w.subtitle}</div>
                    <div class="wu-world-desc">${w.atmosphere}</div>
                </div>
                <div class="wu-world-right">
                    <div class="wu-world-bonus">${bonusFmt}</div>
                    <div class="wu-world-badge">✅ Desbloqueado</div>
                </div>
            </div>`;
        }

        const progress = `<div class="wu-world-prog"><div class="wu-world-prog-fill" style="width:${pct}%"></div></div>`;
        return `
        <div class="wu-world ${cls}" style="--w-accent:${w.accent};--w-glow:${w.glow};--w-bg:${w.bg}">
            <div class="wu-world-icon">${canUnlock ? w.emoji : '🔒'}</div>
            <div class="wu-world-info">
                <div class="wu-world-name">${w.name}</div>
                <div class="wu-world-sub">${w.subtitle}</div>
                <div class="wu-world-lock-req">Requer Nível <strong>${w.unlockLevel.toLocaleString('pt-BR')}</strong> · Você está no Nível ${level.toLocaleString('pt-BR')}</div>
                ${progress}
            </div>
            <div class="wu-world-right">
                <div class="wu-world-bonus wu-world-bonus--locked">${bonusFmt}</div>
                <div class="wu-world-badge wu-world-badge--lock">🔒 Nv. ${w.unlockLevel.toLocaleString('pt-BR')}</div>
            </div>
        </div>`;
    }

    // ── Album ──────────────────────────────────────────────────────────────────
    function _buildAlbum(game) {
        const prog = game.worlds.getAlbumProgress();
        const total = prog.worlds.total + prog.bosses.total + prog.skins.total + prog.achievements.total;
        const owned = prog.worlds.owned + prog.bosses.owned + prog.skins.owned + prog.achievements.owned;
        const pct   = total > 0 ? Math.floor((owned / total) * 100) : 0;

        const cats = [
            { id: 'worlds',       label: '🌍 Mundos',     p: prog.worlds },
            { id: 'bosses',       label: '💀 Bosses',     p: prog.bosses },
            { id: 'skins',        label: '🎨 Skins',      p: prog.skins },
            { id: 'achievements', label: '🏆 Conquistas', p: prog.achievements }
        ];

        const catBtns = cats.map(c => `
            <button class="wu-album-cat ${_activeAlbumCat === c.id ? 'wu-album-cat--active' : ''}"
                    data-wu-cat="${c.id}">
                ${c.label}
                <span class="wu-album-cat-count">${c.p.owned}/${c.p.total}</span>
            </button>`).join('');

        const claimed = game.worlds._state.albumRewardsClaimed || {};
        const rewardHints = _buildRewardHints(prog, claimed);

        return `
        <div class="wu-album">
            <div class="wu-album-header">
                <div class="wu-album-title">Álbum de Coleção</div>
                <div class="wu-album-prog">
                    <div class="wu-album-prog-bar">
                        <div class="wu-album-prog-fill" style="width:${pct}%"></div>
                    </div>
                    <span class="wu-album-pct">${pct}% completo</span>
                </div>
            </div>
            <div class="wu-album-cats">${catBtns}</div>
            ${rewardHints}
            <div class="wu-album-grid">
                ${_buildAlbumCatContent(game, _activeAlbumCat)}
            </div>
        </div>`;
    }

    function _buildRewardHints(prog, claimed) {
        const hints = [];

        if (!claimed.worlds_complete) {
            const left = prog.worlds.total - prog.worlds.owned;
            hints.push(`🌍 Todos os Mundos (+500 💎) — faltam ${left} mundo${left !== 1 ? 's' : ''}`);
        }
        if (!claimed.bosses_complete) {
            const left = prog.bosses.total - prog.bosses.owned;
            hints.push(`💀 Todos os Bosses (+250 💎) — faltam ${left} boss${left !== 1 ? 'es' : ''}`);
        }
        if (!claimed.skins_half && prog.skins.total > 0) {
            const need = Math.ceil(prog.skins.total * 0.5);
            const left = Math.max(0, need - prog.skins.owned);
            if (left > 0) hints.push(`🎨 50% das Skins (+200 💎) — faltam ${left} skin${left !== 1 ? 's' : ''}`);
        }
        if (!claimed.achievements_half && prog.achievements.total > 0) {
            const need = Math.ceil(prog.achievements.total * 0.5);
            const left = Math.max(0, need - prog.achievements.owned);
            if (left > 0) hints.push(`🏆 50% Conquistas (+150 💎) — faltam ${left}`);
        }

        if (!hints.length) return '';
        return `<div class="wu-album-rewards">
            <div class="wu-album-rewards-title">🎁 Recompensas Disponíveis</div>
            ${hints.map(h => `<div class="wu-album-reward-item">${h}</div>`).join('')}
        </div>`;
    }

    function _buildAlbumCatContent(game, cat) {
        if (cat === 'worlds')       return _buildAlbumWorlds(game);
        if (cat === 'bosses')       return _buildAlbumBosses(game);
        if (cat === 'skins')        return _buildAlbumSkins(game);
        if (cat === 'achievements') return _buildAlbumAchievements(game);
        return '';
    }

    function _buildAlbumWorlds(game) {
        const worlds = typeof WORLDS_DATA !== 'undefined' ? WORLDS_DATA : [];
        return worlds.map(w => {
            const unlocked = game.worlds.isUnlocked(w.id);
            const cls = unlocked ? 'wu-card wu-card--unlocked' : 'wu-card wu-card--locked';
            return `
            <div class="${cls}" style="--w-accent:${w.accent}">
                <div class="wu-card-icon">${unlocked ? w.emoji : '🔒'}</div>
                <div class="wu-card-name">${w.name}</div>
                <div class="wu-card-sub">${unlocked ? w.subtitle : `Nv. ${w.unlockLevel.toLocaleString('pt-BR')}`}</div>
                ${unlocked ? `<div class="wu-card-bonus">${w.bonusLabel}</div>` : ''}
            </div>`;
        }).join('');
    }

    function _buildAlbumBosses(game) {
        const bosses = typeof BOSS_TYPES_ALBUM !== 'undefined' ? BOSS_TYPES_ALBUM : [];
        const defeated = game.worlds._state.defeatedBosses || [];
        return bosses.map(b => {
            const done = defeated.includes(b.id);
            const cls  = done ? 'wu-card wu-card--unlocked' : 'wu-card wu-card--locked';
            return `
            <div class="${cls}" style="--w-accent:${b.color}">
                <div class="wu-card-icon">${done ? b.icon : '❓'}</div>
                <div class="wu-card-name">${done ? b.name : '???'}</div>
                <div class="wu-card-sub wu-card-rarity" style="color:${b.color}">${b.rarity}</div>
                ${done ? '<div class="wu-card-bonus">✅ Derrotado</div>' : '<div class="wu-card-bonus">Derrote este boss</div>'}
            </div>`;
        }).join('');
    }

    function _buildAlbumSkins(game) {
        const skins = typeof PREMIUM_SKINS !== 'undefined' ? PREMIUM_SKINS : [];
        if (!skins.length) return '<div class="wu-empty">Nenhuma skin cadastrada.</div>';
        return skins.map(s => {
            const owned = game.account.hasSkin(s.id);
            const cls   = owned ? 'wu-card wu-card--unlocked' : 'wu-card wu-card--locked';
            const rarityColor = { COMMON: '#9ca3af', UNCOMMON: '#4ade80', RARE: '#60a5fa', EPIC: '#c084fc', LEGENDARY: '#fbbf24', MYTHIC: '#f472b6', 'ULTRA RARE': '#fb923c', LIMITED: '#f87171' };
            const color = rarityColor[s.rarity] || '#9ca3af';
            return `
            <div class="${cls}" style="--w-accent:${color}">
                <div class="wu-card-icon" style="font-size:22px">${owned ? (s.icon || '🎨') : '🔒'}</div>
                <div class="wu-card-name">${owned ? s.name : '???'}</div>
                <div class="wu-card-sub wu-card-rarity" style="color:${color}">${s.rarity}</div>
                ${owned ? '<div class="wu-card-bonus">✅ Adquirida</div>' : '<div class="wu-card-bonus">Disponível na Loja</div>'}
            </div>`;
        }).join('');
    }

    function _buildAlbumAchievements(game) {
        const defs = typeof ACHIEVEMENTS !== 'undefined' ? ACHIEVEMENTS : [];
        if (!defs.length) return '<div class="wu-empty">Nenhuma conquista cadastrada.</div>';
        return defs.map(a => {
            const done = game.achievements.unlocked.has(a.id);
            const cls  = done ? 'wu-card wu-card--unlocked' : 'wu-card wu-card--locked';
            return `
            <div class="${cls}" style="--w-accent:#fbbf24">
                <div class="wu-card-icon">${done ? (a.icon || '🏆') : '🔒'}</div>
                <div class="wu-card-name">${done ? a.name : '???'}</div>
                <div class="wu-card-sub">${done ? (a.desc || '') : 'Conquista bloqueada'}</div>
            </div>`;
        }).join('');
    }

    // ── Events ─────────────────────────────────────────────────────────────────
    function _bindEvents(wrap, game) {
        wrap.addEventListener('click', e => {
            const tabBtn = e.target.closest('[data-wu-tab]');
            if (tabBtn) {
                _activeTab = tabBtn.dataset.wuTab;
                if (game.ui._activePanel === 'worlds') game.ui._renderPanelContent('worlds');
                return;
            }
            const catBtn = e.target.closest('[data-wu-cat]');
            if (catBtn) {
                _activeAlbumCat = catBtn.dataset.wuCat;
                if (game.ui._activePanel === 'worlds') game.ui._renderPanelContent('worlds');
                return;
            }
        });
    }

    return { render };
})();
