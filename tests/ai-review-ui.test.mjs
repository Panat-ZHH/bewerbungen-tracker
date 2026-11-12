import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AI_REVIEW_CATEGORIES,
  AI_REVIEW_ERROR_MESSAGES,
  AI_REVIEW_LIMITS,
  LOADING_STEPS,
  MAX_AI_REVIEW_BYTES,
  aiReviewErrorMessage,
  categoryLevel,
  cleanFields,
  errorCodeForStatus,
  loadingProgress,
  loadingStep,
  parseAiReviewError,
  reviewFileType,
  reviewFromRow,
  reviewTitle,
  sampleReviewResponse,
  sampleReviewResult,
  scoreLabel,
  validateReviewFile,
  validateReviewForm,
} from "../lib/ai-review-core.ts";

const ROOT = join(import.meta.dirname, "..");
const pdf = { name: "brief.pdf", size: 20_000, type: "application/pdf" };
const docx = { name: "Brief.DOCX", size: 20_000, type: "" };
const SERVER_CODES = ["unauthorized", "consent_required", "bad_request", "unsupported_file", "file_too_large", "no_text", "too_long", "rate_limited", "ai_failed"];

test("score label: friendly at every level, never shaming", () => {
  assert.equal(scoreLabel(100).label, "Richtig stark!");
  assert.equal(scoreLabel(85).tone, "mint");
  assert.equal(scoreLabel(84).label, "Gut unterwegs");
  assert.equal(scoreLabel(70).tone, "sun");
  assert.equal(scoreLabel(69).label, "Solide Basis");
  assert.equal(scoreLabel(50).tone, "blue");
  assert.equal(scoreLabel(49).label, "Guter Anfang");
  assert.equal(scoreLabel(0).label, "Guter Anfang");
  assert.equal(scoreLabel(-5).label, "Guter Anfang");
  assert.equal(scoreLabel(Number.NaN).label, "Guter Anfang");
  assert.equal(scoreLabel(250).label, "Richtig stark!");
  for (const score of [0, 10, 30, 49, 50, 70, 85, 100]) {
    const { label, text } = scoreLabel(score);
    assert.doesNotMatch(`${label} ${text}`, /schlecht|ungenügend|mangelhaft|schwach|durchgefallen/i);
  }
});

test("category level for 0..20", () => {
  assert.equal(categoryLevel(20).tone, "strong");
  assert.equal(categoryLevel(16).tone, "strong");
  assert.equal(categoryLevel(15).tone, "ok");
  assert.equal(categoryLevel(11).tone, "ok");
  assert.equal(categoryLevel(10).tone, "work");
  assert.equal(categoryLevel(0).label, "hier lohnt es sich");
});

test("every server error code has its own friendly message (Swiss spelling, no ß)", () => {
  for (const code of SERVER_CODES) {
    assert.ok(AI_REVIEW_ERROR_MESSAGES[code], `message for ${code}`);
    assert.equal(parseAiReviewError(400, { error: code, message: "server text" }).code, code);
    assert.equal(parseAiReviewError(400, { error: code }).message, AI_REVIEW_ERROR_MESSAGES[code]);
  }
  const all = Object.values(AI_REVIEW_ERROR_MESSAGES);
  assert.equal(new Set(all).size, all.length, "messages are distinct");
  for (const message of all) {
    assert.doesNotMatch(message, /ß/);
    assert.doesNotMatch(message, /\b(Sie|Ihr|Ihre)\b/, "du-form");
  }
});

test("error mapping falls back to the HTTP status when the body has no known code", () => {
  assert.equal(errorCodeForStatus(401), "unauthorized");
  assert.equal(errorCodeForStatus(413), "file_too_large");
  assert.equal(errorCodeForStatus(415), "unsupported_file");
  assert.equal(errorCodeForStatus(422), "no_text");
  assert.equal(errorCodeForStatus(429), "rate_limited");
  assert.equal(errorCodeForStatus(502), "ai_failed");
  assert.equal(errorCodeForStatus(504), "timeout");
  assert.equal(errorCodeForStatus(418), "unknown");
  assert.equal(parseAiReviewError(429, null).code, "rate_limited");
  assert.equal(parseAiReviewError(500, "<html>").code, "ai_failed");
  assert.equal(parseAiReviewError(413, { error: "something_new" }).code, "file_too_large");
  assert.equal(aiReviewErrorMessage("network"), AI_REVIEW_ERROR_MESSAGES.network);
  assert.equal(aiReviewErrorMessage("nope"), AI_REVIEW_ERROR_MESSAGES.unknown);
});

test("file validation: PDF and DOCX up to 5 MB", () => {
  assert.equal(validateReviewFile(pdf), null);
  assert.equal(validateReviewFile(docx), null);
  assert.equal(validateReviewFile({ name: "x.docx", size: 10, type: "application/octet-stream" }), null);
  assert.equal(reviewFileType({ name: "a.pdf", size: 1, type: "" }), "pdf");
  assert.equal(reviewFileType({ name: "a.pdf", size: 1, type: "image/png" }), null);
  assert.match(validateReviewFile(null), /Wähle zuerst/);
  assert.match(validateReviewFile({ name: "alt.doc", size: 10, type: "application/msword" }), /\.doc/);
  assert.match(validateReviewFile({ name: "foto.jpg", size: 10, type: "image/jpeg" }), /PDF oder ein Word/);
  assert.match(validateReviewFile({ name: "leer.pdf", size: 0, type: "application/pdf" }), /leer/);
  assert.equal(validateReviewFile({ ...pdf, size: MAX_AI_REVIEW_BYTES }), null);
  assert.match(validateReviewFile({ ...pdf, size: MAX_AI_REVIEW_BYTES + 1 }), /5 MB/);
});

test("form validation: file + consent required, optional fields within the limits", () => {
  const empty = validateReviewForm({});
  assert.equal(empty.ok, false);
  assert.ok(empty.errors.file && empty.errors.consent);

  const noConsent = validateReviewForm({ file: pdf, consent: false });
  assert.deepEqual(Object.keys(noConsent.errors), ["consent"]);

  const ok = validateReviewForm({ file: pdf, consent: true, company: "  Migros ", beruf: "", jobAd: "Wir suchen …" });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.errors, {});

  const tooLong = validateReviewForm({ file: pdf, consent: true, company: "x".repeat(AI_REVIEW_LIMITS.company + 1), beruf: "y".repeat(AI_REVIEW_LIMITS.beruf + 1), jobAd: "z".repeat(AI_REVIEW_LIMITS.jobAd + 1) });
  assert.equal(tooLong.ok, false);
  assert.deepEqual(Object.keys(tooLong.errors).sort(), ["beruf", "company", "jobAd"]);
  // whitespace around a value does not count
  assert.equal(validateReviewForm({ file: pdf, consent: true, company: `  ${"x".repeat(AI_REVIEW_LIMITS.company)}  ` }).ok, true);
});

test("cleanFields trims and drops empty fields", () => {
  assert.deepEqual(cleanFields({ company: " SBB ", beruf: "   ", jobAd: "\nText\n" }), { company: "SBB", jobAd: "Text" });
  assert.deepEqual(cleanFields({}), {});
});

test("loading text and progress move forward and stay below 100 %", () => {
  assert.equal(loadingStep(0), LOADING_STEPS[0]);
  assert.equal(loadingStep(5200), LOADING_STEPS[1]);
  assert.equal(loadingStep(10 * 60_000), LOADING_STEPS.at(-1));
  assert.equal(loadingProgress(0), 0);
  assert.ok(loadingProgress(15_000) > loadingProgress(5_000));
  assert.ok(loadingProgress(30_000) < 0.95);
  assert.equal(loadingProgress(10 * 60_000), 0.95);
});

test("sample (preview) result follows the contract", () => {
  for (const fields of [{}, { company: "Migros", beruf: "Detailhandelsfachfrau EFZ", jobAd: "Wir suchen" }]) {
    const result = sampleReviewResult(fields);
    assert.deepEqual(result.breakdown.map((item) => item.key), AI_REVIEW_CATEGORIES.map((item) => item.key));
    assert.equal(result.score, result.breakdown.reduce((sum, item) => sum + item.score, 0));
    assert.ok(result.score >= 0 && result.score <= 100);
    for (const item of result.breakdown) assert.ok(Number.isInteger(item.score) && item.score >= 0 && item.score <= 20);
    assert.ok(result.good.length >= 2 && result.good.length <= 4);
    assert.ok(result.improve.length >= 2 && result.improve.length <= 5);
    assert.ok(result.company.length <= 3);
    assert.ok(result.nextStep);
    assert.doesNotMatch(JSON.stringify(result), /ß/);
  }
  assert.equal(sampleReviewResult({}).company.length, 0, "no company tips without company info");
  assert.ok(sampleReviewResult({ company: "Migros" }).company.length > 0);
  const response = sampleReviewResponse({}, new Date("2026-11-12T10:00:00Z"));
  assert.equal(response.mock, true);
  assert.equal(response.id, null);
  assert.equal(response.createdAt, "2026-11-12T10:00:00.000Z");
});

test("history rows and titles", () => {
  const result = sampleReviewResult({});
  const record = reviewFromRow({ id: "r1", created_at: "2026-11-01T08:00:00Z", file_name: "brief.pdf", company: "SBB", beruf: null, score: 71, model: "claude-haiku-5-5", result });
  assert.equal(record.score, 71);
  assert.equal(record.beruf, null);
  assert.equal(reviewTitle(record), "SBB");
  assert.equal(reviewTitle({ company: "SBB", beruf: "Polymechaniker EFZ", fileName: "x.pdf" }), "SBB · Polymechaniker EFZ");
  assert.equal(reviewTitle({ company: null, beruf: null, fileName: "brief.pdf" }), "brief.pdf");
  assert.equal(reviewTitle({ company: "", beruf: null, fileName: null }), "Bewerbungs-Check");
  assert.equal(reviewFromRow({ id: "r2", created_at: "2026-11-01T08:00:00Z", score: null, result }).score, result.score);
});

test("UI text of the check page uses Swiss spelling and links the youth privacy page", async () => {
  const files = ["components/ai-review/review-form.tsx", "components/ai-review/review-result.tsx", "components/ai-review/review-loading.tsx", "components/ai-review/review-history.tsx", "components/ai-review/bewerbung-check.tsx", "lib/ai-review-core.ts", "lib/ai-review.ts"];
  for (const file of files) assert.doesNotMatch(await readFile(join(ROOT, file), "utf8"), /ß/, file);
  const form = await readFile(join(ROOT, "components/ai-review/review-form.tsx"), "utf8");
  assert.match(form, /\/datenschutz-jugend/);
  assert.match(form, /Anthropic, USA/);
  assert.match(form, /AHV-Nummer/);
  assert.match(form, /nicht gespeichert/);
  const client = await readFile(join(ROOT, "lib/ai-review.ts"), "utf8");
  assert.match(client, /process\.env\.NEXT_PUBLIC_AI_REVIEW_MOCK === "1"/, "literal env access so Next inlines it");
  assert.match(client, /functions\/v1\/ai-review/);
});

test("client in preview mode: sample result after a short wait, in-memory history, delete", async () => {
  const { loadLib } = await import("./helpers/load-lib.mjs");
  process.env.NEXT_PUBLIC_AI_REVIEW_MOCK = "1";
  try {
    const client = await loadLib("ai-review");
    assert.equal(client.isAiReviewMock(), true);
    assert.deepEqual(await client.listAiReviews(), []);
    const file = new File(["Sehr geehrte Frau Muster"], "brief.pdf", { type: "application/pdf" });
    const started = Date.now();
    const response = await client.callAiReview(file, { company: " Migros ", beruf: "" });
    assert.ok(Date.now() - started >= 1400, "waits about 1.5 s");
    assert.equal(response.mock, true);
    assert.ok(response.result.company.length > 0);
    const history = await client.listAiReviews();
    assert.equal(history.length, 1);
    assert.equal(history[0].company, "Migros");
    assert.equal(history[0].fileName, "brief.pdf");
    await client.deleteAiReview(history[0].id);
    assert.deepEqual(await client.listAiReviews(), []);
    await assert.rejects(client.callAiReview(new File(["x"], "foto.png", { type: "image/png" }), {}), (error) => error.code === "unsupported_file");
    const controller = new AbortController();
    const pending = client.callAiReview(file, {}, { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, (error) => error.name === "AbortError");
  } finally {
    delete process.env.NEXT_PUBLIC_AI_REVIEW_MOCK;
  }
});
