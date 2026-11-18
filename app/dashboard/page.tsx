"use client";

import { FormEvent, useEffect, useState } from "react";
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
import { DoodleBurst, DoodlePlane } from "@/components/ui/doodles";
import { Field, Input } from "@/components/ui/input";
import { isPlaceholderName, setMyDisplayName } from "@/lib/profile-names";
import { clearRoleCache } from "@/lib/role";
import { toast } from "@/lib/toast";
import { isClosedStatus, isSentStatus, showsDeadline } from "@/lib/status";
import { RemindersCard } from "@/components/reminders/reminders-card";
import { WeeklyGoal } from "@/components/dashboard/weekly-goal";
import { ProgressPath } from "@/components/dashboard/progress-path";
import { firstName, nextStep } from "@/lib/next-step";
import { loadMyRole } from "@/lib/role";
import { sessionUser } from "@/lib/session-user";
import { todayLocal } from "@/lib/reminders-client";
import type { Application } from "@/types";

export default function DashboardPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState("");
  // null = still loading; "" = no real name known → ask once on Start (schueler-03).
  const [nameKnown, setNameKnown] = useState<boolean | null>(null);

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
    sessionUser().then(async (user) => {
      if (!user) return;
      const profile = await loadMyRole(user).catch(() => null);
      const meta = user.user_metadata ?? {};
      // The default display name is the e-mail prefix (lib/social.ts): never greet with it (schueler-03).
      const real = (value?: string | null) => (isPlaceholderName(value, user.email) ? "" : firstName(value));
      const found = real(profile?.displayName) || real(meta.first_name as string) || real(meta.full_name as string) || real(meta.name as string);
      if (active) { setName(found); setNameKnown(Boolean(found)); }
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
            {!isNew && <p className="font-display max-w-xl text-xl font-semibold leading-snug tracking-[-.01em] sm:text-2xl" data-testid="next-step">{step.text}</p>}
            {!isNew && <ButtonLink href={step.href} variant="sun" className="w-fit shrink-0" data-primary-action="" icon={<ArrowRight size={16} strokeWidth={2.4} />}>{step.cta}</ButtonLink>}
          </div>
        )}
        {!isNew && <p className="mt-3 text-body text-muted">Ein guter nächster Schritt reicht für heute.</p>}
      </header>

      {nameKnown === false && <NamePrompt onSaved={(saved) => { setName(saved); setNameKnown(true); }} />}

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
              <div className="flex flex-wrap items-end justify-between gap-x-3">
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
                          <span className="inline-flex max-w-full flex-wrap items-center gap-x-1.5 text-sm text-muted"><CalendarClock size={15} aria-hidden />{new Date(application.deadline as string).toLocaleDateString("de-CH")}{info && <Badge tone={info.tone}>{info.label}</Badge>}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            <ButtonLink href="/applications/new" variant="ghost" icon={<Plus size={18} strokeWidth={2.4} />}>Bewerbung eintragen</ButtonLink>
          </div>
        </div>
      )}
    </WorkspaceShell>
  );
}

const FIRST_STEPS = [
  { href: "/search", title: "Stelle finden", text: "Durchsuche mehrere Stellenbörsen auf einmal und merke dir, was passt.", color: "text-[var(--brand)]" },
  { href: "/applications/new", title: "Bewerbung eintragen", text: "Halte Firma, Stelle und Status fest.", color: "text-[var(--coral)]" },
  { href: "/friends", title: "Freunde einladen", text: "Zu zweit bleibt man leichter dran.", color: "text-[var(--ink)]" },
];

/** New users: no numbers at all. The three steps ARE the page: a plain numbered list with huge numerals and a doodle. */
function FirstSteps() {
  return (
    <section className="animate-rise mt-8 grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" aria-labelledby="first-steps-h">
      <div className="min-w-0">
        <h2 id="first-steps-h" className="text-heading">So startest du in drei Schritten</h2>
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
        {/* One clear next step for new pupils, on mobile and desktop alike (QA M5, schueler solo-d-076). */}
        <ButtonLink href="/search" variant="sun" className="mt-5 w-fit" data-primary-action="" icon={<ArrowRight size={16} strokeWidth={2.4} />}>Erste Stelle suchen</ButtonLink>
      </div>
      <div aria-hidden className="relative mx-auto hidden h-64 w-full max-w-xs lg:block">
        <DoodlePlane className="absolute right-2 top-10 h-20 w-24 rotate-[-8deg] text-[var(--brand)]" />
        <span className="sticker sticker-coral tilt-r absolute bottom-4 left-10">Deine Lehrstelle wartet</span>
      </div>
    </section>
  );
}

/** No real name yet (e.g. class signup without the tour): ask once, so nobody is greeted with an e-mail prefix (schueler-03). */
function NamePrompt({ onSaved }: { onSaved: (name: string) => void }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = value.trim();
    if (!name) { setError("Gib deinen Vornamen ein. Ein Vorname reicht."); return; }
    setSaving(true); setError("");
    try {
      await setMyDisplayName(name);
      clearRoleCache();
      toast({ message: "Änderungen gespeichert.", tone: "success" });
      onSaved(name.split(/\s+/)[0]);
    } catch (reason) {
      setError(friendlyMessage(reason, "Dein Name konnte nicht gespeichert werden. Versuch es noch einmal."));
    } finally { setSaving(false); }
  }
  return (
    <form onSubmit={save} className="panel mt-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:p-5" aria-labelledby="name-prompt-h">
      <div className="min-w-0 flex-1">
        <h2 id="name-prompt-h" className="text-heading mb-2">Wie dürfen wir dich nennen?</h2>
        <Field label="Vorname" htmlFor="name-prompt" error={error || undefined}>
          <Input id="name-prompt" autoComplete="given-name" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      </div>
      <Button type="submit" variant="secondary" loading={saving} className="min-h-11 w-fit">Speichern</Button>
    </form>
  );
}
