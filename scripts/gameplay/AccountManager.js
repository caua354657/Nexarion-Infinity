class AccountManager {
    constructor() {
        this._accountKey = 'nexuscore_account';
        this._sessionKey = 'nexuscore_session';
        this._account = null;
        this._loggedIn = false;
        this._init();
    }

    _init() {
        try {
            const raw = localStorage.getItem(this._accountKey);
            if (raw) this._account = JSON.parse(raw);
        } catch { this._account = null; }
        try {
            const sess = localStorage.getItem(this._sessionKey);
            this._loggedIn = sess ? JSON.parse(sess).loggedIn === true : false;
        } catch { this._loggedIn = false; }
    }

    _saveAccount() {
        if (this._account) localStorage.setItem(this._accountKey, JSON.stringify(this._account));
    }

    _hash(pass) {
        // Simple encoding — local-only, not a real security measure
        return btoa(unescape(encodeURIComponent(pass)));
    }

    isLoggedIn() { return this._loggedIn && this._account !== null; }
    hasAccount() { return this._account !== null; }
    getAccount() { return this._account; }

    isVip() { return this._account?.vip === true; }

    setVip() {
        if (!this._account) return;
        this._account.vip = true;
        this._saveAccount();
    }

    hasDoubleNeuron() { return this._account?.doubleNeuron === true; }

    setDoubleNeuron() {
        if (!this._account) return;
        this._account.doubleNeuron = true;
        this._saveAccount();
    }

    hasSkin(id) { return (this._account?.skins || []).includes(id); }

    buySkin(id) {
        if (!this._account) return;
        if (!this._account.skins) this._account.skins = [];
        if (!this._account.skins.includes(id)) this._account.skins.push(id);
        this._saveAccount();
    }

    getActiveSkin() { return this._account?.activeSkin || null; }

    setActiveSkin(id) {
        if (!this._account) return;
        this._account.activeSkin = id;
        this._saveAccount();
    }

    getDiamonds()  { return this._account?.diamonds || 0; }

    addDiamonds(n) {
        if (!this._account) return;
        this._account.diamonds = (this._account.diamonds || 0) + Math.max(0, n);
        this._saveAccount();
    }

    spendDiamonds(n) {
        if (!this._account || this.getDiamonds() < n) return false;
        this._account.diamonds -= n;
        this._saveAccount();
        return true;
    }

    getAvatarIcon() {
        if (!this._account) return '👤';
        const icons = ['🧠', '⚡', '🔮', '💡', '🌟', '🔬', '🤖', '🎯', '💎', '🚀'];
        return icons[(this._account.username.charCodeAt(0) || 0) % icons.length];
    }

    createAccount(username, email, password) {
        const u = username?.trim(), e = email?.trim(), p = password;
        if (!u || !e || !p) return { ok: false, msg: 'Preencha todos os campos.' };
        if (u.length < 3) return { ok: false, msg: 'Nome deve ter ao menos 3 caracteres.' };
        if (!e.includes('@') || !e.includes('.')) return { ok: false, msg: 'Email inválido.' };
        if (p.length < 6) return { ok: false, msg: 'Senha deve ter ao menos 6 caracteres.' };

        this._account = {
            username: u,
            email: e.toLowerCase(),
            passwordHash: this._hash(p),
            createdAt: Date.now()
        };
        this._loggedIn = true;
        this._saveAccount();
        localStorage.setItem(this._sessionKey, JSON.stringify({ loggedIn: true }));
        return { ok: true };
    }

    login(emailOrUser, password) {
        if (!this._account) return { ok: false, msg: 'Nenhuma conta criada. Registre-se primeiro.' };
        const input = emailOrUser.trim().toLowerCase();
        if (this._account.email !== input && this._account.username.toLowerCase() !== input)
            return { ok: false, msg: 'Usuário ou email não encontrado.' };
        if (this._account.passwordHash !== this._hash(password))
            return { ok: false, msg: 'Senha incorreta.' };
        this._loggedIn = true;
        localStorage.setItem(this._sessionKey, JSON.stringify({ loggedIn: true }));
        return { ok: true };
    }

    logout() {
        this._loggedIn = false;
        localStorage.removeItem(this._sessionKey);
    }

    deleteAccount() {
        this._account = null;
        this._loggedIn = false;
        localStorage.removeItem(this._accountKey);
        localStorage.removeItem(this._sessionKey);
    }
}
