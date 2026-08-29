-- Per-call token accounting for /api/vision. skill_runs counts billable
-- units the user chose to spend; this counts what those units actually
-- cost us, which is the only thing that can bound a runaway bill.
CREATE TABLE vision_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  micro_usd INTEGER NOT NULL
);

-- Every read is "this user, this calendar month", so the index carries
-- the running total too and the ceiling check never touches the table.
CREATE INDEX vision_usage_user_created ON vision_usage (user_id, created_at, micro_usd);
