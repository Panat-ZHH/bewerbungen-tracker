import { supabase } from "@/lib/supabase";
import { clearRoleCache } from "@/lib/role";
import { parsePrefill, searchPrefill, type OnboardingAnswers, type SearchPrefill } from "@/lib/onboarding-core";

export * from "@/lib/onboarding-core";

export const PREFILL_KEY = "wendapply.onboarding.prefill";

export function storePrefill(prefill: SearchPrefill | null) {
  try { if (prefill) window.localStorage.setItem(PREFILL_KEY, JSON.stringify(prefill)); else window.localStorage.removeItem(PREFILL_KEY); } catch { /* storage unavailable */ }
}
export function readPrefill(): SearchPrefill | null {
  try { return parsePrefill(window.localStorage.getItem(PREFILL_KEY)); } catch { return null; }
}

export async function saveOnboarding(a: OnboardingAnswers, complete: boolean): Promise<void> {
  const { error } = await supabase.rpc("student_onboarding_save", {
    p_first_name: a.firstName, p_last_name: a.lastName, p_school_level: a.schoolLevel, p_professions: a.professions,
    p_canton: a.canton, p_place: a.place, p_start_year: a.startYear, p_complete: complete,
  });
  if (error) throw error;
  clearRoleCache();
  storePrefill(searchPrefill(a));
  if (complete) await supabase.auth.updateUser({ data: { student_onboarded: true } });
}

/** "Später": nothing is stored except the flag, so the user is not asked again at every login. */
export async function skipOnboarding(): Promise<void> { await supabase.auth.updateUser({ data: { student_onboarded: true } }); }

type Row = { first_name: string | null; last_name: string | null; school_level: string | null; desired_professions: string[] | null; canton: string | null; location: string | null; desired_start_year: number | null; onboarding_completed_at: string | null };
/** Existing answers (RLS: own row only). `completed` is true when onboarding was finished on any device. */
export async function loadOnboarding(): Promise<{ answers: OnboardingAnswers; completed: boolean }> {
  const { data: auth } = await supabase.auth.getUser();
  const empty = { firstName: "", lastName: "", schoolLevel: "", professions: [], canton: "", place: "", startYear: null } as OnboardingAnswers;
  if (!auth.user) return { answers: empty, completed: false };
  const { data } = await supabase.from("profiles").select("first_name,last_name,school_level,desired_professions,canton,location,desired_start_year,onboarding_completed_at").eq("user_id", auth.user.id).maybeSingle();
  const row = data as Row | null;
  if (!row) return { answers: empty, completed: false };
  const answers: OnboardingAnswers = { firstName: row.first_name ?? "", lastName: row.last_name ?? "", schoolLevel: row.school_level ?? "", professions: row.desired_professions ?? [], canton: row.canton ?? "", place: row.location ?? "", startYear: row.desired_start_year };
  return { answers, completed: !!row.onboarding_completed_at };
}

/** Public: teacher name + class name for a usable class code / invitation token, or null. */
export async function loadInviteContext(code: string): Promise<{ teacherName: string; className: string } | null> {
  try {
    const { data, error } = await supabase.rpc("invite_context", { p_code: code });
    if (error) return null;
    const row = (data as { teacher_name: string | null; class_name: string | null }[] | null)?.[0];
    return row?.class_name ? { teacherName: row.teacher_name ?? "", className: row.class_name } : null;
  } catch { return null; }
}
