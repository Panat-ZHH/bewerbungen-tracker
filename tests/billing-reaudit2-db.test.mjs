// Payments re-audit 2 (2026-11-17), SQL + UI side:
//  L billing_status_for_family().has_customer now follows pickFamilyCustomer (own customer, or one of a still-active
//    parent): a later parent no longer gets "Abo verwalten" that can only answer 404 (migration 20261117140000).
//  Pending migrations 20261117*.sql: unique timestamps, re-applying them all is a no-op, billing grants are as intended.
import assert from "node:assert/strict";
import { test, before } from "node:test";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { setupTeacherDb } from "./helpers/teacher-db.mjs";

register("./helpers/alias-hooks.mjs", import.meta.url);

const P1 = "00000000-0000-4000-8000-0000000014e1", P2 = "00000000-0000-4000-8000-0000000014e2", P3 = "00000000-0000-4000-8000-0000000014e3";
const FAM = "20000000-0000-4000-8000-0000000014e1";
let ctx;
const hasCustomer = async (user) => { await ctx.as(user); return (await ctx.rpc("select public.billing_status_for_family($1) s", [FAM]))[0].s.has_customer; };

before(async () => {
  ctx = await setupTeacherDb({ seed: false, migrate: false });
  await ctx.admin("create role service_role");
  for (const f of ctx.files) await ctx.apply(f);
  await ctx.admin("insert into auth.users(id,email) values ($1,'r2a@x.test'),($2,'r2b@x.test'),($3,'r2c@x.test')", [P1, P2, P3]);
  await ctx.admin("insert into public.families(id) values ($1)", [FAM]);
  await ctx.admin("insert into public.family_members(family_id,user_id,role,status) values ($1,$2,'parent','active'),($1,$3,'parent','active')", [FAM, P1, P2]);
  await ctx.admin("insert into public.billing_customers(stripe_customer_id,family_id,created_by) values ('cus_r2P1',$1,$2)", [FAM, P1]);
  await ctx.admin("insert into public.billing_subscriptions(stripe_subscription_id,stripe_customer_id,plan_id,status,family_id,cancel_at_period_end) values ('sub_r2P1','cus_r2P1','family','active',$1,true)", [FAM]);
});

test("pending migrations: unique timestamps, all re-applicable (idempotent)", async () => {
  const pending = ctx.files.filter((f) => f.startsWith("20261117"));
  const stamps = pending.map((f) => f.split("_")[0]);
  assert.equal(new Set(stamps).size, stamps.length, "unique timestamps");
  assert.ok(pending.includes("20261117140000_billing_status_family_customer.sql"));
  for (const f of pending) await ctx.apply(f);
});

test("grants after all migrations: billing writer service role only, status for parents/admins, guards for users", async () => {
  const fn = async (sig) => (await ctx.admin(`select has_function_privilege('anon', '${sig}', 'execute') a, has_function_privilege('authenticated', '${sig}', 'execute') u, has_function_privilege('service_role', '${sig}', 'execute') s`))[0];
  assert.deepEqual(await fn("public.billing_apply_subscription(text,text,text,text,timestamptz,timestamptz,boolean,text,text,uuid,uuid,uuid,integer,text,text,timestamptz)"), { a: false, u: false, s: true });
  assert.deepEqual(await fn("public.account_billing_blockers(uuid)"), { a: false, u: false, s: true });
  assert.deepEqual(await fn("public.billing_status_for_family(uuid)"), { a: false, u: true, s: true });
  assert.deepEqual(await fn("public.billing_status_for_school(uuid)"), { a: false, u: true, s: true });
  for (const sig of ["public.family_leave()", "public.family_remove_member(uuid)"]) assert.equal((await fn(sig)).a, false, sig);
});

test("has_customer: true for the creator and an active co-parent, false once the creator has left; service role sees any", async () => {
  assert.equal(await hasCustomer(P1), true);
  assert.equal(await hasCustomer(P2), true, "co-parent while the creator is still active (pickFamilyCustomer gives it)");
  // The creator leaves (allowed: the plan is cancelling) and a new parent joins.
  await ctx.as(P1);
  await ctx.rpc("select public.family_leave()");
  await ctx.admin("insert into public.family_members(family_id,user_id,role,status) values ($1,$2,'parent','active')", [FAM, P3]);
  assert.equal(await hasCustomer(P2), false);
  assert.equal(await hasCustomer(P3), false);
  await ctx.as(null);
  assert.equal((await ctx.rpc("select public.billing_status_for_family($1) s", [FAM]))[0].s.has_customer, true);
  // The status itself (plan, subscription) is unchanged for the remaining parents.
  await ctx.as(P3);
  const s = (await ctx.rpc("select public.billing_status_for_family($1) s", [FAM]))[0].s;
  assert.deepEqual([s.subscription_status, s.cancel_at_period_end], ["active", true]);
  // Children / strangers still get FORBIDDEN.
  await ctx.as(P1);
  assert.match(await ctx.code(ctx.rpc("select public.billing_status_for_family($1)", [FAM])) ?? "", /FORBIDDEN/);
});

test("UI: hasCustomer is read from the status; the family card shows a note instead of a portal button that can only fail", async () => {
  const { readBillingStatus } = await import("../components/billing/logic.ts");
  assert.equal(readBillingStatus({ hasCustomer: false }).hasCustomer, false);
  assert.equal(readBillingStatus({ hasCustomer: true }).hasCustomer, true);
  assert.equal(readBillingStatus({}).hasCustomer, null, "older payloads: unknown, button stays");
  const src = readFileSync(new URL("../components/billing/billing-card.tsx", import.meta.url), "utf8");
  assert.match(src, /status\?\.hasCustomer === false\s*\?\s*<p[^>]*data-billing-manage="other-parent">\{FAMILY_COPY\.manage\.otherParent\}/);
});

test("L invoice checkout: Stripe's idempotency conflict (parallel twin request) answers 409 already_subscribed, not 500", async () => {
  const { checkout, isIdempotencyConflict } = await import("../lib/billing/api.ts");
  const SCHOOL = "00000000-0000-4000-8000-0000000014f1";
  const deps = (error) => ({
    enabled: true, configured: true, liveMode: false, baseUrl: "https://wendapply.test",
    auth: { async getUser() { return { id: P1, email: "a@s.ch" }; }, async isSchoolAdmin() { return true; }, async isFamilyParent() { return false; } },
    stripe: {
      async priceIdForLookupKey(k) { return `price_${k}`; }, async hasOpenStripeSubscription() { return false; }, async expireOpenCheckoutSessions() { return 0; },
      async createInvoiceSubscription() { throw error; },
    },
    db: { async findCustomerId() { return "cus_school"; }, async hasOpenSubscription() { return false; }, async ownerName() { return null; } },
  });
  const body = { plan: "starter", schoolId: SCHOOL, payment: "invoice" };
  for (const e of [Object.assign(new Error("in use"), { code: "idempotency_key_in_use", statusCode: 409 }), Object.assign(new Error("other params"), { type: "StripeIdempotencyError", rawType: "idempotency_error" })]) {
    assert.equal(isIdempotencyConflict(e), true);
    const r = await checkout({ token: "t", body }, deps(e));
    assert.deepEqual([r.status, r.body.error], [409, "already_subscribed"]);
  }
  await assert.rejects(checkout({ token: "t", body }, deps(Object.assign(new Error("card_declined"), { code: "card_declined" }))), /card_declined/);
});
