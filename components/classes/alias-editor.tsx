"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setStudentAlias } from "@/lib/profile-names";
import { errorMessage } from "./shared";

/** Teacher: give a student a clear name (alias) that only teachers of this class see. Empty text removes it. Reusable by app/teacher/*. */
export function AliasEditor({ classId, studentId, realName, alias, onSaved }: { classId: string; studentId: string; realName: string; alias?: string; onSaved: (alias: string) => void }) {
  const [value, setValue] = useState(alias ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setSaved(false);
    try { await setStudentAlias(classId, studentId, value.trim()); onSaved(value.trim()); setSaved(true); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="space-y-1.5">
      <label htmlFor={`alias-${studentId}`} className="text-sm font-semibold">Anzeigename für dich</label>
      <p className="text-small text-muted">Nur Lehrpersonen dieser Klasse sehen ihn. Angemeldet als «{realName}». Leer lassen, um den Namen der Person zu zeigen.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id={`alias-${studentId}`} value={value} onChange={(e) => { setValue(e.target.value); setSaved(false); }} maxLength={60} placeholder="z. B. Mia Muster" className="text-base! sm:max-w-xs sm:text-base!" />
        <Button type="submit" size="sm" variant="secondary" className="min-h-11 sm:min-h-11" loading={busy}>Speichern</Button>
      </div>
      {error && <p role="alert" className="text-small text-[var(--danger-fg)]">{error}</p>}
      {saved && <p role="status" className="text-small text-[var(--success-fg)]">Gespeichert.</p>}
    </form>
  );
}
