"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Building2, GraduationCap, Mail, ShieldCheck, TriangleAlert, Users } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateCh } from "@/lib/teacher-extras";
import { getMySchools, type SchoolOverview } from "@/lib/b2b/client";
import { ErrorBanner, teacherError } from "@/components/teacher/shared";
import { PACKAGE_INFO, daysRemaining, licenceUsage, packageLabel, pilotText, statusLabel, type LicencePackage } from "./logic";
import { ProgressBar } from "./progress-bar";

const STATUS_TONE: Record<string, BadgeTone> = { pilot: "info", active: "success", expired: "danger", cancelled: "neutral" };

/** Read-only school administration: licence, student count vs. limit, pilot, classes and teachers. No payments here. */
export function SchoolAdminView() {
  const [schools, setSchools] = useState<SchoolOverview[] | null | undefined>(undefined);
  const [error, setError] = useState("");
  const load = useCallback(() => { getMySchools().then((s) => { setSchools(s); setError(""); }).catch((e) => setError(teacherError(e))); }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-8">
      <PageHeader title="Schuladministration" description="Lizenz, Nutzung und Klassen deiner Schule auf einen Blick. Diese Ansicht ist nur zum Lesen." />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {schools === undefined && !error && <div className="space-y-3" aria-busy="true"><Skeleton className="h-32 rounded-[var(--radius-lg)]" /><Skeleton className="h-48 rounded-[var(--radius-lg)]" /></div>}
      {schools === null && <EmptyState icon={<Building2 size={26} />} title="Schulverwaltung wird eingerichtet" description="Die Schulverwaltung ist für dein Konto noch nicht freigeschaltet. Melde dich bei uns, wenn deine Schule WendApply einsetzen möchte." action={<ButtonLink href="/kontakt" variant="sun" icon={<Mail size={16} />}>Kontakt aufnehmen</ButtonLink>} />}
      {schools && schools.length === 0 && <EmptyState icon={<ShieldCheck size={26} />} title="Keine Schule zugeordnet" description="Dein Konto ist keiner Schule als Administrator:in zugeordnet. Die Zuordnung übernimmt das WendApply-Team nach Vertragsabschluss oder für einen Pilot." action={<ButtonLink href="/kontakt" variant="secondary" icon={<Mail size={16} />}>Kontakt aufnehmen</ButtonLink>} />}
      {schools?.map((s) => <SchoolBlock key={s.id} school={s} />)}
    </div>
  );
}

function SchoolBlock({ school }: { school: SchoolOverview }) {
  const l = school.licence;
  const pkg = (l?.package ?? "") as LicencePackage;
  const limit = l?.studentLimit ?? PACKAGE_INFO[pkg]?.limit ?? null;
  const usage = licenceUsage(school.studentCount ?? 0, limit);
  const isPilot = !!l && (l.state === "pilot" || l.status === "pilot" || pkg === "pilot");
  const pilotDays = isPilot ? (l?.pilotEnd ? daysRemaining(l.pilotEnd) : l?.daysLeft ?? null) : null;
  const validDays = daysRemaining(l?.validUntil);

  return (
    <section aria-labelledby={`school-${school.id}`} className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id={`school-${school.id}`} className="font-display text-2xl font-extrabold tracking-[-.02em]"><Building2 size={22} className="mr-2 inline align-[-3px]" aria-hidden />{school.name}</h2>
        {school.region && <span className="text-small text-muted">{school.region}</span>}
        {l && <Badge tone={STATUS_TONE[l.state ?? l.status] ?? "neutral"}>{statusLabel(l.state ?? l.status)}</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="panel-flat space-y-3 p-5">
          <h3 className="text-heading">Lizenz</h3>
          {!l ? <p className="text-sm text-muted">Für diese Schule ist noch keine Lizenz hinterlegt.</p> : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Paket</dt><dd className="font-bold">{packageLabel(l.package)}{limit ? <span className="font-normal text-muted"> · bis {limit} Schüler:innen</span> : null}</dd>
              <dt className="text-muted">Status</dt><dd className="font-semibold">{statusLabel(l.state ?? l.status)}</dd>
              {isPilot && <><dt className="text-muted">Pilot</dt><dd className="font-semibold">{pilotText(pilotDays)}{l.pilotStart && l.pilotEnd && <span className="font-normal text-muted"> ({formatDateCh(l.pilotStart)} – {formatDateCh(l.pilotEnd)})</span>}</dd></>}
              {l.validUntil && <><dt className="text-muted">Gültig bis</dt><dd className="font-semibold">{formatDateCh(l.validUntil)}{validDays !== null && validDays >= 0 && validDays <= 30 && <Badge tone="warning" className="ml-2">in {validDays} Tagen</Badge>}</dd></>}
            </dl>
          )}
          <p className="text-small flex items-start gap-2 text-muted"><Mail size={14} className="mt-0.5 shrink-0" aria-hidden /><span>Paketwechsel über Kontakt: Schreib uns über die <Link href="/kontakt" className="font-semibold underline underline-offset-2">Kontaktseite</Link>. Hier werden keine Zahlungen abgewickelt.</span></p>
        </div>

        <div className="panel-flat space-y-3 p-5">
          <h3 className="text-heading flex items-center gap-2"><Users size={18} aria-hidden /> Schüler:innen</h3>
          {school.studentCount === null ? <p className="text-sm text-muted">Die Anzahl kann gerade nicht berechnet werden.</p> : (
            <>
              <p className="flex items-end gap-2"><span className="num-big">{school.studentCount}</span>{limit ? <span className="pb-0.5 text-sm text-muted">von {limit} im Paket</span> : <span className="pb-0.5 text-sm text-muted">ohne feste Obergrenze</span>}</p>
              {usage.percent !== null && <ProgressBar value={school.studentCount} max={limit ?? 1} tone={usage.level === "ok" ? "mint" : usage.level === "warning" ? "warning" : "danger"} label="Auslastung der Lizenz" valueText={`${school.studentCount} von ${limit} Schüler:innen, ${usage.percent} Prozent`} />}
              {usage.level === "warning" && <p role="status" className="status status-warning flex items-start gap-2 text-sm"><TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />Über 90 % der Plätze sind belegt (noch {usage.remaining} frei). Für mehr Plätze meldet euch über Kontakt.</p>}
              {usage.level === "full" && <p role="status" className="status status-danger flex items-start gap-2 text-sm"><TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />Das Paket ist voll. Neue Schüler:innen können nur nach einem Paketwechsel dazukommen. Meldet euch über Kontakt.</p>}
            </>
          )}
        </div>
      </div>

      <div className="grid gap-x-12 gap-y-8 lg:grid-cols-2">
        <section aria-labelledby={`classes-${school.id}`}>
          <h3 id={`classes-${school.id}`} className="text-heading flex items-center gap-2"><GraduationCap size={18} aria-hidden /> Klassen {school.classes && <Badge>{school.classes.length}</Badge>}</h3>
          {school.classes === null ? <p className="text-small mt-2 text-muted">Die Klassenliste ist noch nicht verfügbar.</p> : school.classes.length === 0 ? <p className="text-small mt-2 text-muted">Noch keine Klasse ist dieser Schule zugeordnet.</p> : (
            <ul className="rows mt-2">
              {school.classes.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0"><p className="truncate text-sm font-bold">{c.name}{c.archived && <Badge tone="info" className="ml-2">Archiviert</Badge>}</p><p className="text-small text-muted">{c.schoolYear ? `Schuljahr ${c.schoolYear}` : "Ohne Schuljahr"}{c.teacherName && ` · ${c.teacherName}`}{c.studentsWithApplication !== null && ` · ${c.studentsWithApplication} mit Bewerbung`}{c.studentsPlaced !== null && ` · ${c.studentsPlaced} mit Lehrstelle`}</p></div>
                  <span className="tabular text-sm font-semibold">{c.students} {c.students === 1 ? "Schüler:in" : "Schüler:innen"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby={`teachers-${school.id}`}>
          <h3 id={`teachers-${school.id}`} className="text-heading flex items-center gap-2"><Users size={18} aria-hidden /> Lehrpersonen {school.teachers && <Badge>{school.teachers.length}</Badge>}</h3>
          {school.teachers === null ? <p className="text-small mt-2 text-muted">Die Liste der Lehrpersonen ist noch nicht verfügbar.</p> : school.teachers.length === 0 ? <p className="text-small mt-2 text-muted">Noch keine Lehrperson aktiv.</p> : (
            <ul className="rows mt-2">
              {school.teachers.map((t) => (
                <li key={t.userId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                  <p className="min-w-0 truncate text-sm font-bold">{t.displayName || "Ohne Namen"}</p>
                  <span className="tabular text-sm text-muted">{t.classes} {t.classes === 1 ? "Klasse" : "Klassen"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <p className="text-small flex items-start gap-2 text-muted"><ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden /> Als Schuladministration siehst du nur Zahlen pro Klasse, und nur von Schüler:innen, die ihre Daten teilen. Bei weniger als drei Personen bleiben die Zahlen ausgeblendet. Bewerbungen und persönliche Daten der Schüler:innen bleiben bei ihnen und ihren Lehrpersonen.</p>
    </section>
  );
}
