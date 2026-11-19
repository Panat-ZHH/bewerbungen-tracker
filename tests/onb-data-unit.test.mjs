// Unit tests for the onb-data pure modules (SPEC-DATA §6.1): lib/funnel/{validate,next,storage,apply}.ts, lib/tour/state.ts,
// lib/role.ts funnel routing, lib/rewards.ts weekly goal, lib/next-step.ts help hint, and TS ↔ SQL parity (migration parsed as text).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadLib } from "./helpers/load-lib.mjs";

// ---- minimal browser storage (the modules read window.localStorage / sessionStorage lazily) ----
function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, _m: m };
}
globalThis.window = { localStorage: memStorage(), sessionStorage: memStorage() };
globalThis.localStorage = globalThis.window.localStorage;

const types = await loadLib("funnel/types");
const v = await loadLib("funnel/validate");
const nx = await loadLib("funnel/next");
const st = await loadLib("funnel/storage");
const ap = await loadLib("funnel/apply");
const tour = await loadLib("tour/state");
const role = await loadLib("role");
const rewards = await loadLib("rewards");
const ns = await loadLib("next-step");
const core = await loadLib("onboarding-core");
const geo = await loadLib("geo/cantons");
const storage = await loadLib("storage");

const ROOT = join(import.meta.dirname, "..");
const SQL = readFileSync(join(ROOT, "supabase/migrations/20261119100000_onboarding_funnel.sql"), "utf8");
const sqlArray = (name) => {
  const m = SQL.match(new RegExp(`${name} constant text\\[\\] := array\\[([^\\]]*)\\]`));
  assert.ok(m, `array ${name} in migration`);
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
};

const NOW = new Date("2026-11-19T12:00:00Z");
const student = (over = {}) => ({ v: 1, role: "student", firstName: "Lea", birthYear: 2011, schoolLevel: core.SCHOOL_LEVELS[2], canton: "ZH", weeklyGoal: 3, ...over });

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); globalThis.__supabaseStub = undefined; st.clearFunnelState(); });

// ---------------- parity TS ↔ SQL ----------------
test("parity: school levels, cantons, help enums, payload keys equal the SQL arrays", () => {
  assert.deepEqual(sqlArray("levels"), [...core.SCHOOL_LEVELS]);
  assert.deepEqual(sqlArray("cantons"), [...geo.CANTON_CODES].sort());
  assert.equal(new Set(geo.CANTON_CODES).size, 26);
  assert.deepEqual(sqlArray("help_student"), [...types.HELP_STUDENT]);
  assert.deepEqual(sqlArray("help_parent"), [...types.HELP_PARENT]);
  assert.deepEqual(sqlArray("keys"), [...types.PAYLOAD_KEYS]);
  const check = SQL.match(/help_wishes <@ array\[([^\]]*)\]/);
  assert.deepEqual(new Set([...check[1].matchAll(/'([^']*)'/g)].map((x) => x[1])), new Set([...types.HELP_STUDENT, ...types.HELP_PARENT]));
});

test("parity: CLEARED_PROFILE contains the new columns with cleared values", () => {
  assert.equal(storage.CLEARED_PROFILE.weekly_goal, null);
  assert.deepEqual(storage.CLEARED_PROFILE.help_wishes, []);
  assert.equal("funnel_completed_at" in storage.CLEARED_PROFILE, false, "funnel_completed_at is kept on clear (apply-once)");
});

// ---------------- validatePayload ----------------
test("validatePayload: happy paths per role", () => {
  assert.deepEqual(v.validatePayload(student(), NOW), { ok: true });
  assert.deepEqual(v.validatePayload(student({ professions: ["Informatiker/in EFZ"], startYear: 2027, help: ["lebenslauf", "brief"], place: "Winterthur" }), NOW), { ok: true });
  assert.deepEqual(v.validatePayload({ v: 1, role: "parent", firstName: "Sandra", help: ["fristen"] }, NOW), { ok: true });
  assert.deepEqual(v.validatePayload({ v: 1, role: "staff", skipped: true }, NOW), { ok: true });
  assert.deepEqual(v.validatePayload({ v: 1, role: "student", skipped: true }, NOW), { ok: true });
});

test("validatePayload: every rule names its field", () => {
  const cases = [
    [null, "size"], [[], "size"], ["x", "size"], [{ ...student(), firstName: "x".repeat(5000) }, "size"],
    [{ ...student(), email: "a@b.ch" }, "key"], [{ ...student(), skipped: "yes" }, "key"],
    [student({ v: 2 }), "v"], [student({ role: "admin" }), "role"], [student({ role: "school_admin" }), "role"], [student({ role: "teacher" }), "role"],
    [student({ firstName: "" }), "firstName"], [student({ firstName: "   " }), "firstName"], [student({ firstName: "x".repeat(41) }), "firstName"],
    [student({ firstName: "1234" }), "firstName"], [student({ firstName: "Le\u0000a" }), "firstName"], [student({ firstName: "Le\u0085a" }), "firstName"],
    [student({ firstName: 42 }), "firstName"], [student({ firstName: "‮​" }), "firstName"],
    [student({ birthYear: "2011" }), "birthYear"], [student({ birthYear: 2011.5 }), "birthYear"], [student({ birthYear: 1e3 }), "birthYear"],
    [student({ birthYear: 2019 }), "birthYear"], [student({ birthYear: 1925 }), "birthYear"], [student({ birthYear: undefined }), "birthYear"],
    [student({ schoolLevel: "Sek" }), "schoolLevel"], [student({ canton: "zh" }), "canton"], [student({ canton: "XX" }), "canton"],
    [student({ place: "x".repeat(61) }), "place"], [student({ place: 3 }), "place"], [student({ place: "a\u0000" }), "place"],
    [student({ unsure: "no" }), "unsure"],
    [student({ professions: ["a", "b", "c", "d"] }), "professions"], [student({ professions: "Koch" }), "professions"], [student({ professions: [1] }), "professions"],
    [student({ professions: [""] }), "professions"], [student({ professions: ["x".repeat(61)] }), "professions"], [student({ unsure: true, professions: ["Koch"] }), "professions"],
    [student({ startYear: 2024 }), "startYear"], [student({ startYear: 2031 }), "startYear"], [student({ startYear: "2027" }), "startYear"],
    [student({ weeklyGoal: 0 }), "weeklyGoal"], [student({ weeklyGoal: 11 }), "weeklyGoal"], [student({ weeklyGoal: 3.5 }), "weeklyGoal"], [student({ weeklyGoal: "3" }), "weeklyGoal"],
    [student({ help: ["fristen"] }), "help"], [student({ help: "brief" }), "help"], [student({ help: [1] }), "help"], [student({ help: Array(6).fill("brief") }), "help"],
    [{ v: 1, role: "parent", firstName: "Sandra", help: ["lebenslauf"] }, "help"],
  ];
  for (const [p, field] of cases) assert.deepEqual(v.validatePayload(p, NOW), { ok: false, field }, JSON.stringify(p)?.slice(0, 120));
});

test("validatePayload: year bounds follow `now` (around New Year)", () => {
  const dec = new Date("2026-12-31T22:00:00Z"); const jan = new Date("2027-01-01T12:00:00Z");
  assert.equal(v.validatePayload(student({ birthYear: 2018 }), dec).ok, true);
  assert.equal(v.validatePayload(student({ birthYear: 2019 }), dec).ok, false);
  assert.equal(v.validatePayload(student({ birthYear: 2019 }), jan).ok, true);
  assert.deepEqual(v.startYearRange(jan), { min: 2026, max: 2031 });
});

test("cleanText strips invisible/bidi chars, keeps ZWJ emoji, collapses spaces; dedupe is case-insensitive", () => {
  assert.equal(v.cleanText("  Le​a ‮  Müller﻿ "), "Lea Müller");
  assert.equal(v.cleanText("👩‍💻 Mia"), "👩‍💻 Mia");
  assert.deepEqual(v.dedupeProfessions(["Koch EFZ", "koch efz", " Koch  EFZ ", "Maler"]), ["Koch EFZ", "Maler"]);
  assert.equal(v.firstNameProblem("Zoë-Anna"), false);
  assert.equal(v.firstNameProblem("<script>alert(1)</script>"), false, "rendered escaped by React; not a validation concern");
});

// ---------------- parseFunnelState / toPayload ----------------
test("L1 firstNameProblem: Hangul fillers / tag characters are not a visible letter; real Hangul and names with tags left over pass", () => {
  for (const bad of ["\u3164", "\u115F", "\u1160", "\uFFA0", "\u{E0041}\u{E007F}", " \u3164 \u{E0020} "]) assert.equal(v.firstNameProblem(bad), true, JSON.stringify(bad));
  for (const ok of ["한글", "Mia\u{E0068}", "\u3164Ben", "李", "Zoë"]) assert.equal(v.firstNameProblem(ok), false, JSON.stringify(ok));
  assert.equal(v.cleanText("Mia\u{E0068}\u{E0069}\u{E007F}"), "Mia");
  assert.equal(v.validatePayload(student({ firstName: "\u3164" }), NOW).field, "firstName");
});

test("parseFunnelState: TTL, future, malformed, wrong version; coercion", () => {
  const now = Date.now();
  const base = { ...v.emptyFunnelState(now), role: "student", firstName: "Lea" };
  assert.equal(v.parseFunnelState(JSON.stringify(base), now).firstName, "Lea");
  assert.equal(v.parseFunnelState({ ...base, updatedAt: now - types.FUNNEL_TTL_MS - 1 }, now), null);
  assert.equal(v.parseFunnelState({ ...base, updatedAt: now + 2 * 86400000 }, now), null);
  assert.equal(v.parseFunnelState("{nope", now), null);
  assert.equal(v.parseFunnelState({ ...base, v: 2 }, now), null);
  assert.equal(v.parseFunnelState("x".repeat(20000), now), null);
  const c = v.parseFunnelState({ ...base, role: "admin", canton: "XX", weeklyGoal: 99, help: ["brief", "brief", "hack"], classCode: "ab-12c", step: "<x>", next: "//evil.com" }, now, nx.funnelNextPath);
  assert.equal(c.role, null); assert.equal(c.canton, ""); assert.equal(c.weeklyGoal, 3); assert.deepEqual(c.help, ["brief"]);
  assert.equal(c.classCode, "AB12C"); assert.equal(c.step, "weg"); assert.equal(c.next, null);
  assert.equal(v.parseFunnelState({ ...base, next: "/familie" }, now, nx.funnelNextPath).next, "/familie");
});

test("toPayload drops transient keys and other-role keys", () => {
  const s = { ...v.emptyFunnelState(), role: "student", firstName: " Lea ", birthYear: 2011, schoolLevel: core.SCHOOL_LEVELS[0], canton: "BE",
    classCode: "ABCD12", family: "jetzt", inviteCode: "ABCDEFGH", parentKid: "code", staffAccess: "licence", professions: ["Koch", "koch"], startYear: 2027,
    help: ["brief", "fristen"], next: "/familie" };
  const p = v.toPayload(s);
  assert.deepEqual(p, { v: 1, role: "student", firstName: "Lea", birthYear: 2011, schoolLevel: core.SCHOOL_LEVELS[0], canton: "BE", professions: ["Koch"], startYear: 2027, weeklyGoal: 3, help: ["brief"] });
  for (const k of ["classCode", "family", "inviteCode", "parentKid", "staffAccess", "step", "next", "startedAt", "updatedAt"]) assert.equal(k in p, false, k);
  assert.deepEqual(v.toPayload({ ...s, role: "parent", help: ["brief", "fristen"] }), { v: 1, role: "parent", firstName: "Lea", help: ["fristen"] });
  assert.deepEqual(v.toPayload({ ...s, role: "staff" }), { v: 1, role: "staff", skipped: true });
  assert.equal(v.toPayload({ ...s, role: null }), null);
  const unsure = v.toPayload({ ...s, unsure: true });
  assert.equal(unsure.unsure, true); assert.equal("professions" in unsure, false); assert.equal("startYear" in unsure, false);
  assert.equal(v.payloadFromState({ ...s, canton: "" }, NOW).field, "canton");
  assert.equal(v.payloadFromState(s, NOW).ok, true);
});

// ---------------- redirects ----------------
test("funnelNextPath: allow-list only; rejects open-redirect tricks", () => {
  for (const ok of ["/dashboard", "/familie", "/familie/einladung/ABCD1234", "/familie/einladung/ABCD1234?fuer=kind", "/classes/join/abc_DEF-12",
    "/invite/abcd", "/teacher", "/schullizenz", "/schul-admin", "/onboarding/klasse", "/settings", "/abo"]) assert.equal(nx.funnelNextPath(ok), ok, ok);
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/login?next=/dashboard", "/dashboard%0d%0aSet-Cookie:x",
    "/dashboard\r\n", "/familie/einladung/abc", "/classes/join/a", "/admin", "/dashboard/../admin", `/invite/${"a".repeat(300)}`, "", null, undefined]) {
    assert.equal(nx.funnelNextPath(bad), null, String(bad));
  }
});

test("funnelRedirect: class code → join, family jetzt → /familie, parent code → invite, else allow-listed next", () => {
  const base = { role: "student", classCode: "", family: null, parentKid: null, inviteCode: "", next: null };
  assert.equal(nx.funnelRedirect({ ...base, classCode: "KL4SSE" }), "/classes/join/KL4SSE?next=%2Fdashboard");
  assert.equal(nx.funnelRedirect({ ...base, family: "jetzt" }), "/familie");
  assert.equal(nx.funnelRedirect({ ...base, role: "parent", parentKid: "code", inviteCode: "ABCD1234" }), "/familie/einladung/ABCD1234");
  assert.equal(nx.funnelRedirect({ ...base, role: "parent", parentKid: "code", inviteCode: "bad" }), null);
  assert.equal(nx.funnelRedirect({ ...base, next: "//evil.com" }), null);
  assert.equal(nx.funnelRedirect({ ...base, next: "/abo" }), "/abo");
  assert.equal(nx.funnelRedirect(null), null);
  assert.equal(nx.withTourParam("/dashboard"), "/dashboard?tour=1");
});

// ---------------- storage ----------------
test("storage: write/read round trip, never stores e-mail in localStorage, confirm record only in sessionStorage", () => {
  const s = { ...v.emptyFunnelState(), role: "parent", firstName: "Sandra", email: "x@y.ch", password: "geheim123" };
  st.writeFunnelState(s);
  const raw = window.localStorage.getItem(types.FUNNEL_KEY);
  assert.ok(raw); assert.doesNotMatch(raw, /x@y\.ch|geheim/);
  assert.equal(st.readFunnelState().firstName, "Sandra");
  st.writeConfirmRecord("lea@example.ch");
  assert.equal(st.readConfirmRecord().email, "lea@example.ch");
  assert.equal(window.localStorage.getItem(types.FUNNEL_CONFIRM_KEY), null);
  for (let i = 0; i < window.localStorage.length; i++) assert.doesNotMatch(window.localStorage.getItem(window.localStorage.key(i)), /@/);
  st.clearFunnelState(); st.clearConfirmRecord();
  assert.equal(st.readFunnelState(), null); assert.equal(st.readConfirmRecord(), null);
});

test("storage: blocked localStorage → in-memory fallback", () => {
  const saved = globalThis.window;
  globalThis.window = { get localStorage() { throw new Error("SecurityError"); }, get sessionStorage() { throw new Error("SecurityError"); } };
  try {
    assert.equal(st.funnelStorageAvailable(), false);
    st.writeFunnelState({ ...v.emptyFunnelState(), role: "student", firstName: "Mia" });
    assert.equal(st.readFunnelState().firstName, "Mia");
  } finally { st.clearFunnelState(); globalThis.window = saved; }
});

// ---------------- apply ----------------
const validState = () => ({ ...v.emptyFunnelState(), role: "student", firstName: "Lea", birthYear: new Date().getFullYear() - 15, schoolLevel: core.SCHOOL_LEVELS[2], canton: "ZH", weeklyGoal: 4, classCode: "KLASSE1" });

test("apply: nothing pending → none, no RPC", async () => {
  const calls = [];
  globalThis.__supabaseStub = { rpc: async (n, a) => { calls.push([n, a]); return { data: null, error: null }; } };
  assert.deepEqual(await ap.applyFunnelIfPending({ user: { id: "u1", user_metadata: {} } }), { status: "none" });
  assert.equal(calls.length, 0);
  assert.equal(ap.hasPendingFunnel({ user_metadata: {} }), false);
  assert.equal(ap.hasPendingFunnel({ user_metadata: { wa_funnel: { v: 1 } } }), true);
});

const createdNow = () => new Date(Date.now() + 5_000).toISOString();

test("apply: own local copy (Google: account created after the funnel started) sent as payload; cleared, goal cached, redirect from class code", async () => {
  const calls = []; const updates = [];
  globalThis.__supabaseStub = {
    rpc: async (n, a) => { calls.push([n, a]); return { data: { applied: true, role: "student", role_mismatch: false, under_16: true }, error: null }; },
    updateUser: async (attrs) => { updates.push(attrs); return { data: { user: null }, error: null }; },
  };
  st.writeFunnelState(validState());
  st.markFunnelOAuth(st.readFunnelState().startedAt); // «Mit Google weiter» in the funnel of this tab (QA-ONB-2 N1)
  const out = await ap.applyFunnelIfPending({ user: { id: "u1", created_at: createdNow(), user_metadata: {} } });
  assert.equal(out.status, "applied"); assert.equal(out.redirect, "/classes/join/KLASSE1?next=%2Fdashboard");
  assert.equal(st.readFunnelOAuth(), null, "marker removed once the call has an answer");
  assert.equal(calls[0][0], "funnel_apply"); assert.equal(calls[0][1].p_answers.firstName, "Lea"); assert.equal("classCode" in calls[0][1].p_answers, false);
  assert.equal(updates[0].data.wa_funnel, null); assert.equal(updates[0].data.role, "student"); assert.equal(updates[0].data.role_confirmed, true);
  assert.equal(updates[0].data.class_code_asked, true, "Google pupil: the funnel asked the Klasse step → never /onboarding/klasse again (fix-test A2)");
  assert.equal(st.readFunnelState(), null);
  assert.equal(window.localStorage.getItem("wendapply-weekly-goal"), "4");
});

test("apply: no local copy but metadata → p_answers null (server reads its own copy); already_done clears", async () => {
  const calls = [];
  globalThis.__supabaseStub = { rpc: async (n, a) => { calls.push(a); return { data: { applied: false, reason: "already_done", role: "student" }, error: null }; }, updateUser: async () => ({ data: {}, error: null }) };
  const out = await ap.applyFunnelIfPending({ user: { id: "u1", user_metadata: { wa_funnel: { v: 1, role: "student" } } } });
  assert.equal(out.status, "skipped"); assert.equal(calls[0].p_answers, null);
});

test("apply: half-finished local copy without metadata is dropped, not sent; errors keep the local copy", async () => {
  const calls = [];
  globalThis.__supabaseStub = { rpc: async (n, a) => { calls.push(a); return { data: null, error: { message: "rate_limited", code: "P0001", details: "429" } }; } };
  st.writeFunnelState({ ...v.emptyFunnelState(), role: "student", firstName: "Lea" });
  assert.deepEqual(await ap.applyFunnelIfPending({ user: { id: "u1", user_metadata: {} } }), { status: "none" });
  assert.equal(calls.length, 0); assert.equal(st.readFunnelState(), null);
  st.writeFunnelState(validState());
  st.markFunnelOAuth(st.readFunnelState().startedAt);
  const out = await ap.applyFunnelIfPending({ user: { id: "u1", created_at: createdNow(), user_metadata: {} } });
  assert.equal(out.status, "error"); assert.equal(out.kind, "rate_limit");
  assert.ok(st.readFunnelState(), "kept for the retry");
  assert.equal(st.readFunnelOAuth(), st.readFunnelState().startedAt, "marker kept for the retry");
  assert.equal(ap.applyErrorKind({ message: "INVALID_FUNNEL", details: "firstName" }), "invalid");
});

test("apply: skipped mode sends {v, role, skipped} from the authenticated funnel (/start?nach=google); elsewhere nothing", async () => {
  const calls = [];
  globalThis.__supabaseStub = { rpc: async (n, a) => { calls.push(a); return { data: { applied: true, role: "teacher", role_mismatch: false, under_16: false }, error: null }; }, updateUser: async () => ({ data: {}, error: null }) };
  const old = { id: "u1", created_at: "2026-01-01T00:00:00Z", user_metadata: {} };
  assert.deepEqual(await ap.applyFunnelIfPending({ user: old, skipped: true, role: "staff" }), { status: "none" });
  assert.equal(calls.length, 0);
  window.location = { pathname: "/start", search: "?schritt=name&nach=google" };
  try {
    const out = await ap.applyFunnelIfPending({ user: old, skipped: true, role: "staff" });
    assert.equal(out.status, "applied"); assert.deepEqual(calls[0].p_answers, { v: 1, role: "staff", skipped: true });
  } finally { delete window.location; }
});

// ---- QA-ONB M1: shared computer (Lena's abandoned funnel, Ben logs in) ----
test("M1 pickFunnelSource: metadata wins (server copy, local ignored); no metadata → local only if created_at ≥ startedAt − 60 s", () => {
  const t0 = Date.parse("2026-11-19T10:00:00Z");
  const lena = { ...validState(), firstName: "Lena", startedAt: t0, updatedAt: t0 + 120_000 };
  const iso = (ms) => new Date(ms).toISOString();
  // metadata copy exists → always the server copy, whatever the local copy says
  assert.deepEqual(ap.pickFunnelSource({ hasMeta: true, local: lena, createdAt: iso(t0 - 3 * 86400000), explicit: false }), { kind: "server", ownLocal: false });
  assert.deepEqual(ap.pickFunnelSource({ hasMeta: true, local: lena, createdAt: iso(t0 + 300_000), explicit: false }), { kind: "server", ownLocal: true });
  assert.deepEqual(ap.pickFunnelSource({ hasMeta: true, local: null, createdAt: iso(t0), explicit: false }), { kind: "server", ownLocal: false });
  assert.equal(ap.pickFunnelSource({ hasMeta: true, local: lena, createdAt: iso(t0), explicit: false, skipped: true, role: "staff" }).kind, "server");
  // no metadata, no funnel-OAuth marker: account older than the funnel (Ben, 3 days) → nothing sent, the copy is dropped
  assert.deepEqual(ap.pickFunnelSource({ hasMeta: false, local: lena, createdAt: iso(t0 - 3 * 86400000), explicit: false }), { kind: "none", clearLocal: true });
  // marker + boundary: 60 s slack (clock skew between browser and GoTrue); marker + older account → server (not_new notice)
  const fromFunnel = { hasMeta: false, local: lena, explicit: false, oauthFromFunnel: true };
  assert.equal(ap.pickFunnelSource({ ...fromFunnel, createdAt: iso(t0 - 60_000) }).kind, "local");
  assert.deepEqual(ap.pickFunnelSource({ ...fromFunnel, createdAt: iso(t0 - 60_001) }), { kind: "server", ownLocal: false });
  // QA-ONB-2 N1 – a new Google account created after the funnel started:
  const newAccount = iso(t0 + 2 * 86400000);
  //   no marker (Google from /login on a shared device) → none, the foreign copy is cleared
  assert.deepEqual(ap.pickFunnelSource({ hasMeta: false, local: lena, createdAt: newAccount, explicit: false }), { kind: "none", clearLocal: true });
  assert.deepEqual(ap.pickFunnelSource({ hasMeta: false, local: lena, createdAt: newAccount, explicit: false, oauthFromFunnel: false }), { kind: "none", clearLocal: true });
  //   marker == startedAt (the funnel's own «Mit Google weiter») → own copy
  const g = ap.pickFunnelSource({ ...fromFunnel, createdAt: newAccount });
  assert.equal(g.kind, "local"); assert.equal(g.payload.firstName, "Lena");
  //   marker + old account (existing Google user who walked the funnel) → server, p_answers null → not_new notice
  assert.deepEqual(ap.pickFunnelSource({ ...fromFunnel, createdAt: iso(t0 - 60 * 86400000) }), { kind: "server", ownLocal: false });
  // authenticated funnel (/start?nach=google, answers typed after the account existed) → own copy
  assert.equal(ap.pickFunnelSource({ hasMeta: false, local: lena, createdAt: iso(t0 - 86400000), explicit: true }).kind, "local");
  // missing / bad created_at → never trust the local copy (even with the marker)
  assert.equal(ap.pickFunnelSource({ ...fromFunnel, createdAt: undefined }).kind, "server");
  assert.equal(ap.pickFunnelSource({ ...fromFunnel, createdAt: "nope" }).kind, "server");
  assert.equal(ap.pickFunnelSource({ hasMeta: false, local: lena, createdAt: undefined, explicit: false }).kind, "none");
  // skipped outside the authenticated funnel with a foreign copy → nothing
  assert.deepEqual(ap.pickFunnelSource({ hasMeta: false, local: lena, createdAt: iso(t0 - 86400000), explicit: false, skipped: true, role: "staff" }), { kind: "none", clearLocal: true });
  assert.deepEqual(ap.pickFunnelSource({ hasMeta: false, local: null, createdAt: iso(t0), explicit: false }), { kind: "none", clearLocal: false });
});

test("M1 apply: Ben (3 days, no metadata) on Lena's computer → no call, Lena's copy gone, role/metadata untouched", async () => {
  const calls = []; const updates = [];
  globalThis.__supabaseStub = { rpc: async (n, a) => { calls.push(a); return { data: { applied: false, reason: "no_answers", role: "student" }, error: null }; }, updateUser: async (x) => { updates.push(x); return { data: {}, error: null }; } };
  st.writeFunnelState({ ...validState(), firstName: "Lena" });
  const ben = { id: "ben", created_at: new Date(Date.now() - 3 * 86400000).toISOString(), user_metadata: { role: "student" } };
  assert.equal(ap.hasPendingFunnel(ben), true, "the copy triggers the call that clears it");
  const out = await ap.applyFunnelIfPending({ user: ben });
  assert.deepEqual(out, { status: "none" });
  assert.deepEqual(calls, []); assert.equal(updates.length, 0, "no role/metadata update");
  assert.equal(st.readFunnelState(), null);
  assert.equal(ap.hasPendingFunnel(ben), false);
  // staff variant (A2): never role staff on the wire
  st.writeFunnelState({ ...v.emptyFunnelState(), role: "staff", staffAccess: "licence" });
  await ap.applyFunnelIfPending({ user: ben });
  assert.deepEqual(calls, []);
  // an old Google account (60 days) that walked the funnel and pressed its «Mit Google weiter» (marker): not_new → the
  // «schon ein Konto» notice still works
  globalThis.__supabaseStub.rpc = async (n, a) => { calls.push(a); return { data: { applied: false, reason: "not_new", role: "student" }, error: null }; };
  st.writeFunnelState(validState());
  st.markFunnelOAuth(st.readFunnelState().startedAt);
  const old = await ap.applyFunnelIfPending({ user: { id: "old", created_at: "2026-09-01T00:00:00Z", user_metadata: {} } });
  assert.equal(old.status, "skipped"); assert.equal(old.result.reason, "not_new"); assert.deepEqual(calls, [{ p_answers: null }]);
  assert.equal(st.readFunnelOAuth(), null);
});

test("N1 apply: brand-new Google account via /login on a device with Lena's complete copy → no call, copy + stale marker cleared", async () => {
  const calls = []; const updates = [];
  globalThis.__supabaseStub = { rpc: async (n, a) => { calls.push(a); return { data: { applied: true, role: "student", role_mismatch: false, under_16: true }, error: null }; }, updateUser: async (x) => { updates.push(x); return { data: {}, error: null }; } };
  const stranger = { id: "new", created_at: createdNow(), user_metadata: {} };
  // no marker (the /login Google button removes it)
  st.writeFunnelState({ ...validState(), firstName: "Lena" });
  assert.deepEqual(await ap.applyFunnelIfPending({ user: stranger }), { status: "none" });
  assert.deepEqual(calls, []); assert.deepEqual(updates, []); assert.equal(st.readFunnelState(), null);
  // a marker from another funnel copy (other startedAt) is not this copy's OAuth either
  st.writeFunnelState({ ...validState(), firstName: "Lena" });
  st.markFunnelOAuth(st.readFunnelState().startedAt - 1);
  assert.deepEqual(await ap.applyFunnelIfPending({ user: stranger }), { status: "none" });
  assert.deepEqual(calls, []); assert.equal(st.readFunnelState(), null); assert.equal(st.readFunnelOAuth(), null, "stale marker removed");
  // staff copy: same
  st.writeFunnelState({ ...v.emptyFunnelState(), role: "staff", staffAccess: "licence" });
  assert.deepEqual(await ap.applyFunnelIfPending({ user: stranger }), { status: "none" });
  assert.deepEqual(calls, []);
});

test("N1 storage: funnel-OAuth marker round trip; junk ignored; blocked storage → no marker", () => {
  assert.equal(st.FUNNEL_OAUTH_KEY, "wendapply.funnel.oauth");
  st.markFunnelOAuth(1763546400000); assert.equal(window.sessionStorage.getItem("wendapply.funnel.oauth"), "1763546400000");
  assert.equal(st.readFunnelOAuth(), 1763546400000);
  st.clearFunnelOAuth(); assert.equal(st.readFunnelOAuth(), null);
  window.sessionStorage.setItem("wendapply.funnel.oauth", "1e12"); assert.equal(st.readFunnelOAuth(), null);
  window.sessionStorage.setItem("wendapply.funnel.oauth", ""); assert.equal(st.readFunnelOAuth(), null);
  const saved = globalThis.window;
  globalThis.window = { get localStorage() { throw new Error("SecurityError"); }, get sessionStorage() { throw new Error("SecurityError"); } };
  try { st.markFunnelOAuth(5); assert.equal(st.readFunnelOAuth(), null); st.clearFunnelOAuth(); } finally { globalThis.window = saved; }
});

test("M1 apply: account with its own metadata copy + someone else's local copy → p_answers null, no local redirect/goal from the foreign copy", async () => {
  const calls = []; const updates = [];
  globalThis.__supabaseStub = {
    rpc: async (n, a) => { calls.push(a); return { data: { applied: true, role: "student", role_mismatch: false, under_16: true }, error: null }; },
    updateUser: async (x) => { updates.push(x); return { data: {}, error: null }; },
  };
  st.writeFunnelState({ ...validState(), firstName: "Lena", weeklyGoal: 7 });
  const own = student({ firstName: "Noah", weeklyGoal: 2 });
  const noah = { id: "noah", created_at: new Date(Date.now() - 2 * 86400000).toISOString(), user_metadata: { wa_funnel: own } };
  const out = await ap.applyFunnelIfPending({ user: noah });
  assert.equal(out.status, "applied"); assert.equal(out.redirect, null, "no class-code redirect from Lena's copy");
  assert.equal(calls[0].p_answers, null);
  assert.equal(updates[0].data.wa_funnel, null); assert.equal(updates[0].data.class_code_asked, undefined, "foreign copy never marks the class code as asked");
  assert.equal(st.readFunnelState(), null, "foreign copy cleared");
  assert.equal(window.localStorage.getItem("wendapply-weekly-goal"), "2", "goal cache from the account's own copy");
});

test("M1 apply: own e-mail sign-up on the same device (metadata + own local copy) → server copy, redirect from own copy kept", async () => {
  const calls = [];
  globalThis.__supabaseStub = { rpc: async (n, a) => { calls.push(a); return { data: { applied: true, role: "student", role_mismatch: false, under_16: true }, error: null }; }, updateUser: async () => ({ data: {}, error: null }) };
  st.writeFunnelState(validState());
  const out = await ap.applyFunnelIfPending({ user: { id: "u2", created_at: createdNow(), user_metadata: { wa_funnel: student() } } });
  assert.equal(calls[0].p_answers, null);
  assert.equal(out.status, "applied"); assert.equal(out.redirect, "/classes/join/KLASSE1?next=%2Fdashboard");
});

// ---------------- tour state ----------------
test("tour: autoStartDecision truth table, role mapping, ?tour=1", () => {
  const d = (o) => tour.autoStartDecision({ funnelCompleted: true, row: null, localFlag: null, version: 1, ...o });
  assert.equal(d({}), true);
  assert.equal(d({ funnelCompleted: false }), false, "pre-release accounts never auto-start");
  assert.equal(d({ row: { status: "skipped", version: 1 } }), false, "skip persists");
  assert.equal(d({ row: { status: "completed", version: 1 } }), false);
  assert.equal(d({ row: { status: "completed", version: 1 }, version: 2 }), true, "new tour version shows again");
  assert.equal(d({ localFlag: "skipped" }), false, "local fallback after a failed save");
  assert.equal(tour.tourForRole("parent"), "eltern"); assert.equal(tour.tourForRole("teacher"), "lehrperson");
  assert.equal(tour.tourForRole("school_admin"), "schule"); assert.equal(tour.tourForRole("student"), "schueler");
  assert.equal(tour.isManualTourStart("?tour=1"), true); assert.equal(tour.isManualTourStart("tour=0"), false); assert.equal(tour.isManualTourStart(null), false);
  assert.equal(tour.isTourId("admin"), false);
});

test("tour: saveTourState failure sets the local flag, retry clears it; shouldAutoStart reads the profile + row", async () => {
  let fail = true; const calls = [];
  globalThis.__supabaseStub = {
    getUser: async () => ({ data: { user: { id: "u9" } }, error: null }),
    rpc: async (n, a) => { calls.push([n, a]); return fail ? { data: null, error: { message: "network" } } : { data: {}, error: null }; },
    from: (t) => (t === "profiles" ? { data: { funnel_completed_at: "2026-11-19T00:00:00Z" }, error: null } : { data: null, error: null }),
  };
  assert.equal(await tour.shouldAutoStart("schueler", "u9"), true);
  await tour.saveTourState("schueler", "skipped", 99);
  assert.equal(calls[0][1].p_step, null, "out-of-range step dropped");
  assert.equal(tour.readLocalFlag("u9", "schueler"), "skipped");
  assert.equal(await tour.shouldAutoStart("schueler", "u9"), false);
  fail = false;
  await tour.retryPendingTourSaves("u9");
  assert.equal(tour.readLocalFlag("u9", "schueler"), null);
  globalThis.__supabaseStub.from = (t) => (t === "profiles" ? { data: { funnel_completed_at: null }, error: null } : { data: null, error: null });
  assert.equal(await tour.shouldAutoStart("schueler", "u9"), false);
});

// ---------------- role routing ----------------
test("role: funnelGoogleHref replaces the role picker; next is allow-listed", () => {
  assert.equal(role.funnelGoogleHref(), "/start?schritt=rolle&nach=google");
  assert.equal(role.funnelGoogleHref("/familie"), "/start?schritt=rolle&nach=google&next=%2Ffamilie");
  assert.equal(role.funnelGoogleHref("//evil.com"), "/start?schritt=rolle&nach=google");
  assert.equal(role.rolePickerRedirect("/abo"), "/start?schritt=rolle&nach=google&next=%2Fabo");
  assert.equal(role.studentWizardRedirect(""), "/dashboard");
  assert.equal(role.studentWizardRedirect("?replay=1"), "/dashboard?tour=1");
});

test("role: needsFunnel only for new accounts without funnel/onboarding, no pending choice, no school admin", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  const base = { createdAt: "2026-11-18T12:00:00Z", profile: null, pendingChoice: false, schoolAdmin: false, now };
  assert.equal(role.needsFunnel(base), true);
  assert.equal(role.needsFunnel({ ...base, createdAt: "2026-11-01T12:00:00Z" }), false);
  assert.equal(role.needsFunnel({ ...base, profile: { funnel_completed_at: "x" } }), false);
  assert.equal(role.needsFunnel({ ...base, profile: { onboarding_completed_at: "x" } }), false);
  assert.equal(role.needsFunnel({ ...base, pendingChoice: true }), false);
  assert.equal(role.needsFunnel({ ...base, schoolAdmin: true }), false);
  assert.equal(role.needsFunnel({ ...base, createdAt: null }), false);
});

test("role: ?tour=1 maps to the user's own tour start; guards keep the param", () => {
  assert.equal(role.tourStartTarget("/dashboard?tour=1", "parent"), "/familie?tour=1");
  assert.equal(role.tourStartTarget("/dashboard?tour=1", "teacher"), "/teacher?tour=1");
  assert.equal(role.tourStartTarget("/dashboard?tour=1", "school_admin"), "/schul-admin?tour=1");
  assert.equal(role.tourStartTarget("/dashboard?tour=1", "student"), "/dashboard?tour=1");
  assert.equal(role.tourStartTarget("/dashboard", "student"), null);
  assert.equal(role.tourStartTarget("//evil.com?tour=1", "student"), null);
  assert.equal(role.keepTourParam("/teacher", "?tour=1"), "/teacher?tour=1");
  assert.equal(role.keepTourParam("/teacher?tour=1", "?tour=1"), "/teacher?tour=1");
  assert.equal(role.keepTourParam("/teacher", ""), "/teacher");
});

// ---------------- weekly goal ----------------
test("rewards: DB goal wins; legacy device goal ≠ 3 migrates once; save is local at once + debounced RPC", async () => {
  assert.deepEqual(rewards.resolveWeeklyGoal(5, 3), { goal: 5, migrate: false });
  assert.deepEqual(rewards.resolveWeeklyGoal(null, 3), { goal: 3, migrate: false });
  assert.deepEqual(rewards.resolveWeeklyGoal(null, 6), { goal: 6, migrate: true });
  assert.deepEqual(rewards.resolveWeeklyGoal(25, 3), { goal: 20, migrate: false });
  assert.deepEqual(rewards.resolveWeeklyGoal("x", 4), { goal: 4, migrate: true });
  const calls = [];
  globalThis.__supabaseStub = {
    getUser: async () => ({ data: { user: { id: "u1" } }, error: null }),
    from: () => ({ data: { weekly_goal: 7 }, error: null }),
    rpc: async (n, a) => { calls.push([n, a]); return { data: null, error: null }; },
  };
  assert.equal(await rewards.loadWeeklyGoal(), 7);
  assert.equal(rewards.readGoal(), 7, "cached locally");
  assert.equal(calls.length, 0);
  rewards.saveWeeklyGoal(4, 5); rewards.saveWeeklyGoal(5, 5);
  assert.equal(rewards.readGoal(), 5);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(calls, [["weekly_goal_set", { p_goal: 5 }]], "debounced to one call");
  globalThis.__supabaseStub.from = () => ({ data: null, error: { message: "PAYWALL" } });
  assert.equal(await rewards.loadWeeklyGoal(), 5, "read error → local value");
});

// ---------------- next step help hint ----------------
test("nextStep: help wishes change only the first step of a user without applications", () => {
  assert.equal(ns.nextStep([], "2026-11-19", { help: ["lebenslauf"], hasCv: false }).href, "/cvs");
  assert.equal(ns.nextStep([], "2026-11-19", { help: ["lebenslauf"], hasCv: true }).href, "/applications/new");
  assert.match(ns.nextStep([], "2026-11-19", { help: ["schnuppern"] }).href, /^\/search/);
  assert.equal(ns.nextStep([], "2026-11-19").href, "/applications/new");
  const withApp = ns.nextStep([{ id: "a", company: "X", status: "applied", deadline: null }], "2026-11-19", { help: ["lebenslauf"], hasCv: false });
  assert.notEqual(withApp.href, "/cvs");
});
