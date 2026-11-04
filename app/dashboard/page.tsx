"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, ChevronRight, Plus, Search, Users } from "lucide-react";
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

const closed: ApplicationStatus[] = ["rejected", "withdrawn"];
const sent: ApplicationStatus[] = ["applied", "interview", "final_interview", "offer"];
const addLink = "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0866d6] px-5 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(8,102,214,.25)] transition hover:bg-[#075bbb] active:scale-[.98] sm:w-fit";

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

  const activeCount = applications.filter(({ status }) => !closed.includes(status)).length;
  const conversations = applications.filter(({ status }) => ["interview", "final_interview"].includes(status)).length;
  const offers = applications.filter(({ status }) => status === "offer").length;
  const recent = [...applications].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);
  const deadlines = applications
    .filter(({ deadline, status }) => deadline && !closed.includes(status) && !sent.includes(status))
    .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""))
    .slice(0, 3);

  return (
    <WorkspaceShell active="Start">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">Dein Überblick</p>
          <h1 className="mt-2 text-balance text-[28px] font-semibold leading-tight tracking-[-1px] md:text-[38px]">Deine Suche. Ganz einfach im Blick.</h1>
          <p className="mt-2 text-base text-muted">Ein guter nächster Schritt reicht für heute.</p>
        </div>
        <Link href="/applications/new" className={addLink}>
          <Plus size={17} /> Bewerbung hinzufügen
        </Link>
      </div>

      {error && <p role="alert" className="mt-6 rounded-xl border border-[#e8c7c7] bg-[#fff8f8] px-4 py-3 text-sm text-[#a32828]">{error}</p>}

      <section aria-label="Deine Zahlen" className="mt-8 grid grid-cols-3 gap-2.5 sm:gap-3">
        <Summary label="Bewerbungen" value={loading ? "–" : applications.length} detail="Insgesamt" />
        <Summary label="Offen" value={loading ? "–" : activeCount} detail="Noch in Arbeit" />
        <Summary label="Gespräche" value={loading ? "–" : conversations} detail={offers ? `${offers} ${offers === 1 ? "Angebot" : "Angebote"}` : "Noch keine"} />
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-[-.4px]">Zuletzt geändert</h2>
            <p className="mt-1 text-sm text-muted">Deine drei letzten Bewerbungen.</p>
          </div>
          <Link href="/applications" className="inline-flex min-h-11 items-center gap-1 px-1 text-sm font-semibold text-[#0866d6] hover:underline">
            Alle ansehen <ArrowRight size={15} />
          </Link>
        </div>

        {loading ? (
          <div className="mt-4 space-y-3" role="status" aria-label="Bewerbungen werden geladen">
            {[0, 1, 2].map((item) => <div key={item} className="h-[76px] animate-pulse rounded-[14px] bg-white/60" />)}
          </div>
        ) : recent.length ? (
          <div className="mt-4 space-y-2.5">
            {recent.map((application) => <ApplicationRow key={application.id} application={application} />)}
          </div>
        ) : (
          <Card className="mt-4 border-dashed px-6 py-10 text-center">
            <h3 className="text-base font-semibold">Hier ist Platz für deine erste Bewerbung.</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">Trag ein, wo du dich bewirbst. Den Rest kannst du später ergänzen.</p>
            <Link href="/applications/new" className={cn(addLink, "mx-auto mt-5 sm:w-fit")}>
              <Plus size={16} /> Erste Bewerbung eintragen
            </Link>
            <div className="mx-auto mt-6 grid max-w-md gap-2 border-t border-[var(--line)] pt-5 text-left sm:grid-cols-2">
              <Link href="/search" className="flex min-h-12 items-center gap-2.5 rounded-xl px-3 text-sm font-medium transition hover:bg-[var(--hover)]"><Search size={16} className="shrink-0 text-[var(--brand)]" />Stellen suchen</Link>
              <Link href="/friends" className="flex min-h-12 items-center gap-2.5 rounded-xl px-3 text-sm font-medium transition hover:bg-[var(--hover)]"><Users size={16} className="shrink-0 text-[var(--brand)]" />Freunde einladen</Link>
            </div>
          </Card>
        )}
      </section>

      {deadlines.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold tracking-[-.4px]">Bald fällig</h2>
          <p className="mt-1 text-sm text-muted">Fristen für Stellen, die du noch nicht abgeschickt hast.</p>
          <div className="mt-4 space-y-2.5">
            {deadlines.map((application) => (
              <Link key={application.id} href={`/applications/${application.id}`} className="glass-surface flex min-h-14 items-center justify-between gap-3 rounded-[14px] px-4 py-3 transition hover:bg-white/80">
                <span className="min-w-0 truncate text-sm font-semibold">{application.company}<span className="font-normal text-muted"> · {application.position}</span></span>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted"><CalendarClock size={15} />{new Date(application.deadline as string).toLocaleDateString("de-CH")}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </WorkspaceShell>
  );
}

function Summary({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return (
    <Card className="min-w-0 p-3.5 sm:p-5">
      <p className="truncate text-xs text-muted sm:text-sm">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-[-1px] sm:mt-3 sm:text-3xl">{value}</p>
      <p className="mt-1 truncate text-[11px] text-muted sm:text-xs">{detail}</p>
    </Card>
  );
}

function ApplicationRow({ application }: { application: Application }) {
  return (
    <Link href={`/applications/${application.id}`} className="glass-surface group flex min-h-[76px] items-center justify-between gap-3 rounded-[14px] px-4 py-3.5 transition hover:-translate-y-px hover:bg-white/80 active:scale-[.99]">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{application.company}</span>
        <span className="mt-1 block truncate text-sm text-muted">{application.position}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <Badge className={statusStyle[application.status]}>{statusLabels[application.status]}</Badge>
        <ChevronRight size={16} className="hidden text-[#a0a0a6] transition group-hover:translate-x-0.5 sm:block" />
      </span>
    </Link>
  );
}
