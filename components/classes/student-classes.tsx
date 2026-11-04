"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, GraduationCap, LogOut, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyClassMemberships, joinClass, leaveClass, setClassSharing } from "@/lib/classes";
import type { ClassMembership } from "@/types";
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
    getMyClassMemberships().then(setItems).catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function join(event: FormEvent) {
    event.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { setJoinError("Bitte gib den Klassencode ein."); return; }
    setJoining(true); setJoinError(""); setNotice("");
    try {
      const m = await joinClass(trimmed);
      setItems((prev) => [m, ...(prev ?? []).filter((x) => x.classId !== m.classId)]);
      setCode(""); setNotice(`Du bist der Klasse "${m.name}" beigetreten.`);
    } catch (e) { setJoinError(errorMessage(e)); } finally { setJoining(false); }
  }

  async function toggle(m: ClassMembership) {
    setBusy(m.classId); setActionError("");
    try { await setClassSharing(m.classId, !m.shareApplications); setItems((prev) => (prev ?? []).map((x) => (x.classId === m.classId ? { ...x, shareApplications: !m.shareApplications } : x))); }
    catch (e) { setActionError(errorMessage(e)); } finally { setBusy(null); }
  }

  async function confirmLeave() {
    if (!leaving) return;
    setBusy(leaving.classId); setActionError("");
    try { await leaveClass(leaving.classId); setItems((prev) => (prev ?? []).filter((x) => x.classId !== leaving.classId)); setLeaving(null); }
    catch (e) { setActionError(errorMessage(e)); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-6 pb-safe">
      <PageHeader eyebrow="Schüler" title="Meine Klassen" description="Tritt der Klasse deiner Lehrkraft bei, damit sie deinen Bewerbungsfortschritt begleiten kann." />

      <Card className="space-y-4 p-5">
        <form onSubmit={join}>
          <Field label="Klassencode" htmlFor="join-code" hint="Den Code bekommst du von deiner Lehrkraft." error={joinError}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="join-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="z. B. AB12CD34" autoCapitalize="characters" autoComplete="off" spellCheck={false} className="tracking-[.15em] sm:max-w-xs" />
              <Button type="submit" loading={joining}>Klasse beitreten</Button>
            </div>
          </Field>
        </form>
        <div className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--info-line)] bg-[var(--info-bg)] p-3.5 text-[var(--info-fg)]">
          <ShieldCheck size={18} className="mt-0.5 shrink-0" />
          <div className="text-small space-y-1">
            <p className="font-semibold">Was deine Lehrkraft sieht</p>
            <p>Mit dem Beitritt erlaubst du deiner Lehrkraft, Firma, Position, Status und Daten (Frist, Bewerbungsdatum) deiner Bewerbungen einzusehen. Notizen, Gehalt und Lebensläufe sind nie sichtbar. Du kannst die Freigabe jederzeit pausieren oder die Klasse verlassen.</p>
          </div>
        </div>
        {notice && <p role="status" className="text-small text-[var(--success-fg)]">{notice}</p>}
      </Card>

      {(error || actionError) && !leaving && <div role="alert" className="status status-danger flex items-center justify-between gap-3 rounded-[var(--radius-md)] p-3 text-sm"><span>{error || actionError}</span>{error && <Button size="sm" variant="secondary" onClick={() => { setError(""); load(); }}>Erneut laden</Button>}</div>}
      {!items && !error && <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28 rounded-[var(--radius-lg)]" />)}</div>}
      {items && items.length === 0 && <EmptyState icon={<GraduationCap size={26} />} title="Du bist in keiner Klasse" description="Gib oben den Code deiner Lehrkraft ein, um beizutreten." />}
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
              <p className="text-small text-muted">{m.shareApplications ? "Deine Lehrkraft sieht Firma, Position, Status und Daten deiner Bewerbungen." : "Deine Lehrkraft sieht nur, dass du in der Klasse bist."}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" loading={busy === m.classId && !leaving} onClick={() => toggle(m)} icon={m.shareApplications ? <EyeOff size={14} /> : <Eye size={14} />}>{m.shareApplications ? "Freigabe pausieren" : "Wieder teilen"}</Button>
                <Button size="sm" variant="ghost" onClick={() => { setActionError(""); setLeaving(m); }} icon={<LogOut size={14} />}>Klasse verlassen</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!leaving} onClose={() => setLeaving(null)} title="Klasse verlassen?" description={leaving ? `Du verlässt "${leaving.name}". Deine Lehrkraft sieht deine Bewerbungen danach nicht mehr. Mit dem Code kannst du jederzeit wieder beitreten.` : undefined}
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setLeaving(null)}>Abbrechen</Button><Button variant="danger" loading={!!leaving && busy === leaving.classId} onClick={confirmLeave}>Verlassen</Button></div>}>
        {actionError && <p role="alert" className="text-small text-[var(--danger-fg)]">{actionError}</p>}
      </Modal>
    </div>
  );
}
