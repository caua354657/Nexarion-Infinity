function formatNum(n) {
    if (typeof n !== 'number' || isNaN(n)) return '0';
    const abs = Math.abs(n);
    if (abs >= 1e33) return (n / 1e33).toFixed(2) + 'Dc';
    if (abs >= 1e30) return (n / 1e30).toFixed(2) + 'No';
    if (abs >= 1e27) return (n / 1e27).toFixed(2) + 'Oc';
    if (abs >= 1e24) return (n / 1e24).toFixed(2) + 'Sp';
    if (abs >= 1e21) return (n / 1e21).toFixed(2) + 'Sx';
    if (abs >= 1e18) return (n / 1e18).toFixed(2) + 'Qi';
    if (abs >= 1e15) return (n / 1e15).toFixed(2) + 'Qa';
    if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (abs >= 1e9)  return (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6)  return (n / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3)  return (n / 1e3).toFixed(2) + 'K';
    if (abs > 0 && abs < 1) return parseFloat(n.toFixed(2)).toString();
    return Math.floor(n).toString();
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
}

/* Smart duration for display: "42s", "12min", "3h", "1d 5h" */
function formatDuration(secs) {
    secs = Math.max(0, Math.floor(secs));
    if (secs < 60)    return secs + 's';
    if (secs < 3600)  return Math.floor(secs / 60) + 'min';
    if (secs < 86400) {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        return m > 0 ? h + 'h ' + m + 'min' : h + 'h';
    }
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    return h > 0 ? d + 'd ' + h + 'h' : d + 'd';
}

class UIManager {
    constructor(game) {
        this._game = game;
        this._activePanel  = null;
        this._activeTab    = null;
        this._worldOpen    = false;
        this._activeBossTab = 'boss';
        this._activeShopTab = 'boosts';
        this._activeSkillTab = 'click';
        this._profileAuthMode = 'login'; // 'login' | 'register'
        this._lastUpdate = 0;
        this._parentPanel = null;
        this._missionsStateKey = null;

        this.touchStartY = 0;
        this.touchEndY = 0;
        this._genBuyQty = 1;

        // Boost buy modal state
        this._boostModalId  = null;
        this._boostModalQty = 1;

        this._bossRankRefreshTimer    = null;
        this._dailyCountdownTimer     = null;
        this._bossBattleTimerInterval = null;
        this._bossWorldTimerInterval  = null;
        this._bossUpgQty              = 1;

        this._activeLbTab      = 'neuronios'; // leaderboard tab
        this._activeBossRankTab = 'dano';     // boss ranking tab

        this._lastBadgeUpdate = 0;  // throttle badge recalc to 2Hz
        this._badgeBtns = null;     // cached NodeLists keyed by panel id

        // Friends system state
        this._friendsTab        = 'list';  // 'list' | 'requests' | 'search'
        this._friendsView       = 'tabs';  // 'tabs' | 'profile' | 'compare'
        this._friendsProfileId  = null;
        this._friendsCompareId  = null;
        this._friendsCache      = null;    // cached list data
        this._friendsSearchQ    = '';
        this._friendsPending    = 0;       // pending received requests count (for badge)

        // Click battle state
        this._battleState            = null;
        this._battlePollTimer        = null;
        this._battleClicks           = 0;
        this._battleSyncTimer        = null;
        this._battleCountdownTimer   = null;
        this._battleArenaStartTime   = null;
        this._battleInitialRemaining = 60;
        this._battleDismissedIds     = new Set(
            JSON.parse(sessionStorage.getItem('nx_btl_dismissed') || '[]')
        );
    }

    init() {
        this._bindNavigation();
        this._bindModal();
        this._bindClickBtn();
        this._bindPrestige();
        this._bindSettings();
        this._bindLevelUpAlert();
        this._initBossUI();
        this._initBadgeCache();
        window.addEventListener('resize', () => this._onResize());

        this._updateHUD();
        this._checkAuthWall();

        this._startBattlePolling();

        // Poll pending friend requests every 60s to keep badge updated
        setInterval(() => {
            if (this._game.account.isLoggedIn() && !this._game.account.isLocalOnly()
                && window.location.protocol !== 'file:') {
                this._fetchFriendsList(true);
            }
        }, 60000);
    }

    _initBadgeCache() {
        const panels = ['neural', 'agenda', 'generators', 'upgrades', 'missions', 'rebirth', 'more'];
        this._badgeBtns = {};
        panels.forEach(p => {
            this._badgeBtns[p] = document.querySelectorAll(
                `.sidebar-btn[data-panel="${p}"], .mobile-nav-btn[data-panel="${p}"]`
            );
        });
    }

    _bindNavigation() {
        // Sidebar and Mobile Nav
        const navBtns = document.querySelectorAll('.sidebar-btn, .mobile-nav-btn');
        navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const panel = btn.dataset.panel;
                if (this._activePanel === panel) {
                    this.closePanel();
                } else {
                    this.openPanel(panel);
                }
            });
        });
        
        // Notification Center
        document.getElementById('notif-center-close')?.addEventListener('click', () => {
            document.getElementById('notification-center').classList.remove('open');
        });
    }

    _bindModal() {
        const closeBtn = document.getElementById('modal-close');
        if (closeBtn) closeBtn.addEventListener('click', () => this.closePanel());

        // Photo preview on register form
        const regPhoto = document.getElementById('auth-reg-photo');
        if (regPhoto) {
            regPhoto.addEventListener('change', () => {
                const file    = regPhoto.files?.[0];
                const preview = document.getElementById('auth-photo-preview');
                const label   = document.querySelector('.auth-photo-upload');
                const nameEl  = document.getElementById('auth-photo-filename');
                if (file) {
                    if (preview) { const url = URL.createObjectURL(file); preview.innerHTML = `<img src="${url}" alt="Foto">`; }
                    if (nameEl)  nameEl.textContent = file.name;
                    label?.classList.add('has-file');
                } else {
                    if (preview) preview.textContent = '📷';
                    if (nameEl)  nameEl.innerHTML = 'Foto de perfil <small>(opcional)</small>';
                    label?.classList.remove('has-file');
                }
            });
        }

        document.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                const auth = document.getElementById('auth-overlay');
                if (auth?.classList.contains('open')) {
                    const loginSec = document.getElementById('auth-login-section');
                    if (loginSec && loginSec.style.display !== 'none') this._handleAuthLogin();
                    else this._handleAuthRegister();
                    return;
                }
            }
            if (e.key === 'Escape') {
                const daOverlay = document.getElementById('delete-account-overlay');
                if (daOverlay?.classList.contains('open')) { this._hideDeleteConfirm(); return; }
                const rcOverlay = document.getElementById('reset-confirm-overlay');
                if (rcOverlay?.classList.contains('open')) { this._hideResetConfirm(); return; }
                const pcOverlay = document.getElementById('prestige-confirm-overlay');
                if (pcOverlay?.classList.contains('open')) {
                    this._hidePrestigeConfirm();
                } else if (this._activePanel) {
                    this.closePanel();
                }
            }
        });
    }

    openPanel(panelId) {
        try {
            this._activePanel = panelId;

            document.querySelectorAll('.sidebar-btn, .mobile-nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll(`.sidebar-btn[data-panel="${panelId}"], .mobile-nav-btn[data-panel="${panelId}"]`).forEach(b => b.classList.add('active'));

            const overlay = document.getElementById('modal-overlay');
            const panel   = document.getElementById('modal-panel');
            const title   = document.getElementById('modal-title');
            if (!overlay || !panel) return;

            overlay.style.display = 'block';
            panel.style.display   = 'flex';
            void panel.offsetWidth;
            panel.classList.add('open');

            const _tL = window.LANG || { t: k => k };
            const titles = {
                'generators':    _tL.t('panel.title.generators'),
                'upgrades':      _tL.t('panel.title.upgrades'),
                'shop':          _tL.t('panel.title.shop'),
                'skills':        _tL.t('panel.title.skills'),
                'missions':      _tL.t('panel.title.missions'),
                'achievements':  _tL.t('panel.title.achievements'),
                'leaderboard':   _tL.t('panel.title.leaderboard'),
                'boss':          _tL.t('panel.title.boss'),
                'boss_battle':   _tL.t('panel.title.boss_battle'),
                'boss_ranking':  _tL.t('panel.title.leaderboard'),
                'boss_upgrades': _tL.t('panel.title.boss_upgrades'),
                'profile':       _tL.t('panel.title.profile'),
                'friends':       _tL.t('panel.title.friends'),
                'rebirth':       _tL.t('panel.title.rebirth'),
                'settings':      _tL.t('panel.title.settings'),
                'more':          _tL.t('panel.title.more'),
                'neural':        _tL.t('panel.title.neural'),
                'agenda':        _tL.t('panel.title.agenda'),
                'conta':         _tL.t('panel.title.conta'),
            };
            if (title) title.textContent = titles[panelId] || _tL.t('panel.title.default');

            const panelGroup = {
                generators: 'neural', upgrades: 'neural', skills: 'neural', rebirth: 'neural',
                missions: 'agenda', achievements: 'agenda', leaderboard: 'agenda', boss: 'boss',
                boss_battle: 'boss', boss_ranking: 'boss', boss_upgrades: 'boss',
                profile: 'conta', friends: 'conta', settings: 'conta'
            };
            const groupId = panelGroup[panelId] || panelId;
            document.querySelectorAll(`.sidebar-btn[data-panel="${groupId}"], .mobile-nav-btn[data-panel="${groupId}"]`).forEach(b => b.classList.add('active'));

            this._renderPanelContent(panelId);
        } catch (e) {
            console.error('[openPanel]', panelId, e);
        }
    }

    openSubPanel(panelId) {
        this._parentPanel = this._activePanel;
        this.openPanel(panelId);
    }

    closePanel() {
        if (this._lbRefreshTimer)          { clearInterval(this._lbRefreshTimer);          this._lbRefreshTimer          = null; }
        if (this._bossRankRefreshTimer)    { clearInterval(this._bossRankRefreshTimer);    this._bossRankRefreshTimer    = null; }
        if (this._dailyCountdownTimer)     { clearInterval(this._dailyCountdownTimer);     this._dailyCountdownTimer     = null; }
        if (this._bossBattleTimerInterval) { clearInterval(this._bossBattleTimerInterval); this._bossBattleTimerInterval = null; }
        if (this._bossWorldTimerInterval)  { clearInterval(this._bossWorldTimerInterval);  this._bossWorldTimerInterval  = null; }
        if (this._parentPanel) {
            const parent = this._parentPanel;
            this._parentPanel = null;
            this.openPanel(parent);
            return;
        }
        this._activePanel = null;
        document.querySelectorAll('.sidebar-btn, .mobile-nav-btn').forEach(b => b.classList.remove('active'));

        const panel = document.getElementById('modal-panel');
        const overlay = document.getElementById('modal-overlay');

        panel.classList.remove('open');

        setTimeout(() => {
            if (!this._activePanel) {
                overlay.style.display = 'none';
                panel.style.display = 'none';
                document.getElementById('modal-content').innerHTML = '';
            }
        }, 300);
    }

    _renderPanelContent(panelId) {
        const content       = document.getElementById('modal-content');
        const tabsContainer = document.getElementById('modal-tabs');
        if (!content || !tabsContainer) return;

        // Clear tabs by default
        tabsContainer.innerHTML = '';
        content.innerHTML = '';

        try { this.__renderPanelContentInner(panelId, content, tabsContainer); }
        catch (e) {
            console.error('[renderPanel]', panelId, e);
            content.innerHTML = `<div class="empty-msg">${(window.LANG||{t:k=>k}).t('friends.error.search')}</div>`;
        }
    }

    __renderPanelContentInner(panelId, content, tabsContainer) {
        
        switch (panelId) {
            case 'neural':       this._renderNavGroup(content, 'neural'); break;
            case 'agenda':       this._renderNavGroup(content, 'agenda'); break;
            case 'conta':        this._renderNavGroup(content, 'conta');  break;
            case 'generators':   this._renderGenerators(content); break;
            case 'upgrades':     this._renderUpgrades(content); break;
            case 'achievements': this._renderAchievements(content); break;
            case 'missions':     this._renderMissions(content, tabsContainer); break;
            case 'leaderboard':  this._renderLeaderboard(content, tabsContainer); break;
            case 'boss':         this._bossUnlocked() ? this._renderNavGroup(content, 'boss')                : this._renderBossLocked(content); break;
            case 'boss_battle':  this._bossUnlocked() ? this._renderBossPanel(content)                       : this._renderBossLocked(content); break;
            case 'boss_ranking': this._bossUnlocked() ? this._renderBossRankingPanel(content, tabsContainer) : this._renderBossLocked(content); break;
            case 'boss_upgrades':this._bossUnlocked() ? this._renderBossUpgradesPanel(content)               : this._renderBossLocked(content); break;
            case 'profile':      this._renderProfile(content); break;
            case 'friends':      this._renderFriends(content, tabsContainer); break;
            case 'settings':     this._renderSettings(content); break;
            case 'shop':         this._renderShop(content, tabsContainer); break;
            case 'skills':       this._renderSkills(content, tabsContainer); break;
            case 'rebirth':      this._renderRebirth(content); break;
            case 'more':         this._renderMore(content); break;
            default: content.innerHTML = '<div class="empty-msg">Em breve...</div>';
        }
    }

    _bindClickBtn() {
        const btn = document.getElementById('click-btn');
        if (!btn) return;
        btn.addEventListener('click', e => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX || rect.left + rect.width / 2;
            const y = e.clientY || rect.top + rect.height / 2;
            this._game.handleClick(x, y);
        });
        btn.addEventListener('touchstart', e => {
            e.preventDefault();
            const t = e.touches[0];
            this._game.handleClick(t.clientX, t.clientY);
        }, { passive: false });
    }

    _bindPrestige() {
        document.addEventListener('click', e => {
            if (e.target?.id === 'prestige-btn') {
                const eco    = this._game.economy;
                const tokens = eco.calcPrestigeTokens();
                if (tokens <= 0 || eco.totalNeurons < eco.getPrestigeCost()) {
                    this._game.notify('Neurônios insuficientes para o Renascimento!', 'error');
                    return;
                }
                this._showPrestigeConfirm(tokens);
            }
            if (e.target?.id === 'pc-cancel') this._hidePrestigeConfirm();
            if (e.target?.id === 'pc-confirm') {
                this._hidePrestigeConfirm();
                this._game.doPrestige();
            }
            // Click on overlay backdrop cancels
            if (e.target?.id === 'prestige-confirm-overlay') this._hidePrestigeConfirm();
        });
    }

    _showPrestigeConfirm(tokens) {
        const overlay = document.getElementById('prestige-confirm-overlay');
        const tokenEl = document.getElementById('pc-token-count');
        if (tokenEl) tokenEl.textContent = `+${tokens} 💎`;
        if (overlay) {
            overlay.classList.add('open');
            // Re-trigger card animation
            const card = document.getElementById('prestige-confirm-card');
            if (card) { card.style.animation = 'none'; void card.offsetWidth; card.style.animation = ''; }
        }
    }

    _hidePrestigeConfirm() {
        document.getElementById('prestige-confirm-overlay')?.classList.remove('open');
    }

    _bindLevelUpAlert() {
        this._game.events.on('levelUp', data => this._showLevelUpFlash(data.level));
    }

    _showLevelUpFlash(level) {
        const el = document.getElementById('levelup-flash');
        if (!el) return;
        el.textContent = `▲ NÍVEL ${level} ▲`;
        el.classList.remove('visible');
        requestAnimationFrame(() => el.classList.add('visible'));

        const lvlEl = document.getElementById('level-display');
        if (lvlEl) {
            lvlEl.classList.remove('level-flash');
            requestAnimationFrame(() => lvlEl.classList.add('level-flash'));
        }
    }

    _bindSettings() {
        document.addEventListener('input', e => {
            if (e.target.id === 'sfx-vol') {
                this._game.audio.setSfxVol(+e.target.value);
                const v = document.querySelector('#sfx-vol + .settings-vol-val');
                if (v) v.textContent = Math.round(+e.target.value * 100) + '%';
            }
            if (e.target.id === 'music-vol') {
                this._game.audio.setMusicVol(+e.target.value);
                const v = document.querySelector('#music-vol + .settings-vol-val');
                if (v) v.textContent = Math.round(+e.target.value * 100) + '%';
            }
        });

        document.addEventListener('change', e => {
            if (e.target.id === 'import-save-input') {
                const file = e.target.files?.[0];
                if (!file) return;
                this._game.saveManager.importFile(file)
                    .then(() => {
                        this._game._running = false;
                        this._game._noSave  = true; // prevent beforeunload from overwriting imported save
                        const msgEl = document.getElementById('import-save-msg');
                        if (msgEl) { msgEl.textContent = '✅ Save importado! Recarregando...'; msgEl.className = 'settings-import-msg ok'; }
                        this._game.notify('Save importado com sucesso! Recarregando...', 'success');
                        setTimeout(() => location.reload(), 1200);
                    })
                    .catch(msg => {
                        const msgEl = document.getElementById('import-save-msg');
                        if (msgEl) { msgEl.textContent = '❌ ' + msg; msgEl.className = 'settings-import-msg err'; }
                        this._game.notify(msg, 'error');
                        e.target.value = '';
                    });
            }
        });

        document.addEventListener('click', e => {
            const id = e.target.id;

            // ── Settings panel ──
            if (id === 'toggle-sound') {
                const enabled = !this._game.audio.isEnabled();
                this._game.audio.setEnabled(enabled);
                e.target.textContent = enabled ? '🔊 Som Ligado' : '🔇 Som Desligado';
                e.target.classList.toggle('settings-btn-off', !enabled);
            }
            if (id === 'wipe-save') this._showResetConfirm();
            if (id === 'export-save') {
                this._game.save();
                this._game.saveManager.exportFile().then(ok => {
                    this._game.notify(ok ? (window.LANG||{t:k=>k}).t('settings.export') + ' ✓' : (window.LANG||{t:k=>k}).t('settings.export') + ' ✗', ok ? 'success' : 'error');
                });
            }

            // ── Reset confirm modal ──
            if (id === 'rc-cancel' || id === 'reset-confirm-overlay') this._hideResetConfirm();
            if (id === 'rc-confirm') {
                this._hideResetConfirm();
                this._game.wipeSave();
            }

            // ── Auth overlay ──
            const eyeBtn = e.target.closest('.auth-eye-btn');
            if (eyeBtn) {
                const inp = document.getElementById(eyeBtn.dataset.target);
                if (inp) {
                    inp.type = inp.type === 'password' ? 'text' : 'password';
                    const isVisible = inp.type === 'text';
                    eyeBtn.innerHTML = isVisible
                        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
                        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
                }
            }
            if (id === 'auth-login-btn') this._handleAuthLogin();
            if (id === 'auth-reg-btn')   this._handleAuthRegister();
            if (id === 'profile-photo-change') document.getElementById('profile-photo-input')?.click();
            if (id === 'profile-photo-remove') this._handleRemovePhoto();
            if (id === 'delete-account-btn') this._showDeleteConfirm();
            if (id === 'da-cancel' || id === 'delete-account-overlay') this._hideDeleteConfirm();
            if (id === 'da-confirm') this._confirmDeleteAccount();
            if (id === 'auth-tab-login')     this._authSetTab('login');
            if (id === 'auth-tab-register')  this._authSetTab('register');
            if (id === 'auth-go-register')   this._authSetTab('register');
            if (id === 'auth-go-login')      this._authSetTab('login');

            // ── Profile panel ──
            if (id === 'profile-login-btn') this._handleProfileLogin();
            if (id === 'profile-reg-btn')   this._handleProfileRegister();
            if (id === 'profile-logout') {
                this._game._noSave = true; // don't auto-save on unload
                this._game.account.logout().then(() => {
                    this._game.saveManager.wipe(); // clear local save so next login starts fresh
                    location.reload();             // full reload = clean slate for new account
                });
            }
            if (id === 'profile-go-register') {
                this._profileAuthMode = 'register';
                this._renderPanelContent('profile');
            }
            if (id === 'profile-go-login') {
                // For local-only accounts, "Cancelar" returns to profile card view
                this._profileAuthMode = this._game.account.isLocalOnly() ? 'card' : 'login';
                this._renderPanelContent('profile');
            }
        });
    }

    // ── Auth wall ──
    _checkAuthWall() {
        const acc = this._game.account;
        // Immediately show/hide based on cached state
        if (acc.isLoggedIn()) {
            const overlay = document.getElementById('auth-overlay');
            if (overlay) overlay.style.display = 'none';
        } else {
            if (!acc.hasAccount()) this._authSetTab('register');
            else                   this._authSetTab('login');
            this._showAuthWall();
        }

        // Async verify session with server
        acc.checkSession().then(loggedIn => {
            if (loggedIn) {
                this._hideAuthWall();
                this._game._restoreFromServer(); // auto-restore server progress on page load
            } else if (!acc.isLoggedIn()) {
                if (!acc.hasAccount()) this._authSetTab('register');
                else                   this._authSetTab('login');
                this._showAuthWall();
            }
        }).catch(() => {
            // Server unreachable — hide wall so game stays playable offline
            this._hideAuthWall();
        });
    }

    _showAuthWall() {
        const overlay = document.getElementById('auth-overlay');
        if (!overlay) return;
        overlay.classList.remove('hiding');
        overlay.style.display = 'flex';
        void overlay.offsetWidth;
        overlay.classList.add('open');
    }

    _hideAuthWall() {
        const overlay = document.getElementById('auth-overlay');
        if (!overlay) return;
        overlay.classList.add('hiding');
        setTimeout(() => {
            overlay.style.display = 'none';
            overlay.classList.remove('open', 'hiding');
        }, 380);
    }

    _authSetTab(tab) {
        const loginSec  = document.getElementById('auth-login-section');
        const regSec    = document.getElementById('auth-register-section');
        const tabLogin  = document.getElementById('auth-tab-login');
        const tabReg    = document.getElementById('auth-tab-register');
        const goLogin   = document.getElementById('auth-go-login');
        const errEl     = document.getElementById('auth-error');
        if (errEl) errEl.textContent = '';

        if (tab === 'login') {
            if (loginSec) loginSec.style.display = '';
            if (regSec)   regSec.style.display = 'none';
            if (tabLogin) tabLogin.classList.add('active');
            if (tabReg)   tabReg.classList.remove('active');
        } else {
            if (loginSec) loginSec.style.display = 'none';
            if (regSec)   regSec.style.display = '';
            if (tabLogin) tabLogin.classList.remove('active');
            if (tabReg)   tabReg.classList.add('active');
            // Only show "back to login" if an account already exists
            if (goLogin) goLogin.style.display = this._game.account.hasAccount() ? 'block' : 'none';
        }
    }

    async _handleAuthLogin() {
        const id   = document.getElementById('auth-login-id')?.value  || '';
        const pass = document.getElementById('auth-login-pass')?.value || '';
        const err  = document.getElementById('auth-error');
        const btn  = document.getElementById('auth-login-btn');
        if (!id.trim() || !pass) {
            if (err) err.textContent = 'Preencha todos os campos.';
            return;
        }
        if (btn) { btn.disabled = true; btn.textContent = 'Entrando…'; }
        const result = await this._game.account.login(id, pass);
        if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
        if (result.ok) {
            this._hideAuthWall();
            this._game._restoreFromServer();
            // Fetch pending requests badge after login
            setTimeout(() => this._fetchFriendsList(true), 2000);
        } else {
            if (err) err.textContent = result.msg;
        }
    }

    async _handleAuthRegister() {
        const user  = document.getElementById('auth-reg-user')?.value  || '';
        const email = document.getElementById('auth-reg-email')?.value || '';
        const pass  = document.getElementById('auth-reg-pass')?.value  || '';
        const err   = document.getElementById('auth-error');
        const btn   = document.getElementById('auth-reg-btn');
        const photoFile = document.getElementById('auth-reg-photo')?.files?.[0] || null;

        if (user.length > 12) {
            if (err) { err.style.color = ''; err.textContent = 'Nome de usuário pode ter no máximo 12 caracteres.'; }
            return;
        }
        if (btn) { btn.disabled = true; btn.textContent = 'Criando…'; }
        const result = await this._game.account.createAccount(user, email, pass, photoFile);
        if (btn) { btn.disabled = false; btn.textContent = 'Criar Conta'; }
        if (result.ok) {
            // Reset client auth so the login form works cleanly (createAccount sets _loggedIn=true)
            this._game.account._loggedIn = false;
            this._authSetTab('login');
            const loginId = document.getElementById('auth-login-id');
            if (loginId) loginId.value = user || email;
            const successErr = document.getElementById('auth-error');
            if (successErr) { successErr.style.color = '#00ff88'; successErr.textContent = '✅ Conta criada! Faça login para continuar.'; }
        } else {
            if (err) { err.style.color = ''; err.textContent = result.msg; }
        }
    }

    // ── Profile panel auth helpers (used when profile panel is open) ──
    async _handleProfileLogin() {
        const user = document.getElementById('profile-login-user')?.value || '';
        const pass = document.getElementById('profile-login-pass')?.value || '';
        const msg  = document.getElementById('profile-auth-msg');
        const btn  = document.getElementById('profile-login-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Entrando…'; }
        const result = await this._game.account.login(user, pass);
        if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
        if (result.ok) {
            this._game._restoreFromServer(); // restore server-side progress
            this._renderPanelContent('profile');
        } else {
            if (msg) { msg.textContent = result.msg; msg.classList.add('profile-auth-error'); }
        }
    }

    async _handleProfileRegister() {
        const user      = document.getElementById('profile-reg-user')?.value  || '';
        const email     = document.getElementById('profile-reg-email')?.value || '';
        const pass      = document.getElementById('profile-reg-pass')?.value  || '';
        const msg       = document.getElementById('profile-auth-msg');
        const btn       = document.getElementById('profile-reg-btn');
        const photoFile = document.getElementById('profile-reg-photo')?.files?.[0] || null;
        if (user.length > 12) {
            if (msg) { msg.textContent = 'Nome de usuário pode ter no máximo 12 caracteres.'; msg.classList.add('profile-auth-error'); }
            return;
        }
        if (btn) { btn.disabled = true; btn.textContent = 'Criando…'; }
        const result = await this._game.account.createAccount(user, email, pass, photoFile);
        if (btn) { btn.disabled = false; btn.textContent = 'Criar Conta'; }
        if (result.ok) {
            this._game._restoreFromServer(); // restore server-side progress
            this._profileAuthMode = 'login';
            this._renderPanelContent('profile');
        } else {
            if (msg) { msg.textContent = result.msg; msg.classList.add('profile-auth-error'); }
        }
    }

    async _handleRemovePhoto() {
        const btn = document.getElementById('profile-photo-remove');
        if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
        const result = await this._game.account.removePhoto();
        if (result.ok) {
            this._renderPanelContent('profile');
        } else {
            if (btn) { btn.disabled = false; btn.textContent = '🗑'; }
            this._game.notify(result.msg || 'Erro ao remover foto.', 'error');
        }
    }

    _showDeleteConfirm() {
        const overlay = document.getElementById('delete-account-overlay');
        if (overlay) {
            overlay.classList.add('open');
            const card = document.getElementById('delete-account-card');
            if (card) { card.style.animation = 'none'; void card.offsetWidth; card.style.animation = ''; }
        }
    }

    _hideDeleteConfirm() {
        document.getElementById('delete-account-overlay')?.classList.remove('open');
    }

    async _confirmDeleteAccount() {
        const confirmBtn = document.getElementById('da-confirm');
        if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Excluindo…'; }
        const result = await this._game.account.deleteAccount();
        this._hideDeleteConfirm();
        if (result.ok) {
            this._game.wipeSave();
        } else {
            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = (window.LANG||{t:k=>k}).t('settings.delete'); }
            this._game.notify(result.msg || 'Erro ao excluir conta.', 'error');
        }
    }

    // ── Reset confirm modal ──
    _showResetConfirm() {
        const overlay = document.getElementById('reset-confirm-overlay');
        if (overlay) {
            overlay.classList.add('open');
            const card = document.getElementById('reset-confirm-card');
            if (card) { card.style.animation = 'none'; void card.offsetWidth; card.style.animation = ''; }
        }
    }

    _hideResetConfirm() {
        document.getElementById('reset-confirm-overlay')?.classList.remove('open');
    }

    update(dt) {
        const now = performance.now();
        if (now - this._lastUpdate < 100) return;
        this._lastUpdate = now;

        try {
            this._updateHUD();
            this._updateBoostDisplay();
            this._updateEventBanner();
            this._updateComboDisplay();
            this._updatePrestigeBtn();

            // Badge recalculation is expensive (calls getActiveMissions, getAvailableUpgrades,
            // and multiple querySelectorAll). Throttle to 2Hz (500ms).
            if (now - this._lastBadgeUpdate >= 500) {
                this._lastBadgeUpdate = now;
                this._updateBadges();
            }

            if (this._activePanel === 'generators') this._updateGenerators();
            if (this._activePanel === 'upgrades') this._updateUpgrades();
            if (this._activePanel === 'missions') this._updateMissions();
            if (this._activePanel === 'boss_battle') this._renderBossInfoContent();
            if (this._worldOpen) this._updateBossWorld();
            if (this._activePanel === 'profile') this._updateProfileStats();
            if (this._activePanel === 'shop') this._updateShop();
            if (this._activePanel === 'skills') this._updateSkillPoints();
            if (this._activePanel === 'rebirth') this._updateRebirthProgress();
        } catch (e) {
            console.error('[UIUpdate]', e);
        }
    }

    _getBadgeCounts() {
        const g = this._game;
        const badges = {};

        const affordableGens = GENERATORS.filter(gen => {
            const cost = g.upgradeManager.getGeneratorCost(gen.id);
            return g.economy.canAfford(cost);
        }).length;
        if (affordableGens > 0) badges.generators = affordableGens;

        const affordableUpgs = g.upgradeManager.getAvailableUpgrades().filter(u =>
            u.currency === 'tokens' ? g.economy.prestigeTokens >= u.cost : g.economy.canAfford(u.cost)
        ).length;
        if (affordableUpgs > 0) badges.upgrades = affordableUpgs;

        const prestTokens = g.economy.calcPrestigeTokens();
        if (prestTokens > 0) badges.rebirth = prestTokens;

        // Active claimable — use getActiveMissions() to match exactly what Ativas tab shows
        const claimableActive = g.missions.getActiveMissions().filter(m =>
            m.cooldown !== 'daily' && m.cooldown !== 'weekly' &&
            g.missions.completed.has(m.id) && !g.missions.claims.has(m.id)
        ).length;
        // Daily/weekly claimable — what the Agenda tab shows
        const claimableDaily = (typeof MISSIONS !== 'undefined' ? MISSIONS : []).filter(m =>
            (m.cooldown === 'daily' || m.cooldown === 'weekly') &&
            g.missions.completed.has(m.id) && !g.missions.claims.has(m.id)
        ).length;
        const claimableTotal = claimableActive + claimableDaily;
        if (claimableTotal > 0) badges.missions = claimableTotal;  // inclui ativas + agenda

        const moreTotal = (badges.missions || 0) + (badges.rebirth ? 1 : 0) + (badges.upgrades || 0);
        if (moreTotal > 0) badges.more = moreTotal;

        // Group badge aggregates
        const neuralTotal = (badges.generators || 0) + (badges.upgrades || 0) + (badges.rebirth ? 1 : 0);
        if (neuralTotal > 0) badges.neural = neuralTotal;
        if (claimableTotal > 0) badges.agenda = claimableTotal;  // agenda shows full total

        if (this._friendsPending > 0) badges.friends = this._friendsPending;

        // Skills: contagem por categoria e total
        if (typeof SKILLS !== 'undefined') {
            const sp = g.skills.skillPoints;
            if (sp > 0) {
                const catCounts = {};
                SKILLS.forEach(skill => {
                    if (g.skills.canUpgrade(skill.id)) {
                        catCounts[skill.category] = (catCounts[skill.category] || 0) + 1;
                    }
                });
                const skillTotal = Object.values(catCounts).reduce((s, n) => s + n, 0);
                if (skillTotal > 0) {
                    badges.skills           = skillTotal;
                    badges.skills_click     = catCounts['click']       || 0;
                    badges.skills_generator = catCounts['generator']   || 0;
                    badges.skills_progress  = catCounts['progression'] || 0;
                    badges.neural = (badges.neural || 0) + skillTotal;
                }
            }
        }

        return badges;
    }

    _updateBadges() {
        const counts = this._getBadgeCounts();
        const btns   = this._badgeBtns;
        ['neural', 'agenda', 'generators', 'upgrades', 'missions', 'rebirth', 'more', 'skills'].forEach(p => {
            const count   = counts[p];
            const label   = count > 0 ? (count > 99 ? '99+' : String(count)) : null;
            const btnList = btns ? btns[p] : document.querySelectorAll(`.sidebar-btn[data-panel="${p}"], .mobile-nav-btn[data-panel="${p}"]`);
            btnList.forEach(btn => {
                if (label) btn.setAttribute('data-badge', label);
                else btn.removeAttribute('data-badge');
            });
        });

        // Update in-hub badges when a nav group is open
        if (this._activePanel === 'neural' || this._activePanel === 'agenda' || this._activePanel === 'conta') {
            document.querySelectorAll('.cat-hub-btn').forEach(btn => {
                const onclick = btn.getAttribute('onclick') || '';
                const match = onclick.match(/'([^']+)'/);
                if (!match) return;
                const pid = match[1];
                const count = counts[pid] || 0;
                let badge = btn.querySelector('.cat-hub-badge');
                if (count > 0) {
                    if (!badge) {
                        badge = document.createElement('span');
                        badge.className = 'cat-hub-badge';
                        btn.insertBefore(badge, btn.firstChild);
                    }
                    badge.textContent = count > 99 ? '99+' : count;
                    badge.style.display = '';
                } else if (badge) {
                    badge.style.display = 'none';
                }
            });
        }

        if (this._activePanel === 'more') {
            ['generators', 'upgrades', 'missions', 'rebirth'].forEach(p => {
                const badge = document.getElementById(`more-badge-${p}`);
                if (badge) {
                    const count = counts[p] || 0;
                    badge.textContent = count > 0 ? (count > 99 ? '99+' : count) : '';
                    badge.style.display = count > 0 ? 'inline-flex' : 'none';
                }
            });
        }
    }

    _updateHUD() {
        const g = this._game;
        this._setEl('neuron-count', formatNum(g.economy.neurons) + ' ⚡');
        this._setEl('nps-display', formatNum(g.economy.getEffectiveNPS()) + '/s');
        this._setEl('click-value', '+' + formatNum(g.economy.getClickValue() * g.combo.getMult()));
        this._setEl('level-display', (window.LANG ? LANG.t('hud.level') : 'NVL ') + g.level.level);
        this._setEl('token-display', '💎 ' + g.economy.prestigeTokens);
        this._setEl('prestige-display', '♻ ' + g.economy.totalPrestiges);

        const lp = g.level.getProgress();
        const xpBar = document.getElementById('xp-bar');
        if (xpBar) xpBar.style.width = (lp.pct * 100) + '%';
        this._setEl('xp-text', `${formatNum(lp.cur)} / ${formatNum(lp.max)} XP`);
    }

    /**
     * Updates the prestige-char DOM element based on current economy progress.
     * The character emoji & color come from the active PrestigeAura theme.
     * Stages: invisible → forming-1 → forming-2 → forming-3 → forming-4 → prestige-ready
     */
    _updatePrestigeCharacter() {
        const el = document.getElementById('prestige-char');
        if (!el) return;
        const g = this._game;
        const progress = Math.min(1, g.economy.totalNeurons / Math.max(1, g.economy.getPrestigeCost()));
        const SHOW_AT  = 0.04;

        if (progress < SHOW_AT) {
            el.dataset.stage = 'hidden';
            return;
        }

        const themes = PrestigeAura.THEMES;
        const theme  = themes[g.economy.totalPrestiges % themes.length];
        el.textContent = '';
        el.style.setProperty('--pc-color', theme.c1);
        el.style.setProperty('--pc-color2', theme.c2);

        let stage;
        if (progress >= 1.0)  stage = 'ready';
        else if (progress >= 0.75) stage = 'f4';
        else if (progress >= 0.50) stage = 'f3';
        else if (progress >= 0.25) stage = 'f2';
        else                       stage = 'f1';

        if (el.dataset.stage !== stage) el.dataset.stage = stage;
    }

    setGenQty(qty) {
        this._genBuyQty = qty;
        document.querySelectorAll('.gen-qty-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.qty === String(qty));
        });
        this._updateGenerators();
    }

    _buildQtyRow() {
        const q = this._genBuyQty;
        return [1, 10, 25, 100].map(n =>
            `<button class="gen-qty-btn${q === n ? ' active' : ''}" data-qty="${n}"
                     onclick="window.game.ui.setGenQty(${n})">×${n}</button>`
        ).join('') +
        `<button class="gen-qty-btn gen-qty-max${q === 'max' ? ' active' : ''}" data-qty="max"
                 onclick="window.game.ui.setGenQty('max')">MAX</button>`;
    }

    _renderGenerators(container) {
        const qtyRow = this._buildQtyRow();
        let html = '<div id="generators-list" style="display:flex;flex-direction:column;gap:6px;">';
        GENERATORS.forEach(g => {
            html += `
                <div class="gen-item" id="gen-${g.id}">
                    <div class="gen-item-main">
                        <div class="gen-icon">${g.icon}</div>
                        <div class="gen-info">
                            <div class="gen-name">${g.name}</div>
                            <div class="gen-subdesc">${g.desc}</div>
                            <div class="gen-rate" id="gr-${g.id}">+${formatNum(g.baseRate)}/s ${(window.LANG||{t:k=>k}).t('gen.rate.each')}</div>
                            <div class="gen-preview" id="gp-${g.id}"></div>
                        </div>
                        <div class="gen-count" id="gc-${g.id}">0</div>
                    </div>
                    <div class="gen-item-footer">
                        <div class="gen-qty-row">${qtyRow}</div>
                        <button class="gen-buy-btn" id="gb-${g.id}" onclick="window.game.buyGenerator('${g.id}')">
                            <span id="gcost-${g.id}">0 ⚡</span>
                        </button>
                    </div>
                </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
        this._updateGenerators();
    }

    _updateGenerators() {
        if (!document.getElementById('generators-list')) return;
        const qty = this._genBuyQty;
        GENERATORS.forEach(g => {
            const um = this._game.upgradeManager;
            const eco = this._game.economy;
            const count = um.generators[g.id]?.count || 0;
            const unlocked = eco.totalNeurons >= g.unlockAt || count > 0;

            const item = document.getElementById('gen-' + g.id);
            if (item) item.style.display = unlocked ? '' : 'none';
            this._setEl('gc-' + g.id, count);

            // Cost & affordability based on qty
            let cost, canAfford, n;
            if (qty === 'max') {
                n = um.calcMaxBuy(g.id, eco.neurons);
                cost = n > 0 ? um.getGeneratorCostN(g.id, n) : um.getGeneratorCost(g.id);
                canAfford = n > 0;
            } else {
                n = qty;
                cost = qty === 1 ? um.getGeneratorCost(g.id) : um.getGeneratorCostN(g.id, qty);
                canAfford = eco.canAfford(cost);
            }

            const costLabel = `${formatNum(cost)} ⚡`;
            this._setEl('gcost-' + g.id, costLabel);

            const btn = document.getElementById('gb-' + g.id);
            if (btn) { btn.disabled = !canAfford; btn.classList.toggle('can-afford', canAfford); }

            // Rate display
            const genMult = um._genMultipliers[g.id] || 1;
            const effectiveRate = g.baseRate * genMult;
            const rateEl = document.getElementById('gr-' + g.id);
            if (rateEl) {
                rateEl.textContent = genMult > 1
                    ? `+${formatNum(effectiveRate)}/s (×${genMult})`
                    : `+${formatNum(g.baseRate)}/s ${(window.LANG||{t:k=>k}).t('gen.rate.each')}`;
            }

            // Production preview
            const previewEl = document.getElementById('gp-' + g.id);
            if (previewEl) {
                if (count > 0) {
                    const buyN = qty === 'max' ? n : qty;
                    const cur = effectiveRate * count;
                    const after = effectiveRate * (count + buyN);
                    previewEl.textContent = buyN > 1
                        ? `${formatNum(cur)}/s → ${formatNum(after)}/s (+${buyN})`
                        : `${formatNum(cur)}/s → ${formatNum(after)}/s`;
                } else {
                    previewEl.textContent = '';
                }
            }
        });
    }

    _getUpgradeDesc(upg) {
        const g = this._game;
        const um = g.upgradeManager;
        const eco = g.economy;
        if (upg.type === 'click') {
            const cur = eco.getClickValue();
            const after = Math.max(1, Math.ceil(cur * upg.mult));
            return `Clique: ${formatNum(cur)} → <strong>${formatNum(after)}</strong> ⚡ &nbsp;(×${upg.mult})`;
        }
        if (upg.type === 'gen') {
            const gd = GENERATORS.find(x => x.id === upg.genId);
            const name = gd ? gd.name : upg.genId;
            const curMult = um._genMultipliers[upg.genId] || 1;
            const count = um.generators[upg.genId]?.count || 0;
            if (count > 0) {
                const cur = gd.baseRate * curMult * count;
                const after = gd.baseRate * curMult * upg.mult * count;
                return `${name}: ${formatNum(cur)}/s → <strong>${formatNum(after)}/s</strong> &nbsp;(×${upg.mult})`;
            }
            return `${name} produzem <strong>${upg.mult}×</strong> mais neurônios.`;
        }
        if (upg.type === 'global') {
            const cur = eco.getEffectiveNPS();
            if (cur > 0) {
                return `Produção: ${formatNum(cur)}/s → <strong>${formatNum(cur * upg.mult)}/s</strong> &nbsp;(×${upg.mult})`;
            }
            return upg.desc + ` <strong>(×${upg.mult})</strong>`;
        }
        return upg.desc;
    }

    _renderUpgrades(container) {
        if (!container) return;
        const available = this._game.upgradeManager.getAvailableUpgrades();
        const purchased = UPGRADES.filter(u => this._game.upgradeManager.purchasedUpgrades.has(u.id));

        if (available.length === 0 && purchased.length === 0) {
            container.innerHTML = `<div class="empty-msg">${(window.LANG||{t:k=>k}).t('upgrades.no.generators')}</div>`;
            return;
        }

        let html = '<div id="upgrades-list" style="display:flex;flex-direction:column;gap:5px;">';
        available.forEach(u => {
            const canAfford = u.currency === 'tokens'
                ? this._game.economy.prestigeTokens >= u.cost
                : this._game.economy.canAfford(u.cost);
            html += `
                <div id="upg-item-${u.id}" class="upgrade-item ${canAfford ? 'can-afford' : ''}" onclick="window.game.buyUpgrade('${u.id}')">
                    <span class="upg-icon">${u.icon}</span>
                    <div class="upg-info">
                        <div class="upg-name">${u.name}</div>
                        <div class="upg-desc">${this._getUpgradeDesc(u)}</div>
                        <div class="upg-cost">${formatNum(u.cost)} ${u.currency === 'tokens' ? '💎' : '⚡'}</div>
                    </div>
                </div>`;
        });

        if (purchased.length > 0) {
            html += `<div class="upg-separator">${(window.LANG||{t:k=>k}).t('upgrades.purchased')}</div>`;
            purchased.forEach(u => {
                html += `
                <div class="upgrade-item purchased">
                    <span class="upg-icon">${u.icon}</span>
                    <div class="upg-info">
                        <div class="upg-name">${u.name}</div>
                        <div class="upg-desc upg-desc-done">${u.desc}</div>
                    </div>
                </div>`;
            });
        }
        html += '</div>';

        container.innerHTML = html;
    }

    _updateUpgrades() {
        const list = document.getElementById('upgrades-list');
        if (!list) {
            this._renderUpgrades(document.getElementById('modal-content'));
            return;
        }
        
        const available = this._game.upgradeManager.getAvailableUpgrades();
        
        // Check if number of available upgrades matches DOM. If not, re-render completely.
        const domAvailable = list.querySelectorAll('.upgrade-item:not(.purchased)').length;
        if (domAvailable !== available.length) {
            this._renderUpgrades(document.getElementById('modal-content'));
            return;
        }
        
        // Update classes
        available.forEach(u => {
            const el = document.getElementById('upg-item-' + u.id);
            if (el) {
                const canAfford = u.currency === 'tokens'
                    ? this._game.economy.prestigeTokens >= u.cost
                    : this._game.economy.canAfford(u.cost);
                if (canAfford) el.classList.add('can-afford');
                else el.classList.remove('can-afford');
            } else {
                this._renderUpgrades(document.getElementById('modal-content'));
            }
        });
    }

    _renderAchievements(container) {
        const all = this._game.achievements.getProgress(
            this._game.stats, this._game.economy, this._game.upgradeManager);

        let html = '<div id="achievements-list" style="display:flex;flex-direction:column;gap:5px;">';
        all.forEach(a => {
            if (a.secret && !a.done) return;
            const prog = a.progress && !a.done ? (() => {
                const isTime = a.type === 'playtime';
                const curStr = isTime ? formatDuration(a.progress.cur) : formatNum(a.progress.cur);
                const maxStr = isTime ? formatDuration(a.progress.max) : formatNum(a.progress.max);
                const pct    = Math.min(100, a.progress.cur / a.progress.max * 100);
                return `<div class="ach-prog"><div class="ach-prog-bar" style="width:${pct}%"></div></div><div class="ach-prog-label">${curStr} / ${maxStr}</div>`;
            })() : '';
            html += `
                <div class="achievement-item ${a.done ? 'done' : ''}">
                    <span class="ach-icon">${a.done ? a.icon : '🔒'}</span>
                    <div class="ach-info">
                        <div class="ach-name">${a.done ? a.name : '???'}</div>
                        ${a.done || a.progress ? `<div class="ach-desc">${a.desc}</div>` : ''}
                        ${prog}
                    </div>
                </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    }

    _renderMissions(container, tabsContainer) {
        if (!['active', 'daily', 'completed'].includes(this._activeTab)) this._activeTab = 'active';
        this._missionsStateKey = null; // force full rebuild on open

        const g = this._game;
        const claimableActive = g.missions.getActiveMissions().filter(m =>
            m.cooldown !== 'daily' && m.cooldown !== 'weekly' &&
            g.missions.completed.has(m.id) && !g.missions.claims.has(m.id)
        ).length;
        const claimableAgenda = (typeof MISSIONS !== 'undefined' ? MISSIONS : []).filter(m =>
            (m.cooldown === 'daily' || m.cooldown === 'weekly') &&
            g.missions.completed.has(m.id) && !g.missions.claims.has(m.id)
        ).length;

        const badgeAttr = n => n > 0 ? ` data-badge="${n > 99 ? '99+' : n}"` : '';

        const _mL = window.LANG || { t: k => k };
        tabsContainer.innerHTML = `
            <button class="tab-btn tab-btn--badgeable ${this._activeTab === 'active' ? 'active' : ''}"${badgeAttr(claimableActive)} onclick="window.game.ui._activeTab='active'; window.game.ui._missionsStateKey=null; window.game.ui._renderPanelContent('missions')">${_mL.t('missions.tab.active')}</button>
            <button class="tab-btn tab-btn--badgeable ${this._activeTab === 'daily' ? 'active' : ''}"${badgeAttr(claimableAgenda)} onclick="window.game.ui._activeTab='daily'; window.game.ui._missionsStateKey=null; window.game.ui._renderPanelContent('missions')">${_mL.t('missions.tab.daily')}</button>
            <button class="tab-btn ${this._activeTab === 'completed' ? 'active' : ''}" onclick="window.game.ui._activeTab='completed'; window.game.ui._missionsStateKey=null; window.game.ui._renderPanelContent('missions')">${_mL.t('missions.tab.done')}</button>
        `;
        container.innerHTML = `
            <div id="missions-claim-bar" class="mission-claim-all-bar" style="display:none;"></div>
            <div id="missions-list" style="display:flex;flex-direction:column;"></div>
        `;
        this._updateMissions();
    }

    _getMissionsStateKey() {
        const g = this._game;
        // Sizes are monotonically increasing (except repeatable resets), so equal sizes
        // mean equal contents. This avoids the expensive Set→array→sort→join per 100ms.
        return `${this._activeTab}|${g.missions.completed.size}|${g.missions.claims.size}`;
    }

    _updateMissions() {
        const list = document.getElementById('missions-list');
        if (!list) return;

        if (!['active', 'daily', 'completed'].includes(this._activeTab)) this._activeTab = 'active';
        const g = this._game;

        // Determine if list structure changed — if so, do a full rebuild
        const stateKey = this._getMissionsStateKey();
        if (stateKey !== this._missionsStateKey) {
            this._missionsStateKey = stateKey;
            this._rebuildMissionsList(list);
        } else {
            // State unchanged — only update progress bars and timers in-place (no DOM rebuild = no hover flicker)
            list.querySelectorAll('.mission-item[data-mission-id]').forEach(item => {
                const id = item.dataset.missionId;
                const m = g.missions._getMission(id); // O(1) cached map lookup
                if (!m) return;
                const p = g.missions.progress[id] || { cur: 0, max: m.value, pct: 0 };
                const pct = Math.min(1, p.pct !== undefined ? p.pct : (p.cur / p.max));
                const fill = item.querySelector('.mission-fill');
                if (fill) fill.style.width = (pct * 100) + '%';
                const prog = item.querySelector('.mission-progress');
                if (prog) prog.textContent = formatNum(p.cur) + ' / ' + formatNum(p.max);
                const pctEl = item.querySelector('.mission-pct');
                if (pctEl) {
                    pctEl.textContent = (pct * 100).toFixed(0) + '%';
                    pctEl.classList.toggle('mission-pct-done', pct >= 1);
                }
            });
            // Update countdown timers in-place (daily tab only)
            const dailyTimer = document.getElementById('daily-timer-badge');
            if (dailyTimer) dailyTimer.textContent = '⏱ ' + formatTime(Math.floor(this._getTimeUntilMidnight()));
            const weeklyTimer = document.getElementById('weekly-timer-badge');
            if (weeklyTimer) weeklyTimer.textContent = '⏱ ' + formatTime(Math.floor(this._getTimeUntilWeekReset()));
        }

        // Always sync the claim-all bar
        this._updateMissionsClaimBar();
    }

    _rebuildMissionsList(list) {
        const tab = this._activeTab;
        const g = this._game;

        if (tab === 'active') {
            // getActiveMissions() already excludes claimed ones; include completed-but-unclaimed so user sees the claim button here
            const active = g.missions.getActiveMissions().filter(m =>
                m.cooldown !== 'daily' && m.cooldown !== 'weekly'
            );
            if (active.length === 0) {
                list.innerHTML = `<div class="empty-msg">${(window.LANG||{t:k=>k}).t('missions.none.active')}</div>`;
                return;
            }
            list.innerHTML = active.map(m => {
                const p = g.missions.progress[m.id] || { cur: 0, max: m.value, pct: 0 };
                const isCompleted = g.missions.completed.has(m.id);
                return this._buildMissionItemHTML(m, p, false, isCompleted);
            }).join('');

        } else if (tab === 'daily') {
            const dailyMissions = MISSIONS.filter(m => m.cooldown === 'daily');
            const weeklyMissions = MISSIONS.filter(m => m.cooldown === 'weekly');
            const dailySecs = this._getTimeUntilMidnight();
            const weeklySecs = this._getTimeUntilWeekReset();

            let html = '';
            if (dailyMissions.length > 0) {
                html += `<div class="missions-section-header">
                    <span>${(window.LANG||{t:k=>k}).t('missions.daily.header')}</span>
                    <span class="mission-timer-badge" id="daily-timer-badge">⏱ ${formatTime(Math.floor(dailySecs))}</span>
                </div>`;
                html += dailyMissions.map(m => {
                    const p = g.missions.progress[m.id] || { cur: 0, max: m.value, pct: 0 };
                    return this._buildMissionItemHTML(m, p, g.missions.claims.has(m.id), g.missions.completed.has(m.id));
                }).join('');
            }
            if (weeklyMissions.length > 0) {
                html += `<div class="missions-section-header" style="margin-top:16px;">
                    <span>${(window.LANG||{t:k=>k}).t('missions.weekly.header')}</span>
                    <span class="mission-timer-badge" id="weekly-timer-badge">⏱ ${formatTime(Math.floor(weeklySecs))}</span>
                </div>`;
                html += weeklyMissions.map(m => {
                    const p = g.missions.progress[m.id] || { cur: 0, max: m.value, pct: 0 };
                    return this._buildMissionItemHTML(m, p, g.missions.claims.has(m.id), g.missions.completed.has(m.id));
                }).join('');
            }
            list.innerHTML = html || `<div class="empty-msg">${(window.LANG||{t:k=>k}).t('missions.none.daily')}</div>`;

        } else if (tab === 'completed') {
            const done = MISSIONS.filter(m =>
                m.cooldown !== 'daily' && m.cooldown !== 'weekly' && g.missions.claims.has(m.id)
            );
            if (done.length === 0) {
                list.innerHTML = `<div class="empty-msg">${(window.LANG||{t:k=>k}).t('missions.none.done')}</div>`;
                return;
            }
            list.innerHTML = done.map(m => {
                const p = g.missions.progress[m.id] || { cur: m.value, max: m.value, pct: 1 };
                return this._buildMissionItemHTML(m, p, true, true);
            }).join('');
        }
    }

    _buildMissionItemHTML(m, p, isClaimed, isCompleted) {
        const rarity = m.rarity || 'common';
        const pct = Math.min(1, p.pct !== undefined ? p.pct : (p.cur / p.max));
        const pctNum = (pct * 100).toFixed(0);

        const rewards = [];
        if (m.reward?.xp) rewards.push(`<div class="reward-chip xp">+${formatNum(m.reward.xp)} XP</div>`);
        if (m.reward?.neurons) rewards.push(`<div class="reward-chip neuron">+${formatNum(m.reward.neurons)} ⚡</div>`);
        if (m.reward?.neurons_pct) rewards.push(`<div class="reward-chip neuron">+${(m.reward.neurons_pct * 100).toFixed(0)}% ⚡</div>`);
        if (m.reward?.tokens) rewards.push(`<div class="reward-chip token">+${m.reward.tokens} 💎</div>`);

        const _cL = window.LANG || { t: k => k };
        const topRight = isClaimed
            ? `<span class="mission-claimed-badge">${_cL.t('missions.claimed')}</span>`
            : '';
        const claimBtn = isCompleted && !isClaimed
            ? `<button class="mission-claim-btn" onclick="window.game.ui._claimMission('${m.id}')">${_cL.t('missions.claim')}</button>`
            : '';

        const stateClass = isClaimed ? 'completed claimed' : (isCompleted ? 'completed' : '');

        return `
            <div class="mission-item ${stateClass}" data-rarity="${rarity}" data-mission-id="${m.id}">
                <div class="mission-top">
                    <div class="mission-title-group">
                        <span class="mission-icon">${m.icon}</span>
                        <div class="mission-name-col">
                            <span class="mission-name">${m.name}</span>
                            <span class="mission-diff">${'★'.repeat(m.difficulty || 1)}</span>
                        </div>
                    </div>
                    ${topRight}
                </div>
                <div class="mission-desc">${m.desc}</div>
                ${rewards.length ? `<div class="mission-rewards">${rewards.join('')}</div>` : ''}
                <div class="mission-progress-section">
                    <div class="mission-bar">
                        <div class="mission-fill ${isCompleted || isClaimed ? 'shimmer-active' : ''}" style="width:${pct * 100}%"></div>
                    </div>
                    <div class="mission-stats-row">
                        <span class="mission-progress">${formatNum(p.cur)} / ${formatNum(p.max)}</span>
                        <span class="mission-pct ${pct >= 1 ? 'mission-pct-done' : ''}">${pctNum}%</span>
                    </div>
                </div>
                ${claimBtn}
            </div>`;
    }

    _getTimeUntilMidnight() {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        return Math.max(0, (midnight - now) / 1000);
    }

    _getTimeUntilWeekReset() {
        const now = new Date();
        const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
        const next = new Date(now);
        next.setDate(now.getDate() + daysUntilMonday);
        next.setHours(0, 0, 0, 0);
        return Math.max(0, (next - now) / 1000);
    }

    _getClaimableMissions() {
        const g = this._game;
        return (typeof MISSIONS !== 'undefined' ? MISSIONS : []).filter(m =>
            g.missions.completed.has(m.id) && !g.missions.claims.has(m.id)
        );
    }

    _getClaimableMissionsByTab(tab) {
        const g = this._game;
        if (tab === 'active') {
            // Use getActiveMissions() as source — exact same filter as the Ativas list
            return g.missions.getActiveMissions().filter(m =>
                m.cooldown !== 'daily' && m.cooldown !== 'weekly' &&
                g.missions.completed.has(m.id) && !g.missions.claims.has(m.id)
            );
        }
        const all = this._getClaimableMissions();
        if (tab === 'daily') return all.filter(m => m.cooldown === 'daily' || m.cooldown === 'weekly');
        return all;
    }

    _updateMissionsClaimBar() {
        const bar = document.getElementById('missions-claim-bar');
        if (!bar) return;

        const showBar = this._activeTab === 'active' || this._activeTab === 'daily';
        if (!showBar) { bar.style.display = 'none'; bar.innerHTML = ''; bar._lastN = -1; return; }

        const n = this._getClaimableMissionsByTab(this._activeTab).length;
        if (bar._lastN === n) return;
        bar._lastN = n;
        if (n === 0) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
        bar.style.display = 'flex';
        const _bL = window.LANG || { t: k => k };
        bar.innerHTML = `
            <span class="mca-count">🎁 ${n} ${n > 1 ? _bL.t('missions.ready.pl') : _bL.t('missions.ready')}</span>
            <button class="mca-btn" onclick="window.game.ui.claimAllMissions()">${_bL.t('missions.claim.all')}</button>
        `;
    }

    _claimMission(id) {
        const g = this._game;
        if (!g?.missions) return;
        const claimed = g.missions.claimMission(id, true); // silent — we handle the re-render here
        if (claimed) this._renderPanelContent('missions');
    }

    claimAllMissions() {
        const g = window.game;
        if (!g?.missions) return;
        const ids = this._getClaimableMissionsByTab(this._activeTab).map(m => m.id);
        const count = g.missions.claimAll(ids);
        if (count > 0 && this._activePanel === 'missions') this._renderPanelContent('missions');
    }

    _renderProfile(container) {
        const g = this._game;
        const acc = g.account;
        const isLoggedIn = acc.isLoggedIn();
        const hasAccount = acc.hasAccount();

        const showingRegisterForLocal = acc.isLocalOnly() && this._profileAuthMode === 'register';

        let accountSection = '';
        if (isLoggedIn && !showingRegisterForLocal) {
            const a = acc.getAccount();
            const since = new Date(a.createdAt || Date.now()).toLocaleDateString('pt-BR');
            const vipBadge = acc.isVip() ? `<span class="vip-profile-badge">👑 VIP</span>` : '';
            const isLocalOnly = acc.isLocalOnly();
            const avatarHTML = `<img class="profile-photo-img${acc.isVip() ? ' profile-avatar-vip' : ''}" src="${acc.getPhotoUrl()}" alt="Foto" id="profile-photo-el">`;

            const localBanner = isLocalOnly ? `
                <div class="profile-local-banner">
                    ${(window.LANG||{t:k=>k}).t('profile.local.warning')} — <button class="profile-link-btn" id="profile-go-register" style="display:inline;font-size:11px;">${(window.LANG||{t:k=>k}).t('profile.local.create')}</button> ${(window.LANG||{t:k=>k}).t('profile.local.cloud')}
                </div>` : '';

            accountSection = `
                ${localBanner}
                <div class="profile-card">
                    <div class="profile-avatar-wrap">
                        ${avatarHTML}
                        ${!isLocalOnly ? `<button class="profile-photo-change-btn" id="profile-photo-change" title="Alterar foto">📷</button>
                        <input type="file" id="profile-photo-input" accept="image/jpeg,image/png,image/gif,image/webp" style="display:none">
                        ${acc.hasCustomPhoto() ? `<button class="profile-photo-remove-btn" id="profile-photo-remove" title="Remover foto">🗑</button>` : ''}` : ''}
                    </div>
                    <div class="profile-card-info">
                        <div class="profile-username${acc.isVip() ? ' profile-username-vip' : ''}">${a.username}${vipBadge}</div>
                        <div class="profile-email">${a.email || (window.LANG||{t:k=>k}).t('profile.local.label')}</div>
                        <div class="profile-since">${(window.LANG||{t:k=>k}).t('profile.since')} ${since}</div>
                    </div>
                    <button class="profile-action-btn" id="profile-logout">${(window.LANG||{t:k=>k}).t('profile.logout')}</button>
                </div>`;
        } else if (hasAccount && this._profileAuthMode === 'login') {
            const _pL = window.LANG || { t: k => k };
            accountSection = `
                <div class="profile-auth-form">
                    <div class="profile-auth-title">${_pL.t('profile.login.title')}</div>
                    <input class="profile-input" id="profile-login-user" type="text" placeholder="${_pL.t('profile.login.user')}" autocomplete="username">
                    <input class="profile-input" id="profile-login-pass" type="password" placeholder="${_pL.t('profile.login.pass')}" autocomplete="current-password">
                    <button class="profile-submit-btn" id="profile-login-btn">${_pL.t('profile.login.btn')}</button>
                    <div class="profile-auth-msg" id="profile-auth-msg"></div>
                    <button class="profile-link-btn" id="profile-go-register">${_pL.t('profile.go.register')}</button>
                </div>`;
        } else {
            const _pL = window.LANG || { t: k => k };
            accountSection = `
                <div class="profile-auth-form">
                    <div class="profile-auth-title">${_pL.t('profile.register.title')}</div>
                    <div class="auth-photo-row" style="margin-bottom:10px;">
                        <label class="auth-photo-label" for="profile-reg-photo" title="${_pL.t('profile.register.photo')}">
                            <div class="auth-photo-preview" id="profile-photo-preview">📷</div>
                            <span class="auth-photo-hint">${_pL.t('profile.register.photo')}</span>
                        </label>
                        <input type="file" id="profile-reg-photo" accept="image/jpeg,image/png,image/gif,image/webp" style="display:none;">
                    </div>
                    <input class="profile-input" id="profile-reg-user" type="text" placeholder="${_pL.t('profile.register.user')}" autocomplete="username" maxlength="12">
                    <input class="profile-input" id="profile-reg-email" type="email" placeholder="${_pL.t('profile.register.email')}" autocomplete="email">
                    <input class="profile-input" id="profile-reg-pass" type="password" placeholder="${_pL.t('profile.register.pass')}" autocomplete="new-password">
                    <button class="profile-submit-btn" id="profile-reg-btn">${_pL.t('profile.register.btn')}</button>
                    <div class="profile-auth-msg" id="profile-auth-msg"></div>
                    ${(hasAccount && !acc.isLocalOnly()) ? `<button class="profile-link-btn" id="profile-go-login">${_pL.t('profile.register.have')}</button>` : ''}
                    ${acc.isLocalOnly() ? `<button class="profile-link-btn" id="profile-go-login">${_pL.t('profile.register.cancel')}</button>` : ''}
                </div>`;
        }

        const stats = this._getStatsData();
        const statsHTML = stats.map((s, i) => {
            if (!s[0]) {
                return `<div class="stat-section-label">${s[1]}</div>`;
            }
            return `<div class="stat-card"><span class="stat-icon">${s[0]}</span><span class="stat-label">${s[1]}</span><span class="stat-value" id="stat-val-${i}">${s[2]}</span></div>`;
        }).join('');

        container.innerHTML = accountSection + `
            <div class="profile-stats-section">
                <div class="profile-stats-title">${(window.LANG||{t:k=>k}).t('profile.stats.title')}</div>
                <div id="stats-list">${statsHTML}</div>
            </div>`;

        // Bind photo upload (change existing photo)
        const photoInput = document.getElementById('profile-photo-input');
        if (photoInput) {
            photoInput.addEventListener('change', async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const btn = document.getElementById('profile-photo-change');
                if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
                const result = await this._game.account.uploadPhoto(file);
                if (result.ok) {
                    this._renderPanelContent('profile');
                } else {
                    if (btn) { btn.disabled = false; btn.textContent = '📷'; }
                    this._game.notify(result.msg || 'Erro ao enviar foto.', 'error');
                }
            });
        }

        // Bind register photo preview
        const regPhotoInput = document.getElementById('profile-reg-photo');
        if (regPhotoInput) {
            regPhotoInput.addEventListener('change', () => {
                const file    = regPhotoInput.files?.[0];
                const preview = document.getElementById('profile-photo-preview');
                if (!preview) return;
                if (file) {
                    const url = URL.createObjectURL(file);
                    preview.innerHTML = `<img src="${url}" alt="Foto">`;
                } else {
                    preview.textContent = '📷';
                }
            });
        }
    }

    _updateProfileStats() {
        const list = document.getElementById('stats-list');
        if (!list) return;
        const stats = this._getStatsData();
        stats.forEach((s, i) => {
            if (!s[0]) return; // skip section labels
            const el = document.getElementById('stat-val-' + i);
            if (el && el.textContent !== String(s[2])) el.textContent = s[2];
        });
    }

    _getStatsData() {
        const g = this._game;
        const critChance = ((Config.CRITICAL_CHANCE + g.skills.getCritBonus() + g.shop.getCritBonus()) * 100).toFixed(1);
        const _s = window.LANG || { t: k => k };
        return [
            ['', _s.t('stats.progression'), ''],
            ['⭐', _s.t('stats.level'),             g.level.level],
            ['📊', _s.t('stats.xp.total'),          formatNum(g.level.totalXp)],
            ['👑', _s.t('stats.prestiges'),         g.economy.totalPrestiges],
            ['✦',  _s.t('stats.prestige.mult'),     g.economy._prestigeMult.toFixed(2) + '×'],
            ['🧬', _s.t('stats.skill.points'),      g.skills.skillPoints + ' SP'],
            ['💎', _s.t('stats.diamonds'),          g.economy.prestigeTokens],
            ['', _s.t('stats.neurons.section'), ''],
            ['🧠', _s.t('stats.neurons.lifetime'),  formatNum(g.economy.lifetimeNeurons)],
            ['⚡', _s.t('stats.neurons.cycle'),     formatNum(g.economy.totalNeurons)],
            ['⚡', _s.t('stats.neurons.ps'),        formatNum(g.economy.getEffectiveNPS()) + '/s'],
            ['👆', _s.t('stats.click.value'),       formatNum(g.economy.getClickValue())],
            ['', _s.t('stats.combat'), ''],
            ['🖱️', _s.t('stats.clicks.total'),     formatNum(g.stats.totalClicks)],
            ['💥', _s.t('stats.clicks.crit'),       formatNum(g.stats.critClicks)],
            ['🎯', _s.t('stats.crit.chance'),       critChance + '%'],
            ['', _s.t('stats.ach.section'), ''],
            ['🏆', _s.t('stats.ach.section'),       g.achievements.unlocked.size + ' / ' + ACHIEVEMENTS.length],
            ['✅', _s.t('stats.missions.claimed'),  g.missions.claims.size],
            ['', _s.t('stats.boss.section'), ''],
            ['🗡️', _s.t('stats.boss.level'),        g.boss.userBossLevel],
            ['⚔️', _s.t('stats.boss.damage'),       formatNum(g.boss.lifetimeDamage)],
            ['💀', _s.t('stats.boss.kills'),        g.boss.bossKills],
            ['', _s.t('stats.general'), ''],
            ['🕐', _s.t('stats.playtime'),          formatTime(g.stats.playTime)],
        ];
    }

    _renderSettings(container) {
        const enabled  = this._game.audio.isEnabled();
        const sfxVol   = this._game.audio.sfxVol;
        const musicVol = this._game.audio.musicVol;
        const loggedIn = this._game.account.isLoggedIn();
        const L = window.LANG || { t: k => k, current: 'pt-BR', langName: c => c };
        const curLang = L.current;

        container.innerHTML = `
            <div class="settings-section">
                <label class="settings-label">${L.t('settings.audio')}</label>
                <button class="settings-btn${enabled ? '' : ' settings-btn-off'}" id="toggle-sound">
                    ${enabled ? L.t('settings.audio.on') : L.t('settings.audio.off')}
                </button>
                <label class="settings-label" style="margin-top:12px;">${L.t('settings.sfx')}</label>
                <div class="settings-row">
                    <input type="range" id="sfx-vol" min="0" max="1" step="0.05" value="${sfxVol}">
                    <span class="settings-vol-val">${Math.round(sfxVol * 100)}%</span>
                </div>
                <label class="settings-label">${L.t('settings.music')}</label>
                <div class="settings-row">
                    <input type="range" id="music-vol" min="0" max="1" step="0.05" value="${musicVol}">
                    <span class="settings-vol-val">${Math.round(musicVol * 100)}%</span>
                </div>
            </div>
            <div class="settings-section">
                <label class="settings-label">${L.t('settings.lang')}</label>
                <div class="settings-lang-group">
                    ${['pt-BR','en','es'].map(code => `
                    <button class="settings-lang-btn${curLang === code ? ' settings-lang-btn--active' : ''}"
                            onclick="window.LANG && window.LANG.set('${code}')">
                        ${L.langName(code)}
                    </button>`).join('')}
                </div>
            </div>
            <div class="settings-section">
                <label class="settings-label">${L.t('settings.save')}</label>
                <button class="settings-btn" id="export-save">${L.t('settings.export')}</button>
                <label class="settings-btn settings-btn-file" id="import-save-label" for="import-save-input">
                    ${L.t('settings.import')}
                </label>
                <input type="file" id="import-save-input" accept=".json" style="display:none;">
                <div id="import-save-msg" class="settings-import-msg"></div>
            </div>
            ${this._isElectron() ? '' : `
            <div class="settings-section">
                <label class="settings-label">${L.t('settings.desktop')}</label>
                <button class="settings-btn settings-btn-download" id="download-game-btn" onclick="window.game.ui._downloadGame()">
                    ${L.t('settings.download')}
                </button>
                <div class="settings-download-hint">${L.t('settings.windows')}</div>
            </div>`}
            <div class="settings-section">
                <label class="settings-label">${L.t('settings.danger')}</label>
                <button class="settings-btn danger" id="wipe-save">${L.t('settings.reset')}</button>
                ${loggedIn ? `<button class="settings-btn danger" id="delete-account-btn" style="margin-top:6px;">${L.t('settings.delete')}</button>` : ''}
            </div>
            <div class="settings-section" style="opacity:0.4;font-size:11px;text-align:center;">
                Nexarion Infinity v1.0.0 — ${L.t('settings.version')}
            </div>
        `;
    }

    _isElectron() {
        return /Electron/.test(navigator.userAgent);
    }

    _downloadGame() {
        const url = 'downloads/nexuscore-setup.exe';
        const a = document.createElement('a');
        a.href = url;
        a.download = 'nexuscore-setup.exe';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        this._game.notify('⬇ Download iniciado! Verifique sua pasta de downloads.', 'info');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ── Friends System ────────────────────────────────────────────────────────
    // ─────────────────────────────────────────────────────────────────────────

    _renderFriends(container, tabsContainer) {
        const g = this._game;
        if (!g.account.isLoggedIn() || g.account.isLocalOnly()) {
            tabsContainer.innerHTML = '';
            container.innerHTML = `<div class="friends-login-msg">
                <div style="font-size:40px;margin-bottom:12px">👥</div>
                <div style="font-size:14px;color:var(--cyan);font-weight:700;margin-bottom:8px">${(window.LANG||{t:k=>k}).t('friends.title')}</div>
                <div style="font-size:12px;color:var(--text-dim)">${(window.LANG||{t:k=>k}).t('friends.no.login.desc')}</div>
            </div>`;
            return;
        }

        if (this._friendsView === 'profile') { this._renderFriendProfileView(container, tabsContainer); return; }
        if (this._friendsView === 'compare') { this._renderFriendCompareView(container, tabsContainer); return; }

        const tab     = this._friendsTab;
        const pBadge  = this._friendsPending > 0
            ? ` <span style="background:var(--pink);color:#fff;border-radius:8px;font-size:8px;padding:1px 5px;font-weight:700;vertical-align:middle">${this._friendsPending > 99 ? '99+' : this._friendsPending}</span>`
            : '';
        const _fL = window.LANG || { t: k => k };
        tabsContainer.innerHTML = `
            <button class="tab-btn ${tab==='list'?'active':''}"     onclick="window.game.ui._setFriendsTab('list')">👥 ${_fL.t('friends.tab.list')}</button>
            <button class="tab-btn ${tab==='requests'?'active':''}" onclick="window.game.ui._setFriendsTab('requests')">📨 ${_fL.t('friends.tab.requests')}${pBadge}</button>
            <button class="tab-btn ${tab==='search'?'active':''}"   onclick="window.game.ui._setFriendsTab('search')">➕ ${_fL.t('friends.tab.search')}</button>`;

        if (tab === 'search') { this._renderFriendsSearchTab(container); return; }

        container.innerHTML = `<div class="friends-loading">⏳ ${_fL.t('friends.loading')}</div>`;

        this._fetchFriendsList().then(data => {
            if (tab === 'list')     this._buildFriendsListHTML(container, data);
            if (tab === 'requests') this._buildFriendsRequestsHTML(container, data);
        });
    }

    _setFriendsTab(tab) {
        this._friendsTab = tab;
        if (this._activePanel === 'friends') {
            const c = document.getElementById('modal-content'), tc = document.getElementById('modal-tabs');
            if (c) { this._friendsView = 'tabs'; this._renderFriends(c, tc); }
        }
    }

    async _fetchFriendsList(force = false) {
        if (!force && this._friendsCache && (Date.now() - this._friendsCache._ts < 15000)) return this._friendsCache;
        try {
            const res  = await fetch('api/amigos.php?action=list');
            const data = await res.json();
            if (data.ok) {
                data._ts = Date.now();
                this._friendsCache = data;
                // Update pending badge count
                const prev = this._friendsPending;
                this._friendsPending = data.pending_count || 0;
                if (prev !== this._friendsPending) this._refreshFriendsBadge();
            }
            return data.ok ? data : { ok: true, friends: [], received: [], sent: [], pending_count: 0 };
        } catch { return { ok: true, friends: [], received: [], sent: [], pending_count: 0 }; }
    }

    _refreshFriendsBadge() {
        const n = this._friendsPending;
        const label = n > 0 ? (n > 99 ? '99+' : String(n)) : null;
        // Badge on conta sidebar button
        document.querySelectorAll('.sidebar-btn[data-panel="conta"], .mobile-nav-btn[data-panel="conta"]').forEach(btn => {
            if (label) btn.setAttribute('data-badge', label);
            else btn.removeAttribute('data-badge');
        });
        // Badge on friends cat-hub button inside conta nav group
        document.querySelectorAll('.cat-hub-btn').forEach(btn => {
            if ((btn.getAttribute('onclick') || '').includes("'friends'")) {
                let badge = btn.querySelector('.cat-hub-badge');
                if (n > 0) {
                    if (!badge) { badge = document.createElement('span'); badge.className = 'cat-hub-badge'; btn.insertBefore(badge, btn.firstChild); }
                    badge.textContent = n > 99 ? '99+' : n;
                    badge.style.display = '';
                } else if (badge) badge.style.display = 'none';
            }
        });
    }

    _buildFriendsListHTML(container, data) {
        const friends = data.friends || [];
        const _flL = window.LANG || { t: k => k };
        if (!friends.length) {
            container.innerHTML = `<div class="friends-empty">
                <div style="font-size:32px;margin-bottom:10px">🤝</div>
                <div style="margin-bottom:12px">${_flL.t('friends.empty')}</div>
                <button class="fr-btn fr-btn--add" style="padding:8px 18px;font-size:12px"
                    onclick="window.game.ui._setFriendsTab('search')">➕ ${_flL.t('friends.search.add')}</button>
            </div>`; return;
        }
        container.innerHTML = `
            <div style="display:flex;justify-content:flex-end;padding:6px 12px 0">
                <button class="fr-btn fr-btn--add" style="font-size:10px"
                    onclick="window.game.ui._setFriendsTab('search')">➕ ${_flL.t('friends.tab.search')}</button>
            </div>
            ${friends.map(f => this._buildFriendRow(f, true)).join('')}`;
    }

    _buildFriendsRequestsHTML(container, data) {
        const recv = data.received || [], sent = data.sent || [];
        const _frL = window.LANG || { t: k => k };
        let html = '';
        if (recv.length) {
            html += `<div class="friends-section-title">📨 ${_frL.t('friends.requests.received')} (${recv.length})</div>`;
            html += recv.map(f => `
                <div class="friend-row">
                    ${this._friendAvatar(f, false)}
                    <div class="friend-info">
                        <div class="friend-name">${f.vip ? '<span class="fr-vip">👑</span>' : ''}${f.username}</div>
                        <div class="friend-sub">${_frL.t('friends.sub.level')} ${f.nivel}</div>
                    </div>
                    <div class="friend-actions">
                        <button class="fr-btn fr-btn--accept" onclick="window.game.ui._friendAction('accept',${f.id})">✓</button>
                        <button class="fr-btn fr-btn--decline" onclick="window.game.ui._friendAction('decline',${f.id})">✗</button>
                    </div>
                </div>`).join('');
        }
        if (sent.length) {
            html += `<div class="friends-section-title" style="margin-top:12px">📤 ${_frL.t('friends.requests.sent')} (${sent.length})</div>`;
            html += sent.map(f => `
                <div class="friend-row">
                    ${this._friendAvatar(f, false)}
                    <div class="friend-info">
                        <div class="friend-name">${f.username}</div>
                        <div class="friend-sub">${_frL.t('friends.sub.level')} ${f.nivel} · ${_frL.t('friends.sub.waiting')}</div>
                    </div>
                    <div class="friend-actions">
                        <button class="fr-btn fr-btn--decline" onclick="window.game.ui._friendAction('decline',${f.id})">✗</button>
                    </div>
                </div>`).join('');
        }
        if (!recv.length && !sent.length) html = `<div class="friends-empty">${_frL.t('friends.no.requests')}</div>`;
        container.innerHTML = html;
    }

    _renderFriendsSearchTab(container) {
        const q = this._friendsSearchQ || '';
        const _fsL = window.LANG || { t: k => k };
        container.innerHTML = `
            <div class="friends-search-bar">
                <input class="friends-search-input" id="fr-search-input" type="text"
                    placeholder="${_fsL.t('friends.search.placeholder')}" value="${q}"
                    oninput="window.game.ui._onFriendSearch(this.value)">
            </div>
            <div id="fr-search-results" class="friends-search-results"></div>`;
        if (q.length >= 2) this._doFriendSearch(q);
    }

    _onFriendSearch(q) {
        this._friendsSearchQ = q;
        clearTimeout(this._friendsSearchTimer);
        const el = document.getElementById('fr-search-results');
        if (!el) return;
        const _foL = window.LANG || { t: k => k };
        if (q.length < 2) { el.innerHTML = `<div class="friends-empty">${_foL.t('friends.search.min.chars')}</div>`; return; }
        el.innerHTML = `<div class="friends-loading">⏳ ${_foL.t('friends.search.loading')}</div>`;
        this._friendsSearchTimer = setTimeout(() => this._doFriendSearch(q), 400);
    }

    async _doFriendSearch(q) {
        const el = document.getElementById('fr-search-results');
        if (!el) return;
        try {
            const res  = await fetch(`api/amigos.php?action=search&q=${encodeURIComponent(q)}`);
            const data = await res.json();
            const _sdL = window.LANG || { t: k => k };
            if (!data.ok || !data.results.length) { el.innerHTML = `<div class="friends-empty">${_sdL.t('friends.search.empty')}</div>`; return; }
            el.innerHTML = data.results.map(f => {
                const btnHtml = {
                    friend:   `<button class="fr-btn fr-btn--remove" onclick="window.game.ui._friendAction('remove',${f.id})">${_sdL.t('friends.btn.remove')}</button>`,
                    sent:     `<span class="fr-tag">${_sdL.t('friends.btn.pending')}</span>`,
                    received: `<button class="fr-btn fr-btn--accept" onclick="window.game.ui._friendAction('accept',${f.id})">${_sdL.t('friends.btn.accept')}</button>`,
                    none:     `<button class="fr-btn fr-btn--add" onclick="window.game.ui._friendAction('send',${f.id})">+ ${_sdL.t('friends.tab.search')}</button>`,
                }[f.rel] || '';
                const isFriend = f.rel === 'friend';
                return `<div class="friend-row">
                    ${this._friendAvatar(f, isFriend)}
                    <div class="friend-info">
                        <div class="friend-name">${f.vip?'<span class="fr-vip">👑</span>':''}${f.username}</div>
                        <div class="friend-sub">${_sdL.t('friends.sub.level')} ${f.nivel}</div>
                    </div>
                    <div class="friend-actions">${btnHtml}</div>
                </div>`;
            }).join('');
        } catch { el.innerHTML = `<div class="friends-error">${(window.LANG||{t:k=>k}).t('friends.error.search')}</div>`; }
    }

    _buildFriendRow(f, showActions = true) {
        const actions = showActions ? `
            <div class="friend-actions">
                <button class="fr-btn fr-btn--view"    onclick="window.game.ui._openFriendProfile(${f.id})"  title="Ver Perfil">👤</button>
                <button class="fr-btn fr-btn--compare" onclick="window.game.ui._openFriendCompare(${f.id})"  title="Comparar Stats">📊</button>
                <button class="fr-btn fr-btn--battle"  onclick="window.game.ui._sendBattleInvite(${f.id},'${(f.username||'').replace(/'/g,'')}')" title="Batalha de Cliques">⚔️</button>
                <button class="fr-btn fr-btn--remove"  onclick="window.game.ui._confirmRemoveFriend(${f.id},'${(f.username||'').replace(/'/g,'')}')" title="Remover Amigo">✗</button>
            </div>` : '';
        return `<div class="friend-row">
            ${this._friendAvatar(f)}
            <div class="friend-info" style="cursor:pointer" onclick="window.game.ui._openFriendProfile(${f.id})">
                <div class="friend-name">${f.vip?'<span class="fr-vip">👑</span>':''}${f.username}</div>
                <div class="friend-sub">${(window.LANG||{t:k=>k}).t('friends.sub.level')} ${f.nivel}</div>
            </div>
            ${actions}
        </div>`;
    }

    _friendAvatar(f, showStatus = true) {
        const src = f.foto ? `foto/${f.foto}` : 'foto/padrao.png';
        const dot = showStatus
            ? `<span class="status-dot status-dot--${f.online?'online':'offline'} friend-avatar-dot"></span>`
            : '';
        return `<div class="friend-avatar-wrap">
            <img class="friend-avatar" src="${src}" alt="" onerror="this.src='foto/padrao.png'">
            ${dot}
        </div>`;
    }

    _confirmRemoveFriend(id, username) {
        const overlay  = document.getElementById('remove-friend-overlay');
        const nameEl   = document.getElementById('rfc-username');
        const confirmB = document.getElementById('rfc-confirm');
        const cancelB  = document.getElementById('rfc-cancel');
        if (!overlay) return;

        if (nameEl) nameEl.textContent = username || 'este jogador';
        overlay.style.display = 'flex';

        // Clone buttons to drop stale listeners
        const newConfirm = confirmB.cloneNode(true);
        const newCancel  = cancelB.cloneNode(true);
        confirmB.replaceWith(newConfirm);
        cancelB.replaceWith(newCancel);

        newConfirm.addEventListener('click', () => {
            overlay.style.display = 'none';
            this._friendAction('remove', id);
        });
        newCancel.addEventListener('click', () => {
            overlay.style.display = 'none';
        });

        // Close on overlay backdrop click
        overlay.onclick = e => { if (e.target === overlay) overlay.style.display = 'none'; };
    }

    async _friendAction(action, friendId) {
        try {
            const res  = await fetch('api/amigos.php', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ action, friend_id: friendId }),
            });
            const data = await res.json();
            if (data.ok) {
                this._friendsCache = null; // invalidate cache
                const c = document.getElementById('modal-content'), tc = document.getElementById('modal-tabs');
                if (c && this._activePanel === 'friends') {
                    this._friendsView = 'tabs';
                    this._renderFriends(c, tc);
                }
            }
        } catch { /* ignore */ }
    }

    async _openFriendProfile(id) {
        this._friendsProfileId = id;
        this._friendsView = 'profile';
        const c = document.getElementById('modal-content'), tc = document.getElementById('modal-tabs');
        if (c) this._renderFriendProfileView(c, tc);
    }

    async _renderFriendProfileView(container, tabsContainer) {
        const _fpL = window.LANG || { t: k => k };
        if (tabsContainer) tabsContainer.innerHTML = `<button class="tab-btn active" style="color:var(--text-dim);font-size:10px" onclick="window.game.ui._closeFriendSubview()">← ${_fpL.t('profile.register.cancel')}</button>`;
        container.innerHTML = `<div class="friends-loading">⏳ ${_fpL.t('friends.loading')}</div>`;
        try {
            const res  = await fetch(`api/amigos.php?action=profile&id=${this._friendsProfileId}`);
            const data = await res.json();
            if (!data.ok) { container.innerHTML = `<div class="friends-error">⚠️ ${data.msg || _fpL.t('friends.error.search')}</div>`; return; }
            const p = data.profile;
            const src = p.foto ? `foto/${p.foto}` : 'foto/padrao.png';
            const since = new Date(p.criado_em).toLocaleDateString();
            const isSelf    = p.id === this._game.account.getAccount()?.id;
            const removeBtn = (!isSelf && p.rel === 'friend')
                ? `<button class="fr-btn fr-btn--remove fp-remove-btn" onclick="window.game.ui._confirmRemoveFriend(${p.id},'${(p.username||'').replace(/'/g,'')}')" title="${_fpL.t('friends.btn.remove')}">✗ ${_fpL.t('friends.btn.remove')}</button>`
                : '';
            const actionBtn = {
                sent:     `<span class="fr-tag">${_fpL.t('friends.btn.pending')}</span>`,
                received: `<button class="fr-btn fr-btn--accept" onclick="window.game.ui._friendAction('accept',${p.id})">${_fpL.t('friends.btn.accept')}</button>`,
                none:     `<button class="fr-btn fr-btn--add" onclick="window.game.ui._friendAction('send',${p.id})">+ ${_fpL.t('friends.tab.search')}</button>`,
            }[p.rel] || '';
            const compareBtn = '';

            const card = (icon, label, val) =>
                `<div class="stat-card"><span class="stat-icon">${icon}</span><span class="stat-label">${label}</span><span class="stat-value">${val}</span></div>`;
            const sec  = label => `<div class="stat-section-label">${label}</div>`;

            container.innerHTML = `
                <div class="friend-profile-card">
                    <div class="fp-header">
                        <div class="fp-avatar-wrap">
                            <img class="fp-avatar" src="${src}" alt="" onerror="this.src='foto/padrao.png'">
                            <span class="status-dot status-dot--${p.online?'online':'offline'} fp-status-dot"></span>
                        </div>
                        <div class="fp-info">
                            <div class="fp-name">${p.vip?'<span class="fr-vip">👑</span>':''}${p.username}</div>
                            <div class="fp-status ${p.online?'fp-status--online':'fp-status--offline'}">${p.online?'● Online':'● Offline'}</div>
                            <div class="fp-since">📅 ${_fpL.t('profile.since')} ${since}</div>
                        </div>
                        ${removeBtn}
                    </div>
                    <div style="margin-bottom:14px">
                        ${sec(_fpL.t('stats.progression'))}
                        ${card('⭐', _fpL.t('stats.level'),            p.nivel)}
                        ${card('📊', _fpL.t('stats.xp.total'),         formatNum(p.total_xp))}
                        ${card('👑', _fpL.t('stats.prestiges'),        p.total_prestigios)}
                        ${card('🧬', _fpL.t('stats.skill.points'),     p.skill_points + ' SP')}
                        ${card('💎', _fpL.t('stats.diamonds'),         formatNum(p.diamantes))}
                        ${sec(_fpL.t('stats.neurons.section'))}
                        ${card('🧠', _fpL.t('stats.neurons.lifetime'), formatNum(p.neuronios_vitais))}
                        ${sec(_fpL.t('stats.combat'))}
                        ${card('🖱️', _fpL.t('stats.clicks.total'),    formatNum(p.total_cliques))}
                        ${card('💥', _fpL.t('stats.clicks.crit'),      formatNum(p.crit_clicks))}
                        ${sec(_fpL.t('stats.ach.section'))}
                        ${card('🏆', _fpL.t('stats.ach.section'),      p.ach_count)}
                        ${card('✅', _fpL.t('stats.missions.claimed'), p.miss_count)}
                        ${sec(_fpL.t('stats.boss.section'))}
                        ${card('🗡️', _fpL.t('stats.boss.level'),       p.nivel_chefe)}
                        ${card('⚔️', _fpL.t('stats.boss.damage'),      formatNum(p.total_dano))}
                        ${card('💀', _fpL.t('stats.boss.kills'),        p.abates)}
                        ${sec(_fpL.t('stats.general'))}
                        ${card('🕐', _fpL.t('stats.playtime'),          formatTime(p.play_time))}
                    </div>
                    ${(!isSelf && (actionBtn || compareBtn)) ? `<div class="fp-actions">${actionBtn}${compareBtn}</div>` : ''}
                </div>`;
        } catch { container.innerHTML = `<div class="friends-error">⚠️ ${_fpL.t('friends.error.search')}</div>`; }
    }

    async _openFriendCompare(id) {
        this._friendsCompareId = id;
        this._friendsView = 'compare';
        const c = document.getElementById('modal-content'), tc = document.getElementById('modal-tabs');
        if (c) this._renderFriendCompareView(c, tc);
    }

    async _renderFriendCompareView(container, tabsContainer) {
        const _fcL = window.LANG || { t: k => k };
        if (tabsContainer) tabsContainer.innerHTML = `<button class="tab-btn active" style="color:var(--text-dim);font-size:10px" onclick="window.game.ui._closeFriendSubview()">← ${_fcL.t('profile.register.cancel')}</button>`;
        container.innerHTML = `<div class="friends-loading">⏳ ${_fcL.t('friends.loading')}</div>`;
        try {
            const res  = await fetch(`api/amigos.php?action=profile&id=${this._friendsCompareId}`);
            const data = await res.json();
            if (!data.ok) { container.innerHTML = `<div class="friends-error">⚠️ ${data.msg}</div>`; return; }
            const p  = data.profile;
            const g  = this._game;
            const myName = g.account.getAccount()?.username || _fcL.t('profile.local.label');
            const critChance = ((Config.CRITICAL_CHANCE + g.skills.getCritBonus() + g.shop.getCritBonus()) * 100).toFixed(1) + '%';

            // diff only for numeric pairs; null frVal means friend data unavailable
            const diffHTML = (meN, frN) => {
                if (frN === null) return '<span style="color:var(--text-dim)">—</span>';
                const d = meN - frN;
                if (d === 0) return '<span style="color:var(--text-dim)">—</span>';
                return d > 0
                    ? `<span style="color:#00ff88">▲ +${formatNum(d)}</span>`
                    : `<span style="color:#ff4444">▼ ${formatNum(d)}</span>`;
            };

            // sections mirror _getStatsData() order
            const sections = [
                { title: _fcL.t('stats.progression'), icon: '⭐', rows: [
                    { icon: '⭐', label: _fcL.t('stats.level'),            meV: g.level.level,                               frV: p.nivel,            fmt: v => v },
                    { icon: '📊', label: _fcL.t('stats.xp.total'),         meV: formatNum(g.level.totalXp),                  frV: null,               fmt: null },
                    { icon: '👑', label: _fcL.t('stats.prestiges'),        meV: g.economy.totalPrestiges,                    frV: p.total_prestigios, fmt: v => v },
                    { icon: '✦',  label: _fcL.t('stats.prestige.mult'),    meV: g.economy._prestigeMult.toFixed(2) + '×',   frV: null,               fmt: null },
                    { icon: '🧬', label: _fcL.t('stats.skill.points'),     meV: g.skills.skillPoints + ' SP',               frV: null,               fmt: null },
                    { icon: '💎', label: _fcL.t('stats.diamonds'),         meV: g.economy.prestigeTokens,                    frV: p.diamantes,        fmt: v => v },
                ]},
                { title: _fcL.t('stats.neurons.section'), icon: '🧠', rows: [
                    { icon: '🧠', label: _fcL.t('stats.neurons.lifetime'), meV: g.economy.lifetimeNeurons,                   frV: p.neuronios_vitais, fmt: formatNum },
                    { icon: '⚡', label: _fcL.t('stats.neurons.cycle'),    meV: formatNum(g.economy.totalNeurons),            frV: null,               fmt: null },
                    { icon: '⚡', label: _fcL.t('stats.neurons.ps'),       meV: formatNum(g.economy.getEffectiveNPS()),       frV: null,               fmt: null },
                    { icon: '👆', label: _fcL.t('stats.click.value'),      meV: formatNum(g.economy.getClickValue()),         frV: null,               fmt: null },
                ]},
                { title: _fcL.t('stats.combat'), icon: '🖱️', rows: [
                    { icon: '🖱️', label: _fcL.t('stats.clicks.total'),    meV: g.stats.totalClicks,                         frV: p.total_cliques,    fmt: formatNum },
                    { icon: '💥', label: _fcL.t('stats.clicks.crit'),      meV: formatNum(g.stats.critClicks),               frV: null,               fmt: null },
                    { icon: '🎯', label: _fcL.t('stats.crit.chance'),      meV: critChance,                                  frV: null,               fmt: null },
                ]},
                { title: _fcL.t('stats.boss.section'), icon: '⚔️', rows: [
                    { icon: '🗡️', label: _fcL.t('stats.boss.level'),       meV: g.boss?.userBossLevel || 0,                 frV: p.nivel_chefe,      fmt: v => v },
                    { icon: '⚔️', label: _fcL.t('stats.boss.damage'),      meV: g.boss?.lifetimeDamage || 0,                frV: p.total_dano,       fmt: formatNum },
                    { icon: '💀', label: _fcL.t('stats.boss.kills'),        meV: g.boss?.bossKills || 0,                     frV: p.abates,           fmt: v => v },
                ]},
                { title: _fcL.t('stats.ach.section'), icon: '🏆', rows: [
                    { icon: '🏆', label: _fcL.t('stats.ach.section'),      meV: g.achievements.unlocked.size + ' / ' + (typeof ACHIEVEMENTS !== 'undefined' ? ACHIEVEMENTS.length : '?'), frV: null, fmt: null },
                    { icon: '✅', label: _fcL.t('stats.missions.claimed'), meV: g.missions.claims.size,                     frV: null,               fmt: null },
                ]},
                { title: _fcL.t('stats.general'), icon: '🕐', rows: [
                    { icon: '🕐', label: _fcL.t('stats.playtime'),          meV: formatTime(g.stats.playTime),               frV: null,               fmt: null },
                ]},
            ];

            const rowsHTML = sections.map(sec => `
                <div class="compare-section-title">${sec.icon} ${sec.title}</div>
                ${sec.rows.map(r => {
                    const meStr  = r.fmt ? r.fmt(r.meV) : r.meV;
                    const frStr  = r.frV !== null ? (r.fmt ? r.fmt(r.frV) : r.frV) : '<span style="color:var(--text-dim)">—</span>';
                    const dStr   = (r.fmt && r.frV !== null) ? diffHTML(r.meV, r.frV) : '<span style="color:var(--text-dim)">—</span>';
                    return `<div class="compare-row">
                        <div class="compare-label"><span class="compare-row-icon">${r.icon}</span>${r.label}</div>
                        <div class="compare-val">${meStr}</div>
                        <div class="compare-val">${frStr}</div>
                        <div class="compare-diff">${dStr}</div>
                    </div>`;
                }).join('')}
            `).join('');

            const src = p.foto ? `foto/${p.foto}` : 'foto/padrao.png';
            container.innerHTML = `
                <div class="compare-panel">
                    <div class="compare-header">
                        <div class="compare-player">
                            <img class="compare-avatar" src="${g.account.getPhotoUrl()}" alt="">
                            <span>${myName}</span>
                        </div>
                        <div class="compare-vs">VS</div>
                        <div class="compare-player">
                            <img class="compare-avatar" src="${src}" alt="" onerror="this.src='foto/padrao.png'">
                            <span>${p.username}</span>
                        </div>
                    </div>
                    <div class="compare-table">
                        <div class="compare-thead">
                            <div>${_fcL.t('profile.stats.title')}</div><div>${myName}</div><div>${p.username}</div><div>${_fcL.t('boss.world.progression')}</div>
                        </div>
                        ${rowsHTML}
                    </div>
                </div>`;
        } catch (e) { container.innerHTML = `<div class="friends-error">⚠️ ${_fcL.t('friends.error.search')}</div>`; }
    }

    _closeFriendSubview() {
        this._friendsView = 'tabs';
        const c = document.getElementById('modal-content'), tc = document.getElementById('modal-tabs');
        if (c) this._renderFriends(c, tc);
    }

    // ─────────────────────────────────────────────────────────────────────────

    _renderNavGroup(container, groupId) {
        const counts = this._getBadgeCounts();

        const _L = window.LANG || { t: k => k };
        const groups = {
            neural: [
                { id: 'generators', icon: '🔋', label: _L.t('nav.generators'), sub: _L.t('nav.generators.sub'), theme: 'neural'  },
                { id: 'upgrades',   icon: '🔧', label: _L.t('nav.upgrades'),   sub: _L.t('nav.upgrades.sub'),   theme: 'purple'  },
                { id: 'skills',     icon: '⚡', label: _L.t('nav.skills'),     sub: _L.t('nav.skills.sub'),     theme: 'gold'    },
                { id: 'rebirth',    icon: '♻️', label: _L.t('nav.rebirth'),    sub: _L.t('nav.rebirth.sub'),    theme: 'purple'  },
            ],
            agenda: [
                { id: 'missions',     icon: '📋', label: _L.t('nav.missions'),     sub: _L.t('nav.missions.sub'),     theme: 'green'  },
                { id: 'achievements', icon: '🎯', label: _L.t('nav.achievements'), sub: _L.t('nav.achievements.sub'), theme: 'gold'   },
                { id: 'leaderboard',  icon: '🏆', label: _L.t('nav.leaderboard'),  sub: _L.t('nav.leaderboard.sub'),  theme: 'neural' },
            ],
            conta: [
                { id: 'profile',  icon: '👤', label: _L.t('nav.profile'),   sub: _L.t('nav.profile.sub'),   theme: 'neural' },
                { id: 'friends',  icon: '👥', label: _L.t('nav.friends'),   sub: _L.t('nav.friends.sub'),   theme: 'green'  },
                { id: 'settings', icon: '⚙️', label: _L.t('nav.settings'),  sub: _L.t('nav.settings.sub'),  theme: 'neural' },
            ],
            boss: [
                { id: 'boss_battle',   icon: '⚔️', label: _L.t('nav.boss'),          sub: _L.t('nav.boss.sub'),          theme: 'pink'   },
                { id: 'boss_upgrades', icon: '💥', label: _L.t('nav.boss_upgrades'), sub: _L.t('nav.boss_upgrades.sub'), theme: 'purple' },
                { id: 'boss_ranking',  icon: '🏆', label: _L.t('nav.boss_ranking'),  sub: _L.t('nav.boss_ranking.sub'),  theme: 'gold'   },
            ],
        };

        const items = groups[groupId] || [];
        const isOdd = items.length % 2 !== 0;

        const buildBtn = (item, idx) => {
            const count = counts[item.id] || 0;
            const badge = count > 0
                ? `<span class="cat-hub-badge">${count > 99 ? '99+' : count}</span>`
                : '';
            const fullRow = (isOdd && idx === items.length - 1) ? ' cat-last-full' : '';
            let sub = item.sub;
            if (item.id === 'skills' && count > 0) {
                const cats = [];
                if (counts.skills_click     > 0) cats.push(_L.t('nav.skills.click'));
                if (counts.skills_generator > 0) cats.push(_L.t('nav.skills.generator'));
                if (counts.skills_progress  > 0) cats.push(_L.t('nav.skills.progress'));
                if (cats.length > 0) sub = cats.join(' · ');
            }
            return `
                <button class="cat-hub-btn cat-theme-${item.theme}${fullRow}"
                        onclick="window.game.ui.openSubPanel('${item.id}')">
                    ${badge}
                    <div class="cat-hub-icon">${item.icon}</div>
                    <div class="cat-hub-label">${item.label}</div>
                    <div class="cat-hub-sub">${sub}</div>
                </button>`;
        };

        container.innerHTML = `<div class="cat-hub-grid">${items.map(buildBtn).join('')}</div>`;
    }

    _renderMore(container) {
        const counts = this._getBadgeCounts();

        const makeBtn = (panelId, icon, label) => {
            const count = counts[panelId] || 0;
            const badge = `<span id="more-badge-${panelId}" class="more-badge"${count <= 0 ? ' style="display:none"' : ''}>${count > 99 ? '99+' : (count || '')}</span>`;
            return `<button class="settings-btn more-option-btn" onclick="window.game.ui.openSubPanel('${panelId}')">${icon} ${label}${badge}</button>`;
        };

        const _M = window.LANG || { t: k => k };
        container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap: 8px; padding-bottom: 20px;">
                ${makeBtn('missions',      '📋', _M.t('more.missions'))}
                ${makeBtn('achievements',  '🎯', _M.t('more.achievements'))}
                ${makeBtn('leaderboard',   '🏆', _M.t('more.leaderboard'))}
                ${makeBtn('generators',    '🔋', _M.t('more.generators'))}
                ${makeBtn('upgrades',      '🔧', _M.t('more.upgrades'))}
                ${makeBtn('skills',        '⚡', _M.t('more.skills'))}
                ${makeBtn('rebirth',       '♻️', _M.t('more.rebirth'))}
                ${makeBtn('shop',          '🛒', _M.t('more.shop'))}
                ${makeBtn('profile',       '👤', _M.t('more.profile'))}
                ${makeBtn('settings',      '⚙️', _M.t('more.settings'))}
            </div>
        `;
    }

    // ── Boost Buy Modal ─────────────────────────────────────────────────────────

    _ensureBoostBuyModal() {
        if (document.getElementById('boost-buy-overlay')) return;
        const el = document.createElement('div');
        el.id = 'boost-buy-overlay';
        el.className = 'boost-buy-overlay';
        el.innerHTML = `
            <div class="boost-buy-card" id="boost-buy-card">
                <button class="bbc-close" onclick="window.game.ui._hideBoostBuyModal()">✕</button>
                <div class="bbc-header">
                    <div class="bbc-icon-wrap" id="bbc-icon-wrap">
                        <span id="bbc-icon">⚡</span>
                    </div>
                    <div class="bbc-info">
                        <div class="bbc-name"   id="bbc-name"></div>
                        <div class="bbc-rarity" id="bbc-rarity"></div>
                        <div class="bbc-desc"   id="bbc-desc"></div>
                    </div>
                </div>

                <div class="bbc-qty-section">
                    <div class="bbc-qty-label">Quantidade</div>
                    <div class="bbc-qty-row">
                        <button class="bbc-qty-adj" onclick="window.game.ui._changeBoostQty(-1)">−</button>
                        <div class="bbc-qty-val" id="bbc-qty-val">1</div>
                        <button class="bbc-qty-adj" onclick="window.game.ui._changeBoostQty(1)">+</button>
                    </div>
                    <div class="bbc-presets">
                        <button class="bbc-preset active" onclick="window.game.ui._setBoostQty(1)">×1</button>
                        <button class="bbc-preset" onclick="window.game.ui._setBoostQty(5)">×5</button>
                        <button class="bbc-preset" onclick="window.game.ui._setBoostQty(10)">×10</button>
                        <button class="bbc-preset" onclick="window.game.ui._setBoostQty(25)">×25</button>
                    </div>
                </div>

                <div class="bbc-summary">
                    <div class="bbc-sum-row">
                        <span class="bbc-sum-label">Preço total</span>
                        <span class="bbc-sum-val" id="bbc-total-price">0 ⚡</span>
                    </div>
                    <div class="bbc-sum-row">
                        <span class="bbc-sum-label">Duração total</span>
                        <span class="bbc-sum-val" id="bbc-total-dur">0s</span>
                    </div>
                    <div class="bbc-sum-row">
                        <span class="bbc-sum-label">Efeito</span>
                        <span class="bbc-sum-val bbc-effect-val" id="bbc-effect">—</span>
                    </div>
                </div>

                <div class="bbc-actions">
                    <button class="bbc-cancel"  onclick="window.game.ui._hideBoostBuyModal()">Cancelar</button>
                    <button class="bbc-confirm" id="bbc-confirm" onclick="window.game.ui._confirmBoostBuy()">Comprar</button>
                </div>
            </div>`;
        el.addEventListener('click', e => { if (e.target === el) this._hideBoostBuyModal(); });
        document.body.appendChild(el);
    }

    _showBoostBuyModal(itemId) {
        this._ensureBoostBuyModal();
        this._boostModalId  = itemId;
        this._boostModalQty = 1;
        this._updateBoostBuyModal();
        const overlay = document.getElementById('boost-buy-overlay');
        overlay.style.display = 'flex';
        void overlay.offsetWidth;
        overlay.classList.add('open');
    }

    _hideBoostBuyModal() {
        const overlay = document.getElementById('boost-buy-overlay');
        if (!overlay) return;
        overlay.classList.remove('open');
        overlay.classList.add('hiding');
        setTimeout(() => {
            if (!overlay.classList.contains('open')) overlay.style.display = 'none';
            overlay.classList.remove('hiding');
        }, 240);
        this._boostModalId = null;
    }

    _setBoostQty(qty) {
        this._boostModalQty = Math.max(1, Math.min(99, Math.floor(qty)));
        this._updateBoostBuyModal();
    }

    _changeBoostQty(delta) {
        this._setBoostQty((this._boostModalQty || 1) + delta);
    }

    _confirmBoostBuy() {
        if (!this._boostModalId) return;
        const qty = this._boostModalQty || 1;
        if (this._game.shop.buy(this._boostModalId, qty)) {
            this._game.audio.upgrade?.();
            this._hideBoostBuyModal();
            if (this._activePanel === 'shop') this._renderPanelContent('shop');
        }
    }

    _updateBoostBuyModal() {
        const item = (typeof SHOP_ITEMS !== 'undefined') ? SHOP_ITEMS.find(x => x.id === this._boostModalId) : null;
        if (!item) return;
        const qty       = this._boostModalQty || 1;
        const totalCost = item.cost * qty;
        const totalSecs = item.duration * qty;
        const canAfford = this._game.economy.canAfford(totalCost);

        const RC = { common:'#a0a0a0', uncommon:'#00ff88', rare:'#00f5ff', epic:'#7b2fff', legendary:'#ffd700' };
        const RL = { common:'Comum', uncommon:'Incomum', rare:'Raro', epic:'Épico', legendary:'Lendário' };
        const rc = RC[item.rarity] || '#00f5ff';

        const setEl    = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
        const setStyle = (id, p, v) => { const e = document.getElementById(id); if (e) e.style[p]   = v;   };
        const setHtml  = (id, val) => { const e = document.getElementById(id); if (e) e.innerHTML  = val; };

        setEl('bbc-icon',   item.icon);
        setEl('bbc-name',   item.name);
        setEl('bbc-rarity', RL[item.rarity] || item.rarity);
        setStyle('bbc-rarity', 'color', rc);
        setEl('bbc-desc',   item.desc);
        setEl('bbc-qty-val', qty);

        setEl('bbc-total-price', formatNum(totalCost) + ' ⚡');
        setStyle('bbc-total-price', 'color', canAfford ? '#00f5ff' : '#ff5555');

        setEl('bbc-total-dur', formatDuration(totalSecs));

        const effectType = item.boostType === 'click_mult' ? 'poder de clique' : 'produção global';
        setEl('bbc-effect', item.boostValue + '× ' + effectType);
        setStyle('bbc-effect', 'color', item.boostType === 'click_mult' ? '#ffd700' : '#00f5ff');

        // Icon wrapper border color
        const wrap = document.getElementById('bbc-icon-wrap');
        if (wrap) {
            wrap.style.borderColor = rc + '55';
            wrap.style.background  = rc + '10';
        }

        // Preset button highlight + disable when can't afford
        document.querySelectorAll('.bbc-preset').forEach(btn => {
            const m = btn.getAttribute('onclick')?.match(/_setBoostQty\((\d+)\)/);
            const n = m ? parseInt(m[1]) : 0;
            btn.classList.toggle('active', n === qty);
            btn.disabled = n > 0 && !this._game.economy.canAfford(item.cost * n);
        });

        // Confirm button state
        const confirmBtn = document.getElementById('bbc-confirm');
        if (confirmBtn) {
            confirmBtn.disabled = !canAfford;
            confirmBtn.classList.toggle('can-afford', canAfford);
            confirmBtn.textContent = canAfford ? `Comprar ×${qty}` : 'Sem Neurônios';
        }
    }

    // ── Shop ────────────────────────────────────────────────────────────────────

    _renderShop(container, tabsContainer) {
        tabsContainer.innerHTML = '';
        const g = this._game;
        const acc = g.account;
        const isLoggedIn = acc.isLoggedIn();

        const RC = {
            common:     '#a0a0a0',
            uncommon:   '#00ff88',
            rare:       '#00f5ff',
            epic:       '#7b2fff',
            mythic:     '#ff4fa0',
            legendary:  '#ffd700',
            ultra_rare: '#ff6622',
            limited:    '#ff3366',
        };
        const _SL = window.LANG || { t: k => k };
        const RL = {
            common:     _SL.t('rarity.common'),
            uncommon:   _SL.t('rarity.uncommon'),
            rare:       _SL.t('rarity.rare'),
            epic:       _SL.t('rarity.epic'),
            mythic:     _SL.t('rarity.mythic'),
            legendary:  _SL.t('rarity.legendary'),
            ultra_rare: _SL.t('rarity.ultra_rare'),
            limited:    _SL.t('rarity.limited'),
        };
        const FREE_SKINS = (typeof FREE_SKINS_MODE !== 'undefined') && FREE_SKINS_MODE;
        const _skinName = (s) => {
            if (_SL.current === 'en' && s.name_en) return s.name_en;
            if (_SL.current === 'es' && s.name_es) return s.name_es;
            return s.name;
        };
        const _skinDesc = (s) => {
            if (_SL.current === 'en' && s.desc_en) return s.desc_en;
            if (_SL.current === 'es' && s.desc_es) return s.desc_es;
            return s.desc;
        };
        const _eventLabel = (s) => {
            if (_SL.current === 'en' && s.eventLabel_en) return s.eventLabel_en;
            if (_SL.current === 'es' && s.eventLabel_es) return s.eventLabel_es;
            return s.eventLabel || 'Evento';
        };
        const RARITY_ORDER = ['common','uncommon','rare','ultra_rare','epic','mythic','legendary','limited'];

        // ── VIP ──
        const isVip = acc.isVip();
        const vipAction = isVip
            ? `<div class="pshop-owned-badge pshop-owned-vip">✓ VIP ATIVO</div>`
            : `<div class="pshop-price pshop-price-gold">R$ 9,90</div>
               <button class="pshop-buy-btn pshop-buy-gold" data-pay-item="vip" onclick="window.game.iniciarPagamento('vip')">Adquirir</button>`;
        const vipCard = `
            <div class="pshop-card pshop-card--vip${isVip ? ' pshop-card--owned' : ''}">
                <div class="pshop-card-glow"></div>
                <div class="pshop-icon pshop-icon--vip">👑</div>
                <div class="pshop-info">
                    <div class="pshop-header-row">
                        <div class="pshop-title pshop-title-gold">VIP PERMANENTE</div>
                        <div class="pshop-rarity-badge" style="--rc:#ffd700">VIP</div>
                    </div>
                    <div class="pshop-subtitle">Acesso vitalício premium</div>
                    <div class="pshop-benefits">
                        <div class="pshop-benefit">👑 Emblema VIP no perfil</div>
                        <div class="pshop-benefit">🎨 Cor exclusiva no nome</div>
                        <div class="pshop-benefit">⚡ +10% renda global</div>
                        <div class="pshop-benefit">✨ Efeitos visuais premium</div>
                    </div>
                </div>
                <div class="pshop-actions">${vipAction}</div>
            </div>`;

        // ── 2× Neuron ──
        const hasDouble = acc.hasDoubleNeuron();
        const doubleAction = hasDouble
            ? `<div class="pshop-owned-badge pshop-owned-double">✓ ATIVO 2×</div>`
            : `<div class="pshop-price pshop-price-cyan">R$ 12,90</div>
               <button class="pshop-buy-btn pshop-buy-cyan" data-pay-item="double_neuron" onclick="window.game.iniciarPagamento('double_neuron')">Adquirir</button>`;
        const doubleCard = `
            <div class="pshop-card pshop-card--double${hasDouble ? ' pshop-card--owned' : ''}">
                <div class="pshop-card-glow pshop-card-glow--double"></div>
                <div class="pshop-icon pshop-icon--double">⚡</div>
                <div class="pshop-info">
                    <div class="pshop-header-row">
                        <div class="pshop-title pshop-title-cyan">2× NEURÔNIO</div>
                        <div class="pshop-rarity-badge" style="--rc:#00f5ff">Premium</div>
                    </div>
                    <div class="pshop-subtitle">Dobra permanentemente todos os ganhos</div>
                    <div class="pshop-benefits">
                        <div class="pshop-benefit">⚡ 2× neurônios por clique</div>
                        <div class="pshop-benefit">🧠 2× produção passiva global</div>
                        <div class="pshop-benefit">♾ Permanente para sempre</div>
                        <div class="pshop-benefit">💾 Salvo na conta</div>
                    </div>
                </div>
                <div class="pshop-actions">${doubleAction}</div>
            </div>`;

        // ── 2× Dano no Boss ──
        const hasDoubleDmg  = g.shop.purchased.has('perm_boss_dmg_x2');
        const doubleDmgAction = hasDoubleDmg
            ? `<div class="pshop-owned-badge" style="border-color:rgba(255,100,0,0.4);color:#ff6400">✓ ATIVO 2×</div>`
            : `<div class="pshop-price" style="color:#ff6400">R$ 9,90</div>
               <button class="pshop-buy-btn" style="border-color:rgba(255,100,0,0.4);color:#ff6400;background:rgba(255,100,0,0.08)"
                       data-pay-item="boss_damage_x2" onclick="window.game.iniciarPagamento('boss_damage_x2')">Adquirir</button>`;
        const doubleDmgCard = `
            <div class="pshop-card pshop-card--double${hasDoubleDmg ? ' pshop-card--owned' : ''}">
                <div class="pshop-card-glow" style="background:radial-gradient(ellipse at right,rgba(255,100,0,0.18) 0%,transparent 70%)"></div>
                <div class="pshop-icon pshop-icon--double" style="background:rgba(255,100,0,0.1);border-color:rgba(255,100,0,0.28)">⚔️</div>
                <div class="pshop-info">
                    <div class="pshop-header-row">
                        <div class="pshop-title" style="color:#ff6400">2× DANO</div>
                        <div class="pshop-rarity-badge" style="--rc:#ff6400">Premium</div>
                    </div>
                    <div class="pshop-subtitle">Dobra permanentemente o dano no Boss</div>
                    <div class="pshop-benefits">
                        <div class="pshop-benefit">⚔️ 2× dano por clique no Boss</div>
                        <div class="pshop-benefit">🌍 Aplica no Boss World e painel</div>
                        <div class="pshop-benefit">♾ Permanente para sempre</div>
                        <div class="pshop-benefit">💾 Salvo na conta</div>
                    </div>
                </div>
                <div class="pshop-actions">${doubleDmgAction}</div>
            </div>`;

        // ── Skins ──
        const skins = (typeof PREMIUM_SKINS !== 'undefined') ? PREMIUM_SKINS : [];
        const activeSkin = acc.getActiveSkin();

        // Default theme card (always shown first)
        const defaultEquipped = activeSkin === null;
        const defaultCard = `
            <div class="pshop-card pshop-card--skin${defaultEquipped ? ' pshop-card--owned' : ''}"
                 style="border-color:rgba(0,245,255,0.22)">
                <div class="pshop-skin-glow" style="background:radial-gradient(ellipse at right,rgba(0,245,255,0.08) 0%,transparent 70%)"></div>
                <div class="pshop-icon pshop-icon--skin" style="background:rgba(0,245,255,0.07);border-color:rgba(0,245,255,0.18)">🧠</div>
                <div class="pshop-info">
                    <div class="pshop-header-row">
                        <div class="pshop-title pshop-title-skin" style="color:var(--cyan)">${_SL.t('skin.default.name')}</div>
                        <div class="pshop-rarity-badge" style="--rc:#00f5ff">${_SL.t('rarity.default')}</div>
                    </div>
                    <div class="pshop-subtitle">${_SL.t('skin.default.desc')}</div>
                </div>
                <div class="pshop-actions">
                    ${defaultEquipped
                        ? `<div class="pshop-owned-badge" style="border-color:rgba(0,245,255,0.4);color:var(--cyan)">${_SL.t('skin.active')}</div>`
                        : `<button class="pshop-equip-btn" style="border-color:rgba(0,245,255,0.4);color:var(--cyan)" onclick="window.game.resetSkin()">${_SL.t('skin.equip')}</button>`
                    }
                </div>
            </div>`;

        // Card de skin sem badge de raridade — usa catBadge para identificar a categoria
        const _makeSkinCard = (skin, catBadge = '') => {
            const owned    = acc.hasSkin(skin.id);
            const equipped = activeSkin === skin.id;
            const rc = RC[skin.rarity] || '#00f5ff';
            let action = '';
            if (equipped) {
                action = `<div class="pshop-owned-badge" style="border-color:${rc}44;color:${rc}">${_SL.t('skin.equipped')}</div>`;
            } else if (owned) {
                action = `<div class="pshop-owned-badge">${_SL.t('skin.owned')}</div>
                          <button class="pshop-equip-btn" style="border-color:${rc}55;color:${rc}" onclick="window.game.equipSkin('${skin.id}')">${_SL.t('skin.equip')}</button>`;
            } else if (FREE_SKINS) {
                action = `<div class="pshop-price" style="color:${rc}">${_SL.t('price.free')}</div>
                          <button class="pshop-buy-btn" style="border-color:${rc}55;color:${rc};background:${rc}0d" onclick="window.game.testGetSkin('${skin.id}')">${_SL.t('skin.get_free')}</button>`;
            } else {
                action = `<div class="pshop-price" style="color:${rc}">${skin.price}</div>
                          <button class="pshop-buy-btn" style="border-color:${rc}55;color:${rc};background:${rc}0d" data-pay-item="${skin.id}" onclick="window.game.iniciarPagamento('${skin.id}')">${_SL.t('skin.buy')}</button>`;
            }
            return `
                <div class="pshop-card pshop-card--skin${owned ? ' pshop-card--owned' : ''}"
                     style="--skin-accent:${skin.accent};--skin-bg:${skin.gradient};border-color:${rc}38">
                    <div class="pshop-skin-glow" style="background:radial-gradient(ellipse 80% 100% at right,${skin.accent}22 0%,${skin.accent}0a 50%,transparent 75%)"></div>
                    <div class="pshop-icon pshop-icon--skin" style="background:${skin.accent}1e;border-color:${skin.accent}44;box-shadow:0 0 14px ${skin.accent}22,inset 0 0 10px ${skin.accent}0f">${skin.icon}</div>
                    <div class="pshop-info">
                        <div class="pshop-header-row">
                            <div class="pshop-title pshop-title-skin" style="color:${rc}">${_skinName(skin)}</div>
                            ${catBadge}
                        </div>
                        <div class="pshop-subtitle">${_skinDesc(skin)}</div>
                    </div>
                    <div class="pshop-actions">${action}</div>
                </div>`;
        };

        const normalSkins = skins
            .filter(s => !s.event && !s.temp)
            .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
        const eventSkins = skins
            .filter(s => s.event)
            .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
        const tempSkins = skins
            .filter(s => s.temp)
            .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));

        const colorSkins = normalSkins.filter(s => s.category === 'color');
        const themeSkins = normalSkins.filter(s => s.category !== 'color');

        const _rarityBadge = (s) => {
            const rc = RC[s.rarity] || '#00f5ff';
            return `<div class="pshop-rarity-badge" style="--rc:${rc}">${RL[s.rarity] || s.rarity}</div>`;
        };

        const colorSkinCards = colorSkins.map(s => _makeSkinCard(s, _rarityBadge(s))).join('');
        const themeSkinCards  = themeSkins.map(s => _makeSkinCard(s, _rarityBadge(s))).join('');
        const eventSkinCards  = eventSkins.map(s =>
            _makeSkinCard(s, `<span class="pshop-cat-badge pshop-cat-badge--event">⭐ ${_eventLabel(s)}</span>`)
        ).join('');

        // Formata o countdown de um timer
        const _fmtTimer = (exp) => {
            const rem = exp - Date.now();
            if (rem <= 0) return { text: _SL.t('timer.expired'), cls: 'pshop-timer--expired' };
            const days = Math.floor(rem / 86400000);
            const hrs  = Math.floor((rem % 86400000) / 3600000);
            const min  = Math.floor((rem % 3600000) / 60000);
            const sec  = Math.floor((rem % 60000) / 1000);
            const text = days > 0
                ? `⏰ ${days}d ${String(hrs).padStart(2,'0')}h ${String(min).padStart(2,'0')}m`
                : `⏰ ${String(hrs).padStart(2,'0')}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
            return { text, cls: rem < 86400000 ? 'pshop-timer--urgent' : '' };
        };

        const _makeTempCard = (skin) => {
            const owned   = acc.hasSkin(skin.id);
            const expired = skin.expiresAt ? Date.now() > skin.expiresAt : false;
            if (expired && !owned) return '';
            const equipped = activeSkin === skin.id;
            const rc = RC[skin.rarity] || '#ff3366';
            const ribbonLabel = _SL.current === 'en' ? '⏳ TEMPORARY' : (_SL.current === 'es' ? '⏳ TEMPORAL' : '⏳ TEMPORÁRIA');
            let action = '';
            if (equipped) {
                action = `<div class="pshop-owned-badge" style="border-color:${rc}44;color:${rc}">${_SL.t('skin.equipped')}</div>`;
            } else if (owned) {
                action = `<div class="pshop-owned-badge">${_SL.t('skin.owned')}</div>
                          <button class="pshop-equip-btn" style="border-color:${rc}55;color:${rc}" onclick="window.game.equipSkin('${skin.id}')">${_SL.t('skin.equip')}</button>`;
            } else if (FREE_SKINS && !expired) {
                action = `<div class="pshop-price" style="color:${rc}">${_SL.t('price.free')}</div>
                          <button class="pshop-buy-btn" style="border-color:${rc}55;color:${rc};background:${rc}0d" onclick="window.game.testGetSkin('${skin.id}')">${_SL.t('skin.get_free')}</button>`;
            } else if (!expired) {
                action = `<div class="pshop-price" style="color:${rc}">${skin.price}</div>
                          <button class="pshop-buy-btn" style="border-color:${rc}55;color:${rc};background:${rc}0d" data-pay-item="${skin.id}" onclick="window.game.iniciarPagamento('${skin.id}')">${_SL.t('skin.buy')}</button>`;
            }
            const t = skin.expiresAt ? _fmtTimer(skin.expiresAt) : null;
            const timerHtml = t
                ? `<div class="pshop-timer ${t.cls}" data-expires="${skin.expiresAt}">${t.text}</div>`
                : '';
            return `
                <div class="pshop-card pshop-card--skin pshop-card--temp${owned ? ' pshop-card--owned' : ''}${expired ? ' pshop-card--expired' : ''}"
                     style="--skin-accent:${skin.accent};--skin-bg:${skin.gradient};border-color:${rc}28">
                    <div class="pshop-skin-glow" style="background:radial-gradient(ellipse at right,${skin.accent}12 0%,transparent 70%)"></div>
                    <span class="pshop-temp-ribbon">${ribbonLabel}</span>
                    <div class="pshop-icon pshop-icon--skin" style="background:${skin.accent}12;border-color:${skin.accent}2e">${skin.icon}</div>
                    <div class="pshop-info">
                        <div class="pshop-header-row">
                            <div class="pshop-title pshop-title-skin" style="color:${rc}">${_skinName(skin)}</div>
                            <div class="pshop-rarity-badge" style="--rc:${rc}">${RL[skin.rarity] || _SL.t('rarity.limited')}</div>
                        </div>
                        <div class="pshop-subtitle">${_skinDesc(skin)}</div>
                        ${timerHtml}
                    </div>
                    <div class="pshop-actions">${action}</div>
                </div>`;
        };
        const tempSkinCards   = tempSkins.map(s => _makeTempCard(s)).join('');
        const showTempSection = tempSkinCards.trim().length > 0;

        // ── Boosts ──
        const boostCards = SHOP_ITEMS.filter(i => i.category === 'boost').map(item => {
            const canBuy = g.shop.canBuy(item);
            const rc = RC[item.rarity] || '#00f5ff';
            const durLabel = item.duration >= 60
                ? Math.floor(item.duration / 60) + 'min'
                : item.duration + 's';
            return `
                <div class="pshop-card pshop-card--std pshop-card--boost" style="--rarity-color:${rc};border-color:${rc}1e">
                    <div class="pshop-icon pshop-icon--std" style="background:${rc}0e;border-color:${rc}22">${item.icon}</div>
                    <div class="pshop-info">
                        <div class="pshop-header-row">
                            <div class="pshop-title pshop-title-std">${item.name}</div>
                            <div class="pshop-rarity-badge" style="--rc:${rc}">${RL[item.rarity] || ''}</div>
                            <span class="pshop-duration">${durLabel}</span>
                        </div>
                        <div class="pshop-subtitle">${item.desc}</div>
                    </div>
                    <div class="pshop-actions">
                        <button class="pshop-buy-btn pshop-std-buy pshop-boost-buy" style="border-color:${rc}44;color:${rc}"
                                onclick="window.game.ui._showBoostBuyModal('${item.id}')"
                                ${canBuy ? '' : 'disabled'}>${formatNum(item.cost)} ⚡</button>
                    </div>
                </div>`;
        }).join('');

        // ── Permanentes ──
        const permCards = SHOP_ITEMS.filter(i => i.category === 'permanent').map(item => {
            const canBuy = g.shop.canBuy(item);
            const owned  = g.shop.purchased.has(item.id);
            const rc = RC[item.rarity] || '#00f5ff';
            return `
                <div class="pshop-card pshop-card--std${owned ? ' pshop-card--owned' : ''}" style="--rarity-color:${rc};border-color:${rc}1e">
                    <div class="pshop-icon pshop-icon--std" style="background:${rc}0e;border-color:${rc}22">${item.icon}</div>
                    <div class="pshop-info">
                        <div class="pshop-header-row">
                            <div class="pshop-title pshop-title-std">${item.name}</div>
                            <div class="pshop-rarity-badge" style="--rc:${rc}">${RL[item.rarity] || ''}</div>
                        </div>
                        <div class="pshop-subtitle">${item.desc}</div>
                    </div>
                    <div class="pshop-actions">
                        ${owned
                            ? `<div class="pshop-owned-badge" style="border-color:${rc}44;color:${rc}">✓ Comprado</div>`
                            : `<button class="pshop-buy-btn pshop-std-buy" style="border-color:${rc}44;color:${rc}"
                                       onclick="window.game.buyShopItem('${item.id}')"
                                       ${canBuy ? '' : 'disabled'}>${item.cost} 💎</button>`
                        }
                    </div>
                </div>`;
        }).join('');

        // ── Diamond Packs ──
        const packs    = (typeof DIAMOND_PACKS !== 'undefined') ? DIAMOND_PACKS : [];
        const diamonds = acc.getDiamonds?.() || 0;
        const packHTML = packs.map(pack => {
            const isMega    = pack.id === 'diamonds_mega';
            const bonusTag  = pack.bonus
                ? `<div class="dpack-bonus">${pack.bonus}</div>`
                : '';
            const popTag = '';
            if (isMega) {
                return `
                <div class="dpack-card dpack-card--mega">
                    ${bonusTag}
                    <div class="dpack-icon">💎</div>
                    <div class="dpack-info">
                        <div class="dpack-amount">${pack.diamonds.toLocaleString('pt-BR')}</div>
                        <div class="dpack-unit">${_SL.t('diamond.unit')}</div>
                        <div class="dpack-name">${pack.name}</div>
                        <div class="dpack-price">${pack.price}</div>
                    </div>
                    <button class="dpack-buy-btn" data-pay-item="${pack.id}"
                            onclick="window.game.iniciarPagamento('${pack.id}')">
                        COMPRAR
                    </button>
                </div>`;
            }
            return `
                <div class="dpack-card">
                    ${bonusTag}
                    <div class="dpack-icon">💎</div>
                    <div class="dpack-amount">${pack.diamonds.toLocaleString('pt-BR')}</div>
                    <div class="dpack-unit">${_SL.t('diamond.unit')}</div>
                    <div class="dpack-name">${pack.name}</div>
                    <div class="dpack-price">${pack.price}</div>
                    <button class="dpack-buy-btn" data-pay-item="${pack.id}"
                            onclick="window.game.iniciarPagamento('${pack.id}')">
                        COMPRAR
                    </button>
                </div>`;
        }).join('');

        container.innerHTML = `
            <div class="pshop-container" id="pshop-container">

                <div class="pshop-section">
                    <div class="pshop-section-header">
                        <span>✨</span>
                        <span class="pshop-section-title">${_SL.t('shop.premium.title')}</span>
                        <span class="pshop-section-sub">${_SL.t('shop.premium.sub')}</span>
                    </div>
                    ${vipCard}${doubleCard}${doubleDmgCard}
                </div>

                <div class="pshop-section pshop-section--diamonds">
                    <div class="pshop-section-header">
                        <span>💎</span>
                        <span class="pshop-section-title">${_SL.t('shop.diamonds.title')}</span>
                        <span class="pshop-section-sub">${_SL.t('shop.diamonds.sub')}: 💎 ${g.economy.prestigeTokens.toLocaleString('pt-BR')} ${_SL.t('diamond.unit')}</span>
                    </div>
                    <div class="dpack-grid">${packHTML}</div>
                </div>

                <div class="pshop-section pshop-section--skins-all">
                    <div class="pshop-section-header">
                        <span>🎨</span>
                        <span class="pshop-section-title">${_SL.t('shop.skins.title')}</span>
                        <span class="pshop-section-sub">${_SL.t('shop.skins.sub')}</span>
                    </div>

                    ${defaultCard}

                    <div class="pshop-skin-divider"><span>${_SL.t('skins.div.color')}</span></div>
                    ${colorSkinCards}

                    <div class="pshop-skin-divider"><span>${_SL.t('skins.div.theme')}</span></div>
                    ${themeSkinCards}

                    <div class="pshop-skin-divider"><span>${_SL.t('skins.div.event')}</span></div>
                    ${eventSkinCards}

                    ${showTempSection ? `<div class="pshop-skin-divider"><span>${_SL.t('skins.div.temp')}</span></div>${tempSkinCards}` : ''}
                </div>

                <div class="pshop-section">
                    <div class="pshop-section-header">
                        <span>⚡</span>
                        <span class="pshop-section-title">${_SL.t('shop.boosts.title')}</span>
                        <span class="pshop-section-sub">${_SL.t('shop.boosts.sub')}</span>
                    </div>
                    ${boostCards}
                </div>

            </div>`;

        // Inicia countdown em tempo real para skins temporárias
        if (container._skinTimerInterval) clearInterval(container._skinTimerInterval);
        if (showTempSection) {
            container._skinTimerInterval = setInterval(() => {
                container.querySelectorAll('[data-expires]').forEach(el => {
                    const t = _fmtTimer(parseInt(el.dataset.expires));
                    el.textContent = t.text;
                    el.className   = `pshop-timer${t.cls ? ' ' + t.cls : ''}`;
                });
            }, 1000);
        }
    }

    _updateShop() {
        const container = document.getElementById('pshop-container');
        if (!container) { this._renderPanelContent('shop'); return; }
        const g = this._game;
        SHOP_ITEMS.forEach(item => {
            const btn = container.querySelector(`.pshop-std-buy[onclick*="${item.id}"]`);
            if (!btn) return;
            btn.disabled = !g.shop.canBuy(item);
        });
    }

    _getSkillDesc(skill, level) {
        const isMax = level >= skill.maxLevel;
        const e = skill.effectPerLevel;
        const _d = window.LANG || { t: k => k };
        const mx = `<span class="skill-desc-max">${_d.t('skills.max')}</span>`;
        if (skill.effectType === 'click_mult') {
            const cur = (level * e * 100).toFixed(0);
            const nxt = ((level + 1) * e * 100).toFixed(0);
            if (isMax) return `${_d.t('skill.desc.click.max')} <strong>+${cur}%</strong> ${mx}`;
            if (level === 0) return `${_d.t('skill.desc.click.next')}: <strong>+${nxt}%</strong> ${_d.t('skill.desc.click.label')}`;
            return `${_d.t('skill.desc.click.cur')}: +${cur}% · ${_d.t('skill.desc.click.next')}: <strong>+${nxt}%</strong> ${_d.t('skill.desc.click.label')}`;
        }
        if (skill.effectType === 'crit_chance') {
            const base = Config.CRITICAL_CHANCE * 100;
            const cur = (base + level * e * 100).toFixed(1);
            const nxt = (base + (level + 1) * e * 100).toFixed(1);
            if (isMax) return `${_d.t('skill.desc.crit.label')} <strong>${cur}%</strong> ${mx}`;
            if (level === 0) return `${_d.t('skill.desc.crit.label')}: ${base.toFixed(1)}% → <strong>${nxt}%</strong>`;
            return `${_d.t('skill.desc.crit.label')}: ${cur}% → <strong>${nxt}%</strong>`;
        }
        if (skill.effectType === 'global_mult') {
            const cur = (1 + level * e).toFixed(2);
            const nxt = (1 + (level + 1) * e).toFixed(2);
            if (isMax) return `${_d.t('skill.desc.global.label')} <strong>×${cur}</strong> ${mx}`;
            if (level === 0) return `${_d.t('skill.desc.global.label')}: 1× → <strong>×${nxt}</strong>`;
            return `${_d.t('skill.desc.global.label')}: ×${cur} → <strong>×${nxt}</strong>`;
        }
        if (skill.effectType === 'gen_cost_discount') {
            const cur = (level * e * 100).toFixed(0);
            const nxt = ((level + 1) * e * 100).toFixed(0);
            if (isMax) return `${_d.t('skill.desc.discount.label')} <strong>${cur}%</strong> ${mx}`;
            if (level === 0) return `${_d.t('skill.desc.discount.label')}: 0% → <strong>${nxt}%</strong>`;
            return `${_d.t('skill.desc.discount.label')}: ${cur}% → <strong>${nxt}%</strong>`;
        }
        if (skill.effectType === 'xp_mult') {
            const cur = (1 + level * e).toFixed(2);
            const nxt = (1 + (level + 1) * e).toFixed(2);
            if (isMax) return `${_d.t('skill.desc.xp.label')} <strong>×${cur}</strong> ${mx}`;
            if (level === 0) return `${_d.t('skill.desc.xp.label')}: 1× → <strong>×${nxt}</strong>`;
            return `${_d.t('skill.desc.xp.label')}: ×${cur} → <strong>×${nxt}</strong>`;
        }
        if (skill.effectType === 'offline_mult') {
            const cur = (50 * (1 + level * e)).toFixed(0);
            const nxt = (50 * (1 + (level + 1) * e)).toFixed(0);
            if (isMax) return `${_d.t('skill.desc.offline.label')} <strong>${cur}%</strong> ${mx}`;
            if (level === 0) return `${_d.t('skill.desc.offline.label')}: 50% → <strong>${nxt}%</strong>`;
            return `${_d.t('skill.desc.offline.label')}: ${cur}% → <strong>${nxt}%</strong>`;
        }
        return skill.desc;
    }

    _renderSkills(container, tabsContainer) {
        const g = this._game;
        const _skL = window.LANG || { t: k => k };
        const categories = [
            { id: 'click',       name: _skL.t('skills.click.name'),     icon: '👆', badgeKey: 'skills_click'     },
            { id: 'generator',   name: _skL.t('skills.generator.name'), icon: '⚙️', badgeKey: 'skills_generator' },
            { id: 'progression', name: _skL.t('skills.progress.name'),  icon: '📈', badgeKey: 'skills_progress'  },
        ];
        if (!['click', 'generator', 'progression'].includes(this._activeSkillTab)) this._activeSkillTab = 'click';

        const counts = this._getBadgeCounts();
        tabsContainer.innerHTML = categories.map(c => {
            const n = counts[c.badgeKey] || 0;
            const badge = n > 0 ? `<span class="skill-tab-badge">${n}</span>` : '';
            return `<button class="tab-btn ${this._activeSkillTab === c.id ? 'active' : ''}"
                    id="skill-tab-${c.id}"
                    onclick="window.game.ui._activeSkillTab='${c.id}'; window.game.ui._renderPanelContent('skills')">
                ${c.icon} ${c.name}${badge}
            </button>`;
        }).join('');

        const sp = g.skills.skillPoints;
        const skills = SKILLS.filter(s => s.category === this._activeSkillTab);

        let html = `<div class="skill-sp-bar"><span class="skill-sp-label">${_skL.t('skills.points')}</span><span class="skill-sp-count" id="skill-sp-count">${sp} SP</span></div>`;
        html += '<div style="display:flex;flex-direction:column;gap:8px;">';

        skills.forEach(skill => {
            const level = g.skills.levels[skill.id] || 0;
            const maxLevel = skill.maxLevel;
            const nextCost = level < maxLevel ? skill.costs[level] : null;
            const canUpgrade = g.skills.canUpgrade(skill.id);

            const dots = Array.from({length: maxLevel}, (_, i) =>
                `<div class="skill-dot${i < level ? ' filled' : ''}"></div>`).join('');

            html += `
                <div class="skill-item${level >= maxLevel ? ' skill-maxed' : ''}">
                    <div class="skill-item-icon">${skill.icon}</div>
                    <div class="skill-item-info">
                        <div class="skill-item-name">${skill.name}</div>
                        <div class="skill-item-desc">${this._getSkillDesc(skill, level)}</div>
                        <div class="skill-dots">${dots}</div>
                    </div>
                    <div class="skill-item-right">
                        <div class="skill-level-label">${level}/${maxLevel}</div>
                        ${level < maxLevel
                            ? `<button class="skill-upgrade-btn${canUpgrade ? ' can-afford' : ''}"
                                   onclick="window.game.upgradeSkill('${skill.id}')"
                                   ${canUpgrade ? '' : 'disabled'}>
                                   ${nextCost} SP
                               </button>`
                            : `<span class="skill-max-badge">MAX</span>`}
                    </div>
                </div>`;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    _updateSkillPoints() {
        const el = document.getElementById('skill-sp-count');
        if (el) el.textContent = this._game.skills.skillPoints + ' SP';
    }

    async _renderLeaderboard(container, tabsContainer) {
        const g   = this._game;
        const acc = g.account;
        const isOnline = acc.isLoggedIn() && !acc.isLocalOnly() && window.location.protocol !== 'file:';

        if (this._lbRefreshTimer) { clearInterval(this._lbRefreshTimer); this._lbRefreshTimer = null; }

        const _lL = window.LANG || { t: k => k };
        const TABS = [
            { id: 'neuronios',  label: _lL.t('lb.tab.neurons'),   unit: ' ⚡', tipo: 'neuronios'  },
            { id: 'cliques',    label: _lL.t('lb.tab.clicks'),    unit: ' 🖱', tipo: 'cliques'    },
            { id: 'nivel',      label: _lL.t('lb.tab.level'),     unit: ' Lv', tipo: 'nivel'      },
            { id: 'prestigios', label: _lL.t('lb.tab.prestiges'), unit: ' ♻',  tipo: 'prestigios' },
        ];
        const tab = TABS.find(t => t.id === this._activeLbTab) || TABS[0];

        // Render tabs in the sticky tab bar (same style as missions/shop tabs)
        if (tabsContainer) {
            tabsContainer.innerHTML = TABS.map(t =>
                `<button class="tab-btn ${t.id === this._activeLbTab ? 'active' : ''}"
                         onclick="window.game.ui._setLbTab('${t.id}')">${t.label}</button>`
            ).join('');
        }

        container.innerHTML = `<div class="lb-loading"><div class="lb-spinner"></div><span>${_lL.t('lb.loading')}</span></div>`;

        let entries = [], playerRank = null;

        if (isOnline) {
            await g._syncLeaderboard();
            try {
                const [topRes, rankRes] = await Promise.all([
                    fetch(`api/leaderboard.php?action=top&limit=50&tipo=${tab.tipo}`),
                    fetch(`api/leaderboard.php?action=rank&tipo=${tab.tipo}`),
                ]);
                const topData  = await topRes.json();
                const rankData = await rankRes.json();
                if (topData.ok)  entries    = topData.entries;
                if (rankData.ok) playerRank = rankData.rank;
            } catch {
                container.innerHTML += `<div class="lb-error">⚠️ Sem conexão com o servidor.</div>`;
                return;
            }
        }

        const uid = acc.getAccount()?.id;
        if (uid) entries.forEach(e => { if (e.id === uid) e.isPlayer = true; });

        // Local player fallback entry
        const localScore = (() => {
            if (tab.id === 'neuronios')  return g.economy.lifetimeNeurons;
            if (tab.id === 'cliques')    return g.stats.totalClicks;
            if (tab.id === 'nivel')      return g.level.level;
            if (tab.id === 'prestigios') return g.economy.totalPrestiges;
            return 0;
        })();
        const playerLocal = acc.isLoggedIn() ? {
            id: uid, username: acc.getAccount()?.username, foto: acc.getAccount()?.foto,
            vip: acc.isVip(), score: localScore, nivel: g.level.level,
            totalPrestiges: g.economy.totalPrestiges, isPlayer: true,
        } : null;

        const top          = entries.slice(0, 50);
        const playerInList = top.some(e => e.isPlayer);

        const podiumClasses = ['lb-pod-1st','lb-pod-2nd','lb-pod-3rd'];
        const podiumMedals  = ['🏆','🥈','🥉'];

        const avatarEl = (entry) => {
            if (entry.isPlayer) return `<img class="lb-avatar-img" src="${acc.getPhotoUrl()}" alt="">`;
            const src = entry.foto ? `foto/${entry.foto}` : 'foto/padrao.png';
            return `<img class="lb-avatar-img" src="${src}" alt="">`;
        };

        const fmtScore = (e) => {
            const s = e.score ?? 0;
            return `${formatNum(s)}${tab.unit}`;
        };

        const onlineDot = (e) => (e.isPlayer || e.online)
            ? `<span class="status-dot status-dot--online lb-online-dot" title="Online"></span>`
            : `<span class="status-dot status-dot--offline lb-online-dot" title="Offline"></span>`;

        const buildPodiumSlot = (entry, rank) => {
            if (!entry) return `<div class="lb-pod-slot ${podiumClasses[rank-1]} lb-pod-empty"><div class="lb-pod-medal">${podiumMedals[rank-1]}</div><div class="lb-pod-card lb-pod-card--empty"><span>—</span></div><div class="lb-pod-pedestal"></div></div>`;
            const nameClass = entry.vip ? 'lb-pod-name lb-name-vip' : 'lb-pod-name';
            const dot       = onlineDot(entry);
            return `
                <div class="lb-pod-slot ${podiumClasses[rank-1]}${entry.isPlayer?' lb-pod-you':''}">
                    <div class="lb-pod-medal">${podiumMedals[rank-1]}</div>
                    <div class="lb-pod-card">
                        <div class="lb-pod-avatar-wrap">${avatarEl(entry)}${dot}</div>
                        <div class="${nameClass}">${entry.username}</div>
                        <div class="lb-pod-score">${fmtScore(entry)}</div>
                    </div>
                    <div class="lb-pod-pedestal"></div>
                </div>`;
        };

        const buildRow = (entry, rank) => {
            const nameClass = entry.vip ? 'lb-name lb-name-vip' : 'lb-name';
            const dot       = onlineDot(entry);
            return `
                <div class="lb-row${entry.isPlayer?' lb-row-player':''}">
                    <div class="lb-rank">#${rank}</div>
                    <div class="lb-row-avatar">${avatarEl(entry)}</div>
                    ${dot}
                    <div class="lb-info">
                        <div class="${nameClass}">${entry.username}</div>
                    </div>
                    <div class="lb-score">${fmtScore(entry)}</div>
                </div>`;
        };

        const podiumHTML = `<div class="lb-podium">${buildPodiumSlot(top[0],1)}${buildPodiumSlot(top[1],2)}${buildPodiumSlot(top[2],3)}</div>`;
        let rowsHTML = top.slice(3).map((e, i) => buildRow(e, i + 4)).join('');

        if (!playerInList && playerLocal) {
            const sep = top.length >= 3 ? `<div class="lb-separator">· · ·</div>` : '';
            rowsHTML += sep + buildRow(playerLocal, playerRank ?? (top.length + 1));
        }
        if (top.length === 0 && !playerLocal) {
            rowsHTML = `<div class="lb-empty">${_lL.t('lb.empty')}</div>`;
        }

        const curLang = window.LANG?.current || 'pt-BR';
        const time = new Date().toLocaleTimeString(curLang, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const footer = isOnline
            ? `🌐 ${_lL.t('lb.footer.online')} · ${_lL.t('lb.footer.updated')} ${time}`
            : (!acc.isLoggedIn() ? `⚠️ ${_lL.t('lb.footer.no.login')}`
                                 : `⚠️ ${_lL.t('lb.footer.local')}`);

        container.innerHTML = `
            ${podiumHTML}
            <div class="lb-list">${rowsHTML}</div>
            <div class="lb-footer">${footer}</div>`;

        this._lbRefreshTimer = setInterval(() => {
            if (this._activePanel === 'leaderboard') {
                const c  = document.getElementById('modal-content');
                const tc = document.getElementById('modal-tabs');
                if (c) this._renderLeaderboard(c, tc);
            } else {
                clearInterval(this._lbRefreshTimer);
                this._lbRefreshTimer = null;
            }
        }, 30_000);
    }

    _setLbTab(id) {
        this._activeLbTab = id;
        const c  = document.getElementById('modal-content');
        const tc = document.getElementById('modal-tabs');
        if (c) this._renderLeaderboard(c, tc);
    }

    // ── Boss Info Panel ──────────────────────────────────────────────────────

    // ── Boss Info Panel ──────────────────────────────────────────────────────

    // ── Boss sub-panel wrappers (called from _renderPanelContent) ─────────────

    _renderBossPanel(content) {
        if (this._bossBattleTimerInterval) { clearInterval(this._bossBattleTimerInterval); this._bossBattleTimerInterval = null; }
        content.innerHTML = '<div id="boss-info-panel"></div>';

        // _initBossUI runs before _loadState, so level check fails and polling never starts.
        // Force-start polling on first panel open (startPolling calls fetchState immediately).
        const bm = this._game.boss;
        if (!bm._pollTimer) bm.startPolling(5000);

        this._renderBossInfoContent();
        // Dedicated 1s interval to tick only the timer element — avoids full re-renders
        this._bossBattleTimerInterval = setInterval(() => {
            if (this._activePanel !== 'boss_battle') {
                clearInterval(this._bossBattleTimerInterval);
                this._bossBattleTimerInterval = null;
                return;
            }
            const bm = this._game.boss;
            const b  = bm.boss;

            // ── Cooldown countdown (no active boss) ──
            if (!b) {
                const rawCooldown = bm.cooldown || 0;
                const cdEl = document.getElementById('binfo-cooldown-val');
                if (!cdEl || rawCooldown <= 0) return;
                const elapsed = Math.floor((Date.now() - bm._stateFetchedAt) / 1000);
                const rem = Math.max(0, rawCooldown - elapsed);
                const mm = String(Math.floor(rem / 60)).padStart(2, '0');
                const ss = String(rem % 60).padStart(2, '0');
                cdEl.textContent = `${mm}:${ss}`;
                if (rem <= 0) bm.fetchState();
                return;
            }

            // ── Active boss timer ──
            const el  = document.getElementById('binfo-live-timer');
            if (!el) return;
            const serverRem = b.remaining ?? 300;
            const defeated = b.status === 'defeated' || b.status === 'expired';
            if (defeated) { el.textContent = '☠ Derrotado'; return; }
            const rem = b._clientExpiry
                ? Math.max(0, Math.floor((b._clientExpiry - Date.now()) / 1000))
                : Math.max(0, serverRem);
            if (rem <= 0) {
                el.textContent = '00:00';
                clearInterval(this._bossBattleTimerInterval);
                this._bossBattleTimerInterval = null;
                bm.fetchState();
                return;
            }
            const mm = String(Math.floor(rem / 60)).padStart(2, '0');
            const ss = String(rem % 60).padStart(2, '0');
            el.textContent  = `${mm}:${ss}`;
            const rc = (typeof BOSS_RARITY_COLORS !== 'undefined' && BOSS_RARITY_COLORS[b.rarity]) || '#00f5ff';
            el.style.color  = rem < 60 ? '#ff4444' : (rem < 120 ? '#ffd700' : rc);
        }, 1000);
    }

    _renderBossRankingPanel(content, tabsContainer) {
        if (this._bossRankRefreshTimer) { clearInterval(this._bossRankRefreshTimer); this._bossRankRefreshTimer = null; }
        const bm = this._game.boss;
        if (!bm._pollTimer) bm.startPolling(5000);
        const _brL = window.LANG || { t: k => k };
        if (tabsContainer) {
            tabsContainer.innerHTML = `
                <button class="tab-btn ${this._activeBossRankTab === 'dano' ? 'active' : ''}"
                        onclick="window.game.ui._setBossRankTab('dano')">${_brL.t('boss.rank.tab.damage')}</button>
                <button class="tab-btn ${this._activeBossRankTab === 'abates' ? 'active' : ''}"
                        onclick="window.game.ui._setBossRankTab('abates')">${_brL.t('boss.rank.tab.kills')}</button>`;
        }
        content.innerHTML = `<div class="lb-loading"><div class="lb-spinner"></div><span>${_brL.t('lb.loading')}</span></div>`;
        this._renderBossRankingContent(content);
    }

    _setBossRankTab(id) {
        this._activeBossRankTab = id;
        const c  = document.getElementById('modal-content');
        const tc = document.getElementById('modal-tabs');
        if (c) this._renderBossRankingPanel(c, tc);
    }

    _renderBossUpgradesPanel(content) {
        content.innerHTML = '<div id="boss-info-panel"></div>';
        const bm = this._game.boss;
        if (!bm._pollTimer) bm.startPolling(5000);
        this._renderBossUpgrades();
    }

    _renderBossInfo(container, tabsContainer) {
        const _biL = window.LANG || { t: k => k };
        if (!['boss', 'ranking', 'upgrades'].includes(this._activeBossTab)) this._activeBossTab = 'boss';
        tabsContainer.innerHTML = `
            <button class="tab-btn ${this._activeBossTab === 'boss' ? 'active' : ''}"
                onclick="window.game.ui._activeBossTab='boss'; window.game.ui._renderPanelContent('boss')">${_biL.t('boss.tab.boss')}</button>
            <button class="tab-btn ${this._activeBossTab === 'ranking' ? 'active' : ''}"
                onclick="window.game.ui._activeBossTab='ranking'; window.game.ui._lastBossRankFetch=0; window.game.ui._renderPanelContent('boss')">${_biL.t('boss.tab.ranking')}</button>
            <button class="tab-btn ${this._activeBossTab === 'upgrades' ? 'active' : ''}"
                onclick="window.game.ui._activeBossTab='upgrades'; window.game.ui._renderPanelContent('boss')">${_biL.t('boss.tab.upgrades')}</button>
        `;
        container.innerHTML = '<div id="boss-info-panel"></div>';
        this._updateBossInfoPanel();
    }

    _updateBossInfoPanel() {
        if (this._activeBossTab === 'boss') {
            this._renderBossInfoContent();
        } else if (this._activeBossTab === 'ranking') {
            if (!this._lastBossRankFetch || Date.now() - this._lastBossRankFetch > 30_000) {
                this._lastBossRankFetch = Date.now();
                this._renderBossRankingContent();
            }
        } else if (this._activeBossTab === 'upgrades') {
            this._renderBossUpgrades();
        }
    }

    _renderBossInfoContent() {
        const panel = document.getElementById('boss-info-panel');
        if (!panel) return;
        const bm  = this._game.boss;
        const acc = this._game.account;
        const b   = bm.boss;
        const _bL = window.LANG || { t: k => k };

        if (!b) {
            const wait = Math.max(0, bm.cooldown || 0);
            const key  = wait > 0 ? 'no-boss-cooldown' : 'no-boss-loading';
            if (panel._key === key) return;
            panel._key = key;
            const mm   = String(Math.floor(wait / 60)).padStart(2, '0');
            const ss   = String(wait % 60).padStart(2, '0');
            panel.innerHTML = `
                <div class="binfo-no-boss">
                    <div class="binfo-no-boss-icon">🌐</div>
                    ${wait > 0
                        ? `<div class="binfo-no-boss-title">⏳ ${_bL.t('boss.cooldown.title')}</div>
                           <div class="binfo-level-progress" style="margin:8px 0;font-size:12px;color:var(--text-dim)">${_bL.t('boss.cooldown.next')}</div>
                           <div class="binfo-countdown-val" id="binfo-cooldown-val" style="font-family:'Orbitron',monospace;font-size:24px;color:var(--cyan)">${String(Math.floor(wait/60)).padStart(2,'0')}:${String(wait%60).padStart(2,'0')}</div>
                           <div class="binfo-hint" style="margin-top:10px;font-size:11px">${_bL.t('boss.cooldown.hint')}</div>`
                        : `<div class="binfo-no-boss-title">${_bL.t('boss.loading')}</div>`
                    }
                </div>`;
            return;
        }

        const def      = (typeof BOSS_TYPES !== 'undefined' && BOSS_TYPES[b.type]) || {};
        const rc       = (typeof BOSS_RARITY_COLORS !== 'undefined' && BOSS_RARITY_COLORS[b.rarity]) || '#00f5ff';
        const rl       = (typeof BOSS_RARITY_LABELS !== 'undefined' && BOSS_RARITY_LABELS[b.rarity]) || b.rarity;
        const defeated  = b.status === 'defeated' || b.status === 'expired';
        const pct       = Math.max(0, Math.min(1, b.pct ?? (b.currentHp / b.maxHp)));
        const hpPct     = (pct * 100).toFixed(1);
        const hpColor   = pct > 0.5 ? '#00ff88' : pct > 0.25 ? '#ffd700' : '#ff4444';

        // Drift-free remaining: use absolute _clientExpiry timestamp when available
        const serverRem = b._clientExpiry
            ? Math.max(0, Math.floor((b._clientExpiry - Date.now()) / 1000))
            : Math.max(0, b.remaining ?? 300);

        // Key includes myDamage so the panel re-renders after every server hit response
        const newKey = `boss-${b.id}-${defeated ? 'dead' : Math.floor(bm.myDamage)}-${Math.floor(pct * 1000)}`;
        if (panel._key === newKey) return;
        panel._key = newKey;

        panel.innerHTML = `
            <div class="binfo-header">
                <div class="binfo-icon" style="filter:drop-shadow(0 0 14px ${rc}88)">${def.icon || '👾'}</div>
                <div class="binfo-title-col">
                    <div class="binfo-name" style="color:${rc}">${def.name || b.type}</div>
                    <div class="binfo-badges">
                        <span class="binfo-rarity" style="color:${rc};border-color:${rc}55">${rl}</span>
                        <span class="binfo-level">Lv.${b.level}</span>
                    </div>
                    <div class="binfo-desc">${def.desc || ''}</div>
                </div>
            </div>

            ${defeated
                ? `<div class="binfo-timer-block binfo-timer-block--dead">
                        <div class="binfo-timer-label">${_bL.t('boss.defeated')}</div>
                        <div class="binfo-timer-val">00:00</div>
                   </div>`
                : (() => {
                    const elp = bm._stateFetchedAt > 0 ? Math.max(0,(Date.now()-bm._stateFetchedAt)/1000) : 0;
                    const r0  = Math.max(0, Math.floor(serverRem - elp));
                    const tc  = r0 < 60 ? '#ff4444' : (r0 < 120 ? '#ffd700' : rc);
                    const ts  = `${String(Math.floor(r0/60)).padStart(2,'0')}:${String(r0%60).padStart(2,'0')}`;
                    return `<div class="binfo-timer-block">
                                <div class="binfo-timer-label">${_bL.t('boss.ttk')}</div>
                                <div class="binfo-timer-val" id="binfo-live-timer" style="color:${tc};text-shadow:0 0 20px ${tc}88">${ts}</div>
                            </div>`;
                  })()
            }

            <div class="binfo-hp-section">
                <div class="binfo-hp-label">
                    <span>HP</span>
                    <span>${formatNum(Math.max(0, b.currentHp))} / ${formatNum(b.maxHp)} &nbsp;<strong style="color:${hpColor}">${hpPct}%</strong></span>
                </div>
                <div class="binfo-hp-track">
                    <div class="binfo-hp-fill" style="width:${hpPct}%;background:${hpColor};box-shadow:0 0 10px ${hpColor}88;transition:width .5s ease"></div>
                </div>
            </div>


            <div class="binfo-footer-stats">
                ${acc.isLoggedIn() && bm.myDamage > 0 ? `<span>${_bL.t('boss.damage.this')}: <strong style="color:${rc}">${formatNum(bm.myDamage)}</strong></span>` : ''}
                ${acc.isLoggedIn() && bm.lifetimeDamage > 0 ? `<span>${_bL.t('boss.damage.total')}: <strong style="color:var(--gold)">${formatNum(bm.lifetimeDamage)}</strong></span>` : ''}
            </div>

            ${!defeated ? `<button class="binfo-battle-btn" style="border-color:${rc}44;color:${rc};opacity:0.7;font-size:11px" onclick="window.game.ui._openBossWorld()">🌐 ${_bL.t('boss.world.enter')}</button>` : ''}`;
    }

    async _renderBossRankingContent(container) {
        const g   = this._game;
        const bm  = g.boss;
        const acc = g.account;
        const _bcL = window.LANG || { t: k => k };
        const isOnline = acc.isLoggedIn() && !acc.isLocalOnly() && window.location.protocol !== 'file:';
        const isDano   = this._activeBossRankTab !== 'abates';

        let top = [], playerRank = null;

        if (isOnline) {
            const endpoint = isDano ? 'damage_top' : 'kills_top';
            try {
                const res  = await fetch(`api/boss.php?action=${endpoint}`);
                const data = await res.json();
                if (data.ok) top = data.top || [];
            } catch {
                container.innerHTML = `<div class="lb-error">⚠️ Sem conexão com o servidor.</div>`;
                return;
            }
        }

        const uid = acc.getAccount()?.id;
        if (uid) top.forEach(e => { if (e.userId === uid) e.isPlayer = true; });

        const localScore = isDano ? bm.lifetimeDamage : bm.bossKills;
        const playerLocal = acc.isLoggedIn() && localScore > 0 ? {
            userId: uid, username: acc.getAccount()?.username, foto: acc.getAccount()?.foto,
            vip: acc.isVip(), damage: bm.lifetimeDamage, kills: bm.bossKills, isPlayer: true,
        } : null;

        const playerInList = top.some(e => e.isPlayer);
        const podiumClasses = ['lb-pod-1st','lb-pod-2nd','lb-pod-3rd'];
        const podiumMedals  = ['🏆','🥈','🥉'];
        const unit          = isDano ? ' ⚔' : ' ☠';
        const scoreOf       = e => isDano ? (e.damage ?? 0) : (e.kills ?? 0);

        const avatarEl = (entry) => {
            if (entry.isPlayer) return `<img class="lb-avatar-img" src="${acc.getPhotoUrl()}" alt="">`;
            const src = entry.foto ? `foto/${entry.foto}` : 'foto/padrao.png';
            return `<img class="lb-avatar-img" src="${src}" alt="">`;
        };

        const onlineDot = (e) => (e.isPlayer || e.online)
            ? `<span class="status-dot status-dot--online lb-online-dot" title="Online"></span>`
            : `<span class="status-dot status-dot--offline lb-online-dot" title="Offline"></span>`;

        const buildPodiumSlot = (entry, rank) => {
            if (!entry) return `<div class="lb-pod-slot ${podiumClasses[rank-1]} lb-pod-empty"><div class="lb-pod-medal">${podiumMedals[rank-1]}</div><div class="lb-pod-card lb-pod-card--empty"><span>—</span></div><div class="lb-pod-pedestal"></div></div>`;
            const nameClass = entry.vip ? 'lb-pod-name lb-name-vip' : 'lb-pod-name';
            const dot       = onlineDot(entry);
            return `
                <div class="lb-pod-slot ${podiumClasses[rank-1]}${entry.isPlayer ? ' lb-pod-you' : ''}">
                    <div class="lb-pod-medal">${podiumMedals[rank-1]}</div>
                    <div class="lb-pod-card">
                        <div class="lb-pod-avatar-wrap">${avatarEl(entry)}${dot}</div>
                        <div class="${nameClass}">${entry.username}</div>
                        <div class="lb-pod-score" style="color:var(--gold)">${formatNum(scoreOf(entry))}<span class="lb-unit">${unit}</span></div>
                    </div>
                    <div class="lb-pod-pedestal"></div>
                </div>`;
        };

        const buildRow = (entry, rank) => {
            const nameClass = entry.vip ? 'lb-name lb-name-vip' : 'lb-name';
            const dot       = onlineDot(entry);
            return `
                <div class="lb-row${entry.isPlayer ? ' lb-row-player' : ''}">
                    <div class="lb-rank">#${rank}</div>
                    <div class="lb-row-avatar">${avatarEl(entry)}</div>
                    ${dot}
                    <div class="lb-info">
                        <div class="${nameClass}">${entry.username}</div>
                    </div>
                    <div class="lb-score" style="color:var(--gold)">${formatNum(scoreOf(entry))}<span class="lb-unit">${unit}</span></div>
                </div>`;
        };

        const podiumHTML = `<div class="lb-podium">${buildPodiumSlot(top[0],1)}${buildPodiumSlot(top[1],2)}${buildPodiumSlot(top[2],3)}</div>`;
        let rowsHTML = top.slice(3).map((e, i) => buildRow(e, i + 4)).join('');

        if (!playerInList && playerLocal) {
            rowsHTML += `<div class="lb-separator">· · ·</div>` + buildRow(playerLocal, playerRank ?? (top.length + 1));
        }
        if (top.length === 0 && !playerLocal) {
            rowsHTML = `<div class="lb-empty">${_bcL.t('boss.rank.empty')}</div>`;
        }

        const curLang2 = window.LANG?.current || 'pt-BR';
        const time = new Date().toLocaleTimeString(curLang2, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const footer = isOnline
            ? `🌐 ${_bcL.t('lb.footer.online')} · ${_bcL.t('lb.footer.updated')} ${time}`
            : (!acc.isLoggedIn() ? `⚠️ ${_bcL.t('lb.footer.no.login')}`
                                 : `⚠️ ${_bcL.t('lb.footer.local')}`);

        container.innerHTML = `
            ${podiumHTML}
            <div class="lb-list">${rowsHTML}</div>
            <div class="lb-footer">${footer}</div>`;

        if (this._bossRankRefreshTimer) clearInterval(this._bossRankRefreshTimer);
        this._bossRankRefreshTimer = setInterval(() => {
            if (this._activePanel === 'boss_ranking') {
                const c = document.getElementById('modal-content');
                if (c) this._renderBossRankingContent(c);
            } else {
                clearInterval(this._bossRankRefreshTimer);
                this._bossRankRefreshTimer = null;
            }
        }, 30_000);
    }

    // ── Boss Upgrades Tab ─────────────────────────────────────────────────────

    _renderBossUpgrades() {
        const panel = document.getElementById('boss-info-panel');
        if (!panel) return;
        const bm  = this._game.boss;
        const g   = this._game;
        const _buL = window.LANG || { t: k => k };
        const upgrades = bm.upgradeDefs || [];
        if (!upgrades.length) {
            panel.innerHTML = `<div class="empty-msg">${_buL.t('boss.upgrades.empty')}</div>`;
            return;
        }

        const qty   = this._bossUpgQty;
        const mult  = g.shop?.getBossDamageMult?.() || 1;
        const qtyRow = [1, 10, 25, 100].map(n =>
            `<button class="gen-qty-btn${qty === n ? ' active' : ''}"
                     onclick="window.game.ui.setBossUpgQty(${n})">×${n}</button>`
        ).join('') +
        `<button class="gen-qty-btn gen-qty-max${qty === 'max' ? ' active' : ''}"
                 onclick="window.game.ui.setBossUpgQty('max')">MAX</button>`;

        let html = `
            <div class="binfo-upg-header">
                <div class="binfo-upg-power">
                    ${_buL.t('boss.upgrades.power')}: <strong style="color:var(--gold)">${formatNum(bm.bossPower)}</strong> dmg/clique
                    ${mult > 1 ? `<span style="color:var(--pink)"> × ${mult}</span>` : ''}
                </div>
                <div style="font-size:11px;color:var(--text-dim);margin-top:4px">
                    💎 <strong style="color:var(--gold)">${formatNum(g.economy.prestigeTokens)}</strong> ${_buL.t('boss.upgrades.diamonds')}
                </div>
            </div>
            <div class="gen-qty-row" style="margin:8px 0 4px">${qtyRow}</div>
            <div id="boss-upgrades-list" style="display:flex;flex-direction:column;gap:5px">`;

        const diamonds = g.economy.prestigeTokens;
        upgrades.forEach(upg => {
            const maxBuy = Math.max(0, Math.floor(diamonds / upg.cost));
            const reqQty = qty === 'max' ? maxBuy : (typeof qty === 'number' ? qty : 1);

            // Enabled only when can afford the FULL requested quantity
            const canAfford = qty === 'max' ? maxBuy > 0 : maxBuy >= reqQty;

            // Cost shown = full price for the requested qty (grayed when disabled so user sees what's needed)
            const displayCost = upg.cost * (qty === 'max' ? Math.max(1, maxBuy) : reqQty);

            html += `
                <div class="upgrade-item${canAfford ? ' can-afford' : ''}">
                    <span class="upg-icon">${upg.icon}</span>
                    <div class="upg-info">
                        <div class="upg-name">${upg.name}</div>
                        <div class="upg-desc">${upg.desc}</div>
                    </div>
                    <button class="gen-buy-btn${canAfford ? ' can-afford' : ''}"
                            style="min-width:90px;flex-shrink:0;white-space:nowrap"
                            onclick="window.game.ui._buyBossUpgrade('${upg.id}')"
                            ${canAfford ? '' : 'disabled'}>
                        ${displayCost} 💎
                    </button>
                </div>`;
        });

        html += `</div>`;
        panel.innerHTML = html;
    }

    setBossUpgQty(qty) {
        this._bossUpgQty = qty;
        if (this._activePanel === 'boss_upgrades') this._renderBossUpgrades();
    }

    _buyBossUpgrade(id) {
        const bm  = this._game.boss;
        const upg = bm.upgradeDefs.find(u => u.id === id);
        if (!upg) return;
        const qty    = this._bossUpgQty;
        const maxBuy = Math.max(0, Math.floor(this._game.economy.prestigeTokens / upg.cost));
        const reqQty = qty === 'max' ? maxBuy : (typeof qty === 'number' ? qty : 1);
        // Only buy if can afford the full requested amount (MAX buys whatever is available)
        const buyN = qty === 'max' ? maxBuy : (maxBuy >= reqQty ? reqQty : 0);
        if (buyN <= 0) return;
        const bought = bm.buyBossUpgradeN(id, buyN);
        if (bought > 0) this._renderBossUpgrades();
    }

    // ── Boss lock ─────────────────────────────────────────────────────────────

    _bossUnlocked() { return this._game.level.level >= 35; }

    _renderBossLocked(content) {
        const needed = Math.max(0, 35 - this._game.level.level);
        const _blL = window.LANG || { t: k => k };
        const levelsStr = needed === 1 ? _blL.t('boss.locked.level.singular') : _blL.t('boss.locked.level.plural');
        content.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 20px;text-align:center">
                <div style="font-size:52px;margin-bottom:16px">🔒</div>
                <div style="font-family:'Orbitron',monospace;font-size:15px;color:var(--cyan);font-weight:700;margin-bottom:8px">${_blL.t('boss.locked.title')}</div>
                <div style="font-size:12px;color:var(--text-dim);max-width:240px;line-height:1.5">${_blL.t('boss.locked.desc')}</div>
                <div style="margin-top:24px;font-family:'Orbitron',monospace;font-size:22px;color:var(--gold);font-weight:700">Lv ${this._game.level.level}</div>
                <div style="font-size:11px;color:var(--text-dim);margin-top:4px">${needed} ${levelsStr} ${_blL.t('boss.locked.to.unlock')}</div>
            </div>`;
    }

    // ── Boss World & Notification ─────────────────────────────────────────────

    _initBossUI() {
        const g   = this._game;
        const bm  = g.boss;

        if (this._bossUnlocked()) bm.startPolling(5000);

        // New boss appeared → show notification only if unlocked and not already in battle
        g.events.on('bossSpawned', ({ boss }) => {
            if (!this._bossUnlocked()) return;
            if (this._worldOpen) return; // player is already fighting — no popup needed
            this._showBossNotification(boss);
            g.audio.event?.();
        });

        // State updates → refresh world if open
        g.events.on('bossStateUpdate', () => { if (this._worldOpen) this._updateBossWorld(); if (this._activePanel === 'boss_battle') this._renderBossInfoContent(); });
        g.events.on('bossHit',         () => { if (this._worldOpen) this._updateBossWorld(); if (this._activePanel === 'boss_battle') this._renderBossInfoContent(); });
        g.events.on('bossDefeated',    () => { if (this._worldOpen) this._updateBossWorld(); if (this._activePanel === 'boss_battle') this._renderBossInfoContent(); });

        // Notification buttons
        document.getElementById('bn-battle')?.addEventListener('click', () => {
            this._hideBossNotification();
            this._openBossWorld();
        });
        document.getElementById('bn-close')?.addEventListener('click', () => this._hideBossNotification());

        // Boss world exit button + click-to-attack
        document.getElementById('bw-exit')?.addEventListener('click', () => this._closeBossWorld());
        document.getElementById('bw-content')?.addEventListener('click', e => {
            if (!e.target.closest('.bw-arena')) return;
            if (!bm.boss || bm.boss.status !== 'active') return;
            if (!g.account.isLoggedIn()) return;
            bm.attackClick();
            this._spawnBossHit(e.target.closest('.bw-arena'));
        });

        // Keyboard: Escape closes boss world (or dismisses reward card)
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;
            const overlay = document.getElementById('bw-reward-overlay');
            if (overlay) { document.getElementById('bw-reward-claim-btn')?.click(); return; }
            if (this._worldOpen) this._closeBossWorld();
        });
    }

    // ── Notification ──────────────────────────────────────────────────────────

    _showBossNotification(boss) {
        const def = (typeof BOSS_TYPES !== 'undefined' && BOSS_TYPES[boss.type]) || {};
        const rc  = (typeof BOSS_RARITY_COLORS !== 'undefined' && BOSS_RARITY_COLORS[boss.rarity]) || '#00f5ff';
        const rl  = (typeof BOSS_RARITY_LABELS !== 'undefined' && BOSS_RARITY_LABELS[boss.rarity]) || boss.rarity;

        const notif = document.getElementById('boss-notification');
        if (!notif) return;
        notif.style.setProperty('--bn-color', rc);
        document.getElementById('bn-icon').textContent  = def.icon || '👾';
        document.getElementById('bn-name').textContent  = def.name || boss.type;
        document.getElementById('bn-sub').textContent   = `${rl} · Lv. ${boss.level}`;

        notif.classList.remove('show');
        void notif.offsetWidth;
        notif.classList.add('show');

        // Auto-dismiss after 20s
        clearTimeout(this._notifTimer);
        this._notifTimer = setTimeout(() => this._hideBossNotification(), 20_000);
    }

    _hideBossNotification() {
        clearTimeout(this._notifTimer);
        document.getElementById('boss-notification')?.classList.remove('show');
    }

    // ── Boss World ────────────────────────────────────────────────────────────

    _openBossWorld() {
        // Always dismiss the notification card first (regardless of how we got here)
        this._hideBossNotification();

        const world = document.getElementById('boss-world');
        if (!world) return;
        // Force-close any open modal panel immediately (no transition delay so it doesn't bleed through)
        if (this._activePanel) {
            if (this._lbRefreshTimer) { clearInterval(this._lbRefreshTimer); this._lbRefreshTimer = null; }
            this._parentPanel = null;
            this._activePanel = null;
            document.querySelectorAll('.sidebar-btn, .mobile-nav-btn').forEach(b => b.classList.remove('active'));
            const modalPanel    = document.getElementById('modal-panel');
            const modalOverlay  = document.getElementById('modal-overlay');
            if (modalPanel)   { modalPanel.classList.remove('open');   modalPanel.style.display   = 'none'; }
            if (modalOverlay) { modalOverlay.style.display = 'none'; }
            const mc = document.getElementById('modal-content');
            if (mc) mc.innerHTML = '';
        }
        this._worldOpen = true;
        this._game.boss.openBossWorld();

        world.className = 'open';
        world.setAttribute('data-type', this._game.boss.boss?.type || '');
        this._spawnWorldParticles();
        this._renderBossWorld();
    }

    _closeBossWorld() {
        // If reward card is already showing, ignore (Escape/click handled by card itself)
        if (document.getElementById('bw-reward-overlay')) return;
        const r = this._game.boss._sessionRewards;
        const hasRewards = r && (r.neurons > 0 || r.diamonds > 0 || r.kills > 0);
        if (hasRewards) {
            this._showBossRewardSummary(r, true, () => this._doCloseBossWorld());
        } else {
            this._doCloseBossWorld();
        }
    }

    _doCloseBossWorld() {
        this._worldOpen = false;
        if (this._bossWorldTimerInterval) { clearInterval(this._bossWorldTimerInterval); this._bossWorldTimerInterval = null; }
        this._game.boss.closeBossWorld();
        const world = document.getElementById('boss-world');
        if (world) {
            world.classList.remove('open');
            document.getElementById('bw-reward-overlay')?.remove();
            const p = document.getElementById('bw-particles');
            if (p) p.innerHTML = '';
        }
    }

    // isExit=true → "Resgatar e Sair" + fecha o mundo; isExit=false → "Resgatar" + fica
    // ── Modal de seleção de método de pagamento ──────────────────────────────

    _showPaymentMethodModal(itemId, itemLabel, itemPrice) {
        document.getElementById('pay-method-overlay')?.remove();
        const _pmL = window.LANG || { t: k => k };

        const overlay = document.createElement('div');
        overlay.id = 'pay-method-overlay';
        overlay.className = 'pay-overlay';
        overlay.innerHTML = `
            <div class="pay-modal pay-method-modal">
                <div class="pay-method-title">${_pmL.t('pay.method.title')}</div>
                <div class="pay-method-item">${itemLabel} · <strong>${itemPrice}</strong></div>
                <div class="pay-method-options">
                    <button class="pay-method-btn pay-method-btn--pix" id="pay-opt-pix">
                        <span class="pay-method-icon">💚</span>
                        <span class="pay-method-info">
                            <span class="pay-method-name">PIX</span>
                            <span class="pay-method-sub">${_pmL.t('pay.pix.instant')}</span>
                        </span>
                    </button>
                    <button class="pay-method-btn pay-method-btn--card" id="pay-opt-card">
                        <span class="pay-method-icon">💳</span>
                        <span class="pay-method-info">
                            <span class="pay-method-name">${_pmL.t('pay.card.name')}</span>
                            <span class="pay-method-sub">${_pmL.t('pay.card.sub')}</span>
                        </span>
                    </button>
                </div>
                <button class="pay-btn pay-btn--cancel" id="pay-method-cancel">${_pmL.t('profile.register.cancel')}</button>
            </div>`;
        document.body.appendChild(overlay);

        document.getElementById('pay-opt-pix')?.addEventListener('click', () => {
            overlay.remove();
            this._game.iniciarPix(itemId);
        });
        document.getElementById('pay-opt-card')?.addEventListener('click', () => {
            overlay.remove();
            this._game._iniciarCheckoutPro(itemId);
        });
        document.getElementById('pay-method-cancel')?.addEventListener('click', () => overlay.remove());
    }

    // ── Modal do PIX com QR code ──────────────────────────────────────────────

    _showPixModal(itemId, txId, paymentId, qrCode, qrBase64) {
        document.getElementById('pay-pix-overlay')?.remove();
        const _ppL = window.LANG || { t: k => k };

        const overlay = document.createElement('div');
        overlay.id = 'pay-pix-overlay';
        overlay.className = 'pay-overlay';

        const qrWrapInner = qrBase64
            ? `<img class="pix-qr-img" src="data:image/png;base64,${qrBase64}" alt="QR Code PIX">`
            : `<div class="pix-qr-canvas-host"></div>`;

        overlay.innerHTML = `
            <div class="pay-modal pix-modal">
                <div class="pix-header">
                    <span class="pix-logo">💚</span>
                    <div>
                        <div class="pix-title">${_ppL.t('pay.pix.title')}</div>
                        <div class="pix-sub">${_ppL.t('pay.pix.sub')}</div>
                    </div>
                </div>
                <div class="pix-qr-wrap">${qrWrapInner}</div>
                <div class="pix-copy-section">
                    <div class="pix-code-label">${_ppL.t('pay.pix.label')}</div>
                    <div class="pix-code-box">${qrCode}</div>
                    <button class="pix-copy-btn">${_ppL.t('pay.pix.copy')}</button>
                </div>
                <div class="pay-status-msg">${_ppL.t('pay.status.waiting')}</div>
                <div class="pay-actions">
                    <button class="pay-btn pay-btn--check">${_ppL.t('pay.btn.check')}</button>
                    <button class="pay-btn pay-btn--cancel">${_ppL.t('profile.register.cancel')}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        // Referências diretas — zero ambiguidade com getElementById
        const qHost  = overlay.querySelector('.pix-qr-canvas-host');
        const msgEl  = overlay.querySelector('.pay-status-msg');
        const setMsg = (msg, ok = false) => { if (msgEl) { msgEl.textContent = msg; msgEl.style.color = ok ? '#00ff88' : ''; } };

        // QR code síncrono (window.innerWidth sempre disponível)
        if (!qrBase64 && qrCode && qHost) {
            if (typeof QRCode !== 'undefined') {
                const sz = Math.min(200, window.innerWidth - 90);
                new QRCode(qHost, { text: qrCode, width: sz, height: sz,
                    colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
            } else {
                qHost.innerHTML = `<div class="pix-qr-placeholder">📷 QR indisponível</div>`;
            }
        }

        overlay.querySelector('.pix-copy-btn')?.addEventListener('click', () => {
            navigator.clipboard?.writeText(qrCode).then(() => {
                const btn = overlay.querySelector('.pix-copy-btn');
                if (btn) { btn.textContent = _ppL.t('pay.pix.copied'); setTimeout(() => { btn.textContent = _ppL.t('pay.pix.copy'); }, 2000); }
            });
        });

        let polling = null, done = false;
        const checkStatus = async () => {
            if (done) return;
            setMsg(_ppL.t('pay.status.checking'));
            try {
                const res  = await fetch(`api/pagamento.php?action=status&id=${txId}`);
                const data = await res.json();
                if (data.status === 'approved') {
                    done = true; clearInterval(polling);
                    setMsg(_ppL.t('pay.status.ok'), true);
                    setTimeout(() => { overlay.remove(); if (data.item_id) this._game._entregarItem(data.item_id); }, 900);
                    return;
                }
                if (['rejected', 'cancelled', 'refunded'].includes(data.status)) {
                    done = true; clearInterval(polling);
                    overlay.remove(); this._game.notify(_ppL.t('pay.status.failed'), 'error');
                    return;
                }
                setMsg(_ppL.t('pay.status.pix.waiting'));
            } catch { setMsg(_ppL.t('pay.status.verifying.conn')); }
        };
        polling = setInterval(checkStatus, 5000);

        overlay.querySelector('.pay-btn--check')?.addEventListener('click', checkStatus);
        overlay.querySelector('.pay-btn--cancel')?.addEventListener('click', () => {
            done = true; clearInterval(polling); overlay.remove();
        });
    }

    // ── PIX estático (fallback quando MP retorna unauthorized) ──────────────

    _showPixModalEstatico(itemId, txId) {
        document.getElementById('pay-pix-overlay')?.remove();
        const _psL = window.LANG || { t: k => k };

        const PIX_STATIC = '00020126330014BR.GOV.BCB.PIX0111045117310475204000053039865802BR5901N6001C62070503***63042FCA';

        const overlay = document.createElement('div');
        overlay.id = 'pay-pix-overlay';
        overlay.className = 'pay-overlay';
        overlay.innerHTML = `
            <div class="pay-modal pix-modal">
                <div class="pix-header">
                    <span class="pix-logo">💚</span>
                    <div>
                        <div class="pix-title">${_psL.t('pay.pix.title')}</div>
                        <div class="pix-sub">${_psL.t('pay.pix.sub')}</div>
                    </div>
                </div>
                <div class="pix-qr-wrap">
                    <div class="pix-qr-canvas-host"></div>
                </div>
                <div class="pix-copy-section">
                    <div class="pix-code-label">${_psL.t('pay.pix.label')}</div>
                    <div class="pix-code-box">${PIX_STATIC}</div>
                    <button class="pix-copy-btn">${_psL.t('pay.pix.copy')}</button>
                </div>
                <div class="pay-status-msg">${_psL.t('pay.status.pix.waiting')}</div>
                <div class="pay-actions">
                    <button class="pay-btn pay-btn--check">${_psL.t('pay.btn.check')}</button>
                    <button class="pay-btn pay-btn--cancel">${_psL.t('profile.register.cancel')}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        // Referências diretas pelo overlay — sem getElementById
        const qHost  = overlay.querySelector('.pix-qr-canvas-host');
        const msgEl  = overlay.querySelector('.pay-status-msg');
        const setMsg = (msg, ok = false) => { if (msgEl) { msgEl.textContent = msg; msgEl.style.color = ok ? '#00ff88' : ''; } };

        // QR code síncrono
        if (qHost) {
            if (typeof QRCode !== 'undefined') {
                const sz = Math.min(200, window.innerWidth - 90);
                new QRCode(qHost, { text: PIX_STATIC, width: sz, height: sz,
                    colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
            } else {
                qHost.innerHTML = `<div class="pix-qr-placeholder">📷 QR indisponível</div>`;
            }
        }

        overlay.querySelector('.pix-copy-btn')?.addEventListener('click', () => {
            navigator.clipboard?.writeText(PIX_STATIC).then(() => {
                const btn = overlay.querySelector('.pix-copy-btn');
                if (btn) { btn.textContent = _psL.t('pay.pix.copied'); setTimeout(() => { btn.textContent = _psL.t('pay.pix.copy'); }, 2000); }
            });
        });

        let done = false, polling = null;
        const checkStatus = async () => {
            if (done) return;
            setMsg(_psL.t('pay.status.checking'));
            try {
                const res  = await fetch(`api/pagamento.php?action=verificar_pix_estatico&tx_id=${txId}`);
                const data = await res.json();
                if (data.status === 'approved') {
                    done = true; clearInterval(polling);
                    setMsg(_psL.t('pay.status.confirmed'), true);
                    setTimeout(() => { overlay.remove(); if (data.item_id) this._game._entregarItem(data.item_id); }, 900);
                    return;
                }
                setMsg(_psL.t('pay.status.confirm.waiting'));
            } catch {
                setMsg(_psL.t('pay.status.conn.error'));
            }
        };

        polling = setInterval(checkStatus, 5000);
        overlay.querySelector('.pay-btn--check')?.addEventListener('click', checkStatus);
        overlay.querySelector('.pay-btn--cancel')?.addEventListener('click', () => {
            done = true; clearInterval(polling); overlay.remove();
        });
    }

    // ── Modal de espera de pagamento ─────────────────────────────────────────

    _setPaymentBtnLoading(itemId, loading) {
        // Desabilita/habilita o botão enquanto cria a preferência no MP
        document.querySelectorAll('[data-pay-item]').forEach(btn => {
            if (btn.dataset.payItem === itemId) {
                btn.disabled = loading;
                if (loading) btn.dataset.origText = btn.textContent;
                btn.textContent = loading ? '⏳ ' + (window.LANG||{t:k=>k}).t('friends.loading') : (btn.dataset.origText || (window.LANG||{t:k=>k}).t('skin.buy'));
            }
        });
    }

    _showPaymentWaitModal(itemId, txId) {
        document.getElementById('pay-wait-overlay')?.remove();
        const _pwL = window.LANG || { t: k => k };

        const overlay = document.createElement('div');
        overlay.id = 'pay-wait-overlay';
        overlay.className = 'pay-overlay';
        overlay.innerHTML = `
            <div class="pay-modal">
                <div class="pay-icon">💳</div>
                <div class="pay-title">${_pwL.t('pay.status.waiting')}</div>
                <div class="pay-sub">${_pwL.t('pay.status.confirm.waiting')}</div>
                <div class="pay-spinner"></div>
                <div class="pay-status-msg" id="pay-status-msg">${_pwL.t('pay.status.checking')}</div>
                <div class="pay-actions">
                    <button class="pay-btn pay-btn--check" id="pay-check-now">${_pwL.t('pay.btn.check')}</button>
                    <button class="pay-btn pay-btn--cancel" id="pay-cancel">${_pwL.t('profile.register.cancel')}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        let polling = null;
        let done    = false;

        const setMsg = (msg, ok = false) => {
            const el = document.getElementById('pay-status-msg');
            if (el) { el.textContent = msg; el.style.color = ok ? '#00ff88' : ''; }
        };

        const checkStatus = async () => {
            if (done) return;
            setMsg(_pwL.t('pay.status.checking'));
            try {
                const res  = await fetch(`api/pagamento.php?action=status&id=${txId}`);
                const data = await res.json();
                if (!data.ok) { setMsg(_pwL.t('pay.status.verifying.conn')); return; }

                if (data.status === 'approved') {
                    done = true;
                    clearInterval(polling);
                    setMsg(_pwL.t('pay.status.confirmed'), true);
                    setTimeout(() => {
                        overlay.remove();
                        if (data.item_id) this._game._entregarItem(data.item_id);
                    }, 900);
                    return;
                }
                if (['rejected','cancelled','refunded'].includes(data.status)) {
                    done = true;
                    clearInterval(polling);
                    overlay.remove();
                    this._game.notify(_pwL.t('pay.status.failed'), 'error');
                    return;
                }
                setMsg(_pwL.t('pay.status.confirm.waiting'));
            } catch {
                setMsg(_pwL.t('pay.status.conn.error'));
            }
        };

        polling = setInterval(checkStatus, 5000);

        document.getElementById('pay-check-now')?.addEventListener('click', checkStatus);
        document.getElementById('pay-cancel')?.addEventListener('click', () => {
            done = true;
            clearInterval(polling);
            overlay.remove();
        });

        // Timeout: fecha após 15 minutos sem confirmação
        setTimeout(() => {
            if (!done) {
                done = true;
                clearInterval(polling);
                overlay?.remove();
            }
        }, 15 * 60 * 1000);
    }

    _showBossRewardSummary(rewards, isExit, onClaim) {
        const world = document.getElementById('boss-world');
        if (!world) return;
        document.getElementById('bw-reward-overlay')?.remove();

        const _brL = window.LANG || { t: k => k };
        const fmt = typeof formatNum === 'function' ? formatNum : n => n.toLocaleString();
        const btnLabel = isExit ? `✓ ${_brL.t('missions.claim')} & ${_brL.t('profile.logout').split(' ')[0]}` : `✓ ${_brL.t('missions.claim')}`;

        const killRow = rewards.kills > 0 ? `
            <div class="bw-rc-row">
                <span class="bw-rc-icon">💀</span>
                <span class="bw-rc-label">${_brL.t('stats.boss.kills')}</span>
                <span class="bw-rc-val bw-rc-kills">${rewards.kills}</span>
            </div>` : '';
        const neuronRow = rewards.neurons > 0 ? `
            <div class="bw-rc-row">
                <span class="bw-rc-icon">🧠</span>
                <span class="bw-rc-label">${_brL.t('stats.neurons.section')}</span>
                <span class="bw-rc-val bw-rc-gold">+${fmt(rewards.neurons)}</span>
            </div>` : '';
        const diamondRow = rewards.diamonds > 0 ? `
            <div class="bw-rc-row">
                <span class="bw-rc-icon">💎</span>
                <span class="bw-rc-label">${_brL.t('stats.diamonds')}</span>
                <span class="bw-rc-val bw-rc-cyan">+${rewards.diamonds}</span>
            </div>` : '';

        const overlay = document.createElement('div');
        overlay.className = 'bw-reward-overlay';
        overlay.id = 'bw-reward-overlay';
        overlay.innerHTML = `
            <div class="bw-reward-card">
                <div class="bw-rc-header">
                    <div class="bw-rc-title">⚔ ${_brL.t('rebirth.reward.title')}</div>
                    <div class="bw-rc-sub">${isExit ? _brL.t('boss.world.entering').replace('…','') : _brL.t('boss.cooldown.title')}</div>
                </div>
                <div class="bw-rc-rows">
                    ${killRow}${neuronRow}${diamondRow}
                </div>
                <button class="bw-rc-btn" id="bw-reward-claim-btn">${btnLabel}</button>
            </div>`;
        world.appendChild(overlay);

        document.getElementById('bw-reward-claim-btn')?.addEventListener('click', () => {
            overlay.remove();
            if (onClaim) onClaim();
        });
    }

    _spawnWorldParticles() {
        const container = document.getElementById('bw-particles');
        if (!container) return;
        container.innerHTML = '';
        for (let i = 0; i < 25; i++) {
            const p = document.createElement('div');
            p.className = 'bw-particle';
            p.style.cssText = [
                `left:${Math.random() * 100}%`,
                `animation-delay:${(Math.random() * 12).toFixed(2)}s`,
                `animation-duration:${(7 + Math.random() * 10).toFixed(2)}s`,
                `width:${(2 + Math.random() * 4).toFixed(1)}px`,
                `height:${(2 + Math.random() * 4).toFixed(1)}px`,
                `opacity:${(0.3 + Math.random() * 0.5).toFixed(2)}`,
            ].join(';');
            container.appendChild(p);
        }
    }

    _renderBossWorld() {
        const content = document.getElementById('bw-content');
        if (!content) return;
        // Reset _bwKey so _updateBossWorld always does a full rebuild, never partial
        content._bwKey = null;
        content.innerHTML = `<div class="bw-loading">⚔️ ${(window.LANG||{t:k=>k}).t('boss.world.entering')}</div>`;
        this._updateBossWorld();
    }

    _updateBossWorld() {
        const content = document.getElementById('bw-content');
        if (!content) return;
        const bm  = this._game.boss;
        const acc = this._game.account;

        // ── No boss: cooldown screen ──────────────────────────────────────────
        if (!bm.boss) {
            const wait = Math.max(0, bm.cooldown || 0);

            // Rebuild structure only once on enter (key = 'no-boss')
            if (content._bwKey !== 'no-boss') {
                content._bwKey = 'no-boss';
                if (this._bossWorldTimerInterval) { clearInterval(this._bossWorldTimerInterval); this._bossWorldTimerInterval = null; }

                // Render the correct time immediately — no --:-- flash
                const _fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
                const _bwL = window.LANG || { t: k => k };
                content.innerHTML = `
                    <div class="bw-no-boss">
                        <div class="bw-no-boss-icon">⏳</div>
                        <div class="bw-no-boss-title">${_bwL.t('boss.cooldown.title')}</div>
                        <div class="bw-no-boss-timer">${_bwL.t('boss.world.next.boss')}</div>
                        <div class="bw-countdown" id="bw-cooldown-timer">${_fmt(wait)}</div>
                        <div class="bw-no-boss-hint">${_bwL.t('boss.world.cooldown.hint')}</div>
                    </div>`;

                const cooldownFetchedAt = Date.now();
                const cooldownStart     = wait;
                this._bossWorldTimerInterval = setInterval(() => {
                    if (!this._worldOpen) { clearInterval(this._bossWorldTimerInterval); this._bossWorldTimerInterval = null; return; }
                    const el = document.getElementById('bw-cooldown-timer');
                    if (!el) { clearInterval(this._bossWorldTimerInterval); this._bossWorldTimerInterval = null; return; }
                    const rem = Math.max(0, Math.floor(cooldownStart - (Date.now() - cooldownFetchedAt) / 1000));
                    el.textContent = _fmt(rem);
                    el.style.color = rem < 60 ? '#ff4444' : rem < 120 ? '#ffd700' : '#00f5ff';
                    if (rem <= 0) {
                        el.textContent = '00:00';
                        clearInterval(this._bossWorldTimerInterval);
                        this._bossWorldTimerInterval = null;
                        bm.fetchState();
                    }
                }, 1000);
            }

            // Update timer reference when server poll returns a fresher cooldown
            // (avoids drift without rebuilding the whole structure)
            else if (wait > 0) {
                const el = document.getElementById('bw-cooldown-timer');
                if (el && el._lastSyncWait !== wait) {
                    el._lastSyncWait = wait;
                    // Restart countdown from the updated server value
                    if (this._bossWorldTimerInterval) { clearInterval(this._bossWorldTimerInterval); this._bossWorldTimerInterval = null; }
                    const _fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
                    const fetchedAt = Date.now();
                    this._bossWorldTimerInterval = setInterval(() => {
                        if (!this._worldOpen) { clearInterval(this._bossWorldTimerInterval); this._bossWorldTimerInterval = null; return; }
                        const el2 = document.getElementById('bw-cooldown-timer');
                        if (!el2) { clearInterval(this._bossWorldTimerInterval); this._bossWorldTimerInterval = null; return; }
                        const rem = Math.max(0, Math.floor(wait - (Date.now() - fetchedAt) / 1000));
                        el2.textContent = _fmt(rem);
                        el2.style.color = rem < 60 ? '#ff4444' : rem < 120 ? '#ffd700' : '#00f5ff';
                        if (rem <= 0) { el2.textContent = '00:00'; clearInterval(this._bossWorldTimerInterval); this._bossWorldTimerInterval = null; bm.fetchState(); }
                    }, 1000);
                }
            }
            return;
        }

        const b        = bm.boss;
        const def      = (typeof BOSS_TYPES !== 'undefined' && BOSS_TYPES[b.type]) || {};
        const rc       = (typeof BOSS_RARITY_COLORS !== 'undefined' && BOSS_RARITY_COLORS[b.rarity]) || '#00f5ff';
        const rl       = (typeof BOSS_RARITY_LABELS !== 'undefined' && BOSS_RARITY_LABELS[b.rarity]) || b.rarity;
        const defeated = b.status === 'defeated' || b.status === 'expired';

        // ── Only FULL rebuild when boss identity or defeat state changes ──────
        const structKey = `boss-${b.id}-${defeated}`;
        if (content._bwKey === structKey) {
            // Partial update — never touch the arena element (prevents hover flicker)
            const pct     = Math.max(0, Math.min(1, b.pct ?? (b.currentHp / b.maxHp)));
            const hpPct   = (pct * 100).toFixed(2);
            const hpColor = pct > 0.5 ? '#00ff88' : pct > 0.25 ? '#ffd700' : '#ff4444';
            const hpFill  = document.getElementById('bw-hp-fill');
            if (hpFill) { hpFill.style.width = hpPct + '%'; hpFill.style.background = hpColor; hpFill.style.boxShadow = `0 0 14px ${hpColor}88`; }
            const hpText  = document.getElementById('bw-hp-text');
            if (hpText) hpText.textContent = `${formatNum(Math.max(0, b.currentHp))} / ${formatNum(b.maxHp)}`;
            const dmgVal  = document.getElementById('bw-my-dmg-val');
            if (dmgVal && bm.myDamage > 0) dmgVal.textContent = formatNum(bm.myDamage);
            return;
        }

        // ── Full rebuild ──────────────────────────────────────────────────────
        content._bwKey = structKey;
        if (this._bossWorldTimerInterval) { clearInterval(this._bossWorldTimerInterval); this._bossWorldTimerInterval = null; }

        const pct      = Math.max(0, Math.min(1, b.pct ?? (b.currentHp / b.maxHp)));
        const hpPct    = (pct * 100).toFixed(2);
        const hpColor  = pct > 0.5 ? '#00ff88' : pct > 0.25 ? '#ffd700' : '#ff4444';
        const canAttack = !defeated && acc.isLoggedIn();

        // Initial timer — drift-free via _clientExpiry
        const bossRemWorld = b._clientExpiry
            ? Math.max(0, Math.floor((b._clientExpiry - Date.now()) / 1000))
            : Math.max(0, b.remaining ?? 300);
        const _bwFull = window.LANG || { t: k => k };
        const timerInit = defeated
            ? _bwFull.t('boss.defeated')
            : `${String(Math.floor(bossRemWorld/60)).padStart(2,'0')}:${String(bossRemWorld%60).padStart(2,'0')}`;

        const world = document.getElementById('boss-world');
        if (world) world.setAttribute('data-type', b.type);

        const sr          = bm._sessionRewards || { neurons: 0, diamonds: 0, kills: 0 };
        const sessKills   = sr.kills    || 0;
        const sessNeurons = sr.neurons  || 0;
        const sessDiamonds= sr.diamonds || 0;

        const myDmgHTML = acc.isLoggedIn() && bm.myDamage > 0
            ? `<span class="bw-my-dmg">${_bwFull.t('boss.world.damage.label')}: <strong id="bw-my-dmg-val" style="color:${rc}">${formatNum(bm.myDamage)}</strong></span>`
            : (!acc.isLoggedIn() ? `<span class="bw-login-hint">⚠ ${_bwFull.t('boss.world.login.hint')}</span>` : '');

        content.innerHTML = `
            <div class="bw-header">
                <div class="bw-title-row">
                    <span class="bw-boss-name" style="color:${rc};text-shadow:0 0 20px ${rc}66">${def.name || b.type}</span>
                    <span class="bw-rarity" style="color:${rc};border-color:${rc}55">${rl}</span>
                    <span class="bw-level">Lv.${b.level}</span>
                </div>
                <div class="bw-hp-row">
                    <div class="bw-hp-track">
                        <div class="bw-hp-fill" id="bw-hp-fill"
                             style="width:${hpPct}%;background:${hpColor};box-shadow:0 0 14px ${hpColor}88">
                        </div>
                    </div>
                    <span class="bw-hp-text" id="bw-hp-text">${formatNum(Math.max(0, b.currentHp))} / ${formatNum(b.maxHp)}</span>
                </div>
                <div class="bw-timer-row">
                    <span class="bw-timer${defeated ? ' bw-timer--dead' : ''}" id="bw-live-timer-world"
                          style="${!defeated ? `color:${rc}` : ''}">${timerInit}</span>
                    ${myDmgHTML}
                </div>
            </div>

            <div class="bw-arena${defeated ? ' bw-arena--dead' : ''}" style="--glow:${def.glowColor || rc + '44'}">
                <div class="bw-arena-glow"></div>
                <div class="bw-boss-icon" id="bw-boss-icon">${def.icon || '👾'}</div>
                ${canAttack ? `<div class="bw-arena-hint">${_bwFull.t('boss.world.click.to.attack')}</div>` : ''}
                ${defeated ? `<div class="bw-defeated-label">${_bwFull.t('boss.defeated')}</div>` : ''}
            </div>

            <div class="bw-drop-row">
                <span class="bw-drop-label">${_bwFull.t('boss.world.session.label')}:</span>
                ${sessKills > 0 ? `<span class="bw-drop-item bw-drop-kills">💀 ${sessKills}</span>` : ''}
                <span class="bw-drop-item bw-drop-gold">🧠 ${sessNeurons > 0 ? formatNum(sessNeurons) : '—'}</span>
                <span class="bw-drop-item bw-drop-cyan">💎 ${sessDiamonds > 0 ? sessDiamonds : '—'}</span>
            </div>

            <div class="bw-info-row">
                <span class="bw-level-badge">${_bwFull.t('boss.world.progression')}: <strong style="color:${rc}">${_bwFull.t('boss.world.level')} ${bm.globalBossLevel}</strong></span>
                ${acc.isLoggedIn() ? `<span class="bw-my-level-badge">${_bwFull.t('boss.world.my.level')}: <strong>${bm.userBossLevel}</strong></span>` : ''}
            </div>`;

        requestAnimationFrame(() => {
            const fill = document.getElementById('bw-hp-fill');
            if (fill) fill.style.transition = 'width 0.5s ease, background 0.4s';
        });

        // Timer interval — ticks only this element, never rebuilds the arena
        if (!defeated) {
            this._bossWorldTimerInterval = setInterval(() => {
                if (!this._worldOpen) { clearInterval(this._bossWorldTimerInterval); this._bossWorldTimerInterval = null; return; }
                const el   = document.getElementById('bw-live-timer-world');
                if (!el)   { clearInterval(this._bossWorldTimerInterval); this._bossWorldTimerInterval = null; return; }
                const cur  = bm.boss;
                if (!cur || cur.status === 'defeated' || cur.status === 'expired') {
                    el.textContent = cur?.status === 'defeated' ? '☠ DERROTADO' : '00:00';
                    el.classList.add('bw-timer--dead');
                    el.removeAttribute('style');
                    clearInterval(this._bossWorldTimerInterval);
                    this._bossWorldTimerInterval = null;
                    return;
                }
                const rem = cur._clientExpiry
                    ? Math.max(0, Math.floor((cur._clientExpiry - Date.now()) / 1000))
                    : Math.max(0, cur.remaining ?? 300);
                if (rem <= 0) {
                    el.textContent = '00:00';
                    clearInterval(this._bossWorldTimerInterval);
                    this._bossWorldTimerInterval = null;
                    bm.fetchState();
                    const r = bm._sessionRewards;
                    if (r && (r.neurons > 0 || r.diamonds > 0 || r.kills > 0)) {
                        this._showBossRewardSummary(r, false, () => this._doCloseBossWorld());
                    } else {
                        this._doCloseBossWorld();
                    }
                    return;
                }
                el.textContent = `${String(Math.floor(rem/60)).padStart(2,'0')}:${String(rem%60).padStart(2,'0')}`;
                el.style.color = rem < 60 ? '#ff4444' : (rem < 120 ? '#ffd700' : rc);
            }, 1000);
        }
    }

    _spawnBossHit(arena) {
        if (!arena) return;
        const syms = ['⚡', '💥', '🔥', '⚔', '✦'];
        const el = document.createElement('div');
        el.className = 'bw-hit-fx';
        el.textContent = syms[Math.floor(Math.random() * syms.length)];
        el.style.cssText = `left:${15 + Math.random() * 70}%;top:${10 + Math.random() * 50}%`;
        arena.appendChild(el);
        setTimeout(() => el.remove(), 700);

        const dmg = this._game.boss.bossPower * (this._game.shop?.getBossDamageMult?.() || 1);
        const num = document.createElement('div');
        num.className = 'bw-dmg-num';
        num.textContent = '-' + formatNum(dmg);
        num.style.cssText = `left:${25 + Math.random() * 50}%;top:${15 + Math.random() * 35}%`;
        arena.appendChild(num);
        setTimeout(() => num.remove(), 900);

        const icon = document.getElementById('bw-boss-icon');
        if (icon) {
            icon.classList.remove('bw-boss-icon--hit');
            requestAnimationFrame(() => {
                icon.classList.add('bw-boss-icon--hit');
                setTimeout(() => icon.classList.remove('bw-boss-icon--hit'), 280);
            });
        }
    }

    _renderRebirth(container) {
        const g    = this._game;
        const eco  = g.economy;
        const cost = eco.getPrestigeCost();
        const totalNeurons   = eco.totalNeurons;
        const tokens         = eco.calcPrestigeTokens();
        const totalPrestiges = eco.totalPrestiges;
        const progress       = Math.min(1, totalNeurons / cost);
        const canPrestige    = totalNeurons >= cost;
        const approaching    = !canPrestige && progress >= 0.6;
        const theme     = PrestigeAura.THEMES[totalPrestiges % PrestigeAura.THEMES.length];
        const nextTheme = PrestigeAura.THEMES[(totalPrestiges + 1) % PrestigeAura.THEMES.length];
        const currentMult = eco._prestigeMult.toFixed(2);
        const afterMult   = (eco._prestigeMult + tokens * 0.1).toFixed(2);
        const barColor    = canPrestige ? theme.c1 : (approaching ? '#ff8800' : '#00f5ff');
        const pct         = (progress * 100).toFixed(1);

        const _rL = window.LANG || { t: k => k };
        // Approaching / ready banner HTML
        let bannerHtml = '';
        if (canPrestige) {
            bannerHtml = `<div class="rb-status-banner rb-ready-banner">♻ ${_rL.t('rebirth.available')}</div>`;
        } else if (approaching) {
            bannerHtml = `<div class="rb-status-banner rb-approaching-banner"><span class="rb-approaching-icon">⚡</span> ${_rL.t('rebirth.approaching')} — ${(progress * 100).toFixed(0)}%</div>`;
        } else {
            bannerHtml = `<div class="rb-status-banner"></div>`;
        }

        const pctBarFillClass = canPrestige ? 'rb-bar-fill rb-bar-ready'
            : (approaching ? 'rb-bar-fill rb-bar-approaching' : 'rb-bar-fill');
        const pctClass = canPrestige ? 'rb-pct rb-pct-ready' : (approaching ? 'rb-pct rb-pct-approaching' : 'rb-pct');

        const pctBar = `
            <div class="rb-bar-track">
                <div class="${pctBarFillClass}" style="width:${progress * 100}%; --tc:${barColor}"></div>
            </div>
            <div class="rb-bar-labels">
                <span>${formatNum(totalNeurons)} ⚡</span>
                <span class="${pctClass}">${pct}%</span>
                <span>${formatNum(cost)} ⚡</span>
            </div>`;

        const panelClass = `rb-panel${canPrestige ? ' rb-panel-ready' : (approaching ? ' rb-panel-approaching' : '')}`;

        container.innerHTML = `
            <div class="${panelClass}">

                <div class="rb-header">
                    <div class="rb-header-left">
                        <div class="rb-icon">♻️</div>
                        <div>
                            <div class="rb-title">${_rL.t('rebirth.title')}</div>
                            <div class="rb-subtitle">${_rL.t('rebirth.prestige.level')}: <strong>${totalPrestiges}</strong></div>
                        </div>
                    </div>
                    <div class="rb-prestige-badge" style="--tc:${theme.c1}">${totalPrestiges}</div>
                </div>

                <div class="rb-theme-row" style="--tc:${theme.c1}">
                    <span class="rb-theme-label">${_rL.t('rebirth.current.theme')}</span>
                    <span class="rb-theme-name">${theme.name}</span>
                </div>

                <div class="rb-section">
                    <div class="rb-section-title">${_rL.t('rebirth.progress.title')}</div>
                    ${pctBar}
                    ${bannerHtml}
                </div>

                <div class="rb-section">
                    <div class="rb-section-title">${_rL.t('rebirth.reward.title')}</div>
                    <div class="rb-reward-row">
                        <div class="rb-reward-box" style="--tc:${theme.c1}">
                            <div class="rb-reward-val">${tokens > 0 ? '+' + tokens : '—'} 💎</div>
                            <div class="rb-reward-sub">${_rL.t('rebirth.reward.diamonds')}</div>
                        </div>
                        <div class="rb-reward-box" style="--tc:#7b2fff">
                            <div class="rb-reward-val">${afterMult}×</div>
                            <div class="rb-reward-sub">${_rL.t('rebirth.reward.mult.after')} (${_rL.t('rebirth.reward.mult.was')} ${currentMult}×)</div>
                        </div>
                    </div>
                </div>

                <div class="rb-section">
                    <div class="rb-section-title">${_rL.t('rebirth.stats.title')}</div>
                    <div class="rb-stats-grid">
                        <div class="rb-stat-box" data-color="gold">
                            <span class="rb-stat-label">🔄 ${_rL.t('rebirth.stats.prestiges')}</span>
                            <span class="rb-stat-val">${totalPrestiges}</span>
                        </div>
                        <div class="rb-stat-box" data-color="purple">
                            <span class="rb-stat-label">📈 ${_rL.t('rebirth.stats.mult')}</span>
                            <span class="rb-stat-val">${currentMult}×</span>
                        </div>
                        <div class="rb-stat-box" data-color="cyan">
                            <span class="rb-stat-label">⚡ ${_rL.t('rebirth.stats.neurons')}</span>
                            <span class="rb-stat-val">${formatNum(totalNeurons)}</span>
                        </div>
                        <div class="rb-stat-box" style="--tc:${nextTheme.c1}">
                            <span class="rb-stat-label">🎯 ${_rL.t('rebirth.stats.next.theme')}</span>
                            <span class="rb-stat-val" style="font-size:11px;color:var(--tc,var(--cyan))">${nextTheme.name}</span>
                        </div>
                    </div>
                </div>

                <button id="prestige-btn" class="rb-prestige-btn${canPrestige ? ' rb-btn-ready' : ''}" ${canPrestige ? '' : 'disabled'}>
                    ${canPrestige ? `♻ ${_rL.t('rebirth.btn.ready.prefix')} (+${tokens} 💎)` : (approaching ? `⚡ ${(progress * 100).toFixed(0)}% — ${_rL.t('rebirth.approaching')}!` : _rL.t('rebirth.btn.no.neurons'))}
                </button>

            </div>`;
    }

    _updateBoostDisplay() {
        const container = document.getElementById('boost-display');
        if (!container) return;
        const boosts = this._game.boosts.getActiveBoosts();

        if (boosts.length === 0) {
            if (container.children.length > 0) container.innerHTML = '';
            container.style.display = 'none';
            return;
        }
        container.style.display = 'flex';

        // Remove cards for boosts that have expired
        const activeIds = new Set(boosts.map(b => b.id));
        container.querySelectorAll('.boost-card[data-bid]').forEach(el => {
            if (!activeIds.has(el.dataset.bid)) el.remove();
        });

        // Update existing cards in-place; create only for new boosts
        boosts.forEach(b => {
            const pct     = Math.min(100, b.duration > 0 ? (b.remaining / b.duration) * 100 : 0);
            const secs    = Math.ceil(b.remaining / 1000);
            const timeStr = secs >= 60 ? Math.ceil(secs / 60) + 'min' : secs + 's';
            const col     = b.effect?.type === 'click_mult' ? '#ffd700' : '#00f5ff';
            const mult    = b.effect?.value || 1;

            let card = container.querySelector(`.boost-card[data-bid="${b.id}"]`);

            if (!card) {
                // First appearance — build DOM once (animation fires only this time)
                card = document.createElement('div');
                card.className = 'boost-card';
                card.dataset.bid = b.id;
                card.style.setProperty('--bc', col);
                card.innerHTML = `
                    <div class="boost-card-icon">${b.icon || '⚡'}</div>
                    <div class="boost-card-body">
                        <div class="boost-card-name">${b.name}</div>
                        <div class="boost-card-meta"></div>
                        <div class="boost-card-bar">
                            <div class="boost-card-fill"></div>
                        </div>
                    </div>`;
                container.appendChild(card);
            }

            // Only touch the two dynamic parts — no rebuild, no animation replay
            const meta = card.querySelector('.boost-card-meta');
            const fill = card.querySelector('.boost-card-fill');
            if (meta) meta.textContent = mult + '× · ' + timeStr;
            if (fill) fill.style.width  = pct + '%';
        });
    }

    _updateEventBanner() {
        const banner = document.getElementById('event-banner');
        if (!banner) return;
        const evt = this._game.randomEvents.getActive();
        if (evt) {
            banner.style.display = 'flex';
            banner.style.setProperty('--evt-color', evt.color || '#00f5ff');
            const rem = evt.expiresAt ? Math.max(0, (evt.expiresAt - Date.now()) / 1000).toFixed(0) : '';
            banner.innerHTML = `<span>${evt.icon} ${evt.name}</span>${rem ? `<span>${rem}s</span>` : ''}`;
            if (evt.clickable) {
                banner.style.cursor = 'pointer';
                banner.onclick = () => this._game.randomEvents.collectClickableEvent();
            } else {
                banner.style.cursor = '';
                banner.onclick = null;
            }
        } else {
            banner.style.display = 'none';
        }
    }

    _updateComboDisplay() {
        const el = document.getElementById('combo-display');
        if (!el) return;
        const lvl = this._game.combo.getLevel();
        if (lvl > 0) {
            el.style.display = 'block';
            el.textContent = `COMBO ×${this._game.combo.getMult()}`;
            el.style.color = ['','#00f5ff','#7b2fff','#ff8800','#ff0080','#ffd700'][Math.min(lvl, 5)];
        } else {
            el.style.display = 'none';
        }
    }

    _updatePrestigeBtn() {
        const btn = document.querySelector('#game-screen > #prestige-btn');
        if (!btn) return;
        const eco      = this._game.economy;
        const cost     = eco.getPrestigeCost();
        const progress = Math.min(1, eco.totalNeurons / cost);
        const tokens   = eco.calcPrestigeTokens();
        const ready    = eco.totalNeurons >= cost;
        const pct      = (progress * 100).toFixed(0);

        const _pbL = window.LANG || { t: k => k };
        if (ready) {
            btn.textContent = `♻ ${_pbL.t('rebirth.btn.ready.prefix')} (+${tokens} 💎)`;
            btn.classList.add('prestige-ready');
            btn.classList.remove('prestige-approaching');
        } else if (progress >= 0.6) {
            btn.textContent = `♻ ${pct}% — ${_pbL.t('rebirth.approaching')}!`;
            btn.classList.remove('prestige-ready');
            btn.classList.add('prestige-approaching');
        } else {
            btn.textContent = `♻ ${pct}% ${_pbL.t('rebirth.pct.suffix')}`;
            btn.classList.remove('prestige-ready', 'prestige-approaching');
        }
        btn.disabled = !ready;
    }

    /** Live-updates the rebirth panel progress bar, percentage, and tokens without full re-render. */
    _updateRebirthProgress() {
        const eco  = this._game.economy;
        const cost = eco.getPrestigeCost();
        const progress   = Math.min(1, eco.totalNeurons / cost);
        const canPrestige = eco.totalNeurons >= cost;
        const tokens      = eco.calcPrestigeTokens();
        const theme       = PrestigeAura.THEMES[eco.totalPrestiges % PrestigeAura.THEMES.length];
        const approaching = !canPrestige && progress >= 0.6;
        const pct         = (progress * 100).toFixed(1);

        // Progress bar
        const bar = document.querySelector('.rb-bar-fill');
        if (bar) {
            bar.style.width = (progress * 100) + '%';
            bar.classList.toggle('rb-bar-ready',      canPrestige);
            bar.classList.toggle('rb-bar-approaching', approaching);
            const barColor = canPrestige ? theme.c1 : (approaching ? '#ff8800' : '#00f5ff');
            bar.style.setProperty('--tc', barColor);
        }

        // Percentage label
        const pctEl = document.querySelector('.rb-pct');
        if (pctEl) {
            pctEl.textContent = pct + '%';
            pctEl.classList.toggle('rb-pct-approaching', approaching);
            pctEl.classList.toggle('rb-pct-ready',       canPrestige);
        }

        // Current neurons label
        const barLabels = document.querySelectorAll('.rb-bar-labels span');
        if (barLabels[0]) barLabels[0].textContent = formatNum(eco.totalNeurons) + ' ⚡';

        // Token reward value
        const tokenValEl = document.querySelector('.rb-reward-row .rb-reward-val');
        if (tokenValEl) tokenValEl.textContent = tokens > 0 ? `+${tokens} 💎` : '—';

        // Approaching / ready banner
        const _rU = window.LANG || { t: k => k };
        const bannerEl = document.querySelector('.rb-status-banner');
        if (bannerEl) {
            if (canPrestige) {
                bannerEl.className = 'rb-status-banner rb-ready-banner';
                bannerEl.innerHTML = `♻ ${_rU.t('rebirth.available')}`;
            } else if (approaching) {
                bannerEl.className = 'rb-status-banner rb-approaching-banner';
                bannerEl.innerHTML = `<span class="rb-approaching-icon">⚡</span> ${_rU.t('rebirth.approaching')} — ${(progress * 100).toFixed(0)}%`;
            } else {
                bannerEl.className = 'rb-status-banner';
                bannerEl.innerHTML = '';
            }
        }

        // Prestige button inside panel
        const pbtn = document.querySelector('.rb-prestige-btn');
        if (pbtn) {
            if (canPrestige) {
                pbtn.textContent = `♻ ${_rU.t('rebirth.btn.ready.prefix')} (+${tokens} 💎)`;
                pbtn.classList.add('rb-btn-ready');
                pbtn.disabled = false;
            } else {
                pbtn.textContent = approaching
                    ? `⚡ ${(progress * 100).toFixed(0)}% — ${_rU.t('rebirth.approaching')}!`
                    : _rU.t('rebirth.btn.no.neurons');
                pbtn.classList.remove('rb-btn-ready');
                pbtn.disabled = true;
            }
        }

        // Panel-level state classes
        const panel = document.querySelector('.rb-panel');
        if (panel) {
            panel.classList.toggle('rb-panel-approaching', approaching);
            panel.classList.toggle('rb-panel-ready',       canPrestige);
        }
    }

    // ── Click Battle System ───────────────────────────────────────────────────

    _startBattlePolling() {
        if (this._battlePollTimer) return;
        this._battlePollTimer = setInterval(() => this._pollBattle(), 1000);
        setTimeout(() => this._pollBattle(), 800);
    }

    async _pollBattle() {
        if (!this._game.account.isLoggedIn() || this._game.account.isLocalOnly()
            || window.location.protocol === 'file:') return;
        try {
            const res  = await fetch('api/batalha.php?action=poll');
            const data = await res.json();
            if (!data.ok) return;
            const b = data.battle;
            if (!b || this._battleDismissedIds.has(b.id)) {
                this._hideBattleOverlay();
                return;
            }
            this._battleState = b;
            this._showBattleOverlay(b);
        } catch {}
    }

    _showBattleOverlay(b) {
        let ov = document.getElementById('battle-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'battle-overlay';
            document.body.appendChild(ov);
        }
        ov.style.display = 'flex';

        if (b.status === 'pending') {
            if (b.is_challenger) {
                ov.innerHTML = `
                    <div class="battle-modal">
                        <div class="battle-modal-title">⚔️ Desafio Enviado</div>
                        <div class="battle-modal-sub">Aguardando <strong>${b.opp_name}</strong> aceitar...</div>
                        <div class="battle-spinner"></div>
                        <button class="battle-btn battle-btn--cancel" onclick="window.game.ui._cancelBattle(${b.id})">Cancelar</button>
                    </div>`;
            } else {
                ov.innerHTML = `
                    <div class="battle-modal">
                        <div class="battle-modal-title">⚔️ Desafio de Batalha!</div>
                        <div class="battle-modal-sub"><strong>${b.opp_name}</strong> te desafiou!</div>
                        <div class="battle-modal-desc">Quem clica mais em <strong>1 minuto</strong> vence!</div>
                        <div class="battle-modal-actions">
                            <button class="battle-btn battle-btn--accept" onclick="window.game.ui._respondBattle(${b.id},true)">⚔️ Aceitar</button>
                            <button class="battle-btn battle-btn--decline" onclick="window.game.ui._respondBattle(${b.id},false)">✗ Recusar</button>
                        </div>
                    </div>`;
            }
            return;
        }

        if (b.status === 'active') {
            // If arena already rendered, only refresh opponent score from server
            if (ov.querySelector('.battle-arena')) {
                const oppEl = document.getElementById('battle-opp-score');
                if (oppEl) oppEl.textContent = b.opp_clicks;
                return;
            }
            this._renderBattleArena(ov, b);
            return;
        }

        if (b.status === 'finished') {
            this._stopBattleTimers();
            const myScore  = b.my_clicks;
            const oppScore = b.opp_clicks;
            let resultHTML;
            if (b.is_draw)    resultHTML = `<div class="battle-result battle-result--draw">🤝 Empate!</div>`;
            else if (b.i_won) resultHTML = `<div class="battle-result battle-result--win">🏆 Você Ganhou!</div>`;
            else              resultHTML = `<div class="battle-result battle-result--lose">😢 Você Perdeu!</div>`;

            ov.innerHTML = `
                <div class="battle-modal">
                    <div class="battle-modal-title">⚔️ Batalha Encerrada</div>
                    ${resultHTML}
                    <div class="battle-final-scores">
                        <div class="battle-final-block">
                            <div class="battle-final-label">Você</div>
                            <div class="battle-final-num">${myScore}</div>
                        </div>
                        <div class="battle-vs" style="font-size:18px">VS</div>
                        <div class="battle-final-block">
                            <div class="battle-final-label">${b.opp_name}</div>
                            <div class="battle-final-num">${oppScore}</div>
                        </div>
                    </div>
                    <div class="battle-final-sub">cliques em 60 segundos</div>
                    <button class="battle-btn battle-btn--close" onclick="window.game.ui._dismissBattle(${b.id})">Fechar</button>
                </div>`;
            return;
        }

        if (b.status === 'declined') {
            this._stopBattleTimers();
            ov.innerHTML = `
                <div class="battle-modal">
                    <div class="battle-modal-title">⚔️ Desafio Recusado</div>
                    <div class="battle-modal-sub"><strong>${b.opp_name}</strong> recusou o desafio.</div>
                    <button class="battle-btn battle-btn--close" onclick="window.game.ui._dismissBattle(${b.id})">Fechar</button>
                </div>`;
        }
    }

    _renderBattleArena(ov, b) {
        this._battleClicks           = b.my_clicks || 0;
        this._battleArenaStartTime   = Date.now();
        this._battleInitialRemaining = Math.max(1, 60 - (b.elapsed || 0));

        const oppName = b.opp_name || '???';

        // Derive orb container style from active skin
        const skinId = this._game?.account?.getActiveSkin?.() ?? null;
        const skin   = skinId && (typeof PREMIUM_SKINS !== 'undefined')
            ? (PREMIUM_SKINS.find(s => s.id === skinId) || null) : null;

        let orbStyle = '';
        if (skin) {
            const a = skin.accent;
            const r = parseInt(a.slice(1, 3), 16);
            const g = parseInt(a.slice(3, 5), 16);
            const bv = parseInt(a.slice(5, 7), 16);
            const bg = `radial-gradient(circle at 40% 35%,rgba(${r},${g},${bv},0.18),rgba(${r},${g},${bv},0.08) 60%,transparent 90%)`;
            const sh = `0 0 30px rgba(${r},${g},${bv},0.35),0 0 60px rgba(${r},${g},${bv},0.12),inset 0 0 40px rgba(${r},${g},${bv},0.07)`;
            orbStyle = `border-color:${a};background:${bg};box-shadow:${sh}`;
        }
        const orbIcon = skin ? (skin.orbIcon || skin.icon) : '🧠';

        ov.innerHTML = `
            <div class="battle-arena">
                <div class="battle-arena-title">⚔️ BATALHA EM ANDAMENTO</div>
                <div class="battle-timer" id="battle-timer">1:00</div>
                <div class="battle-scores">
                    <div class="battle-score-block battle-score-me">
                        <div class="battle-score-label">Você</div>
                        <div class="battle-score-num" id="battle-my-score">${this._battleClicks}</div>
                    </div>
                    <div class="battle-vs">VS</div>
                    <div class="battle-score-block battle-score-opp">
                        <div class="battle-score-label">${oppName}</div>
                        <div class="battle-score-num" id="battle-opp-score">${b.opp_clicks || 0}</div>
                    </div>
                </div>
                <div class="battle-click-btn" id="battle-click-btn"
                    style="${orbStyle}"
                    onclick="window.game.ui._battleClick()">
                    <div class="orbit-ring ring-1"><div class="ring-dot"></div></div>
                    <div class="orbit-ring ring-2"><div class="ring-dot"></div></div>
                    <div class="orbit-ring ring-3"><div class="ring-dot"></div></div>
                    <div class="orb-core" id="battle-orb-core">${orbIcon}</div>
                </div>
                <div class="battle-hint">Clique o máximo que puder!</div>
            </div>`;

        this._startBattleCountdown(b.id);
        this._startBattleSyncTimer(b.id);
    }

    _hideBattleOverlay() {
        const ov = document.getElementById('battle-overlay');
        if (ov) ov.style.display = 'none';
        this._stopBattleTimers();
    }

    _startBattleCountdown(battleId) {
        if (this._battleCountdownTimer) clearInterval(this._battleCountdownTimer);
        this._battleCountdownTimer = setInterval(() => {
            if (!this._battleArenaStartTime) return;
            const elapsed   = (Date.now() - this._battleArenaStartTime) / 1000;
            const remaining = Math.max(0, this._battleInitialRemaining - elapsed);
            const secs      = Math.ceil(remaining);
            const m         = Math.floor(secs / 60);
            const s         = secs % 60;
            const el        = document.getElementById('battle-timer');
            if (el) {
                el.textContent = `${m}:${String(s).padStart(2, '0')}`;
                el.className   = 'battle-timer' + (remaining <= 10 ? ' battle-timer--low' : '');
            }
            if (remaining <= 0) {
                clearInterval(this._battleCountdownTimer);
                this._battleCountdownTimer = null;
                this._onBattleTimerEnd(battleId);
            }
        }, 200);
    }

    _startBattleSyncTimer(battleId) {
        if (this._battleSyncTimer) clearInterval(this._battleSyncTimer);
        this._battleSyncTimer = setInterval(() => {
            fetch('api/batalha.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'click', battle_id: battleId, clicks: this._battleClicks }),
            }).then(r => r.json()).then(data => {
                if (data.ok && data.opp_clicks !== undefined) {
                    const el = document.getElementById('battle-opp-score');
                    if (el) el.textContent = data.opp_clicks;
                }
            }).catch(() => {});
        }, 3000);
    }

    _stopBattleTimers() {
        if (this._battleCountdownTimer) { clearInterval(this._battleCountdownTimer); this._battleCountdownTimer = null; }
        if (this._battleSyncTimer)      { clearInterval(this._battleSyncTimer);      this._battleSyncTimer = null; }
        this._battleArenaStartTime = null;
    }

    _battleClick() {
        if (!this._battleArenaStartTime) return;
        const elapsed = (Date.now() - this._battleArenaStartTime) / 1000;
        if (elapsed > this._battleInitialRemaining + 0.5) return; // time's up
        this._battleClicks++;
        const el = document.getElementById('battle-my-score');
        if (el) el.textContent = this._battleClicks;
        // Visual feedback: scale pulse on button
        const btn = document.getElementById('battle-click-btn');
        if (btn) { btn.style.transform = 'scale(0.92)'; setTimeout(() => { if (btn) btn.style.transform = ''; }, 80); }
    }

    async _onBattleTimerEnd(battleId) {
        const btn = document.getElementById('battle-click-btn');
        if (btn) {
            btn.classList.add('battle-click-btn--ended');
            const core = document.getElementById('battle-orb-core');
            if (core) core.textContent = '⏱';
        }
        this._stopBattleTimers();
        try {
            await fetch('api/batalha.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'finish', battle_id: battleId, clicks: this._battleClicks }),
            });
        } catch {}
        // Poll until result is ready
        let attempts = 0;
        const waitResult = setInterval(async () => {
            attempts++;
            await this._pollBattle();
            const b = this._battleState;
            if ((b && b.status === 'finished') || attempts >= 8) clearInterval(waitResult);
        }, 1500);
    }

    async _sendBattleInvite(friendId, friendName) {
        try {
            const res  = await fetch('api/batalha.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'invite', friend_id: friendId }),
            });
            const data = await res.json();
            if (!data.ok) { this._game.notify(data.msg || 'Erro ao enviar desafio.', 'error'); return; }
            await this._pollBattle();
        } catch { this._game.notify('Erro de conexão.', 'error'); }
    }

    async _respondBattle(battleId, accept) {
        try {
            const res  = await fetch('api/batalha.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'respond', battle_id: battleId, accept }),
            });
            const data = await res.json();
            if (!data.ok) { this._game.notify(data.msg || 'Erro.', 'error'); return; }
            if (!accept) { await this._pollBattle(); return; }
            // Accepted: render arena immediately (don't wait for poll cycle)
            const cur = this._battleState;
            let ov = document.getElementById('battle-overlay');
            if (!ov) { ov = document.createElement('div'); ov.id = 'battle-overlay'; document.body.appendChild(ov); }
            ov.style.display = 'flex';
            this._renderBattleArena(ov, {
                id: battleId, elapsed: 0, my_clicks: 0, opp_clicks: 0,
                opp_name: cur?.opp_name || '...',
            });
            // Poll to sync real elapsed + opponent clicks in background
            this._pollBattle();
        } catch { this._game.notify('Erro de conexão.', 'error'); }
    }

    async _cancelBattle(battleId) {
        try {
            await fetch('api/batalha.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'cancel', battle_id: battleId }),
            });
        } catch {}
        this._dismissBattle(battleId);
    }

    _dismissBattle(battleId) {
        this._battleDismissedIds.add(battleId);
        try {
            sessionStorage.setItem('nx_btl_dismissed',
                JSON.stringify([...this._battleDismissedIds].slice(-20)));
        } catch {}
        this._hideBattleOverlay();
        this._battleState = null;
        this._battleClicks = 0;
    }

    // ─────────────────────────────────────────────────────────────────────────

    _setEl(id, val) {
        const el = document.getElementById(id);
        if (el) {
            const s = String(val);
            if (el.textContent !== s) el.textContent = s;
        }
    }

    _onResize() {
        // Resize canvas elements if needed (managed by ParticleSystem usually)
    }
}
