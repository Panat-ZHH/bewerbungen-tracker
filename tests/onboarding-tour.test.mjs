import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { readFile } from "node:fs/promises";
import { loadLib } from "./helpers/load-lib.mjs";

const tour = await loadLib("onboarding-tour");
const role = await loadLib("role");
const ux = await loadLib("ux");
const safe = ux.safeNextPath;

// ---------------------------------------------------------------- step logic
test("steps: 3 steps + done screen, clamped navigation", () => {
  assert.equal(tour.TOUR_STEP_COUNT, 4);
  assert.equal(tour.VISIBLE_STEPS, 3);
  assert.deepEqual([...tour.TOUR_STEPS], ["Wer bist du?", "Was möchtest du werden?", "Erste Bewerbung", "Fertig"]);
  assert.equal(tour.nextStep(0), 1);
  assert.equal(tour.nextStep(3), 3);
  assert.equal(tour.prevStep(0), 0);
  assert.equal(tour.prevStep(3), 2);
  for (const [raw, want] of [[-3, 0], [9, 3], ["2", 2], [2.7, 2], ["x", 0], [null, 0], [undefined, 0], [NaN, 0], ["", 0]]) assert.equal(tour.clampStep(raw), want, String(raw));
});

test("progress: one counter 'Schritt x von 3', 'Fertig' on the last screen, growing bar", () => {
  assert.deepEqual(tour.tourProgress(0), { current: 1, total: 3, label: "Schritt 1 von 3", percent: 33 });
  assert.equal(tour.tourProgress(2).label, "Schritt 3 von 3");
  assert.equal(tour.tourProgress(3).label, "Fertig");
  assert.equal(tour.tourProgress(3).percent, 100);
  assert.equal(tour.tourProgress(99).label, "Fertig");
  const widths = [0, 1, 2, 3].map((s) => tour.tourProgress(s).percent);
  assert.deepEqual(widths, [...widths].sort((a, b) => a - b));
});

test("resume never lands on 'Fertig' and starts at 0 without data", () => {
  assert.equal(tour.resumeStep({ available: true, completed: false, step: 2 }), 2);
  assert.equal(tour.resumeStep({ available: true, completed: false, step: 4 }), 2, "old 5-step value: never the done screen");
  assert.equal(tour.resumeStep({ available: true, completed: false, step: 3 }), 2);
  assert.equal(tour.resumeStep({ available: true, completed: false, step: null }), 0);
  assert.equal(tour.resumeStep(tour.UNKNOWN_TOUR), 0);
  assert.equal(tour.resumeStep({ available: true, completed: true, step: 3 }), 0);
});

// ---------------------------------------------------------------- gating
const OPEN = { available: true, completed: false, step: null };
const DONE = { available: true, completed: true, step: 3 };
test("needsTour: students only, flags and DB state", () => {
  assert.equal(tour.needsTour("teacher", {}, OPEN), false, "teachers keep their own onboarding");
  assert.equal(tour.needsTour("student", {}, OPEN), true);
  assert.equal(tour.needsTour("student", {}, DONE), false, "done on another device");
  assert.equal(tour.needsTour("student", { onboarding_tour_done: true }, OPEN), false);
  assert.equal(tour.needsTour("student", { student_onboarded: true }, OPEN), false, "existing users of the former onboarding are not forced");
  assert.equal(tour.needsTour("student", { student_onboarded: "yes" }, OPEN), true, "only a real boolean counts");
  assert.equal(tour.needsTour("student", null, tour.UNKNOWN_TOUR), true, "old DB: shown once, finishing sets the flag");
  assert.equal(tour.needsTour("student", { onboarding_tour_done: true }, tour.UNKNOWN_TOUR), false, "old DB + flag: no loop");
});

test("missing-column fallback: errors never throw and never count as 'done'", () => {
  for (const error of [{ code: "42703", message: 'column profiles.onboarding_tour_completed_at does not exist' }, { code: "PGRST204", message: "Could not find the 'onboarding_tour_step' column" }, { message: "column onboarding_tour_step does not exist" }]) {
    assert.equal(tour.isMissingSchemaError(error), true, JSON.stringify(error));
    assert.deepEqual(tour.interpretTourRow(null, error), tour.UNKNOWN_TOUR);
  }
  assert.equal(tour.isMissingSchemaError({ code: "PGRST202", message: "Could not find the function public.onboarding_tour_set" }), true);
  assert.equal(tour.isMissingSchemaError({ code: "42501", message: "permission denied" }), false);
  assert.equal(tour.isMissingSchemaError(null), false);
  assert.deepEqual(tour.interpretTourRow(null, { code: "500", message: "network" }), tour.UNKNOWN_TOUR);
  assert.deepEqual(tour.interpretTourRow(null, null), OPEN, "no profile row = brand-new account");
  assert.deepEqual(tour.interpretTourRow({ onboarding_tour_completed_at: "2026-11-14T10:00:00Z", onboarding_tour_step: 3 }), DONE);
  assert.deepEqual(tour.interpretTourRow({ onboarding_tour_completed_at: null, onboarding_tour_step: 7 }), { available: true, completed: false, step: 3 });
});

test("tour URLs keep a safe ?next= and the replay flag", () => {
  assert.equal(tour.tourHref(safe), "/onboarding");
  assert.equal(tour.tourHref(safe, "/classes/join/ABC"), "/onboarding?next=%2Fclasses%2Fjoin%2FABC");
  assert.equal(tour.tourHref(safe, "//evil.com"), "/onboarding");
  assert.equal(tour.tourHref(safe, "/onboarding?x=1"), "/onboarding", "no self loop");
  assert.equal(tour.tourHref(safe, null, true), "/onboarding?replay=1");
  assert.deepEqual(tour.parseTourParams("?replay=1", safe), { replay: true, next: null });
  assert.deepEqual(tour.parseTourParams("?next=%2Fclasses%2Fjoin%2FABC", safe), { replay: false, next: "/classes/join/ABC" });
  assert.deepEqual(tour.parseTourParams("?next=https://evil.com", safe), { replay: false, next: null });
  assert.deepEqual(tour.parseTourParams("?next=%2Fonboarding", safe), { replay: false, next: null });
  // matches the routing helper used by login / callback / role picker
  assert.equal(role.studentOnboardingHref("/classes/join/ABC"), tour.tourHref(safe, "/classes/join/ABC"));
});

test("exit path: replay returns to the settings, otherwise next (if allowed) or the dashboard", () => {
  const landing = (next) => role.landingPath("student", next);
  assert.equal(tour.tourExitPath({ replay: true, next: "/classes/join/ABC", landing }), "/settings");
  assert.equal(tour.tourExitPath({ replay: false, next: null, landing }), "/dashboard");
  assert.equal(tour.tourExitPath({ replay: false, next: "/classes/join/ABC", landing }), "/classes/join/ABC");
  assert.equal(tour.tourExitPath({ replay: false, next: "/teacher/classes/1", landing }), "/dashboard", "student cannot be sent to teacher pages");
});

test("first application: trimmed, required fields, only the three tour statuses", () => {
  assert.deepEqual(tour.checkFirstApplication({ company: "  Migros  ", position: " Koch  /  Köchin ", status: "applied" }), { ok: true, value: { company: "Migros", position: "Koch / Köchin", status: "applied" } });
  assert.equal(tour.checkFirstApplication({ company: " ", position: "Koch", status: "saved" }).field, "company");
  assert.equal(tour.checkFirstApplication({ company: "Migros", position: "", status: "saved" }).field, "position");
  assert.equal(tour.checkFirstApplication({ company: "Migros", position: "Koch", status: "offer" }).value.status, "saved");
  assert.equal(tour.checkFirstApplication({ company: "x".repeat(300), position: "Koch", status: "saved" }).value.company.length, 120);
  assert.deepEqual(tour.FIRST_APPLICATION_STATUSES.map((s) => s.value), ["saved", "preparing", "applied"]);
});

// ---------------------------------------------------------------- resolveLanding (login / OAuth callback gate) with a stubbed Supabase
const user = (meta, id = "u1") => ({ id, user_metadata: meta });
function stubbed({ meta = { role: "student" }, myRole = "student", row = null, rowError = null, rpcError = null, metaError = null } = {}) {
  const calls = { rpc: [], update: [], from: [] };
  globalThis.__supabaseStub = {
    getUser: async () => ({ data: { user: meta === null ? null : user(meta) }, error: null }),
    updateUser: async (attrs) => { calls.update.push(attrs); return metaError ? { data: null, error: metaError } : { data: {}, error: null }; },
    rpc: async (name, args) => {
      calls.rpc.push([name, args]);
      if (name === "social_my_profile") return { data: [{ role: myRole, display_name: "Lena" }], error: null };
      if (name === "onboarding_tour_set") return rpcError ? { data: null, error: rpcError } : { data: "2026-11-14T10:00:00Z", error: null };
      return { data: null, error: null };
    },
    from: async (table, ops) => { calls.from.push([table, ops]); return { data: row, error: rowError }; },
  };
  return calls;
}
beforeEach(() => { role.clearRoleCache(); });

test("gate: new student (no profile row) goes to the dashboard (tour is an overlay now, SPEC-FLOW §6.7), ?next survives", async () => {
  // Access model (FLOW G8): a "Schule" signup is asked for the class code once first; after that (class_code_asked) the tour.
  stubbed();
  assert.equal(await role.resolveLanding(null), "/onboarding/klasse");
  role.clearRoleCache();
  stubbed({ meta: { role: "student", class_code_asked: true } });
  assert.equal(await role.resolveLanding(null), "/dashboard");
  role.clearRoleCache();
  stubbed({ meta: { role: "student", class_code_asked: true } });
  assert.equal(await role.resolveLanding("/search?q=Koch"), "/search?q=Koch");
  role.clearRoleCache();
  // Invite links come before the tour (FLOW G17).
  assert.equal(await role.resolveLanding("/classes/join/tok123"), "/classes/join/tok123");
});

test("gate: finished tour (DB) or flags go straight to the target", async () => {
  stubbed({ row: { onboarding_tour_completed_at: "2026-11-14T10:00:00Z", onboarding_tour_step: 4 } });
  assert.equal(await role.resolveLanding("/search?q=Koch"), "/search?q=Koch");
  role.clearRoleCache();
  const calls = stubbed({ meta: { role: "student", onboarding_tour_done: true } });
  assert.equal(await role.resolveLanding("/classes/join/tok123"), "/classes/join/tok123");
  assert.equal(calls.from.length, 0, "flag set: no DB read at all");
  role.clearRoleCache();
  stubbed({ meta: { role: "student", student_onboarded: true } });
  assert.equal(await role.resolveLanding(null), "/dashboard", "existing users of the former onboarding");
});

test("gate: old DB without the column never throws and never routes to the removed wizard", async () => {
  stubbed({ meta: { role: "student", class_code_asked: true }, rowError: { code: "42703", message: "column profiles.onboarding_tour_completed_at does not exist" } });
  assert.equal(await role.resolveLanding(null), "/dashboard");
  role.clearRoleCache();
  stubbed({ meta: { role: "student", onboarding_tour_done: true }, rowError: { code: "42703", message: "x" } });
  assert.equal(await role.resolveLanding(null), "/dashboard");
});

test("gate: teachers and role choice are untouched", async () => {
  stubbed({ meta: { role: "teacher" }, myRole: "teacher" });
  assert.equal(await role.resolveLanding(null), "/teacher");
  role.clearRoleCache();
  stubbed({ meta: { role: "teacher", teacher_onboarded: true }, myRole: "teacher" });
  assert.equal(await role.resolveLanding("/dashboard"), "/teacher");
  role.clearRoleCache();
  stubbed({ meta: {} });
  assert.equal(await role.resolveLanding("/classes/join/X"), role.funnelGoogleHref("/classes/join/X"), "no role yet: funnel in authenticated mode (old role picker retired)");
  role.clearRoleCache();
  stubbed({ meta: null });
  assert.equal(await role.resolveLanding(null), "/login");
});

// ---------------------------------------------------------------- persistence helpers
test("completeTour sets the RPC + both auth flags; a missing RPC (old DB) is not an error", async () => {
  let calls = stubbed();
  await tour.completeTour(4);
  assert.deepEqual(calls.rpc.find((c) => c[0] === "onboarding_tour_set")[1], { p_step: 4, p_complete: true });
  assert.deepEqual(calls.update[0], { data: { onboarding_tour_done: true, student_onboarded: true } });

  calls = stubbed({ rpcError: { code: "PGRST202", message: "Could not find the function public.onboarding_tour_set" } });
  await tour.completeTour(1);
  assert.equal(calls.update.length, 1);

  stubbed({ rpcError: { code: "500", message: "down" }, metaError: { message: "down" } });
  await assert.rejects(() => tour.completeTour(1), "both failed: the user sees an error and can retry");
});

test("saveTourStep and loadTourStatus never throw", async () => {
  stubbed({ rpcError: { code: "42883", message: "function public.onboarding_tour_set does not exist" } });
  await tour.saveTourStep(2);
  stubbed({ rowError: { code: "42703", message: "no column" } });
  assert.deepEqual(await tour.loadTourStatus("u1"), tour.UNKNOWN_TOUR);
  const calls = stubbed({ row: { onboarding_tour_completed_at: null, onboarding_tour_step: 2 } });
  assert.deepEqual(await tour.loadTourStatus(), { available: true, completed: false, step: 2 });
  assert.deepEqual(calls.from[0], ["profiles", { select: "onboarding_tour_completed_at,onboarding_tour_step", eq: [["user_id", "u1"]] }]);
  globalThis.__supabaseStub = { getUser: async () => { throw new Error("offline"); } };
  assert.deepEqual(await tour.loadTourStatus(), tour.UNKNOWN_TOUR);
});

// ---------------------------------------------------------------- source checks (UI contract)
test("old wizard removed (SPEC-FLOW §6.7): /onboarding redirects, «Tour wiederholen» for every role in the settings", async () => {
  const page = await readFile(new URL("../app/onboarding/page.tsx", import.meta.url), "utf8");
  const settings = await readFile(new URL("../app/settings/page.tsx", import.meta.url), "utf8");
  const replay = await readFile(new URL("../components/settings/tour-replay.tsx", import.meta.url), "utf8");
  assert.match(page, /studentWizardRedirect/);
  assert.doesNotMatch(page, /StudentOnboarding/);
  for (const gone of ["student-onboarding.tsx", "tour-progress.tsx"])
    await assert.rejects(readFile(new URL(`../components/onboarding/${gone}`, import.meta.url)), `${gone} deleted`);
  assert.match(settings, /^\s*<TourReplaySection \/>/m, "no student-only gate");
  assert.match(replay, /Tour wiederholen/);
  assert.match(replay, /replayHref/);
  assert.doesNotMatch(replay, /ß/);
});
