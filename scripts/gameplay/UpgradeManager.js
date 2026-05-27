class UpgradeManager {
    constructor() {
        this.generators = {};
        this.purchasedUpgrades = new Set();
        this.totalBought = 0;
        this._genMultipliers = {};
        this._clickMult = 1;
        this._globalMult = 1;
        this._skillCostDiscount = 0;

        GENERATORS.forEach(g => {
            this.generators[g.id] = { count: 0, baseRate: g.baseRate };
            this._genMultipliers[g.id] = 1;
        });
    }

    setSkillCostDiscount(d) { this._skillCostDiscount = Math.min(0.4, d); }

    getGeneratorCost(id) {
        const g = GENERATORS.find(x => x.id === id);
        const count = this.generators[id]?.count || 0;
        const base = Math.ceil(g.baseCost * Math.pow(Config.COST_SCALE, count));
        return Math.ceil(base * (1 - this._skillCostDiscount));
    }

    getGeneratorCostN(id, n) {
        const g = GENERATORS.find(x => x.id === id);
        const count = this.generators[id]?.count || 0;
        let total = 0;
        for (let i = 0; i < n; i++) {
            const base = Math.ceil(g.baseCost * Math.pow(Config.COST_SCALE, count + i));
            total += Math.ceil(base * (1 - this._skillCostDiscount));
        }
        return total;
    }

    calcMaxBuy(id, neurons) {
        const g = GENERATORS.find(x => x.id === id);
        const count = this.generators[id]?.count || 0;
        let n = 0, total = 0;
        while (n < 2000) {
            const base = Math.ceil(g.baseCost * Math.pow(Config.COST_SCALE, count + n));
            const cost = Math.ceil(base * (1 - this._skillCostDiscount));
            if (total + cost > neurons) break;
            total += cost;
            n++;
        }
        return n;
    }

    buyGeneratorN(id, n, economy) {
        if (n <= 0) return 0;
        const totalCost = this.getGeneratorCostN(id, n);
        if (!economy.canAfford(totalCost)) return 0;
        economy.spend(totalCost);
        this.generators[id].count += n;
        this.totalBought += n;
        return n;
    }

    buyGenerator(id, economy) {
        return this.buyGeneratorN(id, 1, economy) > 0;
    }

    getNPS() {
        let total = 0;
        GENERATORS.forEach(g => {
            const count = this.generators[g.id]?.count || 0;
            total += count * g.baseRate * this._genMultipliers[g.id] * this._globalMult;
        });
        return total;
    }

    isUpgradeUnlocked(upg) {
        if (this.purchasedUpgrades.has(upg.id)) return false;
        if (!upg.requires) return true;
        const r = upg.requires;
        if (r.clicks) return window.game?.stats?.totalClicks >= r.clicks;
        if (r.gen) return (this.generators[r.gen.id]?.count || 0) >= r.gen.count;
        return true;
    }

    buyUpgrade(upg, economy) {
        if (this.purchasedUpgrades.has(upg.id)) return false;
        if (!this.isUpgradeUnlocked(upg)) return false;
        const currency = upg.currency || 'neurons';
        if (currency === 'tokens') {
            if (economy.prestigeTokens < upg.cost) return false;
            economy.prestigeTokens -= upg.cost;
        } else {
            if (!economy.canAfford(upg.cost)) return false;
            economy.spend(upg.cost);
        }
        this.purchasedUpgrades.add(upg.id);
        this._applyUpgrade(upg, economy);
        return true;
    }

    _applyUpgrade(upg, economy) {
        if (upg.type === 'click') {
            this._clickMult *= upg.mult;
            economy.setClickMult(this._clickMult);
        } else if (upg.type === 'gen') {
            this._genMultipliers[upg.genId] = (this._genMultipliers[upg.genId] || 1) * upg.mult;
        } else if (upg.type === 'global') {
            this._globalMult *= upg.mult;
        } else if (upg.type === 'prestige') {
            economy.applyTokenUpgrade(upg.mult);
        } else if (upg.type === 'prestige_start') {
            // Applied on prestige load
        }
    }

    resetForPrestige(economy) {
        // Reset all generators
        GENERATORS.forEach(g => {
            this.generators[g.id].count = 0;
            this._genMultipliers[g.id]  = 1;
        });
        this._clickMult  = 1;
        this._globalMult = 1;
        economy.setClickMult(1);
        economy.setGlobalMult(1);
        economy.neuronsPerClick = 1;
        this.totalBought = 0;

        // Keep only prestige-type upgrades; reset normal ones so they can be repurchased
        const prestigeIds = new Set(
            UPGRADES.filter(u => u.type === 'prestige' || u.type === 'prestige_start').map(u => u.id)
        );
        this.purchasedUpgrades = new Set([...this.purchasedUpgrades].filter(id => prestigeIds.has(id)));

        // Re-apply prestige upgrades
        UPGRADES.filter(u => (u.type === 'prestige' || u.type === 'prestige_start') && this.purchasedUpgrades.has(u.id))
            .forEach(u => this._applyUpgrade(u, economy));

        // Apply prestige_start bonus generators
        UPGRADES.filter(u => u.type === 'prestige_start' && this.purchasedUpgrades.has(u.id))
            .forEach(u => { if (u.value?.gen) this.generators[u.value.gen].count += u.value.count; });
    }

    getAvailableUpgrades() {
        return UPGRADES.filter(u => this.isUpgradeUnlocked(u));
    }

    getState() {
        const gens = {};
        Object.keys(this.generators).forEach(k => gens[k] = this.generators[k].count);
        return {
            generators: gens,
            purchasedUpgrades: [...this.purchasedUpgrades],
            totalBought: this.totalBought,
            genMultipliers: { ...this._genMultipliers },
            clickMult: this._clickMult,
            globalMult: this._globalMult,
        };
    }

    loadState(s, economy) {
        if (!s) return;
        if (s.generators) Object.keys(s.generators).forEach(k => {
            if (this.generators[k]) this.generators[k].count = s.generators[k] || 0;
        });
        this.purchasedUpgrades = new Set(s.purchasedUpgrades || []);
        this.totalBought = s.totalBought || 0;
        if (s.genMultipliers) this._genMultipliers = { ...this._genMultipliers, ...s.genMultipliers };
        this._clickMult = s.clickMult || 1;
        this._globalMult = s.globalMult || 1;
        economy.setClickMult(this._clickMult);
        economy.setGlobalMult(this._globalMult);
    }
}
