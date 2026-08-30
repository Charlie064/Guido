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
- The `AQUA_VOICE_API_KEY` never reaches the webview: recording and
  base64-encoding happen in JS, but the actual API call happens in the
  Python subprocess Rust shells out to, same secret-handling posture as
  `ANTHROPIC_API_KEY` (see `answer_step.py`'s pattern).
- **$2/month soft usage cap**, tracked client-side in `localStorage`
  (`sidebar.js`) since there's no server-side metering yet — see "Usage
  cap" below. Not a real spend limit; see its caveat.

## Flow

1. `sidebar.js`'s mic button (`#new-goal-mic`, next to the goal input)
   starts a `MediaRecorder` session via `getUserMedia({ audio: true })` on
   click, stops it on a second click.
2. On stop, the recorded clip is base64-encoded in JS and sent to Rust's
   `transcribe_audio` command (`spikes/tauri-overlay/src-tauri/src/lib.rs`)
   along with a file extension derived from the recorder's actual MIME
   type (`audio/webm` vs `audio/mp4` — WebKit and Chromium-based webviews
   don't agree on `MediaRecorder` support, so the recorder picks whichever
   of the two `MediaRecorder.isTypeSupported` accepts).
3. Rust decodes the base64, writes it to a short-lived temp file, and
   shells out to `spikes/vision-detect/transcribe_audio.py`, mirroring the
   existing `answer_step.py` subprocess pattern exactly (same
   `.venv/bin/python3`, same JSON-on-stdout contract, same
   `load_dotenv(override=True)`).
4. `transcribe_audio.py` calls Aqua Voice's Avalon API
   (`spikes/vision-detect/transcribe.py`, model `avalon-v1.5`) using the
   `openai` SDK pointed at Aqua's base URL (`https://api.aquavoice.com/v1`)
   — Avalon deliberately mirrors OpenAI's own transcription endpoint shape,
   so no custom HTTP client was needed.
5. The transcript replaces whatever was in the goal box.

## Usage cap

Aqua bills $0.39/hour of audio, per second, with a 10-second minimum per
clip (`spikes/vision-detect/transcribe.py`'s pricing note). `sidebar.js`
tracks cumulative billed seconds for the current calendar month in
`localStorage` (`tutoria-voice-usage`) and refuses to start a new
recording once the running total would exceed $2 for that month
(`VOICE_MONTHLY_CAP_USD`), showing an error in the goal box's error line
instead.

**This is a soft, local-only cap, not a real spend limit** — it protects
against one runaway install burning API credit, not against the shared
key being used elsewhere or `localStorage` being cleared/reinstalled. Set
an actual cap on the Aqua account itself (its dashboard, if it has a
spend-limit setting) as the backstop that still holds regardless of what
this file does. If voice usage is ever metered per real user (not per
local install), this needs to move server-side onto the same
`skill_runs`-style counter [features/auth.md](auth.md) already uses for
skill quotas — a client-held key can't be metered per account at all.

## Deferred

- **Chat follow-up box** — same mic treatment for `#chat-input`, not built.
- **Text-to-speech output** — not started; see `architecture/overview.md`.
- **Push-to-talk** — the button is click-to-start/click-to-stop, not
  hold-to-record; revisit if that reads as awkward in practice.
