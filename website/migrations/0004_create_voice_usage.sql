-- Aqua Voice speech-to-text usage log — see docs/features/voice.md and
-- worker/voice.ts. One row per successful transcription; `duration_seconds`
-- is what the desktop client reported for that clip (see voice.ts's
-- comment on why this is trust-but-bound, not a precise server-side
-- measurement), summed per calendar month against a flat $-per-month cap
-- shared by every plan (see MONTHLY_CAP_USD in voice.ts).
CREATE TABLE `voice_transcriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`duration_seconds` real NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `voice_transcriptions_user_created` ON `voice_transcriptions` (`user_id`, `created_at`);
