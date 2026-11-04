"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus, Search, X } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getApplications } from "@/lib/storage";
import { cn, statusLabels } from "@/lib/utils";
import type { Application, ApplicationStatus } from "@/types";

const statusStyle: Record<ApplicationStatus, string> = {
  saved: "bg-[#f2f2f4] text-[#5e5e63]",
  preparing: "bg-[#fff4df] text-[#855600]",
  applied: "bg-[#eaf3ff] text-[#075dbd]",
  interview: "bg-[#eaf5ed] text-[#267447]",
  final_interview: "bg-[#eaf5ed] text-[#267447]",
  offer: "bg-[#eaf5ed] text-[#267447]",
  rejected: "bg-[#fff0f0] text-[#a32828]",
  withdrawn: "bg-[#f2f2f4] text-[#5e5e63]",
};

const addLink = "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0866d6] px-5 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(8,102,214,.25)] transition hover:bg-[#075bbb] active:scale-[.98] sm:w-fit";

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ApplicationStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getApplications()
      .then((data) => { if (active) setApplications(data); })
      .catch(() => { if (active) setError("Die Bewerbungen konnten gerade nicht geladen werden."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

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
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-1px] md:text-[38px]">Bewerbungen</h1>
          <p className="mt-2 text-base text-muted">Alles, was du dir merken oder schon abgeschickt hast.</p>
        </div>
        <Link href="/applications/new" className={addLink}>
          <Plus size={17} /> Bewerbung hinzufügen
        </Link>
      </div>

      {error && <p role="alert" className="mt-6 rounded-xl border border-[#e8c7c7] bg-[#fff8f8] px-4 py-3 text-sm text-[#a32828]">{error}</p>}

      <div className="mt-7 space-y-3">
        <label className="relative block">
          <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#737378]" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Firma oder Stelle suchen" aria-label="Firma oder Stelle suchen" className="min-h-11 w-full rounded-full border border-[#d2d2d7] bg-white py-2.5 pl-11 pr-11 text-sm outline-none transition placeholder:text-[#737378] focus:border-[#0866d6] focus:ring-2 focus:ring-[#0866d6]/15 [&::-webkit-search-cancel-button]:hidden" />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Suche löschen" className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-[#737378] hover:text-[#1d1d1f]"><X size={16} /></button>
          )}
        </label>
        <div role="group" aria-label="Nach Status filtern" className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 min-[381px]:-mx-3.5 min-[381px]:px-3.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
          {chips.map((chip) => {
            const selected = status === chip.value;
            return (
              <button key={chip.value} type="button" aria-pressed={selected} onClick={() => setStatus(chip.value)} className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition active:scale-[.97]", selected ? "border-[#0866d6] bg-[#0866d6] text-white" : "border-white/80 bg-white/60 text-[#3a3a3f] hover:bg-white")}>
                {chip.label}
                <span className={cn("text-xs tabular-nums", selected ? "text-white/80" : "text-muted")}>{chip.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-5 text-sm text-muted" aria-live="polite">{loading ? "Lädt …" : `${filtered.length} ${filtered.length === 1 ? "Bewerbung" : "Bewerbungen"}`}</p>

      {loading ? (
        <div className="mt-3 space-y-3" role="status" aria-label="Bewerbungen werden geladen">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-[84px] animate-pulse rounded-[14px] bg-white/60" />)}
        </div>
      ) : filtered.length ? (
        <ul className="mt-3 space-y-2.5">
          {filtered.map((application) => (
            <li key={application.id}>
              <Link href={`/applications/${application.id}`} className="glass-surface group flex min-h-[84px] items-center justify-between gap-3 rounded-[14px] px-4 py-3.5 transition hover:-translate-y-px hover:bg-white/80 active:scale-[.99] sm:px-5">
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">{application.company}</span>
                  <span className="mt-1 block truncate text-sm text-muted">{application.position}{application.location ? ` · ${application.location}` : ""}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge className={statusStyle[application.status]}>{statusLabels[application.status]}</Badge>
                  <ChevronRight size={16} className="hidden text-[#a0a0a6] transition group-hover:translate-x-0.5 sm:block" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="mt-3 border-dashed px-6 py-10 text-center">
          <h2 className="text-base font-semibold">{applications.length ? "Nichts gefunden." : "Noch keine Bewerbungen"}</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{applications.length ? "Probier einen anderen Suchbegriff oder Status." : "Füge deine erste Stelle hinzu, damit du sie nicht aus dem Blick verlierst."}</p>
          {applications.length ? (
            <button type="button" onClick={() => { setQuery(""); setStatus("all"); }} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border border-[#d2d2d7] bg-white px-5 text-sm font-semibold hover:bg-[#f5f5f7]">Filter zurücksetzen</button>
          ) : (
            <Link href="/applications/new" className={cn(addLink, "mx-auto mt-5 sm:w-fit")}><Plus size={16} /> Bewerbung hinzufügen</Link>
          )}
        </Card>
      )}
    </WorkspaceShell>
  );
}
