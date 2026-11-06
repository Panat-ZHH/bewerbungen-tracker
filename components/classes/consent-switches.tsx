"use client";

import { CONSENT_LABELS, type ConsentChoice } from "@/lib/consent";

function ConsentSwitch({ label, description, checked, disabled, onChange }: { label: string; description: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className={`flex min-h-11 items-center justify-between gap-3 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <span className="min-w-0"><span className="block text-sm font-medium">{label}</span><span className="text-small block text-muted">{description}</span></span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className={`relative h-7 w-12 shrink-0 rounded-full border transition peer-focus-visible:ring-4 peer-focus-visible:ring-[var(--brand)]/30 ${checked ? "border-[var(--brand)] bg-[var(--brand)]" : "border-[var(--neutral-line)] bg-[var(--neutral-bg)]"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[26px]" : "left-0.5 bg-[var(--neutral-fg)]"}`} />
      </span>
    </label>
  );
}

/** The three real consent switches. Status and company names only count while "Fortschritt teilen" is on. */
export function ConsentSwitches({ value, disabled, onChange }: { value: ConsentChoice; disabled?: boolean; onChange: (next: Partial<ConsentChoice>) => void }) {
  return (
    <>
      <ConsentSwitch label={CONSENT_LABELS.share} description={value.share ? "Deine Lehrperson sieht, wie viele Bewerbungen du hast, wann du zuletzt aktiv warst sowie Bewerbungsdatum und Frist." : "Deine Lehrperson sieht nur deinen Namen."} checked={value.share} disabled={disabled} onChange={(v) => onChange({ share: v })} />
      <ConsentSwitch label={CONSENT_LABELS.status} description={value.share && value.status ? "Der Stand jeder Bewerbung ist sichtbar (z. B. beworben, Gespräch, Zusage)." : "Der Stand deiner Bewerbungen bleibt verborgen."} checked={value.share && value.status} disabled={disabled || !value.share} onChange={(v) => onChange({ status: v })} />
      <ConsentSwitch label={CONSENT_LABELS.companies} description={value.share && value.companies ? "Firma, Stelle und Ort jeder Bewerbung sind sichtbar." : "Firma, Stelle und Ort bleiben verborgen."} checked={value.share && value.companies} disabled={disabled || !value.share} onChange={(v) => onChange({ companies: v })} />
    </>
  );
}

