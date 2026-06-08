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
        this._fgCtx          = null;
        this._lastTime       = 0;
        this._lastClickTime  = 0;
        this._autoSaveTimer  = 0;
        this._serverSyncTimer = 0;
        this._tickAccum      = 0;
        this._saveDebounce   = null;
        this._running        = false;
        this._loopQueued     = false; // guards against duplicate rAF loops
        this._wasPrestigeReady = false;
        this._noSave     = false;
        this._achieveAccum   = 0;
        this._missionsAccum  = 0;

        this.saveManager._game = this; // link back for server sync
    }

    async init() {
        this._bgCanvas   = document.getElementById('bg-canvas');
        this._fgCanvas   = document.getElementById('fg-canvas');
        this._auraCanvas = document.getElementById('prestige-aura-canvas');
        this._bg         = new NeuralBackground(this._bgCanvas);
        this._particles  = new ParticleSystem(this._fgCanvas);
        this._aura       = new PrestigeAura(this._auraCanvas);
        this._fgCtx      = this._fgCanvas.getContext('2d');
        this._resizeFG();
        window.addEventListener('resize', () => this._resizeFG());

        this._bindEvents();
        this.ui.init();
        this.tutorial.init();

        // Carrega save e aplica estado imediatamente
        let saved = null;
        try { saved = await this.saveManager.load(); } catch(e) { console.error('[Load]', e); }
        if (saved) {
            this._loadState(saved);
            this._calcOffline(saved.savedAt);
            // Salva imediatamente após carregar para sincronizar LS↔IDB
            setTimeout(() => this.save(), 500);
        }

        if (this.account.isVip()) this.shop.applyVipBonus();
        if (this.account.hasDoubleNeuron()) this.economy.setPremiumMult(2);
        if (this.account.hasBossDmgX2?.()) {
            this.shop.purchased.add('perm_boss_dmg_x2');
            this.shop._bossDamageMult = Math.max(2, this.shop._bossDamageMult || 1);
        }
        // Detecta retorno do Mercado Pago e inicia verificação automática
        const _urlParams = new URLSearchParams(window.location.search);
        if (_urlParams.has('pag') && _urlParams.has('tx')) {
            this._pendingPaymentReturn = {
                status: _urlParams.get('pag'),
                txId:   parseInt(_urlParams.get('tx')) || 0,
            };
            window.history.replaceState({}, '', window.location.pathname);
        }
        const activeSkin = this.account.getActiveSkin();
        if (activeSkin) this._applyActiveSkin(activeSkin);

        const _flushSave = () => { if (!this._noSave) this.save(); };
        window.addEventListener('beforeunload',  _flushSave);
        window.addEventListener('pagehide',      _flushSave);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') _flushSave();
        });

        this._running = true;
        this._restoring = false;
        this.audio.startAmbient();
        this._scheduleLoop();

        // Retorno do MP: abre modal de espera para confirmar o pagamento pendente
        if (this._pendingPaymentReturn) {
            const ret = this._pendingPaymentReturn;
            this._pendingPaymentReturn = null;
            if (ret.status === 'success' && ret.txId) {
                setTimeout(() => {
                    if (this.ui._activePanel !== 'shop') this.ui._openPanel?.('shop');
                    this.ui._showPaymentWaitModal(null, ret.txId);
                }, 800);
            } else if (ret.status === 'failure') {
                setTimeout(() => this.notify('Pagamento não aprovado. Tente novamente.', 'error'), 800);
            }
        }

        // Watchdog: only restarts if no rAF is already queued (prevents duplicate loops)
        setInterval(() => {
            if (this._running && !this._loopQueued && !this._noSave) {
                const now = performance.now();
                if (this._lastTime > 0 && now - this._lastTime > 4000) {
                    console.warn('[Watchdog] Loop restarted');
                    this._scheduleLoop();
                }
            }
        }, 4000);
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

    _scheduleLoop() {
        if (this._loopQueued) return; // never queue more than one rAF
        this._loopQueued = true;
        requestAnimationFrame(t => this._loop(t));
    }

    _loop(timestamp) {
        this._loopQueued = false;
        if (!this._running) return;
        const dt = Math.min((timestamp - this._lastTime) / 1000, 0.1);
        this._lastTime = timestamp;
        this.stats.playTime += dt;

        try {
            this._update(dt);
            this._draw();
        } catch (e) {
            console.error('[GameLoop]', e);
        }
        this._scheduleLoop();
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

        this._serverSyncTimer += dt;
        if (this._serverSyncTimer >= Config.SERVER_SYNC_INTERVAL / 1000) {
            this._serverSyncTimer = 0;
            this._syncToServer();
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

        // Mission completion check: 4 Hz is enough (max 250ms detection delay)
        this._missionsAccum += dt;
        if (this._missionsAccum >= 0.25) {
            this._missionsAccum = 0;
            this.missions.updateFromStats(this.stats, this.economy, this.upgradeManager, this.combo);
        }

        // Achievement check: 1 Hz is enough (achievements don't need real-time feedback)
        this._achieveAccum += dt;
        if (this._achieveAccum >= 1.0) {
            this._achieveAccum = 0;
            this.achievements.check(this.stats, this.economy, this.upgradeManager, this.combo.getLevel(), this.missions);
        }

        const prestigeProgress = Math.min(1, this.economy.totalNeurons / this.economy.getPrestigeCost());
        this._wasPrestigeReady = prestigeProgress >= 1;
    }

    _draw() {
        this._bg.draw();
        this._fgCtx.clearRect(0, 0, this._fgCanvas.width, this._fgCanvas.height);
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
        // Achievement check is handled by the 1Hz tick — no need to run it per click
    }

    _animateClickBtn(isCrit) {
        const btn = document.getElementById('click-btn');
        if (!btn) return;
        const cls = isCrit ? 'crit-anim' : 'click-anim';
        // Remove both classes, then defer re-add to next frame — avoids forced layout reflow
        // (void offsetWidth was forcing a synchronous full-page relayout on every click)
        btn.classList.remove('click-anim', 'crit-anim');
        requestAnimationFrame(() => btn.classList.add(cls));

        const orb = document.getElementById('prestige-char');
        if (orb && orb.dataset.stage !== 'hidden') {
            orb.classList.remove('click-sync');
            requestAnimationFrame(() => {
                orb.classList.add('click-sync');
                orb.addEventListener('animationend', () => orb.classList.remove('click-sync'), { once: true });
            });
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
            this._achieveAccum = 1.0;
            this._debouncedSave();
        }
    }

    upgradeSkill(skillId) {
        if (this.skills.upgrade(skillId)) {
            this.audio.upgrade?.();
            this.save();
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

    buyBossDamageX2() {
        if (this.shop.purchased.has('perm_boss_dmg_x2')) return;
        if (!this.account.isLoggedIn()) { this.notify('Faça login para comprar!', 'error'); return; }
        this.shop.purchased.add('perm_boss_dmg_x2');
        this.shop._bossDamageMult *= 2;
        this.save();
        this.notify('⚔️ 2× Dano no Boss ativado! Seu dano foi dobrado para sempre.', 'gold');
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
        this.notify(`🎨 Skin ${skin.name} desbloqueada!`, 'success');
        this.audio.upgrade?.();
        if (this.ui._activePanel === 'shop') this.ui._renderPanelContent('shop');
    }

    equipSkin(id) {
        if (!this.account.hasSkin(id)) return;
        this.account.setActiveSkin(id);
        this._applyActiveSkin(id);
        const skin = (typeof PREMIUM_SKINS !== 'undefined') ? PREMIUM_SKINS.find(s => s.id === id) : null;
        // Skin equipada — sem notificação (ação visual imediata já comunica)
        if (this.ui._activePanel === 'shop') this.ui._renderPanelContent('shop');
    }

    resetSkin() {
        this.account.setActiveSkin(null);
        this._applyActiveSkin(null);
        // Tema resetado — sem notificação
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

    // ── Pagamento real via Mercado Pago ───────────────────────────────────────

    _getItemLabel(itemId) {
        const packs = typeof DIAMOND_PACKS  !== 'undefined' ? DIAMOND_PACKS  : [];
        const skins = typeof PREMIUM_SKINS  !== 'undefined' ? PREMIUM_SKINS  : [];
        const labels = { vip: 'VIP Permanente', double_neuron: '2× Neurônio', boss_damage_x2: '2× Dano no Boss' };
        if (labels[itemId]) return { label: labels[itemId], price: itemId === 'double_neuron' ? 'R$ 12,90' : 'R$ 9,90' };
        const pack = packs.find(p => p.id === itemId);
        if (pack) return { label: pack.name, price: pack.price };
        const skin = skins.find(s => s.id === itemId);
        if (skin) return { label: skin.name, price: skin.price };
        return { label: itemId, price: '' };
    }

    iniciarPagamento(itemId) {
        if (!this.account.isLoggedIn()) { this.notify('Faça login para comprar!', 'error'); return; }
        const { label, price } = this._getItemLabel(itemId);
        this.ui._showPaymentMethodModal(itemId, label, price);
    }

    async iniciarPix(itemId) {
        if (!this.account.isLoggedIn()) { this.notify('Faça login para comprar!', 'error'); return; }
        this.ui._setPaymentBtnLoading(itemId, true);
        let usarEstatico = false;
        try {
            const res  = await fetch('api/pagamento.php', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ action: 'criar_pix', item_id: itemId }),
            });
            const data = await res.json();
            if (data.ok) {
                this.ui._showPixModal(itemId, data.tx_id, data.payment_id, data.qr_code, data.qr_code_base64);
            } else {
                usarEstatico = true;
            }
        } catch {
            usarEstatico = true;
        }

        if (usarEstatico) {
            try {
                const res  = await fetch('api/pagamento.php', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ action: 'criar_pix_estatico', item_id: itemId }),
                });
                const data = await res.json();
                if (data.ok) {
                    this.ui._showPixModalEstatico(itemId, data.tx_id);
                } else {
                    this.notify(data.msg || 'Erro ao gerar PIX.', 'error');
                }
            } catch {
                this.notify('Erro de conexão.', 'error');
            }
        }

        this.ui._setPaymentBtnLoading(itemId, false);
    }

    _isMobile() {
        return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent)
            || (navigator.maxTouchPoints > 1 && window.innerWidth <= 900);
    }

    async _iniciarCheckoutPro(itemId) {
        this.ui._setPaymentBtnLoading(itemId, true);
        try {
            const res  = await fetch('api/pagamento.php', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ action: 'criar', item_id: itemId }),
            });
            const data = await res.json();
            if (!data.ok) { this.notify(data.msg || 'Erro ao iniciar pagamento.', 'error'); return; }

            if (this._isMobile()) {
                // Mobile: redireciona na mesma aba (window.open é bloqueado em mobile)
                // O jogo é restaurado ao retornar via back_url (?pag=success&tx=N)
                this.save(); // salva progresso antes de sair
                window.location.href = data.checkout_url;
            } else {
                // Desktop: abre nova aba e mostra modal de espera
                window.open(data.checkout_url, '_blank');
                this.ui._showPaymentWaitModal(itemId, data.tx_id);
            }
        } catch {
            this.notify('Erro de conexão. Tente novamente.', 'error');
        } finally {
            this.ui._setPaymentBtnLoading(itemId, false);
        }
    }

    _entregarItem(itemId) {
        const acc = this.account;
        if (itemId === 'vip' && !acc.isVip()) {
            acc.setVip();
            this.shop.applyVipBonus();
            this.notify('👑 VIP Permanente ativado! +10% renda global.', 'levelup');
            this.audio.levelUp?.();
        } else if (itemId === 'double_neuron' && !acc.hasDoubleNeuron()) {
            acc.setDoubleNeuron();
            this.economy.setPremiumMult(2);
            this.notify('⚡ 2× Neurônio ativado! Ganhos dobrados para sempre.', 'levelup');
            this.audio.levelUp?.();
        } else if (itemId === 'boss_damage_x2' && !acc.hasBossDmgX2?.()) {
            acc.setBossDmgX2?.();
            this.shop.purchased.add('perm_boss_dmg_x2');
            this.shop._bossDamageMult = Math.max(2, this.shop._bossDamageMult || 1);
            this.save();
            this.notify('⚔️ 2× Dano no Boss ativado! Dano dobrado para sempre.', 'gold');
            this.audio.levelUp?.();
        } else if (itemId.startsWith('diamonds_')) {
            const packs = typeof DIAMOND_PACKS !== 'undefined' ? DIAMOND_PACKS : [];
            const pack  = packs.find(p => p.id === itemId);
            if (pack) {
                this.economy.addTokens(pack.diamonds);
                this.save();
                this._syncToServer();
                this.ui._updateHUD();
                const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
                this._particles?.spawnBurst?.(cx, cy, '#ffd700', 40);
                this.notify(`💎 +${pack.diamonds.toLocaleString('pt-BR')} Diamantes adicionados!`, 'levelup');
                this.audio.levelUp?.();
            }
        } else if (itemId.startsWith('skin_') && !acc.hasSkin(itemId)) {
            acc.buySkin(itemId);
            const skin = typeof PREMIUM_SKINS !== 'undefined' ? PREMIUM_SKINS.find(s => s.id === itemId) : null;
            if (skin) this.notify(`🎨 Skin ${skin.name} desbloqueada!`, 'success');
            this.audio.upgrade?.();
        }
        if (this.ui._activePanel === 'shop')    this.ui._renderPanelContent('shop');
        if (this.ui._activePanel === 'profile') this.ui._renderPanelContent('profile');
    }

    buyShopItem(id, qty = 1) {
        if (this.shop.buy(id, qty)) {
            this.audio.upgrade?.();
            if (this.ui._activePanel === 'shop') this.ui._renderPanelContent('shop');
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
        this.save();
        this._syncToServer(); // critical: sync diamond purchase to server immediately

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
            this._achieveAccum = 1.0;
            this.save();
        }
    }

    doPrestige() {
        const tokenMult = 1 + this.shop.getTokenBonus();
        const tokens    = this.economy.doPrestige(this.upgradeManager, tokenMult);
        if (tokens > 0) {
            this._lbSyncAt = 0; // bypass debounce — prestige is an important milestone
            this._syncLeaderboard();
            this.save();
            this._serverSyncTimer = Config.SERVER_SYNC_INTERVAL; // force next server sync immediately
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
            this._achieveAccum = 1.0; // force check on next tick
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

    _debouncedSave() {
        clearTimeout(this._saveDebounce);
        this._saveDebounce = setTimeout(() => this.save(), 800);
    }

    _buildState() {
        const safe = (fn) => { try { return fn(); } catch(e) { console.error('[buildState]', e); return null; } };
        return {
            economy:      safe(() => this.economy.getState()),
            upgrades:     safe(() => this.upgradeManager.getState()),
            achievements: safe(() => this.achievements.getState()),
            level:        safe(() => this.level.getState()),
            boosts:       safe(() => this.boosts.getState()),
            missions:     safe(() => this.missions.getState()),
            shop:         safe(() => this.shop.getState()),
            skills:       safe(() => this.skills.getState()),
            events:       safe(() => this.randomEvents.getState()),
            tutorial:     safe(() => this.tutorial.getState()),
            boss:         safe(() => this.boss.getState()),
            stats:        { ...this.stats },
            audio:        safe(() => this.audio.getState()),
        };
    }

    save() {
        try {
            const state = this._buildState();
            this.saveManager.save(state);
        } catch(e) {
            console.error('[Save] falhou:', e);
        }
    }

    _syncToServer() {
        const state = this._buildState();
        this.saveManager.saveToServer(state);
        this._syncLeaderboard();
    }

    async _syncLeaderboard() {
        if (!this.account.isLoggedIn() || this.account.isLocalOnly()) return;
        if (window.location.protocol === 'file:') return;
        const now = Date.now();
        if (this._lbSyncAt && now - this._lbSyncAt < 60_000) return;
        this._lbSyncAt = now;
        try {
            const ctrl  = new AbortController();
            setTimeout(() => ctrl.abort(), 8000);
            await fetch('api/leaderboard.php', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action:           'submit',
                    lifetime_neurons: this.economy.lifetimeNeurons,
                    level:            this.level.level,
                    total_prestiges:  this.economy.totalPrestiges,
                    total_clicks:     this.stats.totalClicks,
                    vip:              this.account.isVip(),
                }),
                signal: ctrl.signal,
            });
        } catch { /* ignore network errors or timeout */ }
    }

    async _restoreFromServer() {
        if (!this.account.isLoggedIn() || this.account.isLocalOnly()) return false;
        if (window.location.protocol === 'file:') return false;
        if (this._restoring) return false; // guard against concurrent calls
        this._restoring = true;
        try {
            const saved = await this.saveManager.loadFromServer();
            if (!saved) return false;
            this._loadState(saved);
            this._calcOffline(saved.savedAt);
            // Re-apply account-specific settings after restore
            if (this.account.isVip()) this.shop.applyVipBonus();
            if (this.account.hasDoubleNeuron()) this.economy.setPremiumMult(2);
            if (this.account.hasBossDmgX2?.()) {
                this.shop.purchased.add('perm_boss_dmg_x2');
                this.shop._bossDamageMult = Math.max(2, this.shop._bossDamageMult || 1);
            }
            const skin = this.account.getActiveSkin();
            if (skin) this._applyActiveSkin(skin);
            this.economy.neuronsPerSec = this.upgradeManager.getNPS();
            // Progresso restaurado silenciosamente
            this.ui._updateHUD();
            return true;
        } catch (e) {
            console.error('[RestoreFromServer]', e);
            return false;
        } finally {
            this._restoring = false;
            // Always ensure loop is alive after any restore attempt
            if (!this._running) {
                this._running = true;
                this._scheduleLoop();
            }
        }
    }

    wipeSave() {
        this._running = false;
        this._noSave  = true;
        // Clear diamonds (earned in-game) but keep VIP / DoubleNeuron / Skins
        this.account.resetDiamonds();
        if (this.account.isLoggedIn()) {
            fetch('api/leaderboard.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete' }),
            }).catch(() => {});
            this.saveManager.wipeServer();
        }
        this.saveManager.wipe();
        location.reload();
    }

    _loadState(s) {
        if (!s) return;
        const ld = (fn) => { try { fn(); } catch(e) { console.error('[loadState]', e); } };
        ld(() => this.economy.loadState(s.economy));
        ld(() => this.upgradeManager.loadState(s.upgrades, this.economy));
        ld(() => this.achievements.loadState(s.achievements, this.economy));
        ld(() => this.level.loadState(s.level));
        ld(() => this.boosts.loadState(s.boosts));
        ld(() => this.missions.loadState(s.missions));
        ld(() => this.shop.loadState(s.shop));
        ld(() => this.skills.loadState(s.skills));
        ld(() => this.randomEvents.loadState(s.events));
        ld(() => this.tutorial.loadState(s.tutorial));
        ld(() => { if (s.boss) this.boss.loadState(s.boss); });
        ld(() => { if (s.stats) Object.assign(this.stats, s.stats); });
        ld(() => { if (s.audio) this.audio.loadState(s.audio); });
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
            // Ganho offline aplicado silenciosamente
        }
    }
}
