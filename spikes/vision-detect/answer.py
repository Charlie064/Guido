"""Shared follow-up-question call — see docs/features/skills.md's
"Per-step loop" (the reactive-substep section). The prompt and response
shape this used to build against the Anthropic SDK directly now live
server-side — see worker/vision.ts's "answer" kind. The screenshot stays
optional here for the same reason it always was: a question is answered
from context alone unless the caller explicitly asks for a screenshot too
(see answer_step.py's --portal/region handling).
"""

from vision_client import call_vision, screenshot_b64


def answer_question(question: str, context: str | None = None, image_path: str | None = None) -> dict:
    fields = {"question": question, "context": context}
    if image_path:
        fields["screenshot"] = screenshot_b64(image_path)
    return call_vision("answer", **fields)
