import { createClient } from "@supabase/supabase-js";
import { searchJobs, type JobSearchInput } from "@/lib/job-search";

export const runtime = "nodejs";
export const maxDuration = 60;

const lastSearch = new Map<string, number>();
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return Response.json({ error: "Bitte melde dich an." }, { status: 401, headers });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return Response.json({ error: "Die Suche ist noch nicht eingerichtet." }, { status: 503, headers });
  const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return Response.json({ error: "Bitte melde dich erneut an." }, { status: 401, headers });

  let input: JobSearchInput;
  try {
    const body = await request.text();
    if (body.length > 2000) throw new Error("Too large");
    const value = JSON.parse(body);
    if (typeof value.query !== "string" || typeof value.location !== "string" || !["job", "apprenticeship"].includes(value.kind)) throw new Error("Invalid input");
    input = { query: value.query.trim(), location: value.location.trim(), kind: value.kind };
    if (input.query.length < 2 || input.query.length > 80 || input.location.length > 80) throw new Error("Invalid length");
  } catch {
    return Response.json({ error: "Gib einen Beruf mit 2 bis 80 Zeichen und optional einen Ort ein." }, { status: 400, headers });
  }

  const now = Date.now();
  for (const [userId, searchedAt] of lastSearch) {
    if (now - searchedAt > 60000) lastSearch.delete(userId);
  }
  if (now - (lastSearch.get(data.user.id) ?? 0) < 10000) {
    return Response.json({ error: "Bitte warte kurz vor der nächsten Suche." }, { status: 429, headers: { ...headers, "Retry-After": "10" } });
  }
  lastSearch.set(data.user.id, now);

  try {
    const results = await searchJobs(input);
    return Response.json({ results, searchedAt: new Date().toISOString(), query: input.query, location: input.location, kind: input.kind }, { headers });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "Die Quelle antwortet gerade nicht. Versuch es später erneut." }, { status: 502, headers });
  }
}