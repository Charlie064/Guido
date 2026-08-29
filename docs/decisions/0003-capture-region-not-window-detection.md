# 0003 — Capture a user-defined region, not active-window detection

## Status

Accepted

## Context

Screen understanding needs a capture boundary: what part of the screen gets
screenshotted and sent to the vision model each step. Two options were
considered:

- **Active-window detection**: infer which app the tutorial is "about" (e.g.
  via the OS's frontmost/focused window) and capture only that window.
- **User-defined region**: capture a box the user draws (default: full
  screen), independent of which app currently has focus.

Active-window detection breaks down for cross-platform or multi-app
tutorials (e.g. a browser reference doc next to the target app), since
"the active window" is a single-app assumption the product doesn't want to
make. It also isn't reliably available cross-platform: macOS
(`CGWindowListCopyWindowInfo` / ScreenCaptureKit) and Windows (`EnumWindows`
+ `DwmGetWindowAttribute`) expose window rects, owning app, and z-order for
on-screen windows, but Wayland compositors (the modern default on most
Linux distros, and this project's [primary dev target](0002-agency-hybrid-vision-platform-business.md))
intentionally block cross-app window enumeration for security. A feature
that silently degrades to guesswork on the primary platform is a problem.

A related question: can the OS tell us the bounding boxes of on-screen
*elements* (buttons, menus, fields), not just windows? Two distinct
mechanisms exist and neither is a free path to occlusion-aware element
boxes:

- OS accessibility APIs (macOS AXAPI, Windows UI Automation, Linux AT-SPI2)
  can return element-level trees with bounding boxes, but coverage is
  app-dependent — canvas-rendered apps (DaVinci Resolve, Blender, Fusion
  360) expose little or nothing, which is exactly the app category this
  product targets most. See [ADR 0002](0002-agency-hybrid-vision-platform-business.md).
- Vision-model localization on the pixel capture works for any app but only
  sees what's actually rendered — occluded pixels are never in the frame,
  regardless of which detection mechanism is used. Window rects reported by
  the OS reflect a window's full geometry regardless of occlusion, so they
  cannot be trusted as "what's visible" on their own; visibility has to be
  computed separately (z-order rect subtraction) from the pixel capture.

## Decision

- **Capture is a user-drawn region, default full screen.** No attempt to
  infer "the app the user means" from window focus. The region tool is a
  click-drag box on the transparent overlay window; releasing with no drag,
  or pressing Escape, keeps the default (full screen).
- **No window-enumeration/occlusion detection in this phase.** Given it's
  unavailable on Wayland (the primary dev target) and only computable as a
  secondary signal even where available, it's out of scope for the MVP. If
  a step's target isn't visible in the capture, the vision model's own
  "not found" response is the signal — no OS-level occlusion check backs it
  up yet.
- **Element-level localization stays vision-first.** No accessibility-tree
  fast path is being built now; revisit only if latency/accuracy on
  canvas-heavy target apps demands it (already flagged as vision-primary
  regardless, per ADR 0002).

## Consequences

- The overlay UI needs a region-selection interaction (draw box → confirm)
  and a persistent affordance (sidebar) showing/editing the current region,
  in addition to the existing step-guidance overlay.
- The `locate_element` vision call needs to be scoped to the selected
  region's pixels (or the region's coordinates passed alongside the
  screenshot), not implicitly the full screen.
- If a target element isn't visible (covered by another window, scrolled
  out of view, etc.), the product's only signal today is a vision "not
  found" — there's no deterministic occlusion check to distinguish "covered
  by another app" from "doesn't exist yet." A future ADR should revisit
  window-enumeration-based occlusion detection (macOS/Windows only) if this
  turns out to matter in practice, and decide how the product should
  respond (e.g. prompt the user to bring the app forward).
