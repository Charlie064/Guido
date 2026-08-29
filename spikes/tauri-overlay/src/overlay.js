// Draws the real on-screen highlight + text callout for one substep. See
// overlay.html's style comment for why this window is permanently
// click-through and must stay that way.
//
// Coordinate model (this is the whole point of the file — see
// docs/decisions/0005-window-anchored-overlay-coordinates.md):
//
//   stored bbox            fractions of the frame it was captured against
//     x0/image_width  ->   0..1
//   live frame rect        that frame's CURRENT geometry, re-polled
//     window_provider      physical screen px
//   screen position        frac * live rect + rect origin
//   CSS position           (screen px - monitor origin) / scaleFactor
//
// The last step is the one that's easy to miss: screenshots and OS window
// rects are in *physical* pixels, but CSS px inside this window are
// *logical*. On a 1.0-scale display they're identical, which is exactly
// why a missing conversion here would look fine on most machines and be
// silently wrong on any HiDPI/fractional-scaling one.
//
// The re-poll is what makes a resize survivable: nothing is drawn from a
// cached rect, so moving or resizing the target app just moves the box on
// the next tick. Polling (not native move/resize event hooks) is a
// deliberate choice — ADR 0005 deferred the per-platform event backends,
// and ~5 cheap OS queries/sec while an overlay is visible buys the same
// behavior with no new platform code. Cost is a frame or two of lag while
// dragging, which is acceptable for a highlight.
const { getCurrentWindow, currentMonitor, PhysicalPosition, PhysicalSize } = window.__TAURI__.window;
const { emit, listen } = window.__TAURI__.event;
const { invoke } = window.__TAURI__.core;

const POLL_MS = 200;

const els = {
  box: document.querySelector("#box"),
  callout: document.querySelector("#callout"),
  calloutTarget: document.querySelector("#callout-target"),
  calloutInstruction: document.querySelector("#callout-instruction"),
  notice: document.querySelector("#notice"),
};

// The substep currently being shown: { bbox, targetDescription, instructionText }
let active = null;
let pollTimer = null;
// Monitor geometry, refreshed alongside each show — this window is sized
// and positioned to cover it exactly, so its origin is the reference all
// CSS positions are relative to.
let monitor = null;

async function coverMonitor() {
  monitor = await currentMonitor();
  if (!monitor) return;
  const win = getCurrentWindow();
  await win.setPosition(new PhysicalPosition(monitor.position.x, monitor.position.y));
  await win.setSize(new PhysicalSize(monitor.size.width, monitor.size.height));
}

// Physical screen px -> this window's CSS px. See the file header.
function toScreenCss(x, y) {
  const scale = monitor?.scaleFactor ?? 1;
  const originX = monitor?.position.x ?? 0;
  const originY = monitor?.position.y ?? 0;
  return { x: (x - originX) / scale, y: (y - originY) / scale };
}

// Resolves the bbox's stored fractions against the frame's *current*
// geometry. Returns physical screen px, or null if the frame can't be
// resolved right now (window closed, no live rect on this platform).
async function resolveScreenRect(bbox) {
  const fx0 = bbox.x0 / bbox.image_width;
  const fy0 = bbox.y0 / bbox.image_height;
  const fx1 = bbox.x1 / bbox.image_width;
  const fy1 = bbox.y1 / bbox.image_height;

  let frame;
  if (bbox.anchor?.kind === "portal" && !bbox.anchor.screen) {
    // A *window*-scoped portal capture (Wayland) deliberately never
    // discloses where the source is on screen — the compositor hands over
    // frames, not geometry (see FrameAnchor::Portal in lib.rs). There is
    // therefore no correct place to draw a box: any guess would be
    // confidently wrong. Refuse rather than draw somewhere
    // plausible-looking, and let the caller fall back to the in-panel
    // schematic. A *screen*-scoped portal capture is different — the frame
    // is a whole monitor, so it falls through to the monitor branch below.
    return { unsupported: "portal" };
  }
  if (bbox.anchor?.kind === "window") {
    // The live re-query. Throws if the window is gone — surfaced to the
    // user as a notice rather than silently drawing nothing.
    const win = await invoke("refresh_window_rect", { id: bbox.anchor.id });
    frame = { x: win.x, y: win.y, width: win.width, height: win.height };
  } else {
    // Region / full-screen / screen-scoped-portal anchor: there's no live
    // handle to re-resolve
    // (ADR 0003 — a free-drawn region isn't tracked), so the frame is
    // assumed to be the whole current monitor. Correct for a full-screen
    // capture and for fixture data (fake-skill.js's 1920x1080 reference);
    // wrong by exactly the region's offset/size for a genuinely
    // sub-screen drawn region, which is a known limit of region capture,
    // not a bug here.
    //
    // Also correct for a screen-scoped portal capture, whose frame is by
    // construction exactly one monitor. Known limit with several monitors:
    // this uses the monitor the overlay is on, which need not be the one
    // the user shared. The portal does report the shared monitor's
    // `position` (see portal_capture.py) if that ever needs fixing.
    if (!monitor) return null;
    frame = {
      x: monitor.position.x,
      y: monitor.position.y,
      width: monitor.size.width,
      height: monitor.size.height,
    };
  }

  return {
    x0: frame.x + fx0 * frame.width,
    y0: frame.y + fy0 * frame.height,
    x1: frame.x + fx1 * frame.width,
    y1: frame.y + fy1 * frame.height,
  };
}

function showNotice(text) {
  els.notice.textContent = text;
  els.notice.style.display = "block";
  els.box.style.display = "none";
  els.callout.style.display = "none";
}

function hideNotice() {
  els.notice.style.display = "none";
}

// Picks whichever side of the highlight box actually has room for the
// callout — below, then above, then right, then left — instead of only
// ever choosing between below/above (the previous behavior: an element
// hard against the left or right edge with no room above or below used
// to fall back to a horizontally-clamped "below" placement that could
// still overlap the box). Pure geometry against the four available-space
// measurements; no AI involved, and no reason for it to be — this is a
// deterministic layout problem, not a judgment call.
function placeCallout({ boxLeft, boxTop, boxWidth, boxHeight, cw, ch, viewW, viewH, gap }) {
  const spaceBelow = viewH - (boxTop + boxHeight) - gap;
  const spaceAbove = boxTop - gap;
  const spaceRight = viewW - (boxLeft + boxWidth) - gap;
  const spaceLeft = boxLeft - gap;

  let left, top;
  if (spaceBelow >= ch) {
    top = boxTop + boxHeight + gap;
    left = boxLeft;
  } else if (spaceAbove >= ch) {
    top = boxTop - ch - gap;
    left = boxLeft;
  } else if (spaceRight >= cw) {
    left = boxLeft + boxWidth + gap;
    top = boxTop;
  } else if (spaceLeft >= cw) {
    left = boxLeft - cw - gap;
    top = boxTop;
  } else {
    // Nothing fully fits — the target roughly fills the screen. Falls
    // back to the same below-and-clamp placement this function replaces,
    // so there's always a deterministic answer rather than an unhandled
    // case.
    top = boxTop + boxHeight + gap;
    left = boxLeft;
  }

  // Clamp into the viewport regardless of which side was chosen — a
  // right/left placement can still run off the opposite edge for a wide
  // callout near a corner.
  if (left + cw > viewW - 8) left = viewW - cw - 8;
  if (left < 8) left = 8;
  if (top + ch > viewH - 8) top = viewH - ch - 8;
  if (top < 8) top = 8;

  return { left, top };
}

async function draw() {
  if (!active) return;

  let rect;
  try {
    rect = await resolveScreenRect(active.bbox);
  } catch (err) {
    showNotice(`Can't follow that window anymore — ${err}`);
    return;
  }
  if (rect?.unsupported === "portal") {
    // Stop polling — this can never start working for this bbox, so
    // retrying 5x/sec would just re-render the same notice forever.
    stopPolling();
    showNotice("Can't draw on screen for a single-window share — re-pick and choose a whole screen, or use the diagram.");
    return;
  }
  if (!rect) {
    showNotice("No screen geometry available to draw against.");
    return;
  }
  hideNotice();

  const topLeft = toScreenCss(rect.x0, rect.y0);
  const bottomRight = toScreenCss(rect.x1, rect.y1);
  const width = Math.max(bottomRight.x - topLeft.x, 6);
  const height = Math.max(bottomRight.y - topLeft.y, 6);

  els.box.style.left = `${topLeft.x}px`;
  els.box.style.top = `${topLeft.y}px`;
  els.box.style.width = `${width}px`;
  els.box.style.height = `${height}px`;
  els.box.style.display = "block";

  // Callout placement: prefers below, then above, then right, then left —
  // whichever side actually has room for it, rather than only ever
  // choosing between below/above. Measured after display:block so
  // offsetWidth/Height are real.
  els.callout.style.display = "block";
  const GAP = 10;
  const viewW = document.documentElement.clientWidth;
  const viewH = document.documentElement.clientHeight;
  const cw = els.callout.offsetWidth;
  const ch = els.callout.offsetHeight;

  const { left, top } = placeCallout({
    boxLeft: topLeft.x,
    boxTop: topLeft.y,
    boxWidth: width,
    boxHeight: height,
    cw,
    ch,
    viewW,
    viewH,
    gap: GAP,
  });

  els.callout.style.left = `${left}px`;
  els.callout.style.top = `${top}px`;
}

async function show(payload) {
  active = payload;
  els.calloutTarget.textContent = payload.targetDescription ?? "";
  els.calloutInstruction.textContent = payload.instructionText ?? "";

  await coverMonitor();
  await getCurrentWindow().show();
  await draw();

  if (pollTimer === null) {
    pollTimer = setInterval(draw, POLL_MS);
  }
}

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function hide() {
  active = null;
  stopPolling();
  els.box.style.display = "none";
  els.callout.style.display = "none";
  hideNotice();
  await getCurrentWindow().hide();
}

listen("tutoria:show-overlay", (event) => show(event.payload));
listen("tutoria:hide-overlay", () => hide());
listen("tutoria:quit", () => getCurrentWindow().close());
