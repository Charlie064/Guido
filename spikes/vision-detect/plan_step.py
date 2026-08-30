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

The prompt and response validation this used to build against the
Anthropic SDK directly now live server-side — see worker/vision.ts's
"plan_step" kind.

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
import sys

from dotenv import load_dotenv

from vision_client import call_vision


def plan_step(goal: str, step_title: str, step_brief: str, step_watch_for: str) -> list[dict]:
    return call_vision(
        "plan_step",
        goal=goal,
        step_title=step_title,
        step_brief=step_brief,
        step_watch_for=step_watch_for,
    )


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

    try:
        substeps = plan_step(goal, step_title, step_brief, step_watch_for)
        print(json.dumps(substeps))
    except Exception as exc:  # noqa: BLE001 — CLI boundary, report and exit non-zero
        print(f"plan_step failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
