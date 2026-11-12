"use client";

import { useEffect, useState } from "react";
import { EyeOff, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { getClassStudentApplications, removeClassStudent } from "@/lib/classes";
import { shownName } from "@/lib/profile-names";
import type { ClassStudentApplication, ClassStudentOverview } from "@/types";
import { AliasEditor } from "./alias-editor";
import { errorMessage, formatDate } from "./shared";

export function StudentDrilldown({ classId, student, alias, onAlias, onClose, onRemoved }: { classId: string; student: ClassStudentOverview | null; alias?: string; onAlias?: (alias: string) => void; onClose: () => void; onRemoved: () => void }) {
  const [state, setState] = useState<{ id: string; apps?: ClassStudentApplication[]; hidden?: boolean; error?: string } | null>(null);
  const studentId = student?.studentId;
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");
  async function remove() {
    if (!studentId) return;
    setRemoving(true); setRemoveError("");
    try { await removeClassStudent(classId, studentId); setConfirming(false); onRemoved(); } catch (e) { setRemoveError(errorMessage(e)); } finally { setRemoving(false); }
  }

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
    <Modal open={!!student} onClose={() => { setConfirming(false); setRemoveError(""); onClose(); }} title={student ? shownName({ alias, displayName: student.displayName }) : ""} description="Bewerbungen (ohne Notizen, Gehalt und Lebensläufe)">
      {!current && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-[var(--radius-md)]" />)}</div>}
      {current?.error && <p role="alert" className="text-small text-[var(--danger-fg)]">{current.error}</p>}
      {current?.hidden && <EmptyState icon={<EyeOff size={24} />} title="Teilt keine Daten" description="Diese Person hat die Freigabe für die Klasse deaktiviert." />}
      {current && !current.error && !current.hidden && sorted.length === 0 && <EmptyState title="Noch keine Bewerbungen" />}
      {sorted.length > 0 && (
        <ul className="rows border-y-[length:var(--border-w)] border-[var(--outline)]">
          {sorted.map((a) => (
            <li key={a.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="truncate text-sm font-bold">{a.company}</p><p className="text-small truncate text-muted">{a.position}{a.location ? ` · ${a.location}` : ""}</p></div>
                <StatusBadge status={a.status} className="shrink-0" />
              </div>
              <p className="text-small mt-1 text-muted">{a.appliedAt ? `Beworben am ${formatDate(a.appliedAt)}` : `Angelegt am ${formatDate(a.createdAt)}`}{a.deadline ? ` · Frist ${formatDate(a.deadline)}` : ""}</p>
            </li>
          ))}
        </ul>
      )}
      {student && onAlias && <div className="mt-5 border-t-[1.5px] border-dashed border-[var(--line)] pt-4"><AliasEditor key={student.studentId} classId={classId} studentId={student.studentId} realName={shownName({ displayName: student.displayName })} alias={alias} onSaved={onAlias} /></div>}
      <div className="mt-4 border-t-[1.5px] border-dashed border-[var(--line)] pt-3">
        {confirming ? (
          <div className="space-y-2">
            <p className="text-small">Aus der Klasse entfernen? Du siehst die Bewerbungen danach nicht mehr. Die Person kann mit dem Code wieder beitreten.</p>
            {removeError && <p role="alert" className="text-small text-[var(--danger-fg)]">{removeError}</p>}
            <div className="flex flex-wrap gap-2"><Button size="sm" className="min-h-11 sm:min-h-11" variant="ghost" onClick={() => setConfirming(false)}>Abbrechen</Button><Button size="sm" className="min-h-11 sm:min-h-11" variant="danger" loading={removing} onClick={remove}>Entfernen</Button></div>
          </div>
        ) : <Button size="sm" className="min-h-11 sm:min-h-11" variant="ghost" icon={<UserMinus size={14} />} onClick={() => setConfirming(true)}>Aus Klasse entfernen</Button>}
      </div>
    </Modal>
  );
}
