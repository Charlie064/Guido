"""Speech-to-text CLI — see transcribe.py.

Usage:
    python transcribe_audio.py <audio_path>

Output (stdout, one line):
    {"text": str}

Errors go to stderr with a non-zero exit code.
"""

import json
import os
import sys

import openai
from dotenv import load_dotenv

from transcribe import AQUA_BASE_URL, transcribe_audio

load_dotenv(override=True)  # see research.py's load_dotenv comment


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print(f"Usage: python {sys.argv[0]} <audio_path>", file=sys.stderr)
        sys.exit(1)

    audio_path = args[0]

    api_key = os.environ.get("AQUA_VOICE_API_KEY")
    if not api_key:
        print("AQUA_VOICE_API_KEY not set — check your .env file.", file=sys.stderr)
        sys.exit(1)

    client = openai.OpenAI(api_key=api_key, base_url=AQUA_BASE_URL, max_retries=0)

    try:
        result = transcribe_audio(client, audio_path)
        print(json.dumps(result))
    except Exception as exc:  # noqa: BLE001 — CLI boundary, report and exit non-zero
        print(f"transcribe_audio failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
