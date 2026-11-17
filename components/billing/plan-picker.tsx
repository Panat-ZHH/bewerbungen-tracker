"use client";

import { Check } from "lucide-react";
import type { Plan, PlanId } from "@/lib/billing/plans";
import { priceText, seatsText } from "./logic";

/** Radio cards for the school plans. Prices always from lib/billing/plans.ts, final prices (no VAT). */
export function PlanPicker({ plans, value, onChange, recommended = "professional", name = "plan", current = null }: { plans: Plan[]; value: PlanId; onChange: (id: PlanId) => void; recommended?: PlanId; name?: string; current?: PlanId | null }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold">Paket</legend>
      <div className="grid gap-2 md:grid-cols-3">
        {plans.map((p) => {
          const checked = value === p.id;
          return (
            <label key={p.id} className={`relative flex cursor-pointer flex-col gap-1 rounded-[var(--radius-lg)] border-2 p-3 transition-colors ${checked ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--line)] hover:border-[var(--outline)]"}`}>
              <span className="flex items-center gap-2">
                <input type="radio" name={name} value={p.id} checked={checked} onChange={() => onChange(p.id)} className="size-4 shrink-0 accent-[var(--brand)]" />
                <span className="font-bold">{p.name}</span>
                {p.id === current ? <span className="ml-auto rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs font-bold">aktuell</span> : !current && p.id === recommended && <span className="ml-auto rounded-full bg-[var(--sun)] px-2 py-0.5 text-xs font-bold text-[var(--on-sun)]">Empfohlen</span>}
              </span>
              <span className="tabular text-sm font-semibold">{priceText(p)}</span>
              <span className="text-small text-muted">{seatsText(p)}</span>
              {checked && <Check size={16} strokeWidth={3} aria-hidden className="absolute bottom-3 right-3 text-[var(--brand)]" />}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
