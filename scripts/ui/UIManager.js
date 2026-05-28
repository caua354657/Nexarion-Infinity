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
        this._activePanel = null;
        this._activeTab = null;
        this._worldOpen = false;
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
    }

    init() {
        this._bindNavigation();
        this._bindModal();
        this._bindClickBtn();
        this._bindPrestige();
        this._bindSettings();
        this._bindLevelUpAlert();
        this._initBossUI();
        window.addEventListener('resize', () => this._onResize());

        this._updateHUD();
        this._checkAuthWall();
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
        this._activePanel = panelId;
        
        // Update nav active states
        document.querySelectorAll('.sidebar-btn, .mobile-nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll(`.sidebar-btn[data-panel="${panelId}"], .mobile-nav-btn[data-panel="${panelId}"]`).forEach(b => b.classList.add('active'));
        
        // Setup modal
        const overlay = document.getElementById('modal-overlay');
        const panel = document.getElementById('modal-panel');
        const title = document.getElementById('modal-title');
        
        overlay.style.display = 'block';
        panel.style.display = 'flex';
        
        // Force reflow for animation
        void panel.offsetWidth;
        panel.classList.add('open');
        
        const titles = {
            'generators':  'Geradores Neurais',
            'upgrades':    'Melhorias',
            'shop':        'Loja Neural',
            'skills':      'Habilidades',
            'missions':    'Missões',
            'achievements':'Conquistas',
            'leaderboard': 'Placar Global',
            'profile':     'Perfil',
            'rebirth':     'Renascimento',
            'settings':    'Configurações',
            'more':        'Mais Opções',
            'neural':      '⚡ Progressão Neural',
            'agenda':      '📋 Missões & Conquistas',
            'conta':       '👤 Conta',
        };

        title.textContent = titles[panelId] || 'Painel';

        // Highlight the parent group sidebar button when in a sub-panel
        const panelGroup = {
            generators: 'neural', upgrades: 'neural', skills: 'neural', rebirth: 'neural',
            missions: 'agenda', achievements: 'agenda', leaderboard: 'agenda',
            profile: 'conta', settings: 'conta'
        };
        const groupId = panelGroup[panelId] || panelId;
        document.querySelectorAll(`.sidebar-btn[data-panel="${groupId}"], .mobile-nav-btn[data-panel="${groupId}"]`).forEach(b => b.classList.add('active'));

        // Render content
        this._renderPanelContent(panelId);
    }

    openSubPanel(panelId) {
        this._parentPanel = this._activePanel;
        this.openPanel(panelId);
    }

    closePanel() {
        if (this._lbRefreshTimer) { clearInterval(this._lbRefreshTimer); this._lbRefreshTimer = null; }
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
        const content = document.getElementById('modal-content');
        const tabsContainer = document.getElementById('modal-tabs');
        
        // Clear tabs by default
        tabsContainer.innerHTML = '';
        content.innerHTML = '';
        
        switch (panelId) {
            case 'neural':       this._renderNavGroup(content, 'neural'); break;
            case 'agenda':       this._renderNavGroup(content, 'agenda'); break;
            case 'conta':        this._renderNavGroup(content, 'conta');  break;
            case 'generators':   this._renderGenerators(content); break;
            case 'upgrades':     this._renderUpgrades(content); break;
            case 'achievements': this._renderAchievements(content); break;
            case 'missions':     this._renderMissions(content, tabsContainer); break;
            case 'leaderboard':  this._renderLeaderboard(content); break;
            case 'profile':      this._renderProfile(content); break;
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
        void el.offsetWidth;
        el.classList.add('visible');

        // Flash the HUD level indicator
        const lvlEl = document.getElementById('level-display');
        if (lvlEl) {
            lvlEl.classList.remove('level-flash');
            void lvlEl.offsetWidth;
            lvlEl.classList.add('level-flash');
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
                this._game.save(); // force save latest state before exporting
                if (this._game.saveManager.exportFile()) {
                    this._game.notify('Save exportado com sucesso!', 'success');
                } else {
                    this._game.notify('Nenhum save encontrado.', 'error');
                }
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
                this._game.account.logout().then(() => {
                    this.closePanel();
                    this._showAuthWall();
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
            } else if (!acc.isLoggedIn()) {
                // Session expired — ensure wall is visible
                if (!acc.hasAccount()) this._authSetTab('register');
                else                   this._authSetTab('login');
                this._showAuthWall();
            }
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

        if (btn) { btn.disabled = true; btn.textContent = 'Criando…'; }
        const result = await this._game.account.createAccount(user, email, pass, photoFile);
        if (btn) { btn.disabled = false; btn.textContent = 'Criar Conta'; }
        if (result.ok) {
            this._hideAuthWall();
        } else {
            if (err) err.textContent = result.msg;
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
        if (btn) { btn.disabled = true; btn.textContent = 'Criando…'; }
        const result = await this._game.account.createAccount(user, email, pass, photoFile);
        if (btn) { btn.disabled = false; btn.textContent = 'Criar Conta'; }
        if (result.ok) {
            this._profileAuthMode = 'login'; // reset mode after registration
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
            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Excluir Conta'; }
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

        this._updateHUD();
        this._updateBoostDisplay();
        this._updateEventBanner();
        this._updateComboDisplay();
        this._updatePrestigeBtn();
        this._updateBadges();
        this._updatePrestigeCharacter();

        if (this._activePanel === 'generators') this._updateGenerators();
        if (this._activePanel === 'upgrades') this._updateUpgrades();
        if (this._activePanel === 'missions') this._updateMissions();
        if (this._worldOpen) this._updateBossWorld();
        if (this._activePanel === 'profile') this._updateProfileStats();
        if (this._activePanel === 'shop') this._updateShop();
        if (this._activePanel === 'skills') this._updateSkillPoints();
        if (this._activePanel === 'rebirth') this._updateRebirthProgress();
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
        if (claimableActive > 0) badges.missions = claimableActive;  // matches Ativas tab count

        const moreTotal = (badges.missions || 0) + (badges.rebirth ? 1 : 0) + (badges.upgrades || 0);
        if (moreTotal > 0) badges.more = moreTotal;

        // Group badge aggregates
        const neuralTotal = (badges.generators || 0) + (badges.upgrades || 0) + (badges.rebirth ? 1 : 0);
        if (neuralTotal > 0) badges.neural = neuralTotal;
        if (claimableTotal > 0) badges.agenda = claimableTotal;  // agenda shows full total

        return badges;
    }

    _updateBadges() {
        const counts = this._getBadgeCounts();
        ['neural', 'agenda', 'generators', 'upgrades', 'missions', 'rebirth', 'more'].forEach(p => {
            document.querySelectorAll(`.sidebar-btn[data-panel="${p}"], .mobile-nav-btn[data-panel="${p}"]`).forEach(btn => {
                const count = counts[p];
                if (count > 0) btn.setAttribute('data-badge', count > 99 ? '99+' : count);
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
        this._setEl('level-display', 'NVL ' + g.level.level);
        this._setEl('token-display', '💎 ' + g.economy.prestigeTokens);

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
                            <div class="gen-rate" id="gr-${g.id}">+${formatNum(g.baseRate)}/s cada</div>
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
                    : `+${formatNum(g.baseRate)}/s cada`;
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
            container.innerHTML = '<div class="empty-msg">Compre geradores para desbloquear melhorias.</div>';
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
            html += `<div class="upg-separator">— Compradas —</div>`;
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
        tabsContainer.innerHTML = `
            <button class="tab-btn ${this._activeTab === 'active' ? 'active' : ''}" onclick="window.game.ui._activeTab='active'; window.game.ui._missionsStateKey=null; window.game.ui._renderPanelContent('missions')">Ativas</button>
            <button class="tab-btn ${this._activeTab === 'daily' ? 'active' : ''}" onclick="window.game.ui._activeTab='daily'; window.game.ui._missionsStateKey=null; window.game.ui._renderPanelContent('missions')">Agenda</button>
            <button class="tab-btn ${this._activeTab === 'completed' ? 'active' : ''}" onclick="window.game.ui._activeTab='completed'; window.game.ui._missionsStateKey=null; window.game.ui._renderPanelContent('missions')">Concluídas</button>
        `;
        container.innerHTML = `
            <div id="missions-claim-bar" class="mission-claim-all-bar" style="display:none;"></div>
            <div id="missions-list" style="display:flex;flex-direction:column;"></div>
        `;
        this._updateMissions();
    }

    _getMissionsStateKey() {
        const g = this._game;
        const completedStr = [...g.missions.completed].sort().join(',');
        const claimsStr = [...g.missions.claims].sort().join(',');
        return `${this._activeTab}|${completedStr}|${claimsStr}`;
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
                const m = MISSIONS.find(x => x.id === id);
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
                list.innerHTML = '<div class="empty-msg">Nenhuma missão ativa no momento!</div>';
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
                    <span>📅 Missões Diárias</span>
                    <span class="mission-timer-badge" id="daily-timer-badge">⏱ ${formatTime(Math.floor(dailySecs))}</span>
                </div>`;
                html += dailyMissions.map(m => {
                    const p = g.missions.progress[m.id] || { cur: 0, max: m.value, pct: 0 };
                    return this._buildMissionItemHTML(m, p, g.missions.claims.has(m.id), g.missions.completed.has(m.id));
                }).join('');
            }
            if (weeklyMissions.length > 0) {
                html += `<div class="missions-section-header" style="margin-top:16px;">
                    <span>📆 Missões Semanais</span>
                    <span class="mission-timer-badge" id="weekly-timer-badge">⏱ ${formatTime(Math.floor(weeklySecs))}</span>
                </div>`;
                html += weeklyMissions.map(m => {
                    const p = g.missions.progress[m.id] || { cur: 0, max: m.value, pct: 0 };
                    return this._buildMissionItemHTML(m, p, g.missions.claims.has(m.id), g.missions.completed.has(m.id));
                }).join('');
            }
            list.innerHTML = html || '<div class="empty-msg">Nenhuma missão agendada disponível!</div>';

        } else if (tab === 'completed') {
            const done = MISSIONS.filter(m =>
                m.cooldown !== 'daily' && m.cooldown !== 'weekly' && g.missions.claims.has(m.id)
            );
            if (done.length === 0) {
                list.innerHTML = '<div class="empty-msg">Nenhuma missão concluída ainda!</div>';
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

        const topRight = isClaimed
            ? `<span class="mission-claimed-badge">✓ Resgatada</span>`
            : '';
        const claimBtn = isCompleted && !isClaimed
            ? `<button class="mission-claim-btn" onclick="window.game.ui._claimMission('${m.id}')">⚡ Resgatar</button>`
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
        bar.innerHTML = `
            <span class="mca-count">🎁 ${n} missão${n > 1 ? 'ões prontas' : ' pronta'}</span>
            <button class="mca-btn" onclick="window.game.ui.claimAllMissions()">✓ Resgatar Tudo</button>
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
                    ⚠ Conta local — <button class="profile-link-btn" id="profile-go-register" style="display:inline;font-size:11px;">Criar conta online</button> para salvar na nuvem
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
                        <div class="profile-email">${a.email || 'Conta local'}</div>
                        <div class="profile-since">Membro desde ${since}</div>
                    </div>
                    <button class="profile-action-btn" id="profile-logout">Sair</button>
                </div>`;
        } else if (hasAccount && this._profileAuthMode === 'login') {
            accountSection = `
                <div class="profile-auth-form">
                    <div class="profile-auth-title">Entrar na Conta</div>
                    <input class="profile-input" id="profile-login-user" type="text" placeholder="Email ou nome de usuário" autocomplete="username">
                    <input class="profile-input" id="profile-login-pass" type="password" placeholder="Senha" autocomplete="current-password">
                    <button class="profile-submit-btn" id="profile-login-btn">Entrar</button>
                    <div class="profile-auth-msg" id="profile-auth-msg"></div>
                    <button class="profile-link-btn" id="profile-go-register">Criar nova conta</button>
                </div>`;
        } else {
            accountSection = `
                <div class="profile-auth-form">
                    <div class="profile-auth-title">Criar Conta</div>
                    <div class="auth-photo-row" style="margin-bottom:10px;">
                        <label class="auth-photo-label" for="profile-reg-photo" title="Foto de perfil (opcional)">
                            <div class="auth-photo-preview" id="profile-photo-preview">📷</div>
                            <span class="auth-photo-hint">Foto opcional</span>
                        </label>
                        <input type="file" id="profile-reg-photo" accept="image/jpeg,image/png,image/gif,image/webp" style="display:none;">
                    </div>
                    <input class="profile-input" id="profile-reg-user" type="text" placeholder="Nome de usuário (mín. 3 chars)" autocomplete="username">
                    <input class="profile-input" id="profile-reg-email" type="email" placeholder="Email" autocomplete="email">
                    <input class="profile-input" id="profile-reg-pass" type="password" placeholder="Senha (mín. 6 chars)" autocomplete="new-password">
                    <button class="profile-submit-btn" id="profile-reg-btn">Criar Conta Online</button>
                    <div class="profile-auth-msg" id="profile-auth-msg"></div>
                    ${(hasAccount && !acc.isLocalOnly()) ? `<button class="profile-link-btn" id="profile-go-login">Já tenho uma conta</button>` : ''}
                    ${acc.isLocalOnly() ? `<button class="profile-link-btn" id="profile-go-login">Cancelar</button>` : ''}
                </div>`;
        }

        const stats = this._getStatsData();
        const statsHTML = stats.map((s, i) =>
            `<div class="stat-row"><span class="stat-key">${s[0]}</span><span class="stat-val" id="stat-val-${i}">${s[1]}</span></div>`
        ).join('');

        container.innerHTML = accountSection + `
            <div class="profile-stats-section">
                <div class="profile-stats-title">Estatísticas</div>
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
            const el = document.getElementById('stat-val-' + i);
            if (el && el.textContent !== s[1]) el.textContent = s[1];
        });
    }

    _getStatsData() {
        const g = this._game;
        const critChance = ((Config.CRITICAL_CHANCE + g.skills.getCritBonus() + g.shop.getCritBonus()) * 100).toFixed(1);
        return [
            ['Neurônios Vitalícios', formatNum(g.economy.lifetimeNeurons) + ' ⚡'],
            ['Neurônios (Ciclo Atual)', formatNum(g.economy.totalNeurons) + ' ⚡'],
            ['Neurônios/seg', formatNum(g.economy.getEffectiveNPS()) + '/s'],
            ['Valor do Clique', formatNum(g.economy.getClickValue())],
            ['Chance Crítica', critChance + '%'],
            ['Total de Cliques', formatNum(g.stats.totalClicks)],
            ['Cliques Críticos', formatNum(g.stats.critClicks)],
            ['Nível', g.level.level],
            ['Pontos de Habilidade', g.skills.skillPoints + ' SP'],
            ['XP Total', formatNum(g.level.totalXp)],
            ['Conquistas', g.achievements.unlocked.size + ' / ' + ACHIEVEMENTS.length],
            ['Missões Resgatadas', g.missions.claims.size],
            ['Prestígios', g.economy.totalPrestiges],
            ['Diamantes', g.economy.prestigeTokens],
            ['Multiplicador de Prestígio', g.economy._prestigeMult.toFixed(2) + '×'],
            ['Tempo de Jogo', formatTime(g.stats.playTime)]
        ];
    }

    _renderSettings(container) {
        const enabled  = this._game.audio.isEnabled();
        const sfxVol   = this._game.audio.sfxVol;
        const musicVol = this._game.audio.musicVol;
        const loggedIn = this._game.account.isLoggedIn();

        container.innerHTML = `
            <div class="settings-section">
                <label class="settings-label">🔊 Áudio</label>
                <button class="settings-btn${enabled ? '' : ' settings-btn-off'}" id="toggle-sound">
                    ${enabled ? '🔊 Som Ligado' : '🔇 Som Desligado'}
                </button>
                <label class="settings-label" style="margin-top:12px;">Volume de Efeitos</label>
                <div class="settings-row">
                    <input type="range" id="sfx-vol" min="0" max="1" step="0.05" value="${sfxVol}">
                    <span class="settings-vol-val">${Math.round(sfxVol * 100)}%</span>
                </div>
                <label class="settings-label">Volume da Música</label>
                <div class="settings-row">
                    <input type="range" id="music-vol" min="0" max="1" step="0.05" value="${musicVol}">
                    <span class="settings-vol-val">${Math.round(musicVol * 100)}%</span>
                </div>
            </div>
            <div class="settings-section">
                <label class="settings-label">💾 Save</label>
                <button class="settings-btn" id="export-save">⬇ Exportar Save (.json)</button>
                <label class="settings-btn settings-btn-file" id="import-save-label" for="import-save-input">
                    ⬆ Importar Save (.json)
                </label>
                <input type="file" id="import-save-input" accept=".json" style="display:none;">
                <div id="import-save-msg" class="settings-import-msg"></div>
            </div>
            <div class="settings-section">
                <label class="settings-label">⚠️ Zona de Perigo</label>
                <button class="settings-btn danger" id="wipe-save">🗑 Resetar Todo o Progresso</button>
                ${loggedIn ? `<button class="settings-btn danger" id="delete-account-btn" style="margin-top:6px;">🗑 Excluir Conta</button>` : ''}
            </div>
            <div class="settings-section" style="opacity:0.4;font-size:11px;text-align:center;">
                NEXUS CORE v1.0.0 — Salva automaticamente a cada 30s
            </div>
        `;
    }

    _renderNavGroup(container, groupId) {
        const counts = this._getBadgeCounts();

        const groups = {
            neural: [
                { id: 'generators', icon: '🧬', label: 'Geradores',    sub: 'Fontes de Neurônios',  theme: 'neural'  },
                { id: 'upgrades',   icon: '🚀', label: 'Melhorias',    sub: 'Poder e Eficiência',   theme: 'purple'  },
                { id: 'skills',     icon: '✨', label: 'Habilidades',  sub: 'Pontos de Habilidade', theme: 'gold'    },
                { id: 'rebirth',    icon: '♻️', label: 'Renascimento', sub: 'Prestígio Neural',     theme: 'purple'  },
            ],
            agenda: [
                { id: 'missions',     icon: '📋', label: 'Missões',    sub: 'Diárias e Semanais', theme: 'green'  },
                { id: 'achievements', icon: '🏆', label: 'Conquistas', sub: 'Marcos do Jogo',     theme: 'gold'   },
                { id: 'leaderboard',  icon: '🏅', label: 'Placar',     sub: 'Ranking Global',     theme: 'neural' },
            ],
            conta: [
                { id: 'profile',  icon: '👤', label: 'Perfil',          sub: 'Conta e Estatísticas', theme: 'neural' },
                { id: 'settings', icon: '⚙️', label: 'Configurações',   sub: 'Áudio e Save',         theme: 'neural' },
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
            return `
                <button class="cat-hub-btn cat-theme-${item.theme}${fullRow}"
                        onclick="window.game.ui.openSubPanel('${item.id}')">
                    ${badge}
                    <div class="cat-hub-icon">${item.icon}</div>
                    <div class="cat-hub-label">${item.label}</div>
                    <div class="cat-hub-sub">${item.sub}</div>
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

        container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap: 8px; padding-bottom: 20px;">
                ${makeBtn('missions',      '📋', 'Missões')}
                ${makeBtn('upgrades',      '🔧', 'Melhorias')}
                ${makeBtn('generators',    '⚙️', 'Geradores Neurais')}
                ${makeBtn('rebirth',       '♻️', 'Renascimento')}
                ${makeBtn('leaderboard',   '🏅', 'Placar Global')}
                ${makeBtn('shop',          '🛒', 'Loja Neural')}
                ${makeBtn('skills',        '✨', 'Habilidades')}
                ${makeBtn('achievements',  '🏆', 'Conquistas')}
                ${makeBtn('profile',       '👤', 'Perfil')}
                ${makeBtn('settings',      '⚙️', 'Configurações')}
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
            this._game.notify(`Boost comprado${qty > 1 ? ' ×' + qty : ''}!`, 'success');
            this._hideBoostBuyModal();
            if (this._activePanel === 'shop') this._renderPanelContent('shop');
        } else {
            this._game.notify('Neurônios insuficientes!', 'error');
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

        // Preset button highlight
        document.querySelectorAll('.bbc-preset').forEach(btn => {
            const n = parseInt(btn.textContent.replace('×', ''));
            btn.classList.toggle('active', n === qty);
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

        const RC = { common: '#a0a0a0', uncommon: '#00ff88', rare: '#00f5ff', epic: '#7b2fff', legendary: '#ffd700' };
        const RL = { common: 'Comum', uncommon: 'Incomum', rare: 'Raro', epic: 'Épico', legendary: 'Lendário' };

        // ── VIP ──
        const isVip = acc.isVip();
        const vipAction = isVip
            ? `<div class="pshop-owned-badge pshop-owned-vip">✓ VIP ATIVO</div>`
            : `<div class="pshop-price pshop-price-gold">R$ 9,90</div>
               <button class="pshop-buy-btn pshop-buy-gold" onclick="window.game.buyVip()">Adquirir</button>`;
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
               <button class="pshop-buy-btn pshop-buy-cyan" onclick="window.game.buyDoubleNeuron()">Adquirir</button>`;
        const doubleCard = `
            <div class="pshop-card pshop-card--double${hasDouble ? ' pshop-card--owned' : ''}">
                <div class="pshop-card-glow pshop-card-glow--double"></div>
                <div class="pshop-icon pshop-icon--double">⚡</div>
                <div class="pshop-info">
                    <div class="pshop-header-row">
                        <div class="pshop-title pshop-title-cyan">2× NEURÔNIO</div>
                        <div class="pshop-pop-badge">🔥 POPULAR</div>
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
                        <div class="pshop-title pshop-title-skin" style="color:var(--cyan)">NEXUS PADRÃO</div>
                        <div class="pshop-rarity-badge" style="--rc:#00f5ff">Padrão</div>
                    </div>
                    <div class="pshop-subtitle">Tema original do núcleo — cyan neural clássico</div>
                </div>
                <div class="pshop-actions">
                    ${defaultEquipped
                        ? `<div class="pshop-owned-badge" style="border-color:rgba(0,245,255,0.4);color:var(--cyan)">✓ ATIVO</div>`
                        : `<button class="pshop-equip-btn" style="border-color:rgba(0,245,255,0.4);color:var(--cyan)" onclick="window.game.resetSkin()">Equipar</button>`
                    }
                </div>
            </div>`;

        const skinCards = skins.map(skin => {
            const owned = acc.hasSkin(skin.id);
            const equipped = activeSkin === skin.id;
            const rc = RC[skin.rarity] || '#00f5ff';
            let action = '';
            if (equipped) {
                action = `<div class="pshop-owned-badge" style="border-color:${rc}44;color:${rc}">✓ EQUIPADA</div>`;
            } else if (owned) {
                action = `<div class="pshop-owned-badge">✓ Comprada</div>
                          <button class="pshop-equip-btn" style="border-color:${rc}55;color:${rc}" onclick="window.game.equipSkin('${skin.id}')">Equipar</button>`;
            } else {
                action = `<div class="pshop-price" style="color:${rc}">${skin.price}</div>
                          <button class="pshop-buy-btn" style="border-color:${rc}55;color:${rc};background:${rc}0d" onclick="window.game.buySkin('${skin.id}')">Adquirir</button>`;
            }
            return `
                <div class="pshop-card pshop-card--skin${owned ? ' pshop-card--owned' : ''}"
                     style="--skin-accent:${skin.accent};--skin-bg:${skin.gradient};border-color:${rc}28">
                    <div class="pshop-skin-glow" style="background:radial-gradient(ellipse at right,${skin.accent}12 0%,transparent 70%)"></div>
                    <div class="pshop-icon pshop-icon--skin" style="background:${skin.accent}12;border-color:${skin.accent}2e">${skin.icon}</div>
                    <div class="pshop-info">
                        <div class="pshop-header-row">
                            <div class="pshop-title pshop-title-skin" style="color:${rc}">${skin.name}</div>
                            <div class="pshop-rarity-badge" style="--rc:${rc}">${RL[skin.rarity] || skin.rarity}</div>
                            <div class="pshop-skin-badge">${skin.badge}</div>
                        </div>
                        <div class="pshop-subtitle">${skin.desc}</div>
                    </div>
                    <div class="pshop-actions">${action}</div>
                </div>`;
        }).join('');

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
            const isPopular = pack.popular === true;
            const bonusTag  = pack.bonus
                ? `<div class="dpack-bonus${isMega ? ' dpack-bonus--fire' : ''}">${pack.bonus}</div>`
                : '';
            const popTag = isPopular
                ? `<div class="dpack-popular">⭐ POPULAR</div>`
                : '';
            if (isMega) {
                return `
                <div class="dpack-card dpack-card--mega"
                     onclick="window.game.buyDiamondPack('${pack.id}')">
                    ${bonusTag}
                    <div class="dpack-icon">💎</div>
                    <div class="dpack-info">
                        <div class="dpack-amount">${pack.diamonds.toLocaleString('pt-BR')}</div>
                        <div class="dpack-unit">Diamantes</div>
                        <div class="dpack-name">${pack.name}</div>
                        <div class="dpack-price">${pack.price}</div>
                    </div>
                    <button class="dpack-buy-btn"
                            onclick="event.stopPropagation(); window.game.buyDiamondPack('${pack.id}')">
                        COMPRAR
                    </button>
                </div>`;
            }
            return `
                <div class="dpack-card${isPopular ? ' dpack-card--popular' : ''}"
                     onclick="window.game.buyDiamondPack('${pack.id}')">
                    ${bonusTag}${popTag}
                    <div class="dpack-icon">💎</div>
                    <div class="dpack-amount">${pack.diamonds.toLocaleString('pt-BR')}</div>
                    <div class="dpack-unit">Diamantes</div>
                    <div class="dpack-name">${pack.name}</div>
                    <div class="dpack-price">${pack.price}</div>
                    <button class="dpack-buy-btn"
                            onclick="event.stopPropagation(); window.game.buyDiamondPack('${pack.id}')">
                        COMPRAR
                    </button>
                </div>`;
        }).join('');

        container.innerHTML = `
            <div class="pshop-container" id="pshop-container">

                <div class="pshop-section">
                    <div class="pshop-section-header">
                        <span>✨</span>
                        <span class="pshop-section-title">PREMIUM</span>
                        <span class="pshop-section-sub">Benefícios vitalícios exclusivos</span>
                    </div>
                    ${vipCard}${doubleCard}
                </div>

                <div class="pshop-section pshop-section--diamonds">
                    <div class="pshop-section-header">
                        <span>💎</span>
                        <span class="pshop-section-title">PACOTES DE DIAMANTES</span>
                        <span class="pshop-section-sub">Saldo atual: 💎 ${g.economy.prestigeTokens.toLocaleString('pt-BR')} Diamantes</span>
                    </div>
                    <div class="dpack-grid">${packHTML}</div>
                </div>

                <div class="pshop-section">
                    <div class="pshop-section-header">
                        <span>🎨</span>
                        <span class="pshop-section-title">SKINS & TEMAS</span>
                        <span class="pshop-section-sub">Transforme completamente a atmosfera do núcleo</span>
                    </div>
                    ${defaultCard}${skinCards}
                </div>

                <div class="pshop-section">
                    <div class="pshop-section-header">
                        <span>⚡</span>
                        <span class="pshop-section-title">BOOSTS</span>
                        <span class="pshop-section-sub">Potenciadores temporários · Clique para selecionar quantidade</span>
                    </div>
                    ${boostCards}
                </div>

            </div>`;
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
        if (skill.effectType === 'click_mult') {
            const cur = (level * e * 100).toFixed(0);
            const nxt = ((level + 1) * e * 100).toFixed(0);
            if (isMax) return `Poder de clique <strong>+${cur}%</strong> <span class="skill-desc-max">(MÁXIMO)</span>`;
            if (level === 0) return `Próximo: <strong>+${nxt}%</strong> poder de clique`;
            return `Atual: +${cur}% · Próximo: <strong>+${nxt}%</strong> poder de clique`;
        }
        if (skill.effectType === 'crit_chance') {
            const base = Config.CRITICAL_CHANCE * 100;
            const cur = (base + level * e * 100).toFixed(1);
            const nxt = (base + (level + 1) * e * 100).toFixed(1);
            if (isMax) return `Chance crítica <strong>${cur}%</strong> <span class="skill-desc-max">(MÁXIMO)</span>`;
            if (level === 0) return `Chance crítica: ${base.toFixed(1)}% → <strong>${nxt}%</strong>`;
            return `Chance crítica: ${cur}% → <strong>${nxt}%</strong>`;
        }
        if (skill.effectType === 'global_mult') {
            const cur = (1 + level * e).toFixed(2);
            const nxt = (1 + (level + 1) * e).toFixed(2);
            if (isMax) return `Produção global <strong>×${cur}</strong> <span class="skill-desc-max">(MÁXIMO)</span>`;
            if (level === 0) return `Produção global: 1× → <strong>×${nxt}</strong>`;
            return `Produção global: ×${cur} → <strong>×${nxt}</strong>`;
        }
        if (skill.effectType === 'gen_cost_discount') {
            const cur = (level * e * 100).toFixed(0);
            const nxt = ((level + 1) * e * 100).toFixed(0);
            if (isMax) return `Desconto geradores <strong>${cur}%</strong> <span class="skill-desc-max">(MÁXIMO)</span>`;
            if (level === 0) return `Desconto geradores: 0% → <strong>${nxt}%</strong>`;
            return `Desconto geradores: ${cur}% → <strong>${nxt}%</strong>`;
        }
        if (skill.effectType === 'xp_mult') {
            const cur = (1 + level * e).toFixed(2);
            const nxt = (1 + (level + 1) * e).toFixed(2);
            if (isMax) return `Ganho de XP <strong>×${cur}</strong> <span class="skill-desc-max">(MÁXIMO)</span>`;
            if (level === 0) return `Ganho de XP: 1× → <strong>×${nxt}</strong>`;
            return `Ganho de XP: ×${cur} → <strong>×${nxt}</strong>`;
        }
        if (skill.effectType === 'offline_mult') {
            const cur = (50 * (1 + level * e)).toFixed(0);
            const nxt = (50 * (1 + (level + 1) * e)).toFixed(0);
            if (isMax) return `Produção offline <strong>${cur}%</strong> <span class="skill-desc-max">(MÁXIMO)</span>`;
            if (level === 0) return `Produção offline: 50% → <strong>${nxt}%</strong>`;
            return `Produção offline: ${cur}% → <strong>${nxt}%</strong>`;
        }
        return skill.desc;
    }

    _renderSkills(container, tabsContainer) {
        const g = this._game;
        const categories = [
            { id: 'click',       name: 'Cliques',    icon: '👆' },
            { id: 'generator',   name: 'Geradores',  icon: '⚙️' },
            { id: 'progression', name: 'Progressão', icon: '📈' },
        ];
        if (!['click', 'generator', 'progression'].includes(this._activeSkillTab)) this._activeSkillTab = 'click';

        tabsContainer.innerHTML = categories.map(c => `
            <button class="tab-btn ${this._activeSkillTab === c.id ? 'active' : ''}"
                    onclick="window.game.ui._activeSkillTab='${c.id}'; window.game.ui._renderPanelContent('skills')">
                ${c.icon} ${c.name}
            </button>`).join('');

        const sp = g.skills.skillPoints;
        const skills = SKILLS.filter(s => s.category === this._activeSkillTab);

        let html = `<div class="skill-sp-bar"><span class="skill-sp-label">Pontos de Habilidade</span><span class="skill-sp-count" id="skill-sp-count">${sp} SP</span></div>`;
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

    async _renderLeaderboard(container) {
        const g   = this._game;
        const acc = g.account;
        const isOnline = acc.isLoggedIn() && !acc.isLocalOnly() && window.location.protocol !== 'file:';

        // Clear any previous refresh timer
        if (this._lbRefreshTimer) { clearInterval(this._lbRefreshTimer); this._lbRefreshTimer = null; }

        // Show loading immediately (sync)
        container.innerHTML = `
            <div class="lb-header-note">
                <span class="lb-badge">PLACAR GLOBAL</span>
                <span class="lb-note">Neurônios vitalícios · não reseta com Prestígio</span>
            </div>
            <div class="lb-loading"><div class="lb-spinner"></div><span>Carregando ranking...</span></div>`;

        let entries = [], playerRank = null;

        if (isOnline) {
            await g._syncLeaderboard();
            try {
                const [topRes, rankRes] = await Promise.all([
                    fetch('api/leaderboard.php?action=top&limit=50'),
                    fetch('api/leaderboard.php?action=rank'),
                ]);
                const topData  = await topRes.json();
                const rankData = await rankRes.json();
                if (topData.ok)  entries    = topData.entries;
                if (rankData.ok) playerRank = rankData.rank;
            } catch {
                container.innerHTML = `
                    <div class="lb-header-note">
                        <span class="lb-badge">PLACAR GLOBAL</span>
                        <span class="lb-note">Neurônios vitalícios · não reseta com Prestígio</span>
                    </div>
                    <div class="lb-error">⚠️ Sem conexão com o servidor.<br>Verifique se o XAMPP está rodando.</div>`;
                return;
            }
        }

        // Tag current player in server entries
        const uid = acc.getAccount()?.id;
        if (uid) entries.forEach(e => { if (e.id === uid) e.isPlayer = true; });

        // Build local player entry (always available as fallback)
        const playerLocal = acc.isLoggedIn() ? {
            id: uid, username: acc.getAccount().username, foto: acc.getAccount().foto,
            lifetimeNeurons: g.economy.lifetimeNeurons, level: g.level.level,
            totalPrestiges: g.economy.totalPrestiges, vip: acc.isVip(), isPlayer: true,
        } : null;

        const top        = entries.slice(0, 50);
        const playerInList = top.some(e => e.isPlayer);

        // Helpers
        const podiumClasses = ['lb-pod-1st','lb-pod-2nd','lb-pod-3rd'];
        const podiumMedals  = ['🥇','🥈','🥉'];

        const avatarEl = (entry) => {
            if (entry.isPlayer)
                return `<img class="lb-avatar-img" src="${acc.getPhotoUrl()}" alt="">`;
            const src = entry.foto ? `foto/${entry.foto}` : 'foto/padrao.png';
            return `<img class="lb-avatar-img" src="${src}" alt="">`;
        };

        const buildPodiumSlot = (entry, rank) => {
            if (!entry) return `<div class="lb-pod-slot ${podiumClasses[rank-1]} lb-pod-empty"><div class="lb-pod-medal">${podiumMedals[rank-1]}</div><div class="lb-pod-card lb-pod-card--empty"><span>—</span></div><div class="lb-pod-pedestal"></div></div>`;
            const vipBadge  = entry.vip      ? `<span class="lb-vip-badge">VIP</span>` : '';
            const youTag    = entry.isPlayer ? `<span class="lb-you-tag">VOCÊ</span>`  : '';
            const nameClass = entry.vip      ? 'lb-pod-name lb-name-vip' : 'lb-pod-name';
            return `
                <div class="lb-pod-slot ${podiumClasses[rank-1]}${entry.isPlayer?' lb-pod-you':''}">
                    <div class="lb-pod-medal">${podiumMedals[rank-1]}</div>
                    <div class="lb-pod-card">
                        <div class="lb-pod-avatar">${avatarEl(entry)}</div>
                        <div class="${nameClass}">${entry.username}${vipBadge}${youTag}</div>
                        <div class="lb-pod-score">${formatNum(entry.lifetimeNeurons)}<span class="lb-unit"> ⚡</span></div>
                        <div class="lb-pod-sub">Lv ${entry.level} · ${entry.totalPrestiges} ♻</div>
                    </div>
                    <div class="lb-pod-pedestal"></div>
                </div>`;
        };

        const buildRow = (entry, rank) => {
            const vipBadge  = entry.vip      ? `<span class="lb-vip-badge">VIP</span>` : '';
            const youTag    = entry.isPlayer ? `<span class="lb-you-tag">VOCÊ</span>`  : '';
            const nameClass = entry.vip      ? 'lb-name lb-name-vip' : 'lb-name';
            return `
                <div class="lb-row${entry.isPlayer?' lb-row-player':''}">
                    <div class="lb-rank">#${rank}</div>
                    <div class="lb-row-avatar">${avatarEl(entry)}</div>
                    <div class="lb-info">
                        <div class="${nameClass}">${entry.username}${vipBadge}${youTag}</div>
                        <div class="lb-sub">Lv ${entry.level} · ${entry.totalPrestiges} ♻</div>
                    </div>
                    <div class="lb-score">${formatNum(entry.lifetimeNeurons)}<span class="lb-unit"> ⚡</span></div>
                </div>`;
        };

        // ── Render podium ──
        const podiumHTML = `
            <div class="lb-podium">
                ${buildPodiumSlot(top[0], 1)}
                ${buildPodiumSlot(top[1], 2)}
                ${buildPodiumSlot(top[2], 3)}
            </div>`;

        // ── Render rows 4+ ──
        let rowsHTML = top.slice(3).map((e, i) => buildRow(e, i + 4)).join('');

        if (!playerInList && playerLocal) {
            const sep = top.length >= 3 ? `<div class="lb-separator">· · ·</div>` : '';
            const rank = playerRank ?? (top.length + 1);
            rowsHTML += sep + buildRow(playerLocal, rank);
        }

        if (top.length === 0 && !playerLocal) {
            rowsHTML = `<div class="lb-empty">Nenhum jogador no ranking ainda.<br>Seja o primeiro!</div>`;
        }

        // ── Footer ──
        const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const footer = isOnline
            ? `🌐 Placar online · Atualizado às ${time} · Atualiza a cada 30s`
            : (!acc.isLoggedIn()
                ? '⚠️ Entre na sua conta para aparecer no ranking global'
                : '⚠️ Conta local — crie uma conta online para entrar no ranking');

        container.innerHTML = `
            <div class="lb-header-note">
                <span class="lb-badge">PLACAR GLOBAL</span>
                <span class="lb-note">Neurônios vitalícios · não reseta com Prestígio</span>
            </div>
            ${podiumHTML}
            <div class="lb-list">${rowsHTML}</div>
            <div class="lb-footer">${footer}</div>`;

        // Auto-refresh every 30s while panel is open
        this._lbRefreshTimer = setInterval(() => {
            if (this._activePanel === 'leaderboard') {
                const c = document.getElementById('modal-content');
                if (c) this._renderLeaderboard(c);
            } else {
                clearInterval(this._lbRefreshTimer);
                this._lbRefreshTimer = null;
            }
        }, 30_000);
    }

    // ── Boss World & Notification ─────────────────────────────────────────────

    _initBossUI() {
        const g   = this._game;
        const bm  = g.boss;

        // Start global polling (boss is always checked, even outside boss world)
        bm.startPolling(5000);

        // New boss appeared → show notification
        g.events.on('bossSpawned', ({ boss }) => {
            this._showBossNotification(boss);
            g.audio.event?.();
        });

        // State updates → refresh world if open
        g.events.on('bossStateUpdate', () => { if (this._worldOpen) this._updateBossWorld(); });
        g.events.on('bossHit',         () => { if (this._worldOpen) this._updateBossWorld(); });
        g.events.on('bossDefeated',    () => { if (this._worldOpen) this._updateBossWorld(); });

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

        // Keyboard: Escape closes boss world
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && this._worldOpen) this._closeBossWorld();
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
        const world = document.getElementById('boss-world');
        if (!world) return;
        this._worldOpen = true;
        this._game.boss.openBossWorld();

        world.className = 'open';
        world.setAttribute('data-type', this._game.boss.boss?.type || '');
        this._spawnWorldParticles();
        this._renderBossWorld();
    }

    _closeBossWorld() {
        this._worldOpen = false;
        this._game.boss.closeBossWorld();
        const world = document.getElementById('boss-world');
        if (world) {
            world.classList.remove('open');
            // Clear particles
            const p = document.getElementById('bw-particles');
            if (p) p.innerHTML = '';
        }
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
        content.innerHTML = '<div class="bw-loading">⚔️ Entrando na batalha…</div>';
        this._updateBossWorld();
    }

    _updateBossWorld() {
        const content = document.getElementById('bw-content');
        if (!content) return;
        const bm  = this._game.boss;
        const acc = this._game.account;

        if (!bm.boss) {
            content.innerHTML = `
                <div class="bw-no-boss">
                    <div class="bw-no-boss-icon">🌐</div>
                    <div class="bw-no-boss-title">Nenhum Boss Ativo</div>
                    <div class="bw-no-boss-sub">Próximo boss em breve…</div>
                </div>`;
            return;
        }

        const b        = bm.boss;
        const def      = (typeof BOSS_TYPES !== 'undefined' && BOSS_TYPES[b.type]) || {};
        const rc       = (typeof BOSS_RARITY_COLORS !== 'undefined' && BOSS_RARITY_COLORS[b.rarity]) || '#00f5ff';
        const rl       = (typeof BOSS_RARITY_LABELS !== 'undefined' && BOSS_RARITY_LABELS[b.rarity]) || b.rarity;
        const defeated  = b.status === 'defeated' || b.status === 'expired';
        const pct       = Math.max(0, Math.min(1, b.pct ?? (b.currentHp / b.maxHp)));
        const hpPct     = (pct * 100).toFixed(2);
        const hpColor   = pct > 0.5 ? '#00ff88' : pct > 0.25 ? '#ffd700' : '#ff4444';
        const rem       = b.remaining ?? 0;
        const mm        = String(Math.floor(rem / 60)).padStart(2, '0');
        const ss        = String(rem % 60).padStart(2, '0');
        const timerStr  = defeated ? (b.status === 'defeated' ? '☠ DERROTADO' : '⌛ EXPIRADO') : `${mm}:${ss}`;
        const mult      = b.rarity === 'legendary' ? 3 : b.rarity === 'epic' ? 2 : 1;
        const canAttack = !defeated && acc.isLoggedIn();

        // Update boss-world theme
        const world = document.getElementById('boss-world');
        if (world) world.setAttribute('data-type', b.type);

        const topHTML = bm.top.length === 0
            ? '<div class="bw-top-empty">Nenhum dano registrado ainda.</div>'
            : bm.top.map((p, i) => {
                const medal  = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`;
                const isMe   = acc.isLoggedIn() && p.userId === acc.getAccount()?.id;
                const barPct = b.maxHp > 0 ? Math.min(100, p.damage / b.maxHp * 100) : 0;
                const av     = p.foto ? `foto/${p.foto}` : 'foto/padrao.png';
                return `<div class="bw-top-row${isMe ? ' bw-top-row--me' : ''}">
                    <span class="bw-top-medal">${medal}</span>
                    <img class="bw-top-avatar" src="${av}" alt="">
                    <span class="bw-top-name">${p.username}</span>
                    <div class="bw-top-bar-wrap"><div class="bw-top-bar" style="width:${barPct.toFixed(1)}%;background:${rc}88"></div></div>
                    <span class="bw-top-dmg" style="color:${rc}">${formatNum(p.damage)}</span>
                </div>`;
            }).join('');

        const myInfoHTML = acc.isLoggedIn() && bm.myDamage > 0
            ? `<span class="bw-my-dmg">Seu dano: <strong style="color:${rc}">${formatNum(bm.myDamage)}</strong>${bm.myRank ? ` &nbsp;·&nbsp; Rank <strong style="color:${rc}">#${bm.myRank}</strong>` : ''}</span>`
            : (!acc.isLoggedIn() ? `<span class="bw-login-hint">⚠ Faça login para ganhar recompensas</span>` : '');

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
                    <span class="bw-hp-text">${formatNum(Math.max(0, b.currentHp))} / ${formatNum(b.maxHp)}</span>
                </div>
                <div class="bw-timer-row">
                    <span class="bw-timer${defeated ? ' bw-timer--dead' : ''}" style="${!defeated ? `color:${rc}` : ''}">${timerStr}</span>
                    ${myInfoHTML}
                </div>
            </div>

            <div class="bw-arena${defeated ? ' bw-arena--dead' : ''}" style="--glow:${def.glowColor || rc + '44'}">
                <div class="bw-arena-glow"></div>
                <div class="bw-boss-icon" id="bw-boss-icon">${def.icon || '👾'}</div>
                ${canAttack ? `<div class="bw-arena-hint">CLIQUE PARA ATACAR</div>` : ''}
                ${defeated ? `<div class="bw-defeated-label">${b.status === 'defeated' ? '☠ DERROTADO' : '⌛ EXPIRADO'}</div>` : ''}
            </div>

            <div class="bw-rewards-row">
                <span>🥇 ${30 * mult}💎</span>
                <span>🥈 ${15 * mult}💎</span>
                <span>🥉 ${5 * mult}💎</span>
                <span style="color:var(--text-dim)">+ Neurônios</span>
            </div>

            <div class="bw-top-section">
                <div class="bw-top-title" style="color:${rc}">⚔ Top Dano Global</div>
                ${topHTML}
            </div>`;

        // Smooth HP bar after paint
        requestAnimationFrame(() => {
            const fill = document.getElementById('bw-hp-fill');
            if (fill) fill.style.transition = 'width 0.5s ease, background 0.4s';
        });
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

        const dmg = this._game.economy.getClickValue() * this._game.combo.getMult();
        const num = document.createElement('div');
        num.className = 'bw-dmg-num';
        num.textContent = '-' + formatNum(dmg);
        num.style.cssText = `left:${25 + Math.random() * 50}%;top:${15 + Math.random() * 35}%`;
        arena.appendChild(num);
        setTimeout(() => num.remove(), 900);

        const icon = document.getElementById('bw-boss-icon');
        if (icon) {
            icon.classList.remove('bw-boss-icon--hit');
            void icon.offsetWidth;
            icon.classList.add('bw-boss-icon--hit');
            setTimeout(() => icon.classList.remove('bw-boss-icon--hit'), 280);
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

        // Approaching / ready banner HTML
        let bannerHtml = '';
        if (canPrestige) {
            bannerHtml = `<div class="rb-status-banner rb-ready-banner">♻ Renascimento Disponível!</div>`;
        } else if (approaching) {
            bannerHtml = `<div class="rb-status-banner rb-approaching-banner"><span class="rb-approaching-icon">⚡</span> Aproximando — ${(progress * 100).toFixed(0)}%</div>`;
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
                            <div class="rb-title">Renascimento Neural</div>
                            <div class="rb-subtitle">Nível de Prestígio: <strong>${totalPrestiges}</strong></div>
                        </div>
                    </div>
                    <div class="rb-prestige-badge" style="--tc:${theme.c1}">${totalPrestiges}</div>
                </div>

                <div class="rb-theme-row" style="--tc:${theme.c1}">
                    <span class="rb-theme-label">Tema atual</span>
                    <span class="rb-theme-name">${theme.name}</span>
                </div>

                <div class="rb-section">
                    <div class="rb-section-title">Progresso para Renascimento</div>
                    ${pctBar}
                    ${bannerHtml}
                </div>

                <div class="rb-section">
                    <div class="rb-section-title">Recompensa</div>
                    <div class="rb-reward-row">
                        <div class="rb-reward-box" style="--tc:${theme.c1}">
                            <div class="rb-reward-val">${tokens > 0 ? '+' + tokens : '—'} 💎</div>
                            <div class="rb-reward-sub">Diamantes</div>
                        </div>
                        <div class="rb-reward-box" style="--tc:#7b2fff">
                            <div class="rb-reward-val">${afterMult}×</div>
                            <div class="rb-reward-sub">Mult. Após (era ${currentMult}×)</div>
                        </div>
                    </div>
                </div>

                <div class="rb-section">
                    <div class="rb-section-title">Estatísticas</div>
                    <div class="rb-stats-grid">
                        <div class="rb-stat-box" data-color="gold">
                            <span class="rb-stat-label">🔄 Prestígios</span>
                            <span class="rb-stat-val">${totalPrestiges}</span>
                        </div>
                        <div class="rb-stat-box" data-color="purple">
                            <span class="rb-stat-label">📈 Multiplicador</span>
                            <span class="rb-stat-val">${currentMult}×</span>
                        </div>
                        <div class="rb-stat-box" data-color="cyan">
                            <span class="rb-stat-label">⚡ Neurônios atuais</span>
                            <span class="rb-stat-val">${formatNum(totalNeurons)}</span>
                        </div>
                        <div class="rb-stat-box" style="--tc:${nextTheme.c1}">
                            <span class="rb-stat-label">🎯 Próximo Tema</span>
                            <span class="rb-stat-val" style="font-size:11px;color:var(--tc,var(--cyan))">${nextTheme.name}</span>
                        </div>
                    </div>
                </div>

                <button id="prestige-btn" class="rb-prestige-btn${canPrestige ? ' rb-btn-ready' : ''}" ${canPrestige ? '' : 'disabled'}>
                    ${canPrestige ? `♻ Renascer Agora (+${tokens} 💎)` : (approaching ? `⚡ ${(progress * 100).toFixed(0)}% — Aproximando!` : 'Neurônios Insuficientes')}
                </button>

            </div>`;
    }

    _updateBoostDisplay() {
        const container = document.getElementById('boost-display');
        if (!container) return;
        const boosts = this._game.boosts.getActiveBoosts();

        if (boosts.length === 0) {
            container.innerHTML = '';
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

        if (ready) {
            btn.textContent = `♻ Renascer (+${tokens} 💎)`;
            btn.classList.add('prestige-ready');
            btn.classList.remove('prestige-approaching');
        } else if (progress >= 0.6) {
            btn.textContent = `♻ ${pct}% — Aproximando!`;
            btn.classList.remove('prestige-ready');
            btn.classList.add('prestige-approaching');
        } else {
            btn.textContent = `♻ ${pct}% para Renascer`;
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
        const bannerEl = document.querySelector('.rb-status-banner');
        if (bannerEl) {
            if (canPrestige) {
                bannerEl.className = 'rb-status-banner rb-ready-banner';
                bannerEl.innerHTML = '♻ Renascimento Disponível!';
            } else if (approaching) {
                bannerEl.className = 'rb-status-banner rb-approaching-banner';
                bannerEl.innerHTML = `<span class="rb-approaching-icon">⚡</span> Aproximando — ${(progress * 100).toFixed(0)}%`;
            } else {
                bannerEl.className = 'rb-status-banner';
                bannerEl.innerHTML = '';
            }
        }

        // Prestige button inside panel
        const pbtn = document.querySelector('.rb-prestige-btn');
        if (pbtn) {
            if (canPrestige) {
                pbtn.textContent = `♻ Renascer Agora (+${tokens} 💎)`;
                pbtn.classList.add('rb-btn-ready');
                pbtn.disabled = false;
            } else {
                pbtn.textContent = approaching
                    ? `⚡ ${(progress * 100).toFixed(0)}% — Aproximando!`
                    : 'Neurônios Insuficientes';
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

    _setEl(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    _onResize() { 
        // Resize canvas elements if needed (managed by ParticleSystem usually)
    }
}
