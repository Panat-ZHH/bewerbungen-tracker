"use client";

import { useEffect, useState } from "react";
import { useAccess } from "@/components/access/access-provider";
import { isParentAccount, isSchoolAdmin } from "@/lib/access/gate";
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

/** Kind of the signed-in account, null while unknown. Must be rendered inside the WorkspaceShell (AccessProvider). */
export function useAccountKind(): AccountKind | null {
  const { access } = useAccess();
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
  return accountKindOf(role, isParentAccount(meta, access), isSchoolAdmin(access));
}
