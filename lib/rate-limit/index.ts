// Generic persistent rate limiter for Next.js route handlers / server actions (server only – uses the service role key).
// API doc: ~/Projects/bewerbungen-tracker-wt/_launch/RATE-LIMIT-API.md. Pure logic: ./core.ts.
//
//   import { rateLimit, ipKey, tooManyRequests } from "@/lib/rate-limit";
//   const r = await rateLimit([
//     { key: await ipKey("places", request.headers), limit: 60, windowSeconds: 60 },
//     { key: `places:user:${userId}`, limit: 30, windowSeconds: 60 },
//   ]);
//   if (!r.allowed) return tooManyRequests(r);
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hitAll, memoryRateLimitRpc, type RateLimitOptions, type RateLimitResult, type RateLimitRpc, type RateLimitRule } from "./core.ts";

export * from "./core.ts";

/** RateLimitRpc backed by public.rate_limit_hit (service role). */
export function supabaseRateLimitRpc(client: SupabaseClient): RateLimitRpc {
  return async (key, limit, windowSeconds, cost) => {
    const { data, error } = await client.rpc("rate_limit_hit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds, p_cost: cost });
    if (error) throw new Error(`rate_limit_hit: ${error.code ?? "error"}`);
    const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; retry_after?: number } | null;
    if (!row || typeof row.allowed !== "boolean") throw new Error("rate_limit_hit: empty result");
    return { allowed: row.allowed, retryAfter: Number(row.retry_after) || 0 };
  };
}

let cached: RateLimitRpc | null = null;
let warned = false;

/**
 * Default transport: Supabase (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). Without them (local dev, tests)
 * an in-memory limiter is used – per process only, so never rely on that in production.
 */
export function defaultRateLimitRpc(): RateLimitRpc {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    cached = supabaseRateLimitRpc(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  } else {
    if (!warned) { console.warn(JSON.stringify({ event: "rate_limit_memory_fallback" })); warned = true; }
    cached = memoryRateLimitRpc();
  }
  return cached;
}

/** Test hook: replace (or reset with null) the default transport. */
export function setRateLimitRpc(rpc: RateLimitRpc | null): void {
  cached = rpc;
}

/** Applies the rules in order, stops at the first denial. Database errors → onError policy (default "allow"). */
export function rateLimit(rules: RateLimitRule | RateLimitRule[], options: Partial<RateLimitOptions> = {}): Promise<RateLimitResult> {
  return hitAll(Array.isArray(rules) ? rules : [rules], { ...options, rpc: options.rpc ?? defaultRateLimitRpc() });
}
