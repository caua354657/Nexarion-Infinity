class MissionManager {
    constructor(events) {
        this._events = events;
        // States
        this.claims = new Set(); // Missions completed AND claimed
        this.completed = new Set(); // Missions completed but maybe not claimed
        this.progress = {};

        // Trackers
        this._dailyClicksToday = 0;
        this._dailyEarnToday = 0;
        this._dailyUpgradesToday = 0;
        this._dailyCrits = 0;
        this._dailyGenBuy = 0;
        this._weeklyEarn = 0;
        this._weeklyClicks = 0;
        this._weeklyGenBuy = 0;
        this._weeklyUpgrades = 0;
        this._weeklyCrits = 0;
        this._sessionEarn = 0;
        this._eventsCollected = 0;
        this._maxComboClicks = 0;

        this._lastDayReset = this._today();
        this._lastWeekReset = this._currentWeek();

        this._cooldowns = {};

        // Timed missions
        this._timedActive = {}; // { id: startTime }

        // Performance caches (built lazily from static MISSIONS array)
        this._missionMap  = null; // Map<id, mission> for O(1) lookup
        this._chainCache  = null; // Map<chainId, sorted mission[]> for O(n) getActiveMissions
    }

    _getMission(id) {
        if (!this._missionMap) {
            this._missionMap = new Map();
            MISSIONS.forEach(m => this._missionMap.set(m.id, m));
        }
        return this._missionMap.get(id);
    }

    _getChainMissions(chainId) {
        if (!this._chainCache) {
            this._chainCache = new Map();
            MISSIONS.forEach(m => {
                if (!m.chain) return;
                if (!this._chainCache.has(m.chain)) this._chainCache.set(m.chain, []);
                this._chainCache.get(m.chain).push(m);
            });
            this._chainCache.forEach(arr => arr.sort((a, b) => a.order - b.order));
        }
        return this._chainCache.get(chainId) || [];
    }

    _today() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
    _currentWeek() {
        const d = new Date();
        const firstDay = new Date(d.getFullYear(), 0, 1);
        const pastDaysOfYear = (d - firstDay) / 86400000;
        return `${d.getFullYear()}-W${Math.ceil((pastDaysOfYear + firstDay.getDay() + 1) / 7)}`;
    }

    _checkResets() {
        const today = this._today();
        if (today !== this._lastDayReset) {
            this._dailyClicksToday = 0;
            this._dailyEarnToday = 0;
            this._dailyUpgradesToday = 0;
            this._dailyCrits = 0;
            this._dailyGenBuy = 0;
            this._lastDayReset = today;
            MISSIONS.filter(m => m.cooldown === 'daily').forEach(m => {
                this.completed.delete(m.id);
                this.claims.delete(m.id);
                this.progress[m.id] = {cur: 0, max: m.value, pct: 0};
            });
        }

        const week = this._currentWeek();
        if (week !== this._lastWeekReset) {
            this._weeklyEarn = 0;
            this._weeklyClicks = 0;
            this._weeklyGenBuy = 0;
            this._weeklyUpgrades = 0;
            this._weeklyCrits = 0;
            this._lastWeekReset = week;
            MISSIONS.filter(m => m.cooldown === 'weekly').forEach(m => {
                this.completed.delete(m.id);
                this.claims.delete(m.id);
                this.progress[m.id] = {cur: 0, max: m.value, pct: 0};
            });
        }
    }

    onClick() {
        this._dailyClicksToday++;
        this._weeklyClicks++;
        if (Object.keys(this._timedActive).length === 0) return;
        const now = Date.now();
        for (const id in this._timedActive) {
            const m = this._getMission(id);
            if (!m) continue;
            if (now - this._timedActive[id] < m.timeLimit * 1000) {
                if (!this.progress[id]) this.progress[id] = { cur: 0, max: m.value, pct: 0 };
                this.progress[id].cur++;
            }
        }
    }

    onCritClick() {
        this._dailyCrits++;
        this._weeklyCrits++;
    }

    onEarn(amount) {
        this._dailyEarnToday += amount;
        this._weeklyEarn += amount;
        this._sessionEarn += amount;
    }

    onBuyUpgrade() {
        this._dailyUpgradesToday++;
        this._weeklyUpgrades++;
    }

    onBuyGenerator() {
        this._dailyGenBuy++;
        this._weeklyGenBuy++;
    }

    onEventCollected() {
        this._eventsCollected++;
    }

    updateFromStats(stats, economy, upgradeManager, comboManager) {
        this._checkResets();

        // Track all-time max consecutive clicks in a combo chain
        const currentComboClicks = comboManager.getClicks ? comboManager.getClicks() : 0;
        if (currentComboClicks > this._maxComboClicks) {
            this._maxComboClicks = currentComboClicks;
        }

        let newlyCompleted = false;

        MISSIONS.forEach(m => {
            if (this.completed.has(m.id)) return;

            // Check custom cooldowns
            if (m.cooldown === 'custom' && this._cooldowns[m.id] && Date.now() < this._cooldowns[m.id]) return;

            let cur = 0;
            switch (m.type) {
                case 'clicks':         cur = stats.totalClicks; break;
                case 'gen':            cur = upgradeManager.generators[m.gen]?.count || 0; break;
                case 'upgrades':       cur = upgradeManager.purchasedUpgrades.size; break;
                case 'current':        cur = economy.neurons; break;
                case 'nps':            cur = economy.getEffectiveNPS(); break;
                case 'allTime':        cur = economy.totalNeurons; break;
                case 'daily_clicks':   cur = this._dailyClicksToday; break;
                case 'daily_earn':     cur = this._dailyEarnToday; break;
                case 'daily_upgrades': cur = this._dailyUpgradesToday; break;
                case 'daily_crits':    cur = this._dailyCrits; break;
                case 'daily_gen_buy':  cur = this._dailyGenBuy; break;
                case 'weekly_earn':    cur = this._weeklyEarn; break;
                case 'weekly_clicks':  cur = this._weeklyClicks; break;
                case 'weekly_gen_buy': cur = this._weeklyGenBuy; break;
                case 'weekly_upgrades':cur = this._weeklyUpgrades; break;
                case 'weekly_crits':   cur = this._weeklyCrits; break;
                case 'prestige':       cur = economy.totalPrestiges; break;
                case 'combo':          cur = comboManager.getMult(); break;
                case 'comboClicks':    cur = this._maxComboClicks; break;
                case 'total_gens':
                    cur = Object.values(upgradeManager.generators).reduce((sum, g) => sum + g.count, 0);
                    break;
                case 'earn_session':   cur = this._sessionEarn; break;
                case 'events_collected': cur = this._eventsCollected; break;
                case 'current_no_prestige':
                    if (economy.totalPrestiges === 0) cur = economy.neurons;
                    else cur = 0;
                    break;
                case 'timed_clicks':
                    if (!this._timedActive[m.id]) this._timedActive[m.id] = Date.now();
                    cur = this.progress[m.id]?.cur || 0;
                    if (Date.now() - this._timedActive[m.id] > m.timeLimit * 1000) {
                        this._timedActive[m.id] = Date.now();
                        cur = 0;
                    }
                    break;
            }

            this.progress[m.id] = { cur, max: m.value, pct: Math.min(1, cur / m.value) };

            if (cur >= m.value) {
                this.completed.add(m.id);
                newlyCompleted = true;
                this._events.emit('missionComplete', m);
            }
        });
        
        if (newlyCompleted && window.game && window.game.ui) {
            // Highlight missions tab
            const btn = document.querySelector('.sidebar-btn[data-panel="missions"]');
            if (btn) btn.style.boxShadow = '0 0 15px var(--cyan)';
        }
    }

    claimMission(id, silent = false) {
        if (!this.completed.has(id) || this.claims.has(id)) return false;
        
        const m = MISSIONS.find(x => x.id === id);
        if (!m) return false;
        
        this.claims.add(id);
        
        // Grant Rewards
        const g = window.game;
        if (m.reward) {
            if (m.reward.neurons) g.economy.addNeurons(m.reward.neurons);
            if (m.reward.neurons_pct) g.economy.addNeurons(Math.floor(g.economy.neurons * m.reward.neurons_pct));
            if (m.reward.xp) {
                const xpMult = (g.skills?.getXpMult?.() || 1) * (g.shop?.getXpMult?.() || 1);
                g.level.addXP(m.reward.xp * xpMult);
            }
            if (m.reward.tokens) {
                g.economy.prestigeTokens += m.reward.tokens;
                g.economy._updatePrestigeMult();
            }
        }
        
        this._events.emit('missionClaimed', m);
        
        // If repeatable with custom cooldown, set cooldown
        if (m.repeatable && m.cooldown === 'custom') {
            this._cooldowns[m.id] = Date.now() + (m.cooldownTime || 3600) * 1000;
            // Uncomplete it immediately so it can be tracked again after cooldown
            this.completed.delete(m.id);
            this.claims.delete(m.id);
            this.progress[m.id] = {cur: 0, max: m.value, pct: 0};
            if(m.type === 'earn_session') this._sessionEarn = 0;
        }
        
        if (!silent && g.ui && g.ui._activePanel === 'missions') g.ui._renderPanelContent('missions');
        
        return true;
    }

    claimAll(ids) {
        const g = window.game;
        let claimable = MISSIONS.filter(m => this.completed.has(m.id) && !this.claims.has(m.id));
        if (ids) claimable = claimable.filter(m => ids.includes(m.id));
        if (!claimable.length) return 0;

        let totalNeurons = 0, totalXp = 0, totalTokens = 0;
        const xpMult = (g.skills?.getXpMult?.() || 1) * (g.shop?.getXpMult?.() || 1);

        claimable.forEach(m => {
            this.claims.add(m.id);
            if (m.reward) {
                if (m.reward.neurons)     totalNeurons += m.reward.neurons;
                if (m.reward.neurons_pct) totalNeurons += Math.floor(g.economy.neurons * m.reward.neurons_pct);
                if (m.reward.xp)          totalXp     += m.reward.xp * xpMult;
                if (m.reward.tokens)      totalTokens += m.reward.tokens;
            }
            if (m.repeatable && m.cooldown === 'custom') {
                this._cooldowns[m.id] = Date.now() + (m.cooldownTime || 3600) * 1000;
                this.completed.delete(m.id);
                this.claims.delete(m.id);
                this.progress[m.id] = { cur: 0, max: m.value, pct: 0 };
                if (m.type === 'earn_session') this._sessionEarn = 0;
            }
        });

        if (totalNeurons > 0) g.economy.addNeurons(totalNeurons);
        if (totalXp > 0)      g.level.addXP(totalXp);
        if (totalTokens > 0)  { g.economy.prestigeTokens += totalTokens; g.economy._updatePrestigeMult(); }

        this._events.emit('missionsClaimed', { count: claimable.length });
        return claimable.length;
    }

    getActiveTutorial() {
        const chain = MISSIONS.filter(m => m.chain === 'story').sort((a, b) => a.order - b.order);
        return chain.find(m => !this.claims.has(m.id)) || null; // Return until claimed so tutorial stays until claim
    }

    getActiveMissions() {
        const now = Date.now();
        return MISSIONS.filter(m => {
            if (this.claims.has(m.id)) return false;
            if (m.cooldown === 'custom' && this._cooldowns[m.id] && now < this._cooldowns[m.id]) return false;

            if (m.chain) {
                // Use pre-sorted chain cache instead of re-filtering MISSIONS each time
                const chainMissions = this._getChainMissions(m.chain);
                const firstUncompleted = chainMissions.find(x => !this.completed.has(x.id));
                const firstUnclaimed   = chainMissions.find(x => !this.claims.has(x.id));
                if (m.id !== firstUnclaimed?.id && m.id !== firstUncompleted?.id && !this.completed.has(m.id)) {
                    return false;
                }
            }

            return true;
        }).slice(0, 30);
    }

    getState() {
        return {
            completed: [...this.completed],
            claims: [...this.claims],
            progress: this.progress,
            dailyClicksToday: this._dailyClicksToday,
            dailyEarnToday: this._dailyEarnToday,
            dailyUpgradesToday: this._dailyUpgradesToday,
            dailyCrits: this._dailyCrits,
            dailyGenBuy: this._dailyGenBuy,
            weeklyEarn: this._weeklyEarn,
            weeklyClicks: this._weeklyClicks,
            weeklyGenBuy: this._weeklyGenBuy,
            weeklyUpgrades: this._weeklyUpgrades,
            weeklyCrits: this._weeklyCrits,
            eventsCollected: this._eventsCollected,
            maxComboClicks: this._maxComboClicks,
            lastDayReset: this._lastDayReset,
            lastWeekReset: this._lastWeekReset,
            cooldowns: this._cooldowns
        };
    }

    loadState(s) {
        if (!s) return;
        this.completed = new Set(s.completed || []);
        this.claims = new Set(s.claims || []);

        if (s.completed && !s.claims) {
            this.claims = new Set(s.completed);
        }

        this.progress = s.progress || {};
        this._dailyClicksToday = s.dailyClicksToday || 0;
        this._dailyEarnToday = s.dailyEarnToday || 0;
        this._dailyUpgradesToday = s.dailyUpgradesToday || 0;
        this._dailyCrits = s.dailyCrits || 0;
        this._dailyGenBuy = s.dailyGenBuy || 0;
        this._weeklyEarn = s.weeklyEarn || 0;
        this._weeklyClicks = s.weeklyClicks || 0;
        this._weeklyGenBuy = s.weeklyGenBuy || 0;
        this._weeklyUpgrades = s.weeklyUpgrades || 0;
        this._weeklyCrits = s.weeklyCrits || 0;
        this._eventsCollected = s.eventsCollected || 0;
        this._maxComboClicks = s.maxComboClicks || 0;
        this._lastDayReset = s.lastDayReset || this._today();
        this._lastWeekReset = s.lastWeekReset || this._currentWeek();
        this._cooldowns = s.cooldowns || {};
    }
}
