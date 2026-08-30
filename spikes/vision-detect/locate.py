"""Shared vision-location call — used by live_step.py (and formerly
detect.py's Phase 0 CLI). The prompt and response shape this used to build
against the Anthropic SDK directly (including measuring image_width/
image_height via PIL) now live server-side — see worker/vision.ts's
"locate" kind, which reads the PNG's own header for the dimensions.
"""

from vision_client import call_vision, screenshot_b64


def locate_element(image_path: str, target: str, context: str | None = None) -> dict:
    return call_vision(
        "locate",
        screenshot=screenshot_b64(image_path),
        target=target,
        context=context,
    )
