import { timingSafeEqual } from "node:crypto";
import { adminClient, runDigest } from "@/lib/reminders-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };

function authorized(request: Request) {
  const secret = process.env.REMINDERS_CRON_SECRET;
  const given = /^Bearer (.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  if (!secret || secret.length < 16 || !given) return false;
  const a = Buffer.from(secret), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** POST /api/reminders/digest  Authorization: Bearer <REMINDERS_CRON_SECRET>  [?dryRun=1]. Called by the Netlify scheduled function. */
export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ ok: false }, { status: 401, headers });
  const admin = adminClient();
  if (!admin) return Response.json({ ok: false, code: "NOT_CONFIGURED" }, { status: 503, headers });
  try {
    const summary = await runDigest(admin, { dryRun: new URL(request.url).searchParams.get("dryRun") === "1" });
    return Response.json({ ok: true, ...summary }, { headers });
  } catch (reason) {
    console.error("reminder digest failed", reason instanceof Error ? reason.message.split(":")[0] : "unknown");
    return Response.json({ ok: false, code: "DIGEST_FAILED" }, { status: 500, headers });
  }
}
