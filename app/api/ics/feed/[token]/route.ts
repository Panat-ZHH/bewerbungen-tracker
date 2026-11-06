import { buildIcs, isFeedToken } from "@/lib/reminders";
import { adminClient } from "@/lib/reminders-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/** Public calendar feed. The secret token in the URL is the credential; deleting the feed row (revoke) makes it 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isFeedToken(token)) return notFound();
  const admin = adminClient();
  if (!admin) return new Response("Not configured", { status: 503 });
  const { data: feed } = await admin.from("calendar_feeds").select("user_id,application_id").eq("token", token).maybeSingle();
  if (!feed) return notFound();
  let q = admin.from("applications").select("id,company,position,location,job_url,deadline,status").eq("user_id", feed.user_id).not("deadline", "is", null);
  if (feed.application_id) q = q.eq("id", feed.application_id);
  const { data } = await q;
  const ics = buildIcs((data ?? []).filter((a) => !["rejected", "withdrawn"].includes(a.status)).map((a) => ({ id: a.id, company: a.company, position: a.position, location: a.location, jobUrl: a.job_url, deadline: String(a.deadline) })),
    { name: feed.application_id && data?.[0] ? `Frist: ${data[0].company}` : "WendApply Fristen" });
  return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=900", "Content-Disposition": 'inline; filename="wendapply.ics"' } });
}
