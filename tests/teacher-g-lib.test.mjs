import assert from "node:assert/strict";
import { test } from "node:test";
import { loadLib } from "./helpers/load-lib.mjs";

const x = await loadLib("teacher-extras");

test("studentLabel falls back for empty names", () => {
  assert.equal(x.studentLabel("  Anna "), "Anna"); assert.equal(x.studentLabel(""), "Ohne Namen"); assert.equal(x.studentLabel(null), "Ohne Namen");
});

test("dates are zero-padded Swiss dates", () => {
  assert.equal(x.formatDateCh("2026-11-06"), "06.11.2026");
  assert.equal(x.formatDateCh("2026-03-09T23:30:00+00:00"), "09.03.2026");
  assert.equal(x.formatDateCh(null), "");
  assert.equal(x.addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(x.weekStart("2026-11-08"), "2026-11-02"); // Sunday -> Monday before
  assert.equal(x.weekStart("2026-11-02"), "2026-11-02");
  assert.equal(x.weekDays("2026-11-02").length, 7);
  assert.equal(x.isoWeek("2026-01-01"), 1); assert.equal(x.isoWeek("2026-11-06"), 45);
  assert.equal(x.weekLabel("2026-11-02"), "KW 45 · 02.11.2026 – 08.11.2026");
  assert.equal(x.weekdayLabel("2026-11-06"), "Fr");
});

test("relative age", () => {
  const t = "2026-11-06";
  assert.equal(x.relativeAge("2026-11-06", t), "heute"); assert.equal(x.relativeAge("2026-11-05", t), "gestern");
  assert.equal(x.relativeAge("2026-11-01", t), "vor 5 Tagen"); assert.equal(x.relativeAge("2026-10-16", t), "vor 3 Wochen");
  assert.equal(x.relativeAge("2026-07-01", t), "vor 4 Monaten"); assert.equal(x.relativeAge("2026-11-08", t), "in 2 Tagen");
});

test("invite import: name + email CSV with header, quotes and delimiters", () => {
  const csv = '﻿Name;E-Mail\r\n"Muster, Anna";anna@schule.ch\r\nBen Beispiel;BEN@Schule.ch\r\nCem;kaputt\r\nDora;anna@schule.ch\r\n\r\n;noname@schule.ch\r\n';
  const { rows, counts } = x.parseInviteCsv(csv);
  assert.deepEqual(rows.map((r) => [r.name, r.email, r.status]), [["Muster, Anna", "anna@schule.ch", "ok"], ["Ben Beispiel", "ben@schule.ch", "ok"], ["Cem", "kaputt", "invalid"], ["Dora", "anna@schule.ch", "duplicate"], ["", "noname@schule.ch", "ok"]]);
  assert.deepEqual(counts, { ok: 3, invalid: 1, duplicate: 1, total: 5 });
  assert.equal(rows[2].reason, "Keine gültige E-Mail-Adresse");
});

test("invite import: header-less comma file, 'Name <mail>', plain lists", () => {
  assert.deepEqual(x.parseInviteCsv("Anna Muster,anna@x.ch\nBen,ben@x.ch").rows.map((r) => [r.name, r.email]), [["Anna Muster", "anna@x.ch"], ["Ben", "ben@x.ch"]]);
  assert.deepEqual(x.parseInviteCsv("Anna Muster <Anna@x.ch>").rows.map((r) => [r.name, r.email, r.status]), [["Anna Muster", "anna@x.ch", "ok"]]);
  assert.deepEqual(x.parseInviteCsv("a@x.ch b@x.ch\nc@x.ch").rows.map((r) => r.email), ["a@x.ch", "b@x.ch", "c@x.ch"]);
  assert.deepEqual(x.parseInviteCsv("a@x.ch, b@x.ch, a@x.ch").rows.map((r) => [r.email, r.status]), [["a@x.ch", "ok"], ["b@x.ch", "ok"], ["a@x.ch", "duplicate"]]);
  assert.equal(x.parseInviteCsv("").rows.length, 0); assert.equal(x.parseInviteCsv("   \n ").counts.total, 0);
  assert.equal(x.parseInviteCsv("E-Mail\nanna@x.ch").rows.length, 1); // header only column
  assert.equal(x.parseInviteCsv("Name;E-Mail\nAnna;").rows[0].status, "invalid");
});

test("invite import caps at 200 valid rows", () => {
  const list = Array.from({ length: 205 }, (_, i) => `s${i}@x.ch`).join("\n");
  const { counts } = x.parseInviteCsv(list); assert.equal(counts.ok, 200); assert.equal(counts.invalid, 5);
});

test("outcome summary counts every address", () => {
  const s = x.summarizeOutcomes([{ outcome: "created" }, { outcome: "created" }, { outcome: "duplicate" }, { outcome: "already_member" }, { outcome: "invalid" }, { outcome: "something_new" }]);
  assert.deepEqual([s.created, s.skipped, s.invalid, s.total], [2, 3, 1, 6]);
  assert.equal(s.text, "2 Einladungen erstellt, 3 übersprungen (doppelt oder schon dabei), 1 ungültig");
  assert.equal(x.summarizeOutcomes([{ outcome: "created" }]).text, "1 Einladung erstellt");
});

test("dashboard mode never shows six zeros for a fresh teacher", () => {
  assert.equal(x.dashboardMode({ students: 0, applications: 0 }, 0), "no-class");
  assert.equal(x.dashboardMode({ students: 0, applications: 0 }, 2), "no-students");
  assert.equal(x.dashboardMode({ students: 5, applications: 0 }, 1), "no-applications");
  assert.equal(x.dashboardMode({ students: 5, applications: 3 }, 1), "normal");
});

test("attention text", () => {
  assert.match(x.attentionText({ reason: "self_report", days: 0, openCount: 0 }), /selbst gemeldet/);
  assert.equal(x.attentionText({ reason: "no_application", days: 0, openCount: 0 }), "Noch keine Bewerbung erfasst");
  assert.equal(x.attentionText({ reason: "no_reply", days: 21, openCount: 1 }), "1 Bewerbung ohne Antwort, die älteste seit 21 Tagen");
  assert.equal(x.attentionText({ reason: "brand_new", days: 0, openCount: 0 }), "Braucht Aufmerksamkeit");
});

test("deadlines grouped per day", () => {
  const m = x.deadlinesByDay([{ id: "1", classId: "c", className: "10a", title: "A", dueDate: "2026-11-09", note: null }, { id: "2", classId: "c", className: "10a", title: "B", dueDate: "2026-11-09T00:00:00Z", note: null }]);
  assert.equal(m.get("2026-11-09").length, 2);
});

test("application cards: stage per application, age, deadline state", () => {
  const today = "2026-11-06";
  const labels = { applied: "Beworben", interview: "Gespräch", offer: "Lehrstelle gefunden" };
  const cards = x.buildApplicationCards([
    { id: "a", company: "Alpha", position: "Informatiker", status: "applied", deadline: "2026-10-20", appliedAt: "2026-10-10", createdAt: "2026-10-01", updatedAt: "2026-10-10" },
    { id: "b", company: "Beta", position: "", status: "preparing", deadline: "2026-11-20", appliedAt: null, createdAt: "2026-10-30", updatedAt: "2026-10-30" },
    { id: "c", company: null, position: null, status: null, deadline: null, appliedAt: "2026-09-01", createdAt: "2026-08-01", updatedAt: "2026-09-01" },
    { id: "d", company: "Delta", position: "X", status: "future_status", deadline: "2026-10-01", appliedAt: null, createdAt: "2026-09-01", updatedAt: "2026-10-05" },
    { id: "e", company: "Eps", position: "Y", status: "interview", deadline: null, appliedAt: "2026-10-25", createdAt: "2026-10-20", updatedAt: "2026-11-02" },
  ], today, (s) => labels[s]);
  const by = Object.fromEntries(cards.map((c) => [c.id, c]));
  // done application: its (past) deadline is "done", not "Frist · Abgeschickt"-style confusion
  assert.equal(by.a.stages.find((s) => s.key === "deadline").deadlineState, "done");
  assert.equal(by.a.age, "Beworben vor 3 Wochen, noch keine Antwort"); assert.equal(by.a.waiting, true); assert.equal(by.a.statusLabel, "Beworben");
  assert.deepEqual(by.a.stages.map((s) => s.key), ["saved", "applied", "deadline"]);
  assert.equal(by.b.stages.find((s) => s.key === "deadline").deadlineState, "open");
  assert.equal(by.b.age, "Noch nicht beworben, vor 7 Tagen gespeichert");
  // hidden company/status: still an age, no claim about replies, never a crash
  assert.equal(by.c.company, "Firma nicht freigegeben"); assert.equal(by.c.statusLabel, null); assert.equal(by.c.waiting, false); assert.match(by.c.age, /^Beworben vor 2 Monaten$/);
  // unknown future status: raw name, kept as a stage
  assert.equal(by.d.statusLabel, "future status"); assert.equal(by.d.stages.find((s) => s.key === "current").label, "future status");
  assert.equal(by.d.stages.find((s) => s.key === "deadline").deadlineState, "done");
  assert.equal(by.e.stages.find((s) => s.key === "current").label, "Gespräch");
  assert.deepEqual(cards.map((c) => c.id), ["e", "b", "a", "d", "c"]); // newest activity first
  const overdue = x.buildApplicationCards([{ id: "o", company: "O", position: "", status: "saved", deadline: "2026-11-01", appliedAt: null, createdAt: "2026-10-01", updatedAt: "2026-10-01" }], today);
  assert.equal(overdue[0].stages.find((s) => s.key === "deadline").deadlineState, "overdue");
});

test("application CSV lines: consent rows, zeros, padded dates", async () => {
  const students = [{ studentId: "1", displayName: "Zoe", hidden: false }, { studentId: "2", displayName: "Anna", hidden: true }, { studentId: "3", displayName: "", hidden: false }, { studentId: "4", displayName: "Ben", hidden: false }];
  const rows = [{ studentId: "1", displayName: "Zoe", company: "Alpha", position: "P", status: "applied", appliedAt: "2026-03-09", deadline: null, createdAt: "2026-03-01" },
    { studentId: "4", displayName: "Ben", company: null, position: null, status: null, appliedAt: null, deadline: "2026-04-05", createdAt: "2026-03-01" }];
  const lines = x.buildApplicationCsvLines(students, rows, (s) => ({ applied: "Beworben" })[s]);
  assert.deepEqual(lines.map((l) => [l.name, l.note]), [["Anna", "Teilt keine Daten"], ["Ben", "Firma nicht freigegeben"], ["Ohne Namen", "Noch keine Bewerbung"], ["Zoe", ""]]);
  assert.equal(lines[3].appliedAt, "09.03.2026"); assert.equal(lines[3].status, "Beworben"); assert.equal(lines[1].deadline, "05.04.2026");
  const { toCsv } = await loadLib("teacher-csv");
  const csv = toCsv(lines, x.applicationCsvColumns);
  assert.ok(csv.startsWith("Name;Firma;Stelle;Status;Beworben am;Frist;Erfasst am;Hinweis\r\n")); assert.ok(csv.includes("Zoe;Alpha;P;Beworben;09.03.2026;;01.03.2026;"));
});
