// Pure helpers for the B2B screens (teacher class overview, class goals, school admin, "Meine Daten").
// No React, no runtime aliases: unit-tested with node --test (tests/b2b-app.test.mjs).
import { SCHOOL_PACKAGES, PILOT_DAYS } from "../../lib/b2b/licence.ts";
import type { LicencePackage } from "../../lib/b2b/types.ts";

// ---------- feature detection ----------
/**
 * True when a Supabase/PostgREST error means "this table or RPC is not deployed yet" (the B2B migrations may not be
 * applied on the live DB). Such features are hidden instead of showing an error.
 */
export function isMissingFeature(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown; status?: unknown; details?: unknown };
  const code = String(e.code ?? "");
  if (["PGRST202", "PGRST205", "PGRST200", "42P01", "42883", "42703"].includes(code)) return true;
  if (Number(e.status) === 404) return true;
  const text = `${String(e.message ?? "")} ${String(e.details ?? "")}`;
  return /could not find the (function|table|relation)|does not exist|schema cache/i.test(text);
}

// ---------- packages and licences ----------
export type { LicencePackage };
export type LicenceStatus = "pilot" | "active" | "expired" | "cancelled";
/** Labels, seat limits and prices derive from SCHOOL_PACKAGES (lib/b2b/licence.ts), the single price source. */
const swissChf = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
const info = (p: LicencePackage, label: string) => {
  const d = SCHOOL_PACKAGES[p];
  const price = d.yearlyPriceChf === null ? "nach Vereinbarung" : d.yearlyPriceChf === 0 ? "kostenlos" : `CHF ${swissChf(d.yearlyPriceChf)} pro Jahr`;
  return { label, limit: d.studentLimit, price };
};
export const PACKAGE_INFO: Record<LicencePackage, { label: string; limit: number | null; price: string }> = {
  pilot: info("pilot", `Pilot (${PILOT_DAYS} Tage)`),
  starter: info("starter", "Starter"),
  professional: info("professional", "Professional"),
  enterprise: info("enterprise", "Enterprise"),
  custom: info("custom", "Individuelles Angebot"),
};
export const STATUS_LABEL: Record<LicenceStatus, string> = { pilot: "Pilotphase", active: "Aktiv", expired: "Abgelaufen", cancelled: "Gekündigt" };
export function packageLabel(p: string | null | undefined): string { return (PACKAGE_INFO as Record<string, { label: string }>)[p ?? ""]?.label ?? "Kein Paket"; }
export function statusLabel(s: string | null | undefined): string { return (STATUS_LABEL as Record<string, string>)[s ?? ""] ?? "Unbekannt"; }

export type UsageLevel = "ok" | "warning" | "full";
/** Students used vs. licence limit. Warning from 90 %, "full" at or above 100 %. No limit -> percent null. */
export function licenceUsage(students: number, limit: number | null | undefined): { percent: number | null; level: UsageLevel; remaining: number | null } {
  const n = Math.max(0, Math.floor(Number(students) || 0));
  if (!limit || limit <= 0) return { percent: null, level: "ok", remaining: null };
  const raw = (n / limit) * 100;
  const level: UsageLevel = raw >= 100 ? "full" : raw >= 90 ? "warning" : "ok";
  return { percent: Math.min(100, Math.round(raw)), level, remaining: Math.max(0, limit - n) };
}

const DAY = 86_400_000;
const dayStart = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
/** Whole days left until `end` (inclusive of today, 0 on the last day, negative once over). null if no date. */
export function daysRemaining(end: string | null | undefined, today: string = new Date().toISOString().slice(0, 10)): number | null {
  if (!end || !/^\d{4}-\d{2}-\d{2}/.test(end)) return null;
  return Math.round((dayStart(end) - dayStart(today)) / DAY);
}
export function pilotText(days: number | null): string {
  if (days === null) return "Kein Pilotzeitraum hinterlegt";
  if (days < 0) return "Pilotphase beendet";
  if (days === 0) return "Letzter Tag der Pilotphase";
  return days === 1 ? "Noch 1 Tag Pilotphase" : `Noch ${days} Tage Pilotphase`;
}

// ---------- class goals ----------
export type GoalMetric = "applications_sent" | "interviews" | "trial_days" | "custom";
export const GOAL_METRICS: { value: GoalMetric; label: string; unit: [string, string]; hint: string }[] = [
  { value: "trial_days", label: "Schnuppertage", unit: ["Schnuppertag", "Schnuppertage"], hint: "Erledigte Schnupperlehren pro Person" },
  { value: "interviews", label: "Vorstellungsgespräche", unit: ["Gespräch", "Gespräche"], hint: "Einladungen zu einem Gespräch pro Person (zählt nur bei «Status zeigen»)" },
  { value: "applications_sent", label: "Verschickte Bewerbungen", unit: ["Bewerbung", "Bewerbungen"], hint: "Sorgfältig vorbereitete und verschickte Bewerbungen pro Person" },
  { value: "custom", label: "Eigenes Ziel", unit: ["", ""], hint: "Ohne automatische Zählung: den Fortschritt besprecht ihr im Unterricht" },
];
export function metricUnit(m: string, n: number): string { const u = GOAL_METRICS.find((x) => x.value === m)?.unit ?? ["", ""]; return n === 1 ? u[0] : u[1]; }
export function metricLabel(m: string): string { return GOAL_METRICS.find((x) => x.value === m)?.label ?? "Ziel"; }

export type GoalDraft = { title: string; description: string; metric: GoalMetric; target: string | number; dueDate: string };
export const GOAL_TITLE_MAX = 120;
export const GOAL_DESCRIPTION_MAX = 1000;
export const GOAL_TARGET_MAX = 1000;
/** German validation message, or null when the draft can be saved. */
export function goalProblem(d: GoalDraft, today: string = new Date().toISOString().slice(0, 10)): string | null {
  const title = d.title.trim();
  if (!title) return "Bitte gib dem Ziel einen Titel.";
  if (title.length > GOAL_TITLE_MAX) return `Der Titel darf höchstens ${GOAL_TITLE_MAX} Zeichen lang sein.`;
  if (d.description.trim().length > GOAL_DESCRIPTION_MAX) return `Die Beschreibung darf höchstens ${GOAL_DESCRIPTION_MAX} Zeichen lang sein.`;
  if (!GOAL_METRICS.some((m) => m.value === d.metric)) return "Bitte wähle, was gezählt wird.";
  const empty = d.target === "" || d.target === null || d.target === undefined;
  if (!(d.metric === "custom" && empty)) {
    const target = Number(d.target);
    if (empty || !Number.isInteger(target) || target < 1 || target > GOAL_TARGET_MAX) return `Der Zielwert pro Person muss eine ganze Zahl zwischen 1 und ${GOAL_TARGET_MAX} sein.`;
  }
  if (d.dueDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dueDate) || Number.isNaN(dayStart(d.dueDate))) return "Bitte gib ein gültiges Datum ein.";
    if (d.dueDate < today) return "Das Datum liegt in der Vergangenheit.";
  }
  return null;
}

export type GoalProgress = { current: number; target: number; percent: number; done: boolean };
export function goalProgress(current: number, target: number): GoalProgress {
  const c = Math.max(0, Number(current) || 0); const t = Math.max(1, Number(target) || 1);
  return { current: c, target: t, percent: Math.min(100, Math.round((c / t) * 100)), done: c >= t };
}

/**
 * State of one goal from class_goal_progress. `target` is per person; the class progress is how many of the counted
 * (sharing) students reached it. custom = no automatic progress, suppressed = fewer than 3 contributors (student view).
 */
export type GoalStatus =
  | { kind: "custom" } | { kind: "suppressed" } | { kind: "pending" }
  | { kind: "progress"; reached: number; counted: number; total: number | null; percent: number; done: boolean };
export function goalStatus(g: { metric: string; reached: number | null; counted: number | null; total: number | null; suppressed: boolean }): GoalStatus {
  if (g.metric === "custom") return { kind: "custom" };
  if (g.suppressed) return { kind: "suppressed" };
  if (g.reached === null || g.counted === null) return { kind: "pending" };
  const counted = Math.max(0, g.counted); const reached = Math.min(Math.max(0, g.reached), counted);
  const p = goalProgress(reached, Math.max(1, counted));
  return { kind: "progress", reached, counted, total: g.total, percent: counted > 0 ? p.percent : 0, done: counted > 0 && reached >= counted };
}
/** Encouraging line for the class: celebrates the shared step, never names or compares students. */
export function goalCaption(s: Extract<GoalStatus, { kind: "progress" }>, metric: string, dueDays: number | null): string {
  const due = dueDays === null || s.done ? "" : dueDays < 0 ? " Das Datum ist vorbei, das Ziel bleibt aber offen." : dueDays === 0 ? " Heute ist der letzte Tag." : ` Noch ${dueDays} ${dueDays === 1 ? "Tag" : "Tage"}.`;
  const together = s.total !== null && s.total > 0 ? ` Zusammen: ${s.total} ${metricUnit(metric, s.total)}.` : "";
  if (s.counted === 0) return "Noch teilt niemand seine Daten mit der Klasse, darum gibt es noch keinen Fortschritt.";
  if (s.done) return `Geschafft! Alle ${s.counted} haben das Ziel erreicht.${together}`;
  return `${s.reached} von ${s.counted} haben das Ziel erreicht.${together}${due}`;
}

/** Construction stage of a goal house in the class village: 0 site, 1 foundation, 2 walls, 3 roof, 4 finished with flag. */
export function houseStage(percent: number): number {
  if (percent >= 100) return 4;
  if (percent >= 66) return 3;
  if (percent >= 33) return 2;
  if (percent > 0) return 1;
  return 0;
}

// ---------- class overview (teacher) ----------
export type SupportReason = "self_report" | "no_application" | "no_activity" | "upcoming_deadline" | "many_rejections" | "no_reply" | "inactive";
export const SUPPORT_TEXT: Record<SupportReason, string> = {
  self_report: "Meldet selbst: noch keine Lehrstelle",
  no_application: "Noch keine Bewerbung erfasst",
  no_activity: "Seit über 14 Tagen nicht aktiv",
  upcoming_deadline: "Frist in den nächsten 7 Tagen, Bewerbung noch nicht verschickt",
  many_rejections: "Mehrere Absagen, braucht Ermutigung",
  no_reply: "Wartet lange auf Antworten",
  inactive: "Seit über 14 Tagen nicht aktiv",
};
export function supportText(code: string): string { return (SUPPORT_TEXT as Record<string, string>)[code] ?? "Braucht Unterstützung"; }

/** Non-confidential per-student counts. Never contains companies, positions, notes or documents. */
export type OverviewStudent = {
  studentId: string; displayName: string; hidden: boolean;
  applications: number; interviews: number; trialDays: number; offers: number; followUps: number;
  placed: boolean; lastActivity: string | null; needsSupport: boolean; reasons: string[];
};
export type ClassAggregates = { students: number; sharing: number; withApplication: number; withInterview: number; withTrialDay: number; placed: number; needsSupport: number; activeLast14: number };

/** Class aggregates from the per-student rows (used when class_overview_stats has no aggregates, e.g. the fallback path). */
export function aggregate(students: OverviewStudent[], now = Date.now()): ClassAggregates {
  const visible = students.filter((s) => !s.hidden);
  const recent = (s: OverviewStudent) => !!s.lastActivity && now - new Date(s.lastActivity).getTime() <= 14 * DAY;
  return {
    students: students.length, sharing: visible.length,
    withApplication: visible.filter((s) => s.applications > 0).length,
    withInterview: visible.filter((s) => s.interviews > 0).length,
    withTrialDay: visible.filter((s) => s.trialDays > 0).length,
    placed: visible.filter((s) => s.placed).length,
    needsSupport: students.filter((s) => s.needsSupport).length,
    activeLast14: visible.filter(recent).length,
  };
}
export function share(part: number, whole: number): number { return whole > 0 ? Math.round((part / whole) * 100) : 0; }

/**
 * Meaningful progress, not volume: the furthest step reached (0 = not started … 4 = Lehrstelle).
 * Ten applications without a reply count less than one interview.
 */
export const PROGRESS_STEPS = ["Noch nicht gestartet", "Bewerbung verschickt", "Gespräch oder Schnuppern", "Zusage erhalten", "Lehrstelle gefunden"] as const;
export function progressStep(s: Pick<OverviewStudent, "applications" | "interviews" | "trialDays" | "offers" | "placed">): number {
  if (s.placed) return 4;
  if (s.offers > 0) return 3;
  if (s.interviews > 0 || s.trialDays > 0) return 2;
  if (s.applications > 0) return 1;
  return 0;
}

/** Students to look at first: self reports, then the most reasons, then the longest quiet. Hidden students only via their own report. */
export function supportList(students: OverviewStudent[]): OverviewStudent[] {
  const time = (s: OverviewStudent) => (s.lastActivity ? new Date(s.lastActivity).getTime() : 0);
  return students
    .filter((s) => s.needsSupport && (!s.hidden || s.reasons.includes("self_report")))
    .sort((a, b) => Number(b.reasons.includes("self_report")) - Number(a.reasons.includes("self_report")) || b.reasons.length - a.reasons.length || time(a) - time(b) || a.displayName.localeCompare(b.displayName, "de"));
}

type Row = Record<string, unknown>;
const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
const strOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const reasonList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? v.split(",").map((x) => x.trim()).filter(Boolean) : []);

const sumKeys = (c: Record<string, unknown> | null | undefined, keys: string[]) => keys.reduce((n, k) => n + num(c?.[k]), 0);
const BEFORE_SENDING = ["saved", "preparing"];
const INTERVIEW_KEYS = ["interview", "final_interview"];
const TRIAL_KEYS = ["schnupper_planned", "schnupper_done"];
const OFFER_KEYS = ["offer", "contract_signed"];

/**
 * Maps one student of class_overview_stats (snake_case, tolerant to missing columns). Only whitelisted, non-confidential
 * fields are kept. Step counts come from status_counts, which the server only sends when the student shares stages.
 */
export function overviewStudentFromRow(r: Row): OverviewStudent {
  const reasons = reasonList(r.reasons ?? r.reason_codes ?? r.support_reasons);
  const hidden = Boolean(r.hidden);
  const counts = (r.status_counts && typeof r.status_counts === "object" ? r.status_counts : null) as Record<string, unknown> | null;
  const total = num(r.applications ?? r.total);
  const name = strOrNull(r.alias) ?? String(r.display_name ?? "");
  return {
    studentId: String(r.student_id ?? ""), displayName: name, hidden,
    applications: hidden ? 0 : counts ? Math.max(0, total - sumKeys(counts, BEFORE_SENDING)) : num(r.applications_sent ?? total),
    interviews: hidden ? 0 : counts ? sumKeys(counts, INTERVIEW_KEYS) : num(r.interviews),
    trialDays: hidden ? 0 : counts ? sumKeys(counts, TRIAL_KEYS) : num(r.trial_days ?? r.schnupper),
    offers: hidden ? 0 : counts ? sumKeys(counts, OFFER_KEYS) : num(r.offers),
    followUps: hidden ? 0 : num(r.follow_ups),
    placed: hidden ? false : Boolean(r.placed), lastActivity: hidden ? null : strOrNull(r.last_activity),
    needsSupport: Boolean(r.needs_support ?? reasons.length > 0), reasons,
  };
}
export function aggregatesFromRow(r: Row | null | undefined, fallback: ClassAggregates): ClassAggregates {
  if (!r || typeof r !== "object") return fallback;
  const pick = (k: keyof ClassAggregates, ...alts: string[]) => { for (const key of [k, ...alts]) if (r[key] !== undefined && r[key] !== null) return num(r[key]); return fallback[k]; };
  return {
    students: pick("students"), sharing: pick("sharing", "students_sharing", "sharing_students"), withApplication: pick("withApplication", "students_with_application", "with_application"),
    withInterview: pick("withInterview", "students_with_interview", "with_interview"), withTrialDay: pick("withTrialDay", "students_with_trial_day", "with_trial_day"),
    placed: pick("placed", "students_placed"), needsSupport: pick("needsSupport", "needs_support"), activeLast14: pick("activeLast14", "students_active", "active_last_14"),
  };
}

/** Fallback when class_overview_stats is not deployed: derive the same non-confidential view from teacher_class_students rows. */
export function overviewFromTeacherStudents(
  students: { studentId: string; displayName: string; hidden: boolean; total: number; interviews: number; offers: number; schnupper: number; placed: boolean; lastActivity: string | null; inactive: boolean; statusCounts?: Record<string, number | undefined> }[],
  attention: { studentId: string; reason: string }[] = [],
): OverviewStudent[] {
  return students.map((s) => {
    const reasons = new Set(attention.filter((a) => a.studentId === s.studentId).map((a) => a.reason));
    if (!s.hidden && !s.placed) {
      if (s.total === 0) reasons.add("no_application");
      else if (s.inactive) reasons.add("no_activity");
    }
    const sent = s.hidden ? 0 : Math.max(0, s.total - (s.statusCounts?.saved ?? 0) - (s.statusCounts?.preparing ?? 0));
    return {
      studentId: s.studentId, displayName: s.displayName, hidden: s.hidden,
      applications: sent, interviews: s.hidden ? 0 : s.interviews, trialDays: s.hidden ? 0 : s.schnupper, offers: s.hidden ? 0 : s.offers, followUps: 0,
      placed: !s.hidden && s.placed, lastActivity: s.hidden ? null : s.lastActivity,
      needsSupport: reasons.size > 0, reasons: [...reasons],
    };
  });
}

// ---------- "Meine Daten" ----------
export function exportFileName(today: string = new Date().toISOString().slice(0, 10)): string { return `wendapply-meine-daten-${today}.json`; }
/** Keys that must never leave the browser in an export (tokens, secrets). Applied recursively. */
const SECRET_KEY = /(token|secret|password|api_key|access_key|refresh)/i;
export function scrubExport(value: unknown, depth = 0): unknown {
  if (depth > 12) return null;
  if (Array.isArray(value)) return value.map((v) => scrubExport(v, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Row).filter(([k]) => !SECRET_KEY.test(k)).map(([k, v]) => [k, scrubExport(v, depth + 1)]));
  return value;
}
