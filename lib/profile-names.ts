import { supabase } from "@/lib/supabase";

export * from "@/lib/profile-name-utils";

function databaseError(error: { code?: string; message?: string; details?: string | null; hint?: string | null }) {
  const parts = [error.code, error.message, error.details, error.hint].filter(Boolean);
  return Object.assign(new Error(`Database error: ${parts.join(" | ")}`), { code: error.code });
}

export type NameStatus = { displayName: string; needsName: boolean; under16: boolean | null };

export async function getMyNameStatus(): Promise<NameStatus> {
  const { data, error } = await supabase.rpc("profile_name_status");
  if (error) throw databaseError(error);
  const row = (Array.isArray(data) ? data[0] : data) as { display_name?: string; needs_name?: boolean; under_16?: boolean | null } | null;
  return { displayName: row?.display_name ?? "", needsName: row?.needs_name ?? false, under16: row?.under_16 ?? null };
}

export async function setMyDisplayName(name: string): Promise<string> {
  const { data, error } = await supabase.rpc("profile_set_display_name", { p_name: name });
  if (error) throw databaseError(error);
  return String(data ?? name);
}

export async function setMyUnder16(value: boolean | null): Promise<void> {
  const { error } = await supabase.rpc("profile_set_under_16", { p_value: value });
  if (error) throw databaseError(error);
}

/** Teacher: student id -> alias for one class. */
export async function listStudentAliases(classId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase.rpc("class_student_aliases", { p_class_id: classId });
  if (error) throw databaseError(error);
  const out: Record<string, string> = {};
  for (const row of (data ?? []) as { student_id: string; alias: string }[]) out[row.student_id] = row.alias;
  return out;
}

/** Teacher: set an alias; an empty text removes it. */
export async function setStudentAlias(classId: string, studentId: string, alias: string): Promise<void> {
  const { error } = await supabase.rpc("class_set_student_alias", { p_class_id: classId, p_student_id: studentId, p_alias: alias });
  if (error) throw databaseError(error);
}
