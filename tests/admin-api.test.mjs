// Platform admin API (lib/admin/handler.ts + guard.ts, SPEC §5): auth guard (401 / 404 / 403 mfa / 200), strict validation,
// rate limits (60 / min, 10 / min for mutations, IP brake) and an audit row for EVERY mutation, written BEFORE the change.
// The service-role store is mocked in memory; no network, no database.
import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { register } from "node:module";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

register("./helpers/alias-hooks.mjs", import.meta.url);

const { createAdminApi } = await import("../lib/admin/handler.ts");
const { jwtClaims, bearer, adminLimits, adminSessionMaxAge, lastAuthAt } = await import("../lib/admin/guard.ts");
const { memoryRateLimitRpc } = await import("../lib/rate-limit/core.ts");
const { licenceState, currentLicence, stripeLinks } = await import("../lib/admin/server.ts");
const v = await import("../lib/admin/validate.ts");

const root = join(import.meta.dirname, "..");
const NOW = new Date("2026-11-17T12:00:00Z");
const ADMIN = "11111111-1111-4111-8111-111111111111";
const OTHER_ADMIN = "11111111-1111-4111-8111-111111111112";
const USER = "22222222-2222-4222-8222-222222222222";
const BLOCKED = "33333333-3333-4333-8333-333333333333";
const NOBODY = "44444444-4444-4444-8444-444444444444";
const SCHOOL = "55555555-5555-4555-8555-555555555555";
const SCHOOL2 = "55555555-5555-4555-8555-555555555556";
const LIC = "66666666-6666-4666-8666-666666666666";
const LIC_PILOT = "66666666-6666-4666-8666-666666666667";
const LIC_OTHER = "66666666-6666-4666-8666-666666666668";
const TEACHER = "77777777-7777-4777-8777-777777777777";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.c2ln`;
// Real Supabase tokens list every authentication with its unix time (amr); the guard needs one within 12 h (fresh login).
const FRESH = Math.floor(NOW.getTime() / 1000) - 600;
const AMR2 = [{ method: "totp", timestamp: FRESH }, { method: "password", timestamp: FRESH - 30 }];
const AMR1 = [{ method: "password", timestamp: FRESH }];
const TOKENS = {
  admin2: jwt({ sub: ADMIN, aal: "aal2", amr: AMR2 }),
  admin1: jwt({ sub: ADMIN, aal: "aal1", amr: AMR1 }),
  user2: jwt({ sub: USER, aal: "aal2", amr: AMR2 }),
  mismatch: jwt({ sub: USER, aal: "aal2", x: 1, amr: AMR2 }), // verified as ADMIN by the mock → sub mismatch
  other2: jwt({ sub: OTHER_ADMIN, aal: "aal2", amr: AMR2 }),
  adminGoogle: jwt({ sub: ADMIN, aal: "aal1", amr: [{ method: "oauth", timestamp: FRESH }] }),
  adminGoogleUnverified: jwt({ sub: ADMIN, aal: "aal1", amr: [{ method: "oauth", timestamp: FRESH }], g: "unverified" }),
  adminGoogleEnrolled: jwt({ sub: ADMIN, aal: "aal1", amr: [{ method: "oauth", timestamp: FRESH }], g: "enrolled" }),
  adminPassword: jwt({ sub: ADMIN, aal: "aal1", amr: [{ method: "password", timestamp: FRESH }], g: "pw" }),
  adminMagic: jwt({ sub: ADMIN, aal: "aal1", amr: [{ method: "otp", timestamp: FRESH }], g: "otp" }),
  userGoogle: jwt({ sub: USER, aal: "aal1", amr: [{ method: "oauth", timestamp: FRESH }] }),
};

function mockStore() {
  const calls = [];
  const audit = [];
  const access = new Map([
    [USER, { user_id: USER, trial_started_at: "2026-11-10T00:00:00Z", trial_ends_at: "2026-11-17T00:00:00Z", free_access_until: null, free_access_note: null, blocked_at: null, blocked_reason: null }],
    [BLOCKED, { user_id: BLOCKED, trial_started_at: "2026-11-01T00:00:00Z", trial_ends_at: "2026-11-08T00:00:00Z", free_access_until: null, free_access_note: null, blocked_at: "2026-11-15T00:00:00Z", blocked_reason: "x" }],
  ]);
  const users = new Map([[ADMIN, "panat@example.ch"], [OTHER_ADMIN, "admin2@example.ch"], [USER, "kim@example.ch"], [BLOCKED, "blocked@example.ch"], [TEACHER, "lehrer@example.ch"]]);
  const licences = new Map([
    [LIC, { id: LIC, school_id: SCHOOL, package: "starter", status: "active", state: "active", student_limit: 100, pilot_start: null, pilot_end: null, valid_from: "2026-01-01", valid_until: "2026-12-31", billing_interval: "yearly", notes: null, created_at: "2026-01-01" }],
    [LIC_PILOT, { id: LIC_PILOT, school_id: SCHOOL, package: "pilot", status: "pilot", state: "pilot", student_limit: 60, pilot_start: "2026-11-01", pilot_end: "2026-12-01", valid_from: null, valid_until: null, billing_interval: "yearly", notes: null, created_at: "2026-11-01" }],
    [LIC_OTHER, { id: LIC_OTHER, school_id: SCHOOL2, package: "starter", status: "active", state: "active", student_limit: 100, pilot_start: null, pilot_end: null, valid_from: "2026-01-01", valid_until: "2026-12-31", billing_interval: "yearly", notes: null, created_at: "2026-01-01" }],
  ]);
  const admins = new Map([[SCHOOL, [TEACHER]]]);
  const teachers = new Map([[SCHOOL, []]]);
  const fail = new Set(); // method names that throw
  const rec = (name, ...args) => { calls.push({ name, args }); if (fail.has(name)) { const e = name === "deleteAccount" && fail.has("billing") ? Object.assign(new Error("SUBSCRIPTION_ACTIVE"), { name: "BillingActiveError" }) : new Error(`DB_FAILED:${name}:secret-detail`); throw e; } };
  const store = {
    async verifyToken(token) {
      if (token === TOKENS.admin2 || token === TOKENS.admin1 || token === TOKENS.mismatch) return { id: ADMIN, email: users.get(ADMIN) };
      if (token === TOKENS.adminGoogle || token === TOKENS.adminPassword || token === TOKENS.adminMagic) return { id: ADMIN, email: users.get(ADMIN), googleVerified: true, mfaEnrolled: false };
      if (token === TOKENS.adminGoogleUnverified) return { id: ADMIN, email: users.get(ADMIN), googleVerified: false, mfaEnrolled: false };
      if (token === TOKENS.adminGoogleEnrolled) return { id: ADMIN, email: users.get(ADMIN), googleVerified: true, mfaEnrolled: true };
      if (token === TOKENS.userGoogle) return { id: USER, email: users.get(USER), googleVerified: true, mfaEnrolled: false };
      if (token === TOKENS.user2) return { id: USER, email: users.get(USER) };
      if (token === TOKENS.other2) return { id: OTHER_ADMIN, email: users.get(OTHER_ADMIN) };
      // Ad-hoc tokens of the freshness test: "verified" marks a token Supabase Auth accepted (Google-verified, no factor).
      const c = jwtClaims(token);
      if (c?.verified === true) return { id: c.sub, email: users.get(c.sub) ?? null, googleVerified: true, mfaEnrolled: false };
      return null;
    },
    async isPlatformAdmin(id) { rec("isPlatformAdmin", id); return id === ADMIN || id === OTHER_ADMIN; },
    async listUsers(filter) { rec("listUsers", filter); return { items: [], total: 0, page: filter.page, page_size: filter.pageSize }; },
    async getUser(id) { rec("getUser", id); return users.has(id) ? { id, email: users.get(id) } : null; },
    async userBasics(id) { return users.has(id) ? { id, email: users.get(id), created_at: "2026-11-10T00:00:00Z" } : null; },
    async getAccess(id) { return access.get(id) ?? null; },
    async updateAccess(id, patch, adminId) { rec("updateAccess", id, patch, adminId); const row = { ...(access.get(id) ?? { user_id: id }), ...patch }; access.set(id, row); return row; },
    async deleteAccount(id) { rec("deleteAccount", id); users.delete(id); },
    async recentSignups(days) { rec("recentSignups", days); return [{ id: USER, created_at: "2026-11-16T08:00:00Z" }, { id: BLOCKED, created_at: "2026-11-17T08:00:00Z" }, { id: ADMIN, created_at: "2025-01-01T00:00:00Z" }]; },
    async listSchools(q) { rec("listSchools", q); return []; },
    async getSchool(id) { return id === SCHOOL || id === SCHOOL2 ? { id, name: "Sek Test", licence: licences.get(LIC) } : null; },
    async createSchool(input) { rec("createSchool", input); return SCHOOL2; },
    async getLicence(id) { return licences.get(id) ?? null; },
    async assignLicence(id, input) { rec("assignLicence", id, input); return "66666666-6666-4666-8666-666666666699"; },
    async updateLicence(id, patch) { rec("updateLicence", id, patch); const l = { ...licences.get(id), ...patch }; licences.set(id, l); return l; },
    async findUserIdByEmail(email) { for (const [id, e] of users) if (e === email) return id; return null; },
    async schoolAdmins(id) { return admins.get(id) ?? []; },
    async schoolTeachers(id) { return teachers.get(id) ?? []; },
    async addSchoolAdmin(id, email) { rec("addSchoolAdmin", id, email); return USER; },
    async removeSchoolAdmin(id, uid) { rec("removeSchoolAdmin", id, uid); },
    async addSchoolTeacher(id, uid, by) { rec("addSchoolTeacher", id, uid, by); },
    async removeSchoolTeacher(id, uid) { rec("removeSchoolTeacher", id, uid); },
    async writeAudit(entry) { calls.push({ name: "writeAudit", args: [entry] }); if (fail.has("writeAudit")) throw new Error("DB_FAILED:audit"); audit.push(entry); },
    async listAudit(filter) { rec("listAudit", filter); return { items: [], total: 0, page: filter.page, page_size: filter.pageSize }; },
  };
  return { store, calls, audit, access, fail, licences };
}

let m, api, rpc;
// Generous limits for the functional tests; the rate-limit test uses the real defaults.
const ENV = { RATE_LIMIT_ADMIN_USER: "10000", RATE_LIMIT_ADMIN_MUTATION_USER: "10000", RATE_LIMIT_ADMIN_IP: "10000" };
beforeEach(() => {
  m = mockStore();
  rpc = memoryRateLimitRpc(() => NOW.getTime());
  api = createAdminApi({ store: m.store, rpc, env: ENV, now: () => NOW });
});

let ipCounter = 1;
const freshIp = () => `198.51.100.${(ipCounter++ % 250) + 1}`;
function req(path, { token = TOKENS.admin2, method = "GET", body, headers = {}, ip = freshIp() } = {}) {
  const h = { "x-nf-client-connection-ip": ip, ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  if (body !== undefined) h["content-type"] = h["content-type"] ?? "application/json";
  return new Request(`https://wendapply.ch${path}`, { method, headers: h, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
}
const post = (path, body, opts = {}) => req(path, { ...opts, method: "POST", body });
const userPost = (id, body, opts) => api.userAction(post(`/api/admin/users/${id}`, body, opts), id);
const schoolPost = (id, body, opts) => api.schoolAction(post(`/api/admin/schools/${id}`, body, opts), id);
async function expectError(res, status, error, field) {
  assert.equal(res.status, status);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await res.json();
  assert.equal(body.error, error);
  if (field) assert.equal(body.field, field);
  return body;
}
const mutated = () => m.calls.filter((c) => /^(update|delete|create|assign|add|remove)/.test(c.name));

// ------------------------------------------------------------------ guard

const READS = () => [
  ["me", () => api.me(req("/api/admin/me"))],
  ["users", () => api.users(req("/api/admin/users"))],
  ["user", () => api.user(req(`/api/admin/users/${USER}`), USER)],
  ["signups", () => api.signups(req("/api/admin/signups?days=7"))],
  ["schools", () => api.schools(req("/api/admin/schools"))],
  ["school", () => api.school(req(`/api/admin/schools/${SCHOOL}`), SCHOOL)],
  ["audit", () => api.audit(req("/api/admin/audit"))],
];

test("guard: missing / malformed / invalid bearer → 401 on every endpoint, cookies are ignored", async () => {
  const variants = [
    { token: null },
    { token: null, headers: { cookie: `sb-access-token=${TOKENS.admin2}` } },
    { token: null, headers: { authorization: `Basic ${TOKENS.admin2}` } },
    { token: "not-a-jwt" },
    { token: jwt({ sub: NOBODY, aal: "aal2" }) }, // well-formed but not verified by Supabase Auth
    { token: TOKENS.mismatch }, // verified user differs from the claims' sub
  ];
  for (const opts of variants) {
    for (const [path, call] of [["/api/admin/me", (r) => api.me(r)], ["/api/admin/users", (r) => api.users(r)]]) {
      await expectError(await call(req(path, opts)), 401, "unauthenticated");
    }
    await expectError(await userPost(USER, { action: "unblock", confirm: true }, opts), 401, "unauthenticated");
  }
  assert.equal(mutated().length, 0);
  assert.equal(m.audit.length, 0);
});

test("guard: a signed-in non-admin gets 404 (route not revealed), also with aal2, before any data access", async () => {
  for (const [name, call] of READS()) {
    const res = await call.call(null);
    assert.equal(res.status, 200, `${name} works for the admin`);
  }
  const asUser = { token: TOKENS.user2 };
  const reads = [api.me(req("/api/admin/me", asUser)), api.users(req("/api/admin/users", asUser)), api.user(req(`/api/admin/users/${USER}`, asUser), USER),
    api.audit(req("/api/admin/audit", asUser)), api.schools(req("/api/admin/schools", asUser)), api.signups(req("/api/admin/signups", asUser))];
  for (const res of await Promise.all(reads)) {
    const body = await expectError(res, 404, "not_found");
    assert.deepEqual(Object.keys(body), ["error"]);
    assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
  }
  m.calls.length = 0;
  await expectError(await userPost(BLOCKED, { action: "unblock", confirm: true }, asUser), 404, "not_found");
  await expectError(await api.createSchool(post("/api/admin/schools", { action: "create", name: "X", confirm: true }, asUser)), 404, "not_found");
  assert.deepEqual(m.calls.map((c) => c.name), ["isPlatformAdmin", "isPlatformAdmin"]);
  assert.equal(m.audit.length, 0);
});

test("guard: platform admin without MFA (aal1) → 403 mfa_required; admin check failure → 404", async () => {
  await expectError(await api.me(req("/api/admin/me", { token: TOKENS.admin1 })), 403, "mfa_required");
  await expectError(await api.users(req("/api/admin/users", { token: TOKENS.admin1 })), 403, "mfa_required");
  await expectError(await userPost(USER, { action: "block", reason: "x", confirm: true }, { token: TOKENS.admin1 }), 403, "mfa_required");
  assert.equal(mutated().length, 0);
  m.store.isPlatformAdmin = async () => { throw new Error("db down"); };
  await expectError(await api.me(req("/api/admin/me")), 404, "not_found");
});

test("guard: admin with aal2 → 200 /me", async () => {
  const res = await api.me(req("/api/admin/me"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { user_id: ADMIN, email: "panat@example.ch", aal: "aal2", auth: "totp", mfa_enrolled: false });
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("guard: admin via Google OAuth (verified Google e-mail, no TOTP factor) passes with aal1", async () => {
  const res = await api.me(req("/api/admin/me", { token: TOKENS.adminGoogle }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { user_id: ADMIN, email: "panat@example.ch", aal: "aal1", auth: "google", mfa_enrolled: false });
  assert.equal((await api.users(req("/api/admin/users", { token: TOKENS.adminGoogle }))).status, 200);
});

test("guard: Google exception is narrow (unverified e-mail, enrolled TOTP, password / magic link, non-admin)", async () => {
  await expectError(await api.me(req("/api/admin/me", { token: TOKENS.adminGoogleUnverified })), 403, "mfa_required");
  await expectError(await api.me(req("/api/admin/me", { token: TOKENS.adminGoogleEnrolled })), 403, "mfa_required");
  await expectError(await api.me(req("/api/admin/me", { token: TOKENS.adminPassword })), 403, "mfa_required");
  await expectError(await api.me(req("/api/admin/me", { token: TOKENS.adminMagic })), 403, "mfa_required");
  await expectError(await api.me(req("/api/admin/me", { token: TOKENS.userGoogle })), 404, "not_found");
  await expectError(await api.users(req("/api/admin/users", { token: TOKENS.userGoogle })), 404, "not_found");
});

test("guard: admin access needs a fresh login (newest amr ≤ 12 h, ADMIN_SESSION_MAX_AGE_HOURS) → else 403 reauth_required", async () => {
  const nowS = Math.floor(NOW.getTime() / 1000);
  const tok = (sub, amr, aal = "aal2") => jwt({ sub, aal, amr, verified: true });
  // Stale TOTP session (refresh keeps the old amr): every route refuses, including mutations, and nothing is audited.
  const stale = tok(ADMIN, [{ method: "totp", timestamp: nowS - 13 * 3600 }, { method: "password", timestamp: nowS - 13 * 3600 }]);
  await expectError(await api.me(req("/api/admin/me", { token: stale })), 403, "reauth_required");
  await expectError(await api.users(req("/api/admin/users", { token: stale })), 403, "reauth_required");
  await expectError(await userPost(USER, { action: "block", reason: "x", confirm: true }, { token: stale }), 403, "reauth_required");
  assert.equal(m.audit.length, 0);
  // Stale Google session (no factor) is refused the same way.
  await expectError(await api.me(req("/api/admin/me", { token: tok(ADMIN, [{ method: "oauth", timestamp: nowS - 12 * 3600 - 1 }], "aal1") })), 403, "reauth_required");
  // The NEWEST authentication counts: a fresh TOTP step on an old password session is enough.
  assert.equal((await api.me(req("/api/admin/me", { token: tok(ADMIN, [{ method: "password", timestamp: nowS - 40 * 3600 }, { method: "totp", timestamp: nowS - 60 }]) }))).status, 200);
  assert.equal((await api.me(req("/api/admin/me", { token: tok(ADMIN, [{ method: "totp", timestamp: nowS - 12 * 3600 + 5 }]) }))).status, 200);
  // Fail closed: no amr, amr without numeric timestamps, plain-string amr, timestamps far in the future.
  await expectError(await api.me(req("/api/admin/me", { token: jwt({ sub: ADMIN, aal: "aal2", verified: true }) })), 403, "reauth_required");
  await expectError(await api.me(req("/api/admin/me", { token: tok(ADMIN, [{ method: "totp", timestamp: String(nowS) }]) })), 403, "reauth_required");
  await expectError(await api.me(req("/api/admin/me", { token: tok(ADMIN, ["totp", "password"]) })), 403, "reauth_required");
  await expectError(await api.me(req("/api/admin/me", { token: tok(ADMIN, [{ method: "totp", timestamp: nowS + 3600 }]) })), 403, "reauth_required");
  // Non-admins still get 404 (no hint that the route exists), aal1 non-Google still gets mfa_required first.
  await expectError(await api.me(req("/api/admin/me", { token: tok(USER, [{ method: "password", timestamp: nowS - 99 * 3600 }]) })), 404, "not_found");
  await expectError(await api.me(req("/api/admin/me", { token: tok(ADMIN, [{ method: "password", timestamp: nowS - 99 * 3600 }], "aal1") })), 403, "mfa_required");
  // Configurable window (1 … 168 h), nonsense → default 12 h.
  const short = createAdminApi({ store: m.store, rpc, env: { ...ENV, ADMIN_SESSION_MAX_AGE_HOURS: "1" }, now: () => NOW });
  await expectError(await short.me(req("/api/admin/me", { token: tok(ADMIN, [{ method: "totp", timestamp: nowS - 2 * 3600 }]) })), 403, "reauth_required");
  assert.equal(adminSessionMaxAge({ ADMIN_SESSION_MAX_AGE_HOURS: "0" }), 12 * 3600);
  assert.equal(adminSessionMaxAge({ ADMIN_SESSION_MAX_AGE_HOURS: "500" }), 12 * 3600);
  assert.equal(adminSessionMaxAge({ ADMIN_SESSION_MAX_AGE_HOURS: "24" }), 24 * 3600);
  assert.equal(lastAuthAt({ amr: [{ method: "a", timestamp: 5 }, { method: "b", timestamp: 9 }, { method: "c" }] }), 9);
  assert.equal(lastAuthAt({}), null);
});

test("rate limit: 60 requests / min per admin, 10 / min for mutations, per-IP brake before auth", async () => {
  api = createAdminApi({ store: m.store, rpc, env: {}, now: () => NOW });
  for (let i = 0; i < 60; i++) assert.equal((await api.me(req("/api/admin/me"))).status, 200);
  const r = await api.me(req("/api/admin/me"));
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get("retry-after")) >= 1);
  assert.equal((await r.json()).error, "rate_limited");
  // Another admin has an own budget.
  assert.equal((await api.me(req("/api/admin/me", { token: TOKENS.other2 }))).status, 200);

  for (let i = 0; i < 10; i++) assert.equal((await userPost(USER, { action: "extend_trial", days: 1, confirm: true }, { token: TOKENS.other2 })).status, 200, `mutation ${i}`);
  await expectError(await userPost(USER, { action: "extend_trial", days: 1, confirm: true }, { token: TOKENS.other2 }), 429, "rate_limited");
  assert.equal(m.audit.length, 10, "the refused mutation is not applied / audited");
  assert.equal((await api.me(req("/api/admin/me", { token: TOKENS.other2 }))).status, 200, "reads still work");

  const ip = "203.0.113.9";
  for (let i = 0; i < adminLimits({}).ip.limit; i++) await api.me(req("/api/admin/me", { token: null, ip }));
  await expectError(await api.me(req("/api/admin/me", { token: null, ip })), 429, "rate_limited");
  assert.deepEqual(adminLimits({ RATE_LIMIT_ADMIN_MUTATION_USER: "3/30" }).mutation, { limit: 3, windowSeconds: 30 });
  assert.deepEqual(adminLimits({ RATE_LIMIT_ADMIN_USER: "nonsense" }).user, { limit: 60, windowSeconds: 60 });
});

test("jwt helpers", () => {
  assert.equal(jwtClaims(TOKENS.admin2).aal, "aal2");
  assert.equal(jwtClaims("a.b"), null);
  assert.equal(jwtClaims("a.!!!.c"), null);
  assert.equal(bearer(new Headers({ authorization: `Bearer ${TOKENS.admin2}` })), TOKENS.admin2);
  assert.equal(bearer(new Headers({ authorization: "Bearer abc" })), null);
  assert.equal(bearer(new Headers({ authorization: `Bearer ${TOKENS.admin2} x` })), null);
});

// ------------------------------------------------------------------ validation

test("mutations need JSON with confirm === true; ids must be uuids; unknown actions / keys are refused", async () => {
  await expectError(await userPost(USER, { action: "unblock" }), 400, "invalid_input", "confirm");
  await expectError(await userPost(USER, { action: "unblock", confirm: "true" }), 400, "invalid_input", "confirm");
  await expectError(await userPost(USER, "{not json"), 400, "invalid_input", "body");
  await expectError(await userPost(USER, [1, 2]), 400, "invalid_input", "body");
  await expectError(await userPost(USER, { action: "unblock", confirm: true }, { headers: { "content-type": "text/plain" } }), 400, "invalid_input", "content-type");
  await expectError(await userPost(USER, { action: "unblock", confirm: true, pad: "x".repeat(9000) }), 400, "invalid_input", "body");
  await expectError(await api.userAction(post("/api/admin/users/abc", { action: "unblock", confirm: true }), "abc"), 400, "invalid_input", "id");
  await expectError(await api.userAction(post("/api/admin/users/x", { action: "unblock", confirm: true }), `${USER}' or 1=1`), 400, "invalid_input", "id");
  await expectError(await userPost(USER, { action: "drop_table", confirm: true }), 400, "invalid_input", "action");
  await expectError(await userPost(USER, { action: "unblock", confirm: true, blocked_at: null }), 400, "invalid_input", "blocked_at");
  await expectError(await userPost(NOBODY, { action: "unblock", confirm: true }), 404, "not_found");
  assert.equal(mutated().length, 0);
  assert.equal(m.audit.length, 0);
});

test("user action inputs are validated strictly", async () => {
  const bad = [
    [{ action: "set_trial", trial_ends_at: "2026-13-01" }, "trial_ends_at"],
    [{ action: "set_trial", trial_ends_at: "2026-02-30" }, "trial_ends_at"],
    [{ action: "set_trial", trial_ends_at: "2031-01-01" }, "trial_ends_at"], // > 2 years ahead
    [{ action: "set_trial", trial_ends_at: "tomorrow" }, "trial_ends_at"],
    [{ action: "set_trial", trial_ends_at: 1763000000000 }, "trial_ends_at"],
    [{ action: "extend_trial", days: 0 }, "days"],
    [{ action: "extend_trial", days: 366 }, "days"],
    [{ action: "extend_trial", days: 1.5 }, "days"],
    [{ action: "extend_trial", days: "7; drop" }, "days"],
    [{ action: "grant_access", until: "2026-11-16" }, "until"], // in the past
    [{ action: "grant_access", until: "2026-12-31", note: "x".repeat(501) }, "note"],
    [{ action: "grant_access", until: "2026-12-31", note: "a\u0000b" }, "note"],
    [{ action: "block", reason: "" }, "reason"],
    [{ action: "block", reason: "   " }, "reason"],
    [{ action: "block" }, "reason"],
    [{ action: "soft_delete", confirm_email: "someone@else.ch" }, "confirm_email"],
    [{ action: "soft_delete" }, "confirm_email"],
    [{ action: "delete_account", confirm_text: "LÖSCHEN" }, "confirm_text"],
  ];
  for (const [body, field] of bad) await expectError(await userPost(USER, { ...body, confirm: true }), 400, "invalid_input", field);
  // Business rules → 409 with a reason.
  assert.equal((await expectError(await userPost(USER, { action: "delete_account", confirm_text: "kim@example.ch", confirm: true }), 409, "conflict")).reason, "not_blocked");
  assert.equal((await expectError(await userPost(ADMIN, { action: "block", reason: "x", confirm: true }), 409, "conflict")).reason, "self");
  assert.equal((await expectError(await userPost(ADMIN, { action: "soft_delete", confirm_email: "panat@example.ch", confirm: true }), 409, "conflict")).reason, "self");
  assert.equal(mutated().length, 0);
  assert.equal(m.audit.length, 0);
});

test("school / list / audit inputs are validated strictly", async () => {
  const bad = [
    [{ action: "assign_licence", package: "gold" }, "package"],
    [{ action: "assign_licence", package: "custom" }, "student_limit"],
    [{ action: "assign_licence", package: "starter", student_limit: 0 }, "student_limit"],
    [{ action: "assign_licence", package: "starter", start: "2026-12-01", end: "2026-11-01" }, "end"],
    [{ action: "assign_licence", package: "starter", status: "cancelled" }, "status"],
    [{ action: "assign_licence", package: "starter", billing_interval: "weekly" }, "billing_interval"],
    [{ action: "update_licence", licence_id: "x", valid_until: "2027-01-01" }, "licence_id"],
    [{ action: "update_licence", licence_id: LIC }, "body"],
    [{ action: "update_licence", licence_id: LIC_PILOT, valid_until: "2027-01-01" }, "valid_until"],
    [{ action: "update_licence", licence_id: LIC, pilot_end: "2027-01-01" }, "pilot_end"],
    [{ action: "update_licence", licence_id: LIC, valid_until: "2025-01-01" }, "valid_until"], // before valid_from
    [{ action: "add_admin", email: "not an email" }, "email"],
    [{ action: "add_teacher", email: "a@b.ch\r\nBcc: x@y.ch" }, "email"],
    [{ action: "remove_teacher", user_id: "nope" }, "user_id"],
  ];
  for (const [body, field] of bad) await expectError(await schoolPost(SCHOOL, { ...body, confirm: true }), 400, "invalid_input", field);
  await expectError(await schoolPost(SCHOOL, { action: "update_licence", licence_id: LIC_OTHER, student_limit: 5, confirm: true }), 404, "not_found");
  await expectError(await schoolPost(NOBODY, { action: "revoke_licence", licence_id: LIC, confirm: true }), 404, "not_found");
  assert.equal((await expectError(await schoolPost(SCHOOL, { action: "add_teacher", email: "ghost@example.ch", confirm: true }), 409, "conflict")).reason, "user_not_found");
  assert.equal((await expectError(await schoolPost(SCHOOL, { action: "add_admin", email: "lehrer@example.ch", confirm: true }), 409, "conflict")).reason, "already_member");
  await expectError(await schoolPost(SCHOOL, { action: "remove_teacher", user_id: USER, confirm: true }), 404, "not_found");
  await expectError(await api.createSchool(post("/api/admin/schools", { action: "create", name: "", confirm: true })), 400, "invalid_input", "name");
  await expectError(await api.createSchool(post("/api/admin/schools", { action: "create", name: "A", country: "FR", confirm: true })), 400, "invalid_input", "country");
  await expectError(await api.createSchool(post("/api/admin/schools", { action: "delete", name: "A", confirm: true })), 400, "invalid_input", "action");

  await expectError(await api.users(req(`/api/admin/users?q=${"a".repeat(121)}`)), 400, "invalid_input", "q");
  await expectError(await api.users(req("/api/admin/users?state=deleted")), 400, "invalid_input", "state");
  await expectError(await api.users(req("/api/admin/users?page=0")), 400, "invalid_input", "page");
  await expectError(await api.signups(req("/api/admin/signups?days=365")), 400, "invalid_input", "days");
  await expectError(await api.audit(req("/api/admin/audit?action=user.block%27--")), 400, "invalid_input", "action");
  await expectError(await api.audit(req("/api/admin/audit?target_user=abc")), 400, "invalid_input", "target_user");
  await expectError(await api.audit(req("/api/admin/audit?since=yesterday")), 400, "invalid_input", "since");
  await expectError(await api.user(req("/api/admin/users/x"), "x"), 400, "invalid_input", "id");
  await expectError(await api.user(req(`/api/admin/users/${NOBODY}`), NOBODY), 404, "not_found");
  assert.equal(mutated().length, 0);
  assert.equal(m.audit.length, 0);
});

test("list / audit filters reach the store normalised", async () => {
  await api.users(req("/api/admin/users?q=%20Kim@Example.CH%20&page=2&state=trial&role=parent"));
  assert.deepEqual(m.calls.find((c) => c.name === "listUsers").args[0], { q: "kim@example.ch", page: 2, pageSize: 50, state: "trial", role: "parent", sub: "all", school: "all" });
  await api.users(req(`/api/admin/users?sub=active&school=${SCHOOL.toUpperCase()}`));
  const lf = m.calls.filter((c) => c.name === "listUsers").at(-1).args[0];
  assert.equal(lf.sub, "active");
  assert.equal(lf.school, SCHOOL);
  await expectError(await api.users(req("/api/admin/users?school=nope")), 400, "invalid_input", "school");
  await expectError(await api.users(req("/api/admin/users?sub=maybe")), 400, "invalid_input", "sub");
  await api.audit(req(`/api/admin/audit?action=user.block&target_user=${USER.toUpperCase()}&since=2026-11-01`));
  const f = m.calls.find((c) => c.name === "listAudit").args[0];
  assert.equal(f.target_user, USER);
  assert.equal(f.action, "user.block");
  assert.equal(f.since, "2026-11-01");
  const s = await (await api.signups(req("/api/admin/signups?days=7"))).json();
  assert.equal(s.days, 7);
  assert.equal(s.by_day.length, 7);
  assert.equal(s.by_day.at(-1).day, "2026-11-17");
  assert.equal(s.by_day.at(-1).count, 1);
  assert.equal(s.by_day.at(-2).count, 1);
});

// ------------------------------------------------------------------ audit for every mutation

const auditOrder = () => m.calls.map((c) => c.name).filter((n) => n === "writeAudit" || /^(update|delete|create|assign|add|remove)/.test(n));

const USER_CASES = [
  ["set_trial", USER, { trial_ends_at: "2026-12-24" }, (a) => assert.equal(a.trial_ends_at, "2026-12-24T23:59:59.000Z")],
  ["extend_trial", USER, { days: 14 }, (a) => assert.equal(a.trial_ends_at, new Date(NOW.getTime() + 14 * 86400000).toISOString())],
  ["grant_access", USER, { until: "2027-06-30", note: "Pilot Lehrperson" }, (a) => { assert.equal(a.free_access_until, "2027-06-30T23:59:59.000Z"); assert.equal(a.free_access_note, "Pilot Lehrperson"); }],
  ["revoke_access", USER, {}, (a) => assert.equal(a.free_access_until, null)],
  ["block", USER, { reason: "Missbrauch" }, (a) => { assert.equal(a.blocked_at, NOW.toISOString()); assert.equal(a.blocked_reason, "Missbrauch"); }],
  ["unblock", BLOCKED, {}, (a) => assert.equal(a.blocked_at, null)],
  ["soft_delete", USER, { confirm_email: " KIM@example.ch " }, (a) => { assert.ok(a.blocked_at); assert.match(a.blocked_reason, /Löschung/); }],
];

for (const [action, target, fields, check] of USER_CASES) {
  test(`audit: user.${action} is logged (admin, target, before/after, ip) BEFORE it is applied`, async () => {
    const res = await userPost(target, { action, ...fields, confirm: true }, { ip: "192.0.2.44" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    check(body.account_access);
    assert.deepEqual(auditOrder(), ["writeAudit", "updateAccess"]);
    const [entry] = m.audit;
    assert.equal(entry.admin_id, ADMIN);
    assert.equal(entry.action, `user.${action}`);
    assert.equal(entry.target_user, target);
    assert.equal(entry.ip, "192.0.2.44");
    assert.ok("before" in entry.details && "after" in entry.details);
    assert.deepEqual(Object.keys(entry.details.before).sort(), Object.keys(entry.details.after).sort());
    assert.equal(m.calls.find((c) => c.name === "updateAccess").args[2], ADMIN, "updated_by = admin");
  });
}

test("audit: delete_account (blocked user, e-mail typed) → audit first, then the existing deletion path", async () => {
  const res = await userPost(BLOCKED, { action: "delete_account", confirm_text: "Blocked@Example.ch", confirm: true });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, deleted: true });
  assert.deepEqual(auditOrder(), ["writeAudit", "deleteAccount"]);
  assert.equal(m.audit[0].action, "user.delete_account");
  assert.equal(m.audit[0].target_user, BLOCKED);
  assert.ok(!JSON.stringify(m.audit[0]).includes("blocked@example.ch"), "no full e-mail in the log");
});

test("security review A1: platform admins cannot be blocked or soft-deleted by another admin (no audit row)", async () => {
  assert.equal((await expectError(await userPost(OTHER_ADMIN, { action: "block", reason: "x", confirm: true }), 409, "conflict")).reason, "platform_admin");
  assert.equal((await expectError(await userPost(OTHER_ADMIN, { action: "soft_delete", confirm_email: "admin2@example.ch", confirm: true }), 409, "conflict")).reason, "platform_admin");
  assert.equal(m.audit.length, 0);
});

test("delete_account: platform admins cannot be deleted; running subscription → 409 + failed audit row", async () => {
  m.access.set(OTHER_ADMIN, { user_id: OTHER_ADMIN, blocked_at: "2026-11-15T00:00:00Z" });
  assert.equal((await expectError(await userPost(OTHER_ADMIN, { action: "delete_account", confirm_text: "admin2@example.ch", confirm: true }), 409, "conflict")).reason, "platform_admin");
  assert.equal(m.audit.length, 0);
  m.fail.add("deleteAccount"); m.fail.add("billing");
  await expectError(await userPost(BLOCKED, { action: "delete_account", confirm_text: "blocked@example.ch", confirm: true }), 409, "subscription_active");
  assert.deepEqual(m.audit.map((a) => a.action), ["user.delete_account", "user.delete_account.failed"]);
  assert.equal(m.audit[1].details.error, "subscription_active");
});

const SCHOOL_CASES = [
  ["assign_licence", { package: "custom", student_limit: 250, start: "2026-12-01", end: "2027-11-30", billing_interval: "yearly", notes: "Vertrag 2027" }, "assignLicence", undefined],
  ["update_licence", { licence_id: LIC, valid_until: "2027-12-31", student_limit: 150 }, "updateLicence", undefined],
  ["update_licence", { licence_id: LIC_PILOT, pilot_end: "2026-12-31" }, "updateLicence", undefined],
  ["revoke_licence", { licence_id: LIC }, "updateLicence", undefined],
  ["add_admin", { email: "Kim@Example.ch" }, "addSchoolAdmin", USER],
  ["remove_admin", { user_id: TEACHER }, "removeSchoolAdmin", TEACHER],
  ["add_teacher", { email: "lehrer@example.ch" }, "addSchoolTeacher", TEACHER],
];

for (const [action, fields, method, targetUser] of SCHOOL_CASES) {
  test(`audit: school.${action} (${Object.keys(fields).join(",")}) is logged BEFORE it is applied`, async () => {
    const res = await schoolPost(SCHOOL, { action, ...fields, confirm: true });
    assert.equal(res.status, 200, await res.clone().text());
    assert.deepEqual(auditOrder(), ["writeAudit", method]);
    const [entry] = m.audit;
    assert.equal(entry.action, `school.${action}`);
    assert.equal(entry.admin_id, ADMIN);
    assert.equal(entry.target_school, SCHOOL);
    if (targetUser) assert.equal(entry.target_user, targetUser);
    assert.ok("before" in entry.details && "after" in entry.details);
    if (action === "revoke_licence") assert.deepEqual(m.calls.find((c) => c.name === "updateLicence").args[1], { status: "cancelled" });
    if (action === "add_teacher") assert.deepEqual(m.calls.find((c) => c.name === "addSchoolTeacher").args, [SCHOOL, TEACHER, ADMIN]);
  });
}

test("audit: school.remove_teacher", async () => {
  m.store.schoolTeachers = async () => [TEACHER];
  assert.equal((await schoolPost(SCHOOL, { action: "remove_teacher", user_id: TEACHER, confirm: true })).status, 200);
  assert.deepEqual(auditOrder(), ["writeAudit", "removeSchoolTeacher"]);
  assert.equal(m.audit[0].action, "school.remove_teacher");
});

test("audit: school.create → intent row before the insert, result row with the new id after", async () => {
  const res = await api.createSchool(post("/api/admin/schools", { action: "create", name: " Sek Wiesendangen ", canton_or_state: "ZH", confirm: true }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, school_id: SCHOOL2 });
  assert.deepEqual(auditOrder(), ["writeAudit", "createSchool", "writeAudit"]);
  assert.deepEqual(m.calls.find((c) => c.name === "createSchool").args[0], { name: "Sek Wiesendangen", canton_or_state: "ZH", country: "CH" });
  assert.deepEqual(m.audit.map((a) => [a.action, a.target_school]), [["school.create", null], ["school.create.done", SCHOOL2]]);
});

test("revoking a cancelled licence / editing a closed one → 409", async () => {
  m.licences.set(LIC, { ...m.licences.get(LIC), status: "cancelled" });
  assert.equal((await expectError(await schoolPost(SCHOOL, { action: "revoke_licence", licence_id: LIC, confirm: true }), 409, "conflict")).reason, "already_cancelled");
  assert.equal((await expectError(await schoolPost(SCHOOL, { action: "update_licence", licence_id: LIC, student_limit: 10, confirm: true }), 409, "conflict")).reason, "licence_closed");
  assert.equal(m.audit.length, 0);
});

test("no audit → no change: if the audit insert fails, nothing is applied and the answer is a generic 500", async () => {
  m.fail.add("writeAudit");
  const res = await userPost(USER, { action: "block", reason: "x", confirm: true });
  const body = await expectError(res, 500, "failed");
  assert.deepEqual(Object.keys(body), ["error"]);
  assert.equal(mutated().length, 0);
});

test("failed change → generic 500 (no DB details) and a '.failed' audit row", async () => {
  m.fail.add("updateAccess");
  const errors = [];
  const orig = console.error;
  console.error = (...a) => errors.push(a.join(" "));
  try {
    const res = await userPost(USER, { action: "grant_access", until: "2027-01-31", confirm: true });
    const text = await res.text();
    assert.equal(res.status, 500);
    assert.equal(text, JSON.stringify({ error: "failed" }));
  } finally { console.error = orig; }
  assert.deepEqual(m.audit.map((a) => a.action), ["user.grant_access", "user.grant_access.failed"]);
  assert.ok(errors.every((e) => !e.includes("secret-detail")), "logged without details");
});

// ------------------------------------------------------------------ pure helpers

test("validators", () => {
  assert.equal(v.uuid(USER.toUpperCase(), "id"), USER);
  assert.throws(() => v.uuid("00000000-0000-0000-0000-000000000000", "id"));
  assert.equal(v.email(" A.B+c@Example.CH "), "a.b+c@example.ch");
  for (const bad of ["a@b", "@b.ch", "a b@c.ch", "a@b..ch", "a@-b.ch", `${"a".repeat(65)}@b.ch`]) assert.throws(() => v.email(bad), bad);
  assert.equal(v.date("2028-02-29", "d"), "2028-02-29");
  assert.throws(() => v.date("2027-02-29", "d"));
  assert.equal(v.instant("2026-11-20T10:00:00+01:00", "t", NOW, { pastDays: 0, futureDays: 10 }), "2026-11-20T09:00:00.000Z");
  assert.throws(() => v.instant("2026-11-20T10:00:00", "t", NOW, { pastDays: 0, futureDays: 10 }), "zone required");
  assert.equal(v.int("12", "n", 1, 20), 12);
  assert.throws(() => v.int("1e2", "n", 1, 200));
  assert.equal(v.query(null), "");
  assert.throws(() => v.query("a\u0007"));
});

test("licence state mirrors public._licence_state; current licence prefers a usable one", () => {
  const today = "2026-11-17";
  assert.equal(licenceState({ status: "pilot", pilot_end: "2026-11-16", valid_from: null, valid_until: null }, today), "expired");
  assert.equal(licenceState({ status: "pilot", pilot_end: "2026-11-17", valid_from: null, valid_until: null }, today), "pilot");
  assert.equal(licenceState({ status: "active", pilot_end: null, valid_from: "2026-12-01", valid_until: null }, today), "not_started");
  assert.equal(licenceState({ status: "active", pilot_end: null, valid_from: null, valid_until: "2026-11-16" }, today), "expired");
  assert.equal(licenceState({ status: "active", pilot_end: null, valid_from: null, valid_until: null }, today), "active");
  assert.equal(licenceState({ status: "cancelled", pilot_end: null, valid_from: null, valid_until: null }, today), "cancelled");
  const cur = currentLicence([{ id: "new", state: "expired", created_at: "2026-11-10" }, { id: "old", state: "active", created_at: "2026-01-01" }]);
  assert.equal(cur.id, "old");
  assert.equal(currentLicence([]), null);
});

test("Stripe dashboard links: test/ prefix outside live mode", () => {
  const s = { stripe_subscription_id: "sub_123", stripe_customer_id: "cus_456" };
  assert.deepEqual(stripeLinks(s, false), { stripe_url: "https://dashboard.stripe.com/test/subscriptions/sub_123", customer_url: "https://dashboard.stripe.com/test/customers/cus_456" });
  assert.equal(stripeLinks(s, true).stripe_url, "https://dashboard.stripe.com/subscriptions/sub_123");
});

// ------------------------------------------------------------------ static checks

const read = (f) => readFile(join(root, f), "utf8");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });

test("admin routes: every handler goes through adminApi (guard), service role only in lib/admin/server.ts", async () => {
  const routes = git("ls-files", "--cached", "--others", "--exclude-standard", "app/api/admin").split("\n").filter((f) => f.endsWith("route.ts"));
  assert.ok(routes.length >= 7, routes.join(","));
  for (const f of routes) {
    const src = await read(f);
    assert.match(src, /from "@\/lib\/admin\/server"/, f);
    assert.ok(!/SUPABASE_SERVICE_ROLE_KEY|createClient/.test(src), `${f} must not build its own client`);
    for (const m of src.matchAll(/export (?:async function|const) (GET|POST|PUT|PATCH|DELETE)\b[^\n]*/g)) assert.match(m[0], /adminApi\(\)\.\w+\(request/, `${f} ${m[1]}`);
  }
  const files = git("ls-files", "--cached", "--others", "--exclude-standard", "lib/admin", "app/admin", "components/admin").split("\n").filter(Boolean);
  for (const f of files) {
    const src = await read(f);
    if (f !== "lib/admin/server.ts") assert.ok(!src.includes("SUPABASE_SERVICE_ROLE_KEY"), `${f} reads the service role key`);
    if (/^["']use client["']/m.test(src)) assert.ok(!/lib\/admin\/(server|handler|guard|store)/.test(src), `${f} (client) imports server admin code`);
  }
  const server = await read("lib/admin/server.ts");
  assert.ok(!/^["']use client["']/m.test(server));
});

test("/admin is hidden: robots disallow, noindex layout, not linked from the normal UI", async () => {
  assert.ok((await import("../app/robots.ts")).DISALLOW.includes("/admin"));
  const layout = await read("app/admin/layout.tsx").catch(() => "");
  if (layout) assert.match(layout, /index:\s*false/);
  const linked = git("grep", "-nE", "[\"'`]/admin([\"'`/?#])", "--", "app", "components", "lib", "public").split("\n").filter(Boolean)
    .filter((l) => !/^(app\/admin\/|components\/admin\/|app\/robots\.ts)/.test(l));
  assert.deepEqual(linked, []);
  const sitemap = await read("app/sitemap.ts");
  assert.ok(!sitemap.includes("/admin"));
});

test("/admin is never stored by a shared cache; the client turns 403 reauth_required into a fresh login", async () => {
  const page = await readFile(join(root, "app/admin/page.tsx"), "utf8");
  assert.match(page, /export const dynamic = "force-dynamic"/, "dynamic page → Cache-Control private, no-store (no Netlify CDN copy)");
  const config = await readFile(join(root, "next.config.ts"), "utf8");
  assert.match(config, /\["\/admin", "\/admin\/:path\*"\]/);
  assert.match(config, /X-Robots-Tag", value: "noindex, nofollow"/);
  assert.match(config, /Cache-Control", value: "private, no-store"/);
  const client = await readFile(join(root, "components/admin/api.ts"), "utf8");
  assert.match(client, /err\.error === "reauth_required"\) authHandler\?\.\("reauth"\)/);
  const app = await readFile(join(root, "components/admin/admin-app.tsx"), "utf8");
  assert.match(app, /signOut\(\{ scope: "local" \}\)/, "a stale session is ended in this browser before asking for a new login");
});
