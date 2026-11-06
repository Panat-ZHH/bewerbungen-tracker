"use client";

import { GraduationCap, UserRound } from "lucide-react";
import type { UserRole } from "@/types";

const options: { value: UserRole; label: string; hint: string; icon: typeof UserRound }[] = [
  { value: "student", label: "Schüler:in", hint: "Ich suche eine Lehrstelle und verfolge meine Bewerbungen.", icon: UserRound },
  { value: "teacher", label: "Lehrperson", hint: "Ich begleite Klassen und sehe, wo meine Schüler:innen stehen.", icon: GraduationCap },
];

/** Two big radio cards for choosing the role. */
export function RoleCards({ value, onChange, disabled }: { value: UserRole | null; onChange: (role: UserRole) => void; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled}>
      <legend className="sr-only">Ich bin</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map(({ value: v, label, hint, icon: Icon }) => {
          const selected = value === v;
          return (
            <label key={v} className={`relative flex min-h-[112px] cursor-pointer flex-col items-start gap-1.5 rounded-2xl border p-4 text-left transition duration-200 focus-within:ring-4 focus-within:ring-[var(--brand)]/25 active:scale-[.98] ${selected ? "border-[var(--brand)] bg-[var(--brand-soft)] shadow-[var(--shadow-sm)]" : "border-[var(--field-border)] bg-[var(--raised)] hover:border-[var(--brand)]/50"}`}>
              <input type="radio" name="role" value={v} checked={selected} onChange={() => onChange(v)} className="sr-only" />
              <span className={`flex items-center gap-2 text-[15px] font-semibold ${selected ? "text-[var(--brand-strong)]" : ""}`}><Icon size={18} />{label}</span>
              <span className="text-small text-muted">{hint}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
