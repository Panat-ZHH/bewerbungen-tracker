"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Plus } from "lucide-react";
import { createApplication, updateApplication } from "@/lib/storage";
import { statusLabels } from "@/lib/utils";
import type { Application, ApplicationCategory, ApplicationStatus } from "@/types";

const categories: { value: ApplicationCategory; label: string }[] = [
  { value: "software", label: "Software" },
  { value: "sales", label: "Vertrieb" },
  { value: "business", label: "Wirtschaft" },
  { value: "finance", label: "Finanzen" },
  { value: "banking", label: "Bank" },
  { value: "consulting", label: "Beratung" },
  { value: "other", label: "Anderes" },
];

type FormValue = {
  company: string;
  position: string;
  location: string;
  jobUrl: string;
  source: string;
  category: ApplicationCategory;
  salaryMin: string;
  salaryMax: string;
  currency: string;
  deadline: string;
  status: ApplicationStatus;
  jobDescription: string;
  notes: string;
};

const blankForm: FormValue = {
  company: "", position: "", location: "", jobUrl: "", source: "", category: "other",
  salaryMin: "", salaryMax: "", currency: "CHF", deadline: "", status: "saved", jobDescription: "", notes: "",
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
    salaryMin: application.salaryMin?.toString() ?? "",
    salaryMax: application.salaryMax?.toString() ?? "",
    currency: application.currency ?? "CHF",
    deadline: application.deadline ?? "",
    status: application.status,
    jobDescription: application.jobDescription ?? "",
    notes: application.notes ?? "",
  };
}

export function ApplicationForm({ application }: { application?: Application }) {
  const router = useRouter();
  const [form, setForm] = useState<FormValue>(() => toForm(application));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isEditing = Boolean(application);

  function update<K extends keyof FormValue>(key: K, value: FormValue[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      ...form,
      salaryMin: form.salaryMin ? Number(form.salaryMin) : undefined,
      salaryMax: form.salaryMax ? Number(form.salaryMax) : undefined,
      appliedAt: ["applied", "interview", "final_interview", "offer", "rejected"].includes(form.status)
        ? (application?.appliedAt ?? new Date().toISOString().slice(0, 10))
        : undefined,
    };

    try {
      const result = isEditing && application
        ? await updateApplication(application.id, payload)
        : await createApplication(payload);
      if (result) router.push(`/applications/${result.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Das hat nicht geklappt. Versuch es bitte noch einmal.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-2xl">
      {error && <p role="alert" className="mb-5 rounded-xl border border-[#e8c7c7] bg-[#fff8f8] px-4 py-3 text-sm text-[#a32828]">{error}</p>}

      <div className="space-y-5">
        <Field label="Firma" required value={form.company} onChange={(value) => update("company", value)} placeholder="Zum Beispiel: Migros" autoFocus />
        <Field label="Welche Stelle?" required value={form.position} onChange={(value) => update("position", value)} placeholder="Zum Beispiel: Mediamatiker:in" />
        <SelectField label="Was ist der Stand?" value={form.status} onChange={(value) => update("status", value)} options={Object.entries(statusLabels).map(([value, label]) => ({ value: value as ApplicationStatus, label }))} />
      </div>

      <details open={isEditing} className="mt-7 border-t border-[#e5e5ea] pt-5">
        <summary className="cursor-pointer list-none text-sm font-semibold text-[#0866d6] marker:hidden">
          <span className="flex items-center gap-2"><Plus size={16} /> Noch mehr eintragen <span className="font-normal text-muted">(optional)</span></span>
        </summary>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field label="Ort" value={form.location} onChange={(value) => update("location", value)} placeholder="Zürich oder von zu Hause" />
          <SelectField label="Berufsfeld" value={form.category} onChange={(value) => update("category", value)} options={categories} />
          <Field label="Link zur Stelle" value={form.jobUrl} onChange={(value) => update("jobUrl", value)} placeholder="https://…" type="url" />
          <Field label="Wo hast du die Stelle gefunden?" value={form.source} onChange={(value) => update("source", value)} placeholder="Zum Beispiel: jobs.ch" />
          <Field label="Bewerben bis" value={form.deadline} onChange={(value) => update("deadline", value)} type="date" />
          <Field label="Mindestlohn pro Jahr" value={form.salaryMin} onChange={(value) => update("salaryMin", value)} type="number" placeholder="Zum Beispiel: 65000" />
          <Field label="Höchstlohn pro Jahr" value={form.salaryMax} onChange={(value) => update("salaryMax", value)} type="number" placeholder="Zum Beispiel: 80000" />
          <Field label="Währung" value={form.currency} onChange={(value) => update("currency", value)} placeholder="CHF" />
          <TextArea label="Was ist in der Stellenanzeige wichtig?" value={form.jobDescription} onChange={(value) => update("jobDescription", value)} />
          <TextArea label="Deine Notizen" value={form.notes} onChange={(value) => update("notes", value)} placeholder="Fragen, Ideen oder was du als Nächstes tun möchtest …" />
        </div>
      </details>

      <div className="mt-7 flex flex-col-reverse gap-3 border-t border-[#e5e5ea] pt-5 sm:flex-row sm:items-center">
        <button type="button" onClick={() => router.back()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium text-[#5e5e63] hover:bg-[#f2f2f4]">
          <ArrowLeft size={16} /> Zurück
        </button>
        <button disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#0866d6] px-5 text-sm font-semibold text-white hover:bg-[#075bbb] disabled:opacity-60">
          {isEditing ? <Check size={16} /> : <Plus size={16} />}
          {saving ? "Speichert …" : isEditing ? "Änderungen speichern" : "Bewerbung speichern"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", required = false, autoFocus = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium">{label}{required && <span aria-hidden="true"> *</span>}</span>
      <input required={required} autoFocus={autoFocus} type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-xl border border-[#d2d2d7] bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-[#737378] focus:border-[#0866d6] focus:ring-2 focus:ring-[#0866d6]/15" />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (value: never) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as never)} className="min-h-11 w-full rounded-xl border border-[#d2d2d7] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#0866d6] focus:ring-2 focus:ring-[#0866d6]/15">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function TextArea({ label, value, onChange, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block sm:col-span-2">
      <span className="mb-2 block text-sm font-medium">{label}</span>
      <textarea rows={4} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="w-full resize-y rounded-xl border border-[#d2d2d7] bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-[#737378] focus:border-[#0866d6] focus:ring-2 focus:ring-[#0866d6]/15" />
    </label>
  );
}