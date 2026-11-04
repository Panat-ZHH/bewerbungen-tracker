"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getMySocialProfile } from "@/lib/social";
import type { UserRole } from "@/types";
import { StudentClasses } from "./student-classes";
import { TeacherClasses } from "./teacher-classes";

/** Resolves the current user's role and renders the matching view. */
export function ClassesPage() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    getMySocialProfile().then((p) => { if (alive) { setRole(p.role); setFailed(false); } }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [attempt]);

  if (failed) return <div role="alert" className="status status-danger flex items-center justify-between gap-3 rounded-[var(--radius-md)] p-3 text-sm"><span>Dein Profil konnte nicht geladen werden.</span><Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>Erneut versuchen</Button></div>;
  if (!role) return <div className="space-y-4"><Skeleton className="h-16 w-2/3 rounded-[var(--radius-lg)]" /><Skeleton className="h-40 rounded-[var(--radius-lg)]" /></div>;
  return role === "teacher" ? <TeacherClasses /> : <StudentClasses />;
}
