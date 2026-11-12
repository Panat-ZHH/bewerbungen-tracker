"use client";

import { Check, GraduationCap, UserRound } from "lucide-react";
import type { UserRole } from "@/types";

const options: { value: UserRole; label: string; hint: string; icon: typeof UserRound }[] = [
  { value: "student", label: "Schüler:in", hint: "Ich suche eine Lehrstelle und verfolge meine Bewerbungen.", icon: UserRound },
  { value: "teacher", label: "Lehrperson", hint: "Ich begleite Klassen und sehe, wo meine Schülerinnen und Schüler stehen.", icon: GraduationCap },
];

/** Two big radio cards for choosing the role. */
export function RoleCards({ value, onChange, disabled }: { value: UserRole | null; onChange: (role: UserRole) => void; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled}>
      <legend className="sr-only">Ich bin</legend>
      <div className="grid gap-4 sm:grid-cols-2 sm:pb-3">
        {options.map(({ value: v, label, hint, icon: Icon }, i) => {
          const selected = value === v;
          return (
            <label key={v} className={`pressable relative flex min-h-[128px] cursor-pointer flex-col items-start gap-2 rounded-xl border-[length:var(--border-w)] p-4 text-left shadow-[var(--shadow-md)] focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)] sm:p-5 ${selected ? "border-[var(--outline-fill)] bg-[var(--sun)] text-[var(--on-sun)]" : "border-[var(--outline)] bg-[var(--surface)]"} ${i === 1 ? "sm:translate-y-3" : ""}`}>
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
