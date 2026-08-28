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
  - Frontend (`src/main.js`) resizes the overlay to the primary monitor on
    launch, positions the red box + explanation bubble from the returned
    coordinates, and advances through the hardcoded 3-step sequence on
    keypress (N / Enter), matching demo-v0 Phase 1 step 4.
  - **Verified live, end to end, on this machine tonight:** `npx tauri dev`
    launched a real transparent/always-on-top window sized to the actual
    screen; it called into the Python live-capture pipeline and rendered
    the box + bubble at the returned coordinates. Rust side (`cargo
    check`) compiles clean.
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
- **Open, undecided:**
  - Where the Do-mode opt-in toggle lives (global setting vs. per-question).
  - The algorithm the agent uses to decide what to do at each step
    (screenshot vs. web search vs. both) — flagged as high importance,
    needs its own discussion before implementation.
  - What exactly a saved "skill" (`BL-001`) stores.
  - Gamification mechanic (`BL-002`).
