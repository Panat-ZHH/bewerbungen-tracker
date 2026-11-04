"use client";

import { useEffect, useState } from "react";
import { EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { getClassStudentApplications } from "@/lib/classes";
import { statusLabels } from "@/lib/utils";
import type { ClassStudentApplication, ClassStudentOverview } from "@/types";
import { STATUS_COLORS, errorMessage, formatDate } from "./shared";

export function StudentDrilldown({ classId, student, onClose }: { classId: string; student: ClassStudentOverview | null; onClose: () => void }) {
  const [state, setState] = useState<{ id: string; apps?: ClassStudentApplication[]; hidden?: boolean; error?: string } | null>(null);
  const studentId = student?.studentId;

  useEffect(() => {
    if (!studentId) return;
    let alive = true;
    getClassStudentApplications(classId, studentId)
      .then((r) => { if (alive) setState({ id: studentId, apps: r.applications, hidden: r.hidden }); })
      .catch((e) => { if (alive) setState({ id: studentId, error: errorMessage(e) }); });
    return () => { alive = false; };
  }, [classId, studentId]);

  const current = state && state.id === studentId ? state : null;
  const sorted = [...(current?.apps ?? [])].sort((a, b) => (b.appliedAt ?? b.createdAt).localeCompare(a.appliedAt ?? a.createdAt));

  return (
    <Modal open={!!student} onClose={onClose} title={student ? student.displayName : ""} description="Bewerbungen (ohne Notizen, Gehalt und Lebensläufe)">
      {!current && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-[var(--radius-md)]" />)}</div>}
      {current?.error && <p role="alert" className="text-small text-[var(--danger-fg)]">{current.error}</p>}
      {current?.hidden && <EmptyState icon={<EyeOff size={24} />} title="Teilt keine Daten" description="Diese Person hat die Freigabe für die Klasse deaktiviert." />}
      {current && !current.error && !current.hidden && sorted.length === 0 && <EmptyState title="Noch keine Bewerbungen" />}
      {sorted.length > 0 && (
        <ul className="space-y-2">
          {sorted.map((a) => (
            <li key={a.id} className="rounded-[var(--radius-md)] border border-[var(--line)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{a.company}</p><p className="text-small truncate text-muted">{a.position}{a.location ? ` · ${a.location}` : ""}</p></div>
                <Badge className="shrink-0"><span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[a.status] }} />{statusLabels[a.status]}</Badge>
              </div>
              <p className="text-small mt-1.5 text-muted">{a.appliedAt ? `Beworben am ${formatDate(a.appliedAt)}` : `Angelegt am ${formatDate(a.createdAt)}`}{a.deadline ? ` · Frist ${formatDate(a.deadline)}` : ""}</p>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
