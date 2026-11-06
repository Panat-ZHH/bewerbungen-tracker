import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { safeNextPath } from "@/lib/ux";
import type { UserRole } from "@/types";

/** Pure routing rules (unit tested in tests/role.test.mjs). */
export const TEACHER_HOME = "/teacher";
export const STUDENT_HOME = "/dashboard";
export const ROLE_PICKER_PATH = "/auth/role";
export const ONBOARDING_PATH = "/teacher/onboarding";

/** Routes that only make sense for students. Teachers are sent to /teacher. */
const STUDENT_ONLY = ["/dashboard", "/applications", "/map", "/cvs", "/search", "/analytics"];

function under(pathname: string, prefix: string) { return pathname === prefix || pathname.startsWith(`${prefix}/`); }
export function homeFor(role: UserRole): string { return role === "teacher" ? TEACHER_HOME : STUDENT_HOME; }
export function isTeacherPath(pathname: string) { return under(pathname, "/teacher"); }
export function isStudentOnlyPath(pathname: string) { return STUDENT_ONLY.some((prefix) => under(pathname, prefix)); }

/** Where a user with this role must be sent instead of `pathname`, or null if the page is fine. */
export function guardRedirect(role: UserRole, pathname: string): string | null {
  const path = pathname.split(/[?#]/)[0] || "/";
  if (role === "student" && isTeacherPath(path)) return STUDENT_HOME;
  if (role === "teacher" && isStudentOnlyPath(path)) return TEACHER_HOME;
  return null;
}

/** Target after login / OAuth callback: the safe ?next= if the role may open it, else the role's home. */
export function landingPath(role: UserRole, next?: string | null): string {
  const safe = safeNextPath(next);
  if (!safe || safe === "/" || guardRedirect(role, safe)) return homeFor(role);
  return safe;
}

/** The role is "explicit" when it came from the signup form (user_metadata.role) or the picker (role_confirmed). */
export function hasExplicitRole(meta: Record<string, unknown> | null | undefined): boolean {
  return meta?.role === "student" || meta?.role === "teacher" || meta?.role_confirmed === true;
}
export function needsRoleChoice(user: Pick<User, "user_metadata"> | null | undefined): boolean { return !!user && !hasExplicitRole(user.user_metadata); }
export function teacherOnboarded(meta: Record<string, unknown> | null | undefined): boolean { return meta?.teacher_onboarded === true; }

/** `?next=` aware path to the role picker. */
export function rolePickerHref(next?: string | null) { const safe = safeNextPath(next); return safe && safe !== "/" ? `${ROLE_PICKER_PATH}?next=${encodeURIComponent(safe)}` : ROLE_PICKER_PATH; }

// ---- Supabase-backed helpers (client only) ----
type Cached = { userId: string; role: UserRole; displayName: string };
let cache: Cached | null = null;
export function clearRoleCache() { cache = null; }

/** Role + display name of the signed-in user (cached per user for the session). Falls back to "student" if the profile cannot be read. */
export async function loadMyRole(user: Pick<User, "id" | "user_metadata">): Promise<{ role: UserRole; displayName: string }> {
  if (cache?.userId === user.id) return cache;
  const { data, error } = await supabase.rpc("social_my_profile");
  const row = (data as { role?: string; display_name?: string }[] | null)?.[0];
  if (error || !row) {
    const metaRole = user.user_metadata?.role === "teacher" ? "teacher" : "student";
    return { role: metaRole, displayName: "" };
  }
  cache = { userId: user.id, role: row.role === "teacher" ? "teacher" : "student", displayName: row.display_name ?? "" };
  return cache;
}

/** Stores the chosen role (set_my_role is refused once the user has classes) and remembers that the user decided. */
export async function chooseRole(user: Pick<User, "id">, role: UserRole): Promise<UserRole> {
  const { error } = await supabase.rpc("set_my_role", { p_role: role });
  let effective = role;
  if (error) {
    if (!String(error.message ?? "").includes("FORBIDDEN")) throw Object.assign(new Error(error.message), { code: error.code });
    // Already has classes: keep whatever the server says.
    clearRoleCache();
    effective = (await loadMyRole({ id: user.id, user_metadata: {} })).role;
  }
  clearRoleCache();
  await supabase.auth.updateUser({ data: { role: effective, role_confirmed: true } });
  return effective;
}

export async function markTeacherOnboarded() { await supabase.auth.updateUser({ data: { teacher_onboarded: true } }); }

/** Decides where a freshly signed-in user goes. */
export async function resolveLanding(next?: string | null): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return "/login";
  if (needsRoleChoice(user)) return rolePickerHref(next);
  const { role } = await loadMyRole(user);
  if (role === "teacher" && !teacherOnboarded(user.user_metadata) && !safeNextPath(next)?.startsWith("/classes/join")) return TEACHER_HOME;
  return landingPath(role, next);
}
