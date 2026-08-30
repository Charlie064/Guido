# Handoff — glass-waitlist is production (Quentin → Charlie)

**Contract**
- Written **30 August 2026, ~11:18 CEST** after Quentin's website session.
- Production marketing site + Worker: branch **`claudev/quentin/glass-waitlist`**
  (tip **`b9ba444`** or later). Deploy only from this branch unless you
  explicitly replace it.
- Charlie owns Cloudflare secrets, GitHub release CI, Apple signing, and
  moving Anthropic calls server-side. Quentin owns not redeploying the old
  download landing over `guidotutor.com`.

## What's live on guidotutor.com

- **Join the waitlist** (header + multi-step overlay) — primary CTA.
- **Download** (header + bottom) — Charlie's platform modal; links to
  `github.com/Charlie064/Guido/releases/latest/download/` (`Guido_mac.dmg`,
  `Guido_windows.exe`, `Guido_linux.AppImage`). Implemented in
  `website/src/Download.jsx`.
- **`/pricing`** — React waitlist site (Free + Guido Pro, geo currency).
- **`/pricing.html`** — your desktop billing copy; kept separate via
  `html_handling: none` in `website/wrangler.jsonc`.
- Intro animation once per browser; Better Auth + voice routes on the same
  Worker (merged from `desktop-google-login` at **`af0a1cc`**).

**Do not** `npm run deploy` from `main`, from `desktop-google-login`'s download
`Landing.jsx`, or from any tree that puts **Download for free** as the only
hero CTA — that overwrites `tutoria-website` for everyone. See
`docs/workflows/development.md`.

## Before Charlie can start

1. **Cloudflare Worker secrets** (Tutoria account, `tutoria-website`):
   - `BETTER_AUTH_SECRET` — auth (likely set).
   - `AQUA_VOICE_API_KEY` — mic / `/api/voice/transcribe` (see
     [features/voice.md](../../features/voice.md)).
   - **`ANTHROPIC_API_KEY` — not wired for Research yet** (below).

2. **Apple Developer ID + notarization** for macOS DMG — users report
   **"Guido is damaged"** after downloading `Guido_mac.dmg` from GitHub.
   Release build is adhoc/linker-signed with a broken resource seal
   (`spctl`: *code has no resources but signature indicates they must be
   present*). Fix in `.github/workflows/release.yml` on
   **`claudev/charlie/website-download-button`** (`7be78ab`): sign + notarize
   before upload. Until then, workaround for testers:
   `xattr -cr /Applications/Guido.app` then adhoc re-sign, or Right-click →
   Open — not acceptable for public users.

3. **GitHub Actions `workflow` scope** — Quentin could not push
   `.github/workflows/release.yml` from this branch (OAuth App blocked).
   That workflow already lives on your **`website-download-button`** branch;
   merge or cherry-pick onto whatever branch you cut releases from.

## P0 — Research still uses local `.env`, not login

Desktop **Ask / Research** still shells out to `spikes/vision-detect/research.py`
with **`ANTHROPIC_API_KEY` from repo-root `.env`**. Sign-in does **not** inject
Charlie's key. Voice already uses the right pattern (`POST /api/voice/transcribe`
+ bearer token + Worker secret).

**Ask fails today** on Quentin's machine because `.env` has an empty
`ANTHROPIC_API_KEY=` line.

**Target architecture** (same as voice, and your `/api/vision` work on
`059b315` / `vision-spike`):

1. `wrangler secret put ANTHROPIC_API_KEY` on `tutoria-website`.
2. Add **`POST /api/research`** (or extend vision proxy) — bearer auth,
   `membershipFromBearer`, rate limit, quota via existing `skill_runs` /
   `/api/skills/start`.
3. Change `research_goal` in `lib.rs` / `sidebar.js` to call the Worker
   instead of local Python for signed-in users (keep local Python only for
   offline dev if you want).

Merge **`/api/vision`** from your branch into `glass-waitlist` when ready;
document in [features/auth.md](../../features/auth.md) co-change.

## P1 — Keep branches aligned

- **`claudev/quentin/glass-waitlist`** — production website + merged Worker.
- **`claudev/charlie/desktop-google-login`** — desktop app tip; Quentin merged
  **`992a86e`** into glass-waitlist once. Re-merge when you land fixes (portal
  capture, signing, research proxy).
- **`claudev/charlie/website-download-button`** — release CI + wired download
  URLs (already partially ported into `Download.jsx` on glass-waitlist).

## P2 — Deploy discipline

When you deploy:

```sh
git checkout claudev/quentin/glass-waitlist   # or merge it first
cd website && npm run deploy
```

Verify:

```sh
curl -s https://guidotutor.com/ | rg 'Join the waitlist|Download'
# must NOT be hero-only "Download for free" landing
curl -sI https://guidotutor.com/pricing | head -3
```

## Open for Charlie to decide

- Stripe billing UI vs waitlist-only public site ([BACKLOG.md](../../BACKLOG.md)
  BL-016 legal pages already drafted).
- Whether Research proxy shares `/api/vision` or gets its own route.
- Notarization credentials in GitHub Actions (org secrets).

Quentin's session branch after push: **`claudev/quentin/glass-waitlist`**.
