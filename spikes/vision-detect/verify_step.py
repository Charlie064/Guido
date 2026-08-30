"""Verify-step CLI — captures the current screen and checks it against a
substep's expected_outcome. See verify.py and docs/features/skills.md's
"Per-step loop" (once this graduates from experiment to built feature).

Usage:
    python verify_step.py "<expected outcome>" ["<x>,<y>,<width>,<height>"] [--context "<text>"]
    python verify_step.py "<expected outcome>" --portal <any|window|monitor> [--context "<text>"]

Same capture-scope argument shape as live_step.py (region / --portal /
--context), reused verbatim rather than re-implemented, since "grab a
screenshot of the picked scope" is exactly the same problem either way —
this script only differs in what it asks the vision model once it has
that screenshot.

Output (stdout, one line):
    {"matches": bool, "observed": str}

Errors go to stderr with a non-zero exit code.
"""

import json
import os
import sys
import tempfile

from dotenv import load_dotenv

from live_step import capture_screen
from verify import verify_outcome

load_dotenv(override=True)  # see research.py's load_dotenv comment


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print(
            f"Usage: python {sys.argv[0]} \"<expected outcome>\" "
            f"[\"<x>,<y>,<width>,<height>\" | --portal <any|window|monitor>] "
            f"[--context \"<text>\"]",
            file=sys.stderr,
        )
        sys.exit(1)

    expected_outcome = args[0]
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

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        screenshot_path = tmp.name

    try:
        capture_screen(screenshot_path, region, portal_scope)
        result = verify_outcome(screenshot_path, expected_outcome, context)
        print(json.dumps(result))
    except Exception as exc:  # noqa: BLE001 — CLI boundary, report and exit non-zero
        print(f"verify_step failed: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        os.unlink(screenshot_path)


if __name__ == "__main__":
    main()
