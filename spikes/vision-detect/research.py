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

Output (stdout, one line): a JSON array of step objects —
    [{"title": str, "brief": str, "watch_for": str}, ...]
- title: short step name, shown in the step list
- brief: one sentence on what this step accomplishes and why
- watch_for: a version/UI caveat or pitfall worth flagging up front
  (e.g. "the ribbon may be collapsed"), or "" if research found none

Errors go to stderr with a non-zero exit code.
"""

import json
import os
import re
import sys

import anthropic
from dotenv import load_dotenv

MODEL = "claude-sonnet-5"

REQUIRED_FIELDS = {"title", "brief", "watch_for"}


def research_goal(client: anthropic.Anthropic, goal: str, app_name: str | None = None) -> list[dict]:
    app_clause = f'in "{app_name}"' if app_name else "in some application"
    prompt = (
        f'A user wants to do this {app_clause}: "{goal}". '
        "Research the current, correct way to do this (the UI may have "
        "changed since your training — use web search if that helps). "
        "Break it into an ordered list of coarse top-level steps — not "
        "individual clicks, just the major phases someone would move "
        "through. For each step, also note anything you learned that's "
        "true regardless of the user's specific screen — a UI-version "
        "caveat, a common pitfall, an easy-to-miss detail. Don't guess at "
        "exact on-screen positions or wording; that depends on the "
        "user's actual screen and isn't something this research pass can "
        "know. Respond with ONLY a JSON array (no other text), one object "
        "per step, in this exact shape: "
        '[{"title": "short step name", '
        '"brief": "one sentence on what this step accomplishes and why", '
        '"watch_for": "a caveat or pitfall worth flagging up front, or '
        '\\"\\" if none"}, ...]'
    )

    response = client.messages.create(
        model=MODEL,
        # web_search_20260209's dynamic filtering runs its searches inside
        # a code-execution wrapper under the hood — that's much more
        # token-hungry than plain search, and a couple of search rounds
        # can burn through a smaller budget before ever writing the
        # answer (observed live: max_tokens=2048 truncated with no text
        # block at all). max_uses caps how many rounds it can spend on
        # search before it has to just answer — cut from 3 to 2 to trade
        # a bit of research depth for latency (each round is the slow
        # part; one real call still landed a full 8-step answer at 2).
        max_tokens=4096,
        tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": 2}],
        messages=[{"role": "user", "content": prompt}],
        # timeout=90 alone doesn't bound the wait: the SDK retries a
        # timed-out request max_retries (2, by default) more times, so a
        # single stalled call silently became a ~270s+ one in testing (3
        # attempts x 90s) — indistinguishable from a real hang to the
        # caller. `client` below is built with max_retries=0 so one
        # attempt fails loud at `timeout` instead of quietly retrying.
        timeout=90.0,
    )

    # Web search responses commonly come back as several text blocks (the
    # model's answer gets split at citation boundaries), sometimes with a
    # blank one thrown in — joining all of them (not just the last) is
    # required, or the JSON array gets truncated mid-object (observed
    # live: extraction failed because the last block alone started
    # mid-string, well after the array's opening "[").
    text_blocks = [block.text.strip() for block in response.content if block.type == "text"]
    text_blocks = [t for t in text_blocks if t]
    if not text_blocks:
        raise RuntimeError(
            f"no text in response (stop_reason={response.stop_reason}, "
            f"output_tokens={response.usage.output_tokens}) — likely ran "
            "out of max_tokens before answering"
        )
    text = "".join(text_blocks)

    # web_search inserts inline <cite index="n-m">...</cite> markup around
    # claims it's sourcing — harmless in prose but leaks literal XML-ish
    # tags into field values once parsed as JSON (observed live in
    # "watch_for" text). Strip the tags, keep the cited text itself.
    text = re.sub(r"</?cite[^>]*>", "", text)

    # models sometimes wrap JSON in a markdown code fence, or prepend a
    # stray sentence of commentary, despite "ONLY a JSON array" — both
    # observed live. Extract the array substring rather than trusting the
    # whole trimmed block to be valid JSON on its own.
    start, end = text.find("["), text.rfind("]")
    if start == -1 or end == -1 or end < start:
        raise RuntimeError(f"no JSON array found in response: {text}")
    text = text[start : end + 1]

    steps = json.loads(text)
    if not isinstance(steps, list) or not all(
        isinstance(s, dict) and REQUIRED_FIELDS.issubset(s) for s in steps
    ):
        raise RuntimeError(f"expected a JSON array of {REQUIRED_FIELDS} objects, got: {text}")
    return steps


def main() -> None:
    # override=True: a Claude Code session's own ANTHROPIC_API_KEY (its
    # session credential, not a usable direct API key) is often already
    # set in the shell this gets launched from, and load_dotenv() doesn't
    # clobber an existing env var by default — silently using the wrong
    # key instead of the one in .env.
    load_dotenv(override=True)

    if len(sys.argv) not in (2, 3):
        print(f'Usage: python {sys.argv[0]} "<goal>" ["<app_name>"]', file=sys.stderr)
        sys.exit(1)

    goal = sys.argv[1]
    app_name = sys.argv[2] if len(sys.argv) == 3 else None

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY not set — check your .env file.", file=sys.stderr)
        sys.exit(1)

    # max_retries=0: see the `timeout` comment in research_goal for why —
    # retries default to 2, which multiplies a stalled call's wall time
    # into something that reads as a hang rather than a bounded failure.
    client = anthropic.Anthropic(api_key=api_key, max_retries=0)

    try:
        steps = research_goal(client, goal, app_name)
        print(json.dumps(steps))
    except Exception as exc:  # noqa: BLE001 — CLI boundary, report and exit non-zero
        print(f"research failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
