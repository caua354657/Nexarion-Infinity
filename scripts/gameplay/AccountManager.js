function defaultAvatar(username) {
    const letter = (username || '?')[0].toUpperCase();
    let hash = 0;
    const s = username || '';
    for (let i = 0; i < s.length; i++) hash = (s.charCodeAt(i) + ((hash << 5) - hash)) | 0;
    const h = Math.abs(hash) % 360;
    const bg = `hsl(${h},60%,42%)`;
    return `<svg width="100%" height="100%" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="18" fill="${bg}"/><text x="18" y="24" text-anchor="middle" font-size="16" font-family="Orbitron,sans-serif" font-weight="700" fill="rgba(255,255,255,0.95)">${letter}</text></svg>`;
}

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
    setVip()         { if (this._user) { this._user.vip = true; this._persist(); this._saveCompras(); } }
    hasDoubleNeuron(){ return this._user?.doubleNeuron === true; }
    setDoubleNeuron(){ if (this._user) { this._user.doubleNeuron = true; this._persist(); this._saveCompras(); } }
    hasBossDmgX2()   { return this._user?.bossDmgX2 === true; }
    setBossDmgX2()   { if (this._user) { this._user.bossDmgX2 = true; this._persist(); this._saveCompras(); } }
    hasSkin(id)      { return (this._user?.skins || []).includes(id); }
    getActiveSkin()  { return this._user?.activeSkin || null; }
    getDiamonds()    { return this._user?.diamonds || 0; }

    buySkin(id) {
        if (!this._user) return;
        if (!this._user.skins) this._user.skins = [];
        if (!this._user.skins.includes(id)) this._user.skins.push(id);
        this._persist();
        this._saveCompras();
    }

    setActiveSkin(id) {
        if (!this._user) return;
        this._user.activeSkin = id;
        this._persist();
        this._saveCompras();
    }

    addDiamonds(n) {
        if (!this._user) return;
        this._user.diamonds = (this._user.diamonds || 0) + Math.max(0, n);
        this._persist();
        this._saveCompras();
    }

    spendDiamonds(n) {
        if (!this._user || this.getDiamonds() < n) return false;
        this._user.diamonds -= n;
        this._persist();
        this._saveCompras();
        return true;
    }

    resetDiamonds() {
        if (!this._user) return;
        this._user.diamonds = 0;
        this._persist();
        this._saveCompras();
    }

    getPhotoUrl() {
        if (this._user?.foto) return 'foto/' + this._user.foto;
        return 'foto/padrao.png';
    }

    hasCustomPhoto() {
        return !!this._user?.foto;
    }

    async removePhoto() {
        try {
            const fd = new FormData();
            fd.append('action', 'remove');
            const res  = await fetch('api/profile.php', { method: 'POST', body: fd });
            const data = await res.json();
            if (data.ok && this._user) { this._user.foto = null; this._persist(); }
            return data;
        } catch (e) {
            return { ok: false, msg: 'Erro de conexão.' };
        }
    }

    getAvatarIcon() {
        return defaultAvatar(this._user?.username || '?');
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
            const ctrl  = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 5000); // 5s timeout for session check
            const res  = await fetch('api/auth.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'check' }),
                signal: ctrl.signal,
            });
            clearTimeout(timer);
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
            // Network offline or timeout — keep cached state, game remains playable
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
        // Purchases are synced to the server via compras.php — no local backup needed.
        // We do a full page reload after logout so no state leaks between accounts.
        this._loggedIn = false;
        this._user = null;
        localStorage.removeItem(this._cacheKey);
        localStorage.removeItem('nexuscore_backup'); // clear any stale backup
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
        // Purchases come directly from the server (api/auth.php + api/compras.php).
        // No local backup needed — it would contaminate other accounts.
        localStorage.removeItem('nexuscore_backup');
        this._user = {
            createdAt:    Date.now(),
            ...serverUser,
            _localOnly:   false,
            vip:          serverUser.vip          ?? false,
            doubleNeuron: serverUser.doubleNeuron  ?? false,
            diamonds:     serverUser.diamantes     ?? serverUser.diamonds ?? 0,
            skins:        serverUser.skins         ?? [],
            activeSkin:   serverUser.skinAtiva     ?? serverUser.activeSkin ?? null,
        };
        this._persist();
    }

    // ── Sync purchases to server (fire-and-forget) ────────────────────────────
    _saveCompras() {
        if (!this._user || this._user._localOnly) return;
        if (window.location.protocol === 'file:') return;
        fetch('api/compras.php', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action:       'salvar',
                vip:          this._user.vip          || false,
                doubleNeuron: this._user.doubleNeuron || false,
                bossDmgX2:    this._user.bossDmgX2    || false,
                diamantes:    this._user.diamonds      || 0,
                skins:        this._user.skins         || [],
                skinAtiva:    this._user.activeSkin    || null,
            }),
        }).catch(() => { /* ignore */ });
    }

    _persist() {
        if (this._user) localStorage.setItem(this._cacheKey, JSON.stringify(this._user));
    }
}
