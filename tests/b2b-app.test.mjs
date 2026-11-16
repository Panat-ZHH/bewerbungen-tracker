// Unit + source-contract tests for the B2B app part (teacher class overview, class goals, school admin, "Meine Daten").
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import {
  isMissingFeature, licenceUsage, daysRemaining, pilotText, packageLabel, statusLabel, PACKAGE_INFO,
  goalProblem, goalProgress, goalStatus, goalCaption, metricLabel, metricUnit, houseStage, GOAL_TARGET_MAX,
  supportText, supportList, progressStep, aggregate, aggregatesFromRow, overviewStudentFromRow, overviewFromTeacherStudents, share,
  exportFileName, scrubExport,
} from "../components/b2b/logic.ts";
import { progressRank, sortStudents } from "../components/teacher/logic.ts";

const TODAY = "2026-11-16";

test("isMissingFeature recognises undeployed tables and RPCs only", () => {
  for (const e of [{ code: "PGRST202", message: "Could not find the function public.class_overview_stats" }, { code: "PGRST205" }, { code: "42P01", message: 'relation "public.class_goals" does not exist' }, { code: "42883" }, { message: "Could not find the table 'public.schools' in the schema cache" }, { status: 404 }])
    assert.equal(isMissingFeature(e), true, JSON.stringify(e));
  for (const e of [null, undefined, "x", { code: "P0001", message: "FORBIDDEN" }, { code: "42501", message: "permission denied" }, { code: "23514", message: "check constraint" }])
    assert.equal(isMissingFeature(e), false, JSON.stringify(e));
});

test("packages match the public price list (no payment logic)", () => {
  assert.equal(PACKAGE_INFO.starter.limit, 100); assert.equal(PACKAGE_INFO.professional.limit, 300); assert.equal(PACKAGE_INFO.enterprise.limit, 800);
  assert.match(PACKAGE_INFO.professional.price, /1.490/);
  assert.equal(packageLabel("professional"), "Professional"); assert.equal(packageLabel("nope"), "Kein Paket"); assert.equal(packageLabel(null), "Kein Paket");
  assert.equal(statusLabel("pilot"), "Pilotphase"); assert.equal(statusLabel("expired"), "Abgelaufen"); assert.equal(statusLabel("?"), "Unbekannt");
});

test("licence usage: warning from 90 %, full at 100 %, no limit", () => {
  assert.deepEqual(licenceUsage(50, 100), { percent: 50, level: "ok", remaining: 50 });
  assert.equal(licenceUsage(89, 100).level, "ok");
  assert.equal(licenceUsage(90, 100).level, "warning");
  assert.equal(licenceUsage(270, 300).level, "warning");
  assert.deepEqual(licenceUsage(100, 100), { percent: 100, level: "full", remaining: 0 });
  assert.deepEqual(licenceUsage(120, 100), { percent: 100, level: "full", remaining: 0 });
  assert.deepEqual(licenceUsage(10, null), { percent: null, level: "ok", remaining: null });
  assert.equal(licenceUsage(-5, 100).percent, 0);
});

test("pilot days remaining", () => {
  assert.equal(daysRemaining("2026-12-16", TODAY), 30);
  assert.equal(daysRemaining("2026-11-16", TODAY), 0);
  assert.equal(daysRemaining("2026-11-10", TODAY), -6);
  assert.equal(daysRemaining(null, TODAY), null);
  assert.equal(daysRemaining("kaputt", TODAY), null);
  assert.equal(pilotText(12), "Noch 12 Tage Pilotphase"); assert.equal(pilotText(1), "Noch 1 Tag Pilotphase");
  assert.equal(pilotText(0), "Letzter Tag der Pilotphase"); assert.equal(pilotText(-1), "Pilotphase beendet"); assert.match(pilotText(null), /Kein/);
});

test("goal validation", () => {
  const ok = { title: "20 Schnuppertage", description: "", metric: "trial_days", target: "20", dueDate: "2027-01-31" };
  assert.equal(goalProblem(ok, TODAY), null);
  assert.match(goalProblem({ ...ok, title: "  " }, TODAY), /Titel/);
  assert.match(goalProblem({ ...ok, title: "x".repeat(121) }, TODAY), /120/);
  assert.match(goalProblem({ ...ok, target: "0" }, TODAY), /ganze Zahl/);
  assert.match(goalProblem({ ...ok, target: "2.5" }, TODAY), /ganze Zahl/);
  assert.match(goalProblem({ ...ok, target: String(GOAL_TARGET_MAX + 1) }, TODAY), /ganze Zahl/);
  assert.match(goalProblem({ ...ok, metric: "most_applications" }, TODAY), /gezählt/);
  assert.match(goalProblem({ ...ok, dueDate: "2026-11-01" }, TODAY), /Vergangenheit/);
  assert.match(goalProblem({ ...ok, dueDate: "31.01.2027" }, TODAY), /gültiges Datum/);
  assert.equal(goalProblem({ ...ok, dueDate: "" }, TODAY), null);
  assert.match(goalProblem({ ...ok, target: "" }, TODAY), /pro Person/, "measured goals need a target");
  assert.equal(goalProblem({ ...ok, metric: "custom", target: "" }, TODAY), null, "custom goals may omit the target");
  assert.equal(metricLabel("trial_days"), "Schnuppertage"); assert.equal(metricLabel("x"), "Ziel");
});

test("goal status (target per person), caption and village house stage", () => {
  assert.deepEqual(goalProgress(5, 20), { current: 5, target: 20, percent: 25, done: false });
  assert.equal(goalProgress(3, 0).target, 1);
  const g = (o) => ({ metric: "trial_days", reached: 4, counted: 12, total: 7, suppressed: false, ...o });
  assert.deepEqual(goalStatus(g()), { kind: "progress", reached: 4, counted: 12, total: 7, percent: 33, done: false });
  assert.equal(goalStatus(g({ metric: "custom" })).kind, "custom");
  assert.equal(goalStatus(g({ suppressed: true, reached: null, counted: 2, total: null })).kind, "suppressed");
  assert.equal(goalStatus(g({ reached: null })).kind, "pending");
  assert.equal(goalStatus(g({ reached: 12 })).done, true);
  assert.equal(goalStatus(g({ reached: 0, counted: 0, total: 0 })).done, false, "nobody counted is not 'done'");
  assert.equal(goalStatus(g({ reached: 15 })).reached, 12, "reached is clamped to counted");
  assert.equal(goalCaption(goalStatus(g()), "trial_days", 10), "4 von 12 haben das Ziel erreicht. Zusammen: 7 Schnuppertage. Noch 10 Tage.");
  assert.match(goalCaption(goalStatus(g({ total: 1 })), "trial_days", 0), /Zusammen: 1 Schnuppertag\. Heute ist der letzte Tag/);
  assert.match(goalCaption(goalStatus(g({ reached: 12 })), "trial_days", 3), /^Geschafft! Alle 12/);
  assert.match(goalCaption(goalStatus(g({ reached: 0, counted: 0, total: 0 })), "trial_days", null), /Noch teilt niemand/);
  assert.equal(metricUnit("interviews", 2), "Gespräche"); assert.equal(metricUnit("x", 2), "");
  assert.deepEqual([0, 1, 32, 33, 65, 66, 99, 100].map(houseStage), [0, 1, 1, 2, 2, 3, 3, 4]);
});

const row = (o = {}) => ({ student_id: "s", display_name: "Anna", hidden: false, applications: 5, status_counts: { saved: 1, preparing: 1, applied: 1, interview: 1, schnupper_done: 1 }, last_activity: "2026-11-10", placed: false, needs_support: false, reasons: [], ...o });

test("class_overview_stats rows map to non-confidential counts only", () => {
  const s = overviewStudentFromRow(row({ company: "Geheim AG", position: "Lehre", notes: "privat", alias: "Anni" }));
  assert.deepEqual(Object.keys(s).sort(), ["applications", "displayName", "followUps", "hidden", "interviews", "lastActivity", "needsSupport", "offers", "placed", "reasons", "studentId", "trialDays"]);
  assert.equal(s.displayName, "Anni", "teacher alias wins");
  assert.equal(s.applications, 3, "saved/preparing are not sent applications");
  assert.equal(s.interviews, 1); assert.equal(s.trialDays, 1);
  assert.ok(!JSON.stringify(s).includes("Geheim"));
  const hidden = overviewStudentFromRow(row({ hidden: true, applications: null, status_counts: null, last_activity: null, needs_support: true, reasons: ["self_report"] }));
  assert.equal(hidden.applications, 0); assert.equal(hidden.lastActivity, null); assert.equal(hidden.needsSupport, true);
  const noStatus = overviewStudentFromRow(row({ status_counts: null, applications: 4 }));
  assert.equal(noStatus.applications, 4); assert.equal(noStatus.interviews, 0);
  assert.deepEqual(overviewStudentFromRow(row({ reasons: "no_activity, upcoming_deadline", needs_support: undefined })).reasons, ["no_activity", "upcoming_deadline"]);
});

test("aggregates: server totals win, missing ones fall back to the student rows", () => {
  const students = [overviewStudentFromRow(row()), overviewStudentFromRow(row({ student_id: "b", hidden: true, applications: null, status_counts: null })), overviewStudentFromRow(row({ student_id: "c", applications: 0, status_counts: {}, last_activity: null }))];
  const local = aggregate(students, Date.parse("2026-11-16T12:00:00Z"));
  assert.deepEqual(local, { students: 3, sharing: 2, withApplication: 1, withInterview: 1, withTrialDay: 1, placed: 0, needsSupport: 0, activeLast14: 1 });
  const merged = aggregatesFromRow({ students: 30, students_sharing: 25, students_with_application: 20, students_placed: 4, students_active: 18, needs_support: 3 }, local);
  assert.deepEqual(merged, { students: 30, sharing: 25, withApplication: 20, withInterview: 1, withTrialDay: 1, placed: 4, needsSupport: 3, activeLast14: 18 });
  assert.deepEqual(aggregatesFromRow(null, local), local);
  assert.equal(share(1, 3), 33); assert.equal(share(1, 0), 0);
});

test("support list: self reports first, hidden students only through their own report", () => {
  const list = [
    overviewStudentFromRow(row({ student_id: "a", display_name: "Ana", needs_support: true, reasons: ["no_activity"], last_activity: "2026-10-01" })),
    overviewStudentFromRow(row({ student_id: "b", display_name: "Ben", needs_support: true, reasons: ["no_application", "upcoming_deadline"] })),
    overviewStudentFromRow(row({ student_id: "c", display_name: "Cleo", hidden: true, needs_support: true, reasons: ["self_report"] })),
    overviewStudentFromRow(row({ student_id: "d", display_name: "Dan", hidden: true, needs_support: true, reasons: ["no_activity"] })),
    overviewStudentFromRow(row({ student_id: "e", display_name: "Eva" })),
  ];
  assert.deepEqual(supportList(list).map((s) => s.studentId), ["c", "b", "a"]);
  assert.match(supportText("upcoming_deadline"), /Frist/); assert.equal(supportText("unknown"), "Braucht Unterstützung");
});

test("fallback overview from teacher_class_students + teacher_attention", () => {
  const base = { displayName: "X", hidden: false, interviews: 0, offers: 0, schnupper: 0, placed: false, lastActivity: "2026-11-01", inactive: false, statusCounts: {} };
  const out = overviewFromTeacherStudents([
    { ...base, studentId: "1", total: 0 },
    { ...base, studentId: "2", total: 4, inactive: true, statusCounts: { saved: 1, applied: 3 } },
    { ...base, studentId: "3", total: 2, placed: true, inactive: true },
    { ...base, studentId: "4", hidden: true, total: 0, lastActivity: null },
  ], [{ studentId: "4", reason: "self_report" }]);
  assert.deepEqual(out.map((s) => s.reasons), [["no_application"], ["no_activity"], [], ["self_report"]]);
  assert.equal(out[1].applications, 3);
  assert.equal(out[3].lastActivity, null);
});

test("meaningful progress: one interview counts more than many applications", () => {
  const many = { applications: 30, interviews: 0, trialDays: 0, offers: 0, placed: false };
  const one = { applications: 1, interviews: 1, trialDays: 0, offers: 0, placed: false };
  assert.ok(progressStep(one) > progressStep(many));
  assert.equal(progressStep({ ...many, applications: 0 }), 0); assert.equal(progressStep({ ...one, placed: true }), 4);
  const t = (o) => ({ studentId: o.id, displayName: o.id, avatarSeed: "", joinedAt: "2026-09-01", hidden: false, total: 0, statusCounts: {}, interviews: 0, offers: 0, placed: false, schnupper: 0, lastActivity: null, inactive: false, lastNudgedAt: null, ...o });
  const list = [t({ id: "volume", total: 25, statusCounts: { applied: 25 } }), t({ id: "schnupper", total: 1, schnupper: 1, statusCounts: { schnupper_done: 1 } }), t({ id: "saved-only", total: 9, statusCounts: { saved: 9 } })];
  assert.deepEqual(sortStudents(list, "progress").map((s) => s.studentId), ["schnupper", "volume", "saved-only"]);
  assert.equal(progressRank(list[2]), 0);
});

test("export: file name and secrets are stripped recursively", () => {
  assert.equal(exportFileName(TODAY), "wendapply-meine-daten-2026-11-16.json");
  const out = scrubExport({ a: 1, access_token: "x", nested: [{ refresh_token: "y", token: "z", name: "n" }], api_key: "k", password_hash: "p", invite_code: "LENA" });
  assert.deepEqual(out, { a: 1, nested: [{ name: "n" }], invite_code: "LENA" });
});

// ---------- source contracts ----------
async function sources(dir) {
  const out = [];
  for (const entry of await readdir(new URL(dir, import.meta.url), { withFileTypes: true, recursive: true }))
    if (entry.isFile() && /\.(tsx?|mjs)$/.test(entry.name)) out.push(await readFile(`${entry.parentPath}/${entry.name}`, "utf8"));
  return out;
}

test("B2B UI: Swiss spelling (no Eszett), no payment code, no application contents", async () => {
  const files = [...await sources("../components/b2b/"), ...await sources("../app/schul-admin/"), await readFile(new URL("../lib/b2b/client.ts", import.meta.url), "utf8"), await readFile(new URL("../app/settings/page.tsx", import.meta.url), "utf8")];
  assert.ok(files.length >= 8, `found ${files.length} files`);
  for (const src of files) {
    assert.doesNotMatch(src, /ß/);
    assert.doesNotMatch(src, /stripe|checkout|payment_intent/i);
  }
  const overview = await readFile(new URL("../components/b2b/class-overview.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(overview, /\.company|\.position|\.notes/);
  const admin = await readFile(new URL("../components/b2b/school-admin.tsx", import.meta.url), "utf8");
  assert.match(admin, /Paketwechsel über Kontakt/);
});

test("settings: 'Meine Daten' export + existing deletion flows are kept", async () => {
  const page = await readFile(new URL("../app/settings/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Daten exportieren \(JSON\)/);
  assert.match(page, /exportMyDataFromServer/);
  assert.match(page, /scrubExport/);
  assert.match(page, /<DeleteAccountCard \/>/);
  assert.match(page, /Meine Daten löschen/);
});

test("teacher class view exposes overview and goals tabs; students tab stays the default", async () => {
  const view = await readFile(new URL("../components/teacher/class-view.tsx", import.meta.url), "utf8");
  assert.match(view, /value: "overview", label: "Überblick"/);
  assert.match(view, /value: "goals", label: "Ziele"/);
  assert.match(view, /: "students"\);/);
});
