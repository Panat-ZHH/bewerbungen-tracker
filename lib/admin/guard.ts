// Admin API guard (SPEC §5), pure: the store and the rate-limit transport are injected.
//   0. per-IP brake (before any work)          → 429
//   1. Bearer JWT → Supabase Auth getUser       → 401 unauthenticated
//   2. user in public.platform_admins           → else 404 not_found (the route does not "exist" for anyone else)
//   3. JWT claim aal = "aal2" (TOTP MFA)        → else 403 mfa_required
//   4. 60 requests / min per admin, 10 / min for mutations → 429
// No cookies are read anywhere: the token comes only from the Authorization header, so cross-site requests cannot ride
// on a session (CSRF-safe by construction).
import { clientIp, envInt, hashKeyPart, hitAll, ipBucket, tooManyRequests, type RateLimitRpc } from "../rate-limit/core.ts";
import type { AdminStore, VerifiedUser } from "./store.ts";
import type { AdminErrorCode } from "./types.ts";

export const ADMIN_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  Vary: "Authorization",
};

export function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: ADMIN_HEADERS });
}

export function fail(status: number, error: AdminErrorCode, extra: Record<string, unknown> = {}): Response {
  return json(status, { error, ...extra });
}

/** Default limits; tune per deploy with RATE_LIMIT_ADMIN_IP / RATE_LIMIT_ADMIN_USER / RATE_LIMIT_ADMIN_MUTATION_USER = "limit[/seconds]". */
export const ADMIN_LIMITS = {
  ip: { limit: 120, windowSeconds: 60 },
  user: { limit: 60, windowSeconds: 60 },
  mutation: { limit: 10, windowSeconds: 60 },
};

function spec(raw: string | undefined, fallback: { limit: number; windowSeconds: number }) {
  const value = raw?.trim();
  if (!value) return fallback;
  const [l, w] = value.split("/");
  const limit = envInt(l, -1);
  if (limit < 0) return fallback;
  const windowSeconds = w === undefined ? fallback.windowSeconds : envInt(w, -1);
  return windowSeconds >= 1 && windowSeconds <= 86400 ? { limit, windowSeconds } : fallback;
}

export function adminLimits(env: Record<string, string | undefined> = process.env) {
  return {
    ip: spec(env.RATE_LIMIT_ADMIN_IP, ADMIN_LIMITS.ip),
    user: spec(env.RATE_LIMIT_ADMIN_USER, ADMIN_LIMITS.user),
    mutation: spec(env.RATE_LIMIT_ADMIN_MUTATION_USER, ADMIN_LIMITS.mutation),
  };
}

const RATE_MESSAGE = "Zu viele Admin-Anfragen. Bitte warte kurz.";

/** Payload of a JWT WITHOUT verifying it. Only used after Supabase Auth verified the same token (getUser). */
export function jwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[1].length > 8192) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const parsed = JSON.parse(atob(padded));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function bearer(headers: Headers): string | null {
  const m = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(headers.get("authorization") ?? "");
  return m && m[1].length <= 16384 ? m[1] : null;
}

export interface GuardDeps {
  store: AdminStore;
  rpc: RateLimitRpc;
  env?: Record<string, string | undefined>;
}

export interface AdminContext { admin: VerifiedUser; ip: string | null }

export type GuardResult = { ok: true; ctx: AdminContext } | { ok: false; response: Response };

export async function guard(request: Request, deps: GuardDeps, opts: { mutation: boolean }): Promise<GuardResult> {
  const env = deps.env ?? process.env;
  const disabled = env.RATE_LIMIT_DISABLED === "1" || env.RATE_LIMIT_DISABLED === "true";
  const limits = adminLimits(env);
  const ip = clientIp(request.headers);

  if (!disabled) {
    const key = `admin:ip:${await hashKeyPart(ipBucket(ip))}`;
    const r = await hitAll([{ key, ...limits.ip }], { rpc: deps.rpc });
    if (!r.allowed) return { ok: false, response: tooManyRequests(r, RATE_MESSAGE, ADMIN_HEADERS) };
  }

  const token = bearer(request.headers);
  if (!token) return { ok: false, response: fail(401, "unauthenticated") };
  let user: VerifiedUser | null;
  try { user = await deps.store.verifyToken(token); } catch { user = null; }
  if (!user) return { ok: false, response: fail(401, "unauthenticated") };

  const claims = jwtClaims(token);
  if (!claims || claims.sub !== user.id) return { ok: false, response: fail(401, "unauthenticated") };

  let isAdmin = false;
  try { isAdmin = await deps.store.isPlatformAdmin(user.id); } catch { isAdmin = false; }
  if (!isAdmin) return { ok: false, response: fail(404, "not_found") };

  if (claims.aal !== "aal2") return { ok: false, response: fail(403, "mfa_required") };

  if (!disabled) {
    const rules = [{ key: `admin:user:${user.id}`, ...limits.user }];
    if (opts.mutation) rules.push({ key: `admin:mutation:${user.id}`, ...limits.mutation });
    const r = await hitAll(rules, { rpc: deps.rpc });
    if (!r.allowed) return { ok: false, response: tooManyRequests(r, RATE_MESSAGE, ADMIN_HEADERS) };
  }
  return { ok: true, ctx: { admin: user, ip: ip === "unknown" ? null : ip } };
}
