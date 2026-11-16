"use client";

import { AlertTriangle, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FAMILY_COPY } from "@/lib/family-copy";
import { ATTENTION_PHASES, type BillingPhase } from "./logic";

/**
 * Top-of-page banner for the parent when a payment failed (§3.5): past_due = warning, unpaid = danger.
 * Renders nothing for every other phase. The children never see it (they have no billing status).
 * The button is secondary by default: the plan card carries the page's single primary "Karte aktualisieren" (S4).
 */
export function BillingBanner({ phase, onFix, busy = false, primary = false }: { phase: BillingPhase; onFix: () => void; busy?: boolean; primary?: boolean }) {
  if (!ATTENTION_PHASES.includes(phase)) return null;
  const unpaid = phase === "unpaid";
  return (
    <div role="alert" data-billing-banner={phase} className={`status ${unpaid ? "status-danger" : "status-warning"} flex-col gap-3 sm:flex-row sm:items-center`}>
      <span className="mt-0.5 shrink-0 [&>svg]:h-[17px] [&>svg]:w-[17px]"><AlertTriangle aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <strong className="block">{unpaid ? FAMILY_COPY.banner.unpaidTitle : FAMILY_COPY.banner.pastDueTitle}</strong>
        {unpaid ? FAMILY_COPY.phase.unpaid : FAMILY_COPY.phase.pastDue}
      </div>
      <Button size="sm" variant={primary ? "primary" : "secondary"} className="min-h-11 shrink-0 sm:min-h-11" loading={busy} onClick={onFix} icon={<CreditCard size={14} aria-hidden />}
        {...(primary ? { "data-primary-action": "" } : {})}>
        {FAMILY_COPY.cta.updateCard}
      </Button>
    </div>
  );
}
