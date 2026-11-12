"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Archive, CalendarDays, Megaphone, Settings2, UserPlus, Users } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Figures } from "@/components/ui/figures";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { getTeacherClassStudents, getTeacherDashboard, type DashboardClass, type TeacherStudent } from "./api";
import { ClassPath, ErrorBanner, teacherError } from "./shared";
import { StudentsPanel } from "./students-panel";
import { InvitePanel } from "./invite-panel";
import { AnnouncementsPanel } from "./announcements-panel";
import { ClassSettingsPanel } from "./class-settings-panel";
import { AttentionPanel } from "./attention-panel";
import { ClassCalendar } from "./class-calendar";

type Tab = "students" | "invite" | "calendar" | "news" | "settings";
const TABS: Tab[] = ["students", "invite", "calendar", "news", "settings"];

export function TeacherClassView({ classId }: { classId: string }) {
  const [cls, setCls] = useState<DashboardClass | null>(null);
  const [students, setStudents] = useState<TeacherStudent[] | null>(null);
  const [error, setError] = useState("");
  const requested = useSearchParams().get("tab");
  const [tab, setTab] = useState<Tab>(TABS.includes(requested as Tab) ? (requested as Tab) : "students");

  const load = useCallback(() => {
    Promise.all([getTeacherDashboard(), getTeacherClassStudents(classId)])
      .then(([dash, list]) => { const found = dash.classes.find((c) => c.id === classId) ?? null; setCls(found); setStudents(list); setError(found ? "" : "Diese Klasse gibt es nicht oder du hast keinen Zugriff."); })
      .catch((e) => setError(teacherError(e)));
  }, [classId]);
  useEffect(() => { load(); }, [load]);

  const kpi = useMemo(() => {
    const visible = (students ?? []).filter((s) => !s.hidden);
    return { students: students?.length ?? 0, applications: visible.reduce((n, s) => n + s.total, 0), offers: visible.filter((s) => s.offers > 0).length, placed: visible.filter((s) => s.placed).length, inactive: visible.filter((s) => s.inactive).length, hidden: (students ?? []).length - visible.length };
  }, [students]);

  return (
    <div className="space-y-6">
      <Link href="/teacher" className="text-small -mb-4 inline-flex min-h-11 items-center gap-1.5 font-semibold text-muted hover:text-[var(--ink)]"><ArrowLeft size={14} aria-hidden /> Übersicht</Link>
      <PageHeader title={<span className="flex flex-wrap items-center gap-x-3 gap-y-2">{cls?.name ?? "Klasse"}{cls?.archived && <Badge tone="info" className="font-sans tracking-normal"><Archive size={12} className="mr-1" aria-hidden />Archiviert</Badge>}</span>} description={<>{cls?.schoolYear && <span className="font-semibold text-[var(--ink)]">Schuljahr {cls.schoolYear} · </span>}Bewerbungsfortschritt deiner Klasse. Du siehst nur, was die Schülerinnen und Schüler freigeben.</>} />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {!students && !error && <div className="space-y-3"><Skeleton className="h-24 rounded-[var(--radius-lg)]" />{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-[var(--radius-lg)]" />)}</div>}
      {students && cls && (
        <>
          {students.length === 0 || kpi.applications === 0 ? (
            <Figures label="Kennzahlen der Klasse" items={[{ label: "Schüler:innen", value: kpi.students, hint: kpi.hidden ? `${kpi.hidden} teilen nicht` : students.length === 0 ? "Noch niemand beigetreten" : undefined }, { label: "Bewerbungen", value: kpi.applications, hint: "Noch keine geteilt" }]} />
          ) : (
            <ClassPath
              label="Kennzahlen der Klasse"
              students={kpi.students}
              studentsHint={kpi.hidden ? `${kpi.hidden} teilen nicht` : undefined}
              stages={[{ label: "Bewerbungen", value: kpi.applications, fill: "brand" }, { label: "Mit Zusage", value: kpi.offers, fill: "mint" }, { label: "Lehrstelle gefunden", short: "Lehrstelle", value: kpi.placed, fill: "sun" }]}
              note={kpi.inactive ? <Badge tone="warning">{kpi.inactive} inaktiv</Badge> : undefined}
            />
          )}
          <Segmented className="[&_button]:min-h-11" label="Bereich der Klasse" value={tab} onChange={setTab} options={[{ value: "students", label: "Schüler:innen", icon: <Users size={14} />, count: kpi.students }, { value: "invite", label: "Einladen", icon: <UserPlus size={14} /> }, { value: "calendar", label: "Kalender", icon: <CalendarDays size={14} /> }, { value: "news", label: "Mitteilungen", icon: <Megaphone size={14} /> }, { value: "settings", label: "Einstellungen", icon: <Settings2 size={14} /> }]} />
          <div role="tabpanel" aria-label={{ students: "Schüler:innen", invite: "Einladen", calendar: "Kalender", news: "Mitteilungen", settings: "Einstellungen" }[tab]}>
            {tab === "students" && (students.length === 0
              ? <EmptyState icon={<Users size={26} />} title="Noch keine Schüler:innen" description="Lade deine Klasse per Link, Code oder QR-Code ein. Sobald jemand beitritt, erscheint die Person hier." action={<Button variant="sun" onClick={() => setTab("invite")}>Schüler:innen einladen</Button>} />
              : <div className="space-y-10"><AttentionPanel classId={classId} /><StudentsPanel cls={cls} students={students} onChanged={load} /></div>)}
            {tab === "invite" && <InvitePanel cls={cls} />}
            {tab === "calendar" && <ClassCalendar classId={classId} archived={cls.archived} />}
            {tab === "news" && <AnnouncementsPanel classId={classId} />}
            {tab === "settings" && <ClassSettingsPanel cls={cls} onChanged={load} />}
          </div>
        </>
      )}
    </div>
  );
}
