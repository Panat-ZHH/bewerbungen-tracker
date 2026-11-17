// Generic persistent rate limiter – pure core (NO imports, runs in Node, Next.js and Deno edge functions).
// The counter lives in Postgres (public.rate_limits + rpc rate_limit_hit, migration 20261117010000_rate_limits.sql),
// so limits hold across all serverless instances. The transport (supabase-js rpc, or an in-memory stub in tests)
// is injected as a RateLimitRpc.
//
// KEEP IN SYNC: supabase/functions/_shared/rate-limit-core.ts must be an exact copy of this file
// (tests/rate-limit.test.mjs fails otherwise). Edge functions cannot import from lib/.

/** Raw call of public.rate_limit_hit. Must throw on transport / database errors. */
export type RateLimitRpc = (key: string, limit: number, windowSeconds: number, cost: number) => Promise<{ allowed: boolean; retryAfter: number }>;

export interface RateLimitRule {
  /** Unique key, e.g. "ai-review:user:<uuid>" or "places:ip:<hash>". Max 200 chars. */
  key: string;
  /** Max total cost per window (requests when cost = 1). 0 = always denied. */
  limit: number;
  /** Window length in seconds (1 … 2678400). Windows are aligned to the Unix epoch (86400 → resets 00:00 UTC). */
  windowSeconds: number;
  /** 1 (default) = count one request; 0 = only check; n = add n (e.g. tokens); negative = refund. */
  cost?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window of the denying rule ends (0 when allowed). */
  retryAfter: number;
  /** The rule that denied (or the last rule checked when allowed). */
  key: string;
  limit: number;
  /** true when the database call failed and the result comes from the onError policy. */
  degraded: boolean;
}

export interface RateLimitOptions {
  rpc: RateLimitRpc;
  /** What to do if the database call fails: "allow" (default, availability first) or "deny" (cost protection first). */
  onError?: "allow" | "deny";
  /** retryAfter reported when onError = "deny" kicks in (default 60 s). */
  errorRetryAfter?: number;
}

export const MAX_WINDOW_SECONDS = 2678400;

/** Throws for invalid rules (programming errors – fail loudly in tests). */
export function validateRule(rule: RateLimitRule): void {
  if (typeof rule.key !== "string" || rule.key.length === 0 || rule.key.length > 200) throw new Error("rate-limit: invalid key");
  if (!Number.isInteger(rule.limit) || rule.limit < 0) throw new Error("rate-limit: invalid limit");
  if (!Number.isInteger(rule.windowSeconds) || rule.windowSeconds < 1 || rule.windowSeconds > MAX_WINDOW_SECONDS) {
    throw new Error("rate-limit: invalid window");
  }
  if (rule.cost !== undefined && !Number.isInteger(rule.cost)) throw new Error("rate-limit: invalid cost");
}

/** Applies one rule. Never throws for database errors (see onError). */
export async function hit(rule: RateLimitRule, options: RateLimitOptions): Promise<RateLimitResult> {
  validateRule(rule);
  const cost = rule.cost ?? 1;
  try {
    const r = await options.rpc(rule.key, rule.limit, rule.windowSeconds, cost);
    const retryAfter = r.allowed ? 0 : Math.max(1, Math.ceil(Number(r.retryAfter) || 1));
    return { allowed: Boolean(r.allowed), retryAfter, key: rule.key, limit: rule.limit, degraded: false };
  } catch {
    const deny = options.onError === "deny";
    return { allowed: !deny, retryAfter: deny ? options.errorRetryAfter ?? 60 : 0, key: rule.key, limit: rule.limit, degraded: true };
  }
}

/**
 * Applies the rules in order and stops at the first denial (later rules are not counted then).
 * Put the cheapest / broadest rule first (e.g. per IP before per user).
 */
export async function hitAll(rules: RateLimitRule[], options: RateLimitOptions): Promise<RateLimitResult> {
  let last: RateLimitResult = { allowed: true, retryAfter: 0, key: "", limit: 0, degraded: false };
  for (const rule of rules) {
    last = await hit(rule, options);
    if (!last.allowed) return last;
  }
  return last;
}

/** In-memory RateLimitRpc with the same semantics as the SQL function (tests, local dev without a database). */
export function memoryRateLimitRpc(now: () => number = () => Date.now()): RateLimitRpc & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  const rpc = async (key: string, limit: number, windowSeconds: number, cost: number) => {
    const epoch = Math.floor(now() / 1000);
    const start = epoch - (epoch % windowSeconds);
    const id = `${key}@${start}`;
    const count = Math.max(0, (counts.get(id) ?? 0) + cost);
    counts.set(id, count);
    const allowed = cost > 0 ? count <= limit : cost === 0 ? count < limit : true;
    const retryAfter = allowed ? 0 : Math.max(1, start + windowSeconds - now() / 1000);
    return { allowed, retryAfter: Math.ceil(retryAfter) };
  };
  return Object.assign(rpc, { counts });
}

// ---------- client IP ----------

type HeaderBag = { get(name: string): string | null };

/**
 * Best-effort client IP. Platform headers that clients cannot forge come first (Netlify, Cloudflare/Supabase);
 * x-forwarded-for is only a fallback. Returns "unknown" if nothing usable is present.
 */
export function clientIp(headers: HeaderBag): string {
  const candidates = [
    headers.get("x-nf-client-connection-ip"),
    headers.get("cf-connecting-ip"),
    headers.get("x-real-ip"),
    (headers.get("x-forwarded-for") ?? "").split(",")[0],
  ];
  for (const c of candidates) {
    const v = (c ?? "").trim();
    if (v && v.length <= 64 && /^[0-9a-fA-F:.]+$/.test(v)) return v;
  }
  return "unknown";
}

/** IPv6 addresses are bucketed to their /64 (one household / device usually owns a whole /64). */
export function ipBucket(ip: string): string {
  if (!ip.includes(":")) return ip;
  const [head] = ip.split("::");
  const groups = head.split(":").filter(Boolean);
  return groups.length >= 4 ? `${groups.slice(0, 4).join(":")}::/64` : ip.toLowerCase();
}

/** SHA-256 (hex, first 32 chars) so no raw IP addresses are stored in the database. */
export async function hashKeyPart(value: string, salt = ""): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}|${value}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest.subarray(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Rate-limit key for the caller's IP: `${scope}:ip:<hash>`. */
export async function ipKey(scope: string, headers: HeaderBag, salt = ""): Promise<string> {
  return `${scope}:ip:${await hashKeyPart(ipBucket(clientIp(headers)), salt)}`;
}

// ---------- HTTP helpers ----------

export const RATE_LIMIT_MESSAGE = "Du warst gerade sehr schnell unterwegs. Bitte warte kurz und versuche es dann nochmals.";

/** Human German wait time: "in 1 Minute", "in 5 Minuten", "in 2 Stunden", "morgen". */
export function waitText(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 90) return s <= 60 ? "in einer Minute" : "in 2 Minuten";
  const min = Math.ceil(s / 60);
  if (min < 90) return `in ${min} Minuten`;
  const h = Math.round(min / 60);
  if (h < 12) return `in ${h} Stunden`;
  return "morgen";
}

/** Headers for a 429 (Retry-After in whole seconds). */
export function rateLimitHeaders(result: Pick<RateLimitResult, "retryAfter">): Record<string, string> {
  return { "Retry-After": String(Math.max(1, Math.ceil(result.retryAfter))) };
}

/** JSON 429 response { error: "rate_limited", message, retryAfter } with Retry-After header. */
export function tooManyRequests(result: Pick<RateLimitResult, "retryAfter">, message = RATE_LIMIT_MESSAGE, extraHeaders: Record<string, string> = {}): Response {
  const retryAfter = Math.max(1, Math.ceil(result.retryAfter));
  return new Response(JSON.stringify({ error: "rate_limited", message, retryAfter }), {
    status: 429,
    headers: { ...extraHeaders, ...rateLimitHeaders(result), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Parses an integer env value; falls back to `fallback` for missing / invalid / negative values. */
export function envInt(value: string | undefined, fallback: number): number {
  const raw = value?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}
