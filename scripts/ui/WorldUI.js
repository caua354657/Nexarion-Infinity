'use strict';

const WorldUI = (function () {

    let _activeTab = 'map';

    function render(game, container, mode) {
        if (mode) _activeTab = mode;
        container.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'wu-wrap';
        wrap.innerHTML = _buildHtml(game, mode);
        container.appendChild(wrap);
        _bindEvents(wrap, game);
    }

    function _t(key) {
        return (window.LANG || { t: k => k }).t(key);
    }

    function _buildHtml(game, mode) {
        if (mode === 'map')   return `<div class="wu-body">${_buildMap(game)}</div>`;
        if (mode === 'album') return `<div class="wu-body">${_buildAlbum(game)}</div>`;
        return `
        <div class="wu-tabs">
            <button class="wu-tab ${_activeTab === 'map'   ? 'wu-tab--active' : ''}" data-wu-tab="map">🌍 ${_t('wu.tab.worlds')}</button>
            <button class="wu-tab ${_activeTab === 'album' ? 'wu-tab--active' : ''}" data-wu-tab="album">📖 ${_t('wu.tab.album')}</button>
        </div>
        <div class="wu-body">
            ${_activeTab === 'map' ? _buildMap(game) : _buildAlbum(game)}
        </div>`;
    }

    // ── World Map ──────────────────────────────────────────────────────────────
    function _buildMap(game) {
        const worlds   = typeof WORLDS_DATA !== 'undefined' ? WORLDS_DATA : [];
        const level    = game.level.level;
        if (game.worlds?._syncUnlocks) game.worlds._syncUnlocks(level);
        const equipped = game.worlds?.getEquippedWorld?.()?.id || 'nexus_prime';
        const cards    = worlds.map((w, i) => _buildWorldCard(w, level, i, equipped)).join('');
        return `<div class="wu-map"><div class="wu-worlds-list">${cards}</div></div>`;
    }

    function _buildWorldCard(w, level, idx, equipped) {
        const unlocked = level >= w.unlockLevel;
        const pct      = unlocked ? 100 : Math.min(99, Math.floor((level / w.unlockLevel) * 100));
        const cls      = unlocked ? 'wu-world--unlocked' : (pct >= 75 ? 'wu-world--ready' : 'wu-world--locked');
        const orderLabel = `${_t('wu.world.order')} ${idx + 1}`;
        const isEquipped = equipped === w.id;

        if (unlocked) {
            return `
            <div class="wu-world ${cls}${isEquipped ? ' wu-world--equipped' : ''}" data-world-id="${w.id}" style="--w-accent:${w.accent};--w-glow:${w.glow};--w-bg:${w.bg}">
                <div class="wu-world-portal">
                    <div class="wu-world-portal-ring"></div>
                    <div class="wu-world-icon">${w.emoji}</div>
                </div>
                <div class="wu-world-info">
                    <div class="wu-world-order-label">${orderLabel}</div>
                    <div class="wu-world-name">${w.name}</div>
                    <div class="wu-world-sub">${w.subtitle}</div>
                    <div class="wu-world-desc">${w.atmosphere}</div>
                    <div class="wu-world-xp-tag">⚔️ ${w.bossXpLabel}</div>
                </div>
                <div class="wu-world-actions">
                    <div class="wu-world-badge">✅ ${_t('wu.world.unlocked')}</div>
                    <button class="wu-equip-btn${isEquipped ? ' wu-equip-btn--active' : ''}" data-wu-equip="${w.id}">
                        ${isEquipped ? `✅ ${_t('wu.world.equipped')}` : `🌍 ${_t('wu.world.equip')}`}
                    </button>
                </div>
            </div>`;
        }

        const ready = pct >= 75;
        return `
        <div class="wu-world ${cls}" data-world-id="${w.id}" style="--w-accent:${w.accent};--w-glow:${w.glow};--w-bg:${w.bg}">
            <div class="wu-world-portal wu-world-portal--locked">
                <div class="wu-world-icon">${ready ? w.emoji : '🔒'}</div>
            </div>
            <div class="wu-world-info">
                <div class="wu-world-order-label">${orderLabel}</div>
                <div class="wu-world-name wu-world-name--locked">${w.name}</div>
                <div class="wu-world-sub">${w.subtitle}</div>
                <div class="wu-world-lock-req">
                    ${_t('wu.world.requires')} <strong>${w.unlockLevel}</strong>
                    &nbsp;·&nbsp; ${_t('wu.world.your.level')} ${level}
                </div>
                <div class="wu-world-prog">
                    <div class="wu-world-prog-fill" style="width:${pct}%"></div>
                </div>
            </div>
            <div class="wu-world-actions">
                <div class="wu-world-badge wu-world-badge--lock">🔒 Nv. ${w.unlockLevel}</div>
                <div class="wu-world-xp-tag wu-world-xp-tag--locked">⚔️ ${w.bossXpLabel}</div>
            </div>
        </div>`;
    }

    // ── Album ──────────────────────────────────────────────────────────────────
    function _buildAlbum(game) {
        const bosses    = typeof BOSS_TYPES_ALBUM !== 'undefined' ? BOSS_TYPES_ALBUM : [];
        const allSkins  = typeof PREMIUM_SKINS    !== 'undefined' ? PREMIUM_SKINS    : [];
        const achDefs   = typeof ACHIEVEMENTS     !== 'undefined' ? ACHIEVEMENTS     : [];
        const defeated  = game.worlds._state.defeatedBosses || [];

        const permSkins = allSkins.filter(s => !s.temp && !s.event);
        const limSkins  = game.limitedSkins?.getSeenSkins?.() ?? allSkins.filter(s => s.temp);

        const bossOwned = defeated.length;
        const bossTotal = bosses.length;
        const permOwned = permSkins.filter(s => game.account.hasSkin(s.id)).length;
        const limOwned  = limSkins.filter(s => game.account.hasSkin(s.id)).length;
        const achOwned  = game.achievements?.unlocked?.size || 0;
        const achTotal  = achDefs.length;

        const bossPct = bossTotal        ? Math.floor(bossOwned / bossTotal        * 100) : 0;
        const permPct = permSkins.length ? Math.floor(permOwned / permSkins.length * 100) : 0;
        const limPct  = limSkins.length  ? Math.floor(limOwned  / limSkins.length  * 100) : 0;
        const achPct  = achTotal         ? Math.floor(achOwned  / achTotal          * 100) : 0;

        const bossCards = bosses.map(b => _buildBossCard(b, defeated)).join('');
        const permCards = permSkins.length
            ? permSkins.map(s => _buildSkinCard(s, game)).join('')
            : `<div class="wu-album-empty">${_t('wu.album.no.skins')}</div>`;
        const limCards  = limSkins.length
            ? limSkins.map(s => _buildSkinCard(s, game)).join('')
            : `<div class="wu-album-empty">${_t('wu.album.no.lim.skins')}</div>`;

        return `
        <div class="wu-album">
            <div class="wu-album-sect">
                <div class="wu-album-sect-hdr">
                    <span>💀 ${_t('wu.album.bosses')}</span>
                    <span class="wu-album-sect-count">${bossOwned}/${bossTotal} ${_t('wu.album.defeated.count')}</span>
                </div>
                <div class="wu-sect-bigbar wu-sect-bigbar--boss">
                    <div class="wu-sect-bigbar-track">
                        <div class="wu-sect-bigbar-fill" style="width:${bossPct}%"></div>
                        <span class="wu-sect-bigbar-pct">${bossPct}%</span>
                    </div>
                </div>
                <div class="wu-album-cards">${bossCards}</div>
            </div>

            <div class="wu-album-sect">
                <div class="wu-album-sect-hdr">
                    <span>🎨 ${_t('wu.album.skins.perm')}</span>
                    <span class="wu-album-sect-count">${permOwned}/${permSkins.length} ${_t('wu.album.owned.count')}</span>
                </div>
                <div class="wu-sect-bigbar wu-sect-bigbar--skin">
                    <div class="wu-sect-bigbar-track">
                        <div class="wu-sect-bigbar-fill" style="width:${permPct}%"></div>
                        <span class="wu-sect-bigbar-pct">${permPct}%</span>
                    </div>
                </div>
                <div class="wu-album-cards">${permCards}</div>
            </div>

            <div class="wu-album-sect">
                <div class="wu-album-sect-hdr">
                    <span>⏳ ${_t('wu.album.skins.lim')}</span>
                    <span class="wu-album-sect-count">${limOwned}/${limSkins.length} ${_t('wu.album.owned.count')}</span>
                </div>
                <div class="wu-sect-bigbar wu-sect-bigbar--lim">
                    <div class="wu-sect-bigbar-track">
                        <div class="wu-sect-bigbar-fill" style="width:${limPct}%"></div>
                        <span class="wu-sect-bigbar-pct">${limPct}%</span>
                    </div>
                </div>
                <div class="wu-album-cards">${limCards}</div>
            </div>
        </div>`;
    }

    function _buildBossCard(b, defeated) {
        const done = defeated.includes(b.id);
        return `
        <div class="wu-acard ${done ? 'wu-acard--done' : 'wu-acard--locked'}" style="--ac:${b.color}">
            <div class="wu-acard-glow"></div>
            <div class="wu-acard-icon">${b.icon}</div>
            <div class="wu-acard-name-wrap">
                <div class="wu-acard-name">${b.name}</div>
                <div class="wu-acard-rarity" style="color:${b.color}">${b.rarity}</div>
            </div>
            <div class="wu-acard-status ${done ? 'wu-acard-status--done' : ''}">
                ${done ? `✅ ${_t('wu.album.defeated')}` : `🔒 ${_t('wu.album.not.defeated')}`}
            </div>
        </div>`;
    }

    function _buildSkinCard(s, game) {
        const owned = game.account.hasSkin(s.id);
        const RC = {
            'common': '#9ca3af', 'uncommon': '#4ade80', 'rare': '#60a5fa',
            'epic': '#c084fc', 'legendary': '#fbbf24', 'mythic': '#f472b6',
            'ultra_rare': '#fb923c', 'limited': '#f87171'
        };
        const rarityKey   = (s.rarity || '').toLowerCase();
        const color       = RC[rarityKey] || '#9ca3af';
        const rarityLabel = _t('rarity.' + rarityKey) || s.rarity;
        const displayName = (window.LANG?.current === 'en' && s.name_en)
            ? s.name_en
            : (window.LANG?.current === 'es' && s.name_es)
                ? s.name_es
                : s.name;
        return `
        <div class="wu-acard ${owned ? 'wu-acard--done' : 'wu-acard--locked'}" style="--ac:${color}">
            <div class="wu-acard-glow"></div>
            <div class="wu-acard-icon" style="font-size:22px">${s.icon || '🎨'}</div>
            <div class="wu-acard-name-wrap">
                <div class="wu-acard-name">${displayName}</div>
                <div class="wu-acard-rarity" style="color:${color}">${rarityLabel}</div>
            </div>
            <div class="wu-acard-status ${owned ? 'wu-acard-status--done' : ''}">
                ${owned ? `✅ ${_t('wu.album.owned')}` : `🔒 ${_t('wu.album.locked')}`}
            </div>
        </div>`;
    }

    // ── Events ─────────────────────────────────────────────────────────────────
    function _bindEvents(wrap, game) {
        wrap.addEventListener('click', e => {
            const tabBtn   = e.target.closest('[data-wu-tab]');
            const equipBtn = e.target.closest('[data-wu-equip]');

            if (tabBtn) {
                _activeTab = tabBtn.dataset.wuTab;
                const panel = game.ui._activePanel;
                if (panel) game.ui._renderPanelContent(panel);
                return;
            }

            if (equipBtn) {
                const id = equipBtn.dataset.wuEquip;
                const ok = game.worlds?.equipWorld?.(id);
                if (ok) {
                    const panel = game.ui._activePanel;
                    if (panel) game.ui._renderPanelContent(panel);
                }
            }
        });
    }

    return { render };
})();
