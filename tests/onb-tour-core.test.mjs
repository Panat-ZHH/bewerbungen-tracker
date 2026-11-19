// Product tour (onb-tour, SPEC-FLOW §6 + SPEC-DATA §5): step resolution, skip/recount, keyboard, start rules, placement,
// parity with lib/tour/state (onb-data) and the source contract of the UI files (attributes, lazy load, a11y).
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { loadLib } from "./helpers/load-lib.mjs";

const core = await import("../components/tour/tour-core.ts");
const state = await loadLib("tour/state");
const src = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const all = () => true;
const none = () => false;
const only = (...names) => (a) => names.includes(a);

// ---------------------------------------------------------------- roles, paths, params
test("tourFor: teacher → lehrperson, parent → eltern, school admin → schule, else schueler", () => {
  assert.equal(core.tourFor({ role: "teacher", parent: false, schoolAdmin: true }), "lehrperson");
  assert.equal(core.tourFor({ role: "student", parent: true, schoolAdmin: false }), "eltern");
  assert.equal(core.tourFor({ role: "student", parent: false, schoolAdmin: true }), "schule");
  assert.equal(core.tourFor({ role: "student", parent: false, schoolAdmin: false }), "schueler");
});

test("parity with lib/tour/state: ids, start paths, ?tour param", () => {
  assert.deepEqual([...core.TOUR_IDS], [...state.TOUR_IDS]);
  assert.deepEqual(core.TOUR_START_PATH, state.TOUR_START_PATH);
  assert.equal(core.TOUR_PARAM, state.TOUR_PARAM);
  for (const t of core.TOUR_IDS) assert.equal(state.isManualTourStart(core.replayHref(t).split("?")[1]), true, t);
});

test("replayHref / hasTourParam / stripTourParam", () => {
  assert.equal(core.replayHref("schueler"), "/dashboard?tour=1");
  assert.equal(core.replayHref("eltern"), "/familie?tour=1");
  assert.equal(core.replayHref("lehrperson"), "/teacher?tour=1");
  assert.equal(core.replayHref("schule"), "/schul-admin?tour=1");
  assert.equal(core.hasTourParam("?tour=1"), true);
  assert.equal(core.hasTourParam("a=b&tour=1"), true);
  assert.equal(core.hasTourParam("?tour=0"), false);
  assert.equal(core.hasTourParam(""), false);
  assert.equal(core.stripTourParam("?tour=1"), "");
  assert.equal(core.stripTourParam("?plan=family&tour=1&x=2"), "?plan=family&x=2");
});

// ---------------------------------------------------------------- step lists
test("schueler: 8 candidate steps, Dokumente only with lebenslauf/brief (unknown wishes = shown)", () => {
  assert.equal(core.candidateSteps("schueler", {}).length, 8);
  assert.equal(core.candidateSteps("schueler", { helpWishes: null }).length, 8, "unknown → shown");
  assert.equal(core.candidateSteps("schueler", { helpWishes: [] }).some((s) => s.id === "documents"), false);
  assert.equal(core.candidateSteps("schueler", { helpWishes: ["schnupperlehre"] }).some((s) => s.id === "documents"), false);
  assert.equal(core.candidateSteps("schueler", { helpWishes: ["brief"] }).some((s) => s.id === "documents"), true);
  assert.equal(core.candidateSteps("schueler", { helpWishes: ["lebenslauf", "eltern"] }).some((s) => s.id === "documents"), true);
});

test("desktop student (everything visible): 7 steps max because Dokumente is conditional, Klasse before Freunde", () => {
  const steps = core.planSteps("schueler", { helpWishes: ["uebersicht"] }, all);
  assert.deepEqual(steps.map((s) => s.id), ["start", "weekly-goal", "search", "applications", "village", "friends", "more"]);
  assert.equal(steps.find((s) => s.id === "friends").anchor, "nav-classes", "first visible option wins");
  assert.equal(steps.at(-1).anchor, "nav-more");
  assert.match(steps.at(-1).text, /Tour auch wiederholen/);
});

test("phone student without class and without Dokumente in the bar: Dokumente → Mehr, Freunde (no Klassen)", () => {
  const visible = only("schueler-next-step", "nav-search", "nav-applications", "nav-map", "nav-friends", "nav-more");
  const steps = core.planSteps("schueler", {}, visible);
  assert.deepEqual(steps.map((s) => `${s.id}:${s.anchor}`), [
    "start:schueler-next-step", "search:nav-search", "applications:nav-applications", "documents:nav-more", "village:nav-map", "friends:nav-friends", "more:nav-more",
  ]);
  assert.equal(steps.find((s) => s.id === "friends").title, "Freunde");
  assert.match(steps.find((s) => s.id === "documents").text, /unter «Mehr»/);
});

test("missing elements are skipped silently and the indicator counts only real steps", () => {
  const steps = core.planSteps("schueler", { helpWishes: [] }, only("schueler-next-step", "nav-search", "nav-more"));
  assert.deepEqual(steps.map((s) => s.id), ["start", "search", "more"]);
  assert.deepEqual(core.stepIndicator(1, steps.length), { visual: "2 / 3", spoken: "Schritt 2 von 3." });
  assert.equal(core.canStart(steps), true);
  assert.equal(core.canStart(core.planSteps("schueler", { helpWishes: [] }, only("nav-more"))), false, "fewer than 2 → no start");
  assert.equal(core.planSteps("schueler", {}, none).length, 0);
});

test("a throwing visibility check never breaks the plan", () => {
  const steps = core.planSteps("eltern", {}, (a) => { if (a === "eltern-overview") throw new Error("boom"); return true; });
  assert.deepEqual(steps.map((s) => s.id), ["family", "invite-child", "plan", "more"]);
});

test("dropStep: an anchor that vanished mid-tour is removed, index stays in range", () => {
  const steps = core.planSteps("eltern", {}, all);
  assert.equal(steps.length, 5);
  const a = core.dropStep(steps, 2);
  assert.deepEqual(a.steps.map((s) => s.id), ["family", "invite-child", "plan", "more"]);
  assert.equal(a.index, 2, "next step slides into the slot");
  const b = core.dropStep(steps, 4);
  assert.equal(b.index, 3, "last removed → new last");
  const c = core.dropStep([steps[0]], 0);
  assert.deepEqual(c, { steps: [], index: 0 });
});

test("texts: weekly goal from the plan (default 3, singular), family plan name, no Eszett, max 2 sentences", () => {
  const goal = (g) => core.planSteps("schueler", { weeklyGoal: g }, all).find((s) => s.id === "weekly-goal").text;
  assert.match(goal(5), /^5 Bewerbungen pro Woche/);
  assert.match(goal(1), /^1 Bewerbung pro Woche/);
  assert.match(goal(null), /^3 Bewerbungen/);
  assert.match(goal(99), /^3 Bewerbungen/, "out of range → default");
  assert.match(core.planSteps("eltern", { planName: "Familienpaket" }, all).find((s) => s.id === "plan").text, /das Familienpaket\./);
  for (const t of core.TOUR_IDS) for (const s of core.candidateSteps(t, {})) for (const o of s.options) {
    assert.doesNotMatch(o.title + o.text, /ß/, `${t}/${s.id}`);
    assert.ok((o.text.match(/[.!?](\s|$)/g) ?? []).length <= 3, `${t}/${s.id}: short`);
    assert.match(o.anchor, /^(schueler|eltern|lehrperson|schule|nav)-[a-z-]+$/, "attribute convention §6.2");
  }
});

test("teacher and school tours: 3 short steps each, last one ends with Fertig", () => {
  for (const t of ["lehrperson", "schule"]) {
    const steps = core.planSteps(t, {}, all);
    assert.equal(steps.length, 3, t);
    assert.equal(core.cardButtons(2, 3).primary, "Fertig");
  }
});

// ---------------------------------------------------------------- card + keyboard
test("cardButtons: no Zurück on step 1, «Tour überspringen» first, «Fertig» without skip last", () => {
  assert.deepEqual(core.cardButtons(0, 5), { back: false, primary: "Weiter", skip: "Tour überspringen" });
  assert.deepEqual(core.cardButtons(2, 5), { back: true, primary: "Weiter", skip: "Überspringen" });
  assert.deepEqual(core.cardButtons(4, 5), { back: true, primary: "Fertig", skip: null });
});

test("keyAction: → next / Fertig, ← back (not on step 1), Esc = skip on every step, other keys ignored", () => {
  assert.equal(core.keyAction("ArrowRight", 0, 3), "next");
  assert.equal(core.keyAction("ArrowRight", 2, 3), "finish");
  assert.equal(core.keyAction("ArrowLeft", 0, 3), null);
  assert.equal(core.keyAction("ArrowLeft", 1, 3), "back");
  assert.equal(core.keyAction("Escape", 0, 3), "skip");
  assert.equal(core.keyAction("Escape", 2, 3), "skip");
  assert.equal(core.keyAction("Enter", 0, 3), null, "Enter = the focused button (native)");
  assert.equal(core.keyAction("a", 0, 3), null);
});

// ---------------------------------------------------------------- start / end rules
test("startDecision: never behind a gate, only on the start page, manual beats state, auto only if allowed", () => {
  const base = { gate: "page", pathname: "/dashboard", tour: "schueler", manual: false, autoAllowed: true, doneThisSession: false };
  assert.equal(core.startDecision(base), "auto");
  assert.equal(core.startDecision({ ...base, gate: "paywall" }), null);
  assert.equal(core.startDecision({ ...base, gate: "licence", manual: true }), null, "manual start never behind the licence gate");
  assert.equal(core.startDecision({ ...base, pathname: "/applications" }), null);
  assert.equal(core.startDecision({ ...base, autoAllowed: false }), null, "pre-release account / stored state");
  assert.equal(core.startDecision({ ...base, autoAllowed: false, manual: true }), "manual");
  assert.equal(core.startDecision({ ...base, doneThisSession: true }), null, "skipped in this tab, save failed → no restart");
  assert.equal(core.startDecision({ ...base, doneThisSession: true, manual: true }), "manual");
  assert.equal(core.startDecision({ ...base, tour: "eltern", pathname: "/familie" }), "auto");
});

test("endState: finish stores completed; skip stores skipped (auto) or nothing (manual replay, no downgrade)", () => {
  assert.equal(core.endState("finish", "auto"), "completed");
  assert.equal(core.endState("finish", "manual"), "completed");
  assert.equal(core.endState("skip", "auto"), "skipped");
  assert.equal(core.endState("skip", "manual"), null);
});

test("lib/tour/state autoStartDecision (onb-data) agrees: funnel accounts without a current-version row only", () => {
  const v = 1;
  assert.equal(state.autoStartDecision({ funnelCompleted: true, row: null, localFlag: null, version: v }), true);
  assert.equal(state.autoStartDecision({ funnelCompleted: false, row: null, localFlag: null, version: v }), false);
  assert.equal(state.autoStartDecision({ funnelCompleted: true, row: { status: "skipped", version: 1 }, localFlag: null, version: v }), false);
  assert.equal(state.autoStartDecision({ funnelCompleted: true, row: null, localFlag: "skipped", version: v }), false);
});

// ---------------------------------------------------------------- geometry
const phone = { width: 390, height: 844, topInset: 64, bottomInset: 76 };
const desk = { width: 1280, height: 800, topInset: 64, bottomInset: 0 };
const card = { width: 340, height: 200 };

test("cutoutRect: 8 px padding, clipped to the viewport", () => {
  assert.deepEqual(core.cutoutRect({ top: 100, left: 20, width: 200, height: 50 }, phone), { top: 92, left: 12, width: 216, height: 66 });
  const huge = core.cutoutRect({ top: -300, left: 0, width: 390, height: 2000 }, phone);
  assert.deepEqual(huge, { top: 0, left: 0, width: 390, height: 844 });
});

test("placeCard phone: below a target in the upper part, above a bottom-nav item (arrow down), sheet when nothing fits", () => {
  const below = core.placeCard({ top: 120, left: 8, width: 374, height: 80 }, card, phone);
  assert.equal(below.side, "below");
  assert.equal(below.top, 212);
  assert.equal(below.width, 340);
  assert.equal(below.left, 25, "centred, 16 px edges at least");
  const navItem = { top: 776, left: 150, width: 70, height: 60 };
  const nav = core.placeCard(navItem, card, phone, { nav: true });
  assert.equal(nav.side, "above");
  assert.equal(nav.top, 776 - 12 - 200);
  assert.ok(nav.arrowX > 150 - nav.left - 1 && nav.arrowX < 220 - nav.left + 1, "arrow over the item");
  const big = core.placeCard({ top: 70, left: 8, width: 374, height: 690 }, card, phone);
  assert.equal(big.side, "sheet");
  assert.ok(big.top + 200 <= 844 - 76, "sheet sits above the bottom nav");
  const narrow = core.placeCard({ top: 120, left: 8, width: 300, height: 80 }, card, { ...phone, width: 320 });
  assert.equal(narrow.width, 288, "phone: calc(100vw - 32px)");
});

test("placeCard desktop: bottom, top, right, left order; stays inside the viewport", () => {
  const navTop = core.placeCard({ top: 10, left: 300, width: 44, height: 44 }, card, desk, { nav: true });
  assert.equal(navTop.side, "below");
  assert.ok(navTop.left >= 16 && navTop.left + 340 <= 1280 - 16);
  const low = core.placeCard({ top: 600, left: 400, width: 300, height: 120 }, card, desk);
  assert.equal(low.side, "above");
  const tall = core.placeCard({ top: 70, left: 40, width: 500, height: 700 }, card, desk);
  assert.equal(tall.side, "right");
  assert.equal(tall.left, 40 + 500 + 12);
  assert.ok(tall.arrowY >= 20 && tall.arrowY <= 180);
  const tallRight = core.placeCard({ top: 70, left: 800, width: 470, height: 700 }, card, desk);
  assert.equal(tallRight.side, "left");
  const edge = core.placeCard({ top: 100, left: 1250, width: 20, height: 20 }, card, desk);
  assert.ok(edge.left + 340 <= 1280 - 16, "clamped at the right edge");
  assert.ok(edge.arrowX <= 340 - 20);
});

test("nav anchors: one place for both navs", () => {
  assert.equal(core.navTour("/search"), "nav-search");
  assert.equal(core.navTour("/familie"), "nav-family");
  assert.equal(core.navTour("/nowhere"), undefined);
  assert.equal(core.NAV_MORE, "nav-more");
});

// ---------------------------------------------------------------- source contract
test("every anchor of every tour exists as data-tour in the app (nav via navTour)", async () => {
  const files = ["app/dashboard/page.tsx", "components/dashboard/weekly-goal.tsx", "components/family/family-view.tsx", "components/family/parent-view.tsx",
    "components/family/parent-start.tsx", "components/family/plan-card.tsx", "components/teacher/dashboard.tsx", "components/b2b/school-admin.tsx"];
  const text = (await Promise.all(files.map(src))).join("\n");
  const shell = await src("components/layout/workspace-shell.tsx");
  assert.equal((shell.match(/data-tour=\{navTour\(href\)\}/g) ?? []).length, 2, "desktop + mobile nav");
  assert.equal((shell.match(/data-tour=\{NAV_MORE\}/g) ?? []).length, 2, "both «Mehr» buttons");
  assert.match(shell, /<TourLauncher role=\{role\} parent=\{isParent\} schoolAdmin=\{isAdminOnly\} gate=\{gate\} userId=\{user\.id\} \/>/);
  assert.match(shell, /keepTourParam\(target, window\.location\.search\)/);
  const navAnchors = new Set([core.NAV_MORE, ...["/dashboard", "/search", "/applications", "/map", "/cvs", "/friends", "/classes"].map(core.navTour)]);
  for (const t of core.TOUR_IDS) for (const s of core.candidateSteps(t, {})) for (const o of s.options) {
    if (o.anchor.startsWith("nav-")) assert.ok(navAnchors.has(o.anchor), o.anchor);
    else assert.match(text, new RegExp(`data-tour="${o.anchor}"`), `${t}: ${o.anchor}`);
  }
});

test("UI contract: lazy overlay, dialog semantics, focus, z-index 130, reduced motion, no library", async () => {
  const launcher = await src("components/tour/tour-launcher.tsx");
  const overlay = await src("components/tour/tour-overlay.tsx");
  const cardSrc = await src("components/tour/tour-card.tsx");
  const pkg = JSON.parse(await src("package.json"));
  assert.match(launcher, /dynamic\(\(\) => import\("\.\/tour-overlay"\), \{ ssr: false \}\)/);
  const overlayImports = launcher.match(/^import .*"\.\/tour-overlay";$/gm) ?? [];
  assert.ok(overlayImports.length > 0 && overlayImports.every((l) => l.startsWith("import type")), "the overlay is never imported statically");
  assert.match(cardSrc, /role="dialog"/);
  assert.match(cardSrc, /aria-modal="true"/);
  assert.match(cardSrc, /aria-labelledby=\{p\.titleId\}/);
  assert.match(cardSrc, /aria-describedby=\{p\.textId\}/);
  assert.match(cardSrc, /className="sr-only">\{ind\.spoken\}/);
  assert.match(overlay, /z-index: 130/);
  assert.match(overlay, /prefers-reduced-motion: no-preference/);
  assert.match(overlay, /behavior: reduced \? "auto" : "smooth"/);
  assert.match(overlay, /titleRef\.current\?\.focus/);
  assert.match(overlay, /previous\.focus/);
  assert.match(overlay, /pointer-events: none/);
  assert.match(overlay, /aria-describedby/);
  assert.doesNotMatch(overlay + launcher + cardSrc, /inert/);
  for (const lib of ["driver.js", "shepherd.js", "intro.js", "react-joyride", "@reactour/tour"]) {
    assert.equal(pkg.dependencies?.[lib], undefined, lib);
    assert.equal(pkg.devDependencies?.[lib], undefined, lib);
  }
  for (const s of [launcher, overlay, cardSrc]) assert.doesNotMatch(s, /ß/);
});
