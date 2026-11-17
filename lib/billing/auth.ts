// Who may buy / manage / see billing: school admins of the school, active parents of the family (children never), and for
// the solo plan ("Einzelabo") only the user themselves (owner { kind: "user", id: caller }).
// Reuses the existing SQL helpers public.is_school_admin(uuid) and public.is_family_parent(uuid), called with the
// CALLER's token (auth.uid() = the caller), so the rules live in one place: the database.
// The checks themselves are pure (injected deps) so tests/billing-api.test.mjs runs without network.
import { createClient } from "@supabase/supabase-js";

export type BillingOwner = { kind: "school"; id: string } | { kind: "family"; id: string } | { kind: "user"; id: string };
export interface BillingUser { id: string; email: string | null }

export interface BillingAuthDeps {
  /** Verifies the access token with Supabase Auth; null = invalid/expired. */
  getUser(token: string): Promise<BillingUser | null>;
  isSchoolAdmin(token: string, schoolId: string): Promise<boolean>;
  isFamilyParent(token: string, familyId: string): Promise<boolean>;
}

export type AuthResult = { ok: true; user: BillingUser } | { ok: false; status: 401 | 403; error: "unauthenticated" | "forbidden" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function bearerToken(header: string | null | undefined): string | null {
  return /^Bearer\s+(\S+)$/i.exec(header ?? "")?.[1] ?? null;
}

/** Exactly one of schoolId / familyId, as a UUID. */
export function parseOwner(input: { schoolId?: unknown; familyId?: unknown }): BillingOwner | null {
  const school = typeof input.schoolId === "string" && input.schoolId ? input.schoolId : null;
  const family = typeof input.familyId === "string" && input.familyId ? input.familyId : null;
  if ((school ? 1 : 0) + (family ? 1 : 0) !== 1) return null;
  const id = (school ?? family)!;
  if (!UUID.test(id)) return null;
  return school ? { kind: "school", id } : { kind: "family", id };
}

/** `owner: "me"` in a body / `?owner=me` in a query: the caller's own (solo) billing. Never combined with schoolId / familyId. */
export function wantsOwnBilling(input: { owner?: unknown; schoolId?: unknown; familyId?: unknown }): boolean {
  return input.owner === "me" && !input.schoolId && !input.familyId;
}

export async function authorizeOwner(token: string | null, owner: BillingOwner, deps: BillingAuthDeps): Promise<AuthResult> {
  if (!token) return { ok: false, status: 401, error: "unauthenticated" };
  const user = await deps.getUser(token);
  if (!user) return { ok: false, status: 401, error: "unauthenticated" };
  const allowed = owner.kind === "user" ? user.id === owner.id
    : owner.kind === "school" ? await deps.isSchoolAdmin(token, owner.id) : await deps.isFamilyParent(token, owner.id);
  return allowed ? { ok: true, user } : { ok: false, status: 403, error: "forbidden" };
}

/** Real deps: Supabase Auth + the two SQL helpers with the caller's JWT. SERVER ONLY. */
export function supabaseAuthDeps(url: string, publishableKey: string): BillingAuthDeps {
  const asUser = (token: string) => createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const check = async (token: string, fn: "is_school_admin" | "is_family_parent", arg: Record<string, string>) => {
    const { data, error } = await asUser(token).rpc(fn, arg);
    if (error) throw new Error(`AUTH_CHECK_FAILED:${error.code ?? ""}`);
    return data === true;
  };
  return {
    async getUser(token) {
      const { data, error } = await asUser(token).auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id, email: data.user.email ?? null };
    },
    isSchoolAdmin: (token, schoolId) => check(token, "is_school_admin", { p_school_id: schoolId }),
    isFamilyParent: (token, familyId) => check(token, "is_family_parent", { p_family_id: familyId }),
  };
}
