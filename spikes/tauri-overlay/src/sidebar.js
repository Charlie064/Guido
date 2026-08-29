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
import { SKILLS } from "./fake-skill.js";
import { EyeIcon, EyeOffIcon, TargetIcon, NoteIcon, TrashIcon, ChevronDownIcon, CheckIcon, ImageIcon } from "./icons.js";

// Registered before anything below gets a chance to throw — including
// this file's own top-level init further down, which would otherwise
// silently leave every addEventListener after the failure point never
// attached (an "Ask" button that looks dead with no error anywhere).
// Nothing forwards WebKitGTK's console to the terminal that launched
// `tauri dev`, so without this a JS error just vanishes unless someone
// happens to have the inspector open. Uses querySelector directly rather
// than the `els` cache below (not yet defined this early) — the module
// script is deferred by the browser until the DOM is parsed, so
// `#status-bar` already exists no matter how early in this file we are.
function reportUnexpectedError(context, err) {
  console.error(context, err);
  const bar = document.querySelector("#status-bar");
  const text = document.querySelector("#status-text");
  if (!bar || !text) return;
  bar.classList.add("active", "stalled");
  text.textContent = `${context}: ${err?.message ?? err}`;
}

window.addEventListener("error", (e) => reportUnexpectedError("Unexpected error", e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => reportUnexpectedError("Unexpected error", e.reason));

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

// The window-pick control exists twice — once in the setup view, once
// inlined at the top of home — and both are always in the DOM, so every
// update writes to both rather than to "the" control. They'd otherwise
// disagree the moment a pick was made from one of them.
const REGION_MOUNTS = ["setup", "home"];
const regionEls = (part) => REGION_MOUNTS.map((m) => document.querySelector(`#${m}-region-${part}`));

function setRegionLabel(text) {
  for (const el of regionEls("label")) el.textContent = text;
}

function regionLabelText() {
  return document.querySelector("#setup-region-label").textContent;
}

function setRegionBusy(busy) {
  for (const el of regionEls("select")) el.disabled = busy;
}

async function initCaptureBackend() {
  try {
    captureBackend = await invoke("capture_backend");
  } catch (err) {
    console.error("capture_backend failed, assuming native", err);
  }
  const portal = captureBackend === "portal";
  document.querySelector("#setup-blurb-native").hidden = portal;
  document.querySelector("#setup-blurb-portal").hidden = !portal;
  for (const el of regionEls("select")) {
    el.textContent = portal ? "Choose source" : "Select window";
  }
  setRegionLabel(formatWindowLabel());
  refreshHomeSteps();
}

// Sent as the second research_goal arg (see lib.rs) so Research scopes
// its search to the actual target app instead of guessing it from goal
// text alone — this is the "OS info in the research query" piece.
//
// The portal itself never says which app was picked — its `label` is only
// a source kind and size ("window (1920x1080)", see describe() in
// portal_capture.py). `detectedApp` is how that gap is closed: one vision
// call right after the pick reads the app's name off the frame (see
// identify_app.py / the identify_app command), which is the only source of
// app identity on a Wayland session. Shape: {app_name, window_title}, or
// null before/if identification hasn't produced one.
let detectedApp = null;

// The OS's own answer wins where there is one — it's free and exact — and
// the vision read is the fallback that makes Wayland work at all. Null
// only when neither is available, in which case Research infers the target
// app from goal text alone (see run_research in lib.rs).
function selectedAppName() {
  return selectedWindow?.app_name ?? detectedApp?.app_name ?? null;
}

// Whether the user has actually chosen what to capture. Distinct from
// "capture will work": the native backend can always fall back to the full
// screen, but that's a default, not a pick, and the home view's second
// step only ticks on a real choice (or on explicitly accepting full
// screen, below).
let fullScreenAccepted = false;

function hasCaptureSource() {
  return Boolean(selectedWindow || portalPick || fullScreenAccepted);
}

// { kind: "window", id } | { kind: "region", ... } | null (full screen) —
// what locate_element's `scope` param expects (CaptureScope in lib.rs).
// Derived from whatever is currently picked in setup/home — the *global*
// pick, not any particular skill's own. Two callers need exactly this:
// (1) snapshotting a scope onto a brand-new skill at the moment it's
// created (submitNewGoal — currentSkill isn't that skill yet), and (2) a
// fallback for a skill persisted before per-skill scope existed, which
// has no captureScope of its own to fall back on.
function deriveScopeFromGlobals() {
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

// Every other caller (the substep locate button, future auto-locate)
// wants the scope of the skill actually being viewed, not whatever the
// picker happens to hold right now — those can differ once scope is
// per-skill: picking a new window for a second skill must not silently
// change where the first skill's substeps locate against.
function currentCaptureScope() {
  return currentSkill?.captureScope ?? deriveScopeFromGlobals();
}

let currentSkill = null;
let currentStep = null;
// Single id, not a Set: the path view is a true accordion — expanding a
// step collapses whichever other one was open, so only one step's
// substeps are ever on screen at once.
let expandedStepId = null;

const els = {
  barBack: document.querySelector("#bar-back"),
  barTitle: document.querySelector("#bar-title"),
  barSubtitle: document.querySelector("#bar-subtitle"),
  statusBar: document.querySelector("#status-bar"),
  statusText: document.querySelector("#status-text"),
  profileWrap: document.querySelector("#bar-profile-wrap"),
  profileBtn: document.querySelector("#bar-profile"),
  profileMenu: document.querySelector("#profile-menu"),
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
  home: document.querySelector("#view-home"),
  group: document.querySelector("#view-group"),
  path: document.querySelector("#view-path"),
  chat: document.querySelector("#view-chat"),
  pay: document.querySelector("#view-pay"),
};

// Compact shell sizes — keep the panel as small as the current view
// allows so it can sit next to Excel instead of covering it.
const VIEW_SIZE = {
  login: [400, 460],
  setup: [400, 420],
  // Wider and taller than the other views: home is a fixed 40/60 split,
  // and the ask row now carries its tick inline and the picker row a
  // label, a tick and a button — at the old 320-340px they crowded.
  home: [420, 620],
  group: [420, 620],
  path: [400, 600],
  chat: [400, 600],
  pay: [420, 620],
};

async function fitWindow(name) {
  const [w, h] = VIEW_SIZE[name] || VIEW_SIZE.home;
  try {
    const LogicalSize = window.__TAURI__.dpi?.LogicalSize ?? window.__TAURI__.window.LogicalSize;
    const win = getCurrentWindow();
    await win.setSize(new LogicalSize(w, h));
    await win.setMinSize(new LogicalSize(360, 400));
  } catch {
    // Browser preview / missing Tauri API — leave CSS to fill the webview.
  }
}

// Set right before showView("pay") so its back arrow returns wherever the
// user actually came from (home, mid-path) instead of always "home".
let payReturnView = "home";

// view -> [title, subtitle getter, back-target-or-null]
function viewMeta(name) {
  switch (name) {
    case "login":
      return ["Guido", "", null];
    case "setup":
      return ["Set up", "", "home"];
    case "home":
      return ["Chats", "", null];
    case "group":
      return [`${currentGroup?.appName ?? "Unsorted"} chats`, `${currentGroup?.skills.length ?? 0} chats`, "home"];
    case "path":
      return [currentSkill.title, currentSkill.goal, "home"];
    case "chat":
      return [currentStep.title, "", "path"];
    case "pay":
      return ["Upgrade", "", payReturnView];
    default:
      return ["Guido", "", null];
  }
}

let currentView = "login";

function setProfileOpen(open) {
  els.profileMenu.classList.toggle("open", open);
  els.profileBtn.setAttribute("aria-expanded", open ? "true" : "false");
}

// `fade` is opt-in rather than always-on: navigating back and forth should
// feel instant, but the hand-off from a finished research call to the step
// list is a result arriving, and a beat of animation is what marks it as
// one.
function showView(name, { fade = false } = {}) {
  // Leaving the chat view drops the on-screen overlay: it belongs to one
  // substep in one step, so leaving that context would otherwise strand a
  // highlight box on screen with nothing in the UI still pointing at it
  // (and no visible way to dismiss it, since the eye that toggles it is
  // in the view being left).
  if (currentView === "chat" && name !== "chat") hideOverlay();
  // Refreshed on every visit, not just after a new goal — this is also
  // how a skill generated earlier (or restored from disk) stays reachable
  // after navigating away from it, see renderAppsList's comment.
  if (name === "home") {
    renderAppsList();
    refreshHomeSteps();
  }
  currentView = name;
  for (const [key, el] of Object.entries(views)) {
    el.classList.toggle("active", key === name);
    el.classList.remove("fade-in");
  }
  if (fade) views[name].classList.add("fade-in");
  const [title, subtitle, backTarget] = viewMeta(name);
  els.barTitle.textContent = title;
  els.barSubtitle.textContent = subtitle;
  els.barBack.hidden = !backTarget;
  els.barBack.onclick = backTarget ? () => showView(backTarget) : null;
  els.profileWrap.hidden = name === "login";
  setProfileOpen(false);
  fitWindow(name);
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

// App icons, keyed by app_name. Rust already caches the extracted PNG on
// disk per app (see window_icon in lib.rs); this second, in-memory layer
// only exists so re-picking the same app inside one session doesn't cross
// the IPC boundary at all. The Rust side hands back a data URI, so the
// icon survives the window it came from — which is what lets a saved
// skill still show its app's icon later.
const appIcons = new Map();

// `id` is the live window to extract from; without one this is a
// cache-only lookup, which is how a saved chat still shows its app's icon
// after the window it was recorded against is long gone.
async function appIcon(app, id = null) {
  if (!app) return null;
  if (!appIcons.has(app)) {
    try {
      appIcons.set(app, await invoke("window_icon", { id, appName: app }));
    } catch (err) {
      // Not worth surfacing: an app with no reachable icon is normal, and
      // the label already says which app was picked.
      console.error("window_icon failed", err);
      appIcons.set(app, null);
    }
  }
  return appIcons.get(app);
}

async function updateWindowIcon() {
  // Keyed on selectedAppName(), not selectedWindow: on the portal backend
  // the detected name is the only key there is, and window_icon falls back
  // to a desktop-entry lookup when it gets a name but no window id (see
  // icon_for_app_name in window_provider.rs).
  const appName = selectedAppName();
  const uri = await appIcon(appName, selectedWindow?.id);
  for (const img of regionEls("icon")) {
    img.hidden = !uri;
    if (uri) img.src = uri;
  }
  // The drawn/letter mark stands in whenever no icon file could be found —
  // the same fallback the chat rows use, so the picker and the list show
  // the same app the same way.
  for (const mark of regionEls("mark")) {
    mark.hidden = Boolean(uri) || !appName;
    if (!mark.hidden) setFallbackMark(mark, appName, 20);
  }
}

// Once an app has been identified, its name alone is the label — the
// picker sits behind a tick and an icon, so "Capturing:" and "Window:"
// were narrating what the row already shows. The name is what the user
// needs to check at a glance, and it gets the whole width to do it in.
function formatWindowLabel() {
  const identified = selectedAppName();
  if (identified) return identified;
  if (portalPick) {
    // Nothing identified yet — fall back to the portal's own description
    // ("window (1920x1080)"), which at least says whether a screen or a
    // single window was picked while identify_app is still in flight.
    return portalPick.label;
  }
  if (selectedWindow) return selectedWindow.title || "(unnamed window)";
  // On the portal backend "full screen" isn't a working default the way it
  // is elsewhere — nothing can be captured until the user has picked a
  // source once — so the empty state has to read as a required step.
  return captureBackend === "portal" ? "Nothing chosen yet" : "Full screen";
}

// One vision call, right after a pick — never per step. Runs whenever the
// OS didn't hand us a name (always, on the portal backend), and updates the
// label and icon in place when it lands rather than blocking the pick on
// it: the user should get their tick the instant they've chosen, and a
// name arriving a few seconds later is a detail filling in, not a step
// they're waiting on.
//
// A null app_name is a real answer ("I can't tell what this is") and is
// left as null rather than guessed at — a wrong name would silently scope
// every later Research call to the wrong software.
async function identifyPickedApp() {
  if (selectedWindow?.app_name) return;
  try {
    const identity = await withStatus(
      "Working out which app that is",
      () => invoke("identify_app", { scope: deriveScopeFromGlobals() }),
      { slowAfter: 4, stallAfter: 45 },
    );
    if (!identity?.app_name) return;
    detectedApp = identity;
    setRegionLabel(formatWindowLabel());
    await updateWindowIcon();

    // A chat can be created before this lands (research runs the moment
    // the goal is submitted, and the pick may come after), so the two that
    // could still be missing a name get it now — otherwise a chat made in
    // that window would keep `appName: null` for good and never show an
    // icon in the list.
    let changed = false;
    for (const skill of [pendingSkill, currentSkill]) {
      if (skill && !skill.appName) {
        skill.appName = identity.app_name;
        changed = true;
      }
    }
    if (changed) {
      await persistSkills();
      renderAppsList();
    }
  } catch (err) {
    // The pick itself already succeeded and capture works without a name,
    // so this failing costs only the label and the icon.
    console.error("identify_app failed", err);
  }
}

// Wayland path: the compositor runs the whole gesture (its own dialog,
// its own list of windows) and hands back a token — there is no click to
// catch and no rect to resolve, so none of the region-select window's
// machinery below is involved.
async function selectPortalSource() {
  const previousLabel = regionLabelText();
  setRegionBusy(true);
  setRegionLabel("Choose a screen or window in the system prompt…");

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
    // A new source is a new app until proven otherwise — carrying the old
    // detection over would label the new pick with the previous app's name.
    detectedApp = null;
    updateWindowIcon();
    let text = formatWindowLabel();
    if (!portalPick.persisted) {
      // Without a restore token every capture re-prompts, which would make
      // the guided loop unusable — say so now rather than mid-skill.
      text += " — your desktop won't remember this, so each capture will ask again";
    }
    setRegionLabel(text);
    onCaptureSourcePicked();
  } catch (err) {
    setRegionLabel(`Couldn't pick a source (${err})`);
    setTimeout(() => {
      if (regionLabelText().startsWith("Couldn't pick")) setRegionLabel(previousLabel);
    }, 5000);
  } finally {
    setRegionBusy(false);
    await getCurrentWindow().setFocus();
  }
}

async function selectWindow() {
  if (captureBackend === "portal") return selectPortalSource();

  const previousLabel = regionLabelText();
  setRegionBusy(true);
  setRegionLabel("Click the window you want…");

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
      setRegionLabel(`Nothing there — try clicking directly on a window (${err})`);
      await getCurrentWindow().show();
      await getCurrentWindow().setFocus();
      setRegionBusy(false);
      setTimeout(() => {
        if (regionLabelText().startsWith("Nothing there")) setRegionLabel(previousLabel);
      }, 3000);
      return;
    }
  }

  setRegionLabel(selectedWindow ? formatWindowLabel() : previousLabel);
  updateWindowIcon();
  await getCurrentWindow().show();
  await getCurrentWindow().setFocus();
  setRegionBusy(false);
  if (selectedWindow) onCaptureSourcePicked();
}

for (const el of regionEls("select")) el.addEventListener("click", selectWindow);
document.querySelector("#setup-continue").addEventListener("click", () => {
  showView("home");
});

// ---------- Home: two-step gate + research loader ----------
//
// A chat needs two things and doesn't care in which order they arrive: a
// goal to research, and a window to watch. Each gets its own tick in the
// home view's top pane; the step list opens once both have landed. That's
// why research isn't blocked on a window pick — it's the slow half, so it
// runs the moment the goal is submitted and its result waits (as
// `pendingSkill`) for the pick if the pick hasn't happened yet.

let pendingSkill = null;
let researchInFlight = false;
let phraseTimer = null;

const homeEls = {
  stepGoal: document.querySelector("#home-step-goal"),
  stepWindow: document.querySelector("#home-step-window"),
  research: document.querySelector("#home-research"),
  researchText: document.querySelector("#home-research-text"),
  researchSkip: document.querySelector("#home-research-skip"),
  goalInput: document.querySelector("#new-goal-input"),
};

// The two ticks live inside the controls they describe (the ask pill and
// the picker row), so there is no label to keep in sync — only the filled
// state.
function refreshHomeSteps() {
  const goalDone = researchInFlight || pendingSkill !== null || homeEls.goalInput.value.trim() !== "";
  homeEls.stepGoal.classList.toggle("done", goalDone);
  homeEls.stepWindow.classList.toggle("done", hasCaptureSource());
}

// Cycled while research is in flight so a 30-60s call reads as progress
// rather than a frozen line of text. The status bar still carries the
// authoritative elapsed-time/stall wording (see beginStatus) — this is the
// in-context, human half of the same wait.
const RESEARCH_PHRASES = [
  "Researching…",
  "Reading the documentation…",
  "Working out how this app does it…",
  "Finding the shortest path…",
  "Writing your steps…",
];

function startResearchTicker() {
  let i = 0;
  homeEls.research.hidden = false;
  homeEls.researchSkip.hidden = true;
  const show = () => {
    homeEls.researchText.textContent = RESEARCH_PHRASES[i % RESEARCH_PHRASES.length];
    // Restarting the CSS entry animation needs the element out of the
    // document's animation list for a frame; toggling the class alone
    // wouldn't re-trigger it.
    homeEls.researchText.style.animation = "none";
    void homeEls.researchText.offsetWidth;
    homeEls.researchText.style.animation = "";
    i++;
  };
  show();
  phraseTimer = setInterval(show, 2600);
}

function stopResearchTicker() {
  clearInterval(phraseTimer);
  phraseTimer = null;
  homeEls.research.hidden = true;
  homeEls.researchSkip.hidden = true;
}

// Called from both pick paths (native click-to-pick and the portal
// dialog). The 1s pause is deliberate: when research finished first, the
// pick is the last thing standing between the user and the step list, and
// jumping views the instant they click would swallow the tick they just
// earned. Nothing is waiting on the pick, so no pause.
function onCaptureSourcePicked() {
  refreshHomeSteps();
  // Not awaited: identification is a vision round trip, and the step list
  // must not sit behind it. Whatever it learns is backfilled onto the chat
  // afterwards (see identifyPickedApp), which is why the open below can go
  // ahead without a name in hand. Skipped when the user chose full screen
  // rather than an app — there's nothing there to identify.
  if (selectedWindow || portalPick) identifyPickedApp();
  if (pendingSkill) openPendingSkill(1000);
}

function openPendingSkill(delayMs) {
  const skill = pendingSkill;
  pendingSkill = null;
  setTimeout(async () => {
    stopResearchTicker();
    // Both are only knowable once the window has been picked, and research
    // can finish before that — so they're snapshotted here, at the moment
    // the chat actually opens, rather than when it was created.
    skill.captureScope = skill.captureScope ?? deriveScopeFromGlobals();
    if (!skill.appName) skill.appName = selectedAppName();
    await persistSkills();
    renderAppsList();
    refreshHomeSteps();
    openSkill(skill, { fade: true });
  }, delayMs);
}

// Escape hatch so a finished research call can't strand the user behind a
// pick they don't want to make: the native backend captures the whole
// screen perfectly well without one.
homeEls.researchSkip.addEventListener("click", () => {
  fullScreenAccepted = true;
  onCaptureSourcePicked();
});

homeEls.goalInput.addEventListener("input", refreshHomeSteps);

// ---------- Login ----------
//
// See docs/planning/login-membership-plan.md. The session token itself is
// held in the OS keychain (Rust side, lib.rs's store/get/clear_session_token
// — see docs.rs/keyring), never in localStorage/a file this app controls;
// this module only ever holds the decoded /api/me response in memory.

const WEBSITE_BASE_URL = "https://guidotutor.com";

// null = signed out (or /api/me hasn't resolved yet). Shape:
// { email, plan, status, skills_remaining, skills_included, can_save_skills }
let membership = null;

// Kept only so sign-out can tell the Worker which session to revoke
// (Better Auth's /api/auth/sign-out, bearer-authenticated same as every
// other call) — the token of record still lives in the OS keychain, this
// is just the copy currently active in this run of the app.
let currentSessionToken = null;

const PLAN_LABELS = { free: "Free", starter: "Starter", plus: "Plus", owner: "Owner" };

function applyMembership(info) {
  membership = info;
  const badge = document.querySelector("#plan-badge");
  const upgradeBtn = document.querySelector("#profile-upgrade");

  if (info) {
    els.profileMenu.querySelector(".profile-menu-who").textContent = info.email;
    const remaining = info.skills_remaining === null ? "unlimited" : `${info.skills_remaining} left`;
    els.profileMenu.querySelector(".profile-menu-meta").textContent = `${info.plan} plan · ${remaining}`;
    document.querySelector("#profile-signin").hidden = true;
    document.querySelector("#profile-signout").hidden = false;

    badge.hidden = false;
    badge.textContent = PLAN_LABELS[info.plan] ?? info.plan;
    badge.dataset.plan = info.plan;

    // Free/Starter get "Upgrade plan" (pushes toward a paid tier); Plus
    // and Owner get "Manage subscription" instead — same #view-pay screen
    // either way, see openPayView below.
    upgradeBtn.hidden = false;
    upgradeBtn.textContent = info.plan === "plus" || info.plan === "owner" ? "Manage subscription" : "Upgrade plan";
  } else {
    els.profileMenu.querySelector(".profile-menu-who").textContent = "Guest";
    els.profileMenu.querySelector(".profile-menu-meta").textContent = "Not signed in";
    document.querySelector("#profile-signin").hidden = false;
    document.querySelector("#profile-signout").hidden = true;

    badge.hidden = true;
    upgradeBtn.hidden = true;
  }
}

// Single screen for every paywall trigger — hitting the quota on a new
// ask, one ask costing more than what's left, or the profile menu's
// Upgrade/Manage item (docs/business/pricing.md's flat 1-per-skill
// charge is why "costs more" only ever means "you're at 0 left" today —
// see the cost param on /api/skills/start in worker/index.ts).
// `reason` is plain text shown in the pink callout, or null to hide it
// (the profile-menu path, which isn't reacting to a blocked action).
function openPayView(reason) {
  payReturnView = currentView === "pay" ? payReturnView : currentView;

  const planName = membership ? PLAN_LABELS[membership.plan] ?? membership.plan : "Free";
  document.querySelector("#pay-status-plan").textContent = `${planName} plan`;
  document.querySelector("#pay-status-meta").textContent = membership
    ? membership.skills_remaining === null
      ? "Unlimited new skills"
      : `${membership.skills_remaining} of ${membership.skills_included ?? 0} new skills left`
    : "Sign in to see your usage";

  const reasonEl = document.querySelector("#pay-reason");
  reasonEl.textContent = reason ?? "";
  reasonEl.hidden = !reason;

  showView("pay");
}

// Called both right after a fresh sign-in and on startup with a
// previously-stored token. A 401 means the token expired or was revoked
// server-side (the plan doc's reason for a real `sessions` table, not a
// signed-JWT-only approach) — fall through to the login view either way,
// same as never having signed in.
async function refreshMembership(token) {
  try {
    const res = await fetch(`${WEBSITE_BASE_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`api/me returned ${res.status}`);
    applyMembership(await res.json());
    currentSessionToken = token;
    return true;
  } catch (err) {
    console.error("refreshMembership failed", err);
    await invoke("clear_session_token").catch(() => {});
    applyMembership(null);
    currentSessionToken = null;
    return false;
  }
}

document.querySelector("#login-continue").addEventListener("click", () => {
  showView("home");
});

// "signin" | "signup" — sidebar.html has one form, this toggles its
// copy/mode rather than showing two separate views.
let loginMode = "signin";

function setLoginMode(mode) {
  loginMode = mode;
  const isSignup = mode === "signup";
  document.querySelector("#login-mode-label").textContent = isSignup ? "Create your account" : "Sign in to continue";
  document.querySelector("#login-submit").textContent = isSignup ? "Sign up" : "Sign in";
  document.querySelector("#login-toggle-mode").textContent = isSignup
    ? "Already have an account? Sign in"
    : "Need an account? Sign up";
  document.querySelector("#login-password").autocomplete = isSignup ? "new-password" : "current-password";
  setLoginError(null);
}

function setLoginError(message) {
  const el = document.querySelector("#login-error");
  el.textContent = message ?? "";
  el.hidden = !message;
}

document.querySelector("#login-toggle-mode").addEventListener("click", () => {
  setLoginMode(loginMode === "signin" ? "signup" : "signin");
});

// Straight to the Worker's Better Auth routes (worker/better-auth.ts) —
// no browser round trip, since a plain email+password form has no
// OAuth consent screen to hand off to. The bearer plugin returns the
// session token in the `set-auth-token` response header, not the JSON
// body — see docs.better-auth.com/docs/plugins/bearer.
async function submitLogin(email, password) {
  const path = loginMode === "signup" ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email";
  const body = loginMode === "signup" ? { email, password, name: email.split("@")[0] } : { email, password };

  const res = await fetch(`${WEBSITE_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const token = res.headers.get("set-auth-token");
  if (!res.ok || !token) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.message || payload.error || "Sign-in failed");
  }

  await invoke("store_session_token", { token }).catch(() => {});
  return token;
}

document.querySelector("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.querySelector("#login-email").value.trim();
  const password = document.querySelector("#login-password").value;
  const submitBtn = document.querySelector("#login-submit");

  setLoginError(null);
  submitBtn.disabled = true;
  try {
    const token = await submitLogin(email, password);
    if (await refreshMembership(token)) showView("home");
  } catch (err) {
    console.error("login failed", err);
    setLoginError(err.message || "Something went wrong. Try again.");
  } finally {
    submitBtn.disabled = false;
  }
});

els.profileBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  setProfileOpen(!els.profileMenu.classList.contains("open"));
});
document.addEventListener("click", () => setProfileOpen(false));
els.profileMenu.addEventListener("click", (e) => e.stopPropagation());
document.querySelector("#profile-signin").addEventListener("click", () => {
  setProfileOpen(false);
  setLoginMode("signin");
  showView("login");
});
document.querySelector("#profile-signout").addEventListener("click", async () => {
  setProfileOpen(false);
  // Revoke server-side first (deletes the `session` row — Better Auth's
  // bearer-auth sign-out), not just the local keychain copy: otherwise a
  // "signed out" token stays valid against /api/me for the rest of its
  // 7-day life if anything else ever got hold of it.
  if (currentSessionToken) {
    // Better Auth's sign-out route 400s on a body-less POST — it insists
    // on parseable JSON even though it ignores the content.
    await fetch(`${WEBSITE_BASE_URL}/api/auth/sign-out`, {
      method: "POST",
      headers: { Authorization: `Bearer ${currentSessionToken}`, "Content-Type": "application/json" },
      body: "{}",
    }).catch((err) => console.error("sign-out request failed", err));
  }
  currentSessionToken = null;
  await invoke("clear_session_token").catch(() => {});
  applyMembership(null);
  showView("login");
});
document.querySelector("#profile-upgrade").addEventListener("click", () => {
  setProfileOpen(false);
  openPayView(null);
});
document.querySelector("#profile-attach").addEventListener("click", () => {
  setProfileOpen(false);
  showView("setup");
});

// No Stripe yet (docs/planning/login-membership-plan.md's "Open /
// deferred") — these are placeholders so the upgrade path has somewhere
// to go without pretending to charge anyone. Real checkout replaces the
// alert with whatever Stripe flow gets built.
document.querySelectorAll("[data-plan-target]").forEach((btn) => {
  btn.addEventListener("click", () => {
    alert(`Checkout for ${btn.dataset.planTarget} isn't wired up yet — ask Charlie to flip your plan in D1 for now.`);
  });
});
document.querySelector("#pay-manage-btn").addEventListener("click", () => {
  alert("Subscription management is coming soon.");
});

// Logos we ship, for apps whose icon can't be extracted from a live
// window — the Excel fixtures have no window to extract from at all, so
// without this the demo rows are the only ones in the list with an empty
// icon slot. Matched loosely because the same app arrives named
// differently depending on the source (X11 WM_CLASS, the vision model's
// product name, or the fixture's own string); kept narrow enough that
// Calc and Sheets don't end up wearing Excel's logo.
//
// Only reached when no real icon could be found: where the machine
// actually has the app installed, icon_for_app_name resolves its real
// icon file and that wins (see the appIcon call in renderAppsList).
const APP_MARK_IMAGES = [
  [/\bexcel\b|xlsx?/i, "assets/excel.png"],
];

// On startup, a previously-stored session token (OS keychain) skips
// straight past the login view if it still checks out against /api/me;
// otherwise the app falls back to today's "Continue without signing in"
// demo path.
async function restoreSession() {
  const token = await invoke("get_session_token").catch(() => null);
  if (token && (await refreshMembership(token))) {
    showView("home");
  } else {
    fitWindow("login");
  }
}

function setFallbackMark(el, appName, size = 40) {
  const logo = APP_MARK_IMAGES.find(([pattern]) => pattern.test(appName ?? ""));
  if (logo) {
    // `drawn` drops the neutral tile the letter avatar needs — a real logo
    // brings its own shape and background.
    el.classList.add("drawn");
    el.innerHTML = `<img src="${logo[1]}" alt="" width="${size}" height="${size}" />`;
    return;
  }
  el.classList.remove("drawn");
  el.textContent = (appName ?? "?").trim().charAt(0).toUpperCase() || "?";
}

// Chats are grouped by the app they're about — one card per app, titled
// "<App> chats", with every chat for that app listed inside it under the
// group's own icon. One flat row per skill was fine at two or three chats
// and stops being fine at twenty, where the same app's chats end up
// scattered down the list with no way to see them together.
//
// Ranking is recency, twice over: chats inside a group are newest-first,
// and the groups themselves sort by their own newest chat — so the app you
// last asked about is the card at the top.
//
// Call this after every SKILLS mutation and before showing the home view,
// so it's always current. A skill is otherwise reachable only in the
// instant right after asking (openSkill at the end of submitNewGoal);
// leaving that view for any reason used to orphan it — still safely on
// disk, just nothing in the UI could get back to it. With nothing saved
// the whole section including its heading is hidden, rather than an empty
// header over a blank strip: the ask box above is already the "what do you
// do here" affordance on a fresh install.

// Chats about the same app must land in the same group even though the
// app's name reaches us by several routes that disagree — an X11 WM_CLASS
// ("libreoffice-calc"), the vision model's product name ("Microsoft
// Excel"), a fixture's own shorthand ("Excel"). Normalising case and
// punctuation gets most of it; dropping the vendor word is what makes
// "Excel" and "Microsoft Excel" one group rather than two.
const VENDOR_PREFIXES = /^(microsoft|apple|google|adobe|jetbrains|mozilla)\s+/i;

function appGroupKey(appName) {
  if (!appName) return "";
  return appName.trim().replace(VENDOR_PREFIXES, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Sort key. Chats saved before createdAt existed have none, so they fall
// back to their position in SKILLS — which is save order, since
// persistSkills writes the array as-is and loadPersistedSkills reads it
// back in order. That keeps an old skills.json ordered sensibly instead of
// collapsing every pre-existing chat to the same timestamp.
function skillTime(skill) {
  const t = Date.parse(skill.createdAt ?? "");
  return Number.isFinite(t) ? t : SKILLS.indexOf(skill);
}

function groupSkills() {
  const groups = new Map();
  for (const skill of SKILLS) {
    const key = appGroupKey(skill.appName);
    if (!groups.has(key)) groups.set(key, { key, skills: [] });
    groups.get(key).skills.push(skill);
  }
  for (const group of groups.values()) {
    group.skills.sort((a, b) => skillTime(b) - skillTime(a));
    // The newest chat also names the group and supplies its icon: it's the
    // most recent thing the app was called, which is the best guess at
    // what it's actually called now.
    group.appName = group.skills[0].appName ?? null;
    group.newest = skillTime(group.skills[0]);
  }
  return [...groups.values()].sort((a, b) => b.newest - a.newest);
}

// Home lists one button per app; opening one goes to its own page (the
// `group` view) listing that app's chats. One long scroll holding every
// group expanded was fine at two apps and stops being fine at ten, where
// finding a chat means scrolling past every other app's.
function renderAppsList() {
  const list = document.querySelector("#apps-list");
  const kicker = document.querySelector("#apps-kicker");
  list.innerHTML = "";
  kicker.hidden = SKILLS.length === 0;

  for (const group of groupSkills()) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "chat-group";
    card.innerHTML = `
      <img class="chat-group-icon" alt="" hidden />
      <span class="chat-group-mark"></span>
      <div class="chat-group-text">
        <div class="chat-group-title"></div>
        <div class="chat-group-meta"></div>
      </div>
      <div class="chat-group-count"></div>
      ${ChevronDownIcon({ size: 16 })}
    `;
    card.querySelector(".chat-group-title").textContent = `${group.appName ?? "Unsorted"} chats`;
    // The newest chat's title, as a hint at what's inside without opening
    // it — the group name alone says nothing a user recognises.
    card.querySelector(".chat-group-meta").textContent = `Latest: ${group.skills[0].title}`;
    card.querySelector(".chat-group-count").textContent = group.skills.length;
    card.addEventListener("click", () => openGroup(group.key));

    applyGroupIcon(group, [[card.querySelector(".chat-group-icon"), card.querySelector(".chat-group-mark"), 34]]);
    list.appendChild(card);
  }
}

// Resolves the group's icon once and applies it to every slot that should
// wear it — the group button, and later every row on its page. The whole
// point of grouping is that these chats share an app, so they share one
// lookup rather than each doing its own.
//
// `slots` is [imgEl, markEl, size] triples: the mark renders immediately
// (a shipped logo, or the app's initial) and is swapped for the real icon
// if the async lookup finds one, so nothing reflows from icon-less to
// icon-ful.
function applyGroupIcon(group, slots) {
  for (const [, mark, size] of slots) setFallbackMark(mark, group.appName, size);
  appIcon(group.appName).then((uri) => {
    if (!uri) return;
    for (const [img, mark] of slots) {
      mark.hidden = true;
      img.src = uri;
      img.hidden = false;
    }
  });
}

// Which group's page is open. Held as a key, not the object: groups are
// derived fresh from SKILLS on every render, so the object identity from
// one render is stale by the next (after a delete, say).
let currentGroupKey = null;
let currentGroup = null;

function openGroup(key) {
  currentGroupKey = key;
  renderGroupView();
  showView("group");
}

function renderGroupView() {
  currentGroup = groupSkills().find((g) => g.key === currentGroupKey) ?? null;
  const body = document.querySelector("#group-body");
  body.innerHTML = "";
  // Deleting a group's last chat leaves nothing to show — the page would
  // otherwise sit there empty with a back button as its only content.
  if (!currentGroup) {
    showView("home");
    return;
  }

  const slots = [];
  for (const skill of currentGroup.skills) {
    const generated = skill.steps.filter((s) => s.generated).length;
    // A div, not a button: the delete control is itself a button and
    // nesting one inside another is invalid, so the row is a container
    // with a full-width "open" button plus the delete button beside it.
    const row = document.createElement("div");
    row.className = "chat-row";
    row.innerHTML = `
      <button class="chat-row-main" type="button">
        <img class="chat-row-icon" alt="" hidden />
        <span class="chat-row-mark"></span>
        <div class="chat-row-text">
          <div class="chat-row-title"></div>
          <div class="chat-row-meta"></div>
        </div>
      </button>
      <button class="chat-row-delete" type="button" title="Delete this chat">
        ${TrashIcon({ size: 14 })}
      </button>
    `;
    row.querySelector(".chat-row-title").textContent = skill.title;
    row.querySelector(".chat-row-meta").textContent =
      `${generated}/${skill.steps.length} steps ready · ${skill.goal}`;
    row.querySelector(".chat-row-main").addEventListener("click", () => openSkill(skill));
    row.querySelector(".chat-row-delete").addEventListener("click", () => deleteSkill(skill));
    slots.push([row.querySelector(".chat-row-icon"), row.querySelector(".chat-row-mark"), 26]);
    body.appendChild(row);
  }
  applyGroupIcon(currentGroup, slots);
}

async function deleteSkill(skill) {
  const i = SKILLS.indexOf(skill);
  if (i === -1) return;
  SKILLS.splice(i, 1);
  // Leaving the deleted skill open would show a chat that no longer
  // exists and re-persist it on the next edit.
  if (currentSkill === skill) {
    currentSkill = null;
    currentStep = null;
    showView("home");
  }
  renderAppsList();
  // The open group page is a view onto SKILLS too, and it's the view the
  // delete was almost certainly clicked from.
  if (currentView === "group") renderGroupView();
  await persistSkills();
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
  } catch (err) {
    console.error("failed to load persisted skills, keeping fixture demo data", err);
  }
}

// Research is one-shot per chat, text-only (no screenshot) — see
// docs/features/skills.md. It returns coarse top-level steps (title +
// brief + watch_for — goal-scoped facts only, nothing screen-specific);
// substeps are generated later, lazily, once the user actually reaches
// each step (see openStep/the per-step chat view below).
// Quota unit is a new skill (docs/business/pricing.md) — flat 1 per ask,
// charged via /api/skills/start after Research succeeds (not before:
// no point spending someone's quota on a call that might fail). Skipped
// entirely when signed out — "Continue without signing in" stays the
// unmetered demo path, per restoreSession's fallback above. Returns
// false only on a real 403 (quota actually exhausted server-side); a
// network hiccup here doesn't block a skill someone already researched.
async function chargeForNewSkill() {
  if (!currentSessionToken) return true;
  try {
    const res = await fetch(`${WEBSITE_BASE_URL}/api/skills/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${currentSessionToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ cost: 1 }),
    });
    const payload = await res.json().catch(() => ({}));
    if (membership) applyMembership({ ...membership, ...payload });
    return res.ok;
  } catch (err) {
    console.error("skills/start failed, allowing the skill through", err);
    return true;
  }
}

async function submitNewGoal() {
  const input = document.querySelector("#new-goal-input");
  const button = document.querySelector("#new-goal-send");
  const errorEl = document.querySelector("#new-goal-error");
  const goal = input.value.trim();
  if (!goal) return;

  // Client-side pre-check against the cached /api/me numbers — saves a
  // Research call outright when it's obviously going to be blocked.
  // chargeForNewSkill() still re-checks server-side after Research
  // succeeds (this cache can be stale — another device, another chat).
  if (membership && membership.skills_remaining !== null && membership.skills_remaining < 1) {
    openPayView("You've used your free new skill — upgrade to keep going.");
    return;
  }

  input.disabled = true;
  button.disabled = true;
  errorEl.textContent = "";
  researchInFlight = true;
  refreshHomeSteps();
  startResearchTicker();

  try {
    // Real Claude web-search round trip, routinely 30-60s — see the
    // global status bar (#status-bar) for what tells the user this is
    // still in flight rather than hung. stallAfter is well past the
    // typical range before it starts suggesting something's actually
    // wrong, so a normal slow call never gets flagged.
    const research = await withStatus(
      `Researching "${goal}"`,
      () => invoke("research_goal", { goal, appName: selectedAppName() }),
      {
        slowAfter: 8,
        stallAfter: 90,
        stalledHint: "Research calls are normally done within a minute. If your Anthropic API key is out of credit, this call fails fast instead of hanging — so this most likely means it's still genuinely working.",
      },
    );
    // Only clear now that research actually succeeded — clearing eagerly
    // on submit meant a failed research_goal call (bad network, no API
    // credit) lost the typed goal with no way to retry without retyping it.
    input.value = "";
    const skill = {
      id: `skill-${nextSkillId++}`,
      // AI-written, ChatGPT-style short description of the goal (see
      // research.py) — shown everywhere the chat is listed instead of
      // the user's raw prompt, which is often a run-on question and
      // doesn't read well as a label. `goal` (the actual prompt) is kept
      // separately below — still what Research/plan_step reason about,
      // still the path view's subtitle. Falls back to the raw goal only
      // if research.py ever returns an empty title, which its own
      // validation shouldn't allow, but an empty title-as-label would be
      // a confusing empty row where the fallback is at least legible.
      title: research.title || goal,
      goal,
      appName: selectedAppName(),
      // What the chat list ranks by — newest chat first within its app's
      // group, and the group with the newest chat first overall.
      createdAt: new Date().toISOString(),
      steps: research.steps.map((step, i) => ({
        id: `s${i + 1}`,
        title: step.title,
        brief: step.brief,
        watch_for: step.watch_for,
        generated: false,
        substeps: [],
      })),
    };

    if (!(await chargeForNewSkill())) {
      openPayView("This skill needs more than you have left — upgrade to keep going.");
      return;
    }

    SKILLS.push(skill);
    // Saved and listed before the step list opens, not after: this is what
    // makes a brand-new chat show up under "Previous chats" even if the
    // user never gets as far as opening it (or picks no window at all).
    await persistSkills();
    pendingSkill = skill;
    renderAppsList();

    if (hasCaptureSource()) {
      openPendingSkill(0);
    } else {
      // Research landed first — hold the result and say what's left.
      // Kept to one line: the skip button below it needs the second one,
      // and the top pane is a fixed fraction of the panel.
      homeEls.researchText.textContent =
        captureBackend === "portal"
          ? "Steps ready — choose what to capture."
          : "Steps ready — pick your window.";
      homeEls.researchSkip.hidden = captureBackend === "portal";
    }
  } catch (err) {
    // Logged as well as shown in the UI: the UI message is truncated/plain
    // text, but the console gets the full error object (stack, cause) —
    // the difference between "why does it break" being a guess and being
    // an actual answer.
    console.error("research_goal failed", err);
    errorEl.textContent = `Couldn't research that: ${err}`;
    stopResearchTicker();
  } finally {
    researchInFlight = false;
    input.disabled = false;
    button.disabled = false;
    refreshHomeSteps();
  }
}

document.querySelector("#new-goal-send").addEventListener("click", submitNewGoal);
document.querySelector("#new-goal-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitNewGoal();
});

function openSkill(skill, { fade = false } = {}) {
  currentSkill = skill;
  const first = skill.steps.find((s) => s.generated);
  expandedStepId = first ? first.id : null;
  renderPath();
  showView("path", { fade });
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
      // What "Check my work" verifies against (verifyHtml/verify_substep
      // below) — plan_step.py has generated this alongside the other
      // fields since this session's earlier pass, but nothing carried it
      // from the Rust response onto the stored substep until now, so the
      // Check-my-work button never had anything to show.
      expected_outcome: sub.expected_outcome,
      last_known_bbox: null,
    }));
    step.generated = true;
    expandedStepId = step.id;
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
    const expanded = expandedStepId === step.id;

    const row = document.createElement("div");
    row.className = "step-row";

    const rail = document.createElement("div");
    rail.className = "step-rail";
    // Guido replaces the plain dot only on the one step currently open —
    // the accordion guarantees there's at most one "current" step at a
    // time, so this never has to pick among several candidates.
    const marker = expanded
      ? `<img class="step-mascot" src="assets/mascot/mascot-${step.planning ? "thinking" : "idle"}.svg" alt="" />`
      : `<div class="step-dot ${step.completed ? "completed" : step.generated ? "" : "locked"}"></div>`;
    rail.innerHTML = `${marker}${isLast ? "" : '<div class="step-line"></div>'}`;
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
        expandedStepId = expandedStepId === step.id ? null : step.id;
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
      // screenshot involved) — internal now, not rendered here at all:
      // they're an input to the vision call instead (see locateContext),
      // read alongside the screenshot when a substep's element is
      // located, rather than shown to the user as prose. "Details" for a
      // locked step used to expand this text; there's nothing left for it
      // to show until the step is actually generated, at which point
      // clicking the step head (above) already expands the real substep
      // list — that's the "Details expand shows substeps" behavior, and
      // it needs no separate control since one already exists.
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
        error.className = "step-caption step-error";
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

// Everything Research/plan_step already knows about this step, folded
// into one plain-text block for the vision call (locate_element →
// live_step.py → locate.py) to read alongside the screenshot — the
// description text a step's Research output carries (brief/watch_for)
// was previously rendered on screen behind the "Details" toggle; it's
// internal now; this is where it actually gets used instead of shown.
// "Progress" is the substeps already reached in this step (excluding the
// one being located right now), so a call mid-step knows what's already
// been covered rather than treating every locate as the first one.
function locateContext(sub) {
  const lines = [];
  if (currentSkill?.goal) lines.push(`Overall goal: ${currentSkill.goal}`);
  if (currentStep?.title) lines.push(`Current step: ${currentStep.title}`);
  if (currentStep?.brief) lines.push(`Step description: ${currentStep.brief}`);
  if (currentStep?.watch_for) lines.push(`Watch for: ${currentStep.watch_for}`);

  const covered = (currentStep?.substeps ?? []).filter((s) => s !== sub && s.target_description);
  if (covered.length > 0) {
    lines.push("Already covered earlier in this step:");
    for (const s of covered) lines.push(`- ${s.target_description}`);
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

// Which substep's overlay is currently on screen, if any.
let overlaidSubstepId = null;

// Which AI substep a typed-in-the-box follow-up question will attach to
// (see docs/features/skills.md's reactive-substep scoping, resolved
// 2026-08-29). Set by clicking a substep bubble, or implicitly by "Ask
// for help" on a failed verify. Falls back to the last AI substep in the
// step if nothing's been explicitly picked — the most likely thing a
// question right after opening a step's chat is actually about.
let focusedSubstepId = null;

// Per-question opt-in, not a sticky mode: reset after every send so a
// screenshot is always a deliberate choice for *that* question, not
// something left on and forgotten for the next one.
let includeScreenshotForNextQuestion = false;

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

// "Check my work" — a manual, per-substep AI verify against
// expected_outcome (plan_step's own field, see plan_step.py). Absolute
// checks only for now ("Exposure ≈ +0.5"); a relative/before-after check
// would need a screenshot at the substep's *start*, which contradicts
// Verify's whole premise that a screenshot only happens on this button
// press — deferred to BL-011 in docs/BACKLOG.md rather than solved here.
// Separate from the eye/target/note icon row above: this one costs an
// API call and changes what's shown below it, so it's a labeled button,
// not an icon.
function verifyHtml(sub) {
  if (!sub.expected_outcome) return "";
  const button = `<button class="bubble-verify-btn" data-verify="${sub.id}" type="button">${CheckIcon({
    size: 13,
  })}Check my work</button>`;
  if (!sub.verifyResult) return button;

  const { matches, observed } = sub.verifyResult;
  const askHelp = matches
    ? ""
    : `<button class="verify-ask-help" data-ask-help="${sub.id}" type="button">Ask for help</button>`;
  return `
    ${button}
    <div class="verify-result ${matches ? "match" : "mismatch"}">
      <div class="verify-result-row">
        <span class="verify-result-label">Expected</span>
        <span>${sub.expected_outcome}</span>
      </div>
      <div class="verify-result-row">
        <span class="verify-result-label">Observed</span>
        <span>${observed}</span>
      </div>
      <div class="verify-result-verdict">${matches ? "✓ Looks right" : "✗ Doesn't match yet"}</div>
      ${askHelp}
    </div>
  `;
}

function substepBubbleHtml(sub) {
  if (sub.origin === "ai") {
    return `
      <div class="bubble-ai" data-substep-id="${sub.id}">
        <div class="bubble-target">${sub.target_description}</div>
        <div class="bubble-instruction">${sub.instruction_text}</div>
        ${actionsHtml(sub)}
        ${verifyHtml(sub)}
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
        ${verifyHtml(sub)}
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

// Groups each reactive (pink) substep under the AI substep it's tied to
// (`respondingTo`, see docs/features/skills.md), instead of the flat
// append-at-the-end order this rendered in before. A reply with no
// `respondingTo` — a legacy substep from before this existed, or one
// whose target substep is somehow gone — falls back to rendering at the
// end, same as the old behavior, rather than silently vanishing.
function renderChatParts() {
  const subs = currentStep.substeps;
  const repliesByTarget = new Map();
  const orphanReplies = [];
  for (const sub of subs) {
    if (sub.origin !== "user") continue;
    const target = sub.respondingTo && subs.some((s) => s.id === sub.respondingTo) ? sub.respondingTo : null;
    if (target) {
      if (!repliesByTarget.has(target)) repliesByTarget.set(target, []);
      repliesByTarget.get(target).push(sub);
    } else {
      orphanReplies.push(sub);
    }
  }

  const parts = [];
  for (const sub of subs) {
    if (sub.origin !== "ai") continue;
    parts.push(substepBubbleHtml(sub));
    for (const reply of repliesByTarget.get(sub.id) ?? []) {
      parts.push(`<div class="bubble-reply">${substepBubbleHtml(reply)}</div>`);
    }
  }
  for (const reply of orphanReplies) parts.push(substepBubbleHtml(reply));
  return parts.join("");
}

function renderChat() {
  const body = document.querySelector("#chat-body");
  body.innerHTML = renderChatParts();

  body.querySelectorAll(".bubble-ai").forEach((el) => {
    el.classList.toggle("focused", el.dataset.substepId === focusedSubstepId);
    el.addEventListener("click", (e) => {
      // Don't steal focus from a click that was actually on one of the
      // bubble's own action buttons (eye/target/note/verify).
      if (e.target.closest("button")) return;
      focusedSubstepId = el.dataset.substepId;
      renderChat();
    });
  });

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
          context: locateContext(sub),
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

  body.querySelectorAll("[data-verify]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const sub = currentStep.substeps.find((s) => s.id === btn.dataset.verify);
      if (!sub || !sub.expected_outcome) return;
      btn.disabled = true;
      btn.classList.add("busy");
      try {
        sub.verifyResult = await invoke("verify_substep", {
          expectedOutcome: sub.expected_outcome,
          scope: currentCaptureScope(),
          context: locateContext(sub),
        });
        await persistSkills();
        renderChat();
      } catch (err) {
        btn.classList.remove("busy");
        btn.disabled = false;
        btn.title = `Couldn't check: ${err}`;
      }
    });
  });

  body.querySelectorAll("[data-ask-help]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sub = currentStep.substeps.find((s) => s.id === btn.dataset.askHelp);
      if (!sub) return;
      // Explicitly ties the follow-up to the substep whose check failed —
      // this is exactly the case respondingTo exists for (see
      // renderChatParts) — and prefills rather than auto-sends: the
      // observed text is a useful starting point, not necessarily
      // exactly what the user wants to ask.
      focusedSubstepId = sub.id;
      const input = document.querySelector("#chat-input");
      input.value = `I did this but it still shows: ${sub.verifyResult?.observed ?? "something unexpected"}. What should I do?`;
      input.focus();
      renderChat();
    });
  });

  body.scrollTop = body.scrollHeight;
  updateStepAdvanceButton();
}

// Plain self-confirm, free — the "user decides they're done" advance
// skills.md's Per-step loop already describes. Deliberately NOT gated on
// every substep having been AI-verified: per this session's design
// discussion, a step confirmed with no verify anywhere in it just skips
// straight to the next step's plan_step call staying text-only (no
// derived screenshot taken on its behalf) — see
// docs/planning/vision-driven-substep-loop.md's open question 2.
function updateStepAdvanceButton() {
  const btn = document.querySelector("#step-advance");
  const index = currentSkill.steps.findIndex((s) => s.id === currentStep.id);
  const isLast = index === currentSkill.steps.length - 1;
  btn.textContent = isLast ? "Skill complete" : "Next step";
  btn.disabled = isLast;
}

async function advanceToNextStep() {
  const index = currentSkill.steps.findIndex((s) => s.id === currentStep.id);
  const next = currentSkill.steps[index + 1];
  if (!next) return;
  // Green means "the user moved on," not "every substep verified" — Verify
  // stays optional per updateStepAdvanceButton's note above, so completion
  // tracks the same self-confirm rather than adding a stricter gate.
  currentStep.completed = true;
  expandedStepId = next.id;
  await persistSkills();
  if (!next.generated && !next.planning) {
    await generateStepSubsteps(next);
  }
  openStep(next);
}

document.querySelector("#step-advance").addEventListener("click", advanceToNextStep);

// Which AI substep a question actually attaches to: whatever's focused
// (a click on a bubble, or "Ask for help"), falling back to the last AI
// substep in the step — the most likely thing a question is about if the
// user never explicitly picked one.
function resolveRespondingTo() {
  if (focusedSubstepId && currentStep.substeps.some((s) => s.id === focusedSubstepId && s.origin === "ai")) {
    return focusedSubstepId;
  }
  const lastAi = [...currentStep.substeps].reverse().find((s) => s.origin === "ai");
  return lastAi ? lastAi.id : null;
}

// Reuses locateContext's goal/step/covered-substeps boilerplate (same
// context bundle locate_element/verify_substep already build — see
// docs/features/skills.md), with one line prepended naming exactly which
// substep the question is tied to, since locateContext alone doesn't say
// that explicitly.
function answerContext(respondingToSub) {
  const base = locateContext(respondingToSub);
  if (!respondingToSub) return base;
  const focusLine = `The user is asking specifically about this instruction: "${respondingToSub.instruction_text}" (target: ${respondingToSub.target_description}).`;
  return base ? `${focusLine}\n${base}` : focusLine;
}

function updateScreenshotToggleUi() {
  document.querySelector("#chat-screenshot-toggle").classList.toggle("active", includeScreenshotForNextQuestion);
  document.querySelector("#chat-screenshot-toggle").setAttribute("aria-pressed", String(includeScreenshotForNextQuestion));
}

document.querySelector("#chat-screenshot-toggle").innerHTML = ImageIcon({ size: 16 });
document.querySelector("#chat-screenshot-toggle").addEventListener("click", () => {
  includeScreenshotForNextQuestion = !includeScreenshotForNextQuestion;
  updateScreenshotToggleUi();
});

async function sendChatMessage() {
  const input = document.querySelector("#chat-input");
  const sendBtn = document.querySelector("#chat-send");
  const question = input.value.trim();
  if (!question) return;
  input.value = "";
  input.disabled = true;
  sendBtn.disabled = true;

  const withScreenshot = includeScreenshotForNextQuestion;
  includeScreenshotForNextQuestion = false;
  updateScreenshotToggleUi();

  const respondingTo = resolveRespondingTo();
  const respondingToSub = currentStep.substeps.find((s) => s.id === respondingTo) ?? null;

  // Appended optimistically, before the answer comes back — the question
  // itself is real the instant it's sent; only instruction_text (the
  // answer) is still pending, shown as a placeholder until it resolves.
  const substep = {
    id: `${currentStep.id}-live-${currentStep.substeps.length + 1}`,
    origin: "user",
    question,
    respondingTo,
    instruction_text: "Thinking…",
    action: "none",
    last_known_bbox: respondingToSub?.last_known_bbox ?? null,
  };
  currentStep.substeps.push(substep);
  renderChat();

  try {
    const result = await withStatus("Answering your question", () =>
      invoke("answer_question", {
        question,
        withScreenshot,
        scope: withScreenshot ? currentCaptureScope() : null,
        context: answerContext(respondingToSub),
      }),
    { slowAfter: 4, stallAfter: 30 });
    substep.instruction_text = result.answer;
  } catch (err) {
    substep.instruction_text = `Couldn't get an answer: ${err}`;
  } finally {
    input.disabled = false;
    sendBtn.disabled = false;
    renderChat();
    await persistSkills();
  }
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
restoreSession();
