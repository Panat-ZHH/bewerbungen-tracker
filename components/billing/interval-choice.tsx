"use client";

import { INTERVAL_LABEL, intervalPriceText, savingText, type BillingInterval } from "./logic";
import type { Plan } from "@/lib/billing/plans";

/** Monthly / yearly toggle (family package). With a single interval it renders nothing. */
export function IntervalChoice({ plan, options, value, onChange, name = "interval" }: { plan: Plan; options: BillingInterval[]; value: BillingInterval; onChange: (v: BillingInterval) => void; name?: string }) {
  if (options.length <= 1) return null;
  const saving = savingText(plan);
  return (
    <fieldset className="space-y-2" data-interval-choice>
      <legend className="mb-2 text-sm font-bold">Abrechnung</legend>
      <div className="grid gap-2">
        {options.map((o) => {
          const checked = value === o;
          return (
            <label key={o} className={`flex cursor-pointer gap-3 rounded-[var(--radius-lg)] border-2 p-3 transition-colors ${checked ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--line)] hover:border-[var(--outline)]"}`}>
              <input type="radio" name={name} value={o} checked={checked} onChange={() => onChange(o)} className="mt-1 size-4 shrink-0 accent-[var(--brand)]" />
              <span className="min-w-0">
                <span className="block text-sm"><span className="font-bold">{INTERVAL_LABEL[o]}</span> · <span className="tabular">{intervalPriceText(plan, o)}</span></span>
                {o === "year" && saving && <span className="text-small mt-0.5 block text-muted">{saving}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
