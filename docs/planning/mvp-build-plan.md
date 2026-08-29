# MVP build plan — parallel tracks

**Contract** [planned]
- The execution plan for the P0 slice of [mvp-roadmap.md](mvp-roadmap.md),
  picking up where [demo-v0.md](demo-v0.md) stopped. The roadmap says *what*
  the MVP is; this says *in what order, by whom, and how each piece is
  tested*.
- Organised as **independent tracks with disjoint file ownership**, so two
  or more people (or sessions) can work at once without merge conflicts.
  The file-ownership table is the load-bearing part.
- A plan, not a source of truth — graduates into `features/` docs + ADRs as
  items ship, then gets archived per
  [meta/style-guide.md](../meta/style-guide.md). Check
  [STATUS.md](../../STATUS.md) for what is actually built.
- Implements the session flow and per-step loop specified in
  [features/skills.md](../features/skills.md) — that doc owns the mechanics,
  this one owns the sequencing. Don't restate substep fields here.

## The problem this plan solves

Two halves work and are not connected. The vision pipeline
(`locate_element` → `live_step.py`) is proven; the app shell walks a full
skills → steps → chat flow. But `sidebar.js` only ever invokes
`resize_sidebar`, and every step, substep, and reply comes from
`src/fake-skill.js`. **There is currently no AI in the app.** The captured
region is likewise never consumed by a vision call.

The whole plan is one goal: cut the fixture data out of the loop, without
losing the ability to fall back to it on stage.

## Explicitly out of scope

Mouse movement, click, and keyboard input (roadmap P0 items 6–8) are
**deliberately deferred** despite their P0 tier: Do mode is one mode, not
the default ([ADR 0002](../decisions/0002-agency-hybrid-vision-platform-business.md)),
and no synthetic-input tool works on this Wayland setup — untestable work
should not be built. Also out: voice, web research beyond the single
Research call, automatic screen-diff verification, accounts, billing.

## Phase 0 — unblock (serial; nothing else starts first)

Both items are prerequisites for every track below.

**T0.1 — live accuracy baseline.** Open a fresh VS Code window at the
Welcome screen with no folder open, and run `live_step.py` against all four
targets validated in [demo-v0.md](demo-v0.md) Phase 0. Record real hit/miss
counts there.
- *Why first:* every accuracy figure on record is from either a saved
  screenshot or the wrong screen state (see [STATUS.md](../../STATUS.md)).
- **Gate:** below 3/4, stop and tune the prompt and capture region before
  building anything on top of the detector.

**T0.2 — freeze the data contract.** Mirror the substep shape from
[features/skills.md](../features/skills.md) into two files that both sides
import: `src/skill-schema.js` and `spikes/vision-detect/schema.py`.
- *Why first:* this is the seam. Once the JSON shape is fixed, the Python,
  Rust, and frontend tracks proceed without reading each other's code.

## Phase 1 — parallel tracks

| Track | Branch suffix | Owns (only these files) | Needs |
| --- | --- | --- | --- |
| A — AI calls | `ai-calls` | `spikes/vision-detect/` (new files only) | Python + API key |
| B — Rust bridge | `tauri-commands` | `src-tauri/src/lib.rs` | Rust |
| C — Frontend | `live-data-ui` | `src/sidebar.*`, `src/styles.css` | JS only |
| D — Persistence | `skill-storage` | `src/storage.js` (new) | JS only |

Branch naming per [CLAUDE.md](../../CLAUDE.md) workflow rules — use
`scripts/new-branch.sh <suffix>`.

### Track A — AI calls

Three standalone CLI scripts, each reading a JSON payload on stdin and
writing schema-valid JSON to stdout. All testable from a terminal against a
saved screenshot: no Tauri, no Rust, no UI.

1. **`research.py`** — goal → ordered coarse top-level steps. Runs once per
   chat. This is the highest-leverage call in the system (everything
   downstream is generated from its output), so budget real time on the
   prompt rather than shipping the first version that parses.
2. **`substeps.py`** — one top-level step + compact prior context +
   screenshot → blue AI substeps.
3. **`answer.py`** — user question + step context + optional screenshot →
   reply text plus one pink reactive substep.

**Test:** `echo '{...}' | python research.py` emits schema-valid JSON for
three different goals; per-call token cost noted in the PR.

### Track B — Rust bridge

1. Generalise `run_locate` into a single `run_python(script, payload)`
   helper — it is currently hardcoded to `live_step.py`.
2. Add commands `research`, `generate_substeps`, `answer_question`, and
   thread the region from `region-select` through to them.
3. Capture-once helper: one `grim` shot per manual trigger, reused by every
   call in that turn. Otherwise each step pays two captures and two
   sidebar hide/show cycles.

**Test:** `cargo check` clean, and each command invocable from the devtools
console with a fixture payload — no UI changes required to verify.

### Track C — Frontend

1. **Split `sidebar.js`** into view / state / data modules. This is a
   refactor of a 372-line file and needs sign-off before someone starts;
   without it, Track C is a one-person track (`sidebar.html` is 668 lines
   and will conflict).
2. **Data source behind one interface**, with two implementations:
   `fixture` (today's `src/fake-skill.js`) and `live` (Tauri invoke),
   switchable by a flag. *This is the demo insurance* — if the API is slow
   or down on stage, one flag still yields a fully walkable app.
3. **Loading, error, and "couldn't locate that element" states.** Nothing in
   the current UI can fail; every AI call can. The locate-failure case is
   specified in [features/skills.md](../features/skills.md) — surface it as
   "navigate to X first", never a stale box.
4. **Manual screenshot button** — the user-triggered capture that
   `skills.md` specifies does not exist yet.
5. **Substep delete**, so a raw Q&A trace can be pruned into a clean skill.

### Track D — Persistence

Save and load skills as JSON in the app data dir; the skills list reads real
saved files instead of the `SKILLS` fixture. No screenshots stored, per
[features/skills.md](../features/skills.md). Small and fully isolated — the
best first task for a second person.

### Non-technical, fully parallel

Owners per [reference/team.md](../reference/team.md): real landing-page
content (the current `website/public/index.html` is a placeholder proving
the wiring, see [website-v0.md](website-v0.md)); demo video script and
waitlist copy; and the outstanding Cloudflare member invites.

## Phase 2 — integration (serial, one person)

1. Flip the Track C data source to `live` and walk goal → research → steps
   → substeps → chat end to end. Fix what breaks.
2. Wire the schematic preview to `last_known_bbox` on open (free, no API
   call) with an opt-in per-substep refresh, per the replay/refresh model in
   [features/skills.md](../features/skills.md).
3. **Decide the on-screen highlight question.** Timebox a click-through
   layer-shell surface (`set_ignore_cursor_events`) to two hours. If it
   works, the "points at the real element" promise in
   [philosophy/vision.md](../philosophy/vision.md) is restored and refresh
   accuracy starts to matter. If it does not, amend that doc and record the
   schematic-only approach as an ADR — the divergence is flagged in
   `STATUS.md` and `skills.md` today, but has never been decided.

## Phase 3 — demo hardening

Rehearse the [demo-v0.md](demo-v0.md) script twice against a fresh VS Code
Welcome window, on separate runs — the second run is where the real bugs
appear. Verify the fixture fallback flag still produces a clean walkthrough,
and check cumulative API spend against the budget.

## Ordering rationale

Phase 0 comes first because the detector gates everything and its accuracy
is currently unmeasured. The tracks are cut along language boundaries rather
than feature boundaries because that is what makes file ownership disjoint —
a feature-shaped split ("do the chat", "do the steps") would put two people
in `sidebar.js` immediately. Integration is deliberately serial: it is
debugging, and debugging does not parallelise.
