"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BriefcaseBusiness, CalendarClock, EyeOff, Search, Settings2, Sparkles, Trophy, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { StatTile } from "@/components/ui/stat-tile";
import { getClassOverview, listMyClasses } from "@/lib/classes";
import { ClassSettings } from "./class-settings";
import { statusLabels } from "@/lib/utils";
import type { ClassStudentOverview, SchoolClass } from "@/types";
import { CodeActions, StatusBar, errorMessage, formatDate } from "./shared";
import { StudentDrilldown } from "./student-drilldown";

type SortKey = "activity" | "name" | "total";
type FilterKey = "all" | "inactive" | "active" | "offer" | "hidden";
const FILTERS: { value: FilterKey; label: string }[] = [{ value: "all", label: "Alle" }, { value: "inactive", label: "Inaktiv (30 T)" }, { value: "active", label: "Aktiv (7 T)" }, { value: "offer", label: "Mit Zusage" }, { value: "hidden", label: "Teilt nicht" }];
const matches: Record<FilterKey, (s: ClassStudentOverview) => boolean> = {
  all: () => true,
  inactive: (s) => !s.hidden && s.last30Days === 0,
  active: (s) => !s.hidden && s.last7Days > 0,
  offer: (s) => !s.hidden && (s.statusCounts.offer ?? 0) > 0,
  hidden: (s) => s.hidden,
};

export function ClassDetail({ classId }: { classId: string }) {
  const [cls, setCls] = useState<SchoolClass | null>(null);
  const [students, setStudents] = useState<ClassStudentOverview[] | null>(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortKey>("activity");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selected, setSelected] = useState<ClassStudentOverview | null>(null);

  const load = useCallback(() => {
    Promise.all([listMyClasses(), getClassOverview(classId)])
      .then(([classes, overview]) => { setCls(classes.find((c) => c.id === classId) ?? null); setStudents(overview); })
      .catch((e) => setError(errorMessage(e)));
  }, [classId]);
  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => {
    const list = students ?? [];
    const visible = list.filter((s) => !s.hidden);
    return {
      students: list.length,
      total: visible.reduce((n, s) => n + s.total, 0),
      activeWeek: visible.filter((s) => s.last7Days > 0).length,
      offers: visible.reduce((n, s) => n + (s.statusCounts.offer ?? 0), 0),
    };
  }, [students]);

  const rows = useMemo(() => {
    let list = [...(students ?? [])];
    const q = query.trim().toLowerCase();
    list = list.filter((s) => matches[filter](s) && (!q || s.displayName.toLowerCase().includes(q) || (!s.hidden && (s.latest?.company.toLowerCase().includes(q) ?? false))));
    const cmp: Record<SortKey, (a: ClassStudentOverview, b: ClassStudentOverview) => number> = {
      activity: (a, b) => a.last30Days - b.last30Days || a.last7Days - b.last7Days || a.total - b.total,
      name: (a, b) => a.displayName.localeCompare(b.displayName, "de"),
      total: (a, b) => b.total - a.total,
    };
    return list.sort((a, b) => Number(a.hidden) - Number(b.hidden) || cmp[sort](a, b) || a.displayName.localeCompare(b.displayName, "de"));
  }, [students, sort, filter, query]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.value, (students ?? []).filter(matches[f.value]).length])) as Record<FilterKey, number>, [students]);

  return (
    <div className="space-y-6 pb-safe">
      <Link href="/classes" className="text-small inline-flex min-h-11 items-center gap-1.5 text-muted hover:text-[var(--ink)]"><ArrowLeft size={14} /> Alle Klassen</Link>
      <PageHeader eyebrow={cls?.schoolYear ? `Schuljahr ${cls.schoolYear}` : "Klasse"} title={cls?.name ?? "Klassenübersicht"} description="Bewerbungsaktivität deiner Schülerinnen und Schüler. Nur Daten von Personen, die ihre Freigabe aktiviert haben." actions={cls && <Button variant="secondary" className="min-h-11 sm:min-h-11" icon={<Settings2 size={16} />} onClick={() => setSettingsOpen(true)}>Verwalten</Button>} />

      {error && <div role="alert" className="status status-danger flex items-center justify-between gap-3 rounded-[var(--radius-md)] p-3 text-sm"><span>{error}</span><Button size="sm" variant="secondary" className="min-h-11 sm:min-h-11" onClick={() => { setError(""); load(); }}>Erneut laden</Button></div>}

      {!students && !error && (
        <div className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-[var(--radius-lg)]" />)}</div>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-[var(--radius-lg)]" />)}</div>
      )}

      {students && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Schüler" value={summary.students} icon={<Users size={16} />} />
            <StatTile label="Bewerbungen" value={summary.total} icon={<BriefcaseBusiness size={16} />} />
            <StatTile label="Aktiv diese Woche" value={summary.activeWeek} icon={<Sparkles size={16} />} />
            <StatTile label="Angebote" value={summary.offers} icon={<Trophy size={16} />} />
          </div>

          {cls && (
            <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div><p className="text-eyebrow">Beitrittscode</p><p className="text-small text-muted">Teile den Code, damit weitere Schüler beitreten können.</p></div>
              <CodeActions code={cls.joinCode} name={cls.name} />
            </Card>
          )}

          {students.length === 0 ? (
            <EmptyState icon={<Users size={26} />} title="Noch keine Schüler" description="Sobald Schüler mit dem Code beitreten, erscheinen sie hier." />
          ) : (
            <section className="space-y-4" aria-label="Schülerübersicht">
              <div className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative sm:max-w-xs sm:flex-1">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                    <Input type="search" aria-label="Schüler oder Firma suchen" placeholder="Name oder Firma suchen" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9 text-base! sm:text-base!" />
                  </div>
                  <Segmented className="[&_button]:min-h-11" label="Sortierung" value={sort} onChange={setSort} options={[{ value: "activity", label: "Wenigste Aktivität" }, { value: "total", label: "Meiste Bewerbungen" }, { value: "name", label: "Name" }]} />
                </div>
                <Segmented className="[&_button]:min-h-11" label="Filter" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f.value, label: f.label, count: counts[f.value] }))} />
              </div>

              {rows.length === 0 && <EmptyState icon={<Search size={24} />} title="Niemand passt zur Auswahl" description="Ändere Suche oder Filter, um wieder Schüler zu sehen." action={<Button variant="secondary" className="min-h-11 sm:min-h-11" onClick={() => { setFilter("all"); setQuery(""); }}>Zurücksetzen</Button>} />}

              {/* Mobile: cards */}
              <ul className="space-y-3 md:hidden">
                {rows.map((s) => (
                  <li key={s.studentId}>
                    <button type="button" onClick={() => setSelected(s)} className="card-interactive panel w-full space-y-3 rounded-[var(--radius-lg)] p-4 text-left">
                      <div className="flex items-center gap-3">
                        <Avatar name={s.displayName} size="sm" />
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{s.displayName}</p>{s.hidden ? <p className="text-small text-muted">Teilt keine Daten</p> : <p className="text-small text-muted tabular">{s.total} Bewerbungen · 7 T: {s.last7Days} · 30 T: {s.last30Days}</p>}</div>
                        {s.hidden && <EyeOff size={16} className="text-muted" />}
                      </div>
                      {!s.hidden && (
                        <>
                          <StatusBar counts={s.statusCounts} total={s.total} />
                          {s.latest && <p className="text-small truncate text-muted">Zuletzt: {s.latest.company} · {statusLabels[s.latest.status]} · {formatDate(s.latest.date)}</p>}
                          {s.upcomingDeadlines.length > 0 && <p className="text-small inline-flex items-center gap-1.5 text-[var(--warning-fg)]"><CalendarClock size={13} /> Nächste Frist {formatDate(s.upcomingDeadlines[0].deadline)} ({s.upcomingDeadlines[0].company})</p>}
                          {s.last30Days === 0 && <Badge tone="warning">Keine Bewerbung seit 30 Tagen</Badge>}
                        </>
                      )}
                    </button>
                  </li>
                ))}
              </ul>

              {/* Desktop: table */}
              <Card className="hidden overflow-hidden md:block">
                <table className="w-full text-left text-sm">
                  <thead className="text-eyebrow border-b border-[var(--line)]">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">Name</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">Gesamt</th>
                      <th scope="col" className="w-44 px-3 py-3 font-medium">Status</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">7 / 30 Tage</th>
                      <th scope="col" className="px-3 py-3 font-medium">Letzte Bewerbung</th>
                      <th scope="col" className="px-3 py-3 font-medium">Nächste Fristen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => (
                      <tr key={s.studentId} className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--hover)]">
                        <th scope="row" className="px-4 py-3 font-medium">
                          <button type="button" onClick={() => setSelected(s)} className="inline-flex min-h-11 items-center gap-2.5 text-left hover:text-[var(--brand-strong)]"><Avatar name={s.displayName} size="xs" />{s.displayName}</button>
                        </th>
                        {s.hidden ? (
                          <td colSpan={5} className="px-3 py-3 text-muted"><span className="inline-flex items-center gap-1.5"><EyeOff size={14} /> Teilt keine Daten</span></td>
                        ) : (
                          <>
                            <td className="tabular px-3 py-3 text-right">{s.total}</td>
                            <td className="px-3 py-3"><StatusBar counts={s.statusCounts} total={s.total} /></td>
                            <td className="tabular px-3 py-3 text-right">{s.last7Days} / {s.last30Days}{s.last30Days === 0 && <Badge tone="warning" className="ml-2">inaktiv</Badge>}</td>
                            <td className="max-w-[220px] px-3 py-3">{s.latest ? <><p className="truncate">{s.latest.company}</p><p className="text-small text-muted">{statusLabels[s.latest.status]} · {formatDate(s.latest.date)}</p></> : <span className="text-muted">–</span>}</td>
                            <td className="px-3 py-3">{s.upcomingDeadlines.length ? <ul className="text-small space-y-0.5">{s.upcomingDeadlines.slice(0, 2).map((d) => <li key={d.applicationId} className="tabular">{formatDate(d.deadline)} · <span className="text-muted">{d.company}</span></li>)}</ul> : <span className="text-muted">–</span>}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </section>
          )}
        </>
      )}

      <StudentDrilldown classId={classId} student={selected} onClose={() => setSelected(null)} onRemoved={() => { setSelected(null); load(); }} />
      {cls && <ClassSettings cls={cls} open={settingsOpen} onClose={() => setSettingsOpen(false)} onChanged={load} />}
    </div>
  );
}
