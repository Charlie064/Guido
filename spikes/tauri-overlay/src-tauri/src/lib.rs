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

// vision-detect lives at spikes/vision-detect, a sibling of this crate's
// grandparent dir (spikes/tauri-overlay/src-tauri) — resolved from
// CARGO_MANIFEST_DIR so it doesn't depend on the process's cwd.
fn vision_detect_dir() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("vision-detect")
}

#[tauri::command]
fn locate_element(target: String) -> Result<Box2D, String> {
    let dir = vision_detect_dir();
    let python = dir.join(".venv").join("bin").join("python3");
    let script = dir.join("live_step.py");

    let output = Command::new(&python)
        .arg(&script)
        .arg(&target)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![locate_element])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
