import {
  type Env,
  canSaveSkills,
  corsHeaders,
  countSkillRuns,
  includedFor,
  json,
  membershipFromBearer,
  monthlyVoiceSecondsUsed,
  remainingFor,
} from "./auth";
import { createAuth } from "./better-auth";
import { handleVoiceTranscribe, MONTHLY_CAP_SECONDS } from "./voice";

export type { Env };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === "/api/waitlist" && request.method === "POST") {
      return handleWaitlistSignup(request, env);
    }

    // Better Auth signs/encrypts session tokens with this secret — refuse
    // to run any auth-touching route rather than let Better Auth silently
    // fall back to its publicly-known default (see the comment on
    // `secret` in worker/better-auth.ts for why its own production check
    // doesn't catch this on Workers).
    if (
      url.pathname.startsWith("/api/auth/") ||
      url.pathname === "/api/me" ||
      url.pathname === "/api/skills/start" ||
      url.pathname === "/api/voice/transcribe"
    ) {
      if (!env.BETTER_AUTH_SECRET) {
        return json({ error: "Auth is not configured on this Worker" }, 500);
      }
    }

    // Better Auth owns everything under /api/auth/* — sign-up, sign-in,
    // sign-out, session refresh. See worker/better-auth.ts.
    if (url.pathname.startsWith("/api/auth/")) {
      const auth = createAuth(env, url.origin);
      const authRes = await auth.handler(request);
      // Better Auth's own response carries no CORS headers — fine for a
      // same-origin browser tab, but the desktop app's webview is a
      // cross-origin caller (tauri://localhost) and its fetch() throws a
      // generic "Load failed" without these, even though the request
      // itself succeeded server-side (curl-only testing won't catch
      // this, since curl doesn't enforce CORS). trustedOrigins already
      // gates which origins Better Auth accepts; this just lets the
      // browser hand the response back to that caller.
      const headers = new Headers(authRes.headers);
      for (const [key, value] of Object.entries(corsHeaders())) {
        headers.set(key, value);
      }
      return new Response(authRes.body, { status: authRes.status, headers });
    }

    if (url.pathname === "/api/me" && request.method === "GET") {
      return handleMe(request, env);
    }
    if (url.pathname === "/api/skills/start" && request.method === "POST") {
      return handleSkillStart(request, env);
    }
    if (url.pathname === "/api/voice/transcribe" && request.method === "POST") {
      const auth = createAuth(env, url.origin);
      return handleVoiceTranscribe(request, env, auth);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

const PERSONAS = new Set([
  "uni_student",
  "young_professional",
  "high_school_student",
  "entrepreneur",
  "other",
]);

async function handleWaitlistSignup(request: Request, env: Env): Promise<Response> {
  let email: string | undefined;
  let name: string | undefined;
  let phone: string | null | undefined;
  let persona: string | null | undefined;
  try {
    ({ email, name, phone, persona } = await request.json<{
      email?: string;
      name?: string;
      phone?: string | null;
      persona?: string | null;
    }>());
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Invalid email" }, 400);
  }
  if (!name || !name.trim()) {
    return json({ error: "Name is required" }, 400);
  }
  if (persona && !PERSONAS.has(persona)) {
    return json({ error: "Invalid persona" }, 400);
  }

  try {
    await env.DB.prepare(
      "INSERT INTO waitlist (email, name, phone, persona) VALUES (?, ?, ?, ?)",
    )
      .bind(email, name.trim(), phone?.trim() || null, persona || null)
      .run();
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes("UNIQUE")) {
      return json({ error: "Could not save signup" }, 500);
    }
  }

  return json({ ok: true });
}

async function handleMe(request: Request, env: Env): Promise<Response> {
  const auth = createAuth(env, new URL(request.url).origin);
  const member = await membershipFromBearer(auth, request, env.DB);
  if (!member) {
    return json({ error: "Unauthorized" }, 401);
  }

  const used = await countSkillRuns(env.DB, member.user_id, member.plan);
  // Same flat cap for every plan (voice.ts) — not a per-plan allowance
  // like skills, so no includedFor-style lookup needed here.
  const voiceSecondsUsed = await monthlyVoiceSecondsUsed(env.DB, member.user_id);
  return json({
    email: member.email,
    plan: member.plan,
    status: member.status,
    skills_remaining: remainingFor(member.plan, used),
    skills_included: includedFor(member.plan),
    can_save_skills: canSaveSkills(member.plan),
    voice_seconds_used: voiceSecondsUsed,
    voice_seconds_included: MONTHLY_CAP_SECONDS,
  });
}

async function handleSkillStart(request: Request, env: Env): Promise<Response> {
  const auth = createAuth(env, new URL(request.url).origin);
  const member = await membershipFromBearer(auth, request, env.DB);
  if (!member) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Defaults to 1 (pricing.md's flat per-skill charge) — see the `cost`
  // comment on skill_runs (worker/db/schema.ts). Clamped to a sane range
  // so a malformed/malicious body can't zero out or blow up a user's
  // quota in one call.
  let cost = 1;
  try {
    const body = await request.json<{ cost?: number }>();
    if (typeof body.cost === "number" && Number.isInteger(body.cost) && body.cost > 0) {
      cost = Math.min(body.cost, 1000);
    }
  } catch {
    // No body / not JSON — fine, cost stays 1.
  }

  const used = await countSkillRuns(env.DB, member.user_id, member.plan);
  const remaining = remainingFor(member.plan, used);
  if (remaining !== null && cost > remaining) {
    return json(
      {
        error: "Skill quota reached",
        skills_remaining: remaining,
        skills_included: includedFor(member.plan),
        can_save_skills: canSaveSkills(member.plan),
      },
      403,
    );
  }

  await env.DB.prepare("INSERT INTO skill_runs (user_id, cost) VALUES (?, ?)")
    .bind(member.user_id, cost)
    .run();
  const nextUsed = used + cost;
  return json({
    ok: true,
    plan: member.plan,
    skills_remaining: remainingFor(member.plan, nextUsed),
    skills_included: includedFor(member.plan),
    can_save_skills: canSaveSkills(member.plan),
  });
}
