import { type Env, json, membershipFromBearer, type Plan, voiceSecondsUsed } from "./auth";
import type { createAuth } from "./better-auth";

// Speech-to-text via Aqua Voice's Avalon API — see docs/features/voice.md.
// The desktop app never holds AQUA_VOICE_API_KEY: it used to (a local
// .env + a Python subprocess, see git history), which only worked for one
// developer's own machine — anything shipped in the app bundle is
// extractable, and a key with no per-user accounting means one customer's
// runaway usage spends everyone's budget. This route is the replacement:
// the key lives only as a Worker secret, every request is authenticated
// against the existing Better Auth session, and usage is metered per user
// in D1 rather than trusted client-side (the old localStorage cap could
// be cleared by anyone).

const AQUA_TRANSCRIBE_URL = "https://api.aquavoice.com/v1/audio/transcriptions";
const AQUA_MODEL = "avalon-v1.5";

// Aqua bills $0.39/hour, per second, with a 10s minimum per clip — see
// spikes/vision-detect (pre-proxy implementation, kept for reference in
// git history). $2/month flat for paid plans: a cost-control measure
// against runaway usage, not a metered product tier like skill_runs — see
// voiceSecondsUsed's comment (auth.ts).
const AQUA_RATE_PER_HOUR_USD = 0.39;
// Exported so handleMe (index.ts) can report remaining voice budget
// alongside skills_remaining, without duplicating the $/rate math.
export const MONTHLY_CAP_USD = 2;
export const MONTHLY_CAP_SECONDS = (MONTHLY_CAP_USD / AQUA_RATE_PER_HOUR_USD) * 3600;

// Free plan gets one lifetime trial clip, capped to a minute — matches the
// client's own MAX_RECORDING_SECONDS auto-stop, so a free user never sees
// their one shot cut short by a server cap tighter than the UI already
// promised. Mirrors includedFor's free-tier "1 new skill, lifetime" shape
// (auth.ts) rather than the paid plans' recurring $ cap.
export const FREE_TRIAL_SECONDS = 60;

export function voiceCapSecondsFor(plan: Plan): number {
  return plan === "free" ? FREE_TRIAL_SECONDS : MONTHLY_CAP_SECONDS;
}

// Bounds the upload before it reaches Aqua. A goal/follow-up dictation is
// seconds long; 60s of webm/opus audio is well under 2 MB, so 5 MB leaves
// generous headroom without letting a client push an arbitrarily long (and
// arbitrarily expensive) recording through on our budget. Matches the
// client-side MAX_RECORDING_SECONDS auto-stop in sidebar.js — this is the
// real backstop, that's just the UX for it.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_DURATION_SECONDS = 120;

export async function handleVoiceTranscribe(request: Request, env: Env, auth: ReturnType<typeof createAuth>): Promise<Response> {
  if (!env.AQUA_VOICE_API_KEY) {
    return json({ error: "Voice input is not configured" }, 503);
  }

  const member = await membershipFromBearer(auth, request, env.DB);
  if (!member) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Per-user, not per-IP — same reasoning as /api/vision's rate limiter.
  const { success } = await env.VOICE_LIMITER.limit({ key: `voice:${member.user_id}` });
  if (!success) {
    return json({ error: "Too many requests" }, 429);
  }

  const used = await voiceSecondsUsed(env.DB, member.user_id, member.plan);
  const cap = voiceCapSecondsFor(member.plan);
  if (used >= cap) {
    const message =
      member.plan === "free"
        ? "Free voice trial used up — upgrade for more, or type your goal instead."
        : `Monthly voice quota used up ($${MONTHLY_CAP_USD} cap) — resets next month, or type your goal instead.`;
    return json({ error: message }, 403);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) && !(audio instanceof Blob)) {
    return json({ error: "audio file is required" }, 400);
  }
  if (audio.size > MAX_UPLOAD_BYTES) {
    return json({ error: "Recording too large" }, 413);
  }

  // Client-reported clip length, used only for the usage log below — the
  // real cost bound is MAX_UPLOAD_BYTES above, since a lied-about duration
  // can't make Aqua charge us for bytes we didn't actually send. Clamped
  // the same way the old client-side cap clamped it (10s Aqua minimum,
  // MAX_DURATION_SECONDS ceiling matching the client's auto-stop).
  const reportedDuration = Number(form.get("duration_seconds"));
  const durationSeconds = Math.min(Math.max(Number.isFinite(reportedDuration) ? reportedDuration : 10, 10), MAX_DURATION_SECONDS);

  const aquaForm = new FormData();
  aquaForm.set("model", AQUA_MODEL);
  aquaForm.set("file", audio, "clip");

  let aquaResponse: Response;
  try {
    aquaResponse = await fetch(AQUA_TRANSCRIBE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.AQUA_VOICE_API_KEY}` },
      body: aquaForm,
    });
  } catch (err) {
    console.error("aqua voice request failed", err);
    return json({ error: "Voice request failed" }, 502);
  }

  if (!aquaResponse.ok) {
    // Aqua's error body can carry account/billing detail that the desktop
    // client has no business seeing — log it, return a flat shape.
    console.error("aqua voice error", aquaResponse.status, await aquaResponse.text().catch(() => ""));
    if (aquaResponse.status === 429) {
      return json({ error: "Voice service is busy, try again in a moment" }, 503);
    }
    return json({ error: "Voice request failed" }, 502);
  }

  const result = await aquaResponse.json<{ text?: string }>();
  const text = (result.text ?? "").trim();

  await env.DB.prepare("INSERT INTO voice_transcriptions (user_id, duration_seconds) VALUES (?, ?)")
    .bind(member.user_id, durationSeconds)
    .run();

  return json({ text });
}
