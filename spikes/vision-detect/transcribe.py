"""Speech-to-text via Aqua Voice's Avalon API — see
docs/architecture/overview.md's "Voice (later)" section. Avalon is
OpenAI-compatible (same `client.audio.transcriptions.create` shape as
OpenAI's own Whisper endpoint), so this is the `openai` SDK pointed at
Aqua's base URL rather than a hand-rolled HTTP call.
"""

import openai

AQUA_BASE_URL = "https://api.aquavoice.com/v1"
MODEL = "avalon-v1.5"


def transcribe_audio(client: openai.OpenAI, audio_path: str) -> dict:
    with open(audio_path, "rb") as f:
        transcript = client.audio.transcriptions.create(model=MODEL, file=f)
    return {"text": transcript.text.strip()}
