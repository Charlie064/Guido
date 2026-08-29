import type { createAuth } from "./better-auth";

export type Plan = "free" | "starter" | "plus" | "owner";
export type MembershipStatus = "active" | "expired";

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  OWNER_EMAILS?: string;
}

export interface MembershipRow {
  user_id: string;
  email: string;
  plan: Plan;
  status: MembershipStatus;
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
  // Free: 1 new skill, lifetime — changed 2026-08-29 from the 5 docs/business/pricing.md
  // originally specified, at Charlie's request. Update that doc's "Is 5 a
  // reasonable free trial?" section to match if this sticks.
  if (plan === "free") return 1;
  return 30;
}

export function canSaveSkills(plan: Plan): boolean {
  return plan === "plus" || plan === "owner";
}

// Sums `cost` rather than counting rows: pricing.md's canonical model
// charges a flat 1 per new skill (no per-step/per-locate metering, so
// every /api/skills/start call today passes cost=1) — the column exists
// so a future variable-cost skill doesn't need a schema change, not
// because anything charges more than 1 yet.
export async function countSkillRuns(
  db: D1Database,
  userId: string,
  plan: Plan,
): Promise<number> {
  if (plan === "free") {
    const row = await db
      .prepare("SELECT COALESCE(SUM(cost), 0) AS n FROM skill_runs WHERE user_id = ?")
      .bind(userId)
      .first<{ n: number }>();
    return Number(row?.n ?? 0);
  }
  const row = await db
    .prepare(
      "SELECT COALESCE(SUM(cost), 0) AS n FROM skill_runs WHERE user_id = ? AND created_at >= date('now', 'start of month')",
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

// Validates the `Authorization: Bearer <token>` header via Better Auth's
// own session lookup (the bearer plugin — see better-auth.ts), then joins
// to our own `memberships` table by the session's user id. Returns null
// for a missing/expired/invalid token or a user with no active
// membership row, same as the old Google-only membershipFromBearer did.
export async function membershipFromBearer(
  auth: ReturnType<typeof createAuth>,
  request: Request,
  db: D1Database,
): Promise<MembershipRow | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;

  const row = await db
    .prepare("SELECT plan, status FROM memberships WHERE user_id = ? AND status = 'active'")
    .bind(session.user.id)
    .first<{ plan: Plan; status: MembershipStatus }>();
  if (!row) return null;

  return { user_id: session.user.id, email: session.user.email, plan: row.plan, status: row.status };
}
