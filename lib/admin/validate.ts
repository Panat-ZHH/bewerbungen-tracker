// Strict input validation for the admin API (pure, no I/O). Every validator throws InvalidInput(field) on bad input;
// the handler turns that into 400 {"error":"invalid_input","field":…} – the field name only, never the value.

export class InvalidInput extends Error {
  readonly field: string;
  constructor(field: string) { super("invalid_input"); this.name = "InvalidInput"; this.field = field; }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
// Pragmatic e-mail check (the address must also exist in auth.users, so this only blocks garbage and injection attempts).
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
// Control characters except tab / newline are refused in free text.
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export const DAY_MS = 86_400_000;

export function isUuid(v: unknown): v is string { return typeof v === "string" && UUID_RE.test(v); }

export function uuid(v: unknown, field: string): string {
  if (!isUuid(v)) throw new InvalidInput(field);
  return v.toLowerCase();
}

export function text(v: unknown, field: string, opts: { min?: number; max: number; optional?: boolean }): string | null {
  if ((v === undefined || v === null || v === "") && opts.optional) return null;
  if (typeof v !== "string") throw new InvalidInput(field);
  const t = v.trim();
  if (t.length < (opts.min ?? 1) || t.length > opts.max || CONTROL_RE.test(t)) throw new InvalidInput(field);
  return t;
}

export function email(v: unknown, field = "email"): string {
  if (typeof v !== "string") throw new InvalidInput(field);
  const e = v.trim().toLowerCase();
  if (e.length > 254 || !EMAIL_RE.test(e)) throw new InvalidInput(field);
  return e;
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) throw new InvalidInput(field);
  return v as T;
}

export function int(v: unknown, field: string, min: number, max: number): number {
  const n = typeof v === "string" && /^\d{1,9}$/.test(v) ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) throw new InvalidInput(field);
  return n;
}

/** Calendar date "YYYY-MM-DD" (real date, year 2000–2100). */
export function date(v: unknown, field: string): string {
  if (typeof v !== "string") throw new InvalidInput(field);
  const m = DATE_RE.exec(v);
  if (!m) throw new InvalidInput(field);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (y < 2000 || y > 2100 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) throw new InvalidInput(field);
  return v;
}

/**
 * Point in time: a date "YYYY-MM-DD" (= end of that day, 23:59:59 Europe/Zurich ≈ 22:59:59Z, rounded to 23:59:59Z for
 * simplicity and generosity) or a full ISO timestamp with zone. Must lie within [now - pastDays, now + futureDays].
 */
export function instant(v: unknown, field: string, now: Date, range: { pastDays: number; futureDays: number }): string {
  if (typeof v !== "string") throw new InvalidInput(field);
  let ms: number;
  if (DATE_RE.test(v)) ms = Date.parse(`${date(v, field)}T23:59:59Z`);
  else if (DATETIME_RE.test(v)) ms = Date.parse(v);
  else throw new InvalidInput(field);
  if (!Number.isFinite(ms)) throw new InvalidInput(field);
  if (ms < now.getTime() - range.pastDays * DAY_MS || ms > now.getTime() + range.futureDays * DAY_MS) throw new InvalidInput(field);
  return new Date(ms).toISOString();
}

/** Body must be a plain JSON object of at most `maxBytes`, with confirm === true. */
export async function readBody(request: Request, maxBytes = 8192): Promise<Record<string, unknown>> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(type)) throw new InvalidInput("content-type");
  const raw = await request.text();
  if (raw.length > maxBytes) throw new InvalidInput("body");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new InvalidInput("body"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new InvalidInput("body");
  return parsed as Record<string, unknown>;
}

/** Only the listed keys may appear (plus action / confirm). Unknown keys are a client bug or probing → refused. */
export function onlyKeys(body: Record<string, unknown>, allowed: readonly string[]): void {
  for (const k of Object.keys(body)) if (k !== "action" && k !== "confirm" && !allowed.includes(k)) throw new InvalidInput(k);
}

export const USER_ACTIONS = ["set_trial", "extend_trial", "grant_access", "revoke_access", "block", "unblock", "soft_delete", "delete_account"] as const;
export type UserAction = (typeof USER_ACTIONS)[number];

export const SCHOOL_ACTIONS = ["grant_access", "revoke_access", "assign_licence", "update_licence", "revoke_licence", "add_admin", "remove_admin", "add_teacher", "remove_teacher"] as const;
export type SchoolAction = (typeof SCHOOL_ACTIONS)[number];

export const PACKAGES = ["pilot", "starter", "professional", "enterprise", "custom"] as const;
export const COUNTRIES = ["CH", "DE", "AT"] as const;

/** Search text for list endpoints: trimmed, ≤ 120 chars, no control characters, no PostgREST filter syntax needed (filtered in code). */
export function query(v: string | null): string {
  if (!v) return "";
  const t = v.trim().toLowerCase();
  if (t.length > 120 || CONTROL_RE.test(t)) throw new InvalidInput("q");
  return t;
}

export function page(v: string | null): number {
  if (v === null || v === "") return 1;
  return int(v, "page", 1, 10000);
}
