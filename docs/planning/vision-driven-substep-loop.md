# Guide → Do → Verify: the substep confirmation loop

**Contract** [partial — backend built and tested, UI not wired]
- Scoping pass from a live design conversation with Charlie (2026-08-29),
  revised the same night after a second conversation reprioritized it:
  **overlay/callout positioning and auto-locate-on-entry are deferred;
  the Guide → Do → Verify confirmation loop is the actual priority** —
  it's more central to the product than where a highlight box is drawn,
  and (per Charlie) likely cheaper to build than it looked at first.
  Section "Direction change" below is the current design; sections above
  it are kept for the parts still valid, but read the newer one as the
  one that governs.
- A plan, not a source of truth — graduates into
  [features/skills.md](../features/skills.md) + an ADR once built, then
  gets deleted per [meta/style-guide.md](../meta/style-guide.md). Check
  [STATUS.md](../../STATUS.md) for current status.
- Extends the per-step/per-substep model in
  [features/skills.md](../features/skills.md)'s "Per-step loop" — read
  that first; this doc only covers what changes.

## Direction change: Verify is the priority, not the overlay

The original framing below ("vision-driven substep loop") treated
screenshot-informed planning, auto-locate-on-entry, and smarter callout
placement as one bundle. Charlie's follow-up reprioritized: **the thing
that actually matters is that Tutoria can check the user's work itself,
instead of trusting a "Done" click** — this is the literal
Guide → Do → **Verify** step from
[philosophy/vision.md](../philosophy/vision.md)'s loop, and it's been
sitting unbuilt (`docs/features/skills.md`'s "Per-step loop" already
flagged advancing as "manual — the user decides they're done, not an
automatic screen-diff/verify... roadmap P1 item 12, not built here").
Everything about callout placement (Section 4, below) and auto-locate
firing on substep entry (Section 3) is **explicitly deferred**, not
cancelled — left in this doc because the reasoning still holds, just not
now.

### What's already built (this session, verified with real API calls)

- **`plan_step` now generates `expected_outcome` per substep** — one more
  field in the same call, no extra API cost. Tested live against
  Charlie's own Excel example ("create rows and columns for x and y"):
  produced checkable claims like *"The Name Box displays the selected
  range address (e.g., A1:B10)"* — specific enough to actually verify
  against a screenshot, not vague. See `plan_step.py`.
- **`verify.py` / `verify_step.py`** — a new vision call, structurally
  `locate.py`'s twin: same image-plus-context-prompt shape, but answers
  "does the screen now match this expected state" instead of "where is
  this element." Returns `{"matches": bool, "observed": str}`. Tested
  live, twice, over real portal-captured screenshots of this actual dev
  machine:
  - Binary presence/absence case (is there a crash dialog): correct both
    ways, with accurate, specific `observed` text.
  - **Value-reading case** (does the system clock read ≈21:33 vs. ≈04:15):
    correctly read the exact time off a small taskbar clock and matched/
    rejected accordingly. This is the harder, more relevant test — it's
    the same kind of check as "Exposure ≈ +0.5," not just "is a dialog
    present."
- **`verify_substep` Tauri command** (`lib.rs`) — same
  hide-sidebar/resolve-scope/shell-out/show-sidebar shape as
  `locate_element`, `async fn` + `spawn_blocking` from the start (no
  repeat of the earlier main-thread-blocking bug). Compiles clean. Not
  yet wired to any UI — that part is blocked on another session actively
  editing `sidebar.js`/`sidebar.html` concurrently tonight.
- **Bug fixed in passing**: `PlannedSubstep` (the Rust struct
  `plan_step`'s JSON return gets deserialized into) didn't have an
  `expected_outcome` field, so serde would have silently dropped it on
  the way to JS — `plan_step.py` could produce it correctly and it would
  still never reach the UI. Fixed before it became a "why is this always
  empty" bug.

### The confirmation loop, as designed

Per substep (not per top-level step — see the granularity note below):

1. **Guide**: the substep's `instruction_text` is shown, same as today.
2. **Do**: the user does the thing on their own screen. Nothing watches
   passively; there's no polling.
3. **Confirm**: the user presses a manual confirm control when they
   believe they're done — same trigger model as today's target-icon
   locate (a button, not a background poll; Charlie explicitly chose
   this over auto-polling for cost/pacing reasons). At that point they
   have two options:
   - **Self-confirm**: just mark it done, no AI call, trusted like today.
   - **AI verify** (optional, not mandatory every time): fires
     `verify_substep` with that substep's `expected_outcome`, gets back
     `{matches, observed}`.
4. **On a verify match**: proceed — same as a self-confirm, just with
   evidence behind it.
5. **On a verify mismatch**: show both sides — what was expected, what
   was actually observed (`"Expected: Exposure ≈ +0.5" / "Observed:
   Exposure = +0.2"`) — substep stays open, **no auto-advance**. The user
   can retry (do the thing again, re-confirm) or **ask for help**, and
   that question becomes a normal **reactive (pink) substep** — the
   mechanism already exists (`sendChatMessage` in `sidebar.js`, `origin:
   "user"`), this just becomes a real entry point into it instead of a
   dead-end error message. The failed verify's `observed` text is good
   context to hand to whatever answers that follow-up, once follow-up
   answers stop being the `nextCannedReply()` fixture they are today.
6. **Advancing to the next top-level step is gated on the current one
   being confirmed** — this is the actual "next step has no information
   until you let it verify" part of the ask. Concretely: `plan_step` for
   step N+1 doesn't fire the moment step N's substeps exist; it fires
   once the user has confirmed (self- or AI-verified) their way through
   step N. **The screenshot taken during the last substep's AI verify —
   when one was run — becomes the input for step N+1's plan_step call**,
   rather than firing a second, separate, redundant capture. This is
   what actually answers the earlier open question ("does vision-aware
   plan_step apply to every step or just the first") from the original
   framing below: it applies to every step, for free, sourced from
   whichever verify call happened most recently, not from a bespoke
   step-entry screenshot mechanism.

**Granularity note (my interpretation, flag if wrong):** the ask reads as
per-substep confirm/verify, with the step-level gate being "the step's
substeps have all been confirmed," not a single verify covering an
entire step's worth of work at once. If a step's *last* substep is the
one whose verify screenshot seeds the next step, that only works cleanly
if verify was actually run there — a step confirmed via self-confirm
only (no AI verify anywhere in it) has no fresh screenshot to hand
forward, and step N+1's `plan_step` would need to fall back to a plain
capture at that point instead. Worth confirming this reading before
building the state machine around it.

### What this changes about earlier cost math

The original framing (Section on "Cost and latency" below) worried about
auto-locate firing once per substep on entry, uncapped. **This design is
cheaper**: verify only fires when the user explicitly asks for it, at
most once per substep-confirm — same cadence as today's manual locate
button, not a new multiplier. `pricing.md`'s "5 vision calls per step"
planning number absorbs this without needing to be re-derived, since
verify and locate are the same *kind* of cost (one vision call, user-
triggered), just a different question asked of the model.

### Suggested build order (supersedes the phasing section below)

1. ~~Callout left/right placement~~ — done, but deprioritized; not on the
   critical path for this.
2. ~~Per-skill capture scope~~ — paused mid-build when the sidebar.js
   collision was discovered; the `currentCaptureScope()`/
   `deriveScopeFromGlobals()` split already landed and is compatible with
   whatever the other session converges on, but the UI side (moving the
   picker into goal creation) isn't done.
3. ~~`expected_outcome` + `verify_substep`~~ — done, tested.
4. ~~Wire confirm+verify onto the chat view~~ — done. **"Check my work"**
   per substep (`verifyHtml`/`data-verify` in `sidebar.js`) calls
   `verify_substep` and renders expected-vs-observed inline; a mismatch
   shows an **"Ask for help"** button that prefills the chat input,
   handing off into the existing reactive-substep path. A separate
   **"Next step"** button (`#step-advance`) is the plain self-confirm
   advance — deliberately *not* gated on verify having run anywhere in
   the step, per the resolved open question 2/5 below. Also fixed in
   passing: `generateStepSubsteps` built substeps from `plan_step`'s
   response without copying `expected_outcome` onto the stored object,
   so the button would never have had anything to check against — caught
   before it shipped as a "why is Check my work never showing" bug.
   Not yet exercised in a running app (no way to drive the GUI from this
   environment) — verified by build/syntax checks and re-reading the
   wiring, not a live click-through.
5. **Deferred to [BL-011](../BACKLOG.md), not built**: gating
   `generateStepSubsteps` for the *next* step on the current step's
   confirmation state, and threading a verify screenshot through as that
   call's vision input. Resolved (2026-08-29) to the simpler "skip"
   answer instead — a step confirmed via plain "Next step" (no verify
   anywhere in it) leaves `plan_step` text-only for the step after it,
   same as today, rather than deriving a forced screenshot. Relative/
   before-after checks specifically (the actual reason a before-state
   was wanted) are BL-011's proper scope, not built as part of this pass.
6. Auto-locate-on-entry, callout placement, and per-skill capture scope
   pick back up whenever they're actually prioritized again — nothing
   above depends on them.

---

## Original framing (2026-08-29, earlier the same night — partly superseded above)

Kept for the parts still valid: the "Current state" grounding, the
callout-placement design (built, just deprioritized), and the cost/
screen-data considerations, which still apply to whichever pieces of
this actually get built.

### The ask, restated

Today, generating a step's substeps (`plan_step`) is text-only — it never
looks at the screen. Locating an element (`locate_element`) is a separate,
manual action the user triggers per substep. The proposal collapses this
into one continuous loop grounded in the real screen at every stage:

1. Picking a capture scope (window or screen) becomes a required part of
   starting a goal, not an optional one-time app setting.
2. The first step's substep generation takes a screenshot of that scope
   and plans against what's actually on screen, not just the goal text.
3. Entering a substep automatically screenshots-and-locates — the user no
   longer presses a button to find out where something is; it's already
   there when they arrive. **(Deferred — see Direction change, above.)**
4. The resulting coordinates position a callout (not just a highlight
   box) whose side (above/below/left/right) is chosen so it doesn't run
   off-screen or cover the target. **(Built, deprioritized.)**
5. The action a substep asks for (click / type / keyboard shortcut / the
   AI performing it) is chosen by the model per substep, based on what's
   actually more effective for that UI in that moment.

### Current state (what's actually true today, for contrast)

- **Capture scope is a one-time, optional, session-wide setting.**
  Picked once in the `setup` view (`selectWindow`/`selectPortalSource` in
  `sidebar.js`), stored in module-level `selectedWindow`/`portalPick` —
  not attached to any particular skill. Skipping "Select window" /
  "Choose source" defaults to full-screen capture. A parallel change
  tonight (another session) is already moving this toward a two-step
  home gate (goal + window pick, either order) — check its state before
  building anything here that assumes today's setup-only flow.
- **`plan_step` is text-only, except for `expected_outcome` (new,
  tonight)** — still no image sent, but now also asks for what success
  looks like per substep. See "What's already built," above.
- **`locate_element` is manual and per-substep**, fired by the target
  icon (`data-locate` in `sidebar.js`'s `renderChat`). Takes an optional
  `context` string (goal, step brief/watch_for, other substeps already
  covered this step — see `locateContext` in `sidebar.js`) alongside the
  screenshot, added tonight. Nothing calls it automatically; a substep's
  `last_known_bbox` is `null` until the user presses the icon.
- **Callout placement is already screen-edge-aware on all four sides** —
  `placeCallout()` in `overlay.js` (added tonight) tries below, then
  above, then right, then left, falling back to a clamped below
  placement only if none fit. Pure geometry, no AI.
- **`action` is already an AI-chosen field**, and now sits alongside
  `expected_outcome` in the same substep object — `plan_step.py`'s
  prompt already asks for one of `none/click/type/move-cursor/
  keyboard-shortcut` per substep. Nothing currently *does* anything with
  `move-cursor`/`keyboard-shortcut` beyond rendering the word.
- **No autonomous action exists anywhere.** Do mode (the AI operating
  mouse/keyboard) is scoped in
  [ADR 0002](../decisions/0002-agency-hybrid-vision-platform-business.md)
  as **opt-in**, with "where the toggle lives" still an open item in
  `STATUS.md`. The ask's "perhaps perform the action itself" is Do mode
  by definition and stays explicitly out of scope here — see the
  original reasoning below, unchanged.

### Callout placement (built)

`draw()` in `overlay.js` now calls `placeCallout()`, which tries below,
then above, then right, then left — whichever side actually has room —
before falling back to the old clamped-below placement if the target
roughly fills the screen. Pure geometry against four available-space
measurements; unit-tested against five scenarios (middle, bottom-edge
flip, top-left corner, top-right corner, fullscreen-element fallback),
all correct. No AI decision needed here, and none was added.

### AI-chosen action type

The data model and the generation prompt already do this. What would be
*new* is acting on `move-cursor` and `keyboard-shortcut` beyond printing
the words:

- **`move-cursor`** — an animated cursor indicator. Explicitly wanted,
  not dropped, but deferred to the backlog:
  [BL-010](../BACKLOG.md). Worth noting why it's a good deferred pick,
  not just a deprioritized one — it's a **lighter, less fragile** way to
  point at something than a highlight box: a box drawn a few pixels off
  reads as broken, an animated cursor drifting toward the right
  neighborhood still reads as "over there." Same instinct as
  deprioritizing overlay/callout work generally, just not framed as
  overlay work itself.
- **The AI performing an action itself** — Do mode (ADR 0002), which
  needs its own design pass against that ADR's already-open "where does
  the toggle live" question, not a side effect of substep generation
  getting smarter. Not backlogged as its own item; ADR 0002 already owns
  this open question.

### Cost, latency, and screen-data handling

See "What this changes about earlier cost math," above, for the current
(cheaper) picture. The screen-data point still holds in general — more
automatic screenshots is exactly the shape of change
[CLAUDE.md](../../CLAUDE.md)'s still-open non-negotiable was flagged
against — but this design's screenshots are all user-triggered (a
verify press, same as today's locate press), not a new automatic-capture
frequency, so it doesn't add a new category of exposure the way
auto-locate-on-entry would have.

## Open questions (updated) — resolved 2026-08-29 unless marked

1. **Granularity** — per-substep confirm/verify with a step-level
   advance-gate (this doc's working interpretation), or something
   coarser? Flagged above; confirm before building the state machine.
   **Still open** — the answers below assume the per-substep reading but
   this hasn't been explicitly confirmed.
2. **Resolved: skip.** A step confirmed via self-confirm only (no AI
   verify anywhere in it) means step N+1's `plan_step` stays text-only,
   same as today — no fallback screenshot is taken just to keep every
   transition vision-grounded. Simpler, and it means a screenshot only
   ever happens as a direct consequence of the user pressing verify,
   with no derived/implicit capture anywhere in the chain.
3. Per-skill or still-global capture scope — still open, now entangled
   with the other session's home-flow rework; needs a fresh look once
   that settles.
4. Does a failed verify's "ask for help" follow-up get real AI answers,
   or does it still land on `nextCannedReply()`'s fixture text? (The
   reactive-substep mechanism it plugs into is real; the answer behind
   it isn't yet — see `docs/features/skills.md`'s existing gap.)
5. **Resolved: two buttons, absolute checks only for now.** The confirm
   control is two side-by-side actions per substep — a plain advance
   button (labelled **"Next step"**) and a separate **"Check my work"**
   button that runs `verify_substep` and shows expected-vs-observed
   before letting the user advance. Charlie caught a real design
   contradiction working through the exposure example — a *relative*
   check ("exposure increased from before") needs a before-screenshot,
   which can only be taken at a substep's *start*, contradicting Verify's
   whole premise that a screenshot only happens on a manual, at-the-end
   confirm/verify press. Resolved by scope, not by solving the
   contradiction: **this build only supports absolute checks**
   ("Exposure ≈ +0.5"), which need only the after-screenshot and have no
   such conflict. Relative/before-after checks are split out to
   [BL-011](../BACKLOG.md), including a sketch of the likely
   answer (reuse a *previous* substep's verify screenshot/observed-text
   as an opportunistic baseline, rather than add a new automatic
   step-start capture) — not decided, not building it now.
