// Shared icon pool, ported from the brainroot project's own pool
// (brainroot `src/components/icons/index.tsx`) — hand-drawn SVGs, never
// traced from a third-party icon set, so nothing here carries a license
// question. One icon per concept, reused wherever that concept appears.
// Before drawing a new icon, check here first.
//
// Ported to plain functions returning SVG *strings* rather than the React
// components the originals are: this app is vanilla HTML/JS (see
// sidebar.html), and every call site already builds markup with template
// strings / innerHTML, so a string is what's actually usable. Same
// `{size, color}` options and the same default sizes as the originals.
//
// `src/icons.html` renders every icon in this file as a gallery — open it
// to see the set (a hidden Tauri window, or just open the file directly in
// a browser).

// The insight-card gold from the source pool — kept so ported icons that
// default to it (CardStarIcon) look the same here as there.
export const CARD_GOLD = "#F5A623";

// --- rounded-star geometry (ported verbatim; plain math, no React) ---

function starVertices(cx, cy, outerR, innerR, points) {
  const verts = [];
  const step = Math.PI / points;
  let angle = -Math.PI / 2;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    verts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    angle += step;
  }
  return verts;
}

function roundedPolygonPath(verts, radius) {
  const n = verts.length;
  const d = [];
  for (let i = 0; i < n; i++) {
    const prev = verts[(i - 1 + n) % n];
    const curr = verts[i];
    const next = verts[(i + 1) % n];
    const toPrev = { x: prev.x - curr.x, y: prev.y - curr.y };
    const toNext = { x: next.x - curr.x, y: next.y - curr.y };
    const lenPrev = Math.hypot(toPrev.x, toPrev.y);
    const lenNext = Math.hypot(toNext.x, toNext.y);
    const r = Math.min(radius, lenPrev * 0.45, lenNext * 0.45);
    const a = { x: curr.x + (toPrev.x / lenPrev) * r, y: curr.y + (toPrev.y / lenPrev) * r };
    const b = { x: curr.x + (toNext.x / lenNext) * r, y: curr.y + (toNext.y / lenNext) * r };
    d.push(i === 0 ? `M ${a.x} ${a.y}` : `L ${a.x} ${a.y}`);
    d.push(`Q ${curr.x} ${curr.y} ${b.x} ${b.y}`);
  }
  d.push("Z");
  return d.join(" ");
}

const ROUNDED_STAR_PATH = roundedPolygonPath(starVertices(12, 12.5, 9, 4.6, 5), 3.4);

// Every icon is a 24x24 viewBox, so one wrapper covers all of them.
function svg(size, body, extra = "") {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ${extra}>${body}</svg>`;
}

// Masked icons need a DOM-unique id (the React originals used useId) —
// a module-level counter is the plain-JS equivalent.
let maskSeq = 0;
const nextMaskId = () => `tutoria-icon-mask-${maskSeq++}`;

// --- the pool ---

export function RoundedStarIcon({ size = 24, color = "white" } = {}) {
  return svg(size, `<path d="${ROUNDED_STAR_PATH}" fill="${color}" />`);
}

export function MCQIcon({ size = 26, color = "white" } = {}) {
  const cells = [
    { x: 2, y: 2, label: "A" },
    { x: 17, y: 2, label: "B" },
    { x: 2, y: 17, label: "C" },
    { x: 17, y: 17, label: "D" },
  ];
  const body = cells
    .map(
      ({ x, y, label }) => `
      <rect x="${x}" y="${y}" width="13" height="13" rx="3" fill="${color}" fill-opacity="0.92" />
      <text x="${x + 6.5}" y="${y + 9.5}" font-size="8" font-weight="700" text-anchor="middle" fill="#16160F">${label}</text>`,
    )
    .join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none">${body}</svg>`;
}

export function LightbulbIcon({ size = 26, color = "white" } = {}) {
  return svg(
    size,
    `<path d="M12 2.5a6.2 6.2 0 0 0-3.6 11.2c.5.35.8.95.8 1.6v.7h5.6v-.7c0-.65.3-1.25.8-1.6A6.2 6.2 0 0 0 12 2.5Z" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" fill="none" />
     <path d="M9.6 16.8h4.8" stroke="${color}" stroke-width="1.6" stroke-linecap="round" />
     <path d="M10 18.6h4" stroke="${color}" stroke-width="1.6" stroke-linecap="round" />
     <path d="M10.6 20.3h2.8" stroke="${color}" stroke-width="1.6" stroke-linecap="round" />
     <path d="M9.7 14.2v-2.1L10.6 8.6L12 10.6L13.4 8.6L14.3 12.1v2.1" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" />`,
  );
}

export function PaidIcon({ size = 20, color = "white" } = {}) {
  const maskId = nextMaskId();
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24">
    <mask id="${maskId}" maskUnits="userSpaceOnUse">
      <rect x="0" y="0" width="24" height="24" fill="white" />
      <text x="12" y="17.5" font-size="15" font-weight="800" text-anchor="middle" font-family="system-ui, sans-serif" fill="black">$</text>
    </mask>
    <circle cx="12" cy="12" r="11" fill="${color}" mask="url(#${maskId})" />
  </svg>`;
}

export function CheckIcon({ size = 26, color = "white" } = {}) {
  return svg(
    size,
    `<path d="M5 12.5l4.5 4.5L19 7.5" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />`,
  );
}

export function MenuIcon({ size = 22, color = "currentColor" } = {}) {
  return svg(
    size,
    `<line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />`,
    `stroke="${color}" stroke-width="2" stroke-linecap="round"`,
  );
}

export function ChevronDownIcon({ size = 18, color = "currentColor" } = {}) {
  return svg(
    size,
    `<path d="M5.5 9l6.5 6.5L18.5 9" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />`,
  );
}

export function SidebarToggleIcon({ size = 18, color = "currentColor" } = {}) {
  return svg(
    size,
    `<rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="${color}" stroke-width="1.5" fill="none" />
     <path d="M9.5 4.5v15" stroke="${color}" stroke-width="1.5" />`,
  );
}

// Magnifying glass with a tapered handle + glass highlight (export name
// kept from the source pool).
export function MyceliumIcon({ size = 18, color = "currentColor" } = {}) {
  return svg(
    size,
    `<circle cx="10.5" cy="10.5" r="6.75" stroke="${color}" stroke-width="2.4" />
     <path d="M7.6 7.1a5.4 5.4 0 0 0-1 5.6" stroke="${color}" stroke-width="1.3" stroke-linecap="round" opacity="0.55" />
     <path d="M15.3 15.3L20.2 20.2" stroke="${color}" stroke-width="3.6" stroke-linecap="round" />
     <path d="M15.3 15.3L20.2 20.2" stroke="${color}" stroke-width="2.2" stroke-linecap="round" opacity="0.35" />`,
  );
}

export function CloseIcon({ size = 22, color = "currentColor" } = {}) {
  return svg(
    size,
    `<line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" />`,
    `stroke="${color}" stroke-width="2" stroke-linecap="round"`,
  );
}

export function CardStarIcon({ size = 32, color = CARD_GOLD } = {}) {
  const width = Math.round((size * 2) / 3);
  return `<svg width="${width}" height="${size}" viewBox="0 0 16 24" fill="none">
    <rect x="0.5" y="0.5" width="15" height="23" rx="3.5" fill="${color}" />
    <svg x="1.5" y="5.5" width="13" height="13" viewBox="0 0 24 24"><path d="${ROUNDED_STAR_PATH}" fill="white" /></svg>
  </svg>`;
}

export function HomeIcon({ size = 18, color = "currentColor" } = {}) {
  return svg(
    size,
    `<path d="M4.5 11.5 12 5.2l7.5 6.3" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none" />
     <path d="M6.5 10v9h11v-9" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none" />
     <path d="M10 19v-5.5h4V19" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />`,
  );
}

export function FolderIcon({ size = 18, color = "currentColor" } = {}) {
  return svg(
    size,
    `<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.3l1.7 2h9A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-11Z" fill="${color}" fill-opacity="0.85" />`,
  );
}

export function BookIcon({ size = 18, color = "currentColor", filled = true } = {}) {
  if (filled) {
    const maskId = nextMaskId();
    const bookPath =
      "M4.5 5.5V18c3.6 0 6.2.7 7.5 2 1.3-1.3 3.9-2 7.5-2V5.5c-3.6 0-6.2.6-7.5 1.9-1.3-1.3-3.9-1.9-7.5-1.9Z";
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24">
      <mask id="${maskId}" maskUnits="userSpaceOnUse">
        <path d="${bookPath}" fill="white" />
        <path d="M12 7.4V20" stroke="black" stroke-width="1" />
        <path d="M6.3 9.6h3.6M6.3 12.2h3.6M6.3 14.8h3.1" stroke="black" stroke-width="1" stroke-linecap="round" />
        <path d="M17.7 9.6h-3.6M17.7 12.2h-3.6M17.7 14.8h-3.1" stroke="black" stroke-width="1" stroke-linecap="round" />
      </mask>
      <path d="${bookPath}" fill="${color}" fill-opacity="0.85" mask="url(#${maskId})" />
    </svg>`;
  }
  return svg(
    size,
    `<path d="M11.3 7.6C9.2 6.1 6.7 5.3 4.3 5.3v12.9c2.4 0 4.9.8 7 2.3" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
     <path d="M12.7 7.6c2.1-1.5 4.6-2.3 7-2.3v12.9c-2.4 0-4.9.8-7 2.3" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
     <path d="M12 7.3v13.1" stroke="${color}" stroke-width="1.8" stroke-linecap="round" />
     <path d="M6.1 9.5h3.4M6.1 12.3h3.4M6.1 15.1h3" stroke="${color}" stroke-width="1.1" stroke-linecap="round" opacity="0.75" />
     <path d="M17.9 9.5h-3.4M17.9 12.3h-3.4M17.9 15.1h-3" stroke="${color}" stroke-width="1.1" stroke-linecap="round" opacity="0.75" />`,
  );
}

export function NoteIcon({ size = 16, color = "currentColor" } = {}) {
  return svg(
    size,
    `<rect x="5" y="3" width="14" height="18" rx="1.6" stroke="${color}" stroke-width="1.5" fill="none" />
     <path d="M8 8h8M8 12h8M8 16h5" stroke="${color}" stroke-width="1.3" stroke-linecap="round" opacity="0.75" />`,
  );
}

export function CanvasNoteIcon({ size = 16, color = "currentColor" } = {}) {
  return svg(
    size,
    `<rect x="5" y="3" width="14" height="18" rx="1.6" stroke="${color}" stroke-width="1.5" fill="none" />
     <path d="M8.5 15.5l1-3.3 5-5 2.3 2.3-5 5-3.3 1Z" stroke="${color}" stroke-width="1.3" stroke-linejoin="round" fill="none" />`,
  );
}

export function PenIcon({ size = 18, color = "currentColor" } = {}) {
  return svg(
    size,
    `<path d="M4 20l1.1-4.4 10.9-10.9a2 2 0 0 1 2.8 0l.5.5a2 2 0 0 1 0 2.8L8.4 18.9 4 20Z" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" fill="none" />
     <path d="M14.3 6.3l3.4 3.4" stroke="${color}" stroke-width="1.5" stroke-linecap="round" />`,
  );
}

// Bullseye + arrow. In this app it marks "locate this on the real screen"
// (the live locate_element call), which is the closest thing to the
// source pool's "assess yourself" sense — a target to hit.
export function TargetIcon({ size = 18, color = "currentColor" } = {}) {
  return svg(
    size,
    `<circle cx="11" cy="13" r="8" stroke="${color}" stroke-width="1.5" />
     <circle cx="11" cy="13" r="5.1" stroke="${color}" stroke-width="1.5" />
     <circle cx="11" cy="13" r="1.8" fill="${color}" />
     <line x1="21" y1="4" x2="11.8" y2="12.3" stroke="${color}" stroke-width="1.6" stroke-linecap="round" />
     <path d="M17.88 6.81L21.16 7.13L23.66 4.97L20.38 4.65Z" fill="${color}" />
     <path d="M17.88 6.81L20.29 4.56L20.31 1.26L17.91 3.52Z" fill="${color}" />`,
  );
}

// "Show me on the real screen" — the substep overlay toggle (sidebar.js).
export function EyeIcon({ size = 16, color = "currentColor" } = {}) {
  return svg(
    size,
    `<path d="M2 12c2.2-4.2 6-6.5 10-6.5s7.8 2.3 10 6.5c-2.2 4.2-6 6.5-10 6.5S4.2 16.2 2 12Z" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" fill="none" />
     <circle cx="12" cy="12" r="3" stroke="${color}" stroke-width="1.5" fill="none" />`,
  );
}

// Eye with a slash — the "hide it again" counterpart to EyeIcon. Not in
// the source pool (it only ever needed the open eye); drawn here in the
// same 1.5-weight stroke language so the pair reads as one toggle.
export function EyeOffIcon({ size = 16, color = "currentColor" } = {}) {
  return svg(
    size,
    `<path d="M2 12c2.2-4.2 6-6.5 10-6.5s7.8 2.3 10 6.5c-2.2 4.2-6 6.5-10 6.5S4.2 16.2 2 12Z" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" fill="none" opacity="0.55" />
     <circle cx="12" cy="12" r="3" stroke="${color}" stroke-width="1.5" fill="none" opacity="0.55" />
     <path d="M4 20L20 4" stroke="${color}" stroke-width="1.8" stroke-linecap="round" />`,
  );
}

export function EraserIcon({ size = 18, color = "currentColor" } = {}) {
  return svg(
    size,
    `<g transform="rotate(-30 12 12)">
       <path d="M5 8.5A2 2 0 0 1 7 6.5h10A2 2 0 0 1 19 8.5v7A2 2 0 0 1 17 17.5H7A2 2 0 0 1 5 15.5v-7Z" stroke="${color}" stroke-width="1.5" fill="none" />
       <path d="M5 8.5A2 2 0 0 1 7 6.5h5v11H7A2 2 0 0 1 5 15.5v-7Z" fill="${color}" />
       <path d="M12 6.5v11" stroke="${color}" stroke-width="1.5" />
     </g>`,
  );
}

export function BoxToolIcon({ size = 18, color = "currentColor" } = {}) {
  return svg(
    size,
    `<rect x="4" y="5" width="16" height="14" rx="1.5" stroke="${color}" stroke-width="1.5" stroke-dasharray="3 2.5" fill="none" />`,
  );
}

export function CursorIcon({ size = 18, color = "currentColor" } = {}) {
  return svg(
    size,
    `<path d="M6 3.5l12 10.2-5.4.7 2.9 5.9-2.3 1.1-2.9-5.9-3.8 3.9-.5-15.9Z" fill="${color}" stroke="${color}" stroke-width="0.4" stroke-linejoin="round" />`,
  );
}

export function BucketIcon({ size = 18, color = "currentColor" } = {}) {
  return svg(
    size,
    `<g transform="rotate(-35 11 10)">
       <path d="M5 6.5a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 17 6.5V15a5 5 0 0 1-10 0V6.5Z" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" fill="none" />
       <path d="M5 10h12" stroke="${color}" stroke-width="1.3" stroke-linecap="round" opacity="0.7" />
     </g>
     <path d="M18.5 16.5c0 1.4 1.6 2.1 1.6 3.4a1.6 1.6 0 0 1-3.2 0c0-1.3 1.6-2 1.6-3.4Z" fill="${color}" />`,
  );
}

export function TriangleIcon({ size = 18, color = "currentColor" } = {}) {
  return svg(
    size,
    `<path d="M12 4L20.5 19H3.5L12 4Z" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" fill="none" />`,
  );
}

export function SettingsIcon({ size = 18, color = "currentColor" } = {}) {
  return svg(
    size,
    `<circle cx="12" cy="12" r="3" />
     <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />`,
    `stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`,
  );
}

export function LayersIcon({ size = 18, color = "currentColor" } = {}) {
  return svg(
    size,
    `<path d="M12 3L21 8L12 13L3 8L12 3Z" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" fill="none" />
     <path d="M3 12L12 17L21 12" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
     <path d="M3 16L12 21L21 16" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />`,
  );
}

export function ImageIcon({ size = 18, color = "currentColor" } = {}) {
  return svg(
    size,
    `<rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="${color}" stroke-width="1.5" fill="none" />
     <circle cx="8.5" cy="9.5" r="1.6" stroke="${color}" stroke-width="1.5" fill="none" />
     <path d="M4 16.5L9 12L13 15.5L16.5 12.5L20 15.5" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />`,
  );
}

export function MapIcon({ size = 18, color = "currentColor" } = {}) {
  return svg(
    size,
    `<path d="M9 4L4 6v14l5-2 6 2 5-2V4l-5 2-6-2Z" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" fill="none" />
     <path d="M9 4v14M15 6v14" stroke="${color}" stroke-width="1.5" />`,
  );
}

export function LockIcon({ size = 20, color = "white" } = {}) {
  return svg(
    size,
    `<rect x="5" y="11" width="14" height="10" rx="2" fill="${color}" fill-opacity="0.85" />
     <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="${color}" stroke-width="1.8" stroke-linecap="round" fill="none" />
     <circle cx="12" cy="15.5" r="1.6" fill="#16160F" />`,
  );
}

export function FlagIcon({ size = 18, color = "currentColor" } = {}) {
  return svg(
    size,
    `<path d="M12 2v20" stroke="${color}" stroke-width="1.8" stroke-linecap="round" />
     <path d="M12.8 3.5L23.2 7.5L12.8 11.5Z" fill="${color}" />`,
  );
}

export function DollarRingIcon({ size = 16, color = "white" } = {}) {
  return svg(
    size,
    `<circle cx="12" cy="12" r="9.5" stroke="${color}" stroke-width="1.6" fill="none" />
     <text x="12" y="16.5" font-size="13" font-weight="700" text-anchor="middle" font-family="system-ui, sans-serif" fill="${color}">$</text>`,
  );
}

export function NodeTreeIcon({ size = 18, color = "currentColor" } = {}) {
  return svg(
    size,
    `<path d="M12 17.7v-3.7M12 14L2 6M12 14v-8M12 14l10 -8" stroke="${color}" stroke-width="1.5" stroke-linecap="round" />
     <circle cx="12" cy="20" r="2.3" fill="${color}" />
     <circle cx="2" cy="6" r="2" fill="${color}" />
     <circle cx="12" cy="6" r="2" fill="${color}" />
     <circle cx="22" cy="6" r="2" fill="${color}" />`,
  );
}

export function HandIcon({ size = 16, color = "white" } = {}) {
  return svg(
    size,
    `<circle cx="12" cy="12" r="9.5" stroke="${color}" stroke-width="1.6" fill="none" />
     <path d="M9 15.5V8.2a1 1 0 0 1 2 0v3.3M11 11.3V7.3a1 1 0 0 1 2 0v4M13 11.3V8a1 1 0 0 1 2 0v3.6M15 11.6v-1.9a1 1 0 0 1 2 0v4.8c0 2.3-1.6 4-3.8 4h-1c-1.3 0-2-.4-2.8-1.3L7 14.8c-.5-.6-.4-1.3.2-1.7.5-.4 1.2-.3 1.7.2l1.1 1.2" stroke="${color}" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" fill="none" />`,
  );
}

export function SearchIcon({ size = 18, color = "currentColor" } = {}) {
  return svg(
    size,
    `<circle cx="11" cy="11" r="7" stroke="${color}" stroke-width="2" />
     <path d="M21 21l-4.35-4.35" stroke="${color}" stroke-width="2" stroke-linecap="round" />`,
  );
}

export function DownloadIcon({ size = 16, color = "currentColor" } = {}) {
  return svg(
    size,
    `<path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
     <path d="M4 16.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />`,
  );
}

export function TrashIcon({ size = 16, color = "currentColor" } = {}) {
  return svg(
    size,
    `<path d="M4 7h16" stroke="${color}" stroke-width="1.8" stroke-linecap="round" />
     <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
     <path d="M6.5 7l.8 12.1a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9L17.5 7" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
     <path d="M10 10.5v6M14 10.5v6" stroke="${color}" stroke-width="1.8" stroke-linecap="round" />`,
  );
}

export function OpenBookIcon({ size = 16, color = "currentColor" } = {}) {
  return svg(
    size,
    `<path d="M12 6.5c-1.6-1.3-3.7-2-6-2-.6 0-1 .4-1 1v11.5c0 .6.4 1 1 1 2.3 0 4.4.7 6 2 1.6-1.3 3.7-2 6-2 .6 0 1-.4 1-1V5.5c0-.6-.4-1-1-1-2.3 0-4.4.7-6 2z" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" fill="none" />
     <path d="M12 6.5V19" stroke="${color}" stroke-width="1.6" stroke-linecap="round" />`,
  );
}

export function MicIcon({ size = 18, color = "currentColor" } = {}) {
  return svg(
    size,
    `<rect x="9" y="2.5" width="6" height="11" rx="3" stroke="${color}" stroke-width="1.5" fill="none" />
     <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" stroke="${color}" stroke-width="1.5" stroke-linecap="round" fill="none" />
     <path d="M12 18v3.5M8.5 21.5h7" stroke="${color}" stroke-width="1.5" stroke-linecap="round" />`,
  );
}

export function FilterIcon({ size = 18, color = "currentColor" } = {}) {
  return svg(
    size,
    `<path d="M4 6h16M4 12h16M4 18h16" stroke="${color}" stroke-width="1.8" stroke-linecap="round" />
     <circle cx="8" cy="6" r="2" fill="${color}" />
     <circle cx="16" cy="12" r="2" fill="${color}" />
     <circle cx="10" cy="18" r="2" fill="${color}" />`,
  );
}

// Name -> builder, so icons.html can enumerate the pool without hardcoding
// a second list that drifts out of sync with the exports above.
export const ICONS = {
  RoundedStarIcon,
  MCQIcon,
  LightbulbIcon,
  PaidIcon,
  CheckIcon,
  HomeIcon,
  MenuIcon,
  ChevronDownIcon,
  SidebarToggleIcon,
  MyceliumIcon,
  CloseIcon,
  CardStarIcon,
  FolderIcon,
  BookIcon,
  NoteIcon,
  CanvasNoteIcon,
  PenIcon,
  TargetIcon,
  EyeIcon,
  EyeOffIcon,
  EraserIcon,
  BoxToolIcon,
  CursorIcon,
  BucketIcon,
  TriangleIcon,
  SettingsIcon,
  LayersIcon,
  ImageIcon,
  MapIcon,
  LockIcon,
  FlagIcon,
  DollarRingIcon,
  NodeTreeIcon,
  HandIcon,
  SearchIcon,
  DownloadIcon,
  TrashIcon,
  OpenBookIcon,
  FilterIcon,
  MicIcon,
};
