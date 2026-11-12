// Backend of the AI application review (supabase/functions/ai-review): extraction, validation, daily limit,
// mock review, Anthropic call (stubbed fetch), the full HTTP handler and the ai_reviews migration (pglite).
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { zipSync, unzipSync, strToU8 } from "fflate";
import { extractText } from "unpdf";
import { PGlite } from "@electric-sql/pglite";

const fn = "../supabase/functions/ai-review/";
const extract = await import(`${fn}extract.ts`);
const { mockReview, textSignals, MOCK_MODEL } = await import(`${fn}mock.ts`);
const anthropic = await import(`${fn}anthropic.ts`);
const { createHandler, isMockMode, bearerToken } = await import(`${fn}handler.ts`);
const { ReviewFailure, ERROR_MESSAGES, ERROR_STATUS } = await import(`${fn}errors.ts`);
const { AI_REVIEW_CATEGORIES } = await import(`${fn}types.ts`);

// ---------- fixtures (generated, so no binary files in the repo) ----------

const LETTER = [
  "Sehr geehrte Frau Muster",
  "Mit grossem Interesse habe ich Ihr Inserat für eine Lehrstelle als Informatiker EFZ bei der Beispiel AG gelesen.",
  "Ich interessiere mich schon lange für Computer, weil ich gerne Probleme löse und Neues lerne.",
  "In meiner Schnupperlehre bei der Beispiel AG hat mir besonders gefallen, wie das Team zusammenarbeitet.",
  "Gerne zeige ich Ihnen in einem Gespräch, was ich kann.",
  "Freundliche Grüsse",
  "Lea Beispiel",
].join("\n");

/** Minimal valid PDF with one page of text lines (Helvetica, WinAnsi). */
function makePdf(lines) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const ops = lines.length
    ? `BT /F1 11 Tf 50 780 Td 14 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(" ")} ET`
    : "0.5 g 50 500 300 200 re f"; // an image-like rectangle, no text layer ("scanned")
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(ops, "latin1")} >>\nstream\n${ops}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, "latin1")); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

const xmlEsc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function documentXml(paragraphs) {
  const body = paragraphs
    .map((p) => {
      // split each paragraph into two runs to make sure runs are joined without extra spaces
      const mid = Math.floor(p.length / 2);
      return `<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:t xml:space="preserve">${xmlEsc(p.slice(0, mid))}</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>${xmlEsc(p.slice(mid))}</w:t></w:r></w:p>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`;
}
function makeDocx(paragraphs, { withMain = true } = {}) {
  const files = {
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
    "_rels/.rels": strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'),
  };
  if (withMain) files["word/document.xml"] = strToU8(documentXml(paragraphs));
  return zipSync(files);
}

const deps = {
  unzip: (bytes, only) => unzipSync(bytes, only ? { filter: (f) => only(f.name) } : undefined),
  pdfText: async (bytes) => (await extractText(bytes, { mergePages: true })).text,
};

const failCode = async (p, code) => {
  await assert.rejects(p, (e) => e instanceof ReviewFailure && e.code === code, `expected ${code}`);
};

// ---------- extraction & validation ----------

test("magic bytes: PDF and ZIP are recognised, everything else is not", () => {
  assert.equal(extract.sniffKind(makePdf(["x"])), "pdf");
  assert.equal(extract.sniffKind(makeDocx(["x"])), "zip");
  assert.equal(extract.sniffKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), null); // JPEG
  assert.equal(extract.sniffKind(strToU8("Hallo, ich bin ein Text")), null);
  assert.equal(extract.sniffKind(new Uint8Array([0x0a, ...strToU8("%PDF-1.7")])), "pdf");
});

test("PDF text is extracted and cleaned", async () => {
  const { kind, text } = await extract.extractApplicationText(makePdf(LETTER.split("\n")), deps);
  assert.equal(kind, "pdf");
  assert.match(text, /Sehr geehrte Frau Muster/);
  assert.match(text, /Beispiel AG/);
  assert.match(text, /Freundliche Grüsse/);
  assert.ok(!/ {2,}/.test(text));
});

test("DOCX text is extracted from word/document.xml with one line per paragraph", async () => {
  const { kind, text } = await extract.extractApplicationText(makeDocx(LETTER.split("\n")), deps);
  assert.equal(kind, "docx");
  assert.equal(text, LETTER);
});

test("docx XML: entities, tabs, breaks; deleted text and field codes are ignored", () => {
  const xml = '<w:body><w:p><w:r><w:t>A &amp; B &#252;&#x00E4;</w:t><w:tab/><w:t>C</w:t><w:br/><w:t>D</w:t></w:r>' +
    '<w:del><w:r><w:delText>weg</w:delText></w:r></w:del><w:r><w:instrText> PAGE </w:instrText></w:r></w:p><w:p><w:r><w:t/></w:r></w:p></w:body>';
  assert.equal(extract.docxXmlToText(xml), "A & B üä\tC\nD\n\n");
  assert.equal(extract.cleanText(extract.docxXmlToText(xml)), "A & B üä C\nD");
});

test("cleanText: whitespace, control characters, soft hyphens, blank lines", () => {
  assert.equal(extract.cleanText("  a\u00a0\u00a0b\r\n\r\n\r\n\r\nc\u00ad d\u0007  \n\n"), "a b\n\nc d");
});

test("a ZIP without word/document.xml and other files are unsupported", async () => {
  await failCode(extract.extractApplicationText(makeDocx([], { withMain: false }), deps), "unsupported_file");
  await failCode(extract.extractApplicationText(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), deps), "unsupported_file");
  await failCode(extract.extractApplicationText(new Uint8Array(0), deps), "unsupported_file");
  // looks like a zip but is broken
  await failCode(extract.extractApplicationText(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9, 9]), deps), "unsupported_file");
});

test("scanned PDF (no text layer), too short and too long texts", async () => {
  await failCode(extract.extractApplicationText(makePdf([]), deps), "no_text");
  await failCode(extract.extractApplicationText(makeDocx(["Hallo", "Lea"]), deps), "no_text");
  await failCode(extract.extractApplicationText(strToU8("%PDF-1.4 kaputt"), deps), "no_text");
  const long = Array.from({ length: 400 }, (_, i) => `Das ist Satz Nummer ${i} in einer sehr langen Bewerbung mit Anhang.`);
  await failCode(extract.extractApplicationText(makeDocx(long), deps), "too_long");
  assert.throws(() => extract.checkTextLength("x".repeat(149)), (e) => e.code === "no_text");
  extract.checkTextLength("x".repeat(150));
  extract.checkTextLength("x".repeat(20000));
  assert.throws(() => extract.checkTextLength("x".repeat(20001)), (e) => e.code === "too_long");
});

test("file size limit: 5 MB", () => {
  extract.checkUpload(5 * 1024 * 1024);
  assert.throws(() => extract.checkUpload(5 * 1024 * 1024 + 1), (e) => e.code === "file_too_large" && e.status === 413);
});

test("optional fields and file names", () => {
  assert.equal(extract.readOptionalField(null, 10), undefined);
  assert.equal(extract.readOptionalField("   ", 10), undefined);
  assert.equal(extract.readOptionalField("  Migros ", 10), "Migros");
  assert.throws(() => extract.readOptionalField("x".repeat(11), 10), (e) => e.code === "bad_request");
  assert.equal(extract.safeFileName("C:\\Users\\lea\\Bewerbung.pdf"), "Bewerbung.pdf");
  assert.equal(extract.safeFileName("../../etc/passwd"), "passwd");
  assert.equal(extract.safeFileName("a\u0000b.docx"), "ab.docx");
  assert.equal(extract.safeFileName(""), null);
  assert.equal(extract.safeFileName("x".repeat(300) + ".pdf").length, 255);
});

// ---------- daily limit ----------

test("daily limit: user setting wins, env default otherwise, unset = no limit", () => {
  assert.equal(extract.resolveDailyLimit(null, undefined), null);
  assert.equal(extract.resolveDailyLimit(null, ""), null);
  assert.equal(extract.resolveDailyLimit(null, "abc"), null);
  assert.equal(extract.resolveDailyLimit(null, "5"), 5);
  assert.equal(extract.resolveDailyLimit(2, "5"), 2);
  assert.equal(extract.resolveDailyLimit(0, "5"), 0);
  assert.equal(extract.isOverDailyLimit(100, null), false);
  assert.equal(extract.isOverDailyLimit(1, 2), false);
  assert.equal(extract.isOverDailyLimit(2, 2), true);
  assert.equal(extract.isOverDailyLimit(0, 0), true);
  assert.equal(extract.since24h(new Date("2026-11-12T10:00:00Z")), "2026-11-11T10:00:00.000Z");
});

// ---------- messages ----------

test("all error messages are friendly Swiss German (no ß) with the documented HTTP codes", () => {
  for (const [code, msg] of Object.entries(ERROR_MESSAGES)) {
    assert.ok(!msg.includes("ß"), code);
    assert.ok(msg.length > 20 && msg.length < 260, code);
  }
  assert.deepEqual(ERROR_STATUS, {
    unauthorized: 401, consent_required: 400, bad_request: 400, unsupported_file: 415, file_too_large: 413,
    no_text: 422, too_long: 413, rate_limited: 429, ai_failed: 502,
  });
  assert.match(ERROR_MESSAGES.no_text, /eingescannt/);
});

// ---------- mock review ----------

function assertValidResult(r) {
  assert.equal(r.breakdown.length, 5);
  assert.deepEqual(r.breakdown.map((c) => c.key), AI_REVIEW_CATEGORIES.map((c) => c.key));
  for (const c of r.breakdown) assert.ok(Number.isInteger(c.score) && c.score >= 0 && c.score <= 20, c.key);
  assert.equal(r.score, r.breakdown.reduce((s, c) => s + c.score, 0));
  assert.ok(r.good.length >= 2 && r.good.length <= 4);
  assert.ok(r.improve.length >= 2 && r.improve.length <= 5);
  assert.ok(r.company.length <= 3);
  assert.ok(r.summary && r.nextStep);
}

test("mock review: valid, deterministic and based on the text", () => {
  const good = mockReview({ text: LETTER, company: "Beispiel AG", beruf: "Informatiker EFZ" });
  assertValidResult(good);
  assert.deepEqual(good, mockReview({ text: LETTER, company: "Beispiel AG", beruf: "Informatiker EFZ" }));
  const s = textSignals({ text: LETTER, company: "Beispiel AG", beruf: "Informatiker EFZ" });
  assert.ok(s.hasAnrede && s.hasGruss && s.mentionsCompany && s.mentionsBeruf && s.motivationHits >= 2);

  const weak = mockReview({ text: "ich will die lehre machen. ".repeat(10), company: "Coop" });
  assertValidResult(weak);
  assert.ok(weak.score < good.score, `${weak.score} < ${good.score}`);
  assert.ok(weak.improve.some((t) => /Anrede/.test(t.tipp)));
  assert.ok(weak.company.length >= 1 && weak.company.some((t) => /Coop/.test(t.tipp)));

  const noCompany = mockReview({ text: LETTER });
  assertValidResult(noCompany);
  assert.equal(noCompany.company.length, 0, "no company info → no company tips");
  assert.ok(!JSON.stringify(noCompany).includes("ß"));

  const eszett = mockReview({ text: LETTER.replace("Grüsse", "Grüße") });
  assert.ok(eszett.improve.some((t) => /ss/.test(t.tipp)));
  assert.ok(!JSON.stringify(eszett).includes("ß"), "mock output must survive normalizeReview (no Eszett)");
});

// ---------- Anthropic call ----------

const okBody = (result) => ({
  id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5", stop_reason: "end_turn",
  content: [{ type: "thinking", thinking: "", signature: "x" }, { type: "text", text: JSON.stringify(result) }],
});
const respond = (status, body, headers = {}) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

function fakeFetch(responses) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { f, calls };
}
const noSleep = async () => {};

test("anthropic: request shape (model, headers, structured output) and success", async () => {
  const result = mockReview({ text: LETTER });
  const { f, calls } = fakeFetch([respond(200, okBody(result))]);
  const out = await anthropic.reviewWithAnthropic({ text: LETTER, company: "Beispiel AG" }, { apiKey: "test-key", fetch: f, sleep: noSleep });
  assert.equal(out.attempts, 1);
  assert.equal(out.model, "claude-haiku-5-5");
  assert.deepEqual(out.result, result);
  const [c] = calls;
  assert.equal(c.url, "https://api.anthropic.com/v1/messages");
  assert.equal(c.init.headers["x-api-key"], "test-key");
  assert.equal(c.init.headers["anthropic-version"], anthropic.ANTHROPIC_VERSION);
  assert.equal(c.body.model, "claude-haiku-5-5");
  assert.ok(c.body.max_tokens >= 4000);
  assert.equal(c.body.messages[0].role, "user");
  assert.equal(c.body.system[0].type, "text");
  assert.equal(typeof c.body.system[0].text, "string");
  assert.deepEqual(c.body.system[0].cache_control, { type: "ephemeral" });
  assert.ok(!("temperature" in c.body), "sampling params are rejected by current models");
  assert.ok(!("thinking" in c.body));
  const schema = (await import(`${fn}prompt.ts`)).REVIEW_JSON_SCHEMA;
  if (Object.keys(schema).length) assert.deepEqual(c.body.output_config.format, { type: "json_schema", schema });
});

test("anthropic: one retry on 429 / 5xx / invalid JSON, then ai_failed", async () => {
  const result = mockReview({ text: LETTER });
  for (const first of [respond(429, { type: "error" }, { "retry-after": "1" }), respond(529, "overloaded"), respond(200, { stop_reason: "end_turn", content: [{ type: "text", text: "kein json" }] }), new TypeError("fetch failed")]) {
    const { f, calls } = fakeFetch([first, respond(200, okBody(result))]);
    const out = await anthropic.reviewWithAnthropic({ text: LETTER }, { apiKey: "k", fetch: f, sleep: noSleep });
    assert.equal(out.attempts, 2);
    assert.equal(calls.length, 2);
  }
  const { f, calls } = fakeFetch([respond(500, "x"), respond(503, "x"), respond(200, okBody(result))]);
  await assert.rejects(anthropic.reviewWithAnthropic({ text: LETTER }, { apiKey: "k", fetch: f, sleep: noSleep }), (e) => e.code === "ai_failed");
  assert.equal(calls.length, 2, "only one retry");
});

test("anthropic: no retry on 400/401, refusal or timeout", async () => {
  for (const first of [respond(400, { type: "error" }), respond(401, { type: "error" }), respond(200, { stop_reason: "refusal", content: [] })]) {
    const { f, calls } = fakeFetch([first, respond(200, okBody(mockReview({ text: LETTER })))]);
    await assert.rejects(anthropic.reviewWithAnthropic({ text: LETTER }, { apiKey: "k", fetch: f, sleep: noSleep }), (e) => e.code === "ai_failed");
    assert.equal(calls.length, 1);
  }
  let n = 0;
  const hang = (_url, init) => { n++; return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))); };
  await assert.rejects(anthropic.reviewWithAnthropic({ text: LETTER }, { apiKey: "k", fetch: hang, timeoutMs: 20, sleep: noSleep }), (e) => e.code === "ai_failed");
  assert.equal(n, 1);
});

test("anthropic: JSON wrapped in a code fence is still read", () => {
  assert.deepEqual(anthropic.parseMessageResponse({ stop_reason: "end_turn", content: [{ type: "text", text: "```json\n{\"a\":1}\n```" }] }), { a: 1 });
});

// ---------- HTTP handler ----------

const USER = "00000000-0000-4000-8000-0000000000a1";
function setup({ env = {}, limit = null, used = 0, fetch: f } = {}) {
  const state = { consent: [], inserted: [], logs: [], countSince: null };
  const handler = createHandler({
    env: (k) => env[k],
    verifyUser: async (t) => (t === "good-token" ? { id: USER } : null),
    saveConsent: async (id, at) => { state.consent.push({ id, at }); },
    getDailyLimit: async () => limit,
    countReviewsSince: async (_id, since) => { state.countSince = since; return used; },
    insertReview: async (row) => { state.inserted.push(row); return { id: "row-1", created_at: "2026-11-12T10:00:00Z" }; },
    extract: deps,
    fetch: f,
    sleep: noSleep,
    now: () => new Date("2026-11-12T10:00:00Z"),
    log: (event, meta) => state.logs.push(JSON.stringify({ event, ...meta })),
  });
  return { handler, state };
}
function post({ token = "good-token", file = makeDocx(LETTER.split("\n")), name = "Bewerbung.docx", consent = "true", fields = {} } = {}) {
  const fd = new FormData();
  if (file) fd.set("file", new Blob([file]), name);
  if (consent !== null) fd.set("consent", consent);
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return new Request("http://localhost/functions/v1/ai-review", { method: "POST", headers, body: fd });
}
const call = async (h, req) => { const res = await h(req); return { status: res.status, body: res.status === 204 ? null : await res.json(), res }; };

test("handler: CORS preflight", async () => {
  const { handler } = setup();
  const res = await handler(new Request("http://localhost/", { method: "OPTIONS" }));
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.match(res.headers.get("access-control-allow-headers"), /authorization/);
});

test("handler: mock mode happy path stores only the result row", async () => {
  const { handler, state } = setup();
  const { status, body, res } = await call(handler, post({ fields: { company: "Beispiel AG", beruf: "Informatiker EFZ", jobAd: "Wir suchen motivierte Lernende." } }));
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.equal(body.mock, true);
  assert.equal(body.model, MOCK_MODEL);
  assert.equal(body.id, "row-1");
  assert.equal(body.createdAt, "2026-11-12T10:00:00Z");
  assertValidResult(body.result);
  assert.equal(state.consent.length, 1);
  assert.equal(state.consent[0].id, USER);
  const [row] = state.inserted;
  assert.deepEqual(Object.keys(row).sort(), ["beruf", "company", "file_name", "model", "prompt_version", "result", "score", "user_id"]);
  assert.equal(row.file_name, "Bewerbung.docx");
  assert.equal(row.company, "Beispiel AG");
  assert.equal(row.score, body.result.score);
  assert.equal(row.model, "mock");
  // privacy: neither the row nor the logs contain the application text
  assert.ok(!JSON.stringify(row).includes("In meiner Schnupperlehre bei der Beispiel AG hat mir"));
  assert.ok(!state.logs.join("\n").includes("Schnupperlehre"));
  assert.ok(!state.logs.join("\n").includes("Beispiel AG"));
});

test("handler: real mode calls Anthropic with the configured model; AI_REVIEW_MOCK=1 forces mock", async () => {
  const result = mockReview({ text: LETTER });
  const { f, calls } = fakeFetch([respond(200, { ...okBody(result), model: "claude-sonnet-5-5" })]);
  const { handler, state } = setup({ env: { ANTHROPIC_API_KEY: "k", AI_REVIEW_MODEL: "claude-sonnet-5-5" }, fetch: f });
  const { status, body } = await call(handler, post());
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.mock, false);
  assert.equal(body.model, "claude-sonnet-5-5");
  assert.equal(calls[0].body.model, "claude-sonnet-5-5");
  assert.equal(state.inserted[0].model, "claude-sonnet-5-5");

  assert.equal(isMockMode((k) => ({ ANTHROPIC_API_KEY: "k", AI_REVIEW_MOCK: "1" })[k]), true);
  assert.equal(isMockMode((k) => ({ ANTHROPIC_API_KEY: "k" })[k]), false);
  assert.equal(isMockMode(() => undefined), true);
});

test("handler: AI failure → 502 ai_failed and nothing stored", async () => {
  const { f } = fakeFetch([respond(500, "x"), respond(500, "x")]);
  const { handler, state } = setup({ env: { ANTHROPIC_API_KEY: "k" }, fetch: f });
  const { status, body } = await call(handler, post());
  assert.equal(status, 502);
  assert.equal(body.error, "ai_failed");
  assert.equal(state.inserted.length, 0);
});

test("handler: auth, consent and input errors", async () => {
  const { handler, state } = setup();
  const cases = [
    [post({ token: null }), 401, "unauthorized"],
    [post({ token: "bad-token" }), 401, "unauthorized"],
    [post({ consent: null }), 400, "consent_required"],
    [post({ consent: "false" }), 400, "consent_required"],
    [post({ file: null }), 400, "bad_request"],
    [post({ fields: { company: "x".repeat(201) } }), 400, "bad_request"],
    [post({ fields: { jobAd: "x".repeat(8001) } }), 400, "bad_request"],
    [post({ file: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]), name: "foto.jpg" }), 415, "unsupported_file"],
    [post({ file: strToU8("Sehr geehrte Damen und Herren ".repeat(20)), name: "brief.pdf" }), 415, "unsupported_file"],
    [post({ file: makePdf([]), name: "scan.pdf" }), 422, "no_text"],
    [post({ file: new Uint8Array(5 * 1024 * 1024 + 1).fill(0x25), name: "gross.pdf" }), 413, "file_too_large"],
    [new Request("http://localhost/", { method: "GET", headers: { Authorization: "Bearer good-token" } }), 400, "bad_request"],
    [new Request("http://localhost/", { method: "POST", headers: { Authorization: "Bearer good-token", "Content-Type": "application/json" }, body: "{}" }), 400, "bad_request"],
  ];
  for (const [req, status, code] of cases) {
    const r = await call(handler, req);
    assert.equal(r.status, status, `${code}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.error, code);
    assert.ok(typeof r.body.message === "string" && !r.body.message.includes("ß"));
  }
  assert.equal(state.inserted.length, 0);
});

test("handler: daily limit from user setting or env, counted over the last 24 h", async () => {
  {
    const { handler, state } = setup({ limit: 3, used: 3 });
    const r = await call(handler, post());
    assert.equal(r.status, 429);
    assert.equal(r.body.error, "rate_limited");
    assert.match(r.body.message, /3 Checks/);
    assert.equal(state.countSince, "2026-11-11T10:00:00.000Z");
    assert.equal(state.inserted.length, 0);
  }
  {
    const { handler } = setup({ env: { AI_REVIEW_DEFAULT_DAILY_LIMIT: "2" }, used: 1 });
    assert.equal((await call(handler, post())).status, 200);
  }
  {
    const { handler } = setup({ env: { AI_REVIEW_DEFAULT_DAILY_LIMIT: "2" }, used: 2 });
    assert.equal((await call(handler, post())).status, 429);
  }
  {
    const { handler, state } = setup({ used: 999 }); // default: no limit, not even counted
    assert.equal((await call(handler, post())).status, 200);
    assert.equal(state.countSince, null);
  }
});

test("handler: unexpected errors (e.g. database) give a generic 502 without details", async () => {
  const handler = createHandler({
    env: () => undefined,
    verifyUser: async () => ({ id: USER }),
    saveConsent: async () => { throw new Error("db down: secret detail"); },
    getDailyLimit: async () => null, countReviewsSince: async () => 0, insertReview: async () => ({ id: "x", created_at: "y" }),
    extract: deps,
  });
  const r = await call(handler, post());
  assert.equal(r.status, 502);
  assert.equal(r.body.error, "ai_failed");
  assert.ok(!JSON.stringify(r.body).includes("secret"));
});

test("bearer token parsing", () => {
  const req = (h) => new Request("http://x/", { headers: h ? { Authorization: h } : {} });
  assert.equal(bearerToken(req("Bearer abc.def")), "abc.def");
  assert.equal(bearerToken(req("bearer abc")), "abc");
  assert.equal(bearerToken(req("Basic abc")), null);
  assert.equal(bearerToken(req(null)), null);
});

// ---------- migration (pglite) ----------

const dir = new URL("../supabase/migrations/", import.meta.url);
const U1 = USER, U2 = "00000000-0000-4000-8000-0000000000b2";
async function migratedDb() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon; create role service_role bypassrls; -- like Supabase
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $auth$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $auth$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text);
    create function storage.foldername(text) returns text[] language sql as $storage$ select string_to_array($1, '/') $storage$;
    grant usage on schema auth to authenticated;
    grant usage on schema public to authenticated, anon, service_role;
  `);
  for (const f of (await readdir(dir)).filter((x) => x.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(f, dir), "utf8"));
  return db;
}
const as = async (db, role, user) => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]);
  await db.exec(`set role ${role}`);
};

test("migration: ai_reviews RLS – owner reads and deletes, users cannot insert/update, cascade on user delete", async () => {
  const db = await migratedDb();
  const sql = await readFile(new URL("20261112000000_ai_reviews.sql", dir), "utf8");
  await db.exec(sql); // idempotent
  await db.query(`insert into auth.users (id, email) values ($1,'a@x.ch'), ($2,'b@x.ch')`, [U1, U2]);
  await as(db, "service_role", null);
  await db.query(`insert into public.ai_reviews (user_id, file_name, score, result, model, prompt_version) values ($1,'a.pdf',70,'{}','mock','v1'), ($2,'b.pdf',50,'{}','mock','v1')`, [U1, U2]);
  await db.query(`insert into public.ai_review_user_settings (user_id, daily_limit, consent_at) values ($1, 3, now()) on conflict (user_id) do update set consent_at = excluded.consent_at`, [U1]);

  await as(db, "authenticated", U1);
  assert.deepEqual((await db.query("select file_name from public.ai_reviews")).rows.map((r) => r.file_name), ["a.pdf"]);
  assert.deepEqual((await db.query("select daily_limit from public.ai_review_user_settings")).rows, [{ daily_limit: 3 }]);
  await assert.rejects(db.query(`insert into public.ai_reviews (user_id, score, result, model, prompt_version) values ($1,99,'{}','x','v')`, [U1]));
  await assert.rejects(db.query("update public.ai_reviews set score = 100"));
  await assert.rejects(db.query("update public.ai_review_user_settings set daily_limit = null"));
  await assert.rejects(db.query(`insert into public.ai_review_user_settings (user_id, daily_limit) values ($1, null)`, [U1]));
  assert.equal((await db.query("delete from public.ai_reviews where file_name = 'b.pdf'")).affectedRows, 0);
  assert.equal((await db.query("delete from public.ai_reviews")).affectedRows, 1);

  await as(db, "anon", null);
  await assert.rejects(db.query("select * from public.ai_reviews"));
  await assert.rejects(db.query("select * from public.ai_review_user_settings"));

  await db.exec("reset role");
  await assert.rejects(db.query(`insert into public.ai_reviews (user_id, score, result, model, prompt_version) values ($1,101,'{}','x','v')`, [U2]), /check/);
  await db.query("delete from auth.users where id = $1", [U2]);
  assert.equal((await db.query("select count(*)::int as n from public.ai_reviews")).rows[0].n, 0);
  await db.query("delete from auth.users where id = $1", [U1]);
  assert.equal((await db.query("select count(*)::int as n from public.ai_review_user_settings")).rows[0].n, 0);
  const idx = (await db.query("select indexname from pg_indexes where tablename = 'ai_reviews'")).rows.map((r) => r.indexname);
  assert.ok(idx.includes("ai_reviews_user_created_idx"));
});
