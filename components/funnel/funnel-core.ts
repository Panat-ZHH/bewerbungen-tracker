// Pure rules of the sign-up funnel /start (SPEC-FLOW §1–4). No browser / Supabase / React imports: unit tested with node --test
// (tests/onb-funnel-core.test.mjs). Storage, validation of the saved payload and the save path live in lib/funnel/* (onb-data).
import { isValidBirthYear, mayNeedParentalConsent, type SignupChoice } from "../../lib/family-core.ts";
import { SCHOOL_LEVELS, startYearOptions } from "../../lib/onboarding-core.ts";
import type { FunnelRole, FunnelStateV1 } from "../../lib/funnel/types.ts";
import { charLength, cleanText as serverClean, firstNameProblem } from "../../lib/funnel/validate.ts";

export type StepSlug =
  | "weg" | "rolle" | "name" | "jahrgang" | "schule" | "ort" | "beruf" | "wochenziel" | "hilfe" | "dabei"
  | "begleiten" | "kind" | "zugang" | "plan" | "konto";

export const ALL_STEPS: readonly StepSlug[] = ["weg", "rolle", "name", "jahrgang", "schule", "ort", "beruf", "wochenziel", "hilfe", "dabei", "begleiten", "kind", "zugang", "plan", "konto"];

/** Short German name of each step (resume card «Du warst bei …», page title). */
export const STEP_TITLE: Record<StepSlug, string> = {
  weg: "Dein Weg", rolle: "Wer bist du?", name: "Vorname", jahrgang: "Geburtsjahr", schule: "Klasse", ort: "Wohnort",
  beruf: "Wunschberuf", wochenziel: "Wochenziel", hilfe: "Hilfe", dabei: "Eltern einladen", begleiten: "Begleiten",
  kind: "Dein Kind", zugang: "Zugang", plan: "Dein Plan", konto: "Konto erstellen",
};

export const FUNNEL_LIMITS_UI = { firstName: 40, place: 60, profession: 60, professionsMax: 3, classCodeMin: 4, classCodeMax: 16, inviteCode: 8 } as const;

/** Options shown in the funnel. */
export interface PathOptions {
  /** Authenticated completion mode (`nach=google`): no account screen, the plan is saved directly. */
  google?: boolean;
  /** Role already known server-side (cross-device fallback in google mode): never asked again. */
  roleLocked?: boolean;
}

/** All slugs of the current path, in order (SPEC-FLOW §1.1). Without a role only weg + rolle are known. */
export function stepsFor(role: FunnelRole | null, staffAccess: FunnelStateV1["staffAccess"] = null, opts: PathOptions = {}): StepSlug[] {
  let steps: StepSlug[];
  if (role === "student") steps = ["weg", "rolle", "name", "jahrgang", "schule", "ort", "beruf", "wochenziel", "hilfe", "dabei", "plan", "konto"];
  else if (role === "parent") steps = ["weg", "rolle", "name", "begleiten", "kind", "plan", "konto"];
  else if (role === "staff") steps = staffAccess === "licence" || staffAccess === null ? ["weg", "rolle", "zugang", "konto"] : ["weg", "rolle", "zugang"];
  else steps = ["weg", "rolle"];
  if (opts.google) steps = steps.filter((s) => s !== "konto" && s !== "weg");
  if (opts.roleLocked) steps = steps.filter((s) => s !== "rolle");
  return steps;
}

export function isStepSlug(value: unknown): value is StepSlug { return typeof value === "string" && (ALL_STEPS as readonly string[]).includes(value); }

/** «Schritt n von N»: every step of the path except `weg`. Null on `weg`. */
export function progressOf(step: StepSlug, steps: StepSlug[]): { index: number; total: number } | null {
  const counted: StepSlug[] = steps.filter((s) => s !== "weg");
  const i = counted.indexOf(step);
  return i < 0 ? null : { index: i + 1, total: counted.length };
}

export type StepError = { field: string; message: string };

const CLASS_CODE_RE = /^[A-Z0-9]{4,16}$/;
const INVITE_CODE_RE = /^[A-Z0-9]{8}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/** Strips invisible characters, collapses whitespace and trims – exactly what the server stores (lib/funnel/validate). */
export function cleanText(value: string): string { return serverClean(value); }
export function normalizeCode(value: string, max = 16): string { return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, max); }

/** First-name check with the final copy (SPEC-FLOW S2). */
export function firstNameError(raw: string): string | null {
  const v = cleanText(raw);
  if (!v) return "Gib deinen Vornamen ein.";
  if (charLength(v) > FUNNEL_LIMITS_UI.firstName) return `Dein Vorname ist zu lang. Höchstens ${FUNNEL_LIMITS_UI.firstName} Zeichen.`;
  // Same rule as the server (control characters on the raw value, at least one letter).
  if (firstNameProblem(raw)) return "Gib deinen Vornamen mit Buchstaben ein.";
  return null;
}

/**
 * Error of the answer on `step`, or null when the user may continue. Only required answers produce errors; optional screens
 * are always valid (SPEC-FLOW §2.2). Code formats are checked on their own screens only when a code was typed.
 */
export function stepError(step: StepSlug, s: FunnelStateV1, now: Date = new Date()): StepError | null {
  switch (step) {
    case "rolle": return s.role ? null : { field: "rolle", message: "Wähl aus, wer du bist." };
    case "name": { const m = firstNameError(s.firstName); return m ? { field: "firstName", message: m } : null; }
    case "jahrgang": return isValidBirthYear(s.birthYear, now) ? null : { field: "birthYear", message: "Wähl dein Geburtsjahr." };
    case "schule":
      if (!(SCHOOL_LEVELS as readonly string[]).includes(s.schoolLevel)) return { field: "schoolLevel", message: "Wähl deine Klasse." };
      if (s.classCode && !CLASS_CODE_RE.test(s.classCode)) return { field: "classCode", message: "Der Klassencode hat mindestens 4 Zeichen. Prüf ihn noch einmal." };
      return null;
    case "ort":
      if (!/^[A-Z]{2}$/.test(s.canton)) return { field: "canton", message: "Wähl deinen Kanton." };
      if (charLength(cleanText(s.place)) > FUNNEL_LIMITS_UI.place) return { field: "place", message: `Höchstens ${FUNNEL_LIMITS_UI.place} Zeichen.` };
      return null;
    case "kind":
      if (s.parentKid === "code" && !INVITE_CODE_RE.test(s.inviteCode)) return { field: "inviteCode", message: "Der Code hat 8 Zeichen. Prüf ihn noch einmal." };
      return null;
    case "zugang": return s.staffAccess ? null : { field: "staffAccess", message: "Wähl aus, was für dich stimmt." };
    default: return null;
  }
}

/** Steps that must be answered before `step` may be shown. */
const REQUIRED: StepSlug[] = ["rolle", "name", "jahrgang", "schule", "ort", "kind", "zugang"];

/**
 * The step to actually show for a requested slug (SPEC-FLOW §1.1): unknown slugs or slugs whose earlier required answers are
 * missing are replaced by the first unanswered required step. Never a 404.
 */
export function resolveStep(requested: string | null | undefined, s: FunnelStateV1, opts: PathOptions = {}, now: Date = new Date()): StepSlug {
  const steps = stepsFor(s.role, s.staffAccess, opts);
  const first = steps[0];
  if (!isStepSlug(requested) || !steps.includes(requested)) {
    // Slug of another path (e.g. `beruf` while the role is parent) or garbage: first unanswered required step, else the start.
    return firstOpenStep(steps, s, steps.length, now) ?? first;
  }
  const target = steps.indexOf(requested);
  return firstOpenStep(steps, s, target, now) ?? requested;
}

function firstOpenStep(steps: StepSlug[], s: FunnelStateV1, before: number, now: Date): StepSlug | null {
  for (let i = 0; i < Math.min(before, steps.length); i++) {
    const step = steps[i];
    if (REQUIRED.includes(step) && stepError(step, s, now)) return step;
  }
  return null;
}

/** Next and previous slug on the current path (null at the ends). */
export function neighbours(step: StepSlug, s: FunnelStateV1, opts: PathOptions = {}): { prev: StepSlug | null; next: StepSlug | null } {
  const steps = stepsFor(s.role, s.staffAccess, opts);
  const i = steps.indexOf(step);
  if (i < 0) return { prev: null, next: null };
  return { prev: steps[i - 1] ?? null, next: steps[i + 1] ?? null };
}

/** Optional screens with a «Überspringen» link (SPEC-FLOW §2.2). */
export function isSkippable(step: StepSlug): boolean { return step === "hilfe" || step === "dabei" || step === "begleiten"; }

/** A saved state worth a resume card: past `rolle` (SPEC-FLOW §4.9). */
export function canResume(s: FunnelStateV1 | null): s is FunnelStateV1 {
  return !!s && !!s.role && isStepSlug(s.step) && s.step !== "weg" && s.step !== "rolle";
}

// ---- mapping to today's account model (SPEC-FLOW §2.6) ----
export function signupChoiceOf(s: Pick<FunnelStateV1, "role" | "classCode">): SignupChoice | null {
  if (s.role === "student") return s.classCode ? "school" : "independent";
  if (s.role === "parent") return "parent";
  if (s.role === "staff") return "teacher";
  return null;
}

// ---- weekly goal feedback (S7) ----
export function weeklyGoalFeedback(n: number): string {
  if (n <= 1) return "Ein guter Anfang. Eine sorgfältige Bewerbung ist mehr wert als drei schnelle.";
  if (n === 2) return "Gut machbar neben der Schule. In einem Monat sind das etwa 8 Bewerbungen.";
  if (n === 3) return "So machen es viele. In einem Monat sind das etwa 12 Bewerbungen.";
  if (n === 4) return "Stark. Plan dir dafür feste Zeiten in der Woche ein.";
  if (n === 5) return "Ambitioniert. Achte darauf, dass jede Bewerbung zur Firma passt.";
  return "Viel vor. Nimm dir pro Bewerbung genug Zeit für den Brief.";
}

// ---- birth year chips (S3): the 6 most likely years, newest last ----
export function likelyBirthYears(now: Date = new Date()): number[] {
  const y = now.getFullYear();
  return [y - 17, y - 16, y - 15, y - 14, y - 13, y - 12];
}
export { mayNeedParentalConsent, startYearOptions };

// ---- professions (S6): max 3 in the funnel ----
export function addFunnelProfession(list: string[], raw: string): { list: string[]; full: boolean } {
  const value = cleanText(raw).slice(0, FUNNEL_LIMITS_UI.profession);
  if (!value || CONTROL.test(value)) return { list, full: false };
  if (list.some((item) => item.toLowerCase() === value.toLowerCase())) return { list, full: false };
  if (list.length >= FUNNEL_LIMITS_UI.professionsMax) return { list, full: true };
  return { list: [...list, value], full: false };
}
export function toggleProfession(list: string[], value: string): { list: string[]; full: boolean } {
  if (list.includes(value)) return { list: list.filter((p) => p !== value), full: false };
  return addFunnelProfession(list, value);
}

// ---- «Dein Plan» (SPEC-FLOW §4.4) ----
export const HELP_LABELS_STUDENT: Record<string, string> = {
  lebenslauf: "Lebenslauf schreiben", brief: "Motivationsschreiben schreiben", schnuppern: "Schnupperlehre finden",
  ueberblick: "Überblick über meine Bewerbungen", eltern: "Eltern einbinden",
};
export const HELP_LABELS_PARENT: Record<string, string> = {
  ueberblick: "Überblick, wo mein Kind steht", fristen: "Fristen und Termine im Blick", dokumente: "Bewerbungsdokumente gegenlesen", ermutigen: "Mein Kind ermutigen",
};

/** «Informatiker:in EFZ ab 2027». Suggested jobs get «EFZ» unless they already carry EFZ/EBA; free text stays as typed. */
export function goalLine(s: Pick<FunnelStateV1, "professions" | "unsure" | "startYear">, suggestions: readonly string[]): string {
  if (s.unsure || !s.professions.length) return "Beruf finden, der zu dir passt";
  const names = s.professions.map((p) => (suggestions.includes(p) && !/\b(EFZ|EBA)\b/.test(p) ? `${p} EFZ` : p));
  return `${names.join(", ")}${s.startYear ? ` ab ${s.startYear}` : ""}`;
}

export function perWeekLine(n: number): string { return `${n} ${n === 1 ? "Bewerbung" : "Bewerbungen"} pro Woche`; }

export type PlanRow = { key: string; label: string; value: string; step: StepSlug };

/** Rows of the plan card; unanswered rows are left out. */
export function planRows(s: FunnelStateV1, opts: { suggestions: readonly string[]; cantonName: (code: string) => string | undefined }): PlanRow[] {
  const rows: PlanRow[] = [];
  if (s.role === "student") {
    rows.push({ key: "ziel", label: "Ziel", value: goalLine(s, opts.suggestions), step: "beruf" });
    rows.push({ key: "woche", label: "Pro Woche", value: `${s.weeklyGoal} ${s.weeklyGoal === 1 ? "Bewerbung" : "Bewerbungen"}`, step: "wochenziel" });
    const canton = opts.cantonName(s.canton) ?? s.canton;
    if (s.canton) rows.push({ key: "wo", label: "Wo", value: cleanText(s.place) ? `${cleanText(s.place)}, ${canton}` : `Kanton ${canton}`, step: "ort" });
    if (s.schoolLevel) rows.push({ key: "klasse", label: "Klasse", value: `${s.schoolLevel}${s.classCode ? " · mit Klassencode" : ""}`, step: "schule" });
    const help = s.help.map((h) => HELP_LABELS_STUDENT[h]).filter(Boolean);
    if (help.length) rows.push({ key: "hilfe", label: "Hilfe", value: help.join(" · "), step: "hilfe" });
    if (s.family === "jetzt") rows.push({ key: "eltern", label: "Eltern", value: "Einladen nach dem Start", step: "dabei" });
    rows.push({ key: "zugang", label: "Zugang", value: s.classCode ? "Über deine Schule (nach dem Beitritt)" : "7 Tage gratis testen", step: "schule" });
  } else if (s.role === "parent") {
    const help = s.help.map((h) => HELP_LABELS_PARENT[h]).filter(Boolean);
    if (help.length) rows.push({ key: "begleiten", label: "Begleiten", value: help.join(" · "), step: "begleiten" });
    const kid = s.parentKid === "code" ? "Mit dem Code deines Kindes verbinden" : s.parentKid === "einladen" ? "Einladen nach dem Start" : "Später";
    rows.push({ key: "kind", label: "Kind", value: kid, step: "kind" });
    rows.push({ key: "zugang", label: "Zugang", value: "7 Tage gratis testen", step: "kind" });
  }
  return rows;
}

/** The one line above the plan card (the line Panat quoted). */
export function planSummaryLine(s: FunnelStateV1, suggestions: readonly string[]): string {
  if (s.role === "parent") return "Dein Kind begleiten · 7 Tage gratis testen";
  return [goalLine(s, suggestions), perWeekLine(s.weeklyGoal), s.classCode ? "Zugang über deine Schule" : "7 Tage gratis testen"].join(" · ");
}

// ---- account screen (S11) ----
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function emailError(raw: string): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return "Gib deine E-Mail-Adresse ein.";
  if (v.length > 254 || !EMAIL_RE.test(v)) return "Diese E-Mail-Adresse sieht nicht richtig aus. Prüf sie noch einmal.";
  return null;
}

/** Remaining resend cooldown in whole seconds (`/start/bestaetigen`, 60 s after load and after each send). */
export const RESEND_COOLDOWN_MS = 60_000;
export const RESEND_MAX = 3;
export function cooldownLeft(lastAt: number, now: number): number { return Math.max(0, Math.ceil((lastAt + RESEND_COOLDOWN_MS - now) / 1000)); }
export function formatCountdown(seconds: number): string { const s = Math.max(0, Math.floor(seconds)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

/** Confirm record in sessionStorage ({email, at}); anything malformed → null. */
export function parseConfirmRecord(raw: string | null | undefined): { email: string; at: number } | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { email?: unknown; at?: unknown };
    if (typeof v.email !== "string" || emailError(v.email) || typeof v.at !== "number" || !Number.isFinite(v.at)) return null;
    return { email: v.email.trim(), at: v.at };
  } catch { return null; }
}

/** Funnel URL for a slug, keeping `nach=google` and a safe `next`. */
export function stepHref(step: StepSlug, opts: { google?: boolean; next?: string | null } = {}): string {
  const q = new URLSearchParams();
  if (step !== "weg") q.set("schritt", step);
  if (opts.google) q.set("nach", "google");
  if (opts.next) q.set("next", opts.next);
  const qs = q.toString();
  return qs ? `/start?${qs}` : "/start";
}

/** Login link that keeps `next` and tells /login not to bounce invite links back to the funnel. */
export function loginHref(next: string | null | undefined): string {
  if (!next) return "/login";
  return `/login?next=${encodeURIComponent(next)}&anmelden=1`;
}

/** Preset role + class code from the invite target (SPEC-FLOW §1.2). */
export function presetFromNext(next: string | null | undefined): { role: FunnelRole | null; classCode: string; inviteCode: string; familyInvite: "parent" | "child" | null } {
  const n = String(next ?? "");
  const path = n.split(/[?#]/)[0];
  const classJoin = /^\/classes\/join\/([A-Za-z0-9_-]{4,128})$/.exec(path);
  if (classJoin) {
    const code = normalizeCode(classJoin[1]);
    return { role: "student", classCode: CLASS_CODE_RE.test(code) ? code : "", inviteCode: "", familyInvite: null };
  }
  const family = /^\/familie\/einladung\/([A-Za-z0-9]{8})$/.exec(path);
  if (family) {
    const child = /[?&]fuer=kind(&|#|$)/.test(n);
    return { role: child ? "student" : "parent", classCode: "", inviteCode: child ? "" : normalizeCode(family[1], 8), familyInvite: child ? "child" : "parent" };
  }
  return { role: null, classCode: "", inviteCode: "", familyInvite: null };
}

/** Default answers (SPEC-FLOW §2.2). `startYear` is filled when the first job is chosen. */
export function emptyFunnelState(now = Date.now()): FunnelStateV1 {
  return {
    v: 1, startedAt: now, updatedAt: now, step: "weg", next: null, role: null, firstName: "", birthYear: null, schoolLevel: "", classCode: "",
    canton: "", place: "", professions: [], unsure: false, startYear: null, weeklyGoal: 3, help: [], family: null, parentKid: null,
    inviteCode: "", staffAccess: null,
  };
}
