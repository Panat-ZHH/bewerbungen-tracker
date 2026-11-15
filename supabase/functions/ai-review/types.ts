// Shared contract for the AI application review ("Bewerbungs-Check").
// Used by the edge function (Deno) and copied/imported by the Next.js client (lib/ai-review.ts).
// Change only together with all parts (backend, prompt, UI).

export type AiReviewCategoryKey = "aufbau" | "sprache" | "motivation" | "passung" | "rechtschreibung";

export const AI_REVIEW_CATEGORIES: { key: AiReviewCategoryKey; label: string }[] = [
  { key: "aufbau", label: "Aufbau" },
  { key: "sprache", label: "Sprache" },
  { key: "motivation", label: "Motivation" },
  { key: "passung", label: "Passung zur Firma" },
  { key: "rechtschreibung", label: "Rechtschreibung" },
];

/** A concrete before/after sentence the pupil can copy. */
export interface AiReviewExample {
  vorher: string; // quoted from the pupil's text (or "fehlt" if missing)
  nachher: string; // improved sentence, ready to copy
  warum: string; // one short sentence why it is better
}

export interface AiReviewCategory {
  key: AiReviewCategoryKey;
  label: string;
  score: number; // 0..20 (integer)
  comment: string; // 1 short sentence explaining the score
}

export interface AiReviewTip {
  tipp: string; // short, concrete, friendly
  beispiel?: AiReviewExample;
}

export interface AiReviewResult {
  score: number; // 0..100 = sum of the 5 category scores
  summary: string; // 1-2 encouraging sentences
  breakdown: AiReviewCategory[]; // exactly 5, in AI_REVIEW_CATEGORIES order
  good: string[]; // 2..4 things that are already good (specific, not generic)
  improve: AiReviewTip[]; // 2..5 most important improvements, most important first
  company: AiReviewTip[]; // 0..3 company/job specific suggestions (empty if no company info given)
  nextStep: string; // one sentence: what to do first
}

export interface AiReviewResponse {
  id: string | null; // row id in public.ai_reviews (null in mock/preview mode)
  createdAt: string;
  model: string;
  mock: boolean;
  result: AiReviewResult;
}

export type AiReviewErrorCode =
  | "unauthorized" // 401
  | "consent_required" // 400
  | "bad_request" // 400
  | "unsupported_file" // 415 (only PDF and DOCX)
  | "file_too_large" // 413 (> 5 MB)
  | "no_text" // 422 (e.g. scanned PDF without text layer, or < ~150 characters)
  | "too_long" // 413 (extracted text > 20'000 characters)
  | "rate_limited" // 429
  | "ai_failed"; // 502

export interface AiReviewError {
  error: AiReviewErrorCode;
  message: string; // friendly German (Swiss spelling, no ß), safe to show to a 14-year-old
}
