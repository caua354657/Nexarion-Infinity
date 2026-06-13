'use strict';

class LimitedSkinsManager {
    static ROTATION_MS   = 72 * 60 * 60 * 1000; // 72 h per rotation
    static ACTIVE_COUNT  = 3;                     // skins active at once

    constructor(game) {
        this._game  = game;
        this._state = {
            activeSkinIds:  [],
            seenSkinIds:    [],
            activeExpiresAt: 0,
        };
    }

    init() {
        this._load();
        // Always include owned limited skins in the seen list
        this._addOwnedToSeen();
        this._tick();
    }

    _tick() {
        const now = Date.now();
        if (now >= this._state.activeExpiresAt || this._state.activeSkinIds.length === 0) {
            this._rotate();
        }
    }

    _rotate() {
        const pool = this._pool();
        // Prefer skins not in previous rotation
        const prev    = new Set(this._state.activeSkinIds);
        const fresh   = pool.filter(s => !prev.has(s.id));
        const carried = pool.filter(s =>  prev.has(s.id));
        const ordered = [..._shuffle(fresh), ..._shuffle(carried)];

        const newActive = ordered.slice(0, LimitedSkinsManager.ACTIVE_COUNT).map(s => s.id);
        this._state.activeSkinIds   = newActive;
        this._state.activeExpiresAt = Date.now() + LimitedSkinsManager.ROTATION_MS;

        for (const id of newActive) {
            if (!this._state.seenSkinIds.includes(id)) this._state.seenSkinIds.push(id);
        }
        this._save();

        // Notify UI if open
        if (this._game.ui?._activePanel === 'shop_content') {
            this._game.ui._renderPanelContent('shop_content');
        }
    }

    _addOwnedToSeen() {
        const acc = this._game.account;
        for (const s of this._pool()) {
            if (acc.hasSkin?.(s.id) && !this._state.seenSkinIds.includes(s.id)) {
                this._state.seenSkinIds.push(s.id);
            }
        }
    }

    _pool() {
        return (typeof PREMIUM_SKINS !== 'undefined' ? PREMIUM_SKINS : []).filter(s => s.temp);
    }

    // Returns currently active skins, each with unified expiresAt for the rotation
    getActiveSkins() {
        const exp = this._state.activeExpiresAt;
        return this._pool()
            .filter(s => this._state.activeSkinIds.includes(s.id))
            .map(s => ({ ...s, expiresAt: exp }));
    }

    // Returns all skins ever seen in rotations (for the album)
    getSeenSkins() {
        return this._pool().filter(s => this._state.seenSkinIds.includes(s.id));
    }

    getExpiresAt() { return this._state.activeExpiresAt; }

    getState()  { return JSON.parse(JSON.stringify(this._state)); }

    loadState(s) {
        if (!s) return;
        try {
            if (Array.isArray(s.activeSkinIds))  this._state.activeSkinIds   = s.activeSkinIds;
            if (Array.isArray(s.seenSkinIds))    this._state.seenSkinIds     = s.seenSkinIds;
            if (s.activeExpiresAt)               this._state.activeExpiresAt = s.activeExpiresAt;
        } catch(_) {}
    }

    _save() {
        try { localStorage.setItem('nx_limited_v1', JSON.stringify(this._state)); } catch(_) {}
    }

    _load() {
        try {
            const raw = localStorage.getItem('nx_limited_v1');
            if (!raw) return;
            const s = JSON.parse(raw);
            if (Array.isArray(s.activeSkinIds))  this._state.activeSkinIds  = s.activeSkinIds;
            if (Array.isArray(s.seenSkinIds))    this._state.seenSkinIds    = s.seenSkinIds;
            if (s.activeExpiresAt)               this._state.activeExpiresAt = s.activeExpiresAt;
        } catch(_) {}
    }
}

function _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
