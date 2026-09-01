# AI-generated UI & features proposal (speculative, non-binding)

> ⚠️ **THIS IS NOT A SPEC, PLAN, OR BACKLOG ITEM.**
> Everything below is a single AI-generated brainstorm produced on request,
> written to be deliberately ambitious ("go crazy"). No part of it has been
> reviewed, prioritized, or approved by the team.
>
> **Scope / do-not-implement notice:**
> - Do not open a PR, branch, or task against any section of this doc.
> - Do not create `BL-NNN` entries in [`../BACKLOG.md`](../BACKLOG.md) from
>   this doc. If something here later gets real buy-in, it should be
>   re-proposed through the normal route (a `docs/planning/` doc or a
>   `BACKLOG.md` entry written by a person) rather than pointing back here.
> - This doc is intentionally **not** linked from `CLAUDE.md`'s load map, so
>   it won't be pulled into ordinary task context. It exists for a human to
>   read, cherry-pick from, or discard.
> - If an agent lands here via search and is mid-task: this doc does not
>   authorize any code change. Stop and check with the user before treating
>   anything below as a task.
>
> Grounded in the current product ([`philosophy/vision.md`](../philosophy/vision.md),
> [`decisions/0002-agency-hybrid-vision-platform-business.md`](../decisions/0002-agency-hybrid-vision-platform-business.md)),
> the existing brand system ([`features/website-design-system.md`](../features/website-design-system.md),
> [`features/mascot.md`](../features/mascot.md)), and the MVP roadmap
> ([`planning/mvp-roadmap.md`](../planning/mvp-roadmap.md)) — but goes well
> past hackathon scope on purpose.

---

## Part 1 — UI redesign proposal

The current desktop shell (`spikes/tauri-overlay`) is a 320px sidebar: login
→ apps list → chat-style steps, in the white/plus-grid brand system. It
works, but it's a chat window wearing a tutor costume. The core insight of
the product — Tutoria *sees the screen and points at things* — barely shows
up in the UI itself. The redesign below tries to make the UI feel like it's
actually looking at your screen with you, not messaging you from the side.

### 1.1 Replace the sidebar with a "focus ring" HUD

Instead of a persistent 320px panel eating screen real estate, the primary
surface becomes a thin **focus ring** — a soft glass arc that lives at
whichever screen edge is nearest to the currently-highlighted UI element,
and migrates there as the tutorial progresses. Think of it less like a
sidebar and more like a HUD reticle that happens to also hold text.

- Collapsed state: a small pill (mascot face + one-line current instruction)
  hovering near the target element, connected to it by a thin animated
  tether line (not a heavy bounding box — a single curved stroke, echoing
  the "less fragile than a highlight box" reasoning already in
  [`planning/mvp-roadmap.md`](../planning/mvp-roadmap.md) item 6).
- Expanded state (click or hotkey): the pill grows into a compact card with
  the full step text, a "why this step" toggle, and mode controls — without
  ever taking over the full sidebar width.
- The ring's color is the active mode accent (Teach blue / Show green / Do
  violet) from the existing design system — so mode is always visible
  peripherally, not just as a toggle state buried in a menu.

### 1.2 Physical mode dial, not a settings toggle

Teach / Show / Do currently reads as a preference. Make it feel like a
consequential choice: a **three-position dial** (skeuomorphic, tactile,
with a real click-stop animation and a distinct sound per mode) docked to
the focus ring. Turning it to Do should feel like turning a physical safety
off — deliberately a little ceremonious, reinforcing the opt-in-only
guarantee in [ADR 0002](../decisions/0002-agency-hybrid-vision-platform-business.md).
Switching away from Do should be one motion, always reachable, never buried.

### 1.3 Tuto leaves the corner and becomes a spatial guide

Right now Tuto (the glass mascot, [`features/mascot.md`](../features/mascot.md))
is a cursor-follow buddy. Give it a job: Tuto physically **walks/floats to
the on-screen element** being discussed and does a small "look here" pose
before the tether line is drawn — a two-frame anticipation beat, not just a
static highlight appearing. Tuto's state (`thinking`/`success`/`error`)
becomes the *primary* progress signal, with text secondary — glanceable
from across a room, which matters for a product meant to sit next to
demanding creative-software work (DaVinci, Blender, Figma).

### 1.4 "Confidence weather" instead of a binary verify checkmark

Step verification ([`planning/vision-driven-substep-loop.md`](../planning/vision-driven-substep-loop.md))
currently implies pass/fail. Visualize it instead as a small ambient
gradient wash behind the focus ring — clear/sunny when the model is
confident the step succeeded, cloudy/uncertain when it's guessing, storm-red
when it thinks the user drifted off-plan. This gives the "adapt to the
actual screen" principle in `CLAUDE.md` a visible face instead of a silent
background check.

### 1.5 Timeline scrubber for the whole tutorial

A thin horizontal filmstrip along the bottom of the focus ring showing every
planned step as a small screenshot thumbnail, current step highlighted,
future steps greyed. Users can:
- Scrub back to re-watch/re-read a step without breaking the live session.
- See at a glance how much of the goal is left — turning "Progress & mastery"
  (mentioned as an open mechanic in [`philosophy/vision.md`](../philosophy/vision.md))
  into something visual and per-session, not just a gamified score.

### 1.6 Radial launcher instead of a home screen with an apps list

Replace the current "Apps" list view with a radial (pie-menu) launcher
triggered by the global hotkey, screen-space-anchored at the cursor: goal
text field in the center, recently-used apps and "continue last tutorial"
as ring segments around it. Faster to dismiss, faster to invoke, doesn't
require a docked window at all when idle.

### 1.7 Full theming: let the ring match the target app, not just the brand

Sample the dominant chrome color of whatever app is focused (DaVinci's dark
UI, Figma's light UI, Blender's near-black) and tint the glass focus ring's
background toward it, while keeping the brand accent for interactive
elements. Reinforces "we are inside your software with you," rather than a
foreign brand-colored box pasted over someone else's app.

---

## Part 2 — Feature proposal (making it actually usable day to day)

Where Part 1 is about *feel*, this part is about the features a real user
would need before this stops being a demo and becomes a tool they keep
open.

### 2.1 Skill memory & personal library

Every completed tutorial becomes a saved, replayable "skill" the user can
re-invoke later ("do the color-grade thing again") without re-researching
from scratch — building on the algorithm in
[`features/skills.md`](../features/skills.md). Add:
- A personal library view (searchable, taggable) of skills the user has
  actually completed, distinct from the general skill-generation pipeline.
- Diffing: if the app's UI has visibly changed since the skill was recorded,
  flag it before blindly replaying stale steps — directly serves principle
  2 in `CLAUDE.md` ("never blindly advance a pre-written tutorial").

### 2.2 Session replay & export

Record the sequence of screenshots + steps + verifications for a completed
tutorial and let the user export it as a shareable clip (GIF/video) or a
written mini-guide. Turns every user session into potential onboarding
content / word-of-mouth material, and gives support a concrete artifact
when a user reports "it got stuck here."

### 2.3 Interrupt & redirect mid-plan

A first-class "wait, actually—" affordance: pause the active plan, ask a
side question or redirect the goal, then either resume the original plan or
have it re-researched from the new context. Right now the loop implies a
straight line from Research → Guide; real usage will constantly branch.

### 2.4 Undo/checkpoint for Do mode

Before Do mode performs an action, snapshot what's undoable (where the
target app supports native undo, queue a matching undo call; where it
doesn't, warn explicitly). A visible "Tuto just did: <action> — Undo"
toast after every autonomous action. This is the single highest-leverage
trust feature for an opt-in autonomous mode — without it, "Do" is a
one-way door.

### 2.5 Cost/latency budget meter

Surface an unobtrusive running indicator of vision-call spend and latency
per session (ties to [`business/pricing.md`](../business/pricing.md) COGS
math), so both the user (on a metered plan) and the team (watching
Anthropic API spend) can see it live rather than finding out at the invoice.

### 2.6 Multi-app / multi-window awareness

Today's model assumes one focused app. Real workflows span apps (e.g.
export from DaVinci, then upload in a browser). Detect app-switches
mid-tutorial and let the plan span more than one application, carrying
context across the switch instead of treating it as "user went off task."

### 2.7 Accessibility as a first-class mode, not an afterthought

- Full screen-reader narration of every step and verification result.
- A "read the plan aloud" mode that doesn't require the visual overlay at
  all — useful for low-vision users and for anyone working via voice
  ([`features/voice.md`](../features/voice.md)).
- Respect OS-level reduced-motion settings for all of Part 1's tether-line
  and Tuto-walking animation.

### 2.8 Local-first privacy dashboard

Given screen-watching is the core mechanic and screen-data handling is
explicitly flagged as an unresolved non-negotiable in `CLAUDE.md`, ship a
visible, always-reachable panel showing: what was captured this session,
whether/where it left the device, and one-click "delete everything from
today." Trust UI for a product whose core feature is "an AI is watching
your screen" needs to be a feature, not a settings-page afterthought.

### 2.9 Community/shared skills (opt-in, moderated)

Let users optionally publish a completed skill (e.g. "cinematic grade in
Resolve") to a shared library other users can pull from, with visible
provenance ("used by 340 people," "last verified against Resolve 19"), and
a lightweight report/flag mechanism. Turns individual tutorials into a
compounding asset instead of one-off, per-user research spend.

### 2.10 Live co-watching (for teachers/teams)

A teacher or team lead starts a Tutoria session and a learner can "watch
along" (read-only mirrored highlight/step feed) on their own screen while
working in their own copy of the app — useful for classroom or onboarding
contexts without needing real screen-share software.

---

## Closing note

None of the above has been scoped for effort, technical feasibility, or
fit with the hackathon-era constraints in
[`planning/mvp-roadmap.md`](../planning/mvp-roadmap.md) (no complex backend,
no accounts, no billing, no long-term memory). Several items here directly
require those things (2.1, 2.2, 2.9, 2.10) and are explicitly *not* meant to
collapse the MVP scope — they're here to give the team a wishlist to raid
later, not a queue to work through now.
