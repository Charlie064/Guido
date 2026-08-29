// Live OS window enumeration + live rect re-query — the `ActiveAppProvider`-
// style backend flagged by docs/decisions/0005-window-anchored-overlay-coordinates.md
// as shared with BL-004 (active-app detection for chat naming/icons). Same
// platform matrix, same provider-interface pattern: one `WindowInfo` shape,
// a per-OS backend module behind it, dispatched by `cfg(target_os)`.
//
// Scope, per the ADR: macOS, Windows, Linux X11 — the "working tier" for
// live window rects. Wayland is out of scope here (native Wayland gives no
// compositor-agnostic way to enumerate windows or their geometry outside
// the wlroots foreign-toplevel protocol, and that protocol doesn't expose
// geometry even where it exists — see the ADR's research section). A
// Wayland session with an X11-capable connection (XWayland) still works
// through the Linux backend below since it talks X11 either way; a Wayland-
// native session with no XWayland just gets list_windows()'s connect error
// surfaced to the caller, same as "no display available."
//
// `id` is what `get_window_rect` re-resolves against later — this is what
// makes the "resizer" problem (docs/decisions/0005…) solvable: a caller
// never trusts a cached x/y/width/height past the moment it asked, it
// re-fetches by `id` right before every capture (see `locate_element` in
// lib.rs).
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WindowInfo {
    pub id: String,
    pub app_name: String,
    pub title: String,
    pub x: i64,
    pub y: i64,
    pub width: i64,
    pub height: i64,
}

pub fn list_windows() -> Result<Vec<WindowInfo>, String> {
    #[cfg(target_os = "macos")]
    {
        macos::list_windows()
    }
    #[cfg(target_os = "windows")]
    {
        windows_backend::list_windows()
    }
    #[cfg(target_os = "linux")]
    {
        linux_x11::list_windows()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Err("window enumeration isn't implemented for this platform".to_string())
    }
}

pub fn get_window_rect(id: &str) -> Result<WindowInfo, String> {
    #[cfg(target_os = "macos")]
    {
        macos::get_window_rect(id)
    }
    #[cfg(target_os = "windows")]
    {
        windows_backend::get_window_rect(id)
    }
    #[cfg(target_os = "linux")]
    {
        linux_x11::get_window_rect(id)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = id;
        Err("window enumeration isn't implemented for this platform".to_string())
    }
}

// The app's own windows ("Tutoria" / "tutoria-region-select", product
// name "tauri-overlay") should never be offered as a pick target — a
// click that lands on the sidebar, or on the now-hidden click-catcher
// itself between hide() and this query landing, shouldn't resolve to us.
fn is_own_window(w: &WindowInfo) -> bool {
    let haystack = format!("{} {}", w.app_name, w.title).to_lowercase();
    haystack.contains("tutoria") || haystack.contains("tauri-overlay")
}

// Resolves a click (in absolute screen px, the same space `WindowInfo`'s
// x/y/width/height are in) to whichever real window is topmost at that
// point — the actual mechanism behind "click the window you want" in
// sidebar.js's window-select flow. Relies on `list_windows()` returning
// front-to-back (topmost-first) order; see each backend's own note on how
// it gets that order for free from its native API.
pub fn window_at_point(x: i64, y: i64) -> Result<WindowInfo, String> {
    list_windows()?
        .into_iter()
        .filter(|w| !is_own_window(w))
        .find(|w| x >= w.x && x < w.x + w.width && y >= w.y && y < w.y + w.height)
        .ok_or_else(|| "no window found at that point".to_string())
}

// ---------- macOS: CGWindowListCopyWindowInfo ----------
//
// Public API, no Accessibility permission needed (unlike AXUIElement) —
// per ADR 0005's research this is the same free path BL-004 wants for
// app-name/icon detection. `kCGWindowListOptionOnScreenOnly` is documented
// as returning windows front-to-back, which is what window_at_point above
// relies on. Declared as a raw extern rather than pulling in
// the `core-graphics` crate's own window-list wrapper, so this doesn't
// depend on that crate's exact const/fn names matching across versions —
// only the framework's own stable C ABI (CGWindowListCopyWindowInfo's
// signature and the kCGWindowList* option bit values are long-stable
// public API, unlike to change).
#[cfg(target_os = "macos")]
mod macos {
    use super::WindowInfo;
    use core_foundation::array::{CFArray, CFArrayRef};
    use core_foundation::base::{CFType, TCFType};
    use core_foundation::dictionary::CFDictionary;
    use core_foundation::number::CFNumber;
    use core_foundation::string::CFString;

    const OPTION_ON_SCREEN_ONLY: u32 = 1 << 0;
    const OPTION_EXCLUDE_DESKTOP_ELEMENTS: u32 = 1 << 4;
    const NULL_WINDOW_ID: u32 = 0;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGWindowListCopyWindowInfo(option: u32, relative_to_window: u32) -> CFArrayRef;
    }

    fn get_num(dict: &CFDictionary<CFString, CFType>, key: &str) -> Option<i64> {
        dict.find(CFString::new(key))
            .and_then(|v| v.downcast::<CFNumber>())
            .and_then(|n| n.to_i64())
    }

    fn get_str(dict: &CFDictionary<CFString, CFType>, key: &str) -> Option<String> {
        dict.find(CFString::new(key))
            .and_then(|v| v.downcast::<CFString>())
            .map(|s| s.to_string())
    }

    fn window_infos() -> Result<Vec<WindowInfo>, String> {
        let options = OPTION_ON_SCREEN_ONLY | OPTION_EXCLUDE_DESKTOP_ELEMENTS;
        let array_ref = unsafe { CGWindowListCopyWindowInfo(options, NULL_WINDOW_ID) };
        if array_ref.is_null() {
            return Err("CGWindowListCopyWindowInfo returned null".to_string());
        }
        let array: CFArray<CFDictionary<CFString, CFType>> =
            unsafe { CFArray::wrap_under_create_rule(array_ref) };

        let mut out = Vec::new();
        for dict in array.iter() {
            // Layer 0 is a normal app window; the menu bar, dock, and
            // other system chrome sit on other layers.
            if get_num(&dict, "kCGWindowLayer").unwrap_or(-1) != 0 {
                continue;
            }
            let owner = get_str(&dict, "kCGWindowOwnerName").unwrap_or_default();
            let title = get_str(&dict, "kCGWindowName").unwrap_or_default();
            let number = get_num(&dict, "kCGWindowNumber").unwrap_or(-1);
            if owner.is_empty() || number < 0 {
                continue;
            }

            let Some(bounds) = dict
                .find(CFString::new("kCGWindowBounds"))
                .and_then(|v| v.downcast::<CFDictionary<CFString, CFType>>())
            else {
                continue;
            };
            let x = get_num(&bounds, "X").unwrap_or(0);
            let y = get_num(&bounds, "Y").unwrap_or(0);
            let width = get_num(&bounds, "Width").unwrap_or(0);
            let height = get_num(&bounds, "Height").unwrap_or(0);
            if width < 40 || height < 40 {
                continue;
            }

            out.push(WindowInfo {
                id: number.to_string(),
                app_name: owner,
                title,
                x,
                y,
                width,
                height,
            });
        }
        Ok(out)
    }

    pub fn list_windows() -> Result<Vec<WindowInfo>, String> {
        window_infos()
    }

    pub fn get_window_rect(id: &str) -> Result<WindowInfo, String> {
        window_infos()?
            .into_iter()
            .find(|w| w.id == id)
            .ok_or_else(|| format!("window {id} is no longer on screen"))
    }
}

// ---------- Windows: EnumWindows + DWM extended frame bounds ----------
//
// DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS) instead of plain
// GetWindowRect: on Windows 10/11 GetWindowRect includes an invisible
// resize-grab border that isn't actually part of what's drawn, so it
// overshoots the real visible bounds — DWM's extended frame bounds is what
// matches what the user actually sees. EnumWindows is documented as
// enumerating in Z order, top window first — window_at_point above relies
// on that for front-to-back ordering.
#[cfg(target_os = "windows")]
mod windows_backend {
    use super::WindowInfo;
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows::Win32::Foundation::{BOOL, CloseHandle, HWND, LPARAM, RECT};
    use windows::Win32::Graphics::Dwm::{DWMWA_EXTENDED_FRAME_BOUNDS, DwmGetWindowAttribute};
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
    };
    use windows::core::PWSTR;

    fn window_rect(hwnd: HWND) -> Option<RECT> {
        let mut rect = RECT::default();
        unsafe {
            DwmGetWindowAttribute(
                hwnd,
                DWMWA_EXTENDED_FRAME_BOUNDS,
                &mut rect as *mut _ as *mut _,
                std::mem::size_of::<RECT>() as u32,
            )
            .ok()?;
        }
        Some(rect)
    }

    fn process_name(hwnd: HWND) -> String {
        unsafe {
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
                return String::new();
            };
            let mut buf = [0u16; 512];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
            let _ = CloseHandle(handle);
            if ok.is_err() {
                return String::new();
            }
            let path = OsString::from_wide(&buf[..len as usize]);
            std::path::Path::new(&path)
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default()
        }
    }

    fn window_title(hwnd: HWND) -> String {
        unsafe {
            let mut buf = [0u16; 512];
            let len = GetWindowTextW(hwnd, &mut buf);
            if len <= 0 {
                return String::new();
            }
            OsString::from_wide(&buf[..len as usize]).to_string_lossy().into_owned()
        }
    }

    extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let out = unsafe { &mut *(lparam.0 as *mut Vec<WindowInfo>) };
        let visible = unsafe { IsWindowVisible(hwnd) }.as_bool();
        if !visible {
            return BOOL(1);
        }
        let title = window_title(hwnd);
        let Some(rect) = window_rect(hwnd) else {
            return BOOL(1);
        };
        let width = (rect.right - rect.left) as i64;
        let height = (rect.bottom - rect.top) as i64;
        if title.is_empty() || width < 40 || height < 40 {
            return BOOL(1);
        }
        out.push(WindowInfo {
            id: (hwnd.0 as isize).to_string(),
            app_name: process_name(hwnd),
            title,
            x: rect.left as i64,
            y: rect.top as i64,
            width,
            height,
        });
        BOOL(1)
    }

    pub fn list_windows() -> Result<Vec<WindowInfo>, String> {
        let mut out: Vec<WindowInfo> = Vec::new();
        unsafe {
            EnumWindows(Some(enum_proc), LPARAM(&mut out as *mut _ as isize))
                .map_err(|e| format!("EnumWindows failed: {e}"))?;
        }
        Ok(out)
    }

    pub fn get_window_rect(id: &str) -> Result<WindowInfo, String> {
        let raw: isize = id.parse().map_err(|e| format!("bad window id {id}: {e}"))?;
        let hwnd = HWND(raw as _);
        let rect = window_rect(hwnd).ok_or_else(|| format!("window {id} no longer exists"))?;
        Ok(WindowInfo {
            id: id.to_string(),
            app_name: process_name(hwnd),
            title: window_title(hwnd),
            x: rect.left as i64,
            y: rect.top as i64,
            width: (rect.right - rect.left) as i64,
            height: (rect.bottom - rect.top) as i64,
        })
    }
}

// ---------- Linux X11: _NET_CLIENT_LIST + geometry ----------
//
// Talks X11 directly (works over XWayland too, whether or not the session
// is actually Wayland) — see ADR 0005; Wayland-native enumeration is
// explicitly out of scope here per the user decision in this change.
#[cfg(target_os = "linux")]
mod linux_x11 {
    use super::WindowInfo;
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::{AtomEnum, ConnectionExt as _};

    fn atom(conn: &impl Connection, name: &str) -> Result<u32, String> {
        conn.intern_atom(false, name.as_bytes())
            .map_err(|e| e.to_string())?
            .reply()
            .map_err(|e| e.to_string())
            .map(|r| r.atom)
    }

    fn get_property_string(conn: &impl Connection, window: u32, prop: u32) -> Option<String> {
        let reply = conn
            .get_property(false, window, prop, AtomEnum::ANY, 0, u32::MAX)
            .ok()?
            .reply()
            .ok()?;
        if reply.value.is_empty() {
            return None;
        }
        Some(String::from_utf8_lossy(&reply.value).trim_end_matches('\0').to_string())
    }

    fn get_property_windows(conn: &impl Connection, window: u32, prop: u32) -> Vec<u32> {
        conn.get_property(false, window, prop, AtomEnum::WINDOW, 0, u32::MAX)
            .ok()
            .and_then(|c| c.reply().ok())
            .and_then(|r| r.value32().map(|it| it.collect()))
            .unwrap_or_default()
    }

    // WM_CLASS is two NUL-terminated strings back to back: instance name,
    // then class name — the class name (second one) is the stable
    // per-app identifier ("Code", "libreoffice-calc"), not the
    // often-generic instance name.
    fn wm_class_name(conn: &impl Connection, window: u32, prop: u32) -> String {
        get_property_string(conn, window, prop)
            .and_then(|raw| raw.split('\0').nth(1).map(|s| s.to_string()))
            .unwrap_or_default()
    }

    fn window_rect(conn: &impl Connection, root: u32, window: u32) -> Option<(i64, i64, i64, i64)> {
        let geom = conn.get_geometry(window).ok()?.reply().ok()?;
        // Geometry is relative to the window's immediate parent (usually
        // a reparenting WM's decoration frame, not the root) — translate
        // to root-relative absolute screen coordinates.
        let translated = conn.translate_coordinates(window, root, 0, 0).ok()?.reply().ok()?;
        Some((translated.dst_x as i64, translated.dst_y as i64, geom.width as i64, geom.height as i64))
    }

    fn connect() -> Result<(x11rb::rust_connection::RustConnection, usize), String> {
        x11rb::connect(None).map_err(|e| format!("no X11 display available: {e}"))
    }

    pub fn list_windows() -> Result<Vec<WindowInfo>, String> {
        let (conn, screen_num) = connect()?;
        let root = conn.setup().roots[screen_num].root;

        // _NET_CLIENT_LIST_STACKING (not plain _NET_CLIENT_LIST, which is
        // in mapping order, not z-order) is bottom-to-top — reversed here
        // so this list is front-to-back, topmost window first. That's what
        // `window_at_point` below needs to resolve a click to the actual
        // topmost window under the cursor when windows overlap; it also
        // makes the setup-view picker list show the frontmost/most-likely
        // window first for free.
        let net_client_list_stacking = atom(&conn, "_NET_CLIENT_LIST_STACKING")?;
        let net_wm_name = atom(&conn, "_NET_WM_NAME")?;
        let wm_class = atom(&conn, "WM_CLASS")?;
        let wm_name: u32 = AtomEnum::WM_NAME.into();

        let mut out = Vec::new();
        let mut windows = get_property_windows(&conn, root, net_client_list_stacking);
        windows.reverse();
        for win in windows {
            let title = get_property_string(&conn, win, net_wm_name)
                .or_else(|| get_property_string(&conn, win, wm_name))
                .unwrap_or_default();
            let app_name = wm_class_name(&conn, win, wm_class);
            let Some((x, y, width, height)) = window_rect(&conn, root, win) else {
                continue;
            };
            if width < 40 || height < 40 {
                continue;
            }
            out.push(WindowInfo {
                id: win.to_string(),
                app_name: if app_name.is_empty() { title.clone() } else { app_name },
                title,
                x,
                y,
                width,
                height,
            });
        }
        Ok(out)
    }

    pub fn get_window_rect(id: &str) -> Result<WindowInfo, String> {
        let (conn, screen_num) = connect()?;
        let root = conn.setup().roots[screen_num].root;
        let win: u32 = id.parse().map_err(|e| format!("bad window id {id}: {e}"))?;

        let net_wm_name = atom(&conn, "_NET_WM_NAME")?;
        let wm_class = atom(&conn, "WM_CLASS")?;
        let wm_name: u32 = AtomEnum::WM_NAME.into();

        let title = get_property_string(&conn, win, net_wm_name)
            .or_else(|| get_property_string(&conn, win, wm_name))
            .unwrap_or_default();
        let app_name = wm_class_name(&conn, win, wm_class);
        let (x, y, width, height) =
            window_rect(&conn, root, win).ok_or_else(|| format!("window {id} no longer exists"))?;

        Ok(WindowInfo {
            id: id.to_string(),
            app_name: if app_name.is_empty() { title.clone() } else { app_name },
            title,
            x,
            y,
            width,
            height,
        })
    }
}
