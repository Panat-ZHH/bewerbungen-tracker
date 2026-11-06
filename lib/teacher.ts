import { supabase } from "@/lib/supabase";
import type { ApplicationStatus, StatusCounts } from "@/types";

// Typed camelCase wrappers for the teacher-role RPCs (migration 20261107000000_teacher_role.sql, spec docs/teacher-contract.md).
// Teachers never read tables directly; everything goes through security-definer RPCs.

function databaseError(error: { code?: string; message?: string; details?: string | null; hint?: string | null }) { const parts = [error.code, error.message, error.details, error.hint].filter(Boolean); return Object.assign(new Error(`Database error: ${parts.join(" | ")}`), { code: error.code }); }

/** Stable error codes raised by the RPCs (found in Error.message). */
export type TeacherErrorCode =
  | "AUTH_REQUIRED" | "FORBIDDEN" | "NOT_FOUND" | "CLASS_NOT_FOUND" | "INVALID_NAME" | "INVALID_REQUEST"
  | "INVALID_EMAIL" | "INVITE_INVALID" | "EXPIRED" | "REVOKED" | "USED_UP" | "ARCHIVED" | "RATE_LIMITED";
const ERROR_CODES: readonly TeacherErrorCode[] = ["AUTH_REQUIRED", "CLASS_NOT_FOUND", "INVITE_INVALID", "INVALID_EMAIL", "INVALID_NAME", "INVALID_REQUEST", "RATE_LIMITED", "ARCHIVED", "EXPIRED", "REVOKED", "USED_UP", "FORBIDDEN", "NOT_FOUND"];
export function teacherErrorCode(reason: unknown): TeacherErrorCode | undefined { const message = reason instanceof Error ? reason.message : String(reason ?? ""); return ERROR_CODES.find((code) => message.includes(code)); }

const ERROR_TEXT: Record<TeacherErrorCode, string> = {
  AUTH_REQUIRED: "Bitte melde dich an.",
  FORBIDDEN: "Dazu fehlt dir die Berechtigung.",
  NOT_FOUND: "Das gibt es nicht (mehr).",
  CLASS_NOT_FOUND: "Diese Klasse gibt es nicht.",
  INVALID_NAME: "Bitte gib einen gültigen Namen ein.",
  INVALID_REQUEST: "Diese Eingabe ist ungültig.",
  INVALID_EMAIL: "Mindestens eine E-Mail-Adresse ist ungültig.",
  INVITE_INVALID: "Dieser Einladungslink ist ungültig.",
  EXPIRED: "Diese Einladung ist abgelaufen.",
  REVOKED: "Diese Einladung wurde zurückgezogen.",
  USED_UP: "Diese Einladung wurde schon zu oft benutzt.",
  ARCHIVED: "Diese Klasse ist archiviert.",
  RATE_LIMITED: "Du hast diese Person erst kürzlich erinnert. Bitte warte ein paar Tage.",
};
/** German user-facing text for an RPC error. */
export function teacherErrorMessage(reason: unknown): string { const code = teacherErrorCode(reason); return code ? ERROR_TEXT[code] : "Das hat leider nicht geklappt. Bitte versuche es später noch einmal."; }

// ---------- types ----------
export type Role = "student" | "teacher";
export type TeacherClass = { id: string; name: string; schoolYear: string; joinCode: string; createdAt: string; memberCount: number; archived: boolean; isOwner: boolean };
export type CoTeacher = { teacherId: string; displayName: string; avatarSeed: string; email: string | null; addedAt: string };
export type DashboardTotals = { students: number; classes: number; applications: number; interviews: number; offers: number; placed: number; inactive: number; deadlines7d: number; hiddenStudents: number };
export type DashboardClass = { id: string; name: string; schoolYear: string; archived: boolean; isOwner: boolean; joinCode: string; students: number; applications: number; interviews: number; offers: number; placed: number; inactive: number; hidden: number };
export type DashboardDeadline = { classId: string; className: string; studentId: string; studentName: string; company: string; position: string; deadline: string };
export type TeacherDashboard = { totals: DashboardTotals; classes: DashboardClass[]; deadlines: DashboardDeadline[] };
export type TeacherStudent = { studentId: string; displayName: string; avatarSeed: string; joinedAt: string; hidden: boolean; total: number; statusCounts: StatusCounts; interviews: number; offers: number; placed: boolean; lastActivity: string | null; inactive: boolean; lastNudgedAt: string | null };
export type TimelineKind = "created" | "applied" | "updated" | "deadline";
/** One shared event of one application. company/position are null if the student hides company names, status is null if the student hides stages. */
export type TimelineEvent = { applicationId: string; company: string | null; position: string | null; status: ApplicationStatus | null; eventDate: string; kind: TimelineKind };
export type StudentTimeline = { hidden: boolean; events: TimelineEvent[] };
export type InviteReason = "EXPIRED" | "REVOKED" | "USED_UP" | "INVALID" | "ARCHIVED" | "WRONG_EMAIL";
export type CreatedInvite = { id: string; token: string; expiresAt: string };
export type BulkInvite = { email: string; token: string };
export type ClassInvitation = { id: string; token: string; email: string | null; maxUses: number | null; uses: number; expiresAt: string; revoked: boolean; createdAt: string };
export type InvitePreview = { valid: boolean; reason: InviteReason | null; classId: string | null; name: string | null; schoolYear: string | null; teacherName: string | null; memberCount: number | null; alreadyMember: boolean };
export type InviteAccepted = { classId: string; name: string; schoolYear: string; teacherName: string; shareApplications: boolean; joinedAt: string };
export type StudentMembership = { classId: string; name: string; schoolYear: string; teacherName: string; shareApplications: boolean; joinedAt: string; shareCompanies: boolean; shareStatus: boolean; lastNudgeAt: string | null; announcementsCount: number };
export type VisibilityInfo = { teacherSees: string[]; teacherNeverSees: string[] };
export type Announcement = { id: string; text: string; createdAt: string; authorName: string };
export type NotificationKind = "nudge" | "announcement";
export type AppNotification = { id: string; kind: NotificationKind; classId: string | null; className: string | null; message: string | null; createdAt: string; read: boolean };

// ---------- pure helpers (unit-tested) ----------
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,128}$/;
/** Invite tokens are >= 22 url-safe characters; short join codes are 8 characters. */
export function isInviteToken(value: string): boolean { return TOKEN_PATTERN.test(value.trim()); }
/** Decides how the join page must treat the last URL segment: try the token first, else the short code. */
export function parseJoinInput(raw: string): { kind: "token" | "code"; value: string } { const value = decodeURIComponent(raw ?? "").trim(); return isInviteToken(value) ? { kind: "token", value } : { kind: "code", value: value.toUpperCase() }; }
export function inviteLink(token: string, origin = typeof window !== "undefined" ? window.location.origin : ""): string { return `${origin}/classes/join/${encodeURIComponent(token)}`; }

const EMAIL_PATTERN = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/;
export function isValidEmail(value: string): boolean { const v = value.trim(); return v.length <= 254 && EMAIL_PATTERN.test(v); }
/** Splits pasted text (commas, semicolons, spaces, newlines), lowercases, de-duplicates and separates invalid entries. */
export function parseEmailList(text: string): { valid: string[]; invalid: string[] } {
  const seen = new Set<string>(); const valid: string[] = []; const invalid: string[] = [];
  for (const part of String(text ?? "").split(/[\s,;]+/)) { const email = part.trim().toLowerCase(); if (!email || seen.has(email)) continue; seen.add(email); (isValidEmail(email) ? valid : invalid).push(email); }
  return { valid, invalid };
}
export const MAX_BULK_INVITES = 60;

export type InviteStatus = "active" | "expired" | "revoked" | "used_up";
export function inviteStatus(invite: Pick<ClassInvitation, "revoked" | "expiresAt" | "maxUses" | "uses">, now: Date = new Date()): InviteStatus {
  if (invite.revoked) return "revoked";
  if (new Date(invite.expiresAt).getTime() <= now.getTime()) return "expired";
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return "used_up";
  return "active";
}
export const NUDGE_COOLDOWN_DAYS = 3;
/** Date from which a student can be nudged again, or null if a nudge is possible now. */
export function nextNudgeAt(lastNudgedAt: string | null | undefined, now: Date = new Date()): Date | null {
  if (!lastNudgedAt) return null;
  const next = new Date(new Date(lastNudgedAt).getTime() + NUDGE_COOLDOWN_DAYS * 86_400_000);
  return next.getTime() > now.getTime() ? next : null;
}
export function inviteReasonText(reason: InviteReason | null): string { switch (reason) { case "EXPIRED": return ERROR_TEXT.EXPIRED; case "REVOKED": return ERROR_TEXT.REVOKED; case "USED_UP": return ERROR_TEXT.USED_UP; case "ARCHIVED": return ERROR_TEXT.ARCHIVED; case "WRONG_EMAIL": return "Diese Einladung gilt für eine andere E-Mail-Adresse."; case "INVALID": return ERROR_TEXT.INVITE_INVALID; default: return ""; } }
/** Share of the students with a placement, 0..100 (rounded). */
export function placedPercent(placed: number, students: number): number { return students > 0 ? Math.round((placed / students) * 100) : 0; }

// ---------- row mappers ----------
type Row = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const num = (v: unknown) => Number(v ?? 0);
function dashboardFromJson(data: Row | null): TeacherDashboard {
  const t = (data?.totals ?? {}) as Row;
  return {
    totals: { students: num(t.students), classes: num(t.classes), applications: num(t.applications), interviews: num(t.interviews), offers: num(t.offers), placed: num(t.placed), inactive: num(t.inactive), deadlines7d: num(t.deadlines_7d), hiddenStudents: num(t.hidden_students) },
    classes: ((data?.classes ?? []) as Row[]).map((c) => ({ id: String(c.id), name: String(c.name), schoolYear: String(c.school_year ?? ""), archived: Boolean(c.archived), isOwner: Boolean(c.is_owner), joinCode: String(c.join_code), students: num(c.students), applications: num(c.applications), interviews: num(c.interviews), offers: num(c.offers), placed: num(c.placed), inactive: num(c.inactive), hidden: num(c.hidden) })),
    deadlines: ((data?.deadlines ?? []) as Row[]).map((d) => ({ classId: String(d.class_id), className: String(d.class_name), studentId: String(d.student_id), studentName: String(d.student_name), company: String(d.company ?? ""), position: String(d.position ?? ""), deadline: String(d.deadline) })),
  };
}
function membershipFromRow(r: Row): StudentMembership { return { classId: String(r.class_id), name: String(r.name), schoolYear: String(r.school_year ?? ""), teacherName: String(r.teacher_name ?? ""), shareApplications: Boolean(r.share_applications), joinedAt: String(r.joined_at), shareCompanies: r.share_companies === undefined ? true : Boolean(r.share_companies), shareStatus: r.share_status === undefined ? true : Boolean(r.share_status), lastNudgeAt: str(r.last_nudge_at), announcementsCount: num(r.announcements_count) }; }

async function call<T>(name: string, args?: Record<string, unknown>): Promise<T> { const { data, error } = await supabase.rpc(name, args); if (error) throw databaseError(error); return data as T; }

// ---------- role ----------
/** Only allowed while the user has no classes and no memberships, else FORBIDDEN. */
export async function setMyRole(role: Role): Promise<void> { await call("set_my_role", { p_role: role }); }

// ---------- classes (teacher) ----------
export async function listTeacherClasses(): Promise<TeacherClass[]> { return (await call<Row[] | null>("class_list_mine") ?? []).map((r) => ({ id: String(r.id), name: String(r.name), schoolYear: String(r.school_year ?? ""), joinCode: String(r.join_code), createdAt: String(r.created_at), memberCount: num(r.member_count), archived: Boolean(r.archived), isOwner: r.is_owner === undefined ? true : Boolean(r.is_owner) })); }
export async function setClassArchived(classId: string, archived: boolean): Promise<void> { await call("class_set_archived", { p_class_id: classId, p_archived: archived }); }
/** Owner only. The target must be an existing teacher account (else NOT_FOUND). */
export async function addCoTeacher(classId: string, email: string): Promise<void> { await call("class_add_coteacher", { p_class_id: classId, p_email: email }); }
/** Owner may remove anyone; a co-teacher may remove themselves. */
export async function removeCoTeacher(classId: string, teacherId: string): Promise<void> { await call("class_remove_coteacher", { p_class_id: classId, p_teacher_id: teacherId }); }
export async function listCoTeachers(classId: string): Promise<CoTeacher[]> { return (await call<Row[] | null>("class_coteachers", { p_class_id: classId }) ?? []).map((r) => ({ teacherId: String(r.teacher_id), displayName: String(r.display_name ?? ""), avatarSeed: String(r.avatar_seed ?? ""), email: str(r.email), addedAt: String(r.added_at) })); }
export async function getTeacherDashboard(inactiveDays = 14): Promise<TeacherDashboard> { return dashboardFromJson(await call<Row | null>("teacher_dashboard", { p_inactive_days: inactiveDays })); }
export async function getTeacherClassStudents(classId: string, inactiveDays = 14): Promise<TeacherStudent[]> { return (await call<Row[] | null>("teacher_class_students", { p_class_id: classId, p_inactive_days: inactiveDays }) ?? []).map((r) => ({ studentId: String(r.student_id), displayName: String(r.display_name ?? ""), avatarSeed: String(r.avatar_seed ?? ""), joinedAt: String(r.joined_at), hidden: Boolean(r.hidden), total: num(r.total), statusCounts: (r.status_counts ?? {}) as StatusCounts, interviews: num(r.interviews), offers: num(r.offers), placed: Boolean(r.placed), lastActivity: str(r.last_activity), inactive: Boolean(r.inactive), lastNudgedAt: str(r.last_nudged_at) })); }
export async function getStudentTimeline(classId: string, studentId: string): Promise<StudentTimeline> {
  const rows = (await call<Row[] | null>("class_student_timeline", { p_class_id: classId, p_student_id: studentId })) ?? [];
  if (rows.some((r) => r.hidden)) return { hidden: true, events: [] };
  return { hidden: false, events: rows.map((r) => ({ applicationId: String(r.application_id), company: str(r.company), position: str(r.position), status: (r.status ?? null) as ApplicationStatus | null, eventDate: String(r.event_date), kind: r.kind as TimelineKind })) };
}

// ---------- invitations ----------
export async function createInvite(classId: string, options: { email?: string | null; maxUses?: number | null; expiresInDays?: number } = {}): Promise<CreatedInvite> { const rows = await call<Row[]>("class_invite_create", { p_class_id: classId, p_email: options.email ?? null, p_max_uses: options.maxUses ?? null, p_expires_in_days: options.expiresInDays ?? 14 }); const r = rows[0]; return { id: String(r.id), token: String(r.token), expiresAt: String(r.expires_at) }; }
export async function createInvites(classId: string, emails: string[], expiresInDays = 14): Promise<BulkInvite[]> { return (await call<Row[] | null>("class_invite_create_many", { p_class_id: classId, p_emails: emails, p_expires_in_days: expiresInDays }) ?? []).map((r) => ({ email: String(r.email), token: String(r.token) })); }
export async function listInvites(classId: string): Promise<ClassInvitation[]> { return (await call<Row[] | null>("class_invite_list", { p_class_id: classId }) ?? []).map((r) => ({ id: String(r.id), token: String(r.token), email: str(r.email), maxUses: r.max_uses === null || r.max_uses === undefined ? null : num(r.max_uses), uses: num(r.uses), expiresAt: String(r.expires_at), revoked: Boolean(r.revoked), createdAt: String(r.created_at) })); }
export async function revokeInvite(invitationId: string): Promise<void> { await call("class_invite_revoke", { p_invitation_id: invitationId }); }
export async function previewInvite(token: string): Promise<InvitePreview> { const r = ((await call<Row[]>("class_invite_preview", { p_token: token })) ?? [])[0]; if (!r) return { valid: false, reason: "INVALID", classId: null, name: null, schoolYear: null, teacherName: null, memberCount: null, alreadyMember: false }; return { valid: Boolean(r.valid), reason: (r.reason ?? null) as InviteReason | null, classId: str(r.class_id), name: str(r.name), schoolYear: str(r.school_year), teacherName: str(r.teacher_name), memberCount: r.member_count === null || r.member_count === undefined ? null : num(r.member_count), alreadyMember: Boolean(r.already_member) }; }
export async function acceptInvite(token: string): Promise<InviteAccepted> { const r = (await call<Row[]>("class_invite_accept", { p_token: token }))[0]; return { classId: String(r.class_id), name: String(r.name), schoolYear: String(r.school_year ?? ""), teacherName: String(r.teacher_name ?? ""), shareApplications: Boolean(r.share_applications), joinedAt: String(r.joined_at) }; }

// ---------- consent / transparency (student) ----------
/** Master switch `share`, optional per-field switches (undefined = unchanged). */
export async function setClassSharingV2(classId: string, share: boolean, options: { companies?: boolean; status?: boolean } = {}): Promise<void> { await call("class_set_sharing_v2", { p_class_id: classId, p_share: share, p_companies: options.companies ?? null, p_status: options.status ?? null }); }
export async function getMyMemberships(): Promise<StudentMembership[]> { return (await call<Row[] | null>("class_my_classes") ?? []).map(membershipFromRow); }
export async function getVisibilityInfo(): Promise<VisibilityInfo> { const d = (await call<Row | null>("class_visibility_info")) ?? {}; return { teacherSees: (d.teacher_sees ?? []) as string[], teacherNeverSees: (d.teacher_never_sees ?? []) as string[] }; }

// ---------- announcements and nudges ----------
export async function announce(classId: string, text: string): Promise<string> { return call<string>("class_announce", { p_class_id: classId, p_text: text }); }
export async function listAnnouncements(classId: string): Promise<Announcement[]> { return (await call<Row[] | null>("class_announcement_list", { p_class_id: classId }) ?? []).map((r) => ({ id: String(r.id), text: String(r.text), createdAt: String(r.created_at), authorName: String(r.author_name ?? "") })); }
/** At most one nudge per student and class every 3 days (else RATE_LIMITED). */
export async function nudgeStudent(classId: string, studentId: string, message?: string | null): Promise<void> { await call("class_nudge", { p_class_id: classId, p_student_id: studentId, p_message: message ?? null }); }
export async function listNotifications(): Promise<AppNotification[]> { return (await call<Row[] | null>("my_notifications") ?? []).map((r) => ({ id: String(r.id), kind: r.kind as NotificationKind, classId: str(r.class_id), className: str(r.class_name), message: str(r.message), createdAt: String(r.created_at), read: Boolean(r.read) })); }
export async function markNotificationRead(id: string): Promise<void> { await call("mark_notification_read", { p_id: id }); }
