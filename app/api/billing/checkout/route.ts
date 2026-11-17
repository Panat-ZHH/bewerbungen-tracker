import { checkout } from "@/lib/billing/api";
import { bearerToken } from "@/lib/billing/auth";
import { apiDeps, NO_STORE, serverError } from "@/lib/billing/server";
import { limitIp, RateLimitedError, withUserLimit } from "@/lib/api-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { plan, schoolId? | familyId?, payment: 'card'|'invoice' } -> { url } | { url, invoice: true }. Auth: Bearer token. */
export async function POST(request: Request) {
  const limited = await limitIp("checkout", request.headers);
  if (limited) return limited;
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  try {
    const result = await checkout({ token: bearerToken(request.headers.get("authorization")), body }, withDeps(request));
    return Response.json(result.body, { status: result.status, headers: NO_STORE });
  } catch (error) {
    if (error instanceof RateLimitedError) return error.response();
    return serverError("checkout", error);
  }
}

/** Per-user limit right after the token is verified (see lib/api-rate-limit.ts). */
function withDeps(request: Request) {
  const deps = apiDeps(request);
  return { ...deps, auth: withUserLimit(deps.auth, "checkout") };
}
