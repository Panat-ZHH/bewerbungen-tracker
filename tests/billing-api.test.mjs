// Billing API logic (lib/billing/api.ts + auth.ts) with fake Stripe/DB/auth: flag off, validation, auth rejection,
// card checkout, invoice payment (send_invoice, days_until_due from BILLING), portal, status mapping.
// The real route files are also loaded (via the "@/" alias hook) to check the flag-off answers end to end.
import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
import { checkout, portal, status, purchasablePlan } from "../lib/billing/api.ts";
import { bearerToken, parseOwner, authorizeOwner } from "../lib/billing/auth.ts";
import { BILLING } from "../lib/billing/plans.ts";

const SCHOOL = "00000000-0000-4000-8000-000000003001";
const OTHER_SCHOOL = "00000000-0000-4000-8000-000000003009";
const FAMILY = "00000000-0000-4000-8000-000000003002";
const ADMIN = { id: "00000000-0000-4000-8000-000000003003", email: "admin@schule.ch" };
const PARENT = { id: "00000000-0000-4000-8000-000000003004", email: "parent@familie.ch" };
const CHILD = { id: "00000000-0000-4000-8000-000000003005", email: "kid@familie.ch" };

function makeDeps(over = {}) {
  const calls = [];
  const tokens = { "tok-admin": ADMIN, "tok-parent": PARENT, "tok-child": CHILD };
  const deps = {
    enabled: true, configured: true, liveMode: false, baseUrl: "https://wendapply.test",
    auth: {
      async getUser(t) { return tokens[t] ?? null; },
      async isSchoolAdmin(t, id) { return t === "tok-admin" && id === SCHOOL; },
      async isFamilyParent(t, id) { return t === "tok-parent" && id === FAMILY; },
    },
    stripe: {
      async priceIdForLookupKey(key) { calls.push(["price", key]); return `price_for_${key}`; },
      async createCustomer(p) { calls.push(["customer", p]); return "cus_new"; },
      async createCheckoutSession(p) { calls.push(["checkout", p]); return { url: "https://checkout.stripe.test/c/pay/cs_1" }; },
      async createInvoiceSubscription(p) { calls.push(["invoice", p]); return { subscriptionId: "sub_inv", hostedInvoiceUrl: "https://invoice.stripe.test/i/1" }; },
      async createPortalSession(p) { calls.push(["portal", p]); return { url: "https://billing.stripe.test/p/1" }; },
    },
    db: {
      customers: {}, open: new Set(),
      async findCustomerId(o) { return this.customers[o.id] ?? null; },
      async hasOpenSubscription(o) { return this.open.has(o.id); },
      async ownerName(o) { return o.kind === "school" ? "Schule Test" : "Familie Test"; },
      async status(o, token) { calls.push(["status", o, token]); return { plan: "starter", state: "active", licence_status: "active", source: "stripe", student_limit: 100, valid_until: "2027-11-16", subscription_status: "active", cancel_at_period_end: false, current_period_end: "2027-11-16T10:00:00.000Z", collection_method: "send_invoice", latest_invoice_status: "open", has_customer: true, school_id: o.id, students_used: 42 }; },
    },
    ...over,
  };
  return { deps, calls };
}

test("helpers: bearer token, owner parsing, purchasable plans", () => {
  assert.equal(bearerToken("Bearer abc.def"), "abc.def");
  assert.equal(bearerToken("Basic abc"), null);
  assert.equal(bearerToken(null), null);
  assert.deepEqual(parseOwner({ schoolId: SCHOOL }), { kind: "school", id: SCHOOL });
  assert.deepEqual(parseOwner({ familyId: FAMILY }), { kind: "family", id: FAMILY });
  assert.equal(parseOwner({ schoolId: SCHOOL, familyId: FAMILY }), null, "exactly one owner");
  assert.equal(parseOwner({}), null);
  assert.equal(parseOwner({ schoolId: "1; drop table" }), null);
  assert.ok(purchasablePlan("starter"));
  for (const p of ["pilot", "individual", "nope", "__proto__", 5]) assert.equal(purchasablePlan(p), null, String(p));
});

test("flag off: every endpoint answers 503 billing_disabled and touches nothing", async () => {
  const { deps, calls } = makeDeps({ enabled: false });
  for (const r of [
    await checkout({ token: "tok-admin", body: { plan: "starter", schoolId: SCHOOL, payment: "card" } }, deps),
    await portal({ token: "tok-admin", body: { schoolId: SCHOOL } }, deps),
    await status({ token: "tok-admin", query: new URLSearchParams({ schoolId: SCHOOL }) }, deps),
  ]) assert.deepEqual(r, { status: 503, body: { error: "billing_disabled", enabled: false } });
  assert.equal(calls.length, 0);
  const { deps: d2 } = makeDeps({ configured: false });
  assert.deepEqual((await checkout({ token: "tok-admin", body: { plan: "starter", schoolId: SCHOOL } }, d2)).body, { error: "billing_not_configured" });
});

test("auth rejection: no token 401, bad token 401, wrong school 403, teacher/other admin 403, child 403", async () => {
  const { deps, calls } = makeDeps();
  const body = { plan: "starter", schoolId: SCHOOL, payment: "card" };
  assert.deepEqual(await checkout({ token: null, body }, deps), { status: 401, body: { error: "unauthenticated" } });
  assert.deepEqual(await checkout({ token: "tok-expired", body }, deps), { status: 401, body: { error: "unauthenticated" } });
  assert.deepEqual(await checkout({ token: "tok-parent", body }, deps), { status: 403, body: { error: "forbidden" } });
  assert.deepEqual(await checkout({ token: "tok-admin", body: { ...body, schoolId: OTHER_SCHOOL } }, deps), { status: 403, body: { error: "forbidden" } });
  assert.deepEqual(await checkout({ token: "tok-child", body: { plan: "family", familyId: FAMILY } }, deps), { status: 403, body: { error: "forbidden" } });
  assert.equal((await portal({ token: "tok-child", body: { familyId: FAMILY } }, deps)).status, 403);
  assert.equal((await status({ token: "tok-parent", query: new URLSearchParams({ schoolId: SCHOOL }) }, deps)).status, 403);
  assert.equal((await status({ token: null, query: new URLSearchParams({ familyId: FAMILY }) }, deps)).status, 401);
  assert.equal(calls.length, 0, "nothing reaches Stripe or the DB before auth passes");
});

test("validation: plan, payment, interval, owner kind, invoice only for schools", async () => {
  const { deps } = makeDeps();
  const t = "tok-admin";
  assert.equal((await checkout({ token: t, body: { plan: "pilot", schoolId: SCHOOL } }, deps)).body.error, "invalid_plan");
  assert.equal((await checkout({ token: t, body: { plan: "individual", schoolId: SCHOOL } }, deps)).body.error, "invalid_plan");
  assert.equal((await checkout({ token: t, body: null }, deps)).body.error, "invalid_plan");
  assert.equal((await checkout({ token: t, body: { plan: "starter", schoolId: SCHOOL, payment: "bitcoin" } }, deps)).body.error, "invalid_payment");
  assert.equal((await checkout({ token: t, body: { plan: "starter" } }, deps)).body.error, "invalid_owner");
  assert.equal((await checkout({ token: t, body: { plan: "family", schoolId: SCHOOL } }, deps)).body.error, "plan_owner_mismatch");
  assert.equal((await checkout({ token: "tok-parent", body: { plan: "family", familyId: FAMILY, payment: "invoice" } }, deps)).body.error, "invoice_not_allowed");
  assert.equal((await checkout({ token: "tok-parent", body: { plan: "family", familyId: FAMILY, interval: "week" } }, deps)).body.error, "invalid_interval");
  assert.equal((await checkout({ token: t, body: { plan: "starter", schoolId: SCHOOL, interval: "month" } }, deps)).body.error, "invalid_interval", "schools: yearly only");
  // the family price is final now (no placeholder): it may be sold in live mode too
  const live = makeDeps({ liveMode: true }).deps;
  assert.equal((await checkout({ token: "tok-parent", body: { plan: "family", familyId: FAMILY } }, live)).status, 200);
});

test("card checkout: creates the customer once, Checkout session with owner metadata and return URLs", async () => {
  const { deps, calls } = makeDeps();
  const r = await checkout({ token: "tok-admin", body: { plan: "professional", schoolId: SCHOOL, payment: "card" } }, deps);
  assert.deepEqual(r, { status: 200, body: { url: "https://checkout.stripe.test/c/pay/cs_1" } });
  assert.deepEqual(calls.find((c) => c[0] === "price"), ["price", "wendapply_professional_yearly_chf"]);
  const customer = calls.find((c) => c[0] === "customer")[1];
  assert.deepEqual(customer, { email: ADMIN.email, name: "Schule Test", metadata: { app: "wendapply", school_id: SCHOOL, user_id: ADMIN.id } });
  const session = calls.find((c) => c[0] === "checkout")[1];
  assert.equal(session.customer, "cus_new");
  assert.equal(session.price, "price_for_wendapply_professional_yearly_chf");
  assert.equal(session.kind, "school");
  assert.deepEqual(session.metadata, { app: "wendapply", plan_id: "professional", interval: "year", school_id: SCHOOL, user_id: ADMIN.id });
  assert.equal(session.successUrl, "https://wendapply.test/schul-admin?billing=success&session_id={CHECKOUT_SESSION_ID}");
  assert.equal(session.cancelUrl, "https://wendapply.test/schul-admin?billing=cancel");
  // existing customer is reused; family returns to /familie
  const f = makeDeps();
  f.deps.db.customers[FAMILY] = "cus_existing";
  const rf = await checkout({ token: "tok-parent", body: { plan: "family", familyId: FAMILY } }, f.deps);
  assert.equal(rf.status, 200);
  assert.equal(f.calls.filter((c) => c[0] === "customer").length, 0);
  const fs = f.calls.find((c) => c[0] === "checkout")[1];
  assert.equal(fs.customer, "cus_existing");
  assert.match(fs.successUrl, /^https:\/\/wendapply\.test\/familie\?billing=success/);
  assert.deepEqual(fs.metadata, { app: "wendapply", plan_id: "family", interval: "year", family_id: FAMILY, user_id: PARENT.id });
  assert.equal(fs.price, "price_for_wendapply_family_yearly_chf");
});

test("family checkout: monthly (CHF 7.90) and yearly (CHF 79) use their own lookup keys", async () => {
  const m = makeDeps();
  const rm = await checkout({ token: "tok-parent", body: { plan: "family", familyId: FAMILY, interval: "month" } }, m.deps);
  assert.equal(rm.status, 200);
  assert.deepEqual(m.calls.find((c) => c[0] === "price"), ["price", "wendapply_family_monthly_chf"]);
  const ms = m.calls.find((c) => c[0] === "checkout")[1];
  assert.equal(ms.price, "price_for_wendapply_family_monthly_chf");
  assert.equal(ms.metadata.interval, "month");
  const y = makeDeps();
  await checkout({ token: "tok-parent", body: { plan: "family", familyId: FAMILY, interval: "year" } }, y.deps);
  assert.deepEqual(y.calls.find((c) => c[0] === "price"), ["price", "wendapply_family_yearly_chf"]);
});

test("invoice payment for schools: send_invoice subscription, days_until_due from BILLING, hosted invoice URL", async () => {
  const { deps, calls } = makeDeps();
  const r = await checkout({ token: "tok-admin", body: { plan: "starter", schoolId: SCHOOL, payment: "invoice" } }, deps);
  assert.deepEqual(r, { status: 200, body: { url: "https://invoice.stripe.test/i/1", invoice: true } });
  const inv = calls.find((c) => c[0] === "invoice")[1];
  assert.equal(inv.daysUntilDue, BILLING.invoiceDaysUntilDue);
  assert.equal(inv.daysUntilDue, 30);
  assert.equal(inv.price, "price_for_wendapply_starter_yearly_chf");
  assert.equal(inv.metadata.school_id, SCHOOL);
  assert.equal(calls.some((c) => c[0] === "checkout"), false);
});

test("already subscribed -> 409 (change/cancel goes through the portal); missing price -> 503", async () => {
  const { deps } = makeDeps();
  deps.db.open.add(SCHOOL);
  assert.deepEqual(await checkout({ token: "tok-admin", body: { plan: "starter", schoolId: SCHOOL } }, deps), { status: 409, body: { error: "already_subscribed" } });
  const m = makeDeps();
  m.deps.stripe.priceIdForLookupKey = async () => null;
  assert.deepEqual(await checkout({ token: "tok-admin", body: { plan: "starter", schoolId: SCHOOL } }, m.deps), { status: 503, body: { error: "price_not_found" } });
});

test("portal: needs a known customer, returns the portal URL with the right return path", async () => {
  const { deps, calls } = makeDeps();
  assert.deepEqual(await portal({ token: "tok-admin", body: { schoolId: SCHOOL } }, deps), { status: 404, body: { error: "no_customer" } });
  deps.db.customers[SCHOOL] = "cus_school";
  assert.deepEqual(await portal({ token: "tok-admin", body: { schoolId: SCHOOL } }, deps), { status: 200, body: { url: "https://billing.stripe.test/p/1" } });
  assert.deepEqual(calls.find((c) => c[0] === "portal")[1], { customer: "cus_school", returnUrl: "https://wendapply.test/schul-admin" });
});

test("status: maps the DB JSON to the camelCase contract, using the caller's token", async () => {
  const { deps, calls } = makeDeps();
  const r = await status({ token: "tok-admin", query: new URLSearchParams({ schoolId: SCHOOL }) }, deps);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, {
    enabled: true, plan: "starter", status: "active", studentLimit: 100, validUntil: "2027-11-16", cancelAtPeriodEnd: false, source: "stripe",
    subscriptionStatus: "active", collectionMethod: "send_invoice", latestInvoiceStatus: "open", currentPeriodEnd: "2027-11-16T10:00:00.000Z", hasCustomer: true, studentsUsed: 42,
  });
  assert.deepEqual(calls.find((c) => c[0] === "status").slice(1), [{ kind: "school", id: SCHOOL }, "tok-admin"]);
  const empty = makeDeps();
  empty.deps.db.status = async () => null;
  const e = await status({ token: "tok-parent", query: new URLSearchParams({ familyId: FAMILY }) }, empty.deps);
  assert.deepEqual([e.body.plan, e.body.status, e.body.cancelAtPeriodEnd, e.body.hasCustomer], [null, null, false, false]);
});

test("authorizeOwner uses the right check per owner kind", async () => {
  const seen = [];
  const auth = { getUser: async () => ADMIN, isSchoolAdmin: async (t, id) => { seen.push(["school", id]); return true; }, isFamilyParent: async (t, id) => { seen.push(["family", id]); return false; } };
  assert.equal((await authorizeOwner("t", { kind: "school", id: SCHOOL }, auth)).ok, true);
  assert.deepEqual(await authorizeOwner("t", { kind: "family", id: FAMILY }, auth), { ok: false, status: 403, error: "forbidden" });
  assert.deepEqual(seen, [["school", SCHOOL], ["family", FAMILY]]);
});

// ---------- the real route files, flag off ----------
test("routes with the flag off: 503 billing_disabled, webhook too (before reading any secret)", async () => {
  register("./helpers/alias-hooks.mjs", import.meta.url);
  const saved = { ...process.env };
  delete process.env.STRIPE_ENABLED;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  try {
    const post = (url, body) => new Request(url, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer x" }, body: JSON.stringify(body) });
    const routes = {
      checkout: await import("../app/api/billing/checkout/route.ts"),
      portal: await import("../app/api/billing/portal/route.ts"),
      status: await import("../app/api/billing/status/route.ts"),
      webhook: await import("../app/api/stripe/webhook/route.ts"),
    };
    const responses = [
      await routes.checkout.POST(post("http://x/api/billing/checkout", { plan: "starter", schoolId: SCHOOL })),
      await routes.portal.POST(post("http://x/api/billing/portal", { schoolId: SCHOOL })),
      await routes.status.GET(new Request(`http://x/api/billing/status?schoolId=${SCHOOL}`)),
      await routes.webhook.POST(new Request("http://x/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "t=1,v1=x" }, body: "{}" })),
    ];
    for (const res of responses) {
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { error: "billing_disabled", enabled: false });
      assert.equal(res.headers.get("cache-control"), "no-store");
    }
    for (const r of Object.values(routes)) assert.equal(r.runtime, "nodejs");
    // flag on but nothing configured: webhook refuses without a secret, never 200
    process.env.STRIPE_ENABLED = "true";
    const res = await routes.webhook.POST(new Request("http://x/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "t=1,v1=x" }, body: "{}" }));
    assert.notEqual(res.status, 200);
  } finally {
    process.env = saved;
  }
});
