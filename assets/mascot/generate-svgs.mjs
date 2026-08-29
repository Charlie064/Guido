// Generates the 5 standalone mascot SVG files from one shared source of truth,
// so the static .svg assets and GlassMascot.jsx never drift apart.
import { writeFileSync, mkdirSync } from "node:fs";

const INK = "#2a2233";

const FACES = {
  idle: `
    <circle cx="78" cy="122" r="15" fill="#ffffff" opacity="0.95"/>
    <circle cx="123" cy="120" r="15" fill="#ffffff" opacity="0.95"/>
    <circle cx="80" cy="123" r="10.5" fill="${INK}"/>
    <circle cx="125" cy="121" r="10.5" fill="${INK}"/>
    <circle cx="76.5" cy="119" r="3" fill="#ffffff"/>
    <circle cx="121.5" cy="117" r="3" fill="#ffffff"/>`,
  happy: `
    <path d="M66,120 C71,112 85,112 90,120" stroke="${INK}" stroke-width="6" stroke-linecap="round" fill="none"/>
    <path d="M111,118 C116,110 130,110 135,118" stroke="${INK}" stroke-width="6" stroke-linecap="round" fill="none"/>
    <path d="M85,140 C93,150 107,150 115,138" stroke="${INK}" stroke-width="4.5" stroke-linecap="round" fill="none"/>
    <ellipse cx="62" cy="138" rx="8" ry="5" fill="#ff9fb0" opacity="0.55"/>
    <ellipse cx="140" cy="136" rx="8" ry="5" fill="#ff9fb0" opacity="0.55"/>`,
  thinking: `
    <circle cx="78" cy="122" r="15" fill="#ffffff" opacity="0.95"/>
    <circle cx="123" cy="120" r="15" fill="#ffffff" opacity="0.95"/>
    <circle cx="83" cy="117" r="9" fill="${INK}"/>
    <circle cx="128" cy="115" r="9" fill="${INK}"/>
    <circle cx="80.5" cy="113" r="2.6" fill="#ffffff"/>
    <circle cx="125.5" cy="111" r="2.6" fill="#ffffff"/>
    <path d="M108,143 C112,141 116,141 119,143" stroke="${INK}" stroke-width="4" stroke-linecap="round" fill="none"/>
    <circle cx="150" cy="46" r="4" fill="${INK}" opacity="0.3"/>
    <circle cx="162" cy="36" r="5.4" fill="${INK}" opacity="0.55"/>
    <circle cx="177" cy="30" r="7" fill="${INK}" opacity="0.85"/>`,
  success: `
    <path d="M66,118 C71,110 85,110 90,118" stroke="${INK}" stroke-width="6" stroke-linecap="round" fill="none"/>
    <path d="M111,116 C116,108 130,108 135,116" stroke="${INK}" stroke-width="6" stroke-linecap="round" fill="none"/>
    <path d="M82,138 C92,152 110,152 120,136" stroke="${INK}" stroke-width="5" stroke-linecap="round" fill="none"/>
    <ellipse cx="60" cy="136" rx="8" ry="5" fill="#ff9fb0" opacity="0.55"/>
    <ellipse cx="142" cy="134" rx="8" ry="5" fill="#ff9fb0" opacity="0.55"/>
    <circle cx="168" cy="34" r="16" fill="#ffffff" stroke="${INK}" stroke-width="2.4"/>
    <path d="M160,34 L166,40 L177,26" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  error: `
    <circle cx="78" cy="122" r="15" fill="#ffffff" opacity="0.95"/>
    <circle cx="123" cy="120" r="13" fill="#ffffff" opacity="0.95"/>
    <circle cx="80" cy="123" r="10.5" fill="${INK}"/>
    <circle cx="127" cy="120" r="6.5" fill="${INK}"/>
    <circle cx="76.5" cy="119" r="3" fill="#ffffff"/>
    <path d="M64,110 Q70,105 76,110" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" fill="none"/>
    <path d="M92,145 Q98,141 104,145 Q110,149 116,145" stroke="${INK}" stroke-width="4" stroke-linecap="round" fill="none"/>
    <text x="145" y="44" font-family="Georgia, serif" font-size="26" font-weight="700" fill="${INK}" opacity="0.8">?</text>`,
};

function svgFor(state) {
  const id = state;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 230" width="200" height="230" role="img" aria-label="Tuto the mascot, ${state}">
  <defs>
    <linearGradient id="body-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#bfe0fb"/>
      <stop offset="55%" stop-color="#d7c8f0"/>
      <stop offset="100%" stop-color="#f6c7dd"/>
    </linearGradient>
    <radialGradient id="shine-${id}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur-${id}" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="7"/>
    </filter>
    <filter id="shadowblur-${id}" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
  </defs>

  <ellipse cx="100" cy="205" rx="52" ry="10" fill="#5b4b63" opacity="0.16" filter="url(#shadowblur-${id})"/>

  <ellipse cx="76" cy="182" rx="15" ry="11" fill="url(#body-${id})" fill-opacity="0.9"/>
  <ellipse cx="124" cy="182" rx="15" ry="11" fill="url(#body-${id})" fill-opacity="0.9"/>

  <g fill="url(#body-${id})" fill-opacity="0.9">
    <ellipse cx="100" cy="132" rx="76" ry="64"/>
    <circle cx="54" cy="82" r="36"/>
    <circle cx="86" cy="62" r="33"/>
    <circle cx="122" cy="63" r="35"/>
    <circle cx="152" cy="86" r="33"/>
  </g>

  <ellipse cx="80" cy="58" rx="46" ry="16" fill="url(#shine-${id})" opacity="0.55" transform="rotate(-18 80 58)"/>
  <ellipse cx="66" cy="82" rx="20" ry="12" fill="#ffffff" opacity="0.5" filter="url(#blur-${id})" transform="rotate(-24 66 82)"/>
  <ellipse cx="60" cy="72" rx="7" ry="4.2" fill="#ffffff" opacity="0.8" transform="rotate(-24 60 72)"/>
${FACES[state]}
</svg>
`;
}

mkdirSync(new URL(".", import.meta.url), { recursive: true });
for (const state of Object.keys(FACES)) {
  const out = new URL(`./mascot-${state}.svg`, import.meta.url);
  writeFileSync(out, svgFor(state), "utf8");
  console.log("wrote", out.pathname);
}
