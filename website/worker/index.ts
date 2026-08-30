import {
  type Env,
  canSaveSkills,
  corsHeaders,
  countSkillRuns,
  includedFor,
  json,
  membershipFromBearer,
  parseLoopback,
  randomUrlToken,
  remainingFor,
  sha256Base64Url,
} from "./auth";
import {
  accessEmailLabel,
  csvResponse,
  fetchWaitlist,
  htmlResponse,
  loadErrorResponse,
  waitlistCsv,
  waitlistHtml,
} from "./internal-waitlist";

export type { Env };

function loginRedirect(origin: string, error: string): Response {
  const dest = new URL("/login", origin);
  dest.searchParams.set("error", error);
  return Response.redirect(dest.toString(), 302);
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
    if (url.pathname === "/auth/google/start" && request.method === "GET") {
      return handleGoogleStart(env, url);
    }
    if (url.pathname === "/auth/google/callback" && request.method === "GET") {
      return handleGoogleCallback(env, url);
    }
    if (url.pathname === "/api/me" && request.method === "GET") {
      return handleMe(request, env);
    }
    if (url.pathname === "/api/skills/start" && request.method === "POST") {
      return handleSkillStart(request, env);
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

async function handleGoogleStart(env: Env, url: URL): Promise<Response> {
  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return loginRedirect(url.origin, "not_configured");
  }

  const loopback = parseLoopback(url.searchParams.get("loopback"));
  if (!loopback) {
    return loginRedirect(url.origin, "desktop_only");
  }

  const state = randomUrlToken(24);
  const codeVerifier = randomUrlToken(32);
  const codeChallenge = await sha256Base64Url(codeVerifier);

  await env.DB.prepare(
    "INSERT INTO oauth_pending (state, code_verifier, loopback_url, expires_at) VALUES (?, ?, ?, datetime('now', '+10 minutes'))",
  )
    .bind(state, codeVerifier, loopback)
    .run();

  const redirectUri = `${url.origin}/auth/google/callback`;
  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  google.searchParams.set("client_id", clientId);
  google.searchParams.set("redirect_uri", redirectUri);
  google.searchParams.set("response_type", "code");
  google.searchParams.set("scope", "openid email");
  google.searchParams.set("state", state);
  google.searchParams.set("code_challenge", codeChallenge);
  google.searchParams.set("code_challenge_method", "S256");

  return Response.redirect(google.toString(), 302);
}

async function handleGoogleCallback(env: Env, url: URL): Promise<Response> {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return loginRedirect(url.origin, "not_configured");
  }

  const error = url.searchParams.get("error");
  if (error) {
    return loginRedirect(url.origin, "google");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return loginRedirect(url.origin, "missing_code");
  }

  const pending = await env.DB.prepare(
    "SELECT code_verifier, loopback_url FROM oauth_pending WHERE state = ? AND expires_at > datetime('now')",
  )
    .bind(state)
    .first<{ code_verifier: string; loopback_url: string }>();

  if (!pending) {
    return loginRedirect(url.origin, "expired");
  }

  await env.DB.prepare("DELETE FROM oauth_pending WHERE state = ?").bind(state).run();

  const redirectUri = `${url.origin}/auth/google/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: pending.code_verifier,
    }),
  });

  if (!tokenRes.ok) {
    return loginRedirect(url.origin, "token");
  }

  const tokens = await tokenRes.json<{ access_token?: string }>();
  if (!tokens.access_token) {
    return loginRedirect(url.origin, "token");
  }

  const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userRes.ok) {
    return loginRedirect(url.origin, "profile");
  }

  const profile = await userRes.json<{ sub?: string; email?: string }>();
  if (!profile.sub || !profile.email) {
    return loginRedirect(url.origin, "profile");
  }

  const existing = await env.DB.prepare("SELECT id FROM users WHERE google_sub = ?")
    .bind(profile.sub)
    .first<{ id: number }>();

  let userId: number;
  if (existing) {
    userId = existing.id;
    await env.DB.prepare("UPDATE users SET email = ? WHERE id = ?").bind(profile.email, userId).run();
  } else {
    const inserted = await env.DB.prepare("INSERT INTO users (google_sub, email) VALUES (?, ?)")
      .bind(profile.sub, profile.email)
      .run();
    userId = Number(inserted.meta.last_row_id);
    await env.DB.prepare("INSERT INTO memberships (user_id, plan, status) VALUES (?, 'free', 'active')")
      .bind(userId)
      .run();
  }

  const sessionToken = randomUrlToken(32);
  await env.DB.prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))",
  )
    .bind(sessionToken, userId)
    .run();

  const dest = new URL(pending.loopback_url);
  dest.searchParams.set("token", sessionToken);
  return Response.redirect(dest.toString(), 302);
}

async function handleMe(request: Request, env: Env): Promise<Response> {
  const member = await membershipFromBearer(request, env.DB);
  if (!member) {
    return json({ error: "Unauthorized" }, 401);
  }

  const used = await countSkillRuns(env.DB, member.user_id, member.plan);
  return json({
    email: member.email,
    plan: member.plan,
    status: member.status,
    skills_remaining: remainingFor(member.plan, used),
    skills_included: includedFor(member.plan),
    can_save_skills: canSaveSkills(member.plan),
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
  const member = await membershipFromBearer(request, env.DB);
  if (!member) {
    return json({ error: "Unauthorized" }, 401);
  }

  const used = await countSkillRuns(env.DB, member.user_id, member.plan);
  const remaining = remainingFor(member.plan, used);
  if (remaining === 0) {
    return json(
      {
        error: "Skill quota reached",
        skills_remaining: 0,
        skills_included: includedFor(member.plan),
        can_save_skills: canSaveSkills(member.plan),
      },
      403,
    );
  }

  await env.DB.prepare("INSERT INTO skill_runs (user_id) VALUES (?)").bind(member.user_id).run();
  const nextUsed = used + 1;
  return json({
    ok: true,
    plan: member.plan,
    skills_remaining: remainingFor(member.plan, nextUsed),
    skills_included: includedFor(member.plan),
    can_save_skills: canSaveSkills(member.plan),
  });
}
