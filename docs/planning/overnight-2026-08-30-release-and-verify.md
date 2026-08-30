**Contract**
- Scoped from a live conversation with Charlie (2026-08-30, overnight
  session on `claudev/charlie/env-cleanup`): package the features already
  built but not yet in a real release, verify the AI endpoints actually
  work end to end, and de-risk the website's download button until both
  are confirmed.
- A plan, not a source of truth — graduates into a real release + updated
  `STATUS.md`, then gets deleted per
  [meta/style-guide.md](../meta/style-guide.md). Check
  [STATUS.md](../../STATUS.md) for current status, not this file.
- **This session commits but does not push or deploy anything** — no
  `git push`, no tag push, no `wrangler deploy`. Everything here lands on
  `claudev/charlie/env-cleanup` for Charlie to review and push by hand.

## Why this branch, not a bigger merge

`claudev/charlie/env-cleanup` (current branch) turned out to already be
the most-integrated branch in the repo — a near-superset of every other
in-flight branch — and only 5 commits + local edits ahead of
**`v0.1.5-rc1`, a prerelease tag that already built successfully on all
three OS runners** (confirmed via `gh run list`). That finding changed the
scope from "merge N divergent branches" to "ship what's already here,
plus a couple of small unmerged fixes."

Branches surveyed and their disposition:

| Branch | Unique commits vs. `env-cleanup` | Verdict |
| --- | --- | --- |
| `portal-window-capture-freeze` | 1 (capture-stall fix) | **Cherry-picked** (`1fa9749`) |
| `layer-shell-sidebar` | 1 (BL-013 layer-shell promotion) | **Cherry-picked** (`3a2f138`) |
| `rename-guido` | 7 (Tutoria→Guido rename + vision cost-cap fixes) | **Left out** — bundles an undecided product-naming change with an unrelated cost fix; not cleanly separable without more surgery. Naming is still open per `STATUS.md`. |
| `draggable-icon` | 2 (icon size/drag fixes) | **Left out** — STATUS.md records the collapsed-icon mode these fix was later cut entirely (GNOME compatibility), so the fixes target UI that no longer exists. |
| `pricing-page`, `payment-page-link`, `stripe-billing`, `claudev/quentin/glass-waitlist` | 4–67 each | **Out of scope** — website/billing work, not part of what `release.yml` bundles into the desktop app. |
| Everything else surveyed | 0–2, mostly docs-only or already-ancestors | No action needed. |

## What's already done (this session)

1. **Doc staleness pass** (`20c2e77`) — ADR 0009 (window-scoped portal
   capture already isolates the sidebar on GNOME/Wayland, corrects
   BL-014), BL-008 closed (custom domain confirmed live), several docs
   that still described the removed eye/note icon overlay UI fixed.
2. **`ensureCaptureScope()` fix** (`ecc4b65`) — prompts for a capture
   source before failing deep inside `capture_screen` on the portal
   backend, plus an Inkscape fixture skill for icon/UI testing.
3. **Checked in the doc-staleness pre-commit hook** (`a785285`) —
   `.claude/hooks/doc-staleness-check.sh` + `.claude/settings.json` are
   now tracked (project infra, not local state); `scheduled_tasks.lock`
   added to `.gitignore`.
4. **Cherry-picked `portal-window-capture-freeze`'s stall fix** (`1fa9749`)
   — window-scoped portal streams only push a frame on redraw, so take 1
   buffer instead of 5 for window sources.
5. **Cherry-picked `layer-shell-sidebar`'s BL-013 promotion** (`3a2f138`)
   — sidebar promotes to layer-shell `Top` on capable compositors
   (Sway/Hyprland/KDE, never GNOME); resolved a real merge conflict in
   `lib.rs` (both branches touched `init_layer_shell`/the `run()` setup
   block) and confirmed `cargo check` clean afterward.

Branch is now clean (`git status` empty) at 10 commits past `v0.1.5-rc1`.

## Remaining steps

1. **Bump the version.** `spikes/tauri-overlay/src-tauri/tauri.conf.json`
   and `package.json` both currently say `0.1.5` (the same number
   `v0.1.5-rc1` used) — bump to `0.1.6` so a future real tag doesn't reuse
   a prerelease's version number. Commit only; no tag.
2. **Website download button → "coming soon" placeholder.**
   `website/src/Landing.jsx`'s `RELEASES_BASE`/`PLATFORMS`-driven download
   section currently links straight to
   `github.com/Charlie064/Guido/releases/latest/download/<file>`. Charlie
   reported the macOS build **couldn't launch** on a real Mac when last
   tested (unclear if since fixed — `window_provider.rs`'s macOS backend
   is flagged "unverified" in `STATUS.md`, never built/run on real
   hardware). Replace the download section with a placeholder until a
   release has been confirmed to actually launch on all three platforms.
   Commit only; no `wrangler deploy` — the live site stays on whatever it
   currently serves until Charlie pushes this by hand.
3. **AI endpoint verification.** Findings so far:
   - `POST https://guidotutor.com/api/vision` is deployed and reachable —
     returns a clean `401 {"error":"Unauthorized"}` for a bad/missing
     bearer token, not a Cloudflare bot-block or a 5xx. Confirmed via
     direct `curl`.
   - `wrangler secret list` (against the `tutoria-website` Worker, the
     project's own Cloudflare account) confirms `ANTHROPIC_API_KEY` is
     set, alongside `AQUA_VOICE_API_KEY`, `BETTER_AUTH_SECRET`,
     `STRIPE_SECRET_KEY`.
   - The specific bug Charlie recalled ("research might be broken") looks
     like the timeout issue already fixed in this branch's history before
     tonight's session: `18b90ef` ("speed up research and give timeouts a
     real error message") and `8e06eb0` ("bump the client-side vision
     timeout past the server's own") — `vision.ts`'s research `timeoutMs`
     (120s) and `vision_client.py`'s client timeout (135s) are now
     consistent, matching the comment explaining why.
   - **Gap: no authenticated end-to-end call has been made.** Attempting
     to create a throwaway account against the live
     `/api/auth/sign-up/email` endpoint to get a real session token was
     **blocked by the permission classifier** (a signup call against
     production auth is exactly the kind of live/production action this
     session shouldn't take unilaterally). This means `research`/`locate`/
     `verify` have only been checked at the routing/auth layer, not
     proven to actually call Claude and return a good answer.
   - **Open decision for Charlie**: either (a) sign in through the real
     app once and hand this session a `GUIDO_SESSION_TOKEN` value to test
     `research.py`/`plan_step.py` directly against the deployed Worker, or
     (b) explicitly approve a one-off test-account signup, or (c) treat
     "worker deployed + secret present + known bug already fixed" as
     enough confidence for tonight and leave the full live-call
     verification for a real login session in the morning.
4. **Update `STATUS.md`** once the above lands, recording the version
   bump, the placeholder swap, and the verification findings/gap — same
   co-change rule as everything else in this repo.

## Explicitly out of scope tonight

- Tutoria→Guido naming decision (`rename-guido`'s rename commit) — still
  open per `STATUS.md`.
- Stripe billing, pricing page, glass-waitlist — website/billing tracks,
  independent of this release.
- Pushing the branch, pushing a real release tag, or `wrangler deploy` —
  all left for Charlie to trigger by hand after review.
- Full authenticated verification of every `/api/vision` kind
  (`locate`, `verify`, `identify_app`, `plan_step`, `answer`) — blocked on
  the same auth gap as `research` above; same open decision applies.
