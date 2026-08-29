#!/usr/bin/env bash
# Copy static mascot files into the website and desktop trees.
# Canonical source is this directory. Re-run after generate-svgs.mjs / generate-icon.mjs.
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
web="$root/../../website/public/assets/mascot"
app="$root/../../spikes/tauri-overlay/src/assets/mascot"
mkdir -p "$web" "$app"
cp "$root"/mascot-*.svg "$root/app-icon.svg" "$root"/app-icon-*.png "$web/"
cp "$root"/mascot-*.svg "$app/"
echo "synced static mascot assets"
