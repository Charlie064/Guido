"""Phase 1 live-capture CLI — see docs/planning/demo-v0.md.

Captures the current screen, asks Claude vision to locate a target UI
element, and prints the result as a single line of JSON to stdout (and
nothing else — this is meant to be shelled out to and parsed by the
Tauri/Rust overlay backend).

Usage:
    python live_step.py "<target description>" ["<x>,<y>,<width>,<height>"] [--context "<text>"]

    python live_step.py "<target description>" --portal <any|window|monitor> [--context "<text>"]

The optional second positional argument scopes the capture to a screen
region (see docs/decisions/0003-capture-region-not-window-detection.md) —
a user-drawn box from the overlay, in absolute screen pixels. Omit it to
capture the full primary monitor. Returned coordinates are relative to
whatever was captured (the region, if given), matching image_width/
image_height — the caller is responsible for offsetting back into screen
space.

`--portal` instead captures a source the user already picked through the
desktop portal (see portal_capture.py) — the only working path on Wayland
sessions that are not wlroots-based, where there is no way to enumerate a
window or crop to its rect. There, the frame *is* the scope, so there is
no region to offset by: coordinates are relative to the picked source.

`--context "<text>"` is optional free-text background on what this
target's step is trying to accomplish (goal, step brief/watch_for,
substeps already covered) — passed straight through to the vision prompt
alongside the screenshot, see locate.py. Assembled entirely on the
caller's side (sidebar.js's locateContext); this script neither builds
nor interprets it.

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

load_dotenv(override=True)  # see research.py's load_dotenv comment


def capture_portal(output_path: str, scope: str) -> None:
    # Delegates to portal_capture.py rather than reimplementing the portal
    # handshake here: it owns the stored restore token, so this call is
    # silent and promptless as long as the user has picked a source once.
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "portal_capture.py")
    result = subprocess.run(
        [sys.executable, script, "capture", output_path, scope],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"portal capture failed: {result.stderr.strip()}")


def capture_screen(
    output_path: str,
    region: tuple[int, int, int, int] | None = None,
    portal_scope: str | None = None,
) -> None:
    if portal_scope is not None:
        capture_portal(output_path, portal_scope)
        return

    # Wayland compositors (this project targets Linux/Wayland first, see
    # ADR 0002) block X11 screen-capture APIs, so mss (X11-only) returns a
    # blank image under Wayland even via XWayland. Use grim, the
    # wlr-screencopy-based native Wayland tool, when available; fall back
    # to mss for X11 sessions.
    #
    # grim only speaks wlr-screencopy, which GNOME and KDE do not
    # implement — being on the PATH says nothing about whether it works
    # here, so its failure is reported as the "use --portal" signal it
    # actually is rather than as a bare grim error.
    if os.environ.get("WAYLAND_DISPLAY") and shutil.which("grim"):
        cmd = ["grim"]
        if region is not None:
            x, y, width, height = region
            cmd += ["-g", f"{x},{y} {width}x{height}"]
        cmd.append(output_path)
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(
                f"grim failed ({result.stderr.strip()}) — this compositor needs "
                f"the portal path instead, see portal_capture.py"
            )
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
    args = sys.argv[1:]
    if not args:
        print(
            f"Usage: python {sys.argv[0]} \"<target description>\" "
            f"[\"<x>,<y>,<width>,<height>\" | --portal <any|window|monitor>] "
            f"[--context \"<text>\"]",
            file=sys.stderr,
        )
        sys.exit(1)

    target = args[0]
    rest = args[1:]

    context = None
    if "--context" in rest:
        i = rest.index("--context")
        if i + 1 >= len(rest):
            print("--context needs a value", file=sys.stderr)
            sys.exit(1)
        context = rest[i + 1]
        rest = rest[:i] + rest[i + 2:]

    region = None
    portal_scope = None
    if rest and rest[0] == "--portal":
        portal_scope = rest[1] if len(rest) > 1 else "any"
    elif rest:
        region = tuple(int(v) for v in rest[0].split(","))
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
        capture_screen(screenshot_path, region, portal_scope)
        box = locate_element(client, screenshot_path, target, context)
        print(json.dumps(box))
    except Exception as exc:  # noqa: BLE001 — CLI boundary, report and exit non-zero
        print(f"live_step failed: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        os.unlink(screenshot_path)


if __name__ == "__main__":
    main()
