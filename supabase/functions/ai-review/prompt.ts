// STUB – owned by the "ai-prompt" part, which replaces this file completely.
// Contract (keep these exports):
import type { AiReviewResult } from "./types.ts";

export const PROMPT_VERSION = "stub-0";
export const SYSTEM_PROMPT = "STUB";

export interface ReviewInput {
  text: string; // extracted application text
  company?: string; // company name
  jobAd?: string; // pasted job ad / company info
  beruf?: string; // apprenticeship / trade, e.g. "Fachmann Betriebsunterhalt EFZ"
}

/** The user message sent to the model. */
export function buildUserMessage(input: ReviewInput): string {
  return input.text;
}

/** JSON schema of AiReviewResult for structured output. */
export const REVIEW_JSON_SCHEMA: Record<string, unknown> = {};

/** Validates/repairs raw model output (clamps scores, recomputes total, trims lists). Throws if unusable. */
export function normalizeReview(raw: unknown): AiReviewResult {
  return raw as AiReviewResult;
}
