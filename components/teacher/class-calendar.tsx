"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import { addDays, deadlinesByDay, formatDateCh, todayIso, weekDays, weekLabel, weekStart, weekdayLabel, type ClassDeadline } from "@/lib/teacher-extras";
import { addClassDeadline, deleteClassDeadline, listClassDeadlines } from "@/lib/teacher-more";
import { ErrorBanner, teacherError } from "./shared";

/** Week view of the class-level deadlines ("Dossier abgeben"). Students see the same entries on their class page. */
export function ClassCalendar({ classId, archived = false }: { classId: string; archived?: boolean }) {
  const today = todayIso();
  const [start, setStart] = useState(() => weekStart(today));
  const [items, setItems] = useState<ClassDeadline[] | null>(null);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const days = useMemo(() => weekDays(start), [start]);

  const load = useCallback(() => { listClassDeadlines(classId, start, addDays(start, 6)).then((l) => { setItems(l); setError(""); }).catch((e) => setError(teacherError(e))); }, [classId, start]);
  useEffect(() => { load(); }, [load]);
  const byDay = useMemo(() => deadlinesByDay(items ?? []), [items]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) { setFormError("Bitte gib einen Titel ein, zum Beispiel «Dossier abgeben»."); return; }
    if (!due) { setFormError("Bitte wähle ein Datum."); return; }
    setBusy(true); setFormError("");
    try { await addClassDeadline(classId, title.trim(), due, note.trim() || null); toast({ message: "Frist für die Klasse gespeichert.", tone: "success" }); setTitle(""); setNote(""); setStart(weekStart(due)); load(); }
    catch (e) { setFormError(teacherError(e)); } finally { setBusy(false); }
  }
  async function remove(d: ClassDeadline) {
    try { await deleteClassDeadline(d.id); toast({ message: "Frist gelöscht.", tone: "success" }); load(); } catch (e) { setError(teacherError(e)); }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-heading flex items-center gap-2"><CalendarDays size={18} aria-hidden /> Fristen der Klasse</h2><p className="text-small text-muted">{weekLabel(start)}</p></div>
          <div className="flex gap-2" role="group" aria-label="Woche wechseln">
            <Button variant="secondary" className="min-h-11 min-w-11 sm:min-h-11" aria-label="Vorherige Woche" onClick={() => setStart(addDays(start, -7))}><ChevronLeft size={16} /></Button>
            <Button variant="secondary" className="min-h-11 sm:min-h-11" disabled={start === weekStart(today)} onClick={() => setStart(weekStart(today))}>Diese Woche</Button>
            <Button variant="secondary" className="min-h-11 min-w-11 sm:min-h-11" aria-label="Nächste Woche" onClick={() => setStart(addDays(start, 7))}><ChevronRight size={16} /></Button>
          </div>
        </div>
        {error && <ErrorBanner message={error} onRetry={load} />}
        {!items && !error && <Skeleton className="h-40 rounded-[var(--radius-md)]" />}
        {items && (
          <ol className="grid gap-2 md:grid-cols-7" aria-label={`Wochenansicht ${weekLabel(start)}`}>
            {days.map((day) => {
              const list = byDay.get(day) ?? []; const isToday = day === today;
              return (
                <li key={day} className={`min-h-16 rounded-[var(--radius-md)] border p-2.5 md:min-h-32 ${isToday ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--line)]"}`}>
                  <p className="text-eyebrow flex items-center justify-between"><span>{weekdayLabel(day)}</span><span className="tabular">{formatDateCh(day).slice(0, 5)}</span></p>
                  {list.length === 0 ? <p className="text-small mt-1 text-muted md:mt-3">–</p> : (
                    <ul className="mt-2 space-y-1.5">{list.map((d) => (
                      <li key={d.id} className="rounded-lg bg-[var(--warning-bg)] p-2 text-[var(--warning-fg)]">
                        <div className="flex items-start justify-between gap-1"><p className="text-small font-semibold break-words">{d.title}</p>
                          <button type="button" onClick={() => void remove(d)} className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-black/5" aria-label={`Frist «${d.title}» löschen`}><Trash2 size={14} aria-hidden /></button></div>
                        {d.note && <p className="text-small break-words opacity-80">{d.note}</p>}
                      </li>
                    ))}</ul>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {items && items.length === 0 && <p className="text-small text-muted">In dieser Woche gibt es keine Fristen für die Klasse.</p>}
      </Card>

      {!archived && (
        <Card className="space-y-4 p-5">
          <div><h2 className="text-heading">Neue Frist</h2><p className="text-small text-muted">Alle Schülerinnen und Schüler der Klasse sehen die Frist auf ihrer Klassenseite.</p></div>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
            <Field label="Titel" htmlFor="dl-title"><Input id="dl-title" className="text-base! sm:text-base!" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Dossier abgeben" maxLength={120} /></Field>
            <Field label="Datum" htmlFor="dl-date"><Input id="dl-date" type="date" className="text-base! sm:text-base!" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
            <Field label="Hinweis (optional)" htmlFor="dl-note" className="sm:col-span-2"><Input id="dl-note" className="text-base! sm:text-base!" value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. bis 12 Uhr im Sekretariat" maxLength={300} /></Field>
            {formError && <p role="alert" className="text-small text-[var(--danger-fg)] sm:col-span-2">{formError}</p>}
            <div className="sm:col-span-2"><Button type="submit" className="min-h-11 sm:min-h-11" icon={<Plus size={15} />} loading={busy}>Frist speichern</Button></div>
          </form>
        </Card>
      )}
    </div>
  );
}
