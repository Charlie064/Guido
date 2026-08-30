# 0006 — Restore the real on-screen overlay, click-through set once

## Status

Accepted. Supersedes the "no overlay is drawn on top of the target
application anymore" position recorded in
[architecture/overview.md](../architecture/overview.md)'s "Visual overlay"
section (that decision was never written up as its own ADR; this one
records both it and its reversal).

## Context

The product promise in [philosophy/vision.md](../philosophy/vision.md) is
to point at the real element on the real screen. An early build did that:
a transparent, click-through, full-screen window (`main`) drew a highlight
box and bubble over whatever app the user was being taught.

It was removed for two distinct reasons, which had been conflated:

1. **Any real, interactive window over the target app blocks clicks into
   it.** True, and unavoidable for an interactive window.
2. **A *toggled* click-through state got stuck.** `main` flipped its own
   passthrough off (to allow a region drag) and back on afterwards, and
   the return-to-click-through side was observed silently not taking
   effect — leaving an invisible, full-screen, interactive window over the
   entire desktop with no recovery short of killing the app.

Reason 2 is what actually made the old overlay dangerous, and it is a
property of *toggling*, not of click-through. Reason 1 only bites for a
window that is interactive at all.

Highlighting was replaced by an in-panel schematic diagram: a proportional
box on a placeholder rectangle inside the sidebar's chat view. That is
safe and works everywhere, but it does not deliver the product promise —
the user still has to map a diagram onto their own screen by eye.

Two further problems had to be solved before a real overlay could be
correct rather than merely drawn, neither of which the schematic ever had
to face (a diagram is proportional by construction):

- **Staleness.** A bbox captured against one window size is meaningless
  pixels after that window resizes or moves.
  [ADR 0005](0005-window-anchored-overlay-coordinates.md) fixed the
  storage model (fractions plus an `anchor` naming the frame) but
  explicitly deferred the live tracking.
- **DPI.** Screenshots and OS window rects are in *physical* pixels;
  positions inside a webview are *logical* CSS pixels. These are equal at
  scale factor 1.0 — so a missing conversion looks correct on most
  machines and is silently wrong on every HiDPI or fractional-scaling one.

## Decision

- **Draw a real on-screen overlay again**, in its own dedicated `overlay`
  window (`overlay.html`/`overlay.js`), showing the highlight box plus the
  substep's instruction as a positioned text callout.
- **Click-through is set once, in Rust, at startup**
  (`set_ignore_cursor_events(true)` in `lib.rs`'s `setup`) and is **never
  toggled from JS**. This is the whole safety argument: with nothing ever
  flipping it, the stuck-interactive state that motivated the removal
  cannot be reached. `pointer-events: none` on every element is a second
  layer under the OS-level passthrough. If the overlay ever needs real
  input, that requires a different design — not a toggle. Reason 1 above
  is thereby accepted-and-avoided rather than solved: the overlay is never
  interactive, so it never blocks clicks.
- **Keep the in-panel schematic as a first-class peer, not legacy.** Each
  substep offers both: an eye icon for the real overlay, a note icon for
  the schematic. The schematic is the required fallback wherever no live
  window rect exists, and a non-intrusive option when the user doesn't
  want their screen taken over.
- **Resolve coordinates live, every time, and convert for DPI.** The
  stored fraction is re-multiplied by the anchor frame's *current*
  geometry (`refresh_window_rect`), then converted physical → CSS px by
  dividing by the monitor's `scaleFactor`. Nothing is ever drawn from a
  cached rect.
- **Track movement by polling at 200 ms**, not by native move/resize event
  hooks. ADR 0005 deferred the per-platform event backends
  (`NSWindowDidResizeNotification` / `WinEventHook` / `ConfigureNotify`)
  and this does not un-defer them: ~5 cheap OS queries per second while an
  overlay is visible buys the same behaviour with no new platform code.
  Accepted cost: a frame or two of lag while a window is being dragged.
- **Refuse to draw for a portal capture.** On Wayland the desktop portal
  hands over frames but never discloses the source's screen position (see
  `FrameAnchor::Portal`), so there is no correct place to put the box. The
  overlay says so and stops, rather than drawing somewhere
  plausible-looking — a confidently-wrong highlight is worse than none.

## Consequences

- **The promise is delivered on three of four platform tiers, not
  universally.** Where a live window rect exists — macOS, Windows, Linux
  X11 — the overlay works. On a Wayland session it cannot: the compositor
  neither discloses window geometry nor lets a toplevel position itself
  absolutely. Wayland users get the schematic, and that is now a permanent
  two-path design rather than a temporary gap.
- **This repo's own primary dev machine is in the non-working tier**
  (GNOME/Wayland). The overlay is therefore the one feature that cannot be
  demoed or manually verified here — it needs an X11 session, a Mac, or a
  Windows box. Worth stating plainly because ADR 0005's platform table put
  this machine's *compositor family* (wlroots) in the working tier, and the
  actual session here is GNOME.
- A third Tauri window (`overlay`) joins `sidebar` and `region-select`.
  It stays hidden until a substep's eye is pressed, and is dropped
  automatically when the user leaves the chat view, so a highlight can't
  outlive the UI that points at it.
- Polling is a visible-overlay-only cost, but it *is* a recurring timer
  calling into the OS — if profiling ever shows it mattering, the native
  event hooks in ADR 0005 are the upgrade path, not a smaller interval.
- The DPI conversion is now the single place scale factor is handled. Any
  future feature that maps between captured-image pixels and on-screen
  positions must go through the same conversion or it will be wrong on
  HiDPI displays in exactly the way that is easiest not to notice.
- **GTK gotcha worth knowing before touching this again**: on Linux,
  `set_ignore_cursor_events` on a window that has never been shown *aborts
  the process*. tao implements it as
  `window.window().unwrap().input_shape_combine_region(..)`, and
  `gtk_widget_get_window` is NULL until the widget is realized, so the
  unwrap panics inside a glib dispatch callback that cannot unwind — which
  turns a panic into an immediate abort rather than an error a caller could
  handle. Since this ADR requires the overlay to be click-through from
  startup *and* invisible until used, the two are reconciled by calling
  `realize()` (creates the GdkWindow without mapping it) after
  `init_layer_shell` and before `set_ignore_cursor_events`. Any future
  window that wants the same combination needs the same ordering.
