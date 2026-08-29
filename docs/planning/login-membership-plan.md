# Login, Google account linking, and membership verification

**Contract** [planned]
- Build plan for Quentin: Google-account login for the desktop app, backed
  by the existing Cloudflare D1 database, plus a way to check what
  membership tier a logged-in user has.
- Formalizes a scope move that [ADR 0004](../decisions/0004-cloudflare-infrastructure-proposal.md)
  explicitly deferred — that ADR's Decision section named "full
  account/auth for paid subscriptions" as **not** part of its acceptance,
  to be revisited as a superseding ADR later. This doc is that revisit.
  **Write the superseding ADR once this actually ships** — check
  `docs/decisions/README.md` for the next free number first: `0005` may
  already be claimed by the time this is picked up (see the open note in
  [BACKLOG.md](../BACKLOG.md) BL-005, mid-flight on another branch as of
  2026-08-29).
- A plan, not a source of truth — graduates into `features/` docs + an ADR
  as it gets built, then archives per
  [meta/style-guide.md](../meta/style-guide.md). Check
  [STATUS.md](../../STATUS.md) for current status.

## TL;DR

1. Extend the existing waitlist D1 database with `users` and
   `memberships` tables.
2. Add a Google OAuth flow to the existing website Worker
   (`website/src/index.ts`) — it holds the client secret; the desktop app
   never does.
3. Desktop app opens the system browser for login, gets a session token
   back over a local loopback redirect, stores it in the OS keychain (not
   a plain file).
4. Worker exposes `/api/me`, returning the caller's membership plan/status
   given that token.
5. Replace the disabled placeholder in `sidebar.html`'s `#view-login` with
   the real flow, gated on the membership check.
6. **Quentin defines what a "membership" actually is** (free/pro? one paid
   tier or several? trial period?) and writes it into `docs/business/` —
   this doc deliberately does not decide that; it's part of the task.

## Why the website Worker, not a new backend

`website/` already has a live Cloudflare Worker with a D1 binding
(`tutoria-waitlist`, see `wrangler.jsonc`) and is deployed at
`tutoria-website.guidotutor.workers.dev`. Auth is small enough to add as
more routes on that same Worker rather than standing up a second service —
one Cloudflare account, one D1 database, one deploy. Revisit only if this
Worker ever needs to scale independently of the marketing site, which
nothing today suggests.

## Why this can't be a normal web OAuth redirect

The desktop app (Tauri) is a **public client** — it can't hold a Google
client secret safely (anyone could extract it from the installed binary).
Standard fix, same shape as VS Code, Slack, and most desktop apps use:

1. Desktop app opens the user's system browser (not an embedded webview —
   embedded webviews can't securely share Google's own login session /
   passkeys, and Google's OAuth policy disallows them for this reason) to
   the Worker's `/auth/google/start`.
2. Worker redirects to Google with a PKCE code challenge (no client
   secret exposed to the browser at any point).
3. Google redirects back to the Worker's `/auth/google/callback` with an
   auth code.
4. Worker exchanges the code for Google's tokens **server-side**, using
   the client secret (stored as a Cloudflare Worker secret, never in
   source).
5. Worker looks up or creates the `users` row (by Google's stable
   `sub` claim), mints a **session token**, and redirects the browser to
   `http://127.0.0.1:<port>/callback?token=...` — a tiny local HTTP
   server the desktop app started just for this, listening only during
   login.
6. Desktop app receives the token, closes the local server, stores the
   token, done. Browser tab can be closed.

This is the flow Google's own "OAuth for desktop apps" guidance describes
(loopback redirect) — don't use a custom URI scheme (`tutoria://...`)
instead; Google's current guidance prefers loopback and some platforms
handle custom schemes inconsistently.

## What "session token storage" means, concretely

Explained inline in chat already, repeated here for the doc: the session
token is what lets the app skip steps 1–5 on every subsequent launch. It
has to persist across restarts, and it has to sit somewhere other
programs / a stolen laptop's filesystem can't casually read — that means
the OS's own credential store, not a JSON file in the app's data
directory.

- **Rust crate**: [`keyring`](https://docs.rs/keyring) — wraps macOS
  Keychain, Windows Credential Manager, and Linux Secret Service
  (libsecret) behind one API. Already the kind of per-platform
  abstraction this codebase uses elsewhere (see the vision/voice
  provider pattern in `architecture/overview.md`).
- Two new `#[tauri::command]`s in `src-tauri/src/lib.rs`:
  `store_session_token(token)` and `get_session_token() -> Option<String>`.
- On app startup: try `get_session_token()`. If present, call `/api/me`
  with it. A 401 means the token expired/was revoked — fall through to
  the login view.

## Build steps

### 1. Database schema (Quentin, D1)

Add a new migration alongside `website/migrations/0001_create_waitlist.sql`:

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE memberships (
  user_id INTEGER NOT NULL REFERENCES users(id),
  plan TEXT NOT NULL,           -- e.g. 'free', 'pro' — see the tiers task below
  status TEXT NOT NULL,         -- e.g. 'active', 'trialing', 'expired'
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id)
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,       -- the opaque session token, or a JWT id
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
```

`google_sub` (Google's stable per-account subject id), not email, is the
identity key — emails can change, `sub` doesn't. `sessions` is a real
table (not a signed-JWT-only approach) so a session can be revoked
(delete the row) — worth the one extra D1 read per request at this scale.

### 2. Google Cloud OAuth client (Quentin)

- Create an OAuth 2.0 Client ID in Google Cloud Console, type **Desktop
  app** (this is what enables the loopback-redirect flow — don't use
  "Web application").
- Client secret goes into the Worker as `wrangler secret put
  GOOGLE_CLIENT_SECRET` — never committed, never shipped in the desktop
  binary.

### 3. Worker routes (Quentin, `website/src/index.ts`)

- `GET /auth/google/start` — redirect to Google's auth endpoint with PKCE
  challenge, scope `openid email`, and a `redirect_uri` pointing back at
  this same Worker's `/auth/google/callback`.
- `GET /auth/google/callback` — exchange code for tokens, verify the ID
  token, upsert into `users`, insert a `sessions` row, redirect to the
  desktop app's loopback URL (passed through as a `state` param from step
  1, since the port is chosen per-launch by the app).
- `GET /api/me` — reads `Authorization: Bearer <token>`, joins
  `sessions` → `users` → `memberships`, returns `{ email, plan, status }`
  or 401.

### 4. Desktop app changes (needs Charlie for the Rust half)

- `src-tauri/src/lib.rs`: the two `keyring` commands above, plus a
  `start_google_login()` command that spins up the temporary loopback
  HTTP listener, opens the system browser via Tauri's `opener` plugin
  (already a dependency — see `Cargo.toml`) to the Worker's
  `/auth/google/start`, and resolves once the loopback server receives
  the token.
- `src/sidebar.js` / `sidebar.html`: replace the disabled placeholder in
  `#view-login` (currently just two disabled inputs and a `Continue`
  button that does nothing) with a single "Sign in with Google" button
  calling `start_google_login()`, then `invoke("get_session_token")` +
  a fetch to `/api/me` before advancing past login.

### 5. Membership tiers (Quentin — do this before or alongside step 1)

Tracked as [BL-007](../BACKLOG.md) — this is broader product scope than
just this login task, so it has its own backlog entry rather than living
only here. Nothing in the docs defines what a "membership" is yet — [ADR
0002](../decisions/0002-agency-hybrid-vision-platform-business.md) only
says "monthly subscription," no tiers. This doc deliberately does not
decide it. **Write the answer into `docs/business/pricing.md`** (create
it — `docs/business/` currently holds only a `.gitkeep`) — at minimum:
how many tiers, what each unlocks, whether there's a free tier or a
trial, and whether the MVP checks a **manually set** `plan` value in D1
(no payment processor — flip someone's row by hand for now) or wires up
real billing. This is a required deliverable of BL-007, not an optional
write-up — the `memberships` table's `plan`/`status` values below stay
placeholders until `pricing.md` exists. Real billing (Stripe or similar:
checkout, webhooks, subscription lifecycle) is a materially bigger,
separate task from the login flow above — scope it as a follow-up unless
explicitly pulled in now.

## Before Quentin can start: what Charlie needs to provide

Decided 2026-08-29:

- **Google Cloud project: Quentin creates and owns it** (his own Google
  account, for now — not a shared/team account). Consent-screen support
  email and branding will show as his until this is revisited.
- **Privacy policy page: Quentin writes and hosts it** — a minimal page in
  `website/`, since he already owns that Worker. This is a hard blocker on
  finishing the OAuth consent screen in step 2 below (Google requires a
  privacy policy URL even for basic `openid email` scopes) — do this
  before creating the OAuth client, not after.
- **Rust/Tauri half (step 4): Charlie pairs with Quentin on it.** The
  keyring storage and loopback-listener commands go in
  `src-tauri/src/lib.rs` — outside Quentin's stated role, so this isn't
  solo work for him.

Still outstanding, not yet decided:

- **Cloudflare account membership.** [reference/team.md](../reference/team.md)
  already flags this for everyone, not just this task: invites still
  haven't been sent (Manage Account → Members → Invite). Without it
  Quentin can't deploy Worker changes or run `wrangler secret put` for the
  Google client secret — needed before step 3.
- **Test-user list.** While the OAuth consent screen is in Google's
  "Testing" mode (before app verification — not needed for a hackathon
  demo), only Google accounts explicitly added to a test-user allowlist in
  Cloud Console can complete login. Decide which accounts (Quentin's,
  Charlie's, teammates') go on that list once the project exists.
- **The exact callback URL to register.** Google requires exact-match
  registered redirect URIs. Confirm this stays on
  `tutoria-website.guidotutor.workers.dev` (per ADR 0004, no real domain
  yet) so Quentin registers the right URL the first time —
  `https://tutoria-website.guidotutor.workers.dev/auth/google/callback`.

## Security notes

- PKCE, not the implicit flow — required for a public client regardless
  of platform.
- Client secret lives only in the Worker (Cloudflare secret binding),
  never in the desktop binary or repo.
- Session tokens in the OS keychain, not a plaintext file — see above.
- `sessions` table (not JWT-only) so a compromised token can be revoked
  server-side.
- The loopback HTTP listener binds `127.0.0.1` only, on an
  ephemeral/random port, and is torn down immediately after receiving one
  callback — it's not a standing local server.

## Open / deferred

- Real billing integration (Stripe or similar) — separate task, see step 5.
- Session token refresh/expiry UX (what happens when a session expires
  while the app is open) — not designed here.
- Whether other providers (not just Google) are ever needed — out of
  scope; ADR 0004 and this doc both assume Google only for now.
- The superseding ADR for ADR 0004's deferred auth scope — write it once
  this ships, per the Contract note above.
