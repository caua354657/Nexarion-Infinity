class ShopManager {
    constructor(economy, boosts) {
        this._economy = economy;
        this._boosts  = boosts;
        this.purchased = new Set();

        this._offlineBonus = 0;
        this._critBonus    = 0;
        this._xpMult       = 1;
        this._globalBonus  = 0;
        this._tokenBonus   = 0;
        this._vipBonus     = 0;
    }

    canBuy(item, qty = 1) {
        if (item.type === 'permanent' && this.purchased.has(item.id)) return false;
        const cost = item.cost * (item.type === 'boost' ? Math.max(1, qty) : 1);
        if (item.currency === 'neurons') return this._economy.canAfford(cost);
        if (item.currency === 'tokens')  return this._economy.prestigeTokens >= cost;
        return false;
    }

    buy(id, qty = 1) {
        const item = SHOP_ITEMS.find(x => x.id === id);
        if (!item) return false;

        const effectiveQty = item.type === 'boost' ? Math.max(1, Math.floor(qty)) : 1;
        const totalCost    = item.cost * effectiveQty;

        if (item.type === 'permanent' && this.purchased.has(item.id)) return false;

        if (item.currency === 'neurons') {
            if (!this._economy.spend(totalCost)) return false;
        } else if (item.currency === 'tokens') {
            if (this._economy.prestigeTokens < totalCost) return false;
            this._economy.prestigeTokens -= totalCost;
        }

        if (item.type === 'boost') {
            this._boosts.addBoostN({
                id:       item.id,
                name:     item.name,
                icon:     item.icon,
                effect:   { type: item.boostType, value: item.boostValue },
                duration: item.duration * 1000,
            }, effectiveQty);
        } else if (item.type === 'permanent') {
            this.purchased.add(item.id);
            this._applyPermanent(item);
        }
        return true;
    }

    _applyPermanent(item) {
        switch (item.effect) {
            case 'offline_bonus': this._offlineBonus += item.effectValue; break;
            case 'crit_bonus':    this._critBonus    += item.effectValue; break;
            case 'xp_mult':       this._xpMult       *= item.effectValue; break;
            case 'global_bonus':
                this._globalBonus += item.effectValue;
                this._economy.setShopGlobalMult(1 + this._globalBonus + this._vipBonus);
                break;
            case 'token_bonus': this._tokenBonus += item.effectValue; break;
        }
    }

    _reapplyAll() {
        this._offlineBonus = 0;
        this._critBonus    = 0;
        this._xpMult       = 1;
        this._globalBonus  = 0;
        this._tokenBonus   = 0;
        SHOP_ITEMS.filter(x => x.type === 'permanent' && this.purchased.has(x.id))
            .forEach(item => this._applyPermanent(item));
        this._economy.setShopGlobalMult(1 + this._globalBonus + this._vipBonus);
    }

    applyVipBonus() {
        this._vipBonus = 0.1;
        this._economy.setShopGlobalMult(1 + this._globalBonus + this._vipBonus);
    }

    getOfflineBonus() { return this._offlineBonus; }
    getCritBonus()    { return this._critBonus;    }
    getXpMult()       { return this._xpMult;       }
    getTokenBonus()   { return this._tokenBonus;   }

    getState()  { return { purchased: [...this.purchased] }; }

    loadState(s) {
        if (!s) return;
        this.purchased = new Set(s.purchased || []);
        this._reapplyAll();
    }
}
