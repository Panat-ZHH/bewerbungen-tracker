"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, ChevronRight, ClipboardList, Plus, Search, Users } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card } from "@/components/ui/card";
import { getApplications } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { deadlineInfo, friendlyMessage } from "@/lib/ux";
import { Badge } from "@/components/ui/badge";
import { StatusMessage } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { Application, ApplicationStatus } from "@/types";


const closed: ApplicationStatus[] = ["rejected", "withdrawn"];
const sent: ApplicationStatus[] = ["applied", "interview", "final_interview", "offer"];
const addLink = "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[image:var(--brand-gradient)] px-5 text-sm font-semibold text-white shadow-[var(--shadow-brand)] transition hover:brightness-110 active:scale-[.98] sm:w-fit";

export default function DashboardPage() {
  const [applications, setApplications] = useState<Application[]>([]);
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

      {error && <StatusMessage tone="danger" className="mt-6"><p>{error}</p><Button size="sm" variant="secondary" className="mt-2" onClick={() => { setLoading(true); setAttempt((n) => n + 1); }}>Erneut versuchen</Button></StatusMessage>}

      <section aria-label="Deine Zahlen" className="mt-8 grid grid-cols-3 gap-2.5 sm:gap-3">
        <Summary label="Bewerbungen" value={loading ? "–" : applications.length} detail="Insgesamt" />
        <Summary label="Offen" value={loading ? "–" : activeCount} detail="Noch in Arbeit" />
        <Summary label="Gespräche" value={loading ? "–" : conversations} detail={offers ? `${offers} ${offers === 1 ? "Zusage" : "Zusagen"}` : "Noch keine"} />
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-[-.4px]">Zuletzt geändert</h2>
            <p className="mt-1 text-sm text-muted">Deine drei letzten Bewerbungen.</p>
          </div>
          <Link href="/applications" className="inline-flex min-h-11 items-center gap-1 px-1 text-sm font-semibold text-[var(--brand)] hover:underline">
            Alle ansehen <ArrowRight size={15} />
          </Link>
        </div>

        {loading ? (
          <div className="mt-4 space-y-3" role="status" aria-label="Bewerbungen werden geladen">
            {[0, 1, 2].map((item) => <div key={item} className="h-[76px] skeleton rounded-[14px]" />)}
          </div>
        ) : recent.length ? (
          <div className="mt-4 space-y-2.5">
            {recent.map((application) => <ApplicationRow key={application.id} application={application} />)}
          </div>
        ) : (
          <Card className="mt-4 border-dashed p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><ClipboardList size={22} /></span>
              <div>
                <h3 className="text-base font-semibold">Willkommen! So startest du in drei Schritten.</h3>
                <p className="text-sm text-muted">Du musst nicht alles auf einmal wissen – Firma und Stelle reichen.</p>
              </div>
            </div>
            <ol className="mt-5 space-y-2">
              {[
                { href: "/search", icon: Search, title: "Stelle finden", text: "Durchsuche mehrere Stellenbörsen auf einmal und merke dir, was passt." },
                { href: "/applications/new", icon: Plus, title: "Bewerbung eintragen", text: "Halte Firma, Stelle und deinen Stand fest." },
                { href: "/friends", icon: Users, title: "Freunde einladen", text: "Zu zweit bleibt man leichter dran." },
              ].map(({ href, icon: Icon, title, text }, index) => (
                <li key={href}>
                  <Link href={href} className="flex min-h-14 items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--raised)] px-3.5 py-2.5 transition hover:bg-[var(--hover)]">
                    <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-xs font-bold text-[var(--brand-strong)]">{index + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{title}</span><span className="block text-xs text-muted">{text}</span></span>
                    <Icon size={16} aria-hidden className="shrink-0 text-[var(--brand)]" />
                  </Link>
                </li>
              ))}
            </ol>
            <Link href="/applications/new" className={cn(addLink, "mt-5")}>
              <Plus size={16} /> Erste Bewerbung eintragen
            </Link>
          </Card>
        )}
      </section>

      {deadlines.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold tracking-[-.4px]">Bald fällig</h2>
          <p className="mt-1 text-sm text-muted">Fristen für Stellen, die du noch nicht abgeschickt hast.</p>
          <div className="mt-4 space-y-2.5">
            {deadlines.map((application) => (
              <Link key={application.id} href={`/applications/${application.id}`} className="glass-surface flex min-h-14 items-center justify-between gap-3 rounded-[14px] px-4 py-3 transition hover:bg-[var(--raised-hover)]">
                <span className="min-w-0 truncate text-sm font-semibold">{application.company}<span className="font-normal text-muted"> · {application.position}</span></span>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted"><CalendarClock size={15} aria-hidden />{new Date(application.deadline as string).toLocaleDateString("de-CH")}{(() => { const info = deadlineInfo(application.deadline as string); return info && <Badge tone={info.tone}>{info.label}</Badge>; })()}</span>
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
    <Link href={`/applications/${application.id}`} className="glass-surface group flex min-h-[76px] items-center justify-between gap-3 rounded-[14px] px-4 py-3.5 transition hover:-translate-y-px hover:bg-[var(--raised-hover)] active:scale-[.99]">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{application.company}</span>
        <span className="mt-1 block truncate text-sm text-muted">{application.position}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <StatusBadge status={application.status} />
        <ChevronRight size={16} className="hidden text-[var(--muted)] transition group-hover:translate-x-0.5 sm:block" />
      </span>
    </Link>
  );
}
