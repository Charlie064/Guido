// OS-level cursor positioning — warps the real system mouse cursor to an
// absolute screen coordinate. Same shape as window_provider.rs (see its
// module comment): one public dispatch function, a `cfg(target_os)` block
// per platform, each platform's OS calls kept in their own submodule.
//
// This is the first piece of Do-mode's "computer does the click" path
// (docs/decisions/0002-agency-hybrid-vision-platform-business.md) — for now
// just cursor placement, wired to a manual test button in the UI
// (sidebar.js's cursor-test button) rather than anything driven by a plan
// step yet. See docs/features/cursor-control.md for the fuller writeup.
//
// **Animated, not a single jump** (2026-09-03 review): a plain one-shot
// move landed the *tracked* cursor position correctly (confirmed — a
// target under it was genuinely clickable afterward) but the *visible*
// cursor sprite never appeared to move in the environment this was
// tested in, which reads exactly like nothing happened. A real mouse (or
// any automation tool moving one) produces a stream of small position
// updates, not one teleport; several remote-display/VM cursor-rendering
// stacks specifically redraw in response to that stream rather than a
// single absolute jump. Animating over a short series of steps is also
// just better UX on its own regardless of that theory — the user can
// track where the cursor is actually going, the same principle
// `planning/minimal-step-mode.md`'s Teach-mode cursor *indicator*
// already uses, just applied to the real OS cursor here instead of a
// CSS element.
pub fn move_cursor(x: i32, y: i32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        animate(windows_backend::get_cursor_position, windows_backend::move_cursor_immediate, x, y)
    }
    #[cfg(target_os = "macos")]
    {
        animate(macos::get_cursor_position, macos::move_cursor_immediate, x, y)
    }
    #[cfg(target_os = "linux")]
    {
        // Not the shared `animate()` above: Windows/macOS's primitives are
        // direct syscalls, cheap to call once per step, but X11's aren't —
        // connecting fresh for each of ~24 steps would spend most of the
        // animation's time budget on connection setup instead of actually
        // moving the pointer. linux_x11::move_animated opens one
        // connection and reuses it for the whole sequence instead.
        linux_x11::move_animated(x, y, ANIMATION_STEPS, ANIMATION_DURATION_MS)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        let _ = (x, y);
        Err("cursor movement is not implemented on this platform".to_string())
    }
}

// Shared across all three platforms so the animation feel (step count,
// duration, easing) can't drift between them — only the two primitives
// (read the current position, jump to an exact one) are per-OS.
const ANIMATION_STEPS: u32 = 24;
const ANIMATION_DURATION_MS: u64 = 260;

fn animate(
    get_position: impl Fn() -> Result<(i32, i32), String>,
    move_immediate: impl Fn(i32, i32) -> Result<(), String>,
    target_x: i32,
    target_y: i32,
) -> Result<(), String> {
    let (start_x, start_y) = get_position()?;
    let step_delay = std::time::Duration::from_millis(ANIMATION_DURATION_MS / ANIMATION_STEPS as u64);
    for step in 1..=ANIMATION_STEPS {
        // Cubic ease-out: fast start, gentle settle into the target,
        // instead of a constant-velocity slide that looks robotic.
        let t = step as f64 / ANIMATION_STEPS as f64;
        let eased = 1.0 - (1.0 - t).powi(3);
        let x = start_x + ((target_x - start_x) as f64 * eased).round() as i32;
        let y = start_y + ((target_y - start_y) as f64 * eased).round() as i32;
        move_immediate(x, y)?;
        if step < ANIMATION_STEPS {
            std::thread::sleep(step_delay);
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
mod windows_backend {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_MOVE, MOUSEEVENTF_VIRTUALDESK, MOUSEINPUT, SendInput,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetCursorPos, GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
    };

    pub fn get_cursor_position() -> Result<(i32, i32), String> {
        let mut p = POINT::default();
        unsafe { GetCursorPos(&mut p) }.map_err(|e| format!("GetCursorPos failed: {e}"))?;
        Ok((p.x, p.y))
    }

    // Was the whole public API before animation was added (2026-09-03) —
    // see the module-level doc comment on why a single jump wasn't
    // enough on its own. SendInput over SetCursorPos: synthesizes a real
    // input-pipeline event (what an actual mouse and every automation
    // tool use) rather than poking the tracked position directly, more
    // likely to be honored by whatever's actually rendering the cursor
    // for a remote/virtual session — confirmed SetCursorPos itself
    // wasn't the issue via direct SetCursorPos+GetCursorPos testing
    // before switching.
    pub fn move_cursor_immediate(x: i32, y: i32) -> Result<(), String> {
        // SendInput's absolute mode takes coordinates normalized to
        // 0..=65535 across the *virtual* screen (all monitors combined,
        // which can start at a negative origin) when MOUSEEVENTF_VIRTUALDESK
        // is set — not the primary monitor alone, so this stays correct
        // for a target on a secondary display too.
        let (vx, vy, vw, vh) = unsafe {
            (
                GetSystemMetrics(SM_XVIRTUALSCREEN),
                GetSystemMetrics(SM_YVIRTUALSCREEN),
                GetSystemMetrics(SM_CXVIRTUALSCREEN),
                GetSystemMetrics(SM_CYVIRTUALSCREEN),
            )
        };
        if vw <= 1 || vh <= 1 {
            return Err(format!("GetSystemMetrics returned an unusable virtual screen size ({vw}x{vh})"));
        }
        let norm_x = ((x - vx) as i64 * 65535 / (vw - 1) as i64) as i32;
        let norm_y = ((y - vy) as i64 * 65535 / (vh - 1) as i64) as i32;

        let input = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: norm_x,
                    dy: norm_y,
                    mouseData: 0,
                    dwFlags: MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        let sent = unsafe { SendInput(&[input], std::mem::size_of::<INPUT>() as i32) };
        if sent != 1 {
            return Err(format!("SendInput reported {sent} of 1 events sent (GetLastError: {:?})", unsafe {
                windows::Win32::Foundation::GetLastError()
            }));
        }
        Ok(())
    }
}

// Declared as raw externs against CoreGraphics'/CoreFoundation's own
// stable C ABI, same approach window_provider.rs's
// CGWindowListCopyWindowInfo takes — avoids depending on the
// `core-graphics` crate (not in the dependency tree) for a couple of
// functions and one struct. Unverified — no Mac hardware in the
// environment that wrote this; see docs/testing/manual-test-matrix.md.
#[cfg(target_os = "macos")]
mod macos {
    #[repr(C)]
    struct CGPoint {
        x: f64,
        y: f64,
    }

    // Opaque handles — never dereferenced on the Rust side, only passed
    // between CoreGraphics calls and released when done.
    enum CGEventOpaque {}
    type CGEventRef = *mut CGEventOpaque;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGWarpMouseCursorPosition(new_cursor_position: CGPoint) -> i32; // CGError
        fn CGEventCreate(source: *mut std::ffi::c_void) -> CGEventRef;
        fn CGEventGetLocation(event: CGEventRef) -> CGPoint;
        fn CFRelease(cf: CGEventRef);
    }

    pub fn get_cursor_position() -> Result<(i32, i32), String> {
        // A NULL event source reads the current system event state
        // (which includes the cursor location) rather than needing a
        // real input event to inspect — this is the documented pattern
        // for "where is the cursor right now" via Quartz Event Services.
        let event = unsafe { CGEventCreate(std::ptr::null_mut()) };
        if event.is_null() {
            return Err("CGEventCreate returned null".to_string());
        }
        let point = unsafe { CGEventGetLocation(event) };
        unsafe { CFRelease(event) };
        Ok((point.x as i32, point.y as i32))
    }

    pub fn move_cursor_immediate(x: i32, y: i32) -> Result<(), String> {
        let err = unsafe {
            CGWarpMouseCursorPosition(CGPoint {
                x: x as f64,
                y: y as f64,
            })
        };
        if err != 0 {
            return Err(format!("CGWarpMouseCursorPosition returned CGError {err}"));
        }
        Ok(())
    }
}

// XWarpPointer via core xproto (no XTest extension needed) — passing NONE as
// the source window and the root window as the destination makes dst_x/dst_y
// absolute screen coordinates, the same trick xdotool's `mousemove` uses.
// query_pointer (also core xproto) reads root_x/root_y back the same way.
#[cfg(target_os = "linux")]
mod linux_x11 {
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::ConnectionExt as _;
    use x11rb::NONE;

    fn connect() -> Result<(x11rb::rust_connection::RustConnection, usize), String> {
        x11rb::connect(None).map_err(|e| format!("no X11 display available: {e}"))
    }

    // One connection for the whole animated sequence — see the comment
    // at this function's call site in move_cursor for why (X11 connection
    // setup is real overhead, not something to pay ~24 times per move).
    pub fn move_animated(target_x: i32, target_y: i32, steps: u32, duration_ms: u64) -> Result<(), String> {
        let (conn, screen_num) = connect()?;
        let root = conn.setup().roots[screen_num].root;

        let pointer_reply = conn
            .query_pointer(root)
            .map_err(|e| format!("XQueryPointer failed: {e}"))?
            .reply()
            .map_err(|e| format!("XQueryPointer failed: {e}"))?;
        let (start_x, start_y) = (pointer_reply.root_x as i32, pointer_reply.root_y as i32);

        let step_delay = std::time::Duration::from_millis(duration_ms / steps as u64);
        for step in 1..=steps {
            let t = step as f64 / steps as f64;
            let eased = 1.0 - (1.0 - t).powi(3);
            let x = start_x + ((target_x - start_x) as f64 * eased).round() as i32;
            let y = start_y + ((target_y - start_y) as f64 * eased).round() as i32;
            conn.warp_pointer(NONE, root, 0, 0, 0, 0, x as i16, y as i16)
                .map_err(|e| format!("XWarpPointer failed: {e}"))?
                .check()
                .map_err(|e| format!("XWarpPointer failed: {e}"))?;
            conn.flush().map_err(|e| format!("X11 flush failed: {e}"))?;
            if step < steps {
                std::thread::sleep(step_delay);
            }
        }
        Ok(())
    }
}
