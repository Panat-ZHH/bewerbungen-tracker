"use client";

import { X } from "lucide-react";
import { EDUCATION_LABELS, FIELD_LABELS, JOB_TYPE_LABELS, LANGUAGE_LABELS, REMOTE_LABELS, effectiveRadiusKm, radiusLabel, type JobFilters } from "./engine";

export type FilterChip = { key: string; label: string; patch: Partial<JobFilters> };

export function filterChips(f: JobFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  // a radius only exists together with a place (default 10 km, 0 = "Nur dieser Ort")
  if (f.location) chips.push({ key: "loc", label: `Ort: ${f.location} · ${effectiveRadiusKm(f) === 0 ? radiusLabel(0) : `+${effectiveRadiusKm(f)} km`}`, patch: { location: "", radiusKm: undefined } });
  f.cantons.forEach((c) => chips.push({ key: `c-${c}`, label: `Kanton ${c}`, patch: { cantons: f.cantons.filter((v) => v !== c) } }));
  f.jobTypes.forEach((t) => chips.push({ key: `t-${t}`, label: JOB_TYPE_LABELS[t], patch: { jobTypes: f.jobTypes.filter((v) => v !== t) } }));
  if (f.workloadMin !== undefined || f.workloadMax !== undefined) chips.push({ key: "wl", label: `Pensum ab ${f.workloadMin ?? 10}%`, patch: { workloadMin: undefined, workloadMax: undefined } });
  f.fields.forEach((id) => chips.push({ key: `f-${id}`, label: FIELD_LABELS[id] ?? id, patch: { fields: f.fields.filter((v) => v !== id) } }));
  if (f.startYear) chips.push({ key: "y", label: `Start ${f.startYear}`, patch: { startYear: undefined } });
  f.education.forEach((id) => chips.push({ key: `e-${id}`, label: EDUCATION_LABELS[id], patch: { education: f.education.filter((v) => v !== id) } }));
  f.languages.forEach((id) => chips.push({ key: `lg-${id}`, label: LANGUAGE_LABELS[id] ?? id, patch: { languages: f.languages.filter((v) => v !== id) } }));
  f.companies.forEach((c) => chips.push({ key: `co-${c}`, label: c, patch: { companies: f.companies.filter((v) => v !== c) } }));
  f.sources.forEach((s) => chips.push({ key: `s-${s}`, label: s, patch: { sources: f.sources.filter((v) => v !== s) } }));
  if (f.postedWithin) chips.push({ key: "p", label: f.postedWithin === 1 ? "Heute" : `Letzte ${f.postedWithin} Tage`, patch: { postedWithin: undefined } });
  if (f.remote) chips.push({ key: "rm", label: REMOTE_LABELS[f.remote], patch: { remote: undefined } });
  if (f.salaryMin) chips.push({ key: "sal", label: `ab CHF ${f.salaryMin.toLocaleString("de-CH")}`, patch: { salaryMin: undefined } });
  if (f.hideSaved) chips.push({ key: "hs", label: "Gemerkte ausgeblendet", patch: { hideSaved: undefined } });
  return chips;
}

export function FilterChips({ filters, onChange, onClear }: { filters: JobFilters; onChange: (patch: Partial<JobFilters>) => void; onClear: () => void }) {
  const chips = filterChips(filters);
  if (!chips.length) return null;
  return (
    <ul aria-label="Aktive Filter" className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button type="button" onClick={() => onChange(chip.patch)} aria-label={`Filter entfernen: ${chip.label}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border-[length:var(--border-w)] border-[var(--outline-fill)] bg-[var(--sun)] px-3 text-[13px] font-semibold text-[var(--on-sun)] transition-transform duration-150 hover:-translate-y-px active:translate-y-px pointer-coarse:min-h-11">
            {chip.label}<X size={13} aria-hidden />
          </button>
        </li>
      ))}
      <li><button type="button" onClick={onClear} className="min-h-9 px-2 text-[13px] font-semibold text-muted underline decoration-[var(--line)] decoration-2 underline-offset-4 hover:text-[var(--ink)] hover:decoration-[var(--ink)] pointer-coarse:min-h-11">Alle löschen</button></li>
    </ul>
  );
}
