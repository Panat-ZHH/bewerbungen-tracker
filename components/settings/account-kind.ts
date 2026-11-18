"use client";

import { useEffect, useState } from "react";
import { useAccess } from "@/components/access/access-provider";
import { isParentAccount, isSchoolAdmin, isServerAccess, isStaff } from "@/lib/access/gate";
import { loadMyRole } from "@/lib/role";
import { supabase } from "@/lib/supabase";

/** Who is looking at a shared page (presentation only – access decisions stay on the server and in lib/access). */
export type AccountKind = "student" | "parent" | "teacher" | "school_admin";

/** Pure: same order as the shell (teacher > parent > school admin > student). */
export function accountKindOf(role: "student" | "teacher" | null, parent: boolean, schoolAdmin: boolean): AccountKind | null {
  if (role === null) return null;
  if (role === "teacher") return "teacher";
  if (parent) return "parent";
  if (schoolAdmin) return "school_admin";
  return "student";
}

/**
 * Kind of the signed-in account, null while unknown. Must be rendered inside the WorkspaceShell (AccessProvider).
 * Unknown = the role or my_access() is still loading: the client-writable metadata alone must not decide (QA M1).
 * `confirmed`: the kind comes from the server (my_access().account_type or a staff role), not only from the metadata fallback.
 */
export function useAccountKindInfo(): { kind: AccountKind | null; confirmed: boolean } {
  const { access, loading } = useAccess();
  const [role, setRole] = useState<"student" | "teacher" | null>(null);
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      if (alive) setMeta(data.user.user_metadata ?? {});
      const { role: resolved } = await loadMyRole(data.user);
      if (alive) setRole(resolved);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (loading || !access) return { kind: null, confirmed: false };
  const kind = accountKindOf(role, isParentAccount(meta, access), isSchoolAdmin(access));
  const confirmed = kind !== null && isServerAccess(access) && (!!access.account_type || isStaff(access));
  return { kind, confirmed };
}

/** Kind of the signed-in account, null while unknown (see useAccountKindInfo). Presentation only. */
export function useAccountKind(): AccountKind | null {
  return useAccountKindInfo().kind;
}
