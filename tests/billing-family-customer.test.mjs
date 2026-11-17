// Payments re-audit 2026-11-17, SQL side of "a family's Stripe customer belongs to its creator"
// (supabase/migrations/20261117130000_billing_family_customer_owner.sql). App side: tests/billing-reaudit-pay.test.mjs.
// Because only the creator (or a still-active co-parent) can reach the customer, the creator must not be able to leave,
// delete the account or be removed while the subscription still renews – otherwise nobody could cancel it.
import assert from "node:assert/strict";
import { test, before } from "node:test";
import { setupTeacherDb } from "./helpers/teacher-db.mjs";

const P1 = "00000000-0000-4000-8000-0000000000e1", P2 = "00000000-0000-4000-8000-0000000000e2", KID = "00000000-0000-4000-8000-0000000000e3";
const FAM = "20000000-0000-4000-8000-0000000000e1";
let ctx;
const blockers = async (user) => (await ctx.admin("select public.account_billing_blockers($1) b", [user]))[0].b;

before(async () => {
  ctx = await setupTeacherDb({ seed: false });
  const { admin } = ctx;
  await admin("insert into auth.users(id,email) values ($1,'e1@x.test'),($2,'e2@x.test'),($3,'e3@x.test')", [P1, P2, KID]);
  await admin("insert into public.families(id) values ($1)", [FAM]);
  await admin("insert into public.family_members(family_id,user_id,role,status) values ($1,$2,'parent','active'),($1,$3,'parent','active'),($1,$4,'child','active')", [FAM, P1, P2, KID]);
  await admin("insert into public.billing_customers(stripe_customer_id,family_id,created_by) values ('cus_famP1',$1,$2)", [FAM, P1]);
  await admin("insert into public.billing_subscriptions(stripe_subscription_id,stripe_customer_id,plan_id,status,family_id) values ('sub_famP1','cus_famP1','family','active',$1)", [FAM]);
});

test("the paying parent is blocked even with a second parent; the other parent is not", async () => {
  assert.deepEqual(await blockers(P1), [{ kind: "family", plan_id: "family", status: "active" }]);
  assert.deepEqual(await blockers(P2), []);
});

test("the paying parent cannot leave; the co-parent cannot remove them; both work once the plan is cancelling", async () => {
  const { admin, as, rpc, code } = ctx;
  await as(P1);
  assert.match((await code(rpc("select public.family_leave()"))) ?? "", /SUBSCRIPTION_ACTIVE/);
  await as(P2);
  assert.match((await code(rpc("select public.family_remove_member($1)", [P1]))) ?? "", /SUBSCRIPTION_ACTIVE/);
  assert.equal((await admin("select status from public.family_members where user_id = $1", [P1]))[0].status, "active");
  // Removing a child or a non-paying parent is unchanged.
  await as(P1);
  assert.equal(await code(rpc("select public.family_remove_member($1)", [P2])), null);
  await admin("update public.family_members set status = 'active' where user_id = $1", [P2]);
  await admin("update public.billing_subscriptions set cancel_at_period_end = true where stripe_subscription_id = 'sub_famP1'");
  assert.deepEqual(await blockers(P1), []);
  await as(P2);
  assert.equal(await code(rpc("select public.family_remove_member($1)", [P1])), null);
});

test("grants: blockers service role only, family_remove_member still callable by users", async () => {
  const [b] = await ctx.admin("select has_function_privilege('authenticated', 'public.account_billing_blockers(uuid)', 'execute') ok");
  assert.equal(b.ok, false);
  const [r] = await ctx.admin("select has_function_privilege('authenticated', 'public.family_remove_member(uuid)', 'execute') ok");
  assert.equal(r.ok, true);
});
