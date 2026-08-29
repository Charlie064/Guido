# Tuto — Mascot Implementation Kit

Canonical home in this repo: `assets/mascot/`. Behavior contract:
[`docs/features/mascot.md`](../../docs/features/mascot.md). After
editing `generate-svgs.mjs` or `generate-icon.mjs`, regenerate then run
`./sync-static.sh` so the website and desktop copies stay in sync.

This is the approved "glass creature" mascot for Guido, ready to drop into the app. It's a small translucent, jelly-like blob with a simple two-eye face, built as vector SVG — a stylized *approximation* of a glass/glossy material (gradient fill + a soft blurred highlight + a soft ground shadow), not a literal 3D or photoreal render like the moodboard photos. That's what keeps it lightweight, crisp at any size, and easy to animate in CSS/React instead of shipping a 3D asset pipeline.

## What's in this folder

- `GlassMascot.jsx` — the base component: renders Guido's body + one of 5 named face states. Everything else below is built on top of this one.
- `GlassMascotCursor.jsx` — mount once near the app root and Guido floats, trailing the mouse, dancing on click (or on a `danceSignal` prop change from your own code).
- `GuidoSplash.jsx` — the app-open moment: Guido dances center-stage under the wordmark, then hands off to the real app UI.
- `generate-svgs.mjs` — the script that generated the 5 static SVGs below. Source of truth if the design ever needs to change (edit here, then `node generate-svgs.mjs` to regenerate).
- `mascot-idle.svg`, `mascot-happy.svg`, `mascot-thinking.svg`, `mascot-success.svg`, `mascot-error.svg` — standalone static exports of the 5 states, for anywhere a plain image is easier than a component (favicon, marketing site, email, Figma).
- `generate-icon.mjs` + `app-icon.svg` / `app-icon-*.png` — the app icon (Guido, happy, on a rounded gradient square), same source artwork, rasterized at the common sizes (16 up to 1024, plus 180 for iOS).
- `cursor-follow-demo.html` — the live, standalone prototype these two components were built from (open it directly in a browser). Useful as a feel reference, not meant to ship as-is.

Every file has a transparent background (except the splash and the icon's own square) and no external dependencies (fonts, images, or otherwise) — safe to place on any surface.

## Using the component

```jsx
import GlassMascot from "./GlassMascot";

<GlassMascot state="idle" />
<GlassMascot state="thinking" size={48} />
<GlassMascot state="success" pose="stretch" />
```

Props:

| Prop | Type | Default | Notes |
|---|---|---|---|
| `state` | `"idle" \| "happy" \| "thinking" \| "success" \| "error"` | `"idle"` | Swaps the face. |
| `pose` | `"normal" \| "squish" \| "stretch" \| "tilt"` | `"normal"` | Body transform, layers on top of any state. |
| `look` | `"center" \| "left" \| "right"` | `"center"` | Shifts idle pupils so Guido can glance. |
| `size` | number (px) | `96` | Width; height follows the fixed aspect ratio automatically. |
| `className` | string | — | Passed through to the `<svg>`. |
| `style` | object | — | Passed through to the `<svg>`. |

No CSS file to import, no icon font, no build step beyond normal JSX/React — it's one self-contained component. Each instance namespaces its own gradient/filter IDs internally (via `useId()`), so you can render many at once on one screen without them interfering with each other.

## The floating, cursor-following version

```jsx
import GlassMascotCursor from "./GlassMascotCursor";

// Mount once, e.g. in your app shell / layout component:
<GlassMascotCursor />

// Desktop-only by design — it's mouse-driven, so turn it off on touch:
<GlassMascotCursor disabled={isTouchDevice} />

// Trigger a dance from your own app logic (e.g. a tutorial step just
// completed) by changing this prop's value — any change counts:
<GlassMascotCursor danceSignal={completedStepCount} />
```

It renders `<GlassMascot>` internally for the actual body/face — this component only owns position and motion (trailing the mouse with a light lag, leaning into fast movement, settling into a gentle sway when idle), so the two can never visually drift apart. Click anywhere on the page and it dances in place for about 1.5s before resuming.

## The app-open splash

```jsx
import { useState } from "react";
import GuidoSplash from "./GuidoSplash";

function AppRoot() {
  const [showSplash, setShowSplash] = useState(true);
  return showSplash
    ? <GuidoSplash onComplete={() => setShowSplash(false)} />
    : <App />;
}
```

Guido dances under the "Guido" wordmark for about 1.5s, then calls `onComplete`. It's a pure CSS `@keyframes` animation (same beat as the cursor-follow dance, just hand-timed instead of physics-driven, since a one-shot sequence doesn't need a run loop) and falls back to a quick fade — no dance — when the OS has reduced motion turned on. The background color reads from a `--guido-splash-bg` CSS variable (defaults to `#faf6f3`) if you want it to match your app shell instead of overriding via the `style` prop.

## The 5 states

- **idle** — plain open-eyed face. Default / at-rest state, whenever nothing is happening.
- **happy** — closed happy eyes, small smile, blush. Use after a small positive moment (step completed, correct click).
- **thinking** — eyes looking up/to the side, three loading dots near the top-right. Use while the app is processing or "looking" at the screen. The dots are static in the SVG — animate their opacity/scale (staggered) in CSS for a live loading feel.
- **success** — happy face plus a small checkmark badge near the top-right. Use for "you did it" / task or tutorial completed.
- **error** — one eye half-closed, worried eyebrow, a small "?" mark near the top-right. This is the confused/off-track state — use when the user ends up somewhere unexpected, not for scary technical errors.

These are the 5 states the mascot needs to support in the app today (matches the original idle / happy / thinking-loading / success / error-confused brief). The concept sheet explored a few extra expressions (shocked, celebrating, confused as a distinct beat from error) — worth having in the back pocket if the app grows more moments to react to later, but not required for this first ship. Adding one later is a matter of adding another `case` to the `Face` switch in `GlassMascot.jsx`, copying the pattern of an existing state.

## The 4 poses

Poses are a body-level transform, independent of state — any pose can combine with any state.

- **normal** — no transform, resting pose.
- **squish** — flattened and widened, like it just landed or got tapped. Good for a press/tap micro-interaction.
- **stretch** — taller and narrower. Good for a "popping up" or surprised beat.
- **tilt** — rotated ~10°. Adds personality to an otherwise static state, e.g. idle-tilt while waiting.

## Sizing

Native aspect ratio is 200:230 (viewBox). It reads clearly from a ~16px favicon dot up to a 500px+ hero illustration — the gradient softens out at the very smallest sizes but the eye pair and silhouette stay legible. Common placements:

- App icon / favicon: 32–64px, `pose="normal"`
- Floating in-app assistant bubble: 48–72px
- In-line inside a chat/guidance panel: 80–120px
- Marketing / empty-state hero: 160–320px

## Colors

| Role | Value |
|---|---|
| Body gradient, top | `#bfe0fb` (pale sky blue) |
| Body gradient, mid | `#d7c8f0` (soft lavender) |
| Body gradient, bottom | `#f6c7dd` (pale pink) |
| Ink (eyes, linework, brows) | `#2a2233` |
| Blush | `#ff9fb0` at ~55% opacity |
| Ground shadow | `#5b4b63` at ~16% opacity, blurred |

The gradient always runs top-to-bottom in the same three stops — don't recolor per-state; the face is what communicates the state change, the body stays constant so the character reads as one consistent creature.

## Notes for implementation

- This is SVG, not a raster image — it will stay crisp at any size and any screen density without needing @2x/@3x exports.
- No text/webfont dependency (the "?" in the error state uses a generic serif fallback stack, not a loaded font).
- If the app is not React: the static SVGs are simple enough to hand-adapt into any framework or even plain `<img src="mascot-idle.svg">` — the component is provided because React is what's implied by "clean reusable code," but the underlying markup in `generate-svgs.mjs` is the portable source if a different stack is needed.
- To change the design itself later (new state, resized body, different gradient), edit `generate-svgs.mjs` first and regenerate the static SVGs from it, then port the same change into `GlassMascot.jsx`'s `Face` switch — that keeps the two in sync.
