"""Phase 0 vision detection spike — see docs/planning/demo-v0.md.

Usage:
    python detect.py <screenshot.png> "<target description>"

Sends a screenshot to Claude vision, asks it to locate a target UI element,
and draws the returned bounding box on a copy of the image.
"""

import os
import sys

from dotenv import load_dotenv
from PIL import Image, ImageDraw

from locate import locate_element

load_dotenv()


def draw_box(image_path: str, box: dict, output_path: str) -> None:
    with Image.open(image_path) as img:
        img = img.convert("RGB")
        draw = ImageDraw.Draw(img)
        draw.rectangle(
            [(box["x0"], box["y0"]), (box["x1"], box["y1"])],
            outline="red",
            width=4,
        )
        img.save(output_path)


def main() -> None:
    if len(sys.argv) != 3:
        print(f"Usage: python {sys.argv[0]} <screenshot.png> \"<target description>\"")
        sys.exit(1)

    image_path, target = sys.argv[1], sys.argv[2]

    print(f"Locating: {target!r} in {image_path}")
    box = locate_element(image_path, target)
    print(f"Model returned box: {box}")

    output_path = os.path.splitext(image_path)[0] + "_boxed.png"
    draw_box(image_path, box, output_path)
    print(f"Wrote {output_path} — open it and check the box lands correctly.")


if __name__ == "__main__":
    main()
