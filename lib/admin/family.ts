// Family package granted by a platform admin ("Familienpaket vergeben", docs/access/ADMIN.md §Familienpaket).
// Pure (no I/O): input validation for the API, the mapping of the database errors of admin_family_grant / _revoke
// (supabase/migrations/20261120100000_admin_family_grant.sql) and small helpers for the admin UI. Safe in client
// components, server code and node tests.
import { DAY_MS, InvalidInput, int, onlyKeys, text } from "./validate.ts";

/** Defaults of a manual grant (the paid plan has 1 parent + 1 child; a granted package is meant for a whole family). */
export const FAMILY_GRANT_DEFAULT_SEATS = { parents: 2, children: 4 } as const;
export const FAMILY_SEAT_LIMITS = { parents: { min: 1, max: 10 }, children: { min: 1, max: 20 } } as const;
export const FAMILY_NOTE_MAX = 500;
/** A grant ends at most 10 years from now (same limit as the free access grant); null = unlimited. */
export const FAMILY_MAX_YEARS = 10;

export interface FamilyGrantInput {
  /** ISO timestamp (last day of access in Europe/Zurich), null = unlimited. */
  until: string | null;
  note: string | null;
  seats_parents: number;
  seats_children: number;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * End of a grant: null (unlimited) or a calendar day "YYYY-MM-DD" (the last day with access) or a full ISO timestamp.
 * A day is sent to the database as 21:00 UTC of that day (22:00 / 23:00 in Zurich), so the stored valid_until is
 * exactly that day. Must lie in the future and at most 10 years ahead.
 */
export function familyUntil(v: unknown, now: Date): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new InvalidInput("until");
  let ms: number;
  const m = DATE_RE.exec(v);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(Date.UTC(y, mo - 1, d, 21, 0, 0));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) throw new InvalidInput("until");
    ms = dt.getTime();
  } else if (DATETIME_RE.test(v)) ms = Date.parse(v);
  else throw new InvalidInput("until");
  if (!Number.isFinite(ms) || ms <= now.getTime() || ms > now.getTime() + FAMILY_MAX_YEARS * 365 * DAY_MS) throw new InvalidInput("until");
  return new Date(ms).toISOString();
}

/** POST /api/admin/users/:id/family body: { confirm: true, until?: day|iso|null, note?, seats_parents?, seats_children? }. */
export function familyGrantInput(body: Record<string, unknown>, now: Date): FamilyGrantInput {
  onlyKeys(body, ["until", "note", "seats_parents", "seats_children"]);
  return {
    until: familyUntil(body.until, now),
    note: text(body.note, "note", { max: FAMILY_NOTE_MAX, optional: true }),
    seats_parents: body.seats_parents === undefined || body.seats_parents === null ? FAMILY_GRANT_DEFAULT_SEATS.parents
      : int(body.seats_parents, "seats_parents", FAMILY_SEAT_LIMITS.parents.min, FAMILY_SEAT_LIMITS.parents.max),
    seats_children: body.seats_children === undefined || body.seats_children === null ? FAMILY_GRANT_DEFAULT_SEATS.children
      : int(body.seats_children, "seats_children", FAMILY_SEAT_LIMITS.children.min, FAMILY_SEAT_LIMITS.children.max),
  };
}

/** DELETE /api/admin/users/:id/family body: { confirm: true, note? }. */
export function familyRevokeInput(body: Record<string, unknown>): { note: string | null } {
  onlyKeys(body, ["note"]);
  return { note: text(body.note, "note", { max: FAMILY_NOTE_MAX, optional: true }) };
}

/** Error codes raised by the admin_family_* functions. */
export const FAMILY_DB_ERRORS = [
  "FORBIDDEN", "NOT_FOUND", "INVALID_UNTIL", "INVALID_NOTE", "INVALID_SEATS", "NOT_ELIGIBLE", "FAMILY_PENDING", "STRIPE_MANAGED",
  "SEATS_TOO_LOW", "NOT_GRANTED", "REAUTH_REQUIRED",
] as const;
export type FamilyDbError = (typeof FAMILY_DB_ERRORS)[number];

/** Thrown by the store when an admin_family_* call fails with one of the known codes (or "RPC_MISSING" before the migration). */
export class FamilyRpcError extends Error {
  readonly code: FamilyDbError | "RPC_MISSING";
  constructor(code: FamilyDbError | "RPC_MISSING") { super(`FAMILY_RPC:${code}`); this.name = "FamilyRpcError"; this.code = code; }
}

/** PostgREST error → known code (raise exception 'CODE' arrives as message 'CODE'), null = unknown. */
export function familyDbErrorCode(error: { code?: string | null; message?: string | null } | null | undefined): FamilyDbError | "RPC_MISSING" | null {
  if (!error) return null;
  if (["PGRST202", "42883"].includes(error.code ?? "")) return "RPC_MISSING";
  const msg = String(error.message ?? "").trim();
  return (FAMILY_DB_ERRORS as readonly string[]).includes(msg) ? (msg as FamilyDbError) : null;
}

/** How the API answers each code: invalid input (field), 404, or a 409 conflict reason (texts in components/admin/api.ts). */
export function familyErrorHttp(code: FamilyDbError | "RPC_MISSING"):
  | { kind: "invalid"; field: string } | { kind: "not_found" } | { kind: "conflict"; reason: string } | { kind: "not_configured" }
  | { kind: "reauth" } {
  switch (code) {
    case "INVALID_UNTIL": return { kind: "invalid", field: "until" };
    case "INVALID_NOTE": return { kind: "invalid", field: "note" };
    case "INVALID_SEATS": return { kind: "invalid", field: "seats_children" };
    case "NOT_FOUND":
    case "FORBIDDEN": return { kind: "not_found" }; // like the guard: the admin route does not "exist" for non-admins
    case "RPC_MISSING": return { kind: "not_configured" };
    case "REAUTH_REQUIRED": return { kind: "reauth" }; // the database's own MFA / fresh-login check (same rule as the guard)
    case "STRIPE_MANAGED": return { kind: "conflict", reason: "stripe_managed" };
    case "NOT_GRANTED": return { kind: "conflict", reason: "family_not_granted" };
    case "NOT_ELIGIBLE": return { kind: "conflict", reason: "family_not_eligible" };
    case "FAMILY_PENDING": return { kind: "conflict", reason: "family_pending" };
    case "SEATS_TOO_LOW": return { kind: "conflict", reason: "seats_too_low" };
  }
}

// ---------------------------------------------------------------- UI helpers

export type FamilyDuration = "1" | "3" | "6" | "12" | "unlimited" | "custom";
export const FAMILY_DURATIONS: { value: FamilyDuration; label: string }[] = [
  { value: "1", label: "1 Monat" }, { value: "3", label: "3 Monate" }, { value: "6", label: "6 Monate" }, { value: "12", label: "12 Monate" },
  { value: "unlimited", label: "Unbefristet" }, { value: "custom", label: "Eigenes Datum" },
];

/** "YYYY-MM-DD" in Zurich `months` calendar months after `now` (end of month clamps: 31.1. + 1 → 28./29.2.). */
export function addMonthsDay(months: number, now = new Date()): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(now);
  const [y, m, d] = today.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export interface FamilyGrantForm { duration: FamilyDuration; custom: string; note: string; seats_parents: string; seats_children: string }
export const emptyFamilyGrantForm = (): FamilyGrantForm => ({
  duration: "12", custom: "", note: "", seats_parents: String(FAMILY_GRANT_DEFAULT_SEATS.parents), seats_children: String(FAMILY_GRANT_DEFAULT_SEATS.children),
});

/** Form → API body (without confirm). until: day for presets / custom, null for unlimited. */
export function familyGrantBody(f: FamilyGrantForm, now = new Date()): Record<string, unknown> {
  const until = f.duration === "unlimited" ? null : f.duration === "custom" ? f.custom : addMonthsDay(Number(f.duration), now);
  const body: Record<string, unknown> = { until, seats_parents: Number(f.seats_parents), seats_children: Number(f.seats_children) };
  if (f.note.trim()) body.note = f.note.trim();
  return body;
}

export type FamilyPlanKind = "grant" | "school" | "solo" | "family_manual" | "family_stripe" | "grace" | "trial" | "none";
export const FAMILY_PLAN_KIND_LABEL: Record<FamilyPlanKind, string> = {
  grant: "Gratis-Zugang (Admin)",
  school: "Schullizenz",
  solo: "Eigenes Abo (Stripe)",
  family_manual: "Familienpaket (vom Admin)",
  family_stripe: "Familien-Abo (Stripe)",
  grace: "Zahlung offen",
  trial: "Testwoche",
  none: "Kein Zugang",
};

export const FAMILY_ROLE_LABEL: Record<string, string> = { parent: "Elternteil", child: "Kind" };
export const FAMILY_MEMBER_STATUS_LABEL: Record<string, string> = { active: "aktiv", pending: "Einladung offen", removed: "entfernt" };
export const FAMILY_LICENCE_STATE_LABEL: Record<string, string> = {
  active: "Aktiv", pilot: "Pilot", trial: "Noch nicht gebucht", paused: "Pausiert", expired: "Abgelaufen", cancelled: "Entzogen", not_started: "Startet später",
};

/** "admin:<uuid>" → "Admin", "stripe" → "Stripe", anything else as is. */
export function assignedByLabel(v: string | null | undefined, adminEmail?: (id: string) => string | null): string {
  if (!v) return "–";
  if (v.startsWith("admin:")) {
    const id = v.slice(6);
    return `Admin ${adminEmail?.(id) ?? id.slice(0, 8)}`;
  }
  return v === "stripe" ? "Stripe" : v;
}
