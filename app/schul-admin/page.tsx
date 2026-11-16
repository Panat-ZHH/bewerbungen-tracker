"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { SchoolAdminView } from "@/components/b2b/school-admin";
import { supabase } from "@/lib/supabase";

/**
 * Read-only school administration (/schul-admin). Needs a sign-in; whether the user really administers a school is decided
 * by the database (school_admins + RLS), the page only shows what the server returns.
 */
export default function Page() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace(`/login?next=${encodeURIComponent("/schul-admin")}`); return; }
      if (alive) setReady(true);
    }).catch(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [router]);
  if (!ready) return <main className="workspace-bg flex min-h-[100dvh] items-center justify-center" aria-busy="true"><p role="status" className="text-sm text-muted">Dein Bereich wird geladen …</p></main>;
  return (
    <WorkspaceShell active="Schuladministration">
      <SchoolAdminView />
    </WorkspaceShell>
  );
}
