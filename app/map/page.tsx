"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LocateFixed, Minus, Moon, Plus, RefreshCw, Search, Sun, ZoomIn } from "lucide-react";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { buildingStages, createApplicationMap } from "@/lib/application-map";
import { getApplications } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { statusLabels } from "@/lib/utils";
import type { Application, ApplicationStatus } from "@/types";
import styles from "./map.module.css";

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
  const [zoom, setZoom] = useState(0.75);
  const [night, setNight] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const positioned = useRef(false);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    if (!loading && viewport.current && !positioned.current) {
      positioned.current = true;
      if (viewport.current.clientWidth < 640) viewport.current.scrollLeft = 390 * 0.75 - viewport.current.clientWidth / 2;
    }
  }, [loading]);

  useEffect(() => {
    let active = true;
    let request = 0;
    async function load(clear = false) {
      const current = ++request;
      if (clear) setApplications([]);
      setLoading(true);
      setError(false);
      try {
        const data = await getApplications();
        if (active && current === request) setApplications(data);
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

  const map = createApplicationMap(applications);
  const search = query.trim().toLocaleLowerCase("de");
  const visible = map.plots.filter(({ application }) => (status === "all" || application.status === status) && `${application.company} ${application.position} ${application.location ?? ""}`.toLocaleLowerCase("de").includes(search));
  const construction = applications.filter(({ status }) => buildingStages[status].workers).length;
  const offers = applications.filter(({ status }) => status === "offer").length;

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div><h1>Map</h1><p className="text-muted">Deine Bewerbungsstadt</p></div>
        <Link href="/applications/new" className={styles.primary}><Plus size={16} /> Bewerbung</Link>
      </header>
      <div className={styles.summary} aria-live="polite">
        <span><strong>{applications.length}</strong> Gebäude</span>
        <span><strong>{construction}</strong> im Bau</span>
        <span><strong>{offers}</strong> {offers === 1 ? "Angebot" : "Angebote"}</span>
      </div>

      <section className={styles.map} aria-label="Bewerbungsmap" aria-busy={loading}>
        <div className={styles.toolbar}>
          <label className={styles.search}><Search size={16} /><span className="sr-only">Bewerbungen suchen</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Firma, Stelle oder Ort" type="search" /></label>
          <label className={styles.filter}><span className="sr-only">Status filtern</span><select value={status} onChange={(event) => setStatus(event.target.value as ApplicationStatus | "all")}><option value="all">Alle Status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <div className={styles.tools}>
            <button title="Verkleinern" aria-label="Verkleinern" onClick={() => setZoom(Math.max(0.3, Number((zoom - 0.1).toFixed(2))))} disabled={zoom <= 0.3}><Minus size={16} /></button>
            <button title="Zoom zurücksetzen" aria-label="Zoom zurücksetzen" onClick={() => setZoom(0.75)} className={styles.zoom}><ZoomIn size={14} /><span>{Math.round(zoom * 100)} %</span></button>
            <button title="Vergrößern" aria-label="Vergrößern" onClick={() => setZoom(Math.min(1.5, Number((zoom + 0.1).toFixed(2))))} disabled={zoom >= 1.5}><Plus size={16} /></button>
            <button title="Kamera zentrieren" aria-label="Kamera zentrieren" onClick={() => { if (viewport.current) { viewport.current.scrollLeft = 390 * zoom - viewport.current.clientWidth / 2; viewport.current.scrollTop = 0; } }}><LocateFixed size={16} /></button>
            <button title={night ? "Tagansicht" : "Nachtansicht"} aria-label={night ? "Tagansicht" : "Nachtansicht"} aria-pressed={night} onClick={() => setNight(!night)}>{night ? <Sun size={16} /> : <Moon size={16} />}</button>
            <button title="Aktualisieren" aria-label="Aktualisieren" disabled={loading} onClick={() => setRefresh(refresh + 1)}><RefreshCw size={16} /></button>
          </div>
        </div>

        {error && <div className={styles.error} role="alert">Deine Bewerbungen konnten nicht geladen werden. <button onClick={() => setRefresh(refresh + 1)}>Erneut versuchen</button></div>}
        {loading && !applications.length ? <div className={styles.loading} role="status">Deine Map wird geladen ...</div> : (
          <>
            {!applications.length && !error && <div className={styles.empty}><h2>Noch keine Gebäude</h2><p>Du hast noch keine Bewerbungen.</p></div>}
            {applications.length > 0 && visible.length === 0 && <p className={styles.empty} role="status">Keine Bewerbungen für diese Auswahl.</p>}
            <div className={`${styles.scene} ${night ? styles.nightScene : ""}`}>
            <div ref={viewport} className={styles.viewport} tabIndex={0} role="region" aria-label="Pixelstadt, horizontal und vertikal scrollbar"
              onPointerDown={(event) => {
                if (event.pointerType !== "mouse" || event.button !== 0) return;
                dragged.current = false;
                drag.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
              }}
              onPointerMove={(event) => {
                if (!drag.current) return;
                const horizontal = event.clientX - drag.current.x;
                const vertical = event.clientY - drag.current.y;
                if (!dragged.current && Math.hypot(horizontal, vertical) < 6) return;
                dragged.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
                event.currentTarget.dataset.dragging = "true";
                event.currentTarget.scrollLeft = drag.current.left - horizontal;
                event.currentTarget.scrollTop = drag.current.top - vertical;
              }}
              onPointerUp={(event) => { drag.current = null; delete event.currentTarget.dataset.dragging; }}
              onPointerCancel={(event) => { drag.current = null; dragged.current = false; delete event.currentTarget.dataset.dragging; }}
              onClickCapture={(event) => { if (dragged.current) { event.preventDefault(); event.stopPropagation(); dragged.current = false; } }}
              onDragStart={(event) => event.preventDefault()}>
              <div className={styles.scaled} style={{ width: map.width * zoom, height: map.height * zoom }}>
                <div className={`${styles.world} ${night ? styles.night : ""}`} style={{ width: map.width, height: map.height, transform: `scale(${zoom})` }}>
                  <Landscape height={map.height} plots={map.plots} />
                  {visible.map(({ application, x, y }) => (
                    <Link key={application.id} href={`/applications/${encodeURIComponent(application.id)}`} className={styles.plot} style={{ left: x - 130, top: y - 150 }} aria-label={`${application.company}, ${application.position}: ${statusLabels[application.status]}. Bewerbung öffnen`} title={`${application.company}: ${application.position}, ${statusLabels[application.status]}`}>
                      <PixelBuilding status={application.status} variant={application.id.split("").reduce((total, character) => total + character.charCodeAt(0), 0) % 3} />
                      <span className={styles.sign}><strong>{application.company}</strong><span className={styles.position}>{application.position}</span><span className={styles.status}>{statusLabels[application.status]}</span></span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
            <div className={styles.minimap} aria-hidden="true">
              <svg width="112" height="112" viewBox={`0 0 ${map.width} ${map.height}`} preserveAspectRatio="xMidYMid meet"><rect width={map.width} height={map.height} fill="#7da762" /><path d={`M150 0L180 180L110 360L180 540L140 ${map.height}`} stroke="#70bbc5" strokeWidth="100" fill="none" /><path d={`M550 100V${map.height - 60}`} stroke="#d6c794" strokeWidth="28" />{map.plots.map(({ application, x, y }) => <g key={application.id}><path d={`M120 ${y + 140}H1160`} stroke="#d6c794" strokeWidth="20" /><rect x={x - 40} y={y - 40} width="80" height="80" fill={buildingStages[application.status].color} stroke="#f6eed1" strokeWidth="8" /></g>)}</svg>
            </div>
            </div>
          </>
        )}
        <footer className={styles.legend}>
          {(Object.keys(buildingStages) as ApplicationStatus[]).map((status) => <span key={status}><svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true"><path d="M1 6H3V3H5V1H9V3H11V6H13V15H1Z" fill={buildingStages[status].color} /><path d="M6 11H8V15H6Z" fill="#f4f5ea" /></svg>{statusLabels[status]} <small>{buildingStages[status].label}</small></span>)}
        </footer>
      </section>
    </div>
  );
}

function Landscape({ height, plots }: { height: number; plots: ReturnType<typeof createApplicationMap>["plots"] }) {
  const rows = Math.max(1, Math.ceil(plots.length / 3));
  const river = `M140 -80 ${Array.from({ length: Math.ceil(height / 120) + 1 }, (_, index) => `V${index * 120}H${140 + [0, 24, 0, -24, 0, 32][index % 6]}`).join(" ")} V${height + 80}`;
  const forest = Array.from({ length: Math.ceil(height / 90) }, (_, row) => [24, 74, 1190, 1240].map((x, column) => ({ x: x + ((row * 17 + column * 7) % 24), y: 92 + row * 90 + (column % 2) * 28, pine: (row + column) % 3 === 0 }))).flat();
  return (
    <svg className={styles.landscape} width="1280" height={height} viewBox={`0 0 1280 ${height}`} aria-hidden="true" shapeRendering="crispEdges">
      <defs>
        <pattern id="map-grass" width="64" height="64" patternUnits="userSpaceOnUse"><rect width="64" height="64" fill="#83ad63" /><path d="M4 8H12V12H4ZM36 32H44V36H36ZM12 48H16V52H12ZM52 56H60V60H52" fill="#79a25a" /><path d="M20 20V14H24V22H28V18H32V24H20ZM48 46V40H52V46H56V42H60V48H48" fill="#a1c47b" /><path d="M44 10H48V14H44ZM4 34H8V38H4" fill="#6d9853" /></pattern>
        <pattern id="map-stone" width="24" height="16" patternUnits="userSpaceOnUse"><rect width="24" height="16" fill="#a99f88" /><path d="M1 1H11V7H1ZM13 1H23V7H13ZM5 9H17V15H5ZM19 9H24V15H19ZM0 9H3V15H0" fill="#d6ccb0" /><path d="M2 2H10M14 2H22M6 10H16" stroke="#e7dfc6" strokeWidth="2" /></pattern>
        <pattern id="map-water" width="64" height="48" patternUnits="userSpaceOnUse"><rect width="64" height="48" fill="#4c9fad" /><path d="M4 12H24V16H4ZM36 32H56V36H36" fill="#65b7bf" /><path d="M8 16H20V18H8ZM40 36H52V38H40" fill="#357c94" /></pattern>
      </defs>
      <rect width="1280" height={height} fill="url(#map-grass)" />
      <path d={`M0 0H1280V60H1120V84H960V64H820V92H670V72H480V92H320V68H0Z`} fill="#55794f" />
      <path d="M0 0H1280V40H1170V60H1120V40H960V48H910V32H820V64H760V48H670V40H570V64H510V48H480V60H350V40H320V44H0Z" fill="#81977e" />
      <path d="M270 0H360V16H398V40H360V28H324V36H292V20H270ZM860 0H960V20H990V32H936V24H898V36H864Z" fill="#bac5a6" />
      <path d={river} stroke="#648f51" strokeWidth="152" fill="none" />
      <path d={river} stroke="#c9bd83" strokeWidth="124" fill="none" />
      <path d={river} stroke="#33758c" strokeWidth="104" fill="none" />
      <path d={river} stroke="url(#map-water)" strokeWidth="88" fill="none" />
      {Array.from({ length: Math.ceil(height / 120) }, (_, index) => <g key={`water-${index}`} transform={`translate(${140 + [0, 24, 0, -24, 0, 32][index % 6]} ${index * 120 + 60})`}><path className={styles.water} d="M-28 0H-8V4H4M8 32H28M-20-28H-4" stroke="#9ed6cf" strokeWidth="3" fill="none" /><path d="M-60 28V12H-56V28M52-24V-40H56V-24" stroke="#476e46" strokeWidth="4" /></g>)}
      <PixelRoad path={`M550 98V${height - 60}`} />
      {Array.from({ length: rows }, (_, row) => {
        const street = 430 + row * 360;
        return <g key={row}>
          <PixelRoad path={`M62 ${street}H550V${street + 16}H860V${street}H1170`} />
          <g transform={`translate(52 ${street - 26})`}><rect x="0" y="6" width="204" height="48" fill="#594f3f" /><rect x="0" y="0" width="204" height="46" fill="#b99862" />{Array.from({ length: 17 }, (_, index) => <path key={index} d={`M${index * 12} 0V46`} stroke="#846d48" strokeWidth="3" />)}<path d="M0 4H204M0 42H204" stroke="#e0bc78" strokeWidth="4" />{[0, 48, 96, 144, 196].map((x) => <path key={x} d={`M${x} -8V12M${x} 34V56`} stroke="#635743" strokeWidth="6" />)}</g>
          <PixelLamp x={512} y={street - 18} /><PixelLamp x={884} y={street - 18} />
          <g transform={`translate(620 ${street + 8})`}><g className={styles.walker}><Worker x={0} y={-24} walking /></g></g>
          <PixelTree x={286} y={street + 78} pine={row % 2 === 0} /><PixelTree x={926} y={street + 86} />
          <g transform={`translate(1090 ${street + 88})`}><rect x="-28" y="-10" width="72" height="20" fill="#779259" /><path d="M-20 0H32V-8H24V-18H-12V-12H-20Z" fill="#929d88" /><path d="M-12-12H20V-18H-8Z" fill="#bcc3a4" /><rect x="8" y="-10" width="8" height="4" fill="#6f806c" /></g>
        </g>;
      })}
      {plots.map(({ application, x, y }, index) => <g key={application.id}><PixelRoad path={`M${x} ${430 + Math.floor(index / 3) * 360 + (index % 3 === 1 ? 16 : 0)}V${y + 28}`} narrow /><path d={`M${x - 112} ${y + 40}V${y + 70}H${x - 58}M${x + 58} ${y + 70}H${x + 110}V${y + 36}`} stroke="#5e754b" strokeWidth="6" fill="none" /><path d={`M${x - 112} ${y + 34}V${y + 60}H${x - 58}M${x + 58} ${y + 60}H${x + 110}V${y + 30}`} stroke="#c9b183" strokeWidth="4" fill="none" /><PixelTree x={x + 110} y={y - 28} pine={index % 3 === 2} /><g transform={`translate(${x - 100} ${y + 16})`}><rect x="-8" y="-12" width="16" height="16" fill="#50684b" /><path d="M-12-12H12V-20H8V-24H-8V-20H-12Z" fill="#acbd71" /><path d="M-8-20H-4V-16H-8M4-16H8V-12H4" stroke="#e1c761" strokeWidth="4" /></g></g>)}
      <g transform="translate(550 96)"><path d="M-64-22H64V-6H80V38H64V54H-64V38H-80V-6H-64Z" fill="#5d7755" /><path d="M-60-26H60V-10H76V34H60V50H-60V34H-76V-10H-60Z" fill="url(#map-stone)" /><path d="M-28-14H28V-6H40V22H28V30H-28V22H-40V-6H-28Z" fill="#687f80" /><path d="M-24-12H24V-4H34V16H24V24H-24V16H-34V-4H-24Z" fill="#78c2c8" /><path className={styles.water} d="M-20 4H-4M8 12H24" stroke="#cfebe0" strokeWidth="4" /><rect x="-6" y="-22" width="12" height="30" fill="#b9cbb9" /><rect x="-14" y="-26" width="28" height="8" fill="#e2e2c7" /></g>
      <PixelLamp x={462} y={130} /><PixelLamp x={638} y={130} />
      {forest.sort((first, second) => first.y - second.y).map(({ x, y, pine }, index) => <PixelTree key={`tree-${index}`} x={x} y={y} pine={pine} />)}
      {[320, 750, 840, 1060, 1130].map((x, index) => <PixelTree key={`top-${x}`} x={x} y={90 + (index % 2) * 16} pine={index % 2 === 0} />)}
      {Array.from({ length: rows + 1 }, (_, row) => <g key={`flowers-${row}`} transform={`translate(272 ${210 + row * 360})`}><path d="M0 0V12M14 16V28M-18 40V52M810-40V-28M832-24V-12" stroke="#577c49" strokeWidth="4" /><path d="M-4-4H4V4H-4M10 12H18V20H10M806-44H814V-36H806" fill="#f4d789" /><path d="M-22 36H-14V44H-22M828-28H836V-20H828" fill="#d9919b" /></g>)}
    </svg>
  );
}

function PixelRoad({ path, narrow = false }: { path: string; narrow?: boolean }) {
  return <g><path d={path} stroke="#668150" strokeWidth={narrow ? 28 : 52} fill="none" /><path d={path} stroke="#e2d4a6" strokeWidth={narrow ? 20 : 42} fill="none" /><path d={path} stroke="url(#map-stone)" strokeWidth={narrow ? 14 : 32} fill="none" /></g>;
}

function PixelTree({ x, y, pine = false }: { x: number; y: number; pine?: boolean }) {
  return <g transform={`translate(${x} ${y})`}><path d="M-28 26H28V32H40V40H24V44H-24V38H-36V30H-28Z" fill="#50734a" opacity=".5" /><rect x="-6" y="-2" width="12" height="36" fill="#69593e" /><rect x="-6" y="-2" width="4" height="36" fill="#a68b58" />{pine ? <><path d="M-4-64H4V-52H12V-40H20V-28H28V-12H36V4H28V16H-28V4H-36V-12H-28V-28H-20V-40H-12V-52H-4Z" fill="#315d4d" /><path d="M-4-64H4V-52H12V-40H4V-32H-8V-20H-16V-8H-28V4H-36V-12H-28V-28H-20V-40H-12V-52H-4Z" fill="#527d58" /><path d="M-12-32H4M-20-12H12M-24 8H16" stroke="#739662" strokeWidth="4" /></> : <><path d="M-16-52H16V-44H28V-36H36V-20H44V0H36V12H20V20H-20V12H-36V0H-44V-20H-36V-36H-28V-44H-16Z" fill="#376c4d" /><path d="M-16-52H16V-44H28V-36H32V-20H16V-8H-4V4H-36V-8H-44V-20H-36V-36H-28V-44H-16Z" fill="#598b56" /><path d="M-16-44H8V-36H20V-28H4V-20H-20V-12H-32V-28H-24V-36H-16Z" fill="#7ba363" /><path d="M-16-36H0M-28-20H-16M8-8H20M-8 8H4" stroke="#94b774" strokeWidth="4" /></>}</g>;
}

function PixelLamp({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`}><rect x="-12" y="8" width="30" height="6" fill="#6d8655" /><path d="M-4 10V-36H8" stroke="#475950" strokeWidth="5" /><rect x="-8" y="8" width="12" height="4" fill="#798674" /><path d="M2-40H18V-24H2Z" fill="#42564e" /><rect className={styles.lamplight} x="6" y="-36" width="8" height="8" fill="#f6db8c" /><path d="M0-40H20" stroke="#d2c296" strokeWidth="4" /></g>;
}

function PixelBuilding({ status, variant }: { status: ApplicationStatus; variant: number }) {
  const stage = buildingStages[status];
  const closed = status === "rejected" || status === "withdrawn";
  const top = 140 - stage.floors * 28;
  const roof = closed ? "#69756c" : status === "offer" ? "#41716a" : ["#a96455", "#526e94", "#7a6b87"][variant];
  return (
    <svg width="240" height="200" viewBox="0 0 240 200" aria-hidden="true" shapeRendering="crispEdges" className={styles.building}>
      <path d="M44 156H184V168H216V184H188V192H64V184H32V172H44Z" fill="#506f4c" opacity=".5" />
      <path d="M44 152L160 132L208 160L88 188Z" fill="#64745c" /><path d="M44 148L160 128L208 156L88 184Z" fill="#bbbc9e" />
      <path d="M80 176H172V180H80M104 164H192V168H104M56 156H144V160H56" stroke="#d8d3b0" strokeWidth="3" />
      {stage.floors > 0 && <>
        <path d={`M62 ${top}H158V160H62Z`} fill={closed ? "#a2a48a" : "#e3d4ac"} />
        <path d={`M158 ${top}L190 ${top - 16}V144L158 160Z`} fill={closed ? "#788570" : "#b5b392"} />
        <path d={`M62 ${top}H158V${top + 6}H62ZM62 152H158V160H62Z`} fill={stage.color} />
        <path d={`M62 ${top + 6}V152M154 ${top + 6}V152`} stroke={stage.color} strokeWidth="6" />
        {Array.from({ length: stage.floors }, (_, floor) => <g key={floor}><path d={`M62 ${top + 26 + floor * 28}H158L190 ${top + 10 + floor * 28}`} stroke={stage.color} strokeWidth="4" />{[74, 122].map((x) => <g key={x}><rect x={x - 3} y={top + 9 + floor * 28} width="24" height="20" fill="#706d5a" /><rect className={styles.windowlight} x={x} y={top + 11 + floor * 28} width="18" height="15" fill={closed ? "#626f6b" : "#abd3cf"} /><path d={`M${x + 8} ${top + 11 + floor * 28}V${top + 26 + floor * 28}M${x} ${top + 18 + floor * 28}H${x + 18}`} stroke="#f4e3ba" strokeWidth="2" />{closed && <path d={`M${x - 2} ${top + 11 + floor * 28}l22 14`} stroke="#9e815b" strokeWidth="5" />}<path d={`M${x - 4} ${top + 30 + floor * 28}H${x + 22}`} stroke="#917757" strokeWidth="3" /></g>)}<path d={`M168 ${top + 10 + floor * 28}L182 ${top + 4 + floor * 28}V${top + 18 + floor * 28}L168 ${top + 24 + floor * 28}Z`} fill={closed ? "#586b63" : "#7caaa9"} /></g>)}
        {!stage.workers && <>
          <path d={`M50 ${top + 2}L98 ${top - 44}L144 ${top - 58}L202 ${top - 12}L160 ${top + 10}Z`} fill="#3c514d" />
          <path d={`M54 ${top - 2}L98 ${top - 44}L144 ${top - 58}L188 ${top - 18}L158 ${top + 4}Z`} fill={roof} />
          <path d={`M98 ${top - 44}L144 ${top - 58}L188 ${top - 18}L158 ${top + 4}Z`} fill="#314d58" opacity=".3" />
          {Array.from({ length: 5 }, (_, line) => <path key={line} d={`M${62 + line * 8} ${top - 8 - line * 8}L${158 - line * 12} ${top - 2 - line * 8}L${192 - line * 9} ${top - 18 - line * 8}`} stroke="#edcc9c" strokeWidth="2" opacity=".35" />)}
          <path d={`M98 ${top - 46}L144 ${top - 60}`} stroke="#e4c297" strokeWidth="4" />
          <path d={`M160 ${top - 36}V${top - 62}H176V${top - 28}Z`} fill="#967c68" /><path d={`M160 ${top - 64}H178V${top - 58}H160Z`} fill="#d7c39b" />
          {!closed && <g transform={`translate(168 ${top - 72})`}><g className={styles.smoke}><rect x="-4" y="-4" width="8" height="8" fill="#e4e4cd" opacity=".75" /><rect x="0" y="-16" width="12" height="8" fill="#e4e4cd" opacity=".5" /></g></g>}
        </>}
        <path d="M98 130H120V166H98Z" fill="#4c645d" /><path d="M102 134H116V164H102Z" fill={closed ? "#6e7464" : "#805e46"} /><rect x="112" y="150" width="3" height="3" fill="#efcd80" /><path d="M94 166H124V171H94M90 172H128V177H90" stroke="#e1d4ae" strokeWidth="4" />
        {status === "applied" && <path d="M72 129H148V136H72ZM72 136H82V140H72ZM92 136H102V140H92ZM112 136H122V140H112ZM132 136H148V140H132Z" fill={roof} />}
      </>}
      {stage.workers && <>
        <path d="M58 156V90H160V156M58 118H160M58 144H160M86 90V156M136 90V156M160 90L192 74V140" stroke="#795f43" strokeWidth="5" fill="none" />
        <path d="M58 94H160M58 122H160M160 94L192 78" stroke="#d7bb7b" strokeWidth="3" />
        <path d="M24 170V30H178M24 50L42 30M24 74L42 52L24 30M24 118L42 96L24 74M24 162L42 140L24 118" stroke="#e0bc59" strokeWidth="5" fill="none" />
        <path d="M20 30H178V36H20Z" fill="#b08b40" /><path className={styles.crane} d="M170 36V66H164V74H176V66" stroke="#536361" strokeWidth="3" fill="none" />
        <path d="M34 170H52L44 150H38Z" fill="#df9d57" /><path d="M36 164H48" stroke="#f5e3bd" strokeWidth="4" />
        <rect x="164" y="148" width="32" height="12" fill="#b97e58" /><path d="M174 148V160M184 148V160M164 154H196" stroke="#795c43" strokeWidth="2" />
        <path d="M74 156L128 146M76 162L132 152" stroke="#c4a472" strokeWidth="5" /><rect x="192" y="156" width="20" height="18" fill="#957848" /><path d="M192 156L212 174M212 156L192 174" stroke="#d6b67c" strokeWidth="3" />
        <Worker x={56} y={148} /><Worker x={164} y={100} second />
      </>}
      {status === "offer" && <g><path d="M106 0V40" stroke="#e9e6d1" strokeWidth="4" /><path className={styles.flag} d="M108 0H138V18H128V14H108Z" fill="#ebc655" /><path d="M174 154H200V172H174Z" fill="#55794e" /><path d="M170 148H178V142H184V148H194V142H200V148H206V154H170Z" fill="#efc76f" /><path d="M78 156H88M138 156H148" stroke="#e6ba68" strokeWidth="6" /></g>}
      {status === "rejected" && <path d="M102 142L116 158M116 142L102 158" stroke="#bd7475" strokeWidth="4" />}
      {status === "withdrawn" && <path d="M54 176V156M48 160L54 168L62 156M180 178V160M174 164L180 172L188 158M136 170V154M130 158L136 164L140 158" stroke="#587947" strokeWidth="4" fill="none" />}
      {!stage.workers && !closed && <Worker x={184} y={152} walking />}
    </svg>
  );
}

function Worker({ x, y, second = false, walking = false }: { x: number; y: number; second?: boolean; walking?: boolean }) {
  return <g transform={`translate(${x} ${y})`}><path d="M-10 28H12V32H-10Z" fill="#4e6a4b" opacity=".6" /><g className={walking ? styles.resident : second ? styles.workerSecond : styles.worker}><path d="M-4 20V30M4 20V30" stroke="#3f566c" strokeWidth="5" /><rect x="-7" y="8" width="14" height="14" fill={walking ? "#b27882" : "#e4a14b"} /><rect x="-4" y="0" width="8" height="8" fill="#efc4a0" /><path d="M-7 0H7V-4H4V-8H-4V-4H-7Z" fill={walking ? "#655442" : "#f5d66c"} /><path d={walking ? "M-8 10L-10 18M8 10L10 18" : "M-8 10L-12 18M8 10L16 4"} stroke="#efc4a0" strokeWidth="4" />{!walking && <path d="M16 8V-2M12-2H20" stroke="#59636d" strokeWidth="3" />}</g></g>;
}