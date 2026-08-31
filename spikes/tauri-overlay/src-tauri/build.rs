use std::env;
use std::fs;
use std::path::Path;

// tauri-build's own build script (invoked below) checks that every
// tauri.conf.json `bundle.externalBin` path exists on *every* cargo
// build — including a plain `cargo check`, not just an actual
// `tauri build` — so a machine without the PyInstaller sidecars built
// (every dev machine; CI builds them in a separate step right before
// `tauri build`, see .github/workflows/release.yml and
// docs/features/vision.md) would fail to compile at all without this.
//
// These are placeholders, not stand-ins meant to run: they're empty
// (zero-byte) files, deliberately distinguishable from a real multi-MB
// PyInstaller binary. lib.rs's `sidecar_path()` treats a zero-byte file
// as "not actually there" and falls back to the dev `.venv`, so local
// `tauri dev` keeps using real Python scripts exactly as before this
// existed — only `tauri-build`'s existence check ever "sees" these.
// Never overwrites a file that's already there, so CI's real sidecars
// (built before this runs, as part of the same `cargo build` `tauri
// build` triggers) are left alone.
const SIDECAR_NAMES: &[&str] = &[
    "verify_step",
    "answer_step",
    "identify_app",
    "plan_step",
    "research",
    "live_step",
    "portal_capture",
];

fn ensure_sidecar_placeholders() {
    let Ok(triple) = env::var("TARGET") else { return };
    let ext = if triple.contains("windows") { ".exe" } else { "" };
    let dir = Path::new("binaries");
    if fs::create_dir_all(dir).is_err() {
        return;
    }
    for name in SIDECAR_NAMES {
        let path = dir.join(format!("{name}-{triple}{ext}"));
        if !path.exists() {
            let _ = fs::write(&path, b"");
        }
    }
}

fn main() {
    ensure_sidecar_placeholders();
    tauri_build::build()
}
