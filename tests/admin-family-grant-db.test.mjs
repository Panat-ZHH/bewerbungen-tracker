// Admin family package (supabase/migrations/20261120100000_admin_family_grant.sql) against PGlite with ALL migrations replayed
// AND Supabase's default privileges (so the migration's own revokes are what protects the functions).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setupAccessDb } from "./helpers/access-db.mjs";

const ctx = await setupAccessDb({ supabaseDefaults: true });
const { admin, as, asService, q, code, user, mode, expire, access, reset, database } = ctx;
let n = 4200;
const next = () => ++n;

async function platformAdmin() {
  const a = await user(next(), { email: `admin${n}@wendico.test` });
  await admin("insert into public.platform_admins (user_id) values ($1)", [a]);
  return a;
}
const parent = async () => { const p = await user(next(), { meta: { account_type: "parent" } }); await expire(p); return p; };
const grant = (u, until = null, note = null, sp = null, sc = null) =>
  q("select public.admin_family_grant($1, $2::timestamptz, $3, coalesce($4::int, 2), coalesce($5::int, 4)) as r", [u, until, note, sp, sc]).then((r) => r[0].r);
const revoke = (u, note = null) => q("select public.admin_family_revoke($1, $2) as r", [u, note]).then((r) => r[0].r);
const status = (u) => q("select public.admin_family_status($1) as r", [u]).then((r) => r[0].r);
const audits = (u, action) => admin("select * from public.admin_audit_log where target_user = $1 and action = $2 order by id", [u, action]);
const licences = (fid) => admin("select * from public.school_licences where family_id = $1 order by created_at, id", [fid]);
const inDays = (d) => new Date(Date.now() + d * 86_400_000).toISOString();

test("admin grants a family package to a parent without family: family «Familie» + parent membership + manual licence + audit", async () => {
  await mode("on");
  const a = await platformAdmin();
  const p = await parent();
  assert.equal((await access(p)).state, "expired");
  await as(a);
  const r = await grant(p, inDays(90), "Panu und Familie");
  assert.equal(r.family_created, true);
  assert.equal(r.status, "active");
  assert.equal(r.seats_parents, 2); assert.equal(r.seats_children, 4);
  assert.equal(r.assigned_by, `admin:${a}`);
  const [fam] = await admin("select * from public.families where id = $1", [r.family_id]);
  assert.equal(fam.name, "Familie");
  const members = await admin("select role, status from public.family_members where family_id = $1", [r.family_id]);
  assert.deepEqual(members, [{ role: "parent", status: "active" }]);
  const [lic] = await licences(r.family_id);
  assert.deepEqual([lic.plan_type, lic.package, lic.status, lic.source, lic.external_ref, lic.stripe_subscription_id, lic.notes],
    ["family", "family", "active", "manual", null, null, "Panu und Familie"]);
  assert.ok(lic.valid_until, "end date stored in valid_until");
  // family access function now returns access for the parent
  const acc = await access(p);
  assert.deepEqual([acc.has_access, acc.state, acc.reason], [true, "active", "family_subscription"]);
  const [log] = await audits(p, "family_grant");
  assert.equal(log.admin_id, a);
  assert.equal(log.details.family_id, r.family_id);
  assert.equal(log.details.before, null);
  assert.equal(log.details.after.status, "active");
  assert.equal(log.details.note, "Panu und Familie");
  await reset();
});

test("re-grant is idempotent: same licence row updated, no second family / row, before+after audited", async () => {
  await mode("on");
  const a = await platformAdmin();
  const p = await parent();
  await as(a);
  const r1 = await grant(p, inDays(30));
  const r2 = await grant(p, inDays(30));
  const r3 = await grant(p, null, "jetzt unbefristet", 3, 6);
  assert.equal(r2.licence_id, r1.licence_id); assert.equal(r3.licence_id, r1.licence_id);
  assert.equal(r2.family_id, r1.family_id); assert.equal(r2.family_created, false); assert.equal(r2.updated, true);
  const rows = await licences(r1.family_id);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].valid_until, rows[0].seats_parents, rows[0].seats_children, rows[0].student_limit], [null, 3, 6, 6]);
  assert.equal((await admin("select count(*)::int c from public.family_members where user_id = $1", [p]))[0].c, 1);
  const logs = await audits(p, "family_grant");
  assert.equal(logs.length, 3);
  assert.equal(logs[2].details.before.seats_children, 4);
  assert.equal(logs[2].details.after.seats_children, 6);
  assert.equal((await access(p)).reason, "family_subscription");
  await reset();
});

test("grant uses an existing family: child members get access too; seats never below members", async () => {
  await mode("on");
  const a = await platformAdmin();
  const p = await parent();
  const kid = await user(next(), { meta: { account_type: "independent_student", birth_year: 2005 } }); await expire(kid);
  const [f] = await admin("insert into public.families (name, created_by) values ('Ruangsri', $1) returning id", [p]);
  await admin("insert into public.family_members (family_id, user_id, role) values ($1, $2, 'parent')", [f.id, p]);
  await admin("insert into public.family_members (family_id, user_id, role, consent_status) values ($1, $2, 'child', 'granted')", [f.id, kid]);
  await as(a);
  const r = await grant(kid, null);
  assert.equal(r.family_id, f.id); assert.equal(r.family_created, false);
  assert.equal((await access(kid)).reason, "family_subscription");
  assert.equal((await access(p)).reason, "family_subscription");
  await as(a);
  assert.match(await code(grant(p, null, null, 1, 0)), /INVALID_SEATS/);
  await admin("insert into public.family_members (family_id, user_id, role) values ($1, $2, 'parent')", [f.id, await user(next(), { meta: { account_type: "parent" } })]);
  await as(a);
  assert.match(await code(grant(p, null, null, 1, 4)), /SEATS_TOO_LOW/);
  const st = await status(p);
  assert.equal(st.family.name, "Ruangsri");
  assert.equal(st.members.length, 3);
  assert.equal(st.members[0].role, "parent");
  assert.ok(st.members.every((m) => typeof m.email === "string"));
  assert.equal(st.plan_kind, "family_manual");
  assert.equal(st.licence.manual, true);
  assert.equal(st.licence.assigned_by, `admin:${a}`);
  assert.equal(st.can_revoke, true);
  await reset();
});

test("a student without family becomes the child of a new family (consent pending when under 16) and gets access", async () => {
  await mode("on");
  const a = await platformAdmin();
  const s = await user(next(), { meta: { account_type: "independent_student", birth_year: new Date().getFullYear() - 13 } }); await expire(s);
  await as(a);
  const r = await grant(s, inDays(60));
  const [m] = await admin("select role, status, consent_status from public.family_members where user_id = $1", [s]);
  assert.deepEqual(m, { role: "child", status: "active", consent_status: "pending" });
  assert.ok(r.family_id);
  assert.equal((await access(s)).state, "active");
  await reset();
});

test("revoke cancels the manual licence (rows, family and members stay), access ends, audit written; second revoke = NOT_GRANTED", async () => {
  await mode("on");
  const a = await platformAdmin();
  const p = await parent();
  await as(a);
  const r = await grant(p, inDays(30));
  const out = await revoke(p, "Test vorbei");
  assert.deepEqual(out.licence_ids, [r.licence_id]);
  const rows = await licences(r.family_id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "cancelled");
  assert.match(rows[0].notes, /Entzogen \d{4}-\d{2}-\d{2}: Test vorbei/);
  assert.equal((await admin("select count(*)::int c from public.families where id = $1", [r.family_id]))[0].c, 1);
  assert.equal((await admin("select status from public.family_members where user_id = $1", [p]))[0].status, "active");
  assert.equal((await access(p)).state, "expired");
  const [log] = await audits(p, "family_revoke");
  assert.equal(log.admin_id, a); assert.equal(log.details.note, "Test vorbei"); assert.equal(log.details.before[0].status, "active");
  await as(a);
  assert.match(await code(revoke(p)), /NOT_GRANTED/);
  // grant again after a revoke: a NEW row (history kept), access back
  const r2 = await grant(p, null);
  assert.notEqual(r2.licence_id, r.licence_id);
  assert.equal((await licences(r.family_id)).length, 2);
  assert.equal((await access(p)).reason, "family_subscription");
  await reset();
});

test("non-admins, anon and the service role get FORBIDDEN (and anon has no EXECUTE at all)", async () => {
  const p = await parent();
  const other = await user(next());
  await as(other);
  for (const call of [grant(p), revoke(p), status(p)]) assert.match(await code(call), /FORBIDDEN/);
  await as(p); // not even for yourself
  assert.match(await code(grant(p)), /FORBIDDEN/);
  await asService();
  assert.match(await code(q("select public.admin_family_grant($1)", [p])), /FORBIDDEN|permission denied/);
  await reset();
  await database.exec("set role anon");
  assert.match(await code(q("select public.admin_family_grant($1)", [p])), /permission denied/);
  assert.match(await code(q("select public.admin_family_status($1)", [p])), /permission denied/);
  await reset();
  assert.equal((await admin("select count(*)::int c from public.family_members where user_id = $1", [p]))[0].c, 0);
  assert.equal((await audits(p, "family_grant")).length, 0);
});

test("Stripe-managed family: grant and revoke refused with STRIPE_MANAGED, Stripe licence untouched", async () => {
  await mode("on");
  const a = await platformAdmin();
  const p = await parent();
  const [f] = await admin("insert into public.families (created_by) values ($1) returning id", [p]);
  await admin("insert into public.family_members (family_id, user_id, role) values ($1, $2, 'parent')", [f.id, p]);
  const cus = `cus_FA${n}`; const sub = `sub_FA${n}`;
  await admin("insert into public.billing_customers (stripe_customer_id, family_id, created_by) values ($1, $2, $3)", [cus, f.id, p]);
  await admin(`insert into public.billing_subscriptions (stripe_subscription_id, stripe_customer_id, plan_id, status, current_period_start,
    current_period_end, family_id) values ($1, $2, 'family', 'active', now() - interval '3 days', now() + interval '27 days', $3)`, [sub, cus, f.id]);
  await admin(`insert into public.school_licences (family_id, plan_type, package, status, student_limit, valid_from, valid_until, source, stripe_subscription_id, assigned_by)
    values ($1, 'family', 'family', 'active', 1, current_date, current_date + 27, 'stripe', $2, 'stripe')`, [f.id, sub]);
  const before = await licences(f.id);
  await as(a);
  assert.match(await code(grant(p, null)), /STRIPE_MANAGED/);
  assert.match(await code(revoke(p)), /STRIPE_MANAGED/);
  const st = await status(p);
  assert.deepEqual([st.stripe_managed, st.can_grant, st.can_revoke, st.plan_kind], [true, false, false, "family_stripe"]);
  assert.deepEqual(await licences(f.id), before);
  // a licence with an external_ref (future payment provider) counts as externally managed too
  const p2 = await parent();
  const [f2] = await admin("insert into public.families (created_by) values ($1) returning id", [p2]);
  await admin("insert into public.family_members (family_id, user_id, role) values ($1, $2, 'parent')", [f2.id, p2]);
  await admin(`insert into public.school_licences (family_id, plan_type, package, status, student_limit, valid_from, external_ref, assigned_by)
    values ($1, 'family', 'family', 'active', 1, current_date, 'ext_123', 'admin:legacy')`, [f2.id]);
  await as(a);
  assert.match(await code(grant(p2, null)), /STRIPE_MANAGED/);
  assert.match(await code(revoke(p2)), /STRIPE_MANAGED/);
  await reset();
});

test("Stripe sync never overwrites the manual grant (billing_apply_subscription only touches its own row)", async () => {
  await mode("on");
  const a = await platformAdmin();
  const p = await parent();
  await as(a);
  const r = await grant(p, null);
  await reset();
  // A later Stripe subscription for the same family: the webhook path creates ITS row, the manual row is unchanged.
  await asService();
  await q(`select public.billing_apply_subscription(p_stripe_customer_id => $1, p_stripe_subscription_id => $2, p_plan_id => 'family',
    p_status => 'canceled', p_current_period_start => now() - interval '40 days', p_current_period_end => now() - interval '10 days',
    p_family_id => $3)`, [`cus_S${n}`, `sub_S${n}`, r.family_id]);
  await reset();
  const rows = await licences(r.family_id);
  const manual = rows.find((l) => l.id === r.licence_id);
  assert.deepEqual([manual.status, manual.source, manual.assigned_by, manual.valid_until], ["active", "manual", `admin:${a}`, null]);
  assert.equal(rows.filter((l) => l.source === "stripe").length, 1);
  assert.equal((await access(p)).reason, "family_subscription");
});

test("validation: future end date, note ≤ 500, seat ranges, teachers refused, unknown user, pending member", async () => {
  const a = await platformAdmin();
  const p = await parent();
  await as(a);
  assert.match(await code(grant(p, new Date(Date.now() - 1000).toISOString())), /INVALID_UNTIL/);
  assert.match(await code(grant(p, inDays(3700))), /INVALID_UNTIL/);
  assert.match(await code(grant(p, null, "x".repeat(501))), /INVALID_NOTE/);
  assert.match(await code(grant(p, null, null, 11, 4)), /INVALID_SEATS/);
  assert.match(await code(grant(p, null, null, 2, 21)), /INVALID_SEATS/);
  assert.match(await code(grant("00000000-0000-4000-8000-00000000ffff")), /NOT_FOUND/);
  const t = await user(next(), { meta: { role: "teacher" } });
  await admin("update public.user_roles set role = 'teacher' where user_id = $1", [t]);
  await as(a);
  assert.match(await code(grant(t)), /NOT_ELIGIBLE/);
  assert.equal((await status(t)).eligible, false);
  const pend = await parent();
  const [f] = await admin("insert into public.families (created_by) values ($1) returning id", [pend]);
  await admin("insert into public.family_members (family_id, user_id, role, status) values ($1, $2, 'parent', 'pending')", [f.id, pend]);
  await as(a);
  assert.match(await code(grant(pend)), /FAMILY_PENDING/);
  assert.equal((await audits(p, "family_grant")).length, 0, "nothing audited for refused calls");
  await reset();
});

test("status without family: plan_kind from app_access, can_grant true", async () => {
  await mode("on");
  const a = await platformAdmin();
  const p = await parent();
  await as(a);
  const st = await status(p);
  assert.deepEqual([st.family, st.members, st.licence, st.plan_kind, st.can_grant, st.can_revoke], [null, [], null, "none", true, false]);
  await reset();
});

test("privileges: authenticated only, SECURITY DEFINER with empty search_path; rollback drops exactly the three functions", async () => {
  const rows = await admin(`select p.proname, p.prosecdef, p.proconfig,
      has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth,
      has_function_privilege('service_role', p.oid, 'execute') svc
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'admin_family_%' order by 1`);
  assert.deepEqual(rows.map((r) => r.proname), ["admin_family_grant", "admin_family_revoke", "admin_family_status"]);
  for (const r of rows) {
    assert.equal(r.prosecdef, true);
    assert.ok(r.proconfig.includes('search_path=""'), r.proconfig.join());
    assert.deepEqual([r.anon, r.auth, r.svc], [false, true, false], r.proname);
  }
  const down = await readFile(new URL("../supabase/rollback/20261120100000_admin_family_grant.down.sql", import.meta.url), "utf8");
  await database.exec(down);
  assert.equal((await admin("select count(*)::int c from pg_proc where proname like 'admin_family_%'"))[0].c, 0);
  // re-applying the migration works (idempotent)
  await database.exec(await readFile(new URL("../supabase/migrations/20261120100000_admin_family_grant.sql", import.meta.url), "utf8"));
  assert.equal((await admin("select count(*)::int c from pg_proc where proname like 'admin_family_%'"))[0].c, 3);
});
