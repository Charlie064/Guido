const { listen } = window.__TAURI__.event;
const stage = document.querySelector("#stage");

function placeCallout(hit, index) {
  const gap = 10;
  const width = Math.min(280, window.innerWidth * 0.3);
  const preferRight = hit.left + hit.width + gap + width < window.innerWidth - 8;
  let left = preferRight ? hit.left + hit.width + gap : hit.left - width - gap;
  let top = hit.top;
  if (left < 8) left = 8;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  if (top < 8) top = 8;
  if (top + 88 > window.innerHeight - 8) top = Math.max(8, window.innerHeight - 96);
  top += (index % 3) * 8;
  return { left, top, width };
}

function render(payload) {
  requestAnimationFrame(() => draw(payload));
}

function draw(payload) {
  const items = payload?.items || [];
  stage.innerHTML = "";
  items.forEach((item, i) => {
    const hit = {
      left: item.left ?? (item.leftPct / 100) * window.innerWidth,
      top: item.top ?? (item.topPct / 100) * window.innerHeight,
      width: item.width ?? (item.widthPct / 100) * window.innerWidth,
      height: item.height ?? (item.heightPct / 100) * window.innerHeight,
    };
    const box = document.createElement("div");
    box.className = `hit origin-${item.origin || "ai"}`;
    box.style.left = `${hit.left}px`;
    box.style.top = `${hit.top}px`;
    box.style.width = `${Math.max(hit.width, 8)}px`;
    box.style.height = `${Math.max(hit.height, 8)}px`;
    const n = document.createElement("span");
    n.className = "hit-n";
    n.textContent = String(item.n ?? i + 1);
    box.appendChild(n);
    stage.appendChild(box);

    const pos = placeCallout(hit, i);
    const callout = document.createElement("div");
    callout.className = `callout origin-${item.origin || "ai"}`;
    callout.style.left = `${pos.left}px`;
    callout.style.top = `${pos.top}px`;
    callout.style.width = `${pos.width}px`;
    const top = document.createElement("div");
    top.className = "callout-top";
    const mark = document.createElement("img");
    mark.className = "callout-mark";
    mark.src = "assets/guido-icon.png";
    mark.alt = "";
    const num = document.createElement("span");
    num.className = "callout-n";
    num.textContent = String(item.n ?? i + 1);
    const kicker = document.createElement("div");
    kicker.className = "callout-kicker";
    kicker.textContent = item.title || "Step";
    top.appendChild(mark);
    top.appendChild(num);
    top.appendChild(kicker);
    const text = document.createElement("div");
    text.className = "callout-text";
    text.textContent = item.text || "";
    callout.appendChild(top);
    callout.appendChild(text);
    stage.appendChild(callout);
  });
}

listen("tutoria:demo-overlay-show", (event) => render(event.payload));
listen("tutoria:demo-overlay-hide", () => {
  stage.innerHTML = "";
});
