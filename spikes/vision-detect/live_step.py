"""Phase 1 live-capture CLI — see docs/planning/demo-v0.md.

Captures the current screen, asks Claude vision to locate a target UI
element, and prints the result as a single line of JSON to stdout (and
nothing else — this is meant to be shelled out to and parsed by the
Tauri/Rust overlay backend).

Usage:
    python live_step.py "<target description>" ["<x>,<y>,<width>,<height>"]

The optional second argument scopes the capture to a screen region (see
docs/decisions/0003-capture-region-not-window-detection.md) — a user-drawn
box from the overlay, in absolute screen pixels. Omit it to capture the
full primary monitor. Returned coordinates are relative to whatever was
captured (the region, if given), matching image_width/image_height — the
caller is responsible for offsetting back into screen space.

Output (stdout, one line):
    {"x0": int, "y0": int, "x1": int, "y1": int,
     "image_width": int, "image_height": int}

Errors go to stderr with a non-zero exit code.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile

import anthropic
from dotenv import load_dotenv

from locate import locate_element

load_dotenv()


def capture_screen(output_path: str, region: tuple[int, int, int, int] | None = None) -> None:
    # Wayland compositors (this project targets Linux/Wayland first, see
    # ADR 0002) block X11 screen-capture APIs, so mss (X11-only) returns a
    # blank image under Wayland even via XWayland. Use grim, the
    # wlr-screencopy-based native Wayland tool, when available; fall back
    # to mss for X11 sessions.
    if os.environ.get("WAYLAND_DISPLAY") and shutil.which("grim"):
        cmd = ["grim"]
        if region is not None:
            x, y, width, height = region
            cmd += ["-g", f"{x},{y} {width}x{height}"]
        cmd.append(output_path)
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"grim failed: {result.stderr}")
        return

    import mss
    import mss.tools

    with mss.mss() as sct:
        if region is not None:
            x, y, width, height = region
            monitor = {"left": x, "top": y, "width": width, "height": height}
        else:
            # sct.monitors[0] is the union of all monitors; [1] is the primary.
            monitor = sct.monitors[1]
        shot = sct.grab(monitor)
        mss.tools.to_png(shot.rgb, shot.size, output=output_path)


def main() -> None:
    if len(sys.argv) not in (2, 3):
        print(
            f"Usage: python {sys.argv[0]} \"<target description>\" [\"<x>,<y>,<width>,<height>\"]",
            file=sys.stderr,
        )
        sys.exit(1)

    target = sys.argv[1]
    region = None
    if len(sys.argv) == 3:
        region = tuple(int(v) for v in sys.argv[2].split(","))
        if len(region) != 4:
            print("Region must be \"x,y,width,height\"", file=sys.stderr)
            sys.exit(1)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY not set — check your .env file.", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        screenshot_path = tmp.name

    try:
        capture_screen(screenshot_path, region)
        box = locate_element(client, screenshot_path, target)
        print(json.dumps(box))
    except Exception as exc:  # noqa: BLE001 — CLI boundary, report and exit non-zero
        print(f"live_step failed: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        os.unlink(screenshot_path)


if __name__ == "__main__":
    main()
