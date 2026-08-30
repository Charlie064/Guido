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

import anthropic
from dotenv import load_dotenv

from live_step import capture_screen
from locate import MODEL

load_dotenv(override=True)  # see research.py's load_dotenv comment

PROMPT = (
    "Which desktop application is shown in this screenshot?\n\n"
    "Answer with ONLY a JSON object (no other text) in this exact shape: "
    '{"app_name": string|null, "window_title": string|null}.\n\n'
    "app_name is the application's common product name as a person would "
    'say it — "Visual Studio Code", "Microsoft Excel", "Blender", "Firefox" '
    "— not a process name, package name or window class. "
    "window_title is the document, file or page open in it if one is "
    "visible, otherwise null.\n\n"
    "Use null for app_name if you cannot tell which single application "
    "this is: an empty desktop, a wallpaper, or several apps with none "
    "clearly in front. Do not guess."
)


def identify_app(client: anthropic.Anthropic, image_path: str) -> dict:
    import base64

    with open(image_path, "rb") as f:
        image_b64 = base64.standard_b64encode(f.read()).decode("utf-8")

    response = client.messages.create(
        model=MODEL,
        max_tokens=128,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": "image/png", "data": image_b64},
                    },
                    {"type": "text", "text": PROMPT},
                ],
            }
        ],
    )

    text = response.content[0].text.strip()
    # The model is asked for bare JSON but occasionally fences it.
    if text.startswith("```"):
        text = text.split("```")[1].removeprefix("json").strip()
    parsed = json.loads(text)
    return {
        "app_name": parsed.get("app_name") or None,
        "window_title": parsed.get("window_title") or None,
    }


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

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY not set — check your .env file.", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        screenshot_path = tmp.name

    try:
        capture_screen(screenshot_path, region, portal_scope)
        print(json.dumps(identify_app(client, screenshot_path)))
    except Exception as exc:  # noqa: BLE001 — CLI boundary, report and exit non-zero
        print(f"identify_app failed: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        os.unlink(screenshot_path)


if __name__ == "__main__":
    main()
