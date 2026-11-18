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
import { getAttention } from "@/lib/teacher-more";
import type { AttentionItem } from "@/lib/teacher-extras";
import { SchoolAdminLink } from "@/components/b2b/school-admin-link";
import { Segmented } from "@/components/ui/tabs";
import { createClass, getTeacherDashboard, type TeacherDashboard } from "./api";
import { ClassPath, ErrorBanner, teacherError } from "./shared";
import { formatDate } from "@/components/classes/shared";
import { useAccess } from "@/components/access/access-provider";
import { formatDateCh } from "@/lib/family-core";

/** Small line: which school licence the teacher uses and until when; a hint 30 days before it ends (lehrperson-27, read-only). */
function LicenceLine() {
  const { access } = useAccess();
  const [now] = useState(() => Date.now());
  const school = access?.school;
  if (!school) return null;
  const until = school.valid_until ? new Date(school.valid_until) : null;
  const daysLeft = until ? Math.ceil((until.getTime() - now) / 864e5) : null;
  const soon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30;
  return (
    <span className={`text-small mt-1 block ${soon ? "font-semibold text-[var(--warning-fg)]" : "text-muted"}`}>
      Schullizenz: {school.name}{school.valid_until ? `, gültig bis ${formatDateCh(school.valid_until)}` : ""}.{soon ? " Bitte deine Schuladministration, sie zu verlängern." : ""}
    </span>
  );
}

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
  // Perf: the attention list (shown below the classes) starts together with the dashboard instead of after it.
  const [attention, setAttention] = useState<Promise<AttentionItem[]> | null>(null);
  useEffect(() => { const read = getAttention(null, 14); read.catch(() => undefined); setAttention(read); }, []); // eslint-disable-line react-hooks/set-state-in-effect -- starts one read on mount

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
      <PageHeader title="Meine Klassen" description={<>So weit sind deine Klassen mit der Lehrstellensuche.<LicenceLine /></>} actions={<Button variant={mode === "no-students" && firstClass ? "secondary" : "primary"} className="min-h-11 sm:min-h-11" icon={<Plus size={16} />} onClick={() => setOpen(true)}>Klasse erstellen</Button>} />
      <SchoolAdminLink className="mb-8" />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {!data && !error && <div className="space-y-3"><Skeleton className="h-24 rounded-[var(--radius-lg)]" />{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-[var(--radius-lg)]" />)}</div>}
      {data && t && (
        <div className="space-y-10">
          {mode === "no-students" && firstClass && (
            <EmptyState icon={<Users size={26} />} title="Noch niemand in deinen Klassen" description="Sobald jemand mit dem Klassencode beitritt, siehst du hier den Fortschritt." action={<ButtonLink href={`/teacher/classes/${firstClass.id}?tab=invite`} variant="sun" className="max-w-full"><span className="truncate">Klasse «{firstClass.name}» einladen</span></ButtonLink>} />
          )}
          {mode === "no-applications" && (
            <div className="space-y-4">
              <Figures label="Kennzahlen" items={[{ label: "Schüler:innen", value: t.students, hint: t.hiddenStudents ? `${t.hiddenStudents} teilen nicht` : undefined }, { label: "Bewerbungen", value: t.applications, hint: "Noch keine geteilt" }]} />
              <p className="text-small max-w-2xl text-muted">Noch hat niemand eine Bewerbung geteilt. Erinnere die Klasse mit einer Mitteilung ans Starten.</p>
            </div>
          )}
          {mode === "normal" && (
            <ClassPath
              label="Kennzahlen"
              students={t.students}
              studentsHint={t.hiddenStudents ? `${t.hiddenStudents} teilen nicht` : undefined}
              stages={[{ label: "Bewerbungen", value: t.applications, fill: "brand" }, { label: "Gespräche", value: t.interviews, fill: "coral" }, { label: "Zusage oder Lehrvertrag", value: t.placed, fill: "mint" }]}
              note={<>
                {t.inactive ? <><Badge tone="warning">{t.inactive} inaktiv</Badge><span className="mr-2">seit 14+ Tagen ohne Aktivität</span></> : <Badge tone="success">Alle sind aktiv</Badge>}
                {t.hiddenStudents > 0 && <span>{t.hiddenStudents === 1 ? "Zahlen ohne 1 Schüler:in, die nichts teilt." : `Zahlen ohne ${t.hiddenStudents} Schüler:innen, die nichts teilen.`}</span>}
              </>}
            />
          )}

          {mode !== "no-class" && mode !== "no-students" && <AttentionPanel prefetched={attention} />}

          <section aria-label="Klassen">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-heading">Klassen</h2>
              <Segmented className="[&_button]:min-h-11" label="Klassen anzeigen" value={showArchived} onChange={setShowArchived} options={[{ value: "active", label: "Aktiv", count: active.length }, { value: "archived", label: "Archiv", icon: <Archive size={13} />, count: archived.length }]} />
            </div>
            {data.classes.length === 0 && <EmptyState className="mt-3" icon={<GraduationCap size={26} />} title="Noch keine Klasse" description="Erstelle deine erste Klasse und teile den Klassencode." action={<Button variant="secondary" className="min-h-11 sm:min-h-11" icon={<Plus size={16} />} onClick={() => setOpen(true)}>Klasse erstellen</Button>} />}
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
                          {c.inactive > 0 ? <Badge tone="warning">{c.inactive} inaktiv</Badge> : c.students > 0 ? <Badge tone="success">Alle aktiv</Badge> : <Badge className="max-w-full whitespace-normal [overflow-wrap:anywhere]">Noch keine Schüler:innen</Badge>}
                          {c.hidden > 0 && <Badge>{c.hidden} teilen nicht</Badge>}
                          {c.archived && <Badge tone="info">Archiviert</Badge>}
                        </div>
                      </div>
                      <dl className="tabular flex min-w-0 flex-wrap gap-x-5 gap-y-2 sm:shrink-0 sm:gap-x-7">
                        {[["Bewerb.", c.applications], ["Gespräche", c.interviews], ["Zusage/Vertrag", c.placed]].map(([label, value]) => (
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

          <section aria-label="Bewerbungsfristen der Schüler:innen">
            <h2 className="text-heading">Bewerbungsfristen der Schüler:innen <span className="text-small font-normal text-muted">(nächste 14 Tage)</span></h2>
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
      <Modal open={open} onClose={() => setOpen(false)} title="Klasse erstellen" description="Danach lädst du die Schüler:innen mit Klassencode, Link oder QR-Code ein.">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Klassenname" htmlFor="tc-name"><Input id="tc-name" enterKeyHint="next" className="text-base! sm:text-base!" data-autofocus value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. 10b Wirtschaft" maxLength={80} /></Field>
          <Field label="Schuljahr (optional)" htmlFor="tc-year"><Input id="tc-year" enterKeyHint="done" className="text-base! sm:text-base!" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026/27" maxLength={20} /></Field>
          {formError && <p role="alert" className="text-small text-[var(--danger-fg)]">{formError}</p>}
          <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Abbrechen</Button><Button type="submit" loading={saving}>Erstellen</Button></div>
        </form>
      </Modal>
    </div>
  );
}
