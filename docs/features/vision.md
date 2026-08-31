# Claude vision proxy

**Contract**
- Every screen-reading call (locate an element, verify a substep,
  identify the picked app, plan a step's substeps, answer a follow-up
  question, research a goal) goes through the website Worker's
  `POST /api/vision` (`website/worker/vision.ts`), never the Anthropic SDK
  directly from the desktop app. The desktop app never holds an Anthropic
  key — a key shipped in the app bundle is extractable, and has no way to
  meter usage per customer; see the git history of `spikes/vision-detect`'s
  scripts (each used to build its own `anthropic.Anthropic(api_key=...)`
  from a local `.env`, which only ever worked on the developer's own
  machine).
- **Not a passthrough.** The client sends a `kind` (`locate` | `verify` |
  `identify_app` | `plan_step` | `answer` | `research`) plus a small set
  of structured fields (a target description, an expected outcome, a
  screenshot, ...) — never a messages array or a freeform prompt. Each
  `kind` has its own fixed, developer-authored prompt template in
  `vision.ts`, ported verbatim from the vision-detect script it replaces;
  user-supplied strings are interpolated into it as data, never as
  instructions to the proxy itself. A real passthrough would let any free
  account spend Anthropic budget on arbitrary prompts and would put every
  prompt back in the client, readable out of the installer.
- Authenticated the same way as `/api/voice/transcribe` and
  `/api/skills/start`: `membershipFromBearer`, rate-limited per user
  (`VISION_LIMITER`, 20/min).

## Python side

`spikes/vision-detect`'s scripts keep everything that isn't the model
call itself — CLI arg parsing, screenshot capture (`live_step.py`'s
`capture_screen`, `portal_capture.py`), temp-file handling. Each script's
former `anthropic.Anthropic(...)` call is now a call to
`vision_client.call_vision(kind, **fields)` (stdlib `urllib`, no `requests`
dependency — one less thing for the PyInstaller sidecar build to bundle),
which POSTs to `/api/vision` with a bearer token read from the
`GUIDO_SESSION_TOKEN` environment variable. Response validation (JSON
shape, markdown-fence stripping, the `<cite>` tag strip on research
results) moved into `vision.ts` alongside the prompt it validates — the
Python side just trusts what comes back.

`GUIDO_SESSION_TOKEN` is set by the Rust side (`lib.rs`'s
`vision_session_token()`, reading the same OS-keychain entry
`store_session_token`/`get_session_token` already manage) when spawning
each script — never passed as a CLI arg, so it can't land in a process
listing or get echoed into a subprocess error message.

## Packaging (sidecars)

A downloaded build has no `spikes/vision-detect/.venv` — that only ever
existed on a developer's own checkout. `.github/workflows/release.yml`
compiles each vision-detect script into a standalone binary with
PyInstaller (`--onefile`) before `tauri build`, named
`<script>-<target-triple>[.exe]` under `src-tauri/binaries/` per Tauri's
`bundle.externalBin` convention (`tauri.conf.json`). At runtime, `lib.rs`'s
`sidecar_path()` looks for one of these next to the running executable
(where Tauri places externalBin binaries in the final bundle, on every
OS) before falling back to the dev `.venv` (`vision_command()`) — this
also fixes the dev fallback's Windows path (`Scripts/python.exe`, not
`bin/python3`, which the direct-venv-path code never branched on before).

`live_step.py`'s `capture_portal` needs the same frozen/dev branch: under
PyInstaller, `sys.executable` is the frozen `live_step` binary itself, not
a real interpreter, so it can't re-exec `portal_capture.py` as a script
argument the way dev mode does — frozen mode calls the `portal_capture`
sidecar binary directly instead (`getattr(sys, "frozen", False)`).

**Known gap**: PyInstaller `--onefile` self-extracts to a temp directory
on every invocation, adding some startup latency per call (each of these
scripts is a fresh subprocess per step/question, not a long-lived
process) — not measured yet on real hardware. `--onedir` avoids that but
produces a directory of files instead of one binary, which doesn't fit
`externalBin`'s one-file-per-entry model without also shipping the
accompanying support directory as a bundled resource.

## Usage cap

Anthropic bills per input/output token (`claude-sonnet-5`: $2/$10 per 1M
— see the `claude-api` skill's pricing table, re-check there before
changing model). `vision.ts` computes the real cost from
`usage.input_tokens`/`output_tokens` after each call and logs it to D1
(`vision_calls` table, migration `0005_create_vision_usage.sql`).
`visionCostUsedMicroUsd` (`worker/auth.ts`) sums a user's cost this
calendar month; `PLAN_CEILING_MICRO_USD` (`vision.ts`) is a **per-plan**
$ ceiling (free $1, starter $6, plus $12, owner unmetered) — unlike
voice's single flat cap, vision cost varies far more by call kind
(research's web search round trips vs. a plain verify), so a flat cap
would either starve heavy users or be too loose for free. These numbers
are a starting estimate, not a measured COGS figure — revisit against
`docs/business/pricing.md` once real usage data exists.

## Deferred

- **Exposing vision usage in the app's usage view** — `/api/me` doesn't
  yet report `vision_*` fields the way it reports `skills_*`/`voice_*`;
  add them (mirroring `handleMe` in `worker/index.ts`) if/when the usage
  view should show this.
- **Verifying the sidecar build on real macOS/Windows hardware** — the
  PyInstaller freeze was smoke-tested locally (Linux) for one script only;
  the actual CI job producing all three platforms' bundles is unverified
  until it runs for real. See `STATUS.md`.
