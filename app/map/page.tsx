"use client";

import Link from "next/link";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Hammer, LocateFixed, Minus, Moon, Plus, RefreshCw, Search, Sun, Trophy, ZoomIn } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { MapApplicationDialog } from "@/components/applications/map-application-dialog";
import { buildingStages } from "@/lib/application-map";
import { getApplications } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { statusLabels } from "@/lib/utils";
import type { Application, ApplicationStatus } from "@/types";
import styles from "./map.module.css";

const ApplicationMapWorld = lazy(() => import("@/components/applications/application-map-world"));

export default function MapPage() {
  return <WorkspaceShell active="Map"><ApplicationMap /></WorkspaceShell>;
}

function ApplicationMap() {
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
  const visible = applications.filter((application) => (status === "all" || application.status === status) && `${application.company} ${application.position} ${application.location ?? ""}`.toLocaleLowerCase("de").includes(search));
  const construction = applications.filter(({ status }) => buildingStages[status].workers).length;
  const offers = applications.filter(({ status }) => status === "offer").length;
  const selected = applications.find(({ id }) => id === selectedId);

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div><h1>Map</h1><p>Dein Bewerbungsdorf</p></div>
        <Link href="/applications/new" className={styles.primary}><Plus size={16} /> Bewerbung</Link>
      </header>
      <section className={styles.map} aria-label="Bewerbungsmap" aria-busy={loading}>
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
            <Suspense fallback={<div className={styles.loading} role="status">Dein Dorf wird aufgebaut ...</div>}>
              <ApplicationMapWorld applications={applications} visibleIds={visible.map(({ id }) => id)} selectedId={selectedId} night={night} zoom={zoom} center={center} onSelect={setSelectedId} />
            </Suspense>
          </>
        )}
        <footer className={styles.legend}>
          {(Object.keys(buildingStages) as ApplicationStatus[]).map((value) => <span key={value}><i style={{ background: buildingStages[value].color }} />{statusLabels[value]}</span>)}
        </footer>
      </section>
      {selected && <MapApplicationDialog key={selected.id} application={selected} onClose={() => setSelectedId(null)} onUpdated={(updated) => { revision.current++; setApplications((current) => current.map((application) => application.id === updated.id ? updated : application)); }} />}
    </div>
  );
}