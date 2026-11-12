"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Archive, ArchiveRestore, RefreshCw, Trash2, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/lib/toast";
import { addCoTeacher, deleteClass, listCoTeachers, regenerateClassCode, removeCoTeacher, renameClass, setClassArchived, type CoTeacher, type DashboardClass } from "./api";
import { teacherError } from "./shared";

type Confirm = "" | "code" | "delete";

export function ClassSettingsPanel({ cls, onChanged }: { cls: DashboardClass; onChanged: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(cls.name);
  const [year, setYear] = useState(cls.schoolYear);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<Confirm>("");
  const [teachers, setTeachers] = useState<CoTeacher[] | null>(null);
  const [teachersError, setTeachersError] = useState("");
  const [coEmail, setCoEmail] = useState("");
  const [coError, setCoError] = useState("");

  const loadTeachers = useCallback(() => { listCoTeachers(cls.id).then((t) => { setTeachers(t); setTeachersError(""); }).catch(() => { setTeachers([]); setTeachersError("Die Liste der Lehrpersonen ist gerade nicht verfügbar."); }); }, [cls.id]);
  useEffect(() => { if (cls.isOwner) loadTeachers(); }, [cls.isOwner, loadTeachers]);

  async function run(kind: string, action: () => Promise<void>, ok?: string) {
    setBusy(kind); setError("");
    try { await action(); if (ok) toast({ message: ok, tone: "success" }); } catch (e) { setError(teacherError(e)); } finally { setBusy(""); setConfirm(""); }
  }
  const save = (event: FormEvent) => { event.preventDefault(); if (!name.trim()) { setError(teacherError("INVALID_NAME")); return; } void run("save", async () => { await renameClass(cls.id, name.trim(), year.trim()); onChanged(); }, "Gespeichert."); };
  async function addTeacher(event: FormEvent) {
    event.preventDefault(); setCoError("");
    if (!/^\S+@\S+\.\S{2,}$/.test(coEmail.trim())) { setCoError("Bitte gib eine gültige E-Mail-Adresse ein."); return; }
    setBusy("co");
    try { await addCoTeacher(cls.id, coEmail.trim().toLowerCase()); setCoEmail(""); toast({ message: "Co-Lehrperson hinzugefügt.", tone: "success" }); loadTeachers(); }
    catch (e) { setCoError(teacherError(e).replace("Der Eintrag wurde nicht gefunden.", "Zu dieser Adresse gibt es kein Lehrpersonen-Konto.")); } finally { setBusy(""); }
  }

  return (
    <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card className="h-fit space-y-4 p-4 sm:p-5">
        <h2 className="text-heading">Klasse</h2>
        <form onSubmit={save} className="space-y-3">
          <Field label="Klassenname" htmlFor="cs2-name"><Input id="cs2-name" className="text-base! sm:text-base!" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
          <Field label="Schuljahr" htmlFor="cs2-year"><Input id="cs2-year" className="text-base! sm:text-base!" value={year} onChange={(e) => setYear(e.target.value)} maxLength={20} /></Field>
          <Button type="submit" className="min-h-11 sm:min-h-11" loading={busy === "save"}>Speichern</Button>
        </form>
        {error && <p role="alert" className="text-small text-[var(--danger-fg)]">{error}</p>}
      </Card>

      <section className="min-w-0">
        <h2 className="text-heading">Aktionen</h2>
        <div className="rows mt-2 border-y-[length:var(--border-w)] border-[var(--outline)]">
          <div className="space-y-1.5 py-4"><Button variant="secondary" className="min-h-11 sm:min-h-11" icon={cls.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />} loading={busy === "archive"} onClick={() => run("archive", async () => { await setClassArchived(cls.id, !cls.archived); onChanged(); }, cls.archived ? "Klasse wieder aktiviert." : "Klasse archiviert.")}>{cls.archived ? "Klasse wieder aktivieren" : "Klasse archivieren"}</Button><p className="text-small text-muted">{cls.archived ? "Die Klasse erscheint wieder in deiner Übersicht." : "Archivierte Klassen sind aus der Übersicht ausgeblendet. Nichts geht verloren."}</p></div>
          <div className="space-y-1.5 py-4"><Button variant="secondary" className="min-h-11 sm:min-h-11" icon={<RefreshCw size={15} />} onClick={() => setConfirm("code")}>Neuen Beitrittscode erstellen</Button><p className="text-small text-muted">Der alte Code und Link funktionieren danach nicht mehr. Bisherige Schüler:innen bleiben in der Klasse.</p></div>
          {cls.isOwner
            ? <div className="space-y-1.5 py-4"><Button variant="danger" className="min-h-11 sm:min-h-11" icon={<Trash2 size={15} />} onClick={() => setConfirm("delete")}>Klasse löschen</Button><p className="text-small text-muted">Entfernt alle Schüler:innen aus der Klasse. Ihre Bewerbungen bleiben bei ihnen unverändert.</p></div>
            : <p className="text-small py-4 text-muted">Als Co-Lehrperson kannst du die Klasse nicht löschen.</p>}
        </div>
      </section>

      <section className="min-w-0 space-y-4 lg:col-span-2">
        <div><h2 className="text-heading">Lehrpersonen</h2><p className="text-small mt-1 max-w-2xl text-muted">Co-Lehrpersonen sehen dieselben Daten und können die Klasse verwalten. Löschen und Co-Lehrpersonen verwalten kann nur die Besitzerin oder der Besitzer.</p></div>
        {!cls.isOwner ? <p className="text-small text-muted">Nur die Besitzerin oder der Besitzer der Klasse verwaltet die Lehrpersonen.</p> : (
          <>
            {teachersError && <p role="status" className="text-small text-muted">{teachersError}</p>}
            {teachers && teachers.length > 0 && (
              <ul className="rows border-y-[length:var(--border-w)] border-[var(--outline)]">{teachers.map((t) => (
                <li key={t.teacherId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0"><p className="truncate text-sm font-bold">{t.displayName || t.email}</p>{t.email && t.displayName && <p className="text-small truncate text-muted">{t.email}</p>}</div>
                  {<Button size="sm" variant="ghost" className="min-h-11 sm:min-h-11" icon={<UserMinus size={14} />} aria-label={`${t.displayName || t.email} als Co-Lehrperson entfernen`} onClick={() => run("rm" + t.teacherId, async () => { await removeCoTeacher(cls.id, t.teacherId); loadTeachers(); }, "Co-Lehrperson entfernt.")}>Entfernen</Button>}
                </li>
              ))}</ul>
            )}
            <form onSubmit={addTeacher} className="flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-start">
              <Field label="Co-Lehrperson per E-Mail hinzufügen" htmlFor="co-email" error={coError} hint="Die Person braucht bereits ein Lehrpersonen-Konto in WendApply." className="sm:flex-1"><Input id="co-email" type="email" className="text-base! sm:text-base!" autoComplete="off" value={coEmail} onChange={(e) => setCoEmail(e.target.value)} placeholder="kollegin@schule.ch" aria-invalid={!!coError} /></Field>
              <Button type="submit" variant="secondary" className="min-h-11 sm:mt-[1.65rem] sm:min-h-11" icon={<UserPlus size={15} />} loading={busy === "co"}>Hinzufügen</Button>
            </form>
          </>
        )}
      </section>

      <Modal open={confirm === "code"} onClose={() => setConfirm("")} title="Neuen Code erstellen?" description="Der alte Code und alle Links mit dem alten Code funktionieren danach nicht mehr. Bisherige Schüler:innen bleiben in der Klasse.">
        <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" data-autofocus onClick={() => setConfirm("")}>Abbrechen</Button><Button loading={busy === "code"} onClick={() => run("code", async () => { await regenerateClassCode(cls.id); onChanged(); }, "Neuer Code erstellt.")}>Neuen Code erstellen</Button></div>
      </Modal>
      <Modal open={confirm === "delete"} onClose={() => setConfirm("")} title={`Klasse „${cls.name}“ löschen?`} description="Alle Schülerinnen und Schüler werden aus der Klasse entfernt, die Mitteilungen und Einladungen gehen verloren. Ihre Bewerbungen bleiben unberührt. Das kann nicht rückgängig gemacht werden. Tipp: Archivieren ist reversibel.">
        <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" data-autofocus onClick={() => setConfirm("")}>Abbrechen</Button><Button variant="danger" loading={busy === "delete"} onClick={() => run("delete", async () => { await deleteClass(cls.id); router.replace("/teacher"); })}>Endgültig löschen</Button></div>
      </Modal>
    </div>
  );
}
