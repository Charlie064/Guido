"""Names the application in a captured frame — see `BL-009`.

Exists because on a Wayland session that is not wlroots-based there is no
way to ask the OS what was picked: the desktop portal hands back a stream
and a size and nothing else (its `label` is literally
`"window (1920x1080)"`, see portal_capture.py), and Mutter publishes no
`_NET_CLIENT_LIST` for the X11 path to walk. The pixels are the only
remaining source of app identity, so this asks the vision model to read
the frame the same way a person glancing at the screen would.

One call, right after the user picks a source — not per step. The answer
is what scopes Research to the right app (research.py's `app_name`) and
what the on-disk icon cache is keyed by (`window_icon` in lib.rs).

The prompt and response validation this used to build against the
Anthropic SDK directly now live server-side — see worker/vision.ts's
"identify_app" kind.

Usage:
    python identify_app.py ["<x>,<y>,<width>,<height>"]
    python identify_app.py --portal <any|window|monitor>

Output (stdout, one line):
    {"app_name": str|null, "window_title": str|null}

`app_name` is null when the frame genuinely doesn't show one identifiable
application (an empty desktop, a wall of overlapping windows) — a wrong
confident guess is worse than none, since it would silently scope every
later Research call to the wrong software.

Errors go to stderr with a non-zero exit code.
"""

import json
import os
import sys
import tempfile

from dotenv import load_dotenv

from live_step import capture_screen
from vision_client import call_vision, screenshot_b64

load_dotenv(override=True)  # see research.py's load_dotenv comment


def identify_app(image_path: str) -> dict:
    return call_vision("identify_app", screenshot=screenshot_b64(image_path))


def main() -> None:
    args = sys.argv[1:]

    region = None
    portal_scope = None
    if args and args[0] == "--portal":
        portal_scope = args[1] if len(args) > 1 else "any"
    elif args:
        region = tuple(int(v) for v in args[0].split(","))
        if len(region) != 4:
            print('Region must be "x,y,width,height"', file=sys.stderr)
            sys.exit(1)

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        screenshot_path = tmp.name

    try:
        capture_screen(screenshot_path, region, portal_scope)
        print(json.dumps(identify_app(screenshot_path)))
    except Exception as exc:  # noqa: BLE001 — CLI boundary, report and exit non-zero
        print(f"identify_app failed: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        os.unlink(screenshot_path)


if __name__ == "__main__":
    main()
