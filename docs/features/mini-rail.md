# Mini rail — minimized per-step view

**Contract** [partial — built and iterated on 2026-09-02/03, not yet
click-tested against real AI content]
- Graduated out of [planning/minimal-step-mode.md](../planning/minimal-step-mode.md)
  (that doc's 5c "sticky rail" concept): built, but as a **second window
  state of the same `sidebar` window**, not an always-present in-panel
  overlay — see "Deviation from the plan," below. The planning doc stays
  as historical record of the design conversation; this doc is the
  source of truth for what actually exists. Entered by clicking a step
  in the step list (`view-path`); `openMinimizedSubstep()`/
  `closeMiniRailToMenu()` in `spikes/tauri-overlay/src/sidebar.js` own
  the transition both ways.
- Content is still fixture data (`fake-skill.js`) and the question/chat
  panel is fully faked (`sendMinimizedQuestion` — a canned reply on a
  timeout, no `answer_question` call) — see
  [skills.md](skills.md)'s per-step loop for what's real vs. fixture.
  This doc covers the *window/interaction* mechanics, which are real,
  not the AI content, which isn't yet.

## Deviation from the plan

`minimal-step-mode.md`'s 5c pictured the rail as a small persistent
surface layered over the app. What got built instead: the mini rail
**is** the `sidebar` window, resized down (see "Window sizing" below)
and stripped of its native titlebar, rather than a separate overlay
element. One real window, two states — "back to menu" (`closeMiniRailToMenu`)
restores the full size and the native titlebar; entering a step does the
reverse. This was a smaller build than a true second surface and reuses
all of `sidebar`'s existing window plumbing (always-on-top, decorations,
position), at the cost of the rail not being able to coexist on-screen
with the full-size panel — which the plan didn't actually require either
way.

## Window sizing and the "user defined expansion size"

Two source-of-truth numbers, both in `sidebar.js`:

- `MINI_RAIL_SIZE = [340, 148]` — the original fixed default.
- `MINI_RAIL_CHAT_SIZE = [340, 420]` — question mode's *default*, not a
  size it always snaps to (see below).

Before 2026-09-03 the window was forced back to one of these two exact
sizes on every render (every step change, every question-mode toggle),
so a manual resize was immediately undone the next time anything
happened. Now:

- `miniRailStepHeight` (module-level, starts at `MINI_RAIL_SIZE[1]`) is
  "the user defined expansion size" — the window's height while in
  non-question (step-only) mode. It's the only thing that persists
  across step navigation (‹/›) and toggling question mode, replacing the
  two-fixed-sizes behavior.
- A manual OS-level resize (dragging the window's edge) while *not* in
  question mode updates `miniRailStepHeight` via the window's
  `onResized` listener — guarded to ignore resizes while question mode
  is open or the mini rail isn't showing, so it only ever records a
  genuine step-only-mode drag, not one of `setMiniRailWindowState`'s own
  programmatic resizes. `onResized`'s payload is `PhysicalSize`; it's
  converted back to logical px via the window's `scaleFactor()` before
  being stored, since `setSize` elsewhere takes `LogicalSize`.
- Entering question mode targets `max(miniRailStepHeight, MINI_RAIL_CHAT_SIZE[1])`
  — a small stored size still grows to a usable chat height (420 by
  default), but a stored size already bigger than that stays exactly as
  it was; only the internal split between `.mini-rail-desc` and
  `.mini-rail-chat` changes (see "Layout," below), not the window.
  Leaving question mode (closing it, or navigating to another step,
  which always closes it — see `openMinimizedSubstep`) always reverts to
  `miniRailStepHeight`, discarding whatever question mode grew the
  window to.

### Layout

`.mini-rail-header` is a column flex container; `.mini-rail-desc` (the
step instruction text) is `flex: 1` inside it by default, so a window
resize in step-only mode flows straight into that box growing/shrinking
— nothing else in the header (`topbar`, `actions`) claims the extra
space, both are `flex-shrink: 0`. Once question mode opens
(`#mini-rail.chat-open`), `.mini-rail-header` itself drops to
`flex: 0 1 auto` and `.mini-rail-desc` to `flex: 0 1 auto; height: auto;
max-height: 140px` — growth now goes to `.mini-rail-chat`'s own
`flex: 1` instead, same auto-fit-up-to-a-cap behavior the description
box always had in question mode (a short question leaves history most
of the space, a long one leaves it less).

## No native titlebar while minimized

`setMiniRailWindowState` calls `setDecorations(false)` on entry and
`closeMiniRailToMenu` calls `setDecorations(true)` on the way back out.
Reasoning: the native OS titlebar (needed for the full-size panel's
WM-drag — see `STATUS.md`'s GNOME dragging history) reads as an
oversized, redundant second bar on a ~150px-tall minimized rail that
already has its own back/pin row. Since dropping the titlebar also
removes the OS's built-in way to move the window,
`.mini-rail-swipe-handle` (see "Timeline swipe," below) doubles as a
`data-tauri-drag-region` — hover the mini rail's top bar and drag that
pill to reposition it. **Unverified on Linux/GNOME**: the same
undecorated + always-on-top + `startDragging()` combination was
unreliable for the *full* window there in the past (see `STATUS.md`);
this reintroduces the mechanism at a smaller scope. See
[testing/manual-test-matrix.md](../testing/manual-test-matrix.md).

## Per-step timeline ("top node viewer")

`.mini-rail-timeline` — a node per step (green check: completed, the
Guido mascot mid-bob: current, gray: not reached), horizontally
scrollable, auto-scrolling the current node into view. Three ways to
scroll it:

- Mouse wheel, remapped from vertical to horizontal
  (`wheelScrollsHorizontally`) — an overflow-x-only element doesn't get
  that for free.
- A genuine two-finger trackpad swipe (deltaX-dominant) — left to native
  browser handling, untouched by the remap above.
- Pointer-drag (`dragScrollsHorizontally`) — click-and-drag (or a
  touch/trackpad drag Pointer Events unify with mouse drag, since there's
  no reliable way to tell a two-finger swipe apart from a one-finger
  drag from JS alone).

`.mini-rail-swipe-handle` — a small pill, hidden until the pointer is
anywhere over the top bar (not just over the handle itself), doubling as
the window-move handle described above.

## Step description overflow cue

`.mini-rail-desc`'s scrollbar thumb is faintly visible by default
(`rgba(0,0,0,0.14)`, not fully transparent until hover/scroll like the
timeline's) plus a small chevron (`.mini-rail-desc-more`) that only
shows when `updateMiniRailDescOverflow` (`sidebar.js`) measures real
content below the fold. Recomputed after every render, every resize
(manual or programmatic), and every scroll — a fade-to-white gradient
that stood in for the chevron until 2026-09-03 had a real bug where it
never recalculated on a window resize and could stay visible after a
resize made everything fit; replaced rather than patched, since the
underlying "the bottom bar should read as separate from the text" need
is now served by a real border/tint instead (next section).

## Chrome vs. content separation

`.mini-rail-topbar` and `.mini-rail-actions` both carry a `var(--sunken)`
background and a border (bled flush to the window edges via negative
margin matching `.mini-rail-header`'s own padding), so the step text
reads as a distinct middle panel between two visually separate chrome
strips, rather than blending into one undifferentiated block.

## Step chat input

`.mini-rail-inputbar`: text input, then two icon buttons, then Send.

- **Mic** (`#mini-rail-mic`) — icon only, deliberately **not wired to
  anything**. Styled to match `#new-goal-mic` (solid `var(--blue)`,
  white icon) — the *real*, wired mic on the home ask box, which drives
  a `MediaRecorder` session against Aqua Voice
  ([voice.md](voice.md)). Wire this one the same way when the step chat
  is ready for voice input.
- **Screenshot toggle** (`#mini-rail-screenshot-toggle`) — same
  per-question opt-in shape as `#chat-screenshot-toggle` in the full
  chat view (resets after every send). Tags the sent bubble (a small
  image icon) to show it was "included," and when `AI_MODE` (below) is
  on, is actually passed through to the real `answer_question` call as
  `withScreenshot` — a real capture then can happen. **Does not
  conflict with the "no screenshots stored" rule**
  ([skills.md](skills.md)): `answer_question`'s screenshot is used for
  that one AI call and discarded, same as the full chat view's identical
  toggle already does — nothing about this persists an image to disk.

### AI_MODE — real vs. fake, a dev toggle

`#profile-ai-mode` in the profile menu ("Use real AI (dev)"), backed by
`useRealAi`/`setAiMode` in `sidebar.js`, persisted in `localStorage`
(`guido_ai_mode`), default **off**. Added 2026-09-03 so the app's mix of
real and fake paths (see below) could be tested either way without
editing code. **Only gates `sendMinimizedQuestion` today** — flip it on
and the mini rail's question box calls the real `answer_question`
(same `answerContext`/`currentCaptureScope` pattern `#view-chat`'s
already-real question box uses) instead of its canned setTimeout reply.
Everything else is unaffected by this toggle:

- `#view-chat`'s question box, `verify_substep`, `locate_element` were
  already unconditionally real before this toggle existed — no fake
  mode to switch to.
- The home goal box (`submitNewGoalStub`) stays unconditionally fake
  regardless of this toggle, on purpose — `research_goal`/`research.py`
  still returns the old coarse `{title, brief, watch_for}`-per-step
  shape, not the flattened `instruction_text`/`target_description`/
  `action` shape this app's UI actually renders per step today (see 5f
  in [planning/minimal-step-mode.md](../planning/minimal-step-mode.md)).
  Wiring this one for real needs that backend shape migrated first — a
  real product/schema pass, not a toggle-wiring job. A lossy bridge
  mapping was considered and deliberately not built, since it risked
  silently half-breaking the schematic renderer instead of clearly not
  working.

## Cursor-related

See [cursor-control.md](cursor-control.md) for OS-level cursor movement
— unrelated to this window's own drag handling, but built in the same
session and worth cross-referencing if you're in this file looking for
it.
