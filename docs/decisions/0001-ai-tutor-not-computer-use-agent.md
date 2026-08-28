# 0001 — Position as an AI tutor, not a computer-use agent

## Status

Accepted

## Context

Existing AI computer-use products position themselves as "tell me what to do
and I'll do it." That space is increasingly commoditized, and it optimizes
for task completion rather than user understanding.

The product we're building has a different goal: help the user learn the
software they have open, by guiding them through it — teaching, showing, or
optionally doing steps for them — rather than just autonomously completing
tasks. This needs a screen-understanding layer (vision model) and a
computer-control layer (structured mouse/keyboard actions), but those are
implementation mechanisms in service of teaching, not the product itself.

Two implementation choices were also made provisionally at the same time,
before any code exists, and are recorded here rather than left implicit:

- **Vision model**: Claude vision, preliminary — used for screen
  understanding (see [architecture/overview.md](../architecture/overview.md)).
- **Voice**: ElevenLabs, preliminary — for the P2 voice-interaction feature
  (see [planning/mvp-roadmap.md](../planning/mvp-roadmap.md)); not required
  for the P0 loop.
- **Web research**: an AI-backed search tool, provider not yet chosen.

## Decision

Position and build the product as an **AI software tutor**: the core loop is
Goal → Research → See → Guide → Do → Verify → Learn
(see [philosophy/vision.md](../philosophy/vision.md)). The user chooses
between Teach / Show / Do modes; full autonomous task completion is one mode
among several, not the product's identity.

Adopt Claude vision and ElevenLabs as the preliminary vision and voice
providers, kept behind interfaces the agent controller calls, so either can
change without touching the controller. The web-research provider is left
open.

## Consequences

- Product copy, demo scripts, and UI should foreground teaching/guidance
  (highlighting, explaining, verifying), not just task automation.
- The architecture must support Teach/Show/Do as first-class modes the user
  can switch between at any point, not just a Do-only automation path.
- Provider choices (vision, voice, search) are provisional; if any changes,
  update this ADR's Context note is not allowed (ADRs are append-only) —
  instead write a new ADR that supersedes the relevant provider choice, and
  update `architecture/overview.md` and `planning/mvp-roadmap.md` to match.
