"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, EyeOff, HandHelping, LifeBuoy, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { studentLabel } from "@/lib/teacher-extras";
import { getClassOverview, type ClassOverview } from "@/lib/b2b/client";
import { ErrorBanner, relativeDays, teacherError } from "@/components/teacher/shared";
import { PROGRESS_STEPS, progressStep, share, supportList, supportText, type OverviewStudent } from "./logic";
import { ProgressBar } from "./progress-bar";

/**
 * Teacher class overview: class statistics, "Wer braucht Unterstützung" and one line per student with non-confidential
 * counts only (never companies, positions, notes or documents). Progress is the furthest meaningful step, not the volume.
 */
export function ClassOverviewPanel({ classId }: { classId: string }) {
  const [data, setData] = useState<ClassOverview | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => { getClassOverview(classId).then((d) => { setData(d); setError(""); }).catch((e) => setError(teacherError(e))); }, [classId]);
  useEffect(() => { load(); }, [load]);

  const support = useMemo(() => (data ? supportList(data.students) : []), [data]);
  const sorted = useMemo(() => (data ? [...data.students].sort((a, b) => Number(a.hidden) - Number(b.hidden) || Number(b.needsSupport) - Number(a.needsSupport) || studentLabel(a.displayName).localeCompare(studentLabel(b.displayName), "de")) : []), [data]);

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!data) return <div className="space-y-3" aria-busy="true"><Skeleton className="h-28 rounded-[var(--radius-lg)]" /><Skeleton className="h-40 rounded-[var(--radius-lg)]" /></div>;
  const a = data.aggregates;
  const stats = [
    { label: "Mindestens eine Bewerbung verschickt", value: a.withApplication, tone: "brand" as const },
    { label: "Vorstellungsgespräch erhalten", value: a.withInterview, tone: "coral" as const },
    { label: "Schnupperlehre gemacht oder geplant", value: a.withTrialDay, tone: "mint" as const },
    { label: "Lehrstelle gefunden", value: a.placed, tone: "sun" as const },
  ];

  return (
    <div className="space-y-10">
      <section aria-labelledby="b2b-stats-h">
        <h2 id="b2b-stats-h" className="text-heading">Klassenstatistik</h2>
        <p className="text-small mt-1 max-w-2xl text-muted">Anteil der {a.sharing} {a.sharing === 1 ? "Person, die ihre Daten teilt" : "Personen, die ihre Daten teilen"}{a.students > a.sharing ? ` (${a.students - a.sharing} teilen nicht)` : ""}. Gezählt werden Schritte, nicht die Menge an Bewerbungen.</p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="flex items-baseline justify-between gap-3 text-sm font-semibold"><span className="min-w-0 [overflow-wrap:anywhere]">{s.label}</span><span className="tabular shrink-0 text-muted">{s.value} von {a.sharing} · {share(s.value, a.sharing)} %</span></dt>
              <dd className="mt-1.5"><ProgressBar value={s.value} max={Math.max(1, a.sharing)} tone={s.tone} label={s.label} valueText={`${s.value} von ${a.sharing}, ${share(s.value, a.sharing)} Prozent`} /></dd>
            </div>
          ))}
        </dl>
        <p className="text-small mt-3 text-muted">In den letzten 14 Tagen aktiv: <span className="tabular font-semibold text-[var(--ink)]">{a.activeLast14} von {a.sharing}</span></p>
      </section>

      <section aria-labelledby="b2b-support-h">
        <h2 id="b2b-support-h" className="text-heading flex items-center gap-2"><LifeBuoy size={19} strokeWidth={2.2} className="text-[var(--warning-fg)]" aria-hidden /> Wer braucht Unterstützung {support.length > 0 && <Badge tone="warning">{support.length}</Badge>}</h2>
        {support.length === 0 ? (
          <p className="text-small mt-2 flex items-center gap-2 text-muted"><CheckCircle2 size={17} className="shrink-0 text-[var(--success-fg)]" aria-hidden /> Im Moment braucht niemand besondere Unterstützung.</p>
        ) : (
          <ul className="rows mt-3" aria-label="Schüler:innen, die Unterstützung brauchen">
            {support.map((s) => (
              <li key={s.studentId}>
                <Link href={`/teacher/classes/${classId}/students/${s.studentId}`} className="row-link flex-wrap justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0"><p className="truncate text-sm font-bold">{studentLabel(s.displayName)}</p><p className="text-small text-muted [overflow-wrap:anywhere]">{s.reasons.map(supportText).join(" · ") || "Braucht Unterstützung"}</p></div>
                  {s.reasons.includes("self_report") && <Badge tone="info"><HandHelping size={12} className="mr-1" aria-hidden />Eigene Meldung</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="b2b-students-h">
        <h2 id="b2b-students-h" className="text-heading">Fortschritt pro Person</h2>
        <p className="text-small mt-1 flex items-start gap-2 text-muted"><ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden /> Hier stehen nur Zahlen und Schritte. Firmen, Stellen, Notizen und Dokumente bleiben privat.</p>
        <ul className="rows mt-3 border-y-[length:var(--border-w)] border-[var(--outline)]" aria-label="Fortschritt der Schüler:innen">
          {sorted.map((s) => <StudentLine key={s.studentId} s={s} classId={classId} />)}
        </ul>
      </section>
    </div>
  );
}

function StudentLine({ s, classId }: { s: OverviewStudent; classId: string }) {
  const name = studentLabel(s.displayName);
  const step = progressStep(s);
  return (
    <li>
      <Link href={`/teacher/classes/${classId}/students/${s.studentId}`} className="row-link group flex-wrap gap-x-5 gap-y-2 py-3">
        <div className="min-w-0 flex-1 basis-48">
          <p className="truncate text-[15px] font-bold">{name}</p>
          {s.hidden ? (
            <p className="text-small flex items-center gap-1.5 text-muted"><EyeOff size={13} aria-hidden /> Teilt keine Daten</p>
          ) : (
            <p className="text-small text-muted">{PROGRESS_STEPS[step]} · {relativeDays(s.lastActivity)}</p>
          )}
          {s.needsSupport && <span className="mt-1.5 flex max-w-full"><Badge tone="warning" className="max-w-full whitespace-normal [overflow-wrap:anywhere]" title={s.reasons.map(supportText).join(", ")}>Braucht Unterstützung: {s.reasons.length ? supportText(s.reasons[0]) : "ja"}</Badge></span>}
        </div>
        {!s.hidden && (
          <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 sm:w-[24rem] sm:flex-nowrap">
            <div className="min-w-20 flex-1 basis-40 sm:basis-auto"><ProgressBar size="sm" value={step} max={4} tone={step >= 4 ? "sun" : step >= 2 ? "mint" : "brand"} label={`Fortschritt von ${name}`} valueText={`Schritt ${step} von 4: ${PROGRESS_STEPS[step]}`} /></div>
            <dl className="tabular flex min-w-0 flex-wrap gap-3 text-xs sm:shrink-0">
              <div className="flex flex-col-reverse items-center"><dt className="text-muted">Verschickt</dt><dd className="font-bold">{s.applications}</dd></div>
              <div className="flex flex-col-reverse items-center"><dt className="text-muted">Gespräche</dt><dd className="font-bold">{s.interviews}</dd></div>
              <div className="flex flex-col-reverse items-center"><dt className="text-muted">Schnuppern</dt><dd className="font-bold">{s.trialDays}</dd></div>
            </dl>
          </div>
        )}
        <ChevronRight size={18} strokeWidth={2.4} className="ml-auto shrink-0" aria-hidden />
      </Link>
    </li>
  );
}
