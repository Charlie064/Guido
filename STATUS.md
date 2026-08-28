# Status

High-churn snapshot of what exists and what's next. Kept out of `CLAUDE.md`
deliberately — that file should stay stable.

_Last updated: 2026-08-28_

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
- No product code yet.

## What's next

- Pick the desktop app framework (Electron/Tauri-class) and record it as an
  ADR — see `docs/architecture/overview.md`.
- Settle the product name (Tutoria vs. TutorialCue) — see the naming note in
  `docs/philosophy/vision.md`.
- Decide non-negotiables (screen-data handling was explicitly deferred, not
  decided) and fill them into `CLAUDE.md`.
- Start on P0 items in `docs/planning/mvp-roadmap.md`.
- **Open, undecided:**
  - Where the Do-mode opt-in toggle lives (global setting vs. per-question).
  - The algorithm the agent uses to decide what to do at each step
    (screenshot vs. web search vs. both) — flagged as high importance,
    needs its own discussion before implementation.
  - What exactly a saved "skill" (`BL-001`) stores.
  - Gamification mechanic (`BL-002`).
