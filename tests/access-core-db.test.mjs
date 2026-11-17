// Access model core (supabase/migrations/20261118010000_access_core.sql): every rule of docs/access/SPEC.md §1, §3, §7
// against PGlite with ALL migrations replayed. The paywall guards (RLS / RPC wrappers) are tested in access-guards*.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupAccessDb, uid } from "./helpers/access-db.mjs";

const ctx = await setupAccessDb();
const { admin, as, asService, q, code, user, mode, expire, access } = ctx;
let n = 100;
const next = () => ++n;
const day = 86400000;

async function school({ status = "active", validUntil = "2099-12-31", pilotEnd = null } = {}) {
  const [s] = await admin("insert into public.schools (name) values ('Sek Test') returning id");
  if (status) {
    await admin(`insert into public.school_licences (school_id, package, status, student_limit, pilot_start, pilot_end, valid_from, valid_until)
      values ($1, 'starter', $2, 100, case when $2 = 'pilot' then current_date - 1 end, $3::date, least(current_date - 30, $4::date), $4::date)`,
      [s.id, status, pilotEnd, validUntil]);
  }
  return s.id;
}
async function teacherWithClass(schoolId) {
  const t = await user(next(), { meta: { role: "teacher" } });
  const [c] = await admin("insert into public.classes (teacher_id, name, join_code, school_id) values ($1, '10a', $2, $3) returning id",
    [t, `J${n}`.padEnd(8, "X"), schoolId]);
  return { t, classId: c.id };
}
async function solo(u, { status = "active", periodEnd = new Date(Date.now() + 20 * day), periodStart = new Date(Date.now() - 10 * day), cancel = false } = {}) {
  const cus = `cus_T${n}${Math.floor(Math.random() * 1e6)}`;
  await admin("insert into public.billing_customers (stripe_customer_id, user_id) values ($1, $2)", [cus, u]);
  await admin(`insert into public.billing_subscriptions (stripe_subscription_id, stripe_customer_id, plan_id, status, current_period_start,
    current_period_end, cancel_at_period_end, user_id) values ($1, $2, 'solo', $3, $4, $5, $6, $7)`,
    [`sub_T${n}${Math.floor(Math.random() * 1e6)}`, cus, status, periodStart, periodEnd, cancel, u]);
}
async function family(parent, child, { sub = null, plan = null } = {}) {
  const [f] = await admin("insert into public.families (created_by) values ($1) returning id", [parent]);
  await admin("insert into public.family_members (family_id, user_id, role) values ($1, $2, 'parent')", [f.id, parent]);
  if (child) await admin("insert into public.family_members (family_id, user_id, role, consent_status) values ($1, $2, 'child', 'granted')", [f.id, child]);
  if (sub) {
    const cus = `cus_F${n}${Math.floor(Math.random() * 1e6)}`;
    await admin("insert into public.billing_customers (stripe_customer_id, family_id, created_by) values ($1, $2, $3)", [cus, f.id, parent]);
    await admin(`insert into public.billing_subscriptions (stripe_subscription_id, stripe_customer_id, plan_id, status, current_period_start,
      current_period_end, family_id) values ($1, $2, 'family', $3, now() - interval '3 days', now() + interval '27 days', $4)`,
      [`sub_F${n}${Math.floor(Math.random() * 1e6)}`, cus, sub, f.id]);
  }
  if (plan) {
    await admin(`insert into public.school_licences (family_id, plan_type, package, status, student_limit, pilot_start, trial_ends_at, valid_until)
      values ($1, 'family', 'family', $2, 1, case when $2 = 'pilot' then current_date end, case when $2 = 'trial' then now() + interval '20 days' end, current_date + 100)`,
      [f.id, plan]);
  }
  return f.id;
}

test("migration defaults: enforce_mode test_users, nobody enforced", async () => {
  const [s] = await admin("select enforce_mode, went_live_at from public.access_settings");
  assert.equal(s.enforce_mode, "test_users");
  assert.equal(s.went_live_at, null);
  const u = await user(next()); await expire(u);
  const a = await access(u);
  assert.equal(a.enforced, false);
  assert.equal(a.has_access, true); // not enforced → always true
  assert.equal(a.state, "expired"); // real state still reported
  await as(u);
  assert.equal((await q("select public.has_app_access() as h"))[0].h, true);
});

test("signup trigger: 7-day trial row, trial state and days left", async () => {
  await mode("on");
  const u = await user(next());
  const [row] = await admin("select trial_started_at, trial_ends_at, enforce_test, blocked_at from public.account_access where user_id = $1", [u]);
  const len = new Date(row.trial_ends_at) - new Date(row.trial_started_at);
  assert.equal(len, 7 * day);
  const a = await access(u);
  assert.equal(a.state, "trial"); assert.equal(a.reason, "trial"); assert.equal(a.has_access, true);
  assert.equal(a.trial_days_left, 7); assert.equal(a.enforced, true); assert.equal(a.role, "student");
  assert.equal(a.account_type, "independent_student"); assert.equal(a.subscription, null); assert.equal(a.school, null);
});

test("trial expired → expired, no access, has_app_access false, _assert raises PAYWALL", async () => {
  await mode("on");
  const u = await user(next()); await expire(u);
  const a = await access(u);
  assert.deepEqual([a.state, a.reason, a.has_access, a.trial_days_left], ["expired", "none", false, 0]);
  await as(u);
  assert.equal((await q("select public.has_app_access() as h"))[0].h, false);
  assert.equal((await q("select public.my_access() as a"))[0].a.state, "expired");
  assert.match(await code(q("select public._assert_app_access()")), /PAYWALL/);
});

test("enforce modes: off / test_users (+ enforce_test) / on", async () => {
  const u = await user(next()); await expire(u);
  await mode("off");
  assert.equal((await access(u)).has_access, true);
  await mode("test_users");
  assert.equal((await access(u)).has_access, true);
  await admin("update public.account_access set enforce_test = true where user_id = $1", [u]);
  assert.equal((await access(u)).has_access, false);
  assert.equal((await access(u)).enforced, true);
  await as(u); assert.equal((await q("select public.has_app_access() as h"))[0].h, false);
  await admin("update public.account_access set enforce_test = false where user_id = $1", [u]);
  await mode("on");
  assert.equal((await access(u)).has_access, false);
});

test("blocked: no access in test_users and on, ignored only in mode off", async () => {
  const u = await user(next());
  await admin("update public.account_access set blocked_at = now(), blocked_reason = 'spam' where user_id = $1", [u]);
  for (const m of ["test_users", "on"]) {
    await mode(m);
    const a = await access(u);
    assert.deepEqual([a.state, a.has_access, a.blocked, a.enforced], ["blocked", false, true, true], m);
    await as(u); assert.equal((await q("select public.has_app_access() as h"))[0].h, false, m);
  }
  await mode("off");
  assert.equal((await access(u)).has_access, true);
  // A grant does not lift a block.
  await mode("on");
  await admin("update public.account_access set free_access_until = now() + interval '30 days' where user_id = $1", [u]);
  assert.equal((await access(u)).state, "blocked");
});

test("admin grant: full access for any role, also teachers without licence", async () => {
  await mode("on");
  const s = await user(next()); await expire(s);
  await admin("update public.account_access set free_access_until = now() + interval '5 days' where user_id = $1", [s]);
  let a = await access(s);
  assert.deepEqual([a.state, a.reason, a.has_access], ["active", "grant", true]);
  assert.ok(a.grant_until);
  const t = await user(next(), { meta: { role: "teacher" } });
  assert.equal((await access(t)).state, "licence_required");
  await admin("update public.account_access set free_access_until = now() + interval '5 days' where user_id = $1", [t]);
  a = await access(t);
  assert.deepEqual([a.reason, a.has_access, a.role, a.trial_ends_at], ["grant", true, "teacher", null]);
  // expired grant = gone
  await admin("update public.account_access set free_access_until = now() - interval '1 minute' where user_id = $1", [s]);
  assert.equal((await access(s)).state, "expired");
});

test("school licence: valid → student and teacher have access (no trial); expired → student paywall, teacher licence_required", async () => {
  await mode("on");
  const okSchool = await school();
  const { t, classId } = await teacherWithClass(okSchool);
  const st = await user(next()); await expire(st);
  await admin("insert into public.class_members (class_id, student_id) values ($1, $2)", [classId, st]);
  let a = await access(st);
  assert.deepEqual([a.state, a.reason, a.has_access, a.trial_ends_at, a.trial_days_left], ["active", "school_licence", true, null, null]);
  assert.equal(a.school.id, okSchool); assert.equal(a.school.name, "Sek Test"); assert.equal(a.school.valid_until, "2099-12-31");
  assert.equal(a.account_type, "school_student");
  a = await access(t);
  assert.deepEqual([a.state, a.reason, a.role, a.has_access], ["active", "school_licence", "teacher", true]);

  const oldSchool = await school();
  const x = await teacherWithClass(oldSchool);
  const st2 = await user(next()); await expire(st2);
  await admin("insert into public.class_members (class_id, student_id) values ($1, $2)", [x.classId, st2]);
  await admin("update public.school_licences set valid_from = '2019-01-01', valid_until = '2020-01-01' where school_id = $1", [oldSchool]);
  a = await access(st2);
  assert.deepEqual([a.state, a.has_access, a.school], ["expired", false, null]);
  a = await access(x.t);
  assert.deepEqual([a.state, a.reason, a.has_access, a.trial_ends_at], ["licence_required", "none", false, null]);
  // archived class of a licensed school does not count
  await admin("update public.classes set archived = true where id = $1", [classId]);
  assert.equal((await access(st)).state, "expired");
  await admin("update public.classes set archived = false where id = $1", [classId]);
});

test("teacher / school admin without licence: no access and no trial, even on day 1", async () => {
  await mode("on");
  const t = await user(next(), { meta: { role: "teacher" } });
  const a = await access(t);
  assert.deepEqual([a.state, a.has_access, a.trial_ends_at, a.trial_days_left, a.account_type], ["licence_required", false, null, null, null]);
  const sa = await user(next());
  const sid = await school({ status: null });
  await admin("insert into public.school_admins (school_id, user_id) values ($1, $2)", [sid, sa]);
  await admin("update public.user_roles set role = 'school_admin' where user_id = $1", [sa]);
  const b = await access(sa);
  assert.deepEqual([b.role, b.state, b.has_access], ["school_admin", "licence_required", false]);
  // licence for that school → access
  await admin("insert into public.school_licences (school_id, package, status, student_limit, valid_until) values ($1, 'starter', 'active', 100, '2099-01-01')", [sid]);
  assert.equal((await access(sa)).reason, "school_licence");
});

test("school_teachers link + school_add_teacher / school_remove_teacher RPCs", async () => {
  await mode("on");
  const sid = await school({ status: "pilot", pilotEnd: new Date(Date.now() + 10 * day).toISOString().slice(0, 10) });
  const sa = await user(next());
  await admin("insert into public.school_admins (school_id, user_id) values ($1, $2)", [sid, sa]);
  const t = await user(next(), { email: "lehrerin@schule.test", meta: { role: "teacher" } });
  const stranger = await user(next());
  await as(stranger);
  assert.match(await code(q("select public.school_add_teacher($1, 'lehrerin@schule.test')", [sid])), /FORBIDDEN/);
  await as(sa);
  assert.match(await code(q("select public.school_add_teacher($1, 'nobody@x.test')", [sid])), /USER_NOT_FOUND/);
  const [r] = await q("select public.school_add_teacher($1, ' Lehrerin@Schule.test ') as r", [sid]);
  assert.equal(r.r.user_id, t);
  assert.equal((await access(t)).reason, "school_licence");
  // school admin sees the row, the teacher sees their own row, a stranger nothing; nobody writes directly
  assert.equal((await q("select count(*)::int c from public.school_teachers where school_id = $1", [sid]))[0].c, 1);
  await as(t); assert.equal((await q("select count(*)::int c from public.school_teachers"))[0].c, 1);
  assert.ok(await code(q("insert into public.school_teachers (school_id, user_id) values ($1, $2)", [sid, t])));
  await as(stranger); assert.equal((await q("select count(*)::int c from public.school_teachers"))[0].c, 0);
  await as(sa); await q("select public.school_remove_teacher($1, $2)", [sid, t]);
  assert.equal((await access(t)).state, "licence_required");
  // parents / class students cannot be added as teachers
  const p = await user(next(), { email: "mami@x.test", meta: { account_type: "parent" } });
  await as(sa);
  assert.match(await code(q("select public.school_add_teacher($1, 'mami@x.test')", [sid])), /NOT_A_TEACHER/);
  assert.ok(p);
});

test("solo subscription: active, cancel_at_period_end until period end, canceled / unpaid / incomplete_expired = none", async () => {
  await mode("on");
  const u = await user(next()); await expire(u);
  await solo(u, { status: "active", cancel: true });
  let a = await access(u);
  assert.deepEqual([a.state, a.reason, a.has_access], ["active", "subscription", true]);
  assert.deepEqual([a.subscription.plan, a.subscription.status, a.subscription.cancel_at_period_end, a.subscription.interval], ["solo", "active", true, "month"]);
  for (const status of ["canceled", "unpaid", "incomplete_expired", "paused", "incomplete"]) {
    const v = await user(next()); await expire(v);
    await solo(v, { status });
    a = await access(v);
    assert.deepEqual([a.state, a.has_access, a.subscription.status], ["expired", false, status], status);
  }
  // active but period long over (webhook missed) → no access
  const w = await user(next()); await expire(w);
  await solo(w, { status: "active", periodEnd: new Date(Date.now() - 5 * day), periodStart: new Date(Date.now() - 35 * day) });
  assert.equal((await access(w)).has_access, false);
  // yearly interval
  const y = await user(next());
  await solo(y, { periodStart: new Date(Date.now() - 10 * day), periodEnd: new Date(Date.now() + 355 * day) });
  assert.equal((await access(y)).subscription.interval, "year");
});

test("past_due grace: 7 days from the start of the unpaid period, then no access", async () => {
  await mode("on");
  const u = await user(next()); await expire(u);
  await solo(u, { status: "past_due", periodStart: new Date(Date.now() - 2 * day), periodEnd: new Date(Date.now() + 28 * day) });
  let a = await access(u);
  assert.deepEqual([a.state, a.reason, a.has_access], ["grace", "grace", true]);
  const graceMs = new Date(a.grace_until) - Date.now();
  assert.ok(graceMs > 4.9 * day && graceMs < 5.1 * day, `grace ${graceMs / day}`);
  const v = await user(next()); await expire(v);
  await solo(v, { status: "past_due", periodStart: new Date(Date.now() - 8 * day), periodEnd: new Date(Date.now() + 22 * day) });
  a = await access(v);
  assert.deepEqual([a.state, a.has_access], ["expired", false]);
  // past_due during the trial: trial wins only if no grace – grace is shown (payment banner)
  const w = await user(next());
  await solo(w, { status: "past_due", periodStart: new Date(Date.now() - 1 * day) });
  assert.equal((await access(w)).state, "grace");
});

test("family: paid subscription covers parent AND child; trial row of the family plan does not; admin pilot/active plan does", async () => {
  await mode("on");
  const p = await user(next(), { meta: { account_type: "parent" } }); await expire(p);
  const c = await user(next()); await expire(c);
  await family(p, c, { sub: "active" });
  for (const x of [p, c]) {
    const a = await access(x);
    assert.deepEqual([a.state, a.reason, a.has_access, a.subscription.plan], ["active", "family_subscription", true, "family"]);
  }
  assert.equal((await access(p)).role, "parent");

  const p2 = await user(next(), { meta: { account_type: "parent" } }); await expire(p2);
  const c2 = await user(next()); await expire(c2);
  await family(p2, c2, { plan: "trial" });
  assert.equal((await access(p2)).has_access, false);
  assert.equal((await access(c2)).has_access, false);

  const p3 = await user(next(), { meta: { account_type: "parent" } }); await expire(p3);
  await family(p3, null, { plan: "active" });
  assert.equal((await access(p3)).reason, "family_subscription");

  const p4 = await user(next(), { meta: { account_type: "parent" } }); await expire(p4);
  const c4 = await user(next()); await expire(c4);
  const f4 = await family(p4, c4, { sub: "past_due" });
  assert.equal((await access(c4)).state, "grace");
  // a pending / removed member is not covered
  await admin("update public.family_members set status = 'removed' where family_id = $1 and user_id = $2", [f4, c4]);
  assert.equal((await access(c4)).has_access, false);

  const p5 = await user(next(), { meta: { account_type: "parent" } }); await expire(p5);
  await family(p5, null, { sub: "canceled" });
  assert.equal((await access(p5)).has_access, false);
});

test("trial is not reset by deleting data or by re-signup with the same e-mail (any case / spaces)", async () => {
  await mode("on");
  const id1 = next();
  const u = await user(id1, { email: "Max.Muster@Example.test" });
  await expire(u);
  await admin("update public.trial_ledger set first_trial_ends_at = now() - interval '1 day' where email_hash = encode(sha256(convert_to('max.muster@example.test', 'UTF8')), 'hex')");
  // delete own data (profile) → still expired
  await admin("delete from public.profiles where user_id = $1", [u]);
  assert.equal((await access(u)).state, "expired");
  // delete the account, sign up again with the same address
  await admin("delete from auth.users where id = $1", [u]);
  assert.equal((await admin("select count(*)::int c from public.account_access where user_id = $1", [u]))[0].c, 0);
  const again = await user(next(), { email: "  max.muster@example.TEST" });
  const a = await access(again);
  assert.deepEqual([a.state, a.has_access], ["expired", false]);
  // a different address gets a fresh trial
  const other = await user(next(), { email: "max.muster+2@example.test" });
  assert.equal((await access(other)).state, "trial");
});

test("signup stores account_type server-side (parent, independent student + birth year), not for teachers", async () => {
  const p = await user(next(), { meta: { role: "student", account_type: "parent" } });
  const s = await user(next(), { meta: { role: "student", account_type: "independent_student", birth_year: 2011 } });
  const t = await user(next(), { meta: { role: "teacher", account_type: "parent" } });
  const rows = await admin("select user_id, account_type, birth_year, id from public.profiles where user_id = any($1::uuid[]) order by account_type", [[p, s, t]]);
  assert.deepEqual(rows.map((r) => [r.account_type, r.birth_year]), [["independent_student", 2011], ["parent", null]]);
  assert.ok(rows.every((r) => r.id === `profile-${r.user_id}`));
  assert.equal((await access(p)).role, "parent");
  assert.equal((await access(t)).role, "teacher");
});

test("existing users before the migration got a fresh trial; access_go_live rebases, sets mode on, logs, is idempotent and service-role only", async () => {
  await mode("test_users");
  const old = await user(next(), { createdAt: new Date(Date.now() - 400 * day).toISOString() });
  await admin("update public.account_access set trial_ends_at = now() + interval '2 days' where user_id = $1", [old]);
  const later = await user(next());
  const [laterRow] = await admin("select trial_ends_at from public.account_access where user_id = $1", [later]);
  const u = await user(next()); await as(u);
  assert.ok(await code(q("select public.access_go_live()")));
  await asService();
  const [r] = await q("select public.access_go_live() as r");
  assert.equal(r.r.enforce_mode, "on");
  const [s] = await admin("select enforce_mode, went_live_at from public.access_settings");
  assert.equal(s.enforce_mode, "on");
  const [oldRow] = await admin("select trial_ends_at from public.account_access where user_id = $1", [old]);
  assert.equal(new Date(oldRow.trial_ends_at).getTime(), new Date(s.went_live_at).getTime() + 7 * day);
  // never shortened: a later trial end stays
  const [laterNow] = await admin("select trial_ends_at from public.account_access where user_id = $1", [later]);
  assert.ok(new Date(laterNow.trial_ends_at) >= new Date(laterRow.trial_ends_at));
  await asService();
  const [r2] = await q("select public.access_go_live() as r");
  assert.equal(new Date(r2.r.went_live_at).getTime(), new Date(s.went_live_at).getTime());
  const logs = await admin("select action from public.admin_audit_log where action = 'access_go_live'");
  assert.equal(logs.length, 2);
  await mode("test_users");
});

test("client cannot read or write account_access (other rows), trial_ledger, platform_admins, admin_audit_log, access_settings", async () => {
  const u = await user(next()); const other = await user(next());
  await as(u);
  assert.equal((await q("select count(*)::int c from public.account_access"))[0].c, 1);
  assert.ok(await code(q("update public.account_access set trial_ends_at = now() + interval '1 year' where user_id = $1", [u])));
  assert.ok(await code(q("insert into public.account_access (user_id, trial_started_at, trial_ends_at) values ($1, now(), now())", [other])));
  assert.ok(await code(q("delete from public.account_access where user_id = $1", [u])));
  for (const t of ["trial_ledger", "platform_admins", "admin_audit_log", "access_settings"]) {
    assert.ok(await code(q(`select * from public.${t}`)), `select ${t}`);
  }
  assert.ok(await code(q("insert into public.platform_admins (user_id) values ($1)", [u])));
  assert.ok(await code(q("insert into public.admin_audit_log (action) values ('x')")));
  assert.ok(await code(q("update public.access_settings set enforce_mode = 'off'")));
  assert.ok(await code(q("select public.app_access($1)", [other])), "app_access not granted to users");
  assert.match(await code(q("select public.has_app_access($1)", [other])), /FORBIDDEN/);
  assert.equal((await q("select public.am_i_platform_admin() as a"))[0].a, false);
  await admin("insert into public.platform_admins (user_id, note) values ($1, 'test')", [u]);
  await as(u); assert.equal((await q("select public.am_i_platform_admin() as a"))[0].a, true);
  await as(other); assert.equal((await q("select public.am_i_platform_admin() as a"))[0].a, false);
  // anon: nothing
  await ctx.reset(); await ctx.database.exec("set role anon");
  assert.ok(await code(q("select public.my_access()")));
  assert.ok(await code(q("select * from public.account_access")));
});

test("admin_audit_log is append-only (update/delete refused even for the owner; service_role may insert)", async () => {
  await asService();
  await q("insert into public.admin_audit_log (action, details) values ('test', '{}')");
  await ctx.reset();
  assert.match(await code(q("update public.admin_audit_log set action = 'x'")), /AUDIT_LOG_APPEND_ONLY/);
  assert.match(await code(q("delete from public.admin_audit_log")), /AUDIT_LOG_APPEND_ONLY/);
  assert.match(await code(q("truncate public.admin_audit_log")), /AUDIT_LOG_APPEND_ONLY/);
});

test("solo plan columns: owner check and plan/owner consistency", async () => {
  const u = await user(next());
  assert.ok(await code(admin("insert into public.billing_customers (stripe_customer_id) values ('cus_none')")));
  await admin("insert into public.billing_customers (stripe_customer_id, user_id) values ('cus_solo1', $1)", [u]);
  assert.ok(await code(admin(`insert into public.billing_subscriptions (stripe_subscription_id, stripe_customer_id, plan_id, status, user_id)
    values ('sub_x1', 'cus_solo1', 'family', 'active', $1)`, [u])));
  await admin(`insert into public.billing_subscriptions (stripe_subscription_id, stripe_customer_id, plan_id, status, user_id)
    values ('sub_x2', 'cus_solo1', 'solo', 'active', $1)`, [u]);
});

test("migration replays twice (idempotent)", async () => {
  const sql = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../supabase/migrations/20261118010000_access_core.sql", import.meta.url), "utf8"));
  await ctx.reset();
  await ctx.database.exec(sql);
  assert.equal((await admin("select count(*)::int c from public.access_settings"))[0].c, 1);
});

test("uid helper sanity", () => assert.equal(uid(1).length, 36));
