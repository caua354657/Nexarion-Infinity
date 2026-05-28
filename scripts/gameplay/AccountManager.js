class AccountManager {
    constructor() {
        this._cacheKey = 'nexuscore_user';
        this._user     = null;
        this._loggedIn = false;
        this._ready    = false;

        // Restore from localStorage cache
        try {
            const raw = localStorage.getItem(this._cacheKey);
            if (raw) {
                const cached = JSON.parse(raw);
                if (cached && (cached.id || cached._localOnly)) {
                    this._user     = cached;
                    this._loggedIn = true;
                }
            }
        } catch { /* ignore */ }

        // Migrate old local-only account (nexuscore_account + nexuscore_session)
        if (!this._user) {
            try {
                const oldAcc  = localStorage.getItem('nexuscore_account');
                const oldSess = localStorage.getItem('nexuscore_session');
                if (oldAcc && oldSess) {
                    const acc  = JSON.parse(oldAcc);
                    const sess = JSON.parse(oldSess);
                    if (acc?.username && sess?.loggedIn === true) {
                        this._user = {
                            _localOnly:   true,
                            username:     acc.username,
                            email:        acc.email     || '',
                            foto:         acc.foto      || null,
                            skins:        acc.skins     || [],
                            activeSkin:   acc.activeSkin || null,
                            diamonds:     acc.diamonds  || 0,
                            vip:          acc.vip       || false,
                            doubleNeuron: acc.doubleNeuron || false,
                            createdAt:    acc.createdAt || Date.now(),
                        };
                        this._loggedIn = true;
                        this._persist();
                        localStorage.removeItem('nexuscore_account');
                        localStorage.removeItem('nexuscore_session');
                    }
                }
            } catch { /* ignore */ }
        }

        // If local-only account, save backup so data survives a future server login
        if (this._user?._localOnly) {
            try {
                localStorage.setItem('nexuscore_backup', JSON.stringify({
                    skins:        this._user.skins        || [],
                    activeSkin:   this._user.activeSkin   || null,
                    diamonds:     this._user.diamonds     || 0,
                    vip:          this._user.vip          || false,
                    doubleNeuron: this._user.doubleNeuron || false,
                }));
            } catch { /* ignore */ }
        }
    }

    // ── Sync accessors (safe to call at any time) ───────────────────────────

    isLoggedIn()  { return this._loggedIn && this._user !== null; }
    hasAccount()  { return this._user !== null; }
    getAccount()  { return this._user; }

    isVip()          { return this._user?.vip === true; }
    setVip()         { if (this._user) { this._user.vip = true; this._persist(); } }
    hasDoubleNeuron(){ return this._user?.doubleNeuron === true; }
    setDoubleNeuron(){ if (this._user) { this._user.doubleNeuron = true; this._persist(); } }
    hasSkin(id)      { return (this._user?.skins || []).includes(id); }
    getActiveSkin()  { return this._user?.activeSkin || null; }
    getDiamonds()    { return this._user?.diamonds || 0; }

    buySkin(id) {
        if (!this._user) return;
        if (!this._user.skins) this._user.skins = [];
        if (!this._user.skins.includes(id)) this._user.skins.push(id);
        this._persist();
    }

    setActiveSkin(id) {
        if (!this._user) return;
        this._user.activeSkin = id;
        this._persist();
    }

    addDiamonds(n) {
        if (!this._user) return;
        this._user.diamonds = (this._user.diamonds || 0) + Math.max(0, n);
        this._persist();
    }

    spendDiamonds(n) {
        if (!this._user || this.getDiamonds() < n) return false;
        this._user.diamonds -= n;
        this._persist();
        return true;
    }

    getPhotoUrl() {
        if (!this._user?.foto) return null;
        return 'foto/' + this._user.foto;
    }

    getAvatarIcon() {
        if (!this._user) return '👤';
        const icons = ['🧠', '⚡', '🔮', '💡', '🌟', '🔬', '🤖', '🎯', '💎', '🚀'];
        return icons[(this._user.username.charCodeAt(0) || 0) % icons.length];
    }

    // ── Async API methods ───────────────────────────────────────────────────

    isLocalOnly() { return this._user?._localOnly === true; }

    async checkSession() {
        // Local-only (migrated from old offline account) — no server needed
        if (this._user && this._user._localOnly) {
            this._ready = true;
            return true;
        }

        try {
            const res  = await fetch('api/auth.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'check' }),
            });
            const data = await res.json();
            if (data.ok && data.user) {
                this._mergeUser(data.user);
                this._loggedIn = true;
            } else {
                this._loggedIn = false;
                this._user     = null;
                localStorage.removeItem(this._cacheKey);
            }
        } catch {
            // Network offline — keep cached state
        }
        this._ready = true;
        return this._loggedIn;
    }

    async login(identifier, password) {
        try {
            const res  = await fetch('api/auth.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'login', identifier, password }),
            });
            const data = await res.json();
            if (data.ok) {
                this._mergeUser(data.user);
                this._loggedIn = true;
                return { ok: true };
            }
            return { ok: false, msg: data.msg || 'Erro ao entrar.' };
        } catch {
            return { ok: false, msg: 'Servidor offline. Inicie o XAMPP e tente novamente.' };
        }
    }

    async createAccount(username, email, password, photoFile = null) {
        const u = username?.trim(), e = email?.trim(), p = password;
        if (!u || !e || !p)                       return { ok: false, msg: 'Preencha todos os campos.' };
        if (u.length < 3)                         return { ok: false, msg: 'Nome deve ter ao menos 3 caracteres.' };
        if (!e.includes('@') || !e.includes('.')) return { ok: false, msg: 'Email inválido.' };
        if (p.length < 6)                         return { ok: false, msg: 'Senha deve ter ao menos 6 caracteres.' };

        try {
            let res;
            if (photoFile) {
                // Use FormData when photo is included
                const form = new FormData();
                form.append('action',   'register');
                form.append('username', u);
                form.append('email',    e);
                form.append('password', p);
                form.append('foto',     photoFile);
                res = await fetch('api/auth.php', { method: 'POST', body: form });
            } else {
                res = await fetch('api/auth.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'register', username: u, email: e, password: p }),
                });
            }
            const data = await res.json();
            if (data.ok) {
                this._mergeUser(data.user);
                this._loggedIn = true;
                return { ok: true };
            }
            return { ok: false, msg: data.msg || 'Erro ao criar conta.' };
        } catch {
            return { ok: false, msg: 'Servidor offline. Inicie o XAMPP e tente novamente.' };
        }
    }

    async logout() {
        // Save skins/diamonds before wiping — restored automatically on next login
        if (this._user && !this._user._localOnly) {
            try {
                localStorage.setItem('nexuscore_backup', JSON.stringify({
                    skins:        this._user.skins        || [],
                    activeSkin:   this._user.activeSkin   || null,
                    diamonds:     this._user.diamonds     || 0,
                    vip:          this._user.vip          || false,
                    doubleNeuron: this._user.doubleNeuron || false,
                }));
            } catch { /* ignore */ }
        }
        this._loggedIn = false;
        localStorage.removeItem(this._cacheKey);
        this._user = null;
        try {
            await fetch('api/auth.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'logout' }),
            });
        } catch { /* ignore */ }
    }

    async deleteAccount() {
        try {
            const res  = await fetch('api/auth.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete' }),
            });
            const data = await res.json();
            if (!data.ok) return { ok: false, msg: data.msg || 'Erro ao excluir.' };
        } catch {
            return { ok: false, msg: 'Sem conexão. Tente novamente.' };
        }
        this._user     = null;
        this._loggedIn = false;
        localStorage.removeItem(this._cacheKey);
        return { ok: true };
    }

    async uploadPhoto(file) {
        const form = new FormData();
        form.append('action', 'upload');
        form.append('foto', file);
        try {
            const res  = await fetch('api/profile.php', { method: 'POST', body: form });
            const data = await res.json();
            if (data.ok) {
                if (this._user) { this._user.foto = data.foto; this._persist(); }
                return { ok: true, foto: data.foto };
            }
            return { ok: false, msg: data.msg || 'Erro ao enviar foto.' };
        } catch {
            return { ok: false, msg: 'Sem conexão. Tente novamente.' };
        }
    }

    // ── Internal helpers ────────────────────────────────────────────────────

    _mergeUser(serverUser) {
        const local  = this._user || {};
        // Also pull in any backup saved from a previous local/server account
        let backup = {};
        try { backup = JSON.parse(localStorage.getItem('nexuscore_backup') || '{}') || {}; } catch {}
        const mergedSkins = [...new Set([...(backup.skins || []), ...(local.skins || [])])];
        this._user = {
            skins:        mergedSkins,
            activeSkin:   local.activeSkin   || backup.activeSkin  || null,
            diamonds:     Math.max(local.diamonds || 0, backup.diamonds || 0),
            vip:          local.vip          || backup.vip          || false,
            doubleNeuron: local.doubleNeuron || backup.doubleNeuron || false,
            createdAt:    local.createdAt    || Date.now(),
            ...serverUser,
            _localOnly: false,
        };
        localStorage.removeItem('nexuscore_backup');
        this._persist();
    }

    _persist() {
        if (this._user) localStorage.setItem(this._cacheKey, JSON.stringify(this._user));
    }
}
