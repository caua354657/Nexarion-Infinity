'use strict';

class WorldManager {
    constructor(game) {
        this._game = game;
        this._state = {
            unlockedWorlds: ['nexus_prime'],
            defeatedBosses: [],
            albumRewardsClaimed: {},
            equippedWorld: 'nexus_prime'
        };
    }

    init() {
        this._load();
        this._syncUnlocks(this._game.level?.level || 0);

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
            if (world.unlockLevel <= 1) continue;
            if (this._state.unlockedWorlds.includes(world.id)) continue;
            if (level >= world.unlockLevel) {
                this._state.unlockedWorlds.push(world.id);
                this._save();
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

    _syncUnlocks(level) {
        const worlds = typeof WORLDS_DATA !== 'undefined' ? WORLDS_DATA : [];
        let changed = false;
        for (const world of worlds) {
            if (this._state.unlockedWorlds.includes(world.id)) continue;
            if (level >= world.unlockLevel) {
                this._state.unlockedWorlds.push(world.id);
                changed = true;
            }
        }
        if (changed) this._save();
    }

    _registerBossDefeat(bossType) {
        // Award XP bonus on every defeat based on equipped world
        this._awardBossXp();

        if (this._state.defeatedBosses.includes(bossType)) return;
        this._state.defeatedBosses.push(bossType);
        this._save();
        this._game.save?.();
        this._game._syncToServer?.();
        this._game.events.emit('albumUpdated', { category: 'bosses' });
        this.checkAlbumRewards();
        if (this._game.ui._activePanel === 'worlds') {
            this._game.ui._renderPanelContent('worlds');
        }
    }

    _awardBossXp() {
        const bonus = this.getBossXpBonus();
        if (bonus <= 0) return;
        const bossLv = this._game.boss?.boss?.level || 1;
        const xp = Math.floor(bossLv * 80 * bonus);
        if (xp > 0 && this._game.level?.addXP) {
            this._game.level.addXP(xp);
            this._game.events.emit('bossXpAwarded', { xp });
        }
    }

    // ── Equip system ────────────────────────────────────────────────────────────

    equipWorld(id) {
        const worlds = typeof WORLDS_DATA !== 'undefined' ? WORLDS_DATA : [];
        const level  = this._game.level?.level || 0;
        const w = worlds.find(x => x.id === id);
        if (!w || level < w.unlockLevel) return false;
        this._state.equippedWorld = id;
        this._save();
        this._game.events.emit('worldEquipped', { world: w });
        return true;
    }

    getEquippedWorld() {
        const worlds = typeof WORLDS_DATA !== 'undefined' ? WORLDS_DATA : [];
        return worlds.find(x => x.id === this._state.equippedWorld) || worlds[0] || null;
    }

    getBossXpBonus() {
        const w = this.getEquippedWorld();
        return w?.bossXpBonus || 0;
    }

    // ── Stubs for removed bonus system ──────────────────────────────────────────

    getXpMult()       { return 1; }
    getPrestigeMult() { return 1; }
    isUnlocked(id)    { return this._state.unlockedWorlds.includes(id); }

    // ── Album ───────────────────────────────────────────────────────────────────

    getAlbumProgress() {
        const game    = this._game;
        const worlds  = typeof WORLDS_DATA        !== 'undefined' ? WORLDS_DATA        : [];
        const bossTypes = typeof BOSS_TYPES_ALBUM !== 'undefined' ? BOSS_TYPES_ALBUM   : [];
        const skins   = typeof PREMIUM_SKINS      !== 'undefined' ? PREMIUM_SKINS      : [];
        const achDefs = typeof ACHIEVEMENTS       !== 'undefined' ? ACHIEVEMENTS       : [];

        const ownedSkins = skins.filter(s => game.account.hasSkin(s.id)).length;
        const earnedAchs = game.achievements?.unlocked?.size || 0;

        return {
            worlds:       { owned: this._state.unlockedWorlds.length, total: worlds.length },
            bosses:       { owned: this._state.defeatedBosses.length,  total: bossTypes.length || 5 },
            skins:        { owned: ownedSkins, total: skins.length },
            achievements: { owned: earnedAchs, total: achDefs.length }
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

        if (changed) { this._save(); game.save?.(); game._syncToServer?.(); }
        return changed;
    }

    // ── Persistence ─────────────────────────────────────────────────────────────

    getState() { return JSON.parse(JSON.stringify(this._state)); }

    loadState(s) {
        if (!s) return;
        try {
            if (Array.isArray(s.unlockedWorlds))  this._state.unlockedWorlds = s.unlockedWorlds;
            if (Array.isArray(s.defeatedBosses))  this._state.defeatedBosses = s.defeatedBosses;
            if (s.albumRewardsClaimed)            this._state.albumRewardsClaimed = s.albumRewardsClaimed;
            if (s.equippedWorld)                  this._state.equippedWorld = s.equippedWorld;
            if (!this._state.unlockedWorlds.includes('nexus_prime')) {
                this._state.unlockedWorlds.unshift('nexus_prime');
            }
        } catch(_) {}
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
