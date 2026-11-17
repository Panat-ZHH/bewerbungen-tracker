// Abuse and cost limits of the ai-review function. All counters are persistent (public.rate_limit_hit, shared by all
// edge-function instances). Pure module (imports only ../_shared/rate-limit-core.ts): runs in Deno and Node.
//
// Env (Supabase function secrets) – every value has a safe default, "0" switches the respective thing off:
//   AI_REVIEW_DISABLED=1               kill switch: no AI calls at all (503 "unavailable")
//   AI_REVIEW_IP_LIMIT                 requests per IP per 10 min (default 60 – school classes share one IP)
//   AI_REVIEW_BURST_LIMIT              checks per user per 10 min (default 5)
//   AI_REVIEW_DEFAULT_DAILY_LIMIT      checks per user per day (default 10; a per-user ai_review_user_settings.daily_limit wins)
//   AI_DAILY_BUDGET_USER_TOKENS        budget units per user per day (default 300'000 ≈ 25 checks)
//   AI_DAILY_BUDGET_GLOBAL_TOKENS      budget units for everybody per day (default 20'000'000), the global cost kill switch
// Budget units = input-token equivalents (see budgetUnits in anthropic.ts). Days are UTC days.
import { envInt, hit, ipKey, type RateLimitResult, type RateLimitRpc } from "../_shared/rate-limit-core.ts";
import { ReviewFailure } from "./errors.ts";

export const DAY = 86_400;
export const TEN_MIN = 600;

export const DEFAULTS = {
  ipPer10Min: 60,
  burstPer10Min: 5,
  dailyChecks: 10,
  userDailyBudget: 300_000,
  globalDailyBudget: 20_000_000,
} as const;

export interface LimitConfig {
  disabled: boolean;
  ipPer10Min: number;
  burstPer10Min: number;
  defaultDailyChecks: number;
  userDailyBudget: number;
  globalDailyBudget: number;
}

export function limitConfig(env: (name: string) => string | undefined): LimitConfig {
  return {
    disabled: env("AI_REVIEW_DISABLED")?.trim() === "1",
    ipPer10Min: envInt(env("AI_REVIEW_IP_LIMIT"), DEFAULTS.ipPer10Min),
    burstPer10Min: envInt(env("AI_REVIEW_BURST_LIMIT"), DEFAULTS.burstPer10Min),
    defaultDailyChecks: envInt(env("AI_REVIEW_DEFAULT_DAILY_LIMIT"), DEFAULTS.dailyChecks),
    userDailyBudget: envInt(env("AI_DAILY_BUDGET_USER_TOKENS"), DEFAULTS.userDailyBudget),
    globalDailyBudget: envInt(env("AI_DAILY_BUDGET_GLOBAL_TOKENS"), DEFAULTS.globalDailyBudget),
  };
}

/** Per-user setting (teacher/admin) wins over the env default. */
export function dailyChecksFor(userLimit: number | null | undefined, config: LimitConfig): number {
  return typeof userLimit === "number" && Number.isInteger(userLimit) && userLimit >= 0 ? userLimit : config.defaultDailyChecks;
}

/** Header view for the Supabase edge runtime: Netlify's client-IP header is not trusted there. */
export function edgeHeaders(headers: { get(name: string): string | null }): { get(name: string): string | null } {
  return { get: (name) => (name.toLowerCase().startsWith("x-nf-") ? null : headers.get(name)) };
}

export const keys = {
  // x-nf-client-connection-ip is set by NETLIFY only; on Supabase it is a plain client header (forgeable, would bypass
  // the per-IP limit with a new fake IP per request). Hide it here so the shared core falls back to cf-connecting-ip.
  ip: (headers: { get(name: string): string | null }) => ipKey("ai-review", edgeHeaders(headers)),
  burst: (userId: string) => `ai-review:user:${userId}:burst`,
  day: (userId: string) => `ai-review:user:${userId}:day`,
  userTokens: (userId: string) => `ai-review:user:${userId}:tokens`,
  globalTokens: "ai-review:global:tokens",
};

const MSG = {
  ip: "Von deinem Netzwerk kommen gerade sehr viele Checks. Bitte warte ein paar Minuten und versuche es dann nochmals.",
  burst: "Du hast gerade mehrere Checks kurz hintereinander gemacht. Setz zuerst ein paar Tipps um und versuche es in ein paar Minuten nochmals.",
  disabledForUser: "Der Bewerbungs-Check ist für dein Konto im Moment nicht freigeschaltet. Frag deine Lehrperson.",
  daily: (n: number) => `Du hast heute schon ${n} ${n === 1 ? "Check" : "Checks"} gemacht. Morgen kannst du deine Bewerbung wieder prüfen lassen.`,
  budget: "Für heute hast du alle Checks gebraucht. Morgen kannst du deine Bewerbung wieder prüfen lassen.",
  global: "Der Bewerbungs-Check macht für heute Pause, weil sehr viele ihn benutzt haben. Morgen geht es wieder.",
  degraded: "Der Bewerbungs-Check ist gerade nicht erreichbar. Bitte versuche es in ein paar Minuten nochmals.",
};

/** Limiter results → friendly failure. A database problem fails CLOSED (503): an AI call costs money. */
function fail(r: RateLimitResult, code: "rate_limited" | "unavailable", message: string, detail: string): never {
  if (r.degraded) throw new ReviewFailure("unavailable", MSG.degraded, `limiter error (${detail})`, r.retryAfter);
  throw new ReviewFailure(code, message, detail, r.retryAfter);
}

const opts = (rpc: RateLimitRpc) => ({ rpc, onError: "deny" as const, errorRetryAfter: 60 });

export class AiLimiter {
  private readonly rpc: RateLimitRpc;
  readonly config: LimitConfig;
  constructor(rpc: RateLimitRpc, config: LimitConfig) {
    this.rpc = rpc;
    this.config = config;
  }

  /** Before auth: kill switch + per-IP limit (also slows down token guessing). */
  async checkRequest(headers: { get(name: string): string | null }): Promise<void> {
    if (this.config.disabled) throw new ReviewFailure("unavailable", undefined, "disabled by AI_REVIEW_DISABLED", 3600);
    const r = await hit({ key: await keys.ip(headers), limit: this.config.ipPer10Min, windowSeconds: TEN_MIN }, opts(this.rpc));
    if (!r.allowed) fail(r, "rate_limited", MSG.ip, "ip limit");
  }

  /** After auth, before the (CPU-heavy) file parsing: short burst limit per user. */
  async checkBurst(userId: string): Promise<void> {
    const r = await hit({ key: keys.burst(userId), limit: this.config.burstPer10Min, windowSeconds: TEN_MIN }, opts(this.rpc));
    if (!r.allowed) fail(r, "rate_limited", MSG.burst, "burst limit");
  }

  /**
   * Right before the AI call: counts one daily check, then checks that the user and the global budget can still take a
   * worst-case call. Returns a refund function (call it if the check does not produce a result).
   */
  async reserve(userId: string, userDailyLimit: number | null, estimate: number): Promise<() => Promise<void>> {
    const daily = dailyChecksFor(userDailyLimit, this.config);
    if (daily === 0) throw new ReviewFailure("rate_limited", MSG.disabledForUser, "daily limit 0", DAY);
    const o = opts(this.rpc);
    const d = await hit({ key: keys.day(userId), limit: daily, windowSeconds: DAY }, o);
    if (!d.allowed) fail(d, "rate_limited", MSG.daily(daily), "daily limit");
    const refund = async () => { await hit({ key: keys.day(userId), limit: daily, windowSeconds: DAY, cost: -1 }, o); };

    // Budgets: peek only (cost 0) – the real usage is added after the call. "Remaining < estimate" = no room left.
    const g = await hit({ key: keys.globalTokens, limit: Math.max(0, this.config.globalDailyBudget - estimate), windowSeconds: DAY, cost: 0 }, o);
    if (!g.allowed || this.config.globalDailyBudget === 0) {
      await refund();
      fail({ ...g, allowed: false, retryAfter: g.retryAfter || 3600 }, "unavailable", MSG.global, "global budget");
    }
    const u = await hit({ key: keys.userTokens(userId), limit: Math.max(0, this.config.userDailyBudget - estimate), windowSeconds: DAY, cost: 0 }, o);
    if (!u.allowed || this.config.userDailyBudget === 0) {
      await refund();
      fail({ ...u, allowed: false, retryAfter: u.retryAfter || 3600 }, "rate_limited", MSG.budget, "user budget");
    }
    return refund;
  }

  /** Adds the billed usage to the user and the global budget (best effort: never fails the request). */
  async record(userId: string, units: number): Promise<void> {
    const cost = Math.max(0, Math.ceil(units));
    if (!cost) return;
    const o = { rpc: this.rpc };
    await hit({ key: keys.userTokens(userId), limit: this.config.userDailyBudget, windowSeconds: DAY, cost }, o);
    await hit({ key: keys.globalTokens, limit: this.config.globalDailyBudget, windowSeconds: DAY, cost }, o);
  }
}
