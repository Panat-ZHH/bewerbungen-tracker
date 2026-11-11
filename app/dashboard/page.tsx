"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, Plus } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { NoticesCard } from "@/components/classes/notices-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getApplications } from "@/lib/storage";
import { deadlineInfo, friendlyMessage } from "@/lib/ux";
import { Badge } from "@/components/ui/badge";
import { StatusMessage } from "@/components/ui/skeleton";
import { Button, ButtonLink } from "@/components/ui/button";
import { DoodleArrow, DoodleBurst, DoodlePlane, DoodleSparkle, DoodleTrail } from "@/components/ui/doodles";
import { isClosedStatus, isSentStatus, showsDeadline } from "@/lib/status";
import { RemindersCard } from "@/components/reminders/reminders-card";
import { WeeklyGoal } from "@/components/dashboard/weekly-goal";
import { ProgressPath } from "@/components/dashboard/progress-path";
import { firstName, nextStep } from "@/lib/next-step";
import { loadMyRole } from "@/lib/role";
import { supabase } from "@/lib/supabase";
import { todayLocal } from "@/lib/reminders-client";
import type { Application } from "@/types";

export default function DashboardPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState("");

  useEffect(() => {
    let active = true;
    getApplications()
      .then((data) => { if (active) { setApplications(data); setError(""); } })
      .catch((reason) => { if (active) setError(friendlyMessage(reason, "Deine Bewerbungen konnten nicht geladen werden.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  // Name for the greeting: profile name first, then the name from the sign-up; never an e-mail address.
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const profile = await loadMyRole(data.user).catch(() => null);
      const meta = data.user.user_metadata ?? {};
      const found = firstName(profile?.displayName) || firstName(meta.first_name as string) || firstName(meta.full_name as string) || firstName(meta.name as string);
      if (active) setName(found);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const isNew = !loading && !error && applications.length === 0;
  const step = nextStep(applications, todayLocal());
  const recent = [...applications].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);
  const deadlines = applications
    .filter(({ deadline, status }) => deadline && showsDeadline(status) && !isSentStatus(status) && !isClosedStatus(status))
    .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""))
    .slice(0, 3);

  return (
    <WorkspaceShell active="Start">
      <header className="animate-rise relative">
        <h1 className="text-display">Hoi{name ? <> <span className="marker">{name}</span></> : ""}!<DoodleBurst className="ml-1 inline-block h-[.7em] w-[.7em] -translate-y-[.35em] text-[var(--coral)]" /></h1>
        {loading ? (
          <div className="skeleton mt-4 h-7 w-64 max-w-full" role="status" aria-label="Dein nächster Schritt wird geladen" />
        ) : !error && (
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
            <p className="font-display max-w-xl text-xl font-semibold leading-snug tracking-[-.01em] sm:text-2xl" data-testid="next-step">{step.text}</p>
            {!isNew && <ButtonLink href={step.href} variant="sun" className="w-fit shrink-0" icon={<ArrowRight size={16} strokeWidth={2.4} />}>{step.cta}</ButtonLink>}
          </div>
        )}
        {!isNew && <p className="mt-3 text-body text-muted">Ein guter nächster Schritt reicht für heute.</p>}
      </header>

      <NoticesCard />

      {error && <StatusMessage tone="danger" className="mt-6"><p>{error}</p><Button size="sm" variant="secondary" className="mt-2" onClick={() => { setLoading(true); setAttempt((n) => n + 1); }}>Erneut versuchen</Button></StatusMessage>}

      {loading && (
        <div className="mt-8 space-y-3" role="status" aria-label="Bewerbungen werden geladen">
          <div className="skeleton h-28" />
          {[0, 1].map((item) => <div key={item} className="skeleton h-14" />)}
        </div>
      )}

      {isNew && <FirstSteps />}

      {!loading && applications.length > 0 && (
        <div className="mt-9 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <ProgressPath applications={applications} />

            <section className="mt-10">
              <div className="flex items-end justify-between gap-3">
                <h2 className="text-heading">Zuletzt geändert</h2>
                <Link href="/applications" className="inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap px-1 text-sm font-semibold text-[var(--brand)] hover:underline">
                  Alle ansehen <ArrowRight size={15} />
                </Link>
              </div>
              <ul className="rows mt-1 border-y-[length:var(--border-w)] border-[var(--outline)]">
                {recent.map((application) => (
                  <li key={application.id}>
                    <Link href={`/applications/${application.id}`} className="row-link justify-between">
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-bold">{application.company}</span>
                        <span className="block truncate text-sm text-muted">{application.position}</span>
                      </span>
                      <StatusBadge status={application.status} className="shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="min-w-0 space-y-10">
            <WeeklyGoal applications={applications} />
            {!error && <RemindersCard applications={applications} />}
            {deadlines.length > 0 && (
              <section>
                <h2 className="text-heading">Bald fällig</h2>
                <p className="mt-1 text-sm text-muted">Fristen für Stellen, die du noch nicht abgeschickt hast.</p>
                <ul className="rows mt-2">
                  {deadlines.map((application) => {
                    const info = deadlineInfo(application.deadline as string);
                    return (
                      <li key={application.id}>
                        <Link href={`/applications/${application.id}`} className="row-link flex-wrap justify-between gap-y-1">
                          <span className="min-w-0 truncate text-sm font-bold">{application.company}<span className="font-normal text-muted"> · {application.position}</span></span>
                          <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted"><CalendarClock size={15} aria-hidden />{new Date(application.deadline as string).toLocaleDateString("de-CH")}{info && <Badge tone={info.tone}>{info.label}</Badge>}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            <ButtonLink href="/applications/new" full size="lg" icon={<Plus size={18} strokeWidth={2.4} />}>Bewerbung hinzufügen</ButtonLink>
          </div>
        </div>
      )}
    </WorkspaceShell>
  );
}

const FIRST_STEPS = [
  { href: "/search", title: "Stelle finden", text: "Durchsuche mehrere Stellenbörsen auf einmal und merke dir, was passt.", color: "text-[var(--brand)]" },
  { href: "/applications/new", title: "Bewerbung eintragen", text: "Halte Firma, Stelle und deinen Stand fest.", color: "text-[var(--coral)]" },
  { href: "/friends", title: "Freunde einladen", text: "Zu zweit bleibt man leichter dran.", color: "text-[var(--ink)]" },
];

/** New users: no numbers at all. The three steps ARE the page: a plain numbered list with huge numerals and a doodle. */
function FirstSteps() {
  return (
    <section className="animate-rise mt-8 grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" aria-labelledby="first-steps-h">
      <div className="min-w-0">
        <h2 id="first-steps-h" className="text-heading">Willkommen! So startest du in drei Schritten.</h2>
        <p className="mt-1 text-body text-muted">Du musst nicht alles auf einmal wissen – Firma und Stelle reichen.</p>
        <ol className="rows mt-4 border-y-[length:var(--border-w)] border-[var(--outline)]">
          {FIRST_STEPS.map(({ href, title, text, color }, index) => (
            <li key={href}>
              <Link href={href} className="group flex items-center gap-4 py-4 sm:gap-6">
                <span aria-hidden className={`num-display w-[.62em] shrink-0 text-center ${color}`}>{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-display block text-xl font-bold leading-tight tracking-[-.02em] group-hover:underline group-hover:decoration-[var(--sun)] group-hover:decoration-4 group-hover:underline-offset-4">{title}</span>
                  <span className="mt-1 block text-sm text-muted">{text}</span>
                </span>
                <ArrowRight size={22} strokeWidth={2.4} aria-hidden className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex items-center gap-3">
          <ButtonLink href="/applications/new" size="lg" icon={<Plus size={18} strokeWidth={2.4} />}>Erste Bewerbung eintragen</ButtonLink>
          <DoodleArrow className="hidden h-9 w-12 -scale-x-100 rotate-[200deg] text-[var(--ink)] min-[420px]:block" />
        </div>
      </div>
      <div aria-hidden className="relative mx-auto hidden h-64 w-full max-w-xs lg:block">
        <span className="sticker tilt-l3 absolute left-2 top-6 text-base">Los geht’s!</span>
        <DoodleTrail className="absolute left-0 top-24 h-20 w-56 text-[var(--ink)]" />
        <DoodlePlane className="absolute right-2 top-10 h-20 w-24 rotate-[-8deg] text-[var(--brand)]" />
        <DoodleSparkle className="absolute bottom-10 right-12 h-9 w-9 text-[var(--sun)]" />
        <span className="sticker sticker-coral tilt-r absolute bottom-4 left-10">Deine Lehrstelle wartet</span>
      </div>
    </section>
  );
}
