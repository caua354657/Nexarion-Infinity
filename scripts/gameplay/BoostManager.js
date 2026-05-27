class BoostManager {
    constructor(economy, events) {
        this._economy = economy;
        this._events  = events;
        this._boosts  = [];
    }

    /**
     * Add or STACK a boost.
     * Same boost id → extends the existing timer instead of adding a duplicate.
     * e.g. 30 min active + buy another 30 min = 60 min total.
     */
    addBoost(boost) {
        if (!boost || boost.duration <= 0) return;
        const now = Date.now();

        const existing = this._boosts.find(b => b.id === boost.id);
        if (existing) {
            existing.expiresAt    += boost.duration;
            // Recompute totalDuration from current moment so the progress bar stays accurate
            existing.totalDuration = existing.expiresAt - now;
            this._recompute();
            this._events.emit('boostAdded', existing);
            return;
        }

        const entry = {
            ...boost,
            expiresAt:     now + boost.duration,
            totalDuration: boost.duration,
        };
        this._boosts.push(entry);
        this._recompute();
        this._events.emit('boostAdded', entry);
    }

    /** Buy N units of the same boost (multiplies duration before stacking). */
    addBoostN(boost, qty) {
        if (!qty || qty < 1) qty = 1;
        this.addBoost({ ...boost, duration: boost.duration * qty });
    }

    update() {
        const now    = Date.now();
        const before = this._boosts.length;
        this._boosts = this._boosts.filter(b => b.expiresAt > now);
        if (this._boosts.length !== before) this._recompute();
    }

    _recompute() {
        let clickMult = 1, globalMult = 1;
        this._boosts.forEach(b => {
            if      (b.effect.type === 'click_mult')      clickMult  *= b.effect.value;
            else if (b.effect.type === 'global_mult')     globalMult *= b.effect.value;
            else if (b.effect.type === 'click_duplicate') clickMult  *= b.effect.value;
        });
        this._economy.setTempClickMult(clickMult);
        this._economy.setTempGlobalMult(globalMult);
    }

    getActiveBoosts() {
        const now = Date.now();
        return this._boosts.map(b => ({
            ...b,
            remaining: Math.max(0, b.expiresAt - now),
        }));
    }

    getState()  { return { boosts: this._boosts.map(b => ({ ...b })) }; }

    loadState(s) {
        if (!s?.boosts) return;
        const now = Date.now();
        this._boosts = s.boosts.filter(b => b.expiresAt > now);
        // Back-compat: old saves may not have totalDuration
        this._boosts.forEach(b => { if (!b.totalDuration) b.totalDuration = b.duration; });
        this._recompute();
    }
}
