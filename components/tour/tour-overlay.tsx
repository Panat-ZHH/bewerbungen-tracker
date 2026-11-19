"use client";

// The spotlight tour itself (SPEC-FLOW §6.1). Loaded lazily by tour-launcher.tsx only when a tour will run (0 KB otherwise).
// Overlay: transparent click-catcher + a cut-out box whose huge box-shadow dims the rest; the target is not clickable.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { PLANS } from "@/lib/billing/plans";
import {
  canStart, candidateSteps, cutoutRect, dropStep, FIRST_ANCHOR_WAIT, keyAction, placeCard, planSteps, START_DELAY, STEP_ANCHOR_WAIT,
  type PlannedStep, type Rect, type TourContext, type TourId, type Viewport,
} from "./tour-core";
import { TourCard } from "./tour-card";

export type TourEnd = "finish" | "skip" | "abort";

const TOUR_CSS = `
.wa-tour-root { position: fixed; inset: 0; z-index: 130; }
.wa-tour-catch { position: absolute; inset: 0; }
.wa-tour-cut { position: fixed; border-radius: 16px; pointer-events: none;
  box-shadow: 0 0 0 3px var(--sun), 0 0 0 200vmax var(--wa-tour-dim); }
.wa-tour-cut[data-empty] { box-shadow: 0 0 0 200vmax var(--wa-tour-dim); width: 0; height: 0; top: 50%; left: 50%; }
.wa-tour-root { --wa-tour-dim: rgb(22 20 15 / .55); }
[data-theme="dark"] .wa-tour-root { --wa-tour-dim: rgb(0 0 0 / .6); }
.wa-tour-card { z-index: 1; border-radius: 16px; max-width: calc(100vw - 32px); }
.wa-tour-arrow { position: absolute; width: 16px; height: 16px; background: var(--surface); transform: rotate(45deg); }
.wa-tour-arrow-up { top: -9px; border-left: var(--border-w) solid var(--outline); border-top: var(--border-w) solid var(--outline); }
.wa-tour-arrow-down { bottom: -9px; border-right: var(--border-w) solid var(--outline); border-bottom: var(--border-w) solid var(--outline); }
.wa-tour-arrow-left { left: -9px; border-left: var(--border-w) solid var(--outline); border-bottom: var(--border-w) solid var(--outline); }
.wa-tour-arrow-right { right: -9px; border-right: var(--border-w) solid var(--outline); border-top: var(--border-w) solid var(--outline); }
@media (prefers-reduced-motion: no-preference) {
  .wa-tour-cut[data-morph] { transition: top 220ms cubic-bezier(.2,.7,.2,1), left 220ms cubic-bezier(.2,.7,.2,1), width 220ms cubic-bezier(.2,.7,.2,1), height 220ms cubic-bezier(.2,.7,.2,1); }
  .wa-tour-rise { animation: wa-tour-rise 180ms cubic-bezier(.2,.7,.2,1) both; }
}
@keyframes wa-tour-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
html[data-tour-active] [data-testid="install-hint"] { display: none !important; }
`;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The visible instance of `[data-tour=name]` (nav items exist twice: desktop top bar + mobile bottom bar). */
export function findAnchor(name: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  if (!/^[a-z0-9-]+$/.test(name)) return null; // our own constant names only (SPEC-FLOW §6.2)
  const list = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`);
  for (const el of list) {
    if (el.closest("[data-tour-card]")) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const visible = typeof el.checkVisibility === "function" ? el.checkVisibility({ visibilityProperty: true, opacityProperty: true }) : el.offsetParent !== null || getComputedStyle(el).position === "fixed";
    if (!visible) continue;
    return el;
  }
  return null;
}

async function waitFor(check: () => boolean, ms: number, alive: () => boolean): Promise<boolean> {
  const until = Date.now() + ms;
  while (alive()) {
    if (check()) return true;
    if (Date.now() >= until) return false;
    await sleep(100);
  }
  return false;
}

/** Profile values the texts use. Help wishes only count for funnel accounts (older accounts: unknown → conditional steps shown). */
async function loadContext(userId: string): Promise<TourContext> {
  const ctx: TourContext = { planName: PLANS.family.name };
  try {
    const { data, error } = await supabase.from("profiles").select("weekly_goal,help_wishes,funnel_completed_at").eq("user_id", userId).maybeSingle();
    const row = data as { weekly_goal?: number | null; help_wishes?: string[] | null; funnel_completed_at?: string | null } | null;
    if (!error && row) {
      ctx.weeklyGoal = row.weekly_goal ?? null;
      if (row.funnel_completed_at && Array.isArray(row.help_wishes)) ctx.helpWishes = row.help_wishes;
    }
  } catch { /* columns missing / offline: neutral texts */ }
  return ctx;
}

/** Live goal shown on the page (the widget may differ from the DB value, e.g. changed a second ago). */
function goalFromPage(): number | null {
  const v = Number(findAnchor("schueler-weekly-goal")?.dataset.tourValue);
  return Number.isInteger(v) && v >= 1 && v <= 20 ? v : null;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setReduced(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);
  return reduced;
}

function viewport(): Viewport {
  const width = window.innerWidth;
  const height = window.visualViewport?.height ?? window.innerHeight;
  const header = document.querySelector<HTMLElement>(".app-bar-top");
  const hr = header?.getBoundingClientRect();
  const topInset = hr && hr.height > 0 && getComputedStyle(header!).visibility !== "hidden" ? Math.max(0, hr.bottom) : 0;
  const nav = document.querySelector<HTMLElement>(".bottom-nav");
  const nr = nav?.getBoundingClientRect();
  const navVisible = !!nav && !!nr && nr.height > 0 && getComputedStyle(nav).visibility !== "hidden" && nr.top < height;
  return { width, height, topInset, bottomInset: navVisible ? Math.max(0, height - nr!.top) : 0 };
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function TourOverlay({ tour, userId, onEnd }: { tour: TourId; userId: string; onEnd: (how: TourEnd, step: number) => void }) {
  const [steps, setSteps] = useState<PlannedStep[] | null>(null);
  const [index, setIndex] = useState(0);
  // The element of step `i` (kept while the next step is located, so the cut-out morphs instead of flashing).
  const [found, setFound] = useState<{ el: HTMLElement; i: number } | null>(null);
  const target = found?.el ?? null;
  const [rect, setRect] = useState<Rect | null>(null);
  const [vp, setVp] = useState<Viewport | null>(null);
  const [cardSize, setCardSize] = useState<{ width: number; height: number } | null>(null);
  const [morph, setMorph] = useState(false);
  const reduced = usePrefersReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const onEndRef = useRef(onEnd);
  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);
  const ended = useRef(false);
  const uid = useId().replace(/:/g, "");
  const titleId = `wa-tour-title-${uid}`;
  const textId = `wa-tour-text-${uid}`;

  const end = useCallback((how: TourEnd, step: number) => {
    if (ended.current) return;
    ended.current = true;
    onEndRef.current(how, step);
  }, []);

  // 1. Plan once: wait for the first anchor (main data loaded), let the page settle, then keep only the steps that exist.
  useEffect(() => {
    let alive = true;
    const isAlive = () => alive;
    (async () => {
      const ctx = await loadContext(userId);
      const first = candidateSteps(tour, ctx)[0];
      if (first) await waitFor(() => first.options.some((o) => !!findAnchor(o.anchor)), FIRST_ANCHOR_WAIT, isAlive);
      await sleep(START_DELAY);
      if (!alive) return;
      const planned = planSteps(tour, { ...ctx, weeklyGoal: goalFromPage() ?? ctx.weeklyGoal }, (a) => !!findAnchor(a));
      if (!canStart(planned)) { end("abort", 0); return; }
      setSteps(planned);
    })().catch(() => { if (alive) end("abort", 0); });
    return () => { alive = false; };
  }, [tour, userId, end]);

  // Remember / restore focus, mark the document (hides the PWA install hint), swallow page scroll keys nothing else.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    document.documentElement.dataset.tourActive = "";
    return () => {
      delete document.documentElement.dataset.tourActive;
      if (previous && document.contains(previous)) previous.focus?.({ preventScroll: true });
    };
  }, []);

  // 2. Show the current step: find its element (it may have vanished → wait 1.5 s → drop and recount), scroll it into view.
  useEffect(() => {
    if (!steps) return;
    const step = steps[index];
    if (!step) return;
    let alive = true;
    const isAlive = () => alive;
    const locate = () => findAnchor(step.anchor) ?? step.candidates.map(findAnchor).find(Boolean) ?? null;
    (async () => {
      let el = locate();
      if (!el) {
        await waitFor(() => !!locate(), STEP_ANCHOR_WAIT, isAlive);
        if (!alive) return;
        el = locate();
      }
      if (!el) {
        const next = dropStep(steps, index);
        if (next.steps.length === 0) { end("abort", index); return; }
        setSteps(next.steps); setIndex(next.index);
        return;
      }
      const inBar = !!el.closest(".app-bar, .bottom-nav");
      if (!inBar) el.scrollIntoView({ block: "center", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
      setFound({ el, i: index });
    })();
    return () => { alive = false; };
  }, [steps, index, reduced, end]);

  // The highlighted element is described by the card text while it is active.
  useEffect(() => {
    if (!target) return;
    const before = target.getAttribute("aria-describedby");
    target.setAttribute("aria-describedby", before ? `${before} ${textId}` : textId);
    return () => { if (before === null) target.removeAttribute("aria-describedby"); else target.setAttribute("aria-describedby", before); };
  }, [target, textId]);

  // 3. Measure (rAF-throttled) on scroll, resize, orientation, visual viewport and size changes of the target.
  useEffect(() => {
    if (!target) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (!target.isConnected) { setRect(null); return; }
      const r = target.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      setVp(viewport());
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    // Smooth scroll: keep following until it settles.
    const settle = window.setInterval(schedule, 50);
    const stopSettle = window.setTimeout(() => window.clearInterval(settle), 700);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    ro?.observe(target);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.clearInterval(settle); window.clearTimeout(stopSettle);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      ro?.disconnect();
    };
  }, [target]);

  // Card size for the placement (re-measured whenever the content or the width changes).
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const r = card.getBoundingClientRect();
    setCardSize((s) => (s && Math.abs(s.width - r.width) < 1 && Math.abs(s.height - r.height) < 1 ? s : { width: r.width, height: r.height }));
  });

  const cut = rect && vp ? cutoutRect(rect, vp) : null;
  const nav = !!target?.closest(".bottom-nav");
  const placement = cut && vp && cardSize ? placeCard(cut, cardSize, vp, { nav }) : null;

  // Focus to the title on every step once the card is visible (screen readers read «Schritt 3 von 6. Titel», then the text).
  const shown = !!steps && found?.i === index && !!placement;
  useEffect(() => {
    if (!shown) return;
    titleRef.current?.focus({ preventScroll: true });
    // After the first step is placed, later steps morph the cut-out (off with reduced motion).
    const t = window.setTimeout(() => setMorph(true), 50);
    return () => window.clearTimeout(t);
  }, [shown, index]);

  const total = steps?.length ?? 0;
  const go = useCallback((delta: number) => {
    setIndex((i) => Math.min(Math.max(0, i + delta), Math.max(0, total - 1)));
  }, [total]);
  const next = useCallback(() => { if (index >= total - 1) end("finish", index); else go(1); }, [index, total, end, go]);
  const back = useCallback(() => go(-1), [go]);
  const skip = useCallback(() => end("skip", index), [end, index]);

  // Keyboard: → / ← / Esc anywhere (focus is in the card), Tab cycles inside the card.
  useEffect(() => {
    if (!steps) return;
    function onKey(event: KeyboardEvent) {
      const action = keyAction(event.key, index, total);
      if (action) {
        event.preventDefault(); event.stopPropagation();
        if (action === "skip") skip(); else if (action === "back") back(); else next();
        return;
      }
      if (event.key !== "Tab") return;
      const card = cardRef.current;
      if (!card) return;
      const items = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      const inside = card.contains(document.activeElement);
      if (!inside) { event.preventDefault(); first.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [steps, index, total, next, back, skip]);

  // A focus that escapes the card (e.g. a click into the page is impossible, but a script may move it) comes back.
  useEffect(() => {
    if (!steps) return;
    const onFocus = (e: FocusEvent) => {
      const card = cardRef.current;
      if (card && e.target instanceof Node && !card.contains(e.target) && !(e.target as HTMLElement).closest?.("[data-sonner-toaster], [data-toaster]")) titleRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, [steps]);

  if (typeof document === "undefined" || !steps) return null; // nothing on screen while preparing
  const step = steps[index];
  const current = found?.i === index;

  return createPortal(
    <div className="wa-tour-root" data-testid="tour-overlay" data-tour-id={tour} data-tour-step={step?.id ?? ""}>
      <style>{TOUR_CSS}</style>
      {/* Clicks on the dimmed page do nothing (no accidental skip, the tour explains – it doesn't drive). */}
      <div className="wa-tour-catch" aria-hidden onPointerDown={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()} />
      {cut && target ? (
        <div aria-hidden className="wa-tour-cut" data-morph={morph && !reduced ? "" : undefined} data-testid="tour-cutout" style={{ top: cut.top, left: cut.left, width: cut.width, height: cut.height }} />
      ) : (
        <div aria-hidden className="wa-tour-cut" data-empty="" />
      )}
      {step && (
        <TourCard
          ref={cardRef}
          index={index}
          total={total}
          title={step.title}
          text={step.text}
          titleId={titleId}
          textId={textId}
          placement={current ? placement : null}
          animate={!reduced}
          titleRef={titleRef}
          onBack={back}
          onNext={next}
          onSkip={skip}
          key={`${step.id}-${index}`}
        />
      )}
    </div>,
    document.body,
  );
}
