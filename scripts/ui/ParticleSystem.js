class ParticleSystem {
    constructor(canvas) {
        this._canvas = canvas;
        this._ctx = canvas.getContext('2d');
        this._particles = [];
        this._floatTexts = [];
    }

    _getSkinColors() {
        const skin = document.body.dataset.skin || 'default';
        const T = {
            default:  { click: '#00f5ff', crit: '#ffd700' },
            christmas:{ click: '#dc143c', crit: '#ffd700' },
            halloween:{ click: '#ff6400', crit: '#ff00ff' },
            newyear:  { click: '#ffd700', crit: '#ffffc0' },
            cyberpunk:{ click: '#ff0080', crit: '#00f5ff' },
            pixelneon:{ click: '#00ff88', crit: '#ff00ff' },
        };
        return T[skin] || T.default;
    }

    spawnClick(x, y, value, isCrit = false) {
        const sc    = this._getSkinColors();
        const count = isCrit ? 20 : 8;
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
            const speed = (isCrit ? 4 : 2) + Math.random() * 3;
            this._particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2,
                life: 1,
                decay: 0.03 + Math.random() * 0.03,
                size: isCrit ? 4 + Math.random() * 4 : 2 + Math.random() * 3,
                color: isCrit ? sc.crit : sc.click,
                type: 'dot'
            });
        }
        this._floatTexts.push({
            x: x + (Math.random() - 0.5) * 40,
            y,
            vy: -2 - Math.random(),
            life: 1,
            text: '+' + formatNum(value),
            color: isCrit ? sc.crit : sc.click,
            size: isCrit ? 22 : 16,
            isCrit
        });
    }

    spawnBurst(x, y, color = '#7b2fff', count = 30) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 6;
            this._particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: 0.02 + Math.random() * 0.03,
                size: 3 + Math.random() * 5,
                color,
                type: 'dot'
            });
        }
    }

    spawnRing(x, y, color = '#00f5ff') {
        for (let i = 0; i < 24; i++) {
            const angle = (Math.PI * 2 * i) / 24;
            const speed = 6 + Math.random() * 4;
            this._particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: 0.025,
                size: 3,
                color,
                type: 'ring'
            });
        }
    }

    update() {
        // Swap-remove dead particles (O(1) removal vs O(n) splice)
        let i = this._particles.length;
        while (i--) {
            const p = this._particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.12;
            p.vx *= 0.97;
            p.life -= p.decay;
            if (p.life <= 0) {
                this._particles[i] = this._particles[this._particles.length - 1];
                this._particles.pop();
            }
        }
        i = this._floatTexts.length;
        while (i--) {
            const t = this._floatTexts[i];
            t.y += t.vy;
            t.vy *= 0.97;
            t.life -= 0.025;
            if (t.life <= 0) {
                this._floatTexts[i] = this._floatTexts[this._floatTexts.length - 1];
                this._floatTexts.pop();
            }
        }

        if (this._particles.length > Config.PARTICLE_MAX) {
            this._particles.length = Config.PARTICLE_MAX;
        }
    }

    draw() {
        const ctx = this._ctx;
        if (this._particles.length === 0 && this._floatTexts.length === 0) return;

        // One outer save/restore for the entire draw call instead of one per particle
        ctx.save();

        // Particles — all use the same shadowBlur so set it once
        if (this._particles.length > 0) {
            ctx.shadowBlur = 4;
            for (const p of this._particles) {
                ctx.globalAlpha = p.life;
                ctx.fillStyle   = p.color;
                ctx.shadowColor = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Float texts
        if (this._floatTexts.length > 0) {
            ctx.textAlign = 'center';
            for (const t of this._floatTexts) {
                ctx.globalAlpha = t.life;
                ctx.fillStyle   = t.color;
                ctx.shadowColor = t.color;
                ctx.shadowBlur  = t.isCrit ? 20 : 10;
                ctx.font        = `bold ${t.size}px 'Orbitron', monospace`;
                if (t.isCrit) {
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth   = 3;
                    ctx.strokeText(t.text, t.x, t.y);
                }
                ctx.fillText(t.text, t.x, t.y);
            }
        }

        ctx.restore();
    }
}
