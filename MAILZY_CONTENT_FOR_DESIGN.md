# Mailzy — Site Content (for UI redesign)

Live site: https://tempmailzy.github.io/
Purpose of this doc: full real content of every page, for a designer to work from directly instead of lorem ipsum. The current UI is a black/gold dashboard-style layout with a persistent left sidebar; the visual design is completely open to change — only the content/copy below should carry over as-is (or be lightly adapted), since it was deliberately written to avoid generic filler and to address specific product/SEO concerns.

## Site-wide structure

**Brand**: MailZy (logo mark "M", wordmark "Mail" + accent "Zy"), tagline "Temporary Email, Real Freedom"

**Header**: logo/brand (links home), dark/light theme toggle, an "HTTPS Encrypted" badge (only shown when served over HTTPS)

**Primary nav (sidebar)**:
- Inbox (home) — shows unread count badge
- Generate New (action button — creates a new address)
- Settings

**Secondary nav (sidebar)**:
- About
- How It Works
- FAQ
- Disposable Email Guide
- Common Uses
- Privacy Guide
- Privacy Policy
- Terms
- Contact Us

**Footer**: © [year] Mailzy. All rights reserved.

---

## Page: Home (index.html)

**The core app UI (not static content)** — an address generator/inbox tool:
- Eyebrow: "TEMPORARY EMAIL"
- H1: "Your disposable email address"
- Subhead: "No registration or password required — ready the moment this page loads."
- A generated address display (e.g. `mkhzceog@guerrillamailblock.com`)
- Action row: Copy / random (new address) / change (custom name) / QR code / notify (browser notifications toggle) / history (past addresses, local only)
- A "change" flow also offers a domain picker when available
- Retention Period countdown bar
- Hint: "Mail sent to this address is delivered below. Treat it as a shared inbox, not a private one — avoid using it for anything sensitive."
- INBOX panel with Search, Refresh, and "Messages" / "Saved" tabs
- Message list (empty state: "No emails yet — Your inbox is empty. Emails will appear here once received.")

**Quick links row**: How It Works, FAQ, Disposable Email Guide, Common Uses, Privacy Policy

**3 feature cards**:
1. **Anonymous** — No account or personal details required.
2. **Instant** — Your address is active the moment this page loads.
3. **Disposable** — Discard it at any time without affecting your primary inbox.

**Homepage prose content** (adds real, substantial depth to the primary page rather than just the app UI — keep the amount of real text roughly comparable in any redesign, don't shrink it back down to just the tool itself):

### What is a temporary email address?
A temporary email address is a real, working inbox that isn't tied to your identity and isn't meant to last. Mailzy generates one the moment this page loads — no sign-up form, no password to invent, no phone number to hand over. Anything sent to it shows up below in real time, and when you're done with it, you just close the tab. Nothing about it needs to be remembered, backed up, or logged into again.

### Why use one instead of your real inbox
Most sites that ask for an email address don't actually need to keep it. A forum you're posting to once, a coupon code gated behind a "confirm your email" click, a free trial you want to try without committing a real account to it — all of these want an address today and give you no benefit for handing over your primary one. The moment a real address sits in one more company's database, it becomes one more place a data breach, a resold marketing list, or a plain old spam campaign can reach you. A disposable address absorbs that exposure instead. If it ends up on a spam list six months from now, that's fine — it was never going to exist that long anyway.

### How Mailzy is built
There's no account system behind Mailzy and no server-side database of past addresses. Each inbox is provisioned against a temporary-mail API on the fly, and closing the tab lets that mailbox go — refreshing starts a fresh one. The one exception is what you explicitly ask to keep: this device remembers the addresses you've generated and any messages you've chosen to save, but only in this browser's own local storage, never sent to a server. If the primary mail provider is briefly unreachable, Mailzy quietly retries against a second one rather than showing an error, so a single provider's downtime doesn't cost you a working inbox. Message content is always rendered as plain text, never as raw HTML, which closes off the usual way a malicious email tries to run code in your browser.

Beyond the basic inbox, you can pick your own name for the address (and, when it's available, which domain it lands on) instead of taking the randomly generated one, pull up a QR code to carry the address to another device without retyping it, download any file attachments a message includes, save individual messages so they survive past the mailbox's own expiry, look back at addresses you've generated on this device, and turn on browser notifications so a reply doesn't sit unnoticed in a background tab.

### What it isn't for
A disposable inbox is not a private one. Whoever controls the mail provider behind it can, in principle, read what passes through — the same is true of most free temporary-mail services, not just this one. Treat it the way you'd treat a shared mailbox at a hostel front desk: fine for a verification code or a one-time download link, wrong for anything financial, medical, or otherwise sensitive. And because the address is disposable by design, expect it to stop receiving mail eventually — it's not a replacement for a real account you intend to keep using.

---

## Page: About (about.html)

# About Mailzy
*A small, independent project — not a company.*

### What this is
Mailzy gives you a real, working email address the instant you load the page — no signup, no password, no personal details. It exists for one specific, common situation: you need to receive exactly one email — a signup confirmation, a one-time verification code, a download link — from a service you don't fully trust yet, or simply don't want tied to your real address forever. Instead of handing over an address you might regret sharing, you get a disposable one, read whatever arrives, and let it expire on its own.

It's deliberately narrow in scope. Mailzy doesn't try to be a full email client, doesn't offer folders or search or attachments handling, and doesn't pretend to replace your real inbox. It does one thing — catch mail for a little while — and tries to do that one thing well, honestly, and without collecting anything about you along the way.

### How it actually works
Mailzy is entirely client-side — there is no server of ours, no database, and no backend logic running anywhere. Every time you load the page, your own browser reaches out directly to mail.gw, a free third-party mail API, and asks it for a brand-new mailbox. From that point on, your browser quietly polls mail.gw every few seconds asking "has anything arrived yet?" and renders whatever comes back directly on the page in front of you.

That architecture has a real consequence worth spelling out: Mailzy never sees, stores, logs, or has access to anything sent to your address. It can't, because there's nowhere for that data to go through — it travels directly between mail.gw's servers and your browser, with nothing of ours sitting in the middle. The full technical walkthrough, step by step, is on the How It Works page.

### Why it's built this way
A lot of "free" temporary email tools quietly do one of two things: they log everything that passes through them for later use, or they wrap a simple utility in intrusive ads and trackers. Mailzy avoids the first possibility structurally, not just by policy — there is no backend to log anything to, because there is no backend. What runs in your browser is the entire application; every line of it is inspectable, because there's nothing hidden on a server somewhere.

That choice comes with real trade-offs, and we'd rather be upfront about them than pretend they don't exist. A backend-powered service could offer things Mailzy currently can't: a saved address you can return to, a longer-lived inbox, multiple addresses at once. Mailzy doesn't do any of that today, specifically because doing it properly would mean introducing an account system and a server — the exact thing this project set out to avoid. If that ever changes, it'll be a deliberate, disclosed addition, not something quietly bolted on.

### Who's behind it
Mailzy is an independent side project, built and maintained by a small team — not a venture-funded company, not an enterprise product. Questions, bug reports, or suggestions are always welcome — see Contact Us.

### What it isn't
It isn't a private mailbox. Anyone who has, or correctly guesses, your temporary address can read what's sent to it — that's fundamentally how the underlying public API works, and no amount of clever UI changes that fact. See the Privacy Policy for the complete detail on what is and isn't collected.

It isn't permanent, either. Addresses and their contents disappear once mail.gw's own retention window closes (shown live on the Inbox as "Retention Period"), or the moment you click "New address" yourself.

And it isn't universally accepted. Plenty of services — banks, subscription platforms, AI tools, anything that verifies identity — deliberately detect and reject known disposable-email domains to prevent abuse. That's the target site's own policy decision, not a Mailzy bug, and no temporary-email tool, free or paid, can reliably get around it. The FAQ goes into exactly why that happens and what to do about it.

---

## Page: How It Works (how-it-works.html)

# How It Works
*The real technical flow, step by step — not a marketing summary.*

Mailzy runs entirely in your browser. There's no account system, no database, and no server of ours processing anything in the middle. Here's exactly what happens, in order, from the moment you load the page to the moment a message shows up.

### The five steps
1. **An address is generated the moment you arrive.** As soon as the page loads, your browser fetches a list of currently active domains from mail.gw, picks one at random, and generates a random local part — a handful of lowercase letters followed by a few digits. If that exact combination happens to already be taken (rare, but possible), Mailzy quietly retries with a new random string, up to three times, before giving up and showing an error.
2. **Your browser holds the only key, and only in memory.** Once the address is created, mail.gw issues a session token tied to it. That token is kept in a plain JavaScript variable in your browser's memory — not in a cookie, not in localStorage, not anywhere that survives a page refresh. Close or reload the tab, and that token (and the address) is gone for good. That's a deliberate design choice, not an oversight: a "temporary" inbox that quietly persists across sessions would defeat the point.
3. **Incoming mail is polled, not pushed.** There's no live push connection telling Mailzy the instant something arrives. Instead, your browser asks mail.gw "anything new?" roughly every seven seconds, for as long as the tab stays open and visible. If you switch to another tab, polling pauses automatically — there's no reason to keep hammering a free API for a page nobody's looking at — and it resumes the moment you switch back.
4. **Messages are rendered as plain text, always.** This one matters for security, not just functionality. Anyone on the internet can send an email to a Mailzy address, and that email can contain arbitrary HTML and even embedded scripts. Mailzy never inserts message content into the page as HTML — every message body is parsed off-screen and only its plain text is extracted and displayed. A malicious email can't run code in your browser through Mailzy, because Mailzy never gives it the chance to.
5. **The address expires — by design, not by accident.** mail.gw has its own retention policy for how long a mailbox and its messages are kept; Mailzy shows that live as the "Retention Period" bar on the Inbox page, calculated from real timestamps the API returns, not a decorative countdown. Once that window closes, or the moment you click "New address," the old mailbox is gone and a fresh one takes its place.

### What happens when mail.gw is down
mail.gw is the priority provider — every address starts there. If it's unreachable after its own retries, Mailzy automatically issues your address from a backup provider (Guerrilla Mail) instead, so the tool keeps working during an outage rather than going dark. That switch happens quietly in the background — there's no separate banner or notification calling it out, since a working address either way is all that matters in the moment. The Retention Period bar still reflects the real window for whichever provider issued the address (the backup's is a shorter, fixed hour rather than mail.gw's typically longer one). If both providers are down at once, you'll see an honest error message and a manual retry button — Mailzy never pretends an address works when it doesn't.

### What Mailzy deliberately doesn't do
Beyond the disclosed mail.gw → backup switch above, Mailzy doesn't quietly change providers for any other reason, doesn't send email (only receive it), and doesn't keep any record of an address after you leave it behind; there's no history, no "recent addresses" list, nothing to look back on later.

*(Note: this last sentence is now slightly stale — the live site DOES offer an opt-in, local-only "Address history" feature now. Worth updating when this page is next touched.)*

### Want more detail?
The About page covers the reasoning behind these choices, and the FAQ answers the specific questions that come up most — including why some websites reject temporary email addresses outright.

---

## Page: FAQ (faq.html)

# Frequently Asked Questions
*The real questions people run into, answered directly.*

**Is Mailzy private?**
No. Anyone who has, or correctly guesses, your temporary address can read what's sent to it — that's fundamentally how the underlying public mail API works, and no interface on top of it changes that fact. Don't use it for password resets, account recovery, financial mail, or anything else you'd be upset to lose or have someone else read.

**How long does my temporary address last?**
As long as mail.gw's own retention window stays open — shown live on the Inbox page as the "Retention Period" bar, calculated from the real account timestamps the API returns, not a decorative countdown. Closing the tab doesn't necessarily delete the mailbox on mail.gw's side right away, but Mailzy itself forgets the address the instant the tab closes, since nothing about it is saved locally.

**Why did a website reject my Mailzy address?**
Many services — especially ones that require identity verification, like AI tools, financial platforms, or subscription services — maintain blocklists of known disposable-email domains, specifically to prevent free-trial abuse and fake signups. That's the target site's own policy decision, not a Mailzy bug, and it affects every free temporary-email tool that exists, not just this one; even established competitors reserve their "less detectable" domains for paying customers. If you genuinely need an address a strict verification site will accept, your real email is the only fully reliable option, or consider a free email-masking service like Firefox Relay or SimpleLogin for a middle ground — see About for more on this trade-off.

**Can I send email from a Mailzy address?**
No — it's receive-only. Mailzy uses mail.gw purely to generate and poll an inbox; there's no compose or send functionality, and no plan to add one, since that would mean taking on outbound mail infrastructure and deliverability concerns this project deliberately stays away from.

**Who actually runs the mailbox?**
mail.gw, a free third-party email API, and it's the priority provider — every address starts there. Mailzy is a client-side interface to it, so mail.gw's own uptime and policies apply directly to your mailbox. If mail.gw is unreachable, Mailzy automatically switches to a backup provider, Guerrilla Mail, instead of going dark — that switch happens quietly in the background, with no separate banner or notification. The backup has its own fixed 1-hour retention, still reflected accurately in the Retention Period bar rather than borrowed from mail.gw's longer one. If both are down at once, Mailzy shows an honest error rather than pretending otherwise.

**Does Mailzy use cookies or track me?**
Mailzy itself has no accounts, no analytics, and no tracking scripts. The only things stored in your browser's local storage are your light/dark theme preference, an optional address history, and any messages you've chosen to save — full detail is in the Privacy Policy.

**Why does refreshing the page give me a new address?**
Because nothing about your active mailbox is saved anywhere — not in a cookie, not in local storage, not on a server we control. That's deliberate: a disposable inbox that quietly survives a page refresh would be a mild contradiction of the entire idea.

**Is Mailzy free?**
Yes, fully free, with no paid tier currently offered. If one is added later — for example, custom domains or longer-lived inboxes — it would be a clearly disclosed, separate addition, not a silent change to how the free version already works.

*Didn't find your answer? See How It Works for the full technical walkthrough, or get in touch directly.*

---

## Page: Disposable Email Guide (disposable-email-guide.html)

# What Is a Disposable Email Address? A Complete Guide
*The mechanics, the trade-offs, and the honest limits — not a sales pitch.*

### The short definition
A disposable email address is a real, functioning inbox that's created for temporary use and meant to be thrown away. It can send and receive mail like any other address, but it isn't tied to your identity, doesn't require a password you'll remember, and typically stops working after a fixed window — anywhere from an hour to a few days, depending on the provider. The point isn't secrecy or anonymity in some cloak-and-dagger sense; it's decoupling "I need to receive one email" from "I need a permanent piece of my identity that follows me around the internet forever."

### How it actually works, technically
Under the hood, a disposable address is provisioned against a mail domain the provider controls — not yours, not a domain you'll ever touch again. A local part (the bit before the @) gets generated, usually randomly, and a mailbox is opened for it on the provider's mail server. From that point on it behaves like ordinary email: SMTP delivers messages to it, and the provider's interface (a website, an API, sometimes both) lets you read what arrived. Mailzy, for instance, talks directly to mail.gw, a third-party mail API, entirely from your browser — there's no account, no password to set, and the address exists the instant the page loads. The full technical walkthrough is on the How It Works page if you want the specifics.

What happens when the window closes varies by provider. Some genuinely delete the mailbox and everything in it. Others keep it around a bit longer internally but simply stop showing it to you. Either way, the working assumption should always be the same: once it expires, whatever's in there is gone, and there's no "recover my old temporary inbox" option, because that would defeat the entire premise.

### How it's different from an alias or forwarding address
It's easy to lump disposable email in with things like Gmail's "+tag" aliases, or dedicated alias/forwarding services like Firefox Relay and SimpleLogin, but they solve different problems:
- A disposable address is short-lived by design and has no persistent connection to your real inbox at all — nothing forwards to you, and it isn't meant to last.
- An alias/forwarding address (SimpleLogin, Firefox Relay, or a "+tag" trick) is meant to last indefinitely. Mail sent to it actually reaches your real inbox, just through an intermediary you can shut off later. It's built for long-term account management, not one-time verification.
- A second "real" email account (a spare Gmail or Outlook address) sits in between — permanent, but not linked to your primary identity unless you choose to link it.

If you need to receive exactly one confirmation link and never think about that address again, a disposable one is the right tool. If you want a service to be able to reach you long-term without ever learning your real address, an alias service is the better fit — and it's worth knowing the difference before picking either.

### What it's genuinely good for
Signing up for something you're only mildly curious about, downloading a gated PDF or whitepaper, claiming a one-time trial or discount code, testing how a product's onboarding emails actually look during development, or registering for a forum or service you expect to use exactly once. In every one of these, the value of the address to you is finite and short — you need it to work for a few minutes, and then it's fine if it never exists again. See Common Uses for Temporary Email for a more complete rundown of specific scenarios.

### What it's genuinely not good for
Anything you might need to prove later, revisit, or recover. That includes password resets and account-recovery flows (if you lose access to the disposable address, you've locked yourself out permanently, with no recovery path), financial or medical correspondence, anything with legal weight, and any account you actually intend to keep using. It's also, by definition, not private: most disposable-mail providers offer no authentication stronger than "know or guess the address," so anyone who has it can read what's inside. Treat it as a shared, temporary mailbox, never a secure one.

It's also worth knowing upfront that plenty of services deliberately block known disposable-email domains to prevent free-trial abuse and fake signups — that's a policy decision on their end, not a flaw in the tool, and no disposable-email provider can promise to get around it. The FAQ covers this specific situation in more depth.

### The trust question
Because a disposable-mail provider technically has access to whatever passes through its servers, the honest answer to "can I trust this?" always depends on the provider, not the concept itself. Look for whether the tool is transparent about what it does and doesn't collect, whether there's a real privacy policy rather than boilerplate, and whether the architecture is something you could actually verify. Mailzy's own answer to that is in its Privacy Policy and About page — there's no backend of ours in the middle at all, so there's nothing of ours to trust beyond the client-side code itself.

---

## Page: Common Uses (temp-email-uses.html)

# Common Uses for Temporary Email
*Specific situations, not vague marketing categories.*

"Use it whenever you don't want to give out your real email" is technically true but not especially useful advice. Here are the actual, specific situations where reaching for a disposable address is the obviously right call — and a few notes on when it isn't.

### Claiming a free trial or one-time discount
Plenty of services gate a free trial, a first-purchase discount code, or a "refer a friend" bonus behind requiring an email signup, sometimes limiting it to one use per address. If you're just evaluating whether a product is worth paying for, a temporary address lets you claim the trial without permanently linking your real inbox to a company you might never use again. Just be aware some services specifically detect and block known disposable domains for exactly this reason — it's a documented trade-off, covered in the FAQ.

### Downloading a gated PDF, whitepaper, or resource
Marketing sites frequently ask for an email address before letting you download a guide, template, or report — not because they need to email you the file, but because they want a lead for their sales funnel. If you have zero interest in a follow-up newsletter or a sales call, a disposable address gets you the file without adding you to a mailing list you'll have to unsubscribe from later.

### Signing up for a forum, comment section, or one-off account
Plenty of sites require an account just to leave a comment, ask a single question, or view content behind a login wall you'll never revisit. If you don't plan on returning, there's little reason to create a permanent record tied to your real address for a site you're using exactly once.

### Developer and QA testing
If you're building anything that sends transactional email — signup confirmations, password resets, receipts, notification digests — you need somewhere to actually receive and inspect that mail during development, repeatedly, without cluttering your real inbox with dozens of test messages. A temporary address that you can throw away and regenerate on demand is a natural fit for this kind of QA loop, especially when testing against different account states that each need a fresh address.

### Avoiding newsletter creep from a single purchase
Buying something online frequently means the retailer keeps your address for marketing email indefinitely, opt-out box or not. For a one-off purchase from a store you don't expect to buy from again, a temporary address that only needs to survive long enough to receive an order confirmation and tracking link avoids months of unsubscribe-link hunting afterward. (For purchases you might need customer support on later, this is a case where a permanent alias — see the note below — is usually the smarter choice instead.)

### Testing a signup or onboarding flow you're curious about
Sometimes you just want to see what a product's actual signup experience looks like — the verification email, the welcome sequence, the first few days of onboarding messages — without committing your real address to find out. This applies to competitive research just as much as ordinary curiosity.

### When a temporary address is the wrong choice
Any account you intend to actually keep, anything involving money or legal identity, and anything where losing access to the address later would lock you out permanently — most notably password-reset and account-recovery flows. In those cases the address itself becomes a security credential, and a disposable one that might already be expired by the time you need it defeats the purpose entirely. If what you actually want is long-term privacy rather than a one-time throwaway, a masking/alias service (Firefox Relay, SimpleLogin) or a dedicated secondary email account is the more appropriate tool — see What Is a Disposable Email Address? for how the two compare directly.

---

## Page: Privacy Guide (online-privacy-guide.html)

# How to Protect Your Privacy Online
*Practical steps, in rough order of effort-to-benefit — not a scare piece.*

Most online privacy advice is either too vague to act on ("be careful what you share!") or so extreme it's impractical for daily life. This is a shorter list of specific, actually usable habits, roughly ordered from "costs you nothing" to "worth doing if you care a lot."

### Compartmentalize your email addresses
A single email address used for banking, shopping, social media, forums, and every free trial you've ever signed up for is a single point of correlation — a data breach at any one of those services exposes an address that's also tied to everything else. Splitting usage across a few addresses limits the blast radius:
- A primary address for people and services you actually trust and expect to hear from long-term — banking, close contacts, your employer.
- An alias or masking service (Firefox Relay, SimpleLogin, or similar) for everyday signups you want to keep long-term access to, without exposing your real address.
- A temporary/disposable address for the one-off cases — a single download, a trial you're only mildly curious about, a forum account you'll use once. See What Is a Disposable Email Address? for exactly where this fits versus the option above.

### Assume every "free" gated download is a lead-generation form
When a site asks for your email before letting you download a guide or template, that request usually exists to feed a marketing funnel, not to deliver the file. If you have no interest in the follow-up emails, treat the request accordingly — a real address you don't mind hearing from occasionally, or a temporary one if you'd rather not be added to any list at all.

### Use a password manager and stop reusing passwords
This is the single highest-leverage privacy and security habit that exists, and it has nothing to do with email. Password reuse across sites means one breached, low-security site (a forum, a small e-commerce store) can be used to try the same credentials against your bank or email account. A password manager that generates and stores a unique password per site removes this risk almost entirely, for less ongoing effort than remembering passwords yourself.

### Turn on two-factor authentication where it matters most
Prioritize your email account first — it's usually the "master key" that can reset access to everything else via password-reset links — then banking, then anything else with financial or identity stakes. An authenticator app is meaningfully stronger than SMS-based codes, since SMS can be intercepted via SIM-swap attacks; use it where the option exists.

### Be deliberate about browser tracking, not absolutist
Third-party cookies and cross-site tracking scripts build a profile of your browsing across sites you never explicitly agreed to share data with. A browser with reasonable tracking protection turned on by default, combined with periodically clearing cookies for sites you don't regularly use, cuts down on this without requiring you to relearn how to use the internet. Declining non-essential cookies on consent banners, when you're offered a real choice, is a small but genuine habit worth keeping.

### Read the privacy policy for anything that actually matters
Nobody reads privacy policies for every site they glance at, and that's fine. But for anything you're trusting with real personal or financial information — a bank, a health app, a service storing documents — it's worth specifically checking what data is collected, how long it's kept, and whether it's sold or shared with third parties. A policy that's vague, evasive, or impossible to find at all is itself useful information.

### Know the limits of any single tool
No individual habit here — temporary email included — makes you anonymous or untouchable online. Each one closes off a specific, real exposure. A temporary address stops a single one-off signup from following you forever; it doesn't hide your IP address, browsing history, or anything else about how you use the internet. Layering a few of these habits together, applied to the situations they actually fit, gets you most of the realistic benefit without turning everyday browsing into a chore. Mailzy's own approach to this — no accounts, no backend, no tracking of its own — is covered in detail on the About page.

---

## Page: Privacy Policy (privacy.html)

# Privacy Policy
*Last updated: September 2026*

### The short version
Mailzy has no accounts, no sign-up, and no server-side database. We don't collect your name, your real email address, or any personal information, because we never ask for any. What follows is the specific, non-generic detail on what actually happens when you use this site.

### The temporary mailbox (mail.gw, with a disclosed backup)
When you load Mailzy, your browser creates a temporary mailbox directly with mail.gw, an independent third-party email service and Mailzy's priority provider. Mailzy itself never sees, stores, or has access to the address, password, or any message content — that data lives with mail.gw and travels directly between your browser and their servers. Review mail.gw's own terms for how they handle it on their end. If mail.gw is temporarily unreachable, your browser automatically requests a mailbox from a backup provider, Guerrilla Mail, instead, without a separate on-screen notice — the same "your browser talks directly to the provider" rule applies to it too. Messages sent to a Mailzy address, from either provider, are not private: anyone who has or guesses the address can read what's delivered to it.

### What we store in your browser
The active temporary address itself is deliberately not saved anywhere; closing the tab discards it. What is saved in your browser's local storage, only on this device and never sent to a server: your light/dark theme preference, a record of the addresses you've generated here (just the address text and a timestamp — never a password or token), and any messages you've chosen to save so they survive past the mailbox's own expiry.

### Analytics
Mailzy does not run any analytics or tracking scripts. If that changes, this page will be updated to say exactly what was added and why.

### Children's privacy
Mailzy is not directed at children under 13, and we do not knowingly collect information from them.

### Changes to this policy
If this policy changes, the "Last updated" date at the top of this page will change with it. Material changes will be reflected in plain language here, not buried in legal boilerplate.

### Contact
Questions, concerns, or corrections about this policy are welcome — see the Contact Us page.

---

## Page: Terms of Service (terms.html)

# Terms of Service
*Last updated: September 2026*

### Acceptance of these terms
By using Mailzy, you agree to these terms. If you don't agree with them, the only real option is not to use the site — there's no account to cancel or sign-up to undo, since none exists in the first place.

### What the service is
Mailzy is a free, client-side interface for generating a temporary email address through third-party mail providers (mail.gw, and Guerrilla Mail as a disclosed backup — see How It Works). Mailzy does not operate any mail infrastructure itself; it runs entirely in your browser and simply talks to those providers' own APIs.

### Acceptable use
Don't use Mailzy to send or facilitate spam, phishing, harassment, or any illegal activity; to attempt to disrupt, overload, or abuse mail.gw, Guerrilla Mail, or this site itself; or to impersonate another person or organization. Mailzy reserves the right to restrict access to anyone abusing the service, though given the site has no accounts or IP-based tracking of its own, enforcement in practice is limited to what the underlying mail providers themselves choose to do.

### No warranty, no guaranteed availability
Mailzy is provided "as is," with no warranty of any kind, express or implied — including no guarantee of uptime, accuracy, or fitness for any particular purpose. Because mail.gw and Guerrilla Mail are independent third-party services outside Mailzy's control, either one (or both) can be slow, unreliable, or temporarily unavailable at any time, as has genuinely happened before. Mailzy does its best to disclose this honestly when it occurs (see FAQ) rather than guarantee it won't.

### No liability
To the fullest extent permitted by law, Mailzy and the individuals who maintain it are not liable for any loss or damage arising from your use of the service — including lost access to an account you registered with a Mailzy address, messages that were never delivered or expired before you read them, or any consequence of treating a shared, non-private inbox as though it were private. These are all inherent, disclosed properties of a disposable email tool, not unexpected failures.

### Third-party providers
Your temporary mailbox is hosted by mail.gw or, if that's unreachable, Guerrilla Mail — independent services with their own terms and policies, linked from the Privacy Policy. Mailzy has no control over, and no responsibility for, how those providers operate, retain data, or handle abuse on their end.

### No age restriction claims beyond honesty
Mailzy is not directed at children under 13 and does not knowingly collect information from them — consistent with the Privacy Policy. Since there's no account system, there's no age-verification step to enforce this beyond that stated intent.

### Changes to these terms
If these terms change, the "Last updated" date above will change with them, and material changes will be described in plain language here rather than buried in boilerplate.

### Contact
Questions about these terms are welcome — see Contact Us.

---

## Page: Contact Us (contact.html)

# Contact Us
*Questions, bug reports, or feedback — we read every message.*

### Get in touch
The fastest way to reach us is email. Whether something's broken, you have a suggestion, or you just want to ask a question about how Mailzy works, send it over:

**tempmailzy@gmail.com**

### Before you write in
If your question is about privacy, retention, why a website rejected your address, or how the mailbox actually works, the FAQ, How It Works, and Privacy Policy pages answer the most common ones directly — you might find what you need faster there.

### Response time
Mailzy is a small, independently run project — we do our best to reply promptly, but please allow a few days, especially for non-urgent questions.

---

## Page: Settings (settings.html)

# Settings
*There isn't much here yet — on purpose.*

### Appearance
Light or dark mode is controlled from the toggle in the top-right of every page, not from a separate settings form — it's a single click either way. Your choice is saved in this browser's local storage, so it's remembered on your next visit. Nothing else about your preferences is tracked or synced anywhere.

### Why there isn't more here
Mailzy has no accounts, so there's nothing to attach persistent per-user settings to — no profile, no saved addresses, no notification preferences, because none of that is stored on any server of ours to begin with. Options like a preferred mail provider, a custom polling interval, or a default retention length would all be reasonable things to offer eventually, but each one would need to live somewhere, and "somewhere" today means either your browser's local storage or an account system — the exact trade-off explained on the About page. If settings like that are added, this page is where they'll show up, and the Privacy Policy will be updated to say exactly what's newly stored and why.

### Mail provider
There's no provider toggle here because there's nothing to choose: mail.gw is always the priority provider, and the backup (Guerrilla Mail) only ever activates automatically, and only when mail.gw itself is unreachable. See How It Works for the full detail on that behavior.

### Clearing local data
Since the only thing Mailzy stores in your browser is the theme preference, clearing it is as simple as clearing this site's data from your browser's own settings — there's no in-app "delete my data" button because there's nothing else to delete.
