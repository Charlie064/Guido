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
    Remaining: the macOS (`NSRunningApplication.icon` off the window's
    owner pid) and Windows (`WM_GETICON`/`ExtractIconEx`) backends, and a
    `.desktop` fallback for X11 apps that set no `_NET_WM_ICON`.
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
- **BL-009 — No app identity at all on Wayland.** BL-004 assumes the
  fallback for Wayland is manual entry ("user names the app, same as
  today"), but there is no such fallback in the build: on the portal
  backend `selectedAppName()` returns `null`, so a chat saves
  `appName: null`, Research gets no app to scope its search to, and the
  chat list can show no icon. Verified, not theoretical — the portal's
  only identifying output is `"window (1920x1080)"` (`describe()` in
  `spikes/vision-detect/portal_capture.py`); it never discloses which
  app the user picked, by design.
  - This is the *whole* app-identity story on GNOME/KDE Wayland, which is
    the dev machine and a large share of Linux users — not an edge case.
  - Cheapest fix: let the user type/confirm the app name in setup on the
    portal backend, and key the icon cache off that. Same manual entry
    BL-004 already names, just actually built.
  - Decide before building: whether manual entry is portal-only or offered
    everywhere as an override (a native pick can also resolve "wrong",
    e.g. a browser-hosted app reporting only "Chrome" — the known gap
    already noted under BL-005).
