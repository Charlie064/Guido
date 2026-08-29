// Phase 1 hardcoded step sequence — see docs/planning/demo-v0.md.
// Goal: "get started with a project in VS Code". Teach/Show only, no
// automation. Each step's action is: screenshot the live screen, ask
// Claude vision to locate the target element, then overlay the box +
// explanation text at that spot. The user performs the step, then
// presses N to advance.
const STEPS = [
  {
    target: "the Open Folder button",
    explanation: "Click here to open your project folder.",
  },
  {
    target: "the Clone Repository button",
    explanation: "Or clone a Git repository to get started.",
  },
  {
    target: "the Search bar in the title bar",
    explanation: "Use this to quickly find commands and files.",
  },
];

const PANEL_COLLAPSED_SIZE = 44;

const { invoke } = window.__TAURI__.core;
const { getCurrentWindow, currentMonitor } = window.__TAURI__.window;

let stepIndex = 0;
let panelExpanded = false;

// Capture region: null means full screen (the default). Otherwise
// {x0,y0,x1,y1} in window CSS px, set by dragging on the overlay. See
// docs/decisions/0003-capture-region-not-window-detection.md — this is a
// user-drawn box, never inferred from window focus.
let region = null;

const statusEl = () => document.querySelector("#status");
const boxEl = () => document.querySelector("#box");
const bubbleEl = () => document.querySelector("#bubble");
const bubbleTextEl = () => document.querySelector("#bubble-text");
const panelEl = () => document.querySelector("#panel");
const panelListEl = () => document.querySelector("#panel-list");
const regionHintEl = () => document.querySelector("#region-hint");
const regionBoxEl = () => document.querySelector("#region-box");
const panelRegionLabelEl = () => document.querySelector("#panel-region-label");

function formatRegionLabel() {
  if (!region) return "Region: full screen";
  const w = Math.round(region.x1 - region.x0);
  const h = Math.round(region.y1 - region.y0);
  return `Region: ${w}×${h} at (${Math.round(region.x0)}, ${Math.round(region.y0)})`;
}

function updateRegionLabel() {
  panelRegionLabelEl().textContent = formatRegionLabel();
}

// Drag-to-select a capture region on the transparent overlay. Releasing
// with no meaningful drag, or pressing Escape, cancels back to the
// full-screen default rather than leaving a stale/tiny region. Resolves
// with the new region (or null for full screen) once selection ends.
function selectRegion() {
  return new Promise((resolve) => {
    document.body.classList.add("selecting-region");
    regionHintEl().style.display = "block";

    let startX = 0;
    let startY = 0;
    let dragging = false;
    const box = regionBoxEl();

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
      if (e.key === "Escape") {
        e.stopPropagation(); // don't let the global Escape handler close the window
        finish(null);
      }
    }

    function finish(newRegion) {
      document.body.classList.remove("selecting-region");
      regionHintEl().style.display = "none";
      box.style.display = "none";
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKeyDown, true);
      region = newRegion;
      updateRegionLabel();
      resolve(region);
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown, true);
  });
}

function renderPanelList() {
  const list = panelListEl();
  list.innerHTML = "";
  STEPS.forEach((step, i) => {
    const li = document.createElement("li");
    li.textContent = `${i + 1}. ${step.target}`;
    if (i === stepIndex) li.classList.add("active");
    else if (i < stepIndex) li.classList.add("done");
    list.appendChild(li);
  });
}

function setPanelExpanded(expanded) {
  panelExpanded = expanded;
  panelEl().classList.toggle("expanded", expanded);
}

function currentPanelFootprint() {
  const panel = panelEl();
  const size = panelExpanded
    ? { width: panel.offsetWidth, height: panel.offsetHeight }
    : { width: PANEL_COLLAPSED_SIZE, height: PANEL_COLLAPSED_SIZE };
  const rect = panel.getBoundingClientRect();
  return { left: rect.left, top: rect.top, right: rect.left + size.width, bottom: rect.top + size.height };
}

function initPanelInteraction() {
  const panel = panelEl();
  const header = document.querySelector("#panel-header");
  const resizeHandle = document.querySelector("#panel-resize");
  const regionRedraw = document.querySelector("#panel-region-redraw");

  panel.addEventListener("click", (e) => {
    if (!panelExpanded) setPanelExpanded(true);
  });
  header.addEventListener("click", (e) => {
    e.stopPropagation();
    setPanelExpanded(false);
  });
  regionRedraw.addEventListener("click", (e) => {
    e.stopPropagation();
    selectRegion();
  });

  // Drag the resize handle to grow the panel further down/right, toward
  // the center of the screen (top-left corner stays anchored in place).
  resizeHandle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = panel.offsetWidth;
    const startHeight = panel.offsetHeight;

    function onMove(moveEvent) {
      const newWidth = Math.max(220, startWidth + (moveEvent.clientX - startX));
      const newHeight = Math.max(160, startHeight + (moveEvent.clientY - startY));
      panel.style.width = `${newWidth}px`;
      panel.style.height = `${newHeight}px`;
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

// The overlay window is resized to exactly match the primary monitor
// (see resizeToMonitor), so vision-model pixel coordinates map 1:1 onto
// window CSS pixels without further scaling. Box/bubble are nudged clear
// of the panel (collapsed icon or expanded list) if they'd land under it.
function positionOverlay(box) {
  const panel = currentPanelFootprint();
  let left = box.x0;
  let top = box.y0;
  const overlapsPanel = left < panel.right && box.x1 > panel.left && top < panel.bottom && box.y1 > panel.top;
  if (overlapsPanel) {
    left = Math.max(left, panel.right + 12);
  }

  const b = boxEl();
  b.style.left = `${left}px`;
  b.style.top = `${box.y0}px`;
  b.style.width = `${box.x1 - box.x0}px`;
  b.style.height = `${box.y1 - box.y0}px`;
  b.style.display = "block";

  const bubble = bubbleEl();
  bubble.style.left = `${left}px`;
  bubble.style.top = `${Math.max(0, box.y0 - 60)}px`;
  bubble.style.display = "block";
}

async function showStep(index) {
  const step = STEPS[index];
  statusEl().textContent = `Step ${index + 1}/${STEPS.length} — locating…`;
  bubbleTextEl().textContent = step.explanation;
  renderPanelList();

  try {
    const box = await invoke("locate_element", { target: step.target });
    positionOverlay(box);
    statusEl().textContent = `Step ${index + 1}/${STEPS.length}`;
  } catch (err) {
    statusEl().textContent = `Step ${index + 1}/${STEPS.length} — detection failed`;
    console.error("locate_element failed:", err);
  }
}

async function next() {
  if (stepIndex >= STEPS.length - 1) {
    statusEl().textContent = "Done — press Escape to quit";
    boxEl().style.display = "none";
    bubbleEl().style.display = "none";
    stepIndex = STEPS.length; // past the last item, so the panel shows all as done
    renderPanelList();
    return;
  }
  stepIndex += 1;
  await showStep(stepIndex);
}

async function resizeToMonitor() {
  const win = getCurrentWindow();
  const monitor = await currentMonitor();
  if (monitor) {
    await win.setSize(monitor.size);
    await win.setPosition(monitor.position);
  }
}

window.addEventListener("keydown", (e) => {
  if (e.key === "n" || e.key === "N" || e.key === "Enter") {
    next();
  } else if (e.key === "Escape") {
    getCurrentWindow().close();
  }
});

window.addEventListener("DOMContentLoaded", async () => {
  initPanelInteraction();
  renderPanelList();
  updateRegionLabel();
  await resizeToMonitor();
  await selectRegion();
  await showStep(stepIndex);
});
