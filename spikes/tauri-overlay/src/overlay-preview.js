// Shared click-through preview onto excel-demo-overlay. Used by the
// isolated Excel demo harness. sidebar.js still has its own copy so the
// real app does not depend on this module.

export function overlayItemsFor(sub) {
  const base = sub.overlays?.length
    ? sub.overlays
    : sub.last_known_bbox
      ? [{
          bbox: sub.last_known_bbox,
          title: sub.target_description || "Here",
          text: sub.instruction_text || "",
        }]
      : [{
          title: sub.target_description || "Here",
          text: sub.instruction_text || "",
        }];
  const items = [];
  for (let i = 0; i < 3; i++) {
    const src = base[i] || base[i % base.length];
    items.push({
      title: src.title || sub.target_description || `Spot ${i + 1}`,
      text: src.text || sub.instruction_text || "",
    });
  }
  return items;
}

export async function getDemoOverlayWindow() {
  const api = window.__TAURI__;
  const Ctor = api?.webviewWindow?.WebviewWindow || api?.window?.WebviewWindow;
  if (typeof Ctor?.getByLabel === "function") {
    try {
      return await Ctor.getByLabel("excel-demo-overlay");
    } catch {
      return null;
    }
  }
  if (typeof api?.webviewWindow?.getByLabel === "function") {
    try {
      return await api.webviewWindow.getByLabel("excel-demo-overlay");
    } catch {
      return null;
    }
  }
  return null;
}

function monitorLogical(monitor) {
  const scale = monitor.scaleFactor || 1;
  return {
    x: monitor.position.x / scale,
    y: monitor.position.y / scale,
    width: monitor.size.width / scale,
    height: monitor.size.height / scale,
  };
}

function overlaps(a, b, gap = 72) {
  return !(
    a.left + a.width + gap < b.left
    || b.left + b.width + gap < a.left
    || a.top + a.height + gap < b.top
    || b.top + b.height + gap < a.top
  );
}

// Three highlight+callout popups, re-rolled every click, scattered
// across the live screen (the selected window if we have one).
function scatterThree(items, frame, mon) {
  const area = {
    left: frame.x - mon.x,
    top: frame.y - mon.y,
    width: frame.width,
    height: frame.height,
  };
  const pad = 28;
  const placed = [];
  return items.slice(0, 3).map((item, i) => {
    const width = 88 + Math.random() * 150;
    const height = 36 + Math.random() * 56;
    const maxLeft = Math.max(pad, area.width - width - pad);
    const maxTop = Math.max(pad, area.height - height - pad);
    let box = null;
    for (let attempt = 0; attempt < 28; attempt++) {
      const next = {
        left: area.left + pad + Math.random() * maxLeft,
        top: area.top + pad + Math.random() * maxTop,
        width,
        height,
      };
      if (!placed.some((p) => overlaps(p, next))) {
        box = next;
        break;
      }
    }
    if (!box) {
      box = {
        left: area.left + pad + (i * (area.width / 3)),
        top: area.top + pad + ((i % 2) * (area.height / 3)),
        width,
        height,
      };
    }
    placed.push(box);
    return {
      n: i + 1,
      origin: item.origin,
      title: item.title,
      text: item.text,
      ...box,
    };
  });
}

function rectOf(win) {
  return {
    x: Number(win.x) || 0,
    y: Number(win.y) || 0,
    width: Number(win.width) || 0,
    height: Number(win.height) || 0,
  };
}

// macOS CGWindow bounds are points (same space as CSS / logical monitor).
// X11/Win rects are often physical — if the picked window is clearly in
// that space, shrink it to match the overlay's CSS coordinates.
function frameForOverlay(win, mon, scale) {
  const rect = rectOf(win);
  const asPhysical = {
    x: rect.x / scale,
    y: rect.y / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  };
  const logicalErr = Math.abs(rect.width - mon.width);
  const physicalErr = Math.abs(asPhysical.width - mon.width);
  return physicalErr + 40 < logicalErr ? asPhysical : rect;
}

async function liveFrame(selectedWindow, mon, scale) {
  if (!selectedWindow?.id) return null;
  try {
    const rect = await window.__TAURI__.core.invoke("refresh_window_rect", {
      id: selectedWindow.id,
    });
    return frameForOverlay(rect, mon, scale);
  } catch {
    return frameForOverlay(selectedWindow, mon, scale);
  }
}

export async function showOverlayItems(items, { origin = "ai", selectedWindow = null } = {}) {
  const api = window.__TAURI__;
  if (!api?.window || !items?.length) {
    return { ok: false, error: "Overlay is only available in the desktop demo." };
  }
  try {
    const { getCurrentWindow, PhysicalPosition, PhysicalSize } = api.window;
    const emitTo = api.event?.emitTo;
    const emit = api.event?.emit;
    const monitor = await getCurrentWindow().currentMonitor();
    if (!monitor) return { ok: false, error: "No monitor geometry for the overlay." };

    const mon = monitorLogical(monitor);

    const win = await getDemoOverlayWindow();
    if (!win) return { ok: false, error: "Demo overlay window is missing." };

    if (PhysicalPosition && PhysicalSize) {
      await win.setPosition(new PhysicalPosition(monitor.position.x, monitor.position.y));
      await win.setSize(new PhysicalSize(monitor.size.width, monitor.size.height));
    } else {
      await win.setPosition(monitor.position);
      await win.setSize(monitor.size);
    }
    await win.show();
    try {
      await win.setIgnoreCursorEvents(true);
    } catch {
      // GTK aborts ignore-cursor-events before realize; show() already did that.
    }

    const payload = {
      items: scatterThree(
        items.map((item) => ({ ...item, origin: item.origin || origin })),
        mon,
        mon,
      ),
    };
    if (typeof emitTo === "function") {
      await emitTo("excel-demo-overlay", "tutoria:demo-overlay-show", payload);
    } else {
      await emit("tutoria:demo-overlay-show", payload);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function hideOverlayItems() {
  const api = window.__TAURI__;
  try {
    if (typeof api?.event?.emitTo === "function") {
      await api.event.emitTo("excel-demo-overlay", "tutoria:demo-overlay-hide");
    } else {
      api?.event?.emit("tutoria:demo-overlay-hide");
    }
    const win = await getDemoOverlayWindow();
    if (win) await win.hide();
  } catch {
    // Closing the harness should not throw from hide.
  }
}
