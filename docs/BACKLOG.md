# Backlog

Parking lot for future work, stable IDs (`BL-NNN`). A stub graduates to a
real feature doc + ADR when it gets built, and is deleted from here at that
point — this file should never pose as a source of truth for what's done.

- **BL-002 — Gamified progress/mastery.** Lightweight sense of progress as
  the user completes more tutorials/skills. No spaced-repetition system.
  Mechanic undecided (badges? streaks? per-app mastery levels?). See
  [philosophy/vision.md](philosophy/vision.md).
- **BL-003 — Stale premise, needs rescoping.** There is no collapsed-icon
  mode to make draggable anymore: `sidebar.js`'s own header comment says
  "No collapsed-icon mode for now" — the app is a single fixed 480×720
  decorated window shown at full size from launch, not the
  collapse-to-icon design this entry assumed. That icon UI existed
  briefly (see the old "Collapsed icon" and "GNOME tested" entries in
  `STATUS.md`'s history) and was cut for GNOME compatibility. If a
  minimized/icon mode comes back (`architecture/overview.md` flags this
  as tracked future work, not an oversight), draggability and a
  selected/deselected icon state would apply again then — until it does,
  this entry describes nothing currently buildable.
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
    **Windows window-pick path done (2026-09-02)**: `window_icon` in
    `window_provider.rs`'s `windows_backend` module extracts the exe's own
    primary icon via `ExtractIconExW` (the exe path comes from the
    picked window's HWND → `QueryFullProcessImageNameW`, already resolved
    for `WindowInfo.app_name`) and converts its HBITMAP to raw RGBA via
    `GetIconInfo`/`GetDIBits` — same `IconImage` shape and disk cache the
    Linux path already used, so nothing downstream needed to change.
    `icon_for_app_name` (the *name-only*, no-window lookup a "Previous
    chats" cold start needs) is still unbuilt on Windows — but since the
    window-pick path caches per app name, any app picked live at least
    once already has a working icon for that path too. Remaining:
    macOS's window_icon (`NSRunningApplication.icon` off the window's
    owner pid) and `icon_for_app_name` on both macOS and Windows.
  - **Linux path not verified against a real app.** The `_NET_WM_ICON`
    decode has unit tests (`window_provider.rs`) but has never run on
    real pixels: the dev machine is GNOME Wayland, where Mutter publishes
    no `_NET_CLIENT_LIST`, so a walk of the whole X11 tree finds zero
    windows carrying an icon even with `GDK_BACKEND=x11` forced. Needs an
    X11 login session before it can be called working.
  - **Windows path verified 2026-09-02** against real running windows on
    this dev machine (a throwaway test enumerated live windows, extracted
    each one's icon, and saved it to a PNG for a visual check, then was
    deleted): msedge.exe and WindowsTerminal.exe both came back as their
    correct real 32×32 icons, not the letter-avatar fallback. Verified via
    a standalone `list_windows`/`window_icon` call, not by clicking
    through the app's own window-pick UI end to end — that path is the
    same `window_icon` command either way, but hasn't been exercised
    through the picker itself yet.
  - **Microsoft Store apps investigated and fixed, 2026-09-02.** Reported
    as "couldn't detect Microsoft Store" — root-caused rather than
    patched around a symptom, in two separate layers that both had to be
    fixed:
    1. **Wrong app entirely.** Every UWP/MSIX app's visible window
       (Calculator, the Store app itself, Photos, Mail, ...) is actually
       owned by a single shared OS process, `ApplicationFrameHost.exe`,
       not by the app — confirmed by dumping `list_windows()` against a
       real Calculator and the Store app, both of which came back as
       `app_name="ApplicationFrameHost"`. Every Store app was therefore
       indistinguishable from every other, and `window_icon` extracted
       the host's own icon instead of the app's. Fixed by walking the
       frame's child windows (`EnumChildWindows`) for the first one owned
       by a different process — `real_uwp_app_pid` in
       `window_provider.rs` — and using that process for everything
       downstream (name, icon) instead. A plain window has no such child,
       so this only changes behavior for the `ApplicationFrameHost` case.
    2. **Even with the right process, no icon on the exe itself.** A
       packaged app's exe (e.g. `CalculatorApp.exe` under
       `C:\Program Files\WindowsApps\...`) carries no classic PE icon
       resource at all — confirmed `ExtractIconExW` correctly reports 0
       icons there, not a bug in that call. Two further attempts
       (`SHGetFileInfoW`, and `IShellItemImageFactory` called on the exe
       path) were both tried and both empirically returned Windows'
       generic "unknown file type" icon — identical bytes for Calculator
       and the Store app, i.e. not really per-app icons at all — because
       a packaged app's real icon is registered against its Start Menu
       tile identity (its AppUserModelID), not its exe file, and parsing
       the raw exe path was never going to reach it regardless of which
       shell API did the parsing. Fixed by resolving the app's AUMID via
       `GetApplicationUserModelId` and asking `IShellItemImageFactory`
       for `shell:AppsFolder\<AUMID>` instead of the exe path — confirmed
       against real running Calculator and Microsoft Store windows to
       return their actual colored icons. A non-packaged process has no
       AUMID (the lookup fails cleanly), so every ordinary Win32 app
       still goes through the exe-path/`ExtractIconExW` path unchanged.
    Both fixes are Windows-only (`extract_pid_icon`,
    `application_user_model_id`, `real_uwp_app_pid`, all in
    `windows_backend`); Linux and macOS are architecturally unaffected —
    neither has (or needs) an `ApplicationFrameHost`/AUMID equivalent.
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
  to just the element, not the whole monitor). **Note (2026-08-30): the
  overlay renderer this built on top of (`overlay.js`/`overlay.html`,
  ADR 0006) was removed from the UI entirely** — see that ADR's
  superseded status and the "Visual overlay" section. This item's window-
  rect-tracking scope still stands on its own, but "real click-through
  overlay renderer" now means rebuilding a UI entry point too, not just
  wiring live coordinates into an existing one. Shares its
  `ActiveAppProvider`-style provider interface and platform matrix with
  BL-004 — worth building together.
  - **Known gap, scoped out of v1**: browser-hosted apps (Google Sheets,
    Figma-web) only resolve to "Chrome" at the OS level — the OS can't see
    inside a tab. Fixing this needs a second, optional layer (a browser
    extension reporting active tab title/URL), not more OS-level work.
    Degrade to "Chrome" + let the user rename the chat until that's built.
- **BL-008 — Done.** Verified 2026-08-30: `guidotutor.com` and
  `www.guidotutor.com` are wired as `custom_domain` routes in
  `website/wrangler.jsonc` and both resolve live, serving the real site
  (`<title>Guido</title>`) — not the free `workers.dev` subdomain this
  entry originally described. This entry, `reference/team.md`, and the
  older parts of `STATUS.md` describing the site as `workers.dev`-only
  are stale. Kept here (not deleted) only as a pointer to update those —
  delete this stub once they're fixed.
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
  (`VALID_ACTIONS` in that file) — today that value is stored on the
  substep object (`sidebar.js`'s `generateStepSubsteps`) but, as of the
  2026-08-30 substep-bubble decluttering (`5d18b45`), **isn't rendered
  anywhere at all anymore**, not even as plain text; nothing animates a
  cursor and nothing shows the action type either. Needs its own design pass (where does the cursor
  actually move relative to the real system cursor, what triggers it,
  does it work through the same window-scope/portal constraints
  `locate_element` already has) — not scoped here.
  **Update, 2026-09-03**: this entry is about a CSS/visual cursor
  *indicator* (Teach mode, doesn't touch the real OS cursor) — a
  separate, real OS-level cursor mover now exists
  ([features/cursor-control.md](../features/cursor-control.md),
  `cursor_control.rs`), built for Do mode, manually triggered only (no
  plan step calls it yet). Not a replacement for this indicator — Teach
  mode's whole point is showing *without* moving the real cursor — but
  worth reading before scoping this, since "where does the cursor
  actually move relative to the real system cursor" now has a concrete
  Do-mode-side answer to design Teach mode's indicator alongside.
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
  - **Where it fits today — premise gone stale (2026-08-30):** this was
    written to be a third rendering mode behind the eye icon, alongside
    the note-icon schematic described in "Visual overlay". Both of those
    were removed from the substep bubble UI in `5d18b45` (see that
    section's current, marked-removed text) — there is no eye/note icon
    row to extend anymore. This would now mean building a first overlay
    entry point from scratch, not adding a mode to an existing one. The
    underlying data (`last_known_bbox` from `locate_element`) and the
    dead `overlay.js`/`overlay.html` code are still there to build on.
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
- **BL-013 — Always-on-top sidebar on layer-shell-capable Linux
  compositors.** Originally attempted on `claudev/charlie/layer-shell-sidebar`
  (branched off `main`, kept isolated since this was unsure to work) and
  not merged; **cherry-picked into `claudev/charlie/env-cleanup`
  2026-08-30 during an overnight review pass, then re-gated the same
  night once a code review flagged that the cherry-pick had dropped the
  original isolation** — `init_layer_shell_sidebar` now only runs when
  `GUIDO_LAYER_SHELL_SIDEBAR=1` is set (`lib.rs`'s `run()`), so merging
  the code doesn't silently promote every Sway/Hyprland/KDE user's
  sidebar to the unverified state described below. Unset (the default),
  every wlroots compositor keeps the plain decorated toplevel with
  WM-titlebar dragging, unchanged.

  `init_layer_shell` (`lib.rs`) is now parameterized on
  layer + anchors instead of hardcoding `Overlay`/fill-screen, and a new
  `init_layer_shell_sidebar` promotes the sidebar to `Layer::Top`,
  anchored to the top-right corner only (so it keeps its own
  480×720 size instead of stretching full-screen), gated on the same
  `gtk_layer_shell::is_supported()` check `region-select`/`overlay`
  already use. `cargo check` is clean and `npx tauri dev` runs
  end-to-end on this GNOME/Mutter dev machine with the code taking the
  unsupported-compositor fallback path exactly as before (GTK logs "your
  Wayland compositor does not support the Layer Shell protocol" and the
  sidebar behaves like the pre-BL-013 plain toplevel) — a real regression
  check on the fallback branch, not a pass on the feature itself.
  **The actual Sway/Hyprland/KDE path is unverified** — no such
  compositor is available on this machine. Two real risks flagged in
  code comments at the new `init_layer_shell_sidebar`, genuinely
  unresolved, not just untested: (1) the layer-shell protocol has no
  interactive-move request the way `xdg_toplevel` does, so
  window-manager-driven dragging — the whole reason a plain toplevel
  with a real titlebar was chosen over layer-shell in the first place —
  may not exist for a layer surface at all, not just be "less reliable";
  (2) `"decorations": true` in `tauri.conf.json` may render nothing on a
  layer-shell surface, since compositors don't apply xdg-decoration to
  layer surfaces. Needs a real Sway/Hyprland/KDE (wlroots) session before
  this can be called working, and a product decision if dragging turns
  out to be genuinely gone: accept a fixed corner position, or design a
  new in-app drag mechanism (distinct from the two already tried and
  rejected).
- **BL-014 — Native capture-exclusion + always-on-top on macOS/Windows.**
  **Windows done, verified live (2026-08-31) — see `STATUS.md`.** Real OS
  APIs keep Guido visibly pinned on top *and* invisible to any screen
  capture at the same time (a screenshot, a screen recorder, a video call,
  and this app's own capture calls) — not a trade-off between the two the
  way Linux/Wayland is:
  - **Windows**: `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)`
    (10 2004+), set once at startup (`exclude_sidebar_from_capture` in
    `src-tauri/src/lib.rs`), never toggled.
    `hide_for_capture`/`show_after_capture` (replacing every direct
    `sidebar.hide()`/`.show()` call across `lib.rs` —
    `locate_element`, `verify_substep`, `answer_question`, `identify_app`,
    `pick_portal_source`) now no-op on Windows once that call is confirmed
    to have actually succeeded (a runtime `CAPTURE_EXCLUDED` flag, not just
    a platform check) — a failed call still falls back to the old
    hide/show dance rather than silently leaving the sidebar always
    visible in a capture. Verified: `cargo check`/`cargo test` clean, and
    the hide/show flicker confirmed gone in the running app.
  - **macOS**: written the same session (`NSWindow.setSharingType(.none)`
    via a direct Objective-C message, since neither `NSWindow` nor `HWND`
    is exposed by Tauri's window API as a typed binding) — same
    set-once-at-startup pattern. **Unverified** — no macOS hardware in
    this dev environment.
  - **Always-on-top**: plain `alwaysOnTop` already covers both (and X11)
    — unlike Wayland, these platforms let a client request top-of-stack
    directly. No change needed here.
  - **Linux/Wayland part superseded — see
    [ADR 0009](decisions/0009-window-scoped-capture-excludes-sidebar.md).**
    This entry originally claimed Linux had no path to drop the hide/show
    dance at all. Measured and found incomplete: true that no explicit
    exclusion API exists for an ordinary client, but a `Window`-scoped
    portal capture on GNOME/Wayland is already isolated from anything on
    top of it (tested 5/5 with
    `spikes/vision-detect/test_window_isolation.py`), so hide/show can be
    dropped for that one scope too — not yet coded. `Region`/`Monitor`-
    scoped Linux captures still composite the whole screen and keep
    needing hide/show indefinitely. Also still open: re-verifying Linux
    X11 (`XCompositeNameWindowPixmap`) and Hyprland/wlroots
    (`hyprland-toplevel-export-v1`) the same way before trusting them
    un-tested.
- **BL-015 — Require email verification before an account is usable.**
  Login switched from Google OAuth to Better Auth email+password
  (`website/worker/better-auth.ts`, decided 2026-08-29 to avoid Google's
  test-user allowlist blocking self-serve signup during the demo — see
  [ADR 0008](decisions/0008-better-auth-email-password.md) and
  [features/auth.md](features/auth.md)). As configured, `emailAndPassword.requireEmailVerification` is `false` — an
  account is active the instant it's created, no proof the email address
  is real. Explicitly deferred for the hackathon demo, but flagged here so
  it isn't forgotten: **must be turned on before charging real users or
  accepting signups beyond a small trusted demo group.** Needs an
  email-sending provider wired in first (Resend, Postmark, etc.) — Better
  Auth supports verification emails natively once one exists
  (`sendVerificationEmail` in the `emailAndPassword` or
  `emailVerification` config), no schema changes required since
  `user.emailVerified` already exists in the generated table.
- **BL-016 — Update privacy policy + terms for Stripe billing once wired.**
  `website/public/privacy.html` and `website/public/terms.html` (added
  2026-08-30, see [features/auth.md](features/auth.md) and
  [business/pricing.md](business/pricing.md)) now have the *text* for
  billing, auto-renewal, cancellation, refunds, taxes, and a Stripe data
  disclosure written pre-emptively, since `claudev/charlie/pricing-page`
  hasn't merged yet and no billing UI exists. **Remaining when that
  branch merges**: build the actual self-serve cancel control in account
  settings the terms promise (today it falls back to "email us," which
  the terms allow but a real control is better for the click-to-cancel
  requirement); confirm Stripe Tax is actually enabled so the "taxes
  collected at checkout" line is true; and get a real lawyer pass on the
  arbitration/class-action-waiver clause before relying on it — that
  clause's enforceability is jurisdiction- and notice-dependent in ways
  a template can't guarantee.
  - **Review pass, 2026-08-30 (`billing.ts` on `pricing-page`/
    `pricing-page`, no merge attempted — see
    [planning/overnight-2026-08-30-release-and-verify.md](planning/overnight-2026-08-30-release-and-verify.md)).**
    Code quality is solid where it exists: parameterized D1 queries, no
    hardcoded secrets (`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` stay
    `wrangler secret put` values — see the "Status check" entry below for
    the live-vs-test-mode price ID question, not re-litigated here).
    Webhook signature verified via a from-scratch HMAC-SHA256
    reimplementation of the `stripe` SDK's scheme; plan derived from the
    subscription's actual price ID rather than trusted off event type
    alone (correctly handles a downgrade still firing
    `customer.subscription.updated`).
    - **Do not merge as-is — the branch is based on a stale snapshot.**
      Diffing `pricing-page` against current `env-cleanup` shows it would
      *delete* `worker/vision.ts` (480 lines — the entire `/api/vision`
      proxy, verified working end to end this same session), `worker/
      voice.ts`, and their D1 migrations, replacing them with older code
      predating both. A raw merge would regress the AI features to fix
      billing. Needs a deliberate rebase of just `billing.ts` + its
      schema/wrangler/pricing-page changes onto current `main`/
      `env-cleanup`, not a merge of the branch wholesale.
    - **Two real security findings in `verifyStripeSignature`**
      (`billing.ts`): (1) the computed HMAC is compared to the header's
      signature with plain `!==` string comparison, not constant-time —
      a timing side-channel in principle, though the practical exposure
      over real network jitter is low; (2) the signature's `timestamp`
      field is extracted but never checked against a tolerance window
      (Stripe's own guidance is to reject anything older than ~5
      minutes), so a leaked-but-otherwise-valid signature could be
      replayed indefinitely. Both are fixable in a few lines
      (`crypto.subtle`-based constant-time compare, or a manual
      byte-by-byte XOR-accumulate; a `Date.now()/1000 - timestamp` bound
      check) — flagging rather than fixing, since this file isn't merged
      into any branch this session is authorized to push.
    - Not reviewed further: the pricing-page UI itself, checkout/portal
      redirect flows end to end (would need a live Stripe test-mode
      checkout, not attempted), or whether `memberships` schema changes
      here still match current `db/schema.ts`.
  - **Gate added 2026-08-30**: `claudev/charlie/pricing-page` must stay
    on Stripe **test-mode keys only** (`sk_test_...`/`pk_test_...`) —
    don't switch to live keys or take a real charge from anyone outside
    the team — until Charlie has registered as a sole trader (enskild
    näringsidkare) with Skatteverket. An individual can legally accept
    payments in Sweden without an AB, but running live billing with zero
    registration crosses from "should register" into non-compliant once
    it's real recurring revenue from real users, not a demo. Hackathon
    demos of the payment flow should run in test mode regardless.
  - **Status check, 2026-08-30**: `pricing-page` (`be6d8d3` checkout/
    portal/webhook, `b6f0dcb` "add live Stripe price IDs to wrangler
    vars") is **not merged into `main`** — this repo's `main` has no
    billing routes yet, so nothing above is live in production. But the
    branch's own `wrangler.jsonc` now carries real, non-test-mode Stripe
    price IDs (`STRIPE_PRICE_STARTER`/`STRIPE_PRICE_PLUS`), which sits in
    tension with the test-mode-only gate just above — worth an explicit
    check of what `STRIPE_SECRET_KEY` actually is (test vs. live; the
    value itself can't be read back via `wrangler secret list`, only
    that something is set) before that branch merges, not after.
- **BL-017 — Warn the user before they hit their quota, and meter Starter
  overage for real.** Two related gaps in
  [features/auth.md](features/auth.md) and
  [business/pricing.md](business/pricing.md):
  - **Approaching-limit warning.** `GET /api/me` already returns
    `skills_remaining`/`skills_included` (`worker/auth.ts`'s
    `countSkillRuns`) — nothing in the desktop app (`sidebar.js`) reads
    those fields to show a "you're close to your monthly limit" notice
    before the hard 403 lands. Cheap to add: a threshold check (e.g.
    `skills_remaining <= 3`) on the response `/api/me` is already
    fetched from, surfaced as a banner or toast. No new endpoint, no
    schema change.
  - **Real overage billing.** `pricing.md`'s Starter tier specifies
    $0.25/skill overage instead of a hard wall, but MVP enforces a hard
    cap (`handleSkillStart` 403s once the 30/month allowance is used —
    see [features/auth.md](features/auth.md)'s Deferred section) because
    no metered billing is wired to a payment processor. Actually
    charging overage needs Stripe usage-based billing (a metered price,
    reported usage records, an invoice line item) — this depends on
    **BL-016**'s Stripe integration (`claudev/charlie/pricing-page`)
    landing first, and is a materially bigger lift than the warning
    banner above (webhook handling, a UI for authorizing overage spend,
    reconciling `skill_runs` counts against what Stripe actually bills).
    Do the warning banner independently; treat overage metering as
    riding on BL-016's merge, not before.
  - Also still open, flagged in `pricing.md`: `answer_question` calls
    are uncapped against any quota today — worth deciding whether a
    near-limit warning should account for that unbounded tail or only
    the metered `skill_runs` count.
- **BL-018 — Scope: bring back a visible waitlist position/counter.**
  **Full integration path now scoped in
  [planning/glass-waitlist-integration.md](planning/glass-waitlist-integration.md)**
  — the branch below (`claudev/quentin/glass-waitlist`) still has the
  whole feature intact (position, referral, the gradient number) plus a
  chunk of other unmerged work (intro animation, nav chrome, `/pricing`,
  an admin waitlist view); that doc covers what's a clean pull-in vs.
  what actually conflicts with the current line (migration numbering,
  `worker/vision.ts`, the stale pre-ADR-0008 `Login.jsx`). Keeping the
  original scoping notes below since the per-option trade-offs (minimal
  count vs. live pre-signup counter vs. reviving referral) still apply
  regardless of which branch the code ends up coming from.
  The current waitlist (`website/src/Waitlist.jsx`, nav modal; the
  footer `WaitlistForm` in `Landing.jsx`) only confirms "You're on the
  list." after signup — no number. An earlier build
  (`claudev/quentin/glass-waitlist`, commit `d722908`, superseded by
  `7aa4811`'s simpler top-bar modal) had a real version of this: the
  worker computed a `position` via a `waitlistPosition(env.DB, id)`
  helper and returned it in the signup response, and the frontend
  rendered it as a large `#{position}` in a blue→purple→pink gradient
  (`.waitlist-place` in the old `index.css`) — that's the "pink #83"
  effect being asked about. It was cut deliberately, not lost by
  accident: `7aa4811`'s commit message says the richer schema (position
  plus referral codes/links) would have needed a new D1 migration and
  worker rewrite the author didn't want to risk unreviewed in
  production, so it shipped the plain `name/email/phone/persona` shape
  that's live today. `worker/db/schema.ts`'s current `waitlist` table
  has no `referral_code` column and `handleWaitlistSignup` returns only
  `{ ok: true }` — the position feature does not exist in any form on
  `main` right now, front or back end.
  - **Scope for bringing it back, not decided yet:**
    - **Minimal version**: re-add just a count, no referral system.
      `SELECT COUNT(*) FROM waitlist WHERE created_at <= (this row's
      created_at)` (or an autoincrement-`id`-based rank, cheaper than a
      timestamp comparison) returned from `handleWaitlistSignup`,
      rendered post-submit with the old gradient treatment. One column-
      free query, no migration.
    - **Showing the count *before* signup** (the "watch the number go
      up" ask) is a different, bigger feature than restoring the
      post-submit number: it means a public, unauthenticated read of
      total signups (a `GET /api/waitlist/count` or similar), live-
      updating on the landing page. Decide: poll on an interval, or
      accept a static count fetched on page load — a live-updating
      counter implies either polling or a push channel, neither of
      which exists on this Worker today. Also a product question, not
      just an engineering one: does showing the raw count help
      (social proof, "join the growing list") or hurt (a low number
      undercuts urgency pre-launch) — worth deciding before building,
      not after.
    - **Referral codes** (`referral_code`, `referredBy`,
      `waitlistReferralUrl` in the old branch) moved people up the list
      and are what made the position number *meaningful* ("send this to
      a friend" — sharing to jump the queue). A bare position with no
      referral mechanic is just a fun number, not a growth loop; decide
      whether this is worth reviving alongside position, since it's the
      part that needed the new migration `7aa4811` avoided.
  - Not scoped here: which of these (if any) actually ships. This entry
    exists so the option and its trade-offs are written down, not to
    pre-decide them.

- **BL-019 — `research_goal`'s response shape needs migrating to the
  flattened per-step model.** Found 2026-09-03 wiring the new `AI_MODE`
  dev toggle ([features/mini-rail.md](../features/mini-rail.md)):
  `ResearchResult { title, steps: [{title, brief, watch_for}] }`
  (`lib.rs`, unchanged since before the 5f flattening decision in
  [planning/minimal-step-mode.md](../planning/minimal-step-mode.md))
  doesn't match what the desktop UI actually renders per step today —
  `instruction_text`/`target_description`/`action`/`expected_outcome`,
  no separate plan-then-expand phase (`fake-skill.js`'s fixture shape,
  what `plan_step` used to produce before it was removed under 5f). This
  is why the home goal box (`submitNewGoalStub`, `sidebar.js`) still
  can't be wired to the real endpoint even with `AI_MODE` on — a bridge
  mapping from the old coarse shape was considered and deliberately not
  built, since a lossy guess (what goes in `target_description`? what
  `action`? no bbox at all from a text-only call) risked silently
  half-breaking the schematic renderer rather than clearly not working.
  Needs an actual product/schema pass on `research.py`'s prompt +
  response schema to emit the flat shape directly — not scoped here,
  same as 5f's own "Storage shape... needs an actual pass there" note
  already flagged and never picked up.
