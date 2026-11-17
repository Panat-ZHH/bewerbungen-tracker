// Payments re-audit 3 (2026-11-17): the FINAL state of all migrations (every file applied once, in order, nothing
// re-applied afterwards) keeps the earlier billing fixes. tests/billing-db.test.mjs re-applies 20261117100000 on top of
// the newest files, so its past_due / ended_at tests exercise the 100000 body, not the 20261117150000 replacement that
// production will actually run. This file pins the replacement: grace periods, ended_at, out-of-order guard, event
// idempotency, owner pinning, incomplete = no access, real interval; plus the last-parent / payer guards of
// 20261117120000 + 20261117130000 on the final function set.
import assert from "node:assert/strict";
import { test, before } from "node:test";
import { setupTeacherDb } from "./helpers/teacher-db.mjs";

const PA = "00000000-0000-4000-8000-0000000033a1", PB = "00000000-0000-4000-8000-0000000033a2", PC = "00000000-0000-4000-8000-0000000033a3";
const F1 = "20000000-0000-4000-8000-0000000033f1", F2 = "20000000-0000-4000-8000-0000000033f2", F3 = "20000000-0000-4000-8000-0000000033f3";
const iso = (days) => new Date(Date.now() + days * 86400000).toISOString();
let ctx;

const apply = async (args) => {
  const names = Object.keys(args);
  await ctx.as(null);
  return (await ctx.admin(`select public.billing_apply_subscription(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) as r`, Object.values(args)))[0].r;
};
const lic = async (sub) => (await ctx.admin(
  "select status, valid_until::text vu, billing_interval iv, public._family_plan_state(l) st from public.school_licences l where stripe_subscription_id = $1", [sub]))[0];
const zurich = async (days) => (await ctx.admin("select (($1::timestamptz) at time zone 'Europe/Zurich')::date::text d", [iso(days)]))[0].d;
const base = (over = {}) => ({ p_stripe_customer_id: "cus_R3a", p_stripe_subscription_id: "sub_R3a", p_plan_id: "family", p_family_id: F1, ...over });

before(async () => {
  ctx = await setupTeacherDb({ seed: false, migrate: false });
  await ctx.admin("create role service_role");
  for (const f of ctx.files) await ctx.apply(f); // final state, in filename order, once
  await ctx.admin("insert into auth.users(id,email) values ($1,'r3a@x.test'),($2,'r3b@x.test'),($3,'r3c@x.test')", [PA, PB, PC]);
  await ctx.admin("insert into public.families(id) values ($1),($2),($3)", [F1, F2, F3]);
  await ctx.admin("insert into public.family_members(family_id,user_id,role,status) values ($1,$2,'parent','active'),($3,$4,'parent','active'),($3,$5,'parent','active')",
    [F1, PA, F2, PB, PC]);
});

test("final billing_apply_subscription: incomplete gives no access, active monthly gives the period + 'monthly'", async () => {
  const r0 = await apply(base({ p_status: "incomplete", p_current_period_start: iso(0), p_current_period_end: iso(30), p_created_by: PA, p_event_id: "evt_Rthree0", p_event_created: iso(-0.01) }));
  assert.equal(r0.applied, true);
  assert.equal(await lic("sub_R3a"), undefined, "incomplete: no licence row");
  await apply(base({ p_status: "active", p_current_period_start: iso(0), p_current_period_end: iso(30), p_event_id: "evt_Rthree1", p_event_created: iso(0) }));
  const l = await lic("sub_R3a");
  assert.deepEqual([l.status, l.vu, l.iv, l.st], ["active", await zurich(30), "monthly", "active"]);
});

test("final function keeps the past_due grace (14 days card) and restores the full period once paid", async () => {
  await apply(base({ p_status: "past_due", p_current_period_start: iso(-3), p_current_period_end: iso(27), p_event_id: "evt_Rthree2", p_event_created: iso(0.001) }));
  assert.equal((await lic("sub_R3a")).vu, await zurich(11));
  await apply(base({ p_status: "past_due", p_current_period_start: iso(-20), p_current_period_end: iso(10), p_event_id: "evt_Rthree3", p_event_created: iso(0.002) }));
  assert.equal((await lic("sub_R3a")).st, "expired", "grace over: no access during the unpaid period");
  await apply(base({ p_status: "active", p_latest_invoice_status: "paid", p_current_period_start: iso(-20), p_current_period_end: iso(10), p_event_id: "evt_Rthree4", p_event_created: iso(0.003) }));
  assert.deepEqual([(await lic("sub_R3a")).vu, (await lic("sub_R3a")).st], [await zurich(10), "active"]);
});

test("final function keeps the out-of-order guard and event idempotency", async () => {
  const stale = await apply(base({ p_status: "canceled", p_current_period_start: iso(-20), p_current_period_end: iso(-1), p_event_id: "evt_RthreeOld", p_event_created: iso(-1) }));
  assert.deepEqual([stale.applied, stale.reason], [false, "stale_event"]);
  assert.equal((await lic("sub_R3a")).st, "active", "an older event never overwrites a newer state");
  const dup = await apply(base({ p_status: "canceled", p_current_period_start: iso(-20), p_current_period_end: iso(-1), p_event_id: "evt_Rthree4", p_event_created: iso(0.004) }));
  assert.deepEqual([dup.applied, dup.reason], [false, "duplicate_event"]);
  assert.equal((await lic("sub_R3a")).st, "active");
});

test("final function pins the owner: a subscription of family 1 can never be moved to family 2", async () => {
  await assert.rejects(apply(base({ p_family_id: F2, p_status: "active", p_current_period_start: iso(0), p_current_period_end: iso(30) })), /BILLING_OWNER_MISMATCH/);
  await assert.rejects(apply({ p_stripe_customer_id: "cus_R3a", p_stripe_subscription_id: "sub_R3a", p_plan_id: "starter", p_status: "active", p_current_period_end: iso(30) }), /INVALID_PLAN/);
});

test("last-parent guard (120000) still holds on the final function set; cancel at period end releases it", async () => {
  const blockers = async (u) => (await ctx.admin("select public.account_billing_blockers($1) b", [u]))[0].b;
  assert.equal((await blockers(PA)).length, 1, "PA is the only parent of a renewing family subscription");
  await ctx.as(PA);
  await assert.rejects(ctx.rpc("select public.family_leave()"), /SUBSCRIPTION_ACTIVE/);
  await apply(base({ p_status: "active", p_cancel_at_period_end: true, p_current_period_start: iso(-20), p_current_period_end: iso(10), p_event_id: "evt_Rthree5", p_event_created: iso(0.005) }));
  assert.equal((await blockers(PA)).length, 0);
});

test("payer guard (130000): the parent who created the customer can't be removed or leave while it renews", async () => {
  await apply({ p_stripe_customer_id: "cus_R3b", p_stripe_subscription_id: "sub_R3b", p_plan_id: "family", p_family_id: F2, p_created_by: PB,
    p_status: "active", p_current_period_start: iso(0), p_current_period_end: iso(365) });
  assert.equal((await lic("sub_R3b")).iv, "yearly");
  await ctx.as(PC);
  await assert.rejects(ctx.rpc("select public.family_remove_member($1)", [PB]), /SUBSCRIPTION_ACTIVE/);
  assert.equal((await ctx.admin("select public.account_billing_blockers($1) b", [PB]))[0].b.length, 1, "a co-parent exists, but only PB can reach the customer");
  assert.equal((await ctx.admin("select public.account_billing_blockers($1) b", [PC]))[0].b.length, 0, "the co-parent can leave");
});
