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
      if (found.alreadyMember) { setNotice(`Du bist schon in der Klasse "${found.name}".`); setCode(""); } else { setResolved(trimmed); setPending(found); }
    } catch (e) { setJoinError(errorMessage(e)); } finally { setJoining(false); }
  }

  /** Step 2: explicit consent. */
  async function confirmJoin() {
    if (!pending) return;
    setJoining(true); setActionError("");
    try {
      const m = await (isInviteToken(resolved) ? acceptInvite(resolved) : joinClass(resolved));
      const full: ClassMembership = { ...m, shareCompanies: true, announcementsCount: 0 };
      setItems((prev) => [full, ...(prev ?? []).filter((x) => x.classId !== m.classId)]);
      setCode(""); setPending(null); setNotice(`Du bist der Klasse "${m.name}" beigetreten.`);
    } catch (e) { setActionError(errorMessage(e)); } finally { setJoining(false); }
  }

  /** Consent: master switch (share) and company names. Optimistic, rolled back on error. */
  async function update(m: ClassMembership, share: boolean, companies: boolean) {
    setBusy(m.classId); setActionError("");
    const apply = (a: boolean, c: boolean) => setItems((prev) => (prev ?? []).map((x) => (x.classId === m.classId ? { ...x, shareApplications: a, shareCompanies: c } : x)));
    apply(share, companies);
    try { await setClassSharingV2(m.classId, share, companies); }
    catch (e) { apply(m.shareApplications, m.shareCompanies); setActionError(errorMessage(e)); } finally { setBusy(null); }
  }

  async function confirmLeave() {
    if (!leaving) return;
    setBusy(leaving.classId); setActionError("");
    try { await leaveClass(leaving.classId); setItems((prev) => (prev ?? []).filter((x) => x.classId !== leaving.classId)); setLeaving(null); }
    catch (e) { setActionError(errorMessage(e)); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-6 pb-safe">
      <PageHeader eyebrow="Schüler:in" title="Meine Klassen" description="Tritt der Klasse deiner Lehrperson bei, damit sie deinen Bewerbungsfortschritt begleiten kann." />

      <Card className="space-y-4 p-5">
        <form onSubmit={lookup}>
          <Field label="Klassencode" htmlFor="join-code" hint="Code oder Link bekommst du von deiner Lehrperson." error={joinError}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="join-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code oder Einladungslink" autoCapitalize="characters" autoComplete="off" spellCheck={false} className="text-base! sm:max-w-sm sm:text-base!" />
              <Button type="submit" className="min-h-11 sm:min-h-11" loading={joining && !pending}>Weiter</Button>
            </div>
          </Field>
        </form>
        <PrivacyPanel variant="class" />
        {notice && <p role="status" className="text-small text-[var(--success-fg)]">{notice}</p>}
      </Card>

      {(error || actionError) && !leaving && !pending && <div role="alert" className="status status-danger flex items-center justify-between gap-3 rounded-[var(--radius-md)] p-3 text-sm"><span>{error || actionError}</span>{error && <Button size="sm" variant="secondary" className="min-h-11 sm:min-h-11" onClick={() => { setError(""); load(); }}>Erneut laden</Button>}</div>}
      {!items && !error && <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28 rounded-[var(--radius-lg)]" />)}</div>}
      {items && items.length === 0 && <EmptyState icon={<GraduationCap size={26} />} title="Du bist in keiner Klasse" description="Gib oben den Code deiner Lehrperson ein, um beizutreten." />}
      {items && items.length > 0 && (
        <div className="space-y-3">
          {items.map((m) => (
            <Card key={m.classId} className="space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-heading truncate">{m.name}</h2>
                  <p className="text-small text-muted">{m.teacherName} · {m.schoolYear ? `Schuljahr ${m.schoolYear} · ` : ""}beigetreten am {formatDate(m.joinedAt)}</p>
                </div>
                <Badge tone={m.shareApplications ? "success" : "neutral"}>{m.shareApplications ? <><Eye size={12} /> Freigabe aktiv</> : <><EyeOff size={12} /> Nicht geteilt</>}</Badge>
              </div>
              {m.lastNudgeAt && <p className="text-small text-muted">Letzte Erinnerung deiner Lehrperson: {formatDate(m.lastNudgeAt)}</p>}
              <div className="space-y-2.5 rounded-[var(--radius-md)] border border-[var(--line)] p-3.5">
                <ConsentSwitch label="Fortschritt mit Lehrperson teilen" description={m.shareApplications ? "Anzahl und Status deiner Bewerbungen sind sichtbar." : "Deine Lehrperson sieht nur, dass du in der Klasse bist."} checked={m.shareApplications} disabled={busy === m.classId} onChange={(v) => update(m, v, m.shareCompanies)} />
                <ConsentSwitch label="Firmennamen zeigen" description={m.shareCompanies ? "Firma und Position sind sichtbar." : "Firma und Position bleiben verborgen."} checked={m.shareApplications && m.shareCompanies} disabled={busy === m.classId || !m.shareApplications} onChange={(v) => update(m, m.shareApplications, v)} />
              </div>
              <Announcements classId={m.classId} count={m.announcementsCount} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-11" onClick={() => { setActionError(""); setLeaving(m); }} icon={<LogOut size={14} />}>Klasse verlassen</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!pending} onClose={() => setPending(null)} title={pending ? `Klasse "${pending.name}" beitreten?` : ""} description={pending ? `${pending.teacherName}${pending.schoolYear ? ` · Schuljahr ${pending.schoolYear}` : ""} · ${pending.memberCount} Schüler` : undefined}
        footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={() => setPending(null)}>Abbrechen</Button><Button loading={joining} onClick={confirmJoin}>Beitreten und Freigabe erlauben</Button></div>}>
        <PrivacyPanel variant="class" teacherName={pending?.teacherName} />
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

function ConsentSwitch({ label, description, checked, disabled, onChange }: { label: string; description: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className={`flex min-h-11 items-center justify-between gap-3 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <span className="min-w-0"><span className="block text-sm font-medium">{label}</span><span className="text-small block text-muted">{description}</span></span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className={`relative h-7 w-12 shrink-0 rounded-full border transition peer-focus-visible:ring-4 peer-focus-visible:ring-[var(--brand)]/30 ${checked ? "border-[var(--brand)] bg-[var(--brand)]" : "border-[var(--neutral-line)] bg-[var(--neutral-bg)]"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[26px]" : "left-0.5 bg-[var(--neutral-fg)]"}`} />
      </span>
    </label>
  );
}

/** Messages from the teacher to the whole class (read only). */
function Announcements({ classId, count }: { classId: string; count: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ClassAnnouncement[] | null>(null);
  const [failed, setFailed] = useState(false);
  if (count === 0) return null;
  function toggle() {
    const next = !open; setOpen(next);
    if (next && !items) listClassAnnouncements(classId).then(setItems).catch(() => setFailed(true));
  }
  return (
    <div>
      <button type="button" onClick={toggle} aria-expanded={open} className="inline-flex min-h-11 items-center gap-2 rounded-full px-1 text-sm font-semibold text-[var(--brand)] hover:underline"><Megaphone size={15} />{count === 1 ? "1 Mitteilung" : `${count} Mitteilungen`} der Lehrperson</button>
      {open && (
        <ul className="mt-1 space-y-2">
          {failed && <li className="text-small text-[var(--danger-fg)]">Die Mitteilungen konnten nicht geladen werden.</li>}
          {!items && !failed && <li><Skeleton className="h-12 rounded-[var(--radius-md)]" /></li>}
          {items?.map((a) => <li key={a.id} className="rounded-[var(--radius-md)] border border-[var(--info-line)] bg-[var(--info-bg)] p-3 text-sm text-[var(--info-fg)]"><p className="whitespace-pre-wrap break-words">{a.text}</p><p className="text-small mt-1 opacity-90">{a.authorName} · {formatDate(a.createdAt)}</p></li>)}
        </ul>
      )}
    </div>
  );
}
