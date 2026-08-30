import type { createAuth } from "./better-auth";
import type { Env, Plan } from "./auth";
import { json, membershipFromBearer } from "./auth";

const STRIPE_API = "https://api.stripe.com/v1";

// Raw REST calls rather than the `stripe` npm SDK — the SDK's Node-http
// client isn't Workers-compatible without extra polyfilling, and this
// integration only needs a handful of endpoints.
async function stripeRequest(
  env: Env,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, string>,
): Promise<any> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${btoa(`${env.STRIPE_SECRET_KEY}:`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body ? new URLSearchParams(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Stripe ${path} failed: ${JSON.stringify(data)}`);
  }
  return data;
}

function priceIdFor(env: Env, plan: string): string | null {
  if (plan === "starter") return env.STRIPE_PRICE_STARTER;
  if (plan === "plus") return env.STRIPE_PRICE_PLUS;
  return null;
}

// Creates a Checkout Session for the plan named in the request body and
// hands back its redirect URL — the desktop app's paywall and the
// website's pricing page both just redirect the browser there (BL-016).
export async function handleBillingCheckout(
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Unauthorized" }, 401);

  let plan: string | undefined;
  try {
    ({ plan } = await request.json<{ plan?: string }>());
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const price = plan ? priceIdFor(env, plan) : null;
  if (!price) return json({ error: "Unknown plan" }, 400);

  const origin = new URL(request.url).origin;
  const member = await env.DB.prepare(
    "SELECT stripe_customer_id FROM memberships WHERE user_id = ?",
  )
    .bind(session.user.id)
    .first<{ stripe_customer_id: string | null }>();

  const params: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/pricing?checkout=success`,
    cancel_url: `${origin}/pricing?checkout=cancelled`,
    "metadata[user_id]": session.user.id,
    "subscription_data[metadata][user_id]": session.user.id,
  };
  if (member?.stripe_customer_id) {
    params.customer = member.stripe_customer_id;
  } else {
    params.customer_email = session.user.email;
  }

  const checkoutSession = await stripeRequest(env, "POST", "/checkout/sessions", params);
  return json({ url: checkoutSession.url });
}

// Creates a Customer Portal session so an existing subscriber can update
// payment method, change plan, or cancel — the "manage subscription"
// counterpart to checkout above (BL-016).
export async function handleBillingPortal(
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Unauthorized" }, 401);

  const member = await env.DB.prepare(
    "SELECT stripe_customer_id FROM memberships WHERE user_id = ?",
  )
    .bind(session.user.id)
    .first<{ stripe_customer_id: string | null }>();
  if (!member?.stripe_customer_id) {
    return json({ error: "No billing account yet — subscribe first" }, 400);
  }

  const origin = new URL(request.url).origin;
  const portalSession = await stripeRequest(env, "POST", "/billing_portal/sessions", {
    customer: member.stripe_customer_id,
    return_url: `${origin}/pricing`,
  });
  return json({ url: portalSession.url });
}

// Verifies Stripe's webhook signature (HMAC-SHA256 over `${timestamp}.${body}`,
// same scheme as the `stripe` SDK's `webhooks.constructEvent` — reimplemented
// here since that SDK isn't used elsewhere in this Worker) and returns the
// parsed event, or null if the signature doesn't check out.
async function verifyStripeSignature(
  body: string,
  signatureHeader: string | null,
  secret: string,
): Promise<any | null> {
  if (!signatureHeader) return null;
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => part.split("=") as [string, string]),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected !== signature) return null;
  return JSON.parse(body);
}

// Keeps `memberships` in sync with the subscription's actual state —
// Checkout completing sets the plan for the first time, and Stripe's own
// subscription lifecycle events (renewal failure, cancellation, plan
// change via the portal) keep it correct after that without polling.
export async function handleBillingWebhook(request: Request, env: Env): Promise<Response> {
  const body = await request.text();
  const event = await verifyStripeSignature(
    body,
    request.headers.get("Stripe-Signature"),
    env.STRIPE_WEBHOOK_SECRET,
  );
  if (!event) return json({ error: "Invalid signature" }, 400);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata?.user_id;
    const customerId = session.customer;
    if (userId && customerId) {
      await env.DB.prepare(
        "UPDATE memberships SET stripe_customer_id = ? WHERE user_id = ?",
      )
        .bind(customerId, userId)
        .run();
    }
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    const customerId = subscription.customer;
    const plan = planFromSubscription(env, subscription);
    const status = subscription.status === "active" || subscription.status === "trialing" ? "active" : "expired";
    await env.DB.prepare(
      "UPDATE memberships SET plan = ?, status = ? WHERE stripe_customer_id = ?",
    )
      .bind(plan, status, customerId)
      .run();
  }

  return json({ received: true });
}

// Reads the plan back off the subscription's price ID rather than trusting
// event.type alone — a downgrade (Plus -> Starter) also fires
// `customer.subscription.updated` with the same event shape.
function planFromSubscription(env: Env, subscription: any): Plan {
  const priceId = subscription.items?.data?.[0]?.price?.id;
  if (priceId === env.STRIPE_PRICE_PLUS) return "plus";
  if (priceId === env.STRIPE_PRICE_STARTER) return "starter";
  return "free";
}
