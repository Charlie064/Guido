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
  // Set once the user has ever started a Stripe Checkout — lets the
  // webhook (worker/index.ts) and the billing-portal route find the
  // right Stripe Customer without storing it anywhere else.
  stripeCustomerId: text("stripe_customer_id").unique(),
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
  createdAt: text("created_at")
    .default(sql`(datetime('now'))`)
    .notNull(),
});
