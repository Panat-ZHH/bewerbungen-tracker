"use client";

import { lazy, Suspense, useState, type ReactNode } from "react";
import Link from "next/link";
import { Anchor, ArrowLeft, Eye } from "lucide-react";
import { MapBadge, MapChip, MapControls, MapDock, MapFullscreen, MapTopBar, overlayClasses } from "@/components/applications/map-fullscreen";
import { useCameraControls } from "@/components/applications/use-camera-controls";
import { ISLANDS } from "@/lib/islands-config";
import { readOnlyWorldProps, type ReadOnlyVillage } from "@/lib/read-only-village";
import styles from "@/app/map/map.module.css";
import layout from "@/app/map/fullscreen.module.css";

const ApplicationMapWorld = lazy(() => import("@/components/applications/application-map-world"));

const READ_ONLY = "Nur ansehen";

/**
 * The one read-only village screen, used by the friend island (/friends/[id]) AND the parent view of a child's village
 * (/familie/kind/[id]/dorf). Same live 3D world (villagers, builders, water, fire, day/night), same camera, island
 * switcher and «Nur ansehen» badge. Nothing to buy, edit or drag: only the camera moves. The callers only load the
 * data (each through its own read-only RPC with its own privacy checks) and pass the texts.
 */
export function ReadOnlyVillageView({ village, loading, heading, label, waitingText, back, chip, dock }: {
  village: ReadOnlyVillage | null;
  loading: boolean;
  /** sr-only page heading. */
  heading: string;
  /** Accessible name of the fullscreen map, e.g. «Insel von Mia». */
  label: string;
  /** Shown while the data loads; null = nothing (an error is shown in the dock instead). */
  waitingText: string | null;
  back: { href: string; ariaLabel: string; text: string };
  /** Info chip top left: who this village belongs to and what is visible. */
  chip: { id: string; icon: ReactNode; name: string; panelLabel: string; note: ReactNode };
  dock?: ReactNode;
}) {
  const camera = useCameraControls();
  const [night, setNight] = useState(false);
  const [focus, setFocus] = useState<{ no: number; reveal: boolean; key: number } | null>(null);
  const switcher = village && village.islandCount > 1;
  return (
    <>
      <h1 className="sr-only">{heading}</h1>
      <MapFullscreen
        label={label}
        busy={loading}
        map={village ? (
          <Suspense fallback={<div className={styles.loading} role="status">Dorf wird aufgebaut ...</div>}>
            <ApplicationMapWorld {...readOnlyWorldProps(village)} night={night} zoom={camera.zoom} center={camera.center} onZoomChange={camera.setZoom} onCameraApi={camera.onCameraApi} islandFocus={focus} />
          </Suspense>
        ) : waitingText === null ? <div className={styles.loading} /> : <div className={styles.loading} role="status" aria-label={waitingText}>{waitingText}</div>}
      >
        <MapTopBar
          left={<>
            <Link href={back.href} className={`${layout.chip} ${layout.friendBack} ${overlayClasses.sticker}`} aria-label={back.ariaLabel}><ArrowLeft size={16} aria-hidden /><span className={layout.chipLabel}>{back.text}</span></Link>
            <MapChip id={chip.id} icon={chip.icon} label={chip.name} meta={<Eye size={14} aria-label={READ_ONLY} />} panelLabel={chip.panelLabel}>
              <h2 className={layout.panelHeading}>{READ_ONLY}</h2>
              <p className={layout.friendNote}>{chip.note}</p>
            </MapChip>
          </>}
          right={<>
            {switcher && (
              <MapChip id={`${chip.id}-islands`} icon={<Anchor size={16} />} label="Inseln" panelLabel="Inseln">
                <div className={layout.switcherGroup} role="group" aria-label="Inseln">
                  {Array.from({ length: village.islandCount }, (_, index) => index + 1).map((no) => <button key={no} type="button" className={layout.switcherButton} onClick={() => setFocus((previous) => ({ no, reveal: false, key: (previous?.key ?? 0) + 1 }))}><Anchor size={14} aria-hidden />{ISLANDS.find((entry) => entry.no === no)?.name ?? `Insel ${no}`}</button>)}
                </div>
              </MapChip>
            )}
            <MapBadge label={READ_ONLY}><Eye size={15} aria-hidden /><span className={overlayClasses.hideNarrow}>{READ_ONLY}</span></MapBadge>
          </>}
        />
        <MapControls camera={camera} night={night} onToggleNight={() => setNight(!night)} />
        <MapDock>{dock ?? null}</MapDock>
      </MapFullscreen>
    </>
  );
}
