# Website design system

The landing page (`website/src/Landing.jsx`) establishes the visual
language for the "Guido" brand. This doc exists so the desktop app can
reuse the same colors, type, and component patterns instead of
inventing a second visual identity. It describes the current state of
the code, not a spec — if the website changes, update this doc in the
same commit (co-change rule, see `docs/workflows/development.md`).

## Colors

```
BRAND       #B6FF3E   lime green — logo mark, primary accent
FLASH_PINK  #FF2E9A   hero headline, "Follow → Learn → Master" emphasis
FLASH_BLUE  #3B82F6   text-highlight underline, Teach mode accent
INK         #0A0A0A   primary text, dark surfaces
```

**Mode colors** — each of the three product modes has its own accent,
reused for any UI tied to that mode (buttons, borders, glows, chat
bubbles):

```
teach (Notion demo)        accent #3B82F6 (blue)    text on accent: white
show  (Excel demo)         accent #B6FF3E (green)   text on accent: #0A0A0A
do    (video editor demo)  accent #A78BFA (violet)  text on accent: #0A0A0A
```

This teach/show/do → color mapping is the one pattern most worth
carrying into the app itself: if the overlay ever needs to signal
which mode is active, reuse blue/green/violet rather than picking new
colors.

**Violet halo** `rgba(196,181,253, α)` — a soft pastel-violet glow used
on hover for secondary (white/outline) buttons and around the logo
mark. Alpha ramps from `0.15` (resting ring) to `0.35` (hover bloom).
Not tied to any one mode — it's the generic "interactive" glow.

**Neutrals** — white (`#ffffff`) background everywhere except the
download modal and demo video panel, which go near-black
(`rgba(12,12,14,0.75)` / `#0A0A0A` / `neutral-950`) for a "premium
software" feel that contrasts with the light marketing chrome around
it.

## Typography

Loaded via Google Fonts in `index.css`:

```
Space Grotesk (500/600/700)  — all headings, nav wordmark, button/UI labels
Inter (400–700)               — body text (set as the page's default font-family)
Fredoka (500/600/700)         — imported but currently unused (leftover from an earlier wordmark treatment)
```

Rule of thumb: Space Grotesk for anything that's a label or a heading,
Inter for anything that's a sentence.

## Component patterns

**Logo** — 44px rounded-square icon (`guido-icon.png`) with a thin
black border plus the violet halo ring (`0 0 0 4px rgba(196,181,253,0.15)`),
next to the "Guido" wordmark in Space Grotesk 600. This exact
icon-plus-ring treatment is the canonical way to render the brand mark
anywhere (nav, footer).

**Primary CTA ("keycap" button)** — the black pill button used for
"Download free" in the hero/nav. Not a flat button: it has a hard
bottom offset-shadow (`0 5px 0 0 #000`) that collapses to `0 1px 0 0
#000` with a `translateY(4px)` on press, simulating a physical key
press. Plus a soft white gradient sheen across the top third. This is
the site's signature "premium but playful" button — worth reusing for
any primary action in the app that should feel tactile.

**Secondary/outline button** — white pill, thin black border
(`border-black/15`), no fill. Idle state has zero shadow; on hover, a
violet halo blooms in via inline `onMouseEnter`/`onMouseLeave` (not
CSS `:hover`, so the glow color can be data-driven later). Used for nav
"Download for free" and the bottom download CTA.

**Window chrome** — a fake macOS title bar (`WindowChrome`) with three
dots (`#FF5F57` red, `#FEBC2E` yellow, `#28C840` green) and a truncated
title. In the interactive demo, the dots are real buttons: green
expands the panel to a lightbox, red closes it, yellow triggers a
"shake no" wobble (`shake-no` keyframe) as a joke non-action. Reused
wherever the page wants to imply "this is a real desktop app window."

**Download modal (premium glass)** — `DesktopDownloadWindow`. Dark
glass card: `rgba(12,12,14,0.75)` background, `backdrop-filter:
blur(28px)`, 1px `rgba(255,255,255,0.08)` border, deep drop shadow. A
segmented pill switcher (macOS / Windows / Linux) with a white active
pill on a translucent track, and a solid white CTA button. This
replaced an earlier "fake desktop window" concept — the team's
feedback was that download flows should read as premium/serious, not
cute. Any future account/settings/download-style modal in the app
should match this treatment (dark glass, not light card).

**Mode switcher pill group** — segmented control (Teach/Show/Do) where
the active segment fills with that mode's accent color and swaps text
color for contrast; inactive segments are transparent with gray text.
Directly mirrors the product's actual Teach/Show/Do modes, so this is
the most direct visual precedent for an in-app mode switcher.

**Chat-style description bubble** — mode description text sits in a
rounded card tinted with the mode's accent at low alpha
(`${accent}12` fill, `${accent}40` border) with a CSS border-triangle
tail pointing down-left (`border-left`/`border-right: transparent`,
`border-top: solid ${accent}12`) — a zero-size triangle, not a rotated
square, to avoid a stray second triangle rendering. This bubble
pattern is a natural fit for any in-app "Guido is explaining this
step" callout.

**Demo video panel** — dark (`neutral-950`) aspect-video panel with a
radial vignette background, a circular play button outlined in the
mode's accent color, and a bottom audio-bar with an animated EQ
visualizer (`EqBars`, using the `eq-bar` keyframe) that only animates
when audio is "on." Expands to a centered lightbox on click (fixed
position + `translate(-50%,-50%)`, not the browser Fullscreen API —
this was an explicit choice) with a blurred dark scrim behind it.

**Marquee** — `WorksWithMarquee`, a horizontally-scrolling row of app
logos (Notion, Excel, Figma, GitHub, Blender, VS Code, DaVinci) using
the `marquee-x`/`marquee-y` keyframes (translate by -50% on a doubled
list, for a seamless loop).

## Layout & background

- Page background is flat white (`html, body { background-color:
  #ffffff }` — needed because Tailwind v4 renamed the gradient
  utilities and `bg-gradient-to-b` silently no-ops, so any gradient in
  this codebase is inline `style={{ background: 'linear-gradient(...)' }}`,
  never the `bg-gradient-*` classes).
- Hero section sits on a very faint plus/cross-pattern SVG background
  (`stroke-opacity: 0.09`), tiled 40×40px — a subtle "graph paper"
  texture rather than a flat white block.
- Content is capped at `max-w-3xl`/`max-w-5xl`/`max-w-6xl` depending on
  section, centered, with generous vertical section padding (`py-16`
  to `py-24`).
- Hero video has a soft radial fade at its edges via `mask-image:
  radial-gradient(ellipse 65% 70% at center, black 55%, transparent 100%)`
  rather than a hard rectangular crop, so it blends into the white
  page instead of showing a seam.

## Motion

- **Scroll reveal**: the demo panel starts at `scale(0.92)`/`opacity:0`
  and animates to `scale(1)`/`opacity:1` once an `IntersectionObserver`
  reports it 25% in view (fires once, then unobserves).
- **Shake-no**: `shake-no` keyframe (small alternating translateX),
  used as a negative-feedback micro-interaction (clicking a
  non-functional window-chrome dot).
- **Hover halo bloom**: violet box-shadow glow eased in/out on
  pointer enter/leave, `rgba(196,181,253,0.35)` at full bloom.
- **EQ bars**: `eq-bar` keyframe, staggered `animationDelay` per bar,
  only running while `audioOn` is true.
- An earlier full-page intro animation (cursor arcs in, "clicks" the
  logo mark to swap it from green to black) exists in the code
  (`IntroAnimation`) but is currently disabled/commented out.

## Assets

All in `website/public/assets/`, background-removed and color-matched
to the page's white/cream tones where they're photographic:

- `guido-icon.png` — app icon / logo mark
- `get-guido.png` — hero-style illustration used above the bottom
  download CTA
- `hero-demo.mp4` — top-of-page autoplay screen-recording demo (muted,
  looping, with iOS-specific autoplay workarounds: explicit `muted`
  JS property, `playsInline`/`webkit-playsinline`, deferred `play()`
  retry on first touch)
- `notion.png`, `excel.png`, `figma.png`, `github.svg`, `blender.png`,
  `vscode.png`, `video-editor.png`, `davinci.png` — "works with" logos

**On the crystallized/glass "get guido" image specifically**: it's a
one-off marketing illustration, not a reusable UI pattern — there's no
component, color, or interaction here for the app to inherit, so it
doesn't need its own section in this doc. It's already listed above
under Assets for completeness, which is enough. If you want the app to
share visual language with the site, the glass/blur *treatment* (the
`backdrop-filter: blur(28px)` dark-glass style used on the download
modal) is the reusable part — that's real CSS the app can apply to its
own overlays. The image itself is just decoration for this one page.

## Possible link to BL-002 (gamified progress/mastery)

`docs/BACKLOG.md` has BL-002 open with the mechanic undecided (badges?
streaks? per-app mastery levels?). Two things already built for the
website are relevant reference points if that gets picked up:

- The mode-accent-color system (blue/green/violet for teach/show/do)
  is a ready-made way to color-code per-mode or per-skill progress
  without inventing a new palette.
- An early prototype in this same draft repo (not part of the current
  site) used a circular profile "halo" that filled in as a proxy for
  level/progress — worth a look if a ring/halo-style mastery indicator
  ends up being the direction, since the visual language (soft pastel
  halo glow) already exists on this page for a different purpose
  (interactive hover state) and could extend naturally.

This is a pointer, not a decision — BL-002 still needs the mechanic
picked before any of this is actionable.
