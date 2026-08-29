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

## What's next

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
- **Designed, not yet built:** the per-step algorithm (manual screenshot
  trigger, lazy AI-generated substeps vs. reactive user-question substeps,
  user-editable path, no-screenshot skill storage, opt-in refresh on
  replay) — see `docs/features/skills.md`. Also closes what a saved
  "skill" stores.
- **ADR 0004 (Cloudflare) accepted, and live.** Dedicated "Tutoria"
  Cloudflare account created and administered by Charlie (Account ID
  `06e757ca8ed84a9c592f859886811b41`, `workers.dev` subdomain
  `guidotutor`) — see `docs/reference/team.md`. Website deployed:
  **https://tutoria-website.guidotutor.workers.dev/**. Scaffold in
  `website/` (`wrangler.jsonc`, `src/index.ts`,
  `migrations/0001_create_waitlist.sql`) — Worker + static assets + a
  waitlist-only D1 database (`tutoria-waitlist`). Verified end to end in
  production: loaded the live URL in a browser, submitted the waitlist
  form, confirmed the row landed in the real D1 database via `wrangler d1
  execute --remote`. Full accounts/auth still deferred, per ADR 0004's
  narrowed scope. **Not yet done:** inviting teammates as Cloudflare
  account members (Manage Account → Members in the dashboard); a real
  domain (currently on the free `workers.dev` subdomain). Pauline still
  owns the actual landing-page content — the current
  `website/public/index.html` is a placeholder proving the wiring, not the
  real site.
- **Open, undecided:**
  - Where the Do-mode opt-in toggle lives (global setting vs. per-question).
  - Gamification mechanic (`BL-002`).
- **Planned, not started: Google login + membership check (Quentin).** See
  `docs/planning/login-membership-plan.md` — extends the D1 waitlist
  database with users/memberships/sessions, adds a Google OAuth flow to
  the website Worker, and wires the desktop app's placeholder login view
  to it. Formalizes the auth scope ADR 0004 explicitly deferred. Blocked
  on Charlie providing Cloudflare account access, a Google Cloud project,
  and a privacy policy page — see that doc's "Before Quentin can start"
  section.
