"""Research call — see docs/features/skills.md.

Given a user's stated goal, asks Claude (with web search, since software
UIs change faster than model training data — see
docs/architecture/overview.md's "Web research" section) for an ordered
list of coarse top-level steps. Runs once per chat; the fine-grained
substeps are generated later, lazily, per step, once the app can actually
see the screen — this call never touches a screenshot, so it only
produces goal-scoped facts (true regardless of what the user's screen
looks like when they get there), not anything screen-specific.

Usage:
    python research.py "<goal>" ["<app_name>"]

app_name (optional) comes from the OS window pick (window_provider.rs,
via sidebar.js's setup step) — the actual target app's name/WM_CLASS
(e.g. "Code", "libreoffice-calc"), when the user picked a window rather
than staying on full-screen capture. Scopes the research prompt to that
app instead of leaving it to guess the app from goal text alone.

Output (stdout, one line): a JSON object —
    {"title": str, "steps": [{"title": str, "brief": str, "watch_for": str}, ...]}
- title (top-level): a short, human-written-sounding description of the
  goal — the same idea as ChatGPT auto-titling a conversation, e.g. "Add
  a Bulleted List in Google Docs" for the goal "how do i make a bulleted
  list in google docs". Shown everywhere the chat/skill is listed (the
  home screen, the path view's title bar) instead of the user's raw
  prompt verbatim, since a goal is often typed as a question or a run-on
  sentence and doesn't read well as a label.
- steps: the ordered list of top-level steps, each with:
  - title: short step name, shown in the step list
  - brief: one sentence on what this step accomplishes and why
  - watch_for: a version/UI caveat or pitfall worth flagging up front
    (e.g. "the ribbon may be collapsed"), or "" if research found none

Generated in this same call rather than a separate one — the model
already has the goal and is about to describe it in `steps` anyway, so a
second dedicated "summarize this" call would just be paying for a
network round trip to re-derive a fact this call already has in context.

The prompt, web-search tool call, and response validation this used to
build against the Anthropic SDK directly now live server-side — see
worker/vision.ts's "research" kind.

Errors go to stderr with a non-zero exit code.
"""

import json
import sys

from dotenv import load_dotenv

from vision_client import call_vision


def research_goal(goal: str, app_name: str | None = None) -> dict:
    return call_vision("research", goal=goal, app_name=app_name)


def main() -> None:
    load_dotenv(override=True)

    if len(sys.argv) not in (2, 3):
        print(f'Usage: python {sys.argv[0]} "<goal>" ["<app_name>"]', file=sys.stderr)
        sys.exit(1)

    goal = sys.argv[1]
    app_name = sys.argv[2] if len(sys.argv) == 3 else None

    try:
        steps = research_goal(goal, app_name)
        print(json.dumps(steps))
    except Exception as exc:  # noqa: BLE001 — CLI boundary, report and exit non-zero
        print(f"research failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
