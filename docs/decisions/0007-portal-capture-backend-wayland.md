# 0007 — Desktop portal as the capture and window-pick backend on Wayland

## Status

Accepted. Amends the scope statement in
[ADR 0005](0005-window-anchored-overlay-coordinates.md) ("Wayland is out of
scope") — 0005's coordinate model and its macOS/Windows/X11 backends stand
unchanged; only its assumption that a Wayland session can be left
unsupported is replaced.

## Context

ADR 0005 shipped live window enumeration for macOS, Windows and Linux/X11
and explicitly deferred Wayland, on the reasoning that a Wayland session
with XWayland "still works through the Linux backend since it talks X11
either way."

That reasoning was falsified on the primary dev machine (GNOME Shell 50,
Wayland). Measured, not assumed:

- `_NET_CLIENT_LIST_STACKING` on the root window is **empty**. XWayland
  only ever lists X11 clients, and on a modern GNOME desktop every app is
  Wayland-native, so there is nothing to enumerate. The X11 backend
  returned `Ok(vec![])` — a *successful* empty list — so `window_at_point`
  failed for every click and window selection silently did nothing.
- `org.gnome.Shell.Introspect.GetWindows` exists but returns
  `AccessDenied` (Mutter restricts it to whitelisted callers).
- `org.gnome.Shell.Eval` returns `(false, '')` — disabled since GNOME 41.
- Screen *capture* was equally dead, for a different reason: `grim` speaks
  only `wlr-screencopy`, which GNOME and KDE do not implement
  (`"compositor doesn't support the screen capture protocol"`), and `mss`
  is X11-only. Being on `$PATH` said nothing about whether `grim` worked.
- There is no X11 session to fall back to: the machine has no
  `xorg-server` and no `/usr/share/xsessions`, only Wayland sessions.

So on this platform the product had neither a window list nor a working
screenshot — the two things every later stage depends on.

The one sanctioned, compositor-agnostic route is the XDG desktop portal.
It inverts the model: an app does not ask *what* is on screen and then
capture it, it asks the compositor for a source and the compositor's own
picker decides, returning frames over PipeWire and never disclosing
geometry.

## Decision

- **Select the backend at runtime, per session.**
  `window_provider::backend()` returns `Native` for macOS, Windows and
  Linux/X11, `Portal` for Linux/Wayland. Keyed off `WAYLAND_DISPLAY`, not
  off "did the X11 query return rows", because a Wayland session with one
  stray XWayland app would otherwise claim Native and then see only that
  app — and capture would still be broken. **The macOS and Windows
  backends are untouched**; window-anchored capture and on-screen
  highlighting keep working there exactly as ADR 0005 specified.
- **On Wayland, the compositor's picker *is* the pick gesture.** The
  click-to-pick flow (a full-screen click-catcher plus `window_at_point`)
  cannot work where nothing can be enumerated, so the portal's
  `SelectSources`/`Start` dialog replaces it. `scope: "any"` is requested,
  so the picker offers both its screen and window tabs.
- **Persist the grant, prompt once.** `persist_mode = 2` plus the returned
  `restore_token`, stored at
  `$XDG_STATE_HOME/tutoria/portal-<scope>.json`. Every later capture
  restores the session from the token and is silent. The token is
  re-saved on each use because the compositor rotates it — keeping a stale
  one starts prompting again mid-skill.
- **Pull frames with GStreamer `pipewiresrc`** over the fd from
  `OpenPipeWireRemote`, rather than hand-rolling a PipeWire client:
  format negotiation and the fd hand-off are already solved, and it is a
  library the desktop already ships. Five buffers are taken and the last
  one kept, because the first frames after a stream starts can be blank.
- **The portal source type decides whether the overlay can draw.** A
  screen-scoped frame *is* one monitor, so a fraction of the frame is the
  same fraction of that monitor and maps back to absolute coordinates —
  the real on-screen highlight works. A window-scoped frame has no
  knowable position, so it falls back to the in-panel schematic per
  [ADR 0006](0006-restore-real-on-screen-overlay.md). Which one the user
  is getting is stated in the setup label at pick time, not discovered
  later.
- **An empty X11 window list is an error, not an empty success.** It means
  no client is registered with X11 at all, which is a diagnosis
  ("Wayland-native session") rather than "no windows are open". Returning
  `Ok(vec![])` there is what made the original bug silent.
- **`portal_capture.py` re-execs into an interpreter that has `gi`.**
  PyGObject is a distro package (`python-gobject`) needing
  gobject-introspection headers and a meson build, so it is not in the
  project venv, and the script needs only `gi` plus the stdlib. Rather than
  making every call site pick the right interpreter — or putting a build
  dependency on teammates who will never run the Linux path — the script
  finds a system `python3` that can import `gi` and re-execs once, guarded
  against looping.

## Consequences

- **No app name or window title on Wayland.** The portal deliberately
  discloses neither, so `research_goal`'s `app_name` argument is `null`
  there and Research infers the target app from the goal text alone. This
  is the real cost of the portal boundary; recovering it would need a
  GNOME Shell extension (see Alternatives).
- **Real on-screen highlighting on Wayland requires sharing a screen, not
  a window.** The app being taught still needs no particular size, position
  or focus — only the capture source differs. A window share gives the
  vision model a tighter, less cluttered frame, at the cost of the
  highlight.
- **Multi-monitor is approximate.** A screen-scoped frame is resolved
  against the monitor the overlay window is on, which need not be the
  monitor that was shared. The portal reports the shared monitor's
  `position` (captured but not yet used) if this needs fixing.
- **Capture costs a portal round-trip.** Each capture creates and tears
  down a session (~a few hundred ms) instead of holding one open. Simpler
  and stateless; revisit if per-step latency matters.
- **A new runtime dependency on Linux**: `python-gobject` and GStreamer's
  PipeWire plugin (`gst-plugin-pipewire`), plus a portal backend matching
  the running desktop. See
  [workflows/development.md](../workflows/development.md), which documents
  the failure this causes when `xdg-desktop-portal` is a stale process
  from a different compositor.
- ADR 0003's and 0005's framing of Wayland as a limitation to route around
  is now a supported path with a different shape, not a gap.

## Alternatives considered

- **A GNOME Shell extension exposing window geometry over D-Bus**
  (`global.get_window_actors()`). The only way to get true window rects on
  GNOME Wayland, and it would restore app-name scoping and window-anchored
  highlighting. Rejected for now: GNOME-only, needs a separate install and
  the user to enable it, breaks across Shell versions, and does nothing for
  KDE or any other compositor.
- **`org.gnome.Shell.Introspect`** — the API that would have been exactly
  right. `AccessDenied` for unprivileged callers.
- **`org.gnome.Shell.Eval`** — disabled since GNOME 41.
- **wlroots protocols** (`wlr-screencopy`, `wlr-foreign-toplevel`) — what
  `grim` and ADR 0005's research relied on. Not implemented by GNOME or
  KDE, so they cover the compositors we are *not* running.
- **Running an X11 session instead.** Would make the native path work
  unchanged, but the target machine has no X server installed and GNOME's
  X11 session is being retired upstream — a shrinking base to bet on.
- **The `Screenshot` portal** rather than `ScreenCast`. Simpler for a
  one-off grab, but its interactive mode re-prompts on every shot, which
  the per-step guided loop would make unusable.
