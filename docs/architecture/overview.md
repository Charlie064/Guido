**Contract** [planned]
- Desktop app, cross-platform: macOS, Windows, Linux.
- Four layers: Desktop App (UI/overlay) → Agent Controller (goal → plan →
  observe → act → verify loop) → Web Search + Vision Model → Computer Control
  (mouse/keyboard).
- Actions are structured tool calls, not free-form prose (see example below).
- No code exists yet — this is the target shape, not a description of what's
  built. Update the `[planned]` tag to `[partial]`/`[built]` as pieces land,
  per [meta/style-guide.md](../meta/style-guide.md).

## Layers

```text
┌──────────────────────────────┐
│        Desktop App           │
│                              │
│  Chat / Goal Input           │
│  Progress                     │
│  Overlay                     │
└──────────────┬───────────────┘
               │
               ↓
┌──────────────────────────────┐
│       Agent Controller       │
│                              │
│  Goal → Plan → Observe       │
│  → Act → Verify → Continue   │
└───────┬───────────┬──────────┘
        │           │
        ↓           ↓
┌────────────┐ ┌──────────────┐
│ Web Search │ │ Vision Model │
└────────────┘ └──────────────┘
                    │
                    ↓
             Screen understanding
                    │
                    ↓
             UI/action target
                    │
                    ↓
          ┌──────────────────┐
          │ Computer Control │
          │                  │
          │ mouse            │
          │ keyboard         │
          │ click            │
          │ type             │
          │ scroll           │
          └──────────────────┘
```

### Desktop app

Cross-platform (macOS, Windows, Linux). Framework not yet chosen — likely an
Electron/Tauri-class shell, since the app needs a transparent always-on-top
overlay window plus a global keyboard-shortcut launcher (e.g. Ctrl+Space) in
addition to the main chat/progress UI. Record the actual choice as an ADR
once made.

### Agent controller

Runs the core loop: observe screen → decide action → execute action →
observe new screen → continue. See
[philosophy/vision.md](../philosophy/vision.md) for the product-level
Goal → Research → See → Guide → Do → Verify → Learn framing this implements.

### Screen understanding (vision model + accessibility, hybrid)

Screenshot-based vision is the primary path. Claude vision is the
preliminary choice (see
[ADR 0001](../decisions/0001-ai-tutor-not-computer-use-agent.md)) but this
is not locked in.

Hybrid with OS accessibility APIs where available (Windows UI Automation,
macOS AXAPI, Linux AT-SPI2): try the accessibility tree first for a
deterministic, non-AI element lookup; fall back to vision when the app
doesn't expose one. Coverage is app-dependent — apps that draw their own UI
on a custom canvas (DaVinci Resolve, Blender, Fusion 360) expose little or
nothing through accessibility and will rely on vision as the primary path
regardless. See [ADR 0002](../decisions/0002-agency-hybrid-vision-platform-business.md).

Design the interface so both providers (vision, accessibility tree) sit
behind the same contract the agent controller calls, and either can be
added/swapped without changing the controller.

Should be able to reason about: visible text, buttons, menus, input fields,
panels, icons, application layout, and approximate on-screen location of
elements.

### Computer control

Structured tool calls, not generated prose:

```json
{
  "action": "click",
  "x": 842,
  "y": 621
}
```

Supported actions: move cursor, click, double click, right click, type text,
press key, keyboard shortcut, scroll, drag.

### Web research

Used when the agent needs current information (software UIs change faster
than model training data). Provider not yet chosen — an AI-backed search
tool is planned, not yet decided which one. Keep this behind the same
interface the agent controller calls, so the provider can change without
touching the controller.

### Voice (later)

ElevenLabs is the preliminary choice for voice, covering both directions
(P2 in [planning/mvp-roadmap.md](../planning/mvp-roadmap.md)) — not required
for the core MVP loop:

- **Input** — speech-to-text as an alternative to typing the goal/prompt
  (and any mid-tutorial follow-up questions).
- **Output** — text-to-speech for spoken guidance alongside the overlay.

### Visual overlay

A transparent overlay drawn above the target application: highlight a
button, box/arrow toward an element, dim irrelevant areas, number multiple
elements, show current step. This is what makes the guidance feel pointed-at
rather than described in text.

**Instruction/explanation popup** — a short text bubble placed near (not
on top of) the relevant element, used for two purposes: pointing ("click
here") and explaining ("this is the Color tab — it opens the grading
tools"). Positioning should avoid covering the element itself or other
active UI — prefer the nearest clear screen region (below/beside), falling
back to a fixed corner if the element is near a screen edge. This is the
Show-mode mechanism described in
[philosophy/vision.md](../philosophy/vision.md).
