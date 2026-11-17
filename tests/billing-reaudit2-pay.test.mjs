// Payments re-audit, round 2 (branch reaudit2-pay, 2026-11-17):
//  M1 price integrity: the Stripe price found by lookup_key was charged without checking it against lib/billing/plans.ts.
//     The in-app page shows (and asks consent for) the catalogue amount, so a price with another amount / currency /
//     interval (Dashboard edit, transferred lookup key, plans.ts deployed before the setup script) must never be sold.
//  L  a customer returned by the idempotent createCustomer (save failed) skipped the "open Stripe subscription" check.
//  L  invoice.paid of an OLDER invoice set latest_invoice_status = paid although the newest renewal invoice is still open.
//  L  "Rechnung angefordert" promised the licence only after payment, but send_invoice subscriptions are active at once.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./helpers/alias-hooks.mjs", import.meta.url);

const { PLANS, STRIPE_PLANS, lookupKeyFor, planIntervals, planPrice, priceMatchesCatalogue } = await import("../lib/billing/plans.ts");
const { apiStripe } = await import("../lib/billing/stripe.ts");
const { checkout } = await import("../lib/billing/api.ts");
const { handleStripeEvent } = await import("../lib/billing/webhook.ts");
const { createMemoryBillingDb } = await import("../lib/billing/memory-db.ts");

const price = (over = {}) => ({ id: "price_ok", active: true, currency: "chf", unit_amount: 7900, type: "recurring", recurring: { interval: "year", interval_count: 1 }, ...over });

test("M1 priceMatchesCatalogue: every catalogue price/interval matches exactly its own amount, CHF, interval", () => {
  let checked = 0;
  for (const plan of STRIPE_PLANS) {
    for (const interval of planIntervals(plan)) {
      const key = lookupKeyFor(plan, interval);
      const ok = price({ unit_amount: Math.round(planPrice(plan, interval) * 100), recurring: { interval, interval_count: 1 } });
      assert.equal(priceMatchesCatalogue(ok, key), true, key);
      assert.equal(priceMatchesCatalogue({ ...ok, unit_amount: ok.unit_amount - 1 }, key), false, `${key} amount`);
      assert.equal(priceMatchesCatalogue({ ...ok, currency: "eur" }, key), false, `${key} currency`);
      assert.equal(priceMatchesCatalogue({ ...ok, recurring: { interval: interval === "year" ? "month" : "year", interval_count: 1 } }, key), false, `${key} interval`);
      assert.equal(priceMatchesCatalogue({ ...ok, recurring: { interval, interval_count: 2 } }, key), false, `${key} interval_count`);
      assert.equal(priceMatchesCatalogue({ ...ok, type: "one_time", recurring: null }, key), false, `${key} one-time`);
      assert.equal(priceMatchesCatalogue({ ...ok, active: false }, key), false, `${key} archived`);
      checked++;
    }
  }
  assert.ok(checked >= 5, "starter, professional, enterprise, family yearly + monthly");
  // The family monthly key is not the yearly price (CHF 7.90 per month, never CHF 79 per month).
  assert.equal(priceMatchesCatalogue(price({ unit_amount: 7900, recurring: { interval: "month", interval_count: 1 } }), PLANS.family.lookupKeyMonthly), false);
  assert.equal(priceMatchesCatalogue(price(), "wendapply_unknown_key"), false);
  assert.equal(priceMatchesCatalogue(null, PLANS.family.lookupKey), false);
});

test("M1 apiStripe.priceIdForLookupKey: a price that differs from the catalogue is treated as missing (never charged, not cached)", async () => {
  let served = price({ id: "price_wrong", unit_amount: 790 }); // CHF 7.90 per YEAR on the yearly key
  const fake = { prices: { async list(q) { assert.deepEqual(q.lookup_keys, ["wendapply_family_yearly_chf"]); return { data: [served] }; } } };
  const errors = [];
  const orig = console.error;
  console.error = (...a) => errors.push(a.join(" "));
  try {
    const s = apiStripe(fake);
    assert.equal(await s.priceIdForLookupKey("wendapply_family_yearly_chf"), null);
    assert.match(errors.join("\n"), /does not match lib\/billing\/plans\.ts/);
    // Fixed in Stripe -> found (the wrong id was not cached).
    served = price({ id: "price_right" });
    assert.equal(await s.priceIdForLookupKey("wendapply_family_yearly_chf"), "price_right");
  } finally { console.error = orig; }
});

const FAMILY = "00000000-0000-4000-8000-000000005001";
const PARENT = { id: "00000000-0000-4000-8000-000000005002", email: "p@familie.ch" };
function apiDeps(stripeOver = {}, dbOver = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      enabled: true, configured: true, liveMode: false, baseUrl: "https://wendapply.test",
      auth: { async getUser(t) { return t === "tok" ? PARENT : null; }, async isSchoolAdmin() { return false; }, async isFamilyParent(t, id) { return t === "tok" && id === FAMILY; } },
      stripe: {
        async priceIdForLookupKey(k) { return `price_${k}`; },
        async createCustomer(p) { calls.push(["createCustomer", p.idempotencyKey]); return "cus_replayed"; },
        async hasOpenStripeSubscription(c) { calls.push(["hasOpen", c]); return false; },
        async expireOpenCheckoutSessions() { calls.push(["expire"]); return 0; },
        async createCheckoutSession() { calls.push(["session"]); return { url: "https://checkout.stripe.test/x" }; },
        async createElementsSession() { calls.push(["elements"]); return { clientSecret: "cs_test_x_secret_y" }; },
        async retrieveCheckoutSession() { return null; },
        async createInvoiceSubscription() { throw new Error("not for families"); },
        async createPortalSession() { return { url: "https://portal" }; },
        ...stripeOver,
      },
      db: {
        async findCustomerId() { return null; },
        async saveCustomer() { throw new Error("DB down"); },
        async hasOpenSubscription() { return false; },
        async ownerName() { return "Familie"; },
        async status() { return null; },
        ...dbOver,
      },
    },
  };
}

test("M1 checkout: a price that fails the catalogue check answers 503 price_not_found before any customer or session", async () => {
  const { deps, calls } = apiDeps({ async priceIdForLookupKey() { return null; } });
  const r = await checkout({ token: "tok", body: { plan: "family", familyId: FAMILY, interval: "month" } }, deps);
  assert.deepEqual([r.status, r.body.error], [503, "price_not_found"]);
  assert.equal(calls.filter(([c]) => c === "createCustomer" || c === "session").length, 0);
});

test("L checkout: the customer handed back by the idempotent create (save failed) is checked for an open subscription too", async () => {
  const { deps, calls } = apiDeps({ async hasOpenStripeSubscription(c) { calls.push(["hasOpen", c]); return c === "cus_replayed"; } });
  const r = await checkout({ token: "tok", body: { plan: "family", familyId: FAMILY } }, deps);
  assert.deepEqual([r.status, r.body.error], [409, "already_subscribed"]);
  assert.deepEqual(calls.map(([c]) => c), ["createCustomer", "hasOpen"]);
  // No open subscription: the normal flow continues (expire older sessions, new session).
  const ok = apiDeps();
  const r2 = await checkout({ token: "tok", body: { plan: "family", familyId: FAMILY } }, ok.deps);
  assert.equal(r2.status, 200);
  assert.deepEqual(ok.calls.map(([c]) => c), ["createCustomer", "hasOpen", "expire", "session"]);
});

const NOW = Math.floor(Date.now() / 1000);
const SCHOOL = "00000000-0000-4000-8000-000000005003";
const schoolSub = (over = {}) => ({
  id: "sub_r2", object: "subscription", customer: "cus_r2", status: "active", cancel_at_period_end: false, collection_method: "send_invoice",
  latest_invoice: { id: "in_new", object: "invoice", status: "open" },
  metadata: { app: "wendapply", plan_id: "starter", school_id: SCHOOL },
  items: { data: [{ id: "si", price: { id: "p", lookup_key: "wendapply_starter_yearly_chf" }, current_period_start: NOW, current_period_end: NOW + 365 * 86400 }] },
  ...over,
});
const invoiceEvent = (type, invoice) => ({ id: `evt_R2${invoice.id}${type.length}`, object: "event", type, created: NOW, data: { object: invoice } });

test("L webhook: paying an OLDER invoice does not mark the open renewal invoice as paid; the latest invoice still does", async () => {
  const db = createMemoryBillingDb();
  const deps = { db, stripe: { async retrieveSubscription() { return schoolSub(); } } };
  const old = { id: "in_old", object: "invoice", status: "paid", parent: { subscription_details: { subscription: "sub_r2" } } };
  assert.equal((await handleStripeEvent(invoiceEvent("invoice.paid", old), deps)).kind, "applied");
  assert.equal(db.state.calls.at(-1).p_latest_invoice_status, "open", "newest invoice (in_new) is still open");
  const latest = { id: "in_new", object: "invoice", status: "paid", parent: { subscription_details: { subscription: "sub_r2" } } };
  assert.equal((await handleStripeEvent(invoiceEvent("invoice.paid", latest), deps)).kind, "applied");
  assert.equal(db.state.calls.at(-1).p_latest_invoice_status, "paid");
});

test("L invoice request copy: the licence is active right away (send_invoice), payable within the invoice term", () => {
  const src = readFileSync(new URL("../components/billing/billing-card.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /freigeschaltet, sobald sie bezahlt ist/);
  assert.match(src, /Die Lizenz ist in wenigen Sekunden aktiv\. Die Rechnung ist innert \$\{BILLING\.invoiceDaysUntilDue\} Tagen zahlbar/);
});
