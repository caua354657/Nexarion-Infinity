'use strict';

const PetUI = {

    render(game, container) {
        const pm = game.pets;
        if (!pm || typeof PETS === 'undefined') {
            container.innerHTML = '<div class="empty-msg">Sistema de Pets carregando...</div>';
            return;
        }

        const ownedMap  = pm._state.owned;
        const equippedIds = new Set(pm._state.equipped);
        const ownedIds  = new Set(Object.keys(ownedMap));
        const equippedPets = pm.getEquipped();

        const RARITY_ORDER = ['legendary','mythic','epic','ultra_rare','rare','uncommon','common'];

        const allPets = [...PETS].sort((a, b) => {
            const aOwn = ownedIds.has(a.id) ? 0 : 1;
            const bOwn = ownedIds.has(b.id) ? 0 : 1;
            if (aOwn !== bOwn) return aOwn - bOwn;
            return RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
        });

        const rar = (id) => (typeof PET_RARITIES !== 'undefined' ? PET_RARITIES[id] : null) || { color: '#9ca3af', label: id, glow: '' };

        // ── Equipped slots ───────────────────────────────────────────────────
        const buildSlot = (idx) => {
            const petId = pm._state.equipped[idx];
            if (!petId) {
                return `<div class="pet-slot pet-slot--empty"><div class="pet-slot-num">${idx + 1}</div><div class="pet-slot-hint">vazio</div></div>`;
            }
            const pet  = PETS.find(p => p.id === petId);
            const data = ownedMap[petId];
            const r    = rar(pet?.rarity);
            return `
            <div class="pet-slot" style="border-color:${r.color}55;box-shadow:0 0 14px ${r.glow}">
                <div class="pet-slot-icon">${pet?.icon || '?'}</div>
                <div class="pet-slot-name" style="color:${r.color}">${pet?.name || petId}</div>
                <div class="pet-slot-lv">Lv ${data?.level ?? 1}</div>
                <button class="pet-slot-remove" onclick="window.game.ui._petUnequip('${petId}')">✕</button>
            </div>`;
        };

        const slotsHTML = [0, 1, 2].map(buildSlot).join('');

        // ── Bonus summary ────────────────────────────────────────────────────
        const bonusHTML = this._buildBonusSummary(pm);

        // ── Pet cards ────────────────────────────────────────────────────────
        const cardsHTML = allPets.map(pet => {
            const isOwned    = ownedIds.has(pet.id);
            const isEquipped = equippedIds.has(pet.id);
            const data       = ownedMap[pet.id];
            const r          = rar(pet.rarity);
            const maxLv      = (typeof PET_MAX_LEVEL !== 'undefined') ? PET_MAX_LEVEL : 10;

            if (!isOwned) {
                return `
                <div class="pet-card pet-card--locked" style="--pet-c:${r.color}">
                    <div class="pet-card-rar" style="color:${r.color}">${r.label}</div>
                    <div class="pet-card-icon pet-card-icon--lock">?</div>
                    <div class="pet-card-name pet-card-name--lock">???</div>
                    <div class="pet-card-desc">${pet.desc}</div>
                </div>`;
            }

            const level  = data.level;
            const xp     = data.xp;
            const xpNext = pm.getXpToNext(pet.id);
            const xpPct  = (xpNext > 0) ? Math.min(100, Math.floor(xp / xpNext * 100)) : 100;
            const bonusVal  = pet.bonus.baseVal + pet.bonus.perLevel * (level - 1);
            const bonusTxt  = pet.bonus.label.replace('{v}', bonusVal.toFixed(0));

            const equipBtn = isEquipped
                ? `<button class="pet-btn pet-btn--off" onclick="window.game.ui._petUnequip('${pet.id}')">Desequipar</button>`
                : pm._state.equipped.length < pm.MAX_ACTIVE
                    ? `<button class="pet-btn pet-btn--on" onclick="window.game.ui._petEquip('${pet.id}')">Equipar</button>`
                    : `<button class="pet-btn pet-btn--full" disabled>Slots cheios</button>`;

            return `
            <div class="pet-card${isEquipped ? ' pet-card--equipped' : ''}" style="--pet-c:${r.color};--pet-glow:${r.glow}">
                <div class="pet-card-rar" style="color:${r.color}">${r.label}</div>
                <div class="pet-card-icon">${pet.icon}</div>
                <div class="pet-card-name">${pet.name}</div>
                <div class="pet-card-lv">Nível ${level}${level >= maxLv ? ' <span class="pet-max">MAX</span>' : ''}</div>
                ${level < maxLv ? `
                <div class="pet-xpbar"><div class="pet-xpfill" style="width:${xpPct}%"></div></div>
                <div class="pet-xplabel">${xp} / ${xpNext} XP</div>` : ''}
                <div class="pet-card-bonus">${bonusTxt}</div>
                ${equipBtn}
            </div>`;
        }).join('');

        const ownedCount = ownedIds.size;
        const totalCount = PETS.length;

        container.innerHTML = `
        <div class="pet-panel">
            <div class="pet-header">
                <div class="pet-header-title">🐾 Sistema de Pets</div>
                <div class="pet-header-count">${ownedCount} / ${totalCount} capturados</div>
            </div>

            <div class="pet-active-section">
                <div class="pet-active-label">Pets Ativos (${pm._state.equipped.length} / ${pm.MAX_ACTIVE})</div>
                <div class="pet-slots">${slotsHTML}</div>
                ${bonusHTML}
            </div>

            <div class="pet-grid-label">Coleção</div>
            <div class="pet-grid">${cardsHTML}</div>

            <div class="pet-hint">
                Pets são obtidos aleatoriamente ao derrotar bosses.<br>
                Pets duplicados convertem-se em XP para o pet.
            </div>
        </div>`;
    },

    _buildBonusSummary(pm) {
        const click = pm.getClickMult();
        const nps   = pm.getNpsMult();
        const boss  = pm.getBossDmgMult();
        const xp    = pm.getXpMult();
        const diam  = pm.getDiamondBonus();

        if (click <= 1 && nps <= 1 && boss <= 1 && xp <= 1 && diam <= 0) return '';

        const fmt  = (v) => '+' + ((v - 1) * 100).toFixed(0) + '%';
        const fmtD = (v) => '+' + (v * 100).toFixed(1) + '%';
        const parts = [];
        if (click > 1) parts.push(`<span>⚡ Clique: ${fmt(click)}</span>`);
        if (nps   > 1) parts.push(`<span>🧠 N/s: ${fmt(nps)}</span>`);
        if (boss  > 1) parts.push(`<span>⚔️ Boss: ${fmt(boss)}</span>`);
        if (xp    > 1) parts.push(`<span>⭐ XP: ${fmt(xp)}</span>`);
        if (diam  > 0) parts.push(`<span>💎 +${fmtD(diam)} diamantes</span>`);

        return `<div class="pet-bonus-bar">${parts.join('')}</div>`;
    },

    updateCompanion(game) {
        const el = document.getElementById('pets-companion');
        if (!el) return;
        const pm = game?.pets;
        if (!pm) return;
        const equipped = pm.getEquipped();
        el.innerHTML = equipped.map((pet, i) => {
            const r = (typeof PET_RARITIES !== 'undefined' ? PET_RARITIES[pet.rarity] : null) || {};
            return `<div class="pet-companion pet-companion--${i}" style="--pet-c:${r.color || '#fff'};--pet-glow:${r.glow || 'transparent'}" title="${pet.name} (Lv ${pet.level})">${pet.icon}</div>`;
        }).join('');
    },
};
