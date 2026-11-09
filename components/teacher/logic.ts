// Pure helpers for the teacher screens (no React, no aliases at runtime) so they can be unit-tested with node --test.
import type { ApplicationStatus } from "@/types";
import type { ClassInvitation, TeacherStudent } from "@/lib/teacher";
import type { CsvColumn } from "@/lib/teacher-csv";

export const MAX_INVITE_EMAILS = 60;
const EMAIL = /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[^\s@,;<>()"]{2,}$/;

/** Splits free text (commas, semicolons, spaces, newlines, "Name <mail>") into deduped valid and invalid entries. */
export function parseEmails(text: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = []; const invalid: string[] = []; const seen = new Set<string>();
  for (const raw of text.split(/[\s,;]+/)) {
    const token = raw.trim().replace(/^<|>$/g, ""); if (!token) continue;
    const key = token.toLowerCase();
    if (EMAIL.test(token)) { if (!seen.has(key)) { seen.add(key); valid.push(key); } } else if (!invalid.includes(token)) invalid.push(token);
  }
  return { valid, invalid };
}

export function inviteUrl(token: string, origin = ""): string { return `${origin}/classes/join/${encodeURIComponent(token)}`; }

export function inviteMailto(email: string, className: string, url: string): string {
  const subject = `Einladung zur Klasse ${className} auf WendApply`;
  const body = `Hallo!\n\nDu bist eingeladen, der Klasse "${className}" auf WendApply beizutreten:\n${url}\n\nMelde dich mit dieser E-Mail-Adresse (${email}) an oder registriere dich.`;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export type InviteState = "active" | "revoked" | "expired" | "used";
export function inviteState(invite: Pick<ClassInvitation, "revoked" | "expiresAt" | "uses" | "maxUses">, now = Date.now()): InviteState {
  if (invite.revoked) return "revoked";
  if (new Date(invite.expiresAt).getTime() <= now) return "expired";
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return "used";
  return "active";
}
export const INVITE_STATE_LABEL: Record<InviteState, string> = { active: "Aktiv", revoked: "Widerrufen", expired: "Abgelaufen", used: "Aufgebraucht" };

export type StudentFilter = "all" | "inactive" | "hidden" | "interview" | "schnupper" | "offer" | "placed";
export type StudentSort = "name" | "total" | "activity" | "joined";
export const STUDENT_FILTERS: { value: StudentFilter; label: string }[] = [
  { value: "all", label: "Alle" }, { value: "inactive", label: "Inaktiv" }, { value: "hidden", label: "Teilt nicht" },
  { value: "interview", label: "Mit Gespräch" }, { value: "schnupper", label: "Mit Schnupperlehre" }, { value: "offer", label: "Mit Zusage" }, { value: "placed", label: "Lehrstelle gefunden" },
];
export const studentMatches: Record<StudentFilter, (s: TeacherStudent) => boolean> = {
  all: () => true, inactive: (s) => !s.hidden && s.inactive, hidden: (s) => s.hidden,
  interview: (s) => !s.hidden && s.interviews > 0, schnupper: (s) => !s.hidden && s.schnupper > 0, offer: (s) => !s.hidden && s.offers > 0, placed: (s) => !s.hidden && s.placed,
};

export function filterStudents(students: TeacherStudent[], filter: StudentFilter, query: string): TeacherStudent[] {
  const q = query.trim().toLowerCase();
  return students.filter((s) => studentMatches[filter](s) && (!q || s.displayName.toLowerCase().includes(q)));
}
/** Hidden students always sink to the bottom; "activity" puts the longest-quiet students first. */
export function sortStudents(students: TeacherStudent[], sort: StudentSort): TeacherStudent[] {
  const byName = (a: TeacherStudent, b: TeacherStudent) => a.displayName.localeCompare(b.displayName, "de");
  const time = (s: TeacherStudent) => (s.lastActivity ? new Date(s.lastActivity).getTime() : 0);
  const cmp: Record<StudentSort, (a: TeacherStudent, b: TeacherStudent) => number> = {
    name: byName, total: (a, b) => b.total - a.total, activity: (a, b) => time(a) - time(b), joined: (a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime(),
  };
  return [...students].sort((a, b) => Number(a.hidden) - Number(b.hidden) || cmp[sort](a, b) || byName(a, b));
}

export const NUDGE_COOLDOWN_DAYS = 3;
export function canNudge(s: Pick<TeacherStudent, "hidden" | "lastNudgedAt">, now = Date.now()): boolean {
  if (s.hidden) return false;
  return !s.lastNudgedAt || now - new Date(s.lastNudgedAt).getTime() >= NUDGE_COOLDOWN_DAYS * 864e5;
}

/** Swiss date with leading zeros (06.11.2026), independent of the browser locale. */
const day = (value: string | null) => { const m = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null; return m ? `${m[3]}.${m[2]}.${m[1]}` : value ? new Date(value).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" }) : ""; };
const nameOf = (s: TeacherStudent) => s.displayName.trim() || "Ohne Namen";
/** Columns for the CSV export of the visible class table. Hidden students expose name only. */
export function studentCsvColumns(labels: Record<ApplicationStatus, string>): CsvColumn<TeacherStudent>[] {
  return [
    { header: "Name", value: nameOf },
    { header: "Teilt Daten", value: (s) => (s.hidden ? "nein" : "ja") },
    { header: "Bewerbungen", value: (s) => (s.hidden ? "" : s.total) },
    { header: "Gespräche", value: (s) => (s.hidden ? "" : s.interviews) },
    { header: "Schnupperlehren", value: (s) => (s.hidden ? "" : s.schnupper) },
    { header: "Zusagen", value: (s) => (s.hidden ? "" : s.offers) },
    { header: "Lehrstelle gefunden", value: (s) => (s.hidden ? "" : s.placed ? "ja" : "nein") },
    { header: "Inaktiv", value: (s) => (s.hidden ? "" : s.inactive ? "ja" : "nein") },
    { header: "Letzte Aktivität", value: (s) => (s.hidden ? "" : day(s.lastActivity)) },
    ...(Object.keys(labels) as ApplicationStatus[]).map((status) => ({ header: labels[status], value: (s: TeacherStudent) => (s.hidden ? "" : s.statusCounts[status] ?? 0) })),
    { header: "Beigetreten", value: (s) => day(s.joinedAt) },
  ];
}
