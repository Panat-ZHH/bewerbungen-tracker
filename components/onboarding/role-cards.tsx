"use client";

import { Check, GraduationCap, Heart, School, UserRound } from "lucide-react";
import { Field, Select } from "@/components/ui/input";
import { birthYearOptions, mayNeedParentalConsent, type SignupChoice } from "@/lib/family-core";

/** The four ways to use WendApply. "school" is today's student flow (unchanged); "independent" and "parent" are private customers. */
export const SIGNUP_OPTIONS: { value: SignupChoice; label: string; short: string; hint: string; icon: typeof UserRound }[] = [
  { value: "school", label: "Schule", short: "Mit meiner Klasse", hint: "Ich bin Schüler:in und nutze WendApply mit meiner Schule oder Klasse.", icon: School },
  { value: "independent", label: "Schüler:in privat", short: "Ohne Schule", hint: "Ich suche eine Lehrstelle auf eigene Faust, auf Wunsch mit meinen Eltern.", icon: UserRound },
  { value: "parent", label: "Elternteil", short: "Ich begleite mein Kind", hint: "Ich begleite mein Kind und sehe, was es mit mir teilt.", icon: Heart },
  { value: "teacher", label: "Lehrperson", short: "Ich begleite Klassen", hint: "Ich begleite Klassen und sehe, wo meine Schülerinnen und Schüler stehen.", icon: GraduationCap },
];

/** Four big radio cards for choosing how the account is used (role picker after the first Google login). */
export function RoleCards({ value, onChange, disabled }: { value: SignupChoice | null; onChange: (choice: SignupChoice) => void; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled}>
      <legend className="sr-only">Ich bin</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {SIGNUP_OPTIONS.map(({ value: v, label, hint, icon: Icon }) => {
          const selected = value === v;
          return (
            <label key={v} className={`pressable relative flex min-h-[120px] cursor-pointer flex-col items-start gap-2 rounded-xl border-[length:var(--border-w)] p-4 text-left shadow-[var(--shadow-md)] focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)] sm:p-5 ${selected ? "border-[var(--outline-fill)] bg-[var(--sun)] text-[var(--on-sun)]" : "border-[var(--outline)] bg-[var(--surface)]"}`}>
              <input type="radio" name="role" value={v} checked={selected} onChange={() => onChange(v)} className="sr-only" />
              <Icon size={28} strokeWidth={2} aria-hidden className={selected ? "" : "text-[var(--brand)]"} />
              <span className="font-display text-xl font-extrabold tracking-[-.02em]">{label}</span>
              <span className={`text-small ${selected ? "" : "text-muted"}`}>{hint}</span>
              {selected && <Check size={18} strokeWidth={3} aria-hidden className="absolute right-4 top-4" />}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Jahrgang (birth year only, data minimisation) for private students + the plain-language consent hint for under 16. */
export function BirthYearField({ value, onChange, id = "birth-year" }: { value: number | null; onChange: (year: number | null) => void; id?: string }) {
  const under16 = mayNeedParentalConsent(value);
  return (
    <div className="space-y-2">
      <Field label="Jahrgang" htmlFor={id} hint="Nur das Jahr. Wir brauchen es, um zu wissen, ob deine Eltern zustimmen müssen.">
        <Select id={id} aria-required="true" value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Bitte wählen</option>
          {birthYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>
      </Field>
      {under16 && <p role="note" className="rounded-[var(--radius-md)] bg-[var(--info-bg)] px-3 py-2 text-small text-[var(--info-fg)]">Bist du unter 16? Dann kannst du WendApply sofort nutzen. Wenn du später deine Eltern einlädst, muss ein Elternteil zuerst zustimmen, bevor sie etwas sehen.</p>}
    </div>
  );
}
