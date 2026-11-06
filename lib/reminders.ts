// Pure reminder logic (no I/O): shared by the dashboard, the digest job and the tests.
import type { Application } from "@/types";

export type ReminderKind = "deadline" | "stale";
export type ReminderSettings = { inApp: boolean; email: boolean; push: boolean; daysBefore: number; staleDays: number };
export const DEFAULT_SETTINGS: ReminderSettings = { inApp: true, email: false, push: false, daysBefore: 3, staleDays: 14 };

export type Reminder = {
  key: string; // application id + kind + due date: stable id for dedupe
  kind: ReminderKind;
  applicationId: string;
  company: string;
  position: string;
  dueOn: string; // YYYY-MM-DD (deadline, or the day the application went stale)
  days: number; // deadline: days until it (can be negative = missed); stale: days without update
  title: string;
  detail: string;
  tone: "danger" | "warning" | "neutral";
};

const closed = ["rejected", "withdrawn", "offer"]; // nothing left to remind about
const sent = ["applied", "interview", "final_interview"]; // deadline is irrelevant once applied
const pad = (n: number) => String(n).padStart(2, "0");
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayNumber = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null; };
export const daysBetween = (fromIso: string, toIso: string) => { const a = dayNumber(fromIso), b = dayNumber(toIso); return a === null || b === null ? null : b - a; };

export function normalizeSettings(raw: Partial<Record<string, unknown>> | null | undefined): ReminderSettings {
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
  return {
    inApp: typeof raw?.in_app === "boolean" ? raw.in_app : DEFAULT_SETTINGS.inApp,
    email: typeof raw?.email === "boolean" ? raw.email : DEFAULT_SETTINGS.email,
    push: typeof raw?.push === "boolean" ? raw.push : DEFAULT_SETTINGS.push,
    daysBefore: num(raw?.days_before, 0, 30, DEFAULT_SETTINGS.daysBefore),
    staleDays: num(raw?.stale_days, 3, 90, DEFAULT_SETTINGS.staleDays),
  };
}

function deadlineText(days: number) {
  if (days < 0) return days === -1 ? "gestern abgelaufen" : `vor ${-days} Tagen abgelaufen`;
  if (days === 0) return "heute";
  if (days === 1) return "morgen";
  return `in ${days} Tagen`;
}

/** Reminders for one user, most urgent first. `today` is a local YYYY-MM-DD string. */
export function computeReminders(apps: Pick<Application, "id" | "company" | "position" | "status" | "deadline" | "updatedAt" | "appliedAt">[], settings: ReminderSettings, today: string): Reminder[] {
  const out: Reminder[] = [];
  for (const a of apps) {
    if (closed.includes(a.status)) continue;
    if (a.deadline && !sent.includes(a.status)) {
      const days = daysBetween(today, a.deadline.slice(0, 10));
      // missed deadlines stay visible for a week so they are not silently dropped
      if (days !== null && days <= settings.daysBefore && days >= -7) {
        out.push({ key: `${a.id}:deadline:${a.deadline.slice(0, 10)}`, kind: "deadline", applicationId: a.id, company: a.company, position: a.position, dueOn: a.deadline.slice(0, 10), days,
          title: `Frist ${deadlineText(days)}`, detail: `${a.position} bei ${a.company}`, tone: days <= 1 ? "danger" : "warning" });
      }
    }
    if (sent.includes(a.status)) {
      const since = (a.updatedAt || a.appliedAt || "").slice(0, 10);
      const days = since ? daysBetween(since, today) : null;
      if (days !== null && days >= settings.staleDays) {
        out.push({ key: `${a.id}:stale:${since}`, kind: "stale", applicationId: a.id, company: a.company, position: a.position, dueOn: since, days,
          title: `${days} Tage kein Update`, detail: `${a.position} bei ${a.company}: Zeit für eine kurze Nachfrage?`, tone: "neutral" });
      }
    }
  }
  return out.sort((x, y) => (x.kind === y.kind ? (x.kind === "deadline" ? x.days - y.days : y.days - x.days) : x.kind === "deadline" ? -1 : 1));
}

// ---------- .ics ----------
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** RFC 5545: lines max 75 octets, continuation = CRLF + space. */
function fold(line: string) {
  const bytes = new TextEncoder(); const parts: string[] = []; let cur = "", len = 0;
  for (const ch of line) { const l = bytes.encode(ch).length; if (len + l > 74) { parts.push(cur); cur = ""; len = 1; } cur += ch; len += l; }
  parts.push(cur);
  return parts.join("\r\n ");
}
export type IcsApp = { id: string; company: string; position: string; location?: string | null; jobUrl?: string | null; deadline: string };
export function buildIcs(apps: IcsApp[], opts: { name?: string; stamp?: Date; alarmDaysBefore?: number } = {}): string {
  const stamp = (opts.stamp ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WendApply//Fristen//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(opts.name ?? "WendApply Fristen")}`];
  for (const a of apps) {
    const d = a.deadline.slice(0, 10); const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); if (!m) continue;
    const start = `${m[1]}${m[2]}${m[3]}`;
    const next = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 1)); const end = `${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}`;
    lines.push("BEGIN:VEVENT", `UID:${a.id.replace(/[^\w-]/g, "")}-deadline@wendapply`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${esc(`Frist: ${a.position} bei ${a.company}`)}`);
    if (a.location) lines.push(`LOCATION:${esc(a.location)}`);
    if (a.jobUrl && /^https?:\/\//.test(a.jobUrl)) lines.push(`URL:${a.jobUrl.replace(/[\r\n]/g, "")}`);
    lines.push(`DESCRIPTION:${esc("Bewerbungsfrist. Erinnerung von WendApply.")}`);
    lines.push("TRANSP:TRANSPARENT", "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(`Frist: ${a.company}`)}`, `TRIGGER:-P${opts.alarmDaysBefore ?? 1}D`, "END:VALARM", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function newFeedToken(): string {
  const b = new Uint8Array(32); crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export const isFeedToken = (t: unknown): t is string => typeof t === "string" && /^[\w-]{32,128}$/.test(t);

// ---------- digest text ----------
export function digestText(reminders: Reminder[], appUrl: string): { subject: string; text: string } {
  const n = reminders.length;
  const lines = reminders.map((r) => `• ${r.title}: ${r.detail}`);
  return {
    subject: n === 1 ? "WendApply: 1 Erinnerung" : `WendApply: ${n} Erinnerungen`,
    text: `Hallo\n\nDas steht heute bei dir an:\n\n${lines.join("\n")}\n\nÖffnen: ${appUrl}/dashboard\n\nDu kannst diese Mails in den Einstellungen unter «Benachrichtigungen» ausschalten.\n`,
  };
}
