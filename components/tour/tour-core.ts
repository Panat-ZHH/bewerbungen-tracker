// Pure logic of the in-app product tour (SPEC-FLOW §6, SPEC-DATA §5). No React, no browser globals, no "@/" imports:
// unit tested in tests/onb-tour-core.test.mjs. The UI lives in tour-overlay.tsx (lazy) and tour-launcher.tsx (tiny, always loaded).

export type TourId = "schueler" | "eltern" | "lehrperson" | "schule";
export const TOUR_IDS: readonly TourId[] = ["schueler", "eltern", "lehrperson", "schule"];

/** Where each tour runs. The tour never navigates: steps on other pages point at their nav item (SPEC-FLOW §6.1). */
export const TOUR_START_PATH: Record<TourId, string> = {
  schueler: "/dashboard",
  eltern: "/familie",
  lehrperson: "/teacher",
  schule: "/schul-admin",
};

/** Query flag of a manual start («Tour wiederholen»). */
export const TOUR_PARAM = "tour";
/** sessionStorage: a manual start requested on another page (e.g. /dashboard?tour=1 for a parent who is sent to /familie). */
export const MANUAL_KEY = "wendapply.tour.manual";
/** sessionStorage: this tab already ran (finished / skipped) a tour of this id – never auto-start it twice in one tab. */
export const SESSION_DONE_KEY = "wendapply.tour.done";
/** localStorage key of the funnel answers (SPEC-FLOW D5): present = the save after sign-up is still pending. */
export const FUNNEL_KEY = "wendapply.funnel.v1";

/** Timings (ms) from SPEC-FLOW §6.1. */
export const FIRST_ANCHOR_WAIT = 3000;
export const STEP_ANCHOR_WAIT = 1500;
export const START_DELAY = 600;
/** Fewer real steps than this: the tour does not start at all (state stays «not started»). */
export const MIN_STEPS = 2;

/** Which tour belongs to the signed-in account (same split as the workspace shell). */
export function tourFor(input: { role: "student" | "teacher"; parent: boolean; schoolAdmin: boolean }): TourId {
  if (input.role === "teacher") return "lehrperson";
  if (input.parent) return "eltern";
  if (input.schoolAdmin) return "schule";
  return "schueler";
}

/** Start page of the role + `?tour=1` = the «Tour wiederholen» link. */
export function replayHref(tour: TourId): string {
  return `${TOUR_START_PATH[tour]}?${TOUR_PARAM}=1`;
}

/** `?tour=1` in a query string. */
export function hasTourParam(search: string): boolean {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(TOUR_PARAM) === "1";
}

/** The same query without `tour` (keeps everything else, e.g. `?plan=family`). Returns "" or "?a=b". */
export function stripTourParam(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.delete(TOUR_PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

// ---------------------------------------------------------------- steps

/** Data the step texts may use. Everything optional: unknown = the neutral variant. */
export interface TourContext {
  /** profiles.weekly_goal (null = app default 3). */
  weeklyGoal?: number | null;
  /** profiles.help_wishes; undefined = unknown (old account / column missing) → conditional steps are shown. */
  helpWishes?: readonly string[] | null;
  /** Name of the family plan (FAMILY.name in lib/billing/plans). */
  planName?: string;
}

export interface StepOption { anchor: string; title: string; text: string }
interface StepDef {
  id: string;
  /** First option whose anchor is visible wins (e.g. nav-cvs on desktop, nav-more on the phone). */
  options: (ctx: TourContext) => StepOption[];
  when?: (ctx: TourContext) => boolean;
}

const goalText = (goal: number | null | undefined) => {
  const n = typeof goal === "number" && Number.isInteger(goal) && goal >= 1 && goal <= 20 ? goal : 3;
  return `${n} ${n === 1 ? "Bewerbung" : "Bewerbungen"} pro Woche, wie in deinem Plan. Jede abgeschickte Bewerbung füllt einen Balken.`;
};

/** Help wishes that make the «Dokumente» step useful (SPEC-FLOW §6.4 step 5). */
const DOCUMENT_WISHES = ["lebenslauf", "brief"];

const MORE_STUDENT: StepOption = { anchor: "nav-more", title: "Mehr", text: "Profil, Einstellungen, Hilfe und deine Familie findest du hier. Hier kannst du die Tour auch wiederholen." };
const MORE_SHORT: StepOption = { anchor: "nav-more", title: "Mehr", text: "Profil, Einstellungen und Hilfe. Hier kannst du die Tour wiederholen." };

export const TOUR_STEPS: Record<TourId, StepDef[]> = {
  schueler: [
    { id: "start", options: () => [{ anchor: "schueler-next-step", title: "Start", text: "Hier steht immer dein nächster Schritt. Tipp darauf, wenn du nicht weisst, was du tun sollst." }] },
    { id: "weekly-goal", options: (c) => [{ anchor: "schueler-weekly-goal", title: "Dein Wochenziel", text: goalText(c.weeklyGoal) }] },
    { id: "search", options: () => [{ anchor: "nav-search", title: "Suchen", text: "Hier findest du Lehrstellen und Schnupperlehren in deiner Nähe." }] },
    { id: "applications", options: () => [{ anchor: "nav-applications", title: "Bewerbungen", text: "Hier siehst du alle deine Bewerbungen und ihren Status. Trag jede Bewerbung ein, auch wenn du sie erst merkst." }] },
    {
      id: "documents",
      when: (c) => c.helpWishes == null || c.helpWishes.some((w) => DOCUMENT_WISHES.includes(w)),
      options: () => {
        const text = "Lebenslauf, Motivationsschreiben und Zeugnisse an einem Ort. Der Bewerbungs-Check gibt dir Tipps für deinen Brief.";
        return [{ anchor: "nav-cvs", title: "Dokumente", text }, { anchor: "nav-more", title: "Dokumente", text: `${text} Du findest sie unter «Mehr».` }];
      },
    },
    { id: "village", options: () => [{ anchor: "nav-map", title: "Dein Dorf", text: "Jede Bewerbung wird ein Haus. Mit jedem Schritt wächst dein Dorf – bis zur Zusage." }] },
    {
      id: "friends",
      // Pupils in a class see «Klassen» in the tab bar (Freunde moves to «Mehr»); without a class there is no Klassen item at all.
      options: () => [
        { anchor: "nav-classes", title: "Deine Klasse", text: "Hier siehst du deine Klasse und Mitteilungen deiner Lehrperson." },
        { anchor: "nav-friends", title: "Freunde", text: "Bewirb dich zusammen mit Freunden und seht, wer dran bleibt." },
      ],
    },
    { id: "more", options: () => [MORE_STUDENT] },
  ],
  eltern: [
    { id: "family", options: () => [{ anchor: "eltern-family", title: "Familie", text: "Hier siehst du alles zu deiner Familie in WendApply." }] },
    { id: "invite-child", options: () => [{ anchor: "eltern-invite-child", title: "Kind einladen", text: "Erstell einen Code und schick ihn deinem Kind. Der Code gilt 7 Tage." }] },
    { id: "overview", options: () => [{ anchor: "eltern-overview", title: "Übersicht", text: "Hier siehst du, wo dein Kind steht. Nur das, was es mit dir teilt." }] },
    { id: "plan", options: (c) => [{ anchor: "eltern-plan", title: "Abo", text: `Hier siehst du deine Gratis-Testwoche und das ${c.planName || "Familienpaket"}. Bezahlen musst du erst, wenn du weitermachen willst.` }] },
    { id: "more", options: () => [MORE_SHORT] },
  ],
  lehrperson: [
    { id: "classes", options: () => [{ anchor: "lehrperson-classes", title: "Deine Klassen", text: "Hier siehst du jede Klasse und wer Hilfe braucht." }] },
    { id: "new-class", options: () => [{ anchor: "lehrperson-new-class", title: "Klasse erstellen", text: "Erstell eine Klasse und lade die Schülerinnen und Schüler mit einem Code ein." }] },
    { id: "deadlines", options: () => [{ anchor: "lehrperson-deadlines", title: "Fristen", text: "Hier siehst du, welche Fristen bald ablaufen." }] },
  ],
  schule: [
    { id: "status", options: () => [{ anchor: "schule-status", title: "Eure Schule", text: "Hier siehst du auf einen Blick den Stand eurer Schullizenz." }] },
    { id: "licence", options: () => [{ anchor: "schule-licence", title: "Lizenz", text: "Lizenz, Plätze und Laufzeit. Hier verlängerst du sie auch." }] },
    { id: "teachers", options: () => [{ anchor: "schule-teachers", title: "Lehrpersonen", text: "Hier schaltest du Lehrpersonen frei. Sie brauchen dafür ein Konto." }] },
  ],
};

/** A step that will be shown, with the anchor that was found for it. */
export interface PlannedStep extends StepOption { id: string; candidates: string[] }

/** Steps of a tour after the context conditions (no DOM yet): every option list is kept for the DOM check. */
export function candidateSteps(tour: TourId, ctx: TourContext = {}): { id: string; options: StepOption[] }[] {
  return TOUR_STEPS[tour].filter((s) => !s.when || s.when(ctx)).map((s) => ({ id: s.id, options: s.options(ctx) }));
}

/**
 * The real list: per step the first option whose anchor is usable; steps without one are dropped (SPEC-FLOW §6.1 «missing
 * element → skip silently»).
 */
export function planSteps(tour: TourId, ctx: TourContext, usable: (anchor: string) => boolean): PlannedStep[] {
  const out: PlannedStep[] = [];
  for (const step of candidateSteps(tour, ctx)) {
    const hit = step.options.find((o) => safeUsable(usable, o.anchor));
    if (!hit) continue;
    out.push({ id: step.id, ...hit, candidates: step.options.map((o) => o.anchor) });
  }
  return out;
}

function safeUsable(usable: (anchor: string) => boolean, anchor: string): boolean {
  try { return usable(anchor); } catch { return false; }
}

/** Removes the step at `index` (its anchor vanished) and returns the new list + the index to show next. */
export function dropStep(steps: PlannedStep[], index: number): { steps: PlannedStep[]; index: number } {
  const next = steps.filter((_, i) => i !== index);
  return { steps: next, index: Math.min(index, Math.max(0, next.length - 1)) };
}

/** Enough steps to start? */
export const canStart = (steps: readonly unknown[]) => steps.length >= MIN_STEPS;

/** «3 / 6» (visible) and «Schritt 3 von 6.» (screen reader). */
export function stepIndicator(index: number, total: number): { visual: string; spoken: string } {
  const n = Math.max(1, total);
  const i = Math.min(Math.max(0, index), n - 1) + 1;
  return { visual: `${i} / ${n}`, spoken: `Schritt ${i} von ${n}.` };
}

/** Card buttons of a step (SPEC-FLOW §6.3): no «Zurück» on step 1, «Fertig» and no «Überspringen» on the last one. */
export function cardButtons(index: number, total: number): { back: boolean; primary: "Weiter" | "Fertig"; skip: "Tour überspringen" | "Überspringen" | null } {
  const last = index >= total - 1;
  return { back: index > 0, primary: last ? "Fertig" : "Weiter", skip: last ? null : index === 0 ? "Tour überspringen" : "Überspringen" };
}

export type TourKeyAction = "next" | "back" | "skip" | "finish" | null;
/** Keyboard (SPEC-FLOW §6.1): → next (Fertig on the last step), ← back, Esc = Überspringen (ends + stores «skipped»). */
export function keyAction(key: string, index: number, total: number): TourKeyAction {
  const last = index >= total - 1;
  if (key === "Escape" || key === "Esc") return "skip";
  if (key === "ArrowRight") return last ? "finish" : "next";
  if (key === "ArrowLeft") return index > 0 ? "back" : null;
  return null;
}

// ---------------------------------------------------------------- auto start

export interface AutoStartInput {
  /** AccessGuard / shell gate: only "page" means the real page content is shown (no paywall, licence gate, blocked page). */
  gate: string;
  pathname: string;
  tour: TourId;
  /** ?tour=1 or the manual flag from another page. */
  manual: boolean;
  /** lib/tour/state shouldAutoStart(): funnel account without a stored state row. */
  autoAllowed: boolean;
  /** A tour of this id already ended in this tab. */
  doneThisSession: boolean;
}

/** Decision before the DOM checks (modal open, anchors) – pure. */
export function startDecision(i: AutoStartInput): "manual" | "auto" | null {
  if (i.gate !== "page") return null; // never behind the paywall / licence gate / blocked page
  if (i.pathname !== TOUR_START_PATH[i.tour]) return null;
  if (i.manual) return "manual";
  if (i.doneThisSession || !i.autoAllowed) return null;
  return "auto";
}

/** What to store when the tour ends. Manual replays never downgrade a stored state: skipping a replay stores nothing. */
export function endState(how: "finish" | "skip", mode: "manual" | "auto"): "completed" | "skipped" | null {
  if (how === "finish") return "completed";
  return mode === "auto" ? "skipped" : null;
}

// ---------------------------------------------------------------- geometry

export interface Rect { top: number; left: number; width: number; height: number }
export interface Viewport { width: number; height: number; /** sticky header + safe area */ topInset: number; /** bottom nav + safe area */ bottomInset: number }
export interface Placement { top: number; left: number; width: number; side: "below" | "above" | "right" | "left" | "sheet"; arrowX: number | null; arrowY: number | null }

export const CUTOUT_PAD = 8;
export const CARD_GAP = 12;
export const CARD_MAX_W = 340;
export const EDGE = 16;
export const PHONE_MAX = 767;

/** Target rect + padding, clipped to the viewport (a target taller than the screen is cut, not pushed off-screen). */
export function cutoutRect(target: Rect, vp: { width: number; height: number }, pad = CUTOUT_PAD): Rect {
  const top = Math.max(0, target.top - pad);
  const left = Math.max(0, target.left - pad);
  const bottom = Math.min(vp.height, target.top + target.height + pad);
  const right = Math.min(vp.width, target.left + target.width + pad);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** A measured element is usable when it has a size and lies at least partly in the document (not display:none). */
export function isUsableRect(r: { width: number; height: number } | null | undefined): boolean {
  return !!r && r.width > 0 && r.height > 0;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * Where the card goes (SPEC-FLOW §6.1/§6.5). `cut` = the cut-out rect (viewport coordinates), `card` = measured card size.
 * Phone: below the target, else above it (nav items: always above the bar, arrow down), else a sheet above the bottom nav.
 * Desktop: bottom, top, right, left; 12 px gap; arrow points at the target centre.
 */
export function placeCard(cut: Rect, card: { width: number; height: number }, vp: Viewport, opts: { nav?: boolean } = {}): Placement {
  const phone = vp.width <= PHONE_MAX;
  const width = Math.min(CARD_MAX_W, vp.width - 2 * EDGE);
  const h = card.height;
  const minTop = vp.topInset + EDGE / 2;
  const maxBottom = vp.height - vp.bottomInset - EDGE / 2;
  const cx = cut.left + cut.width / 2;
  const cy = cut.top + cut.height / 2;
  const left = phone ? Math.round((vp.width - width) / 2) : clamp(Math.round(cx - width / 2), EDGE, vp.width - EDGE - width);
  const arrowX = (l: number) => clamp(Math.round(cx - l), 20, width - 20);

  const belowTop = cut.top + cut.height + CARD_GAP;
  const aboveTop = cut.top - CARD_GAP - h;
  const fitsBelow = belowTop + h <= maxBottom;
  // A bottom-nav item sits inside the bottom inset: above it the card may use the space down to the item itself.
  const fitsAbove = aboveTop >= minTop;

  if (opts.nav && phone) return { top: Math.round(Math.max(minTop, aboveTop)), left, width, side: "above", arrowX: arrowX(left), arrowY: null };
  if (opts.nav && !phone && fitsBelow) return { top: Math.round(belowTop), left, width, side: "below", arrowX: arrowX(left), arrowY: null };
  if (fitsBelow) return { top: Math.round(belowTop), left, width, side: "below", arrowX: arrowX(left), arrowY: null };
  if (fitsAbove) return { top: Math.round(aboveTop), left, width, side: "above", arrowX: arrowX(left), arrowY: null };
  if (!phone) {
    const top = clamp(Math.round(cy - h / 2), minTop, maxBottom - h);
    const arrowY = clamp(Math.round(cy - top), 20, h - 20);
    if (cut.left + cut.width + CARD_GAP + width <= vp.width - EDGE) return { top, left: Math.round(cut.left + cut.width + CARD_GAP), width, side: "right", arrowX: null, arrowY };
    if (cut.left - CARD_GAP - width >= EDGE) return { top, left: Math.round(cut.left - CARD_GAP - width), width, side: "left", arrowX: null, arrowY };
  }
  // Nothing fits next to a huge target: sheet above the bottom nav (phone) / bottom of the screen (desktop), no arrow.
  return { top: Math.round(Math.max(minTop, maxBottom - h)), left, width, side: "sheet", arrowX: null, arrowY: null };
}

// ---------------------------------------------------------------- nav anchors

/** `data-tour` of a nav item, derived from its href (one place for the desktop top bar and the mobile bottom bar, SPEC-FLOW §6.4). */
const NAV_TOUR: Record<string, string> = {
  "/dashboard": "nav-dashboard", "/search": "nav-search", "/applications": "nav-applications", "/map": "nav-map", "/cvs": "nav-cvs",
  "/analytics": "nav-analytics", "/friends": "nav-friends", "/classes": "nav-classes", "/familie": "nav-family", "/schul-admin": "nav-school",
};
export const NAV_MORE = "nav-more";
export function navTour(href: string): string | undefined {
  return NAV_TOUR[href];
}
