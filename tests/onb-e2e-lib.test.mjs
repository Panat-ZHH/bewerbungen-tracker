// Unit tests for the pure helpers of the onboarding e2e harness (scripts/onb-lib.mjs) – no browser, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PATHS, compareLighthouse, createOnbWorld, isProbeEmail, median, payloadProblems, piiLeaks, probeEmail, resultsTable } from "../scripts/onb-lib.mjs";

test("PATHS follow SPEC-FLOW §1.1 slugs", () => {
  assert.equal(PATHS.student.length, 12);
  assert.deepEqual(PATHS.parent, ["weg", "rolle", "name", "begleiten", "kind", "plan", "konto"]);
  assert.deepEqual(PATHS.staff, ["weg", "rolle", "zugang", "konto"]);
});

test("payloadProblems accepts a clean student payload and checks expectations", () => {
  const p = { v: 1, role: "student", firstName: "Lena", birthYear: 2012, schoolLevel: "8. Klasse", canton: "ZH", professions: ["Informatiker:in"], weeklyGoal: 4, help: ["lebenslauf"] };
  assert.deepEqual(payloadProblems(p, { weeklyGoal: 4, firstName: "Lena" }), []);
  assert.match(payloadProblems(p, { weeklyGoal: 3 })[0], /weeklyGoal/);
});

test("payloadProblems flags transient keys, other-role keys, bad enums and e-mail", () => {
  assert.ok(payloadProblems({ v: 1, role: "student", classCode: "KLAS7Q2" }).some((x) => /classCode/.test(x)));
  assert.ok(payloadProblems({ v: 1, role: "parent", weeklyGoal: 3 }).some((x) => /parent payload carries weeklyGoal/.test(x)));
  assert.ok(payloadProblems({ v: 1, role: "student", help: ["fristen"] }).some((x) => /help enum/.test(x)));
  assert.ok(payloadProblems({ v: 1, role: "student", weeklyGoal: 11 }).some((x) => /weeklyGoal/.test(x)));
  assert.ok(payloadProblems({ v: 1, role: "student", professions: ["a", "b", "c", "d"] }).some((x) => /3 professions/.test(x)));
  assert.ok(payloadProblems({ v: 1, role: "student", email: "x@y.ch" }).length >= 1);
  assert.deepEqual(payloadProblems(null), ["payload missing or not an object"]);
  assert.ok(payloadProblems({ v: 2, role: "admin" }).length >= 2);
});

test("piiLeaks finds names in URLs and bodies, ignores /api/places", () => {
  const reqs = [{ method: "GET", url: "http://x/api/places?q=Lena", body: "" }, { method: "POST", url: "http://x/rest/v1/rpc/a", body: '{"n":"LENA"}' }, { method: "GET", url: "http://x/start?schritt=name", body: "" }];
  const hits = piiLeaks(reqs, ["Lena"]);
  assert.equal(hits.length, 1);
  assert.match(hits[0], /rpc\/a/);
  assert.deepEqual(piiLeaks(reqs, [""]), []);
});

test("median and compareLighthouse tolerances", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([null, NaN]), null);
  const rows = compareLighthouse({ home: { perf: 90, a11y: 100, bp: 100, seo: 100, lcp: 2, tbt: 100, cls: 0 } }, { home: { perf: 84, a11y: 100, bp: 100, seo: 100, lcp: 2.4, tbt: 150, cls: 0.01 } });
  assert.equal(rows.find((r) => r.metric === "perf").worse, true);
  assert.equal(rows.find((r) => r.metric === "lcp").worse, false);
  assert.equal(rows.find((r) => r.metric === "tbt").worse, false);
  const none = compareLighthouse({}, { start: { perf: 90 } });
  assert.equal(none.find((r) => r.metric === "perf").delta, null);
});

test("probe e-mails match the brief prefix only", () => {
  const e = probeEmail("student", "mwx1a2");
  assert.equal(e, "probe-onb-student-mwx1a2@wendapply-probe.invalid");
  assert.ok(isProbeEmail(e));
  assert.ok(!isProbeEmail("probe-rel-mobile-x@wendapply-probe.invalid"));
  assert.ok(!isProbeEmail("lena@beispiel.ch"));
  assert.ok(!isProbeEmail("probe-onb-student-x@wendapply-probe.invalid.evil.com"));
});

test("resultsTable renders totals and escapes pipes", () => {
  const md = resultsTable([{ id: "a|b", device: "pixel7", status: "PASS", info: "" }, { id: "c", device: "x", status: "FAIL", info: "x\ny" }]);
  assert.match(md, /a\\\|b/);
  assert.match(md, /1 pass · 1 fail/);
});

test("stub world: users, profiles and lookups", () => {
  const w = createOnbWorld({ existing: [{ email: "a@b.ch", funnelDone: true, profile: { first_name: "A" } }] });
  assert.equal(w.users.length, 1);
  assert.equal(w.profileOf("a@b.ch").first_name, "A");
  assert.ok(w.profileOf("a@b.ch").funnel_completed_at);
  assert.equal(w.tourOf("a@b.ch", "schueler"), null);
  assert.equal(w.profileOf("nope@b.ch"), null);
});
