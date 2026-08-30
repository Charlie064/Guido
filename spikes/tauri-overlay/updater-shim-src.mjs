// Bundled by `npm run build:updater-shim` into src/vendor/tauri-updater.js
// — a single dependency-free ESM file the app can import directly, since
// this project has no frontend bundler (sidebar.js loads plain modules
// straight out of src/, relying on window.__TAURI__ for the core API
// instead of @tauri-apps/api). Re-bundle after bumping either package.
export { check } from "@tauri-apps/plugin-updater";
export { relaunch } from "@tauri-apps/plugin-process";
