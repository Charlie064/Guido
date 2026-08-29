# 0004 — Cloudflare for hosting, domain, database, and account validation

## Status

Accepted (2026-08-29).

## Context

Two separate needs have come up that both point at the same candidate
platform:

- **Website track** ([website-v0.md](../planning/website-v0.md)): the
  hackathon submission site needs somewhere to be hosted, and a domain to
  be hosted at. It currently has no hosting/domain decision — out of scope
  was explicitly limited to "actual download hosting/build pipeline,
  account/login, pricing/payment pages," but *website* hosting itself was
  never assigned a provider.
- **Product backend** (future, per
  [ADR 0002](0002-agency-hybrid-vision-platform-business.md)'s subscription
  business model and [BL-001](../BACKLOG.md) saved skills): the product
  will eventually need user accounts and a database once it moves past a
  local-only hackathon demo. [CLAUDE.md](../../CLAUDE.md)'s MVP principle
  is explicit that this shouldn't be built until a real P0/P1 item needs
  it — this ADR is about picking a provider *if and when* that happens, not
  about pulling the timeline forward.

Cloudflare has been raised as a single provider that could cover all four
pieces: Pages/Workers for hosting, Cloudflare Registrar (or an existing
domain pointed through Cloudflare DNS) for the domain, D1 for the database,
and either Cloudflare Access or a Workers-based auth flow for account
validation.

## Answers to the open questions

- **Scope timing**: website deploys to Cloudflare now, independent of the
  product backend. Database work starts now too (see Database shape below)
  rather than waiting — narrow scope: waitlist only, not accounts/auth yet.
- **Domain**: no domain purchased yet. Ships on the free `*.pages.dev`-style
  subdomain Cloudflare assigns; a real domain is a later swap, not a
  blocker. Revisit once the team wants a real domain.
- **Account validation**: descoped for now to just a waitlist email-capture
  form on the website (D1-backed). Full product-side auth for paid
  subscriptions is a separate, later decision — not part of this rollout.
- **Database shape**: starts with the website waitlist only
  (`website/migrations/0001_create_waitlist.sql` — one `waitlist(email)`
  table). Product user accounts / saved skills ([BL-001](../BACKLOG.md))
  get their own schema work later, once a P0/P1 item needs them, per
  `CLAUDE.md`'s MVP principle.
- This is unrelated to the "provider not yet chosen" web-search item in
  [architecture/overview.md](../architecture/overview.md) (Cloudflare
  doesn't offer a web-search API) — noted so nobody conflates them.

## Decision

Accepted, and deployed. Cloudflare account "Guido" created and
administered by Charlie (update [reference/team.md](../reference/team.md)
if this changes). Scope: Workers + static assets for the website, D1 for
the waitlist table only. Live at
**https://guido-website.guidotutor.workers.dev/** — deployed and
verified end to end (waitlist form write confirmed in the real D1
database). Scaffold lives in `website/` (`wrangler.jsonc`, `src/index.ts`,
`migrations/`). Team members still need to be invited to the Cloudflare
account as members (not shared login) — not done yet.

Not yet decided, deliberately out of scope for this acceptance: a real
domain, full account/auth for paid subscriptions, and the product-side
database schema (accounts, saved skills). Revisit this ADR's Decision
section — as a superseding ADR, since this one is now accepted and
append-only — if/when those move forward.

## Consequences

- Cloudflare is now a real external dependency — Charlie administers
  billing/DNS/secrets access; see
  [reference/team.md](../reference/team.md).
- [website-v0.md](../planning/website-v0.md)'s "account/login" and "actual
  download hosting" stay out of scope as originally written — only the
  waitlist form and static hosting are in scope from this ADR.
- [architecture/overview.md](../architecture/overview.md) should eventually
  gain a persistence layer/section once the database scope grows past the
  waitlist table — not needed yet for this narrow acceptance.
