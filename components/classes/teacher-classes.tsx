"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ChevronRight, GraduationCap, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { createClass, listMyClasses } from "@/lib/classes";
import type { SchoolClass } from "@/types";
import { CodeActions, errorMessage } from "./shared";

export function TeacherClasses() {
  const [classes, setClasses] = useState<SchoolClass[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(() => {
    listMyClasses().then(setClasses).catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setFormError("Bitte gib einen Klassennamen ein."); return; }
    setSaving(true); setFormError("");
    try {
      const created = await createClass(name.trim(), year.trim());
      setClasses((prev) => [created, ...(prev ?? [])]);
      setOpen(false); setName(""); setYear("");
    } catch (e) { setFormError(errorMessage(e)); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Meine Klassen" description="Erstelle eine Klasse, teile den Code und behalte den Bewerbungsfortschritt deiner Schülerinnen und Schüler im Blick." actions={<Button className="min-h-11 sm:min-h-11" icon={<Plus size={16} />} onClick={() => setOpen(true)}>Klasse erstellen</Button>} />
      {error && <div role="alert" className="status status-danger flex items-center justify-between gap-3 text-sm"><span>{error}</span><Button size="sm" variant="secondary" className="min-h-11 sm:min-h-11" onClick={() => { setError(""); load(); }}>Erneut laden</Button></div>}
      {!classes && !error && <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-20 rounded-[var(--radius-lg)]" />)}</div>}
      {classes && classes.length === 0 && <EmptyState icon={<GraduationCap size={26} />} title="Noch keine Klasse" description="Erstelle deine erste Klasse und teile den Beitrittscode mit deinen Schüler:innen." action={<Button className="min-h-11 sm:min-h-11" icon={<Plus size={16} />} onClick={() => setOpen(true)}>Klasse erstellen</Button>} />}
      {classes && classes.length > 0 && (
        <ul className="rows border-y-[length:var(--border-w)] border-[var(--outline)]">
          {classes.map((c) => (
            <li key={c.id} className="flex flex-col gap-x-6 gap-y-2 py-4 md:flex-row md:items-center md:justify-between">
              <Link href={`/classes/${c.id}`} className="group flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display truncate text-xl font-extrabold tracking-[-.02em] group-hover:underline group-hover:decoration-[var(--sun)] group-hover:decoration-4 group-hover:underline-offset-4">{c.name}</h2>
                  <p className="text-small mt-0.5 text-muted">{c.schoolYear ? `Schuljahr ${c.schoolYear} · ` : ""}<Users size={13} className="-mt-0.5 inline" /> {c.memberCount} Schüler:innen</p>
                </div>
                <ChevronRight size={20} strokeWidth={2.4} className="shrink-0 transition-transform group-hover:translate-x-1 md:hidden" />
              </Link>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-label">Beitrittscode</p>
                <CodeActions code={c.joinCode} name={c.name} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Klasse erstellen" description="Schüler:innen treten mit einem Code bei, den du danach erhältst.">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Klassenname" htmlFor="class-name"><Input id="class-name" className="text-base! sm:text-base!" data-autofocus value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. 10b Wirtschaft" maxLength={80} /></Field>
          <Field label="Schuljahr (optional)" htmlFor="class-year"><Input id="class-year" className="text-base! sm:text-base!" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026/27" maxLength={20} /></Field>
          {formError && <p role="alert" className="text-small text-[var(--danger-fg)]">{formError}</p>}
          <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Abbrechen</Button><Button type="submit" loading={saving}>Erstellen</Button></div>
        </form>
      </Modal>
    </div>
  );
}
