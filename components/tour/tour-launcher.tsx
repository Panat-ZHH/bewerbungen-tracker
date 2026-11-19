"use client";

// Always-loaded part of the product tour (tiny): decides IF a tour runs and only then loads the overlay (next/dynamic, no SSR).
// Mounted once in the workspace shell, which knows role, gate and user (SPEC-FLOW §6.1 start rules).
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import {
  endState, FUNNEL_KEY, hasTourParam, MANUAL_KEY, SESSION_DONE_KEY, startDecision, stripTourParam, TOUR_START_PATH, tourFor, type TourId,
} from "./tour-core";
import { retryPendingTourSaves, saveTourState, shouldAutoStart } from "./tour-state";
import type { TourEnd } from "./tour-overlay";

const TourOverlay = dynamic(() => import("./tour-overlay"), { ssr: false });

const session = {
  get(key: string) { try { return sessionStorage.getItem(key); } catch { return null; } },
  set(key: string, v: string) { try { sessionStorage.setItem(key, v); } catch { /* storage blocked */ } },
  del(key: string) { try { sessionStorage.removeItem(key); } catch { /* storage blocked */ } },
};
const doneTours = () => (session.get(SESSION_DONE_KEY) ?? "").split(",").filter(Boolean);
function funnelPending() { try { return localStorage.getItem(FUNNEL_KEY) !== null; } catch { return false; } }
/** Another dialog (Mehr sheet, confirm modal, name prompt …) is open: wait until it is closed. */
function modalOpen() {
  return !!document.querySelector('[role="dialog"][aria-modal="true"]:not([data-tour-card])') || document.body.classList.contains("sheet-open");
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** A save that failed on this device earlier is retried once per tab and user (lib/tour/state local fallback). */
let retriedFor: string | null = null;

export interface TourLauncherProps {
  role: "student" | "teacher";
  parent: boolean;
  schoolAdmin: boolean;
  /** accessView() of the shell: "page" = real content, anything else = paywall / licence gate / blocked page. */
  gate: string;
  userId: string;
}

export function TourLauncher({ role, parent, schoolAdmin, gate, userId }: TourLauncherProps) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const tour: TourId = tourFor({ role, parent, schoolAdmin });
  const start = TOUR_START_PATH[tour];
  const [run, setRun] = useState<{ mode: "manual" | "auto" } | null>(null);

  useEffect(() => {
    if (retriedFor === userId) return;
    retriedFor = userId;
    void retryPendingTourSaves(userId).catch(() => undefined);
  }, [userId]);

  // ?tour=1 on any app page = «Tour wiederholen»: remember it for this tab, drop it from the URL, go to the role's start page.
  useEffect(() => {
    if (!hasTourParam(window.location.search)) return;
    session.set(MANUAL_KEY, "1");
    const clean = pathname + stripTourParam(window.location.search) + window.location.hash;
    if (pathname === start) window.history.replaceState(window.history.state, "", clean);
    else router.replace(start);
  }, [pathname, start, router]);

  // Decide. Re-evaluated per page (every page mounts its own shell) and when the gate changes.
  useEffect(() => {
    if (run || gate !== "page" || pathname !== start || pathname === "/map") return;
    let alive = true;
    (async () => {
      const manual = session.get(MANUAL_KEY) === "1" || hasTourParam(window.location.search);
      let autoAllowed = false;
      if (!manual && !doneTours().includes(tour)) {
        autoAllowed = await shouldAutoStart(tour, userId).catch(() => false);
        // Just signed up: the funnel answers may still be on their way to the DB (key deleted after the save). Ask again then.
        if (!autoAllowed && funnelPending()) {
          for (let i = 0; i < 30 && alive && funnelPending(); i++) await sleep(500);
          if (alive && !funnelPending()) autoAllowed = await shouldAutoStart(tour, userId).catch(() => false);
        }
      }
      if (!alive) return;
      const decision = startDecision({ gate, pathname, tour, manual, autoAllowed, doneThisSession: doneTours().includes(tour) });
      if (!decision) return;
      // No open modal (e.g. the «Mehr» sheet) – wait for it, but never longer than this page view.
      while (alive && modalOpen()) await sleep(400);
      if (!alive) return;
      session.del(MANUAL_KEY);
      setRun({ mode: decision });
    })();
    return () => { alive = false; };
  }, [run, gate, pathname, start, tour, userId]);

  // A gate that appears during the tour (trial ended) or leaving the page closes it silently: nothing stored, next time again.
  const visible = !!run && gate === "page" && pathname === start;
  if (run && !visible) setRun(null); // adjust state while rendering (no effect round trip)

  const onEnd = useCallback((how: TourEnd, step: number) => {
    const mode = run?.mode ?? "auto";
    setRun(null);
    if (how === "abort") return; // too few steps on this screen: state stays «not started»
    session.set(SESSION_DONE_KEY, [...new Set([...doneTours(), tour])].join(","));
    const state = endState(how, mode);
    if (state) void saveTourState(tour, state, step).catch(() => undefined);
  }, [run, tour]);

  if (!visible) return null;
  return <TourOverlay tour={tour} userId={userId} onEnd={onEnd} />;
}
