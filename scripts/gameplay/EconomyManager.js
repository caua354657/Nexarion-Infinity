class EconomyManager {
    constructor() {
        this.neurons = 0;
        this.totalNeurons = 0;   // earned in current prestige cycle (resets on prestige)
        this.lifetimeNeurons = 0; // all-time total, never resets
        this.neuronsPerClick = 1;
        this.neuronsPerSec = 0;
        this.prestigeTokens = 0;
        this.totalPrestiges = 0;

        this._clickMult = 1;
        this._globalMult = 1;
        this._tempClickMult = 1;
        this._tempGlobalMult = 1;
        this._prestigeMult = 1;
        this._achievementClickMult = 1;
        this._achievementGlobalMult = 1;
        this._shopGlobalMult = 1;
        this._skillClickMult = 1;
        this._skillGlobalMult = 1;
        this._premiumMult = 1;
    }

    addNeurons(amount) {
        this.neurons += amount;
        this.totalNeurons += amount;
        this.lifetimeNeurons += amount;
    }

    /** Add prestige tokens directly (e.g. from diamond pack purchases). */
    addTokens(n) {
        this.prestigeTokens += Math.max(0, Math.floor(n));
        this._updatePrestigeMult();
    }

    spend(amount) {
        if (this.neurons < amount) return false;
        this.neurons -= amount;
        return true;
    }

    canAfford(amount) { return this.neurons >= amount; }

    getClickValue() {
        return Math.max(1, Math.floor(
            this.neuronsPerClick
            * this._clickMult
            * this._tempClickMult
            * this._achievementClickMult
            * this._prestigeMult
            * this._skillClickMult
            * this._premiumMult
        ));
    }

    getEffectiveNPS() {
        return this.neuronsPerSec
            * this._globalMult
            * this._tempGlobalMult
            * this._achievementGlobalMult
            * this._prestigeMult
            * this._shopGlobalMult
            * this._skillGlobalMult
            * this._premiumMult;
    }

    setClickMult(v) { this._clickMult = v; }
    setGlobalMult(v) { this._globalMult = v; }
    setTempClickMult(v) { this._tempClickMult = v; }
    setTempGlobalMult(v) { this._tempGlobalMult = v; }
    setPrestigeMult(v) { this._prestigeMult = v; }
    setAchievementClickMult(v) { this._achievementClickMult = v; }
    setAchievementGlobalMult(v) { this._achievementGlobalMult = v; }
    setShopGlobalMult(v) { this._shopGlobalMult = v; }
    setSkillClickMult(v) { this._skillClickMult = v; }
    setSkillGlobalMult(v) { this._skillGlobalMult = v; }
    setPremiumMult(v)     { this._premiumMult = v; }

    getPrestigeCost() {
        return Config.PRESTIGE_BASE * Math.pow(Config.PRESTIGE_SCALE, this.totalPrestiges);
    }

    calcPrestigeTokens() {
        const cost = this.getPrestigeCost();
        if (this.totalNeurons < cost) return 0;
        return Math.max(1, Math.floor(Math.sqrt(this.totalNeurons / cost)));
    }

    doPrestige(upgradeManager, tokenMult) {
        if (this.totalNeurons < this.getPrestigeCost()) return 0;
        const base = this.calcPrestigeTokens();
        if (base <= 0) return 0;
        const tokens = Math.floor(base * (tokenMult || 1));
        this.prestigeTokens += tokens;
        this.totalPrestiges++;
        this.neurons = 0;
        this.totalNeurons = 0;
        upgradeManager.resetForPrestige(this);
        this._updatePrestigeMult();
        return tokens;
    }

    _updatePrestigeMult() {
        this._prestigeMult = 1 + this.prestigeTokens * 0.1;
    }

    applyTokenUpgrade(mult) {
        this._prestigeMult *= mult;
    }

    getState() {
        return {
            neurons: this.neurons,
            totalNeurons: this.totalNeurons,
            lifetimeNeurons: this.lifetimeNeurons,
            prestigeTokens: this.prestigeTokens,
            totalPrestiges: this.totalPrestiges,
            clickMult: this._clickMult,
            globalMult: this._globalMult,
        };
    }

    loadState(s) {
        if (!s) return;
        this.neurons = s.neurons || 0;
        this.totalNeurons = s.totalNeurons || 0;
        // backward compat: old saves lack lifetimeNeurons — seed with totalNeurons as best estimate
        this.lifetimeNeurons = s.lifetimeNeurons || s.totalNeurons || 0;
        this.prestigeTokens = s.prestigeTokens || 0;
        this.totalPrestiges = s.totalPrestiges || 0;
        this._clickMult = s.clickMult || 1;
        this._globalMult = s.globalMult || 1;
        this._updatePrestigeMult();
    }
}
