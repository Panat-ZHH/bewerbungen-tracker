"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ChevronRight, GraduationCap, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    <div className="space-y-6 pb-safe">
      <PageHeader eyebrow="Lehrkraft" title="Meine Klassen" description="Erstelle eine Klasse, teile den Code und behalte den Bewerbungsfortschritt deiner Schülerinnen und Schüler im Blick." actions={<Button className="min-h-11 sm:min-h-11" icon={<Plus size={16} />} onClick={() => setOpen(true)}>Klasse erstellen</Button>} />
      {error && <div role="alert" className="status status-danger flex items-center justify-between gap-3 rounded-[var(--radius-md)] p-3 text-sm"><span>{error}</span><Button size="sm" variant="secondary" className="min-h-11 sm:min-h-11" onClick={() => { setError(""); load(); }}>Erneut laden</Button></div>}
      {!classes && !error && <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-40 rounded-[var(--radius-lg)]" />)}</div>}
      {classes && classes.length === 0 && <EmptyState icon={<GraduationCap size={26} />} title="Noch keine Klasse" description="Erstelle deine erste Klasse und teile den Beitrittscode mit deinen Schülern." action={<Button className="min-h-11 sm:min-h-11" icon={<Plus size={16} />} onClick={() => setOpen(true)}>Klasse erstellen</Button>} />}
      {classes && classes.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {classes.map((c) => (
            <Card key={c.id} className="space-y-4 p-5">
              <Link href={`/classes/${c.id}`} className="group flex min-h-11 items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-heading truncate">{c.name}</h2>
                  <p className="text-small text-muted">{c.schoolYear ? `Schuljahr ${c.schoolYear} · ` : ""}<Users size={13} className="-mt-0.5 inline" /> {c.memberCount} Schüler</p>
                </div>
                <ChevronRight size={18} className="mt-1 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
              </Link>
              <div>
                <p className="text-eyebrow mb-2">Beitrittscode</p>
                <CodeActions code={c.joinCode} name={c.name} />
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Klasse erstellen" description="Schüler treten mit einem Code bei, den du danach erhältst.">
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
