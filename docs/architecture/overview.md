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

Not required for the core MVP loop (P2 in
[planning/mvp-roadmap.md](../planning/mvp-roadmap.md)) — see
[features/voice.md](../features/voice.md) for the mechanism:

- **Input** — speech-to-text as an alternative to typing the goal/prompt
  (and any mid-tutorial follow-up questions). **[partial]** Aqua Voice
  wired to the home goal box only.
- **Output** — text-to-speech for spoken guidance alongside the overlay.
  **[planned]** ElevenLabs is the preliminary choice; not started.

### Visual overlay

**[removed, 2026-08-30]** Neither delivery path described below is
reachable from the UI anymore. `5d18b45` ("declutter substep bubbles,
scope chat to one substep") dropped the eye/target/note icon row from
substep bubbles entirely — a substep now shows only its instruction text
and "Check my work." [ADR 0006](../decisions/0006-restore-real-on-screen-overlay.md)
is marked superseded accordingly. The underlying code
(`overlay.js`/`overlay.html`, the Rust `locate_element` command) is still
in the tree, unreferenced, pending a real cleanup pass — described below
for that reason, not because it's current. The
[philosophy/vision.md](../philosophy/vision.md) "point at the real
element on the real screen" promise is therefore currently undelivered by
any path; no replacement has been decided.

History, kept for context on the code that's still sitting there unused:
this section previously described a real on-screen overlay drawn again
alongside an in-panel schematic, superseding an earlier "no overlay at
all" position (see [ADR 0006](../decisions/0006-restore-real-on-screen-overlay.md)
for the full record). The original `main` window drew a real highlight
box/bubble over
the target app and was abandoned because *any* real, interactive window
sitting over that app blocks clicks into it, and because a *toggled*
click-through state was observed to get stuck in the interactive
direction — trapping the whole screen with no recovery short of killing
the app. Highlighting became a schematic diagram inside the sidebar's own
chat view instead.

What changed: click-through is now set **once, in Rust, at startup**
(`set_ignore_cursor_events`, `src-tauri/src/lib.rs`) on a dedicated
`overlay` window and is *never* toggled from JS, so there is no stuck
state to reach — which was the actual failure, not click-through itself.
`overlay.html`/`overlay.js` draw the highlight box plus the substep's
instruction as a positioned text callout; `pointer-events: none` on
everything is a second layer of defence under the OS-level passthrough.
**Don't add a command that flips this** — if the overlay ever needs real
input it needs a different design.

Both renderings now coexist, per substep, in the sidebar's chat view (see
`actionsHtml` in `sidebar.js`): an **eye** icon toggles the real on-screen
overlay, a **note** icon toggles the in-panel schematic. The schematic is
not legacy — it's the required fallback wherever no live window rect
exists (a Wayland portal capture never discloses screen position, see
"Screen understanding"), and a non-intrusive "roughly where" that doesn't
take over the screen. A **target** icon re-runs `locate_element` live, so
a box that has gone stale is one press from correct.

Coordinate model (the part that makes this survive a resize):
`last_known_bbox`'s `x0..y1` are **fractions** of `image_width`/
`image_height` — the frame they were captured against, identified by
`anchor` (see [ADR 0005](../decisions/0005-window-anchored-overlay-coordinates.md)).
To draw, `overlay.js` re-multiplies the fraction by that frame's
**current** geometry, re-queried every 200 ms (`refresh_window_rect`)
rather than trusted from cache, then converts physical screen px to CSS px
by dividing by the monitor's `scaleFactor` — without that last step
everything is silently offset on any HiDPI/fractional-scaling display.
Polling rather than native move/resize event hooks is deliberate: ADR 0005
deferred the per-platform event backends, and ~5 cheap OS queries/sec
while an overlay is visible buys the same behaviour with no new platform
code, at the cost of a frame or two of lag while dragging.

Platform reality: this works where a live window rect exists (macOS,
Windows, Linux X11). On a Wayland session it does not — the compositor
neither discloses window geometry nor lets a toplevel position itself
absolutely — so the eye reports that plainly and the schematic is the
answer there. The
[philosophy/vision.md](../philosophy/vision.md) "point at the real element
on the real screen" promise is therefore delivered on three of four
platform tiers, not universally.

**Further investment here is deliberately deprioritized** (2026-08-29) —
this section describes what's built, and it stays built, but Charlie
judged the Guide → Do → Verify confirmation loop (checking the user's
work against an AI-generated `expected_outcome`, rather than trusting a
"Done" click) more central to the product and cheaper to build than
either polishing highlight/callout placement or the animated cursor
indicator ([BL-010](../BACKLOG.md)) that would otherwise be the next step
up from a static box. See
[planning/vision-driven-substep-loop.md](../planning/vision-driven-substep-loop.md).

**Windows: one plain fixed-size panel, a transient region-drag/click-catch
window, and the click-through overlay** [built] — down from an earlier
four/five-window design
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
(`region-select.html`/`region-select.js`) is a temporary,
fully-interactive, full-screen window serving two gestures: the
`CaptureScope::Region` fallback's region drag, and the click-to-pick
gesture that selects a window (see "Screen understanding" above) — shown
only for the duration of either, hidden immediately after via a real
`hide()` call. `overlay` (`overlay.html`/`overlay.js`) was a third
window — transparent, always-on-top, permanently click-through, shown on
a substep's eye icon press — but that icon (and the whole eye/target/note
row) no longer exists in the UI as of 2026-08-30; the window/code remain
unreferenced, not deleted. See "Visual overlay" below.

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
