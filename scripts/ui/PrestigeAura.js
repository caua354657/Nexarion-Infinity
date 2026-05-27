/**
 * PrestigeAura — progressive background effect that builds as the player
 * approaches the prestige threshold. Six hero-energy themes cycle with each
 * prestige. Renders to a dedicated canvas layer with mix-blend-mode:screen.
 *
 * States:
 *  idle    — canvas hidden, no draw
 *  forming — figure assembles progressively (driven by economy progress 0–1)
 *  ready   — fully assembled + enhanced pulse (economy >= cost)
 *  flash   — post-prestige burst (~2 seconds)
 *  fading  — alpha drains to zero, then returns to idle
 */
class PrestigeAura {
    static get THEMES() {
        return [
            { name: 'Núcleo de Ferro',    char: '🤖', c1: '#ff6600', c2: '#ffd700', c3: '#ff3300', render: 'arcReactor'      },
            { name: 'Rede de Aranha',     char: '🕸️', c1: '#cc0000', c2: '#4488ff', c3: '#ff5555', render: 'webNexus'        },
            { name: 'Martelo de Trovão',  char: '⚡',  c1: '#44aaff', c2: '#ffffaa', c3: '#ffffff', render: 'mjolnirStorm'    },
            { name: 'Titã de Gama',       char: '💚',  c1: '#00cc44', c2: '#aaff00', c3: '#00ff66', render: 'gammaTitan'      },
            { name: 'Escudo Estelar',     char: '🛡️', c1: '#4455ee', c2: '#cc1111', c3: '#ffffff', render: 'starShield'      },
            { name: 'Mandala Suprema',    char: '🌀',  c1: '#ff2200', c2: '#ffa500', c3: '#ffd700', render: 'sorcererMandala' },
        ];
    }

    constructor(canvas) {
        this._cv          = canvas;
        this._ctx         = canvas.getContext('2d');
        this._state       = 'idle';   // idle | forming | ready | flash | fading
        this._t           = 0;
        this._rawProgress = 0;        // 0–1: actual economy progress (totalNeurons / cost)
        this._progress    = 0;        // 0–1: eased visual progress passed to renderers
        this._alpha       = 0;
        this._themeIdx    = 0;
        this._flashTimer  = 0;

        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    // ── Public API ────────────────────────────────────────────────────────────

    get isActive() { return this._state !== 'idle'; }

    /**
     * Drive the progressive figure formation with economy progress.
     * rawProgress = economy.totalNeurons / economy.getPrestigeCost()  (clamped 0–1)
     * Figure starts appearing at 4%, fully formed at 100%.
     */
    setPrestigeProgress(rawProgress, prestigeCount) {
        this._themeIdx = prestigeCount % PrestigeAura.THEMES.length;
        if (this._state === 'flash') return; // never interrupt the burst

        const SHOW_AT = 0.04;

        if (rawProgress < SHOW_AT) {
            if (this._state !== 'idle') this._state = 'fading';
            this._rawProgress = rawProgress;
            return;
        }

        this._rawProgress = rawProgress;
        this._cv.style.display = '';

        if (rawProgress >= 1.0) {
            if (this._state !== 'ready') this._state = 'ready';
        } else {
            if (this._state !== 'forming') this._state = 'forming';
        }
    }

    /** @deprecated — backward compat; equivalent to setPrestigeProgress(1, count) */
    activate(prestigeCount) { this.setPrestigeProgress(1.0, prestigeCount); }

    /** @deprecated — backward compat */
    deactivate() {
        if (this._state === 'ready' || this._state === 'forming') this._state = 'fading';
    }

    /** Called immediately after a prestige fires — burst flash + theme swap */
    prestige(nextPrestigeCount) {
        this._themeIdx    = nextPrestigeCount % PrestigeAura.THEMES.length;
        this._state       = 'flash';
        this._flashTimer  = 0;
        this._rawProgress = 0;
        this._progress    = 1;
        this._cv.style.display = '';
    }

    /** Called each frame from GameManager._update() */
    update(dt) {
        if (this._state === 'idle') return;
        this._t += dt;

        switch (this._state) {
            case 'forming': {
                const raw    = this._rawProgress;
                const normP  = Math.max(0, (raw - 0.04) / 0.96);
                const target = Math.pow(normP, 0.5) * 0.46; // sqrt curve: 5%→0.047, 10%→0.115, 50%→0.319
                this._alpha += (target - this._alpha) * Math.min(1, dt * 2.8);
                this._progress = this._ease(raw);
                break;
            }
            case 'ready':
                this._alpha       = 0.53 + Math.sin(this._t * 2.2) * 0.08;
                this._progress    = 1.0;
                this._rawProgress = 1.0;
                break;
            case 'flash': {
                this._flashTimer += dt;
                const ft = this._flashTimer;
                if      (ft < 0.35) this._alpha = ft / 0.35;
                else if (ft < 1.1)  this._alpha = 1.0;
                else                this._alpha = Math.max(0, 1 - (ft - 1.1) / 0.9);
                if (ft > 2.0) {
                    this._state = 'idle'; this._alpha = 0;
                    this._progress = 0;  this._rawProgress = 0;
                    this._cv.style.display = 'none';
                    return;
                }
                break;
            }
            case 'fading':
                this._alpha -= dt * 0.75;
                if (this._alpha <= 0) {
                    this._state    = 'idle'; this._alpha    = 0;
                    this._progress = 0;      this._rawProgress = 0;
                    this._cv.style.display = 'none';
                    return;
                }
                break;
        }

        this._draw();
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    _resize() {
        this._cv.width  = window.innerWidth;
        this._cv.height = window.innerHeight;
    }

    /** Maps raw economy progress (0–1) to visual completion (0–1). Power curve so 10% progress → ~30% visible. */
    _ease(raw) { return Math.pow(Math.max(0, raw), 0.65); }

    /** Smooth 0→1 reveal as p crosses [threshold, threshold+span]. */
    _rev(p, threshold, span = 0.12) {
        if (p <= threshold) return 0;
        return Math.min(1, (p - threshold) / span);
    }

    _draw() {
        const cv  = this._cv;
        const ctx = this._ctx;
        const W   = cv.width, H = cv.height;
        const mx  = W / 2, my = H / 2;
        const isFlash    = this._state === 'flash';
        const flashScale = isFlash ? (1 + Math.min(this._flashTimer, 1.2) * 0.22) : 1;
        const R          = Math.min(W, H) * 0.40 * flashScale;
        const th         = PrestigeAura.THEMES[this._themeIdx];
        const isReady    = this._state === 'ready';

        ctx.clearRect(0, 0, W, H);
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, this._alpha));

        this[th.render](ctx, mx, my, R, this._t, this._progress, th, isReady);
        if (isReady) this._drawReadyOverlay(ctx, mx, my, R, this._t, th);

        ctx.restore();
    }

    /** Pulsing overlay — only rendered in the 'ready' state (prestige available). */
    _drawReadyOverlay(ctx, mx, my, R, t, th) {
        const pulse = 0.5 + Math.sin(t * 3.2) * 0.5;
        const W = ctx.canvas.width, H = ctx.canvas.height;

        // Outer scanning ring
        ctx.save();
        ctx.beginPath();
        ctx.arc(mx, my, R * 1.04, 0, Math.PI * 2);
        ctx.strokeStyle = th.c1 + Math.floor(pulse * 0x77).toString(16).padStart(2, '0');
        ctx.lineWidth   = 1.5 + pulse * 2;
        ctx.stroke();
        ctx.restore();

        // Inner bloom
        const bloom = ctx.createRadialGradient(mx, my, R * 0.1, mx, my, R * 0.6);
        bloom.addColorStop(0, th.c2 + Math.floor(pulse * 0x1a).toString(16).padStart(2, '0'));
        bloom.addColorStop(1, th.c1 + '00');
        ctx.save();
        ctx.fillStyle = bloom;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();

        // 3 rotating indicator ticks at the boundary
        ctx.save();
        ctx.translate(mx, my);
        for (let i = 0; i < 3; i++) {
            const a = t * 1.4 + (i / 3) * Math.PI * 2;
            ctx.save();
            ctx.rotate(a);
            ctx.beginPath();
            ctx.moveTo(R * 0.88, 0); ctx.lineTo(R * 1.08, 0);
            ctx.strokeStyle = th.c2 + 'cc'; ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
    }

    // ── Geometry helpers ──────────────────────────────────────────────────────

    _hexagon(ctx, x, y, r) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
            i === 0 ? ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a))
                    : ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
        }
        ctx.closePath();
    }

    _star(ctx, x, y, r1, r2, n) {
        ctx.beginPath();
        for (let i = 0; i < n * 2; i++) {
            const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
            const r = i % 2 === 0 ? r1 : r2;
            i === 0 ? ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a))
                    : ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
        }
        ctx.closePath();
    }

    _radialGlow(ctx, mx, my, R, color, a0, a1) {
        const g = ctx.createRadialGradient(mx, my, 0, mx, my, R);
        g.addColorStop(0, color + Math.floor(a0 * 255).toString(16).padStart(2, '0'));
        g.addColorStop(1, color + Math.floor(a1 * 255).toString(16).padStart(2, '0'));
        return g;
    }

    // ── Theme 0 — Arc Reactor (Iron Man) ─────────────────────────────────────
    // Progressive reveal: core → inner rings → beams → outer rings
    arcReactor(ctx, mx, my, R, t, p, th, isReady) {
        const rot = t * 0.35;
        const rev = (thr, sp = 0.12) => this._rev(p, thr, sp);

        // Ambient glow — scales with progress
        ctx.save();
        ctx.fillStyle = this._radialGlow(ctx, mx, my, R, th.c1, 0.07 + p * 0.12, 0.00);
        ctx.fillRect(0, 0, mx * 2, my * 2);
        ctx.restore();

        // Core circle — appears first
        const coreRev = rev(0.04, 0.10);
        if (coreRev > 0) {
            ctx.save(); ctx.globalAlpha *= coreRev;
            ctx.beginPath(); ctx.arc(mx, my, R * 0.10, 0, Math.PI * 2);
            const cg = ctx.createRadialGradient(mx, my, 0, mx, my, R * 0.10);
            cg.addColorStop(0, th.c2 + 'ff'); cg.addColorStop(0.5, th.c1 + 'cc'); cg.addColorStop(1, th.c1 + '00');
            ctx.fillStyle = cg; ctx.fill();
            ctx.restore();
        }

        // 6 hexagonal rings — inner first, outer last
        const ringThrs = [0.08, 0.18, 0.30, 0.44, 0.58, 0.72];
        for (let i = 0; i < 6; i++) {
            const rv = rev(ringThrs[i]);
            if (rv <= 0) continue;
            const r   = R * (i + 1) / 6;
            const dir = i % 2 === 0 ? 1 : -1;
            ctx.save();
            ctx.translate(mx, my); ctx.rotate(rot * dir + i * Math.PI / 6);
            ctx.globalAlpha *= rv * (0.35 + (6 - i) / 6 * 0.55);
            this._hexagon(ctx, 0, 0, r);
            ctx.strokeStyle = i < 3 ? th.c1 : th.c2;
            ctx.lineWidth   = 1.6 - i * 0.1;
            ctx.stroke();
            ctx.restore();
        }

        // 6 energy beams — staggered reveal
        const beamThrs = [0.12, 0.22, 0.32, 0.42, 0.52, 0.62];
        for (let i = 0; i < 6; i++) {
            const rv = rev(beamThrs[i]);
            if (rv <= 0) continue;
            const a  = (i / 6) * Math.PI * 2 + rot;
            const x1 = mx + Math.cos(a) * R * 0.13, y1 = my + Math.sin(a) * R * 0.13;
            const x2 = mx + Math.cos(a) * R * 0.92, y2 = my + Math.sin(a) * R * 0.92;
            const lg = ctx.createLinearGradient(x1, y1, x2, y2);
            const beamHex = Math.floor(rv * 0xcc).toString(16).padStart(2, '00');
            lg.addColorStop(0, th.c1 + beamHex); lg.addColorStop(1, th.c1 + '00');
            ctx.save(); ctx.globalAlpha *= rv;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
            ctx.strokeStyle = lg; ctx.lineWidth = 1.8; ctx.stroke();
            ctx.restore();
        }

        // Outer pulse ring — appears near completion
        const outerRev = rev(0.72, 0.18);
        if (outerRev > 0) {
            ctx.save(); ctx.globalAlpha *= outerRev;
            ctx.beginPath(); ctx.arc(mx, my, R, 0, Math.PI * 2);
            ctx.strokeStyle = th.c1 + '44'; ctx.lineWidth = 2; ctx.stroke();
            ctx.restore();
        }
    }

    // ── Theme 1 — Web Nexus (Spider-Man) ─────────────────────────────────────
    // Progressive reveal: central dot → inner spokes/rings → outer spokes/rings
    webNexus(ctx, mx, my, R, t, p, th, isReady) {
        const rot    = t * 0.10;
        const spokes = 12, rings = 7;
        const rev    = (thr, sp = 0.12) => this._rev(p, thr, sp);

        ctx.save();
        ctx.fillStyle = this._radialGlow(ctx, mx, my, R, th.c1, 0.05 + p * 0.09, 0.00);
        ctx.fillRect(0, 0, mx * 2, my * 2);
        ctx.restore();

        ctx.save(); ctx.translate(mx, my); ctx.rotate(rot);

        // Spokes — staggered by index
        for (let i = 0; i < spokes; i++) {
            const rv = rev(0.05 + (i / spokes) * 0.40, 0.10);
            if (rv <= 0) continue;
            const a  = (i / spokes) * Math.PI * 2;
            const x2 = Math.cos(a) * R, y2 = Math.sin(a) * R;
            const lg = ctx.createLinearGradient(0, 0, x2, y2);
            const hexA = Math.floor(rv * 0xbb).toString(16).padStart(2, '00');
            lg.addColorStop(0, th.c1 + hexA); lg.addColorStop(1, th.c1 + '00');
            ctx.save(); ctx.globalAlpha *= rv;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(x2, y2);
            ctx.strokeStyle = lg; ctx.lineWidth = 1.0; ctx.stroke();
            ctx.restore();
        }

        // Rings — inner to outer
        for (let ring = 1; ring <= rings; ring++) {
            const rv = rev((ring - 1) / rings * 0.65, 0.12);
            if (rv <= 0) continue;
            const r = R * ring / rings;
            ctx.save(); ctx.globalAlpha *= rv;
            ctx.beginPath();
            for (let i = 0; i <= spokes; i++) {
                const a = (i / spokes) * Math.PI * 2;
                const x = Math.cos(a) * r, y = Math.sin(a) * r;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.closePath();
            const alpha = Math.floor(20 + (rings - ring) / rings * 100).toString(16).padStart(2, '0');
            ctx.strokeStyle = th.c1 + alpha; ctx.lineWidth = 0.9; ctx.stroke();
            ctx.restore();
        }
        ctx.restore();

        // Central dot
        const dotRev = rev(0.04, 0.08);
        if (dotRev > 0) {
            ctx.save(); ctx.globalAlpha *= dotRev;
            ctx.beginPath(); ctx.arc(mx, my, R * 0.04, 0, Math.PI * 2);
            const cg = ctx.createRadialGradient(mx, my, 0, mx, my, R * 0.04);
            cg.addColorStop(0, th.c3 + 'ff'); cg.addColorStop(1, th.c1 + '00');
            ctx.fillStyle = cg; ctx.fill();
            ctx.restore();
        }
    }

    // ── Theme 2 — Mjolnir Storm (Thor) ───────────────────────────────────────
    // Progressive reveal: core → inner ring → bolts → outer rings
    mjolnirStorm(ctx, mx, my, R, t, p, th, isReady) {
        const rot = t * 0.22;
        const rev = (thr, sp = 0.12) => this._rev(p, thr, sp);

        ctx.save();
        ctx.fillStyle = this._radialGlow(ctx, mx, my, R, th.c1, 0.05 + p * 0.10, 0.00);
        ctx.fillRect(0, 0, mx * 2, my * 2);
        ctx.restore();

        // 3 concentric rings — inner first
        const ringThrs = [0.05, 0.25, 0.50];
        [1.0, 0.75, 0.50].forEach((frac, i) => {
            const rv = rev(ringThrs[i]);
            if (rv <= 0) return;
            ctx.save(); ctx.globalAlpha *= rv;
            ctx.beginPath(); ctx.arc(mx, my, R * frac, 0, Math.PI * 2);
            ctx.strokeStyle = th.c1 + ['66', '44', '22'][i];
            ctx.lineWidth   = 2.5 - i; ctx.stroke();
            ctx.restore();
        });

        // 8 lightning bolts — staggered
        for (let i = 0; i < 8; i++) {
            const rv = rev(0.10 + (i / 8) * 0.55, 0.10);
            if (rv <= 0) continue;
            const a   = (i / 8) * Math.PI * 2 + rot;
            const len = R;
            ctx.save();
            ctx.translate(mx, my); ctx.rotate(a); ctx.globalAlpha *= rv;
            ctx.beginPath(); ctx.moveTo(0, 0);
            for (let s = 1; s <= 6; s++) {
                const y = (s / 6) * len;
                const x = Math.sin(t * 5.5 + s * 2.3 + i * 1.1) * len * 0.065;
                ctx.lineTo(x, y);
            }
            const lg = ctx.createLinearGradient(0, 0, 0, len);
            lg.addColorStop(0, th.c2 + 'ee'); lg.addColorStop(0.6, th.c1 + '88'); lg.addColorStop(1, th.c1 + '00');
            ctx.strokeStyle = lg; ctx.lineWidth = 1.6; ctx.stroke();
            ctx.restore();
        }

        // Bright core
        const coreRev = rev(0.05, 0.10);
        if (coreRev > 0) {
            ctx.save(); ctx.globalAlpha *= coreRev;
            ctx.beginPath(); ctx.arc(mx, my, R * 0.09, 0, Math.PI * 2);
            const cg = ctx.createRadialGradient(mx, my, 0, mx, my, R * 0.09);
            cg.addColorStop(0, th.c3); cg.addColorStop(0.4, th.c1); cg.addColorStop(1, th.c1 + '00');
            ctx.fillStyle = cg; ctx.fill();
            ctx.restore();
        }
    }

    // ── Theme 3 — Gamma Titan (Hulk) ─────────────────────────────────────────
    // Progressive reveal: core → inner shockwaves + cracks → outer shockwaves
    gammaTitan(ctx, mx, my, R, t, p, th, isReady) {
        const rev = (thr, sp = 0.12) => this._rev(p, thr, sp);

        // Expanding shockwave rings — staggered
        for (let i = 0; i < 5; i++) {
            const rv = rev(i / 5 * 0.55, 0.15);
            if (rv <= 0) continue;
            const phase = ((t * 0.38 + i / 5) % 1) * p;
            const r     = R * phase;
            if (r < 2) continue;
            const hexA = Math.floor((1 - phase) * 0.65 * 255 * rv).toString(16).padStart(2, '00');
            ctx.save(); ctx.globalAlpha *= rv;
            ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2);
            ctx.strokeStyle = th.c1 + hexA;
            ctx.lineWidth   = (1 - phase) * 6 + 1; ctx.stroke();
            ctx.restore();
        }

        ctx.save();
        ctx.fillStyle = this._radialGlow(ctx, mx, my, R, th.c1, 0.04 + p * 0.07, 0.00);
        ctx.fillRect(0, 0, mx * 2, my * 2);
        ctx.restore();

        // Jagged energy cracks — staggered
        for (let i = 0; i < 6; i++) {
            const rv = rev(0.10 + (i / 6) * 0.50, 0.12);
            if (rv <= 0) continue;
            const a   = (i / 6) * Math.PI * 2 + t * 0.18;
            const len = R * (0.72 + Math.sin(t * 1.5 + i) * 0.14);
            ctx.save();
            ctx.translate(mx, my); ctx.rotate(a); ctx.globalAlpha *= rv;
            ctx.beginPath(); ctx.moveTo(0, 0);
            for (let s = 1; s <= 5; s++) {
                const y = (s / 5) * len;
                const x = Math.sin(t * 3.5 + s * 1.8 + i * 0.9) * len * 0.1;
                ctx.lineTo(x, y);
            }
            const lg = ctx.createLinearGradient(0, 0, 0, len);
            lg.addColorStop(0, th.c1 + 'cc'); lg.addColorStop(1, th.c2 + '00');
            ctx.strokeStyle = lg; ctx.lineWidth = 2.2; ctx.stroke();
            ctx.restore();
        }

        // Core mass
        const coreRev = rev(0.04, 0.10);
        if (coreRev > 0) {
            ctx.save(); ctx.globalAlpha *= coreRev;
            ctx.beginPath(); ctx.arc(mx, my, R * 0.12, 0, Math.PI * 2);
            const cg = ctx.createRadialGradient(mx, my, 0, mx, my, R * 0.12);
            cg.addColorStop(0, th.c3 + 'ff'); cg.addColorStop(0.55, th.c1 + 'bb'); cg.addColorStop(1, th.c1 + '00');
            ctx.fillStyle = cg; ctx.fill();
            ctx.restore();
        }
    }

    // ── Theme 4 — Star Shield (Captain America) ───────────────────────────────
    // Progressive reveal: star center → inner ring → mid rings → outer ring + arcs
    starShield(ctx, mx, my, R, t, p, th, isReady) {
        const rot = t * 0.20;
        const rev = (thr, sp = 0.12) => this._rev(p, thr, sp);

        ctx.save();
        ctx.fillStyle = this._radialGlow(ctx, mx, my, R, th.c1, 0.05 + p * 0.09, 0.00);
        ctx.fillRect(0, 0, mx * 2, my * 2);
        ctx.restore();

        // 4 rings — inner core first, outer last
        const ringDefs = [
            { frac: 0.26, col: th.c3, lw: 2.5, thr: 0.06 },
            { frac: 0.50, col: th.c1, lw: 4.0, thr: 0.22 },
            { frac: 0.74, col: th.c2, lw: 6.0, thr: 0.45 },
            { frac: 1.00, col: th.c1, lw: 3.5, thr: 0.72 },
        ];
        ringDefs.forEach(rd => {
            const rv = rev(rd.thr);
            if (rv <= 0) return;
            ctx.save(); ctx.globalAlpha *= rv;
            ctx.beginPath(); ctx.arc(mx, my, rd.frac * R, 0, Math.PI * 2);
            ctx.strokeStyle = rd.col + 'cc'; ctx.lineWidth = rd.lw; ctx.stroke();
            ctx.restore();
        });

        // Rotating detail arcs
        const arcRev = rev(0.55, 0.18);
        if (arcRev > 0) {
            ctx.save(); ctx.translate(mx, my); ctx.rotate(rot * 2); ctx.globalAlpha *= arcRev;
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                ctx.beginPath(); ctx.arc(0, 0, R, a + 0.14, a + Math.PI / 8 - 0.14);
                ctx.strokeStyle = th.c1 + '55'; ctx.lineWidth = 2.5; ctx.stroke();
            }
            ctx.restore();
        }

        // Central star
        const starRev = rev(0.06, 0.12);
        if (starRev > 0) {
            ctx.save(); ctx.translate(mx, my); ctx.rotate(rot); ctx.globalAlpha *= starRev;
            this._star(ctx, 0, 0, R * 0.12, R * 0.058, 5);
            ctx.fillStyle = th.c3 + 'ee'; ctx.fill();
            ctx.restore();
        }
    }

    // ── Theme 5 — Sorcerer Mandala (Doctor Strange) ───────────────────────────
    // Progressive reveal: eye center → inner mandala layer → outer layers
    sorcererMandala(ctx, mx, my, R, t, p, th, isReady) {
        const rev = (thr, sp = 0.12) => this._rev(p, thr, sp);

        ctx.save();
        ctx.fillStyle = this._radialGlow(ctx, mx, my, R, th.c1, 0.07 + p * 0.11, 0.00);
        ctx.fillRect(0, 0, mx * 2, my * 2);
        ctx.restore();

        const layers    = 4;
        const cols      = [th.c1, th.c2, th.c3, th.c2];
        const layerThrs = [0.06, 0.22, 0.42, 0.62];

        for (let layer = 0; layer < layers; layer++) {
            const rv = rev(layerThrs[layer]);
            if (rv <= 0) continue;

            const layerR = R * (layer + 1) / layers;
            const petals = 8 + layer * 4;
            const rotDir = layer % 2 === 0 ? t * 0.28 : -t * 0.28;
            const c      = cols[layer];

            ctx.save();
            ctx.translate(mx, my); ctx.rotate(rotDir + layer * (Math.PI / layers));
            ctx.globalAlpha *= rv;

            ctx.beginPath(); ctx.arc(0, 0, layerR, 0, Math.PI * 2);
            ctx.strokeStyle = c + '44'; ctx.lineWidth = 1; ctx.stroke();

            for (let i = 0; i < petals; i++) {
                const a  = (i / petals) * Math.PI * 2;
                const px = Math.cos(a) * layerR;
                const py = Math.sin(a) * layerR;
                const ps = layerR * 0.17;
                ctx.save();
                ctx.translate(px, py); ctx.rotate(a + Math.PI / 2);
                ctx.beginPath();
                ctx.ellipse(0, 0, ps * 0.28, ps * 0.62, 0, 0, Math.PI * 2);
                const alphaHex = Math.floor(40 + layer * 22).toString(16).padStart(2, '0');
                ctx.strokeStyle = c + alphaHex;
                ctx.fillStyle   = c + '12';
                ctx.lineWidth   = 0.8;
                ctx.fill(); ctx.stroke();
                ctx.restore();
            }
            ctx.restore();
        }

        // Inner eye
        const eyeRev = rev(0.04, 0.10);
        if (eyeRev > 0) {
            ctx.save(); ctx.globalAlpha *= eyeRev;
            ctx.beginPath(); ctx.arc(mx, my, R * 0.07, 0, Math.PI * 2);
            const cg = ctx.createRadialGradient(mx, my, 0, mx, my, R * 0.07);
            cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.35, th.c1); cg.addColorStop(1, th.c1 + '00');
            ctx.fillStyle = cg; ctx.fill();
            ctx.restore();
        }
    }
}
