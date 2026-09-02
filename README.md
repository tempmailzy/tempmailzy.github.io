# Mailzy

A disposable inbox. Load the page, get a real temporary email address
instantly (courtesy of the free [mail.gw](https://mail.gw) API), and watch
mail for it show up below — no signup, no account, nothing kept.

### Why mail.gw and not mail.tm

This was originally built against `api.mail.tm`. During hardening, direct
testing showed mail.tm's live API now only returns
`Access-Control-Allow-Origin` for requests from `https://mail.tm` itself —
every other browser origin (including this app, wherever it's hosted) gets
CORS-blocked. That makes a purely client-side app talking to it directly
impossible today, no matter how the fetch logic is written.

`api.mail.gw` is a sister deployment of the same open-source mail.tm
project — same team, same API shape — and does send
`Access-Control-Allow-Origin: *`. It was verified end-to-end (create
account → get token → list inbox) before switching. This is a deliberate,
disclosed provider choice, not the "silent fallback" this project
otherwise avoids — see "No second provider as a fallback" below.

## ⚠️ Privacy caveat — read before using

This is **not** for anything sensitive, and not for long-term use:

- The mailbox is provided by **mail.gw**, a third-party free service this
  project doesn't control or operate. Mail sent to your address passes
  through their infrastructure.
- Anyone who has (or guesses) your address can read what's sent to it —
  there is no authentication on the receiving end beyond the address itself.
- The active address lives only in the page's memory. Refresh the tab and
  it's gone — that's intentional, not a bug (see "Design decisions" below).
- Don't use this for password resets, account recovery, financial mail, or
  anything you'd be upset to lose or have someone else see.

## Running locally

This is plain static HTML/CSS/JS — no build step, no dependencies to
install. Any static file server works, e.g.:

```bash
npx serve .
```

or, from this directory:

```bash
python -m http.server 8080
```

Then open the printed local URL. Opening `index.html` directly via
`file://` will *not* work — the `fetch` calls to `api.mail.gw` need a real
origin.

## Deploying

A [`netlify.toml`](netlify.toml) is included for one-click static deploy on
Netlify (drag-and-drop the folder in the Netlify UI, or connect the repo —
no build command needed, it just publishes the folder as-is). Netlify was
chosen over Vercel because this project has no serverless/runtime needs at
all; the only "config" it needs is a handful of static security headers,
which `netlify.toml`'s `[[headers]]` block handles directly without
implying a function runtime.

If you'd rather deploy elsewhere (Vercel, GitHub Pages, Cloudflare Pages,
S3 + CloudFront, etc.), it'll work the same way — it's just static files.
You'll lose the security headers unless you replicate them on that
platform.

## Project structure

```
mailzy/
├── index.html       # markup + meta/OG tags
├── css/styles.css   # design tokens + all styling
├── js/mailtm.js     # temp-mail API client (retry/backoff, account lifecycle)
├── js/app.js        # UI wiring, polling, state
├── favicon.svg
├── og-image.svg      # link-preview image (see note below)
└── netlify.toml
```

Split into a few small files rather than kept single-file, once retry
logic, visibility-aware polling, an error state, and accessibility wiring
were added — a single scrollable file stopped being the simpler option to
maintain. There's still no build step: these are the exact files a static
host serves.

## Visual layer

Beyond the base kraft-paper/postal identity, a few techniques carry the
"paper and ink" feel further:

- **Paper grain** — a `feTurbulence`-generated SVG noise texture, applied
  via `background-blend-mode: multiply` on the paper surfaces (defined
  once as the `--grain` token). No image asset, no extra request.
- **Rough-stamped postmark** — the postmark's SVG marks sit inside a `<g>`
  distorted by an `feDisplacementMap` filter (`#inkRough`, defined once in
  `index.html`), so it reads as struck by a rubber stamp rather than
  perfect vector geometry.
- **Punched perforation & ticket-stub notches** — the divider and the
  address bar use layered `radial-gradient`s / pseudo-elements shaped
  like actual hole-punches, instead of a flat dashed border.
- **`@property --tilt` / `--card-tilt`** — registers those custom
  properties as real `<angle>` values so the browser can smoothly
  interpolate them (the postmark's hover wobble, the message cards'
  resting tilt-then-flatten). Degrades gracefully — un-registered browsers
  just skip the transition and snap to the end value.
- **Click-point ink ripple, copy stamp-flash, letter-unfold** — small
  JS/CSS interactions in `app.js`/`styles.css` reusing the same postal
  vocabulary (ripple = ink, copy confirmation = a stamp flash, opening a
  message = unfolding a letter).

All of the above is layered on top of the existing token system in
`:root`, not a replacement for it, and every animation added here has a
`prefers-reduced-motion` fallback (checked in JS via `matchMedia` for the
ripple/copy-flash, in CSS media queries for everything else).

## Design decisions worth knowing

- **No persistence of the active mailbox.** The address/token live in a
  JS variable for the life of the tab only. This is deliberate, not an
  oversight — a disposable inbox that survives a refresh in
  `localStorage` is a mild contradiction of the whole point.
- **Message bodies render as plain text only**, never `innerHTML`. Anyone
  can send arbitrary HTML/JS to a temp address, so this is a load-bearing
  XSS guard — don't relax it.
- **Polling pauses when the tab is hidden** (`visibilitychange`) and
  resumes with an immediate refresh when it's visible again, to avoid
  hammering mail.gw's free tier while nobody's looking.
- **No second provider as a *runtime* fallback.** If mail.gw is
  unreachable, the app shows an on-brand error state with a retry button —
  it does not silently switch to a different temp-mail service mid-session.
  (Swapping the *primary* provider once, at build time, from mail.tm to
  mail.gw for the CORS reason above is a different thing — it's disclosed
  above, not a hidden runtime fallback.)
- **`og-image.svg` is an SVG**, which not every link-preview crawler
  renders (Slack/Discord generally do; some others expect a raster
  image). If you need guaranteed previews everywhere, render it to a
  1200×630 PNG and point `og:image`/`twitter:image` in `index.html` at
  that instead.

## Future paid tier (not implemented)

There's a marked comment block in `js/mailtm.js`, near account/domain
creation, noting where a paid tier (custom domains, longer-lived inboxes)
would architecturally hook in. No monetization logic exists yet — it's a
note for later, not a stub to wire up.
