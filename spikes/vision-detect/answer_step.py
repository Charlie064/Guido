"""Follow-up-question CLI — see answer.py and docs/features/skills.md's
"Per-step loop".

Usage:
    python answer_step.py "<question>" [--context "<text>"]
    python answer_step.py "<question>" ["<x,y,w,h>" | --portal <any|window|monitor>] [--context "<text>"]

Unlike live_step.py/verify_step.py, **omitting a capture argument means
no screenshot is taken at all** — a plain `answer_step.py "<question>"`
is a pure text call. A screenshot only happens when the caller explicitly
passes a region or `--portal`, matching the product rule that a
screenshot is always a deliberate, named action, never an automatic side
effect of asking a question.

Output (stdout, one line):
    {"answer": str}

Errors go to stderr with a non-zero exit code.
"""

import json
import os
import sys
import tempfile

from dotenv import load_dotenv

from answer import answer_question
from live_step import capture_screen

load_dotenv(override=True)  # see research.py's load_dotenv comment


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print(
            f"Usage: python {sys.argv[0]} \"<question>\" "
            f"[\"<x,y,w,h>\" | --portal <any|window|monitor>] [--context \"<text>\"]",
            file=sys.stderr,
        )
        sys.exit(1)

    question = args[0]
    rest = args[1:]

    context = None
    if "--context" in rest:
        i = rest.index("--context")
        if i + 1 >= len(rest):
            print("--context needs a value", file=sys.stderr)
            sys.exit(1)
        context = rest[i + 1]
        rest = rest[:i] + rest[i + 2 :]

    region = None
    portal_scope = None
    if rest and rest[0] == "--portal":
        portal_scope = rest[1] if len(rest) > 1 else "any"
    elif rest:
        region = tuple(int(v) for v in rest[0].split(","))
        if len(region) != 4:
            print('Region must be "x,y,width,height"', file=sys.stderr)
            sys.exit(1)

    # No capture at all unless a region or --portal was actually given —
    # the tri-state (no screenshot / region / portal) this script needs,
    # unlike live_step.py/verify_step.py where omitting both still
    # defaults to a full-screen grab (those two always need *some* image).
    screenshot_path = None
    try:
        if region is not None or portal_scope is not None:
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                screenshot_path = tmp.name
            capture_screen(screenshot_path, region, portal_scope)

        result = answer_question(question, context, screenshot_path)
        print(json.dumps(result))
    except Exception as exc:  # noqa: BLE001 — CLI boundary, report and exit non-zero
        print(f"answer_step failed: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        if screenshot_path:
            os.unlink(screenshot_path)


if __name__ == "__main__":
    main()
