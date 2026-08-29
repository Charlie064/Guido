"""Shared follow-up-question call — see docs/features/skills.md's
"Per-step loop" (the reactive-substep section).

Answers a user's free-form question about the current step, given the
same compact context locate_element/verify_substep already build
(goal, step brief/watch_for, substeps already covered) — never the full
chat transcript, kept deliberately small per skills.md. The screenshot is
optional and off by default: unlike locate/verify, a question is answered
from context text alone unless the caller explicitly asks for a
screenshot too (see answer_step.py's --portal/region handling), matching
the design decision that a screenshot only ever happens on a manual,
named action, never as a side effect of sending a chat message.

No web search here, unlike research.py — this is answering about the
user's current situation from context already gathered, not researching
something new; adding search would make every question's latency and
cost unpredictable for no clear benefit.
"""

import anthropic

MODEL = "claude-sonnet-5"


def answer_question(
    client: anthropic.Anthropic,
    question: str,
    context: str | None = None,
    image_path: str | None = None,
) -> dict:
    context_block = f"Context on the step this question is about:\n{context}\n\n" if context else ""

    prompt = (
        f"{context_block}"
        "The user asked this question while following a step-by-step "
        f'guide: "{question}"\n\n'
        "Answer directly and concisely — a sentence or two, like a quick "
        "reply in a chat, not a full tutorial. If a screenshot is "
        "attached, use it; otherwise answer from the context above alone "
        "and say so if the context genuinely isn't enough to answer "
        "confidently, rather than guessing. Respond with ONLY a JSON "
        'object (no other text): {"answer": "your reply"}'
    )

    content = [{"type": "text", "text": prompt}]
    if image_path:
        import base64

        with open(image_path, "rb") as f:
            image_b64 = base64.standard_b64encode(f.read()).decode("utf-8")
        # Image block first, same ordering locate.py/verify.py already use
        # — the model reads the visual context before the question about it.
        content.insert(
            0,
            {
                "type": "image",
                "source": {"type": "base64", "media_type": "image/png", "data": image_b64},
            },
        )

    response = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": content}],
        timeout=60.0,
    )

    text = response.content[0].text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    import json

    result = json.loads(text)
    if not isinstance(result, dict) or "answer" not in result:
        raise RuntimeError(f'expected {{"answer": str}}, got: {text}')
    return {"answer": str(result["answer"])}
