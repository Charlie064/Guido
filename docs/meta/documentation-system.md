# Documentation system specification

How this project's documentation is organized, how it evolves, and how an AI
agent should consume it. Authoring rules live in
[`style-guide.md`](style-guide.md); this file is the *why* behind the layout.

**Optimization order (breaks every tie):** (1) agent output quality →
(2) minimal token usage → (3) long-term maintainability → (4) reusability →
(5) discoverability → (6) single source of truth → (7) scalability.

## Philosophy — five rules govern everything

1. **One canonical home per concept.** Every fact lives in exactly one file;
   everything else links to it. A concept with two homes has zero homes,
   because they will diverge.
2. **Separate by rate-of-change, not just by topic.** Philosophy changes
   yearly; schemas per-feature; status daily. Content that changes at
   different speeds must not share a file — otherwise slow content inherits
   the fast content's churn.
3. **Separate by audience-at-load-time.** The constitution loads on every
   task, domain docs on domain tasks, reference on lookup. Layer the docs so
   a task pulls the smallest sufficient set.
4. **Reference over repetition.** When doc B needs a fact from doc A, B links
   to A. The cost of a click is far below the cost of a silent divergence.
5. **Stable interface, volatile detail.** Each domain doc opens with a short
   contract (names, boundaries, invariants) before longer detail. Readers
   usually need only the contract.

## The hierarchy

```
CLAUDE.md                   the constitution: laws + load map; small; loaded always
STATUS.md                   high-churn "what exists / what's next" snapshot
docs/
  meta/                     rules for the docs themselves (this file, style-guide)
  philosophy/               why the project exists; conceptual models; rare change
  architecture/             module boundaries, dependency direction, cross-cutting patterns
  features/                 one subsystem per doc, behavior as built/planned
  schemas/                  canonical data shapes
  api/                      external surface (prefer generated; [SYNC-REQUIRED] otherwise)
  workflows/                run/test/branch/commit recipes; coding standards
  reference/                lookups: config, conventions, glossary
  decisions/                ADRs, numbered, append-only
  _archive/                 frozen superseded plans, marked SUPERSEDED, never edited
  BACKLOG.md                parking lot with stable BL-NNN ids; stubs graduate then delete
```

Not every project needs every folder — start with what the project's size
justifies. **Growth adds leaves, never reshapes the trunk**: new subsystems
are new files in existing categories; adding a folder is itself an ADR.

## CLAUDE.md as a router

`CLAUDE.md` is a constitution plus a **load map** — a table mapping task type
to the 1–3 docs that own it. The agent reads `CLAUDE.md` every session (cheap,
because it is small), then follows one or two links. This replaces "grep the
codebase to relearn conventions" with "open the one doc that owns it".
CLAUDE.md must never contain schema bodies, status inventories, file tours, or
anything that churns.

Guides vs. features, the subtle distinction: an **implementation guide** is a
plan for work not yet done (imperative, disposable); a **feature doc**
describes a subsystem as it is (descriptive, durable). When a guide's work
merges, durable content graduates into a feature doc + ADRs and the guide
moves to `_archive/`.

## Maintenance

- **Co-change rule.** A behavior change is incomplete until its one canonical
  doc changes with it, in the same commit. Because each concept has exactly
  one home, "which doc?" is never ambiguous.
- **ADRs are append-only.** Never edit an accepted ADR; write a superseding
  one. Git plus the ADR trail replaces narrative "how we got here" prose.
- **Status lives in one place** — `[built]/[partial]/[planned]` tags on
  feature docs plus `STATUS.md`; never sprinkled into philosophy or
  architecture, which must stay status-agnostic.
- **Graduation, not accumulation.** Plans and backlog stubs are disposable;
  archive or delete them when the work lands.
- **Generated docs for facts, hand-written for judgment.** Mechanical surfaces
  (endpoint tables, type mirrors) should be generated or carry a
  `[SYNC-REQUIRED]` banner so their trust level is explicit.
- **Doc review in code review.** A missing co-change is a review finding, the
  same as a missing test.
