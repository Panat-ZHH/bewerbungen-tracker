"use client";

import { Anchor, Lock, Sparkles } from "lucide-react";
import { ISLANDS } from "@/lib/islands-config";
import { unlockProgress } from "@/lib/islands";
import { MapChip } from "./map-fullscreen";
import type { IslandsController } from "./use-islands";
import styles from "@/app/map/islands.module.css";

/** Island switcher as a compact top chip ("Dein Dorf · 40/600", the page's visible title) that expands to the full panel. */
export function IslandPanel({ islands, balance }: { islands: IslandsController; balance: number | null }) {
  const progress = unlockProgress(islands.unlocked, balance ?? 0);
  const affordable = islands.affordableWith(balance);
  const current = ISLANDS.find((island) => island.no === islands.current) ?? ISLANDS[0];
  return (
    <>
      <MapChip id="islands" icon={<Anchor size={16} />} label={islands.unlocked > 1 ? `Dein Dorf · ${current.name}` : "Dein Dorf"} meta={progress && islands.available ? <span title={`Punkte für die nächste Insel: ${progress.points} von ${progress.price}`}><span aria-hidden>{progress.points}/{progress.price}</span><span className="sr-only">Nächste Insel: {progress.points} von {progress.price} Punkten</span></span> : undefined} panelLabel="Inseln in deinem Dorf">
        <div className={styles.panel}>
          <div className={styles.switcher} role="group" aria-label="Insel wählen">
            {ISLANDS.filter((island) => island.no <= islands.unlocked).map((island) => (
              <button key={island.no} type="button" aria-pressed={islands.current === island.no} className={islands.current === island.no ? styles.active : ""} onClick={() => islands.goTo(island.no)}>
                <Anchor size={14} />{island.name}
              </button>
            ))}
          </div>
          {!islands.available ? (
            <p className={styles.hint} role="status">Weitere Inseln kommen bald.</p>
          ) : progress ? (
            <div className={styles.next}>
              <div className={styles.progressText}>
                <span><Lock size={14} />Nächste Insel: <strong>{progress.island.name}</strong></span>
                <span data-testid="island-progress" aria-label={`${progress.points} von ${progress.price} Punkten`}><strong>{progress.points}</strong> / {progress.price} Punkte</span>
              </div>
              <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={progress.price} aria-valuenow={progress.points} aria-label="Fortschritt zur nächsten Insel"><i style={{ width: `${progress.percent}%` }} /></div>
              <button type="button" className={styles.unlock} disabled={!affordable || islands.busy} onClick={() => void islands.unlock(balance)}>
                <Sparkles size={15} />{islands.busy ? "Wird freigeschaltet ..." : affordable ? "Insel freischalten" : `Noch ${progress.missing} Punkte`}
              </button>
            </div>
          ) : (
            <p className={styles.hint}>Alle Inseln freigeschaltet. Dein Dorf ist komplett.</p>
          )}
          {islands.error && <p className={styles.error} role="alert">{islands.error}</p>}
        </div>
      </MapChip>
      {islands.celebrate && (
        <div className={styles.celebrate} role="status" aria-live="polite">
          <div className={styles.confetti} aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} style={{ ["--i" as string]: index }} />)}</div>
          <strong>Neue Insel entdeckt!</strong>
          <span>{ISLANDS.find((island) => island.no === islands.celebrate)?.name} ist über eine Brücke erreichbar.</span>
        </div>
      )}
    </>
  );
}
