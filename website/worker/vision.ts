import { type Env, type Plan, json, membershipFromBearer, visionCostUsedMicroUsd } from "./auth";
import type { createAuth } from "./better-auth";

// Claude vision proxy — see docs/features/vision.md. The desktop app must
// never hold an Anthropic key: it used to (spikes/vision-detect's scripts
// each called `anthropic.Anthropic(api_key=...)` directly, reading
// ANTHROPIC_API_KEY from a local .env file), which only ever worked on a
// developer's own machine — a downloaded build has no such key, and a key
// shipped in the bundle would be extractable with no way to meter usage
// per customer. This route is the replacement, same posture as voice.ts.
//
// Not a passthrough: the client sends a `kind` plus a small set of
// structured fields (a target description, an expected outcome, a
// screenshot, ...), never a messages array or a freeform prompt. A
// passthrough would let any free account spend our Anthropic budget on
// arbitrary prompts, and would put every prompt back in the client where
// it can be read out of the installer. Each `kind` below has its own
// fixed, developer-authored prompt template (ported verbatim from the
// vision-detect script it replaces) — user-supplied strings are
// interpolated into it as data, never as instructions to the proxy itself.

const MODEL = "claude-sonnet-5";

// $/1M tokens, in micro-USD (1e6 micro-USD = $1) to keep the D1 column
// integer. See the claude-api skill's pricing table — re-check there
// before changing model.
const MODEL_PRICING_MICRO_USD = { input: 2.0, output: 10.0 };

function costMicroUsd(inputTokens: number, outputTokens: number): number {
  return Math.round(
    inputTokens * MODEL_PRICING_MICRO_USD.input + outputTokens * MODEL_PRICING_MICRO_USD.output,
  );
}

// Monthly $ ceiling per plan, in micro-USD — unlike voice.ts's single flat
// cap, this scales with plan like skill quotas do: research's web search
// round trips cost meaningfully more per call than a plain verify, so a
// flat cap would either starve heavy users or be too loose for free.
// `null` means unmetered (owner). Numbers are a starting estimate, not a
// measured COGS figure — revisit against docs/business/pricing.md once
// real usage data exists.
const PLAN_CEILING_MICRO_USD: Record<Plan, number | null> = {
  free: 1_000_000,
  starter: 6_000_000,
  plus: 12_000_000,
  owner: null,
};

export function visionCeilingMicroUsdFor(plan: Plan): number | null {
  return PLAN_CEILING_MICRO_USD[plan];
}

const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024; // base64-decoded
const MAX_TEXT_FIELD_LENGTH = 2000;

type VisionKind = "locate" | "verify" | "identify_app" | "plan_step" | "answer" | "research";

interface VisionRequestBody {
  kind: VisionKind;
  screenshot?: string; // base64 PNG
  target?: string;
  expected_outcome?: string;
  context?: string;
  goal?: string;
  step_title?: string;
  step_brief?: string;
  step_watch_for?: string;
  question?: string;
  app_name?: string;
}

function decodeScreenshot(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Every vision-detect capture writes a PNG (tempfile suffix=".png",
// mss.tools.to_png, grim's default) — reading the IHDR chunk directly
// avoids pulling in an image library just to learn width/height for
// `locate`'s response, the one kind that needs them.
function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 24 || view.getUint32(0) !== 0x89504e47) {
    throw new Error("not a PNG image");
  }
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function truncate(s: string): string {
  return s.length > MAX_TEXT_FIELD_LENGTH ? s.slice(0, MAX_TEXT_FIELD_LENGTH) : s;
}

// Shared "call Claude, get back text" plumbing every kind below uses.
// `tools`/`maxTokens` differ per kind (research needs web search and more
// headroom); parsing quirks (markdown-fenced JSON, stray commentary
// around the object) are ported as-is from the Python scripts, since
// they're responses to observed live model behavior, not incidental.
async function callClaude(
  env: Env,
  opts: {
    maxTokens: number;
    content: unknown;
    tools?: unknown[];
    timeoutMs: number;
  },
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: opts.maxTokens,
        messages: [{ role: "user", content: opts.content }],
        ...(opts.tools ? { tools: opts.tools } : {}),
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    console.error("anthropic error", res.status, await res.text().catch(() => ""));
    throw new Error(`Claude request failed (${res.status})`);
  }

  const data = await res.json<{
    content: { type: string; text?: string }[];
    usage: { input_tokens: number; output_tokens: number };
  }>();

  const textBlocks = data.content.filter((b) => b.type === "text").map((b) => (b.text ?? "").trim());
  const joined = textBlocks.filter(Boolean).join("");
  if (!joined) throw new Error("Claude returned no text (likely truncated by max_tokens)");

  return { text: joined, inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens };
}

// Ported from every script's identical "```json ... ```" stripping.
function stripCodeFence(text: string): string {
  if (!text.startsWith("```")) return text;
  let t = text.slice(3);
  if (t.startsWith("json")) t = t.slice(4);
  return t.replace(/```$/, "").trim();
}

function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error(`no JSON object found in response: ${text}`);
  return text.slice(start, end + 1);
}

function extractJsonArray(text: string): string {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) throw new Error(`no JSON array found in response: ${text}`);
  return text.slice(start, end + 1);
}

function imageContent(screenshotB64: string) {
  return {
    type: "image",
    source: { type: "base64", media_type: "image/png", data: screenshotB64 },
  };
}

async function runKind(
  env: Env,
  body: VisionRequestBody,
): Promise<{ result: unknown; inputTokens: number; outputTokens: number }> {
  let screenshotBytes: Uint8Array | undefined;
  if (body.screenshot) {
    screenshotBytes = decodeScreenshot(body.screenshot);
    if (screenshotBytes.length > MAX_SCREENSHOT_BYTES) throw new Error("Screenshot too large");
  }

  switch (body.kind) {
    // Ported from locate.py's locate_element.
    case "locate": {
      if (!screenshotBytes) throw new Error("screenshot is required for locate");
      const target = truncate(body.target ?? "");
      const { width, height } = pngDimensions(screenshotBytes);
      const contextBlock = body.context
        ? `Context on what this step is trying to accomplish:\n${truncate(body.context)}\n\n`
        : "";
      const prompt =
        `This screenshot is ${width}x${height} pixels.\n\n` +
        contextBlock +
        `Find this UI element: "${target}". ` +
        'Respond with ONLY a JSON object (no other text) in this exact shape: ' +
        '{"x0": int, "y0": int, "x1": int, "y1": int}, ' +
        "where the four values are the pixel coordinates of the element's bounding box " +
        "(top-left and bottom-right corners) in the original image's coordinate space.";
      const { text, inputTokens, outputTokens } = await callClaude(env, {
        maxTokens: 256,
        content: [imageContent(body.screenshot!), { type: "text", text: prompt }],
        timeoutMs: 60_000,
      });
      const box = JSON.parse(stripCodeFence(text));
      if (
        typeof box !== "object" ||
        box === null ||
        !["x0", "y0", "x1", "y1"].every((k) => typeof box[k] === "number")
      ) {
        throw new Error(`expected {x0,y0,x1,y1} ints, got: ${text}`);
      }
      return {
        result: { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1, image_width: width, image_height: height },
        inputTokens,
        outputTokens,
      };
    }

    // Ported from verify.py's verify_outcome.
    case "verify": {
      if (!screenshotBytes) throw new Error("screenshot is required for verify");
      const expected = truncate(body.expected_outcome ?? "");
      const contextBlock = body.context
        ? `Context on what this step is trying to accomplish:\n${truncate(body.context)}\n\n`
        : "";
      const prompt =
        contextBlock +
        "You are checking whether a screenshot now matches an expected state, after the user " +
        "was asked to do something. Look carefully at the actual current values/state visible " +
        "in the screenshot — don't assume it matches just because the right area of the screen " +
        "is visible; read the specific value or content and compare it.\n\n" +
        `Expected: ${expected}\n\n` +
        'Respond with ONLY a JSON object (no other text) in this exact shape: ' +
        '{"matches": true or false, "observed": "the actual value/state you see, as ' +
        'specifically as possible — this is shown to the user next to what was expected, so ' +
        'it needs to stand on its own"}';
      const { text, inputTokens, outputTokens } = await callClaude(env, {
        maxTokens: 400,
        content: [imageContent(body.screenshot!), { type: "text", text: prompt }],
        timeoutMs: 60_000,
      });
      const result = JSON.parse(stripCodeFence(text));
      if (typeof result !== "object" || result === null || !("matches" in result) || !("observed" in result)) {
        throw new Error(`expected {matches, observed}, got: ${text}`);
      }
      return {
        result: { matches: Boolean(result.matches), observed: String(result.observed) },
        inputTokens,
        outputTokens,
      };
    }

    // Ported from identify_app.py's identify_app.
    case "identify_app": {
      if (!screenshotBytes) throw new Error("screenshot is required for identify_app");
      const prompt =
        "Which desktop application is shown in this screenshot?\n\n" +
        'Answer with ONLY a JSON object (no other text) in this exact shape: ' +
        '{"app_name": string|null, "window_title": string|null}.\n\n' +
        "app_name is the application's common product name as a person would say it — " +
        '"Visual Studio Code", "Microsoft Excel", "Blender", "Firefox" — not a process name, ' +
        "package name or window class. window_title is the document, file or page open in it " +
        "if one is visible, otherwise null.\n\n" +
        "Use null for app_name if you cannot tell which single application this is: an empty " +
        "desktop, a wallpaper, or several apps with none clearly in front. Do not guess.";
      const { text, inputTokens, outputTokens } = await callClaude(env, {
        maxTokens: 128,
        content: [imageContent(body.screenshot!), { type: "text", text: prompt }],
        timeoutMs: 60_000,
      });
      const parsed = JSON.parse(stripCodeFence(text));
      return {
        result: { app_name: parsed.app_name || null, window_title: parsed.window_title || null },
        inputTokens,
        outputTokens,
      };
    }

    // Ported from plan_step.py's plan_step. No screenshot — pure text.
    case "plan_step": {
      const goal = truncate(body.goal ?? "");
      const stepTitle = truncate(body.step_title ?? "");
      const stepBrief = truncate(body.step_brief ?? "");
      const watchFor = truncate(body.step_watch_for ?? "");
      const watchForLine = watchFor ? `Watch for: "${watchFor}". ` : "";
      const prompt =
        `A user's overall goal is: "${goal}". They have reached this step in the plan: ` +
        `"${stepTitle}" — ${stepBrief}. ${watchForLine}` +
        "Break this one step into a short ordered sequence of concrete substeps — individual " +
        "clicks, selections, or things to type, the level of detail someone would need to " +
        "actually do it. For each substep, describe the UI element in plain text (not a " +
        "coordinate — you can't see the user's actual screen), give a short instruction, and " +
        "describe what the screen should show once this one substep is actually done — " +
        "specific enough that someone looking at a screenshot could check it without asking " +
        "the user, e.g. a field's approximate value, or specific text/data that should now be " +
        "present. Don't cover other steps in the overall plan, only this one. Respond with " +
        "ONLY a JSON array (no other text), one object per substep, in this exact shape: " +
        '[{"target_description": "plain-text description of the UI element, e.g. \'the Insert ' +
        'tab in the ribbon\'", "instruction_text": "short instruction shown next to the ' +
        'element", "action": "one of: none, click, type, move-cursor, keyboard-shortcut", ' +
        '"expected_outcome": "what the screen should show once this substep is done, e.g. ' +
        "'the Exposure field reads approximately +0.5'\"}, ...]";
      const { text, inputTokens, outputTokens } = await callClaude(env, {
        maxTokens: 2048,
        content: prompt,
        timeoutMs: 60_000,
      });
      const substeps = JSON.parse(extractJsonArray(text));
      const requiredFields = ["target_description", "instruction_text", "action", "expected_outcome"];
      const validActions = new Set(["none", "click", "type", "move-cursor", "keyboard-shortcut"]);
      if (
        !Array.isArray(substeps) ||
        !substeps.every(
          (s) => typeof s === "object" && s !== null && requiredFields.every((f) => f in s) && validActions.has(s.action),
        )
      ) {
        throw new Error(`expected an array of ${requiredFields} objects with a valid action, got: ${text}`);
      }
      return { result: substeps, inputTokens, outputTokens };
    }

    // Ported from answer.py's answer_question. Screenshot optional.
    case "answer": {
      const question = truncate(body.question ?? "");
      const contextBlock = body.context
        ? `Context on the step this question is about:\n${truncate(body.context)}\n\n`
        : "";
      const prompt =
        contextBlock +
        `The user asked this question while following a step-by-step guide: "${question}"\n\n` +
        "Answer directly and concisely — a sentence or two, like a quick reply in a chat, not " +
        "a full tutorial. If a screenshot is attached, use it; otherwise answer from the " +
        "context above alone and say so if the context genuinely isn't enough to answer " +
        'confidently, rather than guessing. Respond with ONLY a JSON object (no other text): ' +
        '{"answer": "your reply"}';
      const content: unknown[] = [{ type: "text", text: prompt }];
      if (body.screenshot) content.unshift(imageContent(body.screenshot));
      const { text, inputTokens, outputTokens } = await callClaude(env, {
        maxTokens: 1024,
        content,
        timeoutMs: 60_000,
      });
      const result = JSON.parse(stripCodeFence(text));
      if (typeof result !== "object" || result === null || !("answer" in result)) {
        throw new Error(`expected {answer}, got: ${text}`);
      }
      return { result: { answer: String(result.answer) }, inputTokens, outputTokens };
    }

    // Ported from research.py's research_goal. No screenshot; uses web search.
    case "research": {
      const goal = truncate(body.goal ?? "");
      const appClause = body.app_name ? `in "${truncate(body.app_name)}"` : "in some application";
      const prompt =
        `A user wants to do this ${appClause}: "${goal}". Research the current, correct way to ` +
        "do this (the UI may have changed since your training — use web search if that helps). " +
        "Break it into an ordered list of coarse top-level steps — not individual clicks, just " +
        "the major phases someone would move through. For each step, also note anything you " +
        "learned that's true regardless of the user's specific screen — a UI-version caveat, a " +
        "common pitfall, an easy-to-miss detail. Don't guess at exact on-screen positions or " +
        "wording; that depends on the user's actual screen and isn't something this research " +
        "pass can know. Also write a short, specific title for this whole chat — the same idea " +
        "as how ChatGPT titles a conversation: a few words describing the goal, not a " +
        "restatement of the user's literal question. Respond with ONLY a JSON object (no other " +
        'text), in this exact shape: {"title": "short description of the goal, e.g. Add a ' +
        'Bulleted List in Google Docs", "steps": [{"title": "short step name", "brief": "one ' +
        'sentence on what this step accomplishes and why", "watch_for": "a caveat or pitfall ' +
        'worth flagging up front, or \\"\\" if none"}, ...]}';
      const { text, inputTokens, outputTokens } = await callClaude(env, {
        maxTokens: 4096,
        content: prompt,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 2 }],
        timeoutMs: 90_000,
      });
      // web_search inserts <cite ...>...</cite> markup around sourced
      // claims — harmless in prose but leaks into field values once
      // parsed as JSON (research.py's identical fix).
      const cleaned = text.replace(/<\/?cite[^>]*>/g, "");
      const result = JSON.parse(extractJsonObject(cleaned));
      const steps = result?.steps;
      const stepFields = ["title", "brief", "watch_for"];
      if (
        typeof result !== "object" ||
        typeof result.title !== "string" ||
        !result.title.trim() ||
        !Array.isArray(steps) ||
        !steps.every((s) => typeof s === "object" && s !== null && stepFields.every((f) => f in s))
      ) {
        throw new Error(`expected {title, steps: [{${stepFields}}]}, got: ${cleaned}`);
      }
      return { result, inputTokens, outputTokens };
    }
  }
}

export async function handleVision(
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "Vision is not configured" }, 503);
  }

  const member = await membershipFromBearer(auth, request, env.DB);
  if (!member) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { success } = await env.VISION_LIMITER.limit({ key: `vision:${member.user_id}` });
  if (!success) {
    return json({ error: "Too many requests" }, 429);
  }

  const ceiling = visionCeilingMicroUsdFor(member.plan);
  if (ceiling !== null) {
    const used = await visionCostUsedMicroUsd(env.DB, member.user_id);
    if (used >= ceiling) {
      return json(
        { error: `Monthly vision quota used up ($${(ceiling / 1_000_000).toFixed(2)} cap) — resets next month.` },
        403,
      );
    }
  }

  let body: VisionRequestBody;
  try {
    body = await request.json<VisionRequestBody>();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const validKinds: VisionKind[] = ["locate", "verify", "identify_app", "plan_step", "answer", "research"];
  if (!validKinds.includes(body.kind)) {
    return json({ error: `kind must be one of ${validKinds.join(", ")}` }, 400);
  }

  try {
    const { result, inputTokens, outputTokens } = await runKind(env, body);

    await env.DB.prepare("INSERT INTO vision_calls (user_id, kind, cost_micro_usd) VALUES (?, ?, ?)")
      .bind(member.user_id, body.kind, costMicroUsd(inputTokens, outputTokens))
      .run();

    return json(result);
  } catch (err) {
    console.error("vision call failed", body.kind, err);
    return json({ error: err instanceof Error ? err.message : "Vision request failed" }, 502);
  }
}
