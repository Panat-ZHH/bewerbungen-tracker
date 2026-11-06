"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, EyeOff, Lock, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useAvatarUrls } from "@/components/ui/use-avatars";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatusBar, formatDate } from "@/components/classes/shared";
import { getStudentTimeline, getTeacherClassStudents, type TeacherStudent, type TimelineEvent } from "./api";
import { ErrorBanner, relativeDays, teacherError } from "./shared";

const KIND_LABEL: Record<string, string> = { created: "Erfasst", applied: "Beworben", updated: "Aktualisiert", deadline: "Frist" };
type Group = { id: string; company: string; position: string; events: TimelineEvent[] };
function group(events: TimelineEvent[]): Group[] {
  const map = new Map<string, Group>();
  events.forEach((e, i) => { const id = e.applicationId || `x${i}`; const g = map.get(id) ?? { id, company: e.company ?? "Firma nicht freigegeben", position: e.position ?? "", events: [] }; g.events.push(e); map.set(id, g); });
  const time = (e: TimelineEvent) => (e.eventDate ? new Date(e.eventDate).getTime() : 0);
  const groups = [...map.values()]; groups.forEach((g) => g.events.sort((a, b) => time(a) - time(b)));
  return groups.sort((a, b) => time(b.events[b.events.length - 1]) - time(a.events[a.events.length - 1]));
}

export function StudentTimelineView({ classId, studentId }: { classId: string; studentId: string }) {
  const [student, setStudent] = useState<TeacherStudent | null>(null);
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [tlHidden, setTlHidden] = useState(false);
  const [error, setError] = useState("");
  const avatars = useAvatarUrls([studentId]);
  const load = useCallback(() => {
    Promise.all([getTeacherClassStudents(classId), getStudentTimeline(classId, studentId)])
      .then(([list, tl]) => { setStudent(list.find((s) => s.studentId === studentId) ?? null); setEvents(tl.events); setTlHidden(tl.hidden); setError(""); })
      .catch((e) => setError(teacherError(e)));
  }, [classId, studentId]);
  useEffect(() => { load(); }, [load]);

  const hidden = (student?.hidden ?? false) || tlHidden;
  const groups = useMemo(() => (hidden ? [] : group(events ?? [])), [events, hidden]);

  return (
    <div className="space-y-6 pb-safe">
      <Link href={`/teacher/classes/${classId}`} className="text-small inline-flex min-h-11 items-center gap-1.5 text-muted hover:text-[var(--ink)]"><ArrowLeft size={14} aria-hidden /> Zurück zur Klasse</Link>
      <PageHeader eyebrow="Schülerprofil" title={<span className="flex items-center gap-3"><Avatar name={student?.displayName} src={avatars[studentId]} size="md" />{student?.displayName ?? "Schüler"}</span>} description={student && !hidden ? `${student.total} Bewerbungen · letzte Aktivität: ${relativeDays(student.lastActivity).toLowerCase()}` : undefined} />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {!events && !error && <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-[var(--radius-lg)]" />)}</div>}

      {events && hidden && (
        <Card className="flex gap-4 p-5" role="status">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--neutral-bg)] text-muted"><EyeOff size={20} aria-hidden /></span>
          <div className="space-y-1"><h2 className="text-heading">Diese Person teilt keine Bewerbungsdaten</h2><p className="text-body text-muted">{student?.displayName ?? "Die Person"} hat die Freigabe für diese Klasse ausgeschaltet. Du siehst nur den Namen. Die Einstellung liegt bei der Schülerin oder dem Schüler und kann jederzeit geändert werden. Ein persönliches Gespräch ist der beste Weg, um nachzufragen.</p></div>
        </Card>
      )}

      {events && !hidden && student && (
        <>
          <Card className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">{student.interviews} {student.interviews === 1 ? "Gespräch" : "Gespräche"}</Badge><Badge tone={student.offers ? "success" : "neutral"}>{student.offers} {student.offers === 1 ? "Zusage" : "Zusagen"}</Badge>
              {student.placed && <Badge tone="success">Lehrstelle gefunden</Badge>}{student.inactive && <Badge tone="warning">Inaktiv</Badge>}
            </div>
            <StatusBar counts={student.statusCounts} total={student.total} legend />
          </Card>
          {groups.length === 0
            ? <EmptyState icon={<ShieldCheck size={24} />} title="Noch keine geteilten Bewerbungen" description="Sobald die Person Bewerbungen erfasst, erscheint hier der Verlauf." />
            : (
              <ol className="space-y-4" aria-label="Verlauf der Bewerbungen">
                {groups.map((g) => (
                  <li key={g.id}>
                    <Card className="space-y-3 p-5">
                      <div className="min-w-0"><h2 className="text-heading truncate">{g.company}</h2>{g.position && <p className="text-small truncate text-muted">{g.position}</p>}</div>
                      <ol className="relative space-y-3 border-l-2 border-[var(--line)] pl-5">
                        {g.events.map((e, i) => (
                          <li key={i} className="relative">
                            <span className="absolute -left-[1.62rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--brand)] ring-4 ring-[var(--solid)]" aria-hidden />
                            <div className="flex flex-wrap items-center gap-2"><span className="text-small font-semibold">{KIND_LABEL[e.kind] ?? "Aktualisiert"}</span>{e.status ? <StatusBadge status={e.status} /> : null}<span className="text-small tabular text-muted">{formatDate(e.eventDate ?? undefined)}</span></div>
                          </li>
                        ))}
                      </ol>
                    </Card>
                  </li>
                ))}
              </ol>
            )}
        </>
      )}

      {events && (
        <aside className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--info-line)] bg-[var(--info-bg)] p-4 text-[var(--info-fg)]" aria-label="Datenschutzhinweis">
          <Lock size={18} className="mt-0.5 shrink-0" aria-hidden />
          <p className="text-small">Du siehst nur Firma, Stelle, Status und Daten, die die Person für die Klasse freigibt. Notizen, Gehalt, Kontakte, Dokumente, Lebenslauf und Links bleiben privat und sind für Lehrpersonen nie sichtbar.</p>
        </aside>
      )}
    </div>
  );
}
