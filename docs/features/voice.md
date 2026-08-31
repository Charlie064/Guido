# Voice input (speech-to-text)

[partial]

**Contract**
- Speech-to-text only, via Aqua Voice's Avalon API (an OpenAI-compatible
  batch transcription endpoint) — text-to-speech output is a separate,
  not-yet-started piece; see [architecture/overview.md](../architecture/overview.md)'s
  "Voice (later)" section for both.
- Wired to the home view's goal box (`#new-goal-input`) only — not the
  mid-tutorial chat follow-up box (`#chat-input`). Extend the same pattern
  there if/when that's wanted.
- **Proxied through the website Worker, like `/api/vision`** (a Claude
  vision proxy built on another branch, same pattern): `AQUA_VOICE_API_KEY`
  lives only as a Worker secret (`wrangler secret put AQUA_VOICE_API_KEY`),
  never on the desktop, never in the app bundle. An earlier version of
  this called a local Python script with the key read from `.env` — that
  only worked on one developer's own machine, since a key shipped with the
  app is extractable from the bundle and has no way to meter usage per
  customer. See git history (`transcribe.py`/`transcribe_audio.py`,
  removed) if that path needs to be resurrected as a local-dev fallback.
- Requires sign-in — the mic button refuses to start recording with no
  session token (`sidebar.js`'s `startVoiceRecording`), since usage is
  billed and quota-tracked per account.

## Flow

1. `sidebar.js`'s mic button (`#new-goal-mic`, inside the goal input) starts
   a `MediaRecorder` session via `getUserMedia({ audio: true })` on click,
   stops it on a second click or after `MAX_RECORDING_SECONDS` (60s, an
   auto-stop so a forgotten recording can't run indefinitely).
2. On stop, the recorded clip is sent as `multipart/form-data` (fields
   `audio`, `duration_seconds`) directly to the Worker's
   `POST /api/voice/transcribe` (`website/worker/voice.ts`), with the
   user's bearer session token — the same `fetch`-with-`Authorization`
   pattern `chargeForNewSkill` already uses for `/api/skills/start`.
3. `voice.ts` authenticates the caller via `membershipFromBearer` (same as
   every other authenticated route), rate-limits per user
   (`VOICE_LIMITER`, 20/min, mirroring `/api/vision`'s `VISION_LIMITER`),
   checks the monthly $ cap (below), then forwards the audio to Aqua's
   Avalon API (`https://api.aquavoice.com/v1/audio/transcriptions`, model
   `avalon-v1.5`) as its own `multipart/form-data` request — a plain
   `fetch`, not the `openai` SDK, since that SDK's Node-oriented
   credential resolution doesn't run cleanly in Workers (see `/api/vision`'s
   own comment on why `nodejs_compat` was needed for the Anthropic SDK;
   this route sidesteps the same class of problem by not using an SDK at
   all for a single REST call).
4. The transcript replaces whatever was in the goal box.

## Usage cap

Aqua bills $0.39/hour of audio, per second, with a 10-second minimum per
clip. `voice.ts` tracks this in D1 (`voice_transcriptions` table,
migration `0004_create_voice_usage.sql`) rather than client-side — the
earlier `localStorage` cap could be cleared by anyone, so it wasn't a real
limit. `voiceSecondsUsed` (`worker/auth.ts`) sums a user's billed seconds;
`voiceCapSecondsFor` (`voice.ts`) picks the cap by plan:

- **Free**: `FREE_TRIAL_SECONDS` (60s), summed **lifetime** — one trial
  clip, same "1 new skill, lifetime" shape as `includedFor`'s free branch,
  not a monthly allowance that quietly refills.
- **Paid** (`starter`/`plus`/`owner`): `MONTHLY_CAP_SECONDS`, derived from
  **$2 total** (`MONTHLY_CAP_USD` in `voice.ts`, flat across every paid
  plan — a cost-control measure, not a metered product tier like
  `skill_runs`), summed since the start of the calendar month.

Once a plan's cap is hit, new transcription requests 403 with a message
telling the user to upgrade (free) or that it resets next month (paid),
or to type their goal instead either way. `sidebar.js`'s mic button checks
the same numbers client-side (off `/api/me`) before even requesting
microphone access, and routes straight to the pay view instead of
recording a clip the server would just reject.

The billed duration per clip is **client-reported** (`duration_seconds` in
the form body), not measured server-side from the audio bytes — this is
trust-but-bound: a client could under-report it to dodge the usage log,
but the actual cost exposure per call is capped by `MAX_UPLOAD_BYTES` (5
MB) regardless of what duration it claims, so lying about duration doesn't
let anyone spend more than that bound allows. `MAX_DURATION_SECONDS` (120s)
clamps the logged value to match the client's own `MAX_RECORDING_SECONDS`
auto-stop.

**Still recommended: set an actual spend-limit/budget-alert on the Aqua
account itself** (its dashboard, if it has one) as a second backstop
independent of this table — this cap only holds as long as this Worker
code path is the only thing using the key.

## Deferred

- **Chat follow-up box** — same mic treatment for `#chat-input`, not built.
- **Text-to-speech output** — not started; see `architecture/overview.md`.
- **Push-to-talk** — the button is click-to-start/click-to-stop, not
  hold-to-record; revisit if that reads as awkward in practice.
- **Scaling the paid $2/month cap by tier** — `starter`/`plus`/`owner`
  still share one flat $2 cap; only free is broken out (one-minute
  lifetime trial) today.
