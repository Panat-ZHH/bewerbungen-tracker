"use client";

import { useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { clearPendingInvite, readPendingInviteEntry } from "@/components/friends/shared";
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
  const [waiting, setWaiting] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser storage after mount
  useEffect(() => { const entry = readPendingInviteEntry(); setWaiting(entry?.kind === "class" ? entry.code : null); }, []);

  useEffect(() => {
    let alive = true;
    getMySocialProfile().then((p) => { if (alive) { setRole(p.role); setFailed(false); } }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [attempt]);

  if (failed) return <div role="alert" className="status status-danger flex items-center justify-between gap-3 text-sm"><span>Dein Profil konnte nicht geladen werden.</span><Button size="sm" variant="secondary" className="min-h-11 sm:min-h-11" onClick={() => setAttempt((n) => n + 1)}>Erneut versuchen</Button></div>;
  if (!role) return <div className="space-y-4"><Skeleton className="h-16 w-2/3 rounded-[var(--radius-lg)]" /><Skeleton className="h-40 rounded-[var(--radius-lg)]" /></div>;
  if (role === "teacher") return <TeacherClasses />;
  return (
    <div className="space-y-6">
      {waiting && (
        <Card className="animate-rise flex flex-wrap items-center justify-between gap-3 bg-[var(--sun-soft)] p-4">
          <p className="text-body font-semibold">Du hast eine Klasseneinladung geöffnet. Möchtest du jetzt beitreten?</p>
          <div className="flex gap-2"><Button variant="ghost" size="sm" className="min-h-11 sm:min-h-11" onClick={() => { clearPendingInvite(); setWaiting(null); }}>Verwerfen</Button><ButtonLink size="sm" className="min-h-11 sm:min-h-11" href={`/classes/join/${encodeURIComponent(waiting)}`}>Zur Einladung</ButtonLink></div>
        </Card>
      )}
      <StudentClasses />
    </div>
  );
}
