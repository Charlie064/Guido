"""Per-step planning call — see docs/features/skills.md's "Per-step loop".

Given one top-level step from Research (title/brief/watch_for) plus the
user's overall goal, generates a set of AI-planned substeps for that step
alone. Runs lazily, once per step, only when the user actually reaches it
— never speculatively for the whole skill up front.

Like research.py, this never touches a screenshot: it doesn't know what's
actually on the user's screen, so `target_description` is a plain-text
description ("the Insert tab in the ribbon"), not a coordinate — locating
it against the real screen is a separate, later `locate_element` call,
manually triggered per skills.md.

Usage:
    python plan_step.py "<goal>" "<step_title>" "<step_brief>" "<step_watch_for>"

Output (stdout, one line): a JSON array of substep objects —
    [{"target_description": str, "instruction_text": str, "action": str,
      "expected_outcome": str}, ...]
- target_description: plain-text description of the UI element
- instruction_text: the bubble copy shown near the element
- action: one of none / click / type / move-cursor / keyboard-shortcut
- expected_outcome: plain-text description of what the screen should show
  once this substep is actually done — e.g. "the Exposure field reads
  approximately +0.5", "column A has a header 'Month' and six month names
  below it". This is what the verify step (see verify.py) checks a later
  screenshot against instead of asking the user to click "Done" and be
  trusted; generated here, not at verify-time, since plan_step already
  knows what each substep is supposed to accomplish and a separate call
  would just be re-deriving the same fact from less context.

Errors go to stderr with a non-zero exit code.
"""

import json
import os
import sys

import anthropic
from dotenv import load_dotenv

MODEL = "claude-sonnet-5"

REQUIRED_FIELDS = {"target_description", "instruction_text", "action", "expected_outcome"}
VALID_ACTIONS = {"none", "click", "type", "move-cursor", "keyboard-shortcut"}


def plan_step(
    client: anthropic.Anthropic, goal: str, step_title: str, step_brief: str, step_watch_for: str
) -> list[dict]:
    watch_for_line = f'Watch for: "{step_watch_for}". ' if step_watch_for else ""
    prompt = (
        f'A user\'s overall goal is: "{goal}". They have reached this step '
        f'in the plan: "{step_title}" — {step_brief}. {watch_for_line}'
        "Break this one step into a short ordered sequence of concrete "
        "substeps — individual clicks, selections, or things to type, the "
        "level of detail someone would need to actually do it. For each "
        "substep, describe the UI element in plain text (not a coordinate "
        "— you can't see the user's actual screen), give a short "
        "instruction, and describe what the screen should show once this "
        "one substep is actually done — specific enough that someone "
        "looking at a screenshot could check it without asking the user, "
        "e.g. a field's approximate value, or specific text/data that "
        "should now be present. Don't cover other steps in the overall "
        "plan, only this one. Respond with ONLY a JSON array (no other "
        "text), one object per substep, in this exact shape: "
        '[{"target_description": "plain-text description of the UI '
        'element, e.g. \'the Insert tab in the ribbon\'", '
        '"instruction_text": "short instruction shown next to the '
        'element", '
        '"action": "one of: none, click, type, move-cursor, '
        'keyboard-shortcut", '
        '"expected_outcome": "what the screen should show once this '
        'substep is done, e.g. \'the Exposure field reads approximately '
        '+0.5\'"}, ...]'
    )

    response = client.messages.create(
        max_tokens=2048,
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        # See research.py's identical `timeout` comment: without this, a
        # stalled request silently retries (client is built with
        # max_retries=0) or waits the SDK's 10-minute default — either
        # way indistinguishable from a real hang to the caller.
        timeout=60.0,
    )

    text_blocks = [block.text.strip() for block in response.content if block.type == "text"]
    text_blocks = [t for t in text_blocks if t]
    if not text_blocks:
        raise RuntimeError(
            f"no text in response (stop_reason={response.stop_reason}, "
            f"output_tokens={response.usage.output_tokens}) — likely ran "
            "out of max_tokens before answering"
        )
    text = text_blocks[-1]

    # models sometimes wrap JSON in a markdown code fence, or prepend a
    # stray sentence of commentary, despite "ONLY a JSON array" — mirrors
    # research.py's handling of the same observed behavior.
    start, end = text.find("["), text.rfind("]")
    if start == -1 or end == -1 or end < start:
        raise RuntimeError(f"no JSON array found in response: {text}")
    text = text[start : end + 1]

    substeps = json.loads(text)
    if not isinstance(substeps, list) or not all(
        isinstance(s, dict) and REQUIRED_FIELDS.issubset(s) and s["action"] in VALID_ACTIONS
        for s in substeps
    ):
        raise RuntimeError(
            f"expected a JSON array of {REQUIRED_FIELDS} objects with action in "
            f"{VALID_ACTIONS}, got: {text}"
        )
    return substeps


def main() -> None:
    # override=True: see research.py's main() for why this matters — a
    # Claude Code session's own ANTHROPIC_API_KEY otherwise shadows .env.
    load_dotenv(override=True)

    if len(sys.argv) != 5:
        print(
            f'Usage: python {sys.argv[0]} "<goal>" "<step_title>" "<step_brief>" "<step_watch_for>"',
            file=sys.stderr,
        )
        sys.exit(1)

    goal, step_title, step_brief, step_watch_for = sys.argv[1:5]

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY not set — check your .env file.", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key, max_retries=0)

    try:
        substeps = plan_step(client, goal, step_title, step_brief, step_watch_for)
        print(json.dumps(substeps))
    except Exception as exc:  # noqa: BLE001 — CLI boundary, report and exit non-zero
        print(f"plan_step failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
