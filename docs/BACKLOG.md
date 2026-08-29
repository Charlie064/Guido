# Backlog

Parking lot for future work, stable IDs (`BL-NNN`). A stub graduates to a
real feature doc + ADR when it gets built, and is deleted from here at that
point — this file should never pose as a source of truth for what's done.

- **BL-002 — Gamified progress/mastery.** Lightweight sense of progress as
  the user completes more tutorials/skills. No spaced-repetition system.
  Mechanic undecided (badges? streaks? per-app mastery levels?). See
  [philosophy/vision.md](philosophy/vision.md).
- **BL-003 — Movable overlay icon + selection state.** The Tutoria icon
  should be draggable/repositionable instead of fixed to one screen
  location, so it doesn't block content. Deselected state shows a gray
  version of the icon svg; selected state (sidebar open) shows the blue
  message icon.
- **BL-004 — OS-level active-app detection for chat naming + icons.** One
  app per chat, as today, but auto-detect the app instead of requiring the
  user to type its name — and pull its static icon so chats can be grouped
  into an "Excel skills" style page per app.
  - **Detection**: one `ActiveAppProvider` interface (same swappable-provider
    pattern as vision/voice), OS-specific backend behind it, called from the
    Tauri Rust side (spike is already Rust/Tauri).
    - macOS: `NSWorkspace.frontmostApplication` → bundle ID, name, `.icon`.
      No special permission needed (unlike Accessibility for element
      reading).
    - Windows: `GetForegroundWindow` → `QueryFullProcessImageName` → exe
      path → `SHGetFileInfo`/`ExtractIconEx` for the icon.
    - Linux X11: `_NET_ACTIVE_WINDOW` + `WM_CLASS` → resolve `.desktop` file
      for a themed icon.
    - Linux Wayland: no compositor-agnostic focused-window API (deliberate
      security model) — this is the real gap. Chosen fallback: manual entry
      (user names the app, same as today, always works) + a GNOME
      Shell D-Bus / KWin script shim for the two major desktops. Skipping
      wlr-foreign-toplevel-management (Sway etc.) as not worth the coverage
      for a small user slice — manual entry already covers them.
  - **Icon**: static app icon (`.app`/`.exe` icon via the OS calls above),
    pulled once and cached — explicitly *not* a live screenshot. A live
    screenshot thumbnail would conflict with the "no screenshots stored"
    rule in [features/skills.md](features/skills.md) and the still-open
    screen-data non-negotiable in [CLAUDE.md](../CLAUDE.md).
  - **Partly built** (window-pick path, `window_icon` in
    `spikes/tauri-overlay/src-tauri/src/lib.rs`): app *name* already comes
    free from the window pick (`WindowInfo.app_name`, BL-005's provider),
    and the icon is extracted on Linux X11 from the window's own
    `_NET_WM_ICON` — no icon-theme or `.desktop` resolution needed, since
    the pixels are already on the picked window. Encoded once to PNG and
    cached on disk per app under `<app_data>/app-icons/<slug>.png`, so the
    icon outlives the window and a saved skill can still show it.
    The chat list (`renderAppsList` in `sidebar.js`) shows it, looking it
    up by app name with no window id — a cache-only read, which is why the
    cache is keyed per app rather than per window.
    The `.desktop` fallback named above is now built
    (`window_provider::icon_for_app_name`) and is what `window_icon` falls
    back to whenever there's no window to extract from — an app that sets
    no `_NET_WM_ICON`, a Wayland portal pick, or a chat whose window is
    long closed.
    The per-app grouping this entry describes is built too: the chat list
    is one card per app titled "<App> chats", ranked by its newest chat,
    with that app's chats inside it under the group's shared icon.
    Remaining: the macOS (`NSRunningApplication.icon` off the window's
    owner pid) and Windows (`WM_GETICON`/`ExtractIconEx`) backends.
  - **Not verified against a real app.** The `_NET_WM_ICON` decode has
    unit tests (`window_provider.rs`) but has never run on real pixels:
    the dev machine is GNOME Wayland, where Mutter publishes no
    `_NET_CLIENT_LIST`, so a walk of the whole X11 tree finds zero windows
    carrying an icon even with `GDK_BACKEND=x11` forced. Needs an X11
    login session (or the macOS/Windows backends) before it can be called
    working.
- **BL-005 — Live window-rect tracking backend + window-picker capture +
  real on-screen overlay.** The actual OS calls behind
  [ADR 0005](decisions/0005-window-anchored-overlay-coordinates.md)'s
  coordinate model: `NSWorkspace`/`AXUIElement` (macOS),
  `GetForegroundWindow`/`DwmGetWindowAttribute`/`WinEventHook` (Windows),
  `_NET_ACTIVE_WINDOW`/`ConfigureNotify` (Linux X11),
  `ext-foreign-toplevel-list-v1` (Linux Wayland + wlroots compositors only —
  not GNOME/KDE, see ADR 0005). Needs: a window-picker replacing region-draw
  on the working tier, resize/move event listeners feeding live rect
  updates, and a real click-through overlay renderer (the "untried" idea
  named in architecture/overview.md's Visual overlay section — a box scoped
  to just the element, not the whole monitor). Shares its
  `ActiveAppProvider`-style provider interface and platform matrix with
  BL-004 — worth building together.
  - **Known gap, scoped out of v1**: browser-hosted apps (Google Sheets,
    Figma-web) only resolve to "Chrome" at the OS level — the OS can't see
    inside a tab. Fixing this needs a second, optional layer (a browser
    extension reporting active tab title/URL), not more OS-level work.
    Degrade to "Chrome" + let the user rename the chat until that's built.
- **BL-006 — Integrate Pauline's website build into the codebase.**
  Landing (Guido Vite app from `claudev/pauline/landing-page`) is in
  `website/` on `claudev/quentin/google-login`, with waitlist + privacy
  wired to the Worker. Remaining: `npm run deploy` once Cloudflare
  membership is accepted, and any further design pass she still wants.
- **BL-007 — Enforce membership quotas.** Tiers and Worker endpoints
  (`GET /api/me`, `POST /api/skills/start`) are on
  `claudev/quentin/google-login`. Remaining: desktop must call
  `/api/skills/start` when a new goal starts and hide save unless
  `can_save_skills` (Charlie pairs on the Tauri half). Stripe + Starter
  overage charges are a later slice. See
  [business/pricing.md](business/pricing.md).
- **BL-008 — Link a real domain in Cloudflare (Quentin).** The site
  currently runs on the free `workers.dev` subdomain
  (`tutoria-website.guidotutor.workers.dev`, see
  [reference/team.md](reference/team.md)/[STATUS.md](../STATUS.md)).
  Register/point a real domain at the Cloudflare account and wire it into
  `website/wrangler.jsonc` (custom domain / route), including DNS and TLS.
  Needed before the login flow in
  [planning/login-membership-plan.md](planning/login-membership-plan.md)
  can use a stable OAuth redirect origin instead of a `workers.dev` URL.
- **BL-009 — No app identity at all on Wayland.** **Largely done — read
  the identity off the pixels instead of asking the OS.** The premise
  still holds: the portal's only identifying output is
  `"window (1920x1080)"` (`describe()` in
  `spikes/vision-detect/portal_capture.py`) and it never discloses which
  app the user picked, by design. What changed is the fallback. Rather
  than the manual entry BL-004 assumed, one vision call now names the app
  from the captured frame (`spikes/vision-detect/identify_app.py`, the
  `identify_app` command), running once right after a pick — never per
  step. Its answer feeds `selectedAppName()`, so Research is scoped and
  the chat saves a real `appName`; the icon then comes from a
  desktop-entry lookup keyed on that name
  (`window_provider::icon_for_app_name`), which needs no window and so
  works on Wayland and for long-closed windows alike. A null answer ("I
  can't tell") is kept as null rather than guessed at.
  - What's left: the model can still be *wrong*, and nothing lets the user
    correct it — the manual-entry override this entry originally proposed
    is now the fix for that narrower problem, and is still unbuilt. Same
    open question as before about whether the override is portal-only or
    offered everywhere (a native pick can also resolve "wrong", e.g. a
    browser-hosted app reporting only "Chrome" — see BL-005).
  - Not yet exercised against a real portal pick: the identification
    prompt is verified against a saved VS Code screenshot ("Visual Studio
    Code" / "Welcome") and the icon lookup against this machine's real
    icon themes, but the two have not been run end to end through an
    actual portal capture.
- **BL-010 — Animated cursor-movement indicator.** Deliberately deferred
  (2026-08-29) in favor of the Guide → Do → Verify confirmation loop
  (`docs/planning/vision-driven-substep-loop.md`), which Charlie
  prioritized as more central to the product and cheaper to build than
  on-screen highlight/callout work. Not dropped — Charlie explicitly
  wants to keep it, just later: a cursor-movement indicator is a lighter,
  less fragile way to point at something than a highlight box, since it
  doesn't depend on a bounding box landing exactly right (a box drawn a
  few pixels off looks broken; an animated cursor drifting toward the
  right neighborhood still reads as "over there"). Ties to the `action:
  "move-cursor"` value `plan_step.py` already generates per substep
  (`VALID_ACTIONS` in that file) — today that value exists in the data
  model and is rendered as plain instruction text only; nothing animates
  a cursor anywhere. Needs its own design pass (where does the cursor
  actually move relative to the real system cursor, what triggers it,
  does it work through the same window-scope/portal constraints
  `locate_element` already has) — not scoped here.
- **BL-011 — Relative (before/after) verify checks.** Deliberately
  deferred (2026-08-29) — the first build of Guide → Do → Verify
  (`docs/planning/vision-driven-substep-loop.md`, `verify_substep`) only
  supports **absolute** checks: "Exposure ≈ +0.5", checked against one
  after-the-fact screenshot. A relative check ("Exposure increased from
  its current value," useful when a substep nudges something without a
  specific target number in mind) needs a *before* state too, which is a
  real design fork — Charlie's own catch: it means capturing something
  at the *start* of a substep, which cuts against Verify's core design
  choice that a screenshot only happens on a manual, user-triggered
  confirm/verify press, never automatically. Rather than resolve that
  tension in the first build, it's deferred whole.
  - **Design sketch, not decided**: don't add a step-start capture.
    Instead, treat whatever screenshot a *previous* substep's AI-verify
    happened to produce as an opportunistic baseline for the *next*
    substep's relative check — same idea already used one level up
    (the last verify's screenshot feeds the next top-level step's
    `plan_step` call). Needs an explicit decision on what "baseline"
    even means: the actual cached image, or just the previous verify's
    `observed` text reused as plain context (cheaper, no image
    retention question, and `verify_substep` already takes a `context`
    string this could ride in on with no new plumbing) — not decided,
    scope this properly before building.
- **BL-012 — "Show me": a dark spotlight overlay for Show mode.** A
  dedicated, one-press way to do **Show** (`docs/philosophy/vision.md`'s
  Teach/Show/Do split) — press "Show me" on a substep and the real
  on-screen overlay darkens the whole target window/screen except a
  cut-out hole around the located element (e.g. a menu item), rather than
  today's box-plus-bubble drawn on top of an otherwise-untouched screen.
  The dimming is what should carry "look here": everything *except* the
  target recedes, instead of the target being one more bright rectangle
  among many on a normal-brightness screen.
  - **Where it fits today**: substeps already render two ways per
    "Visual overlay" in `docs/architecture/overview.md` — the eye icon
    (real on-screen box + text callout, `overlay.js`/`overlay.html`) and
    the note icon (in-panel schematic, the required fallback wherever no
    live window rect exists). This would be a third rendering behind the
    eye icon, or a distinct mode of it, using the same `last_known_bbox`
    data `locate_element` already returns — no new detection work, this
    is presentation only.
  - **Mechanism sketch, not decided**: an SVG mask (or a canvas
    `globalCompositeOperation: "destination-out"` punch) over a
    semi-opaque dark fill on the existing click-through `overlay` window,
    with the hole sized/positioned from the same box the current
    highlight rect uses. Needs a decision on hole shape (a rounded rect
    around the bbox vs. a soft-edged radial cutout) and on how it composes
    with `FrameAnchor` — a `Window`-anchored capture has a live rect to
    darken exactly; a `Portal` window-scoped capture (no on-screen
    position, per ADR 0006) can't draw a real overlay at all today and
    would need the schematic to grow its own dimmed-hole treatment
    instead, which is a separate design question from the on-screen case.
  - **Product-naming note**: "Show me" as a button label reads well
    against the Teach/Show/Do vocabulary already in vision.md — worth
    keeping that label rather than inventing a new verb, so the UI matches
    the mode names used elsewhere in the docs.
  - **Only reachable at all after at least one AI-verify has actually
    run** in the current substep sequence — self-confirmed-only substeps
    leave no baseline, so `plan_step` needs to know not to generate a
    relative `expected_outcome` there and fall back to an absolute one.
