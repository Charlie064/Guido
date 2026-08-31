# Membership pricing and Anthropic API COGS

**Contract** [partial]
- Canonical home for membership **tiers**, sticker/overage, and Anthropic
  **COGS**. [ADR 0002](../decisions/0002-agency-hybrid-vision-platform-business.md)
  owns “monthly subscription”; this file owns the `plan` values and what
  each unlocks.
- **Decided 2026-09 (Charlie), collapsing `starter`/`plus` into one
  `pro` tier** — see `pro` below. This is a pricing-doc decision only:
  `worker/auth.ts`'s `plan` enum, `includedFor()`/`canSaveSkills()`, and
  D1 `memberships.plan` still say `free|starter|plus|owner` as of this
  write-up. Updating the code to match (rename, merge the two
  allowances, re-point `/pricing` if it ever reads plan names) is
  tracked as its own follow-up, not done in this pass — see
  [planning/glass-waitlist-integration.md](../planning/glass-waitlist-integration.md),
  which is what surfaced this doc was already out of sync with the
  `Pricing.jsx` page it's wiring in.
- D1 `memberships.plan` (current code): `free` | `starter` | `plus` |
  `owner`. `status`: `active` | `expired`. New accounts start as `free`
  / `active` (or `owner` if their email is on the `OWNER_EMAILS`
  allowlist) — see [features/auth.md](../features/auth.md). MVP: set
  `plan` by hand in D1 — no Stripe yet.
- Quota unit is a **new skill** (one goal → one Research + the locates
  for that run), not a raw locate. Skill persistence is owned by
  [features/skills.md](../features/skills.md); this file only says
  *who* may save.

## Tiers

The unit of “a try” is a **new skill**: one stated goal, one Research
call, then the step/vision loop (planning: 5 steps × 5 locates). Replay
of an already-saved skill is **$0** API if boxes are cached — that is
why save is the Plus unlock, not extra locates.

### Is 5 a reasonable free trial?

Originally scoped as 5 — see the reasoning below — but tightened to
**1 new skill, lifetime** in `worker/auth.ts`'s `includedFor()` at
Charlie's request (2026-08-29). The 5-skill reasoning is kept here since
it's still the right way to think about the unit; only the number
changed.

- 5 locates ≈ one step. Not enough to judge the product.
- 5 steps ≈ one tutorial. Enough for a single sitting, thin if they
  pick a bad first goal.
- **5 new skills** ≈ five different goals (e.g. VS Code, Excel, a
  second pass). COGS ≈ 5 × $0.14 = **$0.70** at half-res. Enough to
  feel Goal → Research → See → Guide more than once.

Lifetime, not monthly: this is “try the feature,” not a perpetual
hobby tier. After the free allowance, the app stops new Research and
points at Pro (the old copy said "Starter" — see the Contract note
above on the `starter`/`plus` → `pro` collapse).

### `free` — Simple

- **1 new skill, lifetime.** Hard stop after that. No overage.
- **No saved skills.** The path exists for the session; it is not in
  the skills list after quit (persistence is a Plus/Owner feature).
- `plan=free`, `status=active` until the 1st skill completes, then
  still `free` / `active` but `/api/me` reports `skills_remaining: 0`.

### `pro` — the one paid tier

Replaces the old `starter`/`plus` split with a single public paid SKU,
matching `website/src/Pricing.jsx` (wired in via the glass-waitlist
integration) — that page already shipped copy for this shape before
the doc caught up, not the other way around.

- **20 new skills / calendar month** included (`Pricing.jsx`'s stated
  number — lower than the old Starter's 30, so recompute COGS from this
  figure, not the 30/month numbers below in "Usage we price from").
- **Save skills** — the durable artifact in
  [features/skills.md](../features/skills.md), previously the Plus-only
  unlock. With only one paid tier left there's no cheaper tier to
  withhold it from, so it's included here.
- **Sticker: tentatively $8/month — up for debate, not finalized.**
  The number actually shipped in code today is **€7.99**
  (`PRO_EUR` in `website/src/currency.js`, converted to local currency
  per country), which is *not* exactly $8 at typical EUR/USD rates —
  worth deciding whether the sticker is "$8 in the US, €7.99 in the
  eurozone" (two round numbers, not a strict conversion) or one true
  price converted everywhere, before this goes further than a waitlist
  page.
  - **Margin flag, not a blocker**: at 20 skills/month, COGS is roughly
    20 × ~$0.20/skill ≈ **$4/month** (using the "Guide->Do->Verify"
    adjusted per-skill estimate below), before voice. An $8 sticker is
    a ~50% margin before voice costs land — thinner than the "safer
    paid band: $15–25/month" this doc concluded further down under the
    old two-tier assumptions. Not a reason to block a debated number,
    but the debate should account for this, not just pick a
    friendly-sounding price.
- Overage beyond 20/month: **not decided for the single-tier shape.**
  The old Starter's $0.25/skill overage was designed as a floor above
  ~$0.14 cost per skill and could still apply here, or MVP could keep
  the existing hard-cap-until-Stripe pattern
  ([features/auth.md](../features/auth.md)'s Deferred section) a while
  longer. Tracked in [BACKLOG.md](../BACKLOG.md) BL-017 either way.
- `plan=pro` **in this doc's model only** — not yet the code's enum
  value; see the Contract note above.

### `owner`

- **Unlimited** new skills, locates, Research, and saved skills. No
  overage line.
- Not a public self-serve SKU for MVP. Flip `plan=owner` in D1 for
  teammates in [reference/team.md](../reference/team.md) (and later
  anyone we treat as an owner). If we ever sell it, it is a custom
  quote — do not put a consumer price here.

### What `/api/me` should return

`{ email, plan, status, skills_remaining, skills_included, can_save_skills }`.
Under this doc's collapsed model: `skills_included` is `1` (lifetime,
matching the code's current `includedFor()` — the "5" in the section
above is the older, superseded reasoning) on free, `20` (monthly) on
`pro`, omitted or `null` on owner. `can_save_skills` is true for `pro`
and `owner`. **Current code still returns the `starter`/`plus` shape**
(`skills_included: 30` on both) — see the Contract note above.

## Unit costs (Claude Sonnet 5, 2026-08)

API: **$2 / million input tokens**, **$10 / million output tokens**.
Web search: **$0.01 per search** plus those token rates.
Images: visual tokens `⌈width/28⌉ × ⌈height/28⌉`, Sonnet 5 high-res cap
4784. Source: Anthropic pricing / vision docs.

The locate path is [`spikes/vision-detect/locate.py`](../../spikes/vision-detect/locate.py)
(`claude-sonnet-5`). Today it sends the native PNG with **no
downsample**. These numbers assume we **halve each axis** before send:
1080p (1920×1080) → **960×540**. Visual tokens:
`⌈960/28⌉ × ⌈540/28⌉` = 35 × 20 = **700**. Research is
[`spikes/vision-detect/research.py`](../../spikes/vision-detect/research.py)
(text + `web_search`, `max_uses=3`) — **not** a vision call, and at
half-res it is the **larger** share of per-skill API cost.

- One half-res 1080p locate (960×540): **~$0.0014** (700 × $2/MTok).
  ~$1.40 per 1,000 locates.
- One half-res 4K locate (1920×1080): **~$0.006** (2691 tokens — same
  as a full-res 1080p send).
- One Research (budget): **~$0.10** (range ~$0.05–$0.20). Unchanged;
  no image.
- Overnight check (~7 *native* 1080p locates, “a few cents” in
  [STATUS.md](../../STATUS.md)) is the pre-downsample path (~$0.04).
  Same 7 calls at 960×540 would be ~$0.01.

Coordinate boxes are in the *sent* image’s pixels; if we downsample,
`locate.py` / the overlay must scale boxes back to the capture. Not
implemented yet — this is the costed send size, not current code.

## Usage we price from

Planning assumption (not the conservative `skills.md` “manual look”
path): **1 new skill per day**, **5 steps**, **5 vision calls per
step**.

- Locates per skill: 5 × 5 = **25**
- Skills per 30-day month: **30**
- Locates per user per month: **750**
- Plus **30 Research** calls (one per new skill)

Replay of a saved skill is still **$0** vision if boxes are cached.
This working set is first-time teaching, which is the loop the
constitution and P0 “screen re-analysis” describe (see the screen after
each step, not one screenshot for the whole skill).

[features/skills.md](../features/skills.md) currently says the
screenshot is a manual button and is *not* fired per substep. If we
ship that instead, locates drop toward ~6/skill and these numbers fall
by ~4×. Price from **25 locates/skill** until the product actually
caps that.

## Per person (use this to set a price)

One **new skill** ≈ 1 Research + 25 half-res locates ≈
**$0.10 + $0.035 = $0.14**.

At 1 skill/day (30/month), 960×540 sends:

- Vision: 750 × $0.0014 = **$1.05/user/month**
- Research: 30 × $0.10 = **$3.00/user/month**
- **Anthropic total: ~$4.05/user/month**

A 4K capture halved to 1920×1080: 750 × $0.006 + $3.00 = **~$7.50**.

- Light — 1 skill every 3 days (10/month): 250 locates + 10 Research ≈
  **$1.35/user/month**
- Planning / typical — 1 skill/day at 960×540: **$4.05/user/month**
- Heavy — 2 skills/day: **~$8.10/user/month**

Planning COGS: **$4.05**. Still-profitable heavy user: **$8**.

API-only floor at typical usage and 80% gross margin is
**~$20/month** ($4.05 / 0.20). At 70% margin, **~$13.50/month**.
Research is ~75% of typical Anthropic COGS; cutting vision further
barely moves the price. An **$8–12** plan now covers Anthropic for a
daily user (at $10 you keep ~$6 before voice — 60% margin) but
ElevenLabs can still wipe that.

Safer paid band until voice is costed: **$15–25/month**, or a cheaper
sticker with a **hard locate cap** (e.g. 200 locates/month ≈ $0.28
vision).

If there is a free tier, **cap locates and Research**. Example: 2
Research + 50 locates ≈ **$0.27/user/month**. 100 free users at the
uncapped daily pattern would be **~$405/month** in Anthropic.

## Hackathon / demo month (team + judges)

Half-res (960×540) locates at $0.0014 — **not** the number to price a
subscription from. Short-demo call counts (not 25/skill):

- Quiet: 10 people × 3 sessions × 6 = 180 locates ≈ **$0.25**
- Likely: 15 × 4 × 6 = 360 ≈ **$0.50**
- Busy: 20 × 6 × 8 = 960 ≈ **$1.35**
- Plus ~50 rehearsal locates ≈ **$0.07**

Quote **200–1,000 locates, well under $2** for the demo month at
half-res. Research for those sessions is extra.

## Guide->Do->Verify calls (added after this doc's original pricing pass)

The Guide->Do->Verify UI (`af979f0`) added three call types this doc
never priced. All still `claude-sonnet-5`, no server-side metering
beyond the initial `research_goal` quota check (`website/worker/`'s
`handleSkillStart` only gates starting a new skill — `plan_step`,
`locate_element`, `verify_substep`, and `answer_question` all fire
freely once a skill run has started).

- **`plan_step`** (`vision-detect/plan_step.py`) — text-only, ~200-word
  prompt, `max_tokens=2048`. Fires once per top-level step, lazily on
  first expand: **5/skill**. ~$0.007/call -> **+$0.035/skill**, a ~25%
  bump on the old $0.14/skill baseline. Unlike locate/verify below,
  this one isn't optional — every expanded step costs one.
- **`verify_substep`** (`vision-detect/verify.py`) — screenshot (700
  visual tokens half-res) + short prompt + `max_tokens=400`. Manually
  triggered per substep via "Check my work." ~$0.0027/call.
- **`answer_question`** (`vision-detect/answer.py`) — text, optional
  screenshot, `max_tokens=1024`. Ad hoc, one per user follow-up.
  ~$0.0036/call (~$0.005 with a screenshot attached). **Not counted
  against any quota** — a starter/plus user within their monthly skill
  allowance can ask unlimited follow-ups on one skill at zero
  additional cost control. This is the one open-ended line item; flag
  for a cap (e.g. folded into the same skill-run quota, or its own
  monthly N) before shipping past MVP.

**This also changes what "25 locates/skill" means.** That figure
assumed automatic per-step vision calls. `locate_element` and
`verify_substep` are now both manual, per-substep clicks — actual
usage is bounded by how many substeps exist and how often a user
clicks "check"/"locate," not a fixed count. Treat 25 as an upper
bound, not the expected case.

**Adjusted typical-skill estimate:** old $0.14 -> **~$0.18-0.22/skill**
(research + 5x plan_step + a realistic ~10-15 locate/verify clicks,
down from 25 automatic ones). Monthly COGS at 1 skill/day stays close
to the $4.05/user/month above — plan_step adds ~$1.05/month
(30 x $0.035), the main mover — plus the uncapped `answer_question`
tail this doc has no ceiling for yet.

No sticker-price change recommended yet: the delta is small (~$1-2/
user/month) against the $8-12 margin already reasoned about above. The
action item is capping `answer_question`, not repricing.

## Not in these numbers

- ElevenLabs STT/TTS ([ADR 0002](../decisions/0002-agency-hybrid-vision-platform-business.md))
  — likely larger than vision once voice is on.
- Cloudflare Workers/D1 — cheap at this scale.
- Hybrid accessibility ([ADR 0002](../decisions/0002-agency-hybrid-vision-platform-business.md))
  — would cut vision on apps with a real a11y tree; canvas apps stay
  vision-primary.
