// Security re-audit round 2 (branch reaudit2-sec, 2026-11-17): regression tests for the fixes of this round.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { zipSync, unzipSync, strToU8 } from "fflate";

const fn = "../supabase/functions/ai-review/";
const extract = await import(`${fn}extract.ts`);
const { ReviewFailure } = await import(`${fn}errors.ts`);

// Same wiring as supabase/functions/ai-review/index.ts.
const deps = {
  unzip: (bytes, only) => unzipSync(bytes, only ? { filter: (f) => only(f.name, f.originalSize) } : undefined),
  pdfText: async () => "",
};
const xml = (text) => `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`;
const docx = (documentXml) => zipSync({ "[Content_Types].xml": strToU8("<Types/>"), "word/document.xml": strToU8(documentXml) });
const isCode = (code) => (e) => e instanceof ReviewFailure && e.code === code;

test("AI review: a DOCX zip bomb is not inflated (declared size capped), normal DOCX still works", async () => {
  const cv = "Sehr geehrte Damen und Herren, hiermit bewerbe ich mich um eine Lehrstelle als Informatiker EFZ. ".repeat(4);
  const ok = await extract.extractApplicationText(docx(xml(cv)), deps);
  assert.equal(ok.kind, "docx");
  assert.match(ok.text, /Lehrstelle als Informatiker/);

  // Real bomb: 40 MB of padding deflates to a few KB, far below the 5 MB upload limit.
  const bomb = docx(xml(cv) + " ".repeat(40 * 1024 * 1024));
  assert.ok(bomb.length < extract.MAX_FILE_BYTES);
  await assert.rejects(extract.extractApplicationText(bomb, deps), isCode("unsupported_file"));

  // Forged header: tiny entry whose central-directory "uncompressed size" claims 4 GB (fflate would allocate it).
  const forged = docx(xml(cv));
  const view = new DataView(forged.buffer, forged.byteOffset, forged.byteLength);
  let patched = 0;
  for (let i = 0; i + 46 <= forged.length; i++) {
    if (view.getUint32(i, true) !== 0x02014b50) continue; // central directory file header
    const nameLen = view.getUint16(i + 28, true);
    const name = new TextDecoder().decode(forged.subarray(i + 46, i + 46 + nameLen));
    if (name === "word/document.xml") { view.setUint32(i + 24, 0xfffffff0, true); patched++; }
  }
  assert.equal(patched, 1);
  await assert.rejects(extract.extractApplicationText(forged, deps), isCode("unsupported_file"));

  // The edge function passes the declared size to the filter.
  const index = await readFile(new URL(`${fn}index.ts`, import.meta.url), "utf8");
  assert.match(index, /only\(f\.name, f\.originalSize\)/);
});

test("job search cache: known results with edited texts never share a cache entry (no cross-user content planting)", async () => {
  const { searchCacheKey } = await import("../lib/job-search.ts");
  const url = "https://www.yousty.ch/de-CH/lehrstellen/profile/123-informatiker-efz";
  const base = { query: "Informatiker", location: "Zürich", kind: "apprenticeship", cursor: { yousty: { page: 2, offset: 0 }, jobs: null, jobup: null } };
  const real = searchCacheKey({ ...base, knownResults: [{ title: "Informatiker/in EFZ", company: "Muster AG", source: "Yousty", url }] });
  const forged = searchCacheKey({ ...base, knownResults: [{ title: "Bewerbung nur gegen CHF 50 Gebühr: zahl-hier.example", company: "Muster AG", source: "Yousty", url }] });
  assert.notEqual(real, forged);
  // Same input -> same key (paging back and forth still hits the cache); query case does not matter.
  assert.equal(real, searchCacheKey({ ...base, query: "informatiker", knownResults: [{ title: "Informatiker/in EFZ", company: "Muster AG", source: "Yousty", url }] }));
  assert.ok(real.length < 100, "hashed key stays small");
});
