"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ChevronDown, ChevronUp, LocateFixed, Minus, Moon, Plus, RefreshCw, SlidersHorizontal, Sun, X } from "lucide-react";
import { nextSheetSnap, sheetMaxHeight, viewportInsets } from "@/lib/map-layout";
import { useStoredFlag, useStoredValue } from "./use-stored-flag";
import type { CameraControls } from "./use-camera-controls";
import styles from "@/app/map/fullscreen.module.css";

/*
 * Fullscreen map layout primitives. See docs/map-layout-v2.md.
 *   <MapFullscreen map={...}>          stage = exactly the space the shell gives us; no scroll
 *     <MapTopBar left right />         chips (+ their expanding panels) and the points/shop group
 *     <MapControls />                  zoom / reset / recenter / night / refresh on the right edge
 *     <MapDock>                        bottom column above the navbar: notices, placement tools, sheets
 *       <MapSheet />                   bottom sheet on phones, side card from 768px
 */

/** Keeps CSS vars on the stage in sync with the visual viewport (iOS keyboard / pan) without re-rendering React. */
function useViewportVars() {
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const vv = window.visualViewport;
    let frame = 0;
    function update() {
      frame = 0;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const visual = vv ? { height: vv.height, offsetTop: vv.offsetTop } : { height: window.innerHeight, offsetTop: 0 };
      const insets = viewportInsets(rect, visual);
      const visible = Math.max(0, Math.round(Math.min(rect.bottom, visual.offsetTop + visual.height) - Math.max(rect.top, visual.offsetTop)));
      element.style.setProperty("--fs-lift-top", `${insets.top}px`);
      element.style.setProperty("--fs-lift-bottom", `${insets.bottom}px`);
      element.style.setProperty("--fs-vh", `${visible}px`);
      element.style.setProperty("--sheet-max", `${sheetMaxHeight(visible, rect.height)}px`);
      element.dataset.keyboard = insets.bottom > 0 ? "open" : "closed";
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      observer.disconnect();
    };
  }, []);
  return stage;
}

export function MapFullscreen({ label, busy, map, children }: { label: string; busy?: boolean; map: ReactNode; children?: ReactNode }) {
  const stage = useViewportVars();
  return (
    <div
      ref={stage}
      className={styles.stage}
      data-map-fullscreen=""
      // A focused input must never end up behind the keyboard: scroll it inside its own panel (never the stage itself).
      onFocusCapture={(event) => {
        const target = event.target as HTMLElement;
        if (!/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
        window.setTimeout(() => target.scrollIntoView({ block: "nearest", inline: "nearest" }), 180);
      }}
      onScroll={(event) => { event.currentTarget.scrollTop = 0; event.currentTarget.scrollLeft = 0; }}
    >
      <section className={styles.mapLayer} aria-label={label} aria-busy={busy}>{map}</section>
      <div className={styles.overlays}>{children}</div>
    </div>
  );
}

/* ---------- top bar with chips ---------- */

const PanelContext = createContext<{ open: string; toggle: (id: string) => void; close: () => void } | null>(null);

/** Top overlay row. Only ONE chip panel is open at a time; the choice is remembered (localStorage). */
export function MapTopBar({ left, right }: { left: ReactNode; right?: ReactNode }) {
  const [stored, setStored] = useStoredValue("top-panel");
  const open = stored ?? "none";
  const toggle = useCallback((id: string) => setStored(open === id ? "none" : id), [open, setStored]);
  const close = useCallback(() => setStored("none"), [setStored]);
  // Esc closes an open chip panel from anywhere in the stage (sheets handle their own Esc and run later on the same key press only if no panel was open).
  useEffect(() => {
    if (open === "none") return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && (active.closest("dialog") || (!active.closest("[data-map-fullscreen]") && active !== document.body))) return;
      event.preventDefault();
      close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);
  return (
    <PanelContext.Provider value={{ open, toggle, close }}>
      <div className={styles.top}>
        <div className={styles.topLeft}>{left}</div>
        {right && <div className={styles.topRight}>{right}</div>}
      </div>
    </PanelContext.Provider>
  );
}

/** Compact glass chip that expands to a panel under the top bar. Collapsed by default; collapses to an icon on very narrow screens. */
export function MapChip({ id, icon, label, meta, panelLabel, children, iconOnlyNarrow = true }: { id: string; icon: ReactNode; label: string; meta?: ReactNode; panelLabel: string; children: ReactNode; iconOnlyNarrow?: boolean }) {
  const context = useContext(PanelContext);
  const panelId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const open = context?.open === id;
  return (
    <div className={styles.chipWrap}>
      <button ref={button} type="button" className={`${styles.chip} ${styles.glass}`} data-open={open} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => context?.toggle(id)}>
        <span className={styles.chipIcon} aria-hidden>{icon}</span>
        <span className={iconOnlyNarrow ? styles.chipLabel : undefined}>{label}</span>
        {meta !== undefined && <span className={styles.chipMeta}>{meta}</span>}
        <ChevronDown size={14} aria-hidden className={styles.chev} />
      </button>
      {open && (
        <div id={panelId} role="group" aria-label={panelLabel} className={`${styles.panel} ${styles.glass}`} onKeyDown={(event: ReactKeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); context?.close(); button.current?.focus(); } }}>
          {children}
        </div>
      )}
    </div>
  );
}

/** Static (non-expanding) glass chip, e.g. points balance or the "Nur ansehen" badge. */
export function MapBadge({ children, label, className = "" }: { children: ReactNode; label?: string; className?: string }) {
  return <div className={`${styles.badge} ${styles.glass} ${className}`} role={label ? "group" : undefined} aria-label={label}>{children}</div>;
}

/** Round 44px glass icon button / link wrapper class names for pages that need their own buttons in the overlays. */
export const overlayClasses = { iconButton: `${styles.iconButton} ${styles.glass}`, glass: styles.glass, chipLabel: styles.chipLabel, hideNarrow: styles.hideNarrow };

/* ---------- right-hand controls ---------- */

export function MapControls({ camera, night, onToggleNight, onRefresh, refreshing }: { camera: CameraControls; night: boolean; onToggleNight: () => void; onRefresh?: () => void; refreshing?: boolean }) {
  const [collapsed, setCollapsed] = useStoredFlag("controls.collapsed", false);
  const bodyId = useId();
  return (
    <div className={styles.controls} role="group" aria-label="Kartensteuerung">
      <button type="button" className={`${styles.iconButton} ${styles.glass}`} aria-expanded={!collapsed} aria-controls={bodyId} aria-label={collapsed ? "Kartensteuerung einblenden" : "Kartensteuerung ausblenden"} title={collapsed ? "Kartensteuerung einblenden" : "Kartensteuerung ausblenden"} onClick={() => setCollapsed(!collapsed)}>
        <SlidersHorizontal size={18} aria-hidden />
      </button>
      <div id={bodyId} className={`${styles.controlsBody} ${styles.glass}`} hidden={collapsed}>
        <button type="button" title="Vergrössern" aria-label="Vergrössern" onClick={camera.zoomIn} disabled={!camera.canZoomIn}><Plus size={18} aria-hidden /></button>
        <button type="button" title="Zoom zurücksetzen" aria-label={`Zoom zurücksetzen, aktuell ${Math.round(camera.zoom * 100)} Prozent`} onClick={camera.reset} className={styles.zoomValue}>{Math.round(camera.zoom * 100)}%</button>
        <button type="button" title="Verkleinern" aria-label="Verkleinern" onClick={camera.zoomOut} disabled={!camera.canZoomOut}><Minus size={18} aria-hidden /></button>
        <button type="button" title="Kamera zentrieren" aria-label="Kamera zentrieren" onClick={camera.recenter}><LocateFixed size={18} aria-hidden /></button>
        <button type="button" title={night ? "Tagansicht" : "Nachtansicht"} aria-label={night ? "Tagansicht" : "Nachtansicht"} aria-pressed={night} onClick={onToggleNight}>{night ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}</button>
        {onRefresh && <button type="button" title="Aktualisieren" aria-label="Aktualisieren" disabled={refreshing} onClick={onRefresh}><RefreshCw size={18} aria-hidden /></button>}
      </div>
    </div>
  );
}

/* ---------- bottom dock + sheet ---------- */

/** Bottom column above the navbar (children stack upwards; first child is closest to the navbar). */
export function MapDock({ children }: { children?: ReactNode }) {
  return <div className={styles.dock}>{children}</div>;
}

/**
 * Non-modal sheet: bottom sheet with drag handle on phones (max ~45dvh), side card from 768px.
 * Collapsible (state remembered per id), Esc closes, focus moves into the sheet and returns to the opener on close.
 */
export function MapSheet({ id, open, onClose, title, subtitle, icon, children, closeDisabled = false, tall = false }: { id: string; open: boolean; onClose: () => void; title: string; subtitle?: string; icon?: ReactNode; children: ReactNode; closeDisabled?: boolean; tall?: boolean }) {
  const [collapsed, setCollapsed] = useStoredFlag(`sheet.${id}.collapsed`, false);
  const titleId = useId();
  const bodyId = useId();
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const closeRef = useRef({ onClose, disabled: closeDisabled });
  const drag = useRef<{ y: number; t: number; pointer: number } | null>(null);
  const [dragY, setDragY] = useState(0);

  useEffect(() => { closeRef.current = { onClose, disabled: closeDisabled }; });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    heading.current?.focus({ preventScroll: true });
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented || closeRef.current.disabled) return;
      const active = document.activeElement;
      const inside = !active || active === document.body || root.current?.contains(active) || Boolean(active.closest("[data-map-fullscreen]"));
      if (inside && !(active instanceof HTMLElement && active.closest("dialog"))) { event.preventDefault(); closeRef.current.onClose(); }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && opener !== document.body && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  function down(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    drag.current = { y: event.clientY, t: event.timeStamp, pointer: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointer !== event.pointerId) return;
    setDragY(Math.max(-24, Math.min(160, event.clientY - drag.current.y)));
  }
  function up(event: ReactPointerEvent<HTMLDivElement>) {
    const start = drag.current;
    drag.current = null;
    setDragY(0);
    if (!start || start.pointer !== event.pointerId) return;
    const dy = event.clientY - start.y;
    const result = nextSheetSnap(collapsed ? "collapsed" : "expanded", dy, dy / Math.max(1, event.timeStamp - start.t));
    if (result === "close") { if (!closeDisabled) onClose(); }
    else setCollapsed(result === "collapsed");
  }

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-sheet={id}
      data-collapsed={collapsed}
      data-tall={tall}
      className={`${styles.sheet} ${styles.glass}`}
      style={dragY ? ({ transform: `translateY(${Math.max(0, dragY)}px)`, transition: "none" } as CSSProperties) : undefined}
    >
      <div className={styles.sheetHead} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; setDragY(0); }}>
        <span className={styles.grip} aria-hidden />
        <div className={styles.sheetTitleRow}>
          {icon && <span className={styles.sheetIcon} aria-hidden>{icon}</span>}
          <div className={styles.sheetTitleText}>
            <h2 id={titleId} ref={heading} tabIndex={-1}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className={styles.sheetButton} aria-expanded={!collapsed} aria-controls={bodyId} aria-label={collapsed ? `${title} ausklappen` : `${title} einklappen`} title={collapsed ? "Ausklappen" : "Einklappen"} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}</button>
          <button type="button" className={styles.sheetButton} aria-label={`${title} schliessen`} title="Schliessen (Esc)" disabled={closeDisabled} onClick={onClose}><X size={18} aria-hidden /></button>
        </div>
      </div>
      <div id={bodyId} className={styles.sheetBody} hidden={collapsed}>{children}</div>
    </div>
  );
}
