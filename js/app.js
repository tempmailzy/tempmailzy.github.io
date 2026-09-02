/* =========================================================
   Mailzy — UI wiring, polling, state.
   In-memory only: the active mailbox is intentionally NOT
   persisted to localStorage/sessionStorage. A refreshed tab
   losing the address is expected behavior, not a bug.
   ========================================================= */
(function () {
  'use strict';

  const POLL_INTERVAL_MS = 7000;

  const els = {
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    errorMessage: document.getElementById('errorMessage'),
    retryBtn: document.getElementById('retryBtn'),
    ticketBody: document.getElementById('ticketBody'),
    addressField: document.getElementById('addressField'),
    copyBtn: document.getElementById('copyBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    newAddressBtn: document.getElementById('newAddressBtn'),
    inboxStatus: document.getElementById('inboxStatus'),
    messageList: document.getElementById('messageList'),
    messageOverlay: document.getElementById('messageOverlay'),
    messageFrom: document.getElementById('messageFrom'),
    messageSubject: document.getElementById('messageSubject'),
    messageBody: document.getElementById('messageBody'),
    closeMessageBtn: document.getElementById('closeMessageBtn'),
    copyBtnLabel: document.getElementById('copyBtnLabel'),
    unreadBadge: document.getElementById('unreadBadge'),
    expiryText: document.getElementById('expiryText'),
    expiryBarFill: document.getElementById('expiryBarFill'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    themeToggleIcon: document.getElementById('themeToggleIcon'),
    themeToggleLabel: document.getElementById('themeToggleLabel'),
    loadMoreBtn: document.getElementById('loadMoreBtn'),
    securityBadge: document.getElementById('securityBadge'),
    toastRegion: document.getElementById('toastRegion'),
  };

  /** @type {{token:string, account:object, address:string, messages:object[], loadedPages:number, totalItems:number|null}|null} */
  let session = null;
  let loadMoreInFlight = false;
  let pollTimer = null;
  let pollInFlight = false;
  let lastFocusedEl = null;
  let countdownTimer = null;

  function showLoading() {
    els.loadingState.hidden = false;
    els.errorState.hidden = true;
    els.ticketBody.hidden = true;
  }

  function showError(message) {
    els.loadingState.hidden = true;
    els.ticketBody.hidden = true;
    els.errorState.hidden = false;
    els.errorMessage.textContent = message || 'The mail service is temporarily unavailable.';
  }

  function showTicket() {
    els.loadingState.hidden = true;
    els.errorState.hidden = true;
    els.ticketBody.hidden = false;
  }

  function friendlyError(err) {
    if (err && err.name === 'MailTmError') {
      if (err.status === 429) return 'The mail service is temporarily rate-limiting requests. Please try again shortly.';
      if (typeof err.status === 'number' && err.status >= 500) return 'The mail service is experiencing an outage.';
      return err.message || 'The mail service is temporarily unavailable.';
    }
    return 'The mail service is temporarily unavailable.';
  }

  async function init() {
    stopPolling();
    showLoading();
    try {
      const { account, address, password } = await MailTm.createAccountWithRetry(3);
      const token = await MailTm.getToken(address, password);
      session = { token, account, address, messages: [], loadedPages: 0, totalItems: null };
      els.addressField.value = address;
      els.copyBtnLabel.textContent = 'Copy';
      els.inboxStatus.textContent = 'Waiting for incoming mail…';
      els.messageList.innerHTML = '';
      els.unreadBadge.hidden = true;
      els.loadMoreBtn.hidden = true;
      showTicket();
      startPolling({ immediate: true });
      startCountdown(account);
    } catch (err) {
      session = null;
      stopCountdown();
      showError(friendlyError(err));
    }
  }

  /** Ticks the retention indicator off mail.gw's own createdAt/
   *  retentionAt fields on the account — a real value, not a
   *  decorative countdown with nothing behind it. */
  function startCountdown(account) {
    stopCountdown();
    const created = new Date(account.createdAt).getTime();
    const expires = new Date(account.retentionAt).getTime();
    if (!Number.isFinite(created) || !Number.isFinite(expires) || expires <= created) {
      els.expiryText.textContent = 'unknown';
      els.expiryBarFill.style.width = '100%';
      return;
    }
    const total = expires - created;

    function tick() {
      const remaining = Math.max(0, expires - Date.now());
      const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
      els.expiryBarFill.style.width = `${pct}%`;
      els.expiryText.textContent = remaining > 0 ? formatDuration(remaining) : 'expired';
      if (remaining <= 0) stopCountdown();
    }

    tick();
    countdownTimer = setInterval(tick, 30000);
  }

  function stopCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function formatDuration(ms) {
    const mins = Math.floor(ms / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h left`;
    if (hours > 0) return `${hours}h ${mins % 60}m left`;
    return `${Math.max(1, mins)}m left`;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';

  /** Builds the chevron icon as a real SVG element (createElementNS,
   *  not innerHTML) so it renders crisply and consistently with the
   *  rest of the icon set, instead of a font-dependent "›" glyph. */
  function createChevronIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'm9 18 6-6-6-6');
    svg.appendChild(path);
    return svg;
  }

  /** Deterministic per-sender color so the same address always gets
   *  the same avatar tint across renders/polls. */
  function colorForSender(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 60%, 45%)`;
  }

  function formatRelativeTime(dateString) {
    const then = new Date(dateString).getTime();
    if (!dateString || Number.isNaN(then)) return '';
    const diffMs = Date.now() - then;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function startPolling({ immediate = false } = {}) {
    stopPolling();
    if (!session) return;
    if (immediate) pollInbox();
    pollTimer = setInterval(pollInbox, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  /** Polling only ever fetches page 1 (the newest mail) — this merges
   *  those results into the accumulated session.messages list rather
   *  than replacing it, so mail loaded via "Load more" isn't wiped
   *  out by the next poll tick. Returns the genuinely new messages
   *  (not just a count), since the toast below needs the sender. */
  function mergeMessages(fetched, { prepend }) {
    const existingIds = new Set(session.messages.map((m) => m.id));
    const fresh = fetched.filter((m) => !existingIds.has(m.id));
    session.messages = prepend ? [...fresh, ...session.messages] : [...session.messages, ...fresh];
    return fresh;
  }

  async function pollInbox() {
    if (!session || pollInFlight) return;
    pollInFlight = true;
    try {
      const { messages, totalItems } = await MailTm.listMessages(session.token, 1);
      session.totalItems = totalItems;
      if (session.loadedPages === 0) session.loadedPages = 1;
      const isFirstLoad = session.messages.length === 0;
      const freshMessages = mergeMessages(messages, { prepend: true });
      const newCount = freshMessages.length;
      renderMessageList();

      if (isFirstLoad) {
        els.inboxStatus.textContent =
          session.messages.length === 0
            ? 'Waiting for incoming mail…'
            : `${session.messages.length} message${session.messages.length === 1 ? '' : 's'}.`;
      } else if (newCount > 0) {
        els.inboxStatus.textContent = `${newCount} new message${newCount === 1 ? '' : 's'}.`;
        if (newCount === 1) {
          const sender = (freshMessages[0].from && (freshMessages[0].from.name || freshMessages[0].from.address)) || 'an unknown sender';
          showToast(`New mail from ${sender}`, 'mail');
        } else {
          showToast(`${newCount} new messages arrived`, 'mail');
        }
      } else {
        els.inboxStatus.textContent = `${session.messages.length} message${session.messages.length === 1 ? '' : 's'}.`;
      }
    } catch (err) {
      // A transient poll failure shouldn't blow away a working
      // ticket — just note it and let the next tick try again.
      els.inboxStatus.textContent = 'Unable to refresh the inbox — retrying shortly.';
    } finally {
      pollInFlight = false;
    }
  }

  /** Fetches the next page (real mail.gw pagination, driven by the
   *  API's own hydra:totalItems) and appends it below what's shown. */
  async function loadMoreMessages() {
    if (!session || loadMoreInFlight) return;
    loadMoreInFlight = true;
    els.loadMoreBtn.classList.add('is-loading');
    try {
      const nextPage = session.loadedPages + 1;
      const { messages, totalItems } = await MailTm.listMessages(session.token, nextPage);
      session.totalItems = totalItems;
      session.loadedPages = nextPage;
      mergeMessages(messages, { prepend: false });
      renderMessageList();
    } catch (err) {
      // Leave the button as-is so the user can just try again.
    } finally {
      loadMoreInFlight = false;
      els.loadMoreBtn.classList.remove('is-loading');
    }
  }

  function renderMessageList() {
    if (!session) return;
    const messages = session.messages;

    els.messageList.innerHTML = '';

    const unreadCount = messages.filter((m) => m.seen === false).length;
    els.unreadBadge.hidden = unreadCount === 0;
    els.unreadBadge.textContent = `${unreadCount} Unread`;

    const hasMore = typeof session.totalItems === 'number' && messages.length < session.totalItems;
    els.loadMoreBtn.hidden = !hasMore;

    if (messages.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'message-empty';
      empty.textContent = 'Nothing yet.';
      els.messageList.appendChild(empty);
    } else {
      messages.forEach((m) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'message-item' + (m.seen === false ? ' is-unread' : '');

        const senderLabel = (m.from && (m.from.name || m.from.address)) || 'Unknown sender';

        const avatar = document.createElement('span');
        avatar.className = 'message-item__avatar';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.textContent = senderLabel.charAt(0).toUpperCase();
        avatar.style.background = colorForSender(senderLabel);

        const main = document.createElement('span');
        main.className = 'message-item__main';

        const from = document.createElement('p');
        from.className = 'message-item__from';
        from.textContent = senderLabel;

        const subject = document.createElement('p');
        subject.className = 'message-item__subject';
        subject.textContent = m.subject || '(no subject)';

        const intro = document.createElement('p');
        intro.className = 'message-item__intro';
        intro.textContent = m.intro || '';

        main.appendChild(from);
        main.appendChild(subject);
        main.appendChild(intro);

        const time = document.createElement('span');
        time.className = 'message-item__time';
        time.textContent = formatRelativeTime(m.createdAt);

        const chevron = document.createElement('span');
        chevron.className = 'message-item__chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.appendChild(createChevronIcon());

        btn.appendChild(avatar);
        btn.appendChild(main);
        btn.appendChild(time);
        btn.appendChild(chevron);
        btn.addEventListener('click', () => openMessage(m.id));

        li.appendChild(btn);
        els.messageList.appendChild(li);
      });
    }
  }

  /** Renders as plain text only — never innerHTML. Anyone can
   *  send arbitrary HTML/JS to a temp address; this is a
   *  deliberate XSS guard and must not be relaxed. */
  async function openMessage(id) {
    if (!session) return;
    try {
      const full = await MailTm.getMessage(session.token, id);
      lastFocusedEl = document.activeElement;

      els.messageFrom.textContent = (full.from && (full.from.name ? `${full.from.name} <${full.from.address}>` : full.from.address)) || 'Unknown sender';
      els.messageSubject.textContent = full.subject || '(no subject)';

      let bodyText = '';
      if (typeof full.text === 'string' && full.text.trim()) {
        bodyText = full.text;
      } else if (typeof full.html === 'string' && full.html.trim()) {
        bodyText = htmlToPlainText(full.html);
      } else if (Array.isArray(full.html) && full.html.length) {
        bodyText = htmlToPlainText(full.html.join('\n'));
      } else {
        bodyText = '(no readable content)';
      }
      els.messageBody.textContent = bodyText;

      els.messageOverlay.hidden = false;
      els.closeMessageBtn.focus();
      document.addEventListener('keydown', onOverlayKeydown);
    } catch (err) {
      els.inboxStatus.textContent = 'Unable to open that message. Please try again.';
    }
  }

  /** Parses HTML off-DOM and reads only .textContent — the
   *  markup is never inserted into the live document. */
  function htmlToPlainText(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body && doc.body.textContent ? doc.body.textContent : '').trim();
  }

  function closeMessage() {
    els.messageOverlay.hidden = true;
    document.removeEventListener('keydown', onOverlayKeydown);
    if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') {
      lastFocusedEl.focus();
    }
  }

  function onOverlayKeydown(e) {
    if (e.key === 'Escape') closeMessage();
  }

  // Fixed, author-written markup only (never user/message data) — safe
  // to set via innerHTML, consistent with the no-innerHTML-for-mail-
  // content rule being specifically about untrusted data, not this.
  const TOAST_ICONS = {
    check:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>',
    mail:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m3 7 9 6 9-6" /></svg>',
    refresh:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>',
  };

  /** Shows a small dismissible toast — copy confirmation, a new
   *  address being issued, or new mail arriving. Auto-dismisses;
   *  clicking it dismisses early. Respects reduced motion by
   *  skipping the enter/exit animation, not by skipping the toast. */
  function showToast(message, iconKey) {
    if (!els.toastRegion) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');

    if (iconKey && TOAST_ICONS[iconKey]) {
      const icon = document.createElement('span');
      icon.className = 'toast__icon';
      icon.innerHTML = TOAST_ICONS[iconKey];
      toast.appendChild(icon);
    }

    const msg = document.createElement('span');
    msg.className = 'toast__message';
    msg.textContent = message;
    toast.appendChild(msg);

    const dismiss = () => {
      clearTimeout(timer);
      if (prefersReducedMotion()) {
        toast.remove();
        return;
      }
      toast.classList.add('is-leaving');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    };

    toast.addEventListener('click', dismiss);
    els.toastRegion.appendChild(toast);
    const timer = setTimeout(dismiss, 4000);
  }

  async function copyAddress() {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.address);
      els.copyBtnLabel.textContent = 'Copied';
      stampCopyConfirmation(els.copyBtn);
      showToast('Address copied to clipboard', 'check');
      setTimeout(() => {
        els.copyBtnLabel.textContent = 'Copy';
      }, 1500);
    } catch {
      els.addressField.select();
    }
  }

  async function newAddress() {
    stopPolling();
    stopCountdown();
    const old = session;
    session = null;
    if (old) {
      // Best-effort — burning the old mailbox isn't guaranteed,
      // it's disposable regardless of whether this succeeds.
      MailTm.deleteAccount(old.token, old.account.id);
    }
    await init();
    if (session) showToast('New address issued', 'refresh');
  }

  function onVisibilityChange() {
    if (!els.ticketBody || els.ticketBody.hidden || !session) return;
    if (document.hidden) {
      stopPolling();
    } else {
      startPolling({ immediate: true });
    }
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Restarts the .is-copied CSS animation even on repeat clicks, by
   *  forcing a reflow between removing and re-adding the class. */
  function stampCopyConfirmation(btn) {
    if (prefersReducedMotion()) return;
    btn.classList.remove('is-copied');
    void btn.offsetWidth;
    btn.classList.add('is-copied');
    setTimeout(() => btn.classList.remove('is-copied'), 500);
  }

  /** A small ink-ripple stamped from the click point on any button —
   *  purely decorative, skipped outright under reduced motion. A
   *  keyboard-triggered click reports (0,0), so it's centered instead
   *  of jumping to the corner. */
  function addClickRipple(target, clientX, clientY) {
    if (prefersReducedMotion()) return;
    const rect = target.getBoundingClientRect();
    const isKeyboardActivation = clientX === 0 && clientY === 0;
    const originX = isKeyboardActivation ? rect.left + rect.width / 2 : clientX;
    const originY = isKeyboardActivation ? rect.top + rect.height / 2 : clientY;
    const size = Math.max(rect.width, rect.height) * 1.4;
    const ripple = document.createElement('span');
    ripple.className = 'btn__ripple';
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${originX - rect.left - size / 2}px`;
    ripple.style.top = `${originY - rect.top - size / 2}px`;
    ripple.addEventListener('animationend', () => ripple.remove());
    target.appendChild(ripple);
  }

  /** Theme is UI-only state, unrelated to the mailbox-session rule
   *  above — persisting it in localStorage is fine. The inline
   *  script in index.html already set the initial data-theme
   *  attribute before first paint; this just keeps the toggle in
   *  sync with it and handles clicks. */
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // Private browsing / storage disabled — theme just won't persist.
    }
    els.themeToggleIcon.textContent = theme === 'light' ? '☀️' : '🌙';
    els.themeToggleLabel.textContent = theme === 'light' ? 'Light Mode' : 'Dark Mode';
    els.themeToggleBtn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
  }

  function toggleTheme() {
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    applyTheme(current === 'light' ? 'dark' : 'light');
  }

  els.themeToggleBtn.addEventListener('click', toggleTheme);
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

  /** Spins the refresh icon while a manual refresh is in flight — a
   *  small confirmation that the click did something, skipped under
   *  reduced motion. */
  function spinRefreshIcon() {
    if (prefersReducedMotion()) return;
    const icon = els.refreshBtn.querySelector('.icon-refresh');
    if (!icon) return;
    icon.classList.remove('is-spinning');
    void icon.offsetWidth;
    icon.classList.add('is-spinning');
  }

  /** The badge claims transport security only ("HTTPS Encrypted") —
   *  it must never be shown in a way that implies the mail itself is
   *  private, which the address-hint text explicitly says it isn't.
   *  So it only appears when the page is genuinely served over
   *  HTTPS, reflecting reality rather than a fixed claim. */
  function initSecurityBadge() {
    if (!els.securityBadge) return;
    els.securityBadge.hidden = window.location.protocol !== 'https:';
  }

  initSecurityBadge();

  els.retryBtn.addEventListener('click', init);
  els.refreshBtn.addEventListener('click', () => {
    spinRefreshIcon();
    pollInbox();
  });
  els.newAddressBtn.addEventListener('click', newAddress);
  els.copyBtn.addEventListener('click', copyAddress);
  els.closeMessageBtn.addEventListener('click', closeMessage);
  els.loadMoreBtn.addEventListener('click', loadMoreMessages);
  els.messageOverlay.addEventListener('click', (e) => {
    if (e.target === els.messageOverlay) closeMessage();
  });
  document.addEventListener('visibilitychange', onVisibilityChange);
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn && !btn.disabled) addClickRipple(btn, e.clientX, e.clientY);
  });

  init();
})();
