"use client";

import { CreditCard } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { useAccess } from "@/components/access/access-provider";
import { daysLeftText, hidesPrices, isEnforced, isStaff } from "@/lib/access/gate";
import { formatDateCh } from "@/lib/family-core";
import { SettingsSection } from "./section";

/** Short "Abo" line for students / parents (Einzelabo status, trial, family). Hidden for school-licensed users and staff. */
export function AboSection() {
  const { access } = useAccess();
  if (!access || !isEnforced(access) || hidesPrices(access) || isStaff(access)) return null;
  const sub = access.subscription;
  const parent = access.account_type === "parent";
  const text = sub?.plan === "solo"
    ? `Einzelabo ${sub.cancel_at_period_end ? "gekündigt" : "aktiv"}${sub.current_period_end ? `, ${sub.cancel_at_period_end ? "läuft bis" : "verlängert am"} ${formatDateCh(sub.current_period_end)}` : ""}.`
    : access.reason === "family_subscription" ? "Du bist über das Familienpaket abgedeckt."
    : access.state === "trial" ? `Gratis-Testwoche: ${daysLeftText(access.trial_days_left ?? 0)}.`
    : access.reason === "grant" ? `Freigeschaltet${access.grant_until ? ` bis ${formatDateCh(access.grant_until)}` : ""}.`
    : access.has_access ? "Dein Zugang ist aktiv." : "Kein aktives Abo.";
  return (
    <SettingsSection title="Abo" titleTestId="section-abo" description="Dein Zugang zu WendApply.">
      <div className="flex flex-wrap items-center gap-3" data-testid="settings-abo">
        <p className="text-body">{text}</p>
        <ButtonLink href={parent ? "/familie#abo" : "/abo"} variant="secondary" size="sm" className="min-h-11" icon={<CreditCard size={14} aria-hidden />}>{sub ? "Abo verwalten" : "Abo ansehen"}</ButtonLink>
      </div>
    </SettingsSection>
  );
}
