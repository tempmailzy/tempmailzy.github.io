/* =========================================================
   Mailzy — backup temp-mail client (api.guerrillamail.com)
   Used ONLY as an automatic fallback when mail.gw (the
   priority provider, see js/mailtm.js) is unreachable after
   its own retries are exhausted. This is disclosed to the
   user — app.js shows a visible banner and toast when this
   provider is active, never a silent swap.

   API shape (confirmed working, open CORS — Access-Control-
   Allow-Origin: * on every endpoint used below):
     GET  ajax.php?f=get_email_address&lang=en   -> new inbox
     GET  ajax.php?f=check_email&sid_token=&seq=  -> poll
     GET  ajax.php?f=fetch_email&sid_token=&email_id= -> full msg
     GET  ajax.php?f=forget_me&sid_token=&email_id=   -> best-effort delete

   Session identity travels as a `sid_token` query param, not a
   cookie — deliberate, so nothing about the session touches
   browser storage.

   Retention is fixed at 1 hour by Guerrilla Mail's own policy.
   The API doesn't return an expiry timestamp, so that duration
   is hard-coded here and documented as such — not discovered
   from a response field.
   ========================================================= */
(function (global) {
  'use strict';

  const API_BASE = 'https://api.guerrillamail.com/ajax.php';
  const RETENTION_MS = 60 * 60 * 1000; // 1 hour, per Guerrilla Mail's documented policy

  // Guerrilla Mail auto-injects this welcome message into every new
  // inbox. It's not real incoming mail — filter it out everywhere so
  // it never reads as "a message arrived" to someone using the backup.
  const WELCOME_SENDER = 'no-reply@guerrillamail.com';

  class GuerrillaMailError extends Error {
    constructor(message, { cause, status } = {}) {
      super(message);
      this.name = 'GuerrillaMailError';
      this.status = status;
      if (cause) this.cause = cause;
    }
  }

  async function call(params) {
    const url = `${API_BASE}?${new URLSearchParams(params).toString()}`;
    let res;
    try {
      res = await fetch(url);
    } catch (err) {
      throw new GuerrillaMailError('Could not reach the backup mail service.', { cause: err });
    }
    if (!res.ok) {
      throw new GuerrillaMailError('The backup mail service did not respond.', { status: res.status });
    }
    return res.json();
  }

  /** Creates a fresh inbox. Returns { sidToken, address, createdAt }. */
  async function createAddress() {
    const body = await call({ f: 'get_email_address', lang: 'en' });
    if (!body || !body.email_addr || !body.sid_token) {
      throw new GuerrillaMailError('The backup mail service did not return an address.');
    }
    return {
      sidToken: body.sid_token,
      address: body.email_addr,
      createdAt: Date.now(),
    };
  }

  function isWelcomeMessage(item) {
    return String(item.mail_from || '').toLowerCase() === WELCOME_SENDER;
  }

  /** Normalizes one list-row into the same shape js/app.js already
   *  renders for mail.gw messages. */
  function normalizeListItem(item) {
    return {
      id: String(item.mail_id),
      from: { name: '', address: item.mail_from || 'Unknown sender' },
      subject: item.mail_subject || '',
      intro: item.mail_excerpt || '',
      // mail_timestamp is seconds since epoch.
      createdAt: item.mail_timestamp ? new Date(Number(item.mail_timestamp) * 1000).toISOString() : null,
      seen: item.mail_read === '1' || item.mail_read === 1,
    };
  }

  /** Polls the inbox. Returns { messages, totalItems } to match
   *  MailTm.listMessages()'s shape — totalItems here is just the
   *  count of what came back, since this endpoint has no separate
   *  pagination total to report. */
  async function listMessages(sidToken) {
    const body = await call({ f: 'check_email', sid_token: sidToken, seq: '0' });
    const list = Array.isArray(body && body.list) ? body.list : [];
    const messages = list.filter((item) => !isWelcomeMessage(item)).map(normalizeListItem);
    return { messages, totalItems: messages.length };
  }

  /** Fetches one full message, normalized to the same shape
   *  js/app.js's openMessage() already expects from mail.gw. */
  async function getMessage(sidToken, id) {
    const body = await call({ f: 'fetch_email', sid_token: sidToken, email_id: id });
    if (!body) {
      throw new GuerrillaMailError('Could not load that message.');
    }
    return {
      from: { name: '', address: body.mail_from || 'Unknown sender' },
      subject: body.mail_subject || '',
      // mail_body is HTML — app.js's existing htmlToPlainText() path
      // handles that exactly the way it handles mail.gw's HTML body.
      html: body.mail_body || '',
      text: '',
    };
  }

  /** Best-effort cleanup — the mailbox is disposable regardless. */
  async function forgetMe(sidToken, address) {
    try {
      await fetch(`${API_BASE}?${new URLSearchParams({ f: 'forget_me', sid_token: sidToken, email_addr: address }).toString()}`);
    } catch {
      // Ignored, same as MailTm.deleteAccount().
    }
  }

  global.GuerrillaMail = {
    GuerrillaMailError,
    RETENTION_MS,
    createAddress,
    listMessages,
    getMessage,
    forgetMe,
  };
})(window);
