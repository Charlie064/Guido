// The whole app now lives in this one window — see the comment at the
// top of sidebar.html for why main/icon/app were collapsed into it.
// Collapsed = just the icon (small, 80x80, see tauri.conf.json); expanded
// = a resized panel showing one of login/setup/skills/path/chat. Growing
// the window is a real resize (via the resize_sidebar command — see its
// doc comment in lib.rs for why that goes through GTK directly instead
// of Tauri's setSize), not a CSS reveal, since the window itself is small
// when collapsed.
//
// Highlighting no longer draws a box on the real screen at all: that was
// a full-screen always-on-top window ("main"), and even permanently
// click-through, it turned out to be the thing actually blocking clicks
// into the app being taught (a decorated, non-click-through app window
// covering the middle of the screen has the same problem — any real,
// interactive window does). So "showing" a substep now renders a small
// schematic diagram inline, in this panel — see renderSchematic below.
import { SKILLS, nextCannedReply } from "./fake-skill.js";

const { getCurrentWindow } = window.__TAURI__.window;
const { emit, listen } = window.__TAURI__.event;
const { invoke } = window.__TAURI__.core;

const COLLAPSED_SIZE = { width: 80, height: 80 };
const EXPANDED_SIZE = { width: 380, height: 560 };

// Top-left screen position of the collapsed icon, in absolute px. Starts
// at tauri.conf.json's configured x/y (the same value init_layer_shell
// reads at startup via outer_position()) and is updated locally as the
// user drags — see the pointer handlers below and move_sidebar in lib.rs.
// Not persisted across restarts: an out-of-scope follow-up, not an
// oversight (see docs/planning/mvp-build-plan.md for what's tracked).
let COLLAPSED_POSITION = { x: 24, y: 24 };

// Capture region: null means full screen (the default). Otherwise
// {x0,y0,x1,y1} in screen px, set once during setup. See
// docs/decisions/0003-capture-region-not-window-detection.md — this is a
// user-drawn box, never inferred from window focus. Threading this into
// the live locate_element call (rather than only display) is tracked
// separately; this file focuses on the UI shape.
let region = null;

let currentSkill = null;
let currentStep = null;
const expandedSteps = new Set();

const els = {
  collapsed: document.querySelector("#collapsed"),
  panel: document.querySelector("#panel"),
  barBack: document.querySelector("#bar-back"),
  barTitle: document.querySelector("#bar-title"),
  barSubtitle: document.querySelector("#bar-subtitle"),
};

const views = {
  login: document.querySelector("#view-login"),
  setup: document.querySelector("#view-setup"),
  skills: document.querySelector("#view-skills"),
  path: document.querySelector("#view-path"),
  chat: document.querySelector("#view-chat"),
};

// view -> [title, subtitle getter, back-target-or-null]
function viewMeta(name) {
  switch (name) {
    case "login":
      return ["Guido", "", null];
    case "setup":
      return ["Set up", "", null];
    case "skills":
      return ["Your skills", "", null];
    case "path":
      return [currentSkill.title, currentSkill.goal, "skills"];
    case "chat":
      return [currentStep.title, "", "path"];
    default:
      return ["Guido", "", null];
  }
}

let currentView = "login";

function showView(name) {
  currentView = name;
  for (const [key, el] of Object.entries(views)) {
    el.classList.toggle("active", key === name);
  }
  const [title, subtitle, backTarget] = viewMeta(name);
  els.barTitle.textContent = title;
  els.barSubtitle.textContent = subtitle;
  els.barBack.hidden = !backTarget;
  els.panel.classList.toggle("login-skin", name === "login");
  els.barBack.onclick = backTarget ? () => showView(backTarget) : null;
}

// ---------- Collapse / expand ----------

async function setShellSize(size) {
  await invoke("resize_sidebar", { width: size.width, height: size.height });
}

async function expand() {
  await setShellSize(EXPANDED_SIZE);
  els.collapsed.classList.add("hidden");
  els.panel.classList.add("active");
  await getCurrentWindow().setFocus();
}

async function collapse() {
  els.panel.classList.remove("active");
  els.collapsed.classList.remove("hidden");
  await setShellSize(COLLAPSED_SIZE);
}

// ---------- Collapsed icon: fixed size, drag-to-move ----------
//
// Ctrl+wheel / ctrl+-/+/0 / pinch is WebKitGTK's page-zoom gesture, not a
// CSS-addressable behavior — it has to be intercepted here. Without this,
// zooming the (invisible, 80x80, content-less) page makes the icon appear
// to grow and drift inside its own window, which is the "weird zoom/move"
// this whole block exists to kill. touch-action: none in sidebar.html
// covers the pinch/two-finger-pan half.
window.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey) e.preventDefault();
  },
  { passive: false },
);
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey && (e.key === "+" || e.key === "-" || e.key === "=" || e.key === "0")) {
    e.preventDefault();
  }
});

// Real repositioning (the only way to "move" the icon now) is a drag
// gesture on the icon itself, backed by the move_sidebar command — see
// its doc comment in lib.rs for why a layer-shell surface can't use
// Tauri's native window drag. A short movement threshold distinguishes a
// drag from a plain click-to-expand.
const panelIcon = document.querySelector("#panel-icon");
const DRAG_THRESHOLD_PX = 4;
let dragState = null;

panelIcon.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  dragState = {
    pointerId: e.pointerId,
    startScreenX: e.screenX,
    startScreenY: e.screenY,
    originX: COLLAPSED_POSITION.x,
    originY: COLLAPSED_POSITION.y,
    moved: false,
  };
  panelIcon.setPointerCapture(e.pointerId);
});

panelIcon.addEventListener("pointermove", (e) => {
  if (!dragState || e.pointerId !== dragState.pointerId) return;
  const dx = e.screenX - dragState.startScreenX;
  const dy = e.screenY - dragState.startScreenY;
  if (!dragState.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
  dragState.moved = true;
  panelIcon.classList.add("dragging");
  COLLAPSED_POSITION = { x: dragState.originX + dx, y: dragState.originY + dy };
  invoke("move_sidebar", { x: Math.round(COLLAPSED_POSITION.x), y: Math.round(COLLAPSED_POSITION.y) });
});

function endDrag(e) {
  if (!dragState || e.pointerId !== dragState.pointerId) return;
  panelIcon.releasePointerCapture(e.pointerId);
  panelIcon.classList.remove("dragging");
  const wasDrag = dragState.moved;
  dragState = null;
  if (!wasDrag) expand();
}

panelIcon.addEventListener("pointerup", endDrag);
panelIcon.addEventListener("pointercancel", endDrag);

document.querySelector("#bar-collapse").addEventListener("click", collapse);

// ---------- Region setup ----------

function formatRegionLabel() {
  if (!region) return "Region: full screen";
  const w = Math.round(region.x1 - region.x0);
  const h = Math.round(region.y1 - region.y0);
  return `Region: ${w}×${h} at (${Math.round(region.x0)}, ${Math.round(region.y0)})`;
}

// Delegates the actual drag gesture to the region-select window (see its
// own comment for why that isn't done by making this window interactive
// over the whole screen instead). This window hides itself for the
// duration — nothing else needs to coordinate that anymore, since main
// (which used to own this dance) no longer exists.
async function selectRegion() {
  await getCurrentWindow().hide();

  const newRegion = await new Promise(async (resolve) => {
    const unlisten = await listen("tutoria:region-selected", (event) => {
      unlisten();
      resolve(event.payload);
    });
    emit("tutoria:begin-region-select");
  });

  region = newRegion;
  document.querySelector("#setup-region-label").textContent = formatRegionLabel();
  await getCurrentWindow().show();
  await getCurrentWindow().setFocus();
}

document.querySelector("#setup-region-select").addEventListener("click", selectRegion);
document.querySelector("#setup-continue").addEventListener("click", () => {
  renderSkillsList();
  showView("skills");
});

// ---------- Login ----------

document.querySelector("#login-continue").addEventListener("click", () => {
  showView("setup");
});

document.querySelector("#login-google").addEventListener("click", async () => {
  try {
    await invoke("start_google_login");
  } catch {
    window.open("https://tutoria-website.guidotutor.workers.dev/login", "_blank");
  }
});

// ---------- Skills list ----------

function renderSkillsList() {
  const list = document.querySelector("#skills-list");
  list.innerHTML = "";

  for (const skill of SKILLS) {
    const generated = skill.steps.filter((s) => s.generated).length;
    const card = document.createElement("div");
    card.className = "skill-card";
    card.innerHTML = `<h3>${skill.title}</h3><p>${generated}/${skill.steps.length} steps ready · “${skill.goal}”</p>`;
    card.addEventListener("click", () => openSkill(skill));
    list.appendChild(card);
  }

  if (SKILLS.length === 0) {
    const empty = document.createElement("div");
    empty.className = "skill-card skill-card-empty";
    empty.textContent = "Ask a question above to generate your first skill.";
    list.appendChild(empty);
  }
}

let nextSkillId = SKILLS.length + 1;

// Research is one-shot per chat, text-only (no screenshot) — see
// docs/features/skills.md. It returns coarse top-level steps (title +
// brief + watch_for — goal-scoped facts only, nothing screen-specific);
// substeps are generated later, lazily, once the user actually reaches
// each step (see openStep/the per-step chat view below).
async function submitNewGoal() {
  const input = document.querySelector("#new-goal-input");
  const button = document.querySelector("#new-goal-send");
  const errorEl = document.querySelector("#new-goal-error");
  const goal = input.value.trim();
  if (!goal) return;

  input.disabled = true;
  button.disabled = true;
  errorEl.textContent = "";
  const previousPlaceholder = input.placeholder;
  input.placeholder = "Researching…";
  input.value = "";

  try {
    const researchSteps = await invoke("research_goal", { goal });
    const skill = {
      id: `skill-${nextSkillId++}`,
      title: goal,
      goal,
      steps: researchSteps.map((step, i) => ({
        id: `s${i + 1}`,
        title: step.title,
        brief: step.brief,
        watch_for: step.watch_for,
        generated: false,
        substeps: [],
      })),
    };
    SKILLS.push(skill);
    openSkill(skill);
  } catch (err) {
    errorEl.textContent = `Couldn't research that: ${err}`;
  } finally {
    input.disabled = false;
    button.disabled = false;
    input.placeholder = previousPlaceholder;
    renderSkillsList();
  }
}

document.querySelector("#new-goal-send").addEventListener("click", submitNewGoal);
document.querySelector("#new-goal-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitNewGoal();
});

function openSkill(skill) {
  currentSkill = skill;
  expandedSteps.clear();
  renderPath();
  showView("path");
}

// ---------- Path view ----------

function renderPath() {
  const body = document.querySelector("#path-body");
  body.innerHTML = "";

  currentSkill.steps.forEach((step, i) => {
    const isLast = i === currentSkill.steps.length - 1;
    const expanded = expandedSteps.has(step.id);

    const row = document.createElement("div");
    row.className = "step-row";

    const rail = document.createElement("div");
    rail.className = "step-rail";
    rail.innerHTML = `<div class="step-dot ${step.generated ? "" : "locked"}"></div>${
      isLast ? "" : '<div class="step-line"></div>'
    }`;
    row.appendChild(rail);

    const main = document.createElement("div");
    main.className = "step-main";

    const head = document.createElement("div");
    head.className = `step-head ${step.generated ? "" : "locked"}`;
    head.innerHTML = `
      <span class="step-chevron ${expanded ? "expanded" : ""}">▸</span>
      <span class="step-title ${step.generated ? "" : "locked"}">${i + 1}. ${step.title}</span>
    `;
    if (step.generated) {
      head.addEventListener("click", () => {
        if (expandedSteps.has(step.id)) expandedSteps.delete(step.id);
        else expandedSteps.add(step.id);
        renderPath();
      });
    }
    main.appendChild(head);

    if (!step.generated) {
      // step.brief/watch_for come from Research (goal-scoped facts, no
      // screenshot involved) and exist even before the AI-planned
      // substeps below do — show them instead of a bare placeholder when
      // present. Fixture steps (fake-skill.js) predate this field and
      // fall back to the placeholder.
      if (step.brief) {
        const brief = document.createElement("div");
        brief.className = "step-caption";
        brief.textContent = step.brief;
        main.appendChild(brief);
      }
      if (step.watch_for) {
        const watch = document.createElement("div");
        watch.className = "step-caption step-watch-for";
        watch.textContent = `⚠ ${step.watch_for}`;
        main.appendChild(watch);
      }
      if (!step.brief) {
        const caption = document.createElement("div");
        caption.className = "step-caption";
        caption.textContent = "Not generated yet — reach this step to see it.";
        main.appendChild(caption);
      }
    }

    if (step.generated && expanded) {
      const substepList = document.createElement("div");
      substepList.className = "substep-list";

      for (const sub of step.substeps) {
        const subRow = document.createElement("div");
        subRow.className = `substep-row origin-${sub.origin}`;
        const preview = sub.origin === "user" ? sub.question : sub.target_description;
        subRow.innerHTML = `
          <span class="substep-dot"></span>
          <span class="substep-text">
            <span class="label">${sub.origin === "user" ? "You asked" : "AI step"}</span>
            ${preview}
          </span>
        `;
        subRow.addEventListener("click", (e) => {
          e.stopPropagation();
          openStep(step, sub.id);
        });
        substepList.appendChild(subRow);
      }
      main.appendChild(substepList);

      const openBtn = document.createElement("button");
      openBtn.className = "step-open";
      openBtn.type = "button";
      openBtn.textContent = "Open chat →";
      openBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openStep(step);
      });
      main.appendChild(openBtn);
    }

    row.appendChild(main);
    body.appendChild(row);
  });
}

// ---------- Chat / step view ----------

function openStep(step, scrollToSubstepId) {
  currentStep = step;
  renderChat();
  showView("chat");

  if (scrollToSubstepId) {
    const el = document.querySelector(`[data-substep-id="${scrollToSubstepId}"]`);
    if (el) el.scrollIntoView({ block: "center" });
  }
}

// A schematic box, not a real overlay: a small diagram (aspect-ratio
// matched to the reference resolution the coordinates were produced at)
// with a red rectangle at the proportional position of last_known_bbox.
// Nothing is drawn on the real screen — see the file-header comment.
function schematicHtml(bbox) {
  const w = bbox.image_width;
  const h = bbox.image_height;
  const leftPct = (bbox.x0 / w) * 100;
  const topPct = (bbox.y0 / h) * 100;
  const widthPct = ((bbox.x1 - bbox.x0) / w) * 100;
  const heightPct = ((bbox.y1 - bbox.y0) / h) * 100;
  return `
    <div class="schematic" style="aspect-ratio: ${w} / ${h}">
      <div class="schematic-box" style="left:${leftPct}%; top:${topPct}%; width:${widthPct}%; height:${heightPct}%"></div>
    </div>
    <div class="schematic-caption">Roughly where this sits on a ${w}×${h} screen — not drawn on your real screen.</div>
  `;
}

function substepBubbleHtml(sub) {
  if (sub.origin === "ai") {
    return `
      <div class="bubble-ai" data-substep-id="${sub.id}">
        <div class="bubble-target">${sub.target_description}</div>
        <div class="bubble-instruction">${sub.instruction_text}</div>
        ${sub.last_known_bbox ? `<button class="bubble-show" data-show="${sub.id}" type="button">📍 Show</button>` : ""}
        <div class="schematic-slot" data-slot="${sub.id}"></div>
      </div>
    `;
  }
  return `
    <div class="bubble-user-block" data-substep-id="${sub.id}">
      <div class="bubble-question">${sub.question}</div>
      <div class="bubble-answer">
        <div class="bubble-instruction">${sub.instruction_text}</div>
        ${sub.last_known_bbox ? `<button class="bubble-show" data-show="${sub.id}" type="button">📍 Show</button>` : ""}
        <div class="schematic-slot" data-slot="${sub.id}"></div>
      </div>
    </div>
  `;
}

function renderChat() {
  const body = document.querySelector("#chat-body");
  body.innerHTML = currentStep.substeps.map(substepBubbleHtml).join("");

  body.querySelectorAll("[data-show]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sub = currentStep.substeps.find((s) => s.id === btn.dataset.show);
      if (!sub || !sub.last_known_bbox) return;
      const slot = body.querySelector(`[data-slot="${sub.id}"]`);
      slot.innerHTML = slot.innerHTML ? "" : schematicHtml(sub.last_known_bbox);
    });
  });

  body.scrollTop = body.scrollHeight;
}

function sendChatMessage() {
  const input = document.querySelector("#chat-input");
  const question = input.value.trim();
  if (!question) return;
  input.value = "";

  // Placeholder reply — a real build would send `question` plus this
  // step's context to the agent controller instead. Falls back to the
  // nearest AI substep's box so there's still something to preview.
  const fallback = [...currentStep.substeps].reverse().find((s) => s.origin === "ai" && s.last_known_bbox);
  const substep = {
    id: `${currentStep.id}-live-${currentStep.substeps.length + 1}`,
    origin: "user",
    question,
    instruction_text: nextCannedReply(),
    action: "none",
    last_known_bbox: fallback ? fallback.last_known_bbox : null,
  };
  currentStep.substeps.push(substep);
  renderChat();
}

document.querySelector("#chat-send").addEventListener("click", sendChatMessage);
document.querySelector("#chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChatMessage();
});

// ---------- Global ----------

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") emit("tutoria:quit");
});
listen("tutoria:quit", () => getCurrentWindow().close());

// Layer-shell surfaces don't reliably pick up tauri.conf.json's configured
// width/height on first map either (same root cause as resize_sidebar's
// doc comment) — pin the collapsed size explicitly once at startup rather
// than trusting it.
setShellSize(COLLAPSED_SIZE);
