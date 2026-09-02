/* =========================================================
   Mailzy — temp-mail API client
   Talks to api.mail.gw: a sister deployment of the open-source
   mail.tm project, same API shape, same team. mail.tm's own
   API (api.mail.tm) currently only sends CORS headers back to
   requests from https://mail.tm itself, which blocks every
   other browser origin (verified directly — OPTIONS preflight
   to api.mail.tm returns 200 with no Access-Control-Allow-
   Origin header for a third-party origin) — so a purely
   client-side app cannot reach it. api.mail.gw returns
   `Access-Control-Allow-Origin: *` and was confirmed working
   end-to-end (create account → token → inbox) before this
   swap. Internal names below still say "MailTm" since it's
   the same underlying API family.

   No key required. Fully client-side. If the API is
   unreachable, callers should surface the error state —
   never silently fall back to a different provider.
   ========================================================= */
(function (global) {
  'use strict';

  const API_BASE = 'https://api.mail.gw';

  /**
   * ---------------------------------------------------------
   * FUTURE HOOK — paid tier
   * ---------------------------------------------------------
   * If a paid tier is ever added (custom domains, longer-lived
   * inboxes, multiple simultaneous addresses), it plugs in
   * around here:
   *   - domain choice: replace the "pick any active domain"
   *     logic in createAccountWithRetry() with a domain
   *     sourced from an authenticated user's plan
   *   - inbox lifetime: these mailboxes are not guaranteed
   *     to live forever; keeping one alive longer than the
   *     free flow would need its own backend (this app is
   *     intentionally backend-less today), so a paid tier is
   *     the point where a server component would first enter
   *     this architecture
   * No logic below implements any of this yet.
   * ---------------------------------------------------------
   */

  class MailTmError extends Error {
    constructor(message, { cause, status } = {}) {
      super(message);
      this.name = 'MailTmError';
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

  /**
   * fetch wrapper with exponential backoff on network errors,
   * 429 (honors Retry-After when present), and 5xx. Other
   * non-OK statuses are returned as-is for the caller to
   * inspect (e.g. 422 on account collision is meaningful,
   * not just an error to retry past).
   */
  async function fetchWithRetry(url, options = {}, { retries = 3, baseDelayMs = 600 } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      let res;
      try {
        res = await fetch(url, options);
      } catch (err) {
        lastError = err;
        if (attempt === retries) {
          throw new MailTmError('Could not reach mail.gw.', { cause: err });
        }
        await sleep(jitter(baseDelayMs * 2 ** attempt));
        continue;
      }

      if (res.status === 429 && attempt < retries) {
        const retryAfter = Number(res.headers.get('Retry-After'));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : jitter(baseDelayMs * 2 ** attempt);
        await sleep(delay);
        continue;
      }

      if (res.status >= 500 && attempt < retries) {
        await sleep(jitter(baseDelayMs * 2 ** attempt));
        continue;
      }

      return res;
    }
    throw new MailTmError('Could not reach mail.gw.', { cause: lastError });
  }

  function randomLocalPart() {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const letterCount = 6 + Math.floor(Math.random() * 3); // 6-8
    const digitCount = 3 + Math.floor(Math.random() * 2); // 3-4
    let out = '';
    for (let i = 0; i < letterCount; i++) {
      out += letters[Math.floor(Math.random() * letters.length)];
    }
    for (let i = 0; i < digitCount; i++) {
      out += digits[Math.floor(Math.random() * digits.length)];
    }
    return out;
  }

  function randomPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const bytes = new Uint32Array(20);
    (global.crypto || global.msCrypto).getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
      out += chars[bytes[i] % chars.length];
    }
    return out;
  }

  function membersOf(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload['hydra:member'])) return payload['hydra:member'];
    if (Array.isArray(payload.member)) return payload.member;
    return [];
  }

  async function getActiveDomains() {
    const res = await fetchWithRetry(`${API_BASE}/domains?page=1`);
    if (!res.ok) {
      throw new MailTmError('mail.gw did not return any domains.', { status: res.status });
    }
    const body = await res.json();
    const domains = membersOf(body).filter((d) => d.isActive !== false);
    if (domains.length === 0) {
      throw new MailTmError('mail.gw has no active domains right now.');
    }
    return domains;
  }

  /**
   * Creates an account, retrying with a fresh random local
   * part on address collisions (max `maxAttempts` tries).
   * Transient network/5xx/429 failures are already retried
   * one layer down inside fetchWithRetry.
   */
  async function createAccountWithRetry(maxAttempts = 3) {
    const domains = await getActiveDomains();
    const domain = domains[Math.floor(Math.random() * domains.length)].domain;

    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const address = `${randomLocalPart()}@${domain}`;
      const password = randomPassword();

      const res = await fetchWithRetry(`${API_BASE}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, password }),
      });

      if (res.ok) {
        const account = await res.json();
        return { account, address, password };
      }

      // 422/409 => address already taken; try a new local part.
      if (res.status === 422 || res.status === 409) {
        lastError = new MailTmError(`Address collision on attempt ${attempt}.`, { status: res.status });
        continue;
      }

      throw new MailTmError('mail.gw rejected the account request.', { status: res.status });
    }
    throw lastError || new MailTmError('Could not obtain a free address after several attempts.');
  }

  async function getToken(address, password) {
    const res = await fetchWithRetry(`${API_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, password }),
    });
    if (!res.ok) {
      throw new MailTmError('mail.gw did not issue a session token.', { status: res.status });
    }
    const body = await res.json();
    return body.token;
  }

  /** Returns { messages, totalItems } — totalItems comes from the
   *  API's own hydra:totalItems (verified present on this endpoint),
   *  used to genuinely know whether another page exists rather than
   *  guessing from a fixed page-size assumption. */
  async function listMessages(token, page = 1) {
    const res = await fetchWithRetry(`${API_BASE}/messages?page=${encodeURIComponent(page)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new MailTmError('Could not load the inbox.', { status: res.status });
    }
    const body = await res.json();
    const totalItems = typeof body['hydra:totalItems'] === 'number' ? body['hydra:totalItems'] : null;
    return { messages: membersOf(body), totalItems };
  }

  async function getMessage(token, id) {
    const res = await fetchWithRetry(`${API_BASE}/messages/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new MailTmError('Could not load that message.', { status: res.status });
    }
    return res.json();
  }

  /** Best-effort account deletion — the mailbox is disposable either way. */
  async function deleteAccount(token, accountId) {
    try {
      await fetch(`${API_BASE}/accounts/${encodeURIComponent(accountId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Ignored — burning the mailbox is a courtesy, not a guarantee.
    }
  }

  global.MailTm = {
    MailTmError,
    createAccountWithRetry,
    getToken,
    listMessages,
    getMessage,
    deleteAccount,
  };
})(window);
