# Guido mascot (Tuto)

**Contract** [partial]
- Shared “glass creature” buddy for the website and the desktop app.
  Canonical files live in [`assets/mascot/`](../../assets/mascot/).
- **What it is:** a small translucent jelly blob with a two-eye face,
  shipped as inline SVG (React) plus static `.svg` / app-icon rasters.
  It is a stylized approximation of glass, not a 3D render.
- **How it’s used:** as a helper next to the cursor. Face **state**
  changes with what the product is doing (`idle` / `happy` / `thinking`
  / `success` / `error`). Optional **pose** (`normal` / `squish` /
  `stretch` / `tilt`) is a body transform on top of any state.
- **What’s wired:** website can import the React components via the
  `@mascot` Vite alias; landing and `/login` mount the cursor-follow
  buddy on pointer devices. Desktop **login** still uses the static
  `guido-icon.png` (title bar + login card in `sidebar.html`’s
  `.login-mark`), unchanged. Desktop **top bar** (`.bar-mark`, shown
  next to the title on every view except the step list — see below)
  and the **mini rail’s per-step timeline** (the current-step node,
  `.mini-rail-tl-node.current`) both switched to the real `mascot-idle.svg`
  artwork (2026-09-03), not `guido-icon.png`: the icon asset ships with
  its own pastel-square padding baked in (character at roughly half the
  frame), where the raw SVG has none, so `object-fit: cover` alone gets
  the character close to filling its frame with no visible crop. Both
  spots give it a small idle "bob" animation — on `.bar-mark`, the
  animation is on the *outer frame* (border + shadow + clipped image,
  moving together as one rigid unit), not on the image inside a fixed
  clip, since animating the inner image alone visibly chopped the
  character at the clip edge on every bob cycle. `.bar-mark` is hidden
  on the step-list ("steps overview") view specifically
  (`els.barMarkFrame.hidden` in `showView`, `sidebar.js`) — every other
  view keeps it.
  `.bar-mark-frame` clips to a **circle** (`border-radius: 50%`), not
  the rounded-square (`9px`) it started as — found by actually
  screenshotting the running app (normally impossible; see
  `features/cursor-control.md`'s `WDA_EXCLUDEFROMCAPTURE` debugging
  note) after a report that "guido still has the white background": no
  asset had a background baked in, but the mascot's silhouette is round
  and a square-ish frame isn't, so the *corners* — the gap between the
  round character and the frame's square corners — showed the white
  `.bar` background behind it. A circular frame has no corners for that
  gap to exist in. **Not yet:** desktop overlay that follows the OS
  cursor, or driving `thinking` / `success` from live locate/research
  calls.
- Moodboard / photoreal frames (not the shippable mark) are in
  [`assets/mascot/reference/`](../../assets/mascot/reference/).
  Implementation detail (props, colors, regenerate steps) is in
  [`assets/mascot/README.md`](../../assets/mascot/README.md).

## States

| State | When |
| --- | --- |
| `idle` | At rest; nothing happening. |
| `happy` | Small win (correct click, dance, splash). |
| `thinking` | Processing or looking at the screen. |
| `success` | Task / tutorial finished. |
| `error` | User is off-track (confused), not a scary crash. |

## Where to import

- **React (website, later the desktop webview if it goes React):**
  `@mascot/GlassMascot.jsx`, `GlassMascotCursor.jsx`, `GuidoSplash.jsx`.
- **Plain `<img>` (desktop sidebar, emails, favicon):**
  `assets/mascot/mascot-{state}.svg` and `app-icon.svg`. Copies for
  serving live in `website/public/assets/mascot/` and
  `spikes/tauri-overlay/src/assets/mascot/` — refresh those with
  `assets/mascot/sync-static.sh` after regenerating. The desktop login
  mark and bundle icons use `website/public/assets/guido-icon.png`
  (copied to `spikes/tauri-overlay/src/assets/guido-icon.png`).
