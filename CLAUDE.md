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
   vision, ElevenLabs, provider TBD for search) can change without touching
   the controller.
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
  same commit. See `docs/workflows/development.md`.

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
| Website colors/type/components, for reuse in the app | `docs/features/website-design-system.md` |

Add rows here as `docs/features/`, `docs/schemas/`, etc. get their first
real content.
