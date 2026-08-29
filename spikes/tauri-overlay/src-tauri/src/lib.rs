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
    // `Portal`: captured through the desktop portal (Wayland), where the
    // frame is whatever source the compositor's picker handed us. There is
    // deliberately no id or rect to re-anchor to — the portal never
    // discloses the window's screen position, and the stored restore token
    // (portal_capture.py) is what makes the *next* capture land on the same
    // source. `label` is the portal's own description, display only.
    //
    // `screen` is what decides whether the on-screen overlay can draw:
    // a screen-scoped frame *is* a whole monitor, so a fraction of the
    // frame is the same fraction of that monitor and maps straight back to
    // absolute coordinates. A window-scoped frame has no knowable position,
    // so the overlay refuses and falls back to the schematic (ADR 0006).
    // It is trustworthy because it comes from the portal's own report of
    // what the user picked (source_type), not from a guess.
    Portal { label: String, screen: bool },
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
    // Wayland: the source was picked once through the portal and is
    // re-resolved from the stored restore token, not from a rect. `scope`
    // is the portal source type the pick was made with ("any" | "window" |
    // "monitor") and has to match, since the token is stored per scope.
    //
    // `screen` is what the user actually landed on, which "any" can't
    // imply — the portal reports it back after the pick (source_type) and
    // the caller passes it through. It decides whether the overlay can
    // draw; see FrameAnchor::Portal.
    Portal {
        scope: String,
        #[serde(default)]
        screen: Option<bool>,
    },
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
// `async fn` + spawn_blocking, not a plain synchronous fn: a plain
// #[tauri::command] runs inline on the IPC-invoke thread, which on this
// platform is the same thread pumping the window's event loop — so a
// subprocess call taking tens of seconds (a capture + vision round trip)
// froze the whole window and the compositor reported it as "not
// responding". Every command below that shells out or touches the
// filesystem gets the same treatment for the same reason.
#[tauri::command]
async fn locate_element(app: tauri::AppHandle, target: String, scope: Option<CaptureScope>) -> Result<Box2D, String> {
    tauri::async_runtime::spawn_blocking(move || locate_element_blocking(&app, &target, scope))
        .await
        .map_err(|e| format!("locate_element task panicked: {e}"))?
}

fn locate_element_blocking(app: &tauri::AppHandle, target: &str, scope: Option<CaptureScope>) -> Result<Box2D, String> {
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
    // `portal_scope` and `region` are mutually exclusive: a portal capture
    // *is* already scoped to the picked source, so there is nothing to crop.
    let mut portal_scope: Option<String> = None;
    let (region, anchor) = match scope {
        None => (None, None),
        Some(CaptureScope::Region(r)) => (Some(r), Some(FrameAnchor::Region)),
        Some(CaptureScope::Portal { scope, screen }) => {
            let label = format!("portal source ({scope})");
            // Falls back to the requested scope when the caller didn't say:
            // a "monitor" request can only have produced a screen.
            let screen = screen.unwrap_or(scope == "monitor");
            portal_scope = Some(scope);
            (None, Some(FrameAnchor::Portal { label, screen }))
        }
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

    let result = run_locate(target, &region, portal_scope.as_deref()).map(|mut b| {
        b.anchor = anchor;
        b
    });

    sidebar.show().map_err(|e| format!("failed to re-show sidebar after capture: {e}"))?;

    result
}

// Window enumeration/re-query never needs the sidebar hidden — no
// screenshot involved, just OS window-list queries (see window_provider.rs).
// Async even though these are normally fast: an X11 connection that's
// stalled (compositor busy, socket wedged) blocks exactly the same way a
// slow subprocess does, and there is no cheap way to bound it in advance.
#[tauri::command]
async fn list_windows() -> Result<Vec<window_provider::WindowInfo>, String> {
    tauri::async_runtime::spawn_blocking(window_provider::list_windows)
        .await
        .map_err(|e| format!("list_windows task panicked: {e}"))?
}

#[tauri::command]
async fn refresh_window_rect(id: String) -> Result<window_provider::WindowInfo, String> {
    tauri::async_runtime::spawn_blocking(move || window_provider::get_window_rect(&id))
        .await
        .map_err(|e| format!("refresh_window_rect task panicked: {e}"))?
}

// Backs the "click the window you want" flow in sidebar.js: x/y are
// absolute screen px (the region-select overlay window is sized+positioned
// to exactly cover the monitor, so its click coordinates already are
// screen coordinates — see region-select.js's resizeToMonitor).
#[tauri::command]
async fn window_at_point(x: i64, y: i64) -> Result<window_provider::WindowInfo, String> {
    tauri::async_runtime::spawn_blocking(move || window_provider::window_at_point(x, y))
        .await
        .map_err(|e| format!("window_at_point task panicked: {e}"))?
}

// Lets the setup view ask which pick gesture is even possible here before
// offering one: click-to-pick on macOS/Windows/X11, the compositor's own
// picker on Wayland. See window_provider::backend. Cheap (an env var read)
// — left synchronous.
#[tauri::command]
fn capture_backend() -> window_provider::Backend {
    window_provider::backend()
}

// What a portal-backend pick returns — the portal's own description of the
// chosen source, plus its pixel size. No window id, title or app name: the
// portal does not disclose them, which is the trade for it working at all
// on Wayland.
#[derive(Serialize, Deserialize, Debug)]
struct PortalPick {
    scope: String,
    width: i64,
    height: i64,
    source_type: Option<String>,
    // Present for monitor sources only — see portal_capture.py.
    position: Option<Vec<i64>>,
    label: String,
    persisted: bool,
}

// Runs the compositor's picker (the one prompt in the whole flow) and
// stores a restore token so later captures are silent. The sidebar is
// hidden for the duration so the user is picking from their real desktop,
// and so this app's own window isn't the obvious thing to click.
// Can block up to five minutes (see PortalSession's timeout in
// portal_capture.py) waiting on the user to click the compositor's own
// share dialog — the single most important command to get off the main
// thread, since a synchronous version here would report the app as hung
// for as long as the user takes to decide.
#[tauri::command]
async fn pick_portal_source(app: tauri::AppHandle, scope: Option<String>) -> Result<PortalPick, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;

        let scope = scope.unwrap_or_else(|| "any".to_string());
        let sidebar = app
            .get_webview_window("sidebar")
            .expect("\"sidebar\" window declared in tauri.conf.json must exist");
        sidebar.hide().map_err(|e| format!("failed to hide sidebar before pick: {e}"))?;

        let result = run_portal_pick(&scope);

        sidebar.show().map_err(|e| format!("failed to re-show sidebar after pick: {e}"))?;
        result
    })
    .await
    .map_err(|e| format!("pick_portal_source task panicked: {e}"))?
}

fn run_portal_pick(scope: &str) -> Result<PortalPick, String> {
    let dir = vision_detect_dir();
    let python = dir.join(".venv").join("bin").join("python3");
    let script = dir.join("portal_capture.py");

    let output = Command::new(&python)
        .arg(&script)
        .arg("pick")
        .arg(scope)
        .current_dir(&dir)
        .output()
        .map_err(|e| format!("failed to run portal_capture.py: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(stdout.trim())
        .map_err(|e| format!("failed to parse portal_capture.py output ({stdout}): {e}"))
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
async fn research_goal(goal: String, app_name: Option<String>) -> Result<Vec<ResearchStep>, String> {
    tauri::async_runtime::spawn_blocking(move || run_research(&goal, app_name.as_deref()))
        .await
        .map_err(|e| format!("research_goal task panicked: {e}"))?
}

// Skill persistence: the whole skills/steps/substeps tree, as JS already
// shapes it, round-tripped as an opaque JSON string. Deliberately *not* a
// typed Rust struct mirroring Skill/Step/Substep — that shape (bbox,
// FrameAnchor variants, per-origin substep fields) already lives in
// sidebar.js and fake-skill.js, and is still actively changing there; a
// second copy here would just be a second place to update every time the
// UI's data model does. Rust's job is only "put these bytes on disk and
// hand them back," not to understand them.
fn skills_file_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("couldn't resolve the app data directory: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("couldn't create {}: {e}", dir.display()))?;
    Ok(dir.join("skills.json"))
}

// None when no skill has ever been saved yet (fresh install) — distinct
// from an error, so the caller can fall back to the fixture demo data
// without treating "nothing saved yet" as a failure.
#[tauri::command]
async fn load_skills_json(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = skills_file_path(&app)?;
        match std::fs::read_to_string(&path) {
            Ok(contents) => Ok(Some(contents)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(format!("couldn't read {}: {e}", path.display())),
        }
    })
    .await
    .map_err(|e| format!("load_skills_json task panicked: {e}"))?
}

// Called after every skill/step/substep mutation (new goal researched,
// substeps generated, a chat follow-up added) — see sidebar.js's
// persistSkills. Whole-file rewrite rather than incremental: the file is
// small (a session's worth of skills) and this way there's exactly one
// code path to get right, with no partial-write states to reason about.
#[tauri::command]
async fn save_skills_json(app: tauri::AppHandle, json: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = skills_file_path(&app)?;
        std::fs::write(&path, json).map_err(|e| format!("couldn't write {}: {e}", path.display()))
    })
    .await
    .map_err(|e| format!("save_skills_json task panicked: {e}"))?
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
async fn plan_step(
    goal: String,
    step_title: String,
    step_brief: String,
    step_watch_for: String,
) -> Result<Vec<PlannedSubstep>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_plan_step(&goal, &step_title, &step_brief, &step_watch_for)
    })
    .await
    .map_err(|e| format!("plan_step task panicked: {e}"))?
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

fn run_locate(
    target: &str,
    region: &Option<Region>,
    portal_scope: Option<&str>,
) -> Result<Box2D, String> {
    let dir = vision_detect_dir();
    let python = dir.join(".venv").join("bin").join("python3");
    let script = dir.join("live_step.py");

    let mut cmd = Command::new(&python);
    cmd.arg(&script).arg(target);
    if let Some(scope) = portal_scope {
        cmd.arg("--portal").arg(scope);
    } else if let Some(r) = region {
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
            capture_backend,
            pick_portal_source,
            load_skills_json,
            save_skills_json,
            refresh_window_rect,
            window_at_point
        ])
        .setup(|app| {
            use tauri::Manager;
            // Three windows: "sidebar" is the app proper — a plain,
            // fixed-size decorated window showing one of
            // login/setup/skills/path/chat at a time (see sidebar.js).
            // "region-select" is a full-screen surface shown only for the
            // duration of a region drag or a click-to-pick-a-window
            // gesture — see its own comment for why that isn't done by
            // making sidebar itself interactive there. "overlay" is the
            // real on-screen highlight window (see below). See
            // docs/architecture/overview.md's "Windows" note.
            let sidebar = app
                .get_webview_window("sidebar")
                .unwrap_or_else(|| panic!("\"sidebar\" window declared in tauri.conf.json must exist"));

            // Isolated fake Excel loop — `npm run demo` / GUIDO_EXCEL_DEMO=1.
            // Regular `npx tauri dev` still opens sidebar only.
            let excel_demo = std::env::var("GUIDO_EXCEL_DEMO")
                .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
                .unwrap_or(false);
            if excel_demo {
                app.get_webview_window("excel-demo")
                    .expect("\"excel-demo\" window declared in tauri.conf.json must exist")
                    .show()?;
            } else {
                sidebar.show()?;
            }

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

            // The real on-screen overlay — restored after having been cut
            // (see docs/architecture/overview.md's "Visual overlay"): an
            // earlier full-screen highlight window blocked clicks into the
            // app being taught. The fix is that click-through is set here,
            // once, at startup, and NEVER toggled from JS afterwards — the
            // old failure mode was a *toggled* passthrough getting stuck
            // in the interactive direction, which trapped the whole screen
            // with no recovery short of killing the app. With nothing ever
            // toggling it, there's no stuck state to reach. Don't add a
            // command that flips this; if the overlay ever needs real
            // input it needs a different design (see overlay.html).
            //
            // Layer-shell on Linux for the same reason region-select gets
            // it: a plain alwaysOnTop toplevel can be tiled into the
            // workspace layout by a tiling compositor instead of floating
            // above everything, which would put the highlight box
            // somewhere other than over the target app.
            let overlay = app
                .get_webview_window("overlay")
                .expect("\"overlay\" window declared in tauri.conf.json must exist");
            #[cfg(target_os = "linux")]
            init_layer_shell(&overlay)?;
            // GTK: set_ignore_cursor_events on a window that has never
            // been shown aborts the process. tao implements it as
            // `window.window().unwrap().input_shape_combine_region(..)`
            // (tao's linux/event_loop.rs, WindowRequest::CursorIgnoreEvents)
            // and `gtk_widget_get_window` returns NULL until the widget is
            // *realized* — so the unwrap panics, inside a glib dispatch
            // callback that can't unwind, which turns a panic into an
            // immediate abort ("panic in a function that cannot unwind").
            // "overlay" starts `"visible": false` and must stay invisible
            // until a substep asks for it, so it isn't realized yet here.
            //
            // realize() creates the GdkWindow without mapping it — the
            // window stays invisible, but the GdkWindow the input-shape
            // call needs now exists. Must come *after* init_layer_shell:
            // gtk-layer-shell requires init before realization.
            #[cfg(target_os = "linux")]
            {
                use gtk::prelude::WidgetExt;
                overlay.gtk_window()?.realize();
            }
            overlay.set_ignore_cursor_events(true)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
