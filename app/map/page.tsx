"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Hammer, LocateFixed, Minus, Moon, Plus, RefreshCw, Search, ShoppingBag, Sun, Trophy, ZoomIn } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { MapApplicationDialog } from "@/components/applications/map-application-dialog";
import { ButtonLink, Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { MapPlacementTools, MapShop, useMapShop } from "@/components/applications/map-shop";
import { buildingStages } from "@/lib/application-map";
import type { MapLayout, OwnedMapItem } from "@/lib/map-shop";
import { getApplications } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { statusLabels } from "@/lib/utils";
import type { Application, ApplicationStatus } from "@/types";
import styles from "./map.module.css";

const noItems: OwnedMapItem[] = [];
const noLayouts: MapLayout[] = [];
const ApplicationMapWorld = lazy(() => import("@/components/applications/application-map-world"));

export default function MapPage() {
  return <WorkspaceShell active="Map"><ApplicationMap /></WorkspaceShell>;
}

function useIsPhone() {
  return useSyncExternalStore(
    (notify) => { const query = window.matchMedia("(max-width: 767px)"); query.addEventListener("change", notify); return () => query.removeEventListener("change", notify); },
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}

function ApplicationMap() {
  const phone = useIsPhone();
  const [shopOpen, setShopOpen] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ApplicationStatus | "all">("all");
  const [zoom, setZoom] = useState(1);
  const [night, setNight] = useState(false);
  const [center, setCenter] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const revision = useRef(0);
  const [shopRefresh, setShopRefresh] = useState(0);
  const shop = useMapShop(refresh + shopRefresh, applications);

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
  const offers = applications.filter(({ status }) => status === "offer").length;
  const selected = applications.find(({ id }) => id === selectedId);

  return (
    <div className={`${styles.page} pb-safe`}>
      <PageHeader title="Map" description="Dein Bewerbungsdorf" actions={<>{phone && <Button variant="secondary" icon={<ShoppingBag size={16} />} onClick={() => setShopOpen(true)}>Shop{shop.state ? ` · ${shop.state.balance}` : ""}</Button>}<ButtonLink href="/applications/new" icon={<Plus size={16} />}>Bewerbung</ButtonLink></>} />
      <section className={`${styles.map}`} aria-label="Bewerbungsmap" aria-busy={loading}>
        <div className={styles.toolbar}>
          <label className={styles.search}><Search size={16} /><span className="sr-only">Bewerbungen suchen</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Firma, Stelle oder Ort" type="search" /></label>
          <label className={styles.filter}><span className="sr-only">Status filtern</span><select value={status} onChange={(event) => setStatus(event.target.value as ApplicationStatus | "all")}><option value="all">Alle Status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <div className={styles.tools}>
            <button title="Verkleinern" aria-label="Verkleinern" onClick={() => setZoom(Math.max(0.4, Number((zoom - 0.2).toFixed(2))))} disabled={zoom <= 0.4}><Minus size={16} /></button>
            <button title="Zoom zurücksetzen" aria-label="Zoom zurücksetzen" onClick={() => setZoom(1)} className={styles.zoom}><ZoomIn size={14} /><span>{Math.round(zoom * 100)} %</span></button>
            <button title="Vergrößern" aria-label="Vergrößern" onClick={() => setZoom(Math.min(2.4, Number((zoom + 0.2).toFixed(2))))} disabled={zoom >= 2.4}><Plus size={16} /></button>
            <button title="Kamera zentrieren" aria-label="Kamera zentrieren" onClick={() => { setZoom(1); setCenter(center + 1); }}><LocateFixed size={16} /></button>
            <button title={night ? "Tagansicht" : "Nachtansicht"} aria-label={night ? "Tagansicht" : "Nachtansicht"} aria-pressed={night} onClick={() => setNight(!night)}>{night ? <Sun size={16} /> : <Moon size={16} />}</button>
            <button title="Aktualisieren" aria-label="Aktualisieren" disabled={loading} onClick={() => setRefresh(refresh + 1)}><RefreshCw size={16} /></button>
          </div>
        </div>
        {error && <div className={styles.error} role="alert">Deine Bewerbungen konnten nicht geladen werden. <button onClick={() => setRefresh(refresh + 1)}>Erneut versuchen</button></div>}
        <div className={styles.summary} aria-live="polite">
          <span><strong>{applications.length}</strong> Gebäude</span>
          <span><Hammer size={15} /><strong>{construction}</strong> im Bau</span>
          <span><Trophy size={15} /><strong>{offers}</strong> {offers === 1 ? "Angebot" : "Angebote"}</span>
        </div>
        {loading && !applications.length ? <div className={styles.loading} role="status">Dein Dorf wird geladen ...</div> : (
          <>
            {!applications.length && !error && <div className={styles.empty}><h2>Noch keine Gebäude</h2><p>Du hast noch keine Bewerbungen.</p></div>}
            {applications.length > 0 && visible.length === 0 && <p className={styles.empty} role="status">Keine Bewerbungen für diese Auswahl.</p>}
            <MapPlacementTools shop={shop} />
            <Suspense fallback={<div className={styles.loading} role="status">Dein Dorf wird aufgebaut ...</div>}>
              <ApplicationMapWorld applications={applications} visibleIds={visibleIds} selectedId={selectedId} night={night} zoom={zoom} center={center} onZoomChange={setZoom} onSelect={setSelectedId} shopItems={shop.state?.items ?? noItems} layouts={shop.state?.layouts ?? noLayouts} selectedShopItemId={shop.selectedId} placement={shop.placement} onSelectShopItem={shop.select} onPlacePosition={shop.position} />
            </Suspense>
          </>
        )}
        <footer className={styles.legend}>
          {(Object.keys(buildingStages) as ApplicationStatus[]).map((value) => <span key={value}><i style={{ background: buildingStages[value].color }} />{statusLabels[value]}</span>)}
        </footer>
      </section>
      {phone ? <Modal open={shopOpen && !shop.placement} onClose={() => setShopOpen(false)} title="Shop"><MapShop shop={shop} compact /></Modal> : <MapShop shop={shop} />}
      {selected && <MapApplicationDialog key={selected.id} application={selected} onClose={() => setSelectedId(null)} onMove={() => { const house = shop.objects.find((item) => item.applicationId === selected.id); if (house) { shop.start(house); setSelectedId(null); } }} canMove={shop.state !== null && !shop.busy} onUpdated={(updated) => { revision.current++; setApplications((current) => current.map((application) => application.id === updated.id ? updated : application)); setShopRefresh((current) => current + 1); }} />}
    </div>
  );
}