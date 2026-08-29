use std::process::Command;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
struct Box2D {
    x0: i64,
    y0: i64,
    x1: i64,
    y1: i64,
    image_width: i64,
    image_height: i64,
}

// A user-drawn capture region in absolute screen px, or omitted for full
// screen. See docs/decisions/0003-capture-region-not-window-detection.md.
#[derive(Serialize, Deserialize, Debug)]
struct Region {
    x: i64,
    y: i64,
    width: i64,
    height: i64,
}

// vision-detect lives at spikes/vision-detect, a sibling of this crate's
// grandparent dir (spikes/tauri-overlay/src-tauri) — resolved from
// CARGO_MANIFEST_DIR so it doesn't depend on the process's cwd.
fn vision_detect_dir() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("vision-detect")
}

// sidebar is the only real (non-click-through) window now — but a screen
// *capture* still shouldn't see it, since it'd otherwise show up in the
// exact frame sent to the vision model. Hiding it here, right around the
// capture, rather than leaving it to each JS call site, keeps every caller
// of this command correct automatically. show() runs even if capture/
// locate fails, so a crashed call can't leave the sidebar permanently
// hidden.
#[tauri::command]
fn locate_element(app: tauri::AppHandle, target: String, region: Option<Region>) -> Result<Box2D, String> {
    use tauri::Manager;

    let sidebar = app
        .get_webview_window("sidebar")
        .expect("\"sidebar\" window declared in tauri.conf.json must exist");
    sidebar.hide().map_err(|e| format!("failed to hide sidebar before capture: {e}"))?;

    let result = run_locate(&target, &region);

    sidebar.show().map_err(|e| format!("failed to re-show sidebar after capture: {e}"))?;

    result
}

// Tauri's own setSize doesn't take effect on this window: once promoted
// to a wlr-layer-shell surface (see init_layer_shell), a resize while
// mapped is ignored (confirmed by logging gtk_window.size() immediately
// after resize() — it never changes while the surface stays shown).
// Un-mapping first, resizing, then re-showing is what actually reaches
// the compositor (confirmed via `hyprctl layers` reporting the new size)
// — apparently this surface only re-negotiates size as part of the
// map/configure sequence, not on an arbitrary live resize. This briefly
// hides the panel on every collapse/expand; acceptable since it's near
// instant and there's nothing to visually preserve mid-transition.
//
// GTK calls are not thread-safe, and #[tauri::command] handlers do not
// run on the main/GTK thread — calling gtk_window.resize() etc. directly
// from here crashed intermittently (a real, observed crash, not a
// hypothetical one). run_on_main_thread + a channel to wait for
// completion is what makes this safe, mirroring why Tauri's own
// window.hide()/show() (used elsewhere in this file) don't need this:
// they already dispatch internally, but raw gtk::Window methods don't.
#[tauri::command]
fn resize_sidebar(app: tauri::AppHandle, width: u32, height: u32) -> Result<(), String> {
    use tauri::Manager;

    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();

    app.clone().run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            let sidebar = app
                .get_webview_window("sidebar")
                .expect("\"sidebar\" window declared in tauri.conf.json must exist");

            #[cfg(target_os = "linux")]
            {
                use gtk::prelude::GtkWindowExt;

                let gtk_window = sidebar
                    .gtk_window()
                    .map_err(|e| format!("failed to get sidebar's GtkWindow: {e}"))?;
                sidebar.hide().map_err(|e| format!("failed to hide sidebar for resize: {e}"))?;
                gtk_window.set_default_size(width as i32, height as i32);
                gtk_window.resize(width as i32, height as i32);
                sidebar.show().map_err(|e| format!("failed to re-show sidebar after resize: {e}"))?;
                Ok(())
            }

            #[cfg(not(target_os = "linux"))]
            {
                sidebar
                    .set_size(tauri::LogicalSize::new(width as f64, height as f64))
                    .map_err(|e| format!("failed to resize sidebar: {e}"))
            }
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| format!("failed to schedule resize on main thread: {e}"))?;

    rx.recv().map_err(|e| format!("resize_sidebar's main-thread closure never replied: {e}"))?
}

fn run_locate(target: &str, region: &Option<Region>) -> Result<Box2D, String> {
    let dir = vision_detect_dir();
    let python = dir.join(".venv").join("bin").join("python3");
    let script = dir.join("live_step.py");

    let mut cmd = Command::new(&python);
    cmd.arg(&script).arg(target);
    if let Some(r) = region {
        cmd.arg(format!("{},{},{},{}", r.x, r.y, r.width, r.height));
    }

    let output = cmd
        .current_dir(&dir)
        .output()
        .map_err(|e| format!("failed to run live_step.py: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "live_step.py exited with {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(stdout.trim())
        .map_err(|e| format!("failed to parse live_step.py output ({stdout}): {e}"))
}

// alwaysOnTop (tauri.conf.json) already puts a window above other regular
// toplevel windows on every platform. On Linux/Wayland it isn't enough by
// itself: wlroots compositors (Sway, Hyprland, ...) render status bars via
// a separate wlr-layer-shell stacking class that a plain toplevel can
// never reach above, which is why the sidebar was showing up underneath
// things like waybar. Promoting it to a layer-shell surface at the
// Overlay layer fixes that; X11 sessions (no layer-shell protocol) just
// keep relying on alwaysOnTop, via the is_supported() check below.
// macOS/Windows don't need this at all — their "always on top" window
// levels already sit above the menu bar/taskbar.
//
// IS applied to "region-select" too: that window is a plain alwaysOnTop
// toplevel, and on tiling Wayland compositors (Sway, Hyprland) a plain
// toplevel can get tiled into the current workspace's layout instead of
// floating full-screen above everything, which would make a region drag
// unusable for an unrelated reason (wrong window management, not a stuck
// property). Layer-shell surfaces are never subject to tiling by protocol
// design.
//
// Must run before the window is first shown: gtk-layer-shell requires the
// underlying GtkWindow to not be mapped yet (it asserts on this), which is
// why these windows start with "visible": false in tauri.conf.json and
// this runs ahead of the explicit window.show() in run() below.
//
// `fill_screen` distinguishes the two windows' placement:
// - region-select: anchor all four edges, so it stretches to cover the
//   whole monitor, matching resizeToMonitor() in region-select.js.
// - sidebar: anchor only top+left with a fixed margin (derived from the
//   window's own configured x/y in tauri.conf.json) instead of stretched
//   edge to edge, so it grows/shrinks from its bottom-right corner
//   (setSize, used to expand/collapse the panel) rather than drifting.
//   Note this means it isn't draggable on Wayland — layer-shell surfaces
//   don't support the interactive xdg_toplevel-style move Tauri's
//   start_dragging/data-tauri-drag-region relies on — so its position is
//   fixed for now. Revisit if that turns out to matter (e.g. an X11-only
//   draggable fallback).
#[cfg(target_os = "linux")]
fn init_layer_shell(window: &tauri::WebviewWindow, fill_screen: bool) -> tauri::Result<()> {
    use gtk_layer_shell::LayerShell;

    let gtk_window = window.gtk_window()?;

    if gtk_layer_shell::is_supported() {
        gtk_window.init_layer_shell();
        gtk_window.set_layer(gtk_layer_shell::Layer::Overlay);
        if fill_screen {
            for edge in [
                gtk_layer_shell::Edge::Top,
                gtk_layer_shell::Edge::Bottom,
                gtk_layer_shell::Edge::Left,
                gtk_layer_shell::Edge::Right,
            ] {
                gtk_window.set_anchor(edge, true);
            }
        } else {
            let pos = window.outer_position()?;
            gtk_window.set_anchor(gtk_layer_shell::Edge::Top, true);
            gtk_window.set_anchor(gtk_layer_shell::Edge::Left, true);
            gtk_window.set_layer_shell_margin(gtk_layer_shell::Edge::Top, pos.y);
            gtk_window.set_layer_shell_margin(gtk_layer_shell::Edge::Left, pos.x);
        }
        // Layer-shell surfaces get no keyboard focus by default (unlike
        // regular toplevels) — OnDemand lets the compositor still route
        // sidebar's/region-select's keydown handlers to them.
        gtk_window.set_keyboard_mode(gtk_layer_shell::KeyboardMode::OnDemand);
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![locate_element, resize_sidebar])
        .setup(|app| {
            use tauri::Manager;
            // Two windows, not four: "sidebar" is the entire app — a small
            // corner-anchored panel that resizes itself (setSize) between
            // a collapsed icon and an expanded login/setup/skills/path/
            // chat view. There is deliberately no full-screen highlight
            // overlay window anymore: an always-on-top window covering the
            // whole screen turned out to be the thing actually blocking
            // clicks into the app being taught, even permanently
            // click-through — so highlighting now renders as a small
            // schematic preview inside the sidebar's own panel (see
            // sidebar.js) instead of a real box drawn over the target app.
            // "region-select" is a full-screen window shown only for the
            // duration of a region drag — see its own comment for why
            // that isn't done by making sidebar itself interactive there.
            // See docs/architecture/overview.md's "Windows" note.
            let sidebar = app
                .get_webview_window("sidebar")
                .unwrap_or_else(|| panic!("\"sidebar\" window declared in tauri.conf.json must exist"));

            #[cfg(target_os = "linux")]
            init_layer_shell(&sidebar, false)?;

            // Starts hidden (see init_layer_shell) so this is its first
            // real show, after layer-shell setup completes.
            sidebar.show()?;

            // "region-select" gets layer-shell too (fill_screen — see
            // init_layer_shell), so it floats above everything (including
            // on a tiling compositor) rather than relying on plain
            // alwaysOnTop. It stays hidden until its own JS shows it for
            // an active drag (see src/region-select.js) — deliberately
            // not shown here.
            #[cfg(target_os = "linux")]
            init_layer_shell(
                &app.get_webview_window("region-select")
                    .expect("\"region-select\" window declared in tauri.conf.json must exist"),
                true,
            )?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
