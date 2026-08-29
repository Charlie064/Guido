-- The actual budget gate for /api/vision. vision_usage (0003) stays as a
-- per-call audit log, but SUM()-over-rows can never be a safe gate: two
-- concurrent requests can both read "under budget" before either one's
-- row is inserted, and both proceed. This table holds one running total
-- per user per month, so the gate is a single conditional UPDATE against
-- one row — see reserveBudget() in worker/vision.ts for why that's race
-- free (D1 is one Durable Object per database; writes serialize globally,
-- so two concurrent UPDATEs against the same row can't both read stale).
CREATE TABLE monthly_spend (
  user_id INTEGER NOT NULL REFERENCES users(id),
  month TEXT NOT NULL, -- 'YYYY-MM', UTC
  reserved_micro_usd INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);
