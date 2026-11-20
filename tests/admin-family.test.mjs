// Admin family package API + helpers (lib/admin/family.ts, handler familyStatus / familyGrant / familyRevoke, server familyRpc).
// Store and rate-limit transport are mocked; no network, no database (the SQL is covered by admin-family-grant-db.test.mjs).
import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
import { readFile } from "node:fs/promises";

register("./helpers/alias-hooks.mjs", import.meta.url);

const { createAdminApi } = await import("../lib/admin/handler.ts");
const { memoryRateLimitRpc } = await import("../lib/rate-limit/core.ts");
const fam = await import("../lib/admin/family.ts");
const { familyRpc } = await import("../lib/admin/server.ts");
const { auditActionLabel } = await import("../lib/admin/status.ts");

const NOW = new Date("2026-11-20T12:00:00Z");
const ADMIN = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.c2ln`;
const FRESH = Math.floor(NOW.getTime() / 1000) - 600;
const ADMIN_TOKEN = jwt({ sub: ADMIN, aal: "aal2", amr: [{ method: "totp", timestamp: FRESH }] });
const USER_TOKEN = jwt({ sub: USER, aal: "aal2", amr: [{ method: "totp", timestamp: FRESH }] });

function setup({ throwOn = {} } = {}) {
  const calls = [];
  const audit = [];
  const store = {
    async verifyToken(t) {
      // "Supabase Auth" accepts every well-formed test token; the guard then checks admin, MFA and freshness itself.
      const sub = JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString()).sub;
      return sub === ADMIN ? { id: ADMIN, email: "a@x.ch" } : sub === USER ? { id: USER, email: "u@x.ch" } : null;
    },
    async isPlatformAdmin(id) { return id === ADMIN; },
    async writeAudit(e) { audit.push(e); },
    async familyStatus(token, userId) { calls.push(["status", token, userId]); if (throwOn.status) throw throwOn.status; return { user_id: userId, plan_kind: "none" }; },
    async familyGrant(token, userId, input) { calls.push(["grant", token, userId, input]); if (throwOn.grant) throw throwOn.grant; return { family_id: "f1", licence_id: "l1", status: "active" }; },
    async familyRevoke(token, userId, note) { calls.push(["revoke", token, userId, note]); if (throwOn.revoke) throw throwOn.revoke; return { family_id: "f1", licence_ids: ["l1"], status: "cancelled" }; },
  };
  let ip = 0;
  const api = createAdminApi({ store, rpc: memoryRateLimitRpc(() => NOW.getTime()), env: {}, now: () => NOW });
  const req = (method, body, { token = ADMIN_TOKEN, type = "application/json" } = {}) => {
    const h = { "x-nf-client-connection-ip": `10.0.0.${++ip}` };
    if (token) h.authorization = `Bearer ${token}`;
    if (body !== undefined) h["content-type"] = type;
    return new Request(`https://wendapply.ch/api/admin/users/${USER}/family`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  return { api, calls, audit, req };
}

// ---------------------------------------------------------------- validation

test("familyUntil: null/empty = unlimited, day → 21:00Z of that day, ISO kept; past / > 10 years / garbage refused", () => {
  assert.equal(fam.familyUntil(null, NOW), null);
  assert.equal(fam.familyUntil(undefined, NOW), null);
  assert.equal(fam.familyUntil("", NOW), null);
  assert.equal(fam.familyUntil("2027-02-20", NOW), "2027-02-20T21:00:00.000Z");
  assert.equal(fam.familyUntil("2026-11-20", NOW), "2026-11-20T21:00:00.000Z", "today still counts until the evening");
  assert.equal(fam.familyUntil("2027-01-01T10:00:00Z", NOW), "2027-01-01T10:00:00.000Z");
  for (const bad of ["2026-11-19", "2026-11-20T11:00:00Z", "2037-01-01", "2027-02-30", "morgen", 12, {}, "2027-1-1"]) {
    assert.throws(() => fam.familyUntil(bad, NOW), (e) => e.field === "until", String(bad));
  }
});

test("familyGrantInput: defaults 2 parents / 4 children, seat ranges, note ≤ 500, unknown keys refused", () => {
  assert.deepEqual(fam.familyGrantInput({ action: "x", confirm: true }, NOW), { until: null, note: null, seats_parents: 2, seats_children: 4 });
  assert.deepEqual(fam.familyGrantInput({ until: "2027-11-20", note: "  Panu  ", seats_parents: 3, seats_children: "6" }, NOW),
    { until: "2027-11-20T21:00:00.000Z", note: "Panu", seats_parents: 3, seats_children: 6 });
  for (const [body, field] of [
    [{ seats_parents: 0 }, "seats_parents"], [{ seats_parents: 11 }, "seats_parents"], [{ seats_children: 21 }, "seats_children"],
    [{ seats_children: 1.5 }, "seats_children"], [{ note: "x".repeat(501) }, "note"], [{ note: "a\u0000b" }, "note"], [{ evil: 1 }, "evil"],
    [{ until: "2020-01-01" }, "until"],
  ]) assert.throws(() => fam.familyGrantInput(body, NOW), (e) => e.field === field, JSON.stringify(body));
  assert.deepEqual(fam.familyRevokeInput({ note: "weg" }), { note: "weg" });
  assert.throws(() => fam.familyRevokeInput({ until: null }), (e) => e.field === "until");
});

test("database error codes map to clear HTTP answers", () => {
  assert.equal(fam.familyDbErrorCode({ code: "P0001", message: "STRIPE_MANAGED" }), "STRIPE_MANAGED");
  assert.equal(fam.familyDbErrorCode({ code: "42501", message: "FORBIDDEN" }), "FORBIDDEN");
  assert.equal(fam.familyDbErrorCode({ code: "PGRST202", message: "Could not find the function" }), "RPC_MISSING");
  assert.equal(fam.familyDbErrorCode({ code: "XX000", message: "boom secret" }), null);
  assert.deepEqual(fam.familyErrorHttp("STRIPE_MANAGED"), { kind: "conflict", reason: "stripe_managed" });
  assert.deepEqual(fam.familyErrorHttp("NOT_GRANTED"), { kind: "conflict", reason: "family_not_granted" });
  assert.deepEqual(fam.familyErrorHttp("INVALID_SEATS"), { kind: "invalid", field: "seats_children" });
  assert.deepEqual(fam.familyErrorHttp("FORBIDDEN"), { kind: "not_found" });
  for (const c of fam.FAMILY_DB_ERRORS) assert.ok(fam.familyErrorHttp(c), c);
});

test("UI helpers: month presets clamp to month end, form → body, labels", () => {
  assert.equal(fam.addMonthsDay(1, new Date("2026-01-31T10:00:00Z")), "2026-02-28");
  assert.equal(fam.addMonthsDay(12, new Date("2026-11-20T10:00:00Z")), "2027-11-20");
  assert.equal(fam.addMonthsDay(3, new Date("2026-11-30T23:30:00Z")), "2027-03-01", "Zurich is already on 1 Dec");
  const base = fam.emptyFamilyGrantForm();
  assert.deepEqual([base.duration, base.seats_parents, base.seats_children], ["12", "2", "4"]);
  assert.deepEqual(fam.familyGrantBody({ ...base, duration: "unlimited", note: " hi " }, NOW), { until: null, seats_parents: 2, seats_children: 4, note: "hi" });
  assert.deepEqual(fam.familyGrantBody({ ...base, duration: "6" }, NOW), { until: "2027-05-20", seats_parents: 2, seats_children: 4 });
  assert.deepEqual(fam.familyGrantBody({ ...base, duration: "custom", custom: "2027-01-15" }, NOW).until, "2027-01-15");
  assert.equal(fam.assignedByLabel(`admin:${ADMIN}`), "Admin 11111111");
  assert.equal(fam.assignedByLabel(`admin:${ADMIN}`, () => "a@x.ch"), "Admin a@x.ch");
  assert.equal(fam.assignedByLabel("stripe"), "Stripe");
  assert.equal(fam.assignedByLabel(null), "–");
  assert.equal(auditActionLabel("family_grant"), "Familienpaket vergeben");
  assert.equal(auditActionLabel("family_revoke.failed"), "Familienpaket entzogen – fehlgeschlagen");
});

// ---------------------------------------------------------------- handler

test("GET status: guard first (401 / 404 for non-admins), then the RPC with the admin's own token", async () => {
  const { api, calls, req } = setup();
  assert.equal((await api.familyStatus(req("GET", undefined, { token: null }), USER)).status, 401);
  assert.equal((await api.familyStatus(req("GET", undefined, { token: USER_TOKEN }), USER)).status, 404);
  assert.equal(calls.length, 0);
  const ok = await api.familyStatus(req("GET"), USER);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.deepEqual(calls[0], ["status", ADMIN_TOKEN, USER]);
  assert.equal((await api.familyStatus(req("GET"), "not-a-uuid")).status, 400);
});

test("POST grant: confirm + JSON required, validated input reaches the store; refused DB call → 409 + .failed audit", async () => {
  const s = setup();
  assert.equal((await s.api.familyGrant(s.req("POST", { until: null }), USER)).status, 400, "confirm missing");
  assert.equal((await s.api.familyGrant(s.req("POST", { confirm: true }, { type: "text/plain" }), USER)).status, 400, "content-type");
  const bad = await s.api.familyGrant(s.req("POST", { confirm: true, seats_children: 99 }), USER);
  assert.equal(bad.status, 400); assert.deepEqual(await bad.json(), { error: "invalid_input", field: "seats_children" });
  assert.equal(s.calls.length, 0);
  const ok = await s.api.familyGrant(s.req("POST", { confirm: true, until: "2027-11-20", note: "Panu", seats_parents: 2, seats_children: 3 }), USER);
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).family.licence_id, "l1");
  assert.deepEqual(s.calls[0], ["grant", ADMIN_TOKEN, USER, { until: "2027-11-20T21:00:00.000Z", note: "Panu", seats_parents: 2, seats_children: 3 }]);
  assert.equal(s.audit.length, 0, "success audit is written by the database function");

  const refused = setup({ throwOn: { grant: new fam.FamilyRpcError("STRIPE_MANAGED") } });
  const r = await refused.api.familyGrant(refused.req("POST", { confirm: true }), USER);
  assert.equal(r.status, 409); assert.deepEqual(await r.json(), { error: "conflict", reason: "stripe_managed" });
  assert.equal(refused.audit[0].action, "family_grant.failed");
  assert.equal(refused.audit[0].details.error, "stripe_managed");
  assert.equal(refused.audit[0].target_user, USER);

  const crash = setup({ throwOn: { grant: new Error("DB_FAILED:admin_family_grant:secret") } });
  const c = await crash.api.familyGrant(crash.req("POST", { confirm: true }), USER);
  assert.equal(c.status, 500); assert.deepEqual(await c.json(), { error: "failed" });
});

test("DELETE revoke: note validated, not granted → 409 family_not_granted, FORBIDDEN from DB → 404", async () => {
  const s = setup();
  const ok = await s.api.familyRevoke(s.req("DELETE", { confirm: true, note: "Ende Test" }), USER);
  assert.equal(ok.status, 200);
  assert.deepEqual(s.calls[0], ["revoke", ADMIN_TOKEN, USER, "Ende Test"]);
  assert.equal((await s.api.familyRevoke(s.req("DELETE", { confirm: true, note: "x".repeat(501) }), USER)).status, 400);
  const ng = setup({ throwOn: { revoke: new fam.FamilyRpcError("NOT_GRANTED") } });
  const r = await ng.api.familyRevoke(ng.req("DELETE", { confirm: true }), USER);
  assert.deepEqual([r.status, (await r.json()).reason], [409, "family_not_granted"]);
  const fb = setup({ throwOn: { revoke: new fam.FamilyRpcError("FORBIDDEN") } });
  assert.equal((await fb.api.familyRevoke(fb.req("DELETE", { confirm: true }), USER)).status, 404);
  assert.equal(fb.audit.length, 0);
});

test("familyRpc: calls the RPC through the admin-session client, maps known errors, hides unknown ones", async () => {
  const seen = [];
  const client = (result) => (token) => ({ rpc: async (fn, args) => { seen.push([token, fn, args]); return result; } });
  assert.deepEqual(await familyRpc("tok", "admin_family_status", { p_user_id: USER }, client({ data: { ok: 1 }, error: null })), { ok: 1 });
  assert.deepEqual(seen[0], ["tok", "admin_family_status", { p_user_id: USER }]);
  await assert.rejects(familyRpc("tok", "admin_family_grant", {}, client({ data: null, error: { code: "P0001", message: "SEATS_TOO_LOW" } })),
    (e) => e instanceof fam.FamilyRpcError && e.code === "SEATS_TOO_LOW");
  await assert.rejects(familyRpc("tok", "admin_family_grant", {}, client({ data: null, error: { code: "XX000", message: "secret detail" } })),
    (e) => e.message === "DB_FAILED:admin_family_grant:XX000");
});

test("route file exports GET / POST / DELETE through adminApi(); server never uses the service key for family RPCs", async () => {
  const route = await readFile(new URL("../app/api/admin/users/[id]/family/route.ts", import.meta.url), "utf8");
  for (const m of ["GET", "POST", "DELETE"]) assert.match(route, new RegExp(`export async function ${m}\\(`));
  assert.match(route, /adminApi\(\)\.familyStatus/); assert.match(route, /adminApi\(\)\.familyGrant/); assert.match(route, /adminApi\(\)\.familyRevoke/);
  const server = await readFile(new URL("../lib/admin/server.ts", import.meta.url), "utf8");
  const fn = server.slice(server.indexOf("export function adminSessionClient"), server.indexOf("export async function familyRpc"));
  assert.match(fn, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(fn, /SERVICE_ROLE/);
});

test("guard on all three family endpoints: 403 mfa_required (aal1 password session) and 403 reauth_required (stale login)", async () => {
  const s = setup();
  const aal1 = jwt({ sub: ADMIN, aal: "aal1", amr: [{ method: "password", timestamp: FRESH }] });
  const stale = jwt({ sub: ADMIN, aal: "aal2", amr: [{ method: "totp", timestamp: FRESH - 13 * 3600 }] });
  for (const [token, error] of [[aal1, "mfa_required"], [stale, "reauth_required"]]) {
    for (const res of [
      await s.api.familyStatus(s.req("GET", undefined, { token }), USER),
      await s.api.familyGrant(s.req("POST", { confirm: true }, { token }), USER),
      await s.api.familyRevoke(s.req("DELETE", { confirm: true }, { token }), USER),
    ]) {
      assert.equal(res.status, 403);
      assert.equal((await res.json()).error, error);
    }
  }
  assert.equal(s.calls.length, 0, "no RPC before the guard passed");
});
