// Launch audit (flows): account deletion must not orphan a running Stripe subscription.
// 1. lib/account-delete-server.ts refuses (BillingActiveError) before ANY data is touched when blockers exist.
// 2. supabase/migrations/20261117120000_account_delete_billing_guard.sql: account_billing_blockers(uid) lists only renewing
//    subscriptions the user is the LAST parent / admin of; it is service-role only.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { setupTeacherDb } from "./helpers/teacher-db.mjs";
import { loadLib } from "./helpers/load-lib.mjs";

const server = await loadLib("account-delete-server");

function fakeAdmin(blockerResult) {
  const calls = [];
  const admin = {
    rpc: async (name) => { calls.push(`rpc:${name}`); return name === "account_billing_blockers" ? blockerResult : { data: {}, error: null }; },
    auth: { admin: { deleteUser: async () => { calls.push("deleteUser"); return { error: null }; } } },
    from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) }),
    storage: { from: (bucket) => ({ list: async () => ({ data: [], error: null }), remove: async () => { calls.push(`remove:${bucket}`); return { error: null }; } }) },
  };
  return { admin, calls };
}

test("a running subscription blocks the deletion before anything is prepared, removed or deleted", async () => {
  const { admin, calls } = fakeAdmin({ data: [{ kind: "family", plan_id: "family", status: "active" }], error: null });
  await assert.rejects(() => server.deleteAccount(admin, "U"), (e) => e instanceof server.BillingActiveError && e.blockers[0].kind === "family");
  assert.deepEqual(calls, ["rpc:account_billing_blockers"]);
});

test("no blockers: deletion runs as before; a DB without the function (not migrated yet) does not block", async () => {
  for (const result of [{ data: [], error: null }, { data: null, error: { code: "PGRST202", message: "not found" } }]) {
    const { admin, calls } = fakeAdmin(result);
    await server.deleteAccount(admin, "U");
    assert.ok(calls.includes("deleteUser"));
  }
});

test("any other error of the billing check aborts (fail closed, nothing deleted)", async () => {
  const { admin, calls } = fakeAdmin({ data: null, error: { code: "57014", message: "timeout" } });
  await assert.rejects(() => server.deleteAccount(admin, "U"), /BILLING_CHECK_FAILED/);
  assert.ok(!calls.includes("deleteUser"));
});

test("the route answers 409 SUBSCRIPTION_ACTIVE and the settings page shows that message as is", async () => {
  const route = await readFile(new URL("../app/api/account/delete/route.ts", import.meta.url), "utf8");
  assert.match(route, /BillingActiveError/);
  assert.match(route, /reply\(409, "SUBSCRIPTION_ACTIVE"/);
  const ui = await readFile(new URL("../components/settings/delete-account.tsx", import.meta.url), "utf8");
  assert.match(ui, /SUBSCRIPTION_ACTIVE/);
});

// ---- SQL ----
const P1 = "00000000-0000-4000-8000-0000000000d1", P2 = "00000000-0000-4000-8000-0000000000d2", A1 = "00000000-0000-4000-8000-0000000000d3", A2 = "00000000-0000-4000-8000-0000000000d4";
const FAM = "20000000-0000-4000-8000-000000000001", SCHOOL = "30000000-0000-4000-8000-000000000001";
let ctx;
const blockers = async (user) => (await ctx.admin("select public.account_billing_blockers($1) b", [user]))[0].b;

test("SQL setup: family with one parent + school with one admin, each with an active subscription", async () => {
  ctx = await setupTeacherDb({ seed: false });
  const { admin } = ctx;
  await admin("insert into auth.users(id,email) values ($1,'p1@x.test'),($2,'p2@x.test'),($3,'a1@x.test'),($4,'a2@x.test')", [P1, P2, A1, A2]);
  await admin("insert into public.families(id) values ($1)", [FAM]);
  await admin("insert into public.family_members(family_id,user_id,role,status) values ($1,$2,'parent','active')", [FAM, P1]);
  await admin("insert into public.schools(id,name) values ($1,'Testschule')", [SCHOOL]);
  await admin("insert into public.school_admins(school_id,user_id) values ($1,$2)", [SCHOOL, A1]);
  await admin("insert into public.billing_customers(stripe_customer_id,family_id) values ('cus_fam1',$1)", [FAM]);
  await admin("insert into public.billing_customers(stripe_customer_id,school_id) values ('cus_sch1',$1)", [SCHOOL]);
  await admin("insert into public.billing_subscriptions(stripe_subscription_id,stripe_customer_id,plan_id,status,family_id) values ('sub_fam1','cus_fam1','family','active',$1)", [FAM]);
  await admin("insert into public.billing_subscriptions(stripe_subscription_id,stripe_customer_id,plan_id,status,school_id) values ('sub_sch1','cus_sch1','starter','trialing',$1)", [SCHOOL]);
});

test("SQL: the last parent / admin is blocked, someone without billing role is not", async () => {
  assert.deepEqual(await blockers(P1), [{ kind: "family", plan_id: "family", status: "active" }]);
  assert.deepEqual(await blockers(A1), [{ kind: "school", plan_id: "starter", status: "trialing" }]);
  assert.deepEqual(await blockers(P2), []);
});

test("SQL: a second active parent / admin lifts the block (they can manage the plan)", async () => {
  await ctx.admin("insert into public.family_members(family_id,user_id,role,status) values ($1,$2,'parent','active')", [FAM, P2]);
  await ctx.admin("insert into public.school_admins(school_id,user_id) values ($1,$2)", [SCHOOL, A2]);
  assert.deepEqual(await blockers(P1), []);
  assert.deepEqual(await blockers(A1), []);
  await ctx.admin("update public.family_members set status = 'pending' where user_id = $1", [P2]);
  assert.equal((await blockers(P1)).length, 1, "a pending parent does not count");
  await ctx.admin("delete from public.school_admins where user_id = $1", [A2]);
});

test("SQL: cancelled or cancelling subscriptions don't block", async () => {
  await ctx.admin("update public.billing_subscriptions set cancel_at_period_end = true where stripe_subscription_id = 'sub_fam1'");
  assert.deepEqual(await blockers(P1), []);
  await ctx.admin("update public.billing_subscriptions set status = 'canceled' where stripe_subscription_id = 'sub_sch1'");
  assert.deepEqual(await blockers(A1), []);
});

test("SQL: only the service role may call it", async () => {
  for (const role of ["anon", "authenticated"]) {
    const [r] = await ctx.admin("select has_function_privilege($1, 'public.account_billing_blockers(uuid)', 'execute') ok", [role]);
    assert.equal(r.ok, false, role);
  }
});
