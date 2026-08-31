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
    **Windows done, verified live (2026-08-31)** — `window_icon` prefers
    the window's own icon (`WM_GETICON`, falling back to the window
    class's registered icon) over the exe's own icon (`ExtractIconExW`)
    as a last resort, decoded via `GetIconInfo`/`GetDIBits` with an
    AND-mask fallback for legacy icons with no real alpha channel.
    Verified against real windows on this machine (Windows Terminal,
    Explorer, this app's own window) — correct colors, correct alpha.
    Remaining: the macOS (`NSRunningApplication.icon` off the window's
    owner pid) backend.
  - **Linux: not verified against a real app.** The `_NET_WM_ICON` decode
    has unit tests (`window_provider.rs`) but has never run on real
    pixels: the dev machine is GNOME Wayland, where Mutter publishes no
    `_NET_CLIENT_LIST`, so a walk of the whole X11 tree finds zero windows
    carrying an icon even with `GDK_BACKEND=x11` forced. Needs an X11
    login session before it can be called working.
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
  disclosure written pre-emptively, since `claudev/charlie/stripe-billing`
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
    `stripe-billing`, no merge attempted — see
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
  - **Gate added 2026-08-30**: `claudev/charlie/stripe-billing` must stay
    on Stripe **test-mode keys only** (`sk_test_...`/`pk_test_...`) —
    don't switch to live keys or take a real charge from anyone outside
    the team — until Charlie has registered as a sole trader (enskild
    näringsidkare) with Skatteverket. An individual can legally accept
    payments in Sweden without an AB, but running live billing with zero
    registration crosses from "should register" into non-compliant once
    it's real recurring revenue from real users, not a demo. Hackathon
    demos of the payment flow should run in test mode regardless.
  - **Status check, 2026-08-30**: `stripe-billing` (`be6d8d3` checkout/
    portal/webhook, `b6f0dcb` "add live Stripe price IDs to wrangler
    vars") is **not merged into `main`** — this repo's `main` has no
    billing routes yet, so nothing above is live in production. But the
    branch's own `wrangler.jsonc` now carries real, non-test-mode Stripe
    price IDs (`STRIPE_PRICE_STARTER`/`STRIPE_PRICE_PLUS`), which sits in
    tension with the test-mode-only gate just above — worth an explicit
    check of what `STRIPE_SECRET_KEY` actually is (test vs. live; the
    value itself can't be read back via `wrangler secret list`, only
    that something is set) before that branch merges, not after.
