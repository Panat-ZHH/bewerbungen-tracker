// Free access without an end date (supabase/migrations/20261118400000_free_access_forever.sql, docs/access/DB.md "Free access")
// against PGlite with ALL migrations replayed AND Supabase's default privileges (every new table / function is granted to anon +
// authenticated unless the migration revokes it) – so the negative tests prove the migration's own revokes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setupAccessDb, uid } from "./helpers/access-db.mjs";

const ctx = await setupAccessDb({ supabaseDefaults: true });
const { admin, as, q, code, user, mode, expire, access, reset, database } = ctx;
const MIG = new URL("../supabase/migrations/20261118400000_free_access_forever.sql", import.meta.url);
let n = 900;
const next = () => ++n;

const forever = (u) => admin("update public.account_access set free_access_forever = true, free_access_until = null where user_id = $1", [u]);
const until = (u, sql) => admin(`update public.account_access set free_access_forever = false, free_access_until = ${sql} where user_id = $1`, [u]);
async function school({ licence = null } = {}) {
  const [s] = await admin("insert into public.schools (name) values ('Sek Gratis') returning id");
  if (licence === "valid") {
    await admin(`insert into public.school_licences (school_id, package, status, student_limit, valid_from, valid_until)
      values ($1, 'starter', 'active', 100, current_date - 30, '2099-12-31')`, [s.id]);
  } else if (licence === "expired") {
    await admin(`insert into public.school_licences (school_id, package, status, student_limit, valid_from, valid_until)
      values ($1, 'starter', 'active', 1, current_date - 400, current_date - 10)`, [s.id]);
  }
  return s.id;
}
const schoolGrant = (s) => admin(`insert into public.school_access_grants (school_id, forever, until) values ($1, true, null)
  on conflict (school_id) do update set forever = true, until = null`, [s]);
async function teacher() {
  const t = await user(next(), { meta: { role: "teacher" } });
  await admin("update public.user_roles set role = 'teacher' where user_id = $1", [t]);
  return t;
}
async function classOf(s) {
  const t = await teacher();
  const code = `FF${n}`.padEnd(8, "X");
  const [c] = await admin("insert into public.classes (teacher_id, name, join_code, school_id) values ($1, '9b', $2, $3) returning id, join_code", [t, code, s]);
  return { t, classId: c.id, joinCode: c.join_code };
}
const app = (u) => q(`insert into public.applications (id, user_id, company, position, category, status, created_at, updated_at)
  values ($1, $2, 'Firma', 'Lehre', 'Lehrstelle', 'saved', current_date, current_date)`, [`ff-${next()}`, u]);

test("person forever grant: active / grant beats an expired trial, has_app_access true, no trial shown as reason", async () => {
  await mode("on");
  const u = await user(next());
  await expire(u);
  assert.equal((await access(u)).state, "expired");
  await forever(u);
  const a = await access(u);
  assert.deepEqual([a.has_access, a.state, a.reason, a.grant_until], [true, "active", "grant", null]);
  assert.deepEqual(a.grant, { scope: "user", forever: true, until: null });
  // the gate every guard uses (RLS access gate, RPC wrappers, ai-review edge function via service role)
  assert.equal((await admin("select public.has_app_access($1) as h", [u]))[0].h, true);
  await as(u);
  assert.equal((await q("select public.has_app_access() as h"))[0].h, true);
  assert.equal((await q("select (public.my_access() ->> 'reason') as r"))[0].r, "grant");
  assert.equal(await code(app(u)), null, "restrictive RLS access gate accepts the grant");
  assert.equal(await code(q("select public._assert_app_access()")), "permission denied for function _assert_app_access");
  await reset();
});

test("person forever grant also opens teachers without licence (no licence gate)", async () => {
  await mode("on");
  const t = await teacher();
  assert.equal((await access(t)).state, "licence_required");
  await forever(t);
  const a = await access(t);
  assert.deepEqual([a.has_access, a.state, a.reason, a.role, a.trial_ends_at], [true, "active", "grant", "teacher", null]);
  await as(t);
  assert.equal(await code(q("select * from public.class_create('Gratis', '2026')")), null);
  await reset();
});

test("blocked wins over a forever grant (and over a school grant)", async () => {
  await mode("on");
  const u = await user(next());
  await forever(u);
  await admin("update public.account_access set blocked_at = now(), blocked_reason = 'x' where user_id = $1", [u]);
  const a = await access(u);
  assert.deepEqual([a.has_access, a.state, a.grant], [false, "blocked", null]);
  assert.equal((await admin("select public.has_app_access($1) as h", [u]))[0].h, false);
  // also in mode test_users (blocked users are always enforced)
  await mode("test_users");
  assert.equal((await admin("select public.has_app_access($1) as h", [u]))[0].h, false);
  await mode("on");
});

test("dated grant: active until then (grant_until set), expired grant falls back to trial or paywall", async () => {
  await mode("on");
  const u = await user(next());
  await until(u, "now() + interval '10 days'");
  let a = await access(u);
  assert.deepEqual([a.state, a.reason, a.grant.scope, a.grant.forever], ["active", "grant", "user", false]);
  assert.ok(a.grant_until && a.grant.until);
  await until(u, "now() - interval '1 minute'");
  a = await access(u);
  assert.deepEqual([a.state, a.reason, a.grant, a.grant_until], ["trial", "trial", null, null]);
  await expire(u);
  a = await access(u);
  assert.deepEqual([a.has_access, a.state, a.expired_reason], [false, "expired", "trial_ended"]);
});

test("forever and a date are never set together (check constraint)", async () => {
  const u = await user(next());
  assert.match(String(await code(admin("update public.account_access set free_access_forever = true, free_access_until = now() + interval '1 day' where user_id = $1", [u]))),
    /account_access_free_access_one_kind/);
  assert.match(String(await code(admin("insert into public.school_access_grants (school_id, forever, until) values ($1, true, now())", [await school()]))), /check/);
  assert.match(String(await code(admin("insert into public.school_access_grants (school_id, forever, until) values ($1, false, null)", [await school()]))), /check/);
});

test("school forever grant without any licence: students, class teachers and school teachers get access via the school, no trial, no seat limit", async () => {
  await mode("on");
  const s = await school();
  const { t, joinCode } = await classOf(s);
  // before the grant: the teacher needs a licence, and nobody can join a class of a school without licence
  assert.equal((await access(t)).state, "licence_required");
  const before = await user(next());
  await as(before);
  assert.match(String(await code(q("select * from public.class_join($1)", [joinCode]))), /LICENCE_MISSING/);
  await reset();

  await schoolGrant(s);
  const students = [];
  for (let i = 0; i < 3; i++) {
    const st = await user(next());
    await expire(st);
    await as(st);
    assert.equal(await code(q("select * from public.class_join($1)", [joinCode])), null, "join without licence row / seat limit");
    await reset();
    students.push(st);
  }
  for (const st of students) {
    const a = await access(st);
    assert.deepEqual([a.has_access, a.state, a.reason, a.trial_ends_at, a.trial_days_left], [true, "active", "school_licence", null, null]);
    assert.deepEqual(a.grant, { scope: "school", forever: true, until: null });
    assert.equal(a.school.free, true);
    assert.equal(a.school.valid_until, null);
  }
  const ta = await access(t);
  assert.deepEqual([ta.has_access, ta.reason, ta.grant?.scope], [true, "school_licence", "school"]);
  // a teacher linked by school_teachers (teacher role) and a school admin are covered too
  const t2 = await teacher();
  await admin("insert into public.school_teachers (school_id, user_id) values ($1, $2)", [s, t2]);
  assert.equal((await access(t2)).reason, "school_licence");
  const sa = await user(next());
  await admin("insert into public.school_admins (school_id, user_id) values ($1, $2)", [s, sa]);
  assert.deepEqual([(await access(sa)).role, (await access(sa)).has_access], ["school_admin", true]);
  // a school_teachers row of a STUDENT account still gives nothing (security review S2 unchanged)
  const st2 = await user(next());
  await expire(st2);
  await admin("insert into public.school_teachers (school_id, user_id) values ($1, $2)", [s, st2]);
  assert.equal((await access(st2)).state, "expired");
});

test("school grant until a date: valid_until shown, after it the school is 'licence ended' again", async () => {
  await mode("on");
  const s = await school({ licence: "expired" });
  const { t } = await classOf(s);
  assert.deepEqual([(await access(t)).state, (await access(t)).expired_reason], ["licence_required", "licence_ended"]);
  await admin("insert into public.school_access_grants (school_id, forever, until) values ($1, false, now() + interval '30 days')", [s]);
  let a = await access(t);
  assert.deepEqual([a.has_access, a.grant.scope, a.grant.forever, a.school.free], [true, "school", false, true]);
  assert.ok(a.grant.until && a.school.valid_until);
  await admin("update public.school_access_grants set until = now() - interval '1 minute' where school_id = $1", [s]);
  a = await access(t);
  assert.deepEqual([a.has_access, a.state, a.expired_reason, a.grant], [false, "licence_required", "licence_ended", null]);
  // revoke = delete the row
  await admin("delete from public.school_access_grants where school_id = $1", [s]);
  assert.equal((await access(t)).state, "licence_required");
});

test("school with a valid licence AND a grant: access via school, grant not reported as the reason (licence rules)", async () => {
  await mode("on");
  const s = await school({ licence: "valid" });
  const { t } = await classOf(s);
  await schoolGrant(s);
  const a = await access(t);
  assert.deepEqual([a.reason, a.grant, a.school.free], ["school_licence", null, true]);
});

test("person grant beats the school path; precedence order unchanged", async () => {
  await mode("on");
  const s = await school({ licence: "valid" });
  const { t } = await classOf(s);
  await forever(t);
  assert.deepEqual([(await access(t)).reason, (await access(t)).grant.scope], ["grant", "user"]);
});

test("only the service role writes grants: users (also on their own row) and anon cannot grant themselves", async () => {
  await mode("on");
  const u = await user(next());
  await expire(u);
  const s = await school();
  await as(u);
  // own account_access row: readable (incl. free_access_forever), never writable
  assert.equal((await q("select free_access_forever from public.account_access where user_id = $1", [u]))[0].free_access_forever, false);
  for (const sql of [
    "update public.account_access set free_access_forever = true where user_id = $1",
    "update public.account_access set free_access_until = now() + interval '1 year' where user_id = $1",
    "insert into public.account_access (user_id, trial_started_at, trial_ends_at, free_access_forever) values ($1, now(), now(), true)",
  ]) assert.match(String(await code(q(sql, [u]))), /permission denied/, sql);
  assert.match(String(await code(q("select free_access_note, free_access_granted_by from public.account_access where user_id = $1", [u]))), /permission denied/);
  for (const sql of [
    "select * from public.school_access_grants",
    "insert into public.school_access_grants (school_id, forever) values ($1, true)",
    "update public.school_access_grants set forever = true where school_id = $1",
    "delete from public.school_access_grants where school_id = $1",
  ]) assert.match(String(await code(q(sql, sql.includes("$1") ? [s] : []))), /permission denied/, sql);
  for (const f of ["_access_school_granted($1)", "_access_school_valid($1)", "_school_assert_capacity($1, '{}')", "app_access($1)"]) {
    assert.match(String(await code(q(`select public.${f}`, [f.startsWith("app") ? u : s]))), /permission denied/, f);
  }
  assert.equal((await access(u)).state, "expired");
  // anon
  await reset();
  await database.exec("set role anon");
  for (const sql of ["select * from public.school_access_grants", "select * from public.account_access",
    "update public.account_access set free_access_forever = true"]) {
    assert.match(String(await code(q(sql))), /permission denied/, `anon: ${sql}`);
  }
  await reset();
});

test("audit log stays append-only for grant entries", async () => {
  await admin("insert into public.admin_audit_log (admin_id, action, target_user, details) values ($1, 'user.grant_access', $1, '{}')", [uid(1)]);
  assert.match(String(await code(admin("update public.admin_audit_log set action = 'x' where action = 'user.grant_access'"))), /AUDIT_LOG_APPEND_ONLY/);
});

test("parity: lib/access/core.ts decideAccess() mirrors app_access() for person + school grants", async () => {
  const { decideAccess } = await import("../lib/access/core.ts");
  await mode("on");
  const iso = (x) => (x ? new Date(x).toISOString() : null);
  const s = await school();
  await schoolGrant(s);
  const sc = [];
  const mk = async (label, u, extra = {}) => sc.push({ label, u, extra });
  { const u = await user(next()); await expire(u); await forever(u); await mk("forever", u); }
  { const u = await user(next()); await expire(u); await until(u, "now() + interval '5 days'"); await mk("until", u); }
  { const u = await user(next()); await until(u, "now() - interval '1 day'"); await mk("expired grant → trial", u); }
  { const u = await user(next()); await forever(u); await admin("update public.account_access set blocked_at = now() where user_id = $1", [u]); await mk("blocked", u); }
  { const t = await teacher(); await forever(t); await mk("teacher forever", t, { role: "teacher" }); }
  { const { t } = await classOf(s); await mk("teacher via school grant", t, { role: "teacher", school: s }); }
  for (const x of sc) {
    const [row] = await admin("select * from public.account_access where user_id = $1", [x.u]);
    const got = await access(x.u);
    const expected = decideAccess({
      now: new Date(), mode: "on", enforceTest: false, blockedAt: iso(row.blocked_at), grantUntil: iso(row.free_access_until),
      grantForever: row.free_access_forever, trialEndsAt: iso(row.trial_ends_at), role: x.extra.role ?? "student",
      accountType: x.extra.role ? null : got.account_type, licenceEnded: false, solo: null, family: null,
      licensedSchool: x.extra.school ? { id: x.extra.school, name: "Sek Gratis", valid_until: null, free: true } : null,
      schoolGrant: x.extra.school ? { forever: true, until: null } : null,
    });
    for (const k of ["has_access", "state", "reason", "role", "trial_days_left", "blocked", "enforced", "expired_reason", "grant", "school"]) {
      assert.deepEqual(k === "grant" && got[k]?.until ? { ...got[k], until: iso(got[k].until) } : got[k], k === "grant" && expected[k]?.until ? { ...expected[k], until: iso(expected[k].until) } : expected[k], `${x.label}: ${k}`);
    }
    for (const k of ["trial_ends_at", "grant_until"]) assert.equal(iso(got[k]), iso(expected[k]), `${x.label}: ${k}`);
  }
});

test("migration replays twice (idempotent) and keeps existing grants", async () => {
  const u = await user(next());
  await forever(u);
  await reset();
  await database.exec(await readFile(MIG, "utf8"));
  await database.exec(await readFile(MIG, "utf8"));
  assert.equal((await admin("select free_access_forever from public.account_access where user_id = $1", [u]))[0].free_access_forever, true);
  assert.equal((await access(u)).reason, "grant");
});
