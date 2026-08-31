-- Renumbered from glass-waitlist's 0004_waitlist_apps_and_referral.sql —
-- this line's 0004/0005 are already voice/vision usage, so this has to
-- come after both rather than reusing either number. Adds referral
-- tracking (position display, "send to a friend" growth loop) and an
-- "apps you want to learn" step to the waitlist form. See
-- docs/planning/glass-waitlist-integration.md.
ALTER TABLE waitlist ADD COLUMN apps TEXT;
ALTER TABLE waitlist ADD COLUMN apps_other TEXT;
ALTER TABLE waitlist ADD COLUMN role TEXT;
ALTER TABLE waitlist ADD COLUMN referral_code TEXT;
ALTER TABLE waitlist ADD COLUMN referred_by TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_referral_code
  ON waitlist (referral_code);
