**Contract**
- Scope for the first, deliberately minimal demo — a walking skeleton, not a
  feature-complete P0 build. Supersedes nothing in
  [mvp-roadmap.md](mvp-roadmap.md); this is a narrower slice that comes
  before it.
- Goal: prove the one unproven technical assumption — that a vision call can
  reliably locate a specific UI element on screen — before investing in
  anything else.
- A plan, not a source of truth — graduates into `features/` docs + ADRs as
  pieces get built, then gets archived per
  [meta/style-guide.md](../meta/style-guide.md). Check
  [STATUS.md](../../STATUS.md) for current status.

## In scope

- One target app, one fixed goal, hardcoded (e.g. "highlight the Color tab
  in DaVinci Resolve"). No goal-input UI, no web research.
- One screenshot → one vision call → returns the element's approximate
  location → overlay draws a box + short text bubble on the real app window.
- **Teach/Show only.** No mouse/keyboard automation (no Do mode).
- Manual advance (keypress/button says "I clicked it, next step") instead of
  automatic screen-diff verification.
- At most a 2–3 step hardcoded sequence, not a general planner.

## Explicitly out of scope

Goal input, web research, step planning, click/keyboard automation,
screen-state verification, voice, multi-app support, global hotkey, the
desktop-app shell/framework choice (Electron vs. Tauri — see
[STATUS.md](../../STATUS.md)).

## Why this scope

Isolates the one question nobody's answered: can a vision call reliably
locate a specific UI element well enough to draw an accurate on-screen box?
Research quality, planning quality, and input automation are separate bets —
don't make them all at once.

## Phase 0 — vision detection spike (build this first)

Pure validation, no app shell, no framework commitment. A short script,
testable step by step.

1. **Setup.** A small Python script (fastest iteration for image handling +
   API calls; doesn't lock in the eventual desktop-app language). Anthropic
   API key configured.
   **Test:** script runs, no errors.

2. **Screenshot capture.** Script captures the current screen and saves it
   to disk as a PNG (start with a saved screenshot file if capturing the
   live screen is inconvenient on your setup).
   **Test:** open the saved PNG, confirm it matches what's on screen.

3. **Ask the vision model to locate an element.** Send the screenshot plus a
   plain-language target ("find the Color tab") to Claude vision, and ask
   for a structured JSON response with pixel coordinates (bounding box or
   center point).
   **Test:** run against a screenshot with an obvious, well-known element
   (e.g. a browser's address bar). Sanity-check the returned coordinates
   are in a plausible range for the image size.

4. **Draw the result.** Take the returned coordinates and draw a box on a
   copy of the screenshot, save that as a second PNG.
   **Test:** open the output PNG — does the box actually land on the right
   element? This is the real test of the whole spike.

5. **Iterate on accuracy.** Repeat step 3–4 across several different
   elements and at least one of the target apps (DaVinci Resolve, Blender,
   Figma, VS Code — see [vision.md](../philosophy/vision.md)). Try
   variations in the prompt (bounding box vs. center point, ask it to
   explain its reasoning first). Track hit rate informally.
   **Test:** does accuracy hold up outside the one easy example from step 3?

**Phase 0 exit criterion:** consistently accurate boxes on at least one real
target app, across a handful of different elements. If accuracy is poor, do
not proceed to Phase 1 — the whole premise needs rethinking (different
prompting, image tiling/zooming, OS accessibility hybrid per
[ADR 0002](../decisions/0002-agency-hybrid-vision-platform-business.md), a
different vision provider) before any app gets built.

## Phase 1 — minimal live overlay (only after Phase 0 passes)

1. Same detection call, but against a live screen capture instead of a
   saved file.
2. Draw the box as a real always-on-top transparent overlay window instead
   of onto a saved image copy. This is the first point the desktop-shell
   framework choice (Electron/Tauri) actually matters — not before.
3. Add the text bubble (see "Instruction/explanation popup" in
   [architecture/overview.md](../architecture/overview.md)).
4. Wire the hardcoded 2–3 step sequence with manual advance.

## Demo script (v0)

1. Launch the script with the hardcoded goal already set.
2. It screenshots, calls vision, draws the overlay box + bubble on the real
   app.
3. User performs the step, presses "next."
4. Repeat for the remaining hardcoded steps.

Target impression: proof that the AI can actually see and point at a real
UI element in a real app — nothing more.
