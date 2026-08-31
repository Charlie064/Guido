ALTER TABLE waitlist ADD COLUMN apps TEXT;
ALTER TABLE waitlist ADD COLUMN apps_other TEXT;
ALTER TABLE waitlist ADD COLUMN role TEXT;
ALTER TABLE waitlist ADD COLUMN referral_code TEXT;
ALTER TABLE waitlist ADD COLUMN referred_by TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_referral_code
  ON waitlist (referral_code);
