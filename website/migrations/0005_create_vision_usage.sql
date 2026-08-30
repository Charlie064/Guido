-- Claude vision-proxy usage log — see docs/features/vision.md and
-- worker/vision.ts. One row per call, `cost_micro_usd` computed from the
-- real `usage.input_tokens`/`output_tokens` Anthropic returned (see
-- MODEL_PRICING_MICRO_USD in vision.ts), summed per calendar month against
-- a per-plan $ ceiling (see PLAN_CEILING_MICRO_USD in vision.ts) — the
-- same shape as voice_transcriptions, but plan-scoped like skill_runs
-- rather than a single flat cap, since vision cost varies far more by
-- call kind (research's web search vs. a plain verify) than voice does.
CREATE TABLE `vision_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`cost_micro_usd` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `vision_calls_user_created` ON `vision_calls` (`user_id`, `created_at`);
