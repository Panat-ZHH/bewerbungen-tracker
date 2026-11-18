"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { freeAccessLabel, type FreeAccessForm, type FreeAccessLike } from "@/lib/admin/free-access";
import { fmtDate, isoDay } from "./shared";

export const emptyFreeAccessForm = (): FreeAccessForm => ({ kind: "forever", until: isoDay(30), note: "" });

/** Badge "Gratis (unbefristet)" / "Gratis bis …" – nothing when no active grant. */
export function FreeAccessBadge({ grant }: { grant: FreeAccessLike | null | undefined }) {
  const label = freeAccessLabel(grant, fmtDate);
  return label ? <Badge tone="success" data-testid="admin-free-badge">{label}</Badge> : null;
}

/** Fields of the "Gratis-Zugang geben" dialog: unbefristet or bis Datum, optional note. */
export function FreeAccessFields({ form, onChange, invalid, scope }: {
  form: FreeAccessForm; onChange: (f: FreeAccessForm) => void; invalid: (field: string) => true | undefined; scope: "user" | "school";
}) {
  return (
    <>
      <p className="text-small text-muted">
        {scope === "school"
          ? "Gilt für alle Schüler:innen, Lehrpersonen und Schuladmins dieser Schule, ohne Platzbeschränkung. Kein Pilot, keine Preise."
          : "Voller Zugang ohne Abo, auch für Lehrpersonen. Keine Testwoche, keine Preise."}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Dauer">
        <Button type="button" size="sm" variant={form.kind === "forever" ? "primary" : "secondary"} aria-pressed={form.kind === "forever"}
          data-testid="admin-free-forever" onClick={() => onChange({ ...form, kind: "forever" })}>Unbefristet</Button>
        <Button type="button" size="sm" variant={form.kind === "until" ? "primary" : "secondary"} aria-pressed={form.kind === "until"}
          data-testid="admin-free-until" onClick={() => onChange({ ...form, kind: "until" })}>Bis Datum</Button>
      </div>
      {form.kind === "until" && (
        <Field label="Gratis bis" htmlFor={`f-${scope}-until`} hint="Gilt bis Ende dieses Tages.">
          <Input id={`f-${scope}-until`} type="date" min={isoDay(0)} value={form.until} onChange={(e) => onChange({ ...form, until: e.target.value })} aria-invalid={invalid("until")} />
        </Field>
      )}
      <Field label="Notiz (optional)" htmlFor={`f-${scope}-note`} hint="Max. 500 Zeichen">
        <Textarea id={`f-${scope}-note`} maxLength={500} value={form.note} onChange={(e) => onChange({ ...form, note: e.target.value })} aria-invalid={invalid("note")} />
      </Field>
    </>
  );
}
