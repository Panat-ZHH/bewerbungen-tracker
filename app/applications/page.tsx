"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, Search, X } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { fieldClasses } from "@/components/ui/input";
import { DoodleSparkle } from "@/components/ui/doodles";
import { getApplications } from "@/lib/storage";
import { cn, statusLabels } from "@/lib/utils";
import { friendlyMessage } from "@/lib/ux";
import { Button, ButtonLink } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/skeleton";
import type { Application, ApplicationStatus } from "@/types";


export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ApplicationStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    getApplications()
      .then((data) => { if (active) { setApplications(data); setError(""); } })
      .catch((reason) => { if (active) setError(friendlyMessage(reason, "Deine Bewerbungen konnten nicht geladen werden.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  const filtered = useMemo(() => applications
    .filter((item) => `${item.company} ${item.position}`.toLowerCase().includes(query.toLowerCase()))
    .filter((item) => status === "all" || item.status === status)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [applications, query, status]);

  const counts = useMemo(() => {
    const result: Partial<Record<ApplicationStatus, number>> = {};
    for (const item of applications) result[item.status] = (result[item.status] ?? 0) + 1;
    return result;
  }, [applications]);

  const chips: { value: ApplicationStatus | "all"; label: string; count: number }[] = [
    { value: "all", label: "Alle", count: applications.length },
    ...(Object.entries(statusLabels) as [ApplicationStatus, string][])
      .filter(([value]) => counts[value] || value === status)
      .map(([value, label]) => ({ value, label, count: counts[value] ?? 0 })),
  ];

  return (
    <WorkspaceShell active="Bewerbungen">
      <PageHeader
        className="mb-0 sm:mb-0"
        title={<>Bewerbungen<DoodleSparkle className="ml-2 inline-block h-[.55em] w-[.55em] -translate-y-[.45em] text-[var(--sun)]" /></>}
        description="Alles, was du dir merken oder schon abgeschickt hast."
        actions={<ButtonLink href="/applications/new" variant="sun" className="w-full sm:w-fit" icon={<Plus size={17} strokeWidth={2.4} />}>Bewerbung hinzufügen</ButtonLink>}
      />

      {error && <StatusMessage tone="danger" className="mt-6"><p>{error}</p><Button size="sm" variant="secondary" className="mt-2" onClick={() => { setLoading(true); setAttempt((n) => n + 1); }}>Erneut versuchen</Button></StatusMessage>}

      <div className="mt-7 space-y-3">
        <label className="relative block max-w-xl">
          <Search size={17} strokeWidth={2.4} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink)]" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Firma oder Stelle suchen" aria-label="Firma oder Stelle suchen" className={cn(fieldClasses, "pl-10 pr-11 [&::-webkit-search-cancel-button]:hidden")} />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Suche löschen" className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-[var(--ink)]"><X size={16} /></button>
          )}
        </label>
        <div role="group" aria-label="Nach Status filtern" className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 min-[381px]:-mx-3.5 min-[381px]:px-3.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
          {chips.map((chip) => {
            const selected = status === chip.value;
            return (
              <button key={chip.value} type="button" aria-pressed={selected} onClick={() => setStatus(chip.value)} className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border-[length:var(--border-w)] px-3.5 text-sm font-semibold transition-colors duration-150 active:translate-y-px", selected ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--outline)] hover:text-[var(--ink)]")}>
                {chip.label}
                <span className={cn("tabular rounded-full px-1.5 text-xs", selected ? "bg-[var(--sun)] text-[var(--on-sun)]" : "bg-[var(--surface-2)]")}>{chip.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-6 text-sm text-muted" aria-live="polite">{loading ? "Lädt …" : `${filtered.length} ${filtered.length === 1 ? "Bewerbung" : "Bewerbungen"}`}</p>

      {loading ? (
        <div className="mt-3 space-y-3" role="status" aria-label="Bewerbungen werden geladen">
          {[0, 1, 2, 3].map((item) => <div key={item} className="skeleton h-16" />)}
        </div>
      ) : filtered.length ? (
        <ul className="rows mt-2 border-y-[length:var(--border-w)] border-[var(--outline)]">
          {filtered.map((application) => (
            <li key={application.id}>
              <Link href={`/applications/${application.id}`} className="row-link group min-h-[4.5rem] justify-between">
                <span className="min-w-0">
                  <span className="font-display block truncate text-[17px] font-bold tracking-[-.01em]">{application.company}</span>
                  <span className="mt-0.5 block truncate text-sm text-muted">{application.position}{application.location ? ` · ${application.location}` : ""}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={application.status} />
                  <ArrowRight size={17} strokeWidth={2.4} aria-hidden className="hidden transition-transform duration-200 group-hover:translate-x-1 sm:block" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          className="mt-3"
          title={applications.length ? "Dazu gibt es keine Bewerbung." : "Noch keine Bewerbungen"}
          description={applications.length ? "Prüfe die Schreibweise oder wähle einen anderen Stand." : "Füge deine erste Stelle hinzu, damit du sie nicht aus dem Blick verlierst."}
          action={applications.length ? (
            <Button type="button" variant="secondary" onClick={() => { setQuery(""); setStatus("all"); }}>Filter zurücksetzen</Button>
          ) : (
            <ButtonLink href="/applications/new" icon={<Plus size={16} strokeWidth={2.4} />}>Bewerbung hinzufügen</ButtonLink>
          )}
        />
      )}
    </WorkspaceShell>
  );
}
