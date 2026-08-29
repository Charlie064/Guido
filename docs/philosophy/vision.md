**Contract**
- Product name: **Guido** — settled, and used everywhere (repo, bundle
  identifier, UI, website). See the naming note at the end of this doc for
  the one check still outstanding.
- Core loop: **Goal → Research → See → Guide → Do → Verify → Learn**.
- Positioning: an AI *tutor* that can see and use the computer — not primarily
  an autonomous computer-use agent. See [ADR 0001](../decisions/0001-ai-tutor-not-computer-use-agent.md).

## Product concept

A desktop AI assistant that can see the user's screen, understand what
application they are using, and help them accomplish a goal inside that
application.

Instead of giving users a generic text tutorial or sending them to a YouTube
video, Guido guides them through the actual software they have open. It can
identify UI elements on screen, explain what to do, visually highlight the
relevant control, optionally perform actions itself, and verify that the user
completed each step before continuing.

### Core promise

> Tell Guido what you want to accomplish — by typing or speaking — and it
> finds the right workflow and teaches you how to do it directly inside your
> software.

Example: "Teach me how to create a cinematic color grade in DaVinci Resolve."
Guido researches the task, creates a sequence of steps, looks at the
current screen, identifies the relevant UI element, highlights it, explains
what to do, waits for the user, verifies the result, and continues. The user
learns the software by actually using it.

## Target user

Initially: students, self-taught learners, hobbyists, creators, and people
learning complex professional software.

Especially useful for software with deep, non-obvious UIs: DaVinci Resolve,
Blender, Photoshop, Premiere Pro, After Effects, Figma, Ableton/FL Studio,
Fusion 360, KiCad, MATLAB, VS Code, and other CAD/engineering tools.

The product should not try to support every application perfectly in the
MVP. The architecture should be general (see
[architecture/overview.md](../architecture/overview.md)), but an early demo
can focus on one or two applications.

## Core differentiation

Existing AI computer-use products focus on "tell me what to do and I'll do
it." Guido focuses on "tell me what you want to learn or accomplish, and
I'll teach you how to do it."

The distinction is **agency**. The AI can operate the computer, but the user
chooses the mode:

- **Teach** — the AI guides the user step-by-step ("Click the Color tab"),
  highlights the UI element, and checks the new screen state before giving
  the next instruction.
- **Show** — the AI visually points out where something is (e.g. highlights
  the Inspector panel) without taking control. This is also where
  explanatory overlay text lives — a short popup near the element explaining
  what a button/panel does, not just where it is (see "Visual overlay" in
  [architecture/overview.md](../architecture/overview.md)).
- **Do** — the AI performs the action itself and tells the user what it did.
  **Opt-in, not the default** — the user must explicitly enable Do mode
  before the AI takes control of mouse/keyboard (see
  [ADR 0002](../decisions/0002-agency-hybrid-vision-platform-business.md)).

The user can switch between modes at any point.

## Adaptive, not scripted

The AI should not blindly follow a pre-written tutorial. It researches the
goal, builds a short practical plan, and adapts that plan based on what it
actually sees on the user's screen. If the user does the wrong thing, Guido
should not simply continue — it should recognize the actual state and adjust
("You're currently in the Edit page — that's okay, the Color tab is at the
bottom. I'll highlight it.").

## Product positioning

Avoid positioning the product primarily as "an AI computer-use agent" — that
space is increasingly commoditized. Position it as:

> An AI tutor that can see and use your computer.

or:

> Learn software by doing it, with an AI beside you.

## Progress & mastery

No spaced-repetition or formal skill-tracking system planned. Instead: a
lightweight gamified sense of progress/mastery as the user completes more
tutorials (see [BL-002](../BACKLOG.md)). Exact mechanic undecided.

## Long-term vision

> The learning layer for your computer.

Instead of searching YouTube every time you encounter unfamiliar software,
you tell Guido what you want to accomplish and it guides you through the
actual interface in front of you.

## Naming note

The name is **Guido**, everywhere: repo, bundle identifier
(`com.guidotutor.guido`), UI, and website. Earlier candidates —
"Tutoria", "TutorialCue", "tutoriapp" — are dropped.

One thing was flagged when the name was still open and is still
unresolved: **Guido collides with existing products and services using
close variants of that name.** A real trademark, domain, and app-store
search has not been run. Do that before the first public release —
renaming after shipping means a new bundle identifier, which orphans
installed users' app data and breaks the updater's signing identity.
