<p align="center"><img src="assets/mascot/app-icon-256.png" width="120" alt="Guido"></p>

# Guido: AI Software Tutor

**Hackathon entry, August–September 2026.** · [guidotutor.com](https://guidotutor.com)

Guido is a desktop AI tutor that watches your screen, understands the application you're in and guides you through it step by step. Ask *"teach me to colour-grade in DaVinci Resolve"* and Guido researches the workflow, looks at your screen, tells you what to do next and checks that you did it before moving on.

It's a tutor, not an autonomous agent: by default it teaches and shows, and it only acts when you ask it to.

## The loop

**Goal → Research → See → Guide → Do → Verify → Learn**

Plans come from research and are re-checked against the real screen after every step, rather than following a pre-written tutorial.

## Stack

| Part | Tech |
|---|---|
| Desktop app | Tauri 2 (Rust + vanilla JS) overlay |
| Vision | Claude vision models read the screenshot and locate UI elements |
| Voice | Aqua Voice (speech-to-text), ElevenLabs (text-to-speech) |
| Website | React + Tailwind on Cloudflare Workers, D1 + Drizzle, Better Auth, waitlist |

Vision, voice and search sit behind interfaces, so providers can be swapped without touching the agent controller.

## Repo

| Path | Contents |
|---|---|
| `spikes/tauri-overlay/` | The desktop app |
| `website/` | guidotutor.com (Cloudflare Worker) |
| `assets/` | Brand and mascot |
| `docs/` | Vision, ADRs, feature docs, roadmap |
