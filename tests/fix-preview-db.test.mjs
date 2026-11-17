// Preview e2e fix B4 (migration 20261117150000_billing_interval_from_period.sql): a monthly family subscription is stored
// as school_licences.billing_interval 'monthly' (was hard-coded 'yearly'), a portal switch updates it, existing rows are
// backfilled, manual rows are untouched, the signature/grants are unchanged and all pending migrations still re-apply.
import assert from "node:assert/strict";
import { test, before } from "node:test";
import { setupTeacherDb } from "./helpers/teacher-db.mjs";

const P1 = "00000000-0000-4000-8000-0000000015b1", P2 = "00000000-0000-4000-8000-0000000015b2", P3 = "00000000-0000-4000-8000-0000000015b3";
const FAM_M = "20000000-0000-4000-8000-0000000015b1", FAM_Y = "20000000-0000-4000-8000-0000000015b2", FAM_OLD = "20000000-0000-4000-8000-0000000015b3";
const MIGRATION = "20261117150000_billing_interval_from_period.sql";
const SIG = "public.billing_apply_subscription(text,text,text,text,timestamptz,timestamptz,boolean,text,text,uuid,uuid,uuid,integer,text,text,timestamptz)";
const day = (n) => new Date(Date.UTC(2026, 10, 17, 12) + n * 86400000).toISOString();
let ctx;

const apply = async (args) => {
  const names = Object.keys(args);
  await ctx.as(null);
  return (await ctx.admin(`select public.billing_apply_subscription(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) as r`, Object.values(args)))[0].r;
};
const famSub = (fam, cus, sub, start, end, over = {}) => ({
  p_stripe_customer_id: cus, p_stripe_subscription_id: sub, p_plan_id: "family", p_status: "active",
  p_current_period_start: day(start), p_current_period_end: day(end), p_family_id: fam, ...over,
});
const interval = async (sub) => (await ctx.admin("select billing_interval from public.school_licences where stripe_subscription_id = $1", [sub]))[0]?.billing_interval;

before(async () => {
  ctx = await setupTeacherDb({ seed: false, migrate: false });
  await ctx.admin("create role service_role");
  for (const f of ctx.files) await ctx.apply(f);
  await ctx.admin("insert into auth.users(id,email) values ($1,'b4a@x.test'),($2,'b4b@x.test'),($3,'b4c@x.test')", [P1, P2, P3]);
  await ctx.admin("insert into public.families(id) values ($1),($2),($3)", [FAM_M, FAM_Y, FAM_OLD]);
  await ctx.admin("insert into public.family_members(family_id,user_id,role,status) values ($1,$2,'parent','active'),($3,$4,'parent','active'),($5,$6,'parent','active')",
    [FAM_M, P1, FAM_Y, P2, FAM_OLD, P3]);
});

test("interval helper: monthly up to 62 days, yearly above, null without dates", async () => {
  const f = async (a, b) => (await ctx.admin("select public._billing_interval_from_period($1::timestamptz, $2::timestamptz) v", [a, b]))[0].v;
  assert.equal(await f(day(0), day(28)), "monthly");
  assert.equal(await f(day(0), day(31)), "monthly");
  assert.equal(await f(day(0), day(365)), "yearly");
  assert.equal(await f(day(0), day(366)), "yearly");
  assert.equal(await f(null, day(30)), null);
  assert.equal(await f(day(0), null), null);
});

test("monthly family subscription is stored as 'monthly', yearly as 'yearly'", async () => {
  const m = await apply(famSub(FAM_M, "cus_b4M", "sub_b4M", 0, 30));
  assert.equal(m.applied, true);
  assert.equal(await interval("sub_b4M"), "monthly");
  const y = await apply(famSub(FAM_Y, "cus_b4Y", "sub_b4Y", 0, 365));
  assert.equal(y.applied, true);
  assert.equal(await interval("sub_b4Y"), "yearly");
  // access dates are unchanged by the fix
  const lic = (await ctx.admin("select status, valid_until::text from public.school_licences where stripe_subscription_id='sub_b4M'"))[0];
  assert.deepEqual([lic.status, lic.valid_until], ["active", "2026-12-17"]);
});

test("a later update keeps it current (portal switch month -> year), an update without a period keeps it", async () => {
  await apply(famSub(FAM_M, "cus_b4M", "sub_b4M", 30, 395));
  assert.equal(await interval("sub_b4M"), "yearly");
  await apply(famSub(FAM_M, "cus_b4M", "sub_b4M", 395, 425));
  assert.equal(await interval("sub_b4M"), "monthly");
  await apply({ p_stripe_customer_id: "cus_b4M", p_stripe_subscription_id: "sub_b4M", p_plan_id: "family", p_status: "active", p_current_period_end: null });
  assert.equal(await interval("sub_b4M"), "monthly");
});

test("backfill: an old wrongly-'yearly' Stripe licence becomes 'monthly'; manual licences untouched; second run is a no-op", async () => {
  await ctx.admin("insert into public.billing_customers(stripe_customer_id,family_id,created_by) values ('cus_b4Old',$1,$2)", [FAM_OLD, P3]);
  await ctx.admin("insert into public.billing_subscriptions(stripe_subscription_id,stripe_customer_id,plan_id,status,family_id,current_period_start,current_period_end) values ('sub_b4Old','cus_b4Old','family','active',$1,$2,$3)", [FAM_OLD, day(0), day(30)]);
  await ctx.admin(`insert into public.school_licences(family_id,plan_type,package,status,student_limit,valid_from,valid_until,billing_interval,source,stripe_subscription_id,assigned_by)
    values ($1,'family','family','active',1,current_date,current_date+30,'yearly','stripe','sub_b4Old','stripe')`, [FAM_OLD]);
  const manualBefore = await ctx.admin("select id, billing_interval from public.school_licences where source <> 'stripe' order by id");
  assert.equal(await interval("sub_b4Old"), "yearly");
  await ctx.apply(MIGRATION);
  assert.equal(await interval("sub_b4Old"), "monthly");
  await ctx.apply(MIGRATION);
  assert.equal(await interval("sub_b4Old"), "monthly");
  assert.deepEqual(await ctx.admin("select id, billing_interval from public.school_licences where source <> 'stripe' order by id"), manualBefore);
});

test("same signature (no overload), service role only; all pending 20261117* migrations re-apply and the fix survives", async () => {
  const n = (await ctx.admin("select count(*)::int n from pg_proc where pronamespace='public'::regnamespace and proname='billing_apply_subscription'"))[0].n;
  assert.equal(n, 1);
  const g = (await ctx.admin(`select has_function_privilege('anon', '${SIG}', 'execute') a, has_function_privilege('authenticated', '${SIG}', 'execute') u, has_function_privilege('service_role', '${SIG}', 'execute') s`))[0];
  assert.deepEqual(g, { a: false, u: false, s: true });
  const h = "public._billing_interval_from_period(timestamptz,timestamptz)";
  assert.equal((await ctx.admin(`select has_function_privilege('anon', '${h}', 'execute') a`))[0].a, false);
  const pending = ctx.files.filter((f) => f.startsWith("20261117"));
  assert.ok(pending.indexOf(MIGRATION) > pending.indexOf("20261117100000_billing_hardening.sql"), "B4 migration runs after billing_hardening");
  assert.equal(new Set(pending.map((f) => f.split("_")[0])).size, pending.length, "unique timestamps");
  for (const f of pending) await ctx.apply(f);
  await apply(famSub(FAM_Y, "cus_b4Y", "sub_b4Y", 365, 395));
  assert.equal(await interval("sub_b4Y"), "monthly");
});
