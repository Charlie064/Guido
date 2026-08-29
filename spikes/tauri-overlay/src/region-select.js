// The region-drag window — see the comment at the top of
// region-select.html for why this drag lives in its own window instead of
// toggling main's click-through state. This window is always fully
// interactive (nothing here ever calls setIgnoreCursorEvents); "hidden"
// means a real window hide(), not a cursor-passthrough toggle, which is
// the more reliable operation that motivated this whole split.
const { getCurrentWindow, currentMonitor } = window.__TAURI__.window;
const { emit, listen } = window.__TAURI__.event;

const boxEl = () => document.querySelector("#box");
const hintEl = () => document.querySelector("#hint");

async function resizeToMonitor() {
  const win = getCurrentWindow();
  const monitor = await currentMonitor();
  if (monitor) {
    await win.setSize(monitor.size);
    await win.setPosition(monitor.position);
  }
}

// Runs one drag-to-select gesture: shows this window, captures the drag,
// hides this window again, and emits the result. Resolves once done.
function runSelection() {
  return new Promise(async (resolve) => {
    const win = getCurrentWindow();
    hintEl().innerHTML = 'Drag to select a capture region — <kbd>Esc</kbd> or click for full screen';
    document.body.classList.add("active");
    await win.show();
    await win.setFocus();

    let startX = 0;
    let startY = 0;
    let dragging = false;
    const box = boxEl();

    function onMouseDown(e) {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      box.style.left = `${startX}px`;
      box.style.top = `${startY}px`;
      box.style.width = "0px";
      box.style.height = "0px";
      box.style.display = "block";
    }

    function bounds(e) {
      return {
        x0: Math.min(startX, e.clientX),
        y0: Math.min(startY, e.clientY),
        x1: Math.max(startX, e.clientX),
        y1: Math.max(startY, e.clientY),
      };
    }

    function onMouseMove(e) {
      if (!dragging) return;
      const b = bounds(e);
      box.style.left = `${b.x0}px`;
      box.style.top = `${b.y0}px`;
      box.style.width = `${b.x1 - b.x0}px`;
      box.style.height = `${b.y1 - b.y0}px`;
    }

    function onMouseUp(e) {
      if (!dragging) return;
      dragging = false;
      const b = bounds(e);
      const MIN_SIZE = 8; // px — below this, treat it as an accidental click, not a drag
      finish(b.x1 - b.x0 > MIN_SIZE && b.y1 - b.y0 > MIN_SIZE ? b : null);
    }

    function onKeyDown(e) {
      if (e.key === "Escape") finish(null);
    }

    async function finish(region) {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKeyDown);
      box.style.display = "none";
      document.body.classList.remove("active");
      await win.hide();
      resolve(region);
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown);
  });
}

// Runs one click-to-pick-a-window gesture: shows this window (crosshair
// cursor, dimmed screen — same click-catcher this file already had for
// region-drag, see the file-header comment on region-select.html for why
// a real window, not a click-through toggle), waits for a single click,
// hides itself, and resolves with the click point in absolute screen px
// (this window is sized+positioned to exactly cover the monitor via
// resizeToMonitor, so clientX/clientY already are screen coordinates —
// same space region-drag's box already used). The caller (sidebar.js)
// resolves that point to a window via the `window_at_point` command,
// since this window itself is hidden by the time that query runs and so
// can never be the "window" a click resolves to.
function runClickSelect() {
  return new Promise(async (resolve) => {
    const win = getCurrentWindow();
    hintEl().innerHTML = 'Click the window you want to select — <kbd>Esc</kbd> for full screen';
    document.body.classList.add("active");
    await win.show();
    await win.setFocus();

    function onClick(e) {
      finish({ x: e.clientX, y: e.clientY });
    }

    function onKeyDown(e) {
      if (e.key === "Escape") finish(null);
    }

    async function finish(point) {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("active");
      await win.hide();
      resolve(point);
    }

    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
  });
}

listen("guido:begin-region-select", async () => {
  const region = await runSelection();
  emit("guido:region-selected", region);
});

listen("guido:begin-window-select", async () => {
  const point = await runClickSelect();
  emit("guido:window-point-selected", point);
});

listen("guido:quit", () => getCurrentWindow().close());

window.addEventListener("DOMContentLoaded", resizeToMonitor);
