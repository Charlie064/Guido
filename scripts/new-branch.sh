#!/usr/bin/env bash
# Creates and checks out a claudev/<name>/<feature-name> branch without
# anyone having to remember or type the format by hand.
#
# Usage: scripts/new-branch.sh <feature-name> [name]
#   feature-name  required, e.g. "landing-hero"
#   name          optional override (charlie/pauline/elanore/quentin) —
#                 only needed if auto-detection picks the wrong person.
#
# Name -> prefix mapping mirrors docs/reference/team.md. Update both places
# if the roster changes.

set -euo pipefail

feature="${1:-}"
if [[ -z "$feature" ]]; then
  echo "Usage: $0 <feature-name> [name]" >&2
  exit 1
fi

override="${2:-}"

detect_name() {
  local candidate
  candidate="$(git config user.name 2>/dev/null || true)"
  candidate="$(echo "$candidate" | tr '[:upper:]' '[:lower:]')"
  case "$candidate" in
    *charlie*)  echo "charlie" ;;
    *pauline*)  echo "pauline" ;;
    *elanore*)  echo "elanore" ;;
    *quentin*)  echo "quentin" ;;
    *) echo "" ;;
  esac
}

if [[ -n "$override" ]]; then
  name="$override"
else
  name="$(detect_name)"
fi

valid_names=(charlie pauline elanore quentin)
is_valid=false
for n in "${valid_names[@]}"; do
  [[ "$name" == "$n" ]] && is_valid=true
done

if [[ "$is_valid" != true ]]; then
  echo "Couldn't work out who this branch is for from \`git config user.name\` ($(git config user.name 2>/dev/null || echo unset))."
  echo "Pick one:"
  select chosen in "${valid_names[@]}"; do
    [[ -n "$chosen" ]] && name="$chosen" && break
  done
fi

branch="claudev/${name}/${feature}"
git checkout -b "$branch"
echo "Created and switched to $branch"
