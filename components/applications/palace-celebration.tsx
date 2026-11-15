"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Crown, X } from "lucide-react";
import { markPalaceSeen, unseenPalaces } from "@/lib/map-palace";
import type { Application } from "@/types";
import styles from "@/app/map/map.module.css";

/**
 * First accepted application whose palace celebration was not acknowledged yet (oldest first).
 * It counts as seen once dismissed, so a celebration that was never closed shows again on the next visit.
 * Purely derived: switching the status back removes the palace and its message at once.
 */
export function usePalaceCelebration(applications: Application[]) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  // localStorage is read on the client only; applications are [] during SSR and the first render.
  const application = useMemo(() => unseenPalaces(applications).find(({ id }) => !dismissed.includes(id)) ?? null, [applications, dismissed]);
  const dismiss = useCallback(() => {
    if (!application) return;
    markPalaceSeen(application.id);
    setDismissed((ids) => [...ids, application.id]);
  }, [application]);
  return { application, dismiss };
}

/**
 * `paused`: another panel (shop, application sheet, placement) is open. The card is not a modal, so it steps aside
 * instead of covering that panel; it is NOT marked as seen and comes back once the panel closes.
 * Top-bar chip panels are handled in CSS (`.palaceLive` is hidden while the stage contains `[data-map-panel]`).
 */
export function PalaceCelebration({ application, onDismiss, paused = false }: { application: Application | null; onDismiss: () => void; paused?: boolean }) {
  const card = paused ? null : application;
  useEffect(() => {
    if (!card) return;
    // Esc that already closed a chip panel (preventDefault on document, before window) must not also dismiss the card.
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector("[data-map-panel]")) onDismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, onDismiss]);
  return (
    <div className={styles.palaceLive} aria-live="polite" role="status">
      {card && (
        <div className={styles.palaceCelebrate} data-testid="palace-celebration">
          <div className={styles.palaceConfetti} aria-hidden="true">{Array.from({ length: 22 }, (_, index) => <i key={index} style={{ ["--i" as string]: index }} />)}</div>
          <span className={styles.palaceIcon} aria-hidden="true"><Crown size={26} /></span>
          <strong>Zusage! Dein Haus ist jetzt ein Palast.</strong>
          <span className={styles.palaceCompany}>{card.company}{card.position ? ` · ${card.position}` : ""}</span>
          <button type="button" className={styles.palaceDismiss} onClick={onDismiss}><X size={16} aria-hidden />Super, weiter</button>
        </div>
      )}
    </div>
  );
}
