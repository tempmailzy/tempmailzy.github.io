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
    expiryText: document.getElementById('expiryText'),
    expiryBarFill: document.getElementById('expiryBarFill'),
    loadMoreBtn: document.getElementById('loadMoreBtn'),
    securityBadge: document.getElementById('securityBadge'),
    toastRegion: document.getElementById('toastRegion'),
    sidebarUnreadCount: document.getElementById('sidebarUnreadCount'),
    sidebarGenerateBtn: document.getElementById('sidebarGenerateBtn'),
    messageSearchInput: document.getElementById('messageSearchInput'),
    customizeAddressBtn: document.getElementById('customizeAddressBtn'),
    customizeForm: document.getElementById('customizeForm'),
    customLocalPartInput: document.getElementById('customLocalPartInput'),
    customizeSubmitLabel: document.getElementById('customizeSubmitLabel'),
    cancelCustomizeBtn: document.getElementById('cancelCustomizeBtn'),
    customizeError: document.getElementById('customizeError'),
    qrBtn: document.getElementById('qrBtn'),
    qrOverlay: document.getElementById('qrOverlay'),
    qrCodeContainer: document.getElementById('qrCodeContainer'),
    qrAddressText: document.getElementById('qrAddressText'),
    closeQrBtn: document.getElementById('closeQrBtn'),
    messageAttachments: document.getElementById('messageAttachments'),
    notifyToggleBtn: document.getElementById('notifyToggleBtn'),
  };

  /** @type {{provider:'mailgw'|'guerrilla', token?:string, account?:object, sidToken?:string, createdAt?:number, address:string, messages:object[], loadedPages:number, totalItems:number|null}|null}
   *  mail.gw is the priority provider. If it's unreachable after its
   *  own retries, Mailzy falls back to Guerrilla Mail — quietly, with
   *  no on-screen indication either way. */
  let session = null;
  let loadMoreInFlight = false;
  let pollTimer = null;
  let pollInFlight = false;
  let lastFocusedEl = null;
  let countdownTimer = null;
  let customizeInFlight = false;
  let notificationsEnabled = false;

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
      if (err.status === 429) return 'The mail service is temporarily rate-limiting requests, and the backup service is unavailable too. Please try again shortly.';
      if (typeof err.status === 'number' && err.status >= 500) return 'The mail service is experiencing an outage, and the backup service is unavailable too.';
      return (err.message || 'The mail service is temporarily unavailable') + ', and the backup service is unavailable too.';
    }
    return 'The mail service is temporarily unavailable, and the backup service is unavailable too.';
  }

  /** Attempts the priority provider, mail.gw. Throws on failure —
   *  caller decides whether to fall back. `desiredLocalPart`, when
   *  given, is passed straight through to MailTm — see its own retry
   *  semantics for what happens on a name collision. */
  async function attemptMailGw(desiredLocalPart) {
    const { account, address, password } = await MailTm.createAccountWithRetry(3, desiredLocalPart);
    const token = await MailTm.getToken(address, password);
    return { provider: 'mailgw', token, account, address, messages: [], loadedPages: 0, totalItems: null };
  }

  /** Attempts the backup provider, Guerrilla Mail. Only ever called
   *  after mail.gw itself has failed — see init(). */
  async function attemptGuerrilla() {
    const { sidToken, address, createdAt } = await GuerrillaMail.createAddress();
    return { provider: 'guerrilla', sidToken, address, createdAt, messages: [], loadedPages: 0, totalItems: null };
  }

  /** mail.gw stays the priority provider; the fallback to Guerrilla
   *  Mail (see attemptGuerrilla()) happens without any on-screen
   *  indication — no banner, no toast. Which provider issued the
   *  current address is still tracked internally (session.provider)
   *  since polling/reading/deleting a message differ by provider,
   *  it's just never surfaced in the UI. */
  async function init() {
    stopPolling();
    showLoading();
    let newSession;
    try {
      newSession = await attemptMailGw();
    } catch (primaryErr) {
      try {
        newSession = await attemptGuerrilla();
      } catch (backupErr) {
        session = null;
        stopCountdown();
        showError(friendlyError(primaryErr));
        return;
      }
    }
    activateSession(newSession, null);
    showTicket();
  }

  /** Swaps in a freshly created session and resets everything that's
   *  scoped to "the current mailbox" — address field, message list,
   *  polling, countdown. Shared by init() and submitCustomAddress()
   *  so both activate a session the same way. Best-effort deletes
   *  `old`, if given, exactly like newAddress() already did inline. */
  function activateSession(newSession, old) {
    session = newSession;
    els.addressField.value = session.address;
    els.copyBtnLabel.textContent = 'Copy';
    els.inboxStatus.textContent = 'Waiting for incoming mail…';
    els.messageList.innerHTML = '';
    if (els.sidebarUnreadCount) els.sidebarUnreadCount.textContent = '0';
    if (els.messageSearchInput) els.messageSearchInput.value = '';
    els.loadMoreBtn.hidden = true;
    startPolling({ immediate: true });
    startCountdown();
    if (old) {
      if (old.provider === 'mailgw') {
        MailTm.deleteAccount(old.token, old.account.id);
      } else {
        GuerrillaMail.forgetMe(old.sidToken, old.address);
      }
    }
  }

  function openCustomizeForm() {
    els.customizeForm.hidden = false;
    els.customizeAddressBtn.setAttribute('aria-expanded', 'true');
    els.customizeError.hidden = true;
    els.customLocalPartInput.value = '';
    els.customLocalPartInput.focus();
  }

  function closeCustomizeForm() {
    els.customizeForm.hidden = true;
    els.customizeAddressBtn.setAttribute('aria-expanded', 'false');
    els.customizeError.hidden = true;
  }

  /** Tries to swap the current mailbox for one at a name the user
   *  chose. On a collision or invalid name, shows the error inline
   *  in the customize form and leaves the existing session untouched
   *  — this deliberately never falls back to Guerrilla Mail or to a
   *  random name, since that would silently give the user a
   *  different address than the one they asked for. */
  async function submitCustomAddress(rawLocalPart) {
    if (customizeInFlight || !session) return;
    customizeInFlight = true;
    els.customizeError.hidden = true;
    els.customizeSubmitLabel.textContent = 'Creating…';
    const old = session;
    try {
      const newSession = await attemptMailGw(rawLocalPart);
      stopPolling();
      stopCountdown();
      activateSession(newSession, old);
      closeCustomizeForm();
      showToast('Custom address issued', 'refresh');
    } catch (err) {
      els.customizeError.textContent = (err && err.message) || 'Could not create that address. Please try again.';
      els.customizeError.hidden = false;
    } finally {
      customizeInFlight = false;
      els.customizeSubmitLabel.textContent = 'Use this name';
    }
  }

  /** Ticks the retention indicator. mail.gw reports real createdAt/
   *  retentionAt timestamps on the account; Guerrilla Mail's API
   *  doesn't return an expiry, so that branch uses its documented
   *  fixed 1-hour retention instead (GuerrillaMail.RETENTION_MS) —
   *  disclosed as such, not presented as a live value it isn't. */
  function startCountdown() {
    stopCountdown();
    let created, expires;
    if (session.provider === 'mailgw') {
      created = new Date(session.account.createdAt).getTime();
      expires = new Date(session.account.retentionAt).getTime();
    } else {
      created = session.createdAt;
      expires = created + GuerrillaMail.RETENTION_MS;
    }
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
      const { messages, totalItems } =
        session.provider === 'mailgw'
          ? await MailTm.listMessages(session.token, 1)
          : await GuerrillaMail.listMessages(session.sidToken);
      session.totalItems = totalItems;
      if (session.loadedPages === 0) session.loadedPages = 1;
      const isFirstLoad = session.messages.length === 0;
      const freshMessages = mergeMessages(messages, { prepend: true });
      const newCount = freshMessages.length;
      renderMessageList(isFirstLoad ? null : freshMessages.map((m) => m.id));

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
        notifyNewMail(freshMessages);
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
    // Guerrilla Mail's check_email call always returns the full
    // current list in one shot — there's no separate "next page" to
    // fetch, so Load More only ever applies to mail.gw.
    if (!session || loadMoreInFlight || session.provider !== 'mailgw') return;
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

  /** Empty-inbox icon, matching the reference design's envelope
   *  glyph — built as a real SVG element, not innerHTML. */
  function createEnvelopeIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '26');
    svg.setAttribute('height', '26');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', '3');
    rect.setAttribute('y', '5');
    rect.setAttribute('width', '18');
    rect.setAttribute('height', '14');
    rect.setAttribute('rx', '3');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'm3 7 9 6 9-6');
    svg.appendChild(rect);
    svg.appendChild(path);
    return svg;
  }

  function currentSearchTerm() {
    return els.messageSearchInput ? els.messageSearchInput.value.trim().toLowerCase() : '';
  }

  function matchesSearch(m, term) {
    if (!term) return true;
    const senderLabel = (m.from && (m.from.name || m.from.address)) || '';
    return (
      senderLabel.toLowerCase().includes(term) ||
      (m.subject || '').toLowerCase().includes(term) ||
      (m.intro || '').toLowerCase().includes(term)
    );
  }

  function renderMessageList(freshIds) {
    if (!session) return;
    const allMessages = session.messages;
    const term = currentSearchTerm();
    const messages = allMessages.filter((m) => matchesSearch(m, term));

    els.messageList.innerHTML = '';

    const unreadCount = allMessages.filter((m) => m.seen === false).length;
    if (els.sidebarUnreadCount) els.sidebarUnreadCount.textContent = String(unreadCount);

    const hasMore = typeof session.totalItems === 'number' && allMessages.length < session.totalItems;
    els.loadMoreBtn.hidden = !hasMore || Boolean(term);

    if (messages.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'message-empty';
      const icon = document.createElement('span');
      icon.className = 'message-empty__icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.appendChild(createEnvelopeIcon());
      const title = document.createElement('p');
      title.className = 'message-empty__title';
      const sub = document.createElement('p');
      sub.className = 'message-empty__sub';
      if (term) {
        title.textContent = 'No matching emails';
        sub.textContent = `Nothing in this inbox matches "${term}".`;
      } else {
        title.textContent = 'No emails yet';
        sub.textContent = 'Your inbox is empty. Emails will appear here once received.';
      }
      empty.appendChild(icon);
      empty.appendChild(title);
      empty.appendChild(sub);
      els.messageList.appendChild(empty);
    } else {
      messages.forEach((m) => {
        const li = document.createElement('li');
        const isFresh = Array.isArray(freshIds) && freshIds.includes(m.id);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'message-item' + (m.seen === false ? ' is-unread' : '') + (isFresh ? ' message-item--enter' : '');

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
      const full =
        session.provider === 'mailgw'
          ? await MailTm.getMessage(session.token, id)
          : await GuerrillaMail.getMessage(session.sidToken, id);
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
      renderAttachments(full.attachments);

      els.messageOverlay.hidden = false;
      els.closeMessageBtn.focus();
      document.addEventListener('keydown', onOverlayKeydown);
    } catch (err) {
      els.inboxStatus.textContent = 'Unable to open that message. Please try again.';
    }
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return `${i > 0 && n < 10 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
  }

  function createAttachmentIcon() {
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
    path.setAttribute(
      'd',
      'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48'
    );
    svg.appendChild(path);
    return svg;
  }

  /** Renders each attachment as filename + size + a Download button —
   *  metadata and a byte fetch only, never anything that touches
   *  innerHTML with message-derived content. Guerrilla Mail messages
   *  have no attachments field at all, so this is a no-op for them. */
  function renderAttachments(attachments) {
    els.messageAttachments.innerHTML = '';
    const list = Array.isArray(attachments) ? attachments.filter((a) => a && a.filename) : [];
    if (list.length === 0) return;

    const heading = document.createElement('p');
    heading.className = 'message-detail__attachments-heading';
    heading.textContent = `${list.length} attachment${list.length === 1 ? '' : 's'}`;
    els.messageAttachments.appendChild(heading);

    list.forEach((att) => {
      const row = document.createElement('div');
      row.className = 'attachment-row';

      const icon = document.createElement('span');
      icon.className = 'attachment-row__icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.appendChild(createAttachmentIcon());

      const name = document.createElement('span');
      name.className = 'attachment-row__name';
      name.textContent = att.filename;

      const size = document.createElement('span');
      size.className = 'attachment-row__size';
      size.textContent = formatBytes(att.size);

      const dlBtn = document.createElement('button');
      dlBtn.type = 'button';
      dlBtn.className = 'btn btn--outline btn--pill attachment-row__download';
      dlBtn.textContent = 'Download';
      dlBtn.addEventListener('click', () => downloadOneAttachment(att, dlBtn));

      row.appendChild(icon);
      row.appendChild(name);
      row.appendChild(size);
      row.appendChild(dlBtn);
      els.messageAttachments.appendChild(row);
    });
  }

  /** Fetches the attachment as a Blob (authenticated, mail.gw only —
   *  Guerrilla Mail messages never reach here since they have no
   *  attachments array) and saves it via a throwaway object URL. */
  async function downloadOneAttachment(att, btn) {
    if (!session || session.provider !== 'mailgw') return;
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Downloading…';
    try {
      const blob = await MailTm.downloadAttachment(session.token, att.downloadUrl);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.filename || 'attachment';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      showToast('Could not download that attachment', 'refresh');
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
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

  /** Renders a QR code for the current address entirely client-side
   *  via the bundled qrcodejs library — the address is never sent
   *  anywhere to produce this image. Fixed black-on-white regardless
   *  of theme, since that's what keeps it reliably scannable. */
  function openQrModal() {
    if (!session) return;
    if (typeof QRCode === 'undefined') {
      showToast('The QR code library failed to load. Please try again.', 'refresh');
      return;
    }
    els.qrCodeContainer.innerHTML = '';
    new QRCode(els.qrCodeContainer, {
      text: session.address,
      width: 200,
      height: 200,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });
    els.qrAddressText.textContent = session.address;
    lastFocusedEl = document.activeElement;
    els.qrOverlay.hidden = false;
    els.closeQrBtn.focus();
    document.addEventListener('keydown', onQrOverlayKeydown);
  }

  function closeQrModal() {
    els.qrOverlay.hidden = true;
    document.removeEventListener('keydown', onQrOverlayKeydown);
    if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') {
      lastFocusedEl.focus();
    }
  }

  function onQrOverlayKeydown(e) {
    if (e.key === 'Escape') closeQrModal();
  }

  function updateNotifyButtonUI() {
    if (!els.notifyToggleBtn) return;
    els.notifyToggleBtn.setAttribute('aria-pressed', notificationsEnabled ? 'true' : 'false');
    els.notifyToggleBtn.classList.toggle('is-active', notificationsEnabled);
    els.notifyToggleBtn.setAttribute(
      'aria-label',
      notificationsEnabled ? 'Disable notifications for new mail' : 'Enable notifications for new mail'
    );
  }

  /** Notification permission is requested only from this click
   *  handler — never on page load — per the Notifications API's own
   *  best-practice expectations. Turning it back off is purely a
   *  local UI flag; the browser-level permission grant is untouched
   *  either way, since there's no API to revoke it from script. */
  async function toggleNotifications() {
    if (!('Notification' in window)) {
      showToast('Notifications are not supported in this browser', 'refresh');
      return;
    }
    if (notificationsEnabled) {
      notificationsEnabled = false;
      updateNotifyButtonUI();
      showToast('Notifications turned off', 'refresh');
      return;
    }
    if (Notification.permission === 'denied') {
      showToast('Notifications are blocked for this site in your browser settings', 'refresh');
      return;
    }
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    if (permission === 'granted') {
      notificationsEnabled = true;
      updateNotifyButtonUI();
      showToast("You'll be notified when new mail arrives", 'check');
    } else {
      showToast('Notification permission was not granted', 'refresh');
    }
  }

  /** Only fires while the tab is hidden/unfocused — the in-page toast
   *  already covers the foreground case, so this avoids a redundant
   *  second alert for the exact same event. */
  function notifyNewMail(freshMessages) {
    if (!notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    if (!document.hidden) return;
    const count = freshMessages.length;
    const sender = (freshMessages[0].from && (freshMessages[0].from.name || freshMessages[0].from.address)) || '';
    const title = count === 1 ? 'New mail in Mailzy' : `${count} new messages in Mailzy`;
    const body = count === 1 && sender ? `From ${sender}` : 'Tap to view your inbox.';
    try {
      const notification = new Notification(title, { body, tag: 'mailzy-new-mail' });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch {
      // Denied at the OS level despite permission === 'granted', or
      // any other platform quirk — never let this break polling.
    }
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
      // it's disposable regardless of whether this succeeds. Every
      // "New address" click retries mail.gw first, per its priority —
      // this only ever cleans up whichever provider issued `old`.
      if (old.provider === 'mailgw') {
        MailTm.deleteAccount(old.token, old.account.id);
      } else {
        GuerrillaMail.forgetMe(old.sidToken, old.address);
      }
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

  // "Generate New" in the sidebar does exactly what the hero card's
  // "New Address" button does — both just trigger newAddress(). Also
  // closes the off-canvas sidebar on mobile (owned by js/shell.js,
  // which runs on every page), since this is an in-page action
  // rather than a navigation that would close it anyway.
  if (els.sidebarGenerateBtn) {
    els.sidebarGenerateBtn.addEventListener('click', () => {
      if (window.MailzyShell) window.MailzyShell.closeSidebar();
      newAddress();
    });
  }

  // Client-side only — re-filters the already-fetched message list,
  // no extra network request.
  if (els.messageSearchInput) els.messageSearchInput.addEventListener('input', renderMessageList);

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
  if (els.qrBtn) els.qrBtn.addEventListener('click', openQrModal);
  if (els.closeQrBtn) els.closeQrBtn.addEventListener('click', closeQrModal);
  if (els.qrOverlay) {
    els.qrOverlay.addEventListener('click', (e) => {
      if (e.target === els.qrOverlay) closeQrModal();
    });
  }
  if (els.notifyToggleBtn) els.notifyToggleBtn.addEventListener('click', toggleNotifications);
  if (els.customizeAddressBtn) {
    els.customizeAddressBtn.addEventListener('click', () => {
      if (els.customizeForm.hidden) openCustomizeForm();
      else closeCustomizeForm();
    });
  }
  if (els.cancelCustomizeBtn) els.cancelCustomizeBtn.addEventListener('click', closeCustomizeForm);
  if (els.customizeForm) {
    els.customizeForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = els.customLocalPartInput.value.trim();
      if (!val) return;
      submitCustomAddress(val);
    });
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn && !btn.disabled) addClickRipple(btn, e.clientX, e.clientY);
  });

  init();
})();
