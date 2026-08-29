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
    grouping by app is still BL-004, not built here.
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

## What's next

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
- **Google login Worker + quotas (Quentin) — Worker half started.**
  Branch `claudev/quentin/google-login`: D1 migration
  `website/migrations/0002_create_auth_and_quotas.sql`, privacy page at
  `/privacy.html`, routes `/auth/google/start`,
  `/auth/google/callback`, `/api/me` (quota fields),
  `POST /api/skills/start` (hard-caps `free` at 5 and
  `starter`/`plus` at 30/month). Still needed: Google Cloud OAuth
  client + `wrangler secret put GOOGLE_CLIENT_SECRET`, remote migrate,
  and Charlie pairing on the Tauri keyring/loopback half. See
  `docs/planning/login-membership-plan.md`.
