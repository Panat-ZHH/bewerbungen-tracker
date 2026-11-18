"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight, Gift } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { formatDateCh } from "@/lib/family-core";
import { ABO_PATH, accessBanner, daysLeftText } from "@/lib/access/gate";
import type { AccessInfo } from "@/lib/access/types";

/** Where the trial banner shows in full (schueler-05): the home pages. Elsewhere a one-line chip, except in the last 2 days. */
const FULL_BANNER_PATHS = ["/dashboard", "/familie"];
const FULL_BANNER_DAYS = 2;

export function showsFullTrialBanner(pathname: string | null | undefined, daysLeft: number): boolean {
  return daysLeft <= FULL_BANNER_DAYS || FULL_BANNER_PATHS.includes(pathname ?? "");
}

type TrialProps = { daysLeft: number; endsAt: string | null; parent?: boolean; schoolStudent?: boolean; familyChild?: boolean; compact?: boolean; hideAction?: boolean };

/** "Gratis-Testwoche: noch X Tage" + what happens afterwards + one action. `compact`: a single line linking to the same place. */
export function TrialBanner({ daysLeft, endsAt, parent = false, schoolStudent = false, familyChild = false, compact = false, hideAction = false }: TrialProps) {
  const end = endsAt ? formatDateCh(endsAt) : "";
  // A child in a family waits for the parents' Familienpaket (schueler-12): no "Abo wählen" for them.
  const href = parent ? "/familie#abo" : familyChild ? "/familie" : ABO_PATH;
  if (compact) {
    return (
      <Link href={href} role="status" data-testid="trial-banner" data-variant="compact" className="mb-4 flex w-fit max-w-full min-h-11 items-center gap-2 rounded-full bg-[var(--info-bg)] px-3.5 text-small font-semibold text-[var(--info-fg)] hover:underline">
        <Gift size={16} aria-hidden className="shrink-0" />
        Testwoche: {daysLeftText(daysLeft)}
        <ChevronRight size={16} aria-hidden className="shrink-0 text-[var(--muted)]" />
      </Link>
    );
  }
  const after = parent
    ? "Danach brauchst du das Familienpaket. Deine Daten bleiben gespeichert."
    : familyChild
      ? "Danach läuft WendApply über das Familienpaket deiner Eltern."
      : "Danach brauchst du ein Abo. Deine Daten bleiben gespeichert.";
  return (
    <div role="status" data-testid="trial-banner" className="status status-info mb-5 flex-col gap-3 sm:flex-row sm:items-center">
      <span className="mt-0.5 shrink-0 [&>svg]:h-[17px] [&>svg]:w-[17px]"><Gift aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <strong className="block">Gratis-Testwoche: {daysLeftText(daysLeft)}</strong>
        {end ? `Bis am ${end} ist alles gratis. ` : "Im Moment ist alles gratis. "}
        {after}
        {schoolStudent && !familyChild && <> Hast du einen Klassencode? <Link href="/classes" className="font-semibold underline underline-offset-4">Dann zahlt deine Schule.</Link></>}
      </div>
      {!hideAction && <ButtonLink href={href} size="sm" variant="secondary" className="min-h-11 shrink-0">{familyChild ? "Zur Familie" : parent ? "Familienpaket wählen" : "Abo wählen"}</ButtonLink>}
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
        Die letzte Zahlung hat nicht geklappt. {until ? `Bis am ${formatDateCh(until)} kannst du WendApply weiter nutzen.` : "Du kannst WendApply noch kurz weiter nutzen."} Aktualisiere deine Zahlungsart.
      </div>
      <ButtonLink href={parent ? "/familie#abo" : ABO_PATH} size="sm" variant="secondary" className="min-h-11 shrink-0">Zahlung aktualisieren</ButtonLink>
    </div>
  );
}

/** Picks the banner for the current access state (nothing when not enforced, school-licensed, staff or paid). */
export function AccessBanner({ access, parent = false, pathname }: { access: AccessInfo | null; parent?: boolean; pathname?: string | null }) {
  const banner = accessBanner(access);
  if (!banner) return null;
  const isParent = parent || access?.account_type === "parent";
  if (banner.kind === "trial") {
    return (
      <TrialBanner
        daysLeft={banner.daysLeft}
        endsAt={banner.endsAt}
        parent={isParent}
        familyChild={!isParent && Boolean(access?.family_pending)}
        schoolStudent={!isParent && access?.account_type !== "independent_student"}
        compact={pathname !== undefined && !showsFullTrialBanner(pathname, banner.daysLeft)}
        // On /familie the page itself leads to the Familienpaket (step card / plan card): no 2nd CTA above step 1 (eltern-02).
        hideAction={isParent && pathname === "/familie"}
      />
    );
  }
  return <GraceBanner until={banner.until} parent={isParent} />;
}
