/* =========================================================
   Mailzy — Guerrilla Mail API client (backup provider)
   Talks to api.guerrillamail.com, a long-running free temp-mail
   service with an open CORS policy (verified directly:
   Access-Control-Allow-Origin: * on every endpoint used here).

   This exists ONLY as a disclosed, visible failover for when
   the primary provider (mail.gw) is unreachable — never used
   silently. js/app.js shows which provider is actually active.

   Session model differs from mail.gw: there's no account/password
   pair, just a sid_token returned from get_email_address and passed
   back on every subsequent call. Retention here is a fixed, documented
   policy (Guerrilla Mail deletes mail after 1 hour) rather than a
   per-account field the API returns, so it's hardcoded below as
   RETENTION_MS, not fetched.
   ========================================================= */
(function (global) {
  'use strict';

  const API_BASE = 'https://api.guerrillamail.com/ajax.php';
  const RETENTION_MS = 60 * 60 * 1000; // documented: mail deleted after 1 hour

  class GuerrillaMailError extends Error {
    constructor(message, { cause, status } = {}) {
      super(message);
      this.name = 'GuerrillaMailError';
      this.status = status;
      if (cause) this.cause = cause;
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function jitter(ms) {
    return ms / 2 + Math.random() * (ms / 2);
  }

  /** Same backoff shape as js/mailtm.js's fetchWithRetry. */
  async function fetchWithRetry(url, { retries = 2, baseDelayMs = 500 } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      let res;
      try {
        res = await fetch(url);
      } catch (err) {
        lastError = err;
        if (attempt === retries) {
          throw new GuerrillaMailError('Could not reach Guerrilla Mail.', { cause: err });
        }
        await sleep(jitter(baseDelayMs * 2 ** attempt));
        continue;
      }

      if (res.status >= 500 && attempt < retries) {
        await sleep(jitter(baseDelayMs * 2 ** attempt));
        continue;
      }

      return res;
    }
    throw new GuerrillaMailError('Could not reach Guerrilla Mail.', { cause: lastError });
  }

  async function fetchJson(action, params) {
    const query = new URLSearchParams({ f: action, ...params }).toString();
    const res = await fetchWithRetry(`${API_BASE}?${query}`);
    if (!res.ok) {
      throw new GuerrillaMailError(`Guerrilla Mail rejected the ${action} request.`, { status: res.status });
    }
    return res.json();
  }

  /** Returns { sidToken, address, createdAt, retentionAt }. */
  async function createInbox() {
    const body = await fetchJson('get_email_address', {});
    if (!body || !body.email_addr || !body.sid_token) {
      throw new GuerrillaMailError('Guerrilla Mail did not issue an address.');
    }
    const createdAt = Date.now();
    return {
      sidToken: body.sid_token,
      address: body.email_addr,
      createdAt,
      retentionAt: createdAt + RETENTION_MS,
    };
  }

  /** Returns { messages, totalItems } — same shape as MailTm.listMessages,
   *  so js/app.js can treat both providers identically. totalItems is
   *  deliberately null: Guerrilla Mail's "count" field doesn't reliably
   *  mean "total messages available," so rather than fabricate a number,
   *  "Load more" just stays hidden for this provider. */
  async function listMessages(sidToken) {
    const body = await fetchJson('check_email', { seq: '0', sid_token: sidToken });
    const list = Array.isArray(body && body.list) ? body.list : [];
    return { messages: list, totalItems: null };
  }

  async function getMessage(sidToken, id) {
    const body = await fetchJson('fetch_email', { email_id: id, sid_token: sidToken });
    if (!body) {
      throw new GuerrillaMailError('Could not load that message.');
    }
    return body;
  }

  /** Best-effort cleanup — same courtesy-not-guarantee as MailTm.deleteAccount. */
  async function forgetInbox(sidToken, address) {
    try {
      await fetch(`${API_BASE}?f=forget_me&email_addr=${encodeURIComponent(address)}&sid_token=${encodeURIComponent(sidToken)}`);
    } catch {
      // Ignored.
    }
  }

  global.GuerrillaMail = {
    GuerrillaMailError,
    createInbox,
    listMessages,
    getMessage,
    forgetInbox,
  };
})(window);
