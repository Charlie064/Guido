# Tutoria — Constitution

An AI software tutor: a desktop assistant (macOS, Windows, Linux) that
watches the user's screen, understands the application they're in, and
guides them — teaches, shows, or does — through the exact steps to
accomplish a goal inside that software. Not an autonomous computer-use
agent; the product is the guided-learning loop
**Goal → Research → See → Guide → Do → Verify → Learn**. See
`docs/philosophy/vision.md` and
`docs/decisions/0001-ai-tutor-not-computer-use-agent.md`.

Product name is "Tutoria" (working title, not finalized — see the naming
note in `docs/philosophy/vision.md`).

## Core principles (priority order)

1. **Teach, don't just automate.** Doing the action for the user is one mode
   (Do), not the default — Teach and Show must stay first-class.
2. **Adapt to the actual screen, not a script.** Plans are generated from
   research and re-checked against the real screen state after every step;
   never blindly advance a pre-written tutorial.
3. **Verify before continuing.** Each step's completion is confirmed by
   observing the new screen state, not assumed from the user's say-so.
4. **Keep providers swappable.** Vision, voice, and search are behind
   interfaces the agent controller calls — providers (currently Claude
   vision, Aqua Voice for speech-to-text, ElevenLabs for text-to-speech,
   provider TBD for search) can change without touching the controller.
5. **Don't overbuild the hackathon MVP.** No complex backend, accounts,
   billing, or long-term memory unless a P0/P1 item in
   `docs/planning/mvp-roadmap.md` actually needs it.

## Non-negotiables

TODO — none formally adopted yet. (Screen-data handling was considered and
explicitly deferred — see `docs/planning/mvp-roadmap.md` context; revisit
before shipping beyond a demo.)

## Workflow rules

- Branch naming: `claudev/<name>/<feature-name>`, where `<name>` is the
  person the work is for (e.g. `claudev/charlie/overlay-render`) — see the
  name → role table in `docs/reference/team.md`. Ask which person the
  session is working for if it isn't already clear from context. Teammates
  working outside Claude Code should run `scripts/new-branch.sh
  <feature-name>` instead of typing the branch name by hand.
- Conventional commits, subject line < 72 chars.
- Always ask before committing.
- Main only takes completed, tested merges.
- **Co-change rule**: a behavior change updates its one canonical doc in the
  same commit. See `docs/workflows/development.md`. A `git commit`
  triggers an advisory (non-blocking) hook reminder when behavior-bearing
  code is staged with no doc change alongside it
  (`.claude/hooks/doc-staleness-check.sh`) — treat that reminder as a
  prompt to check, not proof either way.
- **Staleness found mid-task, fix it inline.** If you (Claude) notice a
  doc has drifted from the actual code while working on something else —
  an ADR's decision was later reversed or superseded, a `BL-NNN` entry in
  `docs/BACKLOG.md` describes something since removed or changed,
  `STATUS.md` contradicts the repo's real state — fix it in the same
  turn, without asking first. Same carve-out as "small obvious fixes
  don't need a check-in" above: this is keeping an existing doc accurate,
  not a new decision. Still ask before a commit, per the rule above.
- **Handoff rule**: a plan written for someone else to build (not the
  person requesting it) goes in `docs/planning/<name>` and includes a
  "Before `<person>` can start" section listing exactly what access,
  accounts, or decisions have to come from someone else first — don't
  leave those as buried prose for the assignee to trip over. Any real
  open decision inside the plan (scope, tiers, which provider, etc.) is
  either answered by the requester before the doc is finalized, or is
  explicitly assigned as part of the assignee's own task — never quietly
  decided on their behalf. If the plan depends on undecided product scope
  that isn't specific to this one task, give it its own `BL-NNN` entry in
  `docs/BACKLOG.md` (checking for numbering collisions with any
  in-flight, unmerged branches) rather than folding it into the plan.

## Load map

| Task | Open |
| --- | --- |
| Run/test/build | `docs/workflows/development.md` |
| Understand a past decision | `docs/decisions/` |
| Current state / what's next | `STATUS.md` |
| Parking lot for future work | `docs/BACKLOG.md` |
| Writing or updating any doc | `docs/meta/style-guide.md` |
| Why the docs are structured this way | `docs/meta/documentation-system.md` |
| Product vision, positioning, target user | `docs/philosophy/vision.md` |
| Technical architecture (layers, providers) | `docs/architecture/overview.md` |
| MVP scope, priorities, demo script | `docs/planning/mvp-roadmap.md` |
| Why "AI tutor" over "computer-use agent" | `docs/decisions/0001-ai-tutor-not-computer-use-agent.md` |
| Do-mode opt-in, hybrid vision, platform, business model | `docs/decisions/0002-agency-hybrid-vision-platform-business.md` |
| Team roster, roles, branch-name prefixes | `docs/reference/team.md` |
| First demo scope, step-by-step build/test plan | `docs/planning/demo-v0.md` |
| Overnight plan across the whole team | `docs/planning/overnight-plan.md` |
| Website scope (Pauline) | `docs/planning/website-v0.md` |
| What to work on without a Claude Code session | `docs/planning/offline-planning-guide.md` |
| Skill generation/editing/storage algorithm | `docs/features/skills.md` |
| Adding a UI icon (check the pool first, don't redraw) | `spikes/tauri-overlay/src/icons.js`, gallery at `src/icons.html` |
| Guido mascot (Tuto) states, cursor buddy | `docs/features/mascot.md` |
| Website + desktop visual language | `docs/features/website-design-system.md` |
| Login, membership check, quotas | `docs/features/auth.md` |
| Voice input (speech-to-text), Aqua Voice | `docs/features/voice.md` |
| Claude vision proxy, screen-watching, sidecar packaging | `docs/features/vision.md` |
| Privacy policy, terms of service | `website/public/privacy.html`, `website/public/terms.html` — update these too whenever a change adds/removes a data type collected, a third party data is sent to, or billing terms |
| Membership pricing, Anthropic API COGS | `docs/business/pricing.md` |

Add rows here as `docs/features/`, `docs/schemas/`, etc. get their first
real content.
