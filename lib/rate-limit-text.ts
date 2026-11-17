// Client-safe (no server imports): recognises a rate-limit answer and returns the friendly German text.
// Sources: RPCs over PostgREST (429, { code: "rate_limited", message: "RATE_LIMITED", details: "<German text>", hint: "<seconds>" },
// see supabase/migrations/20261117020000_rate_limit_rpcs.sql) and the Next API routes (429, { error: "rate_limited", message }).
export const RATE_LIMIT_FALLBACK = "Du hast das gerade sehr oft versucht. Bitte warte ein paar Minuten und versuche es dann nochmals.";

type Shape = { code?: unknown; error?: unknown; message?: unknown; details?: unknown; status?: unknown };

/** true for the NEW limiter (lower-case code "rate_limited"); older feature-specific "RATE_LIMITED" errors stay theirs. */
export function isRateLimited(reason: unknown): boolean {
  if (!reason || (typeof reason !== "object" && typeof reason !== "string")) return false;
  if (typeof reason === "string") return /\brate_limited\b/.test(reason);
  const r = reason as Shape;
  return r.code === "rate_limited" || r.error === "rate_limited" || r.status === 429 || /\brate_limited\b/.test(String(r.message ?? ""));
}

/** Friendly German text for a rate-limited answer, or null if it is something else. */
export function rateLimitText(reason: unknown): string | null {
  if (!isRateLimited(reason)) return null;
  const r = (typeof reason === "object" ? reason : {}) as Shape;
  const details = typeof r.details === "string" ? r.details.trim() : "";
  if (details) return details;
  // databaseError() joins "code | message | details | hint" into the message
  const fromMessage = /rate_limited \| RATE_LIMITED \| ([^|]+)/.exec(String(r.message ?? ""))?.[1]?.trim();
  if (fromMessage) return fromMessage;
  if (r.error === "rate_limited" && typeof r.message === "string" && r.message.trim()) return r.message.trim();
  return RATE_LIMIT_FALLBACK;
}
