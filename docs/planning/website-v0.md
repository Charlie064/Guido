**Contract**
- Scope for the hackathon submission website. Owner: Pauline (secondary:
  Quentin — see [reference/team.md](../reference/team.md)).
- A plan, not a source of truth — graduates/archives per
  [meta/style-guide.md](../meta/style-guide.md). Check
  [STATUS.md](../../STATUS.md) for current status.
- Timing/dependencies on the technical track are in
  [overnight-plan.md](overnight-plan.md).

## In scope

- A single landing page: what Tutoria is, the Goal→Learn loop, Teach/Show/Do
  modes, key features. Source material is
  [philosophy/vision.md](../philosophy/vision.md) — adapt it, don't
  restate it independently (same content also exists as a one-pager built
  earlier this session; ask Charlie for it if useful as a starting point).
- A **Download** button/link, placed prominently (hero area).
  **The button itself is a placeholder for now** — no working download
  exists yet. Charlie will wire up the actual link (installer/build
  artifact) once there's something to download; until then it can point
  nowhere, to a `#`, or to a "coming soon" state. Don't block the rest of
  the site on this.
- Screenshot/clip slot for the actual working overlay, once Charlie has
  something to capture (see the Hour 5–7 website-track block in
  [overnight-plan.md](overnight-plan.md)).

## Explicitly out of scope

Actual download hosting/build pipeline, account/login, pricing/payment
pages (subscription model is a later decision — see
[ADR 0002](../decisions/0002-agency-hybrid-vision-platform-business.md) —
not needed for a hackathon submission site), blog/docs pages.

## Open question

Where the download will eventually point (which platform builds, hosted
where) is not decided — not blocking for now, flag it back to Charlie once
the site is otherwise ready so the placeholder can be swapped for a real
link.

Website hosting/domain (and, longer-term, product-side database/account
validation) has a candidate provider — see
[ADR 0004](../decisions/0004-cloudflare-infrastructure-proposal.md)
(proposed, not accepted). Doesn't block building the site itself.
