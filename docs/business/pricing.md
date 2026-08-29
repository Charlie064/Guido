# Membership pricing and Anthropic API COGS

**Contract** [partial]
- Canonical home for membership **tiers**, sticker/overage, and Anthropic
  **COGS**. [ADR 0002](../decisions/0002-agency-hybrid-vision-platform-business.md)
  owns “monthly subscription”; this file owns the four `plan` values
  and what each unlocks.
- D1 `memberships.plan`: `free` | `starter` | `plus` | `owner`.
  `status`: `active` | `expired`. New Google users start as `free` /
  `active`. MVP: set `plan` by hand in D1 — no Stripe yet. Starter
  overage (Claude-style) is specified here; wiring meters + charges is
  a follow-up to [login-membership-plan.md](../planning/login-membership-plan.md).
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

**Yes — if 5 means 5 complete new skills, not 5 locates or 5 steps.**

- 5 locates ≈ one step. Not enough to judge the product.
- 5 steps ≈ one tutorial. Enough for a single sitting, thin if they
  pick a bad first goal.
- **5 new skills** ≈ five different goals (e.g. VS Code, Excel, a
  second pass). COGS ≈ 5 × $0.14 = **$0.70** at half-res. Enough to
  feel Goal → Research → See → Guide more than once.

Lifetime, not monthly: this is “try the feature,” not a perpetual
hobby tier. After 5, the app stops new Research and points at Starter.

### `free` — Simple

- **5 new skills, lifetime.** Hard stop after that. No overage.
- **No saved skills.** The path exists for the session; it is not in
  the skills list after quit (persistence is a Plus/Owner feature).
- `plan=free`, `status=active` until the 5th skill completes, then
  still `free` / `active` but `/api/me` reports `skills_remaining: 0`.

### `starter`

- **30 new skills / calendar month** included (~1/day, the planning
  usage). Then **usage billing like Claude**: pay per extra new skill,
  not a hard wall.
- Sticker **$12/month** (covers ~$4.05 typical Anthropic COGS with
  room; voice still extra).
- Overage **$0.25 / new skill** (our cost ~$0.14; do not meter raw
  locates — a retry-heavy step should not surprise-bill).
- **No saved skills** — same as free. Starter is for people who want
  to *learn more*, not keep a library.
- MVP without Stripe: enforce the 30 as a hard cap and flip `plan` by
  hand. Record the $0.25 rate so billing can match later.

### `plus` — Premium

- Everything in Starter’s included allowance (30 new skills / month,
  then $0.25 overage).
- **Save skills** — the durable artifact in
  [features/skills.md](../features/skills.md). Replay and refresh of
  saved skills do not consume the monthly new-skill quota (refresh is
  one locate; treat it as included on Plus, not a new skill).
- Sticker **$24/month**. The extra $12 is for the library, not a
  bigger locate dump — replay is cheap; the reason to pay is not
  re-researching.
- `plan=plus`.

### `owner`

- **Unlimited** new skills, locates, Research, and saved skills. No
  overage line.
- Not a public self-serve SKU for MVP. Flip `plan=owner` in D1 for
  teammates in [reference/team.md](../reference/team.md) (and later
  anyone we treat as an owner). If we ever sell it, it is a custom
  quote — do not put a consumer price here.

### What `/api/me` should return

`{ email, plan, status, skills_remaining, skills_included, can_save_skills }`.
`skills_included` is `5` (lifetime) on free, `30` (monthly) on
starter/plus, omitted or `null` on owner. `can_save_skills` is true
only for `plus` and `owner`.

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

## `/api/vision` — ad-hoc "what do I click" (outside the skill loop)

A second, separate cost surface from the skill loop priced above: a
one-shot screenshot + goal/question, answered without Research or a
saved plan. `website/worker/vision.ts`. Same model as this doc already
assumes — **Claude Sonnet 5**, $2/$10 per MTok — so the unit costs
above apply directly; nothing here changes the $4.05/user/month
skill-loop estimate, it's additive.

**Per-call cost.** Capped hard at **2,100,000px** input (matches this
doc's own "full 4K" 2691-token reference point) and **2048** output
tokens, so no single call can exceed **~$0.0285**. Real measured cost
at half-res is far below that ceiling — **$0.0014–0.005/call** — the
cap exists for a crafted or misbehaving request, not typical use.

**Monthly ceiling per plan** (micro-USD, i.e. millionths of a dollar):
free **$1**, starter **$6**, plus **$12**, owner unmetered. These are
abuse ceilings, not the product quota — `skill_runs` (5 lifetime free,
30/month starter/plus) still governs how many *skills* someone gets.
At real per-call cost this supports roughly 200–700 calls/month on
free before it bites, well past normal use.

**Why it's a hard cap and not just a fast check.** The ceiling is
enforced by reserving each call's worst-case cost *before* calling
Anthropic, against a running per-user-per-month total, refunding the
unused portion after. That reservation is atomic against concurrent
requests because D1 is one Durable Object per database — writes to the
same row serialize globally, so two simultaneous requests cannot both
read "under budget" and both commit. A SUM()-over-rows check (the
first version of this) could race; this can't. Verified against 40
truly concurrent requests: exactly the theoretical max got through,
the rest 402'd, and the ledger balanced to the real total afterward
with nothing leaked. See the comments on `reserveBudget` /
`refundBudget` in `vision.ts` for the mechanism, not repeated here.

Layered under a burst limiter (6 requests/user/minute, Workers
Rate Limiting binding) that bounds *speed*, separate from the ceiling
that bounds *spend* — a request-count limit alone doesn't bound a bill
when per-request cost varies, which is why both exist.

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
