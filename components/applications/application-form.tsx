"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createApplication, updateApplication } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { draftKey, isDirty, parseDraft, serializeDraft } from "@/lib/application-draft";
import { cn, statusLabels } from "@/lib/utils";
import { friendlyMessage } from "@/lib/ux";
import { reward } from "@/lib/rewards";
import { toast } from "@/lib/toast";
import { StatusMessage } from "@/components/ui/skeleton";
import { statusHints } from "@/components/ui/status-badge";
import { isSchnupperStatus, isSentStatus, schnupperResultLabels, showsDeadline, testResultLabels } from "@/lib/status";
import { CATEGORY_OPTIONS } from "@/lib/categories";
import type { Application, ApplicationCategory, ApplicationStatus } from "@/types";

type FormValue = {
  company: string;
  position: string;
  location: string;
  jobUrl: string;
  source: string;
  category: ApplicationCategory;
  deadline: string;
  status: ApplicationStatus;
  jobDescription: string;
  notes: string;
  schnupperDate: string;
  schnupperResult: string;
  schnupperNotes: string;
  testDate: string;
  testResult: string;
  contactName: string;
  contactInfo: string;
};

const blankForm: FormValue = {
  company: "", position: "", location: "", jobUrl: "", source: "", category: "other",
  deadline: "", status: "saved", jobDescription: "", notes: "", contactName: "", contactInfo: "",
  schnupperDate: "", schnupperResult: "", schnupperNotes: "", testDate: "", testResult: "",
};

function toForm(application?: Application): FormValue {
  if (!application) return blankForm;
  return {
    company: application.company,
    position: application.position,
    location: application.location ?? "",
    jobUrl: application.jobUrl ?? "",
    source: application.source ?? "",
    category: application.category,
    deadline: application.deadline ?? "",
    status: application.status,
    jobDescription: application.jobDescription ?? "",
    notes: application.notes ?? "",
    schnupperDate: application.schnupperDate ?? "",
    schnupperResult: application.schnupperResult ?? "",
    schnupperNotes: application.schnupperNotes ?? "",
    testDate: application.testDate ?? "",
    testResult: application.testResult ?? "",
    contactName: application.contactName ?? "",
    contactInfo: application.contactInfo ?? "",
  };
}

type Errors = Partial<Record<keyof FormValue, string>>;

function validate(form: FormValue): Errors {
  const errors: Errors = {};
  if (!form.company.trim()) errors.company = "Bitte gib die Firma an.";
  if (!form.position.trim()) errors.position = "Bitte gib die Stelle an.";
  if (form.jobUrl.trim() && !/^https?:\/\/\S+\.\S+/i.test(form.jobUrl.trim())) errors.jobUrl = "Der Link sollte mit https:// beginnen.";
  return errors;
}

/**
 * `onSaved` lets the parent (the detail page) show the saved data and leave edit mode. Without it the form navigates to the detail page.
 * Everything typed is also kept as a local draft ("Zwischenstand"), so nothing is lost when the user leaves, reloads or the save fails.
 */
export function ApplicationForm({ application, onSaved }: { application?: Application; onSaved?: (application: Application, options: { stay: boolean }) => void }) {
  const router = useRouter();
  const [form, setForm] = useState<FormValue>(() => toForm(application));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState<Partial<Record<keyof FormValue, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const isEditing = Boolean(application);
  const base = toForm(application);
  const [userId, setUserId] = useState("");
  const [restored, setRestored] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const draftReady = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const target = application?.id ?? "new";
  const dirty = isDirty(form as unknown as Record<string, string>, base as unknown as Record<string, string>);
  const errors = validate(form);
  const shown = (key: keyof FormValue) => (submitted || touched[key] ? errors[key] : undefined);
  const optionalHasError = submitted && (["jobUrl"] as const).some((key) => errors[key]);

  function update<K extends keyof FormValue>(key: K, value: FormValue[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const bind = (key: keyof FormValue) => ({
    value: form[key] as string,
    onChange: (value: string) => update(key, value as never),
    onBlur: () => setTouched((current) => ({ ...current, [key]: true })),
    error: shown(key),
  });

  // Who is signed in decides which local draft belongs to this form.
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) setUserId(data.session?.user.id ?? "anonymous"); });
    return () => { active = false; };
  }, []);

  // Restore an unfinished draft once (after hydration, so server and client markup match).
  useEffect(() => {
    if (!userId || draftReady.current) return;
    draftReady.current = true;
    try {
      const draft = parseDraft(window.localStorage.getItem(draftKey(userId, target)), base as unknown as Record<string, string>);
      if (draft && isDirty(draft.form, base as unknown as Record<string, string>)) {
        // restoring from an external store (localStorage) after hydration is exactly what an effect is for
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setForm(draft.form as unknown as FormValue);
        setRestored(true);
      }
    } catch { /* storage blocked: the form simply works without drafts */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Keep the draft up to date while the user types (debounced); an untouched form stores nothing.
  useEffect(() => {
    if (!userId || !draftReady.current) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      try {
        const key = draftKey(userId, target);
        if (dirty) { window.localStorage.setItem(key, serializeDraft(form)); setDraftSaved(true); } else { window.localStorage.removeItem(key); setDraftSaved(false); }
      } catch { /* storage full or blocked */ }
    }, 400);
    return () => window.clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, userId]);

  // Warn before a tab close / reload while there are unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function clearDraft() {
    window.clearTimeout(saveTimer.current);
    try { if (userId) window.localStorage.removeItem(draftKey(userId, target)); } catch { /* ignore */ }
    setDraftSaved(false);
  }

  function discardDraft() {
    clearDraft();
    setForm(base);
    setRestored(false);
    setSubmitted(false);
    setTouched({});
    setError("");
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void persist(false);
  }

  /** `stay`: store an intermediate state ("Zwischenstand") and keep the form open. */
  async function persist(stay: boolean) {
    if (saving) return;
    setSubmitted(true);
    if (Object.keys(errors).length) {
      const count = Object.keys(errors).length;
      setError(count === 1 ? "Ein Feld braucht noch deine Aufmerksamkeit." : `${count} Felder brauchen noch deine Aufmerksamkeit.`);
      // move focus to the first invalid field so keyboard and screen-reader users land on it
      window.setTimeout(() => document.querySelector<HTMLElement>("form [aria-invalid='true']")?.focus(), 0);
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      ...form,
      appliedAt: isSentStatus(form.status)
        ? (application?.appliedAt ?? new Date().toISOString().slice(0, 10))
        : application?.appliedAt,
      schnupperDate: form.schnupperDate || undefined,
      schnupperResult: (form.schnupperResult || undefined) as Application["schnupperResult"],
      schnupperNotes: form.schnupperNotes.trim() || undefined,
      testDate: form.testDate || undefined,
      testResult: (form.testResult || undefined) as Application["testResult"],
    };

    try {
      const result = isEditing && application
        ? await updateApplication(application.id, payload)
        : await createApplication(payload);
      if (result) {
        if (payload.status === "applied" && (!isEditing || application?.status !== "applied")) reward("applied");
        clearDraft();
        setRestored(false);
        setSaving(false);
        toast({ message: stay ? "Zwischenstand gespeichert" : isEditing ? "Änderungen gespeichert" : "Bewerbung gespeichert – du findest sie jetzt unter „Bewerbungen“" });
        if (onSaved) onSaved(result, { stay });
        else router.push(`/applications/${result.id}`);
      } else {
        setError("Diese Bewerbung gibt es nicht mehr. Vielleicht wurde sie gelöscht.");
        setSaving(false);
      }
    } catch (cause) {
      console.error(cause);
      setError(friendlyMessage(cause, "Die Bewerbung konnte nicht gespeichert werden."));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-2xl">
      {error && <StatusMessage tone="danger" className="mb-5">{error}</StatusMessage>}
      {restored && (
        <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--info-line)] bg-[var(--info-bg)] px-4 py-3 text-sm text-[var(--info-fg)]">
          <span>Entwurf wiederhergestellt: Das hattest du schon eingetragen, aber noch nicht gespeichert.</span>
          <button type="button" onClick={discardDraft} className="inline-flex min-h-11 items-center gap-1.5 font-semibold underline-offset-2 hover:underline"><RotateCcw size={14} /> Entwurf verwerfen</button>
        </div>
      )}

      <fieldset className="min-w-0 space-y-5 border-0 p-0">
        <legend className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">Das Wichtigste</legend>
        <Field label="Firma" required {...bind("company")} placeholder="Zum Beispiel: Migros" autoFocus={!isEditing} autoComplete="organization" />
        <Field label="Welche Stelle?" required {...bind("position")} placeholder="Zum Beispiel: Mediamatiker:in" />
        <SelectField label="Was ist der Stand?" hint={statusHints[form.status]} value={form.status} onChange={(value) => update("status", value)} options={Object.entries(statusLabels).map(([value, label]) => ({ value: value as ApplicationStatus, label }))} />
      </fieldset>

      {isSchnupperStatus(form.status) && (
        <fieldset className="mt-7 min-w-0 space-y-5 border-0 p-0">
          <legend className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">Schnupperlehre</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Schnupperdatum" {...bind("schnupperDate")} type="date" />
            {form.status === "schnupper_done" && (
              <SelectField label="Wie war es?" value={form.schnupperResult} onChange={(value) => update("schnupperResult", value)} options={[{ value: "", label: "Noch offen" }, ...Object.entries(schnupperResultLabels).map(([value, label]) => ({ value, label }))]} />
            )}
          </div>
          <TextArea label="Notizen zum Schnuppern" value={form.schnupperNotes} onChange={(value) => update("schnupperNotes", value)} placeholder="Was hat dir gefallen? Welche Fragen hast du noch?" />
        </fieldset>
      )}

      {form.status === "aptitude_test" && (
        <fieldset className="mt-7 min-w-0 border-0 p-0">
          <legend className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">Eignungstest / Multicheck</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Testdatum" {...bind("testDate")} type="date" />
            <SelectField label="Ergebnis" value={form.testResult} onChange={(value) => update("testResult", value)} options={[{ value: "", label: "Noch offen" }, ...Object.entries(testResultLabels).map(([value, label]) => ({ value, label }))]} />
          </div>
        </fieldset>
      )}

      <details open={isEditing || optionalHasError || restored || undefined} className="group mt-7 border-t border-[var(--line)] pt-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-[var(--brand)] marker:hidden [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2"><Plus size={16} className="transition-transform group-open:rotate-45" /> Noch mehr eintragen <span className="font-normal text-muted">(optional)</span></span>
        </summary>
        <div className="mt-4 space-y-7">
          <fieldset className="min-w-0 border-0 p-0">
            <legend className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">Die Stelle</legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Ort" {...bind("location")} placeholder="Zürich oder von zu Hause" />
              <SelectField label="Berufsfeld (Suchkategorie)" value={form.category} onChange={(value) => update("category", value)} options={CATEGORY_OPTIONS} />
              <Field label="Link zur Stelle" {...bind("jobUrl")} placeholder="https://…" type="url" inputMode="url" />
              <Field label="Wo hast du die Stelle gefunden?" {...bind("source")} placeholder="Zum Beispiel: jobs.ch" />
              {showsDeadline(form.status) && <Field label="Bewerben bis" {...bind("deadline")} type="date" />}
            </div>
          </fieldset>
          <fieldset className="min-w-0 border-0 p-0">
            <legend className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">Kontakt in der Firma</legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Ansprechperson" {...bind("contactName")} placeholder="Zum Beispiel: Frau Meier" autoComplete="off" />
              <Field label="E-Mail oder Telefon" {...bind("contactInfo")} placeholder="lehrstellen@firma.ch" autoComplete="off" />
            </div>
          </fieldset>
          <fieldset className="min-w-0 border-0 p-0">
            <legend className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">Notizen</legend>
            <div className="space-y-5">
              <TextArea label="Was ist in der Stellenanzeige wichtig?" value={form.jobDescription} onChange={(value) => update("jobDescription", value)} />
              <TextArea label="Deine Notizen" value={form.notes} onChange={(value) => update("notes", value)} placeholder="Fragen, Ideen oder was du als Nächstes tun möchtest …" />
            </div>
          </fieldset>
        </div>
      </details>

      <div className="sticky bottom-[calc(var(--tabbar-h)+var(--safe-bottom))] z-10 -mx-4 mt-7 flex flex-col-reverse gap-3 border-t border-[var(--line)] bg-[var(--app-bar-bg)] px-4 py-4 sm:static sm:z-auto sm:mx-0 sm:flex-row sm:items-center sm:bg-transparent sm:px-0 sm:pb-0">
        <Button type="button" variant="ghost" onClick={() => router.back()} className="min-h-11 sm:min-h-11">
          <ArrowLeft size={16} /> Zurück
        </Button>
        {draftSaved && !saving && <span role="status" className="text-xs text-muted sm:ml-auto sm:mr-1">Entwurf auf diesem Gerät gesichert</span>}
        {isEditing && <Button type="button" variant="secondary" disabled={saving} onClick={() => void persist(true)} className="min-h-11 sm:min-h-11">Zwischenstand speichern</Button>}
        <Button type="submit" disabled={saving} className={cn("min-h-11 sm:min-h-11 px-6", !(draftSaved && !saving) && !isEditing && "sm:ml-auto")}>
          {isEditing ? <Check size={16} /> : <Plus size={16} />}
          {saving ? "Speichert …" : isEditing ? "Änderungen speichern" : "Bewerbung speichern"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, value, onChange, onBlur, error, placeholder, type = "text", required = false, autoFocus = false, inputMode, autoComplete }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  autoFocus?: boolean;
  inputMode?: "url" | "numeric";
  autoComplete?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">{label}{required && <span aria-hidden="true" className="text-muted"> *</span>}</label>
      <Input id={id} required={required} autoFocus={autoFocus} type={type} inputMode={inputMode} autoComplete={autoComplete} min={type === "number" ? 0 : undefined} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className={cn(error && "border-[var(--danger-fg)] focus:border-[var(--danger-fg)] focus:ring-[var(--danger-fg)]/15")} />
      {error && <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-[var(--danger-fg)]">{error}</p>}
    </div>
  );
}

function SelectField({ label, value, onChange, options, hint }: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: never) => void;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">{label}</label>
      <select id={id} value={value} aria-describedby={hint ? `${id}-hint` : undefined} onChange={(event) => onChange(event.target.value as never)} className="min-h-11 sm:min-h-11 w-full rounded-xl border border-[var(--field-border)] bg-[var(--field-bg)] px-3.5 py-2.5 text-base text-[var(--ink)] pointer-fine:text-sm outline-none transition focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand)]/15">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {hint && <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function TextArea({ label, value, onChange, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">{label}</label>
      <textarea id={id} rows={4} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="w-full resize-y rounded-xl border border-[var(--field-border)] bg-[var(--field-bg)] px-3.5 py-2.5 text-base text-[var(--ink)] pointer-fine:text-sm outline-none transition placeholder:text-[var(--placeholder)] focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand)]/15" />
    </div>
  );
}
