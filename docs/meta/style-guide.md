# Documentation style guide

How to author a doc in this system. The rules serve two goals in order:
(1) agent/reader output quality, (2) token efficiency — a typical task should
load `CLAUDE.md` plus 1–3 leaf docs, never the whole tree.

## Every doc

1. **Open with a `**Contract**` block** — a short bullet list of the names,
   boundaries, and invariants a reader needs before any detail. This is what
   the load map in `CLAUDE.md` points at; readers descend into detail only if
   needed (progressive disclosure).
2. **One canonical home per concept.** If you need a fact owned by another
   doc, **link** to it — never restate it. A duplicated fact is a future
   contradiction.
3. **Keep it a leaf.** Prefer short, focused docs. Foundational docs may be
   long; everything else should be loadable in a few hundred tokens.
4. **Tag status** with `[built]`, `[partial]`, or `[planned]` when a doc
   describes a feature/subsystem. Don't narrate status inside
   philosophy/architecture — put it on feature docs and in `STATUS.md`.
5. **Code wins.** When prose and code disagree about *how*, fix the prose.
   Flag known divergences explicitly.

## Links

- Use relative paths (`../architecture/overview.md`) so links work in-repo
  and on the forge.
- Link **liberally** to related docs at point of mention — the system should
  read like a connected graph, not isolated files.
- Cross-reference the *why* (ADRs, vision) from the *how*
  (architecture, features).

## Where things go

Decide the layer before writing. Rule of thumb by rate-of-change:
rare → `philosophy/`, `decisions/` (ADRs are append-only);
occasional → `architecture/`, `schemas/`, `reference/`;
per-feature → `features/`;
fast/mechanical → `api/`, `STATUS.md` (prefer generation).

## ADRs

One decision per file, numbered `NNNN-kebab-title.md`, append-only: never edit
an accepted ADR; if reversed, write a new ADR that supersedes it. Sections:
Status, Context, Decision, Consequences. Index them in `decisions/README.md`.

## Generated docs

Mark mechanical facts (endpoint tables, type mirrors) `[SYNC-REQUIRED]` until
a generator is wired, then `[GENERATED — do not hand-edit]`. Hand-written docs
are for judgment (why, how-to-reason); generated docs are for facts
(shapes, signatures).

## Graduating a guide

When an implementation guide's work ships: move durable behavior into a
`features/` doc, capture decisions as ADRs, and delete the guide. Git history
keeps it if anyone ever needs it. Never let a stale plan masquerade as current
truth.
