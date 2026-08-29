// The whole app lives in this one, plain, fixed-size decorated window —
// see the comment at the top of sidebar.html. No collapsed-icon mode for
// now (simplicity over the earlier collapse/expand resize dance, which
// depended on always-on-top+undecorated quirks that didn't hold up on
// GNOME anyway); `#panel` is always shown at the window's full size.
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

// Capture scope: null means full screen (the default). Otherwise a live
// OS window picked in setup — {id, app_name, title, x, y, width, height},
// the shape window_provider.rs's list_windows/refresh_window_rect return.
// Only `id` is trusted for capture: locate_element re-resolves the
// window's *current* rect from `id` right before every vision call (see
// lib.rs), so this cached x/y/width/height is display-only — it can go
// stale the instant the window moves/resizes and that's fine, it's never
// read for anything but the setup-screen label. See
// docs/decisions/0005-window-anchored-overlay-coordinates.md.
let selectedWindow = null;

// Sent as the second research_goal arg (see lib.rs) so Research scopes
// its search to the actual target app instead of guessing it from goal
// text alone — this is the "OS info in the research query" piece.
function selectedAppName() {
  return selectedWindow ? selectedWindow.app_name : null;
}

// { kind: "window", id } | { kind: "region", ... } | null (full screen) —
// what locate_element's `scope` param expects (CaptureScope in lib.rs).
function currentCaptureScope() {
  if (!selectedWindow) return null;
  return { kind: "window", id: selectedWindow.id };
}

let currentSkill = null;
let currentStep = null;
const expandedSteps = new Set();

const els = {
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
      return ["Tutoria", "", null];
    case "setup":
      return ["Set up", "", null];
    case "skills":
      return ["Your skills", "", null];
    case "path":
      return [currentSkill.title, currentSkill.goal, "skills"];
    case "chat":
      return [currentStep.title, "", "path"];
    default:
      return ["Tutoria", "", null];
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
  els.barBack.onclick = backTarget ? () => showView(backTarget) : null;
}

// ---------- Window-level quirks ----------
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

// Repositioning is a real OS window move: sidebar is a normal, decorated,
// non-always-on-top toplevel (tauri.conf.json), so the window manager's
// own titlebar drag just works, on every platform including GNOME — no
// in-app drag code, no IPC command needed. Two custom drag mechanisms
// (layer-shell margin-rewrite, then Tauri's startDragging() on an
// always-on-top+undecorated toplevel) were tried first and neither held
// up in practice; a plain decorated window sidesteps the question
// entirely by handing dragging back to the WM.

// ---------- Window setup ----------
//
// Window-pick, not region-draw: per
// docs/decisions/0005-window-anchored-overlay-coordinates.md, macOS/
// Windows/Linux X11 can enumerate live windows with real geometry, so
// picking one from a list beats drawing a box by hand — and unlike a
// fixed region, a window pick survives that window being resized or
// moved (locate_element re-resolves its rect live every capture, see
// lib.rs). No full-screen drag surface is needed for this — it's a
// plain list, rendered as an in-panel modal (#window-picker).

function formatWindowLabel() {
  if (!selectedWindow) return "Window: full screen";
  return `Window: ${selectedWindow.app_name || "(unnamed)"} — ${selectedWindow.title || "untitled"}`;
}

function closeWindowPicker() {
  document.querySelector("#window-picker").classList.remove("active");
}

// Resolves to the picked WindowInfo, or null if cancelled. Filters out
// this app's own windows (sidebar/region-select) so the list never shows
// itself — list_windows() has no reason to know which window is "us".
function pickWindowFromList(windows) {
  const picker = document.querySelector("#window-picker");
  const list = document.querySelector("#picker-list");
  const cancelBtn = document.querySelector("#picker-cancel");
  list.innerHTML = "";

  const candidates = windows.filter((w) => !/tutoria/i.test(w.app_name) && !/tutoria/i.test(w.title));

  if (candidates.length === 0) {
    const empty = document.createElement("div");
    empty.className = "picker-empty";
    empty.textContent = "No other windows found.";
    list.appendChild(empty);
  }

  return new Promise((resolve) => {
    for (const w of candidates) {
      const row = document.createElement("div");
      row.className = "picker-row";
      row.innerHTML = `<span class="app">${w.app_name || "(unnamed)"}</span><span class="title">${w.title || "untitled"}</span>`;
      row.addEventListener("click", () => {
        closeWindowPicker();
        resolve(w);
      });
      list.appendChild(row);
    }

    cancelBtn.onclick = () => {
      closeWindowPicker();
      resolve(null);
    };

    picker.classList.add("active");
  });
}

async function selectWindow() {
  const label = document.querySelector("#setup-region-label");
  const button = document.querySelector("#setup-region-select");
  button.disabled = true;
  const previousLabel = label.textContent;
  label.textContent = "Loading windows…";

  try {
    const windows = await invoke("list_windows");
    const picked = await pickWindowFromList(windows);
    selectedWindow = picked ?? selectedWindow;
  } catch (err) {
    label.textContent = `Couldn't list windows: ${err}`;
    button.disabled = false;
    return;
  }

  label.textContent = selectedWindow ? formatWindowLabel() : previousLabel;
  button.disabled = false;
}

document.querySelector("#setup-region-select").addEventListener("click", selectWindow);
document.querySelector("#setup-continue").addEventListener("click", () => {
  renderSkillsList();
  showView("skills");
});

// ---------- Login ----------

document.querySelector("#login-continue").addEventListener("click", () => {
  showView("setup");
});

// ---------- Skills list ----------

function renderSkillsList() {
  const list = document.querySelector("#skills-list");
  list.innerHTML = "";

  for (const skill of SKILLS) {
    const generated = skill.steps.filter((s) => s.generated).length;
    const card = document.createElement("div");
    card.className = "skill-card";
    const appTag = skill.appName ? `<span class="skill-app-tag">${skill.appName}</span> ` : "";
    card.innerHTML = `<h3>${appTag}${skill.title}</h3><p>${generated}/${skill.steps.length} steps ready · “${skill.goal}”</p>`;
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
  input.value = "";

  // The real call is a Claude web-search round trip and routinely takes
  // 30-60s — a static "Researching…" placeholder looks identical to a
  // hang for that whole time, so tick a visible elapsed counter instead.
  const startedAt = Date.now();
  input.placeholder = "Researching… (0s)";
  const tick = setInterval(() => {
    input.placeholder = `Researching… (${Math.round((Date.now() - startedAt) / 1000)}s)`;
  }, 1000);

  try {
    const researchSteps = await invoke("research_goal", { goal, appName: selectedAppName() });
    const skill = {
      id: `skill-${nextSkillId++}`,
      title: goal,
      goal,
      appName: selectedAppName(),
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
    clearInterval(tick);
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

// Generates this step's AI-planned substeps via plan_step (see
// docs/features/skills.md's "Per-step loop") and flips it from locked to
// expandable. Only the goal plus this one step's own title/brief/
// watch_for go in — not the full transcript, kept small deliberately.
async function generateStepSubsteps(step) {
  step.planning = true;
  step.planError = null;
  renderPath();

  try {
    const planned = await invoke("plan_step", {
      goal: currentSkill.goal,
      stepTitle: step.title,
      stepBrief: step.brief ?? "",
      stepWatchFor: step.watch_for ?? "",
    });
    step.substeps = planned.map((sub, i) => ({
      id: `${step.id}-${i + 1}`,
      origin: "ai",
      target_description: sub.target_description,
      instruction_text: sub.instruction_text,
      action: sub.action,
      last_known_bbox: null,
    }));
    step.generated = true;
    expandedSteps.add(step.id);
  } catch (err) {
    step.planError = String(err);
  } finally {
    step.planning = false;
    renderPath();
  }
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
    } else if (!step.planning) {
      // First reach: plan_step generates this step's AI substeps lazily,
      // per docs/features/skills.md's "Per-step loop" — never speculatively
      // for the whole skill up front.
      head.addEventListener("click", () => generateStepSubsteps(step));
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
      if (step.planning) {
        const status = document.createElement("div");
        status.className = "step-caption";
        status.textContent = "Planning this step…";
        main.appendChild(status);
      }
      if (step.planError) {
        const error = document.createElement("div");
        error.className = "step-caption step-watch-for";
        error.textContent = `Couldn't plan this step: ${step.planError}`;
        main.appendChild(error);
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

// "🎯 Locate" runs a real, live locate_element call scoped to the setup
// window (or full screen) — this is what actually fixes overlay items
// going stale after the target app resizes/moves: last_known_bbox isn't
// trusted forever, the user re-runs this any time and gets a bbox
// computed against the window's *current* size (see the CaptureScope
// re-resolve in lib.rs's locate_element). "📍 Show" only ever displays
// whatever bbox is already cached, real or fixture.
// User-asked substeps (sendChatMessage) carry `question`, not
// `target_description` — that's what locate_element needs as its plain-
// text target either way, so fall back to it.
function locateTarget(sub) {
  return sub.target_description || sub.question || "";
}

function locateButtonHtml(sub) {
  if (!locateTarget(sub)) return "";
  return `<button class="bubble-locate" data-locate="${sub.id}" type="button">🎯 Locate</button>`;
}

function substepBubbleHtml(sub) {
  if (sub.origin === "ai") {
    return `
      <div class="bubble-ai" data-substep-id="${sub.id}">
        <div class="bubble-target">${sub.target_description}</div>
        <div class="bubble-instruction">${sub.instruction_text}</div>
        ${sub.last_known_bbox ? `<button class="bubble-show" data-show="${sub.id}" type="button">📍 Show</button>` : ""}
        ${locateButtonHtml(sub)}
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
        ${locateButtonHtml(sub)}
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

  body.querySelectorAll("[data-locate]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const sub = currentStep.substeps.find((s) => s.id === btn.dataset.locate);
      if (!sub) return;
      const previousLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Locating…";
      try {
        sub.last_known_bbox = await invoke("locate_element", {
          target: locateTarget(sub),
          scope: currentCaptureScope(),
        });
        renderChat();
      } catch (err) {
        btn.textContent = "Couldn't locate";
        setTimeout(() => {
          btn.textContent = previousLabel;
          btn.disabled = false;
        }, 2000);
      }
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
