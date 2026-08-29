export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/waitlist" && request.method === "POST") {
      return handleWaitlistSignup(request, env);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleWaitlistSignup(request: Request, env: Env): Promise<Response> {
  const { email } = await request.json<{ email?: string }>();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Invalid email" }, { status: 400 });
  }

  try {
    await env.DB.prepare("INSERT INTO waitlist (email) VALUES (?)").bind(email).run();
  } catch (err) {
    // UNIQUE constraint failure means they're already on the list — treat as success.
    if (!(err instanceof Error) || !err.message.includes("UNIQUE")) {
      return Response.json({ error: "Could not save signup" }, { status: 500 });
    }
  }

  return Response.json({ ok: true });
}
