'use strict';

class WorldManager {
    constructor(game) {
        this._game = game;
        this._state = {
            unlockedWorlds: ['nexus_prime'],
            defeatedBosses: [],
            albumRewardsClaimed: {}
        };
        this._xpBonus = 1;
        this._prestigeBonus = 1;
    }

    init() {
        this._load();
        this._applyWorldBonuses();

        this._game.events.on('levelUp', ({ level }) => {
            this._checkUnlocks(level);
        });

        this._game.events.on('bossDefeated', ({ boss }) => {
            const type = boss?.type || boss?.tipo;
            if (type) this._registerBossDefeat(type);
        });
    }

    _checkUnlocks(level) {
        const worlds = typeof WORLDS_DATA !== 'undefined' ? WORLDS_DATA : [];
        for (const world of worlds) {
            if (world.unlockLevel <= 1) continue; // nexus_prime always unlocked
            if (this._state.unlockedWorlds.includes(world.id)) continue;
            if (level >= world.unlockLevel) {
                this._state.unlockedWorlds.push(world.id);
                this._save();
                this._applyWorldBonuses();
                setTimeout(() => {
                    this._game.notify(`🌍 Novo Mundo Desbloqueado: ${world.name}!`, 'levelup');
                    this._game.events.emit('worldUnlocked', { world });
                    if (this._game.ui._activePanel === 'worlds') {
                        this._game.ui._renderPanelContent('worlds');
                    }
                }, 400);
            }
        }
    }

    _registerBossDefeat(bossType) {
        if (this._state.defeatedBosses.includes(bossType)) return;
        this._state.defeatedBosses.push(bossType);
        this._save();
        this._game.events.emit('albumUpdated', { category: 'bosses' });
        this.checkAlbumRewards();
        if (this._game.ui._activePanel === 'worlds') {
            this._game.ui._renderPanelContent('worlds');
        }
    }

    _applyWorldBonuses() {
        const b = this.getWorldBonuses();
        if (this._game.economy) {
            this._game.economy.setWorldClickMult(b.click);
            this._game.economy.setWorldProductionMult(b.production);
        }
        this._xpBonus = b.xp;
        this._prestigeBonus = b.prestige;
    }

    getWorldBonuses() {
        const worlds = typeof WORLDS_DATA !== 'undefined' ? WORLDS_DATA : [];
        const b = { click: 1, production: 1, xp: 1, prestige: 1 };
        for (const wId of this._state.unlockedWorlds) {
            const w = worlds.find(x => x.id === wId);
            if (!w) continue;
            const v = w.bonusValue;
            if      (w.bonusType === 'click')      b.click      += v;
            else if (w.bonusType === 'production')  b.production  += v;
            else if (w.bonusType === 'xp')          b.xp          += v;
            else if (w.bonusType === 'prestige')    b.prestige    += v;
            else if (w.bonusType === 'all') {
                b.click      += v;
                b.production += v;
                b.xp         += v;
            }
        }
        return b;
    }

    getXpMult()      { return this._xpBonus; }
    getPrestigeMult(){ return this._prestigeBonus; }
    isUnlocked(id)   { return this._state.unlockedWorlds.includes(id); }

    getAlbumProgress() {
        const game  = this._game;
        const worlds  = typeof WORLDS_DATA         !== 'undefined' ? WORLDS_DATA         : [];
        const bossTypes = typeof BOSS_TYPES_ALBUM  !== 'undefined' ? BOSS_TYPES_ALBUM    : [];
        const skins   = typeof PREMIUM_SKINS       !== 'undefined' ? PREMIUM_SKINS       : [];
        const achDefs = typeof ACHIEVEMENTS        !== 'undefined' ? ACHIEVEMENTS        : [];

        const ownedSkins = skins.filter(s => game.account.hasSkin(s.id)).length;
        const earnedAchs = game.achievements?.unlocked?.size || 0;

        return {
            worlds: {
                owned: this._state.unlockedWorlds.length,
                total: worlds.length
            },
            bosses: {
                owned: this._state.defeatedBosses.length,
                total: bossTypes.length || 5
            },
            skins: {
                owned: ownedSkins,
                total: skins.length
            },
            achievements: {
                owned: earnedAchs,
                total: achDefs.length
            }
        };
    }

    checkAlbumRewards() {
        const prog    = this.getAlbumProgress();
        const claimed = this._state.albumRewardsClaimed;
        const game    = this._game;
        let changed   = false;

        if (prog.worlds.owned >= prog.worlds.total && !claimed.worlds_complete) {
            claimed.worlds_complete = true;
            game.economy.addTokens(500);
            game.ui._updateHUD();
            game.notify('🌍 Álbum completo: Todos os Mundos! +500 💎', 'levelup');
            changed = true;
        }
        if (prog.bosses.owned >= prog.bosses.total && !claimed.bosses_complete) {
            claimed.bosses_complete = true;
            game.economy.addTokens(250);
            game.ui._updateHUD();
            game.notify('💀 Álbum completo: Todos os Bosses! +250 💎', 'levelup');
            changed = true;
        }
        if (prog.skins.total > 0 && prog.skins.owned / prog.skins.total >= 0.5 && !claimed.skins_half) {
            claimed.skins_half = true;
            game.economy.addTokens(200);
            game.ui._updateHUD();
            game.notify('🎨 Álbum: 50% das Skins coletadas! +200 💎', 'success');
            changed = true;
        }
        if (prog.achievements.total > 0 && prog.achievements.owned / prog.achievements.total >= 0.5 && !claimed.achievements_half) {
            claimed.achievements_half = true;
            game.economy.addTokens(150);
            game.ui._updateHUD();
            game.notify('🏆 Álbum: 50% das Conquistas obtidas! +150 💎', 'success');
            changed = true;
        }

        if (changed) { this._save(); game.save(); }
        return changed;
    }

    getState()  { return JSON.parse(JSON.stringify(this._state)); }

    loadState(s) {
        if (!s) return;
        try {
            if (Array.isArray(s.unlockedWorlds))  this._state.unlockedWorlds = s.unlockedWorlds;
            if (Array.isArray(s.defeatedBosses))  this._state.defeatedBosses = s.defeatedBosses;
            if (s.albumRewardsClaimed)            this._state.albumRewardsClaimed = s.albumRewardsClaimed;
            if (!this._state.unlockedWorlds.includes('nexus_prime')) {
                this._state.unlockedWorlds.unshift('nexus_prime');
            }
        } catch(_) {}
        this._applyWorldBonuses();
    }

    _save() {
        try { localStorage.setItem('nx_worlds_v1', JSON.stringify(this._state)); } catch(_) {}
    }

    _load() {
        try {
            const raw = localStorage.getItem('nx_worlds_v1');
            if (raw) this.loadState(JSON.parse(raw));
        } catch(_) {}
    }
}
