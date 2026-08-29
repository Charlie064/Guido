export type Plan = "free" | "starter" | "plus" | "owner";
export type MembershipStatus = "active" | "expired";

// The Workers rate-limiting binding. Declared here rather than pulled in
// from @cloudflare/workers-types, which this project doesn't install —
// the worker's .ts is bundled by esbuild, which strips types without
// checking them, so the ambient globals below (Fetcher, D1Database) are
// already unchecked and one more local shape costs nothing.
export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  // Set with `wrangler secret put ANTHROPIC_API_KEY` — never in `vars`,
  // never in the repo, and never shipped to the desktop app. The whole
  // point of /api/vision is that this value exists on exactly one machine.
  ANTHROPIC_API_KEY?: string;
  VISION_LIMITER: RateLimit;
}

export interface MembershipRow {
  email: string;
  plan: Plan;
  status: MembershipStatus;
  user_id: number;
}

export function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: corsHeaders() });
}

export function includedFor(plan: Plan): number | null {
  if (plan === "owner") return null;
  if (plan === "free") return 5;
  return 30;
}

export function canSaveSkills(plan: Plan): boolean {
  return plan === "plus" || plan === "owner";
}

export function parseLoopback(raw: string | null): string | null {
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:") return null;
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") return null;
  if (parsed.pathname !== "/callback") return null;
  return `${parsed.origin}${parsed.pathname}`;
}

function bytesToBase64Url(buf: Uint8Array): string {
  let binary = "";
  for (const byte of buf) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Base64Url(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return bytesToBase64Url(new Uint8Array(hash));
}

export function randomUrlToken(byteCount = 32): string {
  const buf = new Uint8Array(byteCount);
  crypto.getRandomValues(buf);
  return bytesToBase64Url(buf);
}

export async function countSkillRuns(
  db: D1Database,
  userId: number,
  plan: Plan,
): Promise<number> {
  if (plan === "free") {
    const row = await db
      .prepare("SELECT COUNT(*) AS n FROM skill_runs WHERE user_id = ?")
      .bind(userId)
      .first<{ n: number }>();
    return Number(row?.n ?? 0);
  }
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM skill_runs WHERE user_id = ? AND created_at >= date('now', 'start of month')",
    )
    .bind(userId)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

export function remainingFor(plan: Plan, used: number): number | null {
  const included = includedFor(plan);
  if (included === null) return null;
  return Math.max(0, included - used);
}

export async function membershipFromBearer(
  request: Request,
  db: D1Database,
): Promise<MembershipRow | null> {
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return null;

  return db
    .prepare(
      `SELECT users.id AS user_id, users.email AS email, memberships.plan AS plan, memberships.status AS status
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       JOIN memberships ON memberships.user_id = users.id
       WHERE sessions.token = ? AND sessions.expires_at > datetime('now') AND memberships.status = 'active'`,
    )
    .bind(match[1])
    .first<MembershipRow>();
}
