// Shared click-to-pick for the live sidebar and the isolated demo.
// The region-select window captures the click; this module turns that
// click into a WindowInfo via window_at_point, trying the coordinate
// spaces macOS Retina / multi-monitor actually produce.

function api() {
  return window.__TAURI__;
}

function uniquePoints(points) {
  const seen = new Set();
  const out = [];
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const key = `${p.x},${p.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x: Math.round(p.x), y: Math.round(p.y) });
  }
  return out;
}

export async function hideOverlayWindows() {
  const t = api();
  if (!t?.event) return;
  try {
    if (t.event.emitTo) {
      await t.event.emitTo("overlay", "tutoria:hide-overlay");
      await t.event.emitTo("excel-demo-overlay", "tutoria:demo-overlay-hide");
    }
    t.event.emit("tutoria:hide-overlay");
    t.event.emit("tutoria:demo-overlay-hide");
  } catch {
    // Overlay windows may not exist in every launch.
  }
}

export async function requestWindowClick() {
  const t = api();
  if (!t?.event) throw new Error("Window pick needs the desktop app.");
  return new Promise(async (resolve, reject) => {
    let settled = false;
    const unlisten = await t.event.listen("tutoria:window-point-selected", (event) => {
      if (settled) return;
      settled = true;
      unlisten();
      resolve(event.payload);
    });
    try {
      if (typeof t.event.emitTo === "function") {
        await t.event.emitTo("region-select", "tutoria:begin-window-select");
      } else {
        await t.event.emit("tutoria:begin-window-select");
      }
    } catch (err) {
      if (!settled) {
        settled = true;
        unlisten();
        reject(err);
      }
    }
  });
}

export async function resolveWindowAtClick(point) {
  const t = api();
  const invoke = t.core.invoke.bind(t.core);
  const monitor = await t.window.getCurrentWindow().currentMonitor();
  const scale = monitor?.scaleFactor || 1;
  const clientX = point.clientX ?? point.x;
  const clientY = point.clientY ?? point.y;

  const candidates = uniquePoints([
    { x: point.x, y: point.y },
    { x: clientX, y: clientY },
    monitor && {
      x: monitor.position.x / scale + clientX,
      y: monitor.position.y / scale + clientY,
    },
    monitor && {
      x: monitor.position.x + clientX * scale,
      y: monitor.position.y + clientY * scale,
    },
    { x: point.screenX, y: point.screenY },
  ].filter(Boolean));

  let lastErr = "no window found at that point";
  for (const p of candidates) {
    try {
      return await invoke("window_at_point", p);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// Hides the calling panel, shows the dimmed click-catcher, resolves the
// click, then shows the panel again. Returns WindowInfo or null (Esc).
export async function pickNativeWindow() {
  const t = api();
  const panel = t.window.getCurrentWindow();
  await hideOverlayWindows();
  await panel.hide();
  try {
    const point = await requestWindowClick();
    if (!point) return null;
    return await resolveWindowAtClick(point);
  } finally {
    await panel.show();
    await panel.setFocus();
  }
}
