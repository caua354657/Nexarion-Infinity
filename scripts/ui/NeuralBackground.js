class NeuralBackground {
    constructor(canvas) {
        this._canvas = canvas;
        this._ctx = canvas.getContext('2d');
        this._nodes = [];
        this._snow  = [];
        this._fog   = [];
        this._sparks = [];
        this._scan  = false;
        this._grid  = false;
        this._t     = 0;
        this._cachedSkin  = null;
        this._cachedTheme = null;
        this._resizeTimer = null;

        // Gradient cache — recreated only on resize or skin change
        this._grad = null;
        this._gradW = 0;
        this._gradH = 0;
        this._gradTheme = null;

        // Draw connections every 2 frames to halve GPU cost
        this._connFrame = 0;
        // Pre-allocated buffer for pulse values — avoids per-frame GC
        this._pulseBuf = null;

        this._resize();
        window.addEventListener('resize', () => this._onWindowResize());
        this._init();
    }

    reinit() { this._cachedSkin = null; this._grad = null; this._init(); }

    _onWindowResize() {
        clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => this._resize(), 250);
    }

    _resize() {
        this._canvas.width  = window.innerWidth;
        this._canvas.height = window.innerHeight;
        this._grad = null; // invalidate gradient cache
        this._init();
    }

    _getSkin()  { return document.body.dataset.skin || 'default'; }

    _getTheme() {
        const skin = this._getSkin();
        if (skin === this._cachedSkin) return this._cachedTheme;
        this._cachedSkin = skin;
        const T = {
            default:  { fill:'#050510', col1:'#00f5ff', col2:'#7b2fff', mix:'#aa44ff', edge:'rgba(5,5,16,0.6)',    center:'rgba(10,5,40,0.0)'  },
            christmas:{ fill:'#030b05', col1:'#dc143c', col2:'#228b22', mix:'#8b4000', edge:'rgba(3,10,4,0.72)',   center:'rgba(15,3,3,0.0)'   },
            halloween:{ fill:'#050008', col1:'#ff6400', col2:'#9b30ff', mix:'#cc3080', edge:'rgba(5,0,10,0.75)',   center:'rgba(10,0,18,0.0)'  },
            newyear:  { fill:'#030308', col1:'#ffd700', col2:'#a0a0a0', mix:'#d8a020', edge:'rgba(3,3,10,0.65)',   center:'rgba(8,8,5,0.0)'    },
            cyberpunk:{ fill:'#020010', col1:'#ff0080', col2:'#00f5ff', mix:'#8800cc', edge:'rgba(2,0,16,0.75)',   center:'rgba(5,0,22,0.0)'   },
            pixelneon:{ fill:'#020008', col1:'#00ff88', col2:'#ff00ff', mix:'#8800ff', edge:'rgba(2,0,8,0.70)',    center:'rgba(4,0,12,0.0)'   },
        };
        this._cachedTheme = T[skin] || T.default;
        this._grad = null; // invalidate gradient cache on skin change
        return this._cachedTheme;
    }

    _init() {
        const theme = this._getTheme();
        this._nodes = [];
        const count = Config.NEURAL_NODES;
        for (let i = 0; i < count; i++) {
            this._nodes.push({
                x: Math.random() * this._canvas.width,
                y: Math.random() * this._canvas.height,
                vx: (Math.random() - 0.5) * 0.12,
                vy: (Math.random() - 0.5) * 0.12,
                r: 1.5 + Math.random() * 2.5,
                pulse: Math.random() * Math.PI * 2,
                pulseSpeed: 0.007 + Math.random() * 0.010,
                isCol1: Math.random() < 0.7,
            });
        }
        // Pre-allocate pulse buffer for the connection loop
        this._pulseBuf = new Float32Array(count);
        this._initEffects();
    }

    _initEffects() {
        const skin = this._getSkin();
        this._snow   = [];
        this._fog    = [];
        this._sparks = [];
        this._scan   = false;
        this._grid   = false;

        if (skin === 'christmas') {
            for (let i = 0; i < 50; i++) this._snow.push(this._newSnow(true));
        } else if (skin === 'halloween') {
            for (let i = 0; i < 5; i++) this._fog.push(this._newFog());
        } else if (skin === 'cyberpunk') {
            this._scan = true;
        } else if (skin === 'pixelneon') {
            this._grid = true;
        }
    }

    /* ── Effect factories ── */
    _newSnow(randomY = false) {
        return {
            x: Math.random() * this._canvas.width,
            y: randomY ? Math.random() * this._canvas.height : -6,
            vy: 0.10 + Math.random() * 0.22,
            vx: (Math.random() - 0.5) * 0.15,
            r:  0.5 + Math.random() * 1.8,
            alpha: 0.3 + Math.random() * 0.5,
            wobble: Math.random() * Math.PI * 2,
            wobbleSpeed: 0.004 + Math.random() * 0.007,
        };
    }

    _newFog() {
        const W = this._canvas.width, H = this._canvas.height;
        const cols = ['rgba(155,48,255,', 'rgba(255,100,0,'];
        return {
            x: Math.random() * W,
            y: Math.random() * H,
            r: 160 + Math.random() * 200,
            alpha: 0.02 + Math.random() * 0.025,
            vx: (Math.random() - 0.5) * 0.06,
            vy: (Math.random() - 0.5) * 0.04,
            pulse: Math.random() * Math.PI * 2,
            col: cols[Math.floor(Math.random() * cols.length)],
        };
    }

    _newSpark() {
        const W = this._canvas.width, H = this._canvas.height;
        return {
            x: 0.2 * W + Math.random() * W * 0.6,
            y: H + 5,
            vx: (Math.random() - 0.5) * 0.7,
            vy: -(0.7 + Math.random() * 1.2),
            life: 1,
            decay: 0.014 + Math.random() * 0.016,
            r:  0.5 + Math.random() * 1.2,
            col: Math.random() < 0.65 ? 'rgba(255,215,0,' : 'rgba(255,248,192,',
        };
    }

    /* ── Update ── */
    update() {
        // Skip all updates when tab is not visible
        if (document.visibilityState === 'hidden') return;

        this._t += 0.005;
        // Wrap _t to prevent floating-point drift after long sessions
        if (this._t > 6283.18) this._t -= 6283.18; // 2000π

        // Snow
        for (let i = 0; i < this._snow.length; i++) {
            const s = this._snow[i];
            s.wobble += s.wobbleSpeed;
            s.y += s.vy;
            s.x += s.vx + Math.sin(s.wobble) * 0.15;
            if (s.y > this._canvas.height + 6) this._snow[i] = this._newSnow(false);
        }

        // Fog
        for (const f of this._fog) {
            f.x += f.vx; f.y += f.vy; f.pulse += 0.006;
            const W = this._canvas.width, H = this._canvas.height;
            if (f.x < -f.r) f.x = W + f.r; else if (f.x > W + f.r) f.x = -f.r;
            if (f.y < -f.r) f.y = H + f.r; else if (f.y > H + f.r) f.y = -f.r;
        }

        // New Year sparks — capped at 40
        if (this._cachedSkin === 'newyear') {
            if (this._sparks.length < 40 && Math.random() < 0.025) {
                this._sparks.push(this._newSpark());
            }
            for (let i = this._sparks.length - 1; i >= 0; i--) {
                const s = this._sparks[i];
                s.x += s.vx; s.y += s.vy;
                s.vy *= 0.995;
                s.life -= s.decay;
                if (s.life <= 0) this._sparks.splice(i, 1);
            }
        }

        // Neural nodes — velocity clamped to prevent drift over long sessions
        const MAX_V = 0.15;
        for (let i = 0; i < this._nodes.length; i++) {
            const n = this._nodes[i];
            n.x += n.vx; n.y += n.vy;
            n.pulse += n.pulseSpeed;
            // Wrap pulse to avoid float precision loss
            if (n.pulse > 6.2832) n.pulse -= 6.2832;
            if (n.x < 0)                    { n.vx = Math.abs(n.vx);  n.x = 0; }
            else if (n.x > this._canvas.width)  { n.vx = -Math.abs(n.vx); n.x = this._canvas.width; }
            if (n.y < 0)                    { n.vy = Math.abs(n.vy);  n.y = 0; }
            else if (n.y > this._canvas.height) { n.vy = -Math.abs(n.vy); n.y = this._canvas.height; }
            // Hard clamp velocity — prevents any stacking effect
            if (n.vx >  MAX_V) n.vx =  MAX_V;
            if (n.vx < -MAX_V) n.vx = -MAX_V;
            if (n.vy >  MAX_V) n.vy =  MAX_V;
            if (n.vy < -MAX_V) n.vy = -MAX_V;
        }
    }

    /* ── Draw ── */
    draw() {
        // Skip rendering entirely when tab is not visible
        if (document.visibilityState === 'hidden') return;

        const ctx = this._ctx;
        const W = this._canvas.width, H = this._canvas.height;
        const theme = this._getTheme();

        // Base fill
        ctx.fillStyle = theme.fill;
        ctx.fillRect(0, 0, W, H);

        // Pixel grid (Pixel Neon)
        if (this._grid) this._drawGrid(ctx, W, H);

        // Radial vignette — cached, only rebuilt on resize or skin change
        if (!this._grad || this._gradW !== W || this._gradH !== H || this._gradTheme !== theme) {
            this._grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
            this._grad.addColorStop(0, theme.center);
            this._grad.addColorStop(1, theme.edge);
            this._gradW = W; this._gradH = H; this._gradTheme = theme;
        }
        ctx.fillStyle = this._grad;
        ctx.fillRect(0, 0, W, H);

        // Halloween fog
        if (this._fog.length > 0) {
            ctx.save();
            for (const f of this._fog) {
                const pulse = 0.82 + Math.sin(f.pulse) * 0.18;
                const rr = f.r * pulse;
                const fg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rr);
                fg.addColorStop(0, f.col + f.alpha + ')');
                fg.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = fg;
                ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }

        // Node connections — drawn every 2nd frame, no random() inside loop
        this._connFrame ^= 1;
        if (this._connFrame === 0) {
            ctx.save();
            ctx.lineWidth = 0.5;
            // Reuse pre-allocated buffer — no GC allocation per frame
            const pulses = this._pulseBuf;
            for (let i = 0; i < this._nodes.length; i++) pulses[i] = Math.sin(this._nodes[i].pulse);

            for (let i = 0; i < this._nodes.length; i++) {
                for (let j = i + 1; j < this._nodes.length; j++) {
                    const a = this._nodes[i], b = this._nodes[j];
                    const dx = a.x - b.x, dy = a.y - b.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq < 19600) { // 140² = 19600 (reduced from 180²)
                        const alpha = (1 - Math.sqrt(distSq) / 140) * 0.22;
                        ctx.strokeStyle = a.isCol1 === b.isCol1
                            ? (a.isCol1 ? theme.col1 : theme.col2)
                            : theme.mix;
                        ctx.globalAlpha = alpha + (pulses[i] + pulses[j]) * 0.04;
                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(b.x, b.y);
                        ctx.stroke();
                    }
                }
            }
            ctx.restore();
        }

        // Neural nodes — batched by color to minimize shadowColor state changes
        ctx.save();
        ctx.shadowBlur = 4;
        // Batch col1 nodes first
        ctx.shadowColor = theme.col1;
        ctx.fillStyle   = theme.col1;
        for (const n of this._nodes) {
            if (!n.isCol1) continue;
            const pulse = Math.sin(n.pulse);
            ctx.globalAlpha = 0.55 + pulse * 0.25;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r + pulse * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }
        // Batch col2 nodes
        ctx.shadowColor = theme.col2;
        ctx.fillStyle   = theme.col2;
        for (const n of this._nodes) {
            if (n.isCol1) continue;
            const pulse = Math.sin(n.pulse);
            ctx.globalAlpha = 0.55 + pulse * 0.25;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r + pulse * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // Christmas snow
        if (this._snow.length > 0) {
            ctx.save();
            ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#ccffe8'; ctx.shadowBlur = 3;
            for (const s of this._snow) {
                ctx.globalAlpha = s.alpha;
                ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }

        // New Year sparks
        if (this._sparks.length > 0) {
            ctx.save();
            ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 4;
            for (const s of this._sparks) {
                ctx.globalAlpha = s.life;
                ctx.fillStyle   = s.col + s.life + ')';
                ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }

        // Cyberpunk scanlines
        if (this._scan) this._drawScanlines(ctx, W, H);
    }

    /* ── Effect renderers ── */
    _drawScanlines(ctx, W, H) {
        ctx.save();
        ctx.globalAlpha = 0.035;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        for (let y = 0; y < H; y += 4) ctx.rect(0, y, W, 2);
        ctx.fill();
        const sweepY = ((this._t * 18) % (H + 80)) - 40;
        ctx.globalAlpha = 0.05;
        ctx.fillStyle = '#ff0080';
        ctx.fillRect(0, sweepY, W, 2);
        ctx.restore();
    }

    _drawGrid(ctx, W, H) {
        const size = 28;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,0,255,0.04)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let x = 0; x < W; x += size) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
        for (let y = 0; y < H; y += size) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
        ctx.stroke();
        // Pulsing dots — reduced density
        const phase = this._t;
        ctx.fillStyle = '#00ff88'; ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 3;
        for (let gx = 0; gx < W; gx += size * 4) {
            for (let gy = 0; gy < H; gy += size * 4) {
                ctx.globalAlpha = ((Math.sin(phase + gx * 0.1 + gy * 0.1) + 1) * 0.5) * 0.22;
                ctx.beginPath(); ctx.arc(gx, gy, 1.2, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.restore();
    }
}
