class SaveManager {
    constructor() {
        this._key       = Config.SAVE_KEY;
        this._backupKey = Config.SAVE_KEY + '_bak';
        this._lastJSON  = null;
        this._lastSave  = 0;
        this._game      = null;
        this._db        = null;
        this._dbReady   = this._openDB();
    }

    // ── IndexedDB ─────────────────────────────────────────────────────────────

    _openDB() {
        return new Promise(resolve => {
            if (!window.indexedDB) { resolve(null); return; }
            const req = indexedDB.open('nexuscore_db', 1);
            req.onupgradeneeded = e => {
                if (!e.target.result.objectStoreNames.contains('saves'))
                    e.target.result.createObjectStore('saves');
            };
            req.onsuccess = e => { this._db = e.target.result; resolve(this._db); };
            req.onerror   = ()  => resolve(null);
        });
    }

    _idbPut(key, val) {
        return new Promise((resolve, reject) => {
            if (!this._db) { reject(); return; }
            const tx = this._db.transaction('saves', 'readwrite');
            tx.objectStore('saves').put(val, key);
            tx.oncomplete = resolve;
            tx.onerror    = () => reject(tx.error);
        });
    }

    _idbGet(key) {
        return new Promise((resolve, reject) => {
            if (!this._db) { resolve(null); return; }
            const tx  = this._db.transaction('saves', 'readonly');
            const req = tx.objectStore('saves').get(key);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror   = () => reject(req.error);
        });
    }

    _idbDel(key) {
        return new Promise((resolve, reject) => {
            if (!this._db) { resolve(); return; }
            const tx  = this._db.transaction('saves', 'readwrite');
            const req = tx.objectStore('saves').delete(key);
            req.onsuccess = resolve;
            req.onerror   = () => reject(req.error);
        });
    }

    // ── Save ──────────────────────────────────────────────────────────────────
    // Serializa e persiste o estado imediatamente.
    // LS (síncrono, ~1ms) garante que mesmo um reload abrupto não perde dados.
    // IDB (assíncrono) é o armazenamento durável de longo prazo.

    save(state) {
        try {
            const payload = { ...state, savedAt: Date.now(), version: Config.VERSION };
            this._lastJSON = JSON.stringify(payload);
            this._lastSave = Date.now();
            try { localStorage.setItem(this._key, this._lastJSON); } catch { /* cota */ }
            this._dbReady.then(() => this._idbPut(this._key, payload).catch(() => {}));
        } catch (e) {
            console.error('[Save] falhou:', e);
        }
    }

    // ── Load ──────────────────────────────────────────────────────────────────

    async load() {
        await this._dbReady;

        let idbData = null;
        let lsData  = null;

        try { idbData = await this._idbGet(this._key); } catch { /* falha IDB */ }
        try {
            const raw = localStorage.getItem(this._key);
            if (raw) lsData = JSON.parse(raw);
        } catch { /* corrompido */ }

        const idbTime = idbData?.savedAt || 0;
        const lsTime  = lsData?.savedAt  || 0;
        const best    = idbTime >= lsTime ? (idbData || lsData) : (lsData || idbData);

        if (best) {
            this._lastJSON = JSON.stringify(best);
            if (lsTime > idbTime && lsData)
                this._dbReady.then(() => this._idbPut(this._key, lsData).catch(() => {}));
            if (idbTime > lsTime && idbData)
                try { localStorage.setItem(this._key, JSON.stringify(idbData)); } catch { /* cota */ }
            return best;
        }

        try {
            const bak = localStorage.getItem(this._backupKey);
            if (bak) return JSON.parse(bak);
        } catch { /* corrompido */ }

        return null;
    }

    // ── Wipe ──────────────────────────────────────────────────────────────────

    wipe() {
        this._lastJSON = null;
        this._lastSave = 0;
        localStorage.removeItem(this._key);
        localStorage.removeItem(this._backupKey);
        this._dbReady.then(() => {
            this._idbDel(this._key).catch(() => {});
            this._idbDel(this._backupKey).catch(() => {});
        });
    }

    // ── Servidor ──────────────────────────────────────────────────────────────

    saveToServer(state) {
        if (!this._game) return;
        const acc = this._game.account;
        if (!acc.isLoggedIn() || acc.isLocalOnly()) return;
        if (window.location.protocol === 'file:') return;
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 8000);
        fetch('api/progresso.php', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ action: 'salvar', dados: state }),
            signal:  ctrl.signal,
        }).catch(() => {});
    }

    async loadFromServer() {
        if (!this._game) return null;
        const acc = this._game.account;
        if (!acc.isLoggedIn() || acc.isLocalOnly()) return null;
        if (window.location.protocol === 'file:') return null;
        try {
            const ctrl  = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 8000);
            const res   = await fetch('api/progresso.php?action=carregar', { signal: ctrl.signal });
            clearTimeout(timer);
            const data  = await res.json();
            if (data.ok && data.dados) return data.dados;
        } catch { /* offline */ }
        return null;
    }

    async wipeServer() {
        if (!this._game) return;
        const acc = this._game.account;
        if (!acc.isLoggedIn() || acc.isLocalOnly()) return;
        if (window.location.protocol === 'file:') return;
        try {
            await fetch('api/progresso.php', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ action: 'apagar' }),
            });
        } catch { /* ignore */ }
    }

    // ── Export / Import ───────────────────────────────────────────────────────

    async exportFile() {
        let data = null;
        try { data = await this._idbGet(this._key); } catch { /* fallback */ }
        if (!data) try { data = JSON.parse(localStorage.getItem(this._key)); } catch { /* corrompido */ }
        if (!data) return false;
        try {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = url;
            a.download = `nexuscore_save_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return true;
        } catch { return false; }
    }

    importFile(file) {
        return new Promise((resolve, reject) => {
            if (!file || !file.name.endsWith('.json')) { reject('Arquivo inválido.'); return; }
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (!data.economy || !data.upgrades || !data.stats) { reject('Save inválido ou de outro jogo.'); return; }
                    const prev = localStorage.getItem(this._key);
                    if (prev) localStorage.setItem(this._backupKey, prev);
                    localStorage.setItem(this._key, JSON.stringify(data));
                    this._dbReady.then(() => this._idbPut(this._key, data).catch(() => {}));
                    resolve();
                } catch { reject('Arquivo corrompido ou inválido.'); }
            };
            reader.onerror = () => reject('Erro ao ler o arquivo.');
            reader.readAsText(file);
        });
    }

    timeSinceSave() {
        return this._lastSave ? (Date.now() - this._lastSave) / 1000 : null;
    }
}
