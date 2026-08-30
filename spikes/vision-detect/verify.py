"""Shared verify-outcome call — the Guide -> Do -> Verify step (see
plan_step.py, which generates `expected_outcome` alongside the substep
itself). The prompt and response validation this used to build against
the Anthropic SDK directly now live server-side — see worker/vision.ts's
"verify" kind — this just forwards the screenshot and text fields.
"""

from vision_client import call_vision, screenshot_b64


def verify_outcome(image_path: str, expected_outcome: str, context: str | None = None) -> dict:
    return call_vision(
        "verify",
        screenshot=screenshot_b64(image_path),
        expected_outcome=expected_outcome,
        context=context,
    )
