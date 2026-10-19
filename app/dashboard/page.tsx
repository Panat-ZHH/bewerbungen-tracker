"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getApplications } from "@/lib/storage";
import { statusLabels } from "@/lib/utils";
import type { Application, ApplicationStatus } from "@/types";

export default function DashboardPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getApplications()
      .then((data) => { if (active) setApplications(data); })
      .catch(() => { if (active) setError("Deine Bewerbungen konnten gerade nicht geladen werden."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const activeCount = applications.filter(({ status }) => !["rejected", "withdrawn"].includes(status)).length;
  const conversations = applications.filter(({ status }) => ["interview", "final_interview"].includes(status)).length;
  const offers = applications.filter(({ status }) => status === "offer").length;
  const recent = [...applications].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);

  return (
    <WorkspaceShell active="Start">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-[#6e6e73]">Dein Überblick</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-1px] md:text-[38px]">Deine Suche. Ganz einfach im Blick.</h1>
          <p className="mt-2 text-base text-muted">Ein guter nächster Schritt reicht für heute.</p>
        </div>
        <Link href="/applications/new" className="inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-full bg-[#0866d6] px-5 text-sm font-semibold text-white hover:bg-[#075bbb]">
          <Plus size={17} /> Bewerbung hinzufügen
        </Link>
      </div>

      {error && <p role="alert" className="mt-6 rounded-xl border border-[#e8c7c7] bg-[#fff8f8] px-4 py-3 text-sm text-[#a32828]">{error}</p>}

      <section aria-label="Deine Zahlen" className="mt-8 grid gap-3 sm:grid-cols-3">
        <Summary label="Bewerbungen" value={loading ? "–" : applications.length} detail="In deiner Liste" />
        <Summary label="In Bearbeitung" value={loading ? "–" : activeCount} detail="Warten auf den nächsten Schritt" />
        <Summary label="Gespräche" value={loading ? "–" : conversations} detail={offers ? `${offers} ${offers === 1 ? "Angebot" : "Angebote"}` : "Das kommt mit der Zeit"} />
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-[-.4px]">Zuletzt geändert</h2>
            <p className="mt-1 text-sm text-muted">Deine drei letzten Bewerbungen.</p>
          </div>
          <Link href="/applications" className="inline-flex items-center gap-1 text-sm font-semibold text-[#0866d6] hover:underline">
            Alle ansehen <ArrowRight size={15} />
          </Link>
        </div>

        {loading ? (
          <div className="mt-4 space-y-3" aria-label="Bewerbungen werden geladen">
            {[0, 1].map((item) => <div key={item} className="h-[82px] animate-pulse rounded-[14px] bg-[#e9e9ed]" />)}
          </div>
        ) : recent.length ? (
          <div className="mt-4 divide-y divide-[#e5e5ea] border-y border-[#e5e5ea]">
            {recent.map((application) => <ApplicationRow key={application.id} application={application} />)}
          </div>
        ) : (
          <div className="glass-surface mt-4 rounded-[14px] border border-dashed border-white/80 px-6 py-10 text-center">
            <h3 className="text-base font-semibold">Hier ist Platz für deine erste Bewerbung.</h3>
            <p className="mt-2 text-sm text-muted">Trag ein, wo du dich bewirbst. Den Rest kannst du später ergänzen.</p>
            <Link href="/applications/new" className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[#0866d6] px-4 text-sm font-semibold text-white hover:bg-[#075bbb]">
              <Plus size={16} /> Erste Bewerbung eintragen
            </Link>
          </div>
        )}
      </section>
    </WorkspaceShell>
  );
}

function Summary({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return (
    <div className="glass-surface rounded-[14px] p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-3 text-3xl font-semibold tabular-nums tracking-[-1px]">{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  );
}

function ApplicationRow({ application }: { application: Application }) {
  return (
    <Link href={`/applications/${application.id}`} className="flex flex-col gap-2 py-4 transition-colors hover:bg-white sm:flex-row sm:items-center sm:justify-between sm:px-3">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{application.company}</span>
        <span className="mt-1 block truncate text-sm text-muted">{application.position}</span>
      </span>
      <span className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${statusStyle[application.status]}`}>
        {statusLabels[application.status]}
      </span>
    </Link>
  );
}

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