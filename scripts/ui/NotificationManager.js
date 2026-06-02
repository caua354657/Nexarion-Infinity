class NotificationManager {
    constructor(events) {
        this._events = events;
        this._queue = [];
        this._container = null;
        this._logContainer = null;
        this._init();
        
        // Apenas notificações importantes (compras reais, prestige, boss, save)
        events.on('notification', d => this.show(d.msg, d.type || 'info'));
    }

    _init() {
        this._container = document.getElementById('notifications');
        if (!this._container) {
            this._container = document.createElement('div');
            this._container.id = 'notifications';
            document.body.appendChild(this._container);
        }
    }

    show(msg, type = 'info', icon = null) {
        // Floating notification
        const el = document.createElement('div');
        el.className = `notification notif-${type}`;

        const colorMap = {
            info: '#00f5ff', success: '#00ff88', warning: '#ff8800',
            error: '#ff0080', achievement: '#ffd700', levelup: '#7b2fff',
            mission: '#00ff88', event: '#ff8800', combo: '#ff0080', gold: '#ffd700'
        };
        const color = colorMap[type] || '#00f5ff';
        el.style.setProperty('--notif-color', color);

        el.innerHTML = `
            <div class="notif-bar"></div>
            <div class="notif-body">
                ${icon ? `<span class="notif-icon">${icon}</span>` : ''}
                <span class="notif-text">${msg}</span>
            </div>`;

        this._container.appendChild(el);
        requestAnimationFrame(() => el.classList.add('notif-in'));

        const timer = setTimeout(() => this._dismiss(el), Config.NOTIFICATION_DURATION || 3000);

        const bar = el.querySelector('.notif-bar');
        if (bar) {
            bar.style.transition = `width ${Config.NOTIFICATION_DURATION || 3000}ms linear`;
            requestAnimationFrame(() => { bar.style.width = '0%'; });
        }

        el.addEventListener('click', () => { clearTimeout(timer); this._dismiss(el); });

        while (this._container.children.length > (Config.NOTIFICATION_MAX || 5)) {
            this._dismiss(this._container.children[0]);
        }
        
        // Add to persistent log
        this._log(msg, color, icon);
    }
    
    _log(msg, color, icon) {
        if (!this._logContainer) {
            this._logContainer = document.getElementById('notif-log');
            if (!this._logContainer) return;
        }
        
        const d = new Date();
        const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        
        const logItem = document.createElement('div');
        logItem.className = 'notif-log-item';
        logItem.style.borderLeftColor = color;
        logItem.innerHTML = `
            <span class="notif-log-time">${time}</span>
            ${icon ? `<span class="notif-log-icon">${icon}</span>` : ''}
            <span class="notif-log-text">${msg}</span>
        `;
        
        this._logContainer.prepend(logItem);
        
        // Keep max 50 logs
        while (this._logContainer.children.length > 50) {
            this._logContainer.lastChild.remove();
        }
    }

    _dismiss(el) {
        if (!el.parentNode) return;
        el.classList.add('notif-out');
        el.addEventListener('transitionend', () => el.remove(), { once: true });
        setTimeout(() => el.remove(), 500);
    }
}
