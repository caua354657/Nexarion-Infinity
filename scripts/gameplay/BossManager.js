class BossManager {
    constructor(game) {
        this._game           = game;
        this.boss            = null;
        this.myDamage        = 0; // session damage (since last openBossWorld)
        this.myRank          = null;
        this.cooldown        = 0;
        this.globalBossLevel = 1;
        this.lifetimeDamage  = 0;
        this.bossKills       = 0;

        this.userBossLevel       = 1;
        this.bossPower           = 1;   // base click damage; increases per purchase
        this._bossUpgradeCounts  = new Map();

        this._dmgBuffer      = 0;
        this._lastFlush      = 0;
        this._flushDelay     = 400;
        this._pollTimer      = null;
        this._fetching       = false; // in-flight guard for fetchState()
        this._saveTimer      = null;  // debounce handle for upgrade saves
        this._stateFetchedAt = Date.now();
        this._expiryByLevel  = new Map(); // nivel → absolute client expiry (ms)

        this._lastBossLevel  = null;    // null = first poll (no notification on load)
        this._worldOpen      = false;
        this._sessionRewards = { neurons: 0, diamonds: 0, kills: 0 };
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
        this.myDamage = 0;
        this._sessionRewards = { neurons: 0, diamonds: 0, kills: 0 };
        // Ensure _clientExpiry is registered before world renders
        if (this.boss && this.boss.level != null) {
            const lvlKey = this.boss.level;
            if (!this._expiryByLevel.has(lvlKey)) {
                this._expiryByLevel.set(lvlKey, Date.now() + (this.boss.remaining ?? 300) * 1000);
            }
            this.boss._clientExpiry = this._expiryByLevel.get(lvlKey);
        }
        this.startPolling(3000);
        this._game.events.emit('bossWorldOpen', { boss: this.boss });
    }

    closeBossWorld() {
        this._worldOpen = false;
        this.startPolling(5000);
        if (this._dmgBuffer > 0) this._flush();
        this._game.events.emit('bossWorldClose');
    }

    // ── Game tick ─────────────────────────────────────────────────────────────

    tick(dt) {
        if (!this.boss || this.boss.status !== 'active') return;
        const now = Date.now();
        if (now - this._lastFlush >= this._flushDelay && this._dmgBuffer > 0) {
            this._flush();
        }
    }

    attackClick() {
        if (!this.boss || this.boss.status !== 'active') return;
        const dmg = this.bossPower * (this._game.shop?.getBossDamageMult?.() || 1);
        this._dmgBuffer += dmg;
        if (Date.now() - this._lastFlush >= this._flushDelay) this._flush();
    }

    // ── Server fetch (individual boss) ────────────────────────────────────────

    async fetchState() {
        if (this._fetching) return; // discard concurrent calls
        this._fetching = true;
        try {
            const res  = await fetch('api/boss.php?action=state');
            const data = await res.json();
            if (!data.ok) { this._fetching = false; return; }

            const prevLevel       = this._lastBossLevel;
            this._stateFetchedAt  = Date.now();
            this.boss            = data.boss;
            // myDamage is session-local — don't reset from server
            this.myRank          = data.myRank         || null;
            this.cooldown        = data.cooldown        || 0;
            this.globalBossLevel = data.globalBossLevel || (data.boss?.level ?? 1);
            this.lifetimeDamage  = data.lifetimeDamage  || 0;
            this.bossKills       = data.bossKills       || 0;
            this.userBossLevel   = data.userBossLevel   || 1;

            // Normalize boss field names for UIManager backward-compat
            if (this.boss) {
                this.boss.level     = this.boss.nivel      ?? this.boss.level     ?? 1;
                this.boss.type      = this.boss.type       ?? this.boss.tipo;
                this.boss.rarity    = this.boss.rarity     ?? this.boss.raridade;
                this.boss.maxHp     = this.boss.maxHp      ?? this.boss.hpMax;
                this.boss.currentHp = this.boss.currentHp  ?? this.boss.hpAtual;
                this.boss.remaining = this.boss.remaining   ?? 300;
                this.boss.status    = this.boss.status      ?? 'active';
                this.boss.id        = this.boss.id          ?? this.userBossLevel;
                // Only calculate _clientExpiry once per boss level — never reset on re-poll
                const lvlKey = this.boss.level;
                if (!this._expiryByLevel.has(lvlKey)) {
                    this._expiryByLevel.set(lvlKey, Date.now() + this.boss.remaining * 1000);
                }
                this.boss._clientExpiry = this._expiryByLevel.get(lvlKey);
            }

            if (this.boss) {
                if (prevLevel === null) {
                    // First load
                    this._lastBossLevel = this.boss.level;
                } else if (this.boss.level !== prevLevel || prevLevel === -1) {
                    // New level OR boss reappeared after cooldown — fresh timer
                    this._expiryByLevel.delete(this.boss.level); // force recalculate for this level
                    this._lastBossLevel = this.boss.level;
                    if (prevLevel !== null) {
                        this._game.events.emit('bossSpawned', { boss: this.boss });
                    }
                }
            } else {
                // Entering cooldown — wipe all stored expiries so next boss starts fresh
                this._expiryByLevel.clear();
                this._lastBossLevel = -1;
            }

            if (data.rewards && (data.rewards.neurons > 0 || data.rewards.diamonds > 0)) {
                this._applyRewards(data.rewards);
            }

            this._game.events.emit('bossStateUpdate', { boss: this.boss });
        } catch { /* offline */ }
        finally { this._fetching = false; }
    }

    // ── Damage flush ──────────────────────────────────────────────────────────

    async _flush() {
        const total = this._dmgBuffer;
        if (total <= 0) return;

        this._dmgBuffer = 0;
        this._lastFlush = Date.now();

        if (!this._game.account.isLoggedIn()) {
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
            }
            this.myDamage = (this.myDamage || 0) + total;

            if (data.lifetimeDamage !== undefined) this.lifetimeDamage = data.lifetimeDamage;
            if (data.bossKills !== undefined) this.bossKills = data.bossKills;

            if (data.defeated) {
                this.userBossLevel = data.userBossLevel || (this.userBossLevel + 1);
                if (this.boss) this.boss.status = 'defeated';
                this._game.events.emit('bossDefeated', { boss: this.boss });
                this._game.audio.achievement?.();

                // Track session kill count
                this._sessionRewards.kills++;

                // Apply defeat rewards
                if (data.rewards) this._applyRewards(data.rewards);

                // Switch to new boss after a short delay
                if (data.newBoss) {
                    setTimeout(() => {
                        const rem = data.newBoss.remaining ?? 300;
                        // New level — register fresh expiry
                        this._expiryByLevel.set(this.userBossLevel, Date.now() + rem * 1000);
                        this.boss = {
                            ...data.newBoss,
                            level:          data.newBoss.nivel    ?? data.newBoss.level ?? this.userBossLevel,
                            type:           data.newBoss.type     ?? data.newBoss.tipo,
                            rarity:         data.newBoss.rarity   ?? data.newBoss.raridade,
                            maxHp:          data.newBoss.maxHp    ?? data.newBoss.hpMax,
                            currentHp:      data.newBoss.currentHp ?? data.newBoss.hpAtual,
                            remaining:      rem,
                            status:         'active',
                            id:             this.userBossLevel,
                            _clientExpiry:  Date.now() + rem * 1000,
                        };
                        this.myDamage = 0; // reset session damage for new boss
                        this._stateFetchedAt = Date.now();
                        this._game.events.emit('bossStateUpdate', { boss: this.boss });
                        this._game.events.emit('bossSpawned', { boss: this.boss });
                    }, 2000);
                }
            }

            this._game.events.emit('bossHit', { hp: data.currentHp, pct: data.pct, dmg: total });
        } catch { /* network drop */ }
    }

    // ── Panel attack ──────────────────────────────────────────────────────────

    attackPanel() {
        if (!this.boss || this.boss.status !== 'active') return;
        if (!this._game.account.isLoggedIn()) return;
        this._dmgBuffer += this.bossPower;
        this._flush();
    }

    // ── Boss power upgrades (use canonical BOSS_UPGRADES_DATA from bosses.js) ─

    get upgradeDefs() {
        return (typeof BOSS_UPGRADES_DATA !== 'undefined') ? BOSS_UPGRADES_DATA : [];
    }

    buyBossUpgrade(id) { return this.buyBossUpgradeN(id, 1) > 0; }

    buyBossUpgradeN(id, n) {
        const upg = this.upgradeDefs.find(u => u.id === id);
        if (!upg || n <= 0) return 0;
        const eco       = this._game.economy;
        const maxAfford = Math.max(0, Math.floor(eco.prestigeTokens / upg.cost));
        const actual    = Math.min(n, maxAfford);
        if (actual <= 0) return 0;
        const totalCost = upg.cost * actual;
        if (eco.prestigeTokens < totalCost) return 0;
        eco.prestigeTokens -= totalCost;
        eco._updatePrestigeMult?.();
        this._bossUpgradeCounts.set(id, (this._bossUpgradeCounts.get(id) || 0) + actual);
        this.bossPower += (upg.add || 0) * actual;
        this._game.events.emit('bossUpgradePurchased', { id, count: actual, bossPower: this.bossPower });
        // Debounce: coalesce rapid purchases into a single save 1.5s after the last one
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this._game.save(), 1500);
        return actual;
    }

    getUpgradeCount(id) { return this._bossUpgradeCounts.get(id) || 0; }

    // ── Persistence ───────────────────────────────────────────────────────────

    getState() {
        return {
            bossPower:         this.bossPower,
            bossUpgradeCounts: Object.fromEntries(this._bossUpgradeCounts),
            userBossLevel:     this.userBossLevel,
        };
    }

    loadState(s) {
        if (!s) return;
        const counts = s.bossUpgradeCounts || {};
        if (s.purchasedBossUpgrades && !s.bossUpgradeCounts) {
            (s.purchasedBossUpgrades || []).forEach(id => {
                counts[id] = (counts[id] || 0) + 1;
            });
        }
        this._bossUpgradeCounts = new Map(Object.entries(counts).map(([k, v]) => [k, Number(v)]));
        this.bossPower = 1;
        this._bossUpgradeCounts.forEach((count, id) => {
            const upg = this.upgradeDefs.find(u => u.id === id);
            if (upg) this.bossPower += (upg.add || 0) * count;
        });
        if (s.userBossLevel) this.userBossLevel = s.userBossLevel;
    }

    _applyRewards(rewards) {
        const g = this._game;
        if (rewards.neurons  > 0) g.economy.addNeurons(rewards.neurons);
        if (rewards.diamonds > 0) {
            g.economy.prestigeTokens += rewards.diamonds;
            g.economy._updatePrestigeMult?.();
        }
        this._sessionRewards.neurons  += rewards.neurons  || 0;
        this._sessionRewards.diamonds += rewards.diamonds || 0;
        g.events.emit('bossRewardClaimed', rewards);
    }
}
