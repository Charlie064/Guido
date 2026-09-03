# OS-level cursor movement

**Contract** [built, Windows path exercised live; macOS/Linux written
only — see [testing/manual-test-matrix.md](../testing/manual-test-matrix.md)]
- The first real piece of Do-mode's actuation layer
  ([ADR 0002](../decisions/0002-agency-hybrid-vision-platform-business.md)):
  moving the real OS cursor. `spikes/tauri-overlay/src-tauri/src/cursor_control.rs`
  — same shape as `window_provider.rs` (one public dispatch fn, a
  `cfg(target_os)` block per platform).
- **Not driven by anything real yet.** No plan step, no AI-chosen
  `action` value (`plan_step` already emits a `move-cursor` action per
  [minimal-step-mode.md](../planning/minimal-step-mode.md)'s "What's
  already true today," but nothing renders or acts on it —
  [BL-010](../BACKLOG.md)). The only caller today is a manual test
  button, `#bar-cursor-test` in the top bar (every view `.bar` appears
  on), wired in `sidebar.js`. Clicking it moves the cursor to the
  *primary* monitor's center — deliberately `primaryMonitor()`, not
  `currentMonitor()` (the monitor this small window happens to be on),
  since a multi-monitor mismatch there previously looked exactly like
  "nothing happened."
- **This closes one part of `minimal-step-mode.md`'s open item**: that
  doc's "What's already true today" says "Do mode itself has no
  actuation mechanism built at all." That's no longer fully true —
  cursor placement exists now, manually triggered. Click/type actuation,
  and anything AI-driven, are still unbuilt.

## Animated, not a single jump

`move_cursor` doesn't warp straight to the target — it reads the
cursor's *current* position, then moves it through ~24 interpolated
steps over ~260ms (cubic ease-out: fast start, gentle settle) via
`animate()` (Windows/macOS — cheap per-step syscalls) or
`linux_x11::move_animated` (one X11 connection reused for the whole
sequence, not reopened per step — connection setup is real overhead a
per-step reconnect would burn most of the animation's time budget on).
Not the original design: a single-jump `move_cursor_immediate` was the
whole implementation until 2026-09-03, when the user reported that
after clicking the test button, the tracked cursor position genuinely
moved (confirmed — a target at the destination was clickable
immediately after) but the *visible* cursor sprite never appeared to
move at all in their environment. A real mouse produces a stream of
small position updates, not one teleport, and some remote-display/VM
cursor-rendering stacks specifically redraw in response to that stream
rather than a single absolute jump — animating is a considered fix for
that class of gap, not just a guess, and is better UX on its own
regardless (the user can actually track where the cursor is going,
same principle as the Teach-mode cursor *indicator* in
`planning/minimal-step-mode.md`, just applied to the real OS cursor).
Each per-OS module now exposes `get_cursor_position` +
`move_cursor_immediate` (Windows/macOS) as the primitives `animate()`
drives; Linux keeps its own connection-owning `move_animated` instead
since it doesn't share the "cheap to call repeatedly" property.

## Per-platform implementation

- **Windows** — `SendInput` with `MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE
  | MOUSEEVENTF_VIRTUALDESK`, coordinates normalized to 0..=65535 across
  the full virtual screen (`GetSystemMetrics(SM_C/XY_VIRTUALSCREEN)`),
  not just the primary monitor — stays correct for a target on a
  secondary display. Position read back via `GetCursorPos`. **Not the
  first thing tried**: started as a plain `SetCursorPos`, which moved
  the cursor correctly when verified directly (`SetCursorPos` +
  immediate `GetCursorPos` readback, same session) but was reported as
  visibly doing nothing when tested by the user. Swapped to `SendInput`
  because it synthesizes a real input-pipeline event (what an actual
  mouse and every automation tool use) rather than poking the tracked
  position directly — more likely to be honored by whatever's actually
  rendering the cursor in a remote/virtual session. Needed a new Cargo
  feature, `Win32_UI_Input_KeyboardAndMouse`.
- **macOS** — `CGWarpMouseCursorPosition` to move,
  `CGEventGetLocation(CGEventCreate(NULL))` to read the current
  position (a `NULL` event source reads current system event state
  rather than needing a real event to inspect — the documented Quartz
  Event Services pattern for "where is the cursor right now"), both
  declared as raw externs against CoreGraphics/CoreFoundation (same
  pattern `window_provider.rs`'s `CGWindowListCopyWindowInfo` uses — no
  `core-graphics` crate dependency needed for a couple of functions and
  one struct). **Unverified** — no Mac hardware available to the
  session that wrote it; same gap the rest of the macOS backend has
  (Apple's EULA blocks a legitimate local-VM test — see
  `docs/workflows/development.md`).
- **Linux** — `XWarpPointer` to move, `XQueryPointer` to read position,
  both via `x11rb`'s core `xproto` (no XTest extension needed —
  passing `NONE` as the source window and the root window as the
  destination makes the target coordinates absolute screen px, the same
  trick `xdotool mousemove` uses). X11-only; a Wayland session has no
  compositor-agnostic pointer-warp API outside
  `org.freedesktop.portal.RemoteDesktop`, which isn't wired up — returns
  an explicit "no X11 display available" error there rather than
  silently no-oping.

## Debugging note: VM mouse integration can silently override every programmatic move

If `move_cursor` is reported as "not visibly moving the cursor," and
specifically if **the cursor reverts to tracking the real mouse the
instant it's touched again**, that's not this code — it's the VM's own
mouse integration/passthrough (Hyper-V Enhanced Session, VMware,
VirtualBox, SPICE/virt-viewer all have some version of this). In
"seamless"/"integrated" mouse mode, the guest's cursor position is
continuously synced to match the host's physical mouse; a
`SetCursorPos`/`SendInput` call from inside the guest sets the position
correctly (confirmed live: a target at the destination was immediately
clickable), but the *next* host-mouse-driven position sync — which can
be nearly instant — overwrites it right back. This was chased through
three different implementations (`SetCursorPos`, single-jump
`SendInput`, animated `SendInput`) before landing on this explanation;
none behave differently here because they all operate at the same layer
this passthrough sits above and overrides. **No in-guest code change can
fix this** — it needs either switching the VM viewer out of
integrated/seamless mouse mode into captured/exclusive mode (SPICE and
VirtualBox both expose this as a setting), or testing on real,
non-virtualized hardware, where there's no competing mouse-integration
layer to fight. A real end-user install (not viewed through a VM
console) never hits this at all.

## Debugging note: screen-capture exclusion makes the sidebar invisible to naive screenshots

Chasing a "the cursor button does nothing" report, a script-driven
screenshot (`Graphics.CopyFromScreen`, i.e. plain GDI `BitBlt`) of the
region the `sidebar` window's own reported bounds occupied showed
**nothing** — not a stale/wrong window, an actually blank capture, even
with every other window minimized out of the way. Root cause: `lib.rs`'s
`exclude_sidebar_from_capture` calls `SetWindowDisplayAffinity(hwnd,
WDA_EXCLUDEFROMCAPTURE)` on the sidebar window at startup (Windows;
see `STATUS.md`'s 2026-08-31 BL-014 entry) — a deliberate feature so the
sidebar never accidentally appears in a screenshot sent to the vision
API. That flag excludes the window from *any* programmatic capture
(GDI `BitBlt`, `PrintWindow`, `Windows.Graphics.Capture`/DXGI), while
leaving it perfectly visible to an actual human looking at the real
display. **If you're ever debugging this app by scripting a screenshot
of it, this is why the sidebar won't show up — it's not a rendering bug,
it's the capture-exclusion feature working as designed.** Temporarily
commenting out the `exclude_sidebar_from_capture()` call in `lib.rs`'s
setup is the only way to make it screenshot-visible for a debug session;
revert it afterward rather than leaving it disabled, since that
reintroduces the exact problem BL-014 fixed.
