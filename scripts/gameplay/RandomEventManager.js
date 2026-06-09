class RandomEventManager {
    constructor(boostManager, economy, events) {
        this._boost = boostManager;
        this._economy = economy;
        this._events = events;
        this._nextEvent = Date.now() + this._randomInterval();
        this._activeEvent = null;
        this._clickableCollected = false;
    }

    _randomInterval() {
        return EVENT_MIN_INTERVAL + Math.random() * (EVENT_MAX_INTERVAL - EVENT_MIN_INTERVAL);
    }

    _pickEvent() {
        const total = RANDOM_EVENTS.reduce((s, e) => s + e.weight, 0);
        let r = Math.random() * total;
        for (const e of RANDOM_EVENTS) { r -= e.weight; if (r <= 0) return e; }
        return RANDOM_EVENTS[0];
    }

    update() {
        const now = Date.now();
        if (now >= this._nextEvent) {
            const evt = this._pickEvent();
            this._nextEvent = now + this._randomInterval();
            this._triggerEvent(evt);
        }

        if (this._activeEvent && this._activeEvent.expiresAt && now > this._activeEvent.expiresAt) {
            this._activeEvent = null;
            this._events.emit('eventExpired', {});
        }
    }

    _triggerEvent(evt) {
        this._activeEvent = { ...evt, startedAt: Date.now(), expiresAt: evt.duration > 0 ? Date.now() + evt.duration : null };
        this._clickableCollected = false;

        if (!evt.clickable) {
            if (evt.effect.type === 'instant_neurons') {
                const amount = this._economy.getEffectiveNPS() * evt.effect.value;
                this._economy.addNeurons(amount);
            } else if (evt.effect.type === 'free_token') {
                // tratado no clique
            } else {
                this._boost.addBoost({ id: evt.id, name: evt.name, name_en: evt.name_en, name_es: evt.name_es, icon: evt.icon, effect: evt.effect, duration: evt.duration });
            }
        }

        this._events.emit('randomEvent', this._activeEvent);
    }

    collectClickableEvent() {
        if (!this._activeEvent?.clickable || this._clickableCollected) return false;
        this._clickableCollected = true;
        const evt = this._activeEvent;
        if (evt.effect.type === 'free_token') {
            this._economy.prestigeTokens += evt.effect.value;
            this._events.emit('notification', { type: 'gold', msg: `+${evt.effect.value} Token Neural coletado!` });
        }
        this._activeEvent = null;
        return true;
    }

    getActive() { return this._activeEvent; }

    getState() { return { nextEvent: this._nextEvent }; }
    loadState(s) { if (s?.nextEvent) this._nextEvent = Math.max(Date.now() + 10000, s.nextEvent); }
}
