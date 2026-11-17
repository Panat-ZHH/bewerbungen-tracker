// Pure access logic (no I/O): typed parse of public.my_access() / app_access() jsonb into AccessInfo, and a TS mirror of the
// SQL decision in supabase/migrations/20261118010000_access_core.sql (public.app_access). The SQL is the truth; this mirror
// exists for unit tests, docs and UI previews – keep both in sync (tests/access-core.test.mjs replays the same cases).
import type { AccessExpiredReason, AccessInfo, AccessReason, AccessRole, AccessState, AccessSubscription } from "./types.ts";

export const TRIAL_DAYS = 7;
export const GRACE_DAYS = 7;
/** An 'active' subscription whose period ended more than this ago (missed webhook) no longer counts. */
export const STALE_PERIOD_MS = 2 * 86400000;
const DAY = 86400000;

export type EnforceMode = "off" | "test_users" | "on";
export type SubStatus = "incomplete" | "incomplete_expired" | "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "paused";

export interface SubLike {
  plan: "solo" | "family";
  status: SubStatus | string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  updated_at?: string | null;
}

export interface AccessInput {
  now: Date;
  mode: EnforceMode;
  enforceTest: boolean;
  blockedAt: string | null;
  grantUntil: string | null; // account_access.free_access_until
  trialEndsAt: string; // account_access.trial_ends_at
  role: AccessRole;
  accountType: AccessInfo["account_type"];
  /** Licensed school the user is linked to (student via class, staff via school_admins / school_teachers / classes). */
  licensedSchool: { id: string; name: string; valid_until: string | null } | null;
  /** Linked to a school that has licence rows but none valid today. */
  licenceEnded: boolean;
  solo: SubLike | null;
  family: { role: "parent" | "child"; sub: SubLike | null; adminPlan: boolean } | null;
}

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

/** past_due: 7 days from the start of the unpaid period (Stripe already moved the period forward). */
export function graceUntil(sub: SubLike | null): string | null {
  if (!sub || sub.status !== "past_due") return null;
  const candidates = [ms(sub.current_period_start), ms(sub.current_period_end)].filter(Number.isFinite);
  const base = candidates.length ? Math.min(...candidates) : ms(sub.updated_at);
  return Number.isFinite(base) ? new Date(base + GRACE_DAYS * DAY).toISOString() : null;
}

export function subState(sub: SubLike | null, now: Date): "active" | "grace" | "none" {
  if (!sub) return "none";
  if ((sub.status === "active" || sub.status === "trialing")
    && (!sub.current_period_end || ms(sub.current_period_end) > now.getTime() - STALE_PERIOD_MS)) return "active";
  const g = graceUntil(sub);
  if (g && ms(g) > now.getTime()) return "grace";
  return "none";
}

export function intervalOf(sub: SubLike | null): "month" | "year" | null {
  if (!sub?.current_period_start || !sub.current_period_end) return null;
  return ms(sub.current_period_end) - ms(sub.current_period_start) <= 62 * DAY ? "month" : "year";
}

export function trialDaysLeft(trialEndsAt: string | null, now: Date): number | null {
  if (!trialEndsAt) return null;
  return Math.max(0, Math.ceil((ms(trialEndsAt) - now.getTime()) / DAY));
}

/** Mirror of public.app_access(uid). */
export function decideAccess(i: AccessInput): AccessInfo {
  const now = i.now;
  const staff = i.role === "teacher" || i.role === "school_admin";
  const blocked = i.blockedAt !== null;
  const enforced = i.mode === "on" || (i.mode === "test_users" && i.enforceTest) || (blocked && i.mode !== "off");
  const grant = i.grantUntil && ms(i.grantUntil) > now.getTime() ? i.grantUntil : null;
  const fam = i.family;
  const famSub = fam?.sub ?? null;
  const famPlan = Boolean(fam?.adminPlan);

  let state: AccessState, reason: AccessReason, grace: string | null = null;
  if (blocked && i.mode !== "off") { state = "blocked"; reason = "none"; }
  else if (grant) { state = "active"; reason = "grant"; }
  else if (i.licensedSchool) { state = "active"; reason = "school_licence"; }
  // Teachers / school admins only via licence or grant, never via a subscription (security review S1, 20261118300000).
  else if (staff) { state = "licence_required"; reason = "none"; }
  else if (subState(i.solo, now) === "active") { state = "active"; reason = "subscription"; }
  else if (subState(famSub, now) === "active" || famPlan) { state = "active"; reason = "family_subscription"; }
  else if (subState(i.solo, now) === "grace") { state = "grace"; reason = "grace"; grace = graceUntil(i.solo); }
  else if (subState(famSub, now) === "grace") { state = "grace"; reason = "grace"; grace = graceUntil(famSub); }
  else if (ms(i.trialEndsAt) > now.getTime()) { state = "trial"; reason = "trial"; }
  else { state = "expired"; reason = "none"; }
  const real = state === "active" || state === "trial" || state === "grace";

  const familyPending = fam?.role === "child" && reason !== "family_subscription" && subState(famSub, now) === "none" && !famPlan;
  let expired: AccessExpiredReason | null = null;
  if (state === "expired" || state === "licence_required") {
    const lastStatus = i.solo?.status ?? famSub?.status;
    if (lastStatus === "past_due" || lastStatus === "unpaid") expired = "payment_failed";
    else if (state === "expired" && familyPending) expired = "family_pending";
    else if ((i.solo || famSub) && state === "expired") expired = "subscription_ended";
    else if (i.licenceEnded) expired = "licence_ended";
    else if (state === "expired") expired = "trial_ended";
  }

  const trialEnd = staff || reason === "school_licence" ? null : i.trialEndsAt;
  const shown = i.solo ?? famSub;
  const subscription: AccessSubscription | null = shown ? {
    plan: shown.plan, status: shown.status, interval: intervalOf(shown),
    current_period_end: shown.current_period_end, cancel_at_period_end: shown.cancel_at_period_end,
  } : null;

  return {
    has_access: enforced ? real : true,
    state, reason, role: i.role,
    account_type: staff ? null : i.accountType,
    trial_ends_at: trialEnd,
    trial_days_left: trialDaysLeft(trialEnd, now),
    grace_until: grace,
    grant_until: grant,
    subscription,
    school: i.licensedSchool,
    blocked,
    enforced,
    expired_reason: expired,
    family_pending: familyPending,
  };
}

// ---------------------------------------------------------------- parsing the RPC answer
const STATES: AccessState[] = ["active", "trial", "grace", "expired", "licence_required", "blocked"];
const REASONS: AccessReason[] = ["school_licence", "subscription", "family_subscription", "grant", "trial", "grace", "none"];
const ROLES: AccessRole[] = ["student", "parent", "teacher", "school_admin"];
const ACCOUNT_TYPES = ["school_student", "independent_student", "parent"] as const;
const EXPIRED: AccessExpiredReason[] = ["trial_ended", "subscription_ended", "payment_failed", "licence_ended", "family_pending"];

const str = (v: unknown): string | null => (typeof v === "string" && v.length <= 200 ? v : null);
const iso = (v: unknown): string | null => {
  const s = str(v);
  return s && Number.isFinite(Date.parse(s)) ? s : null;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | null => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : null);

/**
 * Typed parse of the my_access() jsonb. Returns null for anything that is not an AccessInfo (wrong shape = treat like
 * "feature not available", see FULL_ACCESS). Unknown extra keys are ignored; optional newer keys get safe defaults.
 */
export function parseAccessInfo(raw: unknown): AccessInfo | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const state = oneOf(r.state, STATES), reason = oneOf(r.reason, REASONS), role = oneOf(r.role, ROLES);
  if (typeof r.has_access !== "boolean" || !state || !reason || !role) return null;
  let subscription: AccessSubscription | null = null;
  if (r.subscription && typeof r.subscription === "object") {
    const s = r.subscription as Record<string, unknown>;
    const plan = oneOf(s.plan, ["solo", "family"] as const);
    if (plan && str(s.status)) {
      subscription = { plan, status: s.status as string, interval: oneOf(s.interval, ["month", "year"] as const),
        current_period_end: iso(s.current_period_end), cancel_at_period_end: s.cancel_at_period_end === true };
    }
  }
  let school: AccessInfo["school"] = null;
  if (r.school && typeof r.school === "object") {
    const s = r.school as Record<string, unknown>;
    if (str(s.id) && typeof s.name === "string") school = { id: s.id as string, name: s.name.slice(0, 200), valid_until: str(s.valid_until) };
  }
  const days = typeof r.trial_days_left === "number" && Number.isFinite(r.trial_days_left) ? Math.max(0, Math.floor(r.trial_days_left)) : null;
  return {
    has_access: r.has_access,
    state, reason, role,
    account_type: oneOf(r.account_type, ACCOUNT_TYPES),
    trial_ends_at: iso(r.trial_ends_at),
    trial_days_left: days,
    grace_until: iso(r.grace_until),
    grant_until: iso(r.grant_until),
    subscription,
    school,
    blocked: r.blocked === true,
    enforced: r.enforced === true,
    expired_reason: oneOf(r.expired_reason, EXPIRED),
    family_pending: r.family_pending === true,
  };
}

/** What the app assumes when the database does not know my_access yet (PGRST202) – the feature is simply off. */
export const FULL_ACCESS: AccessInfo = Object.freeze({
  has_access: true, state: "active", reason: "none", role: "student", account_type: null, trial_ends_at: null,
  trial_days_left: null, grace_until: null, grant_until: null, subscription: null, school: null, blocked: false,
  enforced: false, expired_reason: null, family_pending: false,
}) as AccessInfo;

/**
 * Matches the RLS error of the restrictive "access gate insert/update" policies (20261118020000_access_guards.sql):
 * `new row violates row-level security policy "access gate insert" for table "applications"` (also inside a JSON body,
 * where the quote is escaped).
 */
export const ACCESS_GATE_RLS_RE = /row-level security policy \\?"access gate\b/i;

/**
 * True for every way the server says "paywall": the error raised by public._assert_app_access() and the profiles/cvs
 * triggers (PostgREST: code P0001, message 'PAYWALL'), the RLS error of the "access gate" policies, and HTTP 402
 * `{"error":"paywall"}` from our API routes / the ai-review edge function.
 */
export function isPaywallError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "string") return /\bPAYWALL\b/.test(error) || ACCESS_GATE_RLS_RE.test(error);
  if (typeof error !== "object") return false;
  const e = error as { message?: unknown; code?: unknown; error?: unknown; status?: unknown; details?: unknown };
  if (Number(e.status) === 402) return true;
  if (String(e.error ?? "").toLowerCase() === "paywall") return true;
  const text = `${typeof e.message === "string" ? e.message : ""} ${typeof e.details === "string" ? e.details : ""}`;
  if (ACCESS_GATE_RLS_RE.test(text)) return true;
  return /\bPAYWALL\b/.test(text) && (e.code === undefined || e.code === null || e.code === "P0001");
}

/** True when the RPC does not exist (old database before the migration): PostgREST PGRST202 / Postgres 42883. */
export function isMissingFunction(error: unknown): boolean {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  return code === "PGRST202" || code === "42883";
}
