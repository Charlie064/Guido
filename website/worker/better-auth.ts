import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./db/schema";

// D1 bindings only exist inside a request (Env is handed to fetch(), never
// available at module scope) — so this takes env optionally and falls back
// to a stub db, which is what lets `@better-auth/cli generate` import this
// module and introspect the config without a live binding. The Worker
// itself always calls createAuth(env, ...) per request; only the `auth`
// export below (for the CLI) uses the no-env path.
export function createAuth(
  env?: { DB: D1Database; BETTER_AUTH_SECRET?: string; OWNER_EMAILS?: string },
  baseURL?: string,
) {
  const db = env ? drizzle(env.DB) : ({} as ReturnType<typeof drizzle>);

  return betterAuth({
    baseURL,
    // Better Auth signs/encrypts session tokens with this — it normally
    // reads BETTER_AUTH_SECRET off `process.env`, which Workers never
    // populates from `wrangler secret put`, so it has to be threaded
    // through explicitly here. Without it, Better Auth falls back to a
    // publicly-known default secret and only refuses to start when it
    // detects "production" the Node way (NODE_ENV) — which Workers also
    // never sets — so on this runtime that fallback would silently run
    // in real production. Set via `wrangler secret put BETTER_AUTH_SECRET`
    // before deploying; `npx auth secret` (or `openssl rand -base64 32`)
    // generates a value.
    secret: env?.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      // Demo scope: an account is usable the moment it's created. See
      // BL-015 in docs/BACKLOG.md — before charging real users this must
      // require a verified email, which needs an email-sending provider
      // (Resend/Postmark) wired in first.
      requireEmailVerification: false,
    },
    // The desktop app's webview is a cross-origin caller (not a browser
    // tab on this same site), and Better Auth 403s any request whose
    // Origin header isn't listed here regardless of CORS headers — a gap
    // curl-only testing won't catch since curl never sends an Origin
    // header. Tauri's webview origin differs per OS (WebKitGTK on Linux,
    // WebView2 on Windows, WKWebView on macOS) and per Tauri version, so
    // this lists every variant rather than picking one.
    trustedOrigins: ["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"],
    // Bearer, not cookies: the desktop app has no cookie jar and calls the
    // Worker directly from a native login form (no browser round trip) —
    // see docs/planning/login-membership-plan.md. sign-in/sign-up return
    // the session token in the `set-auth-token` response header, and every
    // later request authenticates with `Authorization: Bearer <token>`.
    plugins: [bearer()],
    databaseHooks: {
      user: {
        create: {
          // Every account starts `free`/`active` — same default the
          // Google-only flow used — unless its email is on the
          // OWNER_EMAILS allowlist (wrangler.jsonc var, comma-separated),
          // in which case it starts `owner` instead. That list is how a
          // teammate gets owner access without any manual D1 surgery:
          // sign up with the email on the list and you land there
          // automatically. Membership/quota isn't an auth concern, so it
          // lives in our own `memberships` table (worker/db/schema.ts),
          // not a Better Auth plugin.
          after: async (user) => {
            if (!env) return;
            const ownerEmails = (env.OWNER_EMAILS ?? "")
              .split(",")
              .map((e) => e.trim().toLowerCase())
              .filter(Boolean);
            const plan = ownerEmails.includes(user.email.toLowerCase()) ? "owner" : "free";
            await env.DB.prepare(
              "INSERT INTO memberships (user_id, plan, status) VALUES (?, ?, 'active')",
            )
              .bind(user.id, plan)
              .run();
          },
        },
      },
    },
  });
}

// Only for `@better-auth/cli generate` (see createAuth's comment) — the
// Worker itself always calls createAuth(env, ...) per request.
export const auth = createAuth();
