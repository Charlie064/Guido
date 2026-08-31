# 0008 — Better Auth email+password, not Google OAuth

## Status

Accepted (2026-08-29). Supersedes the auth mechanism proposed in
[planning/login-membership-plan.md](../planning/login-membership-plan.md)
(deleted once this shipped, per the docs system's graduation rule — see
`docs/meta/documentation-system.md`) and resolves the "full account/auth
for paid subscriptions" item [ADR 0004](0004-cloudflare-infrastructure-proposal.md)
explicitly left open.

## Context

`login-membership-plan.md` designed a full Google OAuth desktop flow:
system-browser login, PKCE, a Worker-side token exchange, and a loopback
HTTP listener to hand the session back to the Tauri app — the standard
shape for a public client that can't hold a secret.

Building it hit a hackathon-specific blocker before the OAuth mechanics
themselves: Google's OAuth consent screen starts in "Testing" mode, where
only accounts explicitly added to a test-user allowlist in Cloud Console
can complete login. That's fine for the team's own accounts but blocks
anyone else from signing up during a demo or after a public launch,
without an app-verification process that doesn't fit hackathon
timelines.

## Decision

Replace Google OAuth with **Better Auth's email+password provider**,
run directly on the same website Worker
(`website/worker/better-auth.ts`). Self-serve signup, no external
identity provider, no allowlist.

- **Bearer tokens, not the loopback flow.** The desktop app already had
  no cookie jar shared with the Worker's origin, so the original plan's
  problem (how does a public client that opened a system browser get the
  resulting session back into the app) doesn't apply here — the desktop
  app calls Better Auth's `/api/auth/sign-up/email` and
  `/api/auth/sign-in/email` directly from a native form, and Better
  Auth's `bearer()` plugin returns the token in a response header. No
  browser round trip, no local HTTP listener.
- **Session storage is unchanged from the original plan**: the
  `keyring`-backed `store_session_token` / `get_session_token` /
  `clear_session_token` commands in `src-tauri/src/lib.rs` work the same
  regardless of how the token was minted.
- **Membership/quota schema is unchanged in shape**: a product-owned
  `memberships` table keyed on user id, separate from whatever the auth
  layer owns — the plan's `users`/`memberships` split, just with
  Better Auth's own `user` table (`worker/db/auth-schema.ts`, generated)
  standing in for the plan's hand-rolled `users` table.
- **`OWNER_EMAILS` allowlist** replaces the plan's implicit "hand-set
  `owner` in D1 for teammates" step with a `databaseHooks.user.create`
  hook that assigns `owner` automatically at signup time for listed
  emails.

See [features/auth.md](../features/auth.md) for the shipped mechanism in
full (endpoints, database shape, flow).

## Consequences

- No Google Cloud project, no OAuth consent screen, no test-user
  allowlist to manage — removes a whole category of pre-demo setup risk
  the original plan depended on someone else (Quentin) completing.
- Email verification is off by default
  (`emailAndPassword.requireEmailVerification: false`) — anyone can
  create an account with any email address, unverified. Explicitly
  deferred; see [BACKLOG.md](../BACKLOG.md) BL-015. This is a real
  trade-off Google OAuth wouldn't have had (Google already verifies the
  identity behind an email).
- `BETTER_AUTH_SECRET` (a Worker secret, `wrangler secret put
  BETTER_AUTH_SECRET`) replaces `GOOGLE_CLIENT_ID` /
  `GOOGLE_CLIENT_SECRET` as the credential this deployment depends on.
  Better Auth's own "don't run with the default secret in production"
  guard doesn't fire on Workers (it checks `NODE_ENV`, which Workers
  never sets) — the Worker's `fetch` handler refuses any auth-touching
  route outright if this secret is unset, rather than silently falling
  back to Better Auth's publicly-known default.
- Password reset / account recovery isn't designed — out of scope for
  this ADR, same "not yet needed for a hackathon demo" reasoning as
  BL-015.
