"use client";

import Link from "next/link";
import { useId, useRef, useState, type DragEvent } from "react";
import { FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { AI_REVIEW_ACCEPT, AI_REVIEW_LIMITS, formatFileSize, validateReviewFile, validateReviewForm, type ReviewFields, type ReviewFormErrors } from "@/lib/ai-review-core";
import { cn } from "@/lib/utils";

export type ReviewFormValue = ReviewFields & { file: File | null; consent: boolean };

/** Upload (drag & drop + button), optional company / job fields, consent tick box. Calls onSubmit only when valid. */
export function ReviewForm({ value, onChange, onSubmit, prefilledFrom }: { value: ReviewFormValue; onChange: (next: ReviewFormValue) => void; onSubmit: () => void; prefilledFrom?: string }) {
  const [errors, setErrors] = useState<ReviewFormErrors>({});
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();

  const set = (patch: Partial<ReviewFormValue>) => {
    onChange({ ...value, ...patch });
    // clear the error of a field as soon as it is changed
    const keys = Object.keys(patch) as (keyof ReviewFormErrors)[];
    if (keys.some((key) => errors[key])) setErrors((current) => { const next = { ...current }; keys.forEach((key) => delete next[key]); return next; });
  };

  function pick(file?: File | null) {
    if (!file) return;
    const problem = validateReviewFile(file);
    if (problem) { setErrors((current) => ({ ...current, file: problem })); if (input.current) input.current.value = ""; return; }
    set({ file });
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files?.[0]);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const check = validateReviewForm(value);
    setErrors(check.errors);
    if (!check.ok) {
      const first = (["file", "company", "beruf", "jobAd", "consent"] as const).find((key) => check.errors[key]);
      document.getElementById(`${id}-${first}`)?.focus();
      return;
    }
    onSubmit();
  }

  const jobAdLength = value.jobAd?.length ?? 0;

  return (
    <form onSubmit={submit} noValidate className="space-y-8" aria-label="Bewerbungs-Check">
      <section aria-labelledby={`${id}-step1`}>
        <h2 id={`${id}-step1`} className="text-heading mb-1"><span className="tabular mr-2 text-[var(--muted)]">1</span>Deine Bewerbung</h2>
        <p className="mb-4 text-sm text-muted">Am besten dein Motivationsschreiben als PDF oder Word-Datei (.docx), max. 5 MB.</p>

        <input ref={input} id={`${id}-file-input`} type="file" accept={AI_REVIEW_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(event) => pick(event.target.files?.[0])} />

        {value.file ? (
          <div className="inset flex items-center gap-3 py-2 pl-4 pr-1.5" data-testid="ai-review-file">
            <FileText size={22} strokeWidth={2.2} aria-hidden className="shrink-0 text-[var(--brand)]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{value.file.name}</p>
              <p className="text-small text-muted">{formatFileSize(value.file.size)}</p>
            </div>
            <Button type="button" variant="ghost" size="sm" id={`${id}-file`} onClick={() => input.current?.click()} className="shrink-0">Ändern</Button>
            <button type="button" onClick={() => { set({ file: null }); if (input.current) input.current.value = ""; }} aria-label="Datei entfernen" title="Entfernen" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)]"><X size={18} strokeWidth={2.4} /></button>
          </div>
        ) : (
          <div
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            data-dragging={dragging || undefined}
            className={cn(
              "flex flex-col items-center gap-3 rounded-[var(--radius-xl)] border-2 border-dashed px-5 py-8 text-center transition-colors sm:py-10",
              errors.file ? "border-[var(--danger-fg)]" : "border-[var(--outline)]",
              dragging && "border-solid border-[var(--brand)] bg-[var(--brand-soft)]",
            )}
          >
            <Upload size={30} strokeWidth={2} aria-hidden className="text-[var(--brand)]" />
            <p className="text-sm font-semibold"><span className="hidden pointer-fine:inline">Datei hierher ziehen oder </span><span className="pointer-fine:hidden">Wähle deine Datei aus.</span></p>
            <Button type="button" variant="secondary" id={`${id}-file`} aria-describedby={errors.file ? `${id}-file-error` : undefined} onClick={() => input.current?.click()} icon={<Upload size={15} />}>Datei auswählen</Button>
            <p className="text-small text-muted">PDF oder DOCX, max. 5 MB</p>
          </div>
        )}
        {errors.file && <p id={`${id}-file-error`} role="alert" className="text-small mt-2 font-medium text-[var(--danger-fg)]">{errors.file}</p>}
      </section>

      <section aria-labelledby={`${id}-step2`}>
        <h2 id={`${id}-step2`} className="text-heading mb-1"><span className="tabular mr-2 text-[var(--muted)]">2</span>Wohin geht sie? <span className="text-base font-semibold text-[var(--muted)]">(freiwillig)</span></h2>
        <p className="mb-4 text-sm text-muted">{prefilledFrom ? <>Schon ausgefüllt aus deiner Bewerbung bei <strong className="text-[var(--ink)]">{prefilledFrom}</strong>.</> : "Mit diesen Angaben bekommst du Tipps, die genau zur Firma passen."}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Firma" htmlFor={`${id}-company`} error={errors.company}>
            <Input id={`${id}-company`} value={value.company ?? ""} maxLength={AI_REVIEW_LIMITS.company} autoComplete="organization" placeholder="z. B. Migros" onChange={(event) => set({ company: event.target.value })} aria-invalid={Boolean(errors.company) || undefined} />
          </Field>
          <Field label="Beruf / Lehrstelle" htmlFor={`${id}-beruf`} error={errors.beruf}>
            <Input id={`${id}-beruf`} value={value.beruf ?? ""} maxLength={AI_REVIEW_LIMITS.beruf} placeholder="z. B. Detailhandelsfachfrau EFZ" onChange={(event) => set({ beruf: event.target.value })} aria-invalid={Boolean(errors.beruf) || undefined} />
          </Field>
          <Field label="Stelleninserat" htmlFor={`${id}-jobAd`} error={errors.jobAd} hint={jobAdLength ? `${jobAdLength.toLocaleString("de-CH")} / ${AI_REVIEW_LIMITS.jobAd.toLocaleString("de-CH")} Zeichen` : "Kopiere den Text des Inserats hier hinein."} className="sm:col-span-2">
            <Textarea id={`${id}-jobAd`} value={value.jobAd ?? ""} rows={5} placeholder="Was die Firma sucht, was du lernst, was du mitbringen sollst …" onChange={(event) => set({ jobAd: event.target.value })} aria-invalid={Boolean(errors.jobAd) || undefined} />
          </Field>
        </div>
      </section>

      <section aria-labelledby={`${id}-step3`}>
        <h2 id={`${id}-step3`} className="text-heading mb-3"><span className="tabular mr-2 text-[var(--muted)]">3</span>Kurz lesen und bestätigen</h2>
        <div className="inset space-y-2 px-4 py-4 text-sm leading-6 sm:px-5">
          <p>So funktioniert der Check:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Der Text aus deiner Datei wird an einen KI-Dienst geschickt (<strong>Anthropic, USA</strong>). Die KI liest ihn und gibt dir Tipps.</li>
            <li>Deine Datei und der Text werden <strong>nicht gespeichert</strong>.</li>
            <li>Nur das Ergebnis wird in deinem Konto gespeichert. Du kannst es jederzeit löschen.</li>
            <li>Lösch vorher heikle Angaben wie deine <strong>AHV-Nummer</strong>, Adresse oder Telefonnummer, wenn du kannst.</li>
          </ul>
          <p><Link href="/datenschutz-jugend" className="inline-flex min-h-11 items-center font-semibold text-[var(--brand)] underline underline-offset-4">Datenschutz einfach erklärt</Link></p>
        </div>
        <label htmlFor={`${id}-consent`} className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 py-1">
          <input id={`${id}-consent`} type="checkbox" checked={value.consent} onChange={(event) => set({ consent: event.target.checked })} aria-invalid={Boolean(errors.consent) || undefined} aria-describedby={errors.consent ? `${id}-consent-error` : undefined} className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--brand)]" />
          <span className="text-sm font-semibold leading-6">Ich habe das gelesen und bin einverstanden, dass mein Text für den Check an die KI geschickt wird.</span>
        </label>
        {errors.consent && <p id={`${id}-consent-error`} role="alert" className="text-small ml-9 font-medium text-[var(--danger-fg)]">{errors.consent}</p>}
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" variant="sun" size="lg" className="w-full sm:w-auto">Bewerbung checken</Button>
        <p className="text-small text-muted">Dauert etwa 10 bis 30 Sekunden.</p>
      </div>
    </form>
  );
}
