**Contract**
- A plan, not a source of truth — graduates into `features/` docs + ADRs as
  items get built, then gets archived/deleted per
  [meta/style-guide.md](../meta/style-guide.md). Don't treat this as current
  status; check [STATUS.md](../../STATUS.md) for that.
- Priority tiers P0/P1/P2, in build order, for a hackathon-scale MVP.
- Explicitly out of scope for the hackathon: complex backend, user accounts,
  billing, databases, sophisticated long-term memory.

## P0 — must work

1. Desktop application
2. Screenshot capture
3. Vision model integration
4. Goal input
5. AI-generated step sequence
6. Mouse movement
7. Click
8. Keyboard input
9. Screen re-analysis
10. Visual overlay/highlighting

## P1 — important

11. Web research
12. Step verification
13. Teach / Do modes
14. Progress indicator
15. Global keyboard shortcut

## P2 — if time remains

16. Accessibility/DOM extraction
17. More sophisticated action planning
18. Multiple applications
19. Persistent learning history
20. Voice interaction (see ElevenLabs note in
    [architecture/overview.md](../architecture/overview.md))

## Demo script

Target a visually compelling application (DaVinci Resolve, Blender,
Photoshop, or Figma). Recommended: "Teach me how to create a cinematic look
in DaVinci Resolve."

1. User enters goal.
2. AI researches the task.
3. AI creates a short plan.
4. AI looks at the application.
5. AI highlights the exact UI element.
6. User clicks it.
7. AI recognizes the new state.
8. AI highlights the next element.
9. User asks "Can you do this one?"
10. AI moves the cursor and performs the action.
11. AI verifies the result.
12. Continue to the next step.

Target impression: this AI isn't just telling me how to use software — it
can see my software, point at things, teach me, and actually operate it when
I want.
