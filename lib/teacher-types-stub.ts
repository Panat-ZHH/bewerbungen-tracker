// TEMPORARY stub of the contract in docs/teacher-contract.md until lib/teacher.ts (teacher-db branch) is merged.
// UI code imports everything through components/teacher/api.ts, so switching is a one-line change there.
import { supabase } from "@/lib/supabase";
import type { ApplicationStatus, StatusCounts } from "@/types";

function databaseError(error: { code?: string; message?: string; details?: string | null; hint?: string | null }) { const parts = [error.code, error.message, error.details, error.hint].filter(Boolean); return Object.assign(new Error(`Database error: ${parts.join(" | ")}`), { code: error.code }); }
async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> { const { data, error } = await supabase.rpc(name, args); if (error) throw databaseError(error); return data as T; }

export type TeacherErrorCode = "AUTH_REQUIRED" | "FORBIDDEN" | "NOT_FOUND" | "CLASS_NOT_FOUND" | "INVALID_NAME" | "INVALID_REQUEST" | "EXPIRED" | "RATE_LIMITED";
const CODES: TeacherErrorCode[] = ["AUTH_REQUIRED", "FORBIDDEN", "CLASS_NOT_FOUND", "NOT_FOUND", "INVALID_NAME", "INVALID_REQUEST", "EXPIRED", "RATE_LIMITED"];
export function teacherErrorCode(reason: unknown): TeacherErrorCode | undefined { const message = reason instanceof Error ? reason.message : String(reason ?? ""); return CODES.find((c) => message.includes(c)); }

export type DashboardTotals = { students: number; classes: number; applications: number; interviews: number; offers: number; placed: number; inactive: number; deadlines7d: number; hiddenStudents: number };
export type DashboardClass = { id: string; name: string; schoolYear: string; archived: boolean; isOwner: boolean; joinCode: string; students: number; applications: number; interviews: number; offers: number; placed: number; inactive: number; hidden: number };
export type DashboardDeadline = { classId: string; className: string; studentId: string; studentName: string; company: string; position: string; deadline: string };
export type TeacherDashboard = { totals: DashboardTotals; classes: DashboardClass[]; deadlines: DashboardDeadline[] };
export type TeacherStudent = { studentId: string; displayName: string; avatarSeed: string; joinedAt: string; hidden: boolean; total: number; statusCounts: StatusCounts; interviews: number; offers: number; placed: boolean; lastActivity: string | null; inactive: boolean; lastNudgedAt: string | null };
export type TimelineEvent = { hidden: boolean; applicationId: string | null; company: string; position: string; status: ApplicationStatus; eventDate: string | null; kind: string };
export type ClassInvitation = { id: string; token: string; email: string | null; maxUses: number | null; uses: number; expiresAt: string; revoked: boolean; createdAt: string };
export type Announcement = { id: string; text: string; createdAt: string; authorName: string };
export type CoTeacher = { teacherId: string; displayName: string; email: string | null; addedAt: string; isOwner: boolean };

export const getTeacherDashboard = async (inactiveDays = 14): Promise<TeacherDashboard> => {
  const d = await rpc<{ totals: Record<string, number>; classes: Record<string, unknown>[]; deadlines: Record<string, string>[] }>("teacher_dashboard", { p_inactive_days: inactiveDays });
  const t = d?.totals ?? {};
  return {
    totals: { students: t.students ?? 0, classes: t.classes ?? 0, applications: t.applications ?? 0, interviews: t.interviews ?? 0, offers: t.offers ?? 0, placed: t.placed ?? 0, inactive: t.inactive ?? 0, deadlines7d: t.deadlines_7d ?? 0, hiddenStudents: t.hidden_students ?? 0 },
    classes: (d?.classes ?? []).map((c) => ({ id: c.id as string, name: c.name as string, schoolYear: (c.school_year as string) ?? "", archived: !!c.archived, isOwner: c.is_owner !== false, joinCode: (c.join_code as string) ?? "", students: (c.students as number) ?? 0, applications: (c.applications as number) ?? 0, interviews: (c.interviews as number) ?? 0, offers: (c.offers as number) ?? 0, placed: (c.placed as number) ?? 0, inactive: (c.inactive as number) ?? 0, hidden: (c.hidden as number) ?? 0 })),
    deadlines: (d?.deadlines ?? []).map((x) => ({ classId: x.class_id, className: x.class_name, studentId: x.student_id, studentName: x.student_name, company: x.company, position: x.position ?? "", deadline: x.deadline })),
  };
};
export const getTeacherClassStudents = async (classId: string, inactiveDays = 14): Promise<TeacherStudent[]> => {
  const rows = await rpc<Record<string, unknown>[]>("teacher_class_students", { p_class_id: classId, p_inactive_days: inactiveDays });
  return (rows ?? []).map((r) => ({ studentId: r.student_id as string, displayName: r.display_name as string, avatarSeed: (r.avatar_seed as string) ?? "", joinedAt: r.joined_at as string, hidden: !!r.hidden, total: (r.total as number) ?? 0, statusCounts: (r.status_counts as StatusCounts) ?? {}, interviews: (r.interviews as number) ?? 0, offers: (r.offers as number) ?? 0, placed: !!r.placed, lastActivity: (r.last_activity as string) ?? null, inactive: !!r.inactive, lastNudgedAt: (r.last_nudged_at as string) ?? null }));
};
export const getClassStudentTimeline = async (classId: string, studentId: string): Promise<TimelineEvent[]> => {
  const rows = await rpc<Record<string, unknown>[]>("class_student_timeline", { p_class_id: classId, p_student_id: studentId });
  return (rows ?? []).map((r) => ({ hidden: !!r.hidden, applicationId: (r.application_id as string) ?? null, company: (r.company as string) ?? "", position: (r.position as string) ?? "", status: r.status as ApplicationStatus, eventDate: (r.event_date as string) ?? null, kind: (r.kind as string) ?? "" }));
};
export const setClassArchived = (classId: string, archived: boolean) => rpc<void>("class_set_archived", { p_class_id: classId, p_archived: archived });
export const listClassTeachers = async (classId: string): Promise<CoTeacher[]> => {
  const rows = await rpc<Record<string, unknown>[]>("class_teachers_list", { p_class_id: classId });
  return (rows ?? []).map((r) => ({ teacherId: r.teacher_id as string, displayName: (r.display_name as string) ?? "", email: (r.email as string) ?? null, addedAt: r.added_at as string, isOwner: !!r.is_owner }));
};
export const addCoTeacher = (classId: string, email: string) => rpc<void>("class_add_coteacher", { p_class_id: classId, p_email: email });
export const removeCoTeacher = (classId: string, teacherId: string) => rpc<void>("class_remove_coteacher", { p_class_id: classId, p_teacher_id: teacherId });
export const createInvite = async (classId: string, email: string | null = null, maxUses: number | null = null, expiresInDays = 14) => {
  const rows = await rpc<{ id: string; token: string; expires_at: string }[]>("class_invite_create", { p_class_id: classId, p_email: email, p_max_uses: maxUses, p_expires_in_days: expiresInDays });
  return { id: rows[0].id, token: rows[0].token, expiresAt: rows[0].expires_at };
};
export const createInvitesMany = async (classId: string, emails: string[], expiresInDays = 14) => (await rpc<{ email: string; token: string }[]>("class_invite_create_many", { p_class_id: classId, p_emails: emails, p_expires_in_days: expiresInDays })).map((r) => ({ email: r.email, token: r.token }));
export const listInvites = async (classId: string): Promise<ClassInvitation[]> => (await rpc<Record<string, unknown>[]>("class_invite_list", { p_class_id: classId })).map((r) => ({ id: r.id as string, token: r.token as string, email: (r.email as string) ?? null, maxUses: (r.max_uses as number) ?? null, uses: (r.uses as number) ?? 0, expiresAt: r.expires_at as string, revoked: !!r.revoked, createdAt: r.created_at as string }));
export const revokeInvite = (invitationId: string) => rpc<void>("class_invite_revoke", { p_invitation_id: invitationId });
export const announce = (classId: string, text: string) => rpc<string>("class_announce", { p_class_id: classId, p_text: text });
export const listAnnouncements = async (classId: string): Promise<Announcement[]> => (await rpc<Record<string, unknown>[]>("class_announcement_list", { p_class_id: classId })).map((r) => ({ id: r.id as string, text: r.text as string, createdAt: r.created_at as string, authorName: (r.author_name as string) ?? "" }));
export const nudgeStudent = (classId: string, studentId: string, message: string | null = null) => rpc<void>("class_nudge", { p_class_id: classId, p_student_id: studentId, p_message: message });
