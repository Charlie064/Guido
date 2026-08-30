# Website design system

**Contract** [partial]
- Visual language for the Guido brand, established by the landing page
  (`website/src/Landing.jsx` / `website/src/brand.jsx`).
- Desktop overlay (`guido-overlay` in `spikes/tauri-overlay`) reuses these tokens instead
  of a second identity. If the website colors/type/buttons change,
  update this doc and the overlay in the same commit (co-change rule).
- This describes the current code, not a future spec.

The landing page establishes the visual language. This doc exists so
the desktop app can reuse the same colors, type, and component
patterns. Source on the website branch:
`origin/claudev/pauline/landing-page`.

## Colors

```
BRAND       #B6FF3E   lime green — logo mark, primary accent
FLASH_PINK  #FF2E9A   hero headline, emphasis
FLASH_BLUE  #3B82F6   text-highlight underline, Teach mode accent
INK         #0A0A0A   primary text, dark surfaces
```

**Mode colors** — each of the three product modes has its own accent:

```
teach   accent #3B82F6 (blue)     text on accent: white
show    accent #B6FF3E (green)    text on accent: #0A0A0A
do      accent #A78BFA (violet)   text on accent: #0A0A0A
```

**Violet halo** `rgba(196,181,253, α)` — interactive glow on the logo
mark and outline buttons. Alpha ramps from `0.15` (rest) to `0.35`
(hover).

**Neutrals** — white (`#ffffff`) background everywhere except premium
glass surfaces (`rgba(12,12,14,0.75)` / `#0A0A0A`).

## Typography

```
Space Grotesk (500/600/700)  — headings, wordmark, button/UI labels
Inter (400–700)              — body / sentences
Fredoka (600/700)            — liquid-glass display on how-it-works tiles
```

## Component patterns

**Logo** — `guido-icon.png` in a rounded square with a thin black
border plus the violet halo ring. This is the canonical brand mark
(website header, desktop login, desktop title bar, bundle icons). Do
not swap it for the glass SVG mascot; that buddy is a separate
cursor-follow helper (see [mascot.md](mascot.md)). The landing intro
is a circular pointer, a center click, then a slow fade-in of the
glass mascot. After that the hero holds a still of the Guido mark.
Laptop header nav is **How it works** and **Usecases** (hidden on
phone). The hero headline is sentence-case Space Grotesk in flash pink,
not uppercase. The header logo stays `guido-icon.png`.

**Primary CTA ("keycap" button)** — black pill, hard bottom offset
shadow (`0 5px 0 0 #000`) that collapses on press, white sheen on the
top third. Used on desktop chrome, not the landing waitlist.

**Secondary/outline button** — white pill, thin black border, violet
halo on hover. Landing header and bottom “Join the waitlist” use this.

**Pricing page** (`/pricing`) — document title `Guido — Pricing`. Same
header, waitlist overlay, plus-grid, and footer as the landing page. Two cards: quiet white **Free**, then
elevated glass **Guido Pro** (how-it-works wash, Recommended chip,
keycap CTA). Pro stacks first on the phone. No download button. Laptop
nav adds Pricing next to How it works and Usecases. Sticker amounts
are marketing copy and may diverge from
[business/pricing.md](../business/pricing.md) until billing ships.
Currency follows Cloudflare `request.cf.country` via `GET /api/geo`
(locale region if that call fails) — same number, local ISO code, not
a live FX rate.

**Waitlist modal** — same pink–blue glass tile as how-it-works, as a
large overlay (also at `/waitlist` for referral links). Clicking Join
fades the veil, plays the liquid-glass `get-guido.png` mark with the
glass buddy hovering over the word, then the
form card rises in. Titles use Space Grotesk; body/inputs use Inter.
Inputs stay 16px so iOS does not zoom. On narrow screens the overlay
uses safe-area padding and a shorter card; hover lift on how-it-works
tiles is off for coarse pointers. Three steps: name + required email,
app tiles + “something else”, then an optional role. Success shows
position and a `guidotutor.com/waitlist?ref=` link. POSTs JSON to
`/api/waitlist` (D1, not Supabase).

**How-it-works tiles** — three numbered glass cards. Each uses a shifted
pink–blue wash from the mascot body (`#bfe0fb` / `#d7c8f0` / `#f6c7dd`),
a white sheen, and Fredoka numbers clipped to the same gradient.

**Chat bubble** — rounded card tinted with a mode accent at low alpha
(`${accent}12` fill, `${accent}40` border). Desktop AI steps use Teach
blue; user questions use pink.

## Desktop overlay

`spikes/tauri-overlay/src/sidebar.html` applies this system to every
view (login, setup, skills, path, chat):

- White plus-grid background, Inter body, Space Grotesk labels.
- `guido-icon.png` in the title bar and on the login card.
- Compact 320px shell; profile pill (top right) after Continue.
- Home puts the Research Ask field above the Apps list, then the same
  card + halo treatment for the fake “Excel chats” group
  (`assets/excel.png`).
- Demo substeps use a fake overlay stage (dark window chrome, pink
  highlight, white callout) as a stand-in for the real on-screen
  step textbox. Teach steps get a blue callout border; user
  follow-ups get pink.
- Keycap buttons for Google sign-in, Continue, Ask, and Send.
- Window-pick hint uses the dark-glass treatment from
  `region-select.html`.

## Layout & motion (website)

Hero sits on a faint plus/cross SVG tiled 40×40px. Hover halo bloom
and the keycap press are the two motions the app reuses. Full website
patterns (how-it-works tiles, marquee) stay on the landing page until
a desktop view needs them.

## Assets

- `website/public/assets/guido-icon.png` — brand mark (copied to
  `spikes/tauri-overlay/src/assets/guido-icon.png` and the Tauri
  bundle icons).
- `get-guido.png`, `hero-demo.mp4`, and the "works with" logos are
  website-only.
