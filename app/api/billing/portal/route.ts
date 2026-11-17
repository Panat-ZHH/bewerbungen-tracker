import { portal } from "@/lib/billing/api";
import { bearerToken } from "@/lib/billing/auth";
import { apiDeps, NO_STORE, serverError } from "@/lib/billing/server";
import { limitIp, RateLimitedError, withUserLimit } from "@/lib/api-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { schoolId? | familyId? } -> { url } of the Stripe Customer Portal. Auth: Bearer token. */
export async function POST(request: Request) {
  const limited = await limitIp("portal", request.headers);
  if (limited) return limited;
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  try {
    const result = await portal({ token: bearerToken(request.headers.get("authorization")), body }, withDeps(request));
    return Response.json(result.body, { status: result.status, headers: NO_STORE });
  } catch (error) {
    if (error instanceof RateLimitedError) return error.response();
    return serverError("portal", error);
  }
}

/** Per-user limit right after the token is verified (see lib/api-rate-limit.ts). */
function withDeps(request: Request) {
  const deps = apiDeps(request);
  return { ...deps, auth: withUserLimit(deps.auth, "portal") };
}
