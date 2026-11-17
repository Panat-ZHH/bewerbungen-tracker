"use client";

import Link from "next/link";
import { AlertTriangle, Gift } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { formatDateCh } from "@/lib/family-core";
import { ABO_PATH, accessBanner, daysLeftText } from "@/lib/access/gate";
import type { AccessInfo } from "@/lib/access/types";

/** "Gratis-Testwoche: noch X Tage" + what happens afterwards + "Abo wählen". */
export function TrialBanner({ daysLeft, endsAt, parent = false, schoolStudent = false }: { daysLeft: number; endsAt: string | null; parent?: boolean; schoolStudent?: boolean }) {
  const end = endsAt ? formatDateCh(endsAt) : "";
  return (
    <div role="status" data-testid="trial-banner" className="status status-info mb-5 flex-col gap-3 sm:flex-row sm:items-center">
      <span className="mt-0.5 shrink-0 [&>svg]:h-[17px] [&>svg]:w-[17px]"><Gift aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <strong className="block">Gratis-Testwoche: {daysLeftText(daysLeft)}</strong>
        {end ? `Bis am ${end} kannst du alles gratis nutzen. ` : "Du kannst alles gratis nutzen. "}
        Danach brauchst du {parent ? "das Familienpaket" : "ein Abo"}, um weiterzumachen. Deine Daten bleiben gespeichert.
        {schoolStudent && <> Hast du einen Klassencode? <Link href="/classes" className="font-semibold underline underline-offset-4">Damit zahlt deine Schule.</Link></>}
      </div>
      <ButtonLink href={parent ? "/familie#abo" : ABO_PATH} size="sm" variant="secondary" className="min-h-11 shrink-0">Abo wählen</ButtonLink>
    </div>
  );
}

/** Payment failed (past_due): access continues until `until`, then the paywall. */
export function GraceBanner({ until, parent = false }: { until: string | null; parent?: boolean }) {
  return (
    <div role="alert" data-testid="grace-banner" className="status status-warning mb-5 flex-col gap-3 sm:flex-row sm:items-center">
      <span className="mt-0.5 shrink-0 [&>svg]:h-[17px] [&>svg]:w-[17px]"><AlertTriangle aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <strong className="block">Zahlung fehlgeschlagen</strong>
        Wir konnten dein Abo nicht abbuchen. {until ? `Bis am ${formatDateCh(until)} kannst du WendApply weiter nutzen.` : "Du kannst WendApply noch kurz weiter nutzen."} Bitte aktualisiere deine Zahlungsart.
      </div>
      <ButtonLink href={parent ? "/familie#abo" : ABO_PATH} size="sm" variant="secondary" className="min-h-11 shrink-0">Zahlung aktualisieren</ButtonLink>
    </div>
  );
}

/** Picks the banner for the current access state (nothing when not enforced, school-licensed, staff or paid). */
export function AccessBanner({ access, parent = false }: { access: AccessInfo | null; parent?: boolean }) {
  const banner = accessBanner(access);
  if (!banner) return null;
  if (banner.kind === "trial") return <TrialBanner daysLeft={banner.daysLeft} endsAt={banner.endsAt} parent={parent || access?.account_type === "parent"} schoolStudent={!parent && access?.account_type !== "parent" && access?.account_type !== "independent_student"} />;
  return <GraceBanner until={banner.until} parent={parent || access?.account_type === "parent"} />;
}
