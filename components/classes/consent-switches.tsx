"use client";

import { Check } from "lucide-react";
import { CONSENT_LABELS, type ConsentChoice } from "@/lib/consent";

// Switch with ink contour: on = green fill with a check in the knob (not colour alone), off = quiet track.
// Disabled dims only the track: the explanation text stays readable (WCAG AA).
function ConsentSwitch({ label, description, checked, disabled, onChange }: { label: string; description: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className={`flex min-h-11 items-center justify-between gap-4 py-3 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
      <span className="min-w-0"><span className="block text-sm font-bold">{label}</span><span className="text-small mt-0.5 block text-muted">{description}</span></span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className={`relative h-7 w-12 shrink-0 rounded-full border-[length:var(--border-w)] transition-colors duration-150 peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)] ${disabled ? "opacity-50" : ""} ${checked ? "border-[var(--outline-fill)] bg-[var(--mint)]" : "border-[var(--outline)] bg-[var(--surface-2)]"}`}>
        <span className={`absolute top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border-[length:var(--border-w)] bg-[var(--surface)] text-[var(--ink)] transition-[left] duration-150 ${checked ? "left-[22px] border-[var(--outline-fill)]" : "left-0.5 border-[var(--outline)]"}`}>{checked && <Check size={11} strokeWidth={3.2} />}</span>
      </span>
    </label>
  );
}

/** The three real consent switches (wrap them in a `.rows` container). Status and company names only count while "Fortschritt teilen" is on. */
export function ConsentSwitches({ value, disabled, onChange }: { value: ConsentChoice; disabled?: boolean; onChange: (next: Partial<ConsentChoice>) => void }) {
  return (
    <>
      <ConsentSwitch label={CONSENT_LABELS.share} description={value.share ? "Deine Lehrperson sieht, wie viele Bewerbungen du hast, wann du zuletzt aktiv warst sowie Bewerbungsdatum und Frist." : "Deine Lehrperson sieht nur deinen Namen."} checked={value.share} disabled={disabled} onChange={(v) => onChange({ share: v })} />
      <ConsentSwitch label={CONSENT_LABELS.status} description={value.share && value.status ? "Der Stand jeder Bewerbung ist sichtbar (z. B. beworben, Gespräch, Zusage)." : "Der Stand deiner Bewerbungen bleibt verborgen."} checked={value.share && value.status} disabled={disabled || !value.share} onChange={(v) => onChange({ status: v })} />
      <ConsentSwitch label={CONSENT_LABELS.companies} description={value.share && value.companies ? "Firma, Stelle und Ort jeder Bewerbung sind sichtbar." : "Firma, Stelle und Ort bleiben verborgen."} checked={value.share && value.companies} disabled={disabled || !value.share} onChange={(v) => onChange({ companies: v })} />
    </>
  );
}

