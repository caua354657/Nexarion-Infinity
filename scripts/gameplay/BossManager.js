class BossManager {
    constructor(game) {
        this._game         = game;
        this.boss          = null;
        this.myDamage      = 0;
        this.myRank        = null;
        this.top           = [];
        this.cooldown      = 0;        // seconds until next boss

        this._dmgBuffer    = 0;
        this._passiveAcc   = 0;
        this._lastFlush    = 0;
        this._flushDelay   = 400;
        this._pollTimer    = null;
        this._notifTimer   = null;

        this._lastBossId   = null;     // null = first poll (no notification on load)
        this._worldOpen    = false;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    startPolling(ms = 5000) {
        this.stopPolling();
        this.fetchState();
        this._pollTimer = setInterval(() => this.fetchState(), ms);
    }

    stopPolling() {
        if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
    }

    openBossWorld() {
        this._worldOpen = true;
        this.startPolling(3000);        // faster updates while in world
        this._game.events.emit('bossWorldOpen', { boss: this.boss });
    }

    closeBossWorld() {
        this._worldOpen = false;
        this.startPolling(5000);        // back to normal
        if (this._dmgBuffer + this._passiveAcc > 0) this._flush();
        this._game.events.emit('bossWorldClose');
    }

    // ── Game tick ─────────────────────────────────────────────────────────────

    tick(dt) {
        if (!this.boss || this.boss.status !== 'active') return;
        this._passiveAcc += this._game.economy.getEffectiveNPS() * 0.0005 * dt;

        const now = Date.now();
        if (now - this._lastFlush >= this._flushDelay && (this._dmgBuffer + this._passiveAcc) > 0) {
            this._flush();
        }
    }

    attackClick() {
        if (!this.boss || this.boss.status !== 'active') return;
        const dmg = this._game.economy.getClickValue() * this._game.combo.getMult();
        this._dmgBuffer += dmg;
        if (Date.now() - this._lastFlush >= this._flushDelay) this._flush();
    }

    // ── Server fetch ──────────────────────────────────────────────────────────

    async fetchState() {
        try {
            const res  = await fetch('api/boss.php?action=state');
            const data = await res.json();
            if (!data.ok) return;

            const prevId     = this._lastBossId;
            this.boss        = data.boss;
            this.myDamage    = data.myDamage  || 0;
            this.myRank      = data.myRank    || null;
            this.top         = data.top       || [];
            this.cooldown    = data.cooldown  || 0;

            if (data.boss) {
                if (prevId === null) {
                    // First load — record without notification
                    this._lastBossId = data.boss.id;
                } else if (data.boss.id !== prevId) {
                    // New boss just spawned!
                    this._lastBossId = data.boss.id;
                    this._game.events.emit('bossSpawned', { boss: data.boss });
                }
            } else {
                if (prevId === null) this._lastBossId = -1;
            }

            // Server-granted rewards on defeat
            if (data.rewards && (data.rewards.neurons > 0 || data.rewards.diamonds > 0)) {
                this._applyRewards(data.rewards);
            }

            this._game.events.emit('bossStateUpdate', { boss: this.boss });
        } catch { /* offline */ }
    }

    // ── Damage flush ──────────────────────────────────────────────────────────

    async _flush() {
        const total = this._dmgBuffer + Math.floor(this._passiveAcc);
        if (total <= 0) return;

        this._dmgBuffer  = 0;
        this._passiveAcc = 0;
        this._lastFlush  = Date.now();

        if (!this._game.account.isLoggedIn()) {
            // Offline preview — only update local HP
            if (this.boss) this.boss.currentHp = Math.max(0, (this.boss.currentHp || 0) - total);
            return;
        }

        try {
            const res  = await fetch('api/boss.php', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ action: 'attack', damage: total }),
            });
            const data = await res.json();
            if (!data.ok) return;

            if (this.boss) {
                this.boss.currentHp = data.currentHp;
                this.boss.pct       = data.pct;
                this.myDamage       = data.myDamage;
            }
            if (data.defeated && this.boss?.status === 'active') {
                this.boss.status = 'defeated';
                this._game.events.emit('bossDefeated', { boss: this.boss });
                this._game.audio.achievement();
            }
            this._game.events.emit('bossHit', { hp: data.currentHp, pct: data.pct, dmg: total });
        } catch { /* network drop — damage lost */ }
    }

    // ── Rewards ───────────────────────────────────────────────────────────────

    _applyRewards(rewards) {
        const g = this._game;
        if (rewards.neurons  > 0) g.economy.addNeurons(rewards.neurons);
        if (rewards.diamonds > 0) {
            g.economy.prestigeTokens += rewards.diamonds;
            g.economy._updatePrestigeMult?.();
        }
        const def  = this.boss ? (BOSS_TYPES[this.boss.type] || {}) : {};
        const name = def.deathMsg || 'Boss derrotado!';
        g.notify(`${name} +${rewards.diamonds}💎 +${formatNum(rewards.neurons)}⚡`, 'gold');
        g.events.emit('bossRewardClaimed', rewards);
    }
}
