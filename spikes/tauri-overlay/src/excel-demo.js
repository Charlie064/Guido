// Isolated Excel demo harness. Not used by sidebar.js.
// Flow: empty Chat → prompt → fake steps → click step → fake substeps
// → click substep → on-screen overlay boxes on the selected window.
// Previous chats is a canned Premiere / Photoshop list.
import { cannedPreviousSkill, PREVIOUS_APPS, researchExcel, planExcelStep, wait } from "./excel-demo-data.js";
import { hideOverlayItems, overlayItemsFor, showOverlayItems } from "./overlay-preview.js";
import { pickNativeWindow } from "./window-pick.js";

const tauri = window.__TAURI__;
const getCurrentWindow = () => tauri?.window?.getCurrentWindow?.();

const excelSkills = [];
let currentSkill = null;
let activeSubstepId = null;
let selectedWindow = null;
const expanded = new Set();
const openPrevious = new Set();

const els = {
  back: document.querySelector("#bar-back"),
  title: document.querySelector("#bar-title"),
  sub: document.querySelector("#bar-sub"),
  home: document.querySelector("#view-home"),
  path: document.querySelector("#view-path"),
  empty: document.querySelector("#home-empty"),
  oldGroups: document.querySelector("#old-groups"),
  input: document.querySelector("#ask-input"),
  send: document.querySelector("#ask-send"),
  pathBody: document.querySelector("#path-body"),
  windowLabel: document.querySelector("#window-label"),
  windowSelect: document.querySelector("#window-select"),
};

const SIZE = { home: [320, 620], path: [320, 560] };

function formatWindowLabel() {
  if (!selectedWindow) return "Window: not selected";
  const app = selectedWindow.app_name || "App";
  const title = selectedWindow.title || "untitled";
  return `Window: ${app} — ${title}`;
}

function setWindowLabel(text) {
  els.windowLabel.textContent = text;
}

async function fit(name) {
  const [w, h] = SIZE[name] || SIZE.home;
  try {
    const win = getCurrentWindow();
    if (!win) return;
    const LogicalSize = tauri.dpi?.LogicalSize ?? tauri.window.LogicalSize;
    await win.setSize(new LogicalSize(w, h));
  } catch {
    // Browser preview has no Tauri window.
  }
}

function showHome() {
  hideOverlayItems();
  activeSubstepId = null;
  currentSkill = null;
  els.home.classList.add("active");
  els.path.classList.remove("active");
  els.back.hidden = true;
  els.title.textContent = "Chats";
  els.sub.textContent = "What do you want to do?";
  renderHome();
  fit("home");
}

function showPath(skill) {
  currentSkill = skill;
  els.home.classList.remove("active");
  els.path.classList.add("active");
  els.back.hidden = false;
  els.title.textContent = skill.title;
  els.sub.textContent = skill.appName || "";
  if (skill.source === "previous") {
    expanded.clear();
    if (skill.steps[0]) expanded.add(skill.steps[0].id);
  }
  renderPath();
  fit("path");
}

function skillCard(skill, meta) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "skill-card";
  const h3 = document.createElement("h3");
  h3.textContent = skill.title;
  const p = document.createElement("p");
  p.textContent = meta;
  card.appendChild(h3);
  card.appendChild(p);
  card.addEventListener("click", () => showPath(skill));
  return card;
}

function chatCount(n) {
  return `${n} chat${n === 1 ? "" : "s"}`;
}

function oldChatGroups() {
  const groups = [];
  if (excelSkills.length) {
    groups.push({
      id: "excel",
      title: "Excel chats",
      icon: "assets/excel.png",
      chats: [...excelSkills].reverse().map((skill) => {
        const ready = skill.steps.filter((s) => s.generated).length;
        return { skill, meta: `${ready}/${skill.steps.length} steps` };
      }),
    });
  }
  for (const app of PREVIOUS_APPS) {
    groups.push({
      id: app.id,
      title: app.title,
      icon: app.icon,
      chats: app.skills.map((spec) => ({
        skill: cannedPreviousSkill(app, spec),
        meta: spec.goal,
      })),
    });
  }
  return groups;
}

function renderHome() {
  els.empty.hidden = true;
  els.oldGroups.innerHTML = "";
  for (const app of oldChatGroups()) {
    const wrap = document.createElement("div");
    const open = openPrevious.has(app.id);
    const group = document.createElement("button");
    group.type = "button";
    group.className = `app-group${open ? " open" : ""}`;
    group.innerHTML = `
      <img src="${app.icon}" alt="" />
      <div>
        <div class="app-group-title">${app.title}</div>
        <div class="app-group-meta">${chatCount(app.chats.length)}</div>
      </div>
    `;
    group.addEventListener("click", () => {
      if (openPrevious.has(app.id)) openPrevious.delete(app.id);
      else openPrevious.add(app.id);
      renderHome();
    });
    wrap.appendChild(group);
    if (open) {
      const list = document.createElement("div");
      list.className = "skill-list";
      for (const { skill, meta } of app.chats) {
        list.appendChild(skillCard(skill, meta));
      }
      wrap.appendChild(list);
    }
    els.oldGroups.appendChild(wrap);
  }
}

function renderPath() {
  const body = els.pathBody;
  body.innerHTML = "";
  currentSkill.steps.forEach((step, i) => {
    const last = i === currentSkill.steps.length - 1;
    const open = expanded.has(step.id);
    const row = document.createElement("div");
    row.className = "step-row";
    row.innerHTML = `
      <div class="step-rail">
        <div class="step-dot ${step.generated ? "" : "locked"}"></div>
        ${last ? "" : '<div class="step-line"></div>'}
      </div>
    `;
    const main = document.createElement("div");
    main.className = "step-main";
    const head = document.createElement("div");
    head.className = "step-head";
    const chevron = document.createElement("span");
    chevron.className = `step-chevron ${open ? "expanded" : ""}`;
    chevron.textContent = "▸";
    const title = document.createElement("span");
    title.className = `step-title ${step.generated ? "" : "locked"}`;
    title.textContent = `${i + 1}. ${step.title}`;
    head.appendChild(chevron);
    head.appendChild(title);
    head.addEventListener("click", () => onStepClick(step));
    main.appendChild(head);

    if (step.brief) {
      const cap = document.createElement("div");
      cap.className = "step-caption";
      cap.textContent = step.planning ? "Planning this step…" : step.brief;
      main.appendChild(cap);
    }

    if (step.generated && open) {
      const list = document.createElement("div");
      list.className = "substep-list";
      for (const sub of step.substeps) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `substep${activeSubstepId === sub.id ? " active" : ""}`;
        const kicker = document.createElement("div");
        kicker.className = "substep-kicker";
        kicker.textContent = sub.target_description;
        const text = document.createElement("div");
        text.className = "substep-text";
        text.textContent = sub.instruction_text;
        btn.appendChild(kicker);
        btn.appendChild(text);
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          onSubstepClick(sub);
        });
        list.appendChild(btn);
      }
      main.appendChild(list);
    }

    row.appendChild(main);
    body.appendChild(row);
  });
}

async function onStepClick(step) {
  if (step.planning) return;
  if (!step.generated) {
    step.planning = true;
    renderPath();
    await wait(550);
    step.substeps = planExcelStep(currentSkill, step);
    step.generated = true;
    step.planning = false;
    expanded.add(step.id);
    renderPath();
    renderHome();
    return;
  }
  if (expanded.has(step.id)) expanded.delete(step.id);
  else expanded.add(step.id);
  renderPath();
}

async function ensureWindowSelected() {
  if (selectedWindow) return true;
  els.sub.textContent = "Click the window the boxes should sit on…";
  await selectWindow();
  return Boolean(selectedWindow);
}

async function onSubstepClick(sub) {
  if (activeSubstepId === sub.id) {
    activeSubstepId = null;
    await hideOverlayItems();
    renderPath();
    return;
  }
  const items = overlayItemsFor(sub);
  if (!items.length) return;
  if (!(await ensureWindowSelected())) {
    els.sub.textContent = "Select a window first, then press the substep again.";
    return;
  }
  activeSubstepId = sub.id;
  renderPath();
  const result = await showOverlayItems(items, {
    origin: sub.origin,
    selectedWindow,
  });
  if (!result.ok) {
    els.sub.textContent = result.error || "Overlay did not show.";
  }
}

async function selectWindow() {
  if (!tauri?.event) {
    els.sub.textContent = "Window pick needs the desktop app.";
    return;
  }
  const previous = formatWindowLabel();
  els.windowSelect.disabled = true;
  setWindowLabel("Click the window you want…");
  try {
    const picked = await pickNativeWindow();
    if (picked) {
      selectedWindow = picked;
      setWindowLabel(formatWindowLabel());
    } else {
      setWindowLabel(previous);
    }
  } catch (err) {
    selectedWindow = null;
    setWindowLabel(`Nothing there — ${err}`);
    setTimeout(() => {
      if (els.windowLabel.textContent.startsWith("Nothing there")) {
        setWindowLabel(previous);
      }
    }, 3000);
  } finally {
    els.windowSelect.disabled = false;
  }
}

async function submitPrompt() {
  const goal = els.input.value.trim();
  if (!goal) return;
  els.input.disabled = true;
  els.send.disabled = true;
  els.input.value = "";
  const previous = els.input.placeholder;
  els.input.placeholder = "Thinking…";
  els.sub.textContent = "Working — click the window to use…";

  const pickPromise = selectedWindow
    ? Promise.resolve()
    : selectWindow().catch((err) => {
        console.warn("window pick during ask failed", err);
      });
  const researchPromise = wait(550).then(() => researchExcel(goal));
  const [, skill] = await Promise.all([pickPromise, researchPromise]);

  excelSkills.push(skill);
  openPrevious.add("excel");
  expanded.clear();
  els.input.disabled = false;
  els.send.disabled = false;
  els.input.placeholder = previous;
  renderHome();
  showPath(skill);
}

els.send.addEventListener("click", submitPrompt);
els.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitPrompt();
});
els.back.addEventListener("click", showHome);
els.windowSelect.addEventListener("click", selectWindow);

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (activeSubstepId) {
    activeSubstepId = null;
    hideOverlayItems();
    renderPath();
    return;
  }
  if (currentSkill) {
    showHome();
    return;
  }
  try {
    getCurrentWindow()?.close();
  } catch {
    /* ignore */
  }
});

fit("home");
renderHome();
setWindowLabel(formatWindowLabel());
