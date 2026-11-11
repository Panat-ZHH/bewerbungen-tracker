"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Archive, BriefcaseBusiness, CalendarClock, ChevronRight, GraduationCap, MessageSquare, Plus, Trophy, UserX, Users, Home } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { dashboardMode } from "@/lib/teacher-extras";
import { AttentionPanel } from "./attention-panel";
import { Segmented } from "@/components/ui/tabs";
import { createClass, getTeacherDashboard, type TeacherDashboard } from "./api";
import { ErrorBanner, teacherError } from "./shared";
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
    <div className="space-y-6 pb-safe">
      <PageHeader eyebrow="Lehrperson" title="Übersicht" description="So weit sind deine Klassen mit der Lehrstellensuche. Es zählen nur Schülerinnen und Schüler, die ihre Daten teilen." actions={<Button className="min-h-11 sm:min-h-11" icon={<Plus size={16} />} onClick={() => setOpen(true)}>Klasse erstellen</Button>} />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {!data && !error && <div className="space-y-4"><div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28 rounded-[var(--radius-lg)]" />)}</div><div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-44 rounded-[var(--radius-lg)]" />)}</div></div>}
      {data && t && (
        <>
          {mode === "no-students" && firstClass && (
            <EmptyState icon={<Users size={26} />} title="Noch niemand in deinen Klassen" description="Sobald sich Schülerinnen und Schüler mit dem Code oder Link anmelden, siehst du hier ihren Fortschritt. Nächster Schritt: die Klasse einladen." action={<Link href={`/teacher/classes/${firstClass.id}?tab=invite`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--brand)] px-5 font-semibold text-white">Klasse «{firstClass.name}» einladen</Link>} />
          )}
          {mode === "no-applications" && (
            <section aria-label="Kennzahlen" className="space-y-3">
              <div className="grid grid-cols-2 gap-3 md:max-w-xl">
                <StatTile label="Schüler:innen" value={t.students} icon={<Users size={16} />} trend={t.hiddenStudents ? `${t.hiddenStudents} teilen nicht` : undefined} />
                <StatTile label="Bewerbungen" value={t.applications} icon={<BriefcaseBusiness size={16} />} trend="Noch keine geteilt" />
              </div>
              <Card className="text-small p-4 text-muted">Noch hat niemand eine Bewerbung erfasst oder geteilt. Die Kennzahlen erscheinen, sobald die ersten Bewerbungen da sind. Du kannst die Klasse mit einer Mitteilung ans Starten erinnern.</Card>
            </section>
          )}
          {mode === "normal" && (
          <section aria-label="Kennzahlen" className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
            <StatTile label="Schüler:innen" value={t.students} icon={<Users size={16} />} trend={t.hiddenStudents ? `${t.hiddenStudents} teilen nicht` : undefined} />
            <StatTile label="Bewerbungen" value={t.applications} icon={<BriefcaseBusiness size={16} />} />
            <StatTile label="Gespräche" value={t.interviews} icon={<MessageSquare size={16} />} />
            <StatTile label="Zusagen" value={t.offers} icon={<Trophy size={16} />} tone="success" />
            <StatTile label="Lehrstelle gefunden" value={t.placed} icon={<Home size={16} />} tone="success" trend={t.students ? `${Math.round((t.placed / t.students) * 100)} % der Schüler:innen` : undefined} />
            <StatTile label="Inaktiv" value={t.inactive} icon={<UserX size={16} />} tone={t.inactive ? "danger" : "neutral"} trend={t.inactive ? "seit 14+ Tagen ohne Aktivität" : "Alle sind aktiv"} />
          </section>
          )}

          {mode !== "no-class" && mode !== "no-students" && <AttentionPanel />}

          <section className="space-y-3" aria-label="Klassen">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-heading">Klassen</h2>
              <Segmented className="[&_button]:min-h-11" label="Klassen anzeigen" value={showArchived} onChange={setShowArchived} options={[{ value: "active", label: "Aktiv", count: active.length }, { value: "archived", label: "Archiv", icon: <Archive size={13} />, count: archived.length }]} />
            </div>
            {data.classes.length === 0 && <EmptyState icon={<GraduationCap size={26} />} title="Noch keine Klasse" description="Erstelle deine erste Klasse und lade dann deine Schülerinnen und Schüler per Link, Code oder QR-Code ein." action={<Button className="min-h-11 sm:min-h-11" icon={<Plus size={16} />} onClick={() => setOpen(true)}>Klasse erstellen</Button>} />}
            {data.classes.length > 0 && shown.length === 0 && <EmptyState icon={<Archive size={24} />} title={showArchived === "archived" ? "Das Archiv ist leer" : "Alle Klassen sind archiviert"} description={showArchived === "archived" ? "Archivierte Klassen erscheinen hier. Ihre Daten bleiben erhalten." : "Wechsle zum Archiv, um eine Klasse wieder zu aktivieren."} />}
            {shown.length > 0 && (
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {shown.map((c) => (
                  <li key={c.id}>
                    <Link href={`/teacher/classes/${c.id}`} className="card-interactive panel group block h-full space-y-4 rounded-[var(--radius-lg)] p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-heading truncate">{c.name}</h3>
                          <p className="text-small text-muted">{c.schoolYear ? `Schuljahr ${c.schoolYear} · ` : ""}{c.students} {c.students === 1 ? "Schüler:in" : "Schüler:innen"}{!c.isOwner && " · Co-Lehrperson"}</p>
                        </div>
                        <ChevronRight size={18} className="mt-1 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </div>
                      <dl className="tabular grid grid-cols-4 gap-2 text-center">
                        {[["Bewerb.", c.applications], ["Gespräche", c.interviews], ["Zusagen", c.offers], ["Lehrstelle", c.placed]].map(([label, value]) => (
                          <div key={label} className="rounded-[var(--radius-md)] bg-[var(--neutral-bg)] px-1 py-2"><dd className="text-lg font-bold leading-none">{value}</dd><dt className="text-small mt-1 text-muted">{label}</dt></div>
                        ))}
                      </dl>
                      <div className="flex flex-wrap gap-2">
                        {c.inactive > 0 ? <Badge tone="warning">{c.inactive} inaktiv</Badge> : c.students > 0 ? <Badge tone="success">Alle aktiv</Badge> : <Badge>Noch keine Schüler:innen</Badge>}
                        {c.hidden > 0 && <Badge>{c.hidden} teilen nicht</Badge>}
                        {c.archived && <Badge tone="info">Archiviert</Badge>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3" aria-label="Anstehende Fristen">
            <h2 className="text-heading">Anstehende Fristen <span className="text-small font-normal text-muted">(nächste 14 Tage)</span></h2>
            {data.deadlines.length === 0 ? (
              <Card className="flex items-center gap-3 p-4 text-small text-muted"><CalendarClock size={18} aria-hidden /> Keine Bewerbungsfristen in den nächsten 14 Tagen.</Card>
            ) : (
              <Card className="divide-y divide-[var(--line)] overflow-hidden">
                <ul>
                  {data.deadlines.map((d, i) => (
                    <li key={`${d.studentId}-${d.company}-${i}`}>
                      <Link href={`/teacher/classes/${d.classId}/students/${d.studentId}`} className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-[var(--hover)]">
                        <div className="min-w-0"><p className="truncate text-sm font-semibold">{d.studentName} · {d.company}</p><p className="text-small truncate text-muted">{d.position ? `${d.position} · ` : ""}{d.className}</p></div>
                        <span className="tabular inline-flex items-center gap-1.5 text-sm font-medium text-[var(--warning-fg)]"><CalendarClock size={14} aria-hidden /> {formatDate(d.deadline)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </>
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
