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

    // ── Drop logic ────────────────────────────────────────────────────────────

    tryDrop(bossRarity = 'common') {
        if (typeof PETS === 'undefined') return null;
        const rarityBoost = { common: 0, uncommon: 5, rare: 10, epic: 20, legendary: 35, mythic: 50 };
        const chance = PET_DROP_BASE_CHANCE + (rarityBoost[bossRarity] || 0);
        if (Math.random() * 100 >= chance) return null;

        // Build weighted pool
        const pool = [];
        for (const pet of PETS) {
            const r = (PET_RARITIES || {})[pet.rarity];
            if (!r) continue;
            const w = Math.max(1, Math.round(r.dropWeight * 10));
            for (let i = 0; i < w; i++) pool.push(pet);
        }
        if (!pool.length) return null;
        const chosen = pool[Math.floor(Math.random() * pool.length)];
        return this._acquire(chosen.id);
    }

    _acquire(petId) {
        const pet = (typeof PETS !== 'undefined') ? PETS.find(p => p.id === petId) : null;
        if (!pet) return null;

        if (this._state.owned[petId]) {
            const xpGain = (PET_DUPE_XP || {})[pet.rarity] || 50;
            this._addXP(petId, xpGain);
            this._save();
            return { pet, type: 'xp', xpGain };
        }

        this._state.owned[petId] = { level: 1, xp: 0 };
        this._save();
        return { pet, type: 'new' };
    }

    // ── Leveling ─────────────────────────────────────────────────────────────

    _addXP(petId, amount) {
        const data = this._state.owned[petId];
        if (!data) return;
        const maxLv = PET_MAX_LEVEL || 10;
        if (data.level >= maxLv) { data.xp = 0; return; }
        data.xp += amount;
        const xpTable = PET_LEVEL_XP || [];
        while (data.level < maxLv && xpTable[data.level + 1] && data.xp >= xpTable[data.level + 1]) {
            data.level++;
            const petName = (typeof PETS !== 'undefined') ? PETS.find(p => p.id === petId)?.name : petId;
            this._game.notify?.(`🐾 ${petName} chegou ao nível ${data.level}!`, 'levelup');
        }
    }

    getXpToNext(petId) {
        const data = this._state.owned[petId];
        if (!data || !PET_LEVEL_XP) return 0;
        const maxLv = PET_MAX_LEVEL || 10;
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
