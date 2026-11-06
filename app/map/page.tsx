"use client";

import Link from "next/link";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Coins, Hammer, Plus, Search, ShoppingBag, Trophy } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { MapApplicationDialog } from "@/components/applications/map-application-dialog";
import { MapChip, MapControls, MapDock, MapFullscreen, MapSheet, MapTopBar, MapBadge, overlayClasses } from "@/components/applications/map-fullscreen";
import { useCameraControls } from "@/components/applications/use-camera-controls";
import { MapPlacementTools, MapShop, useMapShop } from "@/components/applications/map-shop";
import { IslandPanel } from "@/components/applications/island-panel";
import { useIslands } from "@/components/applications/use-islands";
import { buildingStages } from "@/lib/application-map";
import type { MapLayout, OwnedMapItem } from "@/lib/map-shop";
import { getApplications } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { statusLabels } from "@/lib/utils";
import type { Application, ApplicationStatus } from "@/types";
import styles from "./map.module.css";
import layout from "./fullscreen.module.css";

const noItems: OwnedMapItem[] = [];
const noLayouts: MapLayout[] = [];
const ApplicationMapWorld = lazy(() => import("@/components/applications/application-map-world"));

export default function MapPage() {
  return <WorkspaceShell active="Map" fullscreen><ApplicationMap /></WorkspaceShell>;
}

function ApplicationMap() {
  const [shopOpen, setShopOpen] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ApplicationStatus | "all">("all");
  const camera = useCameraControls();
  const [night, setNight] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const revision = useRef(0);
  const [shopRefresh, setShopRefresh] = useState(0);
  const islands = useIslands(refresh, () => setShopRefresh((current) => current + 1));
  const shop = useMapShop(refresh + shopRefresh, applications, islands.unlocked);
  const balance = shop.state?.balance ?? null;

  useEffect(() => {
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
  }, [refresh]);

  const search = query.trim().toLocaleLowerCase("de");
  const visible = useMemo(() => applications.filter((application) => (status === "all" || application.status === status) && `${application.company} ${application.position} ${application.location ?? ""}`.toLocaleLowerCase("de").includes(search)), [applications, status, search]);
  const visibleIds = useMemo(() => visible.map(({ id }) => id), [visible]);
  const construction = applications.filter(({ status }) => buildingStages[status].workers).length;
  const offers = applications.filter(({ status }) => status === "offer" || status === "contract_signed").length;
  const selected = applications.find(({ id }) => id === selectedId);

  const emptyNotice = !loading && !applications.length && !error;
  const noMatch = applications.length > 0 && visible.length === 0;
  const shopSheetOpen = shopOpen && !shop.placement && !selected;

  return (
    <>
      <h1 className="sr-only">Map – Dein Bewerbungsdorf</h1>
      <MapFullscreen
        label="Bewerbungsmap"
        busy={loading}
        map={loading && !applications.length ? <div className={styles.loading} role="status">Dein Dorf wird geladen ...</div> : (
          <Suspense fallback={<div className={styles.loading} role="status">Dein Dorf wird aufgebaut ...</div>}>
            <ApplicationMapWorld applications={applications} visibleIds={visibleIds} selectedId={selectedId} night={night} zoom={camera.zoom} center={camera.center} onZoomChange={camera.setZoom} onCameraApi={camera.onCameraApi} onSelect={(id) => { setShopOpen(false); setSelectedId(id); }} shopItems={shop.state?.items ?? noItems} layouts={shop.state?.layouts ?? noLayouts} selectedShopItemId={shop.selectedId} placement={shop.placement} onSelectShopItem={shop.select} onPlacePosition={shop.position} islandCount={islands.unlocked} islandFocus={islands.focus} drag={{ enabled: shop.state !== null && !shop.busy, move: (id, position) => void shop.move(id, position), reject: shop.reject, nudge: shop.nudge, confirm: () => { if (shop.placement) void shop.save(shop.placement.item, shop.placement.position); }, cancel: shop.cancel, undo: shop.undo }} />
          </Suspense>
        )}
      >
        <MapTopBar
          left={<>
            <IslandPanel islands={islands} balance={balance} />
            <MapChip id="search" icon={<Search size={16} />} label="Suche" meta={query || status !== "all" ? `${visible.length}/${applications.length}` : undefined} panelLabel="Suche, Filter und Legende">
              <div className={layout.search}>
                <div className={layout.searchFields}>
                  <label className={layout.searchInput}><Search size={16} aria-hidden /><span className="sr-only">Bewerbungen suchen</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Firma, Stelle oder Ort" type="search" enterKeyHint="search" /></label>
                  <label><span className="sr-only">Status filtern</span><select className={layout.searchSelect} value={status} onChange={(event) => setStatus(event.target.value as ApplicationStatus | "all")}><option value="all">Alle Status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                </div>
                <div className={layout.summaryRow} aria-live="polite">
                  <span><strong>{applications.length}</strong> Gebäude</span>
                  <span><Hammer size={14} aria-hidden /><strong>{construction}</strong> im Bau</span>
                  <span><Trophy size={14} aria-hidden /><strong>{offers}</strong> {offers === 1 ? "Zusage" : "Zusagen"}</span>
                </div>
                {visible.length > 0 && <ul className={layout.buildingList} aria-label="Gefundene Bewerbungen">{visible.map((application) => <li key={application.id}><button type="button" onClick={() => { setShopOpen(false); setSelectedId(application.id); }}><strong>{application.company}</strong><span>{application.position} · {statusLabels[application.status]}</span></button></li>)}</ul>}
                <div className={layout.legendRow} aria-label="Legende">{(Object.keys(buildingStages) as ApplicationStatus[]).map((value) => <span key={value}><i style={{ background: buildingStages[value].color }} />{statusLabels[value]}</span>)}</div>
                <p className={layout.helpText}>Häuser und Gegenstände verschiebst du per Ziehen (Touch: kurz halten, dann ziehen). Zoom mit Mausrad oder zwei Fingern.</p>
              </div>
            </MapChip>
          </>}
          right={<>
            <MapBadge label={`Punktestand: ${balance ?? "unbekannt"}`}><Coins size={16} aria-hidden /><strong>{balance ?? "–"}</strong></MapBadge>
            <button type="button" className={`${layout.chip} ${overlayClasses.glass}`} aria-expanded={shopSheetOpen} onClick={() => { setSelectedId(null); setShopOpen(!shopOpen); }}><ShoppingBag size={16} aria-hidden /><span className={layout.chipLabel}>Shop</span></button>
            <Link href="/applications/new" className={overlayClasses.iconButton} aria-label="Neue Bewerbung" title="Neue Bewerbung"><Plus size={18} aria-hidden /></Link>
          </>}
        />
        <MapControls camera={camera} night={night} onToggleNight={() => setNight(!night)} onRefresh={() => setRefresh(refresh + 1)} refreshing={loading} />
        <MapDock>
          <MapPlacementTools shop={shop} />
          {error && <div className={`${layout.notice} ${layout.noticeDanger} ${overlayClasses.glass}`} role="alert"><p>Deine Bewerbungen konnten nicht geladen werden.</p><button type="button" onClick={() => setRefresh(refresh + 1)}>Erneut versuchen</button></div>}
          {emptyNotice && <div className={`${layout.notice} ${overlayClasses.glass}`} role="status"><p>Noch keine Gebäude – du hast noch keine Bewerbungen.</p><Link href="/applications/new">Bewerbung hinzufügen</Link></div>}
          {noMatch && <div className={`${layout.notice} ${overlayClasses.glass}`} role="status"><p>Keine Bewerbungen für diese Auswahl.</p><button type="button" onClick={() => { setQuery(""); setStatus("all"); }}>Filter zurücksetzen</button></div>}
          <MapSheet id="shop" open={shopSheetOpen} onClose={() => setShopOpen(false)} title="Shop" subtitle={shop.state ? `${shop.state.balance} Punkte` : undefined} icon={<ShoppingBag size={18} />} tall>
            <MapShop shop={shop} compact />
          </MapSheet>
          {selected && <MapApplicationDialog key={selected.id} application={selected} onClose={() => setSelectedId(null)} onMove={() => { const house = shop.objects.find((item) => item.applicationId === selected.id); if (house) { shop.start(house); setSelectedId(null); } }} canMove={shop.state !== null && !shop.busy} onUpdated={(updated) => { revision.current++; setApplications((current) => current.map((application) => application.id === updated.id ? updated : application)); setShopRefresh((current) => current + 1); }} />}
        </MapDock>
      </MapFullscreen>
    </>
  );
}
