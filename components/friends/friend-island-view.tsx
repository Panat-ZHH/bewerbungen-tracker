"use client";

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, LocateFixed, Minus, Moon, Plus, Sun, ZoomIn } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { useAvatarUrls } from "@/components/ui/use-avatars";
import { friendIslandError, getFriendIsland, type FriendIsland } from "@/lib/friend-island";
import { ISLANDS } from "@/lib/islands-config";
import { lockedDrag } from "@/lib/map-readonly";
import styles from "@/app/map/map.module.css";

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
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState(0);
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

  return (
    <div className={`${styles.page} pb-safe`}>
      <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Link href="/friends" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--hover)]"><ArrowLeft size={16} aria-hidden />Zurück zu Freunden</Link>
        <div className="flex min-w-0 max-w-full flex-1 flex-wrap items-center gap-x-3 gap-y-2">
          <Avatar name={island?.displayName} src={avatars[friendId]} size="md" />
          <h1 className="text-title min-w-0 max-w-full break-words">{island ? `Insel von ${name}` : "Insel"}</h1>
          <Badge tone="info" className="shrink-0 gap-1"><Eye size={12} aria-hidden />Nur ansehen</Badge>
        </div>
      </div>
      <section className={styles.map} aria-label={`Insel von ${name}`} aria-busy={loading}>
        <div className={styles.toolbar}>
          <p className="text-small flex-1 text-muted">Du siehst nur die Karte. Firmen, Stellen und Notizen bleiben privat.</p>
          {island && island.islands > 1 && (
            <div className="flex gap-1.5" role="group" aria-label="Inseln">
              {Array.from({ length: island.islands }, (_, index) => index + 1).map((no) => <button key={no} type="button" className="min-h-10 rounded-full border border-[var(--line)] px-3 text-xs font-semibold hover:bg-[var(--hover)]" onClick={() => setFocus((previous) => ({ no, reveal: false, key: (previous?.key ?? 0) + 1 }))}>{ISLANDS.find((entry) => entry.no === no)?.name ?? `Insel ${no}`}</button>)}
            </div>
          )}
          <div className={styles.tools}>
            <button type="button" title="Verkleinern" aria-label="Verkleinern" onClick={() => setZoom(Math.max(0.4, Number((zoom - 0.2).toFixed(2))))} disabled={zoom <= 0.4}><Minus size={16} /></button>
            <button type="button" title="Zoom zurücksetzen" aria-label="Zoom zurücksetzen" onClick={() => setZoom(1)} className={styles.zoom}><ZoomIn size={14} /><span>{Math.round(zoom * 100)} %</span></button>
            <button type="button" title="Vergrößern" aria-label="Vergrößern" onClick={() => setZoom(Math.min(2.4, Number((zoom + 0.2).toFixed(2))))} disabled={zoom >= 2.4}><Plus size={16} /></button>
            <button type="button" title="Kamera zentrieren" aria-label="Kamera zentrieren" onClick={() => { setZoom(1); setCenter(center + 1); }}><LocateFixed size={16} /></button>
            <button type="button" title={night ? "Tagansicht" : "Nachtansicht"} aria-label={night ? "Tagansicht" : "Nachtansicht"} aria-pressed={night} onClick={() => setNight(!night)}>{night ? <Sun size={16} /> : <Moon size={16} />}</button>
          </div>
        </div>
        {error && <div className="p-4"><StatusMessage tone="danger">{error}</StatusMessage><button type="button" className="mt-3 min-h-11 rounded-full border border-[var(--line)] px-4 text-sm font-medium hover:bg-[var(--hover)]" onClick={() => setAttempt(attempt + 1)}>Erneut versuchen</button></div>}
        {loading && !island && !error && <div className="p-4" role="status" aria-label="Insel wird geladen"><Skeleton className="h-[420px] w-full" /></div>}
        {island && (
          <Suspense fallback={<div className={styles.loading} role="status">Insel wird aufgebaut ...</div>}>
            <ApplicationMapWorld readOnly applications={island.applications} visibleIds={visibleIds} selectedId={null} night={night} zoom={zoom} center={center} onZoomChange={setZoom} onSelect={noop} shopItems={island.items} layouts={island.layouts} selectedShopItemId={null} placement={null} onSelectShopItem={noop} onPlacePosition={noop} drag={lockedDrag} islandCount={island.islands} islandFocus={focus} />
          </Suspense>
        )}
      </section>
    </div>
  );
}

function noop() {}
