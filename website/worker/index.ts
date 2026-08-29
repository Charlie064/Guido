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
