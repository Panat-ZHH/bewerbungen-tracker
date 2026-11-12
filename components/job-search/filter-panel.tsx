"use client";

import type { ReactNode } from "react";
import { Input, Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { CANTONS, EDUCATION_LABELS, FIELD_LABELS, JOB_TYPE_LABELS, LANGUAGE_LABELS, POSTED_OPTIONS, RADIUS_OPTIONS, REMOTE_LABELS, SOURCE_NAMES, type Facets, type JobFilters, type JobType } from "./engine";

export function ToggleChip({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: ReactNode; count?: number }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-full border-[length:var(--border-w)] px-3 text-[13px] font-semibold transition-[background-color,transform] duration-150 active:translate-y-px pointer-coarse:min-h-11", active ? "border-[var(--outline-fill)] bg-[var(--sun)] text-[var(--on-sun)]" : "border-[var(--outline)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-2)]")}>
      {children}{count !== undefined && <span className="tabular text-xs font-medium opacity-70">{count}</span>}
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className="m-0 min-w-0 space-y-2 border-0 border-b-[length:var(--border-w)] border-dashed border-[var(--line)] px-0 pb-5 pt-0"><legend className="mb-2 p-0 font-display text-[15px] font-bold tracking-[-.01em]">{title}</legend>{children}</fieldset>;
}

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

export function FilterPanel({ filters, onChange, facets, companies, idPrefix = "fp" }: { filters: JobFilters; onChange: (patch: Partial<JobFilters>) => void; facets: Facets; companies: string[]; idPrefix?: string }) {
  const workload = filters.workloadMin ?? 10;
  const years = [new Date().getFullYear(), new Date().getFullYear() + 1, new Date().getFullYear() + 2];
  const fieldIds = Object.keys(FIELD_LABELS);
  return (
    <div className="space-y-5">
      <Group title="Ort">
        <Input id={`${idPrefix}-loc`} aria-label="Ort" maxLength={80} value={filters.location} onChange={(e) => onChange({ location: e.target.value })} placeholder="Ort oder PLZ" />
        <label className="block pt-1 text-small font-semibold text-muted" htmlFor={`${idPrefix}-radius`}>Umkreis</label>
        <Select id={`${idPrefix}-radius`} value={filters.radiusKm ?? ""} onChange={(e) => onChange({ radiusKm: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">Ganze Schweiz / kein Umkreis</option>
          {RADIUS_OPTIONS.map((km) => <option key={km} value={km}>{km} km</option>)}
        </Select>
      </Group>
      <Group title="Kantone">
        <div className="flex flex-wrap gap-1.5">{CANTONS.map((c) => <ToggleChip key={c} active={filters.cantons.includes(c)} count={facets.cantons[c]} onClick={() => onChange({ cantons: toggle(filters.cantons, c) })}>{c}</ToggleChip>)}</div>
      </Group>
      <Group title="Art der Stelle">
        <div className="flex flex-wrap gap-1.5">{(Object.keys(JOB_TYPE_LABELS) as JobType[]).map((t) => <ToggleChip key={t} active={filters.jobTypes.includes(t)} count={facets.jobTypes[t]} onClick={() => onChange({ jobTypes: toggle(filters.jobTypes, t) })}>{JOB_TYPE_LABELS[t]}</ToggleChip>)}</div>
      </Group>
      <Group title={`Pensum${filters.workloadMin !== undefined ? ` · ab ${workload}%` : ""}`}>
        <input type="range" aria-label="Pensum ab (Prozent)" min={10} max={100} step={10} value={workload} onChange={(e) => { const v = Number(e.target.value); onChange({ workloadMin: v <= 10 ? undefined : v }); }} className="h-11 w-full accent-[var(--brand)]" />
        <div className="tabular flex justify-between text-xs font-medium text-muted"><span>10%</span><span>100%</span></div>
      </Group>
      <Group title="Berufsfeld">
        <div className="flex flex-wrap gap-1.5">{fieldIds.map((id) => <ToggleChip key={id} active={filters.fields.includes(id)} count={facets.fields[id]} onClick={() => onChange({ fields: toggle(filters.fields, id) })}>{FIELD_LABELS[id]}</ToggleChip>)}</div>
      </Group>
      <Group title="Start / Lehrbeginn">
        <div className="flex flex-wrap gap-1.5">{years.map((y) => <ToggleChip key={y} active={filters.startYear === y} onClick={() => onChange({ startYear: filters.startYear === y ? undefined : y })}>{y}</ToggleChip>)}</div>
      </Group>
      <Group title="Ausbildung">
        <div className="flex flex-wrap gap-1.5">{Object.entries(EDUCATION_LABELS).map(([id, label]) => <ToggleChip key={id} active={filters.education.includes(id as never)} count={facets.education[id as keyof typeof facets.education]} onClick={() => onChange({ education: toggle(filters.education, id as never) })}>{label}</ToggleChip>)}</div>
      </Group>
      <Group title="Sprache">
        <div className="flex flex-wrap gap-1.5">{Object.entries(LANGUAGE_LABELS).map(([id, label]) => <ToggleChip key={id} active={filters.languages.includes(id)} onClick={() => onChange({ languages: toggle(filters.languages, id) })}>{label}</ToggleChip>)}</div>
      </Group>
      <Group title="Arbeitsort">
        <Segmented<"any" | "remote" | "hybrid" | "onsite"> label="Arbeitsort" value={filters.remote ?? "any"} onChange={(v) => onChange({ remote: v === "any" ? undefined : v })} options={[{ value: "any", label: "Egal" }, ...Object.entries(REMOTE_LABELS).map(([value, label]) => ({ value: value as "remote", label }))]} />
      </Group>
      <Group title="Veröffentlicht">
        <div className="flex flex-wrap gap-1.5">{POSTED_OPTIONS.map((o) => <ToggleChip key={o.value} active={filters.postedWithin === o.value} onClick={() => onChange({ postedWithin: filters.postedWithin === o.value ? undefined : o.value })}>{o.label}</ToggleChip>)}</div>
      </Group>
      <Group title="Quelle">
        <div className="flex flex-wrap gap-1.5">{SOURCE_NAMES.map((s) => <ToggleChip key={s} active={filters.sources.includes(s)} count={facets.sources[s]} onClick={() => onChange({ sources: toggle(filters.sources, s) })}>{s}</ToggleChip>)}</div>
      </Group>
      {companies.length > 0 && <Group title="Firma">
        <Select aria-label="Firma hinzufügen" value="" onChange={(e) => e.target.value && onChange({ companies: toggle(filters.companies, e.target.value) })}>
          <option value="">Firma wählen …</option>
          {companies.filter((c) => !filters.companies.includes(c)).map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        {filters.companies.length > 0 && <div className="flex flex-wrap gap-1.5">{filters.companies.map((c) => <ToggleChip key={c} active onClick={() => onChange({ companies: toggle(filters.companies, c) })}>{c} ✕</ToggleChip>)}</div>}
      </Group>}
      <Group title="Lohn (CHF pro Jahr, min.)">
        <Input type="number" inputMode="numeric" aria-label="Mindestlohn pro Jahr" min={0} max={1000000} step={5000} value={filters.salaryMin ?? ""} onChange={(e) => onChange({ salaryMin: e.target.value ? Math.max(0, Number(e.target.value)) : undefined })} placeholder="z. B. 70000" />
        <p className="text-small text-muted">Nur Anzeigen mit Lohnangabe werden aussortiert.</p>
      </Group>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
        <input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={Boolean(filters.hideSaved)} onChange={(e) => onChange({ hideSaved: e.target.checked || undefined })} />
        Schon gemerkte Stellen ausblenden
      </label>
    </div>
  );
}
