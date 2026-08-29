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

Capture is scoped to a user-picked window (default: full screen), never
inferred from window focus — see
[ADR 0003](../decisions/0003-capture-region-not-window-detection.md) and
[ADR 0005](../decisions/0005-window-anchored-overlay-coordinates.md).
**[partial]** — window-pick capture (macOS/Windows/Linux X11, via
`spikes/tauri-overlay/src-tauri/src/window_provider.rs`) is built and
wired into `locate_element`, which re-resolves the picked window's live
rect immediately before every capture so it survives that window being
resized or moved after selection; Wayland-native enumeration is out of
scope (a free-drawn region remains the fallback there and everywhere
else). Not yet built: occlusion detection (still deferred per ADR 0003)
and grouping skills by the detected app (BL-004).

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
now renders as a fake overlay *inside the sidebar* (path + chat): a mini
target-app window with a highlight box and a step textbox — placeholder
for the real on-screen callout. Show still opens a small schematic
diagram (a proportional box on a placeholder rectangle). Nothing is
drawn on the real screen. See `overlayPlaceholderHtml` /
`schematicHtml` in `spikes/tauri-overlay/src/sidebar.js` and
[features/skills.md](../features/skills.md)'s substep model
(`last_known_bbox` + `image_width`/`image_height` drive both). This is a real product trade-off, not just cleanup — the
original "point at the real element on the real screen" promise in
[philosophy/vision.md](../philosophy/vision.md) is not currently
delivered; revisit if/when a way to highlight without blocking clicks is
found (e.g. a true click-through box whose small element-sized region,
not the whole monitor, is the only interactive-looking part — untried).

**Windows: one plain fixed-size panel, plus a transient region-drag
fallback window** [built] — down from an earlier four/five-window design
(`main` + `icon` + `sidebar` + a separate `app` window were all tried at
various points). All of the UI — login, setup, skills list, step path,
step chat — lives in **one window**, `sidebar`
(`spikes/tauri-overlay/src/sidebar.html`/`sidebar.js`): a plain, decorated,
resizable, non-always-on-top toplevel, fixed at launch to 480×720 and
centered (`tauri.conf.json`). There's no collapsed-icon mode for now — an
earlier version resized itself between an 80×80 icon and a 380×560 panel
(`resize_sidebar`, since deleted), but that depended on
always-on-top+undecorated window quirks that didn't hold up on GNOME;
bringing a minimized mode back is tracked as future work, not an
oversight (see `STATUS.md`). `region-select`
(`region-select.html`/`region-select.js`) is unchanged: a temporary,
fully-interactive, full-screen window, now used only as the
`CaptureScope::Region` fallback behind window-pick capture (see "Screen
understanding" above) — shown only for the duration of a region drag,
hidden immediately after via a real `hide()` call.

**Window-pick capture, region-drag as fallback** [partial] — the sidebar's
setup view lets the user pick a live OS window from a list
(`window_provider.rs`, see "Screen understanding" above) as the default
capture scope; a "Select region" affordance to drag a box on the
transient `region-select` window remains as the fallback where window-pick
isn't available (Wayland) or the user wants a specific sub-area (Escape or
a plain click keeps the full-screen default). The sidebar hides itself for
the duration of a region drag (a plain `hide()`, not a click-through
toggle) and reopens once picked. Threaded through to capture:
`locate_element` takes a `CaptureScope` (`Region` or `Window{id}`, the
latter re-resolved to the window's *current* rect immediately before every
capture) and `live_step.py` crops to the resulting region (via `grim -g`
on Wayland, an `mss` custom-rect monitor dict on X11) instead of always
grabbing the full primary monitor.

**Screenshots exclude the sidebar itself** [built] — since `sidebar` is a
real, visible window (unlike the old fully click-through `main`), a raw
screen capture would otherwise include it in the exact frame sent to the
vision model. `locate_element` (`lib.rs`) hides the sidebar immediately
before shelling out to the capture and shows it again immediately after —
guaranteed even if the capture/locate call errors — so every caller gets
this for free rather than relying on each call site to remember it.

**Staying above the system status bar is per-platform, region-select
only** [built, Linux] — "always on top" isn't one mechanism across
platforms. On Linux/Wayland, wlroots compositors (Sway, Hyprland, ...)
draw bars like waybar through the wlr-layer-shell protocol, a stacking
class a plain "always on top" toplevel window can never render above;
`region-select` promotes itself to a layer-shell surface (Overlay layer,
anchored to all four edges) to fix it — `init_layer_shell` in
`spikes/tauri-overlay/src-tauri/src/lib.rs`, gated to `target_os = "linux"`
and only active when `gtk_layer_shell::is_supported()` (i.e. a wlroots
Wayland session; X11 and GNOME's Mutter both fall back to plain
alwaysOnTop — confirmed via this app's own `WAYLAND_DEBUG=1` registry dump
that Mutter never advertises `zwlr_layer_shell_v1` at all, not a version
gap). macOS/Windows don't need an equivalent — their "always on top"
window levels already sit above the menu bar/taskbar.

`sidebar` is not just un-promoted from layer-shell, it's a **plain
decorated window now, not always-on-top** (dropped through two earlier
designs): layer-shell surfaces have no interactive move, so dragging
needed a custom margin-rewriting IPC command with no GNOME answer at all;
switching to Tauri's `startDragging()` on a plain undecorated
always-on-top toplevel was tried next, but proved unreliable in practice
even though it should work in principle. Giving `sidebar` a real titlebar
(`decorations: true`, `alwaysOnTop: false` in `tauri.conf.json`) sidesteps
both: the window manager owns dragging entirely, exactly like any other
app window, with zero app-side drag code. Trade-off, accepted: `sidebar`
is no longer forced above other windows, and on a tiling compositor
(Hyprland/Sway) it can now be tiled into the workspace layout instead of
floating.

**Instruction/explanation popup** — a short text bubble, used for two
purposes: pointing ("click here") and explaining ("this is the Color tab —
it opens the grading tools"). Previously positioned near the real element
on the real screen; now rendered as part of the schematic preview inside
the sidebar's chat view (see above), alongside the step's instruction
text. This is the Show-mode mechanism described in
[philosophy/vision.md](../philosophy/vision.md), currently delivered
without the on-screen pointing it originally promised — see the trade-off
note at the top of this section.
