# Skills — tutorial generation, editing, and storage

**Contract** [partial]
- One goal → one chat → one stored **skill**. This doc answers
  [BL-001](../BACKLOG.md) (now removed from the backlog) and the
  "algorithm the agent uses to decide what to do at each step" item
  flagged undecided in [STATUS.md](../../STATUS.md).
- **What's built**: the UI shape (steps/substeps, blue-vs-pink origin,
  expandable path, per-step chat) in `spikes/tauri-overlay/src/sidebar.js`,
  originally driven by fixture data in `src/fake-skill.js`. Demo
  substeps render as a fake overlay — a mini Excel window with a
  highlight box and a step textbox — placeholder for the real
  on-screen callout (see Visual overlay in
  [architecture/overview.md](../architecture/overview.md)). Also
  built: the Research call (`spikes/vision-detect/research.py`,
  invoked via the `research_goal` Tauri command in `lib.rs`); and
  the first real per-step AI-planned substep generation (`plan_step`
  command → `spikes/vision-detect/plan_step.py`, invoked lazily from
  `generateStepSubsteps` in `sidebar.js` — see "Per-step loop" below).
  **What isn't**: reactive user-question substeps, user-editable path,
  and any persistence — a chat's substeps still live only in memory for
  that session. App grouping (BL-004) is **faked** on the home screen:
  one “Excel chats” row opens the fixture skill; detection/icons from
  the OS are not wired.
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

1. **Home** — after Continue, a compact chats list grouped by app. Today
   that is a fixture “Excel chats” row (temporary Excel icon). Profile
   (top right) can sign in or attach a live Excel window for locate
   scope. Real OS app detection is still BL-004.
2. **Goal** — the user states what they want to accomplish, in chat
   ("how do I make a chart"). The demo skill is “Make a chart in Excel”.
3. **Research** — one-shot, online, AI-assisted. Runs exactly once per
   chat, against the stated goal (not re-run per step). This is the
   expensive, highest-leverage call in the whole system: everything
   downstream is generated from its output, so its quality gates the
   quality of the resulting skill. Never sees a screenshot — it only
   knows the goal — so its output is deliberately limited to goal-scoped
   facts (true regardless of what the user's screen looks like when they
   get there), not screen-specific detail like exact click targets.
   Produces an ordered list of coarse top-level steps, each with:
   - `title` — short step name
   - `brief` — one sentence on what the step accomplishes and why
   - `watch_for` — a UI-version caveat or pitfall worth flagging up
     front (e.g. "the ribbon may be collapsed"), or `""` if none

   Uses Claude's own `web_search_20260209` server tool rather than a
   separate search provider — this is what fills the "Web research"
   provider slot in
   [architecture/overview.md](../architecture/overview.md). That tool's
   dynamic filtering runs searches inside a code-execution wrapper under
   the hood, which is markedly more token-hungry than plain search;
   `research.py` caps it at `max_tokens=4096` and `max_uses=2` after a
   smaller budget was observed live to truncate before ever producing an
   answer (`max_uses` was 3 initially, trimmed to 2 for latency — a real
   call still returned a full multi-step answer). The client is built
   with `max_retries=0` and the call itself with `timeout=90`
   (`plan_step.py` similarly, at `timeout=60`): the SDK retries a timed-
   out request `max_retries` (2, by default) more times, so `timeout`
   alone doesn't bound the wait — a single stalled call silently became a
   270s+ one in testing (3 attempts × 90s each), and with the SDK's
   10-minute default timeout that's up to 30 minutes, indistinguishable
   from a real hang to the UI. With `max_retries=0`, a genuine stall now
   fails loud with a clear error at the bounded `timeout` instead.
4. **One goal per chat.** Wanting to do something unrelated (e.g. a pivot
   table, after asking about a chart) means starting a new chat, which
   runs its own Research pass and produces its own skill. No mid-chat goal
   switching.

## Per-step loop

**First real pass built** (`plan_step` command in `lib.rs` →
`spikes/vision-detect/plan_step.py`, called lazily by
`generateStepSubsteps` in `sidebar.js`). A step produced by Research
still renders with `generated: false` and locked until the user first
opens it — at that point `plan_step` runs once, scoped to just that
step's own `title`/`brief`/`watch_for` plus the overall goal, and the
result flips `generated` to `true` and populates `substeps` as AI-origin
(blue) rows. Not yet built from the fuller design below: the AI does not
yet look at prior substeps' Q&A for context (there's no prior substep the
first time a step is reached, and no mechanism to feed later ones back
in), and the path isn't user-editable yet.

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
| `last_known_bbox` | Cached box from the last time this substep was located — a redraw hint, never trusted as ground truth. `x0..y1` are fractions of the captured frame (`image_width`/`image_height`); `anchor` says whose frame that is — `{kind: "region"}` (today's only real path, a free-drawn/full-screen capture, [ADR 0003](../decisions/0003-capture-region-not-window-detection.md)) or `{kind: "window", label}` (a window-picked capture, not built yet — see [BL-005](../BACKLOG.md)/[ADR 0005](../decisions/0005-window-anchored-overlay-coordinates.md)) |

`target_description` is the source of truth; `last_known_bbox` is a cache.
Coordinates don't survive a resized window, a different resolution, or a
scrolled/changed layout — only the text description does. This is exactly
what [ADR 0005](../decisions/0005-window-anchored-overlay-coordinates.md)
scopes a fix for: on platforms with a live window handle (macOS, Windows,
Linux X11, Linux Wayland + a wlroots compositor — not GNOME/KDE's Wayland
sessions), a window-anchored bbox can be re-multiplied against the
window's *current* rect instead of going stale. Not built yet — refresh
(below) is still the only fix today, on every platform.

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
