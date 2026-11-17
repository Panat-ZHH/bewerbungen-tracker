"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { ClassDetail } from "@/components/classes/class-detail";
import { Skeleton } from "@/components/ui/skeleton";
import { loadMyRole } from "@/lib/role";
import { supabase } from "@/lib/supabase";

/** Teacher class view. Pupils (old links, bookmarks) see their classes on /classes instead of teacher copy (schueler-23). */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [teacher, setTeacher] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { if (alive) setTeacher(true); return; } // the shell sends logged-out users to /login
      const { role } = await loadMyRole(data.user);
      if (role === "student") { router.replace("/classes"); return; }
      if (alive) setTeacher(true);
    })().catch(() => { if (alive) setTeacher(true); });
    return () => { alive = false; };
  }, [router]);
  return (
    <WorkspaceShell active="Klassen">
      {teacher ? <ClassDetail classId={id} /> : <Skeleton className="h-40 rounded-[var(--radius-lg)]" />}
    </WorkspaceShell>
  );
}
