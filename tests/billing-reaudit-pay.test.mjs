// Payments re-audit 2026-11-17 (branch reaudit1-pay):
//  M1 GET /api/billing/session asked Stripe before verifying the token and had no rate limit.
//  M2 Two "Rechnung anfordern" requests at once created two send_invoice subscriptions (no idempotency key).
//  M3 A family's Stripe customer (card, address, invoices of the parent who created it) was handed to any later parent.
//     SQL side of M3 (guards): tests/billing-family-customer.test.mjs.
import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { register } from "node:module";

register("./helpers/alias-hooks.mjs", import.meta.url);

const { checkout, checkoutSession, invoiceIdempotencyKey } = await import("../lib/billing/api.ts");
const { apiStripe } = await import("../lib/billing/stripe.ts");
const { pickFamilyCustomer, supabaseApiDb } = await import("../lib/billing/server.ts");
const rl = await import("../lib/rate-limit/index.ts");

const SCHOOL = "00000000-0000-4000-8000-000000004001";
const FAMILY = "00000000-0000-4000-8000-000000004002";
const ADMIN = { id: "00000000-0000-4000-8000-000000004003", email: "a@schule.ch" };
const PARENT = { id: "00000000-0000-4000-8000-000000004004", email: "p@familie.ch" };
const OLD_PARENT = "00000000-0000-4000-8000-000000004005";
const SESSION = "cs_test_reauditSession0001";

function deps(over = {}) {
  const calls = [];
  const tokens = { "tok-admin": ADMIN, "tok-parent": PARENT };
  return {
    calls,
    deps: {
      enabled: true, configured: true, liveMode: false, baseUrl: "https://wendapply.test",
      auth: {
        async getUser(t) { calls.push(["getUser", t]); return tokens[t] ?? null; },
        async isSchoolAdmin(t, id) { return t === "tok-admin" && id === SCHOOL; },
        async isFamilyParent(t, id) { return t === "tok-parent" && id === FAMILY; },
      },
      stripe: {
        async priceIdForLookupKey(k) { return `price_${k}`; },
        async createCustomer() { calls.push(["createCustomer"]); return "cus_new"; },
        async createCheckoutSession() { return { url: "https://checkout.stripe.test/x" }; },
        async createElementsSession() { return { clientSecret: "cs_test_x_secret_y" }; },
        async createInvoiceSubscription(p) { calls.push(["invoice", p]); return { subscriptionId: "sub_1", hostedInvoiceUrl: "https://invoice.stripe.test/i" }; },
        async createPortalSession(p) { calls.push(["portal", p]); return { url: "https://billing.stripe.test/p" }; },
        async retrieveCheckoutSession(id) {
          calls.push(["retrieve", id]);
          return { status: "complete", paymentStatus: "paid", metadata: { app: "wendapply", plan_id: "family", interval: "year", family_id: FAMILY } };
        },
      },
      db: {
        async findCustomerId(o, userId) { calls.push(["findCustomerId", o.kind, userId]); return null; },
        async hasOpenSubscription() { return false; },
        async ownerName() { return "X"; },
        async status() { return null; },
      },
      ...over,
    },
  };
}

// ---------------------------------------------------------------- M1
test("M1 session endpoint: an unknown / forged token never reaches Stripe", async () => {
  const { deps: d, calls } = deps();
  const q = new URLSearchParams({ id: SESSION });
  assert.deepEqual(await checkoutSession({ token: "forged.jwt.value", query: q }, d), { status: 401, body: { error: "unauthenticated" } });
  assert.ok(!calls.some((c) => c[0] === "retrieve"), "no Stripe call before the token is verified");
  const ok = await checkoutSession({ token: "tok-parent", query: q }, d);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.familyId, FAMILY);
  assert.equal(calls.filter((c) => c[0] === "getUser").length, 2, "one verification per request (no second getUser)");
  assert.equal((await checkoutSession({ token: "tok-admin", query: q }, d)).status, 404, "foreign session still 404");
});

beforeEach(() => {
  for (const k of Object.keys(process.env)) if (k.startsWith("RATE_LIMIT_")) delete process.env[k];
  rl.setRateLimitRpc(rl.memoryRateLimitRpc());
});

test("M1 session route: limited per IP before anything else (also with billing off), per user after auth", async () => {
  process.env.RATE_LIMIT_BILLING_SESSION_IP = "2";
  delete process.env.STRIPE_ENABLED;
  const route = await import("../app/api/billing/session/route.ts");
  const req = () => new Request(`https://wendapply.test/api/billing/session?id=${SESSION}`, { headers: { "x-nf-client-connection-ip": "198.51.100.7" } });
  assert.equal((await route.GET(req())).status, 503);
  assert.equal((await route.GET(req())).status, 503);
  const res = await route.GET(req());
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, "rate_limited");
  const { routeLimit } = await import("../lib/api-rate-limit.ts");
  assert.ok(routeLimit("billing-session").user, "per-user limit configured");
  const src = (await import("node:fs")).readFileSync(new URL("../app/api/billing/session/route.ts", import.meta.url), "utf8");
  assert.match(src, /withUserLimit\(deps\.auth, "billing-session"\)/);
});

// ---------------------------------------------------------------- M2
test("M2 invoice checkout: owner + price based idempotency key, stable for 10 minutes", async () => {
  const { deps: d, calls } = deps();
  const body = { plan: "starter", schoolId: SCHOOL, payment: "invoice" };
  assert.equal((await checkout({ token: "tok-admin", body }, d)).status, 200);
  assert.equal((await checkout({ token: "tok-admin", body }, d)).status, 200);
  const keys = calls.filter((c) => c[0] === "invoice").map((c) => c[1].idempotencyKey);
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1], "double click = same key → Stripe creates ONE subscription");
  assert.match(keys[0], new RegExp(`^wendapply-invoice-sub-school-${SCHOOL}-wendapply_starter_yearly_chf-\\d+$`));
  const t = 1_800_000_000_000;
  assert.equal(invoiceIdempotencyKey({ kind: "school", id: SCHOOL }, "k", t), invoiceIdempotencyKey({ kind: "school", id: SCHOOL }, "k", t + 1000));
  assert.notEqual(invoiceIdempotencyKey({ kind: "school", id: SCHOOL }, "k", t), invoiceIdempotencyKey({ kind: "school", id: SCHOOL }, "other", t), "other plan = other key");
  assert.notEqual(invoiceIdempotencyKey({ kind: "school", id: SCHOOL }, "k", t), invoiceIdempotencyKey({ kind: "school", id: OLD_PARENT }, "k", t));
});

test("M2 Stripe wiring: the key is sent to subscriptions.create; a replayed request does not e-mail the invoice again", async () => {
  const log = [];
  let invoiceStatus = "draft";
  const fake = {
    subscriptions: { async create(params, opts) { log.push(["create", opts?.idempotencyKey ?? null]); return { id: "sub_1", latest_invoice: "in_1" }; } },
    invoices: {
      async retrieve() { return { id: "in_1", status: invoiceStatus, hosted_invoice_url: "https://invoice.stripe.test/i" }; },
      async finalizeInvoice() { log.push(["finalize"]); invoiceStatus = "open"; return { id: "in_1", status: "open", hosted_invoice_url: "https://invoice.stripe.test/i" }; },
      async sendInvoice() { log.push(["send"]); return { id: "in_1", status: "open", hosted_invoice_url: "https://invoice.stripe.test/i" }; },
    },
  };
  const s = apiStripe(fake);
  const p = { customer: "cus_1", price: "price_1", daysUntilDue: 30, metadata: {}, idempotencyKey: "k1" };
  assert.equal((await s.createInvoiceSubscription(p)).hostedInvoiceUrl, "https://invoice.stripe.test/i");
  assert.equal((await s.createInvoiceSubscription(p)).hostedInvoiceUrl, "https://invoice.stripe.test/i", "replay still returns the link");
  assert.deepEqual(log, [["create", "k1"], ["finalize"], ["send"], ["create", "k1"]]);
});

// ---------------------------------------------------------------- M3
test("M3 pickFamilyCustomer: own first, then a still-active co-parent's, never a departed / deleted parent's", () => {
  const rows = [
    { stripe_customer_id: "cus_deleted", created_by: null },
    { stripe_customer_id: "cus_old", created_by: OLD_PARENT },
    { stripe_customer_id: "cus_mine", created_by: PARENT.id },
  ];
  assert.equal(pickFamilyCustomer(rows, PARENT.id, [PARENT.id]), "cus_mine");
  assert.equal(pickFamilyCustomer(rows.slice(0, 2), PARENT.id, [PARENT.id]), null, "creator left the family");
  assert.equal(pickFamilyCustomer(rows.slice(0, 2), PARENT.id, [PARENT.id, OLD_PARENT]), "cus_old", "co-parent still active");
  assert.equal(pickFamilyCustomer([{ stripe_customer_id: "cus_deleted", created_by: null }], PARENT.id, [PARENT.id]), null);
});

test("M3 supabaseApiDb.findCustomerId: families filtered by creator, schools unchanged", async () => {
  const tables = {
    billing_customers: [
      { stripe_customer_id: "cus_old", created_by: OLD_PARENT, family_id: FAMILY, school_id: null },
      { stripe_customer_id: "cus_school", created_by: ADMIN.id, family_id: null, school_id: SCHOOL },
    ],
    family_members: [{ user_id: PARENT.id, family_id: FAMILY, role: "parent", status: "active" }],
  };
  const admin = {
    from(table) {
      const filters = [];
      const q = {
        select() { return q; },
        eq(col, v) { filters.push([col, v]); return q; },
        order() { return q; },
        limit() { return q; },
        then(res) { res({ data: tables[table].filter((r) => filters.every(([c, v]) => r[c] === v)), error: null }); },
      };
      return q;
    },
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://x.supabase.test";
  const db = supabaseApiDb(admin);
  assert.equal(await db.findCustomerId({ kind: "family", id: FAMILY }, PARENT.id), null, "new parent never gets the former parent's customer");
  tables.family_members.push({ user_id: OLD_PARENT, family_id: FAMILY, role: "parent", status: "active" });
  assert.equal(await db.findCustomerId({ kind: "family", id: FAMILY }, PARENT.id), "cus_old", "co-parent still in the family");
  assert.equal(await db.findCustomerId({ kind: "family", id: FAMILY }, OLD_PARENT), "cus_old");
  assert.equal(await db.findCustomerId({ kind: "school", id: SCHOOL }, "someone-else"), "cus_school", "all admins of a school share it");
});

test("M3 api: checkout and portal look the customer up for the calling user", async () => {
  const { deps: d, calls } = deps();
  await checkout({ token: "tok-parent", body: { plan: "family", familyId: FAMILY } }, d);
  assert.equal((await (await import("../lib/billing/api.ts")).portal({ token: "tok-parent", body: { familyId: FAMILY } }, d)).status, 404);
  const lookups = calls.filter((c) => c[0] === "findCustomerId");
  assert.deepEqual(lookups, [["findCustomerId", "family", PARENT.id], ["findCustomerId", "family", PARENT.id]]);
  assert.ok(!calls.some((c) => c[0] === "portal"), "no portal for someone else's customer");
});

// ---------------------------------------------------------------- L: flag off
test("L flag off: the pay page never loads Stripe.js on import and doesn't promise a booking", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("../components/billing/in-app-checkout.tsx", import.meta.url), "utf8");
  assert.match(src, /import \{ loadStripe \} from "@stripe\/stripe-js\/pure"/);
  assert.doesNotMatch(src, /import \{[^}]*loadStripe[^}]*\} from "@stripe\/stripe-js";/, "the default entry injects js.stripe.com as an import side effect");
  assert.match(src, /noch nicht freigeschaltet/);
});
