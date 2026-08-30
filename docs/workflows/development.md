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
the waitlist admin. **No Cloudflare login needed for local `dev` /
`dev:api`** — `wrangler dev` uses local D1.

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
a download. `GET /api/geo` returns `{ country }` from Cloudflare so
Guido Pro can show a local sticker converted from €7.99. It POSTs JSON (`name`,
`email`, `apps`, `appsOther`, `role`, `ref`) to `/api/waitlist`. The
Worker validates and inserts into D1 (`worker/index.ts` +
`migrations/0001_create_waitlist.sql`,
`0003_add_waitlist_profile_fields.sql`, and
`0004_waitlist_apps_and_referral.sql`).
Do not add Next.js, Framer Motion, or Supabase — the site stays Vite +
the existing Worker.

Local D1 migrations (only needed once, or after a schema change):

```sh
npm run db:migrate:local
```

Google login (desktop loopback + Worker) lives on the same Worker:
branded `/login` (Guido fonts/buttons), then `/auth/google/start`,
`/auth/google/callback`, `/api/me`, `/api/skills/start`. Copy `website/.dev.vars.example` to
`website/.dev.vars` and fill `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET`. Register the exact callback
`http://localhost:8787/auth/google/callback` (local) or
`https://guidotutor.com/auth/google/callback`
(production; `https://tutoria-website.guidotutor.workers.dev` still
works) on the Google OAuth client. The privacy policy Google
requires is `website/public/privacy.html` (`/privacy.html`). Quota
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
`npm run deploy` attaches those hostnames from `wrangler.jsonc`. This
needs `wrangler login` once, and needs you to actually be a member
of the Tutoria Cloudflare account — invites went out 2026-08-29 (see
[reference/team.md](../reference/team.md)); check your email/spam if you
haven't accepted yours yet.
