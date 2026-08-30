# Status

High-churn snapshot of what exists and what's next. Kept out of `CLAUDE.md`
deliberately — that file should stay stable.

_Last updated: 2026-08-29 (overnight session, Charlie's technical track)_

## What exists

- Repo scaffolded with the documentation system (constitution + load map,
  ADRs, backlog).
- Product vision, technical architecture, and MVP roadmap written up
  (`docs/philosophy/vision.md`, `docs/architecture/overview.md`,
  `docs/planning/mvp-roadmap.md`).
- ADR 0001: positioned as an AI tutor, not a computer-use agent; Claude
  vision and ElevenLabs adopted as preliminary providers.
- ADR 0002: Do-mode opt-in, hybrid accessibility+vision screen
  understanding, Linux-first/all-platforms-day-one, subscription business
  model, voice covers input (STT) as well as output.
- `CLAUDE.md` core principles drafted (first pass, from the vision doc).
- **demo-v0 Phase 0 (vision detection spike) — done.** Target app/goal
  locked: **VS Code**, goal "get started with a project" (Open Folder /
  Clone Repository / Search bar). `spikes/vision-detect/detect.py` sends a
  saved screenshot + target description to Claude vision
  (`claude-sonnet-5`) and gets back a pixel bounding box. Tested against a
  real VS Code Welcome-screen screenshot across 4 distinct elements — 4/4
  landed correctly. Exit criterion met.
- **demo-v0 Phase 1 (live overlay) — core mechanics validated, not fully
  rehearsed.** `spikes/tauri-overlay` (Tauri v2, restored from the
  `claudev/charlie/tauri-overlay-spike` branch, which had validated the
  transparent/always-on-top/borderless window on this Wayland/Hyprland
  setup) now has:
  - A Rust command (`locate_element`, `src-tauri/src/lib.rs`) that shells
    out to `spikes/vision-detect/live_step.py`.
  - `live_step.py`: live screen capture via **grim** (Wayland-native;
    `mss`, the originally-planned library, returns a blank black image
    under this Wayland/XWayland setup — it only works on X11 — so grim is
    now the primary path with mss kept as an X11 fallback), then the same
    vision-location call as Phase 0.
  - **Verified live, end to end:** `npx tauri dev` launched a real
    transparent/always-on-top window sized to the actual screen; it called
    into the Python live-capture pipeline and rendered a box + bubble at
    the returned coordinates. Rust side (`cargo check`) compiles clean.
    **Superseded by the UI rework below** — the full-screen highlight
    window this used no longer exists, so the box/bubble rendering is gone
    even though the `locate_element` → `live_step.py` pipeline it proved
    still works.
  - **Not yet verified:** keyboard-advance through all 3 steps (no
    synthetic-input tool available in this environment — needs a real
    keypress) and accuracy against the actual VS Code Welcome screen live
    (tonight's live test ran against whatever was actually on screen,
    which already had a project open, not the Welcome state the hardcoded
    steps assume — so the box was a plausible-looking guess, not a real
    hit/miss data point). **Before rehearsing the demo: open a fresh VS
    Code window at the Welcome screen (no folder open) and re-run.**
  - Two ad hoc live-capture accuracy spot checks against this dev screen
    (not the target app) missed — a reminder that a busy/scrolling desktop
    is a harder scene than the clean Welcome screen Phase 0 was tuned
    against.
  - API spend tonight: ~7 vision calls (4 Phase-0 saved-screenshot tests +
    2 live-capture spot checks + 1 live overlay run), all
    `claude-sonnet-5` single-image calls — a few cents total, well inside
    the $6 overnight budget.
  - **Framework choice**: continuing with Tauri (the spike's transparent
    overlay approach worked cleanly on Wayland) rather than picking fresh
    tonight. Still worth a real ADR recording this once the team's awake,
    per the original "pick the desktop app framework" item below.

- **UI rework: one-window app shell with the skills/steps/chat flow —
  built, over fixture data.** Supersedes the multi-window overlay design
  above. See the "Visual overlay" section in
  `docs/architecture/overview.md` for the full rationale.
  - **Windows cut from 5 to 2.** Everything (collapsed icon, login, region
    setup, skills list, step path, step chat) is now one `sidebar` window
    that resizes itself between an 80×80 icon and a 380×560 panel.
    `region-select` (transient region-drag surface) is the only other
    window. Deleted: `index.html`, `main.js`, `icon.html`, `icon.js`,
    `app.html`, `app.js`.
  - **No on-screen overlay at all anymore.** Any real window over the
    target app blocks clicks into it, so highlighting is now a schematic
    diagram *inside* the sidebar's chat view (proportional red box on a
    placeholder rectangle), not a box drawn on the real screen. **This
    means the "point at the real element" promise in
    `docs/philosophy/vision.md` is currently not delivered** — a known,
    deliberate trade-off, flagged for revisit.
  - **UI flow implemented**: login (placeholder, no auth) → setup (region
    picker) → skills list → step path (expandable step nodes, blue
    AI-substeps vs. pink user-question substeps, locked "not generated
    yet" steps) → step chat (bubbles per substep, working input that
    appends a new pink substep with a canned reply). Matches the substep
    model in `docs/features/skills.md`.
  - **Content is fixture data** (`src/fake-skill.js`), not AI output — no
    API calls in this flow. The `locate_element` pipeline is still wired
    and compiles, just not called from the new UI yet.
  - **Sidebar is excluded from vision screenshots**: `locate_element`
    hides it around the capture and re-shows it even on error, so no call
    site has to remember.
  - Two real platform bugs found and fixed while building this, both
    documented in `src-tauri/src/lib.rs`: Tauri's `setSize()` silently
    no-ops on an anchored layer-shell surface (needs a hide → GTK resize →
    show cycle, verified via `hyprctl layers`), and calling GTK directly
    from a `#[tauri::command]` handler crashes intermittently because
    those don't run on the GTK thread (needs `run_on_main_thread`).
  - **Verified live**: launched, confirmed the collapse/expand resize at
    the compositor level, and screenshotted each view through the whole
    flow including the schematic preview.

- **Collapsed icon: fixed size, drag-to-move — built and verified.** Fixes
  the icon appearing to "zoom and drift" during normal use. Root cause
  (confirmed by reproducing on the untouched pre-fix code): `resize_sidebar`
  only called `gtk_window.resize()`, which sets a size but doesn't pin it —
  the WebKitGTK webview child re-requests its own ~200×200 natural size on
  its next layout pass, and the unconstrained `GtkWindow` renegotiates back
  to that, which is what looked like unprompted zooming. Fix:
  `gtk_window.set_size_request()` now pins a hard floor+ceiling before every
  resize (and once at startup, before the first `show()`, to kill the same
  flash on load) — verified via `hyprctl layers` holding steady at exactly
  80×80 across repeated checks, where the unfixed build drifted to 200×200
  within seconds every time.
  - Position isn't persisted across restarts yet — tracked as a follow-up,
    not done here.
  - Branch: `claudev/charlie/draggable-icon`, not yet merged.

- **GNOME tested — icon couldn't be moved (Hyprland-only mechanism), fixed
  by dropping sidebar's layer-shell promotion entirely.** Confirmed
  empirically, not assumed: capturing this app's own real
  `WAYLAND_DEBUG=1` Wayland registry dump on a GNOME/Mutter session showed
  zero `zwlr_*` globals — Mutter never advertises `wlr-layer-shell` at all
  (a deliberate GNOME position, not a version gap), so the `move_sidebar`
  command described above (margin-rewriting on a layer-shell surface) had
  nothing to act on there.
  - First fix tried: drop `sidebar`'s layer-shell promotion, keep it
    always-on-top+undecorated, and drag via Tauri's native
    `startDragging()` (an interactive `xdg_toplevel` move) instead of the
    deleted `move_sidebar` IPC command. **Still didn't move on a live
    GNOME test** — `startDragging()` on this always-on-top+undecorated
    combination did not behave reliably here, despite being the
    documented/supported mechanism in principle.
  - **Second, working fix: make `sidebar` a plain decorated window,
    `alwaysOnTop: false`.** No more custom drag code anywhere — the
    window manager's own titlebar drag handles it, same as any other
    app window, on every platform. `sidebar.js`'s entire pointer-drag
    block is gone; the icon is now a plain `click` → expand. Trade-off,
    accepted: `sidebar` is no longer forced above other windows, and on
    tiling compositors (Hyprland/Sway) it can now be auto-tiled into the
    workspace layout instead of floating.
  - Icon start position pinned to the literal top-left corner (`(0, 0)`
    in `tauri.conf.json`).
  - **Separate, bigger finding: `grim` (the live-capture backend) is
    completely broken on GNOME**, independent of any windowing choice —
    tested directly (`grim test.png`) and got `compositor doesn't support
    the screen capture protocol`. `grim` needs `wlr-screencopy`, the same
    wlroots-only protocol family as `wlr-layer-shell`; GNOME's Mutter
    implements neither. This means `locate_element`'s vision pipeline
    cannot capture anything at all on GNOME today — a real gap, not yet
    fixed. The correct fix is GNOME's own capture path,
    `xdg-desktop-portal`'s Screenshot/ScreenCast API (D-Bus + PipeWire) —
    real new work, not a config change. Also relevant to
    `docs/decisions/0003-capture-region-not-window-detection.md` /
    `BL-005`: window-*targeted* capture wouldn't sidestep this either,
    since GNOME blocks cross-app window enumeration entirely (the portal
    picker is the only sanctioned way to target a specific window there
    too). **Decided: parked for now** — continuing to treat GNOME as
    unsupported for the vision pipeline, same as the drag gap, rather
    than starting the portal work.
  - User reported the decorated-titlebar version above **still broken**
    on a live GNOME test. Rather than debug the decorated+alwaysOnTop
    combination further, went one step simpler per direction: **dropped
    the collapsed-icon/expand mode entirely for now.**
  - **Third, current state: one plain fixed-size (480×720) decorated
    window, always showing the full panel.** No collapse/expand, no
    `resize_sidebar` command (deleted — nothing calls it anymore), no
    `#collapsed`/icon markup (deleted from `sidebar.html`). The
    login/setup/skills/path/chat views all render inside this one window
    at its full size from launch. `resizable: true` now, since there's no
    fixed-size icon state to protect.
  - Verified: `cargo check` clean, app launches on this GNOME session
    with no panics (only the expected, harmless "compositor does not
    support Layer Shell" warning from `region-select`'s init).
  - **Not yet verified by a human**: that the window actually renders and
    behaves correctly end-to-end on GNOME (open, move by titlebar, resize,
    click through the view flow) — needs a real display/pointer, which
    this environment can't synthesize or screenshot.
  - Follow-up, not done here: bring back a collapsed/minimized mode once
    the full-size window is confirmed solid — tracked as future work, not
    an oversight.
  - Branch: `claudev/charlie/pin-icon-top-left`, not yet merged.

- **Window-pick capture — replaces region-draw as the primary capture
  scope (ADR 0005), macOS/Windows/Linux X11 only (Wayland out of scope
  by decision).** `spikes/tauri-overlay/src-tauri/src/window_provider.rs`
  is new: one `WindowInfo` shape, three platform backends
  (`CGWindowListCopyWindowInfo` on macOS, `EnumWindows`+
  `DwmGetWindowAttribute` on Windows, `x11rb` against `_NET_CLIENT_LIST`
  on Linux — the last also covers XWayland sessions).
  - Setup view (`sidebar.html`/`sidebar.js`) shows a "Select window"
    button that starts a **click-to-pick** gesture, not a text list: it
    reuses `region-select`'s full-screen click-catcher window (previously
    only the region-drag surface — see `region-select.js`'s new
    `runClickSelect`), so the user clicks directly on the window they
    want, same interaction as region-drag's box but a single click
    instead of a drag. The click point resolves to a `WindowInfo` via the
    new `window_at_point(x, y)` command (`window_provider.rs`), which
    walks `list_windows()` front-to-back so it picks whichever window is
    actually topmost/visible at that point, filtering out the app's own
    windows (sidebar/region-select). Getting front-to-back order is free
    from the OS on macOS (`CGWindowListCopyWindowInfo` is documented
    front-to-back) and Windows (`EnumWindows` is Z-order top-first); the
    Linux backend was changed from `_NET_CLIENT_LIST` (mapping order) to
    `_NET_CLIENT_LIST_STACKING` (reversed) to get the same guarantee.
    An earlier version of this used an in-panel text-list picker instead
    — replaced after feedback that selection should be "press the window
    you want," not choose from a list.
  - `locate_element` (`lib.rs`) takes a `CaptureScope` (`Region` or
    `Window{id}`) instead of a bare `Option<Region>`; for `Window`, it
    calls `window_provider::get_window_rect(id)` and re-derives the
    capture region from the window's *current* rect immediately before
    every capture — this is what fixes substep overlays going stale
    after the target app is resized/moved, since nothing is ever
    captured against a cached rect. `live_step.py`'s existing region-crop
    (grim `-g`/mss monitor dict) already scopes the actual screenshot
    pixels to that rect, so no vision-side change was needed.
  - A new "🎯 Locate" button on AI/user substep bubbles (`sidebar.js`)
    calls the real `locate_element` (previously never invoked from the
    UI — only fixture data in `fake-skill.js` populated `last_known_bbox`
    before this) and replaces `last_known_bbox` with a live result, scoped
    to the picked window if one's set. This is the practical fix for "the
    overlay goes out of position when the window resizes" — re-run it and
    it's fresh.
  - `research_goal`/`research.py` take an optional `app_name` (the picked
    window's `app_name`), so Research scopes its search to the actual
    target app instead of guessing it from goal text. Skill cards
    (`sidebar.js`) show the app as a small tag — display only for now;
    grouping by app is still BL-004; the overlay home now fakes one
    “Excel chats” group that opens the fixture skill.
  - **Verified**: `cargo check` clean; the Linux/X11 backend was smoke-
    tested live against XWayland on this GNOME/Wayland dev session
    (connects and queries correctly — this sandbox just has zero real app
    windows open to enumerate, so 0 results is the correct answer here,
    not a failure).
  - **Not verified**: the macOS and Windows backends — written against
    each OS's public API per ADR 0005's research, but this environment
    can't compile or run either target, so they're unverified until built
    on that OS. Also not verified end-to-end with a live display: the
    click-to-pick UI flow and a real `locate_element` round trip (needs a
    real pointer/display and a real second window to click on — this
    sandbox has no window manager surface to test against and no
    synthetic-input tool, same limitation as the pin-icon work above).
  - Merged to `main` (`e2948b6`) and onto `claudev/quentin/google-login`.

- **Lazy per-step substep generation — first real piece of the designed
  per-step algorithm (`docs/features/skills.md`) actually built.** Research
  still only produces coarse top-level steps (title/brief/watch_for, no
  screenshot). The AI-planned substeps under each step are no longer
  fixture data or generated up front — a new `plan_step` command
  (`lib.rs` → `spikes/vision-detect/plan_step.py`) runs once per step, the
  first time the user opens it (`sidebar.js`'s `generateStepSubsteps`),
  scoped to just that step's own title/brief/watch_for plus the goal (not
  the whole transcript, kept small deliberately). Steps render locked
  (dashed dot, unclickable body) until generated, then flip to the normal
  expandable blue/pink substep list.
  - Not yet built from `docs/features/skills.md`'s full design: reactive
    user-question substeps feeding back into planning, user-editable path,
    no-screenshot skill storage, opt-in refresh on replay.
  - **Reliability fix, found while exercising this**: `research.py` and
    `plan_step.py` calls could silently hang for minutes — reproduced
    live. Root cause: the SDK retries a timed-out request `max_retries`
    (2, by default) more times, so setting `timeout` alone doesn't bound
    the wait (a single stall became 270s+ across 3 attempts at
    `timeout=90`). Fixed with `max_retries=0` on both clients, plus
    `research.py`'s `max_uses` trimmed 3→2 for latency. Also fixed while
    testing: web search's inline `<cite>` tags leaking into `watch_for`
    text, and multi-block responses getting truncated because only the
    last text block was parsed instead of all of them joined.
  - Branch: `claudev/charlie/step-substep-generation`, not yet merged.

- **Real on-screen overlay restored, plus a shared icon pool — built,
  unverifiable on this machine.** See
  `docs/decisions/0006-restore-real-on-screen-overlay.md` (supersedes the
  "no overlay at all" position in `docs/architecture/overview.md`).
  - **New third window** `overlay` (`src/overlay.html`/`overlay.js`):
    transparent, always-on-top, and **permanently click-through — set once
    in Rust at startup, never toggled from JS.** That's the whole safety
    argument: the original overlay was cut because a *toggled* passthrough
    got stuck interactive and trapped the screen; with nothing flipping it
    there's no stuck state to reach. `pointer-events: none` everywhere is a
    second layer under the OS passthrough.
  - **Substep UI is now three icon-only actions** (`actionsHtml` in
    `sidebar.js`), replacing the two emoji text buttons: **eye** toggles
    the real on-screen overlay (highlight box + the instruction as a
    positioned text callout over the target app), **target** re-runs
    `locate_element` live, **note** toggles the old in-panel schematic.
    Only one substep can be overlaid at a time, and leaving the chat view
    drops it so a box can't outlive the UI pointing at it.
  - **The schematic is kept as a first-class peer, not legacy** — it's the
    required fallback wherever no live window rect exists.
  - **Coordinate handling — the two real bugs this had to avoid**: (1)
    nothing is drawn from a cached rect; the stored fraction is
    re-multiplied by the anchor frame's *current* geometry, re-queried
    every 200 ms via `refresh_window_rect`, which is what makes a resize or
    move survivable. Polling rather than native move/resize hooks is
    deliberate (ADR 0005 deferred those backends; ~5 cheap queries/sec buys
    the same behavior with no new platform code, costing a frame or two of
    lag while dragging). (2) physical screen px are converted to CSS px by
    dividing by the monitor's `scaleFactor` — without it everything is
    silently offset on any HiDPI/fractional-scaling display but looks
    perfect at 1.0 scale.
  - **Refuses to draw for a Wayland portal capture**: the portal hands over
    frames but never discloses the source's screen position, so there's no
    correct place for the box — it says so and stops rather than drawing
    somewhere plausible-looking.
  - **Answered a question about the fixture coordinates**: they already
    carried a reference frame (`REF_W`/`REF_H` = 1920×1080 in
    `fake-skill.js`) and every consumer already divided by it, so no new
    "screen size parameter" was needed — the two numbers are only a
    denominator, not a tie to any display. Documented that in place, since
    it wasn't obvious from reading the fixture.
  - **New shared icon pool** `src/icons.js` (38 icons) ported from the
    brainroot project's own pool — hand-drawn, no third-party icon set, so
    no license question. Ported to plain functions returning SVG *strings*
    (this app is vanilla JS, not React, and every call site builds markup
    with template strings). `src/icons.html` is a gallery page that
    enumerates the pool so the "check before drawing a new one" rule is
    actually checkable; noted in `CLAUDE.md`'s load map.
  - **Startup-abort bug found by running it, fixed.** First launch died
    with `panic in a function that cannot unwind` / `thread caused
    non-unwinding panic. aborting.` — an abort, not a catchable error.
    Cause: `set_ignore_cursor_events(true)` on a window that has never been
    shown. tao implements it as
    `window.window().unwrap().input_shape_combine_region(..)`
    (`linux/event_loop.rs`, `WindowRequest::CursorIgnoreEvents`), and
    `gtk_widget_get_window` returns NULL until the widget is *realized* —
    so the unwrap panicked inside a glib dispatch callback that can't
    unwind, which escalates a panic to an immediate abort. `overlay` starts
    `"visible": false` and has to stay invisible, so it was never realized.
    Fix: `gtk_window().realize()` first — that creates the GdkWindow
    without mapping it, so the window stays invisible but the input-shape
    call has something to act on. Must run *after* `init_layer_shell`,
    which requires init before realization.
  - **Verified**: `cargo check` clean; all five JS files parse; all 38
    icons validated as XML *and* rasterized with `rsvg-convert`, then
    reviewed as a montage — none malformed, all legible. **App now
    launches and stays running** (6s+ alive, clean exit on signal), with
    only the pre-existing, documented-as-harmless GNOME "compositor does
    not support the Layer Shell protocol" warning.
  - **Not verified, and not verifiable here**: the overlay itself. This dev
    box is GNOME/**Wayland**, where a toplevel can't position itself
    absolutely and no window rect is available — so the one feature this
    change is about is the one thing that can't run on this machine. Needs
    an X11 session, a Mac, or a Windows box. The eye's failure path (the
    "can't draw for a portal capture" notice) is the only branch this
    machine can actually exercise.
  - Note: a parallel workstream added the Wayland portal capture path
    (`portal_capture.py`, `FrameAnchor::Portal`, `capture_backend`) to the
    same tree while this was in progress; the two integrate but were
    written separately.

- **Wayland window/screen capture — built and verified live on this
  machine.** GNOME Wayland gave neither a window list (X11's
  `_NET_CLIENT_LIST_STACKING` comes back empty — every app here is
  Wayland-native) nor working screenshots (`grim` needs `wlr-screencopy`,
  which GNOME/KDE don't implement); both are now routed through the XDG
  desktop portal instead. See
  `docs/decisions/0007-portal-capture-backend-wayland.md` (amends ADR
  0005's "Wayland is out of scope"). `window_provider::backend()` picks
  `Native` (macOS/Windows/X11, unchanged) vs. `Portal` (Linux/Wayland) at
  runtime. Confirmed end to end: picked a window and a screen through
  GNOME's own share dialog, captured silently afterward with no further
  prompt (`portal_capture.py capture` reusing a stored `restore_token`),
  and ran a real `locate_element` vision call against a portal-captured
  frame. Screen-scoped picks let the real overlay draw (portal reports
  `position` for monitors, not windows); window-scoped picks fall back to
  the in-panel schematic, which the setup label now states up front.
  Two environment traps worth knowing, both documented in
  `docs/workflows/development.md`: a stale `xdg-desktop-portal` process
  left over from a different compositor routes ScreenCast to the wrong
  backend and fails with a confusing D-Bus error; PyGObject isn't
  pip-installable into the project venv, so `portal_capture.py` re-execs
  into a system Python that has it.

- **Skill persistence to disk — built, compiles, not yet exercised live.**
  Every skill/step/substep now round-trips through one JSON file
  (`save_skills_json`/`load_skills_json` in `lib.rs`, `persistSkills`/
  `loadPersistedSkills` in `sidebar.js`) instead of living only in the
  in-memory `SKILLS` array for the session — see the new "Storage" section
  in `docs/features/skills.md`. Rust treats the file as an opaque JSON
  blob (no typed mirror of the skill shape) and rewrites it whole on every
  mutation. Loaded once at startup, replacing the `fake-skill.js` fixture
  data in place if a save exists. A locked step's substep section also now
  always shows a placeholder ("Substeps not generated yet — click to
  generate.") instead of only when the step has no `brief` — a real
  Research step always has one, so the placeholder previously never
  appeared for real data, only for fixtures.
  - **Not yet verified live**: the actual goal→steps call this all hangs
    off is currently blocked by the project's Anthropic API key being out
    of credit (`research.py` returns "Your credit balance is too low").
    Add credits, then confirm a fresh goal survives an app restart by
    checking `~/.local/share/com.charlie.tauri-overlay/skills.json`.

- **Fixed: every Tauri command that shelled out or hit disk was blocking
  the main event loop.** They were plain synchronous `fn`s, which Tauri
  runs inline on the invoke-handler thread — the same thread pumping the
  window's event loop — so a `research.py` call (30-60s) or a portal pick
  (up to 5 minutes, waiting on the user) froze the whole window; GNOME
  reported it as "Not Responding," a genuine hang, not a glitch. All of
  them (`locate_element`, `research_goal`, `plan_step`,
  `pick_portal_source`, `list_windows`, `refresh_window_rect`,
  `window_at_point`, `load_skills_json`, `save_skills_json`) are now
  `async fn` wrapping their blocking body in
  `tauri::async_runtime::spawn_blocking`. See
  `docs/workflows/development.md`'s new "Writing a new Tauri command"
  section — this pattern is required for any future command that isn't
  instant.
- **Added a persistent status bar** (`#status-bar` in `sidebar.html`,
  `withStatus`/`beginStatus` in `sidebar.js`) for the three calls that can
  genuinely run long: researching a goal, planning a step's substeps, and
  the portal source pick. Shows an elapsed counter and, past a
  per-call threshold, an explicit "still going, here's why that's
  probably OK" message — replacing the old approach of ticking one
  input field's placeholder text, which was invisible the moment that
  input lost focus or was replaced by another view.

- **Guide → Do → Verify UI wired** (2026-08-29, later than the backend
  entry above): a "Check my work" button per AI substep
  (`verifyHtml`/`data-verify` in `sidebar.js`) calls `verify_substep`,
  shows expected-vs-observed inline, and offers "Ask for help" on a
  mismatch (prefills the chat input, hands off to the existing reactive-
  substep mechanism). A separate "Next step" button (`#step-advance`) is
  the plain self-confirm advance, deliberately not gated on any verify
  having run. Fixed in passing: `generateStepSubsteps` never copied
  `expected_outcome` from `plan_step`'s response onto the stored substep,
  so the button would have had nothing to check — caught before shipping.
  Relative/before-after checks ("exposure increased from before") are
  deliberately out of this pass — Charlie caught that they need a
  before-state screenshot, which conflicts with Verify's premise that a
  screenshot only happens on a manual press; split out as
  [BL-011](docs/BACKLOG.md). **Not yet click-tested in a running app** —
  no way to drive the GUI from this environment; verified by build/
  syntax checks and re-reading the wiring only.

- **Reactive follow-up questions now get real AI answers** (2026-08-29,
  later than the entries above): `sendChatMessage` in `sidebar.js` no
  longer calls `nextCannedReply()`'s fixture — it calls a new
  `answer_question` command (`answer.py`/`answer_step.py`, `lib.rs`).
  No web search (predictable latency/cost per question, unlike
  Research). Text-only by default; a screenshot only via a separate
  toggle button next to Send that resets after every send, keeping the
  "screenshot only on a deliberate, named action" rule intact. Each
  question is tied to the specific AI substep it's about
  (`respondingTo`) and renders nested under it instead of appended at
  the step's end — resolved via whichever substep bubble was last
  clicked, or the "Ask for help" button on a failed Verify, falling back
  to the step's last AI substep if neither happened. No cap on questions
  per step, deliberately, with the cost-model gap flagged (same
  unbudgeted-cost note as before, now doubly true since this path is
  real). Verified live via direct `answer_step.py` calls (text-only and
  with-screenshot, both real API calls) — **not yet click-tested in the
  running app itself**, same limitation as the Verify UI above.

## What's next

- **Guide → Do → Verify — backend built and tested, no UI yet.**
  Deliberately prioritized over on-screen highlight/callout work per
  Charlie's direction: checking the user's work is more central to the
  product than where a box is drawn, and turned out to be the cheaper
  build too. `plan_step` now generates an `expected_outcome` per substep;
  a new `verify_substep` call (`verify.py`/`verify_step.py`, `lib.rs`)
  checks a screenshot against it and returns `{matches, observed}`.
  Verified live with real API calls, including a value-reading test (did
  the model correctly read an exact clock time off a screenshot and
  match/reject against two different expected values — yes, both times).
  Design: manual confirm per substep, AI verify optional at that point
  (not automatic/polling — same trigger model as today's locate button);
  a mismatch shows expected-vs-observed and offers "ask for help," which
  becomes a normal reactive (pink) substep rather than a dead end;
  advancing to the next top-level step is gated on the current one being
  confirmed, and the *next* step's `plan_step` call reuses the last
  verify's screenshot as vision input instead of capturing separately.
  Full design: `docs/planning/vision-driven-substep-loop.md`. Not wired
  to the UI yet — see the collision note below.
- **Note: a second Claude Code session (`tutoria-b4`) is concurrently
  editing `sidebar.js`/`sidebar.html`/`icons.js` tonight** — a two-step
  home gate (goal + window pick, either order), a research-progress
  ticker, app icons for picked windows, deletable chats (landed in
  `7bb1555`, with more uncommitted on top as of this entry). This session
  deliberately avoided those three files after catching a live collision
  mid-edit (briefly saw an undefined `refreshHomeSteps()` call). The
  `currentCaptureScope()`/`deriveScopeFromGlobals()` split from the
  per-skill-capture-scope work below did land in `sidebar.js` and appears
  compatible with what `tutoria-b4` independently converged on, but
  wasn't coordinated — worth a deliberate re-read of `sidebar.js` before
  either session's next edit there, not just another silent merge.
- **Per-skill capture scope — paused mid-build**, superseded in priority
  by Verify per the collision above. `currentCaptureScope()` now prefers
  `currentSkill?.captureScope` over the global pick if a skill has its
  own (falls back to the global for older skills/pre-goal-creation);
  nothing yet sets `captureScope` on a skill, and the picker hasn't moved
  into goal creation. See the planning doc's "Suggested build order."
- **Add credits to the project's Anthropic API key** — `research.py`
  (goal→steps) and `plan_step.py` (per-step substep generation) both fail
  with "Your credit balance is too low to access the Anthropic API."
  Blocks live end-to-end testing of both the chat-to-steps flow and the
  new disk persistence (below) until resolved.
  **Resolved** (2026-08-29, later the same night) — both now succeed
  live; verified with multiple real goals and a real substep-planning
  call.
- **Verify skill persistence end-to-end** once credits are restored: ask a
  real goal, confirm `~/.local/share/com.charlie.tauri-overlay/skills.json`
  is written, restart the app, confirm the skill reloads instead of
  falling back to the fixture demo data.
- **Verify the real on-screen overlay on X11, macOS, or Windows** — it
  cannot run on this GNOME/Wayland dev box at all (see ADR 0006). Check in
  particular: that the box lands on the right element, that dragging the
  target window moves it (the 200 ms poll), and that it's genuinely
  click-through — try clicking *through* the highlight box into the app
  underneath. A HiDPI/fractional-scaling display is the case most likely
  to expose a coordinate bug.
- **Verify window-pick capture on a real macOS and Windows machine** —
  `window_provider.rs`'s backends for both are unverified (this dev
  environment can't build either target). Also needs a real display to
  exercise the picker UI and a live `locate_element` round trip end-to-end.
- **Morning: rehearse the actual demo script** (`docs/planning/demo-v0.md`)
  — fresh VS Code Welcome window, `npx tauri dev` in
  `spikes/tauri-overlay`, walk N through all 3 steps, fix whatever breaks
  on the second run.
- Record the Tauri choice as a proper ADR (was implicitly re-confirmed
  tonight by continuing the existing spike, not freshly decided).
- Settle the product name (Tutoria vs. TutorialCue) — see the naming note in
  `docs/philosophy/vision.md`.
- Decide non-negotiables (screen-data handling was explicitly deferred, not
  decided) and fill them into `CLAUDE.md`.
- Start on remaining P0 items in `docs/planning/mvp-roadmap.md`.
- **Partially built** (see the "Lazy per-step substep generation" entry
  above): lazy AI-generated substeps per step. Still not built from the
  full per-step algorithm — manual screenshot trigger, reactive
  user-question substeps, user-editable path, no-screenshot skill storage,
  opt-in refresh on replay — see `docs/features/skills.md`. Also closes
  what a saved "skill" stores.
- **ADR 0004 (Cloudflare) accepted, and live.** Dedicated "Tutoria"
  Cloudflare account created and administered by Charlie (Account ID
  `06e757ca8ed84a9c592f859886811b41`, `workers.dev` subdomain
  `guidotutor`) — see `docs/reference/team.md`. Website deployed:
  **https://tutoria-website.guidotutor.workers.dev/**. Scaffold in
  `website/` (`wrangler.jsonc`, `worker/index.ts`,
  `migrations/0001_create_waitlist.sql`) — Worker + static assets + a
  waitlist-only D1 database (`tutoria-waitlist`). Verified end to end in
  production: loaded the live URL in a browser, submitted the waitlist
  form, confirmed the row landed in the real D1 database via `wrangler d1
  execute --remote`. Full accounts/auth still deferred, per ADR 0004's
  narrowed scope. **Not yet done:** inviting teammates as Cloudflare
  account members (Manage Account → Members in the dashboard); a real
  domain (currently on the free `workers.dev` subdomain). Pauline’s
  Guido landing page from `claudev/pauline/landing-page` is now the
  site in `website/` (Vite app → `dist/` on deploy).
- **Anthropic API COGS estimated** in `docs/business/pricing.md`
  (planning: 1 skill/day × 5 steps × 5 locates/step, images sent at
  half linear res 960×540 → ~$4.05 typical subscriber/month; heavy
  ~$8). Membership tiers decided in the same file: `free` (5
  lifetime skills), `starter` ($12 + $0.25/skill overage), `plus`
  ($24, can save skills), `owner` (unlimited). `BL-007` is now
  enforce-quotas, not define-tiers.
- **Open, undecided:**
  - Where the Do-mode opt-in toggle lives (global setting vs. per-question).
  - Gamification mechanic (`BL-002`).
- **Guido mascot (Tuto) checked in** at `assets/mascot/` (SVG + React
  cursor-follow components + app icons). Website landing and `/login`
  use the cursor buddy; desktop login, title bar, and bundle icons use
  `guido-icon.png`. The overlay shell (login/setup/skills/path/chat)
  now uses the website design system (light plus-grid, keycap
  buttons, Space Grotesk). See `docs/features/website-design-system.md`.
- **Landing page (Pauline) brought onto the Worker branch.** Guido Vite
  app from `claudev/pauline/landing-page` lives in `website/` (`npm run
  dev`); Worker is `website/worker/` and serves `dist/` on deploy.
  Waitlist + `/privacy.html` are on the landing footer.
- **Login + quota paywall — built end to end, on `claudev/charlie/desktop-google-login`.**
  Login switched from the originally-planned Google OAuth to Better Auth
  email+password (`website/worker/better-auth.ts`) — see
  [ADR 0008](docs/decisions/0008-better-auth-email-password.md). D1
  migration `website/migrations/0002_create_auth_and_quotas.sql`, privacy
  page at `/privacy.html`, `GET /api/me` and `POST /api/skills/start`
  (`free` hard-capped at 1 lifetime skill, `starter`/`plus` at 30/month,
  `owner` unlimited via the `OWNER_EMAILS` allowlist). Desktop side is
  also done: `sidebar.js` calls `/api/skills/start` after Research
  succeeds and gates save on `can_save_skills`; session tokens are stored
  via `keyring` (`store_session_token`/`get_session_token`/
  `clear_session_token` in `src-tauri/src/lib.rs`). Verified 2026-08-30:
  `cargo check` clean, website `lint`/`build`/`wrangler deploy --dry-run`
  all clean. Still needed before this is production-ready (not before
  the demo): `wrangler secret put BETTER_AUTH_SECRET`, a remote D1
  migrate, and BL-015 (email verification). See
  [features/auth.md](docs/features/auth.md).
- **App icons for picked windows — built, unverifiable on this machine.**
  `window_icon` (`src-tauri/src/lib.rs`) extracts the picked window's own
  `_NET_WM_ICON` on Linux X11, encodes it to PNG once, and caches it per
  *app* under `<app_data>/app-icons/<slug>.png` — keyed by app name, not
  window, so a saved chat still shows its icon after the window is gone
  (the cache is read with no window id at all). Shown on the setup label
  and on every chat row. The decode has unit tests but has never run on
  real pixels: this is a GNOME Wayland machine, Mutter publishes no
  `_NET_CLIENT_LIST`, and a walk of the entire X11 tree finds zero
  windows carrying an icon even with `GDK_BACKEND=x11`. Needs an X11
  session to confirm; macOS/Windows backends are still unwritten and
  return "no icon". See `BL-004`.
- **App identity is entirely missing on Wayland — new `BL-009`.** Not a
  regression, just now measured: on the portal backend a chat saves
  `appName: null`, so Research gets no app to scope to and no icon can be
  looked up. The portal only ever reports `"window (1920x1080)"`. BL-004
  assumed manual entry as the fallback here; it was never built.
- **Chats can be deleted.** Trash button per row in the chat list
  (`renderAppsList`/`deleteSkill` in `sidebar.js`); deleting the chat
  currently open returns to home rather than leaving a view onto a
  deleted skill. With zero chats the whole section, heading included, is
  hidden. Not yet exercised in the running app.
- **Home view reworked into a fixed 40/60 split.** Top pane: the ask box
  and the window picker — the same control as the setup view's, now
  mounted in both places and driven by one set of handlers. Each carries
  its own tick *inside* the control, behind a hairline separator, rather
  than on a separate checklist: the control is the label. The two panes
  are two surfaces rather than two sections — the top is raised (white,
  brand grid) and is where a new chat is made, the bottom is recessed
  (grey, flat, inset shadow) and holds `Previous chats` (was `Apps`),
  whose list scrolls under a pinned heading with its own scrollbar. The
  panel is wider (420px) to fit the inline ticks. Research runs the moment a goal is
  submitted rather than waiting on a window pick, and shows an animated
  loader with rotating copy in place of a static line; the step list
  opens once both ticks land, fading in. Whichever of the two happens
  last decides the timing: if the window is picked after research
  finished, the open is held 1s so the tick it just earned is visible.
  A new chat is persisted and listed under `Previous chats` before the
  step list opens, so it survives never being opened.
- **Chats are grouped by app, one page per group.** Home lists one button
  per app — icon, "<App> chats", the newest chat's title, a count — and
  opening one goes to that app's own page (the new `group` view), which
  lists its chats under the group's shared icon with a back arrow to home.
  Every group expanded on one page was fine at two apps and stops being
  fine at ten. Ranked by recency twice over — chats newest-first inside a
  group, groups by their own newest chat — off a new `createdAt` on each
  skill (chats saved before it existed fall back to save order). Group
  keys normalise case, punctuation and the vendor word, so `Excel` and
  `Microsoft Excel` are one group rather than two; the fixtures
  deliberately use both names to exercise that. Where no icon can be
  extracted or resolved, a shipped logo stands in (`assets/excel.png`, via
  `APP_MARK_IMAGES` in `sidebar.js`), then the app's initial.
- **The window picker shows the app, not a sentence.** Once identified it
  reads as an icon plus the app's name alone; `Capturing: …` / `Window: …`
  are gone, and with them the "on-screen box vs diagram only" note that
  used to trail the portal label. Verified by rendering `sidebar.html` in
  WebKitGTK (the same engine Tauri uses) with a stubbed `__TAURI__`
  bridge, across the idle / researching / waiting-on-pick states; the
  running app boots clean but couldn't be screenshotted (grim needs
  wlr-screencopy, this is Mutter).
- **App identity now works on Wayland — `BL-009` largely closed.** One
  vision call reads the app's name off the captured frame right after a
  pick (`spikes/vision-detect/identify_app.py`, the `identify_app`
  command in `lib.rs`), which is the only source of identity the portal
  leaves available. That name scopes Research, labels the picker, and is
  backfilled onto a chat created before the pick landed. The icon then
  comes from a freedesktop desktop-entry + icon-theme lookup keyed on the
  name alone (`window_provider::icon_for_app_name`), so it needs no live
  window — which is what makes it work both on Wayland and for a chat
  whose window is long gone; `window_icon` falls back to it whenever
  extraction from a window isn't possible. Verified in pieces, not end to
  end: the prompt against `samples/vscode-welcome.png` (answered "Visual
  Studio Code" / "Welcome"), the icon lookup by unit test against this
  machine's real icon themes (Firefox, VS Code, Nautilus, GNOME Settings
  all resolve). **Not yet run through a real portal pick.**
- **Desktop paywall now links out to a real website URL** instead of the
  placeholder `alert()`s. The paywall itself (drop to 1 free skill,
  three trigger points, profile-menu entry) already shipped in
  `14424ee`; this closes the one remaining gap — "Upgrade to
  Starter/Plus" and "Manage subscription" now open
  `https://guidotutor.com/pricing?plan=<tier>` in the system browser via
  the Tauri opener plugin (registered but previously unused;
  `plugin:opener|open_url` invoke shape verified against the plugin's
  own source, not assumed). The page itself doesn't exist on the website
  yet — spec'd as a handoff in `docs/planning/payment-page.md` for
  whoever builds it, with the tier copy locked to `pricing.md` and real
  Stripe checkout tracked separately as `BL-016` since there's no Stripe
  account for this project yet.
