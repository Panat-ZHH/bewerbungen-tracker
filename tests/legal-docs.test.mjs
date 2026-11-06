import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LEGAL_CONTACT, LEGAL_DOCS, LEGAL_STAND, LEGAL_VERSION } from "../components/legal/docs.ts";

for (const doc of LEGAL_DOCS) {
  test(`legal doc ${doc.file} carries Stand, Version, contact and the review notice`, async () => {
    const md = await readFile(new URL(`../docs/legal/${doc.file}`, import.meta.url), "utf8");
    assert.ok(md.includes(`**Stand:** ${LEGAL_STAND}`), "Stand matches docs.ts");
    assert.ok(md.includes(`**Version:** ${LEGAL_VERSION}`), "Version matches docs.ts");
    assert.ok(md.includes(LEGAL_CONTACT), "contact present");
    assert.match(md, /juristisch|prüfen lassen|Juristin/i, "lawyer-review notice present");
    assert.ok(!/ß/.test(md), "Swiss spelling: no ß");
  });
}
