# Skills — tutorial generation, editing, and storage

**Contract** [partial]
- One goal → one chat → one stored **skill**. This doc answers
  [BL-001](../BACKLOG.md) (now removed from the backlog) and the
  "algorithm the agent uses to decide what to do at each step" item
  flagged undecided in [STATUS.md](../../STATUS.md).
- **What's built**: the UI shape (steps/substeps, blue-vs-pink origin,
  expandable path, per-step chat) in `spikes/tauri-overlay/src/sidebar.js`,
  driven by fixture data in `src/fake-skill.js`. **What isn't**: the
  Research call, substep generation, real replies, and any persistence —
  every substep below is currently hand-written fixture content.
- Implements the per-step mechanics of the
  Goal → Research → See → Guide → Do → Verify → Learn loop from
  [philosophy/vision.md](../philosophy/vision.md), inside the four-layer
  architecture in [architecture/overview.md](../architecture/overview.md).
- Builds on the region-capture model ([ADR 0003](../decisions/0003-capture-region-not-window-detection.md))
  and vision-first element location
  ([ADR 0002](../decisions/0002-agency-hybrid-vision-platform-business.md)) —
  the same `locate_element` call already validated in the demo-v0 spike
  (see [planning/demo-v0.md](../planning/demo-v0.md)) is reused for both
  live guidance and skill refresh.
- No screenshots are stored as part of a skill — see "What a substep
  stores" below. This is a deliberate scope limit, not an oversight: full
  screen-capture retention is exactly the non-negotiable
  [CLAUDE.md](../../CLAUDE.md) still has as an open TODO, and this design
  avoids forcing that decision.

## Session flow

1. **Setup** — launch the app, select the capture region (default: full
   screen; user can draw a smaller box). One-time, per session.
2. **Goal** — the user states what they want to accomplish, in chat
   ("how do I make a chart").
3. **Research** — one-shot, online, AI-assisted. Runs exactly once per
   chat, against the stated goal (not re-run per step). This is the
   expensive, highest-leverage call in the whole system: everything
   downstream is generated from its output, so its quality gates the
   quality of the resulting skill. Produces an ordered list of coarse
   top-level steps — not yet the fine-grained clicks.
4. **One goal per chat.** Wanting to do something unrelated (e.g. a pivot
   table, after asking about a chart) means starting a new chat, which
   runs its own Research pass and produces its own skill. No mid-chat goal
   switching.

## Per-step loop

When the user reaches a top-level step:

- The AI looks at the prior substeps' questions and results for context
  (compact, not the full transcript — kept small deliberately to hold
  token usage down) and generates a set of **AI-planned substeps** for
  this step, lazily, only when the step is actually reached. These render
  in **blue**.
- The user can ask free-form questions inline at any point ("I don't have
  any elements yet, where do I write rows and columns?"). Each such
  question becomes a **reactive substep**, created only because the user
  asked — the AI never generates these speculatively. These render in
  **pink**.
- A screenshot is **manually triggered** by the user pressing a button
  when they want the AI to look at the current screen — not fired
  automatically per substep.
- Advancing to the next top-level step is **manual** — the user decides
  they're done, not an automatic screen-diff/verify (that's roadmap P1
  item 12, not built here).
- The resulting blue/pink sequence is **user-editable**: steps judged
  unnecessary can be deleted before/after the fact. This pruning is what
  turns a raw Q&A trace into a clean, reusable skill — the step-by-step
  path is the valuable artifact, so editing it is a first-class action,
  not an afterthought.

## What a substep stores

No raw screenshots. Each substep is:

| Field | Purpose |
| --- | --- |
| `origin` | `ai` (blue) or `user` (pink) — drives the UI color, and doubles as a quality signal later: a step that accumulates a lot of pink substeps is a sign the original Research/plan under-specified it |
| `target_description` | Plain-text description of the UI element ("the Insert menu") — the durable, reusable fact; passed to `locate_element` on refresh |
| `instruction_text` | The bubble copy shown near the element |
| `action` | none / click / type / move-cursor / keyboard-shortcut |
| `last_known_bbox` | Cached pixel box from the last time this substep was located — a redraw hint, never trusted as ground truth |

`target_description` is the source of truth; `last_known_bbox` is a cache.
Coordinates don't survive a resized window, a different resolution, or a
scrolled/changed layout — only the text description does.

## Replay and refresh

- **Opening a saved skill is free.** The preview draws from each substep's
  `last_known_bbox` with no vision call — instant, no API cost. This is
  the default and the common case.
- **How that preview renders**: currently a schematic diagram inside the
  app panel (proportional box on a placeholder rectangle), not a box drawn
  over the real app — see the "Visual overlay" section in
  [architecture/overview.md](../architecture/overview.md) for why that
  changed and what it costs.
- **Refresh is opt-in**, per substep or for the whole skill: one button
  fires a single fresh `locate_element` call using the stored
  `target_description` against whatever is actually on screen right now,
  and updates `last_known_bbox`. Use it when the user knows something's
  changed (resized window, different resolution, an app update).
- This is deliberately smaller than a full live re-run: it re-anchors a
  box, it does not re-run Research or re-verify the whole plan.
- If a refresh can't locate the element, that failure is itself the
  signal — surface it as "navigate to \<X\> first" (often already implied
  by the substep's own `instruction_text`), rather than silently drawing a
  stale or wrong box.

## Open / deferred

- Gamification / mastery progress (unrelated, still open — see
  [BL-002](../BACKLOG.md)).
- Whether `target_description` needs any structured context beyond plain
  text (e.g. a page/section label) to make refresh more reliable on
  complex apps — not needed until refresh accuracy is actually tested.
- Full screenshot retention remains out of scope here, but is the same
  open non-negotiable `CLAUDE.md` already flags — revisit together, don't
  quietly reintroduce screenshot storage through this feature.
- Highlighting on the real screen (rather than the in-panel schematic) is
  unsolved — the constraint is that any real window over the target app
  blocks clicks into it. Until that's cracked, `last_known_bbox` and
  refresh are strictly about the schematic preview's accuracy, which
  lowers the practical value of refresh considerably (a rough diagram
  tolerates a stale box far better than a real on-screen box would).
  Worth reconsidering refresh's priority in that light.
