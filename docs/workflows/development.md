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

- **Linux on Wayland** is the primary dev target — see
  [ADR 0002](../decisions/0002-agency-hybrid-vision-platform-business.md).
  **Which Wayland compositor you run changes which capture path you get**
  ([ADR 0007](../decisions/0007-portal-capture-backend-wayland.md)):
  - **GNOME or KDE** (the portal path — verified working): install
    `python-gobject` and GStreamer's PipeWire plugin, e.g.
    `pacman -S python-gobject gst-plugin-pipewire` /
    `apt install python3-gi gstreamer1.0-pipewire`. Also install the
    portal backend for your desktop (`xdg-desktop-portal-gnome` or
    `-kde`). `grim` is useless here — GNOME and KDE don't implement the
    protocol it needs.
  - **Sway, Hyprland, other wlroots compositors**: install `grim`
    (`pacman -S grim` / `apt install grim`).
  - **X11**: nothing extra; `mss` handles capture and windows are
    enumerated directly over X11.
  macOS/Windows use their own native window backends (`window_provider.rs`)
  and `mss` capture; both are implemented but not yet verified on real
  hardware.
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

**Don't try to `pip install PyGObject` into this venv.** The portal capture
path needs `gi`, which is a distro package that wants
gobject-introspection headers and a meson build. `portal_capture.py`
handles this itself: if the interpreter running it has no `gi`, it re-execs
once into a system `python3` that does. Install `python-gobject` with your
package manager (above) and leave the venv alone.

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

This launches the Tutoria panel as a plain decorated window at its full
size — **there is no collapsed icon to click anymore** (it was removed
along with the collapse/expand resize dance, which relied on
always-on-top/undecorated behaviour that didn't hold up on GNOME; see the
header comment in `src/sidebar.js`). If you see a small draggable icon,
you are running an old build — `git pull`.

Walk through login (placeholder — any click continues) → setup (pick what
to capture) → skills → a step's path → that step's chat. Press **Escape**
to quit.

**The setup step behaves differently per platform**, and the button tells
you which you have ([ADR 0007](../decisions/0007-portal-capture-backend-wayland.md)):

- **"Select window"** (macOS, Windows, Linux/X11) — the screen dims and
  you click the window you want; its live rect is re-queried before every
  capture, so moving or resizing it is fine.
- **"Choose source"** (Linux/Wayland) — your desktop's own share prompt
  opens. Pick a screen *or* a window; you only get prompted once, and
  every later capture is silent. **Pick a whole screen if you want the
  highlight box drawn on your real screen** — Wayland won't tell the app
  where a single shared window is, so a window share falls back to the
  in-panel diagram. The setup label states which you'll get, e.g.
  `Capturing: screen (1920x1080) — on-screen box`.

Rust changes need the app restarted (`tauri dev` rebuilds, but
`tauri.conf.json` changes need a full restart). Python changes need
nothing — those scripts are shelled out per call.

**Linux dev builds show a generic cog icon** in the dock/switcher until
you run `scripts/install-linux-icon.sh` once. On Wayland the compositor
ignores the icon the window sets on itself and matches the surface
`app_id` (`tauri-overlay`) to an installed `.desktop` file; the script
writes one plus the hicolor icons that packaged builds would ship.
Restart the app afterwards.

The skills/steps/chat content is **fixture data** (`src/fake-skill.js`),
not real AI output — it exercises the real UI and the real substep shape
from [features/skills.md](../features/skills.md) without making API
calls. The vision pipeline (`locate_element` → `live_step.py`) is wired
but not currently called from this flow; see
[STATUS.md](../../STATUS.md) for what's verified vs. not.

The app runs as three windows: the `sidebar` panel you interact with, a
`region-select` click-catcher used for the native pick gesture, and an
`overlay` window for the on-screen highlight (see
[ADR 0006](../decisions/0006-restore-real-on-screen-overlay.md)).
Captures hide the sidebar automatically so it never appears in the frame
sent to the vision model.

### Writing a new Tauri command

**Any command that shells out to Python, hits the filesystem, or talks to
X11/the portal must be `async fn`, with the actual blocking work inside
`tauri::async_runtime::spawn_blocking`** — not a plain synchronous
`#[tauri::command] fn`. A synchronous command runs inline on the same
thread that pumps the window's event loop, so anything slower than
instant (a `research.py` call is routinely 30-60s; a portal pick can block
up to 5 minutes on the user) freezes the whole window — the compositor
reports it as "Not Responding," which is a real hang, not a rendering
glitch. See `locate_element`/`research_goal`/`pick_portal_source` etc. in
`lib.rs` for the pattern:

```rust
#[tauri::command]
async fn my_command(arg: String) -> Result<Out, String> {
    tauri::async_runtime::spawn_blocking(move || my_command_blocking(&arg))
        .await
        .map_err(|e| format!("my_command task panicked: {e}"))?
}
```

On the JS side, wrap the `invoke()` call in `withStatus` (`sidebar.js`) so
the persistent status bar shows something is genuinely in flight rather
than the app looking stuck — see the calls in `submitNewGoal`,
`generateStepSubsteps`, and `selectPortalSource` for the pattern,
including per-call `slowAfter`/`stallAfter` thresholds tuned to how long
that specific call normally takes.

### Troubleshooting capture on Wayland

- **"Choose source" errors with `Unknown method CreateSession or interface
  org.freedesktop.impl.portal.ScreenCast`.** `xdg-desktop-portal` is a
  stale process from a *different* compositor — it caches the backend it
  picked at startup, so after switching between, say, Hyprland and GNOME
  without logging out fully, it routes screen-casting to a backend that
  can't serve it. Check with
  `tr '\0' '\n' < /proc/$(pgrep -x -f /usr/lib/xdg-desktop-portal)/environ | grep XDG_CURRENT_DESKTOP`
  and compare against your live session, then:

  ```sh
  systemctl --user restart xdg-desktop-portal
  ```

- **`ModuleNotFoundError: No module named 'gi'`** — install
  `python-gobject` (see Prerequisites). Don't pip-install it.
- **`grim failed ... compositor needs the portal path instead`** — you're
  on GNOME/KDE, where `grim` can't work. The app picks the portal
  automatically; this only appears if a script is invoked by hand without
  `--portal`.
- **Sanity-check the capture path on its own**, without the app:

  ```sh
  cd spikes/vision-detect
  python3 portal_capture.py pick any          # prompts once
  python3 portal_capture.py capture /tmp/shot.png any   # must be silent
  ```

  Then open `/tmp/shot.png` — a blank or black image means the frame grab
  failed even though the portal handshake worked.

### 4. Website (Cloudflare Workers + D1)

Scope owned by Pauline — see [website-v0.md](../planning/website-v0.md).
The scaffold already has a working waitlist end to end (a Worker, a D1
table, and a form that POSTs to it); this section is how to run it and
how to drop your own site content into it.

```sh
cd website
npm install
npm run dev
```

`npm run dev` is the Vite landing page (Pauline’s Guido site) at
`http://localhost:5173`. API routes live on the Worker — in another
terminal run `npm run dev:api` (`wrangler dev` on :8787). Vite proxies
`/api`, `/auth`, and `/internal` to that port so the waitlist form and
the waitlist admin work.

`npm run build` writes the SPA to `website/dist/`. `npm run deploy`
builds then runs `wrangler deploy`, which serves `dist/` as assets plus
`worker/index.ts`. Browser navigations to `/api/*`, `/auth/*`, and
`/internal/*` run the Worker first (`run_worker_first` in
`wrangler.jsonc`) so the SPA fallback does not swallow Google login or
the waitlist admin. Desktop Better Auth (`/api/auth/*`) and Aqua Voice
(`/api/voice/transcribe`) also run on this Worker. **No Cloudflare
login needed for local `dev` / `dev:api`** — `wrangler dev` uses local D1.

`GET /internal/waitlist` (and `GET /internal/waitlist/export` for CSV)
is served by the Worker, not the React app, and is not linked from the
public site. Localhost is open. On `guidotutor.com` / `workers.dev` the
Worker returns 404 unless Cloudflare Access set
`Cf-Access-Authenticated-User-Email`. Put Access in front of
`/internal/waitlist*` before relying on the live URL. Locally, open
`http://localhost:8787/internal/waitlist` on `wrangler dev`.

**If you built your site separately** (your own localhost project, not
started from this scaffold), bringing it in is a copy, not a rewrite:

The live landing page is Pauline’s Guido Vite app in `website/src/`
(from `claudev/pauline/landing-page`). Static extras (logos, demo clip,
`privacy.html`) go in `website/public/`. The Worker is
`website/worker/index.ts`; on deploy it serves `website/dist/`.

**Keep the waitlist working:** the header and bottom “Join the waitlist”
buttons open the multi-step glass modal (`website/src/Waitlist.jsx`).
`/waitlist?ref=` opens the same overlay. `/pricing` is the same chrome
plus Free and Guido Pro cards; those CTAs open the waitlist, not
a download. Desktop Upgrade/Manage opens `/pricing.html` (Charlie's
Free/Starter/Plus billing copy) so the static file does not steal the
public `/pricing` route. Assets use `html_handling: none` for that. `GET /api/geo` returns `{ country }` from Cloudflare so
Guido Pro can show a local sticker converted from €7.99. It POSTs JSON (`name`,
`email`, `apps`, `appsOther`, `role`, `ref`) to `/api/waitlist`. The
Worker validates and inserts into D1 (`worker/index.ts` +
`migrations/0001_create_waitlist.sql`,
`0003_add_waitlist_profile_fields.sql`, and
`0004_waitlist_apps_and_referral.sql`). Desktop Better Auth / quota
tables live in `0002_create_auth_and_quotas.sql`; Aqua Voice usage is
`0005_create_voice_usage.sql`. Do not add Next.js, Framer Motion, or
Supabase — the site stays Vite + the existing Worker.

Local D1 migrations (only needed once, or after a schema change):

```sh
npm run db:migrate:local
```

Desktop login is Better Auth email+password on this same Worker
(`/api/auth/*`, `/api/me`, `/api/skills/start`, `/api/voice/transcribe`) —
see [features/auth.md](../features/auth.md). Copy
`website/.dev.vars.example` to `website/.dev.vars` and fill
`BETTER_AUTH_SECRET` (`npx auth secret` or `openssl rand -base64 32`).
The public site stays waitlist chrome: branded `/login` is a pointer
back to the desktop app, not a second download landing. Privacy is
`website/public/privacy.html` (`/privacy.html`). Terms are
`website/public/terms.html` (`/terms.html`). Quota
rules are in [business/pricing.md](../business/pricing.md).

Deploying live:

```sh
npm run deploy
```

A Vercel static deploy of `website/` is optional (`website/vercel.json`).
It serves the same Vite app; `/api` and `/auth` rewrite to
`https://guidotutor.com` so the waitlist still writes D1. The live
product host is Cloudflare, not Vercel.

Production is `https://guidotutor.com` (and `www`) on the Tutoria
Cloudflare account, via custom domains on the `tutoria-website` Worker.
**Production must stay the waitlist Worker** from
`claudev/quentin/glass-waitlist` (Join the waitlist top-right, Usecases,
working `/pricing` with Free + Guido Pro, first-visit intro). That
Worker also carries Charlie's Better Auth, quota, and Aqua Voice
routes for the desktop app. Do not `npm run deploy` from `main`, from
`claudev/charlie/desktop-google-login`, or from any download-landing
tree — that overwrites `tutoria-website` for everyone and puts
"Download for free" back on guidotutor.com. Charlie's Stripe checkout
lives on the desktop branch; it is not the public marketing site.
`npm run deploy` attaches those hostnames from `wrangler.jsonc`. This
needs `wrangler login` once, and needs you to actually be a member
of the Tutoria Cloudflare account — invites went out 2026-08-29 (see
[reference/team.md](../reference/team.md)); check your email/spam if you
haven't accepted yours yet.
