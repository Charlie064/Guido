**Contract**
- Branch naming, commit conventions, and the co-change rule live here.
- Run/test/build instructions belong in this file once the stack is chosen.

## Branching and commits

- Branch naming: `claudev/<feature-name>`.
- Conventional commits (`feat:`, `fix:`, `docs:`, ...), subject < 72 chars.
- Always ask before committing.
- `main` only takes completed, tested merges.

## Co-change rule

A behavior change updates its one canonical doc (per `CLAUDE.md`'s load map)
in the same commit. No-behavior refactors/bugfixes are fine to land without a
doc update.

## Run / test / build

TODO — fill in once the desktop app shell and stack are chosen.
