-- Maps a membership to its Stripe Customer so the billing webhook
-- (worker/index.ts) can find the right row when Stripe posts
-- subscription events — see docs/planning/payment-page.md (BL-016).
ALTER TABLE memberships ADD COLUMN stripe_customer_id TEXT;
CREATE UNIQUE INDEX memberships_stripe_customer_idx ON memberships (stripe_customer_id);
