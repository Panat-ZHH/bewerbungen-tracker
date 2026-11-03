import { createClient } from "@supabase/supabase-js";
import { searchMultipleSources, type JobSource, type MultiSourceSearchInput } from "@/lib/job-search";
import { originalSourceName, type JobSearchResult } from "@/lib/job-results";

export const runtime = "nodejs";
export const maxDuration = 60;

const searchLimits = new Map<string, { startedAt: number; count: number }>();
const headers = { "Cache-Control": "no-store" };

function readKnownResult(value: unknown): JobSearchResult {
  if (!value || typeof value !== "object") throw new Error("Invalid result");
  const result = value as JobSearchResult;
  if (typeof result.title !== "string" || !result.title.trim() || result.title.length > 1000 || typeof result.url !== "string" || result.url.length > 512 || originalSourceName(result.url) !== result.source) throw new Error("Invalid result");
  if (result.company !== undefined && (typeof result.company !== "string" || result.company.length > 500)) throw new Error("Invalid company");
  if (result.location !== undefined && (typeof result.location !== "string" || result.location.length > 300)) throw new Error("Invalid location");
  if (result.sources !== undefined && (!Array.isArray(result.sources) || result.sources.length > 20 || result.sources.some((source) => !source || typeof source.url !== "string" || source.url.length > 512 || originalSourceName(source.url) !== source.name))) throw new Error("Invalid sources");
  if (result.years !== undefined && (!Array.isArray(result.years) || result.years.length > 10 || result.years.some((year) => typeof year !== "string" || !/^20\d{2}$/.test(year)))) throw new Error("Invalid years");
  return { title: result.title, company: result.company, location: result.location, source: result.source, url: result.url, sources: result.sources, years: result.years };
}

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return Response.json({ error: "Bitte melde dich an." }, { status: 401, headers });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return Response.json({ error: "Die Suche ist noch nicht eingerichtet." }, { status: 503, headers });
  const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return Response.json({ error: "Bitte melde dich erneut an." }, { status: 401, headers });

  let input: MultiSourceSearchInput;
  try {
    const body = await request.text();
    if (body.length > 4000000) throw new Error("Too large");
    const value = JSON.parse(body);
    if (typeof value.query !== "string" || typeof value.location !== "string" || !["job", "apprenticeship"].includes(value.kind)) throw new Error("Invalid input");
    input = { query: value.query.trim(), location: value.location.trim(), kind: value.kind };
    if (input.query.length < 2 || input.query.length > 80 || input.location.length > 80) throw new Error("Invalid length");
    if (value.cursor !== undefined) {
      if (!value.cursor || typeof value.cursor !== "object" || Object.keys(value.cursor).some((key) => !["yousty", "jobs", "jobup"].includes(key))) throw new Error("Invalid cursor");
      input.cursor = { yousty: null, jobs: null, jobup: null };
      for (const source of ["yousty", "jobs", "jobup"] as JobSource[]) {
        const cursor = value.cursor[source];
        if (cursor === null) continue;
        if (!cursor || !Number.isInteger(cursor.page) || cursor.page < 1 || cursor.page > 1000 || !Number.isInteger(cursor.offset) || cursor.offset < 0 || cursor.offset > 1000) throw new Error("Invalid cursor");
        input.cursor[source] = { page: cursor.page, offset: cursor.offset };
      }
    }
    if (value.excludedUrls !== undefined) {
      if (!Array.isArray(value.excludedUrls) || value.excludedUrls.length > 10000 || value.excludedUrls.some((url: unknown) => typeof url !== "string" || url.length > 512)) throw new Error("Invalid exclusions");
      input.excludedUrls = value.excludedUrls;
    }
    if (value.knownResults !== undefined) {
      if (!Array.isArray(value.knownResults) || value.knownResults.length > 10000) throw new Error("Invalid known results");
      input.knownResults = value.knownResults.map(readKnownResult);
    }
  } catch {
    return Response.json({ error: "Gib einen Beruf mit 2 bis 80 Zeichen und optional einen Ort ein." }, { status: 400, headers });
  }

  const now = Date.now();
  for (const [userId, limit] of searchLimits) {
    if (now - limit.startedAt >= 60000) searchLimits.delete(userId);
  }
  const limit = searchLimits.get(data.user.id) ?? { startedAt: now, count: 0 };
  if (limit.count >= 12) {
    const retryAfter = String(Math.max(1, Math.ceil((60000 - (now - limit.startedAt)) / 1000)));
    return Response.json({ error: "Bitte warte kurz vor der nächsten Suche." }, { status: 429, headers: { ...headers, "Retry-After": retryAfter } });
  }
  searchLimits.set(data.user.id, { ...limit, count: limit.count + 1 });

  try {
    const batch = await searchMultipleSources(input);
    return Response.json({ ...batch, searchedAt: new Date().toISOString(), query: input.query, location: input.location, kind: input.kind }, { headers });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "Die Quelle antwortet gerade nicht. Versuch es später erneut." }, { status: 502, headers });
  }
}