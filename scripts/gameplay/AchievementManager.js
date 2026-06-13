class AchievementManager {
    constructor(events) {
        this._events = events;
        this.unlocked = new Set();
        this._achievementClickMult = 1;
        this._achievementGlobalMult = 1;
    }

    check(stats, economy, upgradeManager, combo, missions) {
        const newOnes = [];
        ACHIEVEMENTS.forEach(a => {
            if (this.unlocked.has(a.id)) return;
            if (this._isUnlocked(a, stats, economy, upgradeManager, combo, missions)) {
                this.unlocked.add(a.id);
                this._applyReward(a, economy);
                newOnes.push(a);
                this._events.emit('achievement', a);
            }
        });
        return newOnes;
    }

    _isUnlocked(a, stats, economy, upgradeManager, combo, missions) {
        switch (a.type) {
            case 'clicks':    return stats.totalClicks >= a.value;
            case 'allTime':   return economy.totalNeurons >= a.value;
            case 'nps':       return economy.getEffectiveNPS() >= a.value;
            case 'level':     return stats.level >= a.value;
            case 'upgrades':  return upgradeManager.purchasedUpgrades.size >= a.value;
            case 'prestiges': return economy.totalPrestiges >= a.value;
            case 'combo':     return combo >= a.value;
            case 'missions':  return missions && missions.claims.size >= a.value;
            case 'playtime':  return stats.playTime >= a.value;
            case 'gen': {
                const g = upgradeManager.generators[a.gen];
                return g && g.count >= a.value;
            }
            case 'allGens':
                return GENERATORS.every(g => (upgradeManager.generators[g.id]?.count || 0) >= a.value);
            case 'secret':    return false;
            default:          return false;
        }
    }

    _applyReward(a, economy) {
        if (!a.reward) return;
        if (a.reward === 'bonus_click') {
            this._achievementClickMult *= a.rewardVal;
            economy.setAchievementClickMult(this._achievementClickMult);
        } else if (a.reward === 'bonus_global') {
            this._achievementGlobalMult *= a.rewardVal;
            economy.setAchievementGlobalMult(this._achievementGlobalMult);
        }
    }

    getEarned() { return [...this.unlocked]; }

    unlockSecret(id, economy) {
        const a = ACHIEVEMENTS.find(x => x.id === id && x.type === 'secret');
        if (!a || this.unlocked.has(id)) return;
        this.unlocked.add(id);
        this._applyReward(a, economy);
        this._events.emit('achievement', a);
    }

    getProgress(stats, economy, upgradeManager) {
        return ACHIEVEMENTS.map(a => ({
            ...a,
            done: this.unlocked.has(a.id),
            progress: this._getProgress(a, stats, economy, upgradeManager)
        }));
    }

    _getProgress(a, stats, economy, upgradeManager) {
        switch (a.type) {
            case 'clicks':    return { cur: stats.totalClicks, max: a.value };
            case 'allTime':   return { cur: economy.totalNeurons, max: a.value };
            case 'nps':       return { cur: economy.getEffectiveNPS(), max: a.value };
            case 'level':     return { cur: stats.level, max: a.value };
            case 'upgrades':  return { cur: upgradeManager.purchasedUpgrades.size, max: a.value };
            case 'prestiges': return { cur: economy.totalPrestiges, max: a.value };
            case 'missions':  return { cur: window.game?.missions.claims.size || 0, max: a.value };
            case 'playtime':  return { cur: stats.playTime, max: a.value };
            case 'gen':       return { cur: upgradeManager.generators[a.gen]?.count || 0, max: a.value };
            default:          return null;
        }
    }

    getState() { return { unlocked: [...this.unlocked], clickMult: this._achievementClickMult, globalMult: this._achievementGlobalMult }; }

    loadState(s, economy) {
        if (!s) return;
        this.unlocked = new Set(s.unlocked || []);
        this._achievementClickMult = s.clickMult || 1;
        this._achievementGlobalMult = s.globalMult || 1;
        economy.setAchievementClickMult(this._achievementClickMult);
        economy.setAchievementGlobalMult(this._achievementGlobalMult);
    }
}
