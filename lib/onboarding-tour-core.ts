// Pure helpers for the first-login onboarding tour of students (no browser/Supabase imports, unit tested in
// tests/onboarding-tour.test.mjs). The tour: 0 Willkommen, 1 Profil & Ziele, 2 Erste Bewerbung, 3 KI-Check, 4 Fertig.
import type { ApplicationStatus, UserRole } from "../types/index.ts";

export const TOUR_PATH = "/onboarding";
export const SETTINGS_PATH = "/settings";
/** Optional link on "Fertig": connect the parents (BILLING-FLOW-SPEC §3.2). Same path as FAMILY_PATH in lib/family-core. */
export const TOUR_FAMILY_PATH = "/familie";
export const TOUR_FAMILY_LINK = "Eltern verbinden (freiwillig)";
export const TOUR_STEPS = ["Willkommen", "Profil & Ziele", "Erste Bewerbung", "KI-Check", "Fertig"] as const;
export const TOUR_STEP_COUNT = TOUR_STEPS.length;
export const LAST_STEP = TOUR_STEP_COUNT - 1;
/** The profile step has three short screens (same questions as the former onboarding). */
export const PROFILE_PARTS = 3;

export const clampStep = (step: unknown): number => {
  const n = typeof step === "number" ? step : typeof step === "string" && step.trim() !== "" ? Number(step) : NaN;
  return Number.isFinite(n) ? Math.min(LAST_STEP, Math.max(0, Math.trunc(n))) : 0;
};
export const nextStep = (step: number) => clampStep(step + 1);
export const prevStep = (step: number) => clampStep(step - 1);

/** "Schritt 2 von 5" + bar width in percent (step 1 already shows a bit of progress). */
export function tourProgress(step: number) {
  const s = clampStep(step);
  return { current: s + 1, total: TOUR_STEP_COUNT, label: `Schritt ${s + 1} von ${TOUR_STEP_COUNT}`, percent: Math.round(((s + 1) / TOUR_STEP_COUNT) * 100) };
}

// ---- persistence state ----
/**
 * What the database says. `available: false` = the column / RPC does not exist yet (old DB) or the read failed:
 * then only the auth metadata flags decide, so the tour can never loop.
 */
export interface TourStatus { available: boolean; completed: boolean; step: number | null }
export const UNKNOWN_TOUR: TourStatus = { available: false, completed: false, step: null };

type DbError = { code?: string; message?: string; details?: string; hint?: string } | null | undefined;
/** PostgREST / Postgres errors that mean "this database has no onboarding_tour_* column or onboarding_tour_set RPC yet". */
export function isMissingSchemaError(error: DbError): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  if (["42703", "42883", "PGRST204", "PGRST202", "42P01"].includes(code)) return true;
  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  return /onboarding_tour/i.test(text) && /(does not exist|could not find|not find|schema cache|unknown)/i.test(text);
}

/** Turns the result of `select onboarding_tour_completed_at, onboarding_tour_step from profiles` into a TourStatus. */
export function interpretTourRow(row: { onboarding_tour_completed_at?: string | null; onboarding_tour_step?: number | null } | null | undefined, error?: DbError): TourStatus {
  if (error) return UNKNOWN_TOUR; // missing column (old DB) or any other read error: never trap the user
  if (!row) return { available: true, completed: false, step: null }; // no profile row yet = brand-new account
  return { available: true, completed: !!row.onboarding_tour_completed_at, step: typeof row.onboarding_tour_step === "number" ? clampStep(row.onboarding_tour_step) : null };
}

/** Auth metadata flags: `onboarding_tour_done` (this tour) or `student_onboarded` (former onboarding, existing users). */
export function tourDoneInMeta(meta: Record<string, unknown> | null | undefined): boolean {
  return meta?.onboarding_tour_done === true || meta?.student_onboarded === true;
}

/** Gate: must this user see the tour after login? Teachers never (they have their own onboarding). */
export function needsTour(role: UserRole, meta: Record<string, unknown> | null | undefined, status: TourStatus): boolean {
  if (role !== "student") return false;
  if (tourDoneInMeta(meta)) return false;
  if (status.available && status.completed) return false;
  return true; // DB says open, or DB unknown and no flag: show it once; finishing/skipping sets the flag, so no loop
}

/** Where an interrupted tour resumes (never directly on "Fertig"). */
export function resumeStep(status: TourStatus): number {
  if (!status.available || status.completed || status.step === null) return 0;
  return Math.min(clampStep(status.step), LAST_STEP - 1);
}

// ---- URLs ----
type SafeNext = (next: string | null | undefined) => string | null;
/** `?next=` aware tour URL. `replay` opens it from the settings (no gate, nothing reset, exits back to the settings). */
export function tourHref(safeNext: SafeNext, next?: string | null, replay = false): string {
  const params = new URLSearchParams();
  if (replay) params.set("replay", "1");
  const safe = safeNext(next);
  if (safe && safe !== "/" && !safe.startsWith(TOUR_PATH)) params.set("next", safe);
  const query = params.toString();
  return query ? `${TOUR_PATH}?${query}` : TOUR_PATH;
}
export function parseTourParams(search: string, safeNext: SafeNext): { replay: boolean; next: string | null } {
  const params = new URLSearchParams(search);
  const next = safeNext(params.get("next"));
  return { replay: params.get("replay") === "1", next: next && !next.startsWith(TOUR_PATH) ? next : null };
}
/** Target when the tour ends (Fertig or Überspringen). Replay always returns to the settings. */
export function tourExitPath(opts: { replay: boolean; next: string | null; landing: (next: string | null) => string }): string {
  return opts.replay ? SETTINGS_PATH : opts.landing(opts.next);
}

// ---- step 3: first application ----
export const FIRST_APPLICATION_STATUSES: { value: ApplicationStatus; label: string; hint: string }[] = [
  { value: "saved", label: "Gemerkt", hint: "Interessiert mich" },
  { value: "preparing", label: "Am Vorbereiten", hint: "Ich schreibe gerade" },
  { value: "applied", label: "Abgeschickt", hint: "Ist schon weg" },
];
export interface FirstApplicationInput { company: string; position: string; status: ApplicationStatus }
/** Validates the compact form. Returns the cleaned values or a short German error. */
export function checkFirstApplication(input: FirstApplicationInput): { ok: true; value: FirstApplicationInput } | { ok: false; field: "company" | "position"; error: string } {
  const company = input.company.replace(/\s+/g, " ").trim().slice(0, 120);
  const position = input.position.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!company) return { ok: false, field: "company", error: "Bei welcher Firma? Der Name reicht." };
  if (!position) return { ok: false, field: "position", error: "Für welchen Beruf? Zum Beispiel «Koch / Köchin»." };
  const status = FIRST_APPLICATION_STATUSES.some((s) => s.value === input.status) ? input.status : "saved";
  return { ok: true, value: { company, position, status } };
}
