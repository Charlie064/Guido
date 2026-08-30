"""Repeatable test: does a window-scoped portal_capture.py capture leak a
window sitting on top of the picked one?

Stands in for "does Guido need to hide before every capture" — see
docs/decisions/0007-portal-capture-backend-wayland.md. Spawns a fullscreen
solid-magenta Tk window (a color that won't occur naturally) right before
each capture, then checks the captured PNG for that color. Magenta present
= the target window was NOT isolated from what's on top of it; absent = it
was.

One-time setup (prompts a human, can't be scripted):
    python3 portal_capture.py pick window

Then, repeatedly, no prompts:
    python3 test_window_isolation.py [n_runs]
"""

import subprocess
import sys
import time
from pathlib import Path

MARKER_RGB = (255, 0, 255)
SCRIPT_DIR = Path(__file__).parent
OUT_PATH = Path("/tmp/window_isolation_test.png")


def spawn_marker() -> subprocess.Popen:
    hexcolor = "#%02x%02x%02x" % MARKER_RGB
    code = (
        "import tkinter as tk\n"
        "root = tk.Tk()\n"
        "root.attributes('-fullscreen', True)\n"
        "root.attributes('-topmost', True)\n"
        f"root.configure(bg='{hexcolor}')\n"
        "root.mainloop()\n"
    )
    return subprocess.Popen([sys.executable, "-c", code])


def has_marker_color(png_path: Path) -> bool:
    from PIL import Image

    img = Image.open(png_path).convert("RGB")
    w, h = img.size
    px = img.load()
    # A 4px grid is plenty for a fullscreen solid fill and much faster than
    # scanning every pixel.
    for x in range(0, w, 4):
        for y in range(0, h, 4):
            if px[x, y] == MARKER_RGB:
                return True
    return False


def run_once(i: int) -> bool | None:
    marker = spawn_marker()
    time.sleep(1.5)  # let it map and actually become topmost
    try:
        result = subprocess.run(
            [sys.executable, str(SCRIPT_DIR / "portal_capture.py"), "capture", str(OUT_PATH), "window"],
            capture_output=True, text=True, timeout=60,
        )
    finally:
        marker.terminate()
        try:
            marker.wait(timeout=5)
        except subprocess.TimeoutExpired:
            marker.kill()

    if result.returncode != 0:
        print(f"run {i}: capture failed: {result.stderr.strip()}")
        return None

    leaked = has_marker_color(OUT_PATH)
    print(f"run {i}: {'LEAK — marker window visible in capture' if leaked else 'clean — marker excluded'}")
    return leaked


def main() -> None:
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    results = [r for r in (run_once(i + 1) for i in range(n)) if r is not None]

    if not results:
        print("no successful runs")
        sys.exit(1)

    if any(results):
        print(f"\nFAIL: marker leaked into {sum(results)}/{len(results)} captures — window capture is NOT isolated")
        sys.exit(1)

    print(f"\nPASS: marker excluded from all {len(results)} captures — window capture IS isolated")


if __name__ == "__main__":
    main()
