// HTTP handler of the ai-review edge function. All I/O (auth, database, PDF/ZIP libraries, fetch, env) is injected,
// so the full request flow is testable under Node; index.ts wires the real Deno/Supabase implementations.
// Privacy: the uploaded file and its text only live in memory during the request. Only the result row is stored.
// Never log the text, the file or the form fields – log codes only.
import { ReviewFailure, isReviewFailure } from "./errors.ts";
import {
  MAX_BERUF, MAX_COMPANY, MAX_FILE_BYTES, MAX_JOB_AD, type ExtractDeps,
  extractApplicationText, isOverDailyLimit, readOptionalField, resolveDailyLimit, safeFileName, since24h,
} from "./extract.ts";
import { MOCK_MODEL, mockReview } from "./mock.ts";
import { DEFAULT_MODEL, reviewWithAnthropic } from "./anthropic.ts";
import { normalizeReview, PROMPT_VERSION } from "./prompt.ts";
import type { AiReviewResponse, AiReviewResult } from "./types.ts";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export interface ReviewRow {
  user_id: string;
  file_name: string | null;
  company: string | null;
  beruf: string | null;
  score: number;
  result: AiReviewResult;
  model: string;
  prompt_version: string;
}

export interface HandlerDeps {
  env: (name: string) => string | undefined;
  /** Verifies the access token (supabase auth.getUser). null = invalid / expired. */
  verifyUser: (token: string) => Promise<{ id: string } | null>;
  /** Upserts ai_review_user_settings.consent_at (service role). */
  saveConsent: (userId: string, atIso: string) => Promise<void>;
  /** ai_review_user_settings.daily_limit of the user, or null. */
  getDailyLimit: (userId: string) => Promise<number | null>;
  /** Number of ai_reviews rows of the user created at or after `sinceIso`. */
  countReviewsSince: (userId: string, sinceIso: string) => Promise<number>;
  /** Inserts the result row (service role) and returns id + created_at. */
  insertReview: (row: ReviewRow) => Promise<{ id: string; created_at: string }>;
  extract: ExtractDeps;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  log?: (event: string, meta?: Record<string, string | number | boolean>) => void;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" } });

export function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(h.trim());
  return m ? m[1] : null;
}

export function isMockMode(env: (name: string) => string | undefined): boolean {
  return !env("ANTHROPIC_API_KEY")?.trim() || env("AI_REVIEW_MOCK")?.trim() === "1";
}

interface FileLike { size: number; name?: string; arrayBuffer: () => Promise<ArrayBuffer> }
const isFileLike = (v: unknown): v is FileLike =>
  typeof v === "object" && v !== null && typeof (v as FileLike).arrayBuffer === "function" && typeof (v as FileLike).size === "number";

export function createHandler(deps: HandlerDeps): (req: Request) => Promise<Response> {
  const log = deps.log ?? (() => {});
  const now = deps.now ?? (() => new Date());

  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    try {
      if (req.method !== "POST") throw new ReviewFailure("bad_request", undefined, "method");

      const token = bearerToken(req);
      const user = token ? await deps.verifyUser(token).catch(() => null) : null;
      if (!user) throw new ReviewFailure("unauthorized");

      if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("multipart/form-data")) {
        throw new ReviewFailure("bad_request", undefined, "content-type");
      }
      // Cheap guard before buffering the body (multipart overhead + 8000 chars of job ad on top of 5 MB).
      const declared = Number(req.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > MAX_FILE_BYTES + 256 * 1024) throw new ReviewFailure("file_too_large");

      let form: FormData;
      try {
        form = await req.formData();
      } catch {
        throw new ReviewFailure("bad_request", undefined, "form");
      }
      if (form.get("consent") !== "true") throw new ReviewFailure("consent_required");

      const file = form.get("file");
      if (!isFileLike(file)) throw new ReviewFailure("bad_request", undefined, "file missing");
      if (file.size > MAX_FILE_BYTES) throw new ReviewFailure("file_too_large");
      const company = readOptionalField(form.get("company"), MAX_COMPANY);
      const beruf = readOptionalField(form.get("beruf"), MAX_BERUF);
      const jobAd = readOptionalField(form.get("jobAd"), MAX_JOB_AD);

      const at = now();
      await deps.saveConsent(user.id, at.toISOString());

      const limit = resolveDailyLimit(await deps.getDailyLimit(user.id), deps.env("AI_REVIEW_DEFAULT_DAILY_LIMIT"));
      if (limit !== null) {
        const used = await deps.countReviewsSince(user.id, since24h(at));
        if (isOverDailyLimit(used, limit)) {
          throw new ReviewFailure(
            "rate_limited",
            limit === 0
              ? "Der Bewerbungs-Check ist für dein Konto im Moment nicht freigeschaltet. Frag deine Lehrperson."
              : `Du hast in den letzten 24 Stunden schon ${limit} ${limit === 1 ? "Check" : "Checks"} gemacht. Morgen kannst du deine Bewerbung wieder prüfen lassen.`,
          );
        }
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const { kind, text } = await extractApplicationText(bytes, deps.extract);
      const input = { text, company, beruf, jobAd };

      const mock = isMockMode(deps.env);
      let result: AiReviewResult;
      let model: string;
      if (mock) {
        result = normalizeReview(mockReview(input));
        model = MOCK_MODEL;
      } else {
        const out = await reviewWithAnthropic(input, {
          apiKey: deps.env("ANTHROPIC_API_KEY")!.trim(),
          model: deps.env("AI_REVIEW_MODEL")?.trim() || DEFAULT_MODEL,
          fetch: deps.fetch,
          sleep: deps.sleep,
        });
        result = out.result;
        model = out.model;
      }

      const row = await deps.insertReview({
        user_id: user.id,
        file_name: safeFileName(file.name),
        company: company ?? null,
        beruf: beruf ?? null,
        score: result.score,
        result,
        model,
        prompt_version: PROMPT_VERSION,
      });
      log("ai_review_ok", { kind, chars: text.length, mock, score: result.score });
      const body: AiReviewResponse = { id: row.id, createdAt: row.created_at, model, mock, result };
      return json(200, body);
    } catch (e) {
      if (isReviewFailure(e)) {
        log("ai_review_failed", { code: e.code, detail: e.message });
        return json(e.status, e.toBody());
      }
      // Unknown errors (e.g. database): report as ai_failed without leaking details.
      log("ai_review_error", { name: (e as Error)?.name ?? "unknown" });
      return json(502, new ReviewFailure("ai_failed").toBody());
    }
  };
}
