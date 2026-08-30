# 0009 — Window-scoped capture already excludes the sidebar; drop the hide/show dance for it

## Status

Accepted (finding + decision only — not yet implemented in code, see
Consequences).

## Context

[ADR 0006](0006-restore-real-on-screen-overlay.md) made `sidebar.hide()` /
`.show()` run unconditionally around every capture site in `lib.rs`
(`locate_element`, `verify_substep`, `answer_question`, `identify_app`,
`pick_portal_source`), regardless of platform or capture scope. The
reasoning at the time was uniformity and safety — "keeps every caller of
this command correct automatically" — not a proven requirement for every
scope. [BL-014](../BACKLOG.md) went further and asserted, for Linux
specifically, that "no Wayland-portal equivalent to
`WDA_EXCLUDEFROMCAPTURE` exists for an ordinary client to call on itself,"
concluding Linux would keep the hide/show approach indefinitely while
macOS/Windows could drop it via their native capture-exclusion APIs.

That claim was tested, not assumed. On this session's actual dev machine
(GNOME Shell 50.3, Wayland, stock/non-riced GNOME — no rice, no compositor
substitution):

- Picked a window source via `portal_capture.py pick window` (the XDG
  ScreenCast portal, per [ADR 0007](0007-portal-capture-backend-wayland.md)).
- Manually verified once: put the GNOME Settings window on top of the
  picked window, captured, and the resulting frame showed no trace of
  Settings.
- Automated the test as `spikes/vision-detect/test_window_isolation.py`:
  spawns a **fullscreen** solid-magenta Tk window (a color that won't occur
  naturally, and a full-screen marker is a harder case than a small corner
  sidebar) directly on top of the picked window, captures, and scans the
  PNG for that color. Run 5 times back to back, reusing the same persisted
  portal token (no re-prompting, same as production capture calls) —
  **5/5 clean**, the marker never appeared.

So on GNOME/Wayland, a `window`-scoped `ScreenCast` portal stream is
already isolated to that one window's own buffer — it behaves like OBS's
window-capture sources, not like a full-screen composite crop. Guido does
not need to hide for this scope; it never enters the frame regardless of
z-order, because the compositor never composites it into that stream in
the first place.

## Decision

- **Guido (the `sidebar` window) stays visible and on top at all times.**
  It is no longer hidden for a capture whose scope is `Window` (portal
  `window` scope on Linux/Wayland; the equivalent window-scoped native
  capture on macOS/Windows/X11/Hyprland once each is verified the same
  way — see Consequences).
- **Region- and Monitor-scoped captures keep the existing hide/show.**
  Those genuinely composite the whole screen or a drawn region, so Guido
  would leak into frame if left up. This matches the product decision
  already accepted for screen capture: "suit yourself if Guido is in the
  way."
- **The test method is the reusable artifact, not just this one result.**
  `spikes/vision-detect/test_window_isolation.py` (fullscreen distinct-color
  marker window + pixel scan, no manual dragging needed) is the pattern to
  re-run against every other backend before extending this decision to it:
  macOS (ScreenCaptureKit / `CGWindowListCreateImage` scoped to a window
  ID), Windows (Windows Graphics Capture), Linux X11
  (`XCompositeNameWindowPixmap`), and Hyprland/wlroots
  (`hyprland-toplevel-export-v1`). All four are expected to isolate the
  same way by API design — same as GNOME turned out to, despite BL-014
  assuming otherwise — but none of them has been measured yet, and ADR
  0007 already burned time once on GNOME behavior that looked reachable on
  paper and wasn't (`Introspect`, `Eval`). Measure before trusting docs.

## Consequences

- **BL-014's Linux claim was wrong in practice, right in letter.** There
  is genuinely no explicit "exclude this window from any capture" API for
  an ordinary Wayland client (no `WDA_EXCLUDEFROMCAPTURE` equivalent) —
  but for the one capture path that matters most (window-scoped, the
  primary scope going forward per the OBS-style plan), no such API is
  needed: the portal's own isolation already produces the identical
  outcome. BL-014 should be corrected to reflect this rather than
  continuing to state Linux as fully blocked.
- **Always-on-top (BL-013) and capture-exclusion (this ADR) are confirmed
  orthogonal**, not two aspects of the same problem. The isolation
  guarantee tested here does not depend on Guido's z-order or on
  `wlr-layer-shell` being available — it only requires Guido to exist as a
  separate top-level window, which is true regardless of whether GNOME can
  force it above the tiling/stacking order. BL-013 remains a pure visual/
  UX concern (does Guido look pinned to the user), not a prerequisite for
  the capture behavior in this ADR.
- **Not yet implemented.** `lib.rs`'s hide/show calls still run
  unconditionally as of this writing; this ADR records the finding and the
  decision, not a shipped change. The concrete edit is: in
  `locate_element_blocking`, `verify_substep_blocking`,
  `answer_question_with_screenshot_blocking`, and `identify_app_blocking`,
  skip `sidebar.hide()`/`.show()` when `scope` resolves to
  `CaptureScope::Window` or a portal `Window` source; keep it for `Region`
  and portal `Monitor`.
- Only verified on one GNOME version, one session, one manual overlap plus
  five scripted ones. Worth a couple more scripted runs across a window
  resize/move/minimize-restore cycle before shipping the code change, to
  rule out a fluke rather than assume the 5/5 result generalizes forever.

## Alternatives considered

- Trust the native capture APIs' documentation for macOS/Windows/X11/
  Hyprland without measuring, since window-scoped isolation is their
  documented behavior. Rejected for the same reason ADR 0007 rejected
  assuming Wayland/XWayland compatibility: documented behavior and this
  project's actual compositor/portal-version combination have diverged
  before.
- Build an explicit Linux capture-exclusion mechanism (there is none to
  build against for an ordinary client) — moot once the window-scope
  portal stream was shown to already behave this way.
