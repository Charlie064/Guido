import { useId } from "react";

/**
 * GlassMascot — Guido's mascot ("Tuto"), a translucent glass/jelly creature.
 *
 * Usage:
 *   <GlassMascot state="idle" />
 *   <GlassMascot state="thinking" size={48} />
 *   <GlassMascot state="success" pose="stretch" />
 *
 * - Pure inline SVG, no external assets, no dependencies beyond React.
 * - Transparent background — drop it on any surface.
 * - Gradient/filter ids are namespaced per-instance via useId(), so you can
 *   render many at once on the same page without id collisions.
 * - Scales cleanly from favicon size (~16px) up to a large hero (500px+).
 *
 * States: "idle" | "happy" | "thinking" | "success" | "error"
 * Poses (optional, layered on top of any state): "normal" | "squish" | "stretch" | "tilt"
 * Look (optional, idle pupils only): "center" | "left" | "right"
 */

const INK = "#2a2233";

const BODY_GRADIENT_STOPS = [
  { offset: "0%", color: "#bfe0fb" },
  { offset: "55%", color: "#d7c8f0" },
  { offset: "100%", color: "#f6c7dd" },
];

const VIEWBOX_W = 200;
const VIEWBOX_H = 230;

function poseTransformFor(pose) {
  switch (pose) {
    case "squish":
      return "translate(100,215) scale(1.22,0.76) translate(-100,-215)";
    case "stretch":
      return "translate(100,215) scale(0.86,1.16) translate(-100,-215)";
    case "tilt":
      return "rotate(-10 100 130)";
    default:
      return "translate(0,0)";
  }
}

function pupilShift(look) {
  if (look === "left") return -6;
  if (look === "right") return 6;
  return 0;
}

function Face({ state, look = "center" }) {
  const dx = pupilShift(look);
  switch (state) {
    case "happy":
      return (
        <>
          <path d="M66,120 C71,112 85,112 90,120" stroke={INK} strokeWidth="6" strokeLinecap="round" fill="none" />
          <path d="M111,118 C116,110 130,110 135,118" stroke={INK} strokeWidth="6" strokeLinecap="round" fill="none" />
          <path d="M85,140 C93,150 107,150 115,138" stroke={INK} strokeWidth="4.5" strokeLinecap="round" fill="none" />
          <ellipse cx="62" cy="138" rx="8" ry="5" fill="#ff9fb0" opacity="0.55" />
          <ellipse cx="140" cy="136" rx="8" ry="5" fill="#ff9fb0" opacity="0.55" />
        </>
      );
    case "thinking":
      return (
        <>
          <circle cx="78" cy="122" r="15" fill="#ffffff" opacity="0.95" />
          <circle cx="123" cy="120" r="15" fill="#ffffff" opacity="0.95" />
          <circle cx="83" cy="117" r="9" fill={INK} />
          <circle cx="128" cy="115" r="9" fill={INK} />
          <circle cx="80.5" cy="113" r="2.6" fill="#ffffff" />
          <circle cx="125.5" cy="111" r="2.6" fill="#ffffff" />
          <path d="M108,143 C112,141 116,141 119,143" stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none" />
          {/* loading dots — animate these (e.g. staggered fade/scale) for a live "thinking" state */}
          <circle cx="150" cy="46" r="4" fill={INK} opacity="0.3" />
          <circle cx="162" cy="36" r="5.4" fill={INK} opacity="0.55" />
          <circle cx="177" cy="30" r="7" fill={INK} opacity="0.85" />
        </>
      );
    case "success":
      return (
        <>
          <path d="M66,118 C71,110 85,110 90,118" stroke={INK} strokeWidth="6" strokeLinecap="round" fill="none" />
          <path d="M111,116 C116,108 130,108 135,116" stroke={INK} strokeWidth="6" strokeLinecap="round" fill="none" />
          <path d="M82,138 C92,152 110,152 120,136" stroke={INK} strokeWidth="5" strokeLinecap="round" fill="none" />
          <ellipse cx="60" cy="136" rx="8" ry="5" fill="#ff9fb0" opacity="0.55" />
          <ellipse cx="142" cy="134" rx="8" ry="5" fill="#ff9fb0" opacity="0.55" />
          <circle cx="168" cy="34" r="16" fill="#ffffff" stroke={INK} strokeWidth="2.4" />
          <path d="M160,34 L166,40 L177,26" stroke={INK} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      );
    case "error":
      return (
        <>
          <circle cx="78" cy="122" r="15" fill="#ffffff" opacity="0.95" />
          <circle cx="123" cy="120" r="13" fill="#ffffff" opacity="0.95" />
          <circle cx="80" cy="123" r="10.5" fill={INK} />
          <circle cx="127" cy="120" r="6.5" fill={INK} />
          <circle cx="76.5" cy="119" r="3" fill="#ffffff" />
          <path d="M64,110 Q70,105 76,110" stroke={INK} strokeWidth="3.2" strokeLinecap="round" fill="none" />
          <path d="M92,145 Q98,141 104,145 Q110,149 116,145" stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none" />
          <text x="145" y="44" fontFamily="Georgia, serif" fontSize="26" fontWeight="700" fill={INK} opacity="0.8">?</text>
        </>
      );
    case "idle":
    default:
      return (
        <>
          <circle cx="78" cy="122" r="15" fill="#ffffff" opacity="0.95" />
          <circle cx="123" cy="120" r="15" fill="#ffffff" opacity="0.95" />
          <circle cx={80 + dx} cy="123" r="10.5" fill={INK} />
          <circle cx={125 + dx} cy="121" r="10.5" fill={INK} />
          <circle cx={76.5 + dx} cy="119" r="3" fill="#ffffff" />
          <circle cx={121.5 + dx} cy="117" r="3" fill="#ffffff" />
        </>
      );
  }
}

export default function GlassMascot({ state = "idle", pose = "normal", look = "center", size = 96, className, style }) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9]/g, "");
  const height = Math.round((size * VIEWBOX_H) / VIEWBOX_W);
  const transform = poseTransformFor(pose);

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      width={size}
      height={height}
      className={className}
      style={style}
      role="img"
      aria-label={`Tuto the mascot, ${state}`}
    >
      <defs>
        <linearGradient id={`body-${uid}`} x1="0" y1="0" x2="0" y2="1">
          {BODY_GRADIENT_STOPS.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
        <radialGradient id={`shine-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id={`blur-${uid}`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <filter id={`shadowblur-${uid}`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      <g transform={transform}>
        <ellipse cx="100" cy="205" rx="52" ry="10" fill="#5b4b63" opacity="0.16" filter={`url(#shadowblur-${uid})`} />

        <ellipse cx="76" cy="182" rx="15" ry="11" fill={`url(#body-${uid})`} fillOpacity="0.9" />
        <ellipse cx="124" cy="182" rx="15" ry="11" fill={`url(#body-${uid})`} fillOpacity="0.9" />

        <g fill={`url(#body-${uid})`} fillOpacity="0.9">
          <ellipse cx="100" cy="132" rx="76" ry="64" />
          <circle cx="54" cy="82" r="36" />
          <circle cx="86" cy="62" r="33" />
          <circle cx="122" cy="63" r="35" />
          <circle cx="152" cy="86" r="33" />
        </g>

        <ellipse cx="80" cy="58" rx="46" ry="16" fill={`url(#shine-${uid})`} opacity="0.55" transform="rotate(-18 80 58)" />
        <ellipse cx="66" cy="82" rx="20" ry="12" fill="#ffffff" opacity="0.5" filter={`url(#blur-${uid})`} transform="rotate(-24 66 82)" />
        <ellipse cx="60" cy="72" rx="7" ry="4.2" fill="#ffffff" opacity="0.8" transform="rotate(-24 60 72)" />

        <Face state={state} look={look} />
      </g>
    </svg>
  );
}
