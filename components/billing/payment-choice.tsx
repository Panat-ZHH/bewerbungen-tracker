"use client";

import { CreditCard, FileText } from "lucide-react";
import { PAYMENT_LABEL, type PaymentMethod } from "./logic";

/** Card or invoice (schools). With a single option (families: card only) it renders a short note instead of a choice. */
export function PaymentChoice({ options, value, onChange, name = "payment" }: { options: PaymentMethod[]; value: PaymentMethod; onChange: (v: PaymentMethod) => void; name?: string }) {
  if (options.length <= 1) {
    const only = options[0] ?? "card";
    return <p className="flex items-center gap-2 text-sm text-muted" data-payment-only={only}><CreditCard size={16} aria-hidden className="shrink-0" />Bezahlung mit {PAYMENT_LABEL[only].title}.</p>;
  }
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-bold">Zahlungsart</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const Icon = o === "card" ? CreditCard : FileText;
          const checked = value === o;
          return (
            <label key={o} className={`flex cursor-pointer gap-3 rounded-[var(--radius-lg)] border-2 p-3 transition-colors ${checked ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--line)] hover:border-[var(--outline)]"}`}>
              <input type="radio" name={name} value={o} checked={checked} onChange={() => onChange(o)} className="mt-1 size-4 shrink-0 accent-[var(--brand)]" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-bold"><Icon size={16} aria-hidden />{PAYMENT_LABEL[o].title}</span>
                <span className="text-small mt-0.5 block text-muted">{PAYMENT_LABEL[o].text}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
