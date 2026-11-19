// Access model UI (docs/access/SPEC.md §1, §6, §7): pure gate rules, the signup role carried through Google (FINDINGS 1),
// my_access loading with the "feature not deployed" fallback, PAYWALL error detection.
import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { loadLib } from "./helpers/load-lib.mjs";

const gate = await loadLib("access/gate");
const client = await loadLib("access/client");
const fam = await loadLib("family-core");
const role = await loadLib("role");

const base = { ...gate.OPEN_ACCESS, enforced: true };
const trial = { ...base, state: "trial", reason: "trial", trial_days_left: 5, trial_ends_at: "2026-11-24T10:00:00Z" };
const expired = { ...base, has_access: false, state: "expired", reason: "none", trial_days_left: 0 };
const parentExpired = { ...expired, account_type: "parent" };
const teacherNoLicence = { ...base, has_access: false, state: "licence_required", role: "teacher" };
const licensedStudent = { ...base, state: "active", reason: "school_licence", school: { id: "s1", name: "Sek Wil", valid_until: "2027-07-31" } };
const blocked = { ...base, has_access: false, state: "blocked", blocked: true };
const grace = { ...base, state: "grace", reason: "grace", grace_until: "2026-12-01T00:00:00Z" };

test("enforced=false never shows a paywall, banner or licence gate (enforcement switch, SPEC §7)", () => {
  for (const a of [expired, teacherNoLicence, blocked, trial, grace]) {
    const off = { ...a, enforced: false };
    assert.equal(gate.accessView(off, "/dashboard"), "page");
    assert.equal(gate.accessBanner(off), null);
  }
  assert.equal(gate.accessView(null, "/dashboard"), "page");
  assert.equal(gate.accessView(gate.OPEN_ACCESS, "/map"), "page");
});

test("expired student: paywall everywhere except the allow-list", () => {
  for (const p of ["/dashboard", "/applications", "/applications/new", "/map", "/cvs", "/search", "/friends", "/analytics", "/profile", "/onboarding"]) assert.equal(gate.accessView(expired, p), "paywall", p);
  for (const p of ["/settings", "/abo", "/abo?checkout=success", "/schullizenz", "/kontakt", "/hilfe", "/datenschutz", "/impressum", "/auth/callback", "/login", "/familie/einladung/ABCD1234", "/classes/join/KLAS7Q2", "/familie"]) assert.equal(gate.accessView(expired, p), "page", p);
});

test("expired parent keeps /familie (create family, invite, pay), paywall elsewhere", () => {
  assert.equal(gate.accessView(parentExpired, "/familie"), "page");
  assert.equal(gate.accessView(parentExpired, "/familie/bezahlen"), "page");
  assert.equal(gate.accessView(parentExpired, "/profile"), "paywall");
  assert.equal(gate.accessLanding(parentExpired), "/familie");
});

test("teacher without licence: licence gate (never paywall / trial), /schullizenz and settings open", () => {
  assert.equal(gate.accessView(teacherNoLicence, "/teacher"), "licence");
  assert.equal(gate.accessView(teacherNoLicence, "/teacher/classes/c1"), "licence");
  assert.equal(gate.accessView({ ...teacherNoLicence, role: "school_admin" }, "/teacher"), "licence");
  assert.equal(gate.accessView(teacherNoLicence, "/schul-admin"), "licence", "teachers do not get the school admin page");
  assert.equal(gate.accessView(teacherNoLicence, "/schullizenz"), "page");
  assert.equal(gate.accessView(teacherNoLicence, "/settings"), "page");
  assert.equal(gate.accessLanding(teacherNoLicence), "/schullizenz");
  assert.equal(gate.accessBanner({ ...trial, role: "teacher" }), null);
  assert.deepEqual(gate.aboPlansFor(teacherNoLicence), []);
});

test("blocked: blocked page everywhere except settings/contact/legal, also no /abo", () => {
  assert.equal(gate.accessView(blocked, "/dashboard"), "blocked");
  assert.equal(gate.accessView(blocked, "/abo"), "blocked");
  assert.equal(gate.accessView(blocked, "/settings"), "page");
  assert.equal(gate.accessView(blocked, "/kontakt"), "page");
  // Blocked wins even when has_access would be true.
  assert.equal(gate.accessView({ ...blocked, has_access: true }, "/dashboard"), "blocked");
});

test("banners: trial countdown, grace; none for paid, school licence, staff", () => {
  assert.deepEqual(gate.accessBanner(trial), { kind: "trial", daysLeft: 5, endsAt: trial.trial_ends_at });
  assert.deepEqual(gate.accessBanner(grace), { kind: "grace", until: grace.grace_until });
  assert.equal(gate.accessBanner({ ...base, state: "active", reason: "subscription" }), null);
  assert.equal(gate.accessBanner({ ...trial, reason: "school_licence" }), null);
  assert.equal(gate.accessBanner(licensedStudent), null);
  assert.equal(gate.hidesPrices(licensedStudent), true);
  assert.equal(gate.hidesPrices(trial), false);
  assert.equal(gate.daysLeftText(7), "noch 7 Tage");
  assert.equal(gate.daysLeftText(1), "noch 1 Tag");
  assert.equal(gate.daysLeftText(0), "heute letzter Tag");
});

test("abo plans per role: parents family only, students solo + family", () => {
  assert.deepEqual(gate.aboPlansFor({ account_type: "parent", role: "parent" }), ["family"]);
  assert.deepEqual(gate.aboPlansFor({ account_type: "independent_student", role: "student" }), ["solo", "family"]);
});

test("PAYWALL detection: Postgres message, HTTP 402, API body", () => {
  assert.equal(gate.isPaywallError({ code: "P0001", message: "PAYWALL" }), true);
  assert.equal(gate.isPaywallError({ status: 402 }), true);
  assert.equal(gate.isPaywallError({ error: "paywall" }), true);
  assert.equal(gate.isPaywallError("PAYWALL"), true);
  assert.equal(gate.isPaywallError({ code: "42501", message: "permission denied" }), false);
  assert.equal(gate.isPaywallError(null), false);
  // restrictive RLS policies of the backend (20261118020000_access_guards.sql) name themselves "access gate …"
  assert.equal(gate.isPaywallError({ code: "42501", message: 'new row violates row-level security policy "access gate insert" for table "applications"' }), true);
  assert.equal(gate.isPaywallError({ code: "42501", message: 'new row violates row-level security policy for table "applications"' }), false);
  assert.equal(gate.isPaywallError({ code: "P0001", message: "FORBIDDEN" }), false);
});

test("fetch watcher body detection: PAYWALL, access-gate RLS (escaped JSON), storage RLS without policy name", async () => {
  const { paywallBody } = gate;
  assert.equal(paywallBody('{"code":"P0001","message":"PAYWALL"}'), true);
  assert.equal(paywallBody('{"code":"42501","message":"new row violates row-level security policy \\"access gate update\\" for table \\"cvs\\""}'), true);
  assert.equal(paywallBody('{"statusCode":"403","message":"new row violates row-level security policy"}', "https://x.supabase.co/storage/v1/object/cvs/a.pdf"), true);
  assert.equal(paywallBody('{"code":"42501","message":"new row violates row-level security policy for table \\"applications\\""}', "https://x.supabase.co/rest/v1/applications"), false);
});

test("readAccessInfo: defensive parsing, unknown shape = null", () => {
  assert.equal(gate.readAccessInfo(null), null);
  assert.equal(gate.readAccessInfo({ foo: 1 }), null);
  const r = gate.readAccessInfo([{ has_access: false, state: "expired", enforced: true }]);
  assert.equal(r.has_access, false);
  assert.equal(r.enforced, true);
  assert.equal(r.role, "student");
  assert.equal(gate.readAccessInfo({ has_access: true }).enforced, false);
});

beforeEach(() => { client.clearAccessCache(); globalThis.__supabaseStub = {}; });

test("loadMyAccess: my_access not deployed (PGRST202) = full access, no UI; cached per user", async () => {
  let calls = 0;
  globalThis.__supabaseStub = { rpc: async (name) => { calls++; assert.equal(name, "my_access"); return { data: null, error: { code: "PGRST202", message: "Could not find the function public.my_access" } }; } };
  const a = await client.loadMyAccess({ userId: "u1" });
  assert.equal(a.has_access, true);
  assert.equal(a.enforced, false);
  await client.loadMyAccess({ userId: "u1" });
  assert.equal(calls, 1, "cached for the session");
  await client.loadMyAccess({ userId: "u1", force: true });
  assert.equal(calls, 2, "force re-reads (billing return, focus, PAYWALL)");
});

test("loadMyAccess: real answer is parsed; another user is not served from the cache", async () => {
  globalThis.__supabaseStub = { rpc: async () => ({ data: { ...expired }, error: null }) };
  const a = await client.loadMyAccess({ userId: "u1" });
  assert.equal(a.state, "expired");
  assert.equal(client.cachedAccess("u2"), null);
  assert.equal(client.cachedAccess("u1").state, "expired");
});

test("pending signup (wa_pending_signup): encode/decode, expiry, invalid values", () => {
  const now = Date.UTC(2026, 10, 17);
  const raw = fam.encodePendingSignup("parent", null, now);
  assert.deepEqual(fam.decodePendingSignup(raw, now + 1000), { choice: "parent", birthYear: null, at: now });
  assert.equal(fam.decodePendingSignup(raw, now + fam.PENDING_SIGNUP_TTL_MS + 1), null, "expired");
  assert.equal(fam.decodePendingSignup("{bad", now), null);
  assert.equal(fam.decodePendingSignup(JSON.stringify({ choice: "admin", at: now }), now), null);
  const ind = fam.decodePendingSignup(fam.encodePendingSignup("independent", 2010, now), now);
  assert.equal(ind.birthYear, 2010);
  assert.equal(fam.decodePendingSignup(fam.encodePendingSignup("parent", 2010, now), now).birthYear, null, "birth year only for private students");
});

test("knownSignupChoice: pending wins; family invite ?fuer= presets the role; otherwise unknown", () => {
  const pending = { choice: "teacher", birthYear: null, at: 1 };
  assert.deepEqual(fam.knownSignupChoice(pending, "/familie/einladung/ABCD1234"), { choice: "teacher", birthYear: null });
  assert.deepEqual(fam.knownSignupChoice(null, "/familie/einladung/ABCD1234?fuer=kind"), { choice: "independent", birthYear: null });
  assert.deepEqual(fam.knownSignupChoice(null, "/familie/einladung/ABCD1234"), { choice: "parent", birthYear: null });
  assert.equal(fam.knownSignupChoice(null, "/dashboard"), null);
  assert.equal(fam.knownSignupChoice(null, null), null);
});

/** Minimal browser storage for role.ts (sessionStorage + localStorage). */
function fakeWindow() {
  const mk = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  return { sessionStorage: mk(), localStorage: mk() };
}

test("FINDINGS 1: Google signup as parent is applied in /auth/callback, the picker is never shown", async () => {
  globalThis.window = fakeWindow();
  try {
    role.storePendingSignup("parent", null);
    assert.ok(globalThis.window.localStorage.getItem("wa_pending_signup"), "stored in localStorage too (new tab)");
    let meta = {}; // fresh Google user: no role
    const rpcCalls = [];
    globalThis.__supabaseStub = {
      getUser: async () => ({ data: { user: { id: "g1", user_metadata: { ...meta } } }, error: null }),
      updateUser: async ({ data }) => { meta = { ...meta, ...data }; return { data: { user: { id: "g1", user_metadata: { ...meta } } }, error: null }; },
      rpc: async (name, args) => {
        rpcCalls.push([name, args]);
        if (name === "social_my_profile") return { data: [{ role: "student", display_name: "" }], error: null };
        if (name === "my_access") return { data: { ...trial, account_type: "parent", role: "parent" }, error: null };
        return { data: null, error: null };
      },
      from: async () => ({ data: null, error: null }),
    };
    role.clearRoleCache();
    const target = await role.resolveLanding(null);
    assert.equal(target, "/familie");
    assert.notEqual(target.startsWith("/auth/role"), true);
    assert.equal(meta.role, "student");
    assert.equal(meta.account_type, "parent");
    assert.equal(meta.role_confirmed, true);
    assert.ok(rpcCalls.some(([n, a]) => n === "set_my_role" && a.p_role === "student"));
    assert.ok(rpcCalls.some(([n, a]) => n === "account_set_type" && a.p_type === "parent"));
    assert.equal(globalThis.window.sessionStorage.getItem("wa_pending_signup"), null, "used once");
    assert.equal(globalThis.window.localStorage.getItem("wa_pending_signup"), null, "used once");
  } finally { delete globalThis.window; }
});

test("Google signup as teacher without licence lands on /schullizenz; nothing known → the funnel asks (onboarding 2026-11-19)", async () => {
  globalThis.window = fakeWindow();
  try {
    role.storePendingSignup("teacher", null);
    let meta = {};
    globalThis.__supabaseStub = {
      getUser: async () => ({ data: { user: { id: "t9", user_metadata: { ...meta } } }, error: null }),
      updateUser: async ({ data }) => { meta = { ...meta, ...data }; return { data: { user: { id: "t9", user_metadata: { ...meta } } }, error: null }; },
      rpc: async (name) => name === "social_my_profile" ? { data: [{ role: "teacher", display_name: "" }], error: null } : name === "my_access" ? { data: teacherNoLicence, error: null } : { data: null, error: null },
    };
    role.clearRoleCache();
    assert.equal(await role.resolveLanding(null), "/schullizenz");
    assert.equal(meta.role, "teacher");

    // A second fresh account without any pending choice and no server knowledge: the funnel asks (replaces the old /auth/role picker).
    client.clearAccessCache(); role.clearRoleCache();
    meta = {};
    globalThis.__supabaseStub.rpc = async (name) => name === "my_access" ? { data: null, error: { code: "PGRST202" } } : { data: null, error: null };
    globalThis.__supabaseStub.getUser = async () => ({ data: { user: { id: "n1", user_metadata: {} } }, error: null });
    assert.equal(await role.resolveLanding(null), "/start?schritt=rolle&nach=google");
  } finally { delete globalThis.window; }
});

test("server already knows the account type (FINDINGS 2): no picker even without metadata", async () => {
  let meta = {};
  globalThis.__supabaseStub = {
    getUser: async () => ({ data: { user: { id: "p2", user_metadata: { ...meta } } }, error: null }),
    updateUser: async ({ data }) => { meta = { ...meta, ...data }; return { data: { user: { id: "p2", user_metadata: { ...meta } } }, error: null }; },
    rpc: async (name) => name === "social_my_profile" ? { data: [{ role: "student", display_name: "" }], error: null } : name === "my_access" ? { data: { ...trial, account_type: "parent" }, error: null } : { data: null, error: null },
  };
  role.clearRoleCache();
  assert.equal(await role.resolveLanding(null), "/familie");
  assert.equal(meta.account_type, "parent");
});

test("funnel stores the role before 'Mit Google weiter' and the callback saves the plan, then runs resolveLanding", () => {
  // Sign-up moved from /login to the funnel /start (SPEC-FLOW D3/D4): the role travels with storePendingSignup there.
  const account = readFileSync(new URL("../components/funnel/account.tsx", import.meta.url), "utf8");
  const fn = account.slice(account.indexOf("async function google"), account.indexOf("const hint = passwordHint"));
  assert.ok(fn.indexOf("storePendingSignup(") > 0 && fn.indexOf("storePendingSignup(") < fn.indexOf("signInWithOAuth"), "stored before the redirect");
  const login = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(login, /Gratis für Schüler/);
  assert.doesNotMatch(login, /supabase\.auth\.signUp\(/, "/login is login only");
  const callback = readFileSync(new URL("../app/auth/callback/page.tsx", import.meta.url), "utf8");
  assert.match(callback, /useFunnelSave\(/);
  const saving = readFileSync(new URL("../components/funnel/saving.tsx", import.meta.url), "utf8");
  assert.match(saving, /resolveLanding\(/);
});

test("shell + teacher layout use the gate; family trial row no longer grants access (no 30-day trial)", () => {
  const shell = readFileSync(new URL("../components/layout/workspace-shell.tsx", import.meta.url), "utf8");
  assert.match(shell, /accessView\(/);
  assert.match(shell, /AccessGatePage/);
  const teacher = readFileSync(new URL("../app/teacher/layout.tsx", import.meta.url), "utf8");
  assert.match(teacher, /LICENCE_PATH/);
  assert.equal(fam.planGivesAccess({ planType: "family", status: "trial", state: "trial", seatsParents: 1, seatsChildren: 1, trialEndsAt: null }), false);
  assert.equal(fam.planGivesAccess({ planType: "family", status: "active", state: "active", seatsParents: 1, seatsChildren: 1, trialEndsAt: null }), true);
  assert.doesNotMatch(fam.childPlanLine(null).text, /kostenlos/);
});

// ---------------------------------------------------------------- flow-analysis gaps (FLOW-ANALYSIS.md, SPEC §8)
test("G1: /classes (code field) and /classes/join/* stay open under the paywall; paywall offers 'Klassencode eingeben'", () => {
  assert.equal(gate.accessView(expired, "/classes"), "page");
  assert.equal(gate.accessView(expired, "/classes/join/ABC123"), "page");
  assert.equal(gate.accessView(expired, "/classes/c1"), "paywall");
  const pages = readFileSync(new URL("../components/access/access-pages.tsx", import.meta.url), "utf8");
  assert.match(pages, /Klassencode eingeben/);
});

test("G3: /familie + /familie/einladung/* open for students and parents under the paywall", () => {
  assert.equal(gate.accessView(expired, "/familie"), "page");
  assert.equal(gate.accessView(expired, "/familie/einladung/ABCD1234"), "page");
});

test("G6: school admins land on /schul-admin, keep it under the licence gate, never the role picker", async () => {
  const admin = { ...base, has_access: false, state: "licence_required", role: "school_admin" };
  assert.equal(gate.accessView(admin, "/schul-admin"), "page");
  assert.equal(gate.accessView(admin, "/dashboard"), "licence");
  assert.equal(gate.accessLanding(admin), "/schul-admin");
  assert.equal(gate.isSchoolAdmin(admin), true);
  assert.equal(gate.isSchoolAdmin(gate.OPEN_ACCESS), false, "fallback is never an admin");

  let meta = {};
  globalThis.__supabaseStub = {
    getUser: async () => ({ data: { user: { id: "sa1", user_metadata: { ...meta } } }, error: null }),
    updateUser: async ({ data }) => { meta = { ...meta, ...data }; return { data: { user: { id: "sa1", user_metadata: { ...meta } } }, error: null }; },
    rpc: async (name) => name === "my_access" ? { data: { ...base, role: "school_admin", reason: "school_licence" }, error: null } : name === "social_my_profile" ? { data: [{ role: "student", display_name: "" }], error: null } : { data: null, error: null },
  };
  role.clearRoleCache();
  assert.equal(await role.resolveLanding(null), "/schul-admin");
  assert.equal(meta.role_confirmed, true);
  assert.equal(meta.account_type, undefined, "not turned into a student type");
});

test("G7: paywall and licence gate offer 'Falsche Rolle gewählt?' → picker in switch mode", () => {
  const pages = readFileSync(new URL("../components/access/access-pages.tsx", import.meta.url), "utf8");
  assert.match(pages, /Falsche Rolle gewählt\?/);
  assert.match(pages, /\/auth\/role\?wechseln=1/);
  const picker = readFileSync(new URL("../app/auth/role/page.tsx", import.meta.url), "utf8");
  assert.match(picker, /wechseln/);
});

test("G8: 'Schule' signups get the class code step once, before the tour", () => {
  assert.equal(role.needsClassCodeStep({ role: "student" }, null), true);
  assert.equal(role.needsClassCodeStep({ role: "student", class_code_asked: true }, null), false);
  assert.equal(role.needsClassCodeStep({ role: "student", account_type: "independent_student" }, null), false);
  assert.equal(role.needsClassCodeStep({ role: "student" }, { reason: "school_licence" }), false);
  assert.equal(role.needsClassCodeStep({ role: "teacher" }, null), false);
  assert.equal(role.classCodeHref("/dashboard"), "/onboarding/klasse?next=%2Fdashboard");
});

test("G8 + G23: new school student → class code step; teacher-only ?next= is dropped before the tour", async () => {
  globalThis.__supabaseStub = {
    getUser: async () => ({ data: { user: { id: "s5", user_metadata: { role: "student" } } }, error: null }),
    rpc: async (name) => name === "social_my_profile" ? { data: [{ role: "student", display_name: "" }], error: null } : name === "class_my_classes" ? { data: [], error: null } : name === "my_access" ? { data: trial, error: null } : { data: null, error: null },
    from: async () => ({ data: null, error: null }),
  };
  role.clearRoleCache();
  assert.equal(await role.resolveLanding("/teacher/classes"), "/onboarding/klasse");
  client.clearAccessCache(); role.clearRoleCache();
  globalThis.__supabaseStub.getUser = async () => ({ data: { user: { id: "s6", user_metadata: { role: "student", class_code_asked: true } } }, error: null });
  // The old /onboarding wizard is retired (SPEC-FLOW D7): the product tour starts on the dashboard.
  assert.equal(await role.resolveLanding("/teacher/classes"), "/dashboard");
});

test("G17: invite links come before the tour", async () => {
  globalThis.__supabaseStub = {
    getUser: async () => ({ data: { user: { id: "s7", user_metadata: { role: "student", account_type: "independent_student" } } }, error: null }),
    rpc: async (name) => name === "social_my_profile" ? { data: [{ role: "student", display_name: "" }], error: null } : name === "my_access" ? { data: trial, error: null } : { data: null, error: null },
    from: async () => ({ data: null, error: null }),
  };
  role.clearRoleCache();
  assert.equal(await role.resolveLanding("/familie/einladung/ABCD1234?fuer=kind"), "/familie/einladung/ABCD1234?fuer=kind");
  assert.equal(role.isInvitePath("/classes/join/X1"), true);
  assert.equal(role.isInvitePath("/dashboard"), false);
});

test("G10: shell lets /settings through without a role; G16 wrong-role notices; G18 signup tab; G26 logout clears invites", () => {
  const shell = readFileSync(new URL("../components/layout/workspace-shell.tsx", import.meta.url), "utf8");
  assert.match(shell, /startsWith\("\/settings"\)/);
  assert.match(shell, /clearPendingInvite\(\)/);
  assert.match(shell, /clearPendingSignup\(\)/);
  assert.match(role.wrongRoleNotice("parent", "/classes/join/AB12"), /Schüler:innen/);
  assert.match(role.wrongRoleNotice("teacher", "/familie/einladung/ABCD1234"), /Familien/);
  assert.equal(role.wrongRoleNotice("student", "/classes/join/AB12"), null);
  const login = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
  // G18 now: invite links without a session open the funnel (role preset from the link), not a signup tab.
  assert.match(login, /isInvitePath\(safe\).*router\.replace\(startHref\(safe\)\)/s);
});

test("G20: parent routing uses the server account type once known", () => {
  assert.equal(gate.isParentAccount({ account_type: "parent" }, { ...trial, account_type: "independent_student" }), false, "server wins over metadata");
  assert.equal(gate.isParentAccount({}, { ...trial, account_type: "parent" }), true);
  assert.equal(gate.isParentAccount({ account_type: "parent" }, gate.OPEN_ACCESS), true, "fallback: metadata");
});

test("G12/G14: paywall explains the reason (licence ended, family pending without prices)", () => {
  const pages = readFileSync(new URL("../components/access/access-pages.tsx", import.meta.url), "utf8");
  for (const r of ["family_pending", "licence_ended", "subscription_ended", "payment_failed"]) assert.match(pages, new RegExp(`case "${r}"`));
  assert.match(pages, /family_pending[\s\S]{0,300}showPrices: false/);
});
