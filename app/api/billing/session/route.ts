import { checkoutSession } from "@/lib/billing/api";
import { bearerToken } from "@/lib/billing/auth";
import { apiDeps, NO_STORE, serverError } from "@/lib/billing/server";
import { limitIp, RateLimitedError, withUserLimit } from "@/lib/api-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?id=cs_… -> { status, paymentStatus, plan, interval, familyId|schoolId }. Auth: Bearer token (owner only). */
export async function GET(request: Request) {
  // Per IP before anything else, per verified user right after the token check (both before the Stripe API call).
  const limited = await limitIp("billing-session", request.headers);
  if (limited) return limited;
  try {
    const result = await checkoutSession({ token: bearerToken(request.headers.get("authorization")), query: new URL(request.url).searchParams }, withDeps(request));
    return Response.json(result.body, { status: result.status, headers: NO_STORE });
  } catch (error) {
    if (error instanceof RateLimitedError) return error.response();
    return serverError("session", error);
  }
}

function withDeps(request: Request) {
  const deps = apiDeps(request);
  return { ...deps, auth: withUserLimit(deps.auth, "billing-session") };
}
