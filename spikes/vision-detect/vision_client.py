"""Shared HTTP client for the `/api/vision` Worker proxy — see
worker/vision.ts and docs/features/vision.md.

Every vision-detect script calls this instead of the Anthropic SDK
directly. The desktop app never holds an Anthropic key: a key shipped in
the app bundle would be extractable, and a local `.env` key only ever
worked on a developer's own machine, never on a downloaded build (see git
history for the direct-SDK version this replaced). The actual model call,
prompt template, and response validation all moved server-side; this
module just authenticates as the signed-in user (the same Better Auth
bearer token `/api/voice/transcribe` and `/api/skills/start` already use)
and forwards the structured fields for one `kind`.

Uses the stdlib `urllib` rather than `requests` so this stays a
zero-extra-dependency module — one less compiled/pure-Python package for
the PyInstaller sidecar build to bundle.
"""

import json
import os
import urllib.error
import urllib.request

WORKER_BASE_URL = os.environ.get("GUIDO_WORKER_BASE_URL", "https://guidotutor.com")


def call_vision(kind: str, **fields) -> dict:
    token = os.environ.get("GUIDO_SESSION_TOKEN")
    if not token:
        raise RuntimeError("GUIDO_SESSION_TOKEN not set — sign in to use this feature.")

    body = {"kind": kind, **{k: v for k, v in fields.items() if v is not None}}
    req = urllib.request.Request(
        f"{WORKER_BASE_URL}/api/vision",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="POST",
    )
    try:
        # Matches the longest per-kind timeout (research's 90s) plus
        # headroom for the round trip itself.
        with urllib.request.urlopen(req, timeout=100) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(detail).get("error", detail)
        except json.JSONDecodeError:
            pass
        raise RuntimeError(f"vision request failed ({exc.code}): {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"vision request failed: {exc.reason}") from exc


def screenshot_b64(image_path: str) -> str:
    import base64

    with open(image_path, "rb") as f:
        return base64.standard_b64encode(f.read()).decode("utf-8")
