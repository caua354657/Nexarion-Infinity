'use strict';

class PetManager {
    constructor(game) {
        this._game    = game;
        this._state   = { owned: {}, equipped: [] };
        this.MAX_ACTIVE = 3;
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    getState() { return JSON.parse(JSON.stringify(this._state)); }

    loadState(s) {
        if (!s) return;
        if (s.owned)    this._state.owned    = s.owned;
        if (s.equipped) this._state.equipped  = s.equipped.filter(id => !!this._state.owned[id]);
        // Restore premium pets from account (survive save wipe)
        this._restorePremium();
    }

    _restorePremium() {
        const acc = this._game.account;
        if (!acc?.isLoggedIn?.()) return;
        if (typeof PETS === 'undefined') return;
        for (const pet of PETS) {
            if (pet.costType !== 'premium' || !pet.itemId) continue;
            if (acc.hasSkin?.(pet.itemId) && !this._state.owned[pet.id]) {
                this._state.owned[pet.id] = { level: 1, xp: 0 };
            }
        }
    }

    // ── Level gate ────────────────────────────────────────────────────────────

    isUnlocked() {
        const req = (typeof PET_UNLOCK_LEVEL !== 'undefined') ? PET_UNLOCK_LEVEL : 55;
        return (this._game.level?.level || 0) >= req;
    }

    // ── Ownership ─────────────────────────────────────────────────────────────

    hasPet(id) { return !!this._state.owned[id]; }

    getOwned() {
        return Object.keys(this._state.owned).map(id => {
            const pet  = (typeof PETS !== 'undefined') ? PETS.find(p => p.id === id) : null;
            const data = this._state.owned[id];
            if (!pet) return null;
            return { ...pet, level: data.level, xp: data.xp };
        }).filter(Boolean);
    }

    getEquipped() {
        return this._state.equipped.map(id => {
            const pet  = (typeof PETS !== 'undefined') ? PETS.find(p => p.id === id) : null;
            const data = this._state.owned[id];
            if (!pet || !data) return null;
            return { ...pet, level: data.level, xp: data.xp };
        }).filter(Boolean);
    }

    // ── Acquire ───────────────────────────────────────────────────────────────

    grantPet(petId) {
        if (this._state.owned[petId]) return false; // already owned
        this._state.owned[petId] = { level: 1, xp: 0 };
        this._save();
        return true;
    }

    buyWithDiamonds(petId) {
        const pet = (typeof PETS !== 'undefined') ? PETS.find(p => p.id === petId) : null;
        if (!pet || pet.costType !== 'diamond') return false;
        if (this._state.owned[petId]) return false; // already owned
        const eco = this._game.economy;
        if (!eco || eco.prestigeTokens < pet.cost) return false;
        eco.prestigeTokens -= pet.cost;
        eco._updatePrestigeMult?.();
        this._state.owned[petId] = { level: 1, xp: 0 };
        this._save();
        this._game.ui?._updateHUD?.();
        return true;
    }

    // ── Leveling via boss kills ───────────────────────────────────────────────

    onBossKill(bossRarity = 'common') {
        if (typeof PETS === 'undefined') return;
        const xpTable = (typeof PET_BOSS_XP !== 'undefined') ? PET_BOSS_XP : {};
        const xpGain  = xpTable[bossRarity] || 2;
        const ownedIds = Object.keys(this._state.owned);
        if (!ownedIds.length) return;
        for (const petId of ownedIds) {
            this._addXP(petId, xpGain);
        }
        this._save();
    }

    _addXP(petId, amount) {
        const data = this._state.owned[petId];
        if (!data) return;
        const maxLv = (typeof PET_MAX_LEVEL !== 'undefined') ? PET_MAX_LEVEL : 10;
        if (data.level >= maxLv) { data.xp = 0; return; }
        data.xp += amount;
        const xpTable = (typeof PET_LEVEL_XP !== 'undefined') ? PET_LEVEL_XP : [];
        while (data.level < maxLv && xpTable[data.level + 1] && data.xp >= xpTable[data.level + 1]) {
            data.level++;
            const petName = (typeof PETS !== 'undefined') ? PETS.find(p => p.id === petId)?.name : petId;
            this._game.notify?.(`🐾 ${petName} chegou ao nível ${data.level}!`, 'levelup');
        }
    }

    getXpToNext(petId) {
        const data = this._state.owned[petId];
        if (!data || typeof PET_LEVEL_XP === 'undefined') return 0;
        const maxLv = (typeof PET_MAX_LEVEL !== 'undefined') ? PET_MAX_LEVEL : 10;
        if (data.level >= maxLv) return 0;
        return PET_LEVEL_XP[data.level + 1] || 0;
    }

    // ── Equip / Unequip ───────────────────────────────────────────────────────

    equip(petId) {
        if (!this._state.owned[petId]) return false;
        if (this._state.equipped.includes(petId)) return false;
        if (this._state.equipped.length >= this.MAX_ACTIVE) return false;
        this._state.equipped.push(petId);
        this._save();
        return true;
    }

    unequip(petId) {
        const idx = this._state.equipped.indexOf(petId);
        if (idx === -1) return false;
        this._state.equipped.splice(idx, 1);
        this._save();
        return true;
    }

    // ── Bonus calculation ─────────────────────────────────────────────────────

    _sumBonus(type) {
        if (typeof PETS === 'undefined') return 0;
        let total = 0;
        for (const petId of this._state.equipped) {
            const pet  = PETS.find(p => p.id === petId);
            const data = this._state.owned[petId];
            if (!pet || !data) continue;
            const b = pet.bonus;
            if (b.type === type || b.type === 'all') {
                total += b.baseVal + b.perLevel * (data.level - 1);
            }
        }
        return total / 100;
    }

    getClickMult()   { return 1 + this._sumBonus('click');   }
    getNpsMult()     { return 1 + this._sumBonus('nps');     }
    getBossDmgMult() { return 1 + this._sumBonus('boss');    }
    getXpMult()      { return 1 + this._sumBonus('xp');      }
    getDiamondBonus(){ return this._sumBonus('diamond');     }

    _save() { this._game.save?.(); }
}
