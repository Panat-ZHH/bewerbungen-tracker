import { checkout } from "@/lib/billing/api";
import { bearerToken } from "@/lib/billing/auth";
import { apiDeps, NO_STORE, serverError } from "@/lib/billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { plan, schoolId? | familyId?, payment: 'card'|'invoice' } -> { url } | { url, invoice: true }. Auth: Bearer token. */
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  try {
    const result = await checkout({ token: bearerToken(request.headers.get("authorization")), body }, apiDeps(request));
    return Response.json(result.body, { status: result.status, headers: NO_STORE });
  } catch (error) {
    return serverError("checkout", error);
  }
}
