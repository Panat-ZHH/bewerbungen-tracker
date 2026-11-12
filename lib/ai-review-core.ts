// Pure helpers for the "Bewerbungs-Check" (no Supabase, no React) so they can be unit-tested with node --test.
// The binding contract lives in supabase/functions/ai-review/types.ts (shared with the edge function).
import {
  AI_REVIEW_CATEGORIES,
  type AiReviewCategory,
  type AiReviewErrorCode,
  type AiReviewResponse,
  type AiReviewResult,
} from "../supabase/functions/ai-review/types.ts";

export { AI_REVIEW_CATEGORIES };
export type { AiReviewCategory, AiReviewErrorCode, AiReviewResponse, AiReviewResult };

export const MAX_AI_REVIEW_BYTES = 5 * 1024 * 1024;
export const AI_REVIEW_LIMITS = { company: 200, beruf: 200, jobAd: 8000 } as const;
export const PDF_TYPE = "application/pdf";
export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const AI_REVIEW_ACCEPT = `.pdf,.docx,${PDF_TYPE},${DOCX_TYPE}`;

/** Client-side error codes: the server codes plus "network" (no connection), "timeout" and "unknown". */
export type AiReviewClientErrorCode = AiReviewErrorCode | "network" | "timeout" | "unknown";

/** Friendly German messages (Swiss spelling, du-form) for every error code. Shown to pupils of about 14. */
export const AI_REVIEW_ERROR_MESSAGES: Record<AiReviewClientErrorCode, string> = {
  unauthorized: "Du bist nicht mehr angemeldet. Melde dich neu an und versuche es dann nochmals.",
  consent_required: "Bitte bestätige zuerst, dass du mit dem Check einverstanden bist.",
  bad_request: "Da hat etwas nicht gepasst. Prüfe deine Angaben und versuche es nochmals.",
  unsupported_file: "Diese Datei können wir nicht lesen. Nimm bitte ein PDF oder ein Word-Dokument (.docx).",
  file_too_large: "Die Datei ist grösser als 5 MB. Speichere sie kleiner ab oder lade nur deinen Brief hoch.",
  no_text: "In der Datei haben wir fast keinen Text gefunden. Vielleicht ist sie eingescannt oder ein Foto. Speichere deinen Brief direkt aus Word als PDF oder DOCX.",
  too_long: "Der Text ist sehr lang. Lade nur dein Motivationsschreiben hoch, ohne Lebenslauf und Zeugnisse.",
  rate_limited: "Für heute hast du genug Checks gemacht. Morgen geht es weiter. Bis dahin kannst du die Tipps schon umsetzen.",
  ai_failed: "Der Check hat gerade nicht geklappt. Das liegt nicht an dir. Warte kurz und versuche es nochmals.",
  network: "Wir erreichen den Check gerade nicht. Prüfe dein Internet und versuche es nochmals.",
  timeout: "Das hat zu lange gedauert. Versuche es gleich nochmals.",
  unknown: "Etwas ist schiefgelaufen. Versuche es nochmals. Wenn es wieder nicht klappt, melde dich bei uns.",
};

const SERVER_CODES = new Set<string>(["unauthorized", "consent_required", "bad_request", "unsupported_file", "file_too_large", "no_text", "too_long", "rate_limited", "ai_failed"]);

export function isAiReviewErrorCode(value: unknown): value is AiReviewErrorCode {
  return typeof value === "string" && SERVER_CODES.has(value);
}

/** Maps an HTTP status (when the body carries no known code) to the closest error code. */
export function errorCodeForStatus(status: number): AiReviewClientErrorCode {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 413) return "file_too_large";
  if (status === 415) return "unsupported_file";
  if (status === 422) return "no_text";
  if (status === 429) return "rate_limited";
  if (status === 400) return "bad_request";
  if (status === 408 || status === 504) return "timeout";
  if (status >= 500) return "ai_failed";
  return "unknown";
}

/** Reads an error response body ({ error, message }) into a code + friendly message. Always uses our own wording. */
export function parseAiReviewError(status: number, body: unknown): { code: AiReviewClientErrorCode; message: string } {
  const raw = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
  const code = isAiReviewErrorCode(raw) ? raw : errorCodeForStatus(status);
  return { code, message: AI_REVIEW_ERROR_MESSAGES[code] };
}

export function aiReviewErrorMessage(code: unknown): string {
  return typeof code === "string" && code in AI_REVIEW_ERROR_MESSAGES ? AI_REVIEW_ERROR_MESSAGES[code as AiReviewClientErrorCode] : AI_REVIEW_ERROR_MESSAGES.unknown;
}

// ---------- form validation ----------

export type FileLike = { name: string; size: number; type: string };

/** Effective MIME type: browsers sometimes send "" (or octet-stream) for DOCX, so the extension decides then. */
export function reviewFileType(file: FileLike): "pdf" | "docx" | null {
  const type = (file.type || "").toLowerCase();
  if (type === PDF_TYPE) return "pdf";
  if (type === DOCX_TYPE) return "docx";
  if (type && type !== "application/octet-stream" && type !== "application/zip") return null;
  if (/\.pdf$/i.test(file.name)) return "pdf";
  if (/\.docx$/i.test(file.name)) return "docx";
  return null;
}

export function validateReviewFile(file: FileLike | null | undefined): string | null {
  if (!file) return "Wähle zuerst deine Bewerbung aus (PDF oder Word).";
  if (/\.doc$/i.test(file.name)) return "Alte Word-Dateien (.doc) gehen leider nicht. Speichere den Brief in Word als .docx oder PDF.";
  if (!reviewFileType(file)) return "Diese Datei geht leider nicht. Nimm bitte ein PDF oder ein Word-Dokument (.docx).";
  if (file.size <= 0) return "Die Datei ist leer.";
  if (file.size > MAX_AI_REVIEW_BYTES) return "Die Datei ist grösser als 5 MB. Speichere sie kleiner ab oder lade nur deinen Brief hoch.";
  return null;
}

export type ReviewFields = { company?: string; beruf?: string; jobAd?: string };
export type ReviewForm = ReviewFields & { file?: FileLike | null; consent?: boolean };
export type ReviewFormErrors = Partial<Record<"file" | "company" | "beruf" | "jobAd" | "consent", string>>;

/** Trims the optional text fields and drops empty ones. */
export function cleanFields(fields: ReviewFields): ReviewFields {
  const out: ReviewFields = {};
  for (const key of ["company", "beruf", "jobAd"] as const) {
    const value = (fields[key] ?? "").trim();
    if (value) out[key] = value;
  }
  return out;
}

export function validateReviewForm(form: ReviewForm): { ok: boolean; errors: ReviewFormErrors } {
  const errors: ReviewFormErrors = {};
  const fileProblem = validateReviewFile(form.file);
  if (fileProblem) errors.file = fileProblem;
  const fields = cleanFields(form);
  if ((fields.company?.length ?? 0) > AI_REVIEW_LIMITS.company) errors.company = `Bitte höchstens ${AI_REVIEW_LIMITS.company} Zeichen.`;
  if ((fields.beruf?.length ?? 0) > AI_REVIEW_LIMITS.beruf) errors.beruf = `Bitte höchstens ${AI_REVIEW_LIMITS.beruf} Zeichen.`;
  if ((fields.jobAd?.length ?? 0) > AI_REVIEW_LIMITS.jobAd) errors.jobAd = `Das Inserat ist zu lang. Kopiere nur den wichtigsten Teil (höchstens ${AI_REVIEW_LIMITS.jobAd.toLocaleString("de-CH")} Zeichen).`;
  if (!form.consent) errors.consent = "Bitte setze zuerst das Häkchen.";
  return { ok: Object.keys(errors).length === 0, errors };
}

// ---------- score presentation ----------

export type ScoreTone = "mint" | "sun" | "blue" | "paper";

/** Friendly, never shaming label for the total score (0..100). */
export function scoreLabel(score: number): { label: string; text: string; tone: ScoreTone } {
  const value = clampScore(score, 100);
  if (value >= 85) return { label: "Richtig stark!", text: "Dein Brief ist schon sehr gut. Mit dem letzten Schliff wird er noch besser.", tone: "mint" };
  if (value >= 70) return { label: "Gut unterwegs", text: "Eine gute Bewerbung. Ein paar Änderungen machen sie noch stärker.", tone: "sun" };
  if (value >= 50) return { label: "Solide Basis", text: "Das Wichtigste ist da. Mit den Tipps unten holst du noch viel heraus.", tone: "blue" };
  return { label: "Guter Anfang", text: "Jeder Brief fängt so an. Nimm dir die Tipps unten Schritt für Schritt vor.", tone: "paper" };
}

/** Short hint for one category score (0..20). */
export function categoryLevel(score: number): { label: string; tone: "strong" | "ok" | "work" } {
  const value = clampScore(score, 20);
  if (value >= 16) return { label: "stark", tone: "strong" };
  if (value >= 11) return { label: "gut", tone: "ok" };
  return { label: "hier lohnt es sich", tone: "work" };
}

export function clampScore(score: number, max: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(max, Math.round(score)));
}

/** Progress text during the check (up to ~30 s): changes every few seconds, the last one stays. */
export const LOADING_STEPS = [
  "Wir lesen deinen Brief …",
  "Wir schauen uns Aufbau und Sprache an …",
  "Wir suchen, was schon gut ist …",
  "Wir sammeln Ideen zum Verbessern …",
  "Wir schreiben Beispielsätze für dich …",
  "Fast fertig, noch einen Moment …",
] as const;

export function loadingStep(elapsedMs: number, stepMs = 5000): string {
  const index = Math.min(LOADING_STEPS.length - 1, Math.max(0, Math.floor(elapsedMs / stepMs)));
  return LOADING_STEPS[index];
}

/** Fake progress 0..0.95 that slows down towards ~30 s and never reaches 100 % before the answer arrives. */
export function loadingProgress(elapsedMs: number, expectedMs = 30000): number {
  const t = Math.max(0, elapsedMs) / expectedMs;
  return Math.min(0.95, 1 - Math.exp(-2.2 * t));
}

// ---------- history rows ----------

export interface AiReviewRecord {
  id: string;
  createdAt: string;
  fileName: string | null;
  company: string | null;
  beruf: string | null;
  score: number;
  model: string | null;
  result: AiReviewResult;
  mock?: boolean;
}

export type AiReviewRow = { id: string; created_at: string; file_name?: string | null; company?: string | null; beruf?: string | null; score?: number | null; model?: string | null; result: AiReviewResult };

export function reviewFromRow(row: AiReviewRow): AiReviewRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    fileName: row.file_name ?? null,
    company: row.company ?? null,
    beruf: row.beruf ?? null,
    score: clampScore(row.score ?? row.result?.score ?? 0, 100),
    model: row.model ?? null,
    result: row.result,
  };
}

/** One-line title for a past check: "Swisscom · Informatiker EFZ" or the file name. */
export function reviewTitle(record: Pick<AiReviewRecord, "company" | "beruf" | "fileName">): string {
  const parts = [record.company, record.beruf].map((value) => value?.trim()).filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return record.fileName?.trim() || "Bewerbungs-Check";
}

export function formatReviewDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric" });
}

export function formatFileSize(bytes: number): string {
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ---------- mock / preview mode ----------

/** A realistic sample result used when NEXT_PUBLIC_AI_REVIEW_MOCK=1 (Netlify previews without the edge function). */
export function sampleReviewResult(fields: ReviewFields = {}): AiReviewResult {
  const company = fields.company?.trim();
  const beruf = fields.beruf?.trim();
  const hasCompanyInfo = Boolean(company || fields.jobAd?.trim());
  const firm = company || "die Firma";
  const breakdown: AiReviewCategory[] = [
    { key: "aufbau", label: "Aufbau", score: 15, comment: "Anrede, Einleitung und Schluss sind da. Die Absätze könnten klarer getrennt sein." },
    { key: "sprache", label: "Sprache", score: 14, comment: "Du schreibst verständlich. Einige Sätze sind sehr lang." },
    { key: "motivation", label: "Motivation", score: 12, comment: "Man merkt, dass du willst. Ein konkretes Erlebnis würde das noch zeigen." },
    { key: "passung", label: "Passung zur Firma", score: hasCompanyInfo ? 11 : 10, comment: hasCompanyInfo ? `Du nennst ${firm}, aber noch nicht, warum gerade dieser Betrieb.` : "Der Brief passt zu vielen Firmen. Ein Satz zum Betrieb macht ihn persönlicher." },
    { key: "rechtschreibung", label: "Rechtschreibung", score: 17, comment: "Fast fehlerfrei. Achte auf die Gross- und Kleinschreibung bei «Sie»." },
  ];
  const score = breakdown.reduce((sum, item) => sum + item.score, 0);
  return {
    score,
    summary: `Ein guter Brief mit einer klaren Struktur${beruf ? ` für ${beruf}` : ""}. Mit einem konkreten Beispiel aus deinem Alltag wird er richtig überzeugend.`,
    breakdown,
    good: [
      "Du sprichst die richtige Person mit Namen an.",
      "Du erwähnst deine Schnupperlehre. Das zeigt echtes Interesse.",
      "Dein Schluss mit der Bitte um ein Gespräch ist freundlich und klar.",
    ],
    improve: [
      {
        tipp: "Fang mit etwas Persönlichem an statt mit «Hiermit bewerbe ich mich».",
        beispiel: {
          vorher: "Hiermit bewerbe ich mich für die Lehrstelle.",
          nachher: `Seit ich beim Schnuppern ${company ? `bei ${company} ` : ""}selbst mitarbeiten durfte, weiss ich: Diese Lehre will ich machen.`,
          warum: "Ein persönlicher Einstieg macht neugierig auf den Rest.",
        },
      },
      {
        tipp: "Zeig deine Stärken mit einem kurzen Beispiel.",
        beispiel: {
          vorher: "Ich bin zuverlässig und teamfähig.",
          nachher: "Im Fussballverein bin ich seit zwei Jahren für das Material zuständig und bin immer pünktlich im Training.",
          warum: "Ein Beispiel ist glaubwürdiger als eine Liste von Eigenschaften.",
        },
      },
      {
        tipp: "Teile lange Sätze in zwei kurze Sätze.",
        beispiel: {
          vorher: "Ich interessiere mich sehr für diesen Beruf, weil ich gerne mit den Händen arbeite und auch gerne draussen bin und mit Menschen zu tun habe.",
          nachher: "Ich arbeite gerne mit den Händen und bin gerne draussen. Ausserdem habe ich gerne mit Menschen zu tun.",
          warum: "Kurze Sätze kann man schneller lesen.",
        },
      },
    ],
    company: hasCompanyInfo
      ? [
          {
            tipp: `Schreib einen Satz dazu, was dir an ${firm} gefällt.`,
            beispiel: {
              vorher: "fehlt",
              nachher: `Mir gefällt, dass ${firm} viele Lernende ausbildet und man in der Lehre verschiedene Abteilungen kennenlernt.`,
              warum: "So merkt der Betrieb, dass du dich informiert hast.",
            },
          },
          { tipp: "Nimm ein Wort aus dem Inserat auf, zum Beispiel «exakt arbeiten», und zeig, wo du das schon machst." },
        ]
      : [],
    nextStep: "Schreib zuerst deinen Einstieg neu. Danach lies den ganzen Brief laut vor.",
  };
}

export function sampleReviewResponse(fields: ReviewFields = {}, now = new Date()): AiReviewResponse {
  return { id: null, createdAt: now.toISOString(), model: "vorschau", mock: true, result: sampleReviewResult(fields) };
}
