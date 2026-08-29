use std::process::Command;

use serde::{Deserialize, Serialize};

mod window_provider;

// x0..y1 are always fractions-of-`image_width`/`image_height` in spirit
// (the schematic renderer already treats them that way) — what `anchor`
// adds is *whose* frame that is, so a real overlay (or a re-`locate_element`
// call after a resize) knows what to re-multiply the fraction against.
// `Region`: captured against a free-drawn/full-screen box (ADR 0003) —
// there's no live handle to re-anchor to, so a stale box is only fixable
// by a fresh `locate_element` call.
// `Window`: captured against a specific window's client rect, per ADR
// 0005. `id` is the live, re-resolvable handle from `window_provider`
// (what `locate_element` re-queries before every capture — see below);
// `label` is "app_name — title" for display only.
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum FrameAnchor {
    Region,
    Window { id: String, label: String },
}

// What the caller wants scoped: a free-drawn box, or a live window handle
// to re-resolve against its *current* rect right before capture (see
// `locate_element`). Replaces the old bare `Option<Region>` param now that
// window-pick capture is a real, live path (ADR 0005) rather than a
// schema placeholder.
#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum CaptureScope {
    Region(Region),
    Window { id: String },
}

#[derive(Serialize, Deserialize, Debug)]
struct Box2D {
    x0: i64,
    y0: i64,
    x1: i64,
    y1: i64,
    image_width: i64,
    image_height: i64,
    #[serde(default)]
    anchor: Option<FrameAnchor>,
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

// One coarse top-level step from the Research call — goal-scoped facts
// only (title/brief/watch_for), never anything screen-specific, since
// Research never sees a screenshot. See research.py's module docstring.
#[derive(Serialize, Deserialize, Debug)]
struct ResearchStep {
    title: String,
    brief: String,
    watch_for: String,
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
fn locate_element(app: tauri::AppHandle, target: String, scope: Option<CaptureScope>) -> Result<Box2D, String> {
    use tauri::Manager;

    let sidebar = app
        .get_webview_window("sidebar")
        .expect("\"sidebar\" window declared in tauri.conf.json must exist");
    sidebar.hide().map_err(|e| format!("failed to hide sidebar before capture: {e}"))?;

    // For a Window scope, re-resolve the window's rect right now — never
    // trust whatever rect the caller cached from when it was picked. This
    // is what makes a capture survive the target app being resized/moved
    // since it was selected: every capture re-derives its region from the
    // window's *current* geometry, not a stale snapshot (see ADR 0005 and
    // the FrameAnchor::Window comment above).
    let (region, anchor) = match scope {
        None => (None, None),
        Some(CaptureScope::Region(r)) => (Some(r), Some(FrameAnchor::Region)),
        Some(CaptureScope::Window { id }) => {
            let win = match window_provider::get_window_rect(&id) {
                Ok(w) => w,
                Err(e) => {
                    let _ = sidebar.show();
                    return Err(format!("selected window is no longer available: {e}"));
                }
            };
            let region = Region { x: win.x, y: win.y, width: win.width, height: win.height };
            let label = format!("{} — {}", win.app_name, win.title);
            (Some(region), Some(FrameAnchor::Window { id, label }))
        }
    };

    let result = run_locate(&target, &region).map(|mut b| {
        b.anchor = anchor;
        b
    });

    sidebar.show().map_err(|e| format!("failed to re-show sidebar after capture: {e}"))?;

    result
}

// Window enumeration/re-query never needs the sidebar hidden — no
// screenshot involved, just OS window-list queries (see window_provider.rs).
#[tauri::command]
fn list_windows() -> Result<Vec<window_provider::WindowInfo>, String> {
    window_provider::list_windows()
}

#[tauri::command]
fn refresh_window_rect(id: String) -> Result<window_provider::WindowInfo, String> {
    window_provider::get_window_rect(&id)
}

// Backs the "click the window you want" flow in sidebar.js: x/y are
// absolute screen px (the region-select overlay window is sized+positioned
// to exactly cover the monitor, so its click coordinates already are
// screen coordinates — see region-select.js's resizeToMonitor).
#[tauri::command]
fn window_at_point(x: i64, y: i64) -> Result<window_provider::WindowInfo, String> {
    window_provider::window_at_point(x, y)
}

// Research runs once per chat, on just the goal text — no screenshot, no
// sidebar to hide (see locate_element above for why that one needs it).
// See docs/features/skills.md's "Research" step.
// app_name comes from the OS window-pick (window_provider.rs, via
// sidebar.js's selected window) when one's been made — e.g. "Code",
// "libreoffice-calc" — so Research can scope its search to the actual
// target app instead of guessing it from goal text alone. Optional since
// setup still allows staying on full-screen/region capture, where there's
// no window to name.
#[tauri::command]
fn research_goal(goal: String, app_name: Option<String>) -> Result<Vec<ResearchStep>, String> {
    run_research(&goal, app_name.as_deref())
}

fn run_research(goal: &str, app_name: Option<&str>) -> Result<Vec<ResearchStep>, String> {
    let dir = vision_detect_dir();
    let python = dir.join(".venv").join("bin").join("python3");
    let script = dir.join("research.py");

    let mut cmd = Command::new(&python);
    cmd.arg(&script).arg(goal);
    if let Some(app) = app_name {
        cmd.arg(app);
    }

    let output = cmd
        .current_dir(&dir)
        .output()
        .map_err(|e| format!("failed to run research.py: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "research.py exited with {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(stdout.trim())
        .map_err(|e| format!("failed to parse research.py output ({stdout}): {e}"))
}

// One AI-planned substep from the per-step planning call — see
// docs/features/skills.md's "Per-step loop". `target_description` is
// plain text, not a coordinate: this call never sees a screenshot, so
// locating it against the real screen is a separate, later
// `locate_element` call.
#[derive(Serialize, Deserialize, Debug)]
struct PlannedSubstep {
    target_description: String,
    instruction_text: String,
    action: String,
}

// Runs once per top-level step, lazily, the first time the user reaches
// it — not up front for the whole skill. No screenshot, no sidebar to
// hide, same as research_goal above.
#[tauri::command]
fn plan_step(
    goal: String,
    step_title: String,
    step_brief: String,
    step_watch_for: String,
) -> Result<Vec<PlannedSubstep>, String> {
    run_plan_step(&goal, &step_title, &step_brief, &step_watch_for)
}

fn run_plan_step(
    goal: &str,
    step_title: &str,
    step_brief: &str,
    step_watch_for: &str,
) -> Result<Vec<PlannedSubstep>, String> {
    let dir = vision_detect_dir();
    let python = dir.join(".venv").join("bin").join("python3");
    let script = dir.join("plan_step.py");

    let output = Command::new(&python)
        .arg(&script)
        .arg(goal)
        .arg(step_title)
        .arg(step_brief)
        .arg(step_watch_for)
        .current_dir(&dir)
        .output()
        .map_err(|e| format!("failed to run plan_step.py: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "plan_step.py exited with {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(stdout.trim())
        .map_err(|e| format!("failed to parse plan_step.py output ({stdout}): {e}"))
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

// region-select only, not sidebar (see run() below): a plain alwaysOnTop
// toplevel on a tiling Wayland compositor (Sway, Hyprland) can get tiled
// into the current workspace's layout instead of floating full-screen
// above everything, which would make a region drag unusable. Promoting it
// to a layer-shell surface at the Overlay layer avoids that — layer-shell
// surfaces are never subject to tiling by protocol design. X11 sessions
// (no layer-shell protocol) and macOS/Windows just rely on alwaysOnTop
// instead, via the is_supported() check below; GNOME's Mutter also falls
// through this path, since it never advertises wlr-layer-shell at all
// (confirmed by capturing this app's own WAYLAND_DEBUG=1 registry dump —
// no zwlr_* globals present, not a version gap) — a plain floating
// full-screen toplevel is what it gets there, which GNOME (a non-tiling
// WM) handles fine anyway.
//
// sidebar itself is deliberately NOT promoted to layer-shell, and (see
// tauri.conf.json) is no longer undecorated/always-on-top either — it's
// now a plain decorated toplevel, exactly like any other application
// window. Two custom drag mechanisms were tried first — the layer-shell
// margin-rewrite IPC command, then Tauri's startDragging() (an
// interactive xdg_toplevel move) on a plain-but-undecorated toplevel —
// and neither proved reliable here in practice. A real titlebar sidesteps
// the question entirely: the window manager owns dragging, the same way
// it does for every other window, with zero app-side drag code. Trade-off,
// accepted: sidebar is no longer forced above other windows, and (Hyprland/
// Sway) can be auto-tiled into the workspace layout instead of floating.
//
// Must run before the window is first shown: gtk-layer-shell requires the
// underlying GtkWindow to not be mapped yet (it asserts on this), which is
// why "region-select" starts with "visible": false in tauri.conf.json and
// this runs ahead of its explicit show() in run() below.
#[cfg(target_os = "linux")]
fn init_layer_shell(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    use gtk_layer_shell::LayerShell;

    let gtk_window = window.gtk_window()?;

    if gtk_layer_shell::is_supported() {
        gtk_window.init_layer_shell();
        gtk_window.set_layer(gtk_layer_shell::Layer::Overlay);
        for edge in [
            gtk_layer_shell::Edge::Top,
            gtk_layer_shell::Edge::Bottom,
            gtk_layer_shell::Edge::Left,
            gtk_layer_shell::Edge::Right,
        ] {
            gtk_window.set_anchor(edge, true);
        }
        // Layer-shell surfaces get no keyboard focus by default (unlike
        // regular toplevels) — OnDemand lets the compositor still route
        // region-select's keydown handlers to it.
        gtk_window.set_keyboard_mode(gtk_layer_shell::KeyboardMode::OnDemand);
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            locate_element,
            research_goal,
            plan_step,
            list_windows,
            refresh_window_rect,
            window_at_point
        ])
        .setup(|app| {
            use tauri::Manager;
            // Two windows, not four: "sidebar" is the entire app — a
            // plain, fixed-size decorated window showing one of
            // login/setup/skills/path/chat at a time (see sidebar.js).
            // No collapsed-icon mode for now, and no full-screen highlight
            // overlay window anymore either — an always-on-top window
            // covering the whole screen turned out to be the thing
            // actually blocking clicks into the app being taught, even
            // permanently click-through — so highlighting now renders as
            // a small schematic preview inside the sidebar's own panel
            // (see sidebar.js) instead of a real box drawn over the
            // target app. "region-select" is a full-screen window shown
            // only for the duration of a region drag — see its own
            // comment for why that isn't done by making sidebar itself
            // interactive there. See docs/architecture/overview.md's
            // "Windows" note.
            let sidebar = app
                .get_webview_window("sidebar")
                .unwrap_or_else(|| panic!("\"sidebar\" window declared in tauri.conf.json must exist"));

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
            )?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
