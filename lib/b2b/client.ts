import { supabase } from "@/lib/supabase";
import { getTeacherClassStudents, getMyMemberships } from "@/lib/teacher";
import { getAttention } from "@/lib/teacher-more";
import {
  aggregate, aggregatesFromRow, isMissingFeature, overviewFromTeacherStudents, overviewStudentFromRow,
  type ClassAggregates, type GoalMetric, type LicencePackage, type LicenceStatus, type OverviewStudent,
} from "@/components/b2b/logic";

// Client wrappers for the B2B data model (migrations by the b2b-db part, see docs/b2b/DATA-MODEL.md).
// Every reader degrades gracefully: if a table or RPC is not deployed yet, it returns `null` (feature hidden)
// or falls back to the existing teacher RPCs. Errors carry the PostgREST code so callers can show a message.

type Row = Record<string, unknown>;
type PgError = { code?: string; message?: string; details?: string | null; hint?: string | null };
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
const optNum = (v: unknown) => (v === null || v === undefined ? null : num(v));
function fail(error: PgError): never { throw Object.assign(new Error(`Database error: ${[error.code, error.message, error.details, error.hint].filter(Boolean).join(" | ")}`), { code: error.code, details: error.details }); }

/** RPC call that returns `undefined` when the function does not exist yet. */
async function optionalRpc<T>(name: string, args?: Record<string, unknown>): Promise<T | undefined> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) { if (isMissingFeature(error)) return undefined; fail(error); }
  return data as T;
}

// ---------- class overview ----------
export type ClassOverview = { students: OverviewStudent[]; aggregates: ClassAggregates; source: "stats" | "fallback" };

export async function getClassOverview(classId: string): Promise<ClassOverview> {
  const data = await optionalRpc<unknown>("class_overview_stats", { p_class_id: classId, p_inactive_days: 14 });
  if (data !== undefined && data !== null) {
    const obj = (Array.isArray(data) ? { students: data } : data) as Row;
    const rows = (Array.isArray(obj.students) ? obj.students : []) as Row[];
    const students = rows.map(overviewStudentFromRow);
    return { students, aggregates: aggregatesFromRow((obj.aggregates ?? obj.class ?? obj.totals) as Row | undefined, aggregate(students)), source: "stats" };
  }
  const [list, attention] = await Promise.all([getTeacherClassStudents(classId), getAttention(classId).catch(() => [])]);
  const students = overviewFromTeacherStudents(list, attention);
  return { students, aggregates: aggregate(students), source: "fallback" };
}

// ---------- class goals ----------
/**
 * `target` is per person (null for custom goals). Progress comes only from class_goal_progress: `reached` of `counted`
 * consenting students reached the target, `total` is the class-wide sum. All three are null for custom goals and in the
 * student view while fewer than 3 classmates contribute (`suppressed`), so nobody can be singled out.
 */
export type ClassGoal = { id: string; classId: string; title: string; description: string; metric: GoalMetric; target: number | null; dueDate: string | null; reached: number | null; counted: number | null; total: number | null; suppressed: boolean };
export type GoalInput = { title: string; description: string; metric: GoalMetric; target: number | null; dueDate: string | null };

function goalFromRow(r: Row, classId: string): ClassGoal {
  return {
    id: String(r.goal_id ?? r.id), classId: String(r.class_id ?? classId), title: String(r.title ?? ""), description: String(r.description ?? ""),
    metric: (String(r.metric ?? "custom") as GoalMetric), target: optNum(r.target), dueDate: str(r.due_date)?.slice(0, 10) ?? null,
    reached: optNum(r.students_reached), counted: optNum(r.students_counted), total: optNum(r.total_value), suppressed: Boolean(r.suppressed),
  };
}

/**
 * Goals of a class with the aggregate progress (class_goal_progress, callable by the class teachers and members).
 * Falls back to the plain table without progress. null = class goals are not available on this database yet (hide the feature).
 */
export async function listClassGoals(classId: string): Promise<ClassGoal[] | null> {
  const rows = await optionalRpc<Row[] | null>("class_goal_progress", { p_class_id: classId });
  if (rows !== undefined) return (rows ?? []).map((r) => goalFromRow(r, classId));
  const { data, error } = await supabase.from("class_goals").select("id,class_id,title,description,metric,target,due_date").eq("class_id", classId).order("due_date", { ascending: true, nullsFirst: false });
  if (error) { if (isMissingFeature(error)) return null; fail(error); }
  return ((data ?? []) as Row[]).map((r) => goalFromRow(r, classId));
}

const goalRow = (g: GoalInput) => ({ title: g.title.trim(), description: g.description.trim() || null, metric: g.metric, target: g.target ?? null, due_date: g.dueDate || null });
export async function createClassGoal(classId: string, goal: GoalInput): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("class_goals").insert({ class_id: classId, created_by: auth.user?.id, ...goalRow(goal) });
  if (error) fail(error);
}
export async function updateClassGoal(id: string, goal: GoalInput): Promise<void> {
  const { error } = await supabase.from("class_goals").update(goalRow(goal)).eq("id", id);
  if (error) fail(error);
}
export async function deleteClassGoal(id: string): Promise<void> {
  const { error } = await supabase.from("class_goals").delete().eq("id", id);
  if (error) fail(error);
}

/** Student view: goals of all my classes with the class-wide progress only. null = not available. */
export async function listMyClassGoals(): Promise<{ classId: string; className: string; goals: ClassGoal[] }[] | null> {
  const memberships = await getMyMemberships();
  const out: { classId: string; className: string; goals: ClassGoal[] }[] = [];
  for (const m of memberships) {
    const goals = await listClassGoals(m.classId);
    if (goals === null) return null;
    if (goals.length) out.push({ classId: m.classId, className: m.name, goals });
  }
  return out;
}

// ---------- school admin ----------
export type SchoolLicence = { package: LicencePackage | string; studentLimit: number | null; status: LicenceStatus | string; state: string | null; pilotStart: string | null; pilotEnd: string | null; validUntil: string | null; studentsUsed: number | null; daysLeft: number | null };
/** Numbers are null when the server suppresses them (fewer than 3 consenting students in the class). */
export type SchoolClassInfo = { id: string; name: string; schoolYear: string; students: number; teacherName: string; archived: boolean; studentsWithApplication: number | null; studentsPlaced: number | null };
export type SchoolTeacher = { userId: string; displayName: string; classes: number };
export type SchoolOverview = { id: string; name: string; region: string | null; licence: SchoolLicence | null; studentCount: number | null; classes: SchoolClassInfo[] | null; teachers: SchoolTeacher[] | null };

function licenceFromJson(r: Row | null | undefined): SchoolLicence | null {
  if (!r || typeof r !== "object") return null;
  return { package: String(r.package ?? ""), studentLimit: optNum(r.student_limit), status: String(r.status ?? ""), state: str(r.state), pilotStart: str(r.pilot_start)?.slice(0, 10) ?? null, pilotEnd: str(r.pilot_end)?.slice(0, 10) ?? null, validUntil: str(r.valid_until)?.slice(0, 10) ?? null, studentsUsed: optNum(r.students_used), daysLeft: optNum(r.days_left) };
}
function classesFromJson(rows: unknown): SchoolClassInfo[] | null {
  if (!Array.isArray(rows)) return null;
  return (rows as Row[]).map((c) => ({ id: String(c.id ?? c.class_id), name: String(c.name ?? ""), schoolYear: String(c.school_year ?? ""), students: num(c.students), teacherName: String(c.teacher_name ?? ""), archived: Boolean(c.archived), studentsWithApplication: optNum(c.students_with_application), studentsPlaced: optNum(c.students_placed) }));
}
function teachersFromJson(rows: unknown): SchoolTeacher[] | null {
  if (!Array.isArray(rows)) return null;
  return (rows as Row[]).map((t) => ({ userId: String(t.teacher_id ?? t.user_id ?? ""), displayName: String(t.display_name ?? ""), classes: num(t.classes) }));
}
export function schoolFromOverview(base: { id: string; name: string; region: string | null; licence: SchoolLicence | null }, o: Row | null | undefined): SchoolOverview {
  const licence = licenceFromJson(o?.licence as Row | undefined) ?? base.licence;
  const totals = (o?.totals ?? {}) as Row;
  const school = (o?.school ?? {}) as Row;
  return {
    id: base.id, name: String(school.name ?? base.name), region: str(school.canton_or_state) || base.region, licence,
    studentCount: licence?.studentsUsed ?? optNum(totals.students),
    classes: classesFromJson(o?.classes), teachers: teachersFromJson(o?.teachers),
  };
}

/** Schools the signed-in user administers, each with its read-only overview. null = the B2B RPCs are not deployed (hide). */
export async function getMySchools(): Promise<SchoolOverview[] | null> {
  const list = await optionalRpc<Row[] | null>("school_admin_my_schools");
  if (list === undefined) return null;
  const out: SchoolOverview[] = [];
  for (const r of list ?? []) {
    const base = { id: String(r.school_id ?? r.id), name: String(r.name ?? ""), region: [str(r.canton_or_state), str(r.country)].filter(Boolean).join(", ") || null, licence: licenceFromJson(r.licence as Row | undefined) };
    const overview = await optionalRpc<Row | null>("school_admin_overview", { p_school_id: base.id }).catch(() => undefined);
    out.push(schoolFromOverview(base, overview ?? null));
  }
  return out;
}

// ---------- my data ----------
/** Server-side export of everything stored about me (export_my_data). undefined = RPC not deployed yet. */
export async function exportMyDataFromServer(): Promise<unknown | undefined> { return optionalRpc<unknown>("export_my_data"); }
