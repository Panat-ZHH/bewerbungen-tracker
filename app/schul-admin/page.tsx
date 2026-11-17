"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { SchoolAdminView } from "@/components/b2b/school-admin";
import { supabase } from "@/lib/supabase";
import { loadMyAccess } from "@/lib/access/client";
import { OPEN_ACCESS } from "@/lib/access/gate";
import { homeFor, loadMyRole } from "@/lib/role";
import { isParentMeta, FAMILY_PATH } from "@/lib/family-core";

/**
 * Read-only school administration (/schul-admin). Needs a sign-in; whether the user really administers a school is decided
 * by the database (school_admins + RLS), the page only shows what the server returns. Non school-admins are sent home.
 */
export default function Page() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) { router.replace(`/login?next=${encodeURIComponent("/schul-admin")}`); return; }
      // Only school admins belong here (FINDINGS 5). Unknown (my_access not deployed) → keep the old behaviour.
      const access = await loadMyAccess({ userId: user.id });
      if (access !== OPEN_ACCESS && access.role !== "school_admin") {
        const { role } = await loadMyRole(user);
        router.replace(role === "student" && isParentMeta(user.user_metadata) ? FAMILY_PATH : homeFor(role));
        return;
      }
      if (alive) setReady(true);
    })().catch(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [router]);
  if (!ready) return <main className="workspace-bg flex min-h-[100dvh] items-center justify-center" aria-busy="true"><p role="status" className="text-sm text-muted">Dein Bereich wird geladen …</p></main>;
  return (
    <WorkspaceShell active="Schuladministration">
      <SchoolAdminView />
    </WorkspaceShell>
  );
}
