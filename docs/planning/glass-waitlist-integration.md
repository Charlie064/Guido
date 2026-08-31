# Integrating `claudev/quentin/glass-waitlist` into the live line

**Contract**
- Answers "how do we get Quentin's intro animation / nav / waitlist back"
  (see [BACKLOG.md](../BACKLOG.md) BL-018, which this supersedes for the
  waitlist half — the pink `#{position}` counter BL-018 asked about lives
  entirely inside this branch, not somewhere separate to rebuild).
- Compares `claudev/quentin/glass-waitlist` (tip `d553600`, unmerged into
  `main` and into the current line) against the current branch's
  `website/` tree, file by file, and calls out where the two actually
  conflict vs. where glass-waitlist is a clean addition.
- This is a scope, not an implementation — nothing here has been merged.

## Why this is unmerged in the first place

`docs/planning/charlie/handoff-glass-waitlist-production.md` (written by
Quentin, 2026-08-30) declared this branch **production** and said not to
deploy from `main` over it. `7aa4811`'s commit message says the opposite
happened: the branch "never made it into the line that shipped to
production." Two more branches (`env-cleanup`, `pricing-page`) then grew
independently off `main` without glass-waitlist in their history, which is
why current `worker/vision.ts`, the Stripe billing work, and the AI proxy
routes exist on this line but not on glass-waitlist, and vice versa for
everything below.

## Clean additions — no real conflict

These exist on glass-waitlist and have no equivalent on the current line,
so pulling them in is additive:

- **`SiteChrome.jsx`** (`SiteHeader`/`SiteFooter`) — the shared nav with
  **How it works / Usecases / Pricing** links plus Download and Join-
  waitlist buttons, and a shared footer with sign-in/privacy/terms links.
  Today's `Landing.jsx` inlines its own nav with no Pricing link.
- **`Pricing.jsx` + `currency.js`** — a `/pricing` route: Free vs. Guido
  Pro cards with geo-detected currency (`/api/geo` on the worker side).
  Doesn't collide with `website/public/pricing.html` from BL-016's
  `pricing-page` branch — glass-waitlist's own handoff doc already drew
  that line: `/pricing` is this React marketing page, `/pricing.html` is
  Charlie's static desktop-billing copy, kept apart via
  `"html_handling": "none"` in `wrangler.jsonc`. Bring both branches in
  and this still holds.
- **`worker/internal-waitlist.ts`** + the `/internal/waitlist` and
  `/internal/waitlist/export` GET routes — a Cloudflare Access-gated
  admin view of signups. Nothing like it exists today; pure addition.
- **`Download.jsx`** — a standalone download-platform modal, cleaner than
  today's inline download button/modal state scattered across
  `Landing.jsx` (`c789de6`/`8dbe530`/`7aa4811`).
- **The real intro animation** — `IntroAnimation` with the mascot +
  orbiting cursor, a `guido.introSeen` localStorage flag (once per
  browser, not once per load), and a skip when landing on `#waitlist`
  etc. Today's `IntroAnimation` in `Landing.jsx` is a plainer stand-in
  (color-flip square + arcing cursor, replays every visit, no mascot).
- **The hero "freeze + bob"** — Quentin's `516894a` made the hero video
  settle on one frame and breathe 3px instead of looping; that's present
  in glass-waitlist's `Landing.jsx` but was later dropped even from
  glass-waitlist itself (`67b1f84` reverted it there too) — worth a
  product call on whether to bring back `516894a`'s version or leave the
  looping video as `67b1f84` and today's line both ended up doing
  independently.

## Real conflicts — need a decision, not just a merge

- **The waitlist itself.** Today's `Waitlist.jsx` (`7aa4811`) is
  deliberately the simple `name/email/phone/persona` shape, chosen
  *specifically* to avoid the schema change glass-waitlist's version
  needs. glass-waitlist's `Waitlist.jsx` (416-line diff) adds referral
  codes, an "apps you want to learn" step, and the position display —
  the actual feature the "pink #83" question was about. Taking it means
  taking the schema change `7aa4811` opted out of: see migrations below.
  This is very likely "the better one" per your framing — it's a strict
  superset of what's live, not a rewrite — but it's the one piece that
  isn't a drop-in.
- **Migration numbering collides.** Today's line: `0004` = voice usage,
  `0005` = vision usage. glass-waitlist's `0004` is
  `waitlist_apps_and_referral` (different content, same number) and its
  own tree independently has *two* files both prefixed `0005`
  (`0005_create_vision_usage.sql` and `0005_create_voice_usage.sql` —
  a collision glass-waitlist never resolved internally either, from the
  `af0a1cc` merge of Charlie's auth branch into it). Whichever schema is
  live in production D1 today already has `0001`–`0005` applied in
  *today's* order — glass-waitlist's migrations can't be replayed as-is
  without renumbering the referral one to come after, e.g. `0006`. This
  needs to happen by hand; wrangler won't do it for you and applying the
  wrong order against a live D1 database is not something to guess at.
- **`worker/vision.ts` — take the current line's version, not
  glass-waitlist's.** Real logic conflict: glass-waitlist's copy is
  strictly *older*. Current `worker/vision.ts` has fixes glass-waitlist's
  doesn't — proper `AbortError` handling so a timeout surfaces as "Claude
  request timed out after Ns" instead of a raw "operation was aborted"
  502, plus later cost-bounding work (`1cc84e7`/`806a4f4`, "bound cost by
  pixels not bytes"). Nothing in glass-waitlist's version is worth
  porting back — this file should come from the current line unchanged.
- **`Login.jsx` — stale, don't port as written.** It's the pre-
  [ADR 0008](../decisions/0008-better-auth-email-password.md) Google
  OAuth login page ("Same Google account the desktop app uses",
  `/auth/google/start`). ADR 0008 replaced that flow with Better Auth
  email+password specifically because Google's test-user allowlist
  blocked self-serve signup — reintroducing this page would reintroduce
  that exact problem. If a *website* sign-in page is still wanted (e.g.
  for the Stripe customer portal / "Manage" button the pricing handoff
  doc mentions), it needs to be rebuilt against Better Auth, not copied
  from here.
- **`App.jsx` routing model.** Today's `App.jsx` always renders
  `Landing`. glass-waitlist path-routes `/`, `/login`, `/pricing`,
  `/waitlist` (deep-linking straight into the waitlist overlay). Bringing
  in `Pricing.jsx` needs this routing back, but drop the `/login` route
  per the point above until a Better-Auth version of that page exists —
  otherwise the router points at a page that reintroduces the OAuth flow
  ADR 0008 killed.
- **`wrangler.jsonc`.** Small and additive, not really a conflict:
  glass-waitlist adds `account_id`, `"html_handling": "none"`, and
  extends `run_worker_first` to cover `/auth/*` and `/internal/*`. All
  three are needed for the pieces above (Better Auth routes, the static
  `/pricing.html` split, the admin view) and don't touch anything the
  current line depends on.

## Recommended integration order

1. **Migrations first, alone.** Renumber glass-waitlist's
   `waitlist_apps_and_referral` migration to land after current `0005`,
   apply it, confirm `worker/db/schema.ts`'s `waitlist` table matches.
   Nothing else here depends on the UI pieces landing in any particular
   order, but this one has to be right before any of the waitlist code
   that reads/writes the new columns ships.
2. **Waitlist.jsx + the position/referral worker changes** together,
   against the now-updated schema. This is the piece closest to what was
   actually asked about, and is self-contained once the schema exists.
3. **SiteChrome + intro animation + Download.jsx** into `Landing.jsx` —
   mostly additive UI, lower risk, and this is what actually answers
   "the site is missing animations."
4. **Pricing.jsx + currency.js + `/api/geo` + `App.jsx` routing**, minus
   the `/login` route, once the above is stable.
5. **`worker/internal-waitlist.ts` admin routes** whenever — fully
   independent of everything else, lowest risk, can go first or last.
6. Leave `worker/vision.ts` untouched throughout — never pull
   glass-waitlist's copy over the current one.

## Before starting

- Confirm what's actually applied to the live `tutoria-website` D1
  database today (`0001`–`0005` per the current line, presumably) before
  touching migrations — this plan assumes that, doesn't verify it.
- Decide whether a website `/login` page is wanted at all before step 4;
  if yes, that's new work (Better-Auth-based), not a port.
- Decide on the hero freeze/bob (`516894a`) call named above — product
  taste question, not a technical one.
