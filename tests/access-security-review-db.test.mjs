// Independent security review #1 (supabase/migrations/20261118300000_access_security_review.sql, _access/REPORT-security-1.md).
// PGlite with ALL migrations, real role switching (role authenticated + JWT sub). Each test is an attack that worked before the fix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupAccessDb } from "./helpers/access-db.mjs";

const ctx = await setupAccessDb();
const { admin, as, q, code, user, mode, expire, access } = ctx;
let n = 9000;
const next = () => ++n;
const day = 86400000;

async function school() {
  const [s] = await admin("insert into public.schools (name) values ('Sek Sicherheit') returning id");
  await admin(`insert into public.school_licences (school_id, package, status, student_limit, valid_from, valid_until)
    values ($1, 'starter', 'active', 100, current_date - 30, '2099-12-31')`, [s.id]);
  return s.id;
}
async function solo(u, status = "active") {
  const k = `${n}${Math.floor(Math.random() * 1e6)}`;
  await admin("insert into public.billing_customers (stripe_customer_id, user_id) values ($1, $2)", [`cus_S${k}`, u]);
  await admin(`insert into public.billing_subscriptions (stripe_subscription_id, stripe_customer_id, plan_id, status, current_period_start,
    current_period_end, user_id) values ($1, $2, 'solo', $3, $4, $5, $6)`,
    [`sub_S${k}`, `cus_S${k}`, status, new Date(Date.now() - 10 * day), new Date(Date.now() + 20 * day), u]);
}
async function paidFamily(parent, child) {
  const [f] = await admin("insert into public.families (name, created_by) values ('Fam', $1) returning id", [parent]);
  await admin("insert into public.family_members (family_id, user_id, role) values ($1, $2, 'parent')", [f.id, parent]);
  if (child) await admin("insert into public.family_members (family_id, user_id, role, consent_status) values ($1, $2, 'child', 'granted')", [f.id, child]);
  const k = `${n}${Math.floor(Math.random() * 1e6)}`;
  await admin("insert into public.billing_customers (stripe_customer_id, family_id, created_by) values ($1, $2, $3)", [`cus_F${k}`, f.id, parent]);
  await admin(`insert into public.billing_subscriptions (stripe_subscription_id, stripe_customer_id, plan_id, status, current_period_start,
    current_period_end, family_id) values ($1, $2, 'family', 'active', now() - interval '3 days', now() + interval '27 days', $3)`,
    [`sub_F${k}`, `cus_F${k}`, f.id]);
  return f.id;
}

test("S1: a student with an Einzelabo who switches to the teacher role gets NO teacher access (licence only)", async () => {
  await mode("on");
  const s = await user(next(), { meta: { account_type: "independent_student" } });
  await expire(s);
  await solo(s);
  assert.equal((await access(s)).reason, "subscription"); // the student keeps the paid access
  await as(s);
  assert.equal(await code(q("select public.set_my_role('teacher')")), null);
  const a = await access(s);
  assert.deepEqual([a.role, a.state, a.has_access], ["teacher", "licence_required", false]);
  await as(s);
  assert.match(String(await code(q("select * from public.class_create('Gratis', '2026')"))), /PAYWALL/);
  // switching back restores the paid student access
  await as(s);
  await q("select public.set_my_role('student')");
  assert.deepEqual([(await access(s)).has_access, (await access(s)).reason], [true, "subscription"]);
});

test("S1: a child of a paid family (and a teacher-role parent) cannot use teacher RPCs without a licence; grace neither", async () => {
  await mode("on");
  const p = await user(next(), { meta: { account_type: "parent" } });
  const c = await user(next(), { meta: { account_type: "independent_student", birth_year: "2008" } });
  await expire(p); await expire(c);
  await paidFamily(p, c);
  assert.equal((await access(c)).reason, "family_subscription");
  await as(c);
  await q("select public.set_my_role('teacher')");
  assert.equal((await access(c)).state, "licence_required");
  await as(c);
  assert.match(String(await code(q("select * from public.class_create('Gratis', '2026')"))), /PAYWALL/);
  // parent with the teacher role in user_roles
  await admin("update public.user_roles set role = 'teacher' where user_id = $1", [p]);
  assert.deepEqual([(await access(p)).role, (await access(p)).has_access], ["teacher", false]);
  // past_due solo (grace) on a teacher: no access either
  const t = await user(next(), { meta: { role: "teacher" } });
  await solo(t, "past_due");
  assert.deepEqual([(await access(t)).state, (await access(t)).has_access], ["licence_required", false]);
});

test("S1: legitimate staff access is unchanged: licensed school teacher, admin grant", async () => {
  await mode("on");
  const sid = await school();
  const t = await user(next(), { meta: { role: "teacher" } });
  await admin("insert into public.classes (teacher_id, name, join_code, school_id) values ($1, '9b', $2, $3)", [t, `Q${n}`.padEnd(8, "Z"), sid]);
  assert.deepEqual([(await access(t)).reason, (await access(t)).has_access], ["school_licence", true]);
  const g = await user(next(), { meta: { role: "teacher" } });
  await admin("update public.account_access set free_access_until = now() + interval '30 days' where user_id = $1", [g]);
  assert.deepEqual([(await access(g)).reason, (await access(g)).has_access], ["grant", true]);
  await as(g);
  assert.equal(await code(q("select * from public.class_create('Mit Grant', '2026')")), null);
});

test("S2: school_add_teacher only links teacher accounts; a linked teacher who switches to student loses the licence", async () => {
  await mode("on");
  const sid = await school();
  const sa = await user(next());
  await admin("insert into public.school_admins (school_id, user_id) values ($1, $2)", [sid, sa]);
  await admin("update public.user_roles set role = 'school_admin' where user_id = $1", [sa]);
  const friend = await user(next(), { email: `freund${n}@example.test`, meta: { account_type: "independent_student" } });
  await expire(friend);
  await as(sa);
  assert.match(String(await code(q("select public.school_add_teacher($1, $2)", [sid, `freund${n}@example.test`]))), /NOT_A_TEACHER/);
  assert.equal((await access(friend)).has_access, false);
  // a direct school_teachers row (e.g. linked before the fix) does not count for a non-teacher either
  await admin("insert into public.school_teachers (school_id, user_id) values ($1, $2)", [sid, friend]);
  assert.equal((await access(friend)).has_access, false);

  const t = await user(next(), { email: `lehrer${n}@example.test`, meta: { role: "teacher" } });
  await as(sa);
  assert.equal(await code(q("select public.school_add_teacher($1, $2)", [sid, `lehrer${n}@example.test`])), null);
  assert.deepEqual([(await access(t)).reason, (await access(t)).has_access], ["school_licence", true]);
  await expire(t);
  await as(t);
  await q("select public.set_my_role('student')");
  const a = await access(t);
  assert.deepEqual([a.role, a.reason, a.has_access], ["student", "none", false]);
});

test("S3: a user reads their own access row but not the admin's note or id", async () => {
  const u = await user(next());
  await admin("update public.account_access set free_access_note = 'intern: Freund von X', updated_by = $2 where user_id = $1", [u, u]);
  await as(u);
  const [row] = await q("select user_id, trial_ends_at, free_access_until, blocked_at, blocked_reason from public.account_access");
  assert.equal(row.user_id, u);
  await as(u);
  assert.match(String(await code(q("select free_access_note from public.account_access"))), /permission denied/);
  await as(u);
  assert.match(String(await code(q("select updated_by from public.account_access"))), /permission denied/);
  await as(u);
  assert.match(String(await code(q("select * from public.account_access"))), /permission denied/);
  // still no writes
  await as(u);
  await code(q("update public.account_access set trial_ends_at = now() + interval '1 year'"));
  const [after] = await admin("select trial_ends_at from public.account_access where user_id = $1", [u]);
  assert.ok(new Date(after.trial_ends_at).getTime() < Date.now() + 8 * day);
});

test("S4: +tag and Gmail dot variants of a used address get no new trial; other addresses do", async () => {
  await mode("on");
  const base = `max.muster${n}`;
  const old = new Date(Date.now() - 30 * day).toISOString();
  const first = await user(next(), { email: `${base}@gmail.com`, createdAt: old }); // trial (and ledger) ended 23 days ago
  await admin("delete from auth.users where id = $1", [first]); // account deleted, ledger stays
  for (const variant of [`${base.replace(".", "")}+neu@gmail.com`, `${base.toUpperCase()}@googlemail.com`, ` ${base}+x@GMAIL.com `]) {
    const v = await user(next(), { email: variant });
    const a = await access(v);
    assert.deepEqual([a.state, a.has_access], ["expired", false], variant);
  }
  const anna = `anna${n}`;
  await user(next(), { email: `${anna}@schule.ch`, createdAt: old });
  const again = await user(next(), { email: `${anna}+2@schule.ch` });
  assert.equal((await access(again)).has_access, false);
  const other = await user(next(), { email: `${anna}.b@schule.ch` }); // dots matter outside Gmail
  assert.deepEqual([(await access(other)).state, (await access(other)).has_access], ["trial", true]);
  const [h] = await admin("select public._access_email_hash('A.B+c@GoogleMail.com') = public._access_email_hash('ab@gmail.com') as same, public._access_email_hash('') as empty");
  assert.deepEqual([h.same, h.empty], [true, null]);
});

test("S1: the TS mirror decideAccess (lib/access/core.ts) has the same order: staff never via subscription", async () => {
  const { decideAccess } = await import("../lib/access/core.ts");
  const now = new Date();
  const sub = { status: "active", current_period_start: new Date(Date.now() - 5 * day).toISOString(), current_period_end: new Date(Date.now() + 25 * day).toISOString() };
  const base = { now, mode: "on", enforceTest: false, blockedAt: null, grantUntil: null, trialEndsAt: new Date(Date.now() - day).toISOString(),
    accountType: null, licensedSchool: null, licenceEnded: false, solo: null, family: null };
  for (const role of ["teacher", "school_admin"]) {
    assert.deepEqual([decideAccess({ ...base, role, solo: sub }).state, decideAccess({ ...base, role, solo: sub }).has_access], ["licence_required", false]);
    assert.equal(decideAccess({ ...base, role, family: { role: "child", sub, adminPlan: false } }).has_access, false);
    assert.equal(decideAccess({ ...base, role, family: { role: "parent", sub: null, adminPlan: true } }).has_access, false);
    assert.equal(decideAccess({ ...base, role, grantUntil: new Date(Date.now() + day).toISOString() }).reason, "grant");
  }
  assert.equal(decideAccess({ ...base, role: "student", accountType: "independent_student", solo: sub }).reason, "subscription");
});
