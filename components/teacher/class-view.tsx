"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Archive, BriefcaseBusiness, Home, Megaphone, Settings2, Trophy, UserPlus, UserX, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { Segmented } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { getTeacherClassStudents, getTeacherDashboard, type DashboardClass, type TeacherStudent } from "./api";
import { ErrorBanner, teacherError } from "./shared";
import { StudentsPanel } from "./students-panel";
import { InvitePanel } from "./invite-panel";
import { AnnouncementsPanel } from "./announcements-panel";
import { ClassSettingsPanel } from "./class-settings-panel";

type Tab = "students" | "invite" | "news" | "settings";

export function TeacherClassView({ classId }: { classId: string }) {
  const [cls, setCls] = useState<DashboardClass | null>(null);
  const [students, setStudents] = useState<TeacherStudent[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("students");

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
    <div className="space-y-6 pb-safe">
      <Link href="/teacher" className="text-small inline-flex min-h-11 items-center gap-1.5 text-muted hover:text-[var(--ink)]"><ArrowLeft size={14} aria-hidden /> Übersicht</Link>
      <PageHeader eyebrow={cls?.schoolYear ? `Schuljahr ${cls.schoolYear}` : "Klasse"} title={<span className="flex flex-wrap items-center gap-2">{cls?.name ?? "Klasse"}{cls?.archived && <Badge tone="info"><Archive size={12} className="mr-1" aria-hidden />Archiviert</Badge>}</span>} description="Bewerbungsfortschritt deiner Klasse. Du siehst nur, was die Schülerinnen und Schüler freigeben." />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {!students && !error && <div className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-[var(--radius-lg)]" />)}</div>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-[var(--radius-lg)]" />)}</div>}
      {students && cls && (
        <>
          <section aria-label="Kennzahlen der Klasse" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile label="Schüler" value={kpi.students} icon={<Users size={16} />} trend={kpi.hidden ? `${kpi.hidden} teilen nicht` : undefined} />
            <StatTile label="Bewerbungen" value={kpi.applications} icon={<BriefcaseBusiness size={16} />} />
            <StatTile label="Mit Zusage" value={kpi.offers} icon={<Trophy size={16} />} tone="success" />
            <StatTile label="Lehrstelle gefunden" value={kpi.placed} icon={<Home size={16} />} tone="success" />
            <StatTile label="Inaktiv" value={kpi.inactive} icon={<UserX size={16} />} tone={kpi.inactive ? "danger" : "neutral"} />
          </section>
          <Segmented className="[&_button]:min-h-11" label="Bereich der Klasse" value={tab} onChange={setTab} options={[{ value: "students", label: "Schüler", icon: <Users size={14} />, count: kpi.students }, { value: "invite", label: "Einladen", icon: <UserPlus size={14} /> }, { value: "news", label: "Mitteilungen", icon: <Megaphone size={14} /> }, { value: "settings", label: "Einstellungen", icon: <Settings2 size={14} /> }]} />
          <div role="tabpanel" aria-label={{ students: "Schüler", invite: "Einladen", news: "Mitteilungen", settings: "Einstellungen" }[tab]}>
            {tab === "students" && (students.length === 0
              ? <EmptyState icon={<Users size={26} />} title="Noch keine Schüler" description="Lade deine Klasse per Link, Code oder QR-Code ein. Sobald jemand beitritt, erscheint die Person hier." action={<button type="button" onClick={() => setTab("invite")} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--brand-gradient)] px-5 font-semibold text-white">Schüler einladen</button>} />
              : <StudentsPanel cls={cls} students={students} onChanged={load} />)}
            {tab === "invite" && <InvitePanel cls={cls} />}
            {tab === "news" && <AnnouncementsPanel classId={classId} />}
            {tab === "settings" && <ClassSettingsPanel cls={cls} onChanged={load} />}
          </div>
        </>
      )}
    </div>
  );
}
