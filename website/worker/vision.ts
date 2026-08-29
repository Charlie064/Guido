import Anthropic from "@anthropic-ai/sdk";
import { type Env, type Plan, json, membershipFromBearer } from "./auth";

// Guido's one call into Claude. The desktop app never talks to Anthropic
// directly and never holds a key — anything shipped in the bundle is
// extractable, so the key lives only as a Worker secret and every request
// is authenticated, rate limited, budgeted, and shaped here.
//
// Deliberately NOT a passthrough proxy: the client sends a screenshot and
// a goal, not a `messages` array. A passthrough would let anyone with a
// free account spend our Anthropic budget on arbitrary prompts, and would
// put the system prompt — the part worth stealing — back in the client.

// docs/business/pricing.md models COGS at $2/$10 per MTok, which is this
// model. Changing the model here silently invalidates every margin in
// that doc, so change both together or neither.
const MODEL = "claude-sonnet-5";
const INPUT_MICRO_USD_PER_TOKEN = 2; // $2 / 1M tokens
const OUTPUT_MICRO_USD_PER_TOKEN = 10; // $10 / 1M tokens

// A next-step answer measured at ~340 output tokens. This is a hard
// ceiling on what one call can cost, and thinking tokens count against
// it too — 2048 leaves room for adaptive thinking plus the answer while
// capping worst-case output spend at ~$0.02 instead of ~$0.16.
const MAX_TOKENS = 2048;

// pricing.md sizes every estimate on half-res captures (960x540 ~ 700
// input tokens; full 4K is 2691, ~4x the cost for no accuracy gain on
// locate). The desktop app is expected to downsample before sending;
// this cap is what makes that non-optional.
const MAX_SCREENSHOT_BYTES = 1_500_000;
const MAX_TEXT_CHARS = 2000;

// A byte-size cap alone doesn't bound cost: Claude's image tokenization
// scales with pixel count, not file size, and a highly compressible
// image (e.g. a mostly solid-color screenshot) can carry far more pixels
// than its byte size suggests. 2,100,000px matches pricing.md's own
// "full 4K" reference point (1920x1080, 2691 tokens) — generous for a
// real screenshot, a real ceiling against a crafted one.
const MAX_IMAGE_PIXELS = 2_100_000;
const IMAGE_TOKEN_DIVISOR = 750; // pricing.md's own image-token approximation

// Monthly spend ceiling per plan, in micro-USD. Set well above the
// typical COGS in pricing.md ($4.05/mo on starter) so a real user never
// meets them — these bound abuse, they are not a product quota. The
// product quota is skill_runs.
const MONTHLY_CEILING_MICRO_USD: Record<Plan, number | null> = {
  free: 1_000_000, // $1
  starter: 6_000_000, // $6, against a $12 sticker
  plus: 12_000_000, // $12, against a $24 sticker
  owner: null, // unmetered
};

// The most a single call could ever cost, derived from the caps already
// enforced below (MAX_IMAGE_PIXELS, MAX_TOKENS) rather than a separate
// guessed number, so the two can't quietly drift apart. +1200 input
// tokens covers the system prompt (~150) plus the two 2000-char text
// fields (~1000) — headroom, not a tight fit.
const RESERVE_INPUT_TOKENS = Math.ceil(MAX_IMAGE_PIXELS / IMAGE_TOKEN_DIVISOR) + 1200;
const RESERVE_MICRO_USD =
  RESERVE_INPUT_TOKENS * INPUT_MICRO_USD_PER_TOKEN + MAX_TOKENS * OUTPUT_MICRO_USD_PER_TOKEN;

const SYSTEM_PROMPT = `You are Guido, a software tutor. You are looking at a screenshot of the user's screen and helping them accomplish a goal inside the application shown.

Teach, don't just automate. Describe the single next action the user should take, in terms of what they can actually see on this screen — the real control's label, its location, what it looks like. Never invent UI that isn't visible, and never assume a step succeeded that you cannot see evidence of.

If the screen does not show what you'd need to advance the goal, say so and describe what the user should bring into view instead of guessing.

Answer with the next step only. Be concise.`;

interface VisionRequest {
  screenshot?: string;
  media_type?: string;
  goal?: string;
  question?: string;
}

const ALLOWED_MEDIA = new Set(["image/png", "image/jpeg", "image/webp"]);

// Decodes only enough of the base64 payload to read the format's own
// dimension header — never the full image — so this stays cheap even at
// the byte cap.
function base64Prefix(b64: string, maxBytes: number): Uint8Array {
  const neededChars = Math.ceil(maxBytes / 3) * 4;
  const slice = b64.slice(0, Math.min(b64.length, neededChars));
  const safeLen = slice.length - (slice.length % 4);
  const binary = atob(slice.slice(0, safeLen));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !sig.every((b, i) => bytes[i] === b)) return null;
  // IHDR is always the first chunk, immediately after the signature:
  // 4-byte length, "IHDR", then width/height as big-endian uint32s.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9) break; // EOI
    const segLen = (bytes[offset + 2] << 8) | bytes[offset + 3];
    // SOF0-SOF15, excluding DHT(C4)/JPG(C8)/DAC(CC) which share the range.
    const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) {
      if (offset + 9 > bytes.length) return null; // header cut off by our prefix cap
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8],
      };
    }
    offset += 2 + segLen;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30) return null;
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const webp = String.fromCharCode(...bytes.slice(8, 12));
  if (riff !== "RIFF" || webp !== "WEBP") return null;
  const fourcc = String.fromCharCode(...bytes.slice(12, 16));
  if (fourcc === "VP8X") {
    // 24-bit little-endian canvas width/height minus one.
    return {
      width: (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1,
      height: (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1,
    };
  }
  if (fourcc === "VP8 ") {
    // Lossy: two 14-bit little-endian dimensions after the frame tag.
    return {
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
    };
  }
  if (fourcc === "VP8L" && bytes.length >= 25) {
    // Lossless: 14-bit width-1 then 14-bit height-1, packed little-endian.
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

// Fails closed: an image whose dimensions can't be read is rejected
// rather than let through unbounded. A real screenshot from the desktop
// app always parses; only a malformed or deliberately obfuscated payload
// doesn't.
function imagePixelCount(base64: string, mediaType: string): number | null {
  const prefix = base64Prefix(base64, 262_144);
  const dims =
    mediaType === "image/png"
      ? pngDimensions(prefix)
      : mediaType === "image/jpeg"
        ? jpegDimensions(prefix)
        : webpDimensions(prefix);
  return dims ? dims.width * dims.height : null;
}

function costMicroUsd(inputTokens: number, outputTokens: number): number {
  return inputTokens * INPUT_MICRO_USD_PER_TOKEN + outputTokens * OUTPUT_MICRO_USD_PER_TOKEN;
}

// Atomically reserves RESERVE_MICRO_USD (the worst case any call could
// cost) against the user's monthly budget before Anthropic is ever
// called, so the ceiling is enforced against the most expensive possible
// outcome rather than against whatever this particular request turns out
// to cost. The actual, usually much smaller, cost is refunded back after
// the response (see refundBudget). This is what makes the ceiling a hard
// cap rather than a check that a burst of concurrent requests can race:
// D1 is one Durable Object per database, so writes to the same row
// serialize globally — two simultaneous requests literally cannot both
// read "under budget" and both commit, the way two SELECT-then-INSERT
// requests against a SUM() could.
async function reserveBudget(db: D1Database, userId: number, ceiling: number): Promise<boolean> {
  const results = await db.batch([
    db
      .prepare(
        "INSERT INTO monthly_spend (user_id, month, reserved_micro_usd) VALUES (?, strftime('%Y-%m', 'now'), 0) ON CONFLICT (user_id, month) DO NOTHING",
      )
      .bind(userId),
    db
      .prepare(
        `UPDATE monthly_spend SET reserved_micro_usd = reserved_micro_usd + ?
         WHERE user_id = ? AND month = strftime('%Y-%m', 'now')
           AND reserved_micro_usd + ? <= ?`,
      )
      .bind(RESERVE_MICRO_USD, userId, RESERVE_MICRO_USD, ceiling),
  ]);
  return (results[1].meta.changes ?? 0) > 0;
}

// Gives back the unused part of a reservation. `keep` is what the call
// actually turned out to cost (0 if it never reached Anthropic, or if
// Anthropic errored before returning usage). Clamped so a bug here can
// only ever under-charge the user, never push them over the ceiling.
async function refundBudget(db: D1Database, userId: number, keep: number): Promise<void> {
  const refund = Math.max(0, RESERVE_MICRO_USD - keep);
  if (refund === 0) return;
  await db
    .prepare(
      `UPDATE monthly_spend SET reserved_micro_usd = MAX(0, reserved_micro_usd - ?)
       WHERE user_id = ? AND month = strftime('%Y-%m', 'now')`,
    )
    .bind(refund, userId)
    .run();
}

async function currentReserved(db: D1Database, userId: number): Promise<number> {
  const row = await db
    .prepare(
      "SELECT reserved_micro_usd FROM monthly_spend WHERE user_id = ? AND month = strftime('%Y-%m', 'now')",
    )
    .bind(userId)
    .first<{ reserved_micro_usd: number }>();
  return Number(row?.reserved_micro_usd ?? 0);
}

export async function handleVision(request: Request, env: Env): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "Vision is not configured" }, 503);
  }

  const member = await membershipFromBearer(request, env.DB);
  if (!member) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Per-user, not per-IP: a shared office NAT would otherwise throttle
  // everyone together, and the session token is what actually maps to the
  // budget being spent. This bounds burst rate; reserveBudget below is
  // what bounds the bill, and does so exactly, not just "quickly".
  const { success } = await env.VISION_LIMITER.limit({ key: `vision:${member.user_id}` });
  if (!success) {
    return json({ error: "Too many requests" }, 429);
  }

  const ceiling = MONTHLY_CEILING_MICRO_USD[member.plan];
  if (ceiling !== null) {
    const reserved = await reserveBudget(env.DB, member.user_id, ceiling);
    if (!reserved) {
      return json(
        { error: "Monthly usage limit reached", plan: member.plan, remaining_micro_usd: 0 },
        402,
      );
    }
  }

  // From here on, a reservation is outstanding (unless owner). The success
  // path below refunds explicitly (it needs the post-refund total to
  // report remaining_micro_usd); every other exit relies on the finally
  // block, guarded by `refunded` so the reservation is never returned
  // twice.
  let spend = 0;
  let refunded = false;
  try {
    let body: VisionRequest;
    try {
      body = await request.json<VisionRequest>();
    } catch {
      return json({ error: "Invalid request body" }, 400);
    }

    const screenshot = body.screenshot;
    if (!screenshot) {
      return json({ error: "screenshot is required" }, 400);
    }
    if (screenshot.length > MAX_SCREENSHOT_BYTES) {
      return json({ error: "Screenshot too large — downsample before sending" }, 413);
    }

    const mediaType = body.media_type ?? "image/png";
    if (!ALLOWED_MEDIA.has(mediaType)) {
      return json({ error: "Unsupported media_type" }, 400);
    }

    const pixels = imagePixelCount(screenshot, mediaType);
    if (pixels === null) {
      return json({ error: "Could not read image dimensions" }, 400);
    }
    if (pixels > MAX_IMAGE_PIXELS) {
      return json({ error: "Image resolution too high — downsample before sending" }, 413);
    }

    const goal = (body.goal ?? "").slice(0, MAX_TEXT_CHARS);
    const question = (body.question ?? "").slice(0, MAX_TEXT_CHARS);
    if (!goal && !question) {
      return json({ error: "goal or question is required" }, 400);
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        // "What is the next click" does not need deep deliberation, and
        // thinking tokens bill at the output rate.
        output_config: { effort: "low" },
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: screenshot },
              },
              {
                type: "text",
                text: [
                  goal ? `Goal: ${goal}` : null,
                  question ? `Question: ${question}` : null,
                ]
                  .filter(Boolean)
                  .join("\n"),
              },
            ],
          },
        ],
      });
    } catch (err) {
      // Anthropic's message can name the model, quote the prompt, or carry
      // request ids — none of which the desktop client should see. Log the
      // detail, return a shape the UI can act on. No usage to record — an
      // errored call was never billed, so the finally block below refunds
      // the reservation in full.
      console.error("anthropic request failed", err);
      const status = err instanceof Anthropic.APIError ? err.status : undefined;
      if (status === 429 || status === 529) {
        return json({ error: "Claude is busy, try again in a moment" }, 503);
      }
      return json({ error: "Vision request failed" }, 502);
    }

    // Record before returning, and record even on a refusal — a refused
    // call still costs input tokens, and a bill-bounding ledger that only
    // counts successes is not bounding the bill.
    spend = costMicroUsd(response.usage.input_tokens, response.usage.output_tokens);
    await env.DB.prepare(
      "INSERT INTO vision_usage (user_id, input_tokens, output_tokens, micro_usd) VALUES (?, ?, ?, ?)",
    )
      .bind(member.user_id, response.usage.input_tokens, response.usage.output_tokens, spend)
      .run();

    // A refusal is a 200 with no usable content — checking stop_reason first
    // avoids handing the UI an empty answer with no explanation.
    if (response.stop_reason === "refusal") {
      return json({ error: "Claude declined this request" }, 422);
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    let remaining: number | null = null;
    if (ceiling !== null) {
      await refundBudget(env.DB, member.user_id, spend);
      refunded = true;
      remaining = Math.max(0, ceiling - (await currentReserved(env.DB, member.user_id)));
    }

    return json({
      text,
      // Truncation is silent otherwise: the UI would show a step that stops
      // mid-sentence with no indication anything was cut.
      truncated: response.stop_reason === "max_tokens",
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
      // Lets the desktop UI show "N left this month" or warn before the
      // hard 402 rather than the ceiling arriving as a surprise.
      remaining_micro_usd: remaining,
    });
  } finally {
    if (ceiling !== null && !refunded) {
      await refundBudget(env.DB, member.user_id, spend);
    }
  }
}
