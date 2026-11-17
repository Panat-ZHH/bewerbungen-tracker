// Re-audit 2 (auth + limits), 2026-11-17. Regression tests for the fixes of this round.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { zipSync, unzipSync, strToU8 } from "fflate";

const fn = "../supabase/functions/ai-review/";
const { extractApplicationText, MAX_DOCX_XML_BYTES } = await import(`${fn}extract.ts`);
const { createHandler, readBoundedFormData, MAX_BODY_BYTES } = await import(`${fn}handler.ts`);
const { memoryRateLimitRpc } = await import("../supabase/functions/_shared/rate-limit-core.ts");

const LETTER = Array.from({ length: 8 }, (_, i) => `Zeile ${i}: Ich bewerbe mich mit grossem Interesse um die Lehrstelle als Informatiker EFZ bei Ihnen.`);
const makeDocx = () => zipSync({
  "[Content_Types].xml": strToU8("<Types/>"),
  "word/document.xml": strToU8(`<w:document><w:body>${LETTER.map((l) => `<w:p><w:r><w:t>${l}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`),
});
/** Rewrites the declared uncompressed size of every ZIP entry (local header +22, central directory +24). */
function declareSize(zip, size) {
  const b = new Uint8Array(zip);
  const v = new DataView(b.buffer);
  for (let i = 0; i + 4 <= b.length; i++) {
    const sig = v.getUint32(i, true);
    if (sig === 0x04034b50) v.setUint32(i + 22, size, true);
    if (sig === 0x02014b50) v.setUint32(i + 24, size, true);
  }
  return b;
}
// Same wiring as supabase/functions/ai-review/index.ts.
const realExtract = { unzip: (b, only) => unzipSync(b, only ? { filter: (f) => only(f.name, f.originalSize) } : undefined), pdfText: async () => "" };

test("AI review: a DOCX whose document.xml DECLARES a huge size is refused before anything is allocated (zip bomb)", async () => {
  let allocatedFor = null;
  const spy = { ...realExtract, unzip: (b, only) => unzipSync(b, { filter: (f) => { const ok = only(f.name, f.originalSize); if (ok) allocatedFor = f.originalSize; return ok; } }) };
  const bomb = declareSize(makeDocx(), 0xfffffff0); // ~4 GB declared, the file itself is < 1 KB
  await assert.rejects(extractApplicationText(bomb, spy), (e) => e.code === "too_long");
  assert.equal(allocatedFor, null, "word/document.xml must not be inflated");
  await assert.rejects(extractApplicationText(declareSize(makeDocx(), MAX_DOCX_XML_BYTES + 1), realExtract), (e) => e.code === "too_long");
});

test("AI review: a normal DOCX still works, a size that is declared too SMALL only truncates (no crash, no growth)", async () => {
  const ok = await extractApplicationText(makeDocx(), realExtract);
  assert.equal(ok.kind, "docx");
  assert.match(ok.text, /Informatiker EFZ/);
  await assert.rejects(extractApplicationText(declareSize(makeDocx(), 10), realExtract), (e) => ["no_text", "unsupported_file"].includes(e.code));
});

test("AI review: index.ts passes the declared entry size to the extractor", () => {
  const src = readFileSync(new URL(`${fn}index.ts`, import.meta.url), "utf8");
  assert.match(src, /only\(f\.name, f\.originalSize\)/);
});

function chunkedRequest(totalBytes, chunk = 64 * 1024) {
  let sent = 0, pulls = 0;
  const stream = new ReadableStream({
    pull(c) {
      pulls++;
      if (sent >= totalBytes) return c.close();
      const n = Math.min(chunk, totalBytes - sent); sent += n; c.enqueue(new Uint8Array(n));
    },
  });
  const req = new Request("http://localhost/functions/v1/ai-review", {
    method: "POST", body: stream, duplex: "half",
    headers: { "content-type": "multipart/form-data; boundary=x", authorization: "Bearer good", "cf-connecting-ip": "203.0.113.9" },
  });
  return { req, sentBytes: () => sent, pulls: () => pulls };
}

test("AI review: a chunked body without Content-Length is cut off at the cap (413), not buffered without limit", async () => {
  const { req, sentBytes } = chunkedRequest(64 * 1024 * 1024);
  assert.equal(req.headers.get("content-length"), null);
  await assert.rejects(readBoundedFormData(req), (e) => e.code === "file_too_large");
  assert.ok(sentBytes() < MAX_BODY_BYTES + 512 * 1024, `read ${sentBytes()} bytes`);

  const handler = createHandler({
    env: () => undefined, verifyUser: async (t) => (t === "good" ? { id: "00000000-0000-4000-8000-0000000000d1" } : null),
    saveConsent: async () => {}, getDailyLimit: async () => null, rateLimit: memoryRateLimitRpc(),
    insertReview: async () => { throw new Error("not reached"); }, extract: realExtract,
  });
  const res = await handler(chunkedRequest(64 * 1024 * 1024).req);
  assert.equal(res.status, 413);
});

test("AI review: a normal multipart upload still parses through the bounded reader", async () => {
  const fd = new FormData();
  fd.set("consent", "true");
  fd.set("file", new Blob([makeDocx()]), "a.docx");
  const form = await readBoundedFormData(new Request("http://x/", { method: "POST", body: fd }));
  assert.equal(form.get("consent"), "true");
  assert.ok(form.get("file").size > 100);
});

test("AI review kill switch: AI_REVIEW_DISABLED accepts 1 / true / yes / on (an emergency switch must not silently stay off)", async () => {
  const { limitConfig } = await import(`${fn}limits.ts`);
  for (const v of ["1", "true", "TRUE", " yes ", "on"]) assert.equal(limitConfig((k) => (k === "AI_REVIEW_DISABLED" ? v : undefined)).disabled, true, v);
  for (const v of [undefined, "", "0", "false", "off", "no"]) assert.equal(limitConfig((k) => (k === "AI_REVIEW_DISABLED" ? v : undefined)).disabled, false, String(v));
});

test("Passwort ändern: the new password may not be the account's e-mail address (same rule as signup)", async () => {
  const { passwordChangeProblem } = await import("../lib/account-deletion.ts");
  assert.match(passwordChangeProblem("old-pass-1", "lea.muster@example.ch", "lea.muster@example.ch", "Lea.Muster@example.ch"), /E-Mail/);
  assert.match(passwordChangeProblem("old-pass-1", "lea.muster", "lea.muster", "lea.muster@example.ch"), /E-Mail/);
  assert.equal(passwordChangeProblem("old-pass-1", "Fluss-Velo-47", "Fluss-Velo-47", "lea.muster@example.ch"), null);
  const src = readFileSync(new URL("../components/settings/password-change.tsx", import.meta.url), "utf8");
  assert.match(src, /passwordChangeProblem\(current, next, repeat, email\)/);
});
