"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { ClassesPage } from "@/components/classes/classes-page";
import { StudentClassExtras } from "@/components/teacher/student-class-extras";
import { Skeleton } from "@/components/ui/skeleton";
import { TEACHER_HOME, loadMyRole } from "@/lib/role";
import { supabase } from "@/lib/supabase";
import type { UserRole } from "@/types";

/** /classes is the student page. Teachers have /teacher (overview, classes, students), so they are redirected there. */
export default function Page() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { if (alive) setRole("student"); return; } // the shell sends logged-out users to /login
      const resolved = (await loadMyRole(data.user)).role;
      if (resolved === "teacher") { router.replace(TEACHER_HOME); return; }
      if (alive) setRole(resolved);
    })().catch(() => { if (alive) setRole("student"); });
    return () => { alive = false; };
  }, [router]);

  return (
    <WorkspaceShell active="Klassen">
      {role === null ? <Skeleton className="h-40 rounded-[var(--radius-lg)]" /> : (
        <div className="space-y-10">
          <ClassesPage />
          {role === "student" && <StudentClassExtras />}
        </div>
      )}
    </WorkspaceShell>
  );
}
