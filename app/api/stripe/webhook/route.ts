import { isStripeEnabled } from "@/lib/billing/plans";
import { processWebhook } from "@/lib/billing/webhook";
import { verifyStripeEvent } from "@/lib/billing/stripe";
import { NO_STORE, serverError, webhookDeps } from "@/lib/billing/server";
import { checkIp, limitedResponse } from "@/lib/api-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook. The signature is computed over the RAW body, so read it with request.text() (never request.json()).
 * Service role DB writes only happen after a valid signature. Flag off => 503 (Stripe retries later, nothing is lost).
 * Rate limit: the signature is checked FIRST; only requests with a missing/invalid signature are counted per IP, so
 * real Stripe deliveries are never throttled (Stripe also retries for 3 days). Over the limit → 429 instead of 400.
 */
export async function POST(request: Request) {
  if (!isStripeEnabled()) return Response.json({ error: "billing_disabled", enabled: false }, { status: 503, headers: NO_STORE });
  const rawBody = await request.text();
  try {
    const result = await processWebhook(
      { rawBody, signature: request.headers.get("stripe-signature"), secret: process.env.STRIPE_WEBHOOK_SECRET, verify: verifyStripeEvent },
      webhookDeps(),
    );
    if (result.status === 400 && /signature/.test(String(result.body.error))) {
      const r = await checkIp("stripe-webhook-invalid", request.headers);
      if (!r.allowed) return limitedResponse("stripe-webhook-invalid", r);
    }
    return Response.json(result.body, { status: result.status, headers: NO_STORE });
  } catch (error) {
    return serverError("webhook", error);
  }
}
