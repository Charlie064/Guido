// Phase 1 hardcoded step sequence — see docs/planning/demo-v0.md.
// Goal: "get started with a project in VS Code". Teach/Show only, no
// automation — the user performs each step, then presses N to advance.
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

const { invoke } = window.__TAURI__.core;
const { getCurrentWindow, currentMonitor } = window.__TAURI__.window;

let stepIndex = 0;

const statusEl = () => document.querySelector("#status");
const boxEl = () => document.querySelector("#box");
const bubbleEl = () => document.querySelector("#bubble");
const bubbleTextEl = () => document.querySelector("#bubble-text");

// The overlay window is resized to exactly match the primary monitor
// (see resizeToMonitor), so vision-model pixel coordinates map 1:1 onto
// window CSS pixels without further scaling.
function positionOverlay(box) {
  const b = boxEl();
  b.style.left = `${box.x0}px`;
  b.style.top = `${box.y0}px`;
  b.style.width = `${box.x1 - box.x0}px`;
  b.style.height = `${box.y1 - box.y0}px`;
  b.style.display = "block";

  const bubble = bubbleEl();
  bubble.style.left = `${box.x0}px`;
  bubble.style.top = `${Math.max(0, box.y0 - 60)}px`;
  bubble.style.display = "block";
}

async function showStep(index) {
  const step = STEPS[index];
  statusEl().textContent = `Step ${index + 1}/${STEPS.length} — locating…`;
  bubbleTextEl().textContent = step.explanation;

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
  await resizeToMonitor();
  await showStep(stepIndex);
});
