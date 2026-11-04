"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Mail, RefreshCw, Trash2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { classInviteLink, deleteClass, regenerateClassCode, renameClass } from "@/lib/classes";
import type { SchoolClass } from "@/types";
import { CodeActions, errorMessage } from "./shared";

/** Teacher tools for one class: share link, rename, new code, delete. */
export function ClassSettings({ cls, open, onClose, onChanged }: { cls: SchoolClass; open: boolean; onClose: () => void; onChanged: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(cls.name);
  const [year, setYear] = useState(cls.schoolYear);
  const [busy, setBusy] = useState<"" | "save" | "code" | "delete">("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<"" | "code" | "delete">("");
  const link = classInviteLink(cls.joinCode);
  const mailto = `mailto:?subject=${encodeURIComponent(`Klasse ${cls.name} auf WendApply`)}&body=${encodeURIComponent(`Hallo!\n\nTritt unserer Klasse "${cls.name}" auf WendApply bei:\n${link}\n\n(Oder gib in der App den Code ein: ${cls.joinCode})`)}`;

  async function run(kind: "save" | "code" | "delete", action: () => Promise<void>) {
    setBusy(kind); setError(""); setNote("");
    try { await action(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(""); setConfirm(""); }
  }
  const save = (event: FormEvent) => { event.preventDefault(); void run("save", async () => { if (!name.trim()) throw new Error("INVALID_NAME"); await renameClass(cls.id, name.trim(), year.trim()); setNote("Gespeichert."); onChanged(); }); };

  return (
    <Modal open={open} onClose={() => { setConfirm(""); setError(""); setNote(""); onClose(); }} title="Klasse verwalten" description="Einladungslink, Name und Code deiner Klasse.">
      <div className="space-y-5">
        <section className="space-y-2" aria-label="Einladung">
          <p className="text-eyebrow">Einladung</p>
          <CodeActions code={cls.joinCode} name={cls.name} />
          <p className="text-small select-all break-all text-muted">{link}</p>
          <ButtonLink href={mailto} size="sm" variant="secondary" className="min-h-11 sm:min-h-11" icon={<Mail size={14} />}>Per E-Mail einladen</ButtonLink>
        </section>
        <form onSubmit={save} className="space-y-3">
          <Field label="Klassenname" htmlFor="cs-name"><Input id="cs-name" className="text-base! sm:text-base!" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
          <Field label="Schuljahr" htmlFor="cs-year"><Input id="cs-year" className="text-base! sm:text-base!" value={year} onChange={(e) => setYear(e.target.value)} maxLength={20} /></Field>
          <Button type="submit" size="sm" className="min-h-11 sm:min-h-11" loading={busy === "save"}>Speichern</Button>
        </form>
        <section className="space-y-3 border-t border-[var(--line)] pt-4">
          {confirm === "code" ? (
            <div className="space-y-2"><p className="text-small">Der alte Code und Link funktionieren dann nicht mehr. Bisherige Schüler bleiben in der Klasse.</p><div className="flex flex-wrap gap-2"><Button size="sm" className="min-h-11 sm:min-h-11" variant="ghost" onClick={() => setConfirm("")}>Abbrechen</Button><Button size="sm" className="min-h-11 sm:min-h-11" loading={busy === "code"} onClick={() => run("code", async () => { await regenerateClassCode(cls.id); setNote("Neuer Code erstellt."); onChanged(); })}>Neuen Code erstellen</Button></div></div>
          ) : <Button size="sm" className="min-h-11 sm:min-h-11" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => setConfirm("code")}>Neuen Code erstellen</Button>}
          {confirm === "delete" ? (
            <div className="space-y-2"><p className="text-small">Klasse „{cls.name}“ löschen? Alle Schüler werden entfernt. Ihre Bewerbungen bleiben bei ihnen unberührt.</p><div className="flex flex-wrap gap-2"><Button size="sm" className="min-h-11 sm:min-h-11" variant="ghost" onClick={() => setConfirm("")}>Abbrechen</Button><Button size="sm" className="min-h-11 sm:min-h-11" variant="danger" loading={busy === "delete"} onClick={() => run("delete", async () => { await deleteClass(cls.id); router.replace("/classes"); })}>Endgültig löschen</Button></div></div>
          ) : <Button size="sm" className="min-h-11 sm:min-h-11" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setConfirm("delete")}>Klasse löschen</Button>}
        </section>
        {error && <p role="alert" className="text-small text-[var(--danger-fg)]">{error}</p>}
        {note && <p role="status" className="text-small text-[var(--success-fg)]">{note}</p>}
      </div>
    </Modal>
  );
}
