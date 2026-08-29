**Contract**
- Branch naming, commit conventions, and the co-change rule live here.
- Run/test/build instructions belong in this file once the stack is chosen.

## Branching and commits

- Branch naming: `claudev/<name>/<feature-name>` — run `scripts/new-branch.sh
  <feature-name>` instead of typing this by hand; it detects who you are
  from `git config user.name` and creates the branch for you (pass a name
  as a second argument to override). See the roster in
  [reference/team.md](../reference/team.md).
- Conventional commits (`feat:`, `fix:`, `docs:`, ...), subject < 72 chars.
- Always ask before committing.
- `main` only takes completed, tested merges.

## Co-change rule

A behavior change updates its one canonical doc (per `CLAUDE.md`'s load map)
in the same commit. No-behavior refactors/bugfixes are fine to land without a
doc update.

## Run / test / build

Two pieces today, both under `spikes/` (see [STATUS.md](../../STATUS.md)):
a Python vision-detection script (`vision-detect`) and a Tauri overlay app
(`tauri-overlay`) that shells out to it. No test suite yet — verification
is manual (does the box land on the right element / does the overlay
render), per [demo-v0.md](../planning/demo-v0.md).

### Prerequisites

- **Linux on Wayland** (Sway, Hyprland, ...) is the primary dev target — see
  [ADR 0002](../decisions/0002-agency-hybrid-vision-platform-business.md).
  Install `grim` (Wayland-native screen capture; e.g. `pacman -S grim` /
  `apt install grim`). macOS/Windows aren't verified yet — the code paths
  gated to Linux (layer-shell overlay positioning, `grim` capture) simply
  won't activate, falling back to plain `mss` capture on X11-like setups.
- **Python 3.10+**
- **Node.js + npm**
- **Rust** (via [rustup](https://rustup.rs)) plus Tauri v2's own Linux
  system dependencies (webkit2gtk, libsoup3, gtk3) — see [Tauri's
  prerequisites guide](https://v2.tauri.app/start/prerequisites/). On
  Linux you'll also need the `gtk-layer-shell` system library for the
  always-on-top overlay to render above status bars (see
  `src-tauri/Cargo.toml`'s comment on `gtk-layer-shell`).
- An Anthropic API key — Claude vision is the screen-understanding
  provider (see [ADR 0001](../decisions/0001-ai-tutor-not-computer-use-agent.md)).

### 1. Clone and set the API key

```sh
git clone <this repo> && cd tutoria
cp .env.example .env
# edit .env, set ANTHROPIC_API_KEY=sk-...
```

Keep `.env` at the repo root — the Python side loads it via `python-dotenv`,
which walks up from its own working directory until it finds one.

### 2. Vision-detect (Python)

```sh
cd spikes/vision-detect
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

The Rust side calls `.venv/bin/python3` directly by a hardcoded relative
path (`src-tauri/src/lib.rs`), so the virtualenv must live at exactly
`spikes/vision-detect/.venv` — don't rename or relocate it.

Sanity-check the vision call works on its own before touching the overlay:

```sh
.venv/bin/python detect.py
```

Confirm the output box lands on the right element in the saved sample
screenshot (see [demo-v0.md](../planning/demo-v0.md) Phase 0).

### 3. Desktop app (Tauri)

```sh
cd spikes/tauri-overlay
npm install
npx tauri dev
```

This launches the always-on-top Tutoria panel, collapsed to a small icon
in the top-left corner. Click the icon to expand it, then walk through
login (placeholder — any click continues) → setup (optionally drag a
capture region) → skills → a step's path → that step's chat. Press
**Escape** to quit.

The skills/steps/chat content is **fixture data** (`src/fake-skill.js`),
not real AI output — it exercises the real UI and the real substep shape
from [features/skills.md](../features/skills.md) without making API
calls. The vision pipeline (`locate_element` → `live_step.py`) is wired
but not currently called from this flow; see
[STATUS.md](../../STATUS.md) for what's verified vs. not.

Note the directory name (`tauri-overlay`) predates the current design —
there is no on-screen overlay anymore, only this panel. See the "Visual
overlay" section in [architecture/overview.md](../architecture/overview.md)
for why.
