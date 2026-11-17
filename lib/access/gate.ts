// Pure UI decisions for the access model (docs/access/SPEC.md §1, §6, §7). No imports with side effects: unit tested in
// tests/access-ui.test.mjs and safe in client components.
import type { AccessGrant, AccessInfo } from "./types";
import { ACCESS_GATE_RLS_RE, parseGrant } from "./core.ts";

/** What the shell renders instead of (or around) a page. */
export type AccessView = "page" | "paywall" | "licence" | "blocked";

export const ABO_PATH = "/abo";
export const LICENCE_PATH = "/schullizenz";
export const SUPPORT_EMAIL = "support@wendapply.ch";
export const CONTACT_PATH = "/kontakt";

function under(path: string, prefix: string) { return path === prefix || path.startsWith(`${prefix}/`); }
function clean(pathname: string | null | undefined) { return String(pathname ?? "/").split(/[?#]/)[0] || "/"; }

/** Pages everybody may open even without access (export/delete, billing, help, legal, auth). */
const ALWAYS_OPEN = [
  "/settings", ABO_PATH, LICENCE_PATH, CONTACT_PATH, "/hilfe", "/anleitung", "/preise", "/auth", "/login",
  "/datenschutz", "/datenschutz-jugend", "/datenschutz-schulen", "/datenschutz-uebersicht", "/impressum", "/avv", "/loeschkonzept", "/hosting",
  // Joining a class of a licensed school is how a student gets access through the school.
  "/classes/join",
  // A family invite link must stay usable: joining the parent's family is how a child gets covered by the family plan.
  "/familie/einladung",
];
/** Pages a blocked account may still open: export + delete, contact, help, legal, auth. No billing. */
const BLOCKED_OPEN = ["/settings", CONTACT_PATH, "/hilfe", "/auth", "/login", "/datenschutz", "/datenschutz-jugend", "/impressum"];

/** Allow-listed path for a user without access (also /familie: family plan = the way to pay for parent and child). */
export function isAllowListed(pathname: string | null | undefined, opts: { parent?: boolean } = {}): boolean {
  const path = clean(pathname);
  if (ALWAYS_OPEN.some((prefix) => under(path, prefix))) return true;
  // The class list with the "Klassencode" field (G1): joining a licensed class is how a student gets access.
  if (path === "/classes" || path === "/classes/") return true;
  // /familie: parents create the family, invite and pay; children invite their parents (who then pay). No app content there.
  return under(path, "/familie") || (!!opts.parent && under(path, "/familie"));
}

/** True when the rules apply to this user (enforcement switch on + a real answer from the database). */
export function isEnforced(access: AccessInfo | null | undefined): access is AccessInfo { return !!access && access.enforced === true; }

/** Teachers and school admins never get a trial or a paywall: without a licence they see the licence gate. */
export function isStaff(access: Pick<AccessInfo, "role"> | null | undefined): boolean { return access?.role === "teacher" || access?.role === "school_admin"; }

/** What to render for `pathname`. Unknown / not enforced / has access → the page itself. */
export function accessView(access: AccessInfo | null | undefined, pathname: string | null | undefined, opts: { parent?: boolean } = {}): AccessView {
  if (!isEnforced(access)) return "page";
  const path = clean(pathname);
  if (access.blocked || access.state === "blocked") return BLOCKED_OPEN.some((prefix) => under(path, prefix)) ? "page" : "blocked";
  if (access.has_access) return "page";
  if (isAllowListed(path, { parent: opts.parent || access.account_type === "parent" })) return "page";
  // School admins keep /schul-admin (licence status, renew) even without a valid licence (G6).
  if (access.role === "school_admin" && under(path, "/schul-admin")) return "page";
  if (access.state === "licence_required" || isStaff(access)) return "licence";
  return "paywall";
}

/** Did the answer come from the database (not the "feature off / not deployed" fallback)? */
export function isServerAccess(access: AccessInfo | null | undefined): access is AccessInfo { return !!access && access !== OPEN_ACCESS; }

/**
 * Parent account? Server truth (my_access().account_type) once it is known; the client-writable metadata only as a
 * fallback before the RPC exists (G20 / FINDINGS 2).
 */
export function isParentAccount(meta: Record<string, unknown> | null | undefined, access: AccessInfo | null | undefined): boolean {
  if (isServerAccess(access) && access.account_type) return access.account_type === "parent";
  return meta?.account_type === "parent";
}

/** School admin by server truth (my_access().role). */
export function isSchoolAdmin(access: AccessInfo | null | undefined): boolean { return isServerAccess(access) && access.role === "school_admin"; }

/** Where a signed-in user without access should land after login (null = normal landing). */
export function accessLanding(access: AccessInfo | null | undefined): string | null {
  if (!isEnforced(access) || access.has_access) return null;
  if (access.blocked || access.state === "blocked") return "/settings";
  if (access.role === "school_admin") return "/schul-admin";
  if (access.state === "licence_required" || isStaff(access)) return LICENCE_PATH;
  if (access.account_type === "parent") return "/familie";
  return ABO_PATH;
}

/** Students with access through their school (or staff) never see prices, trials or the paywall. */
export function hidesPrices(access: AccessInfo | null | undefined): boolean {
  if (!access) return false;
  return access.reason === "school_licence" || isStaff(access);
}

export type AccessBanner =
  | { kind: "trial"; daysLeft: number; endsAt: string | null }
  | { kind: "grace"; until: string | null }
  | null;

/** Banner above the page: trial countdown or failed payment. Only when enforced, never for school-licensed users or staff. */
export function accessBanner(access: AccessInfo | null | undefined): AccessBanner {
  if (!isEnforced(access) || !access.has_access || hidesPrices(access)) return null;
  if (access.state === "trial") return { kind: "trial", daysLeft: Math.max(0, access.trial_days_left ?? 0), endsAt: access.trial_ends_at };
  if (access.state === "grace") return { kind: "grace", until: access.grace_until };
  return null;
}

/** "noch 3 Tage" / "noch 1 Tag" / "heute letzter Tag". */
export function daysLeftText(days: number): string {
  if (days <= 0) return "heute letzter Tag";
  return days === 1 ? "noch 1 Tag" : `noch ${days} Tage`;
}

/** Which plan the /abo page offers: parents the family plan, students the individual plan (both can see family). */
export function aboPlansFor(access: Pick<AccessInfo, "account_type" | "role"> | null | undefined): ("solo" | "family")[] {
  if (!access) return ["solo", "family"];
  if (isStaff(access)) return [];
  if (access.account_type === "parent") return ["family"];
  return ["solo", "family"];
}

/** One detector for UI and backend: PAYWALL (P0001), "access gate" RLS errors and HTTP 402 (see lib/access/core.ts). */
export { isPaywallError, ACCESS_GATE_RLS_RE } from "./core.ts";

/**
 * Does a 4xx body from Supabase REST/storage mean "paywall"? 'PAYWALL' (RPCs, profiles/cvs triggers), the "access gate"
 * RLS policies, and – because the storage API drops the policy name – any row-level security refusal from storage.
 * Reporting only re-reads my_access(), so a false positive costs one request and never shows the paywall by itself.
 */
export function paywallBody(text: string, url = ""): boolean {
  if (/\bPAYWALL\b/.test(text) || ACCESS_GATE_RLS_RE.test(text)) return true;
  return /\/storage\/v1\//.test(url) && /row-level security/i.test(text);
}

/** Interprets a my_access() result (defensive: unknown shapes count as "not enforced"). */
export function readAccessInfo(data: unknown): AccessInfo | null {
  const row = (Array.isArray(data) ? data[0] : data) as Partial<AccessInfo> | null | undefined;
  if (!row || typeof row !== "object" || typeof row.has_access !== "boolean") return null;
  return {
    has_access: row.has_access,
    state: (row.state ?? (row.has_access ? "active" : "expired")) as AccessInfo["state"],
    reason: (row.reason ?? "none") as AccessInfo["reason"],
    role: (row.role ?? "student") as AccessInfo["role"],
    account_type: row.account_type ?? null,
    trial_ends_at: row.trial_ends_at ?? null,
    trial_days_left: typeof row.trial_days_left === "number" ? row.trial_days_left : null,
    grace_until: row.grace_until ?? null,
    grant_until: row.grant_until ?? null,
    grant: parseGrant(row.grant),
    subscription: row.subscription ?? null,
    school: row.school ?? null,
    blocked: row.blocked === true,
    enforced: row.enforced === true,
    expired_reason: row.expired_reason ?? null,
    family_pending: row.family_pending === true,
  };
}

/** Feature switched off / not deployed: full access, no UI. */
export const OPEN_ACCESS: AccessInfo = {
  has_access: true, state: "active", reason: "none", role: "student", account_type: null, trial_ends_at: null, trial_days_left: null,
  grace_until: null, grant_until: null, grant: null, subscription: null, school: null, blocked: false, enforced: false,
  expired_reason: null, family_pending: false,
};

/** Free access granted by WendApply that applies now (person or school), else null. */
export function freeGrant(access: AccessInfo | null | undefined): AccessGrant | null {
  if (!access?.has_access || !access.grant) return null;
  return access.grant;
}

/** "Gratis (unbefristet)" / "Gratis bis 31.12.2027" (date formatted by the caller's formatter). */
export function freeGrantLabel(grant: Pick<AccessGrant, "forever" | "until"> | null | undefined, formatDate: (iso: string) => string): string | null {
  if (!grant) return null;
  if (grant.forever) return "Gratis (unbefristet)";
  return grant.until ? `Gratis bis ${formatDate(grant.until)}` : null;
}
