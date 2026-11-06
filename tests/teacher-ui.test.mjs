import assert from "node:assert/strict";
import { test } from "node:test";
import { csvCell, guardFormula, toCsv } from "../lib/teacher-csv.ts";
import { parseEmails, inviteState, inviteMailto, filterStudents, sortStudents, canNudge, studentCsvColumns, inviteUrl } from "../components/teacher/logic.ts";
import { qrMatrix, qrPath } from "../components/teacher/qr.ts";

const student = (o = {}) => ({ studentId: "s", displayName: "Anna", avatarSeed: "", joinedAt: "2026-09-01T00:00:00Z", hidden: false, total: 3, statusCounts: { applied: 2, offer: 1 }, interviews: 1, offers: 1, placed: false, lastActivity: "2026-11-01T00:00:00Z", inactive: false, lastNudgedAt: null, ...o });

test("csv: escaping of separators, quotes and newlines", () => {
  assert.equal(csvCell('a;b'), '"a;b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("x\ny"), '"x\ny"');
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(5), "5");
});

test("csv: formula injection guard", () => {
  for (const v of ["=1+1", "+SUM(A1)", "-2+3", "@cmd", "\tx", "\rx"]) assert.ok(guardFormula(v).startsWith("'"), v);
  assert.equal(guardFormula("Anna"), "Anna");
  assert.equal(csvCell('=HYPERLINK("http://evil")'), `"'=HYPERLINK(""http://evil"")"`);
});

test("csv: toCsv builds header + rows with CRLF", () => {
  const out = toCsv([{ n: "A;B", c: 2 }], [{ header: "Name", value: (r) => r.n }, { header: "Anzahl", value: (r) => r.c }]);
  assert.equal(out, 'Name;Anzahl\r\n"A;B";2\r\n');
});

test("csv: hidden students expose only the name", () => {
  const cols = studentCsvColumns({ applied: "Abgeschickt" });
  const out = toCsv([student({ hidden: true, displayName: "=Evil" })], cols);
  const row = out.split("\r\n")[1].split(";");
  assert.equal(row[0], "'=Evil"); assert.equal(row[1], "nein"); assert.ok(row.slice(2, -1).every((c) => c === ""));
});

test("parseEmails dedupes, lowercases and reports invalid", () => {
  const r = parseEmails("Anna@Schule.ch, anna@schule.ch;ben@schule.ch\nkaputt  <cleo@x.ch>");
  assert.deepEqual(r.valid, ["anna@schule.ch", "ben@schule.ch", "cleo@x.ch"]); assert.deepEqual(r.invalid, ["kaputt"]);
});

test("invite state and links", () => {
  const base = { revoked: false, expiresAt: "2030-01-01T00:00:00Z", uses: 0, maxUses: null };
  assert.equal(inviteState(base), "active");
  assert.equal(inviteState({ ...base, revoked: true }), "revoked");
  assert.equal(inviteState({ ...base, expiresAt: "2020-01-01T00:00:00Z" }), "expired");
  assert.equal(inviteState({ ...base, uses: 1, maxUses: 1 }), "used");
  assert.equal(inviteUrl("a b", "https://x"), "https://x/classes/join/a%20b");
  assert.match(inviteMailto("a@b.ch", "10b", "https://x/y"), /^mailto:a%40b\.ch\?subject=/);
});

test("filter, sort and nudge rules", () => {
  const list = [student({ studentId: "1", displayName: "Zoe", inactive: true, lastActivity: "2026-10-01T00:00:00Z" }), student({ studentId: "2", displayName: "Ada", hidden: true }), student({ studentId: "3", displayName: "Max", placed: true, total: 9 })];
  assert.deepEqual(filterStudents(list, "inactive", "").map((s) => s.studentId), ["1"]);
  assert.deepEqual(filterStudents(list, "hidden", "").map((s) => s.studentId), ["2"]);
  assert.deepEqual(filterStudents(list, "all", "ma").map((s) => s.studentId), ["3"]);
  assert.deepEqual(sortStudents(list, "name").map((s) => s.studentId), ["3", "1", "2"]);
  assert.deepEqual(sortStudents(list, "activity").map((s) => s.studentId), ["1", "3", "2"]);
  assert.deepEqual(sortStudents(list, "total").map((s) => s.studentId), ["3", "1", "2"]);
  const now = Date.parse("2026-11-06T00:00:00Z");
  assert.equal(canNudge({ hidden: false, lastNudgedAt: null }, now), true);
  assert.equal(canNudge({ hidden: false, lastNudgedAt: "2026-11-05T00:00:00Z" }, now), false);
  assert.equal(canNudge({ hidden: false, lastNudgedAt: "2026-11-02T00:00:00Z" }, now), true);
  assert.equal(canNudge({ hidden: true, lastNudgedAt: null }, now), false);
});

test("qr: structure, sizes and format bits", () => {
  const m = qrMatrix("https://wendapply.ch/classes/join/ABCD-1234");
  const n = m.length; assert.equal((n - 17) % 4, 0); assert.ok(m.every((r) => r.length === n));
  // finder patterns
  for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) { assert.ok(m[oy][ox] && m[oy + 3][ox + 3] && !m[oy + 1][ox + 1] && m[oy + 6][ox + 6]); }
  assert.equal(m[n - 8][8], true); // dark module
  // timing
  for (let i = 8; i < n - 8; i++) assert.equal(m[6][i], i % 2 === 0);
  // format info BCH check: both copies identical and valid
  let f1 = 0; const pos1 = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  pos1.forEach(([x, y], i) => { if (m[y][x]) f1 |= 1 << i; });
  let f2 = 0; for (let i = 0; i < 8; i++) if (m[8][n - 1 - i]) f2 |= 1 << i; for (let i = 8; i < 15; i++) if (m[n - 15 + i][8]) f2 |= 1 << i;
  assert.equal(f1, f2);
  const data = (f1 ^ 0x5412) >> 10; let rem = data << 10; for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
  assert.equal((f1 ^ 0x5412) & 0x3ff, rem & 0x3ff); assert.equal(data >> 3, 0); // level M
});

test("qr: version grows with length and too long throws", () => {
  assert.equal(qrMatrix("a").length, 21);
  assert.ok(qrMatrix("x".repeat(100)).length > 21);
  assert.equal(qrMatrix("x".repeat(213)).length, 57);
  assert.throws(() => qrMatrix("x".repeat(400)), /QR_TOO_LONG/);
  const { path, size } = qrPath(qrMatrix("hi")); assert.equal(size, 29); assert.ok(path.startsWith("M"));
});
