# Test plan: VS Code "create a new folder with a text file"

**Status:** manual test procedure, not yet run.
**Exercises:** the live Research -> Step -> Substep -> Verify pipeline
described in [features/skills.md](../features/skills.md), against the
current build where Verify is optional/non-blocking and no spotlight
overlay exists yet ([BACKLOG.md](../BACKLOG.md) BL-012, deferred).

## Setup

- VS Code open to a working directory (not empty — a real project, per
  the scenario framing).
- Guido app running (`cd spikes/tauri-overlay && npx tauri dev`), an
  `ANTHROPIC_API_KEY` set in `.env` at the repo root.
- This goal is typed fresh into chat, so it drives the **live**
  `research_goal` / `plan_step` calls — not the `fake-skill.js` fixture
  data used by the pre-loaded skills list.

## Scenario

**Goal typed into chat:** *"Create a new folder with a text file in it"*

### 1. Research (`research_goal` -> `research.py`)

No screenshot is taken here — goal-scoped web search only, no screen
awareness yet. Expect an ordered list of top-level steps, roughly:

- Open the integrated terminal
- Create the folder (e.g. `mkdir <name>`)
- Create the text file inside it
- Confirm the file appears in the Explorer

Exact wording/count will vary — it's a live LLM call, not a fixture.
This is a shape check, not a string match.

### 2. Expanding a step -> substeps (`plan_step` in `sidebar.js`
`generateStepSubsteps()`, ~line 1110)

Fires lazily, only when a step is expanded — text-only (goal + that
step's title/brief/watch_for), still no screenshot. Expect 2-4
substeps, each with `target_description`, `instruction_text`,
`action`, and `expected_outcome` (the field the af979f0 commit fixed
from being silently dropped).

### 3. Do

No automation — Guido doesn't click for you. The user performs the
instruction in VS Code by hand.

### 4. Verify — optional, per substep (`verifyHtml()` ~line 1378,
verify click handler ~line 1501, backend `verify_substep` in
`src-tauri/src/lib.rs` ~line 209)

- "Check my work" appears **only if** `expected_outcome` was
  generated for that substep.
- Clicking it screenshots the real screen and calls Claude vision
  (`verify_step.py` / `verify.py`'s `verify_outcome()`) to compare
  against `expected_outcome`, returning `{matches, observed}`.
- Mismatch surfaces an "Ask for help" button that prefills chat.
- **"Next step" (`advanceToNextStep()` ~line 1549) is always
  available and self-confirms** — it does not check whether any
  substep in the step was verified, or whether verification matched.
  Advancing with an unverified or mismatched substep is expected
  behavior under the current design, not a bug.

### 5. No overlay

Nothing highlights or spotlights the terminal icon, menu item, or
file. The dark spotlight/cut-out overlay is BL-012 — an unbuilt
sketch, not implemented. The only visual aid possible is the existing
box+bubble overlay (`showOverlayFor()`, needs a whole-screen capture
source) or the in-panel schematic fallback.

## Pass/fail signals to watch for

- [ ] Research returns a plausible ordered step list with no
      screenshot taken (confirms goal-only, not screen-aware).
- [ ] Substeps are generated lazily per expanded step, not all at once.
- [ ] Substeps carry non-empty `expected_outcome` text.
- [ ] "Check my work" appears only on substeps that have
      `expected_outcome`.
- [ ] "Next step" advances regardless of verify state (intentional).
- [ ] No spotlight/dim overlay appears anywhere in the flow.

## Result

_(filled in after the run — expected vs. observed per step, any
mismatch between this plan and actual app behavior, screenshots or
terminal excerpts as evidence.)_
