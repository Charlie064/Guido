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
// geometry even where it exists — see the ADR's research section).
//
// On a Wayland session that is where the story ends: the X11 backend below
// only ever sees XWayland clients, and on a GNOME/KDE desktop where every
// app is Wayland-native that is an *empty list*, not an error — so
// click-to-pick silently resolves to nothing no matter where the user
// clicks. That is why `backend()` exists: Wayland sessions are routed to
// the desktop portal instead (portal_capture.py), where the compositor's
// own picker selects the source and hands back frames directly. macOS and
// Windows keep the native path unchanged.
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

// A decoded app icon: straight (non-premultiplied) RGBA8, row-major.
// Deliberately not PNG bytes — the OS backends each hand back raw pixels
// in their own layout, so encoding is done once, above them, in lib.rs.
pub struct IconImage {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

// The icon the window itself advertises, if any. `Ok(None)` means "this
// app ships no icon we can reach" — a normal outcome (plenty of X11
// clients set no _NET_WM_ICON), not a failure, so the caller falls back
// to a letter avatar rather than showing an error.
pub fn window_icon(id: &str) -> Result<Option<IconImage>, String> {
    #[cfg(target_os = "linux")]
    {
        linux_x11::window_icon(id)
    }
    // macOS (NSRunningApplication.icon via the window's owner pid) and
    // Windows (WM_GETICON / ExtractIconEx off the exe path) are the
    // BL-004 paths and are not wired up yet — reported as "no icon"
    // rather than an error so the picker degrades to the letter avatar
    // instead of surfacing a failure the user can't act on.
    #[cfg(not(target_os = "linux"))]
    {
        let _ = id;
        Ok(None)
    }
}

// An icon found by name rather than extracted from a window. `data_uri`
// is ready for an <img src>; `source` is the file it came from, for
// logging when a lookup picks something surprising.
pub struct FoundIcon {
    pub data_uri: String,
    pub source: String,
}

// The app's icon looked up from its *name* alone, with no window
// involved. This is the path that makes icons work on Wayland at all: the
// portal never hands back a window to extract from, so once identify_app
// has read the app's name off the pixels (see identify_app.py) this is
// what turns that name into a picture. It's also how a chat saved months
// ago still shows an icon.
//
// Freedesktop only: macOS and Windows have their own by-name lookups
// (LaunchServices, the Start-menu shortcut's exe) and neither is written
// yet — reported as "no icon" so the caller draws a letter avatar.
pub fn icon_for_app_name(app_name: &str) -> Result<Option<FoundIcon>, String> {
    #[cfg(target_os = "linux")]
    {
        freedesktop_icons::icon_for_app_name(app_name)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = app_name;
        Ok(None)
    }
}

// Which pick-and-capture strategy this session actually supports.
//
// `Native`: windows can be enumerated and given live screen rects, so the
// app drives the gesture itself (click-to-pick) and crops a full-screen
// grab to the window's current rect.
// `Portal`: nothing can be enumerated; the compositor's picker chooses the
// source and the frame *is* the scope, so there are no screen coordinates
// to re-resolve and nothing to crop.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Backend {
    Native,
    Portal,
}

// Keyed off the session type rather than "did the X11 query return
// anything", because a Wayland session with one stray XWayland app would
// otherwise report Native and then be able to see only that one app —
// and, more decisively, screen *capture* is broken there too (mss is
// X11-only and grim needs wlr-screencopy), so the portal is the only
// working path even when a rect is technically obtainable.
pub fn backend() -> Backend {
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("WAYLAND_DISPLAY").is_some() {
            return Backend::Portal;
        }
    }
    Backend::Native
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

            // core-foundation 0.10 only implements ConcreteCFType for the
            // untyped CFDictionary, not CFDictionary<CFString, CFType>.
            // Downcast untyped, then re-wrap as typed so get_num works.
            let Some(bounds_untyped) = dict
                .find(CFString::new("kCGWindowBounds"))
                .and_then(|v| v.downcast::<CFDictionary>())
            else {
                continue;
            };
            let bounds: CFDictionary<CFString, CFType> = unsafe {
                CFDictionary::wrap_under_get_rule(bounds_untyped.as_concrete_TypeRef())
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
        // An empty list here is not "nothing is open" — it means no client
        // is registered with X11 at all, i.e. every app is Wayland-native.
        // Reported as an error so a caller can never mistake it for a
        // successful enumeration that just happened to find nothing.
        if out.is_empty() {
            return Err("no X11 windows found — this looks like a Wayland-native \
                        session, where windows can't be enumerated; use the \
                        portal capture path instead"
                .to_string());
        }
        Ok(out)
    }

    // _NET_WM_ICON is the icon the client hands the window manager, so it
    // needs no icon-theme lookup, no .desktop-file resolution and no
    // filesystem access — the pixels are already sitting on the window we
    // just picked. (The .desktop route in BL-004 is the fallback for apps
    // that set no _NET_WM_ICON; not built yet.)
    //
    // Wire format is one flat CARDINAL array holding *several* sizes back
    // to back: width, height, then width*height pixels, repeated. Each
    // pixel is ARGB packed in the low 32 bits, alpha not premultiplied.
    const ICON_TARGET_PX: u32 = 64;

    pub fn window_icon(id: &str) -> Result<Option<super::IconImage>, String> {
        let (conn, _) = connect()?;
        let win: u32 = id.parse().map_err(|e| format!("bad window id {id}: {e}"))?;
        let net_wm_icon = atom(&conn, "_NET_WM_ICON")?;

        let reply = conn
            .get_property(false, win, net_wm_icon, AtomEnum::CARDINAL, 0, u32::MAX)
            .map_err(|e| e.to_string())?
            .reply()
            .map_err(|e| e.to_string())?;
        let Some(values) = reply.value32() else {
            return Ok(None);
        };
        Ok(decode_net_wm_icon(&values.collect::<Vec<u32>>()))
    }

    fn decode_net_wm_icon(data: &[u32]) -> Option<super::IconImage> {
        // Walk the concatenated sizes and keep the best one: the smallest
        // that still meets the display size, so nothing is ever upscaled,
        // falling back to the largest available when every icon is small.
        let mut best: Option<(u32, u32, usize)> = None;
        let mut i = 0usize;
        while i + 2 <= data.len() {
            let (w, h) = (data[i], data[i + 1]);
            let pixels = (w as usize) * (h as usize);
            let start = i + 2;
            if w == 0 || h == 0 || start + pixels > data.len() {
                break;
            }
            best = Some(match best {
                None => (w, h, start),
                Some(cur) => {
                    let better = if cur.0 >= ICON_TARGET_PX {
                        w >= ICON_TARGET_PX && w < cur.0
                    } else {
                        w > cur.0
                    };
                    if better { (w, h, start) } else { cur }
                }
            });
            i = start + pixels;
        }

        let (width, height, start) = best?;
        let mut rgba = Vec::with_capacity((width as usize) * (height as usize) * 4);
        for px in &data[start..start + (width as usize) * (height as usize)] {
            rgba.extend_from_slice(&[(px >> 16) as u8, (px >> 8) as u8, *px as u8, (px >> 24) as u8]);
        }
        Some(super::IconImage { width, height, rgba })
    }

    #[cfg(test)]
    mod tests {
        use super::decode_net_wm_icon;

        fn size(w: u32, h: u32, fill: u32) -> Vec<u32> {
            let mut v = vec![w, h];
            v.extend(std::iter::repeat(fill).take((w * h) as usize));
            v
        }

        #[test]
        fn picks_smallest_size_at_or_above_the_target() {
            let mut data = size(16, 16, 0);
            data.extend(size(128, 128, 0));
            data.extend(size(64, 64, 0));
            assert_eq!(decode_net_wm_icon(&data).unwrap().width, 64);
        }

        #[test]
        fn falls_back_to_the_largest_when_all_are_small() {
            let mut data = size(16, 16, 0);
            data.extend(size(32, 32, 0));
            assert_eq!(decode_net_wm_icon(&data).unwrap().width, 32);
        }

        #[test]
        fn unpacks_argb_into_straight_rgba() {
            let icon = decode_net_wm_icon(&size(1, 1, 0x80_11_22_33)).unwrap();
            assert_eq!(icon.rgba, vec![0x11, 0x22, 0x33, 0x80]);
        }

        // A property truncated by the server (or simply malformed) must
        // not be read past its end — the last header is dropped instead.
        #[test]
        fn ignores_a_size_whose_pixels_are_truncated() {
            let mut data = size(16, 16, 0);
            data.extend([64, 64, 0, 0]);
            assert_eq!(decode_net_wm_icon(&data).unwrap().width, 16);
        }

        #[test]
        fn empty_property_yields_no_icon() {
            assert!(decode_net_wm_icon(&[]).is_none());
        }
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

// ---------- Linux: icons by app name, from desktop entries ----------
//
// The freedesktop story in two hops: a `.desktop` entry maps a
// human-readable `Name=` to a themed icon name, and the icon theme maps
// that name to a file on disk. Both hops are plain directory scans of
// well-known paths — no D-Bus, no toolkit, nothing that needs a display
// connection, which matters because this runs off the main thread while
// the sidebar is hidden.
//
// Deliberately not using GTK's own `IconTheme` even though gtk is already
// a dependency: those calls must happen on the GTK main thread, and this
// lookup is called from a blocking task pool.
#[cfg(target_os = "linux")]
mod freedesktop_icons {
    use super::FoundIcon;
    use std::path::{Path, PathBuf};

    // Comparison form for app names, so "Microsoft Excel", "microsoft-excel"
    // and "MicrosoftExcel" all meet. The vision model writes product names
    // as a person would ("Visual Studio Code"), desktop entries are written
    // however each vendor felt ("Visual Studio Code", "Code - OSS"), and an
    // X11 WM_CLASS is a third convention again — normalising is what lets
    // one lookup serve all three sources.
    fn normalize(s: &str) -> String {
        s.chars().filter(|c| c.is_alphanumeric()).flat_map(|c| c.to_lowercase()).collect()
    }

    fn data_dirs() -> Vec<PathBuf> {
        let mut dirs: Vec<PathBuf> = Vec::new();
        if let Some(home) = std::env::var_os("HOME") {
            let home = PathBuf::from(home);
            dirs.push(home.join(".local/share"));
            dirs.push(home.join(".local/share/flatpak/exports/share"));
        }
        if let Some(xdg) = std::env::var_os("XDG_DATA_DIRS") {
            dirs.extend(std::env::split_paths(&xdg));
        }
        // The spec's defaults, for a session that sets no XDG_DATA_DIRS.
        dirs.push(PathBuf::from("/usr/local/share"));
        dirs.push(PathBuf::from("/usr/share"));
        dirs.push(PathBuf::from("/var/lib/flatpak/exports/share"));
        dirs.retain(|d| d.is_dir());
        dirs.dedup();
        dirs
    }

    // One desktop entry's two fields of interest. `name` is what the user
    // would call the app; `icon` is a themed icon name or an absolute path.
    struct Entry {
        name: String,
        icon: String,
    }

    fn parse_entry(path: &Path) -> Option<Entry> {
        let text = std::fs::read_to_string(path).ok()?;
        let mut name = None;
        let mut icon = None;
        let mut in_desktop_entry = false;
        for line in text.lines() {
            let line = line.trim();
            if line.starts_with('[') {
                // Only the main group describes the app itself; the
                // "Desktop Action ..." groups below it have their own
                // Name=/Icon= for right-click menu items ("New Window"),
                // which must not be mistaken for the app's.
                in_desktop_entry = line == "[Desktop Entry]";
                continue;
            }
            if !in_desktop_entry {
                continue;
            }
            // Unlocalised keys only: `Name[de]=` would otherwise overwrite
            // `Name=` depending on file order.
            if let Some(v) = line.strip_prefix("Name=") {
                name.get_or_insert_with(|| v.trim().to_string());
            } else if let Some(v) = line.strip_prefix("Icon=") {
                icon.get_or_insert_with(|| v.trim().to_string());
            } else if line == "NoDisplay=true" || line == "Hidden=true" {
                return None;
            }
        }
        Some(Entry { name: name?, icon: icon? })
    }

    // Higher is better; None means "not this app at all". Exact beats
    // prefix beats containment, so a query for "Code" prefers the entry
    // actually named Code over "Code - OSS" or "QR Code Generator".
    fn score(query: &str, entry_name: &str, file_stem: &str) -> Option<u32> {
        let q = normalize(query);
        if q.is_empty() {
            return None;
        }
        let n = normalize(entry_name);
        let stem = normalize(file_stem);
        if n == q || stem == q {
            return Some(100);
        }
        if stem.ends_with(&q) || n.starts_with(&q) {
            return Some(80);
        }
        // Only in this direction: an entry whose name contains the query
        // ("Microsoft Excel" for "Excel") is a plausible hit, whereas the
        // reverse would match every short entry name against a long query.
        if n.contains(&q) {
            return Some(60);
        }
        None
    }

    fn find_entry(app_name: &str) -> Option<Entry> {
        let mut best: Option<(u32, Entry)> = None;
        for dir in data_dirs() {
            let Ok(read) = std::fs::read_dir(dir.join("applications")) else {
                continue;
            };
            for item in read.flatten() {
                let path = item.path();
                if path.extension().and_then(|e| e.to_str()) != Some("desktop") {
                    continue;
                }
                let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
                let Some(entry) = parse_entry(&path) else {
                    continue;
                };
                let Some(s) = score(app_name, &entry.name, stem) else {
                    continue;
                };
                if best.as_ref().is_none_or(|(bs, _)| s > *bs) {
                    best = Some((s, entry));
                }
            }
        }
        best.map(|(_, e)| e)
    }

    fn mime_for(path: &Path) -> Option<&'static str> {
        match path.extension().and_then(|e| e.to_str()) {
            Some("png") => Some("image/png"),
            Some("svg") | Some("svgz") => Some("image/svg+xml"),
            // .xpm is the other thing found in /usr/share/pixmaps and no
            // browser renders it, so it's not worth inlining.
            _ => None,
        }
    }

    // How good a candidate file is: PNGs are ranked by how close they are
    // to the 40px the chat rows draw at without going under it, and an SVG
    // outranks every PNG because it's resolution-independent.
    fn rank(path: &Path) -> u32 {
        if mime_for(path) == Some("image/svg+xml") {
            return 1000;
        }
        let size = path
            .components()
            .filter_map(|c| c.as_os_str().to_str())
            .filter_map(|s| s.split('x').next().and_then(|n| n.parse::<u32>().ok()))
            .max()
            .unwrap_or(0);
        if size >= 40 {
            // Prefer the smallest that still covers the display size, so
            // nothing is ever upscaled (the same rule the _NET_WM_ICON
            // decoder uses).
            900_u32.saturating_sub(size)
        } else {
            size
        }
    }

    fn search_dir(dir: &Path, stem: &str, depth: u32, best: &mut Option<(u32, PathBuf)>) {
        if depth == 0 {
            return;
        }
        let Ok(read) = std::fs::read_dir(dir) else {
            return;
        };
        for item in read.flatten() {
            let path = item.path();
            let Ok(kind) = item.file_type() else { continue };
            if kind.is_dir() {
                search_dir(&path, stem, depth - 1, best);
            } else if path.file_stem().and_then(|s| s.to_str()) == Some(stem)
                && mime_for(&path).is_some()
            {
                let r = rank(&path);
                if best.as_ref().is_none_or(|(br, _)| r > *br) {
                    *best = Some((r, path));
                }
            }
        }
    }

    fn resolve_icon(icon: &str) -> Option<PathBuf> {
        // An entry may name an absolute path instead of a themed name.
        let direct = Path::new(icon);
        if direct.is_absolute() && direct.is_file() && mime_for(direct).is_some() {
            return Some(direct.to_path_buf());
        }

        let mut best: Option<(u32, PathBuf)> = None;
        for dir in data_dirs() {
            // Depth 4 covers the whole spec layout
            // (icons/<theme>/<size>/<category>/<file>) without walking into
            // anything deeper by accident.
            search_dir(&dir.join("icons"), icon, 4, &mut best);
            search_dir(&dir.join("pixmaps"), icon, 2, &mut best);
        }
        best.map(|(_, p)| p)
    }

    pub fn icon_for_app_name(app_name: &str) -> Result<Option<FoundIcon>, String> {
        let Some(entry) = find_entry(app_name) else {
            return Ok(None);
        };
        let Some(path) = resolve_icon(&entry.icon) else {
            return Ok(None);
        };
        let Some(mime) = mime_for(&path) else {
            return Ok(None);
        };
        let bytes = std::fs::read(&path).map_err(|e| format!("couldn't read {}: {e}", path.display()))?;

        use base64::Engine;
        Ok(Some(FoundIcon {
            data_uri: format!(
                "data:{mime};base64,{}",
                base64::engine::general_purpose::STANDARD.encode(&bytes)
            ),
            source: path.display().to_string(),
        }))
    }
}

// Exercises the by-name lookup against whatever this machine actually has
// installed rather than a fixture: the thing being tested is the walk over
// real freedesktop directories, and a fixture tree would only prove the
// walker can read a tree we wrote ourselves. Skips (rather than fails) on
// a machine with no desktop entries at all, so it stays green in CI.
#[cfg(all(test, target_os = "linux"))]
mod freedesktop_icon_tests {
    #[test]
    fn finds_an_icon_for_some_installed_app() {
        let candidates = ["Firefox", "Files", "Text Editor", "Terminal", "Settings"];
        let mut found = 0;
        for name in candidates {
            if let Ok(Some(icon)) = super::icon_for_app_name(name) {
                assert!(icon.data_uri.starts_with("data:image/"), "{name}: {}", icon.source);
                assert!(icon.data_uri.len() > 200, "{name}: suspiciously small icon");
                found += 1;
                eprintln!("{name} -> {}", icon.source);
            }
        }
        if std::path::Path::new("/usr/share/applications").is_dir() {
            assert!(found > 0, "no icon found for any of {candidates:?}");
        }
    }

    #[test]
    fn unknown_app_is_none_not_an_error() {
        let r = super::icon_for_app_name("Definitely Not An Installed Application 9000");
        assert!(matches!(r, Ok(None)), "{r:?}", r = r.map(|o| o.map(|i| i.source)));
    }
}
