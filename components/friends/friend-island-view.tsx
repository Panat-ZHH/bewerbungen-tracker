"use client";

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Anchor, ArrowLeft, Eye } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useAvatarUrls } from "@/components/ui/use-avatars";
import { friendIslandError, getFriendIsland, type FriendIsland } from "@/lib/friend-island";
import { ISLANDS } from "@/lib/islands-config";
import { lockedDrag } from "@/lib/map-readonly";
import { MapBadge, MapChip, MapControls, MapDock, MapFullscreen, MapTopBar, overlayClasses } from "@/components/applications/map-fullscreen";
import { useCameraControls } from "@/components/applications/use-camera-controls";
import styles from "@/app/map/map.module.css";
import layout from "@/app/map/fullscreen.module.css";

const ApplicationMapWorld = lazy(() => import("@/components/applications/application-map-world"));

/**
 * Read-only view of an accepted friend's island. It only ever calls the read-only RPC map_friend_island:
 * no shop hook, no save/move/place/delete functions, no edit toolbar. Camera (pan/zoom/day-night) is the only interaction.
 */
export function FriendIslandView({ friendId }: { friendId: string }) {
  const [island, setIsland] = useState<FriendIsland | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const camera = useCameraControls();
  const [night, setNight] = useState(false);
  const [focus, setFocus] = useState<{ no: number; reveal: boolean; key: number } | null>(null);
  const avatars = useAvatarUrls([friendId]);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset before the (re)fetch
    setLoading(true); setError("");
    getFriendIsland(friendId)
      .then((value) => { if (active) setIsland(value); })
      .catch((reason) => { if (active) { setIsland(null); setError(friendIslandError(reason)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [friendId, attempt]);

  const visibleIds = useMemo(() => island?.applications.map(({ id }) => id) ?? [], [island]);
  const name = island?.displayName || "Freund";

  const switcher = island && island.islands > 1;
  return (
    <>
      <h1 className="sr-only">{island ? `Insel von ${name} (nur ansehen)` : "Insel eines Freundes"}</h1>
      <MapFullscreen
        label={`Insel von ${name}`}
        busy={loading}
        map={island ? (
          <Suspense fallback={<div className={styles.loading} role="status">Insel wird aufgebaut ...</div>}>
            <ApplicationMapWorld readOnly applications={island.applications} visibleIds={visibleIds} selectedId={null} night={night} zoom={camera.zoom} center={camera.center} onZoomChange={camera.setZoom} onCameraApi={camera.onCameraApi} onSelect={noop} shopItems={island.items} layouts={island.layouts} selectedShopItemId={null} placement={null} onSelectShopItem={noop} onPlacePosition={noop} drag={lockedDrag} islandCount={island.islands} islandFocus={focus} />
          </Suspense>
        ) : error ? <div className={styles.loading} /> : <div className={styles.loading} role="status" aria-label="Insel wird geladen">Insel wird geladen ...</div>}
      >
        <MapTopBar
          left={<>
            <Link href="/friends" className={`${layout.chip} ${layout.friendBack} ${overlayClasses.glass}`} aria-label="Zurück zu Freunden"><ArrowLeft size={16} aria-hidden /><span className={layout.chipLabel}>Freunde</span></Link>
            <MapChip id="friend" icon={<Avatar name={island?.displayName} src={avatars[friendId]} size="sm" />} label={name} meta={<Eye size={14} aria-label="Nur ansehen" />} panelLabel={`Info zur Insel von ${name}`}>
              <h2 className={layout.panelHeading}>Nur ansehen</h2>
              <p className={layout.friendNote}>Du siehst nur die Karte und die Firmennamen, bei denen sich {name} beworben hat. Stellen, Daten und Notizen bleiben privat.</p>
            </MapChip>
          </>}
          right={<>
            {switcher && (
              <MapChip id="friend-islands" icon={<Anchor size={16} />} label="Inseln" panelLabel="Inseln">
                <div className={layout.switcherGroup} role="group" aria-label="Inseln">
                  {Array.from({ length: island.islands }, (_, index) => index + 1).map((no) => <button key={no} type="button" className={layout.switcherButton} onClick={() => setFocus((previous) => ({ no, reveal: false, key: (previous?.key ?? 0) + 1 }))}><Anchor size={14} aria-hidden />{ISLANDS.find((entry) => entry.no === no)?.name ?? `Insel ${no}`}</button>)}
                </div>
              </MapChip>
            )}
            <MapBadge label="Nur ansehen"><Eye size={15} aria-hidden /><span className={overlayClasses.hideNarrow}>Nur ansehen</span></MapBadge>
          </>}
        />
        <MapControls camera={camera} night={night} onToggleNight={() => setNight(!night)} />
        <MapDock>
          {error && <div className={`${layout.notice} ${layout.noticeDanger} ${overlayClasses.glass}`} role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(attempt + 1)}>Erneut versuchen</button></div>}
        </MapDock>
      </MapFullscreen>
    </>
  );
}

function noop() {}
