class GameManager {
    constructor() {
        this.events = new EventManager();
        this.saveManager = new SaveManager();
        this.audio = new AudioManager();
        this.economy = new EconomyManager();
        this.upgradeManager = new UpgradeManager();
        this.achievements = new AchievementManager(this.events);
        this.level = new LevelManager(this.events);
        this.combo = new ComboManager(this.economy, this.events);
        this.boosts = new BoostManager(this.economy, this.events);
        this.missions = new MissionManager(this.events);
        this.shop = new ShopManager(this.economy, this.boosts);
        this.skills = new SkillManager(this.economy, this.upgradeManager);
        this.account = new AccountManager();
        this.randomEvents = new RandomEventManager(this.boosts, this.economy, this.events);
        this.boss = new BossManager(this);
        this.ui = new UIManager(this);
        this.notifications = new NotificationManager(this.events);
        this.tutorial = new TutorialManager(this.events, this.missions);

        this.stats = { totalClicks: 0, critClicks: 0, level: 1, playTime: 0 };

        this._bgCanvas   = null;
        this._fgCanvas   = null;
        this._auraCanvas = null;
        this._bg         = null;
        this._particles  = null;
        this._aura       = null;
        this._lastTime       = 0;
        this._lastClickTime  = 0;
        this._autoSaveTimer  = 0;
        this._tickAccum      = 0;
        this._running        = false;
        this._wasPrestigeReady = false;
        this._noSave     = false;
    }

    init() {
        this._bgCanvas   = document.getElementById('bg-canvas');
        this._fgCanvas   = document.getElementById('fg-canvas');
        this._auraCanvas = document.getElementById('prestige-aura-canvas');
        this._bg         = new NeuralBackground(this._bgCanvas);
        this._particles  = new ParticleSystem(this._fgCanvas);
        this._aura       = new PrestigeAura(this._auraCanvas);
        this._resizeFG();
        window.addEventListener('resize', () => this._resizeFG());

        this._bindEvents();
        this.ui.init();
        this.tutorial.init();

        const saved = this.saveManager.load();
        if (saved) {
            this._loadState(saved);
            this._calcOffline(saved.savedAt);
        }

        if (this.account.isVip()) this.shop.applyVipBonus();
        if (this.account.hasDoubleNeuron()) this.economy.setPremiumMult(2);
        const activeSkin = this.account.getActiveSkin();
        if (activeSkin) this._applyActiveSkin(activeSkin);

        window.addEventListener('beforeunload', () => { if (!this._noSave) this.save(); });

        this._running = true;
        this.audio.startAmbient();
        requestAnimationFrame(t => this._loop(t));
    }

    _resizeFG() {
        if (!this._fgCanvas) return;
        this._fgCanvas.width = window.innerWidth;
        this._fgCanvas.height = window.innerHeight;
    }

    _bindEvents() {
        this.events.on('levelUp', data => {
            this.stats.level = this.level.level;
            this.audio.levelUp();
            this.skills.addSkillPoint(1);
        });
        this.events.on('achievement', () => this.audio.achievement());
        this.events.on('missionComplete', () => this.audio.notification());
        this.events.on('missionClaimed',  () => this.audio.upgrade());
        this.events.on('missionsClaimed', () => this.audio.upgrade());
        this.events.on('comboUp', () => { if (this.combo.getLevel() >= 2) this.audio.notification(); });
        this.events.on('randomEvent',   () => this.audio.event());
        this.events.on('boostAdded',    () => {});
        this.events.on('bossSpawned',   () => this.audio.levelUp?.());
        this.events.on('bossDefeated',  () => this.audio.achievement());
        this.events.on('bossHit',       () => {});
    }

    _loop(timestamp) {
        if (!this._running) return;
        const dt = Math.min((timestamp - this._lastTime) / 1000, 0.1);
        this._lastTime = timestamp;
        this.stats.playTime += dt;

        this._update(dt);
        this._draw();
        requestAnimationFrame(t => this._loop(t));
    }

    _update(dt) {
        const tickDt = 1 / Config.TICK_RATE;
        this._tickAccum += dt;
        while (this._tickAccum >= tickDt) {
            this._tick(tickDt);
            this._tickAccum -= tickDt;
        }

        this._bg.update();
        this._particles.update();
        this.boosts.update();
        this.randomEvents.update();
        this.boss.tick(dt);
        this.ui.update(dt);

        this._autoSaveTimer += dt;
        if (this._autoSaveTimer >= Config.AUTOSAVE_INTERVAL / 1000) {
            this._autoSaveTimer = 0;
            this.save();
        }
    }

    _tick(dt) {
        const nps = this.upgradeManager.getNPS();
        this.economy.neuronsPerSec = nps;
        const earned = this.economy.getEffectiveNPS() * dt;
        if (earned > 0) {
            this.economy.addNeurons(earned);
            const xpMult = this.skills.getXpMult() * this.shop.getXpMult();
            this.level.addXP(this.level.xpFromNeurons(earned) * xpMult);
            this.missions.onEarn(earned);
        }
        this.missions.updateFromStats(this.stats, this.economy, this.upgradeManager, this.combo);
        this.achievements.check(this.stats, this.economy, this.upgradeManager, this.combo.getLevel(), this.missions);

        const prestigeProgress = Math.min(1, this.economy.totalNeurons / this.economy.getPrestigeCost());
        this._wasPrestigeReady = prestigeProgress >= 1;
    }

    _draw() {
        this._bg.draw();
        const ctx = this._fgCanvas.getContext('2d');
        ctx.clearRect(0, 0, this._fgCanvas.width, this._fgCanvas.height);
        this._particles.draw();
    }

    handleClick(x, y) {
        const now = Date.now();
        if (now - this._lastClickTime < Config.CLICK_COOLDOWN_MIN) return;
        this._lastClickTime = now;

        this.stats.totalClicks++;
        this.missions.onClick();
        this.combo.onClick();

        const critChance = Config.CRITICAL_CHANCE + this.skills.getCritBonus() + this.shop.getCritBonus();
        const isCrit = Math.random() < critChance;
        if (isCrit) {
            this.stats.critClicks++;
            this.missions.onCritClick();
        }

        const comboMult = this.combo.getMult();
        const critMult = isCrit ? Config.CRITICAL_MULT : 1;
        const value = Math.ceil(this.economy.getClickValue() * comboMult * critMult);

        this.economy.addNeurons(value);
        const xpMult = this.skills.getXpMult() * this.shop.getXpMult();
        this.level.addXP((this.level.xpFromNeurons(value) + 1) * xpMult);
        this.missions.onEarn(value);

        if (isCrit) {
            this._particles.spawnRing(x, y, Config.COLORS.gold);
            this.audio.critClick();
            if (this.stats.critClicks >= 100) {
                this.achievements.unlockSecret('ach_sec1', this.economy);
            }
        } else {
            this.audio.click();
        }
        this._particles.spawnClick(x, y, value, isCrit);

        this._animateClickBtn(isCrit);
        this.achievements.check(this.stats, this.economy, this.upgradeManager, this.combo.getLevel(), this.missions);
    }

    _animateClickBtn(isCrit) {
        const btn = document.getElementById('click-btn');
        if (!btn) return;
        btn.classList.remove('click-anim', 'crit-anim');
        void btn.offsetWidth;
        btn.classList.add(isCrit ? 'crit-anim' : 'click-anim');

        const orb = document.getElementById('prestige-char');
        if (orb && orb.dataset.stage !== 'hidden') {
            orb.classList.remove('click-sync');
            void orb.offsetWidth;
            orb.classList.add('click-sync');
            orb.addEventListener('animationend', () => orb.classList.remove('click-sync'), { once: true });
        }
    }

    buyGenerator(id) {
        const um = this.upgradeManager;
        const rawQty = this.ui._genBuyQty || 1;
        const n = rawQty === 'max'
            ? um.calcMaxBuy(id, this.economy.neurons)
            : rawQty;
        const bought = um.buyGeneratorN(id, n, this.economy);
        if (bought > 0) {
            this.audio.buy();
            for (let i = 0; i < bought; i++) this.missions.onBuyGenerator();
            this.economy.neuronsPerSec = um.getNPS();
            this.achievements.check(this.stats, this.economy, um, this.combo.getLevel(), this.missions);
        }
    }

    upgradeSkill(skillId) {
        if (this.skills.upgrade(skillId)) {
            this.audio.upgrade?.();
            if (this.ui._activePanel === 'skills') this.ui._renderPanelContent('skills');
        }
    }

    buyDoubleNeuron() {
        if (this.account.hasDoubleNeuron()) return;
        if (!this.account.isLoggedIn()) {
            this.notify('Faça login para comprar!', 'error');
            return;
        }
        this.account.setDoubleNeuron();
        this.economy.setPremiumMult(2);
        this.notify('⚡ 2× Neurônio ativado! Ganhos dobrados para sempre.', 'levelup');
        this.audio.levelUp?.();
        if (this.ui._activePanel === 'shop') this.ui._renderPanelContent('shop');
    }

    buySkin(id) {
        if (this.account.hasSkin(id)) return;
        if (!this.account.isLoggedIn()) {
            this.notify('Faça login para comprar skins!', 'error');
            return;
        }
        const skin = (typeof PREMIUM_SKINS !== 'undefined') ? PREMIUM_SKINS.find(s => s.id === id) : null;
        if (!skin) return;
        this.account.buySkin(id);
        this.notify(`🎨 ${skin.name} desbloqueada!`, 'success');
        this.audio.upgrade?.();
        if (this.ui._activePanel === 'shop') this.ui._renderPanelContent('shop');
    }

    equipSkin(id) {
        if (!this.account.hasSkin(id)) return;
        this.account.setActiveSkin(id);
        this._applyActiveSkin(id);
        const skin = (typeof PREMIUM_SKINS !== 'undefined') ? PREMIUM_SKINS.find(s => s.id === id) : null;
        this.notify(`🎨 Skin "${skin?.name}" equipada!`, 'info');
        if (this.ui._activePanel === 'shop') this.ui._renderPanelContent('shop');
    }

    resetSkin() {
        this.account.setActiveSkin(null);
        this._applyActiveSkin(null);
        this.notify('🧠 Tema padrão ativado!', 'info');
        if (this.ui._activePanel === 'shop') this.ui._renderPanelContent('shop');
    }

    _applyActiveSkin(skinId) {
        const skin = (typeof PREMIUM_SKINS !== 'undefined') ? PREMIUM_SKINS.find(s => s.id === skinId) : null;

        if (!skin) {
            document.body.removeAttribute('data-skin');
            const orb = document.querySelector('.orb-core');
            if (orb) orb.textContent = '🧠';
            return;
        }

        const orb = document.querySelector('.orb-core');
        if (orb) orb.textContent = skin.icon;
        document.body.setAttribute('data-skin', skin.theme);

        // Reinitialise background neural network with new skin palette
        if (this._bg) this._bg.reinit();
    }

    buyVip() {
        if (this.account.isVip()) return;
        if (!this.account.isLoggedIn()) {
            this.notify('Faça login para adquirir o VIP!', 'error');
            return;
        }
        this.account.setVip();
        this.shop.applyVipBonus();
        this.notify('👑 VIP Permanente ativado! +10% renda global.', 'levelup');
        this.audio.levelUp?.();
        if (this.ui._activePanel === 'shop') this.ui._renderPanelContent('shop');
        if (this.ui._activePanel === 'profile') this.ui._renderPanelContent('profile');
    }

    buyShopItem(id, qty = 1) {
        if (this.shop.buy(id, qty)) {
            this.audio.upgrade?.();
            this.notify(`Item comprado${qty > 1 ? ' ×' + qty : ''}!`, 'success');
            if (this.ui._activePanel === 'shop') this.ui._renderPanelContent('shop');
        } else {
            this.notify('Neurônios insuficientes!', 'error');
        }
    }

    buyDiamondPack(id) {
        const packs = (typeof DIAMOND_PACKS !== 'undefined') ? DIAMOND_PACKS : [];
        const pack  = packs.find(p => p.id === id);
        if (!pack) return;
        if (!this.account.isLoggedIn()) {
            this.notify('Faça login para comprar diamantes!', 'error');
            return;
        }

        // ── Credit tokens directly into the economy (saved in game save) ─
        this.economy.addTokens(pack.diamonds);
        this.save(); // persist immediately so reload retains the balance

        // ── Update HUD token counter right away ───────────────────────────
        this.ui._updateHUD();

        // ── Visual feedback — particle burst ─────────────────────────────
        const cx = window.innerWidth  / 2;
        const cy = window.innerHeight / 2;
        this._particles.spawnBurst(cx, cy, '#ffd700', 50);
        this._particles.spawnBurst(cx, cy, '#7b2fff', 25);

        // ── Notification & sound ─────────────────────────────────────────
        const fmtD = pack.diamonds.toLocaleString('pt-BR');
        this.notify(`💎 +${fmtD} Diamantes adicionados!`, 'levelup');
        this.audio.levelUp?.();

        // Re-render shop panel so balance line updates
        if (this.ui._activePanel === 'shop') this.ui._renderPanelContent('shop');
    }

    buyUpgrade(id) {
        const upg = UPGRADES.find(u => u.id === id);
        if (!upg) return;
        if (this.upgradeManager.buyUpgrade(upg, this.economy)) {
            this.audio.upgrade();
            this.missions.onBuyUpgrade();
            const nps = this.upgradeManager.getNPS();
            this.economy.neuronsPerSec = nps;
            this.achievements.check(this.stats, this.economy, this.upgradeManager, this.combo.getLevel(), this.missions);
        }
    }

    doPrestige() {
        const tokenMult = 1 + this.shop.getTokenBonus();
        const tokens    = this.economy.doPrestige(this.upgradeManager, tokenMult);
        if (tokens > 0) {
            this._lbSyncAt = 0; // bypass debounce — prestige is an important milestone
            this._syncLeaderboard();
            this.economy.neuronsPerSec = this.upgradeManager.getNPS();
            this._wasPrestigeReady = false;

            // Visual impact: flash + particles
            this._triggerRebirthFlash();
            const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
            this._particles.spawnBurst(cx, cy, '#7b2fff', 80);
            this._particles.spawnBurst(cx, cy, '#ffd700', 50);
            this._particles.spawnBurst(cx, cy, '#00f5ff', 30);

            this.audio.prestige();
            const themeName = PrestigeAura.THEMES[this.economy.totalPrestiges % PrestigeAura.THEMES.length].name;
            this.notify(`♻ Renascimento #${this.economy.totalPrestiges}! +${tokens} 💎 · ${themeName}`, 'levelup');
            this.achievements.check(this.stats, this.economy, this.upgradeManager, this.combo.getLevel(), this.missions);
        }
    }

    _triggerRebirthFlash() {
        let flash = document.getElementById('rebirth-flash-overlay');
        if (!flash) {
            flash = document.createElement('div');
            flash.id = 'rebirth-flash-overlay';
            document.body.appendChild(flash);
        }
        flash.className = '';
        void flash.offsetWidth;
        flash.className = 'rebirth-flash-active';
    }

    notify(msg, type = 'info') {
        this.events.emit('notification', { msg, type });
    }

    save() {
        const state = {
            economy: this.economy.getState(),
            upgrades: this.upgradeManager.getState(),
            achievements: this.achievements.getState(),
            level: this.level.getState(),
            boosts: this.boosts.getState(),
            missions: this.missions.getState(),
            shop: this.shop.getState(),
            skills: this.skills.getState(),
            events: this.randomEvents.getState(),
            tutorial: this.tutorial.getState(),
            stats: { ...this.stats },
            audio: this.audio.getState(),
        };
        this.saveManager.save(state);
        this._syncLeaderboard();
    }

    async _syncLeaderboard() {
        if (!this.account.isLoggedIn() || this.account.isLocalOnly()) return;
        if (window.location.protocol === 'file:') return;
        const now = Date.now();
        if (this._lbSyncAt && now - this._lbSyncAt < 60_000) return;
        this._lbSyncAt = now;
        try {
            await fetch('api/leaderboard.php', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action:           'submit',
                    lifetime_neurons: this.economy.lifetimeNeurons,
                    level:            this.level.level,
                    total_prestiges:  this.economy.totalPrestiges,
                    vip:              this.account.isVip(),
                }),
            });
        } catch { /* ignore network errors */ }
    }

    wipeSave() {
        this._running = false;
        this._noSave  = true;
        if (this.account.isLoggedIn()) {
            fetch('api/leaderboard.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete' }),
            }).catch(() => {});
        }
        this.saveManager.wipe();
        location.reload();
    }

    _loadState(s) {
        this.economy.loadState(s.economy);
        this.upgradeManager.loadState(s.upgrades, this.economy);
        this.achievements.loadState(s.achievements, this.economy);
        this.level.loadState(s.level);
        this.boosts.loadState(s.boosts);
        this.missions.loadState(s.missions);
        this.shop.loadState(s.shop);
        this.skills.loadState(s.skills);
        this.randomEvents.loadState(s.events);
        this.tutorial.loadState(s.tutorial);
        if (s.stats) Object.assign(this.stats, s.stats);
        if (s.audio) this.audio.loadState(s.audio);
        this.economy.neuronsPerSec = this.upgradeManager.getNPS();
    }

    _calcOffline(savedAt) {
        if (!savedAt) return;
        const elapsed = Math.min((Date.now() - savedAt) / 1000, Config.OFFLINE_MAX_HOURS * 3600);
        if (elapsed < 10) return;
        const nps = this.economy.getEffectiveNPS();
        const offlineMult = 0.5 * this.skills.getOfflineMult() * (1 + this.shop.getOfflineBonus());
        const earned = nps * elapsed * offlineMult;
        if (earned > 0) {
            this.economy.addNeurons(earned);
            setTimeout(() => {
                this.notify(`Bem-vindo de volta! Ganhou ${formatNum(earned)} ⚡ offline (${Math.floor(elapsed / 60)}min).`, 'info');
            }, 1500);
        }
    }
}
