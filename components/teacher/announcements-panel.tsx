"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Megaphone, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import { announce, listAnnouncements, type Announcement } from "./api";
import { ErrorBanner, teacherError } from "./shared";

const MAX = 500;

export function AnnouncementsPanel({ classId }: { classId: string }) {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const load = useCallback(() => { listAnnouncements(classId).then((l) => { setItems(l); setError(""); }).catch((e) => setError(teacherError(e))); }, [classId]);
  useEffect(() => { load(); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setFormError("");
    if (!text.trim()) { setFormError("Bitte schreibe eine Mitteilung."); return; }
    setBusy(true);
    try { await announce(classId, text.trim()); setText(""); toast({ message: "Mitteilung veröffentlicht. Die Klasse sieht sie in WendApply.", tone: "success" }); load(); }
    catch (e) { setFormError(teacherError(e)); } finally { setBusy(false); }
  }

  return (
    <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card className="h-fit space-y-3 p-4 sm:p-5">
        <div><h2 className="text-heading">Neue Mitteilung</h2><p className="text-small mt-1 text-muted">Alle Schülerinnen und Schüler der Klasse sehen die Nachricht in ihrer Klassenansicht.</p></div>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Nachricht" htmlFor="ann-text" error={formError} hint={`${text.length}/${MAX} Zeichen`}><Textarea id="ann-text" rows={5} maxLength={MAX} className="text-base! sm:text-base!" value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. Bitte bis Freitag mindestens 3 Bewerbungen abschicken." aria-invalid={!!formError} /></Field>
          <Button type="submit" className="min-h-11 sm:min-h-11" icon={<Send size={15} />} loading={busy}>Veröffentlichen</Button>
        </form>
      </Card>
      <section aria-label="Bisherige Mitteilungen">
        <h2 className="text-heading">Bisherige Mitteilungen</h2>
        {error && <div className="mt-3"><ErrorBanner message={error} onRetry={load} /></div>}
        {!items && !error && <div className="mt-3 space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-16 rounded-[var(--radius-lg)]" />)}</div>}
        {items && items.length === 0 && <EmptyState className="mt-3" icon={<Megaphone size={24} />} title="Noch keine Mitteilung" description="Hier erscheinen deine Nachrichten an die Klasse." />}
        {items && items.length > 0 && (
          <ul className="rows mt-2 border-y-[length:var(--border-w)] border-[var(--outline)]">{items.map((a) => (
            <li key={a.id} className="space-y-1 py-3.5"><p className="text-small text-muted"><span className="font-bold text-[var(--ink)]">{a.authorName || "Lehrperson"}</span> · {new Date(a.createdAt).toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short" })}</p><p className="text-body whitespace-pre-wrap break-words">{a.text}</p></li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}
