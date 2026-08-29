// The whole app lives in this one, plain, fixed-size decorated window —
// see the comment at the top of sidebar.html. No collapsed-icon mode for
// now (simplicity over the earlier collapse/expand resize dance, which
// depended on always-on-top+undecorated quirks that didn't hold up on
// GNOME anyway); `#panel` is always shown at the window's full size.
//
// Substeps offer two ways to be shown (see actionsHtml below):
// - the eye: a real highlight box + text callout drawn over the target app
//   by the separate, permanently click-through "overlay" window (see
//   overlay.js / overlay.html). An earlier attempt at this was cut because
//   a full-screen always-on-top window blocked clicks into the app being
//   taught; what makes it viable now is that click-through is set once in
//   Rust and never toggled, so it can't get stuck interactive.
// - the note: the in-panel schematic diagram, which stays as the fallback
//   for platforms with no live window rect (a Wayland portal capture never
//   discloses screen position) and as a non-intrusive "roughly where".
import { SKILLS, nextCannedReply } from "./fake-skill.js";
import { EyeIcon, EyeOffIcon, TargetIcon, NoteIcon } from "./icons.js";

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

// The portal equivalent of `selectedWindow`, for Wayland sessions where
// windows can't be enumerated at all (see window_provider::backend and
// portal_capture.py). Shape: {scope, width, height, source_type, label,
// persisted}. There is no id/title/app_name here and no rect to refresh —
// the portal's stored restore token is what re-resolves the source on the
// next capture, so `scope` is the only field a capture actually needs.
let portalPick = null;

// "native" | "portal", resolved once at startup. Decides which pick
// gesture the setup view offers; until it resolves, assume the historical
// native path.
let captureBackend = "native";

async function initCaptureBackend() {
  try {
    captureBackend = await invoke("capture_backend");
  } catch (err) {
    console.error("capture_backend failed, assuming native", err);
  }
  const portal = captureBackend === "portal";
  document.querySelector("#setup-blurb-native").hidden = portal;
  document.querySelector("#setup-blurb-portal").hidden = !portal;
  document.querySelector("#setup-region-select").textContent =
    portal ? "Choose source" : "Select window";
  document.querySelector("#setup-region-label").textContent = formatWindowLabel();
}

// Sent as the second research_goal arg (see lib.rs) so Research scopes
// its search to the actual target app instead of guessing it from goal
// text alone — this is the "OS info in the research query" piece.
// The portal deliberately never tells us which app was picked, so on that
// backend Research gets no app name and falls back to inferring the target
// app from the goal text alone (see run_research in lib.rs).
function selectedAppName() {
  return selectedWindow ? selectedWindow.app_name : null;
}

// { kind: "window", id } | { kind: "region", ... } | null (full screen) —
// what locate_element's `scope` param expects (CaptureScope in lib.rs).
function currentCaptureScope() {
  if (portalPick) {
    return {
      kind: "portal",
      scope: portalPick.scope,
      // Whether the user picked a whole screen or a single window, as
      // reported by the portal itself — decides whether the real overlay
      // can draw or the schematic is used instead.
      screen: portalPick.source_type === "screen",
    };
  }
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
  statusBar: document.querySelector("#status-bar"),
  statusText: document.querySelector("#status-text"),
};

// Persistent status strip (outside every view — see sidebar.html's
// #status-bar) for any call that shells out to Python and can genuinely
// take a while: research, per-step planning, the portal pick dialog.
// Replaces the old approach of repurposing one input's placeholder text,
// which was invisible unless the user happened to still be looking at
// that exact input. `token` lets an overlapping/superseded call's `end()`
// no-op instead of clobbering a newer status that started after it.
let statusToken = 0;

function beginStatus(label, { slowAfter = 5, stallAfter = 30, stalledHint } = {}) {
  const token = ++statusToken;
  const startedAt = Date.now();
  els.statusBar.classList.add("active");
  els.statusBar.classList.remove("stalled");

  const tick = () => {
    if (token !== statusToken) return;
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    if (elapsed >= stallAfter) {
      els.statusBar.classList.add("stalled");
      const hint = stalledHint ?? "The app itself is still responding, but this call is taking unusually long.";
      els.statusText.textContent = `${label} — still going after ${elapsed}s. ${hint}`;
    } else if (elapsed >= slowAfter) {
      els.statusText.textContent = `${label} (${elapsed}s)…`;
    } else {
      els.statusText.textContent = label;
    }
  };
  tick();
  const interval = setInterval(tick, 1000);

  return function endStatus() {
    if (token !== statusToken) return;
    clearInterval(interval);
    els.statusBar.classList.remove("active", "stalled");
    els.statusText.textContent = "";
  };
}

async function withStatus(label, fn, opts) {
  const end = beginStatus(label, opts);
  try {
    return await fn();
  } finally {
    end();
  }
}

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
  // Leaving the chat view drops the on-screen overlay: it belongs to one
  // substep in one step, so leaving that context would otherwise strand a
  // highlight box on screen with nothing in the UI still pointing at it
  // (and no visible way to dismiss it, since the eye that toggles it is
  // in the view being left).
  if (currentView === "chat" && name !== "chat") hideOverlay();
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
// picking one beats drawing a box by hand — and unlike a fixed region, a
// window pick survives that window being resized or moved
// (locate_element re-resolves its rect live every capture, see lib.rs).
//
// The pick gesture itself is "click the window you want", not choosing
// from a text list: delegates to the region-select window's click-catcher
// (see region-select.js's runClickSelect) for the actual click, the same
// way region-drag already delegated its drag gesture there — a real
// window over the whole screen is what makes that click land reliably
// no matter what's underneath, rather than sidebar trying to interpret
// clicks that land outside its own bounds. The click point (absolute
// screen px) is then resolved to a window via the `window_at_point`
// command (window_provider.rs), which walks front-to-back so overlapping
// windows resolve to whichever one is actually visible at that point.

function formatWindowLabel() {
  if (portalPick) {
    // Says which highlight the user is going to get, since that is the one
    // consequence of screen-vs-window they can't otherwise see coming.
    const how = portalPick.source_type === "screen" ? "on-screen box" : "diagram only";
    return `Capturing: ${portalPick.label} — ${how}`;
  }
  if (selectedWindow) {
    return `Window: ${selectedWindow.app_name || "(unnamed)"} — ${selectedWindow.title || "untitled"}`;
  }
  // On the portal backend "full screen" isn't a working default the way it
  // is elsewhere — nothing can be captured until the user has picked a
  // source once — so the empty state has to read as a required step.
  return captureBackend === "portal" ? "Nothing chosen yet" : "Window: full screen";
}

// Wayland path: the compositor runs the whole gesture (its own dialog,
// its own list of windows) and hands back a token — there is no click to
// catch and no rect to resolve, so none of the region-select window's
// machinery below is involved.
async function selectPortalSource() {
  const label = document.querySelector("#setup-region-label");
  const button = document.querySelector("#setup-region-select");
  const previousLabel = label.textContent;
  button.disabled = true;
  label.textContent = "Choose a screen or window in the system prompt…";

  try {
    // "any" so the system picker offers both its Screen and Window tabs.
    // Both work for capture; they differ in whether the on-screen overlay
    // can draw (screen: yes, window: schematic only — see FrameAnchor::
    // Portal in lib.rs and ADR 0006), which is surfaced in the label below
    // rather than taken away as a choice.
    portalPick = await withStatus(
      "Waiting for you to choose in the system prompt",
      () => invoke("pick_portal_source", { scope: "any" }),
      {
        slowAfter: 3,
        // This one waits on a human, not a computation — a long elapsed
        // time here is normal, not a bug, so the "stalled" wording says
        // so instead of implying something's broken.
        stallAfter: 45,
        stalledHint: "This is just waiting on you — look for a share dialog on another screen or workspace if you don't see one.",
      },
    );
    selectedWindow = null;
    label.textContent = formatWindowLabel();
    if (!portalPick.persisted) {
      // Without a restore token every capture re-prompts, which would make
      // the guided loop unusable — say so now rather than mid-skill.
      label.textContent += " — your desktop won't remember this, so each capture will ask again";
    }
  } catch (err) {
    label.textContent = `Couldn't pick a source (${err})`;
    setTimeout(() => {
      if (label.textContent.startsWith("Couldn't pick")) label.textContent = previousLabel;
    }, 5000);
  } finally {
    button.disabled = false;
    await getCurrentWindow().setFocus();
  }
}

async function selectWindow() {
  if (captureBackend === "portal") return selectPortalSource();

  const label = document.querySelector("#setup-region-label");
  const button = document.querySelector("#setup-region-select");
  const previousLabel = label.textContent;
  button.disabled = true;
  label.textContent = "Click the window you want…";

  await getCurrentWindow().hide();

  const point = await new Promise(async (resolve) => {
    const unlisten = await listen("tutoria:window-point-selected", (event) => {
      unlisten();
      resolve(event.payload);
    });
    emit("tutoria:begin-window-select");
  });

  if (point) {
    try {
      selectedWindow = await invoke("window_at_point", { x: Math.round(point.x), y: Math.round(point.y) });
    } catch (err) {
      label.textContent = `Nothing there — try clicking directly on a window (${err})`;
      await getCurrentWindow().show();
      await getCurrentWindow().setFocus();
      button.disabled = false;
      setTimeout(() => {
        if (label.textContent.startsWith("Nothing there")) label.textContent = previousLabel;
      }, 3000);
      return;
    }
  }

  label.textContent = selectedWindow ? formatWindowLabel() : previousLabel;
  await getCurrentWindow().show();
  await getCurrentWindow().setFocus();
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

// Highest numeric suffix among "skill-N" ids currently in SKILLS, so a
// fresh id never collides with a persisted one after loadPersistedSkills
// replaces the fixture data below.
function recomputeNextSkillId() {
  const max = SKILLS.reduce((m, skill) => {
    const n = Number(String(skill.id).replace(/^skill-/, ""));
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  nextSkillId = max + 1;
}

// Whole-tree persistence: every skill, its research steps, and any
// AI-planned/user-asked substeps already reached, as one JSON file under
// this app's OS-managed data directory (see skills_file_path in lib.rs —
// on this Linux build that's `~/.local/share/com.charlie.tauri-overlay/
// skills.json`; open it directly to inspect what got saved). Called after
// every mutation below rather than batched/debounced: the file is small
// and a hackathon build losing the last few seconds of edits on a crash is
// a worse failure mode than one extra disk write per click.
async function persistSkills() {
  try {
    await invoke("save_skills_json", { json: JSON.stringify(SKILLS, null, 2) });
  } catch (err) {
    console.error("failed to save skills to disk", err);
  }
}

// Loads whatever was persisted last session, replacing the fixture demo
// data in place (SKILLS is an imported binding — can't be reassigned, only
// mutated) so every existing `SKILLS.push`/`for (const skill of SKILLS)`
// call site keeps working unchanged. Leaves the fixture in place if
// nothing has been saved yet (fresh install) or the save is empty, so the
// demo still has something to show.
async function loadPersistedSkills() {
  try {
    const json = await invoke("load_skills_json");
    if (!json) return;
    const persisted = JSON.parse(json);
    if (!Array.isArray(persisted) || persisted.length === 0) return;
    SKILLS.length = 0;
    SKILLS.push(...persisted);
    recomputeNextSkillId();
    renderSkillsList();
  } catch (err) {
    console.error("failed to load persisted skills, keeping fixture demo data", err);
  }
}

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
  input.value = "";

  try {
    // Real Claude web-search round trip, routinely 30-60s — see the
    // global status bar (#status-bar) for what tells the user this is
    // still in flight rather than hung. stallAfter is well past the
    // typical range before it starts suggesting something's actually
    // wrong, so a normal slow call never gets flagged.
    const researchSteps = await withStatus(
      `Researching "${goal}"`,
      () => invoke("research_goal", { goal, appName: selectedAppName() }),
      {
        slowAfter: 8,
        stallAfter: 90,
        stalledHint: "Research calls are normally done within a minute. If your Anthropic API key is out of credit, this call fails fast instead of hanging — so this most likely means it's still genuinely working.",
      },
    );
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
    await persistSkills();
    openSkill(skill);
  } catch (err) {
    errorEl.textContent = `Couldn't research that: ${err}`;
  } finally {
    input.disabled = false;
    button.disabled = false;
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
    const planned = await withStatus(
      `Planning "${step.title}"`,
      () =>
        invoke("plan_step", {
          goal: currentSkill.goal,
          stepTitle: step.title,
          stepBrief: step.brief ?? "",
          stepWatchFor: step.watch_for ?? "",
        }),
      { slowAfter: 6, stallAfter: 60 },
    );
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
    await persistSkills();
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
      // substeps below do, so they're shown alongside the substep
      // placeholder rather than instead of it — a real research step
      // always has a brief, and used to skip the placeholder entirely as
      // a result. Fixture steps (fake-skill.js) predate `brief`.
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
      // Substep placeholder — the actual per-substep bubbles only exist
      // once plan_step has run (see generateStepSubsteps), which is a
      // separate, deferred concern from having something to show here in
      // the meantime. Suppressed while a plan is in flight or failed,
      // since those states render their own message right below.
      if (!step.planning && !step.planError) {
        const placeholder = document.createElement("div");
        placeholder.className = "step-caption step-substep-placeholder";
        placeholder.textContent = "Substeps not generated yet — click to generate.";
        main.appendChild(placeholder);
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

// Three actions per substep, all icon-only (icons.js — the shared pool):
//
// - eye (EyeIcon/EyeOffIcon): draws the real on-screen overlay for this
//   substep — a highlight box plus the instruction as a text callout,
//   positioned over the actual target app (see overlay.js). Toggles, and
//   only one substep can be shown at a time, so pressing a second one
//   moves the overlay rather than stacking two boxes.
// - target (TargetIcon): runs a live locate_element to recompute the bbox
//   against the window's *current* size, so a stale box after a resize is
//   one press away from correct (see the CaptureScope re-resolve in
//   lib.rs).
// - note (NoteIcon): the in-panel schematic — kept as the fallback for
//   when the real overlay can't draw (no live window rect on this
//   platform, e.g. a Wayland session on GNOME/KDE), and as a quick
//   "roughly where" that doesn't take over the screen.
//
// User-asked substeps (sendChatMessage) carry `question`, not
// `target_description` — that's what locate_element needs as its plain-
// text target either way, so fall back to it.
function locateTarget(sub) {
  return sub.target_description || sub.question || "";
}

// Which substep's overlay is currently on screen, if any.
let overlaidSubstepId = null;

function actionsHtml(sub) {
  const eye = sub.last_known_bbox
    ? `<button class="bubble-icon-btn" data-overlay="${sub.id}" type="button" title="Show on my real screen">${
        overlaidSubstepId === sub.id ? EyeOffIcon({ size: 15 }) : EyeIcon({ size: 15 })
      }</button>`
    : "";
  const locate = locateTarget(sub)
    ? `<button class="bubble-icon-btn" data-locate="${sub.id}" type="button" title="Find this on screen now">${TargetIcon({ size: 15 })}</button>`
    : "";
  const schematic = sub.last_known_bbox
    ? `<button class="bubble-icon-btn" data-show="${sub.id}" type="button" title="Show a rough diagram instead">${NoteIcon({ size: 15 })}</button>`
    : "";
  if (!eye && !locate && !schematic) return "";
  return `<div class="bubble-actions">${eye}${locate}${schematic}</div>`;
}

function substepBubbleHtml(sub) {
  if (sub.origin === "ai") {
    return `
      <div class="bubble-ai" data-substep-id="${sub.id}">
        <div class="bubble-target">${sub.target_description}</div>
        <div class="bubble-instruction">${sub.instruction_text}</div>
        ${actionsHtml(sub)}
        <div class="schematic-slot" data-slot="${sub.id}"></div>
      </div>
    `;
  }
  return `
    <div class="bubble-user-block" data-substep-id="${sub.id}">
      <div class="bubble-question">${sub.question}</div>
      <div class="bubble-answer">
        <div class="bubble-instruction">${sub.instruction_text}</div>
        ${actionsHtml(sub)}
        <div class="schematic-slot" data-slot="${sub.id}"></div>
      </div>
    </div>
  `;
}

// Sends this substep's bbox + copy to the overlay window, which owns all
// the coordinate math and the re-poll that keeps the box glued to the
// target window as it moves (see overlay.js's file header).
async function showOverlayFor(sub) {
  overlaidSubstepId = sub.id;
  await emit("tutoria:show-overlay", {
    bbox: sub.last_known_bbox,
    targetDescription: sub.target_description ?? "",
    instructionText: sub.instruction_text ?? "",
  });
  renderChat();
}

async function hideOverlay() {
  if (overlaidSubstepId === null) return;
  overlaidSubstepId = null;
  await emit("tutoria:hide-overlay");
  renderChat();
}

function renderChat() {
  const body = document.querySelector("#chat-body");
  body.innerHTML = currentStep.substeps.map(substepBubbleHtml).join("");

  body.querySelectorAll("[data-overlay]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sub = currentStep.substeps.find((s) => s.id === btn.dataset.overlay);
      if (!sub || !sub.last_known_bbox) return;
      if (overlaidSubstepId === sub.id) hideOverlay();
      else showOverlayFor(sub);
    });
  });

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
      btn.disabled = true;
      btn.classList.add("busy");
      try {
        sub.last_known_bbox = await invoke("locate_element", {
          target: locateTarget(sub),
          scope: currentCaptureScope(),
        });
        // Already-visible overlay for this substep should jump to the new
        // box rather than keep showing the old one.
        if (overlaidSubstepId === sub.id) await showOverlayFor(sub);
        else renderChat();
      } catch (err) {
        btn.classList.remove("busy");
        btn.classList.add("failed");
        btn.title = `Couldn't locate: ${err}`;
        setTimeout(() => {
          btn.classList.remove("failed");
          btn.disabled = false;
        }, 2500);
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
  persistSkills();
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

// Which pick gesture is possible depends on the session, so the setup view
// can't be rendered correctly until this resolves.
initCaptureBackend();
loadPersistedSkills();
