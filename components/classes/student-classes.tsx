"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, GraduationCap, LogOut, Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { acceptInvite, type ClassAnnouncement, type ClassMembershipV2 as ClassMembership, type ClassPreview, getMyClassMembershipsV2, isInviteToken, joinClass, leaveClass, listClassAnnouncements, previewClass, previewInvite, setClassSharingV2 } from "@/lib/classes";
import { type ConsentChoice } from "@/lib/consent";
import { ConsentSwitches } from "./consent-switches";
import { useJoinConsent } from "./join-consent";
import { PrivacyPanel } from "./privacy-panel";
import { errorMessage, formatDate } from "./shared";

export function StudentClasses() {
  const [items, setItems] = useState<ClassMembership[] | null>(null);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<ClassMembership | null>(null);
  const [actionError, setActionError] = useState("");

  const load = useCallback(() => {
    getMyClassMembershipsV2().then(setItems).catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  const [pending, setPending] = useState<ClassPreview | null>(null);
  const [resolved, setResolved] = useState("");
  const consent = useJoinConsent();

  /** Step 1: look the class up so the student sees who they share with before consenting. */
  async function lookup(event: FormEvent) {
    event.preventDefault();
    const trimmed = extractCode(code);
    if (!trimmed) { setJoinError("Bitte gib den Klassencode ein."); return; }
    setJoining(true); setJoinError(""); setNotice("");
    try {
      const found: ClassPreview = isInviteToken(trimmed) ? await previewInvite(trimmed) : await previewClass(trimmed);
      const invite = found as Partial<Awaited<ReturnType<typeof previewInvite>>>;
      if (invite.valid === false && !found.alreadyMember) throw new Error(invite.reason ?? "INVALID");
      if (found.alreadyMember) { setNotice(`Du bist schon in der Klasse "${found.name}".`); setCode(""); }
      else {
        await consent.load();
        setResolved(trimmed); setPending(found);
      }
    } catch (e) { setJoinError(errorMessage(e)); } finally { setJoining(false); }
  }

  /** Step 2: explicit consent. Name and age band are saved first so the defaults and the teacher's view are right from the start. */
  async function confirmJoin() {
    if (!pending || !consent.ready) return;
    setJoining(true); setActionError("");
    try {
      const { membership: m, consent: final } = await consent.run(() => (isInviteToken(resolved) ? acceptInvite(resolved) : joinClass(resolved)));
      const full: ClassMembership = { ...m, shareApplications: final.share, shareCompanies: final.companies, shareStatus: final.status, announcementsCount: 0 };
      setItems((prev) => [full, ...(prev ?? []).filter((x) => x.classId !== m.classId)]);
      setCode(""); setPending(null); setNotice(`Du bist der Klasse "${m.name}" beigetreten.`);
    } catch (e) { setActionError(errorMessage(e)); } finally { setJoining(false); }
  }

  /** Consent: three real switches (Fortschritt teilen, Status zeigen, Firmen zeigen). Optimistic, rolled back on error. */
  async function update(m: ClassMembership, next: Partial<ConsentChoice>) {
    const target: ConsentChoice = { share: m.shareApplications, status: m.shareStatus, companies: m.shareCompanies, ...next };
    setBusy(m.classId); setActionError("");
    const apply = (c: ConsentChoice) => setItems((prev) => (prev ?? []).map((x) => (x.classId === m.classId ? { ...x, shareApplications: c.share, shareStatus: c.status, shareCompanies: c.companies } : x)));
    apply(target);
    try { await setClassSharingV2(m.classId, target.share, target.companies, target.status); }
    catch (e) { apply({ share: m.shareApplications, status: m.shareStatus, companies: m.shareCompanies }); setActionError(errorMessage(e)); } finally { setBusy(null); }
  }

  async function confirmLeave() {
    if (!leaving) return;
    setBusy(leaving.classId); setActionError("");
    try { await leaveClass(leaving.classId); setItems((prev) => (prev ?? []).filter((x) => x.classId !== leaving.classId)); setLeaving(null); }
    catch (e) { setActionError(errorMessage(e)); } finally { setBusy(null); }
  }

  return (
    <div>
      <PageHeader title="Meine Klassen" description="Tritt der Klasse deiner Lehrperson bei, damit sie deinen Bewerbungsfortschritt begleiten kann." />

      {(error || actionError) && !leaving && !pending && <div role="alert" className="status status-danger mb-6 flex items-center justify-between gap-3 text-sm"><span>{error || actionError}</span>{error && <Button size="sm" variant="secondary" className="min-h-11 shrink-0 sm:min-h-11" onClick={() => { setError(""); load(); }}>Erneut laden</Button>}</div>}

      {/* Uneven columns: the classes (sticker) lead, joining another class stays calm on paper. With no class yet the join form comes first. */}
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          {!items && !error && <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28 rounded-[var(--radius-lg)]" />)}</div>}
          {items && items.length === 0 && <EmptyState icon={<GraduationCap size={26} />} title="Du bist in keiner Klasse" description="Gib den Code deiner Lehrperson ein, um beizutreten." />}
          {items && items.length > 0 && items.map((m) => (
            <Card key={m.classId} className="p-4 pb-2 sm:p-6 sm:pb-3">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div className="min-w-0">
                  <h2 className="font-display truncate text-2xl font-extrabold tracking-[-.02em]">{m.name}</h2>
                  <p className="text-small mt-1 text-muted">{m.teacherName} · {m.schoolYear ? `Schuljahr ${m.schoolYear} · ` : ""}beigetreten am {formatDate(m.joinedAt)}</p>
                </div>
                <Badge tone={m.shareApplications ? "success" : "neutral"}>{m.shareApplications ? <><Eye size={12} /> Freigabe aktiv</> : <><EyeOff size={12} /> Nicht geteilt</>}</Badge>
              </div>
              {m.lastNudgeAt && <p className="text-small mt-2 text-muted">Letzte Erinnerung deiner Lehrperson: {formatDate(m.lastNudgeAt)}</p>}
              <div className="rows mt-3 border-y-[length:var(--border-w)] border-[var(--outline)]">
                <ConsentSwitches value={{ share: m.shareApplications, status: m.shareStatus, companies: m.shareCompanies }} disabled={busy === m.classId} onChange={(next) => update(m, next)} />
              </div>
              <Announcements classId={m.classId} count={m.announcementsCount} />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" className="-ml-2 min-h-11 sm:min-h-11" onClick={() => { setActionError(""); setLeaving(m); }} icon={<LogOut size={14} />}>Klasse verlassen</Button>
              </div>
            </Card>
          ))}
        </div>

        <div className={`min-w-0 space-y-5 ${items && items.length > 0 ? "" : "max-lg:order-first"}`}>
          <form onSubmit={lookup}>
            <Field label="Klassencode" htmlFor="join-code" hint="Code oder Link bekommst du von deiner Lehrperson." error={joinError}>
              <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                <Input id="join-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code oder Einladungslink" autoCapitalize="characters" autoComplete="off" spellCheck={false} className="text-base! sm:max-w-sm sm:text-base!" />
                <Button type="submit" className="min-h-11 shrink-0 sm:min-h-11" loading={joining && !pending}>Weiter</Button>
              </div>
            </Field>
          </form>
          {notice && <p role="status" className="status status-success text-sm">{notice}</p>}
          <PrivacyPanel variant="class" />
        </div>
      </div>

      <Modal open={!!pending} onClose={() => setPending(null)} title={pending ? `Klasse "${pending.name}" beitreten?` : ""} description={pending ? `${pending.teacherName}${pending.schoolYear ? ` · Schuljahr ${pending.schoolYear}` : ""} · ${pending.memberCount} Schüler:innen` : undefined}
        footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={() => setPending(null)}>Abbrechen</Button><Button loading={joining} disabled={!consent.ready} onClick={confirmJoin}>Beitreten</Button></div>}>
        {consent.fields(pending?.teacherName)}
        {actionError && <p role="alert" className="text-small mt-3 text-[var(--danger-fg)]">{actionError}</p>}
      </Modal>

      <Modal open={!!leaving} onClose={() => setLeaving(null)} title="Klasse verlassen?" description={leaving ? `Du verlässt "${leaving.name}". Deine Lehrperson sieht deine Bewerbungen danach nicht mehr. Mit dem Code kannst du jederzeit wieder beitreten.` : undefined}
        footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={() => setLeaving(null)}>Abbrechen</Button><Button variant="danger" loading={!!leaving && busy === leaving.classId} onClick={confirmLeave}>Verlassen</Button></div>}>
        {actionError && <p role="alert" className="text-small text-[var(--danger-fg)]">{actionError}</p>}
      </Modal>
    </div>
  );
}

/** "https://…/classes/join/<code-or-token>" or a bare code/token. Tokens keep their case, short codes are upper-cased. */
function extractCode(input: string): string {
  const raw = input.trim().split(/[?#]/)[0].replace(/\/+$/, "");
  const last = raw.includes("/") ? raw.slice(raw.lastIndexOf("/") + 1) : raw;
  let decoded = last; try { decoded = decodeURIComponent(last); } catch { /* keep raw */ }
  return isInviteToken(decoded) ? decoded : decoded.toUpperCase();
}

/** Messages from the teacher to the whole class. Shown open (latest 3); older ones behind one button. */
function Announcements({ classId, count }: { classId: string; count: number }) {
  const [items, setItems] = useState<ClassAnnouncement[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [all, setAll] = useState(false);
  useEffect(() => {
    if (count === 0) return;
    let alive = true;
    listClassAnnouncements(classId).then((r) => { if (alive) setItems(r); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [classId, count]);
  if (count === 0) return null;
  const visible = all ? items : items?.slice(0, 3);
  return (
    <div className="mt-4">
      <p className="flex items-center gap-2 text-sm font-bold"><Megaphone size={16} strokeWidth={2.2} className="text-[var(--brand)]" aria-hidden />{count === 1 ? "1 Mitteilung" : `${count} Mitteilungen`} der Lehrperson</p>
      <ul className="rows mt-1">
        {failed && <li className="text-small py-2.5 text-[var(--danger-fg)]">Die Mitteilungen konnten nicht geladen werden.</li>}
        {!items && !failed && <li className="py-2.5"><Skeleton className="h-12 rounded-[var(--radius-md)]" /></li>}
        {visible?.map((a) => <li key={a.id} className="py-2.5 text-sm"><p className="whitespace-pre-wrap break-words">{a.text}</p><p className="text-small mt-0.5 text-muted">{a.authorName} · {formatDate(a.createdAt)}</p></li>)}
      </ul>
      {items && items.length > 3 && !all && <button type="button" onClick={() => setAll(true)} className="mt-1 inline-flex min-h-11 items-center px-1 text-sm font-semibold text-[var(--brand)] hover:underline">Ältere Mitteilungen anzeigen</button>}
    </div>
  );
}
