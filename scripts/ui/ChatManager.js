'use strict';

const ChatManager = (function () {

    // ── Config ──────────────────────────────────────────────────────────────
    const API            = 'api/chat.php';
    const POLL_OPEN_MS   = 3000;
    const POLL_CLOSED_MS = 16000;
    const CLIENT_CD_MS   = 3200;
    const MAX_LEN        = 200;
    const MAX_DOM_MSGS   = 150;
    const MARKS_KEY      = 'chat_marked_v1';

    // ── Emoji categories ────────────────────────────────────────────────────
    const EMOJI_CATS = [
        { label: '😊', name: 'Feliz',
          list: ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','😉','😍','🥰','😘','😋','😛','😜','😎','🤩','🥳','😏','😗'] },
        { label: '😢', name: 'Triste',
          list: ['😔','😟','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','😈','💀','☠️'] },
        { label: '🤔', name: 'Neutro',
          list: ['🤔','🤭','🤫','😶','😐','😑','😬','🙄','😯','😦','😮','😲','🥱','😴','😵','🤯','🤤','😪'] },
        { label: '👍', name: 'Gestos',
          list: ['👍','👎','👌','✌️','🤞','🤙','👈','👉','👆','👇','☝️','👏','🙌','🤝','🙏','💪','🫶','✊','👊'] },
        { label: '🎮', name: 'Jogo',
          list: ['🎮','🕹️','🎲','🎯','🔥','⚡','💥','✨','🌟','💫','🎉','🏆','🥇','👑','💎','🚀','⚔️','🛡️','🧠','👾','💣'] },
        { label: '❤️', name: 'Amor',
          list: ['❤️','🧡','💛','💚','💙','💜','🖤','💔','💕','💞','💓','💗','💖','💘','💝','🤍','🤎'] },
    ];

    // ── State ───────────────────────────────────────────────────────────────
    let isOpen     = false;
    let lastId     = 0;
    let unreadCount = 0;
    let cooldownEnd = 0;
    let isSending  = false;
    let emojiOpen  = false;
    let activeTab  = 0;
    let pollTimer  = null;
    let cdRaf      = null;
    let dom        = {};
    let markedIds  = new Set();  // IDs of starred messages (localStorage)

    // ── Game accessors ──────────────────────────────────────────────────────
    const gm           = () => window.game || null;
    const currentUserId = () => gm()?.account?.getAccount()?.id ?? null;
    const currentLevel  = () => gm()?.level?.level ?? 1;
    const isLoggedIn    = () => gm()?.account?.isLoggedIn?.() ?? false;

    // ── Utilities ───────────────────────────────────────────────────────────
    function esc(s) {
        return String(s)
            .replace(/&/g,'&amp;')
            .replace(/</g,'&lt;')
            .replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;');
    }

    function formatMsgTime(ts) {
        const date = new Date(Number(ts) * 1000);
        const now  = new Date();
        const hm   = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const isSameDay = date.toDateString() === now.toDateString();
        if (isSameDay) return hm;
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) return `ontem ${hm}`;
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm} ${hm}`;
    }

    function photoUrl(foto) {
        return foto && !/[/\\]/.test(foto) ? `foto/${foto}` : null;
    }

    function avatarHtml(foto, username, vip) {
        const url    = photoUrl(foto);
        const letter = (username || '?')[0].toUpperCase();
        const vipCls = vip ? ' chat-av-letter--vip' : '';
        if (url) {
            return `<img class="chat-av-img" src="${esc(url)}" alt=""
                data-fb="${esc(letter)}" data-vip="${vip ? 1 : 0}">`;
        }
        return `<div class="chat-av-letter${vipCls}">${esc(letter)}</div>`;
    }

    function msgHtml(msg) {
        const myId   = currentUserId();
        const isMe   = myId !== null && String(msg.user_id) === String(myId);
        const vip    = Number(msg.vip) === 1;
        const marked = markedIds.has(Number(msg.id));
        const badge  = vip ? '<span class="chat-vip">VIP</span>' : '';
        const nameCls = 'chat-name' + (vip ? ' chat-name--vip' : '');
        const markedCls  = marked ? ' chat-msg--marked' : '';
        const replyIcon  = marked ? '↩' : '↩';
        const replyMark  = marked ? ' chat-mark-btn--active' : '';

        return `<div class="chat-msg${isMe ? ' chat-msg--me' : ''}${markedCls}"
                     data-id="${msg.id}" data-uid="${msg.user_id}">
            <div class="chat-av-wrap" data-uid="${msg.user_id}">
                ${avatarHtml(msg.foto, msg.username, vip)}
            </div>
            <div class="chat-bubble">
                <div class="chat-meta">
                    <span class="${nameCls}" data-uid="${msg.user_id}">${esc(msg.username)}</span>
                    ${badge}
                    <span class="chat-level">Nv.${Number(msg.nivel)}</span>
                    <span class="chat-time">${formatMsgTime(msg.ts)}</span>
                </div>
                <div class="chat-text">${esc(msg.mensagem)}</div>
            </div>
            <div class="chat-msg-actions">
                <button class="chat-mark-btn${replyMark}" data-id="${msg.id}" title="Marcar para responder">${replyIcon}</button>
            </div>
        </div>`;
    }

    // ── Marked messages persistence ─────────────────────────────────────────
    function loadMarks() {
        try {
            const raw = localStorage.getItem(MARKS_KEY);
            markedIds = raw ? new Set(JSON.parse(raw)) : new Set();
        } catch (_) { markedIds = new Set(); }
    }

    function saveMarks() {
        try { localStorage.setItem(MARKS_KEY, JSON.stringify([...markedIds])); }
        catch (_) {}
    }

    function toggleMark(id) {
        const numId = Number(id);
        if (markedIds.has(numId)) {
            markedIds.delete(numId);
        } else {
            markedIds.add(numId);
        }
        saveMarks();

        // Update DOM element in place
        const el = dom.msgs.querySelector(`.chat-msg[data-id="${id}"]`);
        if (el) {
            const isNowMarked = markedIds.has(numId);
            el.classList.toggle('chat-msg--marked', isNowMarked);
            const btn = el.querySelector('.chat-mark-btn');
            if (btn) {
                btn.textContent = '↩';
                btn.classList.toggle('chat-mark-btn--active', isNowMarked);
            }
        }
    }

    // ── Build DOM ───────────────────────────────────────────────────────────
    function buildHtml() {
        const tabs = EMOJI_CATS.map((c, i) =>
            `<button class="chat-etab${i === 0 ? ' chat-etab--active' : ''}"
                     data-cat="${i}" title="${c.name}">${c.label}</button>`
        ).join('');

        const grids = EMOJI_CATS.map((c, i) => {
            const emojis = c.list.map(e =>
                `<button class="chat-emoji" data-emoji="${e}">${e}</button>`
            ).join('');
            return `<div class="chat-egrid${i === 0 ? '' : ' chat-egrid--hidden'}"
                         data-cat="${i}">${emojis}</div>`;
        }).join('');

        return `
        <div id="chat-widget" class="chat-widget">
            <div class="chat-backdrop" id="chat-backdrop"></div>
            <button id="chat-toggle" class="chat-toggle" title="Chat Global" aria-label="Chat Global">
                <span>💬</span>
                <span id="chat-badge" class="chat-badge" hidden>0</span>
            </button>
            <div id="chat-panel" class="chat-panel" role="dialog" aria-label="Chat Global">
                <div class="chat-head">
                    <div class="chat-head-left">
                        <span class="chat-head-title">💬 Chat Global</span>
                        <span id="chat-online" class="chat-online">● 0 online</span>
                    </div>
                    <button id="chat-close" class="chat-head-close" title="Fechar" aria-label="Fechar chat">✕</button>
                </div>
                <div id="chat-msgs" class="chat-msgs">
                    <div class="chat-state-msg">Carregando...</div>
                </div>
                <div id="chat-picker" class="chat-picker" hidden>
                    <div class="chat-etabs">${tabs}</div>
                    <div class="chat-egrids">${grids}</div>
                </div>
                <div id="chat-login-hint" class="chat-login-hint" hidden>
                    <a id="chat-login-link">Faça login</a> para enviar mensagens
                </div>
                <div class="chat-footer">
                    <button id="chat-emoji-btn" class="chat-emoji-btn" title="Emojis" aria-label="Emojis">😊</button>
                    <input id="chat-input" class="chat-input" type="text"
                           maxlength="${MAX_LEN}" placeholder="Mensagem..."
                           autocomplete="off" autocorrect="off" spellcheck="false">
                    <button id="chat-send" class="chat-send" title="Enviar" aria-label="Enviar" disabled>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M2 21L23 12 2 3v7l15 2-15 2z"/>
                        </svg>
                    </button>
                </div>
                <div id="chat-popup" class="chat-popup" hidden></div>
                <div id="chat-toast" class="chat-toast"></div>
            </div>
        </div>`;
    }

    // ── Init ────────────────────────────────────────────────────────────────
    function init() {
        loadMarks();
        document.body.insertAdjacentHTML('beforeend', buildHtml());

        dom = {
            backdrop: document.getElementById('chat-backdrop'),
            widget:   document.getElementById('chat-widget'),
            toggle:   document.getElementById('chat-toggle'),
            panel:    document.getElementById('chat-panel'),
            close:    document.getElementById('chat-close'),
            msgs:     document.getElementById('chat-msgs'),
            picker:   document.getElementById('chat-picker'),
            input:    document.getElementById('chat-input'),
            send:     document.getElementById('chat-send'),
            emojiBtn: document.getElementById('chat-emoji-btn'),
            badge:    document.getElementById('chat-badge'),
            online:   document.getElementById('chat-online'),
            popup:    document.getElementById('chat-popup'),
            toast:    document.getElementById('chat-toast'),
            hint:     document.getElementById('chat-login-hint'),
            hintLink: document.getElementById('chat-login-link'),
        };

        // ── Bindings ──────────────────────────────────────────────────
        dom.toggle.addEventListener('click', togglePanel);
        dom.close.addEventListener('click', closePanel);

        dom.send.addEventListener('click', sendMessage);
        dom.input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            if (e.key === 'Escape') hideEmojiPicker();
        });
        dom.input.addEventListener('input', updateSendState);

        dom.emojiBtn.addEventListener('click', e => {
            e.stopPropagation(); toggleEmojiPicker();
        });
        dom.picker.addEventListener('click', e => {
            const emoji = e.target.closest('.chat-emoji');
            if (emoji) { insertEmoji(emoji.dataset.emoji); return; }
            const tab = e.target.closest('.chat-etab');
            if (tab) switchEmojiTab(Number(tab.dataset.cat));
        });

        // Avatar/name → profile popup; star button → mark
        dom.msgs.addEventListener('click', e => {
            const markBtn = e.target.closest('.chat-mark-btn');
            if (markBtn) { e.stopPropagation(); toggleMark(markBtn.dataset.id); return; }
            const uid = e.target.closest('[data-uid]');
            if (uid) showProfile(Number(uid.dataset.uid), uid);
        });

        // Fix broken avatars in messages
        dom.msgs.addEventListener('error', e => {
            const img = e.target;
            if (!img.classList.contains('chat-av-img')) return;
            const div = document.createElement('div');
            div.className = 'chat-av-letter' + (img.dataset.vip === '1' ? ' chat-av-letter--vip' : '');
            div.textContent = img.dataset.fb || '?';
            img.replaceWith(div);
        }, true);

        // Dismiss emoji picker / popup on outside click
        document.addEventListener('click', e => {
            if (emojiOpen && !dom.picker.contains(e.target) && e.target !== dom.emojiBtn) {
                hideEmojiPicker();
            }
            if (!dom.popup.hidden &&
                !dom.popup.contains(e.target) &&
                !e.target.closest('[data-uid]') &&
                !e.target.closest('.chat-mark-btn')) {
                dom.popup.hidden = true;
            }
        });

        // Login hint link → open auth overlay
        dom.hintLink.addEventListener('click', () => {
            const authEl = document.getElementById('auth-overlay');
            if (authEl) { authEl.style.display = 'flex'; authEl.classList.add('open'); }
            closePanel();
        });

        // Pause/resume polling with tab visibility
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stopPoll();
            else if (isOpen) startFastPoll();
            else startSlowPoll();
        });

        // ── Hide chat when auth overlay is visible ────────────────────
        observeAuthOverlay();

        updateLoginState();
        startSlowPoll();
    }

    // ── Auth overlay observation ────────────────────────────────────────────
    function observeAuthOverlay() {
        const authEl = document.getElementById('auth-overlay');
        if (!authEl) return;

        function syncVisibility() {
            const authOpen = authEl.classList.contains('open') ||
                             authEl.style.display === 'flex';
            dom.widget.style.display = authOpen ? 'none' : '';
            if (authOpen && isOpen) closePanel();
        }

        syncVisibility(); // initial check

        const obs = new MutationObserver(syncVisibility);
        obs.observe(authEl, { attributes: true, attributeFilter: ['class', 'style'] });
    }

    // ── Login state ─────────────────────────────────────────────────────────
    function updateLoginState() {
        const logged = isLoggedIn();
        dom.hint.hidden  = logged;
        dom.input.hidden = !logged;
        dom.emojiBtn.hidden = !logged;
        dom.send.hidden  = !logged;
        if (logged) updateSendState();
    }

    // ── Panel open / close ──────────────────────────────────────────────────
    function togglePanel() { isOpen ? closePanel() : openPanel(); }

    function openPanel() {
        isOpen = true;
        dom.panel.classList.add('chat-panel--open');
        dom.backdrop.classList.add('chat-backdrop--open');
        dom.toggle.classList.add('chat-toggle--open');
        clearUnread();
        hideEmojiPicker();
        updateLoginState();
        stopPoll();
        if (lastId === 0) loadHistory();
        else scrollToBottom();
        startFastPoll();
    }

    function closePanel() {
        isOpen = false;
        dom.panel.classList.remove('chat-panel--open');
        dom.backdrop.classList.remove('chat-backdrop--open');
        dom.toggle.classList.remove('chat-toggle--open');
        hideEmojiPicker();
        dom.popup.hidden = true;
        stopPoll();
        startSlowPoll();
    }

    // ── Polling ─────────────────────────────────────────────────────────────
    function startFastPoll() {
        if (document.hidden) return;
        pollTimer = setInterval(poll, POLL_OPEN_MS);
    }

    function startSlowPoll() {
        if (document.hidden) return;
        pollTimer = setTimeout(function tick() {
            if (isOpen) return;
            poll().finally(() => {
                if (!isOpen) pollTimer = setTimeout(tick, POLL_CLOSED_MS);
            });
        }, POLL_CLOSED_MS);
    }

    function stopPoll() {
        clearInterval(pollTimer);
        clearTimeout(pollTimer);
        pollTimer = null;
    }

    async function loadHistory() {
        dom.msgs.innerHTML = '<div class="chat-state-msg">Carregando...</div>';
        try {
            const r = await fetch(`${API}?action=history`);
            const d = await r.json();
            if (!d.ok) { dom.msgs.innerHTML = '<div class="chat-state-msg">Erro ao carregar.</div>'; return; }
            dom.msgs.innerHTML = '';
            if (!d.messages.length) {
                dom.msgs.innerHTML = '<div class="chat-state-msg">Nenhuma mensagem ainda. Seja o primeiro!</div>';
            } else {
                appendMessages(d.messages, false);
            }
            updateOnline(d.online ?? 0);
            scrollToBottom();
        } catch (_) {
            dom.msgs.innerHTML = '<div class="chat-state-msg">Sem conexão.</div>';
        }
    }

    async function poll() {
        try {
            const r = await fetch(`${API}?action=history&since=${lastId}`);
            const d = await r.json();
            if (!d.ok || !d.messages.length) { if (d.online !== undefined) updateOnline(d.online); return; }
            const atBottom = isAtBottom();
            const st = dom.msgs.querySelector('.chat-state-msg');
            if (st) st.remove();
            appendMessages(d.messages, true);
            if (isOpen && atBottom) scrollToBottom();
            if (!isOpen) addUnread(d.messages.length);
            updateOnline(d.online ?? 0);
        } catch (_) {}
    }

    function isAtBottom() {
        return dom.msgs.scrollHeight - dom.msgs.scrollTop - dom.msgs.clientHeight < 60;
    }
    function scrollToBottom() { dom.msgs.scrollTop = dom.msgs.scrollHeight; }

    function appendMessages(msgs, animate) {
        const frag = document.createDocumentFragment();
        for (const m of msgs) {
            const wrap = document.createElement('div');
            wrap.innerHTML = msgHtml(m);
            const el = wrap.firstElementChild;
            if (animate) el.classList.add('chat-msg--new');
            frag.appendChild(el);
            lastId = Math.max(lastId, Number(m.id));
        }
        dom.msgs.appendChild(frag);
        // Keep DOM lean
        const all = dom.msgs.querySelectorAll('.chat-msg');
        if (all.length > MAX_DOM_MSGS) {
            for (let i = 0; i < all.length - MAX_DOM_MSGS; i++) all[i].remove();
        }
    }

    function updateOnline(n) {
        dom.online.textContent = `● ${n} online`;
        dom.online.style.color = n > 0 ? 'var(--green,#00ff88)' : '';
    }

    // ── Unread ──────────────────────────────────────────────────────────────
    function addUnread(n) {
        unreadCount += n;
        dom.badge.hidden = false;
        dom.badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    }
    function clearUnread() {
        unreadCount = 0;
        dom.badge.hidden = true;
    }

    // ── Send ────────────────────────────────────────────────────────────────
    async function sendMessage() {
        if (!isLoggedIn()) { showToast('Faça login para enviar mensagens.'); return; }
        const text = dom.input.value.trim();
        if (!text || isSending) return;
        if (Date.now() < cooldownEnd) { shakeInput(); return; }

        isSending = true;
        dom.send.disabled = true;
        dom.input.disabled = true;

        try {
            const fd = new FormData();
            fd.append('msg', text);
            fd.append('nivel', String(currentLevel()));

            const r = await fetch(`${API}?action=send`, { method: 'POST', body: fd });
            const d = await r.json();

            if (d.ok) {
                dom.input.value = '';
                const st = dom.msgs.querySelector('.chat-state-msg');
                if (st) st.remove();
                appendMessages([d.message], true);
                scrollToBottom();
                cooldownEnd = Date.now() + CLIENT_CD_MS;
                startCooldownUi();
            } else {
                if (d.cooldown) cooldownEnd = Date.now() + d.cooldown * 1000;
                shakeInput(d.msg);
            }
        } catch (_) {
            shakeInput('Erro de conexão.');
        } finally {
            isSending = false;
            dom.input.disabled = false;
            if (Date.now() >= cooldownEnd) dom.send.disabled = dom.input.value.trim().length === 0;
            dom.input.focus();
        }
    }

    function updateSendState() {
        dom.send.disabled = !dom.input.value.trim() || isSending || Date.now() < cooldownEnd;
    }

    function startCooldownUi() {
        dom.input.classList.add('chat-input--cooldown');
        dom.send.disabled = true;
        cancelAnimationFrame(cdRaf);
        function tick() {
            if (Date.now() >= cooldownEnd) {
                dom.input.classList.remove('chat-input--cooldown');
                dom.send.disabled = dom.input.value.trim().length === 0;
                return;
            }
            cdRaf = requestAnimationFrame(tick);
        }
        cdRaf = requestAnimationFrame(tick);
    }

    function shakeInput(msg) {
        dom.input.classList.remove('chat-input--shake');
        void dom.input.offsetWidth;
        dom.input.classList.add('chat-input--shake');
        if (msg) showToast(msg);
    }

    function showToast(msg) {
        dom.toast.textContent = msg;
        dom.toast.classList.add('chat-toast--show');
        clearTimeout(dom.toast._t);
        dom.toast._t = setTimeout(() => dom.toast.classList.remove('chat-toast--show'), 2800);
    }

    // ── Emoji picker ────────────────────────────────────────────────────────
    function toggleEmojiPicker() { emojiOpen ? hideEmojiPicker() : showEmojiPicker(); }
    function showEmojiPicker() {
        emojiOpen = true;
        dom.picker.hidden = false;
        dom.emojiBtn.classList.add('chat-emoji-btn--active');
        requestAnimationFrame(() => dom.picker.classList.add('chat-picker--open'));
    }
    function hideEmojiPicker() {
        emojiOpen = false;
        dom.picker.classList.remove('chat-picker--open');
        dom.emojiBtn.classList.remove('chat-emoji-btn--active');
        setTimeout(() => { if (!emojiOpen) dom.picker.hidden = true; }, 220);
    }
    function switchEmojiTab(idx) {
        activeTab = idx;
        dom.picker.querySelectorAll('.chat-etab').forEach((t, i) =>
            t.classList.toggle('chat-etab--active', i === idx));
        dom.picker.querySelectorAll('.chat-egrid').forEach((g, i) =>
            g.classList.toggle('chat-egrid--hidden', i !== idx));
    }
    function insertEmoji(emoji) {
        const el = dom.input;
        const s  = el.selectionStart ?? el.value.length;
        const e  = el.selectionEnd   ?? el.value.length;
        el.value = el.value.slice(0, s) + emoji + el.value.slice(e);
        el.selectionStart = el.selectionEnd = s + emoji.length;
        el.focus();
        updateSendState();
    }

    // ── Profile popup ────────────────────────────────────────────────────────
    async function showProfile(userId, anchor) {
        if (!userId) return;
        dom.popup.innerHTML = '<div class="chat-popup-loading">···</div>';
        dom.popup.hidden = false;
        positionPopup(anchor);

        try {
            const r = await fetch(`${API}?action=perfil&user_id=${userId}`);
            const d = await r.json();
            if (!d.ok) { dom.popup.hidden = true; return; }

            const vip    = Boolean(d.vip);
            const url    = photoUrl(d.foto);
            const letter = (d.username || '?')[0].toUpperCase();
            const avHtml = url
                ? `<img class="chat-popup-av" src="${esc(url)}" alt="">`
                : `<div class="chat-popup-av chat-popup-av--letter${vip ? ' chat-popup-av--vip' : ''}">${esc(letter)}</div>`;
            const since  = d.since
                ? new Date(d.since).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
                : '';

            dom.popup.innerHTML = `
                <div class="chat-popup-inner">
                    ${avHtml}
                    <div>
                        <div class="chat-popup-name${vip ? ' chat-popup-name--vip' : ''}">${esc(d.username)}</div>
                        <div class="chat-popup-meta">
                            Nv.${d.nivel}${vip ? ' · <span class="chat-vip">VIP</span>' : ''}
                        </div>
                        ${since ? `<div class="chat-popup-since">Membro desde ${since}</div>` : ''}
                    </div>
                </div>`;

            const avImg = dom.popup.querySelector('img.chat-popup-av');
            if (avImg) {
                avImg.addEventListener('error', () => {
                    const div = document.createElement('div');
                    div.className = 'chat-popup-av chat-popup-av--letter' + (vip ? ' chat-popup-av--vip' : '');
                    div.textContent = letter;
                    avImg.replaceWith(div);
                });
            }
            positionPopup(anchor);
        } catch (_) {
            dom.popup.hidden = true;
        }
    }

    function positionPopup(anchor) {
        const ar = anchor.getBoundingClientRect();
        const vh = window.innerHeight;
        if (ar.top > vh / 2) {
            // anchor in bottom half → show popup above it
            dom.popup.style.top    = 'auto';
            dom.popup.style.bottom = (vh - ar.top + 8) + 'px';
        } else {
            // anchor in top half → show popup below it
            dom.popup.style.top    = (ar.bottom + 8) + 'px';
            dom.popup.style.bottom = 'auto';
        }
    }

    // ── Public ───────────────────────────────────────────────────────────────
    return { init, open: openPanel, close: closePanel };

})();

// ChatManager.init() is called by index.html after window.game is ready.
