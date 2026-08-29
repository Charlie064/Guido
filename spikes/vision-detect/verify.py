"""Shared verify-outcome call — the Guide -> Do -> Verify step.

Checks whether a screenshot matches a substep's `expected_outcome` (see
plan_step.py, which generates this text alongside the substep itself),
instead of the user clicking "Done" and being trusted. Structurally the
mirror image of locate.py: locate.py answers "where is this element",
this answers "is this state now true" — same image-plus-text-prompt
shape, different question, no bounding box in the response.
"""

import base64
import json

import anthropic

MODEL = "claude-sonnet-5"


def verify_outcome(
    client: anthropic.Anthropic,
    image_path: str,
    expected_outcome: str,
    context: str | None = None,
) -> dict:
    with open(image_path, "rb") as f:
        image_b64 = base64.standard_b64encode(f.read()).decode("utf-8")

    # `context` mirrors locate.py's own context param (see live_step.py) —
    # goal/step background, kept in its own labelled paragraph rather than
    # folded into the expected-outcome sentence, so the model reads it as
    # background rather than as a second thing to check.
    context_block = f"Context on what this step is trying to accomplish:\n{context}\n\n" if context else ""

    prompt = (
        f"{context_block}"
        "You are checking whether a screenshot now matches an expected "
        "state, after the user was asked to do something. Look carefully "
        "at the actual current values/state visible in the screenshot — "
        "don't assume it matches just because the right area of the "
        "screen is visible; read the specific value or content and "
        "compare it.\n\n"
        f"Expected: {expected_outcome}\n\n"
        "Respond with ONLY a JSON object (no other text) in this exact "
        "shape: "
        '{"matches": true or false, '
        '"observed": "the actual value/state you see, as specifically as '
        'possible — this is shown to the user next to what was expected, '
        'so it needs to stand on its own"}'
    )

    response = client.messages.create(
        model=MODEL,
        max_tokens=400,
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
        timeout=60.0,
    )

    text = response.content[0].text.strip()
    # models sometimes wrap JSON in a markdown code fence despite instructions
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    result = json.loads(text)
    if not isinstance(result, dict) or "matches" not in result or "observed" not in result:
        raise RuntimeError(f'expected {{"matches": bool, "observed": str}}, got: {text}')
    return {"matches": bool(result["matches"]), "observed": str(result["observed"])}
