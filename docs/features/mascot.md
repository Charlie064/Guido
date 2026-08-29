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
  buddy on pointer devices. Desktop login uses the same `guido-icon.png`
  as the website login header (the glass idle SVG is still in the kit
  for the cursor buddy). **Not yet:** desktop overlay that follows the
  OS cursor, or driving `thinking` / `success` from live locate/research
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
