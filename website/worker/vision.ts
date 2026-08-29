import Anthropic from "@anthropic-ai/sdk";
import { type Env, json, membershipFromBearer } from "./auth";

// Guido's one call into Claude. The desktop app never talks to Anthropic
// directly and never holds a key — anything shipped in the bundle is
// extractable, so the key lives only as a Worker secret and every request
// is authenticated, rate limited, and shaped here.
//
// Deliberately NOT a passthrough proxy: the client sends a screenshot and
// a goal, not a `messages` array. A passthrough would let anyone with a
// free account spend our Anthropic budget on arbitrary prompts, and would
// put the system prompt — the part worth stealing — back in the client.

const MODEL = "claude-opus-5";

// Bounds the request before it reaches Anthropic. A PNG of a 4K screen is
// ~2-4 MB raw, ~3-5 MB base64; 8 MB leaves headroom without letting a
// client push arbitrarily large uploads through on our budget.
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 2000;

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
  // budget being spent.
  const { success } = await env.VISION_LIMITER.limit({ key: `vision:${member.user_id}` });
  if (!success) {
    return json({ error: "Too many requests" }, 429);
  }

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
    return json({ error: "Screenshot too large" }, 413);
  }

  const mediaType = body.media_type ?? "image/png";
  if (!ALLOWED_MEDIA.has(mediaType)) {
    return json({ error: "Unsupported media_type" }, 400);
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
      max_tokens: 16000,
      thinking: { type: "adaptive" },
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
    // detail, return a shape the UI can act on.
    console.error("anthropic request failed", err);
    const status = err instanceof Anthropic.APIError ? err.status : undefined;
    if (status === 429 || status === 529) {
      return json({ error: "Claude is busy, try again in a moment" }, 503);
    }
    return json({ error: "Vision request failed" }, 502);
  }

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

  return json({
    text,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  });
}
