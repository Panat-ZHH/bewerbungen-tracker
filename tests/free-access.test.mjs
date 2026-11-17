// Free access without an end date ("Gratis (unbefristet)"): the TS mirror of app_access (lib/access/core.ts), the my_access
// parser, the UI decisions (/abo, settings) and the admin API (lib/admin/handler.ts: grant / revoke for a person and a whole
// school, strict input, platform-admin guard, audit row BEFORE every change). DB truth: tests/free-access-db.test.mjs.
import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { loadLib } from "./helpers/load-lib.mjs";

const gate = await loadLib("access/gate");
const { decideAccess, parseAccessInfo, parseGrant, FULL_ACCESS } = await import("../lib/access/core.ts");
const { aboMode } = await import("../components/billing/abo-logic.ts");
const { freeAccessActive, freeAccessLabel, freeAccessBody } = await import("../lib/admin/free-access.ts");
const { createAdminApi } = await import("../lib/admin/handler.ts");
const { memoryRateLimitRpc } = await import("../lib/rate-limit/core.ts");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ------------------------------------------------------------------ core mirror

const NOW = new Date("2026-12-01T12:00:00Z");
const d = (days) => new Date(NOW.getTime() + days * 86400000).toISOString();
const base = (over = {}) => ({
  now: NOW, mode: "on", enforceTest: false, blockedAt: null, grantUntil: null, grantForever: false, trialEndsAt: d(3), role: "student",
  accountType: "independent_student", licensedSchool: null, schoolGrant: null, licenceEnded: false, solo: null, family: null, ...over,
});
const sub = (over = {}) => ({ plan: "solo", status: "active", current_period_start: d(-10), current_period_end: d(20), cancel_at_period_end: false, ...over });

test("forever grant beats an expired trial; no trial banner, no paywall", () => {
  const a = decideAccess(base({ trialEndsAt: d(-30), grantForever: true }));
  assert.deepEqual([a.has_access, a.state, a.reason, a.grant_until, a.expired_reason], [true, "active", "grant", null, null]);
  assert.deepEqual(a.grant, { scope: "user", forever: true, until: null });
  assert.equal(gate.accessBanner(a), null);
  assert.equal(gate.accessView(a, "/dashboard"), "page");
  assert.equal(gate.accessLanding(a), null);
});

test("precedence: blocked > grant (forever or dated) > school > staff licence gate > subscriptions > trial", () => {
  const school = { id: "s1", name: "Sek", valid_until: null, free: true };
  assert.equal(decideAccess(base({ grantForever: true, blockedAt: d(-1) })).state, "blocked");
  assert.equal(decideAccess(base({ grantForever: true, blockedAt: d(-1) })).grant, null);
  assert.equal(decideAccess(base({ grantForever: true, licensedSchool: school })).reason, "grant");
  assert.equal(decideAccess(base({ grantForever: true, solo: sub() })).reason, "grant");
  for (const role of ["teacher", "school_admin"]) {
    assert.equal(decideAccess(base({ role, accountType: null })).state, "licence_required");
    const t = decideAccess(base({ role, accountType: null, grantForever: true }));
    assert.deepEqual([t.has_access, t.reason, t.trial_ends_at], [true, "grant", null]);
  }
  // mode off: blocked is ignored, grant still reported
  assert.equal(decideAccess(base({ mode: "off", grantForever: true, blockedAt: d(-1) })).reason, "grant");
});

test("dated grant: active until then, expired grant falls back to trial or to the paywall", () => {
  let a = decideAccess(base({ grantUntil: d(5), trialEndsAt: d(-1) }));
  assert.deepEqual([a.reason, a.grant_until, a.grant], ["grant", d(5), { scope: "user", forever: false, until: d(5) }]);
  a = decideAccess(base({ grantUntil: d(-1) }));
  assert.deepEqual([a.state, a.grant, a.grant_until], ["trial", null, null]);
  a = decideAccess(base({ grantUntil: d(-1), trialEndsAt: d(-1) }));
  assert.deepEqual([a.has_access, a.state, a.expired_reason], [false, "expired", "trial_ended"]);
  // a stray until next to forever is ignored (the DB check forbids it anyway)
  assert.equal(decideAccess(base({ grantForever: true, grantUntil: d(-5) })).grant_until, null);
});

test("school grant: reason school_licence + grant scope school, no trial, staff covered", () => {
  const school = { id: "s1", name: "Sek", valid_until: null, free: true };
  const a = decideAccess(base({ licensedSchool: school, schoolGrant: { forever: true, until: null }, trialEndsAt: d(-9) }));
  assert.deepEqual([a.has_access, a.reason, a.trial_ends_at, a.school.free], [true, "school_licence", null, true]);
  assert.deepEqual(a.grant, { scope: "school", forever: true, until: null });
  assert.equal(gate.hidesPrices(a), true);
  const t = decideAccess(base({ role: "teacher", accountType: null, licensedSchool: school, schoolGrant: { forever: false, until: d(30) } }));
  assert.deepEqual([t.has_access, t.grant], [true, { scope: "school", forever: false, until: d(30) }]);
});

test("parse: grant key from my_access (unknown / malformed → null, older DB without the key → null)", () => {
  const raw = decideAccess(base({ grantForever: true }));
  assert.deepEqual(parseAccessInfo(JSON.parse(JSON.stringify(raw))).grant, { scope: "user", forever: true, until: null });
  const old = { ...raw };
  delete old.grant;
  assert.equal(parseAccessInfo(old).grant, null);
  assert.equal(gate.readAccessInfo(old).grant, null);
  assert.deepEqual(gate.readAccessInfo(raw).grant, raw.grant);
  for (const junk of [null, 1, "x", [], { scope: "family", forever: true }, { scope: "user" }, { scope: "user", forever: false }, { scope: "user", forever: false, until: "nope" }]) {
    assert.equal(parseGrant(junk), null, JSON.stringify(junk));
  }
  assert.deepEqual(parseGrant({ scope: "school", forever: true, until: "2027-01-01T00:00:00Z" }), { scope: "school", forever: true, until: null });
  const school = parseAccessInfo({ ...raw, school: { id: "s", name: "Sek", valid_until: null, free: true } }).school;
  assert.equal(school.free, true);
  assert.equal(FULL_ACCESS.grant, null);
  assert.equal(gate.OPEN_ACCESS.grant, null);
});

// ------------------------------------------------------------------ UI decisions

const enforced = { ...gate.OPEN_ACCESS, enforced: true };
test("/abo + settings: free mode, 'Gratis (unbefristet)' / 'Gratis bis …', no prices", () => {
  const free = { ...enforced, reason: "grant", grant: { scope: "user", forever: true, until: null } };
  assert.equal(aboMode(free), "free");
  assert.equal(aboMode({ ...free, role: "teacher" }), "staff");
  assert.equal(aboMode({ ...enforced, reason: "school_licence", grant: { scope: "school", forever: true, until: null } }), "licensed");
  const fmt = (iso) => iso.slice(0, 10);
  assert.equal(gate.freeGrantLabel({ forever: true, until: null }, fmt), "Gratis (unbefristet)");
  assert.equal(gate.freeGrantLabel({ forever: false, until: "2027-03-01T23:59:59Z" }, fmt), "Gratis bis 2027-03-01");
  assert.equal(gate.freeGrantLabel(null, fmt), null);
  assert.deepEqual(gate.freeGrant(free), free.grant);
  assert.equal(gate.freeGrant({ ...free, has_access: false }), null);
  const view = read("components/billing/abo-view.tsx");
  assert.match(view, /mode === "free"/);
  assert.match(view, /data-testid="abo-free"/);
  const section = read("components/settings/abo-section.tsx");
  assert.match(section, /freeGrantLabel/);
  assert.match(section, /access\.reason !== "grant" \|\| sub/, "no 'Abo ansehen' upsell for granted users");
});

test("admin UI helpers + wiring: badges, filter, confirmation dialog for person and school", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  const fmt = (iso) => iso.slice(0, 10);
  assert.equal(freeAccessActive({ forever: true }, now), true);
  assert.equal(freeAccessActive({ forever: false, until: "2026-11-18T00:00:00Z" }, now), true);
  assert.equal(freeAccessActive({ forever: false, until: "2026-11-16T00:00:00Z" }, now), false);
  assert.equal(freeAccessActive(null, now), false);
  assert.equal(freeAccessLabel({ forever: true }, fmt, now), "Gratis (unbefristet)");
  assert.equal(freeAccessLabel({ until: "2026-12-31T23:59:59Z" }, fmt, now), "Gratis bis 2026-12-31");
  assert.equal(freeAccessLabel({ until: "2026-11-01T00:00:00Z" }, fmt, now), null);
  assert.deepEqual(freeAccessBody({ kind: "forever", until: "2026-12-31", note: "  Partner " }), { forever: true, note: "Partner" });
  assert.deepEqual(freeAccessBody({ kind: "until", until: "2026-12-31", note: "" }), { until: "2026-12-31" });
  const user = read("components/admin/user-detail.tsx");
  assert.match(user, /FreeAccessFields scope="user"/);
  assert.match(user, /<ConfirmModal/);
  const school = read("components/admin/school-detail.tsx");
  assert.match(school, /FreeAccessFields scope="school"/);
  assert.match(school, /admin-action-grant_access/);
  assert.match(school, /admin-action-revoke_access/);
  assert.match(read("components/admin/users-tab.tsx"), /<option value="grant_forever">Gratis \(unbefristet\)<\/option>/);
  assert.match(read("components/admin/schools-tab.tsx"), /<FreeAccessBadge grant=\{s\.free_access\} \/>/);
});

// ------------------------------------------------------------------ admin API

const ANOW = new Date("2026-11-17T12:00:00Z");
const ADMIN = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const SCHOOL = "55555555-5555-4555-8555-555555555555";
const NOSCHOOL = "55555555-5555-4555-8555-555555555599";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.c2ln`;
// Fresh login (amr timestamp = now): since security review #3 the guard refuses admin tokens older than 12 h (reauth_required).
const AUTH_AT = Math.floor(ANOW.getTime() / 1000) - 60;
const amr = (t = AUTH_AT) => [{ method: "totp", timestamp: t }, { method: "oauth", timestamp: t }];
const T = {
  admin: jwt({ sub: ADMIN, aal: "aal2", amr: amr() }), user: jwt({ sub: USER, aal: "aal2", amr: amr() }),
  adminAal1: jwt({ sub: ADMIN, aal: "aal1", amr: [{ method: "password", timestamp: AUTH_AT }] }),
  adminStale: jwt({ sub: ADMIN, aal: "aal2", amr: amr(AUTH_AT - 13 * 3600) }), adminNoAmr: jwt({ sub: ADMIN, aal: "aal2" }),
};

function mockStore() {
  const calls = [];
  const audit = [];
  const access = new Map([[USER, { user_id: USER, trial_started_at: "2026-11-01T00:00:00Z", trial_ends_at: "2026-11-08T00:00:00Z", free_access_until: null, free_access_note: null, free_access_forever: false, blocked_at: null, blocked_reason: null }]]);
  const grants = new Map();
  const fail = new Set();
  const rec = (name, ...args) => { calls.push({ name, args }); if (fail.has(name)) throw new Error(`DB_FAILED:${name}:detail`); };
  const store = {
    async verifyToken(token) { return token === T.admin || token === T.adminAal1 || token === T.adminStale || token === T.adminNoAmr ? { id: ADMIN, email: "panat@example.ch" } : token === T.user ? { id: USER, email: "kim@example.ch" } : null; },
    async isPlatformAdmin(id) { return id === ADMIN; },
    async userBasics(id) { return id === USER || id === ADMIN ? { id, email: id === USER ? "kim@example.ch" : "panat@example.ch", created_at: null } : null; },
    async getAccess(id) { return access.get(id) ?? null; },
    async updateAccess(id, patch, by) { rec("updateAccess", id, patch, by); const r = { ...(access.get(id) ?? { user_id: id }), ...patch }; access.set(id, r); return r; },
    async getSchool(id) { return id === SCHOOL ? { id, name: "Sek Test", licence: null } : null; },
    async getSchoolGrant(id) { return grants.get(id) ?? null; },
    async setSchoolGrant(id, g, by) { rec("setSchoolGrant", id, g, by); const r = { ...g, granted_by: by, granted_at: ANOW.toISOString() }; grants.set(id, r); return r; },
    async clearSchoolGrant(id) { rec("clearSchoolGrant", id); grants.delete(id); },
    async writeAudit(e) { calls.push({ name: "writeAudit", args: [e] }); if (fail.has("writeAudit")) throw new Error("DB_FAILED:audit"); audit.push(e); },
  };
  return { store, calls, audit, access, grants, fail };
}

let m, api;
beforeEach(() => {
  m = mockStore();
  api = createAdminApi({ store: m.store, rpc: memoryRateLimitRpc(() => ANOW.getTime()), env: { RATE_LIMIT_ADMIN_USER: "10000", RATE_LIMIT_ADMIN_MUTATION_USER: "10000", RATE_LIMIT_ADMIN_IP: "10000" }, now: () => ANOW });
});
let ip = 1;
const post = (path, body, token = T.admin) => new Request(`https://wendapply.ch${path}`, {
  method: "POST", body: JSON.stringify(body),
  headers: { "content-type": "application/json", "x-nf-client-connection-ip": `203.0.113.${(ip++ % 250) + 1}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
});
const userPost = (body, token) => api.userAction(post(`/api/admin/users/${USER}`, body, token), USER);
const schoolPost = (body, token, id = SCHOOL) => api.schoolAction(post(`/api/admin/schools/${id}`, body, token), id);
const changes = () => m.calls.filter((c) => c.name !== "writeAudit");

test("admin API: person grant forever → audit (old → new) BEFORE the change, then the row", async () => {
  m.access.set(USER, { ...m.access.get(USER), free_access_until: "2026-12-01T00:00:00.000Z", free_access_note: "alt" });
  const res = await userPost({ action: "grant_access", forever: true, note: "Partnerschule", confirm: true });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual([body.account_access.free_access_forever, body.account_access.free_access_until, body.account_access.free_access_note], [true, null, "Partnerschule"]);
  assert.equal(body.account_access.free_access_granted_by, ADMIN);
  const order = m.calls.map((c) => c.name);
  assert.deepEqual(order, ["writeAudit", "updateAccess"]);
  const [entry] = m.audit;
  assert.deepEqual([entry.action, entry.admin_id, entry.target_user], ["user.grant_access", ADMIN, USER]);
  assert.deepEqual(entry.details.before, { free_access_forever: false, free_access_until: "2026-12-01T00:00:00.000Z", free_access_note: "alt", free_access_granted_at: null, free_access_granted_by: null });
  assert.deepEqual([entry.details.after.free_access_forever, entry.details.after.free_access_until, entry.details.after.free_access_note], [true, null, "Partnerschule"]);
});

test("admin API: person grant until a date (existing behaviour) and revoke clears forever too", async () => {
  let res = await userPost({ action: "grant_access", until: "2027-06-30", confirm: true });
  assert.equal(res.status, 200);
  let row = (await res.json()).account_access;
  assert.deepEqual([row.free_access_forever, row.free_access_until], [false, "2027-06-30T23:59:59.000Z"]);
  await userPost({ action: "grant_access", forever: true, confirm: true });
  res = await userPost({ action: "revoke_access", confirm: true });
  row = (await res.json()).account_access;
  assert.deepEqual([row.free_access_forever, row.free_access_until, row.free_access_note], [false, null, null]);
  assert.deepEqual(m.audit.map((e) => e.action), ["user.grant_access", "user.grant_access", "user.revoke_access"]);
  assert.equal(m.audit[2].details.before.free_access_forever, true);
});

test("admin API: grant input is strict (forever XOR until, types, past dates, note)", async () => {
  const bad = [
    [{ forever: true, until: "2027-01-01" }, "until"],
    [{ forever: "true" }, "forever"],
    [{ forever: 1 }, "forever"],
    [{ forever: false }, "until"],
    [{}, "until"],
    [{ until: "2026-11-16" }, "until"],
    [{ until: "2040-01-01" }, "until"],
    [{ forever: true, note: "x".repeat(501) }, "note"],
    [{ forever: true, granted_by: USER }, "granted_by"],
    [{ forever: true, free_access_forever: true }, "free_access_forever"],
  ];
  for (const [b, field] of bad) {
    for (const send of [userPost, schoolPost]) {
      const res = await send({ action: "grant_access", confirm: true, ...b });
      assert.equal(res.status, 400, JSON.stringify(b));
      assert.equal((await res.json()).field, field, JSON.stringify(b));
    }
  }
  assert.equal((await userPost({ action: "grant_access", forever: true })).status, 400, "confirm: true required");
  assert.equal(changes().length, 0);
  assert.equal(m.audit.length, 0);
});

test("admin API: only platform admins (with MFA) can grant: anon 401, normal user 404, aal1 403 – nothing written", async () => {
  for (const [token, status] of [[null, 401], ["garbage", 401], [T.user, 404], [T.adminAal1, 403]]) {
    assert.equal((await userPost({ action: "grant_access", forever: true, confirm: true }, token)).status, status);
    assert.equal((await schoolPost({ action: "grant_access", forever: true, confirm: true }, token)).status, status);
  }
  assert.equal(changes().length, 0);
  assert.equal(m.audit.length, 0);
});

test("admin API (re-audit #4): grant / revoke need a fresh admin login – stale or missing amr → 403 reauth_required, nothing written", async () => {
  for (const token of [T.adminStale, T.adminNoAmr]) {
    for (const body of [{ action: "grant_access", forever: true, confirm: true }, { action: "revoke_access", confirm: true }]) {
      for (const send of [userPost, schoolPost]) {
        const res = await send(body, token);
        assert.deepEqual([res.status, (await res.json()).error], [403, "reauth_required"]);
      }
    }
  }
  assert.equal(changes().length, 0);
  assert.equal(m.audit.length, 0);
});

test("admin API (re-audit #4): revoke_access never targets yourself or another platform admin (ADMIN.md §4 rule 4)", async () => {
  m.access.set(ADMIN, { user_id: ADMIN, trial_ends_at: null, free_access_until: null, free_access_note: null, free_access_forever: true, blocked_at: null, blocked_reason: null });
  const res = await api.userAction(post(`/api/admin/users/${ADMIN}`, { action: "revoke_access", confirm: true }), ADMIN);
  assert.deepEqual([res.status, (await res.json()).reason], [409, "self"]);
  m.store.isPlatformAdmin = async (id) => id === ADMIN || id === USER; // USER is another platform admin now
  const other = await userPost({ action: "revoke_access", confirm: true });
  assert.deepEqual([other.status, (await other.json()).reason], [409, "platform_admin"]);
  assert.equal(changes().length, 0);
  assert.equal(m.audit.length, 0);
  // granting stays possible (it only adds app access, never admin rights)
  assert.equal((await userPost({ action: "grant_access", forever: true, confirm: true })).status, 200);
});

test("admin API: school grant forever / until / revoke, each audited first", async () => {
  let res = await schoolPost({ action: "grant_access", forever: true, note: "Pilot Kanton ZH", confirm: true });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).free_access, { forever: true, until: null, note: "Pilot Kanton ZH", granted_by: ADMIN, granted_at: ANOW.toISOString() });
  res = await schoolPost({ action: "grant_access", until: "2027-07-31", confirm: true });
  assert.equal((await res.json()).free_access.until, "2027-07-31T23:59:59.000Z");
  res = await schoolPost({ action: "revoke_access", confirm: true });
  assert.deepEqual(await res.json(), { ok: true, free_access: null });
  assert.deepEqual(m.calls.map((c) => c.name), ["writeAudit", "setSchoolGrant", "writeAudit", "setSchoolGrant", "writeAudit", "clearSchoolGrant"]);
  assert.deepEqual(m.audit.map((e) => [e.action, e.target_school, e.admin_id]), [
    ["school.grant_access", SCHOOL, ADMIN], ["school.grant_access", SCHOOL, ADMIN], ["school.revoke_access", SCHOOL, ADMIN]]);
  assert.deepEqual([m.audit[0].details.before, m.audit[0].details.after], [null, { forever: true, until: null, note: "Pilot Kanton ZH" }]);
  assert.deepEqual(m.audit[1].details.before, { forever: true, until: null, note: "Pilot Kanton ZH" });
  assert.deepEqual([m.audit[2].details.before.until, m.audit[2].details.after], ["2027-07-31T23:59:59.000Z", null]);
});

test("admin API: revoke without grant → 409 not_granted; unknown school → 404; no audit = no change", async () => {
  let res = await schoolPost({ action: "revoke_access", confirm: true });
  assert.deepEqual([res.status, (await res.json()).reason], [409, "not_granted"]);
  res = await schoolPost({ action: "grant_access", forever: true, confirm: true }, T.admin, NOSCHOOL);
  assert.equal(res.status, 404);
  m.fail.add("writeAudit");
  res = await schoolPost({ action: "grant_access", forever: true, confirm: true });
  assert.equal(res.status, 500);
  res = await userPost({ action: "grant_access", forever: true, confirm: true });
  assert.equal(res.status, 500);
  assert.equal(changes().length, 0);
  m.fail.delete("writeAudit");
  m.fail.add("setSchoolGrant");
  res = await schoolPost({ action: "grant_access", forever: true, confirm: true });
  assert.equal(res.status, 500);
  assert.deepEqual(m.audit.map((e) => e.action), ["school.grant_access", "school.grant_access.failed"]);
});

test("admin user list: state filter grant_forever is accepted", async () => {
  let seen = null;
  m.store.listUsers = async (f) => { seen = f; return { items: [], total: 0, page: 1, page_size: 50 }; };
  const res = await api.users(new Request("https://wendapply.ch/api/admin/users?state=grant_forever", { headers: { authorization: `Bearer ${T.admin}`, "x-nf-client-connection-ip": "203.0.113.9" } }));
  assert.equal(res.status, 200);
  assert.equal(seen.state, "grant_forever");
});

test("migration: additive, RLS on the new table, no client grants, service role only", () => {
  const sql = read("supabase/migrations/20261118400000_free_access_forever.sql");
  assert.doesNotMatch(sql, /\bdrop table\b|\bdrop column\b|\btruncate\b/i);
  assert.match(sql, /alter table public\.school_access_grants enable row level security/);
  assert.match(sql, /revoke all on public\.school_access_grants from public, anon, authenticated/);
  assert.doesNotMatch(sql, /grant (insert|update|delete|all)[^;]*to authenticated/i);
  assert.match(sql, /grant select \(free_access_forever\) on public\.account_access to authenticated/);
});
