"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getApplications } from "@/lib/storage";
import { statusLabels } from "@/lib/utils";
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

  return (
    <WorkspaceShell active="Bewerbungen">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-1px] md:text-[38px]">Bewerbungen</h1>
          <p className="mt-2 text-base text-muted">Alles, was du dir merken oder schon abgeschickt hast.</p>
        </div>
        <Link href="/applications/new" className="inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-full bg-[#0866d6] px-5 text-sm font-semibold text-white hover:bg-[#075bbb]">
          <Plus size={17} /> Bewerbung hinzufügen
        </Link>
      </div>

      {error && <p role="alert" className="mt-6 rounded-xl border border-[#e8c7c7] bg-[#fff8f8] px-4 py-3 text-sm text-[#a32828]">{error}</p>}

      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <Search size={17} className="absolute left-3.5 top-3.5 text-[#737378]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Firma oder Stelle suchen" aria-label="Firma oder Stelle suchen" className="min-h-11 w-full rounded-full border border-[#d2d2d7] bg-white py-2.5 pl-10 pr-4 text-sm placeholder:text-[#737378] focus:border-[#0866d6]" />
        </label>
        <label className="sr-only" htmlFor="status-filter">Nach Status filtern</label>
        <select id="status-filter" value={status} onChange={(event) => setStatus(event.target.value as ApplicationStatus | "all")} className="min-h-11 rounded-full border border-[#d2d2d7] bg-white px-4 text-sm text-[#1d1d1f]">
          <option value="all">Alle Bewerbungen</option>
          {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <p className="mt-6 text-sm text-muted">{loading ? "Lädt …" : `${filtered.length} ${filtered.length === 1 ? "Bewerbung" : "Bewerbungen"}`}</p>

      {loading ? (
        <div className="mt-3 space-y-3" aria-label="Bewerbungen werden geladen">
          {[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-[14px] bg-[#e9e9ed]" />)}
        </div>
      ) : filtered.length ? (
        <div className="mt-2 divide-y divide-[#e5e5ea] border-y border-[#e5e5ea]">
          {filtered.map((application) => (
            <Link key={application.id} href={`/applications/${application.id}`} className="flex min-h-[82px] items-center justify-between gap-4 py-4 transition-colors hover:bg-white sm:px-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{application.company}</span>
                <span className="mt-1 block truncate text-sm text-muted">{application.position}{application.location ? ` · ${application.location}` : ""}</span>
              </span>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${statusStyle[application.status]}`}>{statusLabels[application.status]}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="glass-surface mt-3 rounded-[14px] border border-dashed border-white/80 px-6 py-10 text-center">
          <h2 className="text-base font-semibold">{applications.length ? "Nichts gefunden." : "Noch keine Bewerbungen"}</h2>
          <p className="mt-2 text-sm text-muted">{applications.length ? "Probier einen anderen Suchbegriff oder Status." : "Füge deine erste Stelle hinzu, damit du sie nicht aus dem Blick verlierst."}</p>
          {!applications.length && <Link href="/applications/new" className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[#0866d6] px-4 text-sm font-semibold text-white hover:bg-[#075bbb]"><Plus size={16} /> Bewerbung hinzufügen</Link>}
        </div>
      )}
    </WorkspaceShell>
  );
}