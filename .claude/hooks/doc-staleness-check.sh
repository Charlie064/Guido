#!/usr/bin/env bash
# Advisory nudge, not a gate: staged behavior-bearing code with no staged
# doc touch commonly means docs/BACKLOG.md (BL-NNN entries), docs/decisions/
# (ADR status), or STATUS.md silently drifted out of date in this repo —
# see the audit that prompted this hook (BL-003/005/006/008/010/012,
# ADR 0006, all found stale relative to already-committed code).
set -euo pipefail

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

staged="$(git diff --cached --name-only 2>/dev/null || true)"
[ -n "$staged" ] || exit 0

src="$(printf '%s\n' "$staged" | grep -E '^(spikes/|website/worker/|website/src/|website/wrangler\.jsonc)' || true)"
[ -n "$src" ] || exit 0

docs="$(printf '%s\n' "$staged" | grep -E '^(docs/|STATUS\.md)' || true)"
[ -z "$docs" ] || exit 0

reason='Staged changes touch behavior-bearing code (spikes/ or website/worker|src|wrangler.jsonc) with no docs/ or STATUS.md change staged in the same commit. This repo'\''s co-change rule (CLAUDE.md) expects the canonical doc updated in the same commit. Before finalizing: check whether docs/BACKLOG.md has a BL-NNN entry describing something this change removed or altered, whether any docs/decisions/*.md ADR'\''s decision was just reversed or superseded, and whether STATUS.md still matches reality. Not every commit needs this -- skip it if none applies.'

jq -n --arg reason "$reason" '{
  systemMessage: $reason,
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow",
    permissionDecisionReason: $reason
  }
}'
