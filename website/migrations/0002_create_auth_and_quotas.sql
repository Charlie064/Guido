-- Better Auth's own tables (email+password + bearer-token sessions — see
-- docs/planning/login-membership-plan.md and worker/better-auth.ts).
-- Generated from worker/db/schema.ts via `npx drizzle-kit generate`, hand-
-- copied here rather than adopting drizzle-kit's own migration journal:
-- this project's migrations already live under wrangler's `wrangler d1
-- migrations apply` (see package.json's db:migrate:* scripts), and mixing
-- two migration-tracking systems for one database isn't worth it.
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);

CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);

CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	-- Distinguishes a local email+password credential from a linked OAuth
	-- account sharing the same accountId/providerId shape — required by
	-- better-auth 1.7.x's account model, newer than what
	-- `@better-auth/cli generate` (stuck at 1.5.0-beta) knows to emit.
	`issuer` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);
CREATE UNIQUE INDEX `account_issuer_accountId_idx` ON `account` (`issuer`,`account_id`);

CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);

-- Membership tiers: docs/business/pricing.md. Not a Better Auth concern,
-- so it's our own table, keyed on Better Auth's `user.id` (text) rather
-- than the integer id the earlier Google-only schema used.
CREATE TABLE `memberships` (
	`user_id` text PRIMARY KEY NOT NULL,
	`plan` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `skill_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	-- Always 1 today (pricing.md's flat per-skill charge) — a column, not
	-- a hardcoded COUNT(*), so a future variable-cost skill doesn't need a
	-- schema change. See countSkillRuns in worker/auth.ts.
	`cost` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `skill_runs_user_created` ON `skill_runs` (`user_id`,`created_at`);
