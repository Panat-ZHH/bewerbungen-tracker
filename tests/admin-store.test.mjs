// lib/admin/server.ts (service-role store) against a fake supabase-js client: the right tables / RPCs / columns are used,
// audit rows land in admin_audit_log, a missing access table (DB before the migration) degrades instead of crashing,
// and DB errors never leak their message.
import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";

register("./helpers/alias-hooks.mjs", import.meta.url);
const { supabaseAdminStore, googleVerified } = await import("../lib/admin/server.ts");

const U = "22222222-2222-4222-8222-222222222222";
const A = "11111111-1111-4111-8111-111111111111";
const S = "55555555-5555-4555-8555-555555555555";

/** Chainable fake of supabase-js: records every call; answers come from `answer(table, ops)`. */
function fakeDb(answer, rpcAnswer = () => ({ data: null, error: null })) {
  const log = [];
  const builder = (table) => {
    const ops = [];
    const b = new Proxy({}, {
      get(_t, prop) {
        if (prop === "then") {
          const res = answer(table, ops);
          log.push({ table, ops });
          return (ok, ko) => Promise.resolve(res).then(ok, ko);
        }
        return (...args) => { ops.push([prop, ...args]); return b; };
      },
    });
    return b;
  };
  const users = [
    { id: U, email: "kim@example.ch", created_at: "2026-11-10T00:00:00Z", last_sign_in_at: null, factors: [], user_metadata: { full_name: "Kim" } },
    { id: A, email: "panat@example.ch", created_at: "2026-01-01T00:00:00Z", last_sign_in_at: null, factors: [{ status: "verified" }] },
  ];
  return {
    log,
    from: (t) => builder(t),
    rpc: async (fn, args) => { log.push({ rpc: fn, args }); return rpcAnswer(fn, args); },
    auth: {
      getUser: async (token) => (token === "good" ? { data: { user: users[1] }, error: null } : { data: { user: null }, error: { message: "bad" } }),
      admin: {
        listUsers: async () => ({ data: { users }, error: null }),
        getUserById: async (id) => ({ data: { user: users.find((u) => u.id === id) ?? null }, error: null }),
        updateUserById: async (id, attrs) => { log.push({ updateUser: id, attrs }); return { data: { user: null }, error: null }; },
      },
    },
  };
}

const op = (entry, name) => entry.ops.find((o) => o[0] === name);

test("writeAudit inserts into admin_audit_log with the contract columns; a DB error throws a generic error", async () => {
  const db = fakeDb(() => ({ data: null, error: null }));
  const store = supabaseAdminStore(db);
  await store.writeAudit({ admin_id: A, action: "user.block", target_user: U, details: { before: {}, after: {} }, ip: "192.0.2.1" });
  const e = db.log[0];
  assert.equal(e.table, "admin_audit_log");
  assert.deepEqual(op(e, "insert")[1], { admin_id: A, action: "user.block", target_user: U, target_school: null, details: { before: {}, after: {} }, ip: "192.0.2.1" });

  const bad = supabaseAdminStore(fakeDb(() => ({ data: null, error: { code: "42501", message: "permission denied for table admin_audit_log (secret)" } })));
  await assert.rejects(bad.writeAudit({ admin_id: A, action: "x", details: {}, ip: null }), (err) => err.message === "DB_FAILED:admin_audit_log:42501");
});

test("verifyToken / isPlatformAdmin; missing platform_admins table → not an admin", async () => {
  const db = fakeDb((t) => (t === "platform_admins" ? { data: { user_id: A }, error: null } : { data: null, error: null }));
  const store = supabaseAdminStore(db);
  assert.deepEqual(await store.verifyToken("good"), { id: A, email: "panat@example.ch", googleVerified: false, mfaEnrolled: true });
  assert.equal(await store.verifyToken("bad"), null);
  assert.equal(await store.isPlatformAdmin(A), true);
  assert.deepEqual(op(db.log[0], "eq"), ["eq", "user_id", A]);
  const missing = supabaseAdminStore(fakeDb(() => ({ data: null, error: { code: "PGRST205" } })));
  assert.equal(await missing.isPlatformAdmin(A), false);
});

test("updateAccess updates account_access (updated_by = admin); creates the row with a 7-day trial when it is missing", async () => {
  const db = fakeDb((t, ops) => (op({ ops }, "insert") ? { data: { user_id: U, ...op({ ops }, "insert")[1] }, error: null } : { data: [], error: null }));
  const store = supabaseAdminStore(db);
  const row = await store.updateAccess(U, { blocked_at: "2026-11-17T12:00:00.000Z", blocked_reason: "x" }, A);
  const [upd, ins] = db.log;
  assert.equal(upd.table, "account_access");
  assert.equal(op(upd, "update")[1].updated_by, A);
  assert.deepEqual(op(upd, "eq"), ["eq", "user_id", U]);
  const inserted = op(ins, "insert")[1];
  assert.equal(inserted.trial_started_at, "2026-11-10T00:00:00Z");
  assert.equal(inserted.trial_ends_at, "2026-11-17T00:00:00.000Z");
  assert.equal(inserted.blocked_reason, "x");
  assert.equal(row.user_id, U);
});

test("licences: platform_assign_licence RPC parameters, revoke = status cancelled update", async () => {
  const db = fakeDb((t) => (t === "school_licences" ? { data: { id: "l1", school_id: S, package: "starter", status: "cancelled", student_limit: 100, created_at: "2026-01-01" }, error: null } : { data: null, error: null }),
    (fn) => ({ data: fn === "platform_assign_licence" ? "lic-id" : null, error: null }));
  const store = supabaseAdminStore(db);
  const id = await store.assignLicence(S, { package: "custom", status: null, student_limit: 250, start: "2026-12-01", end: null, billing_interval: "yearly", notes: null });
  assert.equal(id, "lic-id");
  assert.deepEqual(db.log[0].args, { p_school_id: S, p_package: "custom", p_status: null, p_student_limit: 250, p_start: "2026-12-01", p_end: null, p_billing_interval: "yearly", p_notes: null });
  const lic = await store.updateLicence("l1", { status: "cancelled" });
  assert.equal(lic.state, "cancelled");
  assert.deepEqual(op(db.log[1], "update")[1], { status: "cancelled" });
});

test("school people: admins via platform_add_school_admin, teachers into school_teachers with added_by", async () => {
  const db = fakeDb(() => ({ data: null, error: null }), () => ({ data: U, error: null }));
  const store = supabaseAdminStore(db);
  assert.equal(await store.addSchoolAdmin(S, "kim@example.ch"), U);
  assert.deepEqual(db.log[0], { rpc: "platform_add_school_admin", args: { p_school_id: S, p_email: "kim@example.ch", p_make_role: true } });
  // G6: role_confirmed is merged into the existing metadata (never replaces it).
  assert.deepEqual(db.log[1], { updateUser: U, attrs: { user_metadata: { full_name: "Kim", role_confirmed: true } } });
  await store.addSchoolTeacher(S, U, A);
  assert.equal(db.log[2].table, "school_teachers");
  assert.deepEqual(op(db.log[2], "insert")[1], { school_id: S, user_id: U, added_by: A });
  await store.removeSchoolTeacher(S, U);
  assert.ok(op(db.log[3], "delete"));
  assert.equal(await store.findUserIdByEmail("kim@example.ch"), U);
  assert.equal(await store.findUserIdByEmail("nobody@example.ch"), null);
});

test("listUsers: search, state filter and paging work on a DB without the access tables", async () => {
  const db = fakeDb((t) => (["account_access", "school_teachers"].includes(t) ? { data: null, error: { code: "42P01" } } : { data: [], error: null }),
    () => ({ data: null, error: { code: "PGRST202" } }));
  const store = supabaseAdminStore(db);
  const all = await store.listUsers({ q: "", page: 1, pageSize: 50, state: "all", role: "all" });
  assert.equal(all.total, 2);
  assert.equal(all.items[0].id, U, "newest first");
  assert.equal(all.items[0].access_state, null);
  assert.equal(all.items[1].mfa, true);
  const found = await store.listUsers({ q: "panat", page: 1, pageSize: 50, state: "all", role: "all" });
  assert.deepEqual(found.items.map((u) => u.id), [A]);
  assert.equal((await store.listUsers({ q: "", page: 1, pageSize: 50, state: "blocked", role: "all" })).total, 0);
  // Without subscriptions / schools in the DB: "with subscription" and a school id match nobody, "none" matches everyone.
  assert.equal((await store.listUsers({ q: "", page: 1, pageSize: 50, state: "all", role: "all", sub: "active" })).total, 0);
  assert.equal((await store.listUsers({ q: "", page: 1, pageSize: 50, state: "all", role: "all", sub: "none" })).total, 2);
  assert.equal((await store.listUsers({ q: "", page: 1, pageSize: 50, state: "all", role: "all", school: "none" })).total, 2);
  assert.equal((await store.listUsers({ q: "", page: 1, pageSize: 50, state: "all", role: "all", school: "55555555-5555-4555-8555-555555555555" })).total, 0);
});

test("googleVerified: only a Google identity with Google-verified e-mail equal to the confirmed account e-mail", () => {
  const g = (email, ev, extra = {}) => ({ provider: "google", identity_data: { email, email_verified: ev }, ...extra });
  const base = { email: "Panat@Example.ch", email_confirmed_at: "2026-11-17T00:00:00Z" };
  assert.equal(googleVerified({ ...base, identities: [g("panat@example.ch", true)] }), true);
  assert.equal(googleVerified({ ...base, identities: [g("panat@example.ch", false)] }), false);
  assert.equal(googleVerified({ ...base, identities: [g("panat@example.ch", undefined)] }), false);
  assert.equal(googleVerified({ ...base, identities: [g("other@example.ch", true)] }), false);
  assert.equal(googleVerified({ ...base, identities: [{ provider: "email", identity_data: { email: "panat@example.ch", email_verified: true } }] }), false);
  assert.equal(googleVerified({ ...base, email_confirmed_at: null, identities: [g("panat@example.ch", true)] }), false);
  assert.equal(googleVerified({ ...base, identities: [] }), false);
});
