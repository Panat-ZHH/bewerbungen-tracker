"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Building2, GraduationCap, Mail, Plus, ShieldCheck, TriangleAlert, Users } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateCh } from "@/lib/teacher-extras";
import { attachClassToSchool, detachClassFromSchool, getMySchools, type SchoolOverview } from "@/lib/b2b/client";
import { licenceError } from "@/lib/b2b/licence";
import { ErrorBanner, teacherError } from "@/components/teacher/shared";
import { PACKAGE_INFO, daysRemaining, licenceUsage, packageLabel, pilotText, statusLabel, type LicencePackage } from "./logic";
import { ProgressBar } from "./progress-bar";
import { BillingCard } from "@/components/billing/billing-card";
import { onlinePaymentEnabled } from "@/components/billing/logic";

const STATUS_TONE: Record<string, BadgeTone> = { pilot: "info", active: "success", expired: "danger", cancelled: "neutral" };

/** School administration: licence, student count vs. limit, pilot, "Abo & Rechnung" (components/billing, behind the flag), classes and teachers; classes are attached with their join code. */
export function SchoolAdminView() {
  const [schools, setSchools] = useState<SchoolOverview[] | null | undefined>(undefined);
  const [error, setError] = useState("");
  const load = useCallback(() => { getMySchools().then((s) => { setSchools(s); setError(""); }).catch((e) => setError(teacherError(e))); }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-8">
      <PageHeader title="Schuladministration" description="Lizenz, Nutzung und Klassen deiner Schule auf einen Blick. Klassen ordnest du mit ihrem Klassencode der Schule zu." />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {schools === undefined && !error && <div className="space-y-3" aria-busy="true"><Skeleton className="h-32 rounded-[var(--radius-lg)]" /><Skeleton className="h-48 rounded-[var(--radius-lg)]" /></div>}
      {schools === null && <EmptyState icon={<Building2 size={26} />} title="Schulverwaltung wird eingerichtet" description="Die Schulverwaltung ist für dein Konto noch nicht freigeschaltet. Melde dich bei uns, wenn deine Schule WendApply einsetzen möchte." action={<ButtonLink href="/kontakt" variant="sun" icon={<Mail size={16} />}>Kontakt aufnehmen</ButtonLink>} />}
      {schools && schools.length === 0 && <EmptyState icon={<ShieldCheck size={26} />} title="Keine Schule zugeordnet" description="Dein Konto ist keiner Schule als Administrator:in zugeordnet. Die Zuordnung übernimmt das WendApply-Team nach Vertragsabschluss oder für einen Pilot." action={<ButtonLink href="/kontakt" variant="secondary" icon={<Mail size={16} />}>Kontakt aufnehmen</ButtonLink>} />}
      {schools?.map((s, i) => <SchoolBlock key={s.id} school={s} first={i === 0} onChanged={load} />)}
    </div>
  );
}

function SchoolBlock({ school, first, onChanged }: { school: SchoolOverview; first: boolean; onChanged: () => void }) {
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
          <p className="text-small flex items-start gap-2 text-muted"><Mail size={14} className="mt-0.5 shrink-0" aria-hidden />{onlinePaymentEnabled()
            ? <span>Abo, Zahlung und Rechnungen: siehe «Abo &amp; Rechnung». Paketwechsel über Kontakt oder im Kundenportal.</span>
            : <span>Paketwechsel über Kontakt: Schreib uns über die <Link href="/kontakt" className="font-semibold underline underline-offset-2">Kontaktseite</Link>. Hier werden keine Zahlungen abgewickelt.</span>}</p>
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

      <BillingCard schoolId={school.id} anchor={first} />

      <div className="grid gap-x-12 gap-y-8 lg:grid-cols-2">
        <section aria-labelledby={`classes-${school.id}`}>
          <h3 id={`classes-${school.id}`} className="text-heading flex items-center gap-2"><GraduationCap size={18} aria-hidden /> Klassen {school.classes && <Badge>{school.classes.length}</Badge>}</h3>
          {school.classes === null ? <p className="text-small mt-2 text-muted">Die Klassenliste ist noch nicht verfügbar.</p> : school.classes.length === 0 ? <p className="text-small mt-2 text-muted">Noch keine Klasse ist dieser Schule zugeordnet.</p> : (
            <ul className="rows mt-2">
              {school.classes.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0"><p className="truncate text-sm font-bold">{c.name}{c.archived && <Badge tone="info" className="ml-2">Archiviert</Badge>}</p><p className="text-small text-muted">{c.schoolYear ? `Schuljahr ${c.schoolYear}` : "Ohne Schuljahr"}{c.teacherName && ` · ${c.teacherName}`}{c.studentsWithApplication !== null && ` · ${c.studentsWithApplication} mit Bewerbung`}{c.studentsPlaced !== null && ` · ${c.studentsPlaced} mit Lehrstelle`}</p></div>
                  <span className="flex items-center gap-3"><span className="tabular text-sm font-semibold">{c.students} {c.students === 1 ? "Schüler:in" : "Schüler:innen"}</span><DetachButton schoolId={school.id} classId={c.id} name={c.name} onDone={onChanged} /></span>
                </li>
              ))}
            </ul>
          )}
          {school.classes !== null && <AttachClassForm schoolId={school.id} onDone={onChanged} />}
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

/** German message for attach / detach errors: licence (WA001-WA003) first, then the RPC codes. */
function adminError(e: unknown): string {
  const err = e as Error & { code?: string; details?: string | null };
  const licence = licenceError({ code: err?.code, message: err?.message, details: err?.details ?? null });
  // The DB detail says "Die Schulleitung kann die Lizenz erweitern" (written for teachers/students); admins get the next step instead.
  if (licence?.code === "LICENCE_LIMIT_REACHED") return "Die Lizenz ist voll: Diese Klasse hat nicht mehr genug freie Plätze. Für mehr Plätze meldet euch über die Kontaktseite.";
  if (licence) return licence.message;
  const msg = String(err?.message ?? "");
  if (msg.includes("CLASS_IN_OTHER_SCHOOL")) return "Diese Klasse gehört bereits zu einer anderen Schule.";
  if (msg.includes("CLASS_NOT_FOUND")) return "Diesen Klassencode gibt es nicht. Prüfe die Schreibweise.";
  return teacherError(e);
}

function AttachClassForm({ schoolId, onDone }: { schoolId: string; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const id = `attach-${schoolId}`;
  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!code.trim()) { setMsg({ tone: "danger", text: "Bitte gib den Klassencode ein." }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await attachClassToSchool(schoolId, code);
      setMsg({ tone: "success", text: `«${r.name}» ist jetzt der Schule zugeordnet (${r.students} ${r.students === 1 ? "Schüler:in" : "Schüler:innen"}).` });
      setCode(""); onDone();
    } catch (e) { setMsg({ tone: "danger", text: adminError(e) }); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="mt-4 space-y-2" noValidate>
      <Field label="Klasse hinzufügen" htmlFor={id} hint="Den Klassencode findet die Lehrperson in ihrer Klasse. Die Schüler:innen der Klasse zählen dann zur Lizenz.">
        <div className="flex flex-wrap gap-2">
          <Input id={id} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} className="max-w-48 uppercase" placeholder="z. B. AB12CD" />
          <Button type="submit" variant="secondary" loading={busy} icon={<Plus size={16} />}>Zuordnen</Button>
        </div>
      </Field>
      {msg && <p role={msg.tone === "danger" ? "alert" : "status"} className={`status status-${msg.tone} text-sm`}>{msg.text}</p>}
    </form>
  );
}

function DetachButton({ schoolId, classId, name, onDone }: { schoolId: string; classId: string; name: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function detach() {
    if (!window.confirm(`«${name}» von der Schule lösen? Die Klasse bleibt bei der Lehrperson bestehen, zählt aber nicht mehr zur Lizenz.`)) return;
    setBusy(true);
    try { await detachClassFromSchool(schoolId, classId); onDone(); } catch (e) { window.alert(adminError(e)); } finally { setBusy(false); }
  }
  return <Button type="button" size="sm" variant="ghost" loading={busy} onClick={detach} aria-label={`${name} von der Schule lösen`}>Lösen</Button>;
}
