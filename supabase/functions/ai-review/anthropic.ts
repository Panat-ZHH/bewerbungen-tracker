// Anthropic Messages API call (raw fetch, no SDK) with structured JSON output.
// Pure module apart from the injected fetch: runs in Deno and Node. Never logs the application text.
import { buildUserMessage, normalizeReview, REVIEW_JSON_SCHEMA, SYSTEM_PROMPT, type ReviewInput } from "./prompt.ts";
import { ReviewFailure } from "./errors.ts";
import type { AiReviewResult } from "./types.ts";

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2026-10-21";
export const DEFAULT_MODEL = "claude-haiku-5-5";
/** Per attempt. */
export const TIMEOUT_MS = 50_000;
/** All attempts together: must stay below the browser timeout (lib/ai-review.ts, 90 s) and the edge limit (150 s). */
export const TOTAL_DEADLINE_MS = 80_000;
/** A retry only starts if at least this much of the deadline is left. */
export const MIN_RETRY_MS = 20_000;
/** Hard cap on output tokens per call (the JSON review is ~1.5–3k tokens). */
export const MAX_TOKENS = 8000;

export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/**
 * Budget units ("input-token equivalents") of one response: output tokens weigh 5×, cache writes 1.25×, cache reads
 * 0.1× – roughly the price ratios of the Claude models, so one budget works for any model.
 */
export function budgetUnits(usage: TokenUsage | undefined | null): number {
  if (!usage || typeof usage !== "object") return 0;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  return Math.ceil(n(usage.input_tokens) + 1.25 * n(usage.cache_creation_input_tokens) + 0.1 * n(usage.cache_read_input_tokens) + 5 * n(usage.output_tokens));
}

/** Worst case of one call before we know the usage: input chars/3 + system prompt + full output. Used for budget checks. */
export function estimateBudgetUnits(inputChars: number): number {
  return Math.ceil(inputChars / 3) + 4000 + 5 * MAX_TOKENS;
}

export interface AnthropicOptions {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Waits between the first attempt and the retry (injectable for tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Called with the token usage of every response the API billed (also failed attempts). */
  onUsage?: (usage: TokenUsage) => void;
  totalDeadlineMs?: number;
  now?: () => number;
}

export function buildRequestBody(input: ReviewInput, model: string): Record<string, unknown> {
  const outputConfig: Record<string, unknown> = { effort: "medium" };
  // Structured output: the response text is guaranteed to be JSON matching the schema.
  if (REVIEW_JSON_SCHEMA && Object.keys(REVIEW_JSON_SCHEMA).length > 0) {
    outputConfig.format = { type: "json_schema", schema: REVIEW_JSON_SCHEMA };
  }
  return {
    model,
    max_tokens: MAX_TOKENS,
    // Static system prompt (~3k tokens) → prompt caching across requests.
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildUserMessage(input) }],
    output_config: outputConfig,
  };
}

/** Internal: a failed attempt, `retry` says whether a second attempt makes sense. */
class AttemptError extends Error {
  readonly reason: string;
  readonly retry: boolean;
  readonly waitMs: number;
  constructor(reason: string, retry: boolean, waitMs = 1500) {
    super(reason);
    this.reason = reason;
    this.retry = retry;
    this.waitMs = waitMs;
  }
}

function retryAfterMs(res: Response): number {
  const s = Number(res.headers.get("retry-after"));
  return Number.isFinite(s) && s > 0 ? Math.min(s * 1000, 10_000) : 1500;
}

/** Reads the JSON result out of a Messages API response body. Throws AttemptError. */
export function parseMessageResponse(body: unknown): unknown {
  const msg = body as { stop_reason?: string; content?: { type: string; text?: string }[] };
  if (msg?.stop_reason === "refusal") throw new AttemptError("refusal", false);
  if (msg?.stop_reason === "max_tokens") throw new AttemptError("max_tokens", true);
  const text = (msg?.content ?? []).filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join("");
  if (!text.trim()) throw new AttemptError("empty", true);
  try {
    return JSON.parse(text);
  } catch {
    // Without structured output (schema still a stub) the model may wrap the JSON in prose or a code fence.
    const start = text.indexOf("{"), end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch { /* fall through */ }
    }
    throw new AttemptError("invalid_json", true);
  }
}

type AttemptOptions = { apiKey: string; model: string; fetch: typeof fetch; timeoutMs: number; onUsage: (u: TokenUsage) => void };

async function attempt(input: ReviewInput, opts: AttemptOptions): Promise<{ result: AiReviewResult; model: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  let res: Response;
  try {
    res = await opts.fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": opts.apiKey, "anthropic-version": ANTHROPIC_VERSION },
      body: JSON.stringify(buildRequestBody(input, opts.model)),
      signal: ctrl.signal,
    });
  } catch (e) {
    // A timeout is not retried (the user would wait > 2 minutes); a network error is.
    const timedOut = ctrl.signal.aborted || (e as Error)?.name === "AbortError";
    throw new AttemptError(timedOut ? "timeout" : "network", !timedOut);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    const retry = res.status === 429 || res.status >= 500;
    throw new AttemptError(`http_${res.status}`, retry, retryAfterMs(res));
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new AttemptError("invalid_body", true);
  }
  const usage = (body as { usage?: TokenUsage } | null)?.usage;
  if (usage && typeof usage === "object") opts.onUsage(usage);
  const raw = parseMessageResponse(body);
  let result: AiReviewResult;
  try {
    result = normalizeReview(raw, { hasJobAd: Boolean(input.jobAd?.trim()) });
  } catch {
    throw new AttemptError("invalid_review", true);
  }
  const model = typeof (body as { model?: unknown }).model === "string" ? (body as { model: string }).model : opts.model;
  return { result, model };
}

/** Calls the model, one retry on 429 / 5xx / network / unusable JSON. Throws ReviewFailure("ai_failed"). */
export async function reviewWithAnthropic(input: ReviewInput, options: AnthropicOptions): Promise<{ result: AiReviewResult; model: string; attempts: number }> {
  const now = options.now ?? (() => Date.now());
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const deadline = now() + (options.totalDeadlineMs ?? TOTAL_DEADLINE_MS);
  const base = {
    apiKey: options.apiKey,
    model: options.model || DEFAULT_MODEL,
    fetch: options.fetch ?? fetch,
    onUsage: (u: TokenUsage) => { try { options.onUsage?.(u); } catch { /* accounting must not break the review */ } },
  };
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let n = 1; ; n++) {
    try {
      const left = Math.max(1, deadline - now());
      return { ...(await attempt(input, { ...base, timeoutMs: Math.min(timeoutMs, left) })), attempts: n };
    } catch (e) {
      const err = e instanceof AttemptError ? e : new AttemptError("unexpected", false);
      const leftAfterWait = deadline - now() - err.waitMs;
      const retry = err.retry && n < 2 && leftAfterWait >= Math.min(MIN_RETRY_MS, timeoutMs);
      if (!retry) throw new ReviewFailure("ai_failed", undefined, `anthropic ${err.reason} after ${n} attempt(s)`);
      await sleep(err.waitMs);
    }
  }
}
