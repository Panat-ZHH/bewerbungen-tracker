import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  isMissingFamilyFeature, pendingAccountType, readChildOverview, readInvite, readMyFamily,
  type AccountType, type ChildOverview, type InviteDirection, type MyFamily, type ShareSettings, type WaitlistKind,
} from "@/lib/family-core";

// Client wrappers for the family RPCs (shared contract; the migration is written by the fam-db part).
// Never touch the family tables directly. Every call degrades gracefully: when the RPC does not exist yet (live DB without
// the migration) readers return `undefined` ("bald verfügbar") and writers throw a FamilyUnavailable error the UI turns into a
// friendly message. Errors keep the PostgREST code so familyError() can map them.

type PgError = { code?: string; message?: string; details?: string | null; hint?: string | null };
export class FamilyUnavailable extends Error { constructor() { super("FAMILY_UNAVAILABLE"); this.name = "FamilyUnavailable"; } }
export const isFamilyUnavailable = (e: unknown) => e instanceof FamilyUnavailable || (e as Error | null)?.message === "FAMILY_UNAVAILABLE";

function fail(error: PgError): never { throw Object.assign(new Error(error.message || "Database error"), { code: error.code, details: error.details }); }
async function call<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) { if (isMissingFamilyFeature(error)) throw new FamilyUnavailable(); fail(error); }
  return data as T;
}
async function optional<T>(name: string, args?: Record<string, unknown>): Promise<T | undefined> {
  try { return await call<T>(name, args); } catch (e) { if (isFamilyUnavailable(e)) return undefined; throw e; }
}

/** My family (null = none yet, undefined = family feature not deployed). */
export async function getMyFamily(myUserId?: string | null): Promise<MyFamily | null | undefined> {
  const data = await optional<unknown>("family_get_my");
  return data === undefined ? undefined : readMyFamily(data, myUserId);
}
export async function setAccountType(type: AccountType, birthYear: number | null): Promise<void> { await call("account_set_type", { p_type: type, p_birth_year: birthYear }); }
export async function createFamily(name: string): Promise<string> { return String(await call<unknown>("family_create", { p_name: name.trim().slice(0, 80) })); }
export async function createInvite(direction: InviteDirection) {
  const invite = readInvite(await call<unknown>("family_create_invite", { p_direction: direction }));
  if (!invite) throw new Error("Kein Code erhalten");
  return invite;
}
export async function joinFamily(code: string): Promise<unknown> { return call("family_join", { p_code: code }); }
export async function setConsent(childId: string, granted: boolean): Promise<void> { await call("family_set_consent", { p_child_id: childId, p_granted: granted }); }
export async function setShare(settings: ShareSettings): Promise<void> { await call("family_set_share", { p_settings: settings }); }
export async function getChildOverview(childId: string): Promise<ChildOverview | null> { return readChildOverview(await call<unknown>("family_child_overview", { p_child_id: childId })); }
export async function removeMember(userId: string): Promise<void> { await call("family_remove_member", { p_user_id: userId }); }
export async function leaveFamily(): Promise<void> { await call("family_leave"); }
/**
 * Stores the birth year (Jahrgang) for the family consent check, via account_set_type with the current account type.
 * School students (in a class) must stay school_student; everyone else is independent_student. Without `inClass`
 * it tries independent first and retries as school_student when the server says the account belongs to a class.
 */
export async function setBirthYear(year: number, inClass?: boolean): Promise<void> {
  if (inClass === true) { await setAccountType("school_student", year); return; }
  try { await setAccountType("independent_student", year); }
  catch (e) {
    if (inClass === false || !/FORBIDDEN|Schulkonten|42501/i.test(`${(e as PgError).message} ${(e as PgError).details ?? ""} ${(e as PgError).code ?? ""}`)) throw e;
    await setAccountType("school_student", year);
  }
}
/** Empty-family switch (S9): leave my own (empty) family, then join with the other side's code. */
export async function switchToFamily(code: string): Promise<unknown> {
  await leaveFamily();
  return joinFamily(code);
}
/** Everything the family feature stores about me (undefined = not deployed). Used by the "Meine Daten" export. */
export async function exportMyFamilyData(): Promise<unknown | undefined> { return optional<unknown>("family_export_my_data"); }
/** "Zugang anfragen": false = waitlist not deployed yet (the UI then points to /kontakt). Duplicate requests count as success. */
export async function joinWaitlist(email: string, kind: WaitlistKind, message: string): Promise<boolean> {
  try { await call("waitlist_join", { p_email: email.trim(), p_kind: kind, p_message: message.trim() || null }); return true; }
  catch (e) {
    if (isFamilyUnavailable(e)) return false;
    if (/duplicate|unique|23505|already/i.test(`${(e as PgError).message} ${(e as PgError).code}`)) return true;
    throw e;
  }
}

/**
 * Stores the account type chosen at signup (user_metadata.account_type) with account_set_type, once.
 * Silent: if the RPC is not deployed yet the choice stays in the metadata and is retried on the next sign-in.
 */
export async function syncPendingAccountType(user: Pick<User, "user_metadata"> | null | undefined): Promise<void> {
  const pending = pendingAccountType(user?.user_metadata);
  if (!pending) return;
  try {
    await setAccountType(pending.type, pending.birthYear);
    await supabase.auth.updateUser({ data: { account_type_synced: true } });
  } catch { /* not deployed or offline: retry later */ }
}
