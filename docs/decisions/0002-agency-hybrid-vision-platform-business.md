# 0002 — Do-mode opt-in, hybrid screen understanding, platform order, subscription model

## Status

Accepted

## Context

Follow-up decisions made after [ADR 0001](0001-ai-tutor-not-computer-use-agent.md),
before any code exists:

- Whether Do mode (AI takes control of mouse/keyboard) should be on by
  default or require explicit opt-in.
- Whether screen understanding should be vision-only or also use OS
  accessibility APIs for deterministic element lookup.
- Platform build order across macOS/Windows/Linux.
- Business model, and what it implies about scope beyond the hackathon MVP.
- Voice should cover input (speech-to-text) as well as output, not just
  output as ADR 0001 ambiguously implied.

## Decision

- **Do mode is opt-in.** Teach/Show remain the default; the user must
  explicitly enable Do before the AI operates mouse/keyboard. Where in the
  product this toggle lives (global setting vs. per-question) is not yet
  decided — see `STATUS.md`.
- **Screen understanding is hybrid.** Try OS accessibility APIs (Windows UI
  Automation, macOS AXAPI, Linux AT-SPI2) first for a deterministic,
  non-AI element lookup; fall back to vision when the app doesn't expose an
  accessibility tree (true for apps that render UI on a custom canvas —
  DaVinci Resolve, Blender, Fusion 360 — which will rely on vision as the
  primary path regardless of this hybrid).
- **Platform order**: Linux-first as the primary dev target, with
  Windows/macOS built in parallel from day one rather than sequentially
  after Linux ships.
- **Business model is a monthly subscription.** This means accounts,
  billing, and a small user database are real product requirements
  long-term — but they stay out of scope for the hackathon MVP per
  [planning/mvp-roadmap.md](../planning/mvp-roadmap.md), which is unchanged
  by this ADR.
- **Voice covers input and output.** ElevenLabs (preliminary, per ADR 0001)
  is used for speech-to-text goal/prompt entry as well as text-to-speech
  guidance.

## Consequences

- The screen-understanding interface must support both an accessibility-tree
  provider and a vision provider behind one contract (see
  [architecture/overview.md](../architecture/overview.md)).
- Product copy/UI must make Do mode's opt-in nature visible — it should
  never silently take control.
- Post-MVP planning (accounts, billing, database) should be tracked
  separately from the hackathon roadmap once the team moves past the demo.
- Where/how the Do-mode toggle surfaces, and the algorithm the agent uses to
  decide what action to take at each step (screenshot vs. web search vs.
  both), remain open and are tracked in `STATUS.md`, not resolved here.
