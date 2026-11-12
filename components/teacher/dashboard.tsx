"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Archive, CalendarClock, ChevronRight, GraduationCap, Plus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Figures } from "@/components/ui/figures";
import { dashboardMode } from "@/lib/teacher-extras";
import { AttentionPanel } from "./attention-panel";
import { Segmented } from "@/components/ui/tabs";
import { createClass, getTeacherDashboard, type TeacherDashboard } from "./api";
import { ClassPath, ErrorBanner, teacherError } from "./shared";
import { formatDate } from "@/components/classes/shared";

export function TeacherDashboardView() {
  const router = useRouter();
  const [data, setData] = useState<TeacherDashboard | null>(null);
  const [error, setError] = useState("");
  const [showArchived, setShowArchived] = useState<"active" | "archived">("active");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(() => { getTeacherDashboard().then((d) => { setData(d); setError(""); }).catch((e) => setError(teacherError(e))); }, []);
  useEffect(() => { load(); }, [load]);

  const active = useMemo(() => (data?.classes ?? []).filter((c) => !c.archived), [data]);
  const archived = useMemo(() => (data?.classes ?? []).filter((c) => c.archived), [data]);
  const shown = showArchived === "active" ? active : archived;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setFormError("Bitte gib einen Klassennamen ein."); return; }
    setSaving(true); setFormError("");
    try { const created = await createClass(name.trim(), year.trim()); setOpen(false); setName(""); setYear(""); router.push(`/teacher/classes/${created.id}`); }
    catch (e) { setFormError(teacherError(e)); } finally { setSaving(false); }
  }

  const t = data?.totals;
  const mode = data && t ? dashboardMode(t, data.classes.filter((c) => !c.archived).length) : "normal";
  const firstClass = (data?.classes ?? []).find((c) => !c.archived);
  return (
    <div>
      <PageHeader title="Übersicht" description="So weit sind deine Klassen mit der Lehrstellensuche. Es zählen nur Schülerinnen und Schüler, die ihre Daten teilen." actions={<Button className="min-h-11 sm:min-h-11" icon={<Plus size={16} />} onClick={() => setOpen(true)}>Klasse erstellen</Button>} />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {!data && !error && <div className="space-y-3"><Skeleton className="h-24 rounded-[var(--radius-lg)]" />{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-[var(--radius-lg)]" />)}</div>}
      {data && t && (
        <div className="space-y-10">
          {mode === "no-students" && firstClass && (
            <EmptyState icon={<Users size={26} />} title="Noch niemand in deinen Klassen" description="Sobald sich Schülerinnen und Schüler mit dem Code oder Link anmelden, siehst du hier ihren Fortschritt. Nächster Schritt: die Klasse einladen." action={<ButtonLink href={`/teacher/classes/${firstClass.id}?tab=invite`} variant="sun" className="max-w-full"><span className="truncate">Klasse «{firstClass.name}» einladen</span></ButtonLink>} />
          )}
          {mode === "no-applications" && (
            <div className="space-y-4">
              <Figures label="Kennzahlen" items={[{ label: "Schüler:innen", value: t.students, hint: t.hiddenStudents ? `${t.hiddenStudents} teilen nicht` : undefined }, { label: "Bewerbungen", value: t.applications, hint: "Noch keine geteilt" }]} />
              <p className="text-small max-w-2xl text-muted">Noch hat niemand eine Bewerbung erfasst oder geteilt. Die Kennzahlen erscheinen, sobald die ersten Bewerbungen da sind. Du kannst die Klasse mit einer Mitteilung ans Starten erinnern.</p>
            </div>
          )}
          {mode === "normal" && (
            <ClassPath
              label="Kennzahlen"
              students={t.students}
              studentsHint={t.hiddenStudents ? `${t.hiddenStudents} teilen nicht` : undefined}
              stages={[{ label: "Bewerbungen", value: t.applications, fill: "brand" }, { label: "Gespräche", value: t.interviews, fill: "coral" }, { label: "Zusagen", value: t.offers, fill: "mint" }, { label: "Lehrstelle gefunden", short: "Lehrstelle", value: t.placed, fill: "sun" }]}
              note={<>
                {t.inactive ? <><Badge tone="warning">{t.inactive} inaktiv</Badge><span className="mr-2">seit 14+ Tagen ohne Aktivität</span></> : <Badge tone="success">Alle sind aktiv</Badge>}
                {t.students > 0 && <span>Lehrstelle gefunden: {Math.round((t.placed / t.students) * 100)} % der Schüler:innen</span>}
              </>}
            />
          )}

          {mode !== "no-class" && mode !== "no-students" && <AttentionPanel />}

          <section aria-label="Klassen">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-heading">Klassen</h2>
              <Segmented className="[&_button]:min-h-11" label="Klassen anzeigen" value={showArchived} onChange={setShowArchived} options={[{ value: "active", label: "Aktiv", count: active.length }, { value: "archived", label: "Archiv", icon: <Archive size={13} />, count: archived.length }]} />
            </div>
            {data.classes.length === 0 && <EmptyState className="mt-3" icon={<GraduationCap size={26} />} title="Noch keine Klasse" description="Erstelle deine erste Klasse und lade dann deine Schülerinnen und Schüler per Link, Code oder QR-Code ein." action={<Button className="min-h-11 sm:min-h-11" icon={<Plus size={16} />} onClick={() => setOpen(true)}>Klasse erstellen</Button>} />}
            {data.classes.length > 0 && shown.length === 0 && <EmptyState className="mt-3" icon={<Archive size={24} />} title={showArchived === "archived" ? "Das Archiv ist leer" : "Alle Klassen sind archiviert"} description={showArchived === "archived" ? "Archivierte Klassen erscheinen hier. Ihre Daten bleiben erhalten." : "Wechsle zum Archiv, um eine Klasse wieder zu aktivieren."} />}
            {shown.length > 0 && (
              <ul className="rows mt-3 border-y-[length:var(--border-w)] border-[var(--outline)]">
                {shown.map((c) => (
                  <li key={c.id}>
                    <Link href={`/teacher/classes/${c.id}`} className="row-link group flex-wrap gap-x-6 gap-y-2 py-4">
                      <div className="min-w-0 flex-1 basis-56">
                        <h3 className="font-display truncate text-xl font-extrabold tracking-[-.02em] group-hover:underline group-hover:decoration-[var(--sun)] group-hover:decoration-4 group-hover:underline-offset-4">{c.name}</h3>
                        <p className="text-small mt-0.5 text-muted">{c.schoolYear ? `Schuljahr ${c.schoolYear} · ` : ""}{c.students} {c.students === 1 ? "Schüler:in" : "Schüler:innen"}{!c.isOwner && " · Co-Lehrperson"}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {c.inactive > 0 ? <Badge tone="warning">{c.inactive} inaktiv</Badge> : c.students > 0 ? <Badge tone="success">Alle aktiv</Badge> : <Badge>Noch keine Schüler:innen</Badge>}
                          {c.hidden > 0 && <Badge>{c.hidden} teilen nicht</Badge>}
                          {c.archived && <Badge tone="info">Archiviert</Badge>}
                        </div>
                      </div>
                      <dl className="tabular flex shrink-0 gap-x-5 sm:gap-x-7">
                        {[["Bewerb.", c.applications], ["Gespräche", c.interviews], ["Zusagen", c.offers], ["Lehrstelle", c.placed]].map(([label, value]) => (
                          <div key={label} className="flex flex-col-reverse"><dt className="text-small text-muted">{label}</dt><dd className="font-display text-2xl font-extrabold leading-none">{value}</dd></div>
                        ))}
                      </dl>
                      <ChevronRight size={20} strokeWidth={2.4} className="ml-auto shrink-0 transition-transform group-hover:translate-x-1" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Anstehende Fristen">
            <h2 className="text-heading">Anstehende Fristen <span className="text-small font-normal text-muted">(nächste 14 Tage)</span></h2>
            {data.deadlines.length === 0 ? (
              <p className="text-small mt-2 flex items-center gap-2 text-muted"><CalendarClock size={17} aria-hidden /> Keine Bewerbungsfristen in den nächsten 14 Tagen.</p>
            ) : (
              <ul className="rows mt-2">
                {data.deadlines.map((d, i) => (
                  <li key={`${d.studentId}-${d.company}-${i}`}>
                    <Link href={`/teacher/classes/${d.classId}/students/${d.studentId}`} className="row-link flex-wrap justify-between gap-x-4 gap-y-1">
                      <div className="min-w-0"><p className="truncate text-sm font-bold">{d.studentName} · {d.company}</p><p className="text-small truncate text-muted">{d.position ? `${d.position} · ` : ""}{d.className}</p></div>
                      <span className="tabular inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-[var(--warning-fg)]"><CalendarClock size={14} aria-hidden /> {formatDate(d.deadline)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Klasse erstellen" description="Danach kannst du Schülerinnen und Schüler per Link, Code, QR-Code oder E-Mail einladen.">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Klassenname" htmlFor="tc-name"><Input id="tc-name" className="text-base! sm:text-base!" data-autofocus value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. 10b Wirtschaft" maxLength={80} /></Field>
          <Field label="Schuljahr (optional)" htmlFor="tc-year"><Input id="tc-year" className="text-base! sm:text-base!" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026/27" maxLength={20} /></Field>
          {formError && <p role="alert" className="text-small text-[var(--danger-fg)]">{formError}</p>}
          <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Abbrechen</Button><Button type="submit" loading={saving}>Erstellen</Button></div>
        </form>
      </Modal>
    </div>
  );
}
