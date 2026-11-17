import { createClient } from "@supabase/supabase-js";
import { limitIp, limitUser } from "@/lib/api-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

/** GET -> { publicKey } (public VAPID key, or 503 when push is not configured). */
export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  return publicKey ? Response.json({ publicKey }, { headers }) : Response.json({ code: "NOT_CONFIGURED" }, { status: 503, headers });
}

/** Rate limit (per IP, then per verified user) + auth. Returns a ready Response when the request must stop. */
async function guarded(request: Request): Promise<{ client: NonNullable<Awaited<ReturnType<typeof userClient>>> } | { response: Response }> {
  const limitedIp = await limitIp("push-subscribe", request.headers);
  if (limitedIp) return { response: limitedIp };
  const ctx = await userClient(request);
  if (!ctx) return { response: Response.json({ code: "UNAUTHENTICATED" }, { status: 401, headers }) };
  const limitedUser = await limitUser("push-subscribe", ctx.userId);
  return limitedUser ? { response: limitedUser } : { client: ctx };
}

async function userClient(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const token = /^Bearer (.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!url || !key || !token) return null;
  const client = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await client.auth.getUser(token);
  return data.user ? { client, userId: data.user.id } : null;
}

/** POST { endpoint, keys: { p256dh, auth } } stores the subscription; DELETE { endpoint } removes it. RLS limits it to the caller. */
export async function POST(request: Request) {
  const g = await guarded(request);
  if ("response" in g) return g.response;
  const ctx = g.client;
  const body = await request.json().catch(() => null) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const { endpoint, keys } = body ?? {};
  if (typeof endpoint !== "string" || !/^https:\/\//.test(endpoint) || endpoint.length > 2000 || typeof keys?.p256dh !== "string" || typeof keys?.auth !== "string") return Response.json({ code: "INVALID_REQUEST" }, { status: 400, headers });
  const { error } = await ctx.client.from("push_subscriptions").upsert({ user_id: ctx.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: "endpoint" });
  return error ? Response.json({ code: "SAVE_FAILED" }, { status: 500, headers }) : Response.json({ ok: true }, { headers });
}
export async function DELETE(request: Request) {
  const g = await guarded(request);
  if ("response" in g) return g.response;
  const ctx = g.client;
  const body = await request.json().catch(() => null) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string") return Response.json({ code: "INVALID_REQUEST" }, { status: 400, headers });
  await ctx.client.from("push_subscriptions").delete().eq("endpoint", body.endpoint).eq("user_id", ctx.userId);
  return Response.json({ ok: true }, { headers });
}
