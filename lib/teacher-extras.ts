// Pure helpers for the teacher area (P0 part g). No React, no Supabase: unit-tested in tests/teacher-g-lib.test.mjs.
import type { CsvColumn } from "./teacher-csv";
import { shownName } from "./profile-name-utils.ts";

const DAY_MS = 86_400_000;

// ---------- names ----------
/** Display name of a student with a fallback (part f may deliver real names; empty or missing names must never render as blank). */
export function studentLabel(name: string | null | undefined): string {
  return shownName({ displayName: name }, "Ohne Namen");
}

// ---------- dates ----------
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;
/** "2026-11-06" from a date or timestamp string (date part as stored, no timezone shift for plain dates). */
export function isoDay(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") { const m = ISO_DAY.exec(value); if (m) return `${m[1]}-${m[2]}-${m[3]}`; }
  const d = new Date(value); if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** Swiss date with leading zeros: 06.11.2026 (stable in Excel and independent of the browser locale). */
export function formatDateCh(value: string | Date | null | undefined): string {
  const iso = isoDay(value); if (!iso) return "";
  const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`;
}
const utc = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
export function addDays(iso: string, days: number): string { return new Date(utc(iso) + days * DAY_MS).toISOString().slice(0, 10); }
export function daysBetween(fromIso: string, toIso: string): number { return Math.round((utc(toIso) - utc(fromIso)) / DAY_MS); }
/** Monday of the week containing the date. */
export function weekStart(iso: string): string { const dow = (new Date(utc(iso)).getUTCDay() + 6) % 7; return addDays(iso, -dow); }
export function weekDays(startIso: string): string[] { return Array.from({ length: 7 }, (_, i) => addDays(startIso, i)); }
/** Calendar week number (ISO 8601). */
export function isoWeek(iso: string): number {
  const t = new Date(utc(iso)); const dow = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - dow + 3);
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); const fdow = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fdow + 3);
  return 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
}
/** "heute", "gestern", "vor 5 Tagen", "vor 3 Wochen", "vor 2 Monaten". */
export function relativeAge(value: string | null | undefined, todayIso: string): string {
  const iso = isoDay(value); if (!iso) return "";
  const days = daysBetween(iso, todayIso);
  if (days < 0) { const ahead = -days; return ahead === 1 ? "morgen" : `in ${ahead} Tagen`; }
  if (days === 0) return "heute";
  if (days === 1) return "gestern";
  if (days < 14) return `vor ${days} Tagen`;
  if (days < 60) return `vor ${Math.floor(days / 7)} Wochen`;
  const months = Math.floor(days / 30); return months === 1 ? "vor 1 Monat" : `vor ${months} Monaten`;
}
export function todayIso(now: Date = new Date()): string { return isoDay(now); }

// ---------- invite import (paste or CSV "Name, E-Mail") ----------
export const MAX_IMPORT_ROWS = 200;
export type ImportStatus = "ok" | "invalid" | "duplicate";
export type ImportRow = { line: number; name: string; email: string; status: ImportStatus; reason: string };
const EMAIL = /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[^\s@,;<>()"]{2,}$/;
export function isImportEmail(value: string): boolean { const v = value.trim(); return v.length <= 254 && EMAIL.test(v); }

/** RFC-4180 style splitter (quotes, doubled quotes, delimiters and line breaks inside quotes). Returns records with their start line. */
export function splitCsv(text: string, delimiter: string): { cells: string[]; line: number }[] {
  const records: { cells: string[]; line: number }[] = []; let cells: string[] = []; let cell = ""; let quoted = false; let line = 1; let start = 1;
  const endRecord = () => { cells.push(cell); cell = ""; if (cells.some((c) => c.trim() !== "")) records.push({ cells, line: start }); cells = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else { if (ch === "\n") line++; cell += ch; } continue; }
    if (ch === '"' && cell.trim() === "") { quoted = true; cell = ""; }
    else if (ch === delimiter) { cells.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; endRecord(); line++; start = line; }
    else cell += ch;
  }
  endRecord();
  return records;
}
function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const counts = [";", "\t", ","].map((d) => [d, first.split(d).length - 1] as const).sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}
const HEADER_MAIL = /^(e-?mail|mail|e-?mail-?adresse|email address)$/i;
const HEADER_NAME = /^(name|vollst(ä|ae)ndiger name|sch(ü|ue)ler(in)?|vorname|nachname)$/i;
const stripAngle = (v: string) => v.trim().replace(/^<|>$/g, "");

/**
 * Parses pasted addresses or a CSV file ("Name, E-Mail", header optional, delimiter , ; or tab, "Name <mail>" and plain lists accepted)
 * into rows with a per-row verdict. Pure and client-side; the server validates again.
 */
export function parseInviteCsv(input: string): { rows: ImportRow[]; counts: { ok: number; invalid: number; duplicate: number; total: number } } {
  const text = String(input ?? "").replace(/^﻿/, "");
  const records = text.trim() ? splitCsv(text, detectDelimiter(text)) : [];
  const rows: ImportRow[] = []; const seen = new Set<string>();
  let mailCol = -1; let nameCols: number[] = [];
  const first = records[0];
  if (first && !first.cells.some((c) => c.includes("@")) && first.cells.some((c) => HEADER_MAIL.test(c.trim()))) {
    mailCol = first.cells.findIndex((c) => HEADER_MAIL.test(c.trim()));
    nameCols = first.cells.flatMap((c, i) => (HEADER_NAME.test(c.trim()) ? [i] : []));
    records.shift();
  }
  const push = (line: number, name: string, raw: string) => {
    const email = stripAngle(raw).toLowerCase(); const cleanName = name.replace(/\s+/g, " ").trim().replace(/^"|"$/g, "");
    let status: ImportStatus = "ok"; let reason = "";
    if (!isImportEmail(email)) { status = "invalid"; reason = email ? "Keine gültige E-Mail-Adresse" : "E-Mail-Adresse fehlt"; }
    else if (seen.has(email)) { status = "duplicate"; reason = "Kommt in der Liste mehrfach vor"; }
    else if (rows.filter((r) => r.status === "ok").length >= MAX_IMPORT_ROWS) { status = "invalid"; reason = `Mehr als ${MAX_IMPORT_ROWS} Adressen auf einmal`; }
    if (status === "ok") seen.add(email);
    rows.push({ line, name: cleanName, email, status, reason });
  };
  for (const { cells, line } of records) {
    if (mailCol >= 0) { push(line, nameCols.map((i) => cells[i] ?? "").filter(Boolean).join(" "), cells[mailCol] ?? ""); continue; }
    const mailCells = cells.map((c, i) => [c, i] as const).filter(([c]) => c.includes("@"));
    if (mailCells.length === 0) { push(line, cells.filter((c) => c.trim()).join(" "), ""); continue; }
    for (const [cell, index] of mailCells) {
      // "Anna Muster <anna@x.ch>" in one cell
      const angle = /^(.*)<([^<>]+)>\s*$/.exec(cell.trim());
      if (angle) { push(line, angle[1], angle[2]); continue; }
      // several addresses in one cell, separated by whitespace
      const tokens = cell.trim().split(/\s+/).filter(Boolean);
      if (tokens.length > 1 && tokens.every((t) => t.includes("@"))) { tokens.forEach((t) => push(line, "", t)); continue; }
      const others = cells.filter((c, i) => i !== index && !c.includes("@") && c.trim()).join(" ");
      push(line, mailCells.length === 1 ? others : "", cell);
    }
  }
  const counts = { ok: 0, invalid: 0, duplicate: 0, total: rows.length };
  rows.forEach((r) => { counts[r.status]++; });
  return { rows, counts };
}

export type InviteOutcome = "created" | "already_invited" | "already_member" | "duplicate" | "invalid";
export const OUTCOME_LABEL: Record<InviteOutcome, string> = {
  created: "Einladung erstellt", already_invited: "Schon eingeladen (bestehender Link)", already_member: "Ist schon in der Klasse", duplicate: "Doppelt in der Liste", invalid: "Ungültige Adresse",
};
/** Counts per verdict; unknown outcomes (future server versions) are counted as "other" and never dropped. */
export function summarizeOutcomes(rows: { outcome: string }[]): { created: number; skipped: number; invalid: number; total: number; text: string } {
  const created = rows.filter((r) => r.outcome === "created").length;
  const invalid = rows.filter((r) => r.outcome === "invalid").length;
  const skipped = rows.length - created - invalid;
  const parts = [`${created} ${created === 1 ? "Einladung erstellt" : "Einladungen erstellt"}`];
  if (skipped) parts.push(`${skipped} übersprungen (doppelt oder schon dabei)`);
  if (invalid) parts.push(`${invalid} ungültig`);
  return { created, skipped, invalid, total: rows.length, text: parts.join(", ") };
}

// ---------- dashboard ----------
export type DashboardMode = "no-class" | "no-students" | "no-applications" | "normal";
/** Decides how the KPI area is shown, so a fresh teacher never sees six zeros. */
export function dashboardMode(totals: { students: number; applications: number }, classCount: number): DashboardMode {
  if (classCount === 0) return "no-class";
  if (totals.students === 0) return "no-students";
  if (totals.applications === 0) return "no-applications";
  return "normal";
}

// ---------- "Braucht Aufmerksamkeit" ----------
export type AttentionReason = "self_report" | "no_application" | "no_reply";
export type AttentionItem = { classId: string; className: string; studentId: string; displayName: string; reason: AttentionReason | string; days: number; openCount: number; selfReport: boolean };
export function attentionText(item: Pick<AttentionItem, "reason" | "days" | "openCount">): string {
  switch (item.reason) {
    case "self_report": return "Hat selbst gemeldet: noch keine Lehrstelle";
    case "no_application": return "Noch keine Bewerbung erfasst";
    case "no_reply": return `${item.openCount} ${item.openCount === 1 ? "Bewerbung" : "Bewerbungen"} ohne Antwort, die älteste seit ${item.days} Tagen`;
    default: return "Braucht Aufmerksamkeit";
  }
}

// ---------- class calendar ----------
export type ClassDeadline = { id: string; classId: string; className: string; title: string; dueDate: string; note: string | null };
export function deadlinesByDay(deadlines: ClassDeadline[]): Map<string, ClassDeadline[]> {
  const map = new Map<string, ClassDeadline[]>();
  for (const d of deadlines) { const key = isoDay(d.dueDate); map.set(key, [...(map.get(key) ?? []), d]); }
  return map;
}
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export function weekdayLabel(iso: string): string { return WEEKDAYS[(new Date(utc(iso)).getUTCDay() + 6) % 7]; }
export function weekLabel(startIso: string): string { return `KW ${isoWeek(startIso)} · ${formatDateCh(startIso)} – ${formatDateCh(addDays(startIso, 6))}`; }

// ---------- application cards (timeline) ----------
export type SharedApplication = { id: string; company: string | null; position: string | null; status: string | null; deadline: string | null; appliedAt: string | null; createdAt: string | null; updatedAt: string | null };
export type DeadlineState = "done" | "open" | "overdue";
export type ApplicationStage = { key: "saved" | "applied" | "current" | "deadline"; label: string; date: string; status?: string; deadlineState?: DeadlineState };
export type ApplicationCard = { id: string; company: string; position: string; status: string | null; statusLabel: string | null; age: string; waiting: boolean; stages: ApplicationStage[]; sortDate: string };
const BEFORE_APPLYING = new Set(["saved", "preparing"]);

/**
 * One card per application with the stage per event and the age. Stages are derived from dates only (there is no stored history):
 * saved (created), applied, the current status (if it is neither "saved" nor "applied"), deadline with its own state
 * (done if applied by then, overdue if still not applied after it). Unknown statuses are shown with their raw name, never dropped.
 */
export function buildApplicationCards(apps: SharedApplication[], today: string, labelOf: (status: string) => string | undefined = () => undefined): ApplicationCard[] {
  const label = (status: string) => labelOf(status) ?? status.replace(/_/g, " ");
  const cards = apps.map((a): ApplicationCard => {
    const applied = isoDay(a.appliedAt); const created = isoDay(a.createdAt); const updated = isoDay(a.updatedAt); const deadline = isoDay(a.deadline);
    const stages: ApplicationStage[] = [];
    if (created) stages.push({ key: "saved", label: "Gespeichert", date: created });
    if (applied) stages.push({ key: "applied", label: "Beworben", date: applied });
    if (a.status && a.status !== "saved" && a.status !== "applied" && a.status !== "preparing") stages.push({ key: "current", label: label(a.status), date: updated || applied || created, status: a.status });
    if (deadline) {
      // The deadline only matters while the application is not sent: done once applied (or any later status), else open/overdue.
      const sent = !!applied || (!!a.status && !BEFORE_APPLYING.has(a.status));
      const state: DeadlineState = sent ? "done" : deadline < today ? "overdue" : "open";
      stages.push({ key: "deadline", label: "Frist", date: deadline, deadlineState: state });
    }
    stages.sort((x, y) => x.date.localeCompare(y.date) || order(x.key) - order(y.key));
    // status null = the student hides stages: age is still shown, but no claim about replies.
    const waiting = a.status === "applied" && !!applied && daysBetween(applied, today) >= 14;
    let age = "";
    if (applied) age = `Beworben ${relativeAge(applied, today)}${a.status === "applied" ? (waiting ? ", noch keine Antwort" : "") : ""}`;
    else if (created) age = BEFORE_APPLYING.has(a.status ?? "saved") ? `Noch nicht beworben, ${relativeAge(created, today)} gespeichert` : `Erfasst ${relativeAge(created, today)}`;
    return { id: a.id, company: a.company ?? "Firma nicht freigegeben", position: a.position ?? "", status: a.status, statusLabel: a.status ? label(a.status) : null, age, waiting, stages, sortDate: updated || applied || created || deadline };
  });
  return cards.sort((a, b) => b.sortDate.localeCompare(a.sortDate) || a.id.localeCompare(b.id));
}
function order(key: ApplicationStage["key"]): number { return { saved: 0, applied: 1, current: 2, deadline: 3 }[key]; }

// ---------- CSV: per-person applications ----------
export type ExportApplicationRow = { studentId: string; displayName: string; company: string | null; position: string | null; status: string | null; appliedAt: string | null; deadline: string | null; createdAt: string | null };
export type ApplicationCsvLine = { name: string; company: string; position: string; status: string; appliedAt: string; deadline: string; createdAt: string; note: string };
/** One line per application, plus one line per student without data: hidden students ("Teilt keine Daten") and sharing students with 0 applications. */
export function buildApplicationCsvLines(students: { studentId: string; displayName: string; hidden: boolean }[], rows: ExportApplicationRow[], labelOf: (status: string) => string | undefined = () => undefined): ApplicationCsvLine[] {
  const lines: ApplicationCsvLine[] = []; const empty = { company: "", position: "", status: "", appliedAt: "", deadline: "", createdAt: "" };
  for (const s of [...students].sort((a, b) => studentLabel(a.displayName).localeCompare(studentLabel(b.displayName), "de"))) {
    const name = studentLabel(s.displayName);
    if (s.hidden) { lines.push({ name, ...empty, note: "Teilt keine Daten" }); continue; }
    const own = rows.filter((r) => r.studentId === s.studentId);
    if (own.length === 0) { lines.push({ name, ...empty, note: "Noch keine Bewerbung" }); continue; }
    for (const r of own) lines.push({ name, company: r.company ?? "", position: r.position ?? "", status: r.status ? labelOf(r.status) ?? r.status : "", appliedAt: formatDateCh(r.appliedAt), deadline: formatDateCh(r.deadline), createdAt: formatDateCh(r.createdAt), note: r.company === null ? "Firma nicht freigegeben" : "" });
  }
  return lines;
}
export const applicationCsvColumns: CsvColumn<ApplicationCsvLine>[] = [
  { header: "Name", value: (l) => l.name }, { header: "Firma", value: (l) => l.company }, { header: "Stelle", value: (l) => l.position },
  { header: "Status", value: (l) => l.status }, { header: "Beworben am", value: (l) => l.appliedAt }, { header: "Frist", value: (l) => l.deadline },
  { header: "Erfasst am", value: (l) => l.createdAt }, { header: "Hinweis", value: (l) => l.note },
];
