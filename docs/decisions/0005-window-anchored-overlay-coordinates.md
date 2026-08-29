# 0005 — Window-anchored coordinates for a future real overlay

## Status

Accepted (coordinate model only — see Consequences for what's deferred)

## Context

[ADR 0003](0003-capture-region-not-window-detection.md) chose a user-drawn
capture region over active-window detection, and explicitly punted
window-enumeration/occlusion detection as unavailable on Wayland (the
primary dev platform) and out of scope for the MVP.
[architecture/overview.md](../architecture/overview.md)'s "Visual overlay"
section later abandoned drawing a real highlight box on the target app
entirely — any real interactive window over the target app blocks clicks
into it — in favor of an in-panel schematic diagram. Today's `Box2D`
(`spikes/tauri-overlay/src-tauri/src/lib.rs`) stores `x0,y0,x1,y1` plus the
`image_width,image_height` of the captured frame; the schematic renders
these as a proportional box, which survives arbitrary screen sizes fine
*because it's just a diagram*, not something drawn on the real screen.

Revisiting real on-screen highlighting raises three concrete failure modes
that a schematic never had to solve:

1. **App resize** — a bbox captured against one window size is meaningless
   pixels after the window resizes; [features/skills.md](../features/skills.md)
   already documents `last_known_bbox` as "a cache, never ground truth" for
   exactly this reason.
2. **Overlapping windows (occlusion)** — ADR 0003 already flagged this as
   unsolved: a vision "not found" can't distinguish "covered by another
   window" from "doesn't exist yet."
3. **Wrong screen (multi-monitor)** — a box positioned in absolute desktop
   pixels can end up on the wrong monitor if the target window has moved.

### Research: what OS-level window tracking is actually available (Aug 2026)

ADR 0003 said window enumeration is "unavailable on Wayland." That's true
of the Wayland *protocol* by default, but it conflates all Wayland
compositors together, and the two we most need to distinguish behave
oppositely:

| Platform | Live window rect + move/resize events | Status |
| --- | --- | --- |
| macOS | `NSWorkspace.frontmostApplication`, `AXUIElement` (Accessibility API), `NSWindowDidResizeNotification` | Solid, unchanged from ADR 0003/BL-004 |
| Windows | `GetForegroundWindow`, `DwmGetWindowAttribute`, UI Automation `WinEventHook` | Solid, unchanged from ADR 0003/BL-004 |
| Linux X11 (any desktop, including GNOME-on-X11) | `_NET_ACTIVE_WINDOW`, `WM_CLASS`, `ConfigureNotify` | Solid, unchanged |
| **Linux Wayland + wlroots compositor** (Hyprland, Sway) | `ext-foreign-toplevel-list-v1` (wlroots ≥0.18) / `wlr-foreign-toplevel-management-v1` | **Works.** This is this project's own dev setup (`XDG_CURRENT_DESKTOP=Hyprland`, Hyprland 0.56.1). |
| **Linux Wayland + GNOME (Mutter) or KDE (KWin)** | Same protocol family | **Does not work.** KWin support is an open, unresolved bug (KDE bug 483227); no evidence GNOME/Mutter implements it either. These are the two most-installed Linux desktops. |

So the axis that matters is not "Wayland vs. X11," it's "does this specific
compositor implement the foreign-toplevel protocol" — wlroots compositors
do, GNOME/KDE don't. A GNOME or KDE session run under X11 instead of
Wayland is unaffected by the gap; it's specific to their Wayland sessions.

Market context for how much this gap matters: StatCounter (Jul 2026) puts
Linux at ~7.5% of overall desktop web traffic against Windows ~71% /
macOS ~20%, and Linux desktop users skew technical/enthusiast — the
opposite of this product's non-technical target user
([philosophy/vision.md](../philosophy/vision.md)). Within that already-small
slice, GNOME/KDE (the degraded pair) are the majority Linux desktops, and
wlroots compositors (the working pair) are enthusiast/tiling-WM territory.
Net: the degraded tier covers a small fraction of a small platform, but it
includes this project's own primary dev environment's *distribution*
family even though not its actual compositor — worth stating plainly since
it's non-obvious: **this repo's dev machine (Hyprland) is in the working
tier**, GNOME/KDE users are not.

## Decision

- **Store `last_known_bbox` coordinates as fractions of the frame they were
  captured against, tagged with what that frame was** — either a
  free-drawn `Region` (today's default, no tracking possible) or, on
  platforms where a live window handle exists, a specific window's client
  rect. Fractional coordinates already survive arbitrary screen/window
  sizes by construction (`x0/image_width`); what's missing today is knowing
  *whose* rect to re-multiply them against, and getting that rect live
  rather than assuming it hasn't moved.
- **Capture defaults to "pick a window" on the working tier, "draw a
  region" on the degraded tier.** Picking a window ties the captured
  frame's dimensions directly to that window's client area, so replaying a
  stored fraction against the window's *current* rect is arithmetic, not a
  fresh capture — this is what makes resize/move survivable. Free-drawn
  region capture (today's only option, ADR 0003) remains available
  everywhere as the fallback and as the only option on the degraded tier,
  and stays the *only* option for genuinely cross-app captures (browser
  reference doc next to the target app) since a single window pick can't
  express that.
- **Three-tier platform support**, not a Wayland/not-Wayland split:
  - macOS, Windows, Linux X11 (any desktop), Linux Wayland + wlroots
    compositor (Hyprland, Sway, …): window-pick capture, live rect
    tracking, real-overlay-eligible once that feature is rebuilt.
  - Linux Wayland + GNOME or KDE: unchanged from today — manual app entry,
    free-drawn region only, schematic-only rendering. Same experience as
    now, not a regression.
- **Occlusion detection stays deferred.** Window enumeration on the working
  tier makes it *possible* (z-order rect subtraction) but it's not being
  built now — this ADR only decides the coordinate model, not occlusion.
  Revisit alongside whatever rebuilds the real overlay.

## Consequences

- `Box2D` and the substep schema in
  [features/skills.md](../features/skills.md) need a frame-identity field
  (window vs. region, plus enough to re-resolve "that window" later — see
  the lib.rs changes in this same change) alongside `last_known_bbox`.
  Today's rendering (schematic-only, in-panel) is unaffected — this is
  purely a storage-shape change so the data is ready when a real overlay is
  rebuilt, not a behavior change yet.
- **Not built by this ADR**: the live OS window-tracking backend itself
  (the actual `NSWorkspace`/`GetForegroundWindow`/`_NET_ACTIVE_WINDOW`/
  `ext-foreign-toplevel-list-v1` calls), the window-picker UI replacing
  region-draw, resize/move event listeners, and the real on-screen overlay
  renderer. Each is real, separate work — tracked as a follow-up in
  [BACKLOG.md](../BACKLOG.md) — this ADR only fixes the data model so that
  work doesn't require another schema migration later.
- This shares its `ActiveAppProvider`-style per-platform backend with
  BL-004 (active-app detection for chat naming/icons) — same platform
  matrix, same provider-interface pattern, likely the same Rust module.
  Worth building together rather than twice.
- Updates the platform claim in ADR 0003 ("unavailable on Wayland") to the
  more precise compositor-level claim here; ADR 0003 itself is left
  unedited per this log's append-only rule, and its capture-region-not-
  window-focus decision is unchanged and still correct — this ADR only
  revisits the occlusion/tracking side, not which pixels get captured.
