# Minimal step mode: one step at a time, vision-grounded, in place of a chat log

**Contract** [speculative — not scoped, not approved, nothing built]
- A plan, not a source of truth — if this gets real buy-in it graduates
  into `features/` docs + an ADR as pieces get built, then gets deleted
  per [meta/style-guide.md](../meta/style-guide.md). Check
  [STATUS.md](../../STATUS.md) for current status, not this doc.
- **5c and 5f have graduated**: the minimized per-step view described
  below as the "sticky rail" got built as the desktop app's "mini rail"
  (2026-09-02, iterated on through 2026-09-03) — see
  [features/mini-rail.md](../features/mini-rail.md) for what actually
  exists, which deviates from the shape described below (a second state
  of the `sidebar` window, not a persistent overlay — see that doc's
  "Deviation from the plan"). This doc stays as the historical design
  record; don't edit 5c/5f to match the build, and don't treat this doc
  as current status for either.
- Origin: a design conversation with Quentin (2026-09-01) about the
  current step/chat UI feeling like "following a step-by-step tutorial"
  rather than feeling like Tutoria is inside the app with you.
- Builds on, and in places directly conflicts with, the per-step model in
  [features/skills.md](../features/skills.md) ("Per-step loop") and the
  confirm/verify loop in
  [vision-driven-substep-loop.md](vision-driven-substep-loop.md) — read
  both first. This doc is a proposed *replacement* for parts of that
  design, not an addition to it; conflicts are called out inline rather
  than silently overriding the earlier docs.
- **Every open decision below is a real, unresolved product decision** —
  none are answered here. Per `CLAUDE.md`'s handoff rule, they need to be
  resolved by whoever owns product scope before this becomes buildable,
  not decided quietly by whoever picks this doc up.

## The ask, restated

Today's flow: Research (one web-grounded call) produces a full list of
top-level steps up front; opening a step lazily calls `plan_step` to
generate that step's substeps, all at once, text-only; the user reads
through a chat-style transcript of substeps, pressing target icons /
"Check my work" per substep as they go.

The proposal replaces this with a tighter loop:

1. **No deep Research before the first step.** The AI gives the user one
   actionable step immediately, grounded in a screenshot of the current
   screen — not a pre-built multi-step plan.
2. **A vision call fires on every step**, not just when the user presses
   "locate" or "Check my work" — the AI always looks at the screen before
   telling the user what to do next.
3. **A concurrent, lightweight plan** runs alongside the immediate step,
   so the per-step vision call has something to stay grounded against
   instead of freewheeling one step at a time with no destination. This
   plan can be revised dynamically as steps land and the screen turns out
   different than expected.
4. **Minimal UI**: not the current chat transcript, but a small persistent
   surface — a text box and two buttons, roughly "Next step" and
   "Confirm" — plus a **question button** that expands into a free-form
   prompt when the user wants to ask something instead of advancing.
5. **Previous-chat picker** — the user can return to and resume an earlier
   goal/chat, not just start fresh each time.
6. **Teach and Do modes both move the cursor** to the relevant on-screen
   location; Do mode additionally performs the click/type itself.

## What's already true today (for contrast)

- `plan_step` is text-only and runs once per top-level step, not once per
  substep and not vision-grounded — see `skills.md`'s "Per-step loop."
  Nothing today sends a screenshot before telling the user what to do.
- `verify_substep`/`locate_element` are both manual, user-triggered vision
  calls, deliberately not automatic — see
  [vision-driven-substep-loop.md](vision-driven-substep-loop.md)'s "What
  this changes about earlier cost math," which explicitly credits keeping
  vision calls user-triggered as what kept the design's cost model cheap.
  **This proposal removes that constraint** — see Cost, below.
- Research is a single call that produces the whole step list up front;
  there is no "one step immediately, no upfront plan" path today.
- `move-cursor` already exists as an AI-chosen `action` value in
  `plan_step`'s output but nothing renders or acts on it — deferred to
  [BL-010](../BACKLOG.md). This proposal is the first design that would
  actually need BL-010 built, in both Teach and Do mode, not just Do mode.
- Do mode's actuation mechanism is now **partially** built, not fully
  absent: OS-level cursor movement exists
  ([features/cursor-control.md](../features/cursor-control.md),
  2026-09-03) but is only reachable from a manual test button — nothing
  AI-driven calls it, and click/type actuation still don't exist at all.
  ADR 0002 scoped Do mode opt-in and left "where the toggle lives" and
  "what algorithm decides the action" open in `STATUS.md`. This proposal
  doesn't answer either; it assumes Do mode can click, which still isn't
  true.
- Chat/skill history already persists to disk (`skills.md`'s "Storage"),
  but there is no UI to browse and reopen a previous chat — today's home
  screen shows one fixture "Excel chats" row, not a real list
  ([BL-004](../BACKLOG.md), still faked).

## Proposed shape

### 5a. Immediate-step + concurrent plan

Two calls fire close together when a goal is entered, not one after the
other:

- **Immediate step**: takes a screenshot of the current screen plus the
  goal text, returns one concrete instruction — no upfront plan needed
  for this call to produce something useful.
- **Concurrent plan**: a smaller, cheaper version of today's Research
  call — text-only (no screenshot, no web search unless the goal needs
  domain facts a screenshot can't supply) — producing a short, coarse
  step list purely to give the per-step loop something to check itself
  against and to know roughly how far along the user is. This plan is
  explicitly allowed to be wrong or incomplete; it exists to catch drift,
  not to be followed verbatim (principle 2 in `CLAUDE.md`).
- The two calls race; the immediate step is shown as soon as it returns,
  the plan fills in underneath (e.g. a thin progress indicator) once it
  lands. If the plan disagrees with where the immediate step took the
  user, the *next* step generation call reconciles against the plan
  rather than the plan overriding what already happened.
- **This plan is revised, not fixed** — each subsequent step's vision
  call can feed back "here's what's actually on screen now" and the plan
  updates rather than being treated as ground truth from the first call.

### 5b. Per-step vision call

Every step advance (not just "Check my work") takes a screenshot and asks
the model for the next instruction grounded in it, replacing today's
batch-generated, text-only substep list. This is the part that most
directly reopens `CLAUDE.md`'s open screen-data non-negotiable and the
cost math in `pricing.md` — see below.

### 5c. Minimal UI — sticky rail vs. expanded view (revised 2026-09-01)

Refined in a follow-up conversation with Quentin the same day. Two
genuinely separate surfaces, not one view with a collapsed state:

- **Sticky rail** (always visible while a goal is active): step text,
  an **expand** affordance ("more information") for the current step's
  longer detail, a **question button** that opens a free-text prompt
  inline (acknowledged as making the rail wider in that moment — accepted
  tradeoff for a user who wants to stop and get a real answer rather than
  advance), a **Next step** button, and a separate **Check work** button.
  Cursor movement (Teach: indicator only; Do: indicator + actual
  move/click, per 5e) fires on every step **for free** — it does not
  itself trigger a new vision call, it just acts on whatever coordinates
  the last vision-grounded call already produced (Research/plan/last
  "Check work"). This directly resolves Open question 4 below: **"Next
  step" is the self-confirm path (no AI call), "Check work" is the
  optional AI-verify path** — the same two-button split
  `vision-driven-substep-loop.md` already built, just fronted by the
  sticky rail instead of inline per-substep buttons in a chat transcript.
  A user who's fluent in the app being taught can work entirely off the
  rail — short text plus a moving cursor — and never pay for a vision
  call beyond the ones that already seeded the current coordinates.
- **Expanded view** (opened from the rail's expand affordance; not
  sticky, scrolls normally): previous chats/skills (5d), the fuller step
  detail, and — per the "what this doesn't answer" section below — full
  transcript/review. The rail and the expanded view are **visually and
  structurally distinct surfaces**, not the same component in two CSS
  states: the rail's job is to stay small and always-present without
  competing with the app underneath; the expanded view's job is to hold
  everything that doesn't need to be always-present.
- **Stale-target risk, stated explicitly** (per the tradeoff above): since
  "Next step" doesn't re-look at the screen, if the user has drifted off
  the expected screen state between vision calls, the cursor points at a
  stale target and nothing catches it until they press "Check work"
  themselves. Accepted for now as the same cost/trust tradeoff the
  existing manual-verify design already makes — not a new risk category,
  just inherited by the rail.

### 5d. Previous-chat picker

A real list view over the skills/chats already persisted per
`skills.md`'s "Storage," replacing the current fixture "Excel chats" row.
Mostly a UI build over existing data, not a new backend need — closest in
scope to [BL-004](../BACKLOG.md) (real app grouping/detection), which is
also still unbuilt and could reasonably be done in the same pass.

### 5e. Cursor movement in both modes

- **Teach mode**: an animated cursor indicator drifts toward the target
  element (BL-010's "lighter, less fragile than a highlight box"
  reasoning, already written down, just not built) — shows *where*
  without moving the real system cursor.
- **Do mode**: same visual, but followed by an actual OS-level cursor
  move + click/type. The cursor-move half of this now has real code to
  build on ([features/cursor-control.md](../features/cursor-control.md))
  — the click/type half, and anything actually *driving* the move from a
  plan step rather than a manual test button, still don't exist. See
  "What's already true today," Do mode bullet.

## Cost, latency, and screen-data handling

**Superseded in large part by the 5c revision above** (2026-09-01): with
"Next step" free (no vision call, just acting on already-known
coordinates) and "Check work" the only paid, opt-in vision call, this
section's original concern — a vision call firing automatically on every
step advance — no longer applies to the rail's default path. The analysis
below is kept because it still applies to whichever calls *do* fire
automatically: the immediate-step call (5a) and the concurrent/revised
plan (5a) are still automatic by design, just no longer joined by a
per-step vision call on every single advance. Re-derive the cost model
against 5a + opt-in "Check work" specifically, not against "vision call
every step," before pricing this.

Original framing, for the parts still relevant:

- That doc's "What this changes about earlier cost math" section credits
  keeping vision calls **manual, user-triggered, at most once per
  substep-confirm** as what kept this design's cost cheap enough to not
  need re-deriving `pricing.md`'s "5 vision calls per step" planning
  number. **This proposal removes that constraint** — a vision call fires
  on every step advance, automatically, not on a user press. That planning
  number needs to be re-derived, not assumed, before this ships.
- Rough shape of the new cost, using `pricing.md`'s own unit costs
  (~$0.0014 per half-res 1080p vision call, ~$0.10 per Research-weight
  call): if a typical goal is ~5–8 steps and *every* step now costs one
  vision call plus a fraction of a lightweight-plan call, per-skill cost
  moves from the current "~$0.18–0.22/skill" (`pricing.md`'s adjusted
  estimate, itself already revised up from an earlier automatic-locate
  assumption) back toward something closer to that earlier, more
  expensive automatic-per-step model — `pricing.md` explicitly flags this
  exact swing: "If we ship [automatic per-substep capture], locates drop
  toward ~6/skill and these numbers fall by ~4x" was written the other
  direction (manual → cheaper); this proposal walks it back
  (manual → automatic → more expensive). **Not costed precisely here —
  needs an actual pass against `pricing.md`'s model before a number gets
  quoted anywhere**, but the direction is unambiguously "more expensive
  per skill," and the `pro` tier's margin is already flagged as thin
  (`pricing.md`: "~50% margin before voice costs land").
- **Screen-data handling**: `CLAUDE.md`'s non-negotiables section has an
  explicit open TODO — screen-data handling was "considered and
  explicitly deferred... revisit before shipping beyond a demo." Both
  `vision-driven-substep-loop.md` and `mvp-roadmap.md`'s P1 item 12 note
  this same tension and resolved it by keeping capture user-triggered.
  Automatic per-step capture is precisely the shape of change that TODO
  was written to flag — this doc does not resolve it, it just makes the
  question unavoidable before build.
- **Latency**: today, a step's substeps are generated once (on first
  open) and then render instantly as the user works through them. Under
  this proposal, *every* step advance waits on a network round-trip vision
  call before showing the next instruction — likely worse perceived
  latency mid-goal, even though the very first step appears faster
  (no upfront Research wait). Worth prototyping both feels before
  committing, not assuming either one wins.

### 5f. Flattened step list, single upfront generation (revised 2026-09-02)

Decided in a follow-up conversation with Charlie, prompted by the desktop
app's minimized-view work actually being built (see `STATUS.md`)
surfacing this as a real UI question rather than a hypothetical one: the
step/substep split is gone. **A "step" is now the only unit** — what
used to be a substep (one instruction, one `target_description`, one
`expected_outcome`) *is* a step; there is no coarser container above it
and no per-step lazy-generation phase inside it.

- **Research becomes one regular AI call**, not the two-call race 5a
  proposed. It returns the complete, ordered, flat step list for the
  goal in a single response — closer to what `research_goal` already
  does today (see "What's already true today," above), just without the
  nested substep list under each entry. **This supersedes 5a**: there is
  no separate "immediate step" call anymore, and no concurrent
  lightweight plan racing against it, since the one call already
  produces the whole thing.
- **`plan_step` goes away.** Nothing is generated lazily per-step
  anymore — the reason `plan_step` existed (generate a step's substeps
  only once the user reaches it) doesn't apply once there's nothing left
  to expand into.
- **Storage shape**: `skill.steps[]` is the only level —
  `steps[].substeps[]` is gone. Each entry carries what a substep used
  to (`instruction_text`, `target_description`, `action`,
  `expected_outcome`, `last_known_bbox`), not what a step used to
  (`title`/`brief`/`watch_for` as a container with nothing executable of
  its own). Affects `skills.md`'s storage model directly — needs an
  actual pass there, not just the desktop app's fixture data
  (`fake-skill.js`), before this is buildable against something real.
- **5b (a vision call on every step advance) is untouched by this** — a
  separate, still fully open question about whether/when a screenshot
  gets taken, independent of whether the plan itself is flat or nested.
- Motivation, stated plainly rather than left implicit: a flat list is
  easier for the AI to *revise* mid-skill than a two-level one is (no
  step-vs-substep coordination when inserting/removing/reordering) — see
  Open question 7, which this decision was made in service of but does
  not itself resolve.

### 5g. Plan revision (sketch, 2026-09-02 — a proposal for Open question
7, not a decision)

Speculative even by this doc's own standard: nothing below is scoped,
approved, or resolves question 7 — it's a concrete enough shape to argue
about, written because "should the AI revise the plan" is hard to
evaluate in the abstract. Reject or rewrite freely.

- **Trigger: piggyback on a call that already carries a screenshot,
  don't add a new automatic one.** The two existing vision-grounded
  moments — "Check work" failing, and a question sent with
  `includeScreenshotForNextQuestion` on — are where the AI can actually
  see something that contradicts the plan. Rather than a third,
  always-on call (which is exactly the cost/screen-data expansion the
  "Cost, latency, and screen-data handling" section above already
  flags), let either of those responses optionally carry a plan patch
  alongside their normal answer, e.g. `plan_patch: { fromStepId,
  steps: [...] }`. Absent in the common case; present only when the
  model itself judges the remaining plan is now wrong.
- **A typed question is the richest signal available today**, before 5b
  (automatic per-step vision) is ever built — it's the one moment the
  user volunteers unprompted information about the real environment
  ("I don't have an Insert tab, where is it?" is exactly this case — a
  concrete example `fake-skill.js` carried until the 5f flattening pass
  collapsed every step to one substep and dropped it). A failed
  Check-work is the other trigger, but
  it's ambiguous by itself: did the *user* mis-click, or was the *plan*
  wrong about what the app looks like? Not disambiguated here — for now
  both funnel into the same optional `plan_patch`, and it's on the
  model's judgment call in the prompt, not on separate app logic.
- **Locked vs. revisable, split strictly on position, not content**:
  anything at an index before the current step is locked — never
  rewritten, no exceptions. The user already read and acted on it, and
  principle 3 ("Verify before continuing") already confirmed it against
  the real screen; rewriting history serves no one and contradicts what
  actually happened. Everything from the current step onward (inclusive)
  is the revisable region — `plan_patch.fromStepId` names where the
  patch starts, and it wholesale replaces every step from there to the
  end (insert, remove, reorder, reword all fall out of "replace the
  tail" rather than needing separate operations).
- **Surfaced, not silent.** A plan that quietly changes under the user is
  the wrong failure mode for a *teaching* tool (principle 1) — trust
  depends on the user being able to tell what changed and why. Minimal
  version: a one-line note in the mini rail ("Guido updated the plan
  based on your question") plus the timeline re-rendering with the new
  step count; no modal, no interruption, consistent with everything else
  about this view staying low-friction. A revised-but-not-yet-reached
  node could get its own one-time visual distinction from a plain "not
  reached" gray node, but the exact treatment isn't designed here.
- **Explicitly not addressed**: whether the model can be trusted to
  *only* patch when it should (a model that revises too eagerly is its
  own failure mode, arguably worse than never revising); what happens if
  a patch arrives while the user is mid-typed-question on a *later*
  step than the one the patch is anchored to; and prompt-level detail
  for how the model is told about "the tail is revisable, the head
  isn't." All real, none resolved here.

## What this proposal doesn't answer

- **Do-mode actuation** — how a click/type actually gets issued at the OS
  level, on which platform first. Not newly opened by this doc; it's
  ADR 0002's already-open item, just now load-bearing instead of
  deferrable.
- **Hallucination/drift mitigation beyond "have a concurrent plan"** — the
  plan reduces drift risk but doesn't eliminate it; what happens when the
  per-step vision call and the concurrent plan actively disagree (not
  just "plan was incomplete," but "vision call proposes something the
  plan considers wrong") isn't designed here.
- **Relationship to today's step/substep split.** This proposal collapses
  "step" and "substep" into one vision-grounded unit per advance. That's
  a real modeling change against `skills.md`'s two-level structure, not a
  UI skin over it — see Open question 1.

## Open questions (none resolved here — see `CLAUDE.md`'s handoff rule)

1. **Resolved (2026-09-02):** replaces it — see 5f. The coarse top-level
   container is gone; a step is the only unit, and Research returns the
   full flat list in one call. Storage-shape work in `skills.md` is
   still needed, not just a UI change.
2. **Resolved (2026-09-01) for the rail's default path:** "Next step" is
   free/no-vision-call, "Check work" is the opt-in paid vision call — see
   5c. The rest of this question is now moot, not just answered: it asked
   whether 5a's immediate-step call and concurrent plan should be
   tier-gated, but 5f (2026-09-02) removed both — there's just the one
   Research call now, so the question this was asking about no longer has
   a subject. Whether *that* call is ever tier-gated isn't addressed
   anywhere and would need its own question if it matters.
3. **What tier gates this, if it's meaningfully more expensive?** Given
   the cost direction above, does this become a `pro`-only mode, or does
   it change the free tier's "1 new skill, lifetime" allowance math?
4. **Resolved (2026-09-01):** "Next step" = self-confirm, no AI call;
   "Check work" = the AI-verify path — same split
   `vision-driven-substep-loop.md` already built, now fronted by the
   sticky rail. See 5c.
5. **Where does the full transcript go?** Confirmed still wanted for
   review/export, lives in the non-sticky expanded view alongside the
   previous-chat picker (5c/5d) — but its layout within that view isn't
   designed yet.
6. **New, from the 5c revision:** how does the rail decide when
   coordinates are stale enough to warn the user before they press "Next
   step" on a target that's silently gone wrong (see the stale-target
   risk noted in 5c)? Not designed — could be as simple as a low-key
   "unverified" indicator on the rail after N free advances without a
   "Check work" press, but that's a guess, not a decision.
7. **New, 2026-09-02 — sketched in 5g, not decided:** can the AI revise
   the flat step list mid-skill, and how does that relate to the user
   asking a question? 5f's flattening was motivated by this being easier
   against a single list than a nested one. 5g proposes an answer
   (piggyback the patch on a Check-work/question call that already has a
   screenshot; lock everything before the current step; surface the
   change) but explicitly doesn't resolve whether the model can be
   trusted not to over-revise, or the prompt-level mechanics — still a
   real, open product decision, not settled by having a sketch.
