"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarClock, ChevronRight, EyeOff, Search, Settings2, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useAvatarUrls } from "@/components/ui/use-avatars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Figures } from "@/components/ui/figures";
import { getClassOverview, listMyClasses } from "@/lib/classes";
import { ClassSettings } from "./class-settings";
import { listStudentAliases, shownName } from "@/lib/profile-names";
import { statusLabels } from "@/lib/utils";
import type { ClassStudentOverview, SchoolClass } from "@/types";
import { CodeActions, StatusBar, TABLE_HEAD, TABLE_ROW, errorMessage, formatDate } from "./shared";
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
  const avatars = useAvatarUrls((students ?? []).map((student) => student.studentId));
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortKey>("activity");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selected, setSelected] = useState<ClassStudentOverview | null>(null);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const nameOf = useCallback((s: { studentId: string; displayName: string }) => shownName({ alias: aliases[s.studentId], displayName: s.displayName }), [aliases]);
  useEffect(() => { let alive = true; listStudentAliases(classId).then((a) => { if (alive) setAliases(a); }).catch(() => {}); return () => { alive = false; }; }, [classId]);

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
    list = list.filter((s) => matches[filter](s) && (!q || nameOf(s).toLowerCase().includes(q) || (!s.hidden && (s.latest?.company.toLowerCase().includes(q) ?? false))));
    const cmp: Record<SortKey, (a: ClassStudentOverview, b: ClassStudentOverview) => number> = {
      activity: (a, b) => a.last30Days - b.last30Days || a.last7Days - b.last7Days || a.total - b.total,
      name: (a, b) => nameOf(a).localeCompare(nameOf(b), "de"),
      total: (a, b) => b.total - a.total,
    };
    return list.sort((a, b) => Number(a.hidden) - Number(b.hidden) || cmp[sort](a, b) || nameOf(a).localeCompare(nameOf(b), "de"));
  }, [students, sort, filter, query, nameOf]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.value, (students ?? []).filter(matches[f.value]).length])) as Record<FilterKey, number>, [students]);

  return (
    <div className="space-y-6">
      <Link href="/classes" className="text-small -mb-4 inline-flex min-h-11 items-center gap-1.5 font-semibold text-muted hover:text-[var(--ink)]"><ArrowLeft size={14} /> Alle Klassen</Link>
      <PageHeader title={cls?.name ?? "Klassenübersicht"} description={<>{cls?.schoolYear && <span className="font-semibold text-[var(--ink)]">Schuljahr {cls.schoolYear} · </span>}Bewerbungsaktivität deiner Schülerinnen und Schüler. Nur Daten von Personen, die ihre Freigabe aktiviert haben.</>} actions={cls && <Button variant="secondary" className="min-h-11 sm:min-h-11" icon={<Settings2 size={16} />} onClick={() => setSettingsOpen(true)}>Verwalten</Button>} />

      {error && <div role="alert" className="status status-danger flex items-center justify-between gap-3 text-sm"><span>{error}</span><Button size="sm" variant="secondary" className="min-h-11 shrink-0 sm:min-h-11" onClick={() => { setError(""); load(); }}>Erneut laden</Button></div>}

      {!students && !error && (
        <div className="space-y-3"><Skeleton className="h-20 w-2/3 rounded-[var(--radius-lg)]" />{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-[var(--radius-lg)]" />)}</div>
      )}

      {students && (
        <>
          <Figures label="Kennzahlen der Klasse" items={[{ label: "Schüler:innen", value: summary.students }, { label: "Bewerbungen", value: summary.total }, { label: "Aktiv diese Woche", value: summary.activeWeek }, { label: "Zusagen", value: summary.offers, tone: "success" }]} />

          {cls && (
            <div className="inset flex flex-wrap items-center justify-between gap-3 p-4">
              <div><p className="text-sm font-bold">Beitrittscode</p><p className="text-small text-muted">Teile den Code, damit weitere Schüler:innen beitreten können.</p></div>
              <CodeActions code={cls.joinCode} name={cls.name} />
            </div>
          )}

          {students.length === 0 ? (
            <EmptyState icon={<Users size={26} />} title="Noch keine Schüler:innen" description="Sobald Schüler:innen mit dem Code beitreten, erscheinen sie hier." />
          ) : (
            <section className="space-y-4" aria-label="Schüler:innenübersicht">
              <div className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative sm:max-w-xs sm:flex-1">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                    <Input type="search" aria-label="Schüler:innen oder Firma suchen" placeholder="Name oder Firma suchen" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9 text-base! sm:text-base!" />
                  </div>
                  <Segmented className="[&_button]:min-h-11" label="Sortierung" value={sort} onChange={setSort} options={[{ value: "activity", label: "Wenigste Aktivität" }, { value: "total", label: "Meiste Bewerbungen" }, { value: "name", label: "Name" }]} />
                </div>
                <Segmented className="[&_button]:min-h-11" label="Filter" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f.value, label: f.label, count: counts[f.value] }))} />
              </div>

              {rows.length === 0 && <EmptyState icon={<Search size={24} />} title="Niemand passt zur Auswahl" description="Ändere Suche oder Filter, um wieder Schüler:innen zu sehen." action={<Button variant="secondary" className="min-h-11 sm:min-h-11" onClick={() => { setFilter("all"); setQuery(""); }}>Zurücksetzen</Button>} />}

              {/* Mobile: plain rows */}
              {rows.length > 0 && <ul className="rows border-y-[length:var(--border-w)] border-[var(--outline)] md:hidden">
                {rows.map((s) => (
                  <li key={s.studentId}>
                    <button type="button" onClick={() => setSelected(s)} className="w-full space-y-2.5 py-4 text-left active:translate-y-px">
                      <div className="flex items-center gap-3">
                        <Avatar name={nameOf(s)} src={avatars[s.studentId]} size="sm" />
                        <div className="min-w-0 flex-1"><p className="truncate text-[15px] font-bold">{nameOf(s)}</p>{s.hidden ? <p className="text-small text-muted">Teilt keine Daten</p> : <p className="text-small text-muted tabular">{s.total} Bewerbungen · 7 T: {s.last7Days} · 30 T: {s.last30Days}</p>}</div>
                        {s.hidden ? <EyeOff size={16} className="shrink-0 text-muted" /> : <ChevronRight size={18} strokeWidth={2.4} className="shrink-0" aria-hidden />}
                      </div>
                      {!s.hidden && (
                        <>
                          <StatusBar counts={s.statusCounts} total={s.total} />
                          {s.latest && <p className="text-small truncate text-muted">Zuletzt: {s.latest.company} · {statusLabels[s.latest.status]} · {formatDate(s.latest.date)}</p>}
                          {s.upcomingDeadlines.length > 0 && <p className="text-small flex items-center gap-1.5 font-medium text-[var(--warning-fg)]"><CalendarClock size={13} className="shrink-0" /> Nächste Frist {formatDate(s.upcomingDeadlines[0].deadline)} ({s.upcomingDeadlines[0].company})</p>}
                          {s.last30Days === 0 && <Badge tone="warning">Keine Bewerbung seit 30 Tagen</Badge>}
                        </>
                      )}
                    </button>
                  </li>
                ))}
              </ul>}

              {/* Desktop: table on paper */}
              {rows.length > 0 && <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className={TABLE_HEAD}>
                    <tr>
                      <th scope="col" className="py-3 pr-3">Name</th>
                      <th scope="col" className="px-3 py-3 text-right">Gesamt</th>
                      <th scope="col" className="w-44 px-3 py-3">Status</th>
                      <th scope="col" className="px-3 py-3 text-right">7 / 30 Tage</th>
                      <th scope="col" className="px-3 py-3">Letzte Bewerbung</th>
                      <th scope="col" className="py-3 pl-3">Nächste Fristen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => (
                      <tr key={s.studentId} className={TABLE_ROW}>
                        <th scope="row" className="py-2 pr-3 font-bold">
                          <button type="button" onClick={() => setSelected(s)} className="inline-flex min-h-11 items-center gap-2.5 text-left hover:underline hover:decoration-2 hover:underline-offset-4"><Avatar name={nameOf(s)} src={avatars[s.studentId]} size="xs" />{nameOf(s)}</button>
                        </th>
                        {s.hidden ? (
                          <td colSpan={5} className="px-3 py-2 text-muted"><span className="inline-flex items-center gap-1.5"><EyeOff size={14} /> Teilt keine Daten</span></td>
                        ) : (
                          <>
                            <td className="tabular px-3 py-2 text-right font-bold">{s.total}</td>
                            <td className="px-3 py-2"><StatusBar counts={s.statusCounts} total={s.total} /></td>
                            <td className="tabular px-3 py-2 text-right whitespace-nowrap">{s.last7Days} / {s.last30Days}{s.last30Days === 0 && <Badge tone="warning" className="ml-2">inaktiv</Badge>}</td>
                            <td className="max-w-[220px] px-3 py-2">{s.latest ? <><p className="truncate">{s.latest.company}</p><p className="text-small text-muted">{statusLabels[s.latest.status]} · {formatDate(s.latest.date)}</p></> : <span className="text-muted">–</span>}</td>
                            <td className="py-2 pl-3">{s.upcomingDeadlines.length ? <ul className="text-small space-y-0.5">{s.upcomingDeadlines.slice(0, 2).map((d) => <li key={d.applicationId} className="tabular">{formatDate(d.deadline)} · <span className="text-muted">{d.company}</span></li>)}</ul> : <span className="text-muted">–</span>}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
            </section>
          )}
        </>
      )}

      <StudentDrilldown classId={classId} student={selected} alias={selected ? aliases[selected.studentId] : undefined} onAlias={(a) => selected && setAliases((prev) => { const next = { ...prev }; if (a) next[selected.studentId] = a; else delete next[selected.studentId]; return next; })} onClose={() => setSelected(null)} onRemoved={() => { setSelected(null); load(); }} />
      {cls && <ClassSettings cls={cls} open={settingsOpen} onClose={() => setSettingsOpen(false)} onChanged={load} />}
    </div>
  );
}
