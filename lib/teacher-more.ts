import { supabase } from "@/lib/supabase";
import type { AttentionItem, ClassDeadline, ExportApplicationRow, InviteOutcome, SharedApplication } from "@/lib/teacher-extras";

// Wrappers for the P0 part g RPCs (migration 20261109040000_teacher_attention_deadlines_audit.sql). Errors carry the stable code in the message
// like in lib/teacher.ts, so teacherErrorMessage()/teacherError() keep working.
type Row = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const num = (v: unknown) => Number(v ?? 0);
async function call<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) { const parts = [error.code, error.message, error.details, error.hint].filter(Boolean); throw Object.assign(new Error(`Database error: ${parts.join(" | ")}`), { code: error.code }); }
  return data as T;
}

// ---------- attention ----------
export async function getAttention(classId: string | null = null, days = 14): Promise<AttentionItem[]> {
  return ((await call<Row[] | null>("teacher_attention", { p_class_id: classId, p_days: days })) ?? []).map((r) => ({ classId: String(r.class_id), className: String(r.class_name ?? ""), studentId: String(r.student_id), displayName: String(r.display_name ?? ""), reason: String(r.reason), days: num(r.days), openCount: num(r.open_count), selfReport: Boolean(r.self_report) }));
}
/** Student: voluntary "noch keine Lehrstelle" flag per class (the only signal a non-sharing student can give the teacher). */
export async function setSelfReport(classId: string, value: boolean): Promise<void> { await call("class_set_self_report", { p_class_id: classId, p_value: value }); }
export async function getMySelfReports(): Promise<{ classId: string; className: string; selfReport: boolean }[]> {
  return ((await call<Row[] | null>("my_self_reports")) ?? []).map((r) => ({ classId: String(r.class_id), className: String(r.class_name ?? ""), selfReport: Boolean(r.self_report) }));
}

// ---------- class deadlines ----------
const deadlineFrom = (r: Row): ClassDeadline => ({ id: String(r.id), classId: String(r.class_id), className: String(r.class_name ?? ""), title: String(r.title), dueDate: String(r.due_date).slice(0, 10), note: str(r.note) });
export async function listClassDeadlines(classId: string, from?: string, to?: string): Promise<ClassDeadline[]> { return ((await call<Row[] | null>("class_deadline_list", { p_class_id: classId, p_from: from ?? null, p_to: to ?? null })) ?? []).map(deadlineFrom); }
export async function addClassDeadline(classId: string, title: string, dueDate: string, note?: string | null): Promise<string> { return call<string>("class_deadline_add", { p_class_id: classId, p_title: title, p_due_date: dueDate, p_note: note ?? null }); }
export async function deleteClassDeadline(id: string): Promise<void> { await call("class_deadline_delete", { p_id: id }); }
export async function getMyClassDeadlines(days = 60): Promise<ClassDeadline[]> { return ((await call<Row[] | null>("my_class_deadlines", { p_days: days })) ?? []).map(deadlineFrom); }

// ---------- invites ----------
export type InviteResult = { email: string; outcome: InviteOutcome | string; token: string | null };
export async function createInvitesDetailed(classId: string, emails: string[], expiresInDays = 14): Promise<InviteResult[]> {
  return ((await call<Row[] | null>("class_invite_create_many_v2", { p_class_id: classId, p_emails: emails, p_expires_in_days: expiresInDays })) ?? []).map((r) => ({ email: String(r.email), outcome: String(r.outcome), token: str(r.token) }));
}

// ---------- audit + export + applications ----------
export async function logStudentView(classId: string, studentId: string): Promise<void> { await call("class_log_view", { p_class_id: classId, p_student_id: studentId }); }
export type ViewLogEntry = { id: string; classId: string; className: string; teacherName: string; kind: "view" | "export" | string; viewedOn: string };
export async function getMyViewLog(limit = 20): Promise<ViewLogEntry[]> { return ((await call<Row[] | null>("my_view_log", { p_limit: limit })) ?? []).map((r) => ({ id: String(r.id), classId: String(r.class_id), className: String(r.class_name ?? ""), teacherName: String(r.teacher_name ?? ""), kind: String(r.kind), viewedOn: String(r.viewed_on).slice(0, 10) })); }
export async function exportClassApplications(classId: string): Promise<ExportApplicationRow[]> {
  return ((await call<Row[] | null>("teacher_class_applications_export", { p_class_id: classId })) ?? []).map((r) => ({ studentId: String(r.student_id), displayName: String(r.display_name ?? ""), company: str(r.company), position: str(r.position), status: str(r.status), appliedAt: str(r.applied_at), deadline: str(r.deadline), createdAt: str(r.created_at) }));
}
/** Shared fields of every application of one student (existing RPC class_student_applications). `hidden` = the student shares nothing. */
export async function getStudentApplications(classId: string, studentId: string): Promise<{ hidden: boolean; applications: SharedApplication[] }> {
  const rows = (await call<Row[] | null>("class_student_applications", { p_class_id: classId, p_student_id: studentId })) ?? [];
  if (rows.some((r) => r.hidden)) return { hidden: true, applications: [] };
  return { hidden: false, applications: rows.map((r) => ({ id: String(r.id), company: str(r.company), position: str(r.position), status: str(r.status), deadline: str(r.deadline), appliedAt: str(r.applied_at), createdAt: str(r.created_at), updatedAt: str(r.updated_at) })) };
}
