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

Capture is scoped to a user-drawn region (default: full screen), never
inferred from window focus — see
[ADR 0003](../decisions/0003-capture-region-not-window-detection.md).

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

### Persistence, accounts, and hosting [proposed, not built]

No database or user accounts exist yet, deliberately — see
[CLAUDE.md](../../CLAUDE.md)'s MVP principle. A candidate provider for
website hosting/domain and, later, a product database + account
validation has been proposed in
[ADR 0004](../decisions/0004-cloudflare-infrastructure-proposal.md)
(Cloudflare) — not accepted, several open questions remain. This section
gets its own real content once that ADR (or a different one) is settled.

### Voice (later)

ElevenLabs is the preliminary choice for voice, covering both directions
(P2 in [planning/mvp-roadmap.md](../planning/mvp-roadmap.md)) — not required
for the core MVP loop:

- **Input** — speech-to-text as an alternative to typing the goal/prompt
  (and any mid-tutorial follow-up questions).
- **Output** — text-to-speech for spoken guidance alongside the overlay.

### Visual overlay

**No overlay is drawn on top of the target application anymore.** An
earlier design drew a real highlight box/bubble in a transparent,
click-through, full-screen window (`main`) above whatever app the user was
being taught. That was abandoned: in practice, *any* real, interactive
window sitting over the target app blocks clicks into it — the sidebar's
own panel has the same problem if it's large or centrally placed, quite
apart from whatever `main`'s click-through state was doing. Rather than
keep managing a full-screen window's interactivity at all, highlighting
now renders as a small schematic diagram *inside the sidebar's own chat
view*: a proportional box on a placeholder rectangle, not a real overlay
on the real screen. See `renderSchematic`-equivalent code in
`spikes/tauri-overlay/src/sidebar.js` and
[features/skills.md](../features/skills.md)'s substep model
(`last_known_bbox` + `image_width`/`image_height` drive the schematic's
proportions). This is a real product trade-off, not just cleanup — the
original "point at the real element on the real screen" promise in
[philosophy/vision.md](../philosophy/vision.md) is not currently
delivered; revisit if/when a way to highlight without blocking clicks is
found (e.g. a true click-through box whose small element-sized region,
not the whole monitor, is the only interactive-looking part — untried).

**Windows: one small always-interactive panel, plus a transient
region-drag window** [built] — down from an earlier four/five-window
design (`main` + `icon` + `sidebar` + a separate `app` window were all
tried at various points). All of that UI — collapsed icon, login, region
setup, skills list, step path, step chat — now lives in **one window**,
`sidebar` (`spikes/tauri-overlay/src/sidebar.html`/`sidebar.js`), which
resizes itself between a small collapsed icon (80×80) and an expanded
panel (380×560). This became possible, and correct, only once the
full-screen highlight window (`main`) was removed: `main` used to need
permanent click-through specifically so a small always-clickable `icon`
window could coexist with it, and *that* split was itself worked around
repeatedly (see the git history of this section for the toggle-based and
click-through designs that were tried and rejected). With no full-screen
window left at all, there's nothing for the icon to need protecting from,
so `icon` and `sidebar` could simply become the same window.
`region-select` (`region-select.html`/`region-select.js`) is unchanged: a
temporary, fully-interactive, full-screen window shown only for the
duration of a region drag, hidden immediately after via a real `hide()`
call.

**Resizing a layer-shell window needs two non-obvious fixes** — both hit
in practice, not hypothetical:

1. Tauri's own `window.setSize()` silently does nothing on a window
   already promoted to a wlr-layer-shell surface (see the layer-shell note
   below) once it's anchored to only two edges rather than stretched to
   fill the screen. What actually works: hide the window, resize the
   underlying `GtkWindow` directly (`gtk_window.resize()` +
   `set_default_size()`), then show it again — confirmed via `hyprctl
   layers` reporting the new surface size, not just the webview's own
   belief about its size. This is a real, working exception to "prefer
   Tauri's own APIs" — noted here so it isn't rediscovered as a mystery.
2. Calling that raw GTK resize directly from inside a `#[tauri::command]`
   handler crashed intermittently: command handlers don't run on the
   main/GTK thread, and GTK isn't thread-safe from any other thread. The
   fix is `AppHandle::run_on_main_thread`, with a channel to block the
   command until the main-thread closure finishes (since the caller needs
   the resize to have actually completed before it proceeds). See
   `resize_sidebar` in `spikes/tauri-overlay/src-tauri/src/lib.rs`.

**Region picker** [partial] — the sidebar's setup view lets the user click
"Select region" to drag a capture box on the transient `region-select`
window (Escape or a plain click keeps the full-screen default); the
sidebar hides itself for the duration of the drag (a plain `hide()`, not a
click-through toggle) and reopens once a region is picked. Threaded
through to capture: `locate_element` takes an optional region and
`live_step.py` crops to it (via `grim -g` on Wayland, an `mss`
custom-rect monitor dict on X11) instead of always grabbing the full
primary monitor.

**Screenshots exclude the sidebar itself** [built] — since `sidebar` is a
real, visible window (unlike the old fully click-through `main`), a raw
screen capture would otherwise include it in the exact frame sent to the
vision model. `locate_element` (`lib.rs`) hides the sidebar immediately
before shelling out to the capture and shows it again immediately after —
guaranteed even if the capture/locate call errors — so every caller gets
this for free rather than relying on each call site to remember it.

**Staying above the system status bar is per-platform** [built, Linux] —
"always on top" isn't one mechanism across platforms. On Linux/Wayland,
wlroots compositors (Sway, Hyprland, ...) draw bars like waybar through the
wlr-layer-shell protocol, a stacking class a plain "always on top" toplevel
window can never render above; `sidebar` and `region-select` both promote
themselves to layer-shell surfaces (Overlay layer) to fix it —
`init_layer_shell` in `spikes/tauri-overlay/src-tauri/src/lib.rs`, gated to
`target_os = "linux"` and only active when `gtk_layer_shell::is_supported()`
(i.e. an actual Wayland session; X11 sessions fall back to plain
alwaysOnTop, which is sufficient there). macOS/Windows don't need an
equivalent — their "always on top" window levels already sit above the
menu bar/taskbar. `region-select` anchors all four edges (stretches to
cover the monitor); `sidebar` anchors only top+left with a fixed margin,
so it grows/shrinks from its bottom-right corner rather than drifting —
which also means it isn't draggable on Wayland (layer-shell surfaces don't
support the interactive move `data-tauri-drag-region` relies on), so its
position is fixed for now.

**Instruction/explanation popup** — a short text bubble, used for two
purposes: pointing ("click here") and explaining ("this is the Color tab —
it opens the grading tools"). Previously positioned near the real element
on the real screen; now rendered as part of the schematic preview inside
the sidebar's chat view (see above), alongside the step's instruction
text. This is the Show-mode mechanism described in
[philosophy/vision.md](../philosophy/vision.md), currently delivered
without the on-screen pointing it originally promised — see the trade-off
note at the top of this section.
