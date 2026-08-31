import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

export * from "./auth-schema";

// Membership tiers: docs/business/pricing.md. Kept as our own table
// (Better Auth owns `user`/`session`/`account`/`verification` only — see
// docs/planning/login-membership-plan.md) rather than a Better Auth
// plugin, since plan/quota logic is product-specific, not an auth concern.
export const memberships = sqliteTable("memberships", {
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
    .primaryKey(),
  plan: text("plan").notNull(), // 'free' | 'starter' | 'plus' | 'owner'
  status: text("status").notNull(), // 'active' | 'expired'
  updatedAt: text("updated_at")
    .default(sql`(datetime('now'))`)
    .notNull(),
});

export const skillRuns = sqliteTable(
  "skill_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Always 1 today (pricing.md's flat per-skill charge) — a column, not
    // a hardcoded COUNT(*), so a future variable-cost skill doesn't need
    // a schema change. See countSkillRuns in worker/auth.ts.
    cost: integer("cost").notNull().default(1),
    createdAt: text("created_at")
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (table) => [index("skill_runs_user_created").on(table.userId, table.createdAt)],
);

export const waitlist = sqliteTable("waitlist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  // name/phone/persona: 0003_add_waitlist_profile_fields.sql. apps/
  // appsOther/role/referralCode/referredBy: 0006_waitlist_apps_and_referral.sql
  // (renumbered from glass-waitlist's 0004 — see
  // docs/planning/glass-waitlist-integration.md). This table definition
  // had drifted behind both migrations before this change; brought
  // current while touching it, not a behavior change on its own.
  name: text("name"),
  phone: text("phone"),
  persona: text("persona"),
  apps: text("apps"),
  appsOther: text("apps_other"),
  role: text("role"),
  referralCode: text("referral_code").unique(),
  referredBy: text("referred_by"),
  createdAt: text("created_at")
    .default(sql`(datetime('now'))`)
    .notNull(),
});
