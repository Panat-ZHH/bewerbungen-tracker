"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, EyeOff, Lock, ShieldCheck, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/lib/toast";
import { Avatar } from "@/components/ui/avatar";
import { useAvatarUrls } from "@/components/ui/use-avatars";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBar } from "@/components/classes/shared";
import { buildApplicationCards, formatDateCh, studentLabel, todayIso, type ApplicationCard, type DeadlineState } from "@/lib/teacher-extras";
import { getStudentApplications, logStudentView } from "@/lib/teacher-more";
import { statusLabels } from "@/lib/utils";
import type { ApplicationStatus } from "@/types";
import { getTeacherClassStudents, removeClassStudent, type TeacherStudent } from "./api";
import { ErrorBanner, TeacherNotFound, isPermanentTeacherError, relativeDays, teacherError } from "./shared";

const DEADLINE_TEXT: Record<DeadlineState, string> = { done: "eingehalten", open: "offen", overdue: "verpasst" };
// A missed deadline is a hint for a talk, not an error: warning tone, never red.
const DEADLINE_TONE: Record<DeadlineState, "success" | "info" | "warning"> = { done: "success", open: "info", overdue: "warning" };
// Status of an application in the badge colours of the system (a rejection stays calm sand). Unknown statuses fall back to blue.
const toneOf = (status: string | null) => (status && status in statusTone ? statusTone[status as ApplicationStatus] : "info");

export function StudentTimelineView({ classId, studentId }: { classId: string; studentId: string }) {
  const [student, setStudent] = useState<TeacherStudent | null>(null);
  const [cards, setCards] = useState<ApplicationCard[] | null>(null);
  const [tlHidden, setTlHidden] = useState(false);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const router = useRouter();
  const avatars = useAvatarUrls([studentId]);
  const load = useCallback(() => {
    Promise.all([getTeacherClassStudents(classId), getStudentApplications(classId, studentId)])
      .then(([list, apps]) => {
        const found = list.find((s) => s.studentId === studentId) ?? null;
        setStudent(found); setMissing(!found);
        setCards(buildApplicationCards(apps.applications, todayIso(), (status) => (statusLabels as Record<string, string>)[status]));
        setTlHidden(apps.hidden); setError("");
        // Audit trail: the student can see that a teacher looked at their profile (once per day and teacher).
        void logStudentView(classId, studentId).catch(() => undefined);
      })
      .catch((e) => { if (isPermanentTeacherError(e)) setMissing(true); else setError(teacherError(e)); });
  }, [classId, studentId]);
  useEffect(() => { load(); }, [load]);

  async function confirmRemove() {
    setBusy(true); setRemoveError("");
    try { await removeClassStudent(classId, studentId); toast({ message: `${studentLabel(student?.displayName)} wurde aus der Klasse entfernt.`, tone: "success" }); router.replace(`/teacher/classes/${classId}`); }
    catch (e) { setRemoveError(teacherError(e)); } finally { setBusy(false); }
  }

  const hidden = (student?.hidden ?? false) || tlHidden;
  const events = cards;
  const name = studentLabel(student?.displayName);

  return (
    <div className="space-y-6">
      <Link href={`/teacher/classes/${classId}`} className="text-small -mb-4 inline-flex min-h-11 items-center gap-1.5 font-semibold text-muted hover:text-[var(--ink)]"><ArrowLeft size={14} aria-hidden /> Zurück zur Klasse</Link>
      {missing ? <TeacherNotFound title="Schüler:in nicht gefunden" text="Diese Person ist nicht (mehr) in der Klasse oder die Klasse gehört nicht zu deinen Klassen." /> : <>
      <PageHeader title={student ? <span className="flex items-center gap-3"><Avatar name={student.displayName || name} src={avatars[studentId]} size="lg" className="shadow-[var(--shadow-sm)]" />{name}</span> : "Schülerprofil"} description={student && !hidden ? `${student.total} ${student.total === 1 ? "Bewerbung" : "Bewerbungen"} · Zuletzt aktiv: ${relativeDays(student.lastActivity)}` : undefined} />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {!events && !error && <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-[var(--radius-lg)]" />)}</div>}

      {events && hidden && (
        <div className="panel flex max-w-2xl gap-4 p-4 sm:p-5" role="status">
          <EyeOff size={24} strokeWidth={2.2} className="mt-0.5 shrink-0" aria-hidden />
          <div className="space-y-1.5"><h2 className="text-heading">Diese Person teilt keine Bewerbungsdaten</h2><p className="text-body text-muted">{student ? name : "Die Person"} hat die Freigabe für diese Klasse ausgeschaltet. Du siehst nur den Namen. Die Einstellung liegt bei der Schülerin oder dem Schüler und kann jederzeit geändert werden. Ein persönliches Gespräch ist der beste Weg, um nachzufragen.</p></div>
        </div>
      )}

      {events && !hidden && student && (
        <>
          <div className="max-w-3xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Only reached stages, no zero badges in warning colours (lehrperson-22). */}
              {student.interviews > 0 && <Badge tone="coral">{student.interviews} {student.interviews === 1 ? "Gespräch" : "Gespräche"}</Badge>}{student.offers > 0 && <Badge tone="success">{student.offers} {student.offers === 1 ? "Zusage" : "Zusagen"}</Badge>}
              {student.schnupper > 0 && <Badge tone="info">{student.schnupper} Schnupperlehre{student.schnupper === 1 ? "" : "n"}</Badge>}{student.placed && student.offers === 0 && <Badge tone="success">Lehrvertrag</Badge>}{student.inactive && <Badge tone="warning">Inaktiv</Badge>}
            </div>
            <StatusBar counts={student.statusCounts} total={student.total} legend />
          </div>
          {cards && cards.length === 0
            ? <EmptyState icon={<ShieldCheck size={24} />} title="Noch keine geteilten Bewerbungen" description="Sobald die Person Bewerbungen erfasst, erscheint hier der Verlauf." />
            : (
              <ol className="rows max-w-3xl border-y-[length:var(--border-w)] border-[var(--outline)]" aria-label="Bewerbungen">
                {cards?.map((c) => (
                  <li key={c.id} className="space-y-3 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0"><h2 className="font-display truncate text-xl font-extrabold tracking-[-.02em]">{c.company}</h2>{c.position && <p className="text-small truncate text-muted">{c.position}</p>}</div>
                      {c.statusLabel && <Badge tone={c.waiting ? "warning" : toneOf(c.status)}>{c.statusLabel}</Badge>}
                    </div>
                    {c.age && <p className={`text-sm font-semibold ${c.waiting ? "text-[var(--warning-fg)]" : ""}`}>{c.age}</p>}
                    <ol className="relative ml-1.5 space-y-2.5 border-l-2 border-dashed border-[var(--outline)] pl-5" aria-label={`Stationen ${c.company}`}>
                      {c.stages.map((st, i) => (
                        <li key={`${st.key}-${i}`} className="relative">
                          <span className={`absolute -left-[1.72rem] top-1 h-3 w-3 rounded-full border-[length:var(--border-w)] border-[var(--outline)] ${i === c.stages.length - 1 ? "bg-[var(--sun)]" : "bg-[var(--paper)]"}`} aria-hidden />
                          <div className="flex flex-wrap items-center gap-2"><span className="text-small font-bold">{st.label}</span>{st.deadlineState && <Badge tone={DEADLINE_TONE[st.deadlineState]}>{DEADLINE_TEXT[st.deadlineState]}</Badge>}<span className="text-small tabular text-muted">{formatDateCh(st.date)}</span></div>
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ol>
            )}
        </>
      )}

      {events && (
        <aside className="flex max-w-3xl gap-3 rounded-[var(--radius-lg)] bg-[var(--info-bg)] p-4 text-[var(--info-fg)]" aria-label="Datenschutzhinweis">
          <Lock size={18} strokeWidth={2.2} className="mt-0.5 shrink-0" aria-hidden />
          <p className="text-small">Du siehst nur Firma, Stelle, Status und Daten, die die Person für die Klasse freigibt. Notizen, Gehalt, Kontakte, Dokumente, Lebenslauf und Links bleiben privat und sind für Lehrpersonen nie sichtbar.</p>
        </aside>
      )}

      {events && student && (
        <section className="max-w-3xl border-t-[1.5px] border-dashed border-[var(--line)] pt-5" aria-label="Aus der Klasse entfernen">
          <Button variant="ghost" className="min-h-11 sm:min-h-11" icon={<UserMinus size={15} />} onClick={() => { setRemoving(true); setRemoveError(""); }}>Aus der Klasse entfernen</Button>
        </section>
      )}
      <Modal open={removing} onClose={() => setRemoving(false)} title="Aus der Klasse entfernen?" description={`${name} wird aus der Klasse entfernt. Die Bewerbungen der Person bleiben unverändert. Mit dem Klassencode kann sie wieder beitreten.`}>
        <div className="space-y-4">
          {removeError && <p role="alert" className="text-small text-[var(--danger-fg)]">{removeError}</p>}
          <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" data-autofocus onClick={() => setRemoving(false)}>Abbrechen</Button><Button variant="danger" loading={busy} onClick={() => void confirmRemove()}>Entfernen</Button></div>
        </div>
      </Modal>
      </>}
    </div>
  );
}
