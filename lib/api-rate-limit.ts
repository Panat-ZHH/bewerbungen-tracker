// Per-route rate limits for the Next.js API (server only). Built on the shared limiter in lib/rate-limit (owned by the
// audit-ai branch – do not change it here). Every limit has a sensible default and can be tuned per deploy with env vars:
//
//   RATE_LIMIT_<SCOPE>_<IP|USER>=<limit>[/<windowSeconds>]     e.g. RATE_LIMIT_CHECKOUT_USER=5/3600, RATE_LIMIT_PLACES_IP=0 (=block)
//   RATE_LIMIT_DISABLED=1                                        emergency kill switch (all route limits off)
//
// SCOPE is the key of ROUTE_LIMITS in upper case with "-" → "_" (STRIPE_WEBHOOK_INVALID, ICS_FEED_MISS, …).
// 429 answers: JSON { error: "rate_limited", message, retryAfter } + Retry-After + Cache-Control: no-store.
import { envInt, ipKey, rateLimit, tooManyRequests, waitText, type RateLimitResult, type RateLimitRpc } from "@/lib/rate-limit/index";

export interface LimitSpec { limit: number; windowSeconds: number }
export interface RouteLimit {
  ip?: LimitSpec;
  user?: LimitSpec;
  /** Second, longer per-user window (daily cap). */
  userDay?: LimitSpec;
  /** DB error → "allow" (availability first, default) or "deny" (abuse protection first). */
  onError?: "allow" | "deny";
  /** German text for the 429 (the wait time is appended). */
  message?: string;
}

const H = 3600, D = 86400;

/** Defaults. Generous for real people, tight enough to make scripted abuse pointless. */
export const ROUTE_LIMITS = {
  // Stripe Checkout Session / invoice creation (creates Stripe objects).
  checkout: { ip: { limit: 30, windowSeconds: H }, user: { limit: 10, windowSeconds: H }, userDay: { limit: 30, windowSeconds: D },
    message: "Du hast gerade sehr oft versucht, die Zahlung zu starten." },
  portal: { ip: { limit: 60, windowSeconds: H }, user: { limit: 20, windowSeconds: H }, message: "Du hast das Kundenportal gerade sehr oft geöffnet." },
  // Polled after returning from Stripe.
  "billing-status": { ip: { limit: 300, windowSeconds: 600 }, user: { limit: 120, windowSeconds: 600 } },
  // In-app payment return page (polls a few times per payment). Each request reads one Checkout Session from Stripe.
  "billing-session": { ip: { limit: 120, windowSeconds: 600 }, user: { limit: 60, windowSeconds: 600 } },
  // Only requests with a missing / invalid signature are counted – a valid Stripe event is never limited.
  "stripe-webhook-invalid": { ip: { limit: 30, windowSeconds: 600 } },
  // Scraping three job portals per search is expensive: the per-USER limits carry the cost protection. The per-IP limit
  // only stops floods of fake tokens and must fit a whole school behind one IP (25-30 pupils searching in a lesson,
  // debounced auto-search + "load more" ≈ 2-6 requests per pupil and minute), so it is ~ one class × the user limit.
  "job-search": { ip: { limit: 360, windowSeconds: 60 }, user: { limit: 12, windowSeconds: 60 }, userDay: { limit: 400, windowSeconds: D },
    message: "Bitte warte kurz vor der nächsten Suche." },
  "account-delete": { ip: { limit: 20, windowSeconds: H }, user: { limit: 5, windowSeconds: H } },
  // Per IP sized for a class switching reminders on together from one school IP.
  "push-subscribe": { ip: { limit: 300, windowSeconds: H }, user: { limit: 30, windowSeconds: H } },
  // Wrong cron secret only.
  "digest-unauthorized": { ip: { limit: 10, windowSeconds: H } },
  // Calendar feeds: unknown tokens are counted per IP (guessing), a known token is limited per token
  // (calendar apps poll every 15–60 min; Google fetches many feeds from shared IPs, so no per-IP cap on valid tokens).
  "ics-feed-miss": { ip: { limit: 60, windowSeconds: H } },
  "ics-feed-token": { user: { limit: 120, windowSeconds: H } },
  // Public autocomplete (pure in-memory lookup): instance-local limiter, no database round trip per keystroke.
  places: { ip: { limit: 240, windowSeconds: 60 } },
} satisfies Record<string, RouteLimit>;

export type RouteScope = keyof typeof ROUTE_LIMITS;

const envName = (scope: string, part: string) => `RATE_LIMIT_${scope.toUpperCase().replace(/-/g, "_")}_${part}`;

/** Env override "limit" or "limit/windowSeconds"; invalid values keep the default. */
export function specFromEnv(raw: string | undefined, fallback: LimitSpec): LimitSpec {
  const value = raw?.trim();
  if (!value) return fallback;
  const [l, w] = value.split("/");
  const limit = envInt(l, -1);
  if (limit < 0) return fallback;
  const windowSeconds = w === undefined ? fallback.windowSeconds : envInt(w, -1);
  return windowSeconds >= 1 && windowSeconds <= 2678400 ? { limit, windowSeconds } : fallback;
}

export function routeLimit(scope: RouteScope, env: Record<string, string | undefined> = process.env): RouteLimit {
  const base: RouteLimit = ROUTE_LIMITS[scope];
  const pick = (part: "IP" | "USER" | "USER_DAY", spec?: LimitSpec) => (spec ? specFromEnv(env[envName(scope, part)], spec) : undefined);
  return { ...base, ip: pick("IP", base.ip), user: pick("USER", base.user), userDay: pick("USER_DAY", base.userDay) };
}

export const limitsDisabled = (env: Record<string, string | undefined> = process.env) => env.RATE_LIMIT_DISABLED === "1" || env.RATE_LIMIT_DISABLED === "true";

const ALLOWED: RateLimitResult = { allowed: true, retryAfter: 0, key: "", limit: 0, degraded: false };

/** 429 with the route's German text plus the wait time ("Versuche es in 5 Minuten wieder."). */
export function limitedResponse(scope: RouteScope, result: Pick<RateLimitResult, "retryAfter">): Response {
  const message = `${routeLimit(scope).message ?? "Du warst gerade sehr schnell unterwegs."} Versuche es ${waitText(result.retryAfter)} wieder.`;
  return tooManyRequests(result, message);
}

/** Per-IP check (call before any expensive work, also before authentication). null = go on. */
export async function limitIp(scope: RouteScope, headers: Headers, options: { rpc?: RateLimitRpc } = {}): Promise<Response | null> {
  const r = await checkIp(scope, headers, options);
  return r.allowed ? null : limitedResponse(scope, r);
}

export async function checkIp(scope: RouteScope, headers: Headers, options: { rpc?: RateLimitRpc } = {}): Promise<RateLimitResult> {
  const cfg = routeLimit(scope);
  if (limitsDisabled() || !cfg.ip) return ALLOWED;
  return rateLimit({ key: await ipKey(scope, headers), ...cfg.ip }, { onError: cfg.onError, rpc: options.rpc });
}

/** Per-IP peek (cost 0): is this IP already over the limit? Counts nothing (used before a lookup whose misses count). */
export async function peekIp(scope: RouteScope, headers: Headers, options: { rpc?: RateLimitRpc } = {}): Promise<RateLimitResult> {
  const cfg = routeLimit(scope);
  if (limitsDisabled() || !cfg.ip) return ALLOWED;
  return rateLimit({ key: await ipKey(scope, headers), ...cfg.ip, cost: 0 }, { onError: cfg.onError, rpc: options.rpc });
}

/** Per-user (or per-token) check after authentication. id = user uuid or another stable id (never a raw secret). */
export async function checkUser(scope: RouteScope, id: string, options: { rpc?: RateLimitRpc } = {}): Promise<RateLimitResult> {
  const cfg = routeLimit(scope);
  if (limitsDisabled() || (!cfg.user && !cfg.userDay)) return ALLOWED;
  const rules = [
    ...(cfg.user ? [{ key: `${scope}:user:${id}`, ...cfg.user }] : []),
    ...(cfg.userDay ? [{ key: `${scope}:user-day:${id}`, ...cfg.userDay }] : []),
  ];
  return rateLimit(rules, { onError: cfg.onError, rpc: options.rpc });
}

export async function limitUser(scope: RouteScope, id: string, options: { rpc?: RateLimitRpc } = {}): Promise<Response | null> {
  const r = await checkUser(scope, id, options);
  return r.allowed ? null : limitedResponse(scope, r);
}

/** Thrown by withUserLimit() when the verified user is over the limit; the route turns it into a 429. */
export class RateLimitedError extends Error {
  readonly scope: RouteScope;
  readonly result: RateLimitResult;
  constructor(scope: RouteScope, result: RateLimitResult) { super("rate_limited"); this.scope = scope; this.result = result; }
  response(): Response { return limitedResponse(this.scope, this.result); }
}

/**
 * Wraps auth deps whose getUser(token) VERIFIES the token (billing): right after a successful verification the
 * per-user limit is applied. Keys are the verified user id, so a forged token can never burn someone else's budget.
 */
export function withUserLimit<A extends { getUser(token: string): Promise<{ id: string } | null> }>(auth: A, scope: RouteScope, options: { rpc?: RateLimitRpc } = {}): A {
  return new Proxy(auth, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (prop !== "getUser") return typeof value === "function" ? value.bind(target) : value;
      return async (token: string) => {
        const user = await target.getUser(token);
        if (user) {
          const r = await checkUser(scope, user.id, options);
          if (!r.allowed) throw new RateLimitedError(scope, r);
        }
        return user;
      };
    },
  });
}

// ---------- instance-local limiter (cheap public endpoints) ----------

/**
 * In-memory RateLimitRpc with pruning, for endpoints where a database round trip per request would cost more than the
 * request itself (places autocomplete). Per server instance only – a brake, not a hard guarantee.
 */
export function localRateLimitRpc(maxKeys = 5000, now: () => number = () => Date.now()): RateLimitRpc & { size(): number } {
  const counts = new Map<string, { end: number; count: number }>();
  const rpc = async (key: string, limit: number, windowSeconds: number, cost: number) => {
    const t = now() / 1000;
    const start = Math.floor(t) - (Math.floor(t) % windowSeconds);
    const id = `${key}@${start}`;
    if (counts.size >= maxKeys) for (const [k, v] of counts) if (v.end <= t || counts.size >= maxKeys) counts.delete(k);
    const entry = counts.get(id) ?? { end: start + windowSeconds, count: 0 };
    entry.count = Math.max(0, entry.count + cost);
    counts.set(id, entry);
    const allowed = cost > 0 ? entry.count <= limit : cost === 0 ? entry.count < limit : true;
    return { allowed, retryAfter: allowed ? 0 : Math.max(1, Math.ceil(entry.end - t)) };
  };
  return Object.assign(rpc, { size: () => counts.size });
}
