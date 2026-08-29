**Contract**
- A checklist of decisions and setup work Charlie can do **without Claude
  Code** (account creation, team decisions, writing plain prose into ADRs),
  for use when Claude Code usage is exhausted.
- A plan, not a source of truth — items graduate into ADRs/features and get
  deleted from here once decided/built, per
  [meta/style-guide.md](../meta/style-guide.md).
- Ordered roughly by what unblocks the most other work first.

## 1. Cloudflare — decide ADR 0004, then set up the account

[ADR 0004](../decisions/0004-cloudflare-infrastructure-proposal.md) is
proposed, not accepted. Nothing should be built against Cloudflare until
its open questions have real answers. This is pure decision-making — no
Claude Code needed, just edit the ADR's "Decision" section once you know:

- **Scope timing** — deploy the website to Cloudflare now, independent of
  product backend/database work? Or one combined rollout later?
- **Domain** — is there already a domain, or does this cover registering
  one? Whose account/billing owns it?
- **Account validation meaning** — email/password signup? OAuth via a
  third party? A waitlist email-capture form on the site? Full product
  auth for paid subscriptions later? Each answer picks different
  Cloudflare pieces (Workers+D1 vs. Access vs. third-party auth).
- **Database shape** — what does it store first: waitlist emails, product
  user accounts, or saved skills ([BL-001](../BACKLOG.md))? Affects
  whether D1 work starts now or waits.
- Who administers the Cloudflare account day to day — update
  [reference/team.md](../reference/team.md) once decided.

**Once decided**, account setup itself is manual, not coding:
1. Create/confirm the Cloudflare account and who has admin access.
2. Register or point the chosen domain at Cloudflare DNS.
3. If the website deploys now: create the Pages/Workers project (this part
   *can* wait for Claude Code — `wrangler` setup is scriptable — but the
   account/domain/billing steps above are not).

## 2. Product name — Guido vs. TutorialCue

Flagged as unsettled in `CLAUDE.md` and
[philosophy/vision.md](../philosophy/vision.md). This just needs a team
decision (and possibly a domain-availability check, which ties into item
1's domain question). Once picked, it's a mechanical find/replace Claude
Code can do later — the naming call itself doesn't need it.

## 3. Non-negotiables — screen-data handling

`CLAUDE.md`'s "Non-negotiables" section is a TODO. This was explicitly
deferred, not decided, per
[planning/mvp-roadmap.md](mvp-roadmap.md) context. Questions to resolve:

- Does captured screen content ever leave the local machine unencrypted
  (it currently goes to Claude's vision API as a screenshot — is that
  disclosed to users, and does it matter for a hackathon demo vs. a real
  product)?
- Any category of screen content that should never be captured (password
  fields, banking apps)? Is this enforced anywhere yet, or just a policy
  statement?
- Retention: are screenshots ever saved to disk/logs, or only held in
  memory for the single vision call? Worth stating explicitly even if the
  answer is "never persisted."

Answering these is writing prose into `CLAUDE.md`'s Non-negotiables
section — a text edit, not a coding task.

## 4. Do-mode opt-in — where does the toggle live?

Open item in `STATUS.md`. Global setting (set once, applies to every
session) vs. per-question (asked each time Do-mode would trigger)? This is
a product-design call — worth deciding before the UI for it gets built, so
it's a good one to settle while waiting on Claude Code.

## 5. Gamification mechanic — BL-002

[BL-002](../BACKLOG.md) is still "mechanic undecided (badges? streaks?
per-app mastery levels?)." Low priority (no P0/P1 item needs it yet per
`CLAUDE.md`'s MVP principle), but cheap to think through offline if there's
spare time.

## 6. Record the Tauri choice as a real ADR

Per `STATUS.md`, tonight's session re-confirmed Tauri (transparent overlay
worked cleanly on Wayland) but this was never a fresh, recorded decision —
it's an implicit continuation of an earlier spike. Writing the ADR itself
is prose: context (why Tauri was tried), decision (sticking with it),
consequences (platform support assumptions, packaging story for
macOS/Windows/Linux). No coding required, just needs someone who knows the
reasoning to write it down — see [decisions/README.md](../decisions/README.md)
for the ADR template/index.

## 7. Demo rehearsal (needs Claude Code, but prep doesn't)

The actual `npx tauri dev` rehearsal in `docs/planning/demo-v0.md` needs a
working session. But you can prep without one:
- Decide the exact fresh-VS-Code-Welcome-screen setup so the rehearsal
  doesn't burn time on environment fiddling once a session's available.
- Reread `docs/planning/demo-v0.md` and `docs/planning/website-v0.md` and
  flag anything that reads stale against tonight's `STATUS.md` update.

## 8. Skills feature — open design questions

[features/skills.md](../features/skills.md) has the algorithm designed but
not built. Re-reading it for gaps (edge cases in the lazy-substep
generation, what exactly a saved skill stores) is useful offline thinking
— but changing the doc's actual design is a judgment call worth doing with
the person who wrote it, not solo.
