"use client";

import Link from "next/link";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Coins, Eye, Hammer, Plus, Search, ShoppingBag, Trophy } from "lucide-react";
import { MapApplicationDialog } from "@/components/applications/map-application-dialog";
import { MapChip, MapControls, MapDock, MapFullscreen, MapSheet, MapTopBar, MapBadge, overlayClasses, isCompactMap, useCloseMapTopPanel, useCompactMap, useHideBottomNav } from "@/components/applications/map-fullscreen";
import { useCameraControls } from "@/components/applications/use-camera-controls";
import { MapPlacementTools, MapShop, useMapShop } from "@/components/applications/map-shop";
import { IslandPanel } from "@/components/applications/island-panel";
import { PalaceCelebration, usePalaceCelebration } from "@/components/applications/palace-celebration";
import { useIslands } from "@/components/applications/use-islands";
import { buildingStages } from "@/lib/application-map";
import { isLockedMapObject, type MapLayout, type OwnedMapItem } from "@/lib/map-shop";
import { lockedDrag } from "@/lib/map-readonly";
import type { ReadOnlyVillage } from "@/lib/read-only-village";
import { getApplications } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { statusLabels } from "@/lib/utils";
import type { Application, ApplicationStatus } from "@/types";
import styles from "@/app/map/map.module.css";
import layout from "@/app/map/fullscreen.module.css";

const noItems: OwnedMapItem[] = [];
const noLayouts: MapLayout[] = [];
const noApplications: Application[] = [];
const ApplicationMapWorld = lazy(() => import("@/components/applications/application-map-world"));
const READ_ONLY = "Nur ansehen";

/**
 * A parent watching the child's village (/familie/kind/[id]/dorf). The page loads the data (family_child_village, the
 * only request) and passes it here; the screen is the child's own village, read-only.
 */
export type VillageWatch = {
  /** null while loading. */
  village: ReadOnlyVillage | null;
  loading: boolean;
  /** «Dorf von Lina»: chip title, accessible map name and sr-only heading. */
  title: string;
  back: { href: string; ariaLabel: string; text: string };
  /** «Nur ansehen» panel: what the parent sees. */
  info: ReactNode;
};

/**
 * The village screen (/map). The child's own village AND, with `watch`, the parent's view of it: the very same component,
 * world, camera, island switcher, house labels, search and house sheet. `watch` makes it STRICTLY read-only: nothing is
 * loaded here (no applications, map_shop_state, islands, catalogue or reward claim), no shop, points, add button, palace
 * celebration, drag/move, placement, status change or link into the application; opening a house shows its details only.
 */
export function VillageMap({ watch }: { watch?: VillageWatch } = {}) {
  const watching = watch !== undefined;
  const [shopOpen, setShopOpen] = useState(false);
  const [ownApplications, setApplications] = useState<Application[]>([]);
  const [ownLoading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ApplicationStatus | "all">("all");
  const camera = useCameraControls();
  const [night, setNight] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const revision = useRef(0);
  const [shopRefresh, setShopRefresh] = useState(0);
  const applications = watch ? watch.village?.applications ?? noApplications : ownApplications;
  const loading = watch ? watch.loading : ownLoading;
  const watchItems = watch?.village?.items ?? noItems;
  const watchLayouts = watch?.village?.layouts ?? noLayouts;
  const watchShop = useMemo(() => ({ items: watchItems, layouts: watchLayouts }), [watchItems, watchLayouts]);
  const islands = useIslands(refresh, () => setShopRefresh((current) => current + 1), watch ? watch.village?.islandCount ?? 1 : undefined);
  const shop = useMapShop(refresh + shopRefresh, applications, islands.unlocked, watch ? watchShop : undefined);
  const balance = shop.state?.balance ?? null;
  const palace = usePalaceCelebration(watching ? noApplications : applications);
  // Phones: one map panel at a time. Opening the shop, a house or an item closes the top chip panel (Suche, Inseln) …
  const closeTopPanel = useCloseMapTopPanel();
  const compact = useCompactMap();
  function selectHouse(id: string | null) { if (id) closeTopPanel(); setShopOpen(false); setSelectedId(id); }
  function selectShopItem(id: string) { if (watching) return; closeTopPanel(); shop.select(id); }
  // … and opening a chip panel closes the shop, the house sheet and the item / placement tools.
  // «Laden» toggles what the user sees: if the sheet is hidden (closed, or replaced by the item tools on a phone) it opens and
  // the other panels close – one panel at a time, as with «Suche». Placed items are saved, so deselecting loses nothing.
  function toggleShop() {
    if (watching) return;
    if (shopSheetOpen) { setShopOpen(false); return; }
    closeTopPanel();
    setSelectedId(null);
    if (isCompactMap() || shop.placement) shop.clearSelection();
    setShopOpen(true);
  }
  function onTopPanelOpen() {
    if (!isCompactMap()) return;
    setShopOpen(false);
    setSelectedId(null);
    shop.clearSelection();
  }

  useEffect(() => {
    if (watching) return;
    let active = true;
    let request = 0;
    async function load(clear = false) {
      const current = ++request;
      const version = revision.current;
      if (clear) { setApplications([]); setSelectedId(null); }
      setLoading(true);
      setError(false);
      try {
        const data = await getApplications();
        if (active && current === request && version === revision.current) setApplications(data);
      } catch {
        if (active && current === request) setError(true);
      } finally {
        if (active && current === request) setLoading(false);
      }
    }
    function onFocus() { if (document.visibilityState === "visible") void load(); }
    void load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") void load(true);
    });
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      listener.subscription.unsubscribe();
    };
  }, [refresh, watching]);

  const search = query.trim().toLocaleLowerCase("de");
  const visible = useMemo(() => applications.filter((application) => (status === "all" || application.status === status) && `${application.company} ${application.position} ${application.location ?? ""}`.toLocaleLowerCase("de").includes(search)), [applications, status, search]);
  const visibleIds = useMemo(() => visible.map(({ id }) => id), [visible]);
  const construction = applications.filter(({ status }) => buildingStages[status].workers).length;
  const offers = applications.filter(({ status }) => status === "offer" || status === "contract_signed").length;
  const selected = applications.find(({ id }) => id === selectedId);

  const emptyNotice = !loading && !applications.length && !error;
  const noMatch = applications.length > 0 && visible.length === 0;
  const selectedItem = !watching && shop.selectedId ? shop.allItems.find(({ id }) => id === shop.selectedId) : undefined;
  const itemToolsOpen = !watching && (Boolean(shop.placement) || Boolean(selectedItem && selectedItem.x !== null && !isLockedMapObject(selectedItem)));
  // Phones: the item tools replace the shop sheet (it comes back when they close); from 768px both stay side by side.
  const shopSheetOpen = !watching && shopOpen && !shop.placement && !selected && !(compact && itemToolsOpen);
  // Phones: a sheet or the placement tools replace the bottom tab bar (more map, actions never behind the bar).
  useHideBottomNav(shopSheetOpen || Boolean(selected) || itemToolsOpen);

  const title = watch?.title ?? "Dein Dorf";
  const worldData = { applications, visibleIds, selectedId, night, zoom: camera.zoom, center: camera.center, onZoomChange: camera.setZoom, onCameraApi: camera.onCameraApi, onSelect: selectHouse,
    shopItems: shop.state?.items ?? noItems, layouts: shop.state?.layouts ?? noLayouts, islandCount: islands.unlocked, islandFocus: islands.focus };
  return (
    <>
      <h1 className="sr-only">{watch ? `${title} (${READ_ONLY.toLowerCase()})` : title}</h1>
      <MapFullscreen
        label={title}
        busy={loading}
        map={loading && !applications.length ? <div className={styles.loading} role="status">{watch ? "Dorf wird geladen ..." : "Dein Dorf wird geladen ..."}</div> : (
          <Suspense fallback={<div className={styles.loading} role="status">{watch ? "Dorf wird aufgebaut ..." : "Dein Dorf wird aufgebaut ..."}</div>}>
            {watch
              ? <ApplicationMapWorld {...worldData} readOnly openHouses selectedShopItemId={null} placement={null} onSelectShopItem={selectShopItem} onPlacePosition={() => undefined} drag={lockedDrag} celebratePalaceId={null} />
              : <ApplicationMapWorld {...worldData} selectedShopItemId={shop.selectedId} placement={shop.placement} onSelectShopItem={selectShopItem} onPlacePosition={shop.position} celebratePalaceId={palace.application?.id ?? null} drag={{ enabled: shop.state !== null && !shop.busy, move: (id, position) => void shop.move(id, position), reject: shop.reject, nudge: shop.nudge, confirm: () => { if (shop.placement) void shop.save(shop.placement.item, shop.placement.position); }, cancel: shop.cancel, undo: shop.undo }} />}
          </Suspense>
        )}
      >
        <MapTopBar
          onPanelOpen={onTopPanelOpen}
          left={<>
            {watch && <Link href={watch.back.href} className={`${layout.chip} ${layout.friendBack} ${overlayClasses.sticker}`} aria-label={watch.back.ariaLabel}><ArrowLeft size={16} aria-hidden /><span className={layout.chipLabel}>{watch.back.text}</span></Link>}
            <IslandPanel islands={islands} balance={balance} watch={watch ? { title } : undefined} />
            <MapChip id="search" icon={<Search size={16} />} label="Suche" meta={query || status !== "all" ? `${visible.length}/${applications.length}` : undefined} panelLabel="Suche, Filter und Legende">
              <div className={layout.search}>
                <div className={layout.searchFields}>
                  <label className={layout.searchInput}><Search size={16} aria-hidden /><span className="sr-only">Bewerbungen suchen</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Firma, Stelle oder Ort" type="search" enterKeyHint="search" /></label>
                  <label><span className="sr-only">Status filtern</span><select className={layout.searchSelect} value={status} onChange={(event) => setStatus(event.target.value as ApplicationStatus | "all")}><option value="all">Alle Status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                </div>
                <div className={layout.summaryRow} aria-live="polite">
                  <span><strong>{applications.length}</strong> {applications.length === 1 ? "Haus" : "Häuser"}</span>
                  <span><Hammer size={14} aria-hidden /><strong>{construction}</strong> im Bau</span>
                  <span><Trophy size={14} aria-hidden /><strong>{offers}</strong> {offers === 1 ? "Zusage" : "Zusagen"}</span>
                </div>
                {visible.length > 0 && <ul className={layout.buildingList} aria-label="Gefundene Bewerbungen">{visible.map((application) => <li key={application.id}><button type="button" onClick={() => selectHouse(application.id)}><strong>{application.company}</strong><span>{application.position} · {statusLabels[application.status]}</span></button></li>)}</ul>}
                <div className={layout.legendRow} aria-label="Legende">{(Object.keys(buildingStages) as ApplicationStatus[]).map((value) => <span key={value}><i style={{ background: buildingStages[value].color }} />{statusLabels[value]}</span>)}</div>
                <p className={layout.helpText}>{watch ? "Nur ansehen: Ziehen bewegt die Kamera, Zoom mit Mausrad oder zwei Fingern. Ein Haus antippen zeigt seine Angaben." : "Häuser und Gegenstände verschiebst du per Ziehen (Touch: kurz halten, dann ziehen). Zoom mit Mausrad oder zwei Fingern."}</p>
              </div>
            </MapChip>
          </>}
          right={watch ? (
            <MapChip id="watch-info" icon={<Eye size={16} />} label={READ_ONLY} panelLabel={`Info: ${title}`}>
              <h2 className={layout.panelHeading}>{READ_ONLY}</h2>
              <p className={layout.friendNote}>{watch.info}</p>
            </MapChip>
          ) : <>
            <MapBadge label={`Punktestand: ${balance ?? "unbekannt"}`}><Coins size={16} aria-hidden /><strong>{balance ?? "–"}</strong></MapBadge>
            <button type="button" className={`${layout.chip} ${overlayClasses.sticker}`} aria-expanded={shopSheetOpen} onClick={toggleShop}><ShoppingBag size={16} aria-hidden /><span className={layout.chipLabel}>Laden</span></button>
            <Link href="/applications/new" className={overlayClasses.iconButton} aria-label="Bewerbung eintragen" title="Bewerbung eintragen"><Plus size={18} aria-hidden /></Link>
          </>}
        />
        {!watch && <PalaceCelebration application={palace.application} onDismiss={palace.dismiss} paused={shopSheetOpen || Boolean(selected) || itemToolsOpen} />}
        <MapControls camera={camera} night={night} onToggleNight={() => setNight(!night)} onRefresh={watch ? undefined : () => setRefresh(refresh + 1)} refreshing={loading} />
        <MapDock>
          {!watch && <MapPlacementTools shop={shop} />}
          {error && <div className={`${layout.notice} ${layout.noticeDanger} ${overlayClasses.sticker}`} role="alert"><p>Deine Bewerbungen konnten nicht geladen werden.</p><button type="button" onClick={() => setRefresh(refresh + 1)}>Erneut versuchen</button></div>}
          {emptyNotice && (watch
            ? <div className={`${layout.notice} ${overlayClasses.sticker}`} role="status"><p><strong>Das Dorf ist noch leer.</strong> Jede Bewerbung wird hier zu einem Haus.</p></div>
            : <div className={`${layout.notice} ${overlayClasses.sticker}`} role="status"><p><strong>Dein Dorf ist noch leer.</strong> Jede Bewerbung wird hier zu einem Haus.</p><Link href="/applications/new">Bewerbung eintragen</Link></div>)}
          {noMatch && <div className={`${layout.notice} ${overlayClasses.sticker}`} role="status"><p>Keine Bewerbungen für diese Auswahl.</p><button type="button" onClick={() => { setQuery(""); setStatus("all"); }}>Filter zurücksetzen</button></div>}
          {!watch && (
            <MapSheet id="shop" open={shopSheetOpen} onClose={() => setShopOpen(false)} title="Laden" subtitle={shop.state ? `${shop.state.balance} Punkte` : undefined} icon={<ShoppingBag size={18} />} tall>
              <MapShop shop={shop} compact />
            </MapSheet>
          )}
          {selected && (watch
            ? <MapApplicationDialog key={selected.id} application={selected} readOnly onClose={() => setSelectedId(null)} onMove={() => undefined} canMove={false} onUpdated={() => undefined} />
            : <MapApplicationDialog key={selected.id} application={selected} onClose={() => setSelectedId(null)} onMove={() => { const house = shop.objects.find((item) => item.applicationId === selected.id); if (house) { closeTopPanel(); shop.start(house); setSelectedId(null); } }} canMove={shop.state !== null && !shop.busy} onUpdated={(updated) => { revision.current++; setApplications((current) => current.map((application) => application.id === updated.id ? updated : application)); setShopRefresh((current) => current + 1); }} />)}
        </MapDock>
      </MapFullscreen>
    </>
  );
}
