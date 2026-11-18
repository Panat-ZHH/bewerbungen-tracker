"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Building2, ChevronDown, GraduationCap, HelpCircle, Mail, Plus, ReceiptText, ShieldCheck, TriangleAlert, UserPlus, Users } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { SUPPORT_EMAIL } from "@/lib/access/gate";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateCh } from "@/lib/teacher-extras";
import { attachClassToSchool, detachClassFromSchool, getMySchools, type SchoolClassInfo, type SchoolOverview } from "@/lib/b2b/client";
import { licenceError } from "@/lib/b2b/licence";
import { ErrorBanner, teacherError } from "@/components/teacher/shared";
import { PACKAGE_INFO, daysRemaining, licenceUsage, packageLabel, pilotText, statusLabel, type LicencePackage } from "./logic";
import { ProgressBar } from "./progress-bar";
import { BillingCard } from "@/components/billing/billing-card";
import { onlinePaymentEnabled } from "@/components/billing/logic";

const STATUS_TONE: Record<string, BadgeTone> = { pilot: "info", active: "success", expired: "danger", cancelled: "neutral" };

/** School administration: status + seats first, then classes and teachers (the daily job), then "Lizenz & Rechnung" (components/billing, behind the flag). Classes are attached with their join code. */
export function SchoolAdminView() {
  const [schools, setSchools] = useState<SchoolOverview[] | null | undefined>(undefined);
  const [error, setError] = useState("");
  const load = useCallback(() => { getMySchools().then((s) => { setSchools(s); setError(""); }).catch((e) => setError(teacherError(e))); }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-8">
      <PageHeader title="Schuladministration" description="Lizenz, Plätze, Klassen und Lehrpersonen deiner Schule." />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {schools === undefined && !error && <div className="space-y-3" aria-busy="true"><Skeleton className="h-32 rounded-[var(--radius-lg)]" /><Skeleton className="h-48 rounded-[var(--radius-lg)]" /></div>}
      {(schools === null || (schools && schools.length === 0)) && <EmptyState icon={<ShieldCheck size={26} />} title="Keine Schule zugeordnet" description="Dein Konto ist noch keiner Schule als Schuladmin zugeordnet. Das WendApply-Team richtet das nach dem Pilot- oder Lizenzvertrag ein." action={<ButtonLink href="/kontakt" variant="secondary" icon={<Mail size={16} />}>Kontakt aufnehmen</ButtonLink>} />}
      {schools?.map((s, i) => <SchoolBlock key={s.id} school={s} first={i === 0} onChanged={load} />)}
      {schools && schools.length > 0 && <p className="text-small text-muted"><HelpCircle size={14} className="mr-1 inline align-[-2px]" aria-hidden />Fragen zur Schullizenz? <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Frage Schuladmin")}`} className="font-semibold underline underline-offset-2">Schreib uns</a>.</p>}
    </div>
  );
}

const isExpiredStatus = (s: string | null | undefined) => s === "expired" || s === "cancelled";

/** One status sentence for the school header (schule-20): is everything OK? */
function statusLine({ hasLicence, expired, isPilot, until, students, limit, full }: { hasLicence: boolean; expired: boolean; isPilot: boolean; until: string | null; students: number | null; limit: number | null; full: boolean }): { tone: "success" | "warning" | "danger" | "info"; text: string } {
  if (!hasLicence) return { tone: "info", text: "Eure Schule hat noch keine Lizenz. Lehrpersonen und Schüler:innen können WendApply erst mit einer Schullizenz nutzen." };
  if (expired) return { tone: "danger", text: "Die Lizenz ist abgelaufen." };
  const seats = students !== null && limit ? `, ${students} von ${limit} Plätzen belegt` : "";
  if (full) return { tone: "warning", text: `Das Paket ist voll${seats}.` };
  if (isPilot) return { tone: "info", text: `Pilot läuft${until ? ` bis ${formatDateCh(until)}` : ""}${seats}.` };
  return { tone: "success", text: `Alles in Ordnung: Lizenz aktiv${until ? ` bis ${formatDateCh(until)}` : ""}${seats}.` };
}

function SchoolBlock({ school, first, onChanged }: { school: SchoolOverview; first: boolean; onChanged: () => void }) {
  const l = school.licence;
  const pkg = (l?.package ?? "") as LicencePackage;
  const limit = l?.studentLimit ?? PACKAGE_INFO[pkg]?.limit ?? null;
  const usage = licenceUsage(school.studentCount ?? 0, limit);
  const status = l?.state ?? l?.status ?? null;
  const isPilot = !!l && (l.state === "pilot" || l.status === "pilot" || pkg === "pilot");
  const expired = !!l && isExpiredStatus(status);
  const pilotDays = isPilot ? (l?.pilotEnd ? daysRemaining(l.pilotEnd) : l?.daysLeft ?? null) : null;
  const validDays = daysRemaining(l?.validUntil);
  const until = isPilot ? (l?.pilotEnd ?? l?.validUntil ?? null) : (l?.validUntil ?? null);
  const full = usage.level === "full";
  const line = statusLine({ hasLicence: !!l, expired, isPilot, until, students: school.studentCount, limit, full });
  // Valid paid/manual licence: buying stays available, but collapsed (schule-11/12). No licence, pilot or expired: open.
  const licensed = !!l && !expired && !isPilot;
  const [billingOpen, setBillingOpen] = useState(false);
  // Links to #abo («Paket wechseln», /preise) open the collapsed section.
  useEffect(() => {
    if (!first) return;
    const sync = () => { if (window.location.hash !== "#abo") return; setBillingOpen(true); requestAnimationFrame(() => document.getElementById("abo")?.scrollIntoView({ block: "start" })); };
    sync(); window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [first]);

  return (
    <section aria-labelledby={`school-${school.id}`} className="space-y-8">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id={`school-${school.id}`} className="font-display text-2xl font-extrabold tracking-[-.02em]"><Building2 size={22} className="mr-2 inline align-[-3px]" aria-hidden />{school.name}</h2>
          {school.region && <span className="text-small text-muted">{school.region}</span>}
          {l && <Badge tone={STATUS_TONE[status ?? ""] ?? "neutral"}>{statusLabel(status)}</Badge>}
        </div>
        {!expired && <p role="status" data-testid="school-status-line" className={`status status-${line.tone} text-sm`}>{line.text}</p>}
        <p className="text-small flex items-start gap-2 text-muted"><ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden /><span><strong className="font-semibold text-[var(--ink)]">Datenschutz:</strong> Als Schuladmin siehst du nur Zahlen pro Klasse, und nur von Schüler:innen, die ihre Daten teilen – keine Namen von Schüler:innen, keine Bewerbungen oder Firmen. Unter drei Personen bleiben die Zahlen ausgeblendet.</span></p>
      </div>

      {expired && (
        <div role="alert" data-testid="licence-expired" className="status status-danger flex-col items-start gap-3">
          <p className="flex items-start gap-2"><TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden /><span><strong className="block">Die Lizenz ist {l?.validUntil ? `am ${formatDateCh(l.validUntil)} ` : ""}abgelaufen.</strong>Lehrpersonen und Schüler:innen eurer Schule haben keinen Zugang mehr. Die Daten bleiben gespeichert.</span></p>
          <div className="flex flex-wrap gap-2">
            {/* Online payment off: renewing goes through an Offerte, so no «Lizenz verlängern» next to «Online-Bezahlung nicht verfügbar» (QA M5). */}
            {onlinePaymentEnabled() ? (
              <>
                <ButtonLink href="#abo" size="sm" data-primary-action="">Lizenz verlängern</ButtonLink>
                <ButtonLink href="/kontakt" size="sm" variant="ghost" icon={<Mail size={14} aria-hidden />}>Offerte anfragen</ButtonLink>
              </>
            ) : (
              <ButtonLink href="/kontakt" size="sm" data-primary-action="" icon={<Mail size={14} aria-hidden />}>Offerte anfragen</ButtonLink>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <div className="panel-flat space-y-3 p-5">
          <h3 className="text-heading">Lizenz</h3>
          {!l ? <p className="text-sm text-muted">Für diese Schule ist noch keine Lizenz hinterlegt.</p> : isPilot ? (
            <div className="space-y-2 text-sm">
              <p className="font-bold">{until ? `30-Tage-Pilot bis ${formatDateCh(until)}` : "30-Tage-Pilot"}{pilotDays !== null && <span className="font-normal text-muted"> ({pilotText(pilotDays).replace(/^Noch/, "noch")})</span>}</p>
              <p className="text-muted">Danach braucht eure Schule eine Schullizenz, sonst pausiert der Zugang für Lehrpersonen und Schüler:innen.</p>
            </div>
          ) : (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm [overflow-wrap:anywhere]">
              <dt className="text-muted">Paket</dt><dd className="font-bold">{packageLabel(l.package)}{limit ? <span className="font-normal text-muted"> · bis {limit} Schüler:innen</span> : null}</dd>
              <dt className="text-muted">Status</dt><dd className="font-semibold">{statusLabel(status)}</dd>
              {l.validUntil && <><dt className="text-muted">{expired ? "Abgelaufen am" : "Gültig bis"}</dt><dd className="font-semibold">{formatDateCh(l.validUntil)}{!expired && validDays !== null && validDays >= 0 && validDays <= 30 && <Badge tone="warning" className="ml-2">in {validDays} Tagen</Badge>}</dd></>}
            </dl>
          )}
        </div>

        <div className="panel-flat space-y-3 p-5">
          <h3 className="text-heading flex items-center gap-2"><Users size={18} aria-hidden /> Schüler:innen</h3>
          {school.studentCount === null ? <p className="text-sm text-muted">Die Anzahl kann gerade nicht berechnet werden.</p> : (
            <>
              <p className="flex flex-wrap items-end gap-x-2"><span className="num-big">{school.studentCount}</span><span className="pb-0.5 text-sm text-muted">{!l ? "noch keine Lizenz" : limit ? `von ${limit} im Paket` : "ohne feste Obergrenze"}</span></p>
              {usage.percent !== null && <ProgressBar value={school.studentCount} max={limit ?? 1} tone={usage.level === "ok" ? "mint" : usage.level === "warning" ? "warning" : "danger"} label="Auslastung der Lizenz" valueText={`${school.studentCount} von ${limit} Schüler:innen, ${usage.percent} Prozent`} />}
              {usage.level === "warning" && <p role="status" className="status status-warning flex items-start gap-2 text-sm"><TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden /><span>Über 90 % der Plätze sind belegt (noch {usage.remaining} frei). <a href="#abo" className="font-semibold underline underline-offset-2">Paket wechseln</a></span></p>}
              {full && <p role="status" className="status status-danger flex items-start gap-2 text-sm"><TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden /><span>Das Paket ist voll. Neue Schüler:innen kommen erst nach einem Paketwechsel dazu. <a href="#abo" className="font-semibold underline underline-offset-2">Paket wechseln</a></span></p>}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-8 lg:grid-cols-2">
        <section aria-labelledby={`classes-${school.id}`}>
          <h3 id={`classes-${school.id}`} className="text-heading flex items-center gap-2"><GraduationCap size={18} aria-hidden /> Klassen {school.classes && <Badge>{school.classes.length}</Badge>}</h3>
          {school.classes === null ? <p className="text-small mt-2 text-muted">Die Klassenliste ist noch nicht verfügbar.</p> : school.classes.length === 0 ? <p className="text-small mt-2 text-muted">Noch keine Klasse ist dieser Schule zugeordnet.</p> : (
            <ul className="rows mt-2">
              {school.classes.map((c) => <ClassRow key={c.id} schoolId={school.id} c={c} onDone={onChanged} />)}
            </ul>
          )}
          {school.classes !== null && <AttachClassForm schoolId={school.id} full={full} onDone={onChanged} />}
        </section>
        <section aria-labelledby={`teachers-${school.id}`}>
          <h3 id={`teachers-${school.id}`} className="text-heading flex items-center gap-2"><Users size={18} aria-hidden /> Lehrpersonen {school.teachers && <Badge>{school.teachers.length}</Badge>}</h3>
          <p className="text-small mt-1 text-muted">Lehrpersonen eurer Schule nutzen WendApply über eure Lizenz. Ihre Klassen zählen zur Lizenz, sobald sie hier zugeordnet sind.</p>
          {school.teachers === null ? <p className="text-small mt-2 text-muted">Die Liste der Lehrpersonen ist noch nicht verfügbar.</p> : school.teachers.length === 0 ? <p className="text-small mt-2 text-muted">Noch keine Lehrperson aktiv.</p> : (
            <ul className="rows mt-2">
              {school.teachers.map((t) => (
                <li key={t.userId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                  <p className="min-w-0 truncate text-sm font-bold">{t.displayName || "Ohne Namen"}</p>
                  <span className="tabular text-sm text-muted">{t.classes === 0 ? "noch keine Klasse" : `${t.classes} ${t.classes === 1 ? "Klasse" : "Klassen"}`}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 space-y-2 rounded-[var(--radius-lg)] border-[length:var(--border-w)] border-dashed border-[var(--line)] p-4">
            <p className="text-small text-muted"><strong className="block font-semibold text-[var(--ink)]">Neue Lehrperson?</strong>Sie erstellt ein Konto als «Lehrperson» und schickt dir ihre E-Mail-Adresse. Melde sie uns, wir schalten sie für eure Schule frei.</p>
            <ButtonLink href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Lehrperson freischalten – ${school.name}`)}&body=${encodeURIComponent("E-Mail-Adresse der Lehrperson:\n")}`} size="sm" variant="secondary" icon={<UserPlus size={14} aria-hidden />}>Lehrperson melden</ButtonLink>
          </div>
        </section>
      </div>

      {licensed && onlinePaymentEnabled() ? (
        <details className="group" open={billingOpen} onToggle={(e) => setBillingOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary className="font-display flex min-h-11 cursor-pointer list-none items-center gap-2 text-base font-bold [&::-webkit-details-marker]:hidden"><ReceiptText size={18} aria-hidden /><span className="flex-1">Paket wechseln oder verlängern</span><ChevronDown size={18} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden /></summary>
          <div className="mt-3"><BillingCard schoolId={school.id} anchor={first} currentPackage={l?.package ?? null} /></div>
        </details>
      ) : (
        <BillingCard schoolId={school.id} anchor={first} currentPackage={l && !expired ? l.package : null} />
      )}
    </section>
  );
}

/** German message for attach / detach errors: licence (WA001-WA003) first, then the RPC codes. */
function adminError(e: unknown): string {
  const err = e as Error & { code?: string; details?: string | null };
  const licence = licenceError({ code: err?.code, message: err?.message, details: err?.details ?? null });
  // The DB detail says "Die Schulleitung kann die Lizenz erweitern" (written for teachers/students); admins get the next step instead.
  if (licence?.code === "LICENCE_LIMIT_REACHED") return "Die Lizenz ist voll: Diese Klasse hat nicht mehr genug freie Plätze. Wechsle unten das Paket, um mehr Plätze zu bekommen.";
  if (licence) return licence.message;
  const msg = String(err?.message ?? "");
  if (msg.includes("CLASS_IN_OTHER_SCHOOL")) return "Diese Klasse gehört bereits zu einer anderen Schule.";
  if (msg.includes("CLASS_NOT_FOUND")) return "Diesen Klassencode gibt es nicht. Prüfe die Schreibweise.";
  return teacherError(e);
}

function AttachClassForm({ schoolId, full, onDone }: { schoolId: string; full: boolean; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const id = `attach-${schoolId}`;
  const msgId = `${id}-msg`;
  useEffect(() => { if (msg) document.getElementById(msgId)?.scrollIntoView({ block: "nearest" }); }, [msg, msgId]);
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
      <Field label="Klasse hinzufügen" htmlFor={id} hint={full ? "Das Paket ist voll. Wechsle unten das Paket, um weitere Klassen zuzuordnen." : "Den Klassencode findet die Lehrperson in ihrer Klasse. Die Schüler:innen der Klasse zählen dann zur Lizenz."}>
        <div className="flex flex-wrap gap-2">
          <Input id={id} enterKeyHint="go" aria-describedby={msg ? msgId : undefined} aria-invalid={msg?.tone === "danger" || undefined} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} className="max-w-48 uppercase" placeholder="z. B. AB12CD" />
          <Button type="submit" variant="secondary" loading={busy} disabled={full} icon={<Plus size={16} />}>Zuordnen</Button>
        </div>
      </Field>
      {msg && <p id={msgId} role={msg.tone === "danger" ? "alert" : "status"} className={`status status-${msg.tone} text-sm`}>{msg.text}</p>}
    </form>
  );
}

/** One class row; «Von der Schule entfernen» opens an app dialog (schule-14/15), errors show inline under the row. */
function ClassRow({ schoolId, c, onDone }: { schoolId: string; c: SchoolClassInfo; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function detach() {
    setBusy(true); setErr("");
    try { await detachClassFromSchool(schoolId, c.id); setOpen(false); onDone(); } catch (e) { setOpen(false); setErr(adminError(e)); } finally { setBusy(false); }
  }
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="min-w-0"><p className="truncate text-sm font-bold">{c.name}{c.archived && <Badge tone="info" className="ml-2">Archiviert</Badge>}</p><p className="text-small text-muted">{c.schoolYear ? `Schuljahr ${c.schoolYear}` : "Ohne Schuljahr"}{c.teacherName && ` · ${c.teacherName}`}{c.studentsWithApplication !== null && ` · ${c.studentsWithApplication} mit Bewerbung`}{c.studentsPlaced !== null && ` · ${c.studentsPlaced} mit Lehrstelle`}</p></div>
        <span className="flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-1"><span className="tabular text-sm font-semibold">{c.students} {c.students === 1 ? "Schüler:in" : "Schüler:innen"}</span><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={`${c.name} von der Schule entfernen`}>Entfernen</Button></span>
      </div>
      {err && <p role="alert" className="status status-danger mt-2 text-sm">{err}</p>}
      <Modal open={open} onClose={() => setOpen(false)} title={`«${c.name}» von der Schule entfernen?`}
        footer={<><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Abbrechen</Button><Button type="button" variant="danger" loading={busy} onClick={detach} data-autofocus="">Entfernen</Button></>}>
        <p className="text-body">Die Klasse bleibt bei der Lehrperson. Ihre Schüler:innen zählen nicht mehr zur Lizenz und verlieren den Zugang über die Schule.</p>
      </Modal>
    </li>
  );
}
