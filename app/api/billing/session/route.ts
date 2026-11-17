import { checkoutSession } from "@/lib/billing/api";
import { bearerToken } from "@/lib/billing/auth";
import { apiDeps, NO_STORE, serverError } from "@/lib/billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?id=cs_… -> { status, paymentStatus, plan, interval, familyId|schoolId }. Auth: Bearer token (owner only). */
export async function GET(request: Request) {
  try {
    const result = await checkoutSession({ token: bearerToken(request.headers.get("authorization")), query: new URL(request.url).searchParams }, apiDeps(request));
    return Response.json(result.body, { status: result.status, headers: NO_STORE });
  } catch (error) {
    return serverError("session", error);
  }
}
