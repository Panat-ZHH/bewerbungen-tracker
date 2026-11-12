// Client for the "Bewerbungs-Check": calls the ai-review edge function and reads/deletes past checks (table public.ai_reviews).
// NEXT_PUBLIC_AI_REVIEW_MOCK=1 → no network at all: a built-in sample result after ~1.5 s and an in-memory history
// (used for Netlify previews while the edge function is not deployed yet).
import { supabase } from "@/lib/supabase";
import {
  AI_REVIEW_ERROR_MESSAGES,
  cleanFields,
  parseAiReviewError,
  reviewFromRow,
  sampleReviewResponse,
  validateReviewFile,
  type AiReviewClientErrorCode,
  type AiReviewRecord,
  type AiReviewResponse,
  type AiReviewRow,
  type ReviewFields,
} from "@/lib/ai-review-core";

export type { AiReviewRecord, ReviewFields };

/** Must stay a literal `process.env.NEXT_PUBLIC_…` access so Next.js inlines it at build time. */
export const isAiReviewMock = () => process.env.NEXT_PUBLIC_AI_REVIEW_MOCK === "1";

export class AiReviewRequestError extends Error {
  code: AiReviewClientErrorCode;
  constructor(code: AiReviewClientErrorCode, message = AI_REVIEW_ERROR_MESSAGES[code]) {
    super(message);
    this.name = "AiReviewRequestError";
    this.code = code;
  }
}

const REQUEST_TIMEOUT_MS = 90_000;
const MOCK_DELAY_MS = 1500;

// ---------- preview (mock) mode: in-memory history for this browser tab ----------
let mockHistory: AiReviewRecord[] = [];
let mockCounter = 0;

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });
}

/** Sends the file + optional fields to the edge function. Throws AiReviewRequestError with a friendly message. */
export async function callAiReview(file: File, fields: ReviewFields, options: { signal?: AbortSignal } = {}): Promise<AiReviewResponse> {
  const problem = validateReviewFile(file);
  if (problem) throw new AiReviewRequestError(/5 MB/.test(problem) ? "file_too_large" : "unsupported_file", problem);
  const clean = cleanFields(fields);

  if (isAiReviewMock()) {
    await wait(MOCK_DELAY_MS, options.signal);
    const response = sampleReviewResponse(clean);
    mockCounter += 1;
    mockHistory = [{ id: `vorschau-${mockCounter}`, createdAt: response.createdAt, fileName: file.name, company: clean.company ?? null, beruf: clean.beruf ?? null, score: response.result.score, model: response.model, result: response.result, mock: true }, ...mockHistory];
    return { ...response, id: mockHistory[0].id };
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!base || !token) throw new AiReviewRequestError("unauthorized");

  const body = new FormData();
  body.append("file", file, file.name);
  body.append("consent", "true");
  if (clean.company) body.append("company", clean.company);
  if (clean.beruf) body.append("beruf", clean.beruf);
  if (clean.jobAd) body.append("jobAd", clean.jobAd);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
  const forward = () => controller.abort();
  options.signal?.addEventListener("abort", forward, { once: true });

  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/$/, "")}/functions/v1/ai-review`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "" },
      body,
      signal: controller.signal,
    });
  } catch (reason) {
    if (options.signal?.aborted) throw reason;
    throw new AiReviewRequestError(timedOut ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", forward);
  }

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const { code, message } = parseAiReviewError(response.status, json);
    throw new AiReviewRequestError(code, message);
  }
  const result = (json as AiReviewResponse | null)?.result;
  if (!result || typeof result.score !== "number" || !Array.isArray(result.breakdown)) throw new AiReviewRequestError("ai_failed");
  return json as AiReviewResponse;
}

/** Past checks of the signed-in user, newest first (RLS: owner only). */
export async function listAiReviews(): Promise<AiReviewRecord[]> {
  if (isAiReviewMock()) return [...mockHistory];
  const { data, error } = await supabase
    .from("ai_reviews")
    .select("id, created_at, file_name, company, beruf, score, model, result")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw Object.assign(new Error(`Database error: ${[error.code, error.message].filter(Boolean).join(" | ")}`), { code: error.code });
  return ((data ?? []) as AiReviewRow[]).filter((row) => row.result).map(reviewFromRow);
}

export async function deleteAiReview(id: string): Promise<void> {
  if (isAiReviewMock()) { mockHistory = mockHistory.filter((item) => item.id !== id); return; }
  const { error } = await supabase.from("ai_reviews").delete().eq("id", id);
  if (error) throw Object.assign(new Error(`Database error: ${[error.code, error.message].filter(Boolean).join(" | ")}`), { code: error.code });
}
