**Contract**
- Time-boxed overnight plan across all four people, target: a working
  demo-v0 (see [demo-v0.md](demo-v0.md)) plus submission-ready website copy
  and a rehearsed pitch by morning.
- A plan, not a source of truth — graduates then gets deleted, per
  [meta/style-guide.md](../meta/style-guide.md). Check
  [STATUS.md](../../STATUS.md) for current status, not this file.
- Hour blocks are relative to whenever the overnight session actually
  starts — treat as "Hour 0" = now, not a clock time.

## Tracks

| Person   | Track | Depends on |
| -------- | ----- | ---------- |
| Charlie  | Technical build (demo-v0) | — |
| Pauline  | Website | Charlie's Hour 2 checkpoint (target app + goal locked) |
| Elanore  | Outreach / pitch | Charlie's Hour 2 checkpoint |
| Quentin  | Outreach, website (secondary) | same as above |

The website and outreach tracks both need one thing from the technical
track early: **which app and which goal the demo actually targets**, since
copy, screenshots, and the pitch script all reference it. Everything else on
those tracks can proceed independently.

## Technical track (Charlie)

Follows [demo-v0.md](demo-v0.md) Phase 0 → Phase 1 directly.

- **Hour 0–2 — Phase 0 spike, steps 1–4.** Python script: screenshot → send
  to Claude vision with a target element → draw returned box on a copy of
  the image → open and check it landed correctly.
  **Checkpoint (Hour 2):** target app and one concrete goal are locked in
  (e.g. "highlight the Color tab in DaVinci Resolve") — tell Pauline/Elanore
  immediately, don't wait for the full write-up.
- **Hour 2–4 — Phase 0 step 5, accuracy iteration.** Repeat across a few
  elements in the locked app. If accuracy is poor, this is the point to
  reconsider prompting/approach — don't carry a shaky detector into Phase 1.
  **Exit criterion:** consistently accurate boxes before moving on.
- **Hour 4–6 — Phase 1, steps 1–3.** Swap the saved-screenshot loop for a
  live capture, draw the box as a real Tauri overlay window (shell already
  validated — see the `claudev/charlie/tauri-overlay-spike` branch), add
  the text bubble.
- **Hour 6–7 — Phase 1 step 4.** Wire the hardcoded 2–3 step sequence with
  manual advance (keypress "next").
- **Hour 7–8 — Rehearse the demo script** from demo-v0.md end to end, at
  least twice. Fix whatever breaks on the second run, not the first.
- **Buffer:** if Phase 0 blows past Hour 4, cut Phase 1 down to a single
  step (one highlight, no sequence) rather than rushing multiple steps.

## Website track (Pauline, Quentin secondary)

- **Hour 0–2:** Set up the site skeleton (hosting choice, basic page
  structure) — doesn't need the locked app/goal yet.
- **Hour 2–5 (after Charlie's checkpoint):** Real copy and hero content
  built around the actual demo — the pitch content in
  [vision.md](../philosophy/vision.md) (concept, the Goal→Learn loop,
  Teach/Show/Do, key features) is the source material; don't restate it
  independently, adapt it.
- **Hour 5–7:** Screenshot or short clip slot reserved for the actual
  working overlay once Charlie has something to capture (coordinate timing
  around his Hour 4–6 block).
- **Hour 7–8:** Final polish, proofread, check on mobile width.

## Outreach track (Elanore, Quentin)

- **Hour 0–2:** Draft the pitch/talking script structure and submission
  text skeleton — the team one-pager already written is a starting point,
  adapt rather than rewrite from scratch.
- **Hour 2–5 (after Charlie's checkpoint):** Fill in the concrete demo
  example (real app, real goal) once it's locked, so the pitch matches what
  will actually be shown, not a generic description.
- **Hour 5–7:** Identify who to demo to (judges/mentors) and when; prepare
  any submission-form fields.
- **Hour 7–8:** Dry-run the pitch alongside Charlie's demo rehearsal —
  timing the verbal pitch against the actual on-screen demo matters more
  than either one being polished alone.

## Sync points

- **Hour 2:** target app/goal locked, shared with the whole team
  immediately (don't wait for a scheduled check-in).
- **Hour 5:** quick all-hands — is the technical demo on track for Phase 1?
  If not, website/outreach should plan around a screenshot-only fallback
  instead of a live demo.
- **Hour 7–8:** joint rehearsal — pitch + demo together, at least once,
  before anyone calls it done.
