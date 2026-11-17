import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { safeNextPath } from "@/lib/ux";
import { interpretTourRow, needsTour, tourDoneInMeta, UNKNOWN_TOUR, type TourStatus } from "@/lib/onboarding-tour-core";
import type { UserRole } from "@/types";
import { choiceToAccount, decodePendingSignup, encodePendingSignup, FAMILY_PATH, knownSignupChoice, parentGuardRedirect, PENDING_SIGNUP_KEY, signupMetadata, type SignupChoice } from "@/lib/family-core";
import { syncPendingAccountType } from "@/lib/family";
import { loadMyAccess } from "@/lib/access/client";
import { accessLanding, isEnforced, isParentAccount, isSchoolAdmin, LICENCE_PATH } from "@/lib/access/gate";

/** Pure routing rules (unit tested in tests/role.test.mjs). */
export const TEACHER_HOME = "/teacher";
export const STUDENT_HOME = "/dashboard";
export const ROLE_PICKER_PATH = "/auth/role";
export const ONBOARDING_PATH = "/teacher/onboarding";
export const STUDENT_ONBOARDING_PATH = "/onboarding";

/** Routes that only make sense for students. Teachers are sent to /teacher. */
const STUDENT_ONLY = ["/dashboard", "/applications", "/map", "/cvs", "/search", "/analytics", "/friends", "/bewerbung-check", "/onboarding"];
/** Family area (/familie, invite links): only students and parents can be family members (DB: _family_is_student), so teachers go home. */
const NOT_FOR_TEACHERS = ["/familie"];

function under(pathname: string, prefix: string) { return pathname === prefix || pathname.startsWith(`${prefix}/`); }
export function homeFor(role: UserRole): string { return role === "teacher" ? TEACHER_HOME : STUDENT_HOME; }
export function isTeacherPath(pathname: string) { return under(pathname, "/teacher"); }
export function isStudentOnlyPath(pathname: string) { return STUDENT_ONLY.some((prefix) => under(pathname, prefix)); }

/** Where a user with this role must be sent instead of `pathname`, or null if the page is fine. */
export function guardRedirect(role: UserRole, pathname: string): string | null {
  const path = pathname.split(/[?#]/)[0] || "/";
  if (role === "student" && isTeacherPath(path)) return STUDENT_HOME;
  if (role === "teacher" && (isStudentOnlyPath(path) || NOT_FOR_TEACHERS.some((prefix) => under(path, prefix)))) return TEACHER_HOME;
  if (role === "teacher") {
    // /classes is the student page: teachers use /teacher (one place for classes). Join links stay reachable.
    if (path === "/classes" || path === "/classes/") return TEACHER_HOME;
    const detail = /^\/classes\/([^/]+)\/?$/.exec(path);
    if (detail && detail[1] !== "join") return `/teacher/classes/${detail[1]}`;
  }
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
export function studentOnboarded(meta: Record<string, unknown> | null | undefined): boolean { return meta?.student_onboarded === true; }
/** `?next=` aware path to the student onboarding (it forwards to `next`, or the dashboard, when done / skipped). */
export function studentOnboardingHref(next?: string | null) { const safe = safeNextPath(next); return safe && safe !== "/" ? `${STUDENT_ONBOARDING_PATH}?next=${encodeURIComponent(safe)}` : STUDENT_ONBOARDING_PATH; }
export function teacherOnboarded(meta: Record<string, unknown> | null | undefined): boolean { return meta?.teacher_onboarded === true; }

/** Parents land on /familie unless the safe ?next= is a page they may open (e.g. a family invite link). */
export function parentLandingPath(next?: string | null): string {
  const safe = safeNextPath(next);
  if (!safe || safe === "/" || guardRedirect("student", safe) || parentGuardRedirect(safe)) return FAMILY_PATH;
  return safe;
}

/** Invite links that must come before the student tour (G17): they may grant access (class of a licensed school, family plan). */
export function isInvitePath(next: string | null | undefined): boolean {
  const path = String(next ?? "").split(/[?#]/)[0];
  return path.startsWith("/classes/join/") || path.startsWith("/familie/einladung/");
}

/** Why a link was not opened for this role (G16): shown as a short notice instead of a silent redirect. */
export function wrongRoleNotice(kind: "student" | "parent" | "teacher", pathname: string): string | null {
  const path = pathname.split(/[?#]/)[0] || "/";
  if (kind === "parent" && path.startsWith("/classes/join/")) return "Dieser Link ist für Schüler:innen einer Klasse. Als Elternteil kannst du keiner Klasse beitreten.";
  if (kind === "teacher" && path.startsWith("/familie/einladung/")) return "Dieser Link ist für Familien. Mit einem Konto als Lehrperson kannst du keiner Familie beitreten.";
  return null;
}

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

// ---- Role chosen on the signup tab before "Weiter mit Google" (FINDINGS 1: the parent was asked twice) ----
function storages(): Storage[] {
  if (typeof window === "undefined") return [];
  const out: Storage[] = [];
  try { out.push(window.sessionStorage); } catch { /* blocked */ }
  try { out.push(window.localStorage); } catch { /* blocked */ }
  return out;
}
/** Remembers the signup choice (session + local storage: the OAuth return can open in a new tab). */
export function storePendingSignup(choice: SignupChoice, birthYear: number | null) {
  const value = encodePendingSignup(choice, birthYear);
  for (const store of storages()) { try { store.setItem(PENDING_SIGNUP_KEY, value); } catch { /* full / blocked */ } }
}
export function clearPendingSignup() { for (const store of storages()) { try { store.removeItem(PENDING_SIGNUP_KEY); } catch { /* ignore */ } } }
export function readPendingSignup() {
  for (const store of storages()) { try { const v = decodePendingSignup(store.getItem(PENDING_SIGNUP_KEY)); if (v) return v; } catch { /* ignore */ } }
  return null;
}

/**
 * Applies a role we already know (signup choice carried through Google, or the family invite link) to an account that has
 * none yet, so the picker is never shown twice. Returns the updated user, or null when nothing was known / applied.
 */
export async function applyKnownRole(user: User, next?: string | null): Promise<User | null> {
  const pending = knownSignupChoice(readPendingSignup(), safeNextPath(next));
  if (!pending) {
    // School admins are created by WendApply: never ask them, never turn them into students (G6).
    const access = await loadMyAccess({ userId: user.id }).catch(() => null);
    if (isSchoolAdmin(access)) {
      const { data: updated } = await supabase.auth.updateUser({ data: { role_confirmed: true } });
      return updated.user ?? user;
    }
  }
  const known = pending ?? (await serverKnownChoice(user.id));
  if (!known) return null;
  clearPendingSignup();
  const { role: baseRole, accountType } = choiceToAccount(known.choice);
  const effective = await chooseRole(user, baseRole);
  if (effective === "student" && accountType) {
    const { data: updated } = await supabase.auth.updateUser({ data: signupMetadata(known.choice, known.birthYear) });
    await syncPendingAccountType(updated.user ?? user);
    return updated.user ?? user;
  }
  const { data: fresh } = await supabase.auth.getUser();
  return fresh.user ?? user;
}

/** The account type / staff role the server already stored (backend trigger, earlier device): never ask again for those. */
async function serverKnownChoice(userId: string): Promise<{ choice: SignupChoice; birthYear: number | null } | null> {
  const access = await loadMyAccess({ userId }).catch(() => null);
  if (!access) return null;
  if (access.account_type === "parent") return { choice: "parent", birthYear: null };
  if (access.account_type === "independent_student") return { choice: "independent", birthYear: null };
  if (access.account_type === "school_student") return { choice: "school", birthYear: null };
  if (access.role === "teacher" || access.role === "school_admin") return { choice: "teacher", birthYear: null };
  return null;
}

/** Decides where a freshly signed-in user goes. */
export async function resolveLanding(next?: string | null): Promise<string> {
  const { data } = await supabase.auth.getUser();
  let user = data.user;
  if (!user) return "/login";
  if (needsRoleChoice(user)) {
    const applied = await applyKnownRole(user, next).catch(() => null);
    if (!applied || needsRoleChoice(applied)) return rolePickerHref(next);
    user = applied;
  } else clearPendingSignup();
  await syncPendingAccountType(user);
  const { role } = await loadMyRole(user);
  const access = await loadMyAccess({ userId: user.id }).catch(() => null);
  // School admins: their school area, never the student tour (G6). Licensed or not: /schul-admin shows the licence state.
  if (isSchoolAdmin(access) && role !== "teacher") return "/schul-admin";
  // Teachers without a licence: the licence page instead of an empty teacher area (G9).
  if (isEnforced(access) && accessLanding(access) === LICENCE_PATH) return LICENCE_PATH;
  if (role === "student" && isParentAccount(user.user_metadata, access)) return parentLandingPath(next);
  // Invite links first, the tour afterwards (G17).
  if (role === "student" && isInvitePath(safeNextPath(next))) return safeNextPath(next)!;
  if (role === "teacher" && !teacherOnboarded(user.user_metadata) && !safeNextPath(next)?.startsWith("/classes/join")) return TEACHER_HOME;
  if (role === "student" && !tourDoneInMeta(user.user_metadata) && needsTour(role, user.user_metadata, await readTourStatus(user.id))) {
    // A teacher-only ?next= would only end in a silent redirect after the tour (G23): drop it.
    const keep = safeNextPath(next) && !guardRedirect("student", safeNextPath(next)!) ? next : null;
    // "Schule" signup: ask for the class code once before the tour (G8).
    if (needsClassCodeStep(user.user_metadata, access) && !(await isInAnyClass())) return classCodeHref(keep);
    return studentOnboardingHref(keep);
  }
  return landingPath(role, next);
}

// ---- Class code step for "Schule" signups (G8) ----
export const CLASS_CODE_PATH = "/onboarding/klasse";
/** School student (signup "Schule": no account_type), not asked yet, no access through a school yet. */
export function needsClassCodeStep(meta: Record<string, unknown> | null | undefined, access?: { reason?: string } | null): boolean {
  if (meta?.class_code_asked === true || meta?.account_type) return false;
  if (access?.reason === "school_licence") return false;
  return meta?.role === "student";
}
export function classCodeHref(next?: string | null) { const safe = safeNextPath(next); return safe && safe !== "/" ? `${CLASS_CODE_PATH}?next=${encodeURIComponent(safe)}` : CLASS_CODE_PATH; }
async function isInAnyClass(): Promise<boolean> {
  try { const { data, error } = await supabase.rpc("class_my_classes"); return !error && Array.isArray(data) && data.length > 0; } catch { return false; }
}

/** Tour state straight from profiles (inline so this module stays light). Old DB without the column: UNKNOWN_TOUR. */
async function readTourStatus(userId: string): Promise<TourStatus> {
  try {
    const { data, error } = await supabase.from("profiles").select("onboarding_tour_completed_at,onboarding_tour_step").eq("user_id", userId).maybeSingle();
    return interpretTourRow(data as { onboarding_tour_completed_at: string | null; onboarding_tour_step: number | null } | null, error);
  } catch { return UNKNOWN_TOUR; }
}
