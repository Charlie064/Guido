import {
  type Env,
  canSaveSkills,
  corsHeaders,
  countSkillRuns,
  includedFor,
  json,
  membershipFromBearer,
  remainingFor,
  voiceSecondsUsed,
} from "./auth";
import { createAuth } from "./better-auth";
import {
  accessEmailLabel,
  csvResponse,
  fetchWaitlist,
  htmlResponse,
  loadErrorResponse,
  waitlistCsv,
  waitlistHtml,
} from "./internal-waitlist";
import { handleVision, visionCeilingMicroUsdFor } from "./vision";
import { handleVoiceTranscribe, voiceCapSecondsFor } from "./voice";

export type { Env };

function bytesToBase64Url(buf: Uint8Array): string {
  let binary = "";
  for (const byte of buf) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomUrlToken(byteCount = 32): string {
  const buf = new Uint8Array(byteCount);
  crypto.getRandomValues(buf);
  return bytesToBase64Url(buf);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === "/api/waitlist" && request.method === "POST") {
      return handleWaitlistSignup(request, env);
    }
    if (url.pathname === "/api/geo" && request.method === "GET") {
      // Cloudflare sets request.cf.country from the connecting IP.
      // Empty on some local wrangler sessions — the page falls back.
      const country = request.cf?.country ?? "";
      return json({ country });
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
      url.pathname === "/api/voice/transcribe" ||
      url.pathname === "/api/vision"
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
    if (url.pathname === "/api/vision" && request.method === "POST") {
      const auth = createAuth(env, url.origin);
      return handleVision(request, env, auth);
    }

    // Internal waitlist admin. Localhost is open. On a public hostname
    // the Worker 404s unless Cloudflare Access set the user-email header.
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/internal/waitlist" && request.method === "GET") {
      if (!allowInternalWaitlist(request)) return notFound();
      return handleInternalWaitlist(request, env);
    }
    if (path === "/internal/waitlist/export" && request.method === "GET") {
      if (!allowInternalWaitlist(request)) return notFound();
      return handleInternalWaitlistExport(env);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

const WAITLIST_APPS = new Set([
  "excel",
  "word",
  "notion",
  "adobe",
  "davinci",
  "cad",
  "blender",
]);

const WAITLIST_ROLES = new Set([
  "university_student",
  "young_professional",
  "high_school_student",
  "entrepreneur",
  "creative",
  "other",
]);

function waitlistReferralUrl(code: string): string {
  return `https://guidotutor.com/waitlist?ref=${encodeURIComponent(code)}`;
}

async function waitlistPosition(db: D1Database, id: number): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM waitlist WHERE id <= ?")
    .bind(id)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

async function ensureReferralCode(db: D1Database, id: number, existing: string | null): Promise<string> {
  if (existing) return existing;
  const code = randomUrlToken(6);
  await db.prepare("UPDATE waitlist SET referral_code = ? WHERE id = ?").bind(code, id).run();
  return code;
}

async function handleWaitlistSignup(request: Request, env: Env): Promise<Response> {
  let body: {
    email?: string;
    name?: string;
    apps?: unknown;
    appsOther?: string;
    role?: string;
    ref?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid email" }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const appsOther = typeof body.appsOther === "string" ? body.appsOther.trim() : "";
  const role = typeof body.role === "string" ? body.role.trim() : "";
  const ref = typeof body.ref === "string" ? body.ref.trim() : "";
  const apps = Array.isArray(body.apps)
    ? [...new Set(body.apps.filter((app): app is string => typeof app === "string" && WAITLIST_APPS.has(app)))]
    : [];

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Invalid email" }, 400);
  }
  if (!name || name.length > 80) {
    return json({ error: "Name is required" }, 400);
  }
  if (apps.length === 0 && !appsOther) {
    return json({ error: "Pick at least one app, or tell us something else" }, 400);
  }
  if (appsOther.length > 280) {
    return json({ error: "That note is a bit long" }, 400);
  }
  if (role && !WAITLIST_ROLES.has(role)) {
    return json({ error: "Pick who you are" }, 400);
  }

  const existing = await env.DB.prepare(
    "SELECT id, referral_code FROM waitlist WHERE email = ?",
  )
    .bind(email)
    .first<{ id: number; referral_code: string | null }>();

  if (existing) {
    const code = await ensureReferralCode(env.DB, existing.id, existing.referral_code);
    return json({
      ok: true,
      alreadyJoined: true,
      position: await waitlistPosition(env.DB, existing.id),
      referralCode: code,
      referralUrl: waitlistReferralUrl(code),
    });
  }

  let referredBy: string | null = null;
  if (ref) {
    const referrer = await env.DB.prepare("SELECT referral_code FROM waitlist WHERE referral_code = ?")
      .bind(ref)
      .first<{ referral_code: string }>();
    if (referrer) referredBy = referrer.referral_code;
  }

  const referralCode = randomUrlToken(6);
  try {
    const inserted = await env.DB.prepare(
      `INSERT INTO waitlist (email, name, apps, apps_other, role, referral_code, referred_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(email, name, JSON.stringify(apps), appsOther || null, role || null, referralCode, referredBy)
      .run();
    const id = Number(inserted.meta.last_row_id);
    return json({
      ok: true,
      alreadyJoined: false,
      position: await waitlistPosition(env.DB, id),
      referralCode,
      referralUrl: waitlistReferralUrl(referralCode),
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      const again = await env.DB.prepare("SELECT id, referral_code FROM waitlist WHERE email = ?")
        .bind(email)
        .first<{ id: number; referral_code: string | null }>();
      if (again) {
        const code = await ensureReferralCode(env.DB, again.id, again.referral_code);
        return json({
          ok: true,
          alreadyJoined: true,
          position: await waitlistPosition(env.DB, again.id),
          referralCode: code,
          referralUrl: waitlistReferralUrl(code),
        });
      }
    }
    return json({ error: "Could not save signup" }, 500);
  }
}

async function handleMe(request: Request, env: Env): Promise<Response> {
  const auth = createAuth(env, new URL(request.url).origin);
  const member = await membershipFromBearer(auth, request, env.DB);
  if (!member) {
    return json({ error: "Unauthorized" }, 401);
  }

  const used = await countSkillRuns(env.DB, member.user_id, member.plan);
  const voiceUsed = await voiceSecondsUsed(env.DB, member.user_id, member.plan);
  return json({
    email: member.email,
    plan: member.plan,
    status: member.status,
    skills_remaining: remainingFor(member.plan, used),
    skills_included: includedFor(member.plan),
    can_save_skills: canSaveSkills(member.plan),
    voice_seconds_used: voiceUsed,
    voice_seconds_included: voiceCapSecondsFor(member.plan),
  });
}

function allowInternalWaitlist(request: Request): boolean {
  const host = new URL(request.url).hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
  return Boolean(request.headers.get("Cf-Access-Authenticated-User-Email")?.trim());
}

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

async function handleInternalWaitlist(request: Request, env: Env): Promise<Response> {
  try {
    const snapshot = await fetchWaitlist(env.DB);
    return htmlResponse(waitlistHtml(snapshot, accessEmailLabel(request)));
  } catch (err) {
    console.error("internal waitlist failed", err);
    return loadErrorResponse();
  }
}

async function handleInternalWaitlistExport(env: Env): Promise<Response> {
  try {
    const snapshot = await fetchWaitlist(env.DB);
    return csvResponse(waitlistCsv(snapshot));
  } catch (err) {
    console.error("internal waitlist export failed", err);
    return loadErrorResponse();
  }
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
