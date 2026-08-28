"""Shared vision-location call — see docs/planning/demo-v0.md.

Used by both detect.py (saved-screenshot CLI, Phase 0) and live_step.py
(live-capture CLI, Phase 1).
"""

import base64
import json

import anthropic
from PIL import Image

MODEL = "claude-sonnet-5"


def locate_element(client: anthropic.Anthropic, image_path: str, target: str) -> dict:
    with open(image_path, "rb") as f:
        image_b64 = base64.standard_b64encode(f.read()).decode("utf-8")

    with Image.open(image_path) as img:
        width, height = img.size

    prompt = (
        f"This screenshot is {width}x{height} pixels. "
        f"Find this UI element: \"{target}\". "
        "Respond with ONLY a JSON object (no other text) in this exact shape: "
        '{"x0": int, "y0": int, "x1": int, "y1": int}, '
        "where the four values are the pixel coordinates of the element's "
        "bounding box (top-left and bottom-right corners) in the original "
        "image's coordinate space."
    )

    response = client.messages.create(
        model=MODEL,
        max_tokens=256,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": image_b64,
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    )

    text = response.content[0].text.strip()
    # models sometimes wrap JSON in a markdown code fence despite instructions
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    box = json.loads(text)
    box["image_width"] = width
    box["image_height"] = height
    return box
