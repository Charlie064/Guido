// Generates the app icon (SVG source + PNG raster exports) from the same
// glass-mascot artwork used in GlassMascot.jsx / generate-svgs.mjs, so the
// icon never drifts from the in-app character.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp"; // npm install sharp

const INK = "#2a2233";
const SIZE = 512;
const CORNER = Math.round(SIZE * 0.222); // ~114px at 512 — standard app-icon squircle-ish radius

// Happy face, centered and scaled up from the 200x230 mascot artwork.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#eef1fc"/>
      <stop offset="100%" stop-color="#fbeef4"/>
    </linearGradient>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#bfe0fb"/>
      <stop offset="55%" stop-color="#d7c8f0"/>
      <stop offset="100%" stop-color="#f6c7dd"/>
    </linearGradient>
    <radialGradient id="shine" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="7"/>
    </filter>
    <filter id="shadowblur" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
    <clipPath id="squircle">
      <rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="${CORNER}" ry="${CORNER}"/>
    </clipPath>
  </defs>

  <g clip-path="url(#squircle)">
    <rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>

    <g transform="translate(-2.825,-29.6) scale(2.55)">
      <ellipse cx="100" cy="205" rx="52" ry="10" fill="#5b4b63" opacity="0.16" filter="url(#shadowblur)"/>
      <ellipse cx="76" cy="182" rx="15" ry="11" fill="url(#body)" fill-opacity="0.9"/>
      <ellipse cx="124" cy="182" rx="15" ry="11" fill="url(#body)" fill-opacity="0.9"/>
      <g fill="url(#body)" fill-opacity="0.9">
        <ellipse cx="100" cy="132" rx="76" ry="64"/>
        <circle cx="54" cy="82" r="36"/>
        <circle cx="86" cy="62" r="33"/>
        <circle cx="122" cy="63" r="35"/>
        <circle cx="152" cy="86" r="33"/>
      </g>
      <ellipse cx="80" cy="58" rx="46" ry="16" fill="url(#shine)" opacity="0.55" transform="rotate(-18 80 58)"/>
      <ellipse cx="66" cy="82" rx="20" ry="12" fill="#ffffff" opacity="0.5" filter="url(#blur)" transform="rotate(-24 66 82)"/>
      <ellipse cx="60" cy="72" rx="7" ry="4.2" fill="#ffffff" opacity="0.8" transform="rotate(-24 60 72)"/>

      <path d="M66,120 C71,112 85,112 90,120" stroke="${INK}" stroke-width="6" stroke-linecap="round" fill="none"/>
      <path d="M111,118 C116,110 130,110 135,118" stroke="${INK}" stroke-width="6" stroke-linecap="round" fill="none"/>
      <path d="M85,140 C93,150 107,150 115,138" stroke="${INK}" stroke-width="4.5" stroke-linecap="round" fill="none"/>
      <ellipse cx="62" cy="138" rx="8" ry="5" fill="#ff9fb0" opacity="0.55"/>
      <ellipse cx="140" cy="136" rx="8" ry="5" fill="#ff9fb0" opacity="0.55"/>
    </g>
  </g>
</svg>
`;

const outDir = new URL(".", import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL("./app-icon.svg", outDir), svg, "utf8");
console.log("wrote app-icon.svg");

const sizes = [16, 32, 64, 128, 180, 256, 512, 1024];
for (const size of sizes) {
  const outPath = new URL(`./app-icon-${size}.png`, outDir);
  await sharp(Buffer.from(svg.replace(`width="${SIZE}" height="${SIZE}"`, `width="${size}" height="${size}"`)))
    .resize(size, size)
    .png()
    .toFile(fileURLToPath(outPath));
  console.log("wrote app-icon-" + size + ".png");
}
