# Website payment page — handoff plan

**Status: built, Stripe wired (BL-016).** `website/public/pricing.html`
ships the static page described below (option 1 — no router). Cloudflare's
asset serving already resolves `/pricing` → `pricing.html` the same way it
does for `/privacy` → `privacy.html` (`html_handling: auto-trailing-slash`,
the project default), so no Worker route was needed — a first attempt
added one anyway and hit a redirect loop (the Worker's own
`/pricing.html` fetch got canonicalize-redirected back to `/pricing`,
which the Worker was also intercepting); removed once the fallthrough
was confirmed sufficient.

Real checkout turned out to need a different shape than this plan
originally sketched: the website has no browser session (login is
desktop-only, see `docs/features/auth.md`), so a bare browser tab on
`/pricing` has no way to authenticate a checkout. Instead, the **desktop
app** calls `POST /api/billing/checkout` / `POST /api/billing/portal`
itself (it already holds the bearer token) and opens the Stripe-hosted
URL those return in the system browser — see `requestBillingRedirect` in
`spikes/tauri-overlay/src/sidebar.js`. `pricing.html`'s own CTAs stay
inert ("Open the app to upgrade") for a direct visit, since that's the
honest state for a session-less tab.

**For:** whoever builds the website `/pricing` page (a teammate or their
agent) — not the person requesting this plan. Written so you can start
without a scoping conversation first.

**Contract**
- The desktop app already links out to `https://guidotutor.com/pricing`
  from three places (`spikes/tauri-overlay/src/sidebar.js`'s
  `openWebsite`, wired to `[data-plan-target]` and `#pay-manage-btn` in
  `sidebar.html`'s `#view-pay`) — decided and locked in as part of this
  plan, so the URL below is not yours to change without updating that
  code too.
- Tier copy and numbers are owned by
  [business/pricing.md](../business/pricing.md) — this page displays
  them, it does not decide them. If a number here and there disagree,
  pricing.md is right and this page is stale.
- The auth/quota mechanism (Better Auth, `/api/me`, session tokens) is
  owned by [features/auth.md](../features/auth.md).

## What to build

One page: `GET /pricing` on the existing website Worker
(`website/worker/index.ts`, currently routes `/api/waitlist`,
`/api/auth/*`, `/api/me`, `/api/skills/start` plus static assets — add
`/pricing` alongside those, or let it fall through to the SPA/static
handler if you go the React-route path below).

Accepts an optional query param: `?plan=starter` or `?plan=plus`,
sent by the desktop app to say which tier the user was already looking
at when they clicked through. Use it to highlight/scroll to that tier —
don't require it; the page must also work with no query param (someone
just typing the URL, or a marketing link).

**Content — mirror pricing.md exactly, don't re-derive numbers here:**

| Tier | Price | What it includes |
|---|---|---|
| Free | $0 | 1 new skill, lifetime. No saved skills. |
| Starter | $12/mo | 30 new skills/month, then $0.25/extra skill. No saved skills. |
| Plus | $24/mo | Everything in Starter, plus saving skills to replay later. |
| Owner | — | Internal only — do not show this tier publicly. |

If pricing.md changes after you build this, the page is expected to go
stale until someone updates it — there's no live data binding required
for the numbers themselves (see "Implementation approach" below for
what *should* be live).

## What NOT to build (yet)

Superseded by the "Status" note above — both of these are now built. Left
as-is for the historical reasoning.

**No real checkout.** There is no Stripe account for this project yet.
`docs/features/auth.md`'s Deferred section and `pricing.md` are both
explicit that MVP billing is "hard-capped, plan flipped by hand in D1"
— this page should not collect a card number or pretend to charge
anyone. A tier's CTA can be a `mailto:` link, a "get in touch" form, or
simply inert with a "checkout coming soon" state — your call, as long
as it doesn't imply a charge that won't happen.

**No billing portal.** `#pay-manage-btn` in the desktop app also points
at this same `/pricing` URL for now (see the comment above it in
`sidebar.js`). A real "manage subscription" experience is a Stripe
**Customer Portal** — a session created server-side
(`POST /api/billing/portal` on the Worker, calling Stripe's API,
redirecting to the URL Stripe returns) — not a static page at all. Out
of scope for this plan; tracked as `BL-016` once there's a Stripe
account to build it against.

## Implementation approach (one real decision, left to you)

`website/src/App.jsx` currently renders `Landing.jsx` directly — no
router installed. Two ways to add `/pricing`:

1. **Static HTML**, same as `website/public/privacy.html` today (no
   React, no router, no build-step dependency). Lower risk, ships
   fastest, matches an existing precedent in this repo.
2. **A React route** (adds `react-router` or similar). More natural if
   the page should ever reflect *live* state — "you're signed in as
   x@y.com, currently on Starter" — which matters once real checkout
   exists and Stripe redirects back here with a result to show.

Recommendation: **start static**, revisit when Stripe lands and the
page needs to read `/api/me` or handle a checkout-result redirect. Not
a hard requirement — pick whichever you can ship correctly, since
nothing else in this plan depends on the choice.

## Before you can start

- **Nothing blocks the static content/layout** — pricing.md's numbers
  are final for MVP, the URL contract is locked in above, and the
  desktop app's three link-out points are already wired and will work
  the moment `/pricing` exists (they open successfully today; the page
  is just a 404 or falls through to the SPA until this ships).
- **Real checkout is blocked on a Stripe account** (test-mode keys are
  enough to build against) — don't wait on it to ship the page itself;
  land the static tiers first, wire Stripe as a separate follow-up once
  the account exists.
