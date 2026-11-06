"use client";

import { useState } from "react";
import { Bookmark, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { JobPreset } from "./engine";

export function PresetMenu({ presets, onSave, onApply, onDelete, canSave }: { presets: JobPreset[]; onSave: (name: string) => void; onApply: (preset: JobPreset) => void; onDelete: (id: string) => void; canSave: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  return (
    <>
      <Button type="button" variant="secondary" size="sm" icon={<Bookmark size={15} />} onClick={() => setOpen(true)}>Gespeicherte Suchen{presets.length ? ` (${presets.length})` : ""}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Gespeicherte Suchen" description="Suche samt Filtern speichern und später mit einem Klick wieder öffnen.">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!canSave) return; onSave(name); setName(""); }}>
          <Input data-autofocus aria-label="Name der Suche" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, z. B. Informatik Zürich" />
          <Button type="submit" disabled={!canSave}>Speichern</Button>
        </form>
        {!canSave && <p className="mt-2 text-xs text-muted">Gib zuerst einen Suchbegriff ein oder setze einen Filter.</p>}
        {presets.length === 0 ? <p className="mt-4 text-sm text-muted">Noch nichts gespeichert.</p> : (
          <ul className="mt-4 space-y-1.5">
            {presets.map((preset) => (
              <li key={preset.id} className="flex items-center gap-1">
                <button type="button" onClick={() => { onApply(preset); setOpen(false); }} className="min-h-11 min-w-0 flex-1 rounded-xl px-3 text-left text-sm font-medium hover:bg-[var(--hover)]"><span className="block truncate">{preset.name}</span><span className="block truncate text-xs font-normal text-muted">{preset.state.query || "ohne Suchbegriff"}</span></button>
                <button type="button" aria-label={`${preset.name} löschen`} onClick={() => onDelete(preset.id)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-[var(--hover)] hover:text-[var(--danger-fg)]"><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
