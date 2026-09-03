# Manual per-platform test matrix

**Contract**
- No automated UI test suite exists yet (`docs/workflows/development.md`:
  "verification is manual"). This file is the checklist of which
  platform-specific behaviors still need a human to actually run them,
  since a change verified on one OS routinely isn't verified on the
  others — several rows below shipped on Windows while still unverified
  on macOS, per `STATUS.md`.
- Update a row's status the same session you actually run the check —
  don't mark something verified from reading the code.
- Status values: ✅ Verified (date) — a human ran it on real hardware.
  ❓ Written, unverified — code exists for that platform but nobody has
  run it there. ❌ Not implemented — no code path for that platform.
  🚫 Out of scope — deliberately not supported (see the linked doc).

## Windows / macOS / Linux X11 / Linux Wayland

| Feature | Windows | macOS | Linux X11 | Linux Wayland | Notes |
| --- | --- | --- | --- | --- | --- |
| OS-level cursor movement (`cursor_control.rs`) | ❓ — position confirmed correct, visible-cursor experience blocked by the *test VM's* mouse integration (see notes) | ❓ | ❓ | ❓ | `move_cursor` command, manual "cursor" test button in the top bar (`sidebar.js`'s `#bar-cursor-test`), moves the real OS cursor to the *primary* monitor's center. **Windows, 2026-09-03**: the tracked position genuinely moves — confirmed by clicking something at the destination immediately after (an Inkscape canvas element got selected) — across three implementations (`SetCursorPos`, single-jump `SendInput`, animated `SendInput`). But the *visible* cursor sprite never appeared to move for the user, and specifically reverted the instant their real mouse was touched — that's the signature of the VM's mouse integration/passthrough continuously re-syncing the guest cursor to the host's physical mouse, a layer no in-guest code can override (see features/cursor-control.md's debugging note). Needs either a non-integrated/captured mouse mode in the VM viewer, or real non-virtualized hardware, to actually verify the visible behavior — not a code fix. macOS/Linux are "written, not run yet," not follow-up work — their implementations weren't touched by the Windows work. Linux Wayland has no compositor-agnostic warp API outside the RemoteDesktop portal (not wired up), so this is expected to keep failing there even once X11 is confirmed. **If verifying this by scripting a screenshot rather than watching the real display, read features/cursor-control.md's other debugging note first** — the sidebar window is invisible to any programmatic capture by design (`WDA_EXCLUDEFROMCAPTURE`), which looks exactly like "the app isn't there" but isn't a bug. |
| Mini rail: undecorated window + drag-region move (`setMiniRailWindowState`, `.mini-rail-swipe-handle`) | ❓ | ❓ | ❓ | ❓ | `setDecorations(false)`/`data-tauri-drag-region` are both plain cross-platform Tauri APIs (no per-OS code), but `startDragging()`-via-drag-region specifically had reliability problems on GNOME/Wayland for the full sidebar window in the past (see STATUS.md's 2026-08 GNOME history) before that window went back to a native titlebar for dragging — this reintroduces the same mechanism, just scoped to the small always-on-top mini rail instead. Worth checking Linux first among the non-Windows platforms for that reason. |
| Window enumeration / click-to-pick (`window_provider.rs`) | ✅ 2026-08-31 | ❓ | ✅ (XWayland smoke test) | 🚫 routed to portal picker instead ([ADR 0007](../decisions/0007-portal-capture-backend-wayland.md)) | See ADR 0005. macOS backend written, never built/run — no macOS hardware in the dev environment that authored it. |
| Real on-screen overlay (highlight box drawn on the actual screen) | ❓ exercised during the 2026-08-31 pass, box placement not explicitly reconfirmed since | ❓ | ❓ | 🚫 portal never discloses window screen position ([ADR 0006](../decisions/0006-restore-real-on-screen-overlay.md)) | Check in particular: box lands on the right element, tracks a moved/resized window (200ms poll), is genuinely click-through, and isn't offset on a HiDPI/fractional-scaling display. |
| Sidebar excluded from capture at the OS level (`exclude_sidebar_from_capture`) | ✅ 2026-08-31 (`SetWindowDisplayAffinity`) | ❓ (`NSWindow.setSharingType`, written against an established pattern, not run) | 🚫 no such API for an ordinary client on Wayland; still uses hide/show around each capture (`BL-014`) | 🚫 same as X11 | |
| Window/app icon extraction (`window_icon`) | ✅ (wired 2026-09-02, confirmed against real apps) | ❌ unwritten — always reports "no icon" (`BL-004`) | ❓ code path exists, never run against a real X11 window with an icon (dev box is Wayland-native) | 🚫 uses the freedesktop by-*name* lookup instead (`icon_for_app_name`), not a live window | |
| Portal screen/window capture (`portal_capture.py`) | 🚫 n/a (native path used instead) | 🚫 n/a | 🚫 n/a | ✅ GNOME/KDE portal path (2026-08 pass); wlroots (`grim`) compositors (Sway/Hyprland) written but not recently re-confirmed | See ADR 0007 and `docs/workflows/development.md`'s Wayland compositor breakdown. |
| Auto-updater install/relaunch | ❓ | ❓ | ❓ | ❓ | Signed release artifacts exist from `v0.1.1`+ (`docs/workflows/development.md`'s "Auto-update" section); nobody has confirmed a live install actually detects and applies an update on any platform. |

## Before checking off a row

- Note the exact build (git SHA or version tag) and real hardware/VM used,
  not just "Windows" — see `docs/workflows/development.md`'s Windows-VM
  setup notes for a repeatable way to test that platform without physical
  hardware. macOS has no such shortcut (Apple's EULA blocks a local VM);
  either real Mac hardware or an hourly cloud Mac rental is needed.
- A ✅ on one Linux desktop (e.g. GNOME/Wayland) does not cover another
  (Sway/Hyprland, or X11 proper) — the capture backend alone branches
  three ways there (see `docs/workflows/development.md`).
- Add a new row here whenever a feature grows a `cfg(target_os)` branch
  (or an equivalent per-platform code path) — that's the signal it
  belongs in this file, per `CLAUDE.md`'s co-change rule.
- **On Windows/macOS, a scripted screenshot of the sidebar window will
  show nothing, by design** — `exclude_sidebar_from_capture` in `lib.rs`
  excludes it from every programmatic capture API so it never leaks into
  a screenshot sent to the vision model. This has nothing to do with
  whether the app is actually rendering correctly for a human looking at
  the real screen. See [features/cursor-control.md](../features/cursor-control.md)'s
  debugging note for how this was actually discovered (chasing what
  looked like a rendering bug that wasn't one). Verify by eye, or by
  temporarily commenting out that call, not by scripting a capture and
  trusting a blank result.
