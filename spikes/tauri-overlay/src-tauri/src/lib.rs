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

// research.py's whole response: `title` is a short, AI-written
// description of the goal — the same idea as ChatGPT auto-titling a
// conversation — generated in the same call as the steps rather than a
// separate one, since the model already has the goal in context. Shown
// in place of the user's raw prompt everywhere a skill is listed
// (sidebar.js's home chat list, the path view's title bar).
#[derive(Serialize, Deserialize, Debug)]
struct ResearchResult {
    title: String,
    steps: Vec<ResearchStep>,
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

// The vision-detect scripts call the Worker's /api/vision proxy
// (worker/vision.ts) instead of holding an Anthropic key locally — see
// docs/features/vision.md — so every one of them needs the same session
// token store_session_token/get_session_token already manage. Passed to
// the subprocess as an env var (GUIDO_SESSION_TOKEN, read by
// vision_client.py) rather than a CLI arg, so it never lands in a process
// listing or gets echoed back into an error message that includes argv.
fn vision_session_token() -> Result<String, String> {
    match session_token_entry()?.get_password() {
        Ok(token) => Ok(token),
        Err(keyring::Error::NoEntry) => Err("Sign in to use this feature.".to_string()),
        Err(e) => Err(format!("couldn't read the session token: {e}")),
    }
}

// A packaged build has no `spikes/vision-detect/.venv` on the user's
// machine — that directory only ever existed on a developer's own
// checkout — so each vision-detect script is compiled by PyInstaller into
// a standalone binary and shipped as a Tauri externalBin sidecar (see
// tauri.conf.json's `bundle.externalBin` and
// .github/workflows/release.yml's build-sidecars step). Tauri places
// sidecars next to the main executable in the final bundle on every OS,
// so `current_exe()`'s directory is where to look for one; falling back
// to the dev `.venv` (per-OS layout: Scripts/python.exe on Windows,
// bin/python3 elsewhere) when no sidecar is there keeps `cargo run`
// working unchanged during development.
fn sidecar_path(stem: &str) -> Option<std::path::PathBuf> {
    let dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    for name in [stem.to_string(), format!("{stem}.exe")] {
        let candidate = dir.join(name);
        // build.rs's ensure_sidecar_placeholders() writes a zero-byte
        // stand-in wherever no real PyInstaller sidecar has been built
        // (every local dev build) purely to satisfy tauri-build's
        // externalBin existence check — treat that the same as "not
        // there" so `tauri dev` keeps falling through to the real
        // `.venv` scripts below, matching pre-sidecar behavior. A real
        // sidecar is a multi-MB standalone binary; it is never empty.
        match candidate.metadata() {
            Ok(meta) if meta.is_file() && meta.len() > 0 => return Some(candidate),
            _ => {}
        }
    }
    None
}

fn vision_command(dir: &std::path::Path, stem: &str) -> Command {
    if let Some(sidecar) = sidecar_path(stem) {
        return Command::new(sidecar);
    }
    let python = if cfg!(windows) {
        dir.join(".venv").join("Scripts").join("python.exe")
    } else {
        dir.join(".venv").join("bin").join("python3")
    };
    let mut cmd = Command::new(python);
    cmd.arg(dir.join(format!("{stem}.py")));
    cmd
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
async fn locate_element(
    app: tauri::AppHandle,
    target: String,
    scope: Option<CaptureScope>,
    // Everything Research/plan_step already know about the step this
    // target belongs to (goal, brief, watch_for, substeps already
    // covered) — assembled by sidebar.js's locateContext, since the
    // skill/step/substep shape lives entirely there (see the comment on
    // skills_file_path). Passed straight through to the vision prompt
    // alongside the screenshot; Rust never inspects it.
    context: Option<String>,
) -> Result<Box2D, String> {
    tauri::async_runtime::spawn_blocking(move || locate_element_blocking(&app, &target, scope, context.as_deref()))
        .await
        .map_err(|e| format!("locate_element task panicked: {e}"))?
}

fn locate_element_blocking(
    app: &tauri::AppHandle,
    target: &str,
    scope: Option<CaptureScope>,
    context: Option<&str>,
) -> Result<Box2D, String> {
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

    let result = run_locate(target, &region, portal_scope.as_deref(), context).map(|mut b| {
        b.anchor = anchor;
        b
    });

    sidebar.show().map_err(|e| format!("failed to re-show sidebar after capture: {e}"))?;

    result
}

// The Guide -> Do -> Verify check: does the screen now match a substep's
// `expected_outcome`, instead of the user clicking "Done" and being
// trusted. `observed` is shown to the user regardless of `matches` — a
// wrong-but-specific answer ("Exposure reads +0.2") is more useful for
// fixing the problem than a bare pass/fail would be.
#[derive(Serialize, Deserialize, Debug)]
struct VerifyResult {
    matches: bool,
    observed: String,
}

// Structurally locate_element's twin — same "hide the sidebar, resolve
// the capture scope, shell out, re-show the sidebar" shape — but not
// sharing its code: locate_element_blocking's scope-resolution match is
// duplicated here rather than extracted, since refactoring a working,
// already-tested path for one new caller risks the working one for no
// real gain. If a third caller ever needs the same resolution, that's
// the point to extract it.
#[tauri::command]
async fn verify_substep(
    app: tauri::AppHandle,
    expected_outcome: String,
    scope: Option<CaptureScope>,
    context: Option<String>,
) -> Result<VerifyResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        verify_substep_blocking(&app, &expected_outcome, scope, context.as_deref())
    })
    .await
    .map_err(|e| format!("verify_substep task panicked: {e}"))?
}

fn verify_substep_blocking(
    app: &tauri::AppHandle,
    expected_outcome: &str,
    scope: Option<CaptureScope>,
    context: Option<&str>,
) -> Result<VerifyResult, String> {
    use tauri::Manager;

    let sidebar = app
        .get_webview_window("sidebar")
        .expect("\"sidebar\" window declared in tauri.conf.json must exist");
    sidebar.hide().map_err(|e| format!("failed to hide sidebar before capture: {e}"))?;

    let mut portal_scope: Option<String> = None;
    let region = match scope {
        None => None,
        Some(CaptureScope::Region(r)) => Some(r),
        Some(CaptureScope::Portal { scope, .. }) => {
            portal_scope = Some(scope);
            None
        }
        Some(CaptureScope::Window { id }) => match window_provider::get_window_rect(&id) {
            Ok(w) => Some(Region { x: w.x, y: w.y, width: w.width, height: w.height }),
            Err(e) => {
                let _ = sidebar.show();
                return Err(format!("selected window is no longer available: {e}"));
            }
        },
    };

    let result = run_verify(expected_outcome, &region, portal_scope.as_deref(), context);

    sidebar.show().map_err(|e| format!("failed to re-show sidebar after capture: {e}"))?;

    result
}

fn run_verify(
    expected_outcome: &str,
    region: &Option<Region>,
    portal_scope: Option<&str>,
    context: Option<&str>,
) -> Result<VerifyResult, String> {
    let dir = vision_detect_dir();
    let mut cmd = vision_command(&dir, "verify_step");
    cmd.arg(expected_outcome);
    if let Some(scope) = portal_scope {
        cmd.arg("--portal").arg(scope);
    } else if let Some(r) = region {
        cmd.arg(format!("{},{},{},{}", r.x, r.y, r.width, r.height));
    }
    if let Some(ctx) = context {
        cmd.arg("--context").arg(ctx);
    }

    let output = cmd
        .env("GUIDO_SESSION_TOKEN", vision_session_token()?)
        .current_dir(&dir)
        .output()
        .map_err(|e| format!("failed to run verify_step.py: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "verify_step.py exited with {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(stdout.trim())
        .map_err(|e| format!("failed to parse verify_step.py output ({stdout}): {e}"))
}

// A follow-up question's answer — see docs/features/skills.md's Per-step
// loop (the reactive-substep section) and answer.py.
#[derive(Serialize, Deserialize, Debug)]
struct AnswerResult {
    answer: String,
}

// Same locate_element/verify_substep shape, with one real difference:
// `with_screenshot` decides whether any capture happens at all, not just
// which scope to use. A plain question is a pure text call — no sidebar
// hide, no capture, fastest possible path — since the product rule
// (established alongside Verify) is that a screenshot only ever happens
// on a deliberate, named action, never as a side effect of sending a
// chat message. `scope` is only consulted when `with_screenshot` is true.
#[tauri::command]
async fn answer_question(
    app: tauri::AppHandle,
    question: String,
    with_screenshot: bool,
    scope: Option<CaptureScope>,
    context: Option<String>,
) -> Result<AnswerResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !with_screenshot {
            return run_answer(&question, None, None, context.as_deref());
        }
        answer_question_with_screenshot_blocking(&app, &question, scope, context.as_deref())
    })
    .await
    .map_err(|e| format!("answer_question task panicked: {e}"))?
}

fn answer_question_with_screenshot_blocking(
    app: &tauri::AppHandle,
    question: &str,
    scope: Option<CaptureScope>,
    context: Option<&str>,
) -> Result<AnswerResult, String> {
    use tauri::Manager;

    let sidebar = app
        .get_webview_window("sidebar")
        .expect("\"sidebar\" window declared in tauri.conf.json must exist");
    sidebar.hide().map_err(|e| format!("failed to hide sidebar before capture: {e}"))?;

    let mut portal_scope: Option<String> = None;
    let region = match scope {
        None => None,
        Some(CaptureScope::Region(r)) => Some(r),
        Some(CaptureScope::Portal { scope, .. }) => {
            portal_scope = Some(scope);
            None
        }
        Some(CaptureScope::Window { id }) => match window_provider::get_window_rect(&id) {
            Ok(w) => Some(Region { x: w.x, y: w.y, width: w.width, height: w.height }),
            Err(e) => {
                let _ = sidebar.show();
                return Err(format!("selected window is no longer available: {e}"));
            }
        },
    };

    let result = run_answer(question, region.as_ref(), portal_scope.as_deref(), context);

    sidebar.show().map_err(|e| format!("failed to re-show sidebar after capture: {e}"))?;

    result
}

fn run_answer(
    question: &str,
    region: Option<&Region>,
    portal_scope: Option<&str>,
    context: Option<&str>,
) -> Result<AnswerResult, String> {
    let dir = vision_detect_dir();
    let mut cmd = vision_command(&dir, "answer_step");
    cmd.arg(question);
    if let Some(scope) = portal_scope {
        cmd.arg("--portal").arg(scope);
    } else if let Some(r) = region {
        cmd.arg(format!("{},{},{},{}", r.x, r.y, r.width, r.height));
    }
    if let Some(ctx) = context {
        cmd.arg("--context").arg(ctx);
    }

    let output = cmd
        .env("GUIDO_SESSION_TOKEN", vision_session_token()?)
        .current_dir(&dir)
        .output()
        .map_err(|e| format!("failed to run answer_step.py: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "answer_step.py exited with {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(stdout.trim())
        .map_err(|e| format!("failed to parse answer_step.py output ({stdout}): {e}"))
}

// What the vision model read off the picked frame — see identify_app.py.
// Both fields are optional: "I can't tell" is a real answer here and is
// preferable to a confident wrong one, which would silently scope every
// later Research call to software the user isn't in.
#[derive(Serialize, Deserialize, Debug)]
struct AppIdentity {
    app_name: Option<String>,
    window_title: Option<String>,
}

// The only way to learn which app was picked on a Wayland session: the
// portal reports a stream and a size and nothing else, and Mutter
// publishes no X11 client list to fall back on (see `BL-009`). Called
// once, right after a pick — not per step. Same hide-the-sidebar dance as
// locate_element, for the same reason: this app's own window must not be
// in the frame the model is asked to name.
#[tauri::command]
async fn identify_app(app: tauri::AppHandle, scope: Option<CaptureScope>) -> Result<AppIdentity, String> {
    tauri::async_runtime::spawn_blocking(move || identify_app_blocking(&app, scope))
        .await
        .map_err(|e| format!("identify_app task panicked: {e}"))?
}

fn identify_app_blocking(app: &tauri::AppHandle, scope: Option<CaptureScope>) -> Result<AppIdentity, String> {
    use tauri::Manager;

    let sidebar = app
        .get_webview_window("sidebar")
        .expect("\"sidebar\" window declared in tauri.conf.json must exist");
    sidebar.hide().map_err(|e| format!("failed to hide sidebar before capture: {e}"))?;

    let mut portal_scope: Option<String> = None;
    let region = match scope {
        None => None,
        Some(CaptureScope::Region(r)) => Some(r),
        Some(CaptureScope::Portal { scope, .. }) => {
            portal_scope = Some(scope);
            None
        }
        Some(CaptureScope::Window { id }) => match window_provider::get_window_rect(&id) {
            Ok(w) => Some(Region { x: w.x, y: w.y, width: w.width, height: w.height }),
            Err(e) => {
                let _ = sidebar.show();
                return Err(format!("selected window is no longer available: {e}"));
            }
        },
    };

    let result = run_identify_app(&region, portal_scope.as_deref());

    sidebar.show().map_err(|e| format!("failed to re-show sidebar after capture: {e}"))?;

    result
}

fn run_identify_app(region: &Option<Region>, portal_scope: Option<&str>) -> Result<AppIdentity, String> {
    let dir = vision_detect_dir();
    let mut cmd = vision_command(&dir, "identify_app");
    if let Some(scope) = portal_scope {
        cmd.arg("--portal").arg(scope);
    } else if let Some(r) = region {
        cmd.arg(format!("{},{},{},{}", r.x, r.y, r.width, r.height));
    }

    let output = cmd
        .env("GUIDO_SESSION_TOKEN", vision_session_token()?)
        .current_dir(&dir)
        .output()
        .map_err(|e| format!("failed to run identify_app.py: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "identify_app.py exited with {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(stdout.trim())
        .map_err(|e| format!("failed to parse identify_app.py output ({stdout}): {e}"))
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

// The picked window's app icon, as a PNG data URI ready for an <img src>.
//
// Cached on disk per app rather than per window, keyed by app name: the
// icon is a property of the application, so every Excel window shares one
// file, and it survives restarts — which is what BL-004's "group chats
// into an Excel-skills page" needs, since a chat outlives the window it
// was recorded against. The extraction itself only works while the window
// is alive, so the cache is also the only way to still have an icon for a
// saved skill later.
//
// `Ok(None)` = this app exposes no icon (or the platform backend isn't
// built yet); the caller draws a letter avatar instead.
fn icon_cache_path(app: &tauri::AppHandle, app_name: &str) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    // Slugged, not used raw: app_name comes from the OS (WM_CLASS, a
    // process name) and would otherwise be able to steer the write with
    // slashes or "..".
    let slug: String = app_name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '-' })
        .collect();
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        return Err("no app name to key the icon cache on".to_string());
    }
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("couldn't resolve the app data directory: {e}"))?
        .join("app-icons");
    std::fs::create_dir_all(&dir).map_err(|e| format!("couldn't create {}: {e}", dir.display()))?;
    Ok(dir.join(format!("{slug}.png")))
}

fn encode_png(icon: &window_provider::IconImage) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    let mut encoder = png::Encoder::new(&mut out, icon.width, icon.height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
    writer.write_image_data(&icon.rgba).map_err(|e| e.to_string())?;
    drop(writer);
    Ok(out)
}

// `id` is optional so a *saved* chat can still get its app's icon long
// after the window it was recorded against is gone: with no id this is a
// cache-only lookup, which is the whole reason the cache is keyed by app
// name rather than by window.
#[tauri::command]
async fn window_icon(
    app: tauri::AppHandle,
    id: Option<String>,
    app_name: String,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use base64::Engine;
        let to_uri = |bytes: &[u8]| {
            format!(
                "data:image/png;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(bytes)
            )
        };

        let cached = icon_cache_path(&app, &app_name).ok();
        if let Some(path) = &cached {
            if let Ok(bytes) = std::fs::read(path) {
                return Ok(Some(to_uri(&bytes)));
            }
        }

        // Extraction from a live window is the better answer (it's the
        // icon that window is actually showing), so it goes first — but
        // there is no window to extract from on a Wayland portal pick, and
        // there won't be for a chat whose window is long closed. The
        // desktop-entry lookup needs nothing but the name, which
        // identify_app can now supply on any session.
        let by_name = || match window_provider::icon_for_app_name(&app_name) {
            Ok(Some(found)) => Ok(Some(found.data_uri)),
            Ok(None) => Ok(None),
            // A missing/unreadable icon theme is a "no icon", not a
            // failure the user can do anything about.
            Err(e) => {
                eprintln!("icon_for_app_name({app_name}) failed: {e}");
                Ok(None)
            }
        };

        let Some(id) = id else {
            return by_name();
        };
        let Some(icon) = window_provider::window_icon(&id)? else {
            return by_name();
        };
        let png = encode_png(&icon)?;
        if let Some(path) = &cached {
            // A cache miss that can't be written back is still a hit for
            // this call — the icon is in hand, so don't fail on it.
            let _ = std::fs::write(path, &png);
        }
        Ok(Some(to_uri(&png)))
    })
    .await
    .map_err(|e| format!("window_icon task panicked: {e}"))?
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
    let output = vision_command(&dir, "portal_capture")
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
async fn research_goal(goal: String, app_name: Option<String>) -> Result<ResearchResult, String> {
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

fn run_research(goal: &str, app_name: Option<&str>) -> Result<ResearchResult, String> {
    let dir = vision_detect_dir();
    let mut cmd = vision_command(&dir, "research");
    cmd.arg(goal);
    if let Some(app) = app_name {
        cmd.arg(app);
    }

    let output = cmd
        .env("GUIDO_SESSION_TOKEN", vision_session_token()?)
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
    // What the screen should show once this one substep is actually
    // done (see plan_step.py's prompt) — the Guide -> Do -> Verify input,
    // checked against a later screenshot by verify_substep below instead
    // of the user clicking "Done" and being trusted. Without this field
    // here, serde would silently drop it on the way to JS: an unlisted
    // JSON field is ignored, not an error, so plan_step.py could produce
    // it correctly and it would still vanish before ever reaching the UI.
    expected_outcome: String,
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
    let output = vision_command(&dir, "plan_step")
        .arg(goal)
        .arg(step_title)
        .arg(step_brief)
        .arg(step_watch_for)
        .env("GUIDO_SESSION_TOKEN", vision_session_token()?)
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
    context: Option<&str>,
) -> Result<Box2D, String> {
    let dir = vision_detect_dir();
    let mut cmd = vision_command(&dir, "live_step");
    cmd.arg(target);
    if let Some(scope) = portal_scope {
        cmd.arg("--portal").arg(scope);
    } else if let Some(r) = region {
        cmd.arg(format!("{},{},{},{}", r.x, r.y, r.width, r.height));
    }
    // A flag rather than another positional arg: region/--portal are
    // already mutually exclusive positionals, and context is optional and
    // independent of either — appending it positionally would make the
    // parse order in live_step.py ambiguous (is arg 3 the region or the
    // context?). Passed as a single argv value, not shell-escaped text:
    // Command never goes through a shell, so embedded spaces/newlines in
    // an AI-written brief/watch_for need no quoting.
    if let Some(ctx) = context {
        cmd.arg("--context").arg(ctx);
    }

    let output = cmd
        .env("GUIDO_SESSION_TOKEN", vision_session_token()?)
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

// Session-token storage (docs/planning/login-membership-plan.md): sign-in
// itself is a plain fetch() from sidebar.js straight to the Worker's
// Better Auth routes (email+password, no browser round trip needed) — the
// only piece that has to live in Rust is holding onto the token it gets
// back somewhere other programs / a stolen laptop's filesystem can't
// casually read, which means the OS's own credential store.
const KEYRING_SERVICE: &str = "guido";
const KEYRING_ACCOUNT: &str = "session_token";

fn session_token_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| format!("couldn't open the OS credential store: {e}"))
}

#[tauri::command]
async fn store_session_token(token: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        session_token_entry()?
            .set_password(&token)
            .map_err(|e| format!("couldn't save the session token: {e}"))
    })
    .await
    .map_err(|e| format!("store_session_token task panicked: {e}"))?
}

// None for "never signed in" (no credential saved yet), distinct from an
// error — same reasoning as load_skills_json's None case above.
#[tauri::command]
async fn get_session_token() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(|| match session_token_entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("couldn't read the session token: {e}")),
    })
    .await
    .map_err(|e| format!("get_session_token task panicked: {e}"))?
}

// Called on sign-out and on a 401 from /api/me (expired/revoked session) —
// sidebar.js falls back to the login view either way. Deleting a
// credential that isn't there is treated as success, not an error.
#[tauri::command]
async fn clear_session_token() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| match session_token_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("couldn't clear the session token: {e}")),
    })
    .await
    .map_err(|e| format!("clear_session_token task panicked: {e}"))?
}

// Shared by region-select/overlay (fill_screen, Overlay layer, see below)
// and sidebar (BL-013, Top layer — see init_layer_shell_sidebar): a plain
// alwaysOnTop toplevel on a tiling Wayland compositor (Sway, Hyprland) can
// get tiled into the current workspace's layout instead of floating above
// everything. Promoting to a layer-shell surface avoids that — layer-shell
// surfaces are never subject to tiling by protocol design. X11 sessions
// (no layer-shell protocol) and macOS/Windows just rely on alwaysOnTop
// instead, via the is_supported() check below; GNOME's Mutter also falls
// through this path, since it never advertises wlr-layer-shell at all
// (confirmed by capturing this app's own WAYLAND_DEBUG=1 registry dump —
// no zwlr_* globals present, not a version gap) — a plain floating
// toplevel is what it gets there, which GNOME (a non-tiling WM) handles
// fine anyway.
//
// Must run before the window is first shown: gtk-layer-shell requires the
// underlying GtkWindow to not be mapped yet (it asserts on this), which is
// why "region-select"/"overlay"/"sidebar" all start with "visible": false
// in tauri.conf.json and this runs ahead of each one's explicit show().
#[cfg(target_os = "linux")]
fn init_layer_shell(
    window: &tauri::WebviewWindow,
    layer: gtk_layer_shell::Layer,
    anchors: &[gtk_layer_shell::Edge],
) -> tauri::Result<()> {
    use gtk_layer_shell::LayerShell;

    let gtk_window = window.gtk_window()?;

    if gtk_layer_shell::is_supported() {
        gtk_window.init_layer_shell();
        gtk_window.set_layer(layer);
        for edge in anchors {
            gtk_window.set_anchor(*edge, true);
        }
        // Layer-shell surfaces get no keyboard focus by default (unlike
        // regular toplevels) — OnDemand lets the compositor still route
        // keydown/text-input to whichever of these actually wants it
        // (region-select's keydown handler, sidebar's login/chat inputs).
        gtk_window.set_keyboard_mode(gtk_layer_shell::KeyboardMode::OnDemand);
    }

    Ok(())
}

// WebKitGTK (the Linux webview backend) has no native permission-prompt
// UI, unlike Chromium/WKWebView on Windows/macOS — an unhandled
// getUserMedia call's `permission-request` signal just falls through to
// its default action, which is deny, and the mic button's
// `getUserMedia` call rejects with a generic "not allowed by the user
// agent" (no separate "no prompt exists" error to tell that apart from an
// actual user denial). Auto-allowing here is safe: the only thing that
// calls getUserMedia is this app's own sidebar.js mic button, not
// arbitrary web content.
#[cfg(target_os = "linux")]
fn init_media_permissions(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    use webkit2gtk::{PermissionRequestExt, WebViewExt};

    window.with_webview(|webview| {
        webview.inner().connect_permission_request(|_webview, request| {
            request.allow();
            true
        });
    })
}

#[cfg(target_os = "linux")]
const FILL_SCREEN: [gtk_layer_shell::Edge; 4] = [
    gtk_layer_shell::Edge::Top,
    gtk_layer_shell::Edge::Bottom,
    gtk_layer_shell::Edge::Left,
    gtk_layer_shell::Edge::Right,
];

// BL-013: promote sidebar to layer-shell Top (not Overlay, which
// region-select/overlay use — Top still lets other apps' menus/tooltips
// draw above the sidebar) only where gtk_layer_shell::is_supported()
// (Sway, Hyprland, KDE's wlroots-based session — never GNOME). Anchored
// to the top-right corner only (not all four edges like fill_screen)
// so the surface keeps its own configured width/height instead of being
// stretched full-screen; falls back to today's plain centered toplevel
// everywhere is_supported() is false.
//
// UNVERIFIED beyond cargo check — see BL-013 in docs/BACKLOG.md. This
// dev machine is GNOME/Mutter, which never advertises wlr-layer-shell, so
// is_supported() is false here and this whole branch never executes
// locally. Two real risks this needs a Sway/Hyprland/KDE session to
// answer, not guessed at: (1) whether window-manager-driven dragging
// still works — the plain-toplevel-with-real-titlebar design this
// replaces was chosen specifically because two earlier drag mechanisms on
// a layer-shell/undecorated surface weren't reliable (see the removed
// comment this replaced, still in git history), and the layer-shell
// protocol itself has no interactive-move request the way xdg_toplevel
// does, so compositor-drawn dragging may simply not exist here at all;
// (2) whether "decorations": true in tauri.conf.json even renders
// anything on a layer-shell surface, since compositors don't apply
// xdg-decoration to layer surfaces.
#[cfg(target_os = "linux")]
fn init_layer_shell_sidebar(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    init_layer_shell(
        window,
        gtk_layer_shell::Layer::Top,
        &[gtk_layer_shell::Edge::Top, gtk_layer_shell::Edge::Right],
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            locate_element,
            verify_substep,
            answer_question,
            research_goal,
            plan_step,
            list_windows,
            capture_backend,
            pick_portal_source,
            load_skills_json,
            save_skills_json,
            refresh_window_rect,
            window_at_point,
            window_icon,
            identify_app,
            store_session_token,
            get_session_token,
            clear_session_token
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

            // BL-013 — see init_layer_shell_sidebar's comment for what's
            // unverified here: window-manager dragging may not exist at
            // all for a layer-shell surface (no interactive-move request),
            // and "decorations": true may render nothing on one, on a
            // real Sway/Hyprland/KDE session — neither has been checked on
            // real hardware. The branch this came from deliberately kept
            // it un-merged for exactly this reason ("kept isolated since
            // this was unsure to work" — see BL-013 in docs/BACKLOG.md);
            // opt-in via env var preserves that caution now that the code
            // itself is merged, rather than silently promoting every
            // Sway/Hyprland/KDE user's sidebar to a state that might ship
            // permanently undraggable. Set GUIDO_LAYER_SHELL_SIDEBAR=1 to
            // try it; unset, every wlroots compositor keeps today's plain
            // decorated toplevel with WM-titlebar dragging, unchanged.
            // Must run before show() (gtk-layer-shell asserts the surface
            // isn't mapped yet), which is why this comes before
            // sidebar.show() below rather than after it like the
            // pre-BL-013 code had.
            #[cfg(target_os = "linux")]
            if std::env::var("GUIDO_LAYER_SHELL_SIDEBAR").as_deref() == Ok("1") {
                init_layer_shell_sidebar(&sidebar)?;
            }

            sidebar.show()?;

            // getUserMedia (the mic button — see startVoiceRecording in
            // sidebar.js) needs the OS webview to actually grant the
            // permission request; see init_media_permissions.
            #[cfg(target_os = "linux")]
            init_media_permissions(&sidebar)?;

            // "region-select" gets layer-shell too (fill_screen, Overlay
            // layer), so it floats above everything (including on a
            // tiling compositor) rather than relying on plain alwaysOnTop.
            // It stays hidden until its own JS shows it for an active drag
            // (see src/region-select.js) — deliberately not shown here.
            #[cfg(target_os = "linux")]
            init_layer_shell(
                &app.get_webview_window("region-select")
                    .expect("\"region-select\" window declared in tauri.conf.json must exist"),
                gtk_layer_shell::Layer::Overlay,
                &FILL_SCREEN,
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
            init_layer_shell(&overlay, gtk_layer_shell::Layer::Overlay, &FILL_SCREEN)?;
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
