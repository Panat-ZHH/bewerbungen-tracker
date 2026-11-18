"use client";

import { INTERVAL_LABEL, intervalPriceText, savingText, type BillingInterval } from "./logic";
import type { Plan } from "@/lib/billing/plans";

/** Monthly / yearly toggle (family package). With a single interval it renders nothing. */
export function IntervalChoice({ plan, options, value, onChange, name = "interval", legend = "Abrechnung", yearBadge }: { plan: Plan; options: BillingInterval[]; value: BillingInterval; onChange: (v: BillingInterval) => void; name?: string; legend?: string; /** e.g. "Spare <saving>" next to the yearly option */ yearBadge?: string }) {
  if (options.length <= 1) return null;
  const saving = savingText(plan);
  return (
    <fieldset className="space-y-2" data-interval-choice>
      <legend className="mb-2 text-sm font-bold">{legend}</legend>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {options.map((o) => {
          const checked = value === o;
          return (
            <label key={o} className={`flex cursor-pointer gap-3 rounded-[var(--radius-lg)] border-2 p-3 transition-colors ${checked ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--line)] hover:border-[var(--outline)]"}`}>
              <input type="radio" name={name} value={o} checked={checked} onChange={() => onChange(o)} className="mt-1 size-4 shrink-0 accent-[var(--brand)]" />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm [overflow-wrap:anywhere]"><span className="min-w-0"><span className="font-bold">{INTERVAL_LABEL[o]}</span> · <span className="tabular">{intervalPriceText(plan, o)}</span></span>{o === "year" && yearBadge && <span className="max-w-full rounded-full bg-[var(--sun)] px-2 py-0.5 text-xs font-bold text-[var(--on-sun)]" data-year-badge>{yearBadge}</span>}</span>
                {o === "year" && saving && !yearBadge && <span className="text-small mt-0.5 block text-muted">{saving}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
