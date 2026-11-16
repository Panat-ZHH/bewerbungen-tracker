/**
 * School licences: packages, prices and pure helpers (no Supabase import, safe in client and server code).
 * The database stores only the package, seat limit, status and dates (public.school_licences); prices live ONLY here.
 * There is no payment code: licences are assigned manually (see docs/b2b/DATA-MODEL.md, "Assigning a licence").
 *
 * Extension point for other plan holders (family / private plans): reuse LicenceState, licenceState(), BillingInterval
 * and the PlanDefinition shape, and add a second catalogue next to SCHOOL_PACKAGES instead of changing this one.
 */
import type { BillingInterval, LicenceErrorCode, LicencePackage, LicenceState, LicenceStatus } from "./types.ts";

export type PlanHolder = "school" | "family" | "private";

export type PlanDefinition = {
  id: string;
  holder: PlanHolder;
  label: string;
  /** Seat limit; null = set individually. */
  studentLimit: number | null;
  /** Yearly price in CHF; 0 = free; null = individual offer. */
  yearlyPriceChf: number | null;
  description: string;
};

/** Business plan 2027-2032: Starter / Professional / Enterprise; pilot = free 30 days for 1-2 classes; multi-site = individual. */
export const SCHOOL_PACKAGES: Record<LicencePackage, PlanDefinition> = {
  pilot: { id: "pilot", holder: "school", label: "Pilot", studentLimit: 60, yearlyPriceChf: 0, description: "30 Tage kostenlos für 1–2 Klassen, mit vereinbartem Feedback- und Entscheidungsprozess" },
  starter: { id: "starter", holder: "school", label: "Starter", studentLimit: 100, yearlyPriceChf: 990, description: "Für kleine Schulen bis 100 Schülerinnen und Schüler" },
  professional: { id: "professional", holder: "school", label: "Professional", studentLimit: 300, yearlyPriceChf: 1490, description: "Das Kernpaket für Schulen bis 300 Schülerinnen und Schüler" },
  enterprise: { id: "enterprise", holder: "school", label: "Enterprise", studentLimit: 800, yearlyPriceChf: 3990, description: "Für grosse Schulen bis 800 Schülerinnen und Schüler, mit erweiterter Administration" },
  custom: { id: "custom", holder: "school", label: "Individuell", studentLimit: null, yearlyPriceChf: null, description: "Mehrere Standorte oder Schulverbände: individuelles Angebot" },
};

/** Packages that are sold off the shelf, smallest first. */
export const PAID_PACKAGES = ["starter", "professional", "enterprise"] as const satisfies readonly LicencePackage[];

export const PILOT_DAYS = 30;
/**
 * Monthly payment is possible "mit Aufpreis" (business plan); the amount is not fixed there.
 * ASSUMPTION (adjust before quoting): +10 % on the yearly price, paid in 12 instalments.
 */
export const MONTHLY_SURCHARGE = 0.1;

/** Seat limit of a package (null for custom). Same values as public._licence_default_limit. */
export function defaultStudentLimit(pkg: LicencePackage): number | null {
  return SCHOOL_PACKAGES[pkg].studentLimit;
}

/** Smallest off-the-shelf package for a number of students; 'custom' above 800. */
export function recommendPackage(students: number): LicencePackage {
  const n = Math.max(0, Math.ceil(students));
  for (const pkg of PAID_PACKAGES) if (n <= (SCHOOL_PACKAGES[pkg].studentLimit ?? 0)) return pkg;
  return "custom";
}

export type PriceQuote = { yearlyChf: number; perPaymentChf: number; payments: number; perStudentYearChf: number | null };

/** Price of a package for a billing interval; null for custom (individual offer). Rounded to 5 Rappen like Swiss prices. */
export function priceQuote(pkg: LicencePackage, interval: BillingInterval = "yearly"): PriceQuote | null {
  const def = SCHOOL_PACKAGES[pkg];
  if (def.yearlyPriceChf === null) return null;
  const yearly = interval === "monthly" ? roundTo5Rappen(def.yearlyPriceChf * (1 + MONTHLY_SURCHARGE)) : def.yearlyPriceChf;
  const payments = interval === "monthly" ? 12 : 1;
  return {
    yearlyChf: yearly,
    perPaymentChf: roundTo5Rappen(yearly / payments),
    payments,
    perStudentYearChf: def.studentLimit ? Math.round((yearly / def.studentLimit) * 100) / 100 : null,
  };
}

function roundTo5Rappen(value: number): number {
  return Math.round(value * 20) / 20;
}

/** "CHF 1'490" / "CHF 136.60" (Swiss thousands separator). */
export function formatChf(value: number): string {
  const fixed = Number.isInteger(value) ? String(value) : value.toFixed(2);
  const [whole, cents] = fixed.split(".");
  return `CHF ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, "'")}${cents ? `.${cents}` : ""}`;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Effective licence state today; mirrors public._licence_state. Dates as YYYY-MM-DD. */
export function licenceState(
  l: { status: LicenceStatus; pilot_end?: string | null; valid_from?: string | null; valid_until?: string | null },
  today: string = isoDay(new Date()),
): LicenceState {
  if (l.status === "cancelled") return "cancelled";
  if (l.status === "expired") return "expired";
  if (l.status === "pilot") return l.pilot_end && l.pilot_end < today ? "expired" : "pilot";
  if (l.valid_from && l.valid_from > today) return "not_started";
  if (l.valid_until && l.valid_until < today) return "expired";
  return "active";
}

export const isUsableState = (state: LicenceState) => state === "pilot" || state === "active";

export const LICENCE_STATE_LABELS: Record<LicenceState, string> = {
  pilot: "Pilotphase",
  active: "Aktiv",
  not_started: "Noch nicht gestartet",
  expired: "Abgelaufen",
  cancelled: "Gekündigt",
};

/** German texts for the trigger errors (the database sends the same meaning in error.details). */
export const LICENCE_ERROR_MESSAGES: Record<LicenceErrorCode, string> = {
  LICENCE_LIMIT_REACHED: "Die Schullizenz ist voll. Die Schulleitung kann die Lizenz erweitern.",
  LICENCE_EXPIRED: "Die Lizenz dieser Schule ist abgelaufen. Neue Beitritte sind erst nach der Verlängerung möglich.",
  LICENCE_MISSING: "Für diese Schule ist noch keine Lizenz hinterlegt. Bitte wende dich an deine Lehrperson oder die Schulleitung.",
};

const SQLSTATE_TO_CODE: Record<string, LicenceErrorCode> = { WA001: "LICENCE_LIMIT_REACHED", WA002: "LICENCE_EXPIRED", WA003: "LICENCE_MISSING" };

type DbError = { code?: string | null; message?: string | null; details?: string | null; detail?: string | null } | null | undefined;

/** Recognises a licence error from Supabase/PostgREST (or pg). Returns null for any other error. */
export function licenceError(error: DbError): { code: LicenceErrorCode; message: string } | null {
  if (!error) return null;
  const byState = error.code ? SQLSTATE_TO_CODE[error.code] : undefined;
  const byText = (Object.keys(LICENCE_ERROR_MESSAGES) as LicenceErrorCode[]).find((c) => (error.message ?? "").includes(c));
  const code = byState ?? byText;
  if (!code) return null;
  const detail = error.details ?? error.detail;
  return { code, message: detail && detail.trim() ? detail : LICENCE_ERROR_MESSAGES[code] };
}

/**
 * true when the B2B tables / RPCs are not deployed yet (old database): the UI should hide the feature instead of failing.
 * PGRST202 = function not in schema cache, PGRST205 = table not in schema cache, 42883 / 42P01 = undefined function / table.
 */
export function isMissingB2bSchema(error: DbError): boolean {
  if (!error) return false;
  if (["PGRST202", "PGRST205", "PGRST204", "42883", "42P01", "42703"].includes(String(error.code ?? ""))) return true;
  return /(school|class_goal|class_overview_stats|export_my_data)/i.test(error.message ?? "") && /(does not exist|could not find|schema cache)/i.test(error.message ?? "");
}
