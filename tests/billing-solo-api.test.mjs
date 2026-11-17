// Solo plan ("Einzelabo") – billing API + webhook without network (lib/billing/api.ts, auth.ts, webhook.ts, memory-db.ts):
// catalogue entry, checkout role checks (students only), 409s (own solo / family / school), owner = caller, metadata,
// lookup keys, in-app (elements) return URL, portal + status + session for the owner only, webhook lookup-key mapping to
// billing_apply_user_subscription, owner_type rules, and the unchanged signature check. DB side: billing-solo-db.test.mjs.
import assert from "node:assert/strict";
import { test } from "node:test";
import Stripe from "stripe";
import { checkout, portal, status, checkoutSession, purchasablePlan, portalReturnUrl, userStatusBody, SOLO_RETURN_PATH } from "../lib/billing/api.ts";
import { wantsOwnBilling, authorizeOwner } from "../lib/billing/auth.ts";
import { PLANS, planByLookupKey, lookupKeyFor, planIntervals, priceMatchesCatalogue, yearlySavingChf, formatChf } from "../lib/billing/plans.ts";
import { processWebhook, handleStripeEvent, subscriptionParams, userSubscriptionParams, planOfSubscription } from "../lib/billing/webhook.ts";
import { verifyStripeEvent, STRIPE_API_VERSION } from "../lib/billing/stripe.ts";
import { createMemoryBillingDb } from "../lib/billing/memory-db.ts";

const STUDENT = { id: "00000000-0000-4000-8000-000000005001", email: "anna@schueler.ch" };
const PARENT = { id: "00000000-0000-4000-8000-000000005002", email: "mama@familie.ch" };
const TEACHER = { id: "00000000-0000-4000-8000-000000005003", email: "lehrer@schule.ch" };
const OTHER = { id: "00000000-0000-4000-8000-000000005004", email: "ben@schueler.ch" };
const FAMILY = "00000000-0000-4000-8000-000000005010";
const SCHOOL = "00000000-0000-4000-8000-000000005011";

function makeDeps(over = {}) {
  const calls = [];
  const tokens = { "tok-student": STUDENT, "tok-parent": PARENT, "tok-teacher": TEACHER, "tok-other": OTHER };
  const roles = { [STUDENT.id]: "student", [OTHER.id]: "student", [PARENT.id]: "parent", [TEACHER.id]: "staff" };
  const deps = {
    enabled: true, configured: true, liveMode: false, baseUrl: "https://wendapply.test",
    auth: {
      async getUser(t) { return tokens[t] ?? null; },
      async isSchoolAdmin() { return false; },
      async isFamilyParent(t, id) { return t === "tok-parent" && id === FAMILY; },
    },
    stripe: {
      async priceIdForLookupKey(key) { calls.push(["price", key]); return `price_for_${key}`; },
      async createCustomer(p) { calls.push(["customer", p]); return "cus_solo_new"; },
      async hasOpenStripeSubscription(c) { calls.push(["stripeOpen", c]); return false; },
      async expireOpenCheckoutSessions(c) { calls.push(["expire", c]); return 0; },
      async createCheckoutSession(p) { calls.push(["checkout", p]); return { url: "https://checkout.stripe.test/c/pay/cs_solo" }; },
      async createElementsSession(p) { calls.push(["elements", p]); return { clientSecret: "cs_solo_secret_x" }; },
      async retrieveCheckoutSession(id) { calls.push(["session", id]); return this.sessions?.[id] ?? null; },
      async createInvoiceSubscription(p) { calls.push(["invoice", p]); return { subscriptionId: "sub_x", hostedInvoiceUrl: null }; },
      async createPortalSession(p) { calls.push(["portal", p]); return { url: "https://billing.stripe.test/p/solo" }; },
    },
    db: {
      customers: {}, covered: {}, saved: [],
      async findCustomerId(o, userId) { calls.push(["findCustomer", o, userId]); return o.kind === "user" && o.id === userId ? this.customers[o.id] ?? null : null; },
      async saveCustomer(o, c, u) { this.saved.push([o, c, u]); },
      async hasOpenSubscription(o) { calls.push(["hasOpen", o]); return false; },
      async ownerName(o) { return o.kind === "user" ? null : "Familie Test"; },
      async status() { throw new Error("org status must not be used for owner=me"); },
      async userStatus(userId, token) { calls.push(["userStatus", userId, token]); return this.userStatusRow?.(userId) ?? null; },
      async soloEligibility(userId) {
        calls.push(["eligibility", userId]);
        return { role: roles[userId] ?? "staff", account_type: roles[userId] === "student" ? "independent_student" : null, blocked: Boolean(this.blocked?.[userId]), covered_by: this.covered[userId] ?? null };
      },
    },
    ...over,
  };
  return { deps, calls };
}

// ---------------------------------------------------------------- catalogue
test("catalogue: solo = Einzelabo, kind individual, CHF 4.90 / month or CHF 49 / year, 1 student, card only; school 'individual' untouched", () => {
  const s = PLANS.solo;
  assert.equal(s.id, "solo");
  assert.equal(s.kind, "individual");
  assert.equal(s.name, "Einzelabo");
  assert.equal(s.priceChfPerMonth, 4.9);
  assert.equal(s.priceChfPerYear, 49);
  assert.equal(s.studentLimit, 1);
  assert.equal(s.checkout, true);
  assert.equal(s.invoiceAllowed, false);
  assert.equal(s.placeholder, undefined);
  assert.equal(lookupKeyFor(s, "month"), "wendapply_solo_monthly_chf");
  assert.equal(lookupKeyFor(s, "year"), "wendapply_solo_yearly_chf");
  assert.deepEqual(planIntervals(s), ["year", "month"]);
  assert.equal(planByLookupKey("wendapply_solo_monthly_chf")?.id, "solo");
  assert.equal(planByLookupKey("wendapply_solo_yearly_chf")?.id, "solo");
  assert.equal(formatChf(s.priceChfPerMonth), "CHF 4.90");
  assert.equal(yearlySavingChf(s), 9.8);
  assert.ok(purchasablePlan("solo"));
  // The school offer "Individuell" is unchanged (contact sales, no Stripe price).
  assert.deepEqual([PLANS.individual.kind, PLANS.individual.name, PLANS.individual.lookupKey, PLANS.individual.checkout], ["school", "Individuell", null, false]);
  // Price integrity: Stripe price must be exactly 490 / 4900 Rappen CHF, recurring month / year.
  const price = (o) => ({ active: true, currency: "chf", type: "recurring", ...o });
  assert.equal(priceMatchesCatalogue(price({ unit_amount: 490, recurring: { interval: "month", interval_count: 1 } }), "wendapply_solo_monthly_chf"), true);
  assert.equal(priceMatchesCatalogue(price({ unit_amount: 4900, recurring: { interval: "year", interval_count: 1 } }), "wendapply_solo_yearly_chf"), true);
  assert.equal(priceMatchesCatalogue(price({ unit_amount: 790, recurring: { interval: "month", interval_count: 1 } }), "wendapply_solo_monthly_chf"), false);
  assert.equal(priceMatchesCatalogue(price({ unit_amount: 490, recurring: { interval: "year", interval_count: 1 } }), "wendapply_solo_monthly_chf"), false);
});

test("family plan data carries no 30-day family trial any more", () => {
  const f = PLANS.family;
  assert.equal(f.pilotDays, undefined);
  assert.equal("trialDays" in f, false);
});

// ---------------------------------------------------------------- checkout
test("solo checkout: student, monthly → hosted session, customer per user, owner_type=user metadata, /abo return URLs", async () => {
  const { deps, calls } = makeDeps();
  const r = await checkout({ token: "tok-student", body: { plan: "solo", interval: "month" } }, deps);
  assert.deepEqual(r, { status: 200, body: { url: "https://checkout.stripe.test/c/pay/cs_solo" } });
  assert.deepEqual(calls.find((c) => c[0] === "price"), ["price", "wendapply_solo_monthly_chf"]);
  assert.deepEqual(calls.find((c) => c[0] === "eligibility"), ["eligibility", STUDENT.id]);
  const customer = calls.find((c) => c[0] === "customer")[1];
  assert.equal(customer.email, STUDENT.email);
  assert.equal(customer.name, null);
  assert.deepEqual(customer.metadata, { app: "wendapply", owner_type: "user", user_id: STUDENT.id });
  assert.equal(customer.idempotencyKey, `wendapply-customer-user-${STUDENT.id}-${STUDENT.id}-${Math.floor(Date.now() / 600_000)}`);
  assert.deepEqual(deps.db.saved, [[{ kind: "user", id: STUDENT.id }, "cus_solo_new", STUDENT.id]]);
  const s = calls.find((c) => c[0] === "checkout")[1];
  assert.equal(s.customer, "cus_solo_new");
  assert.equal(s.price, "price_for_wendapply_solo_monthly_chf");
  assert.equal(s.kind, "individual");
  assert.deepEqual(s.metadata, { app: "wendapply", plan_id: "solo", interval: "month", owner_type: "user", user_id: STUDENT.id });
  assert.equal(s.successUrl, `https://wendapply.test${SOLO_RETURN_PATH}?billing=success&session_id={CHECKOUT_SESSION_ID}`);
  assert.equal(s.cancelUrl, "https://wendapply.test/abo?billing=cancel");
  assert.ok(calls.some((c) => c[0] === "stripeOpen" && c[1] === "cus_solo_new"), "Stripe is asked too (webhook lag)");
  assert.equal(calls.some((c) => c[0] === "hasOpen"), false, "solo uses the eligibility function, not the org check");
});

test("solo checkout: yearly default, existing own customer reused, owner:'me' accepted", async () => {
  const { deps, calls } = makeDeps();
  deps.db.customers[STUDENT.id] = "cus_solo_old";
  const r = await checkout({ token: "tok-student", body: { plan: "solo", owner: "me" } }, deps);
  assert.equal(r.status, 200);
  assert.deepEqual(calls.find((c) => c[0] === "price"), ["price", "wendapply_solo_yearly_chf"]);
  assert.equal(calls.filter((c) => c[0] === "customer").length, 0);
  assert.equal(calls.find((c) => c[0] === "checkout")[1].customer, "cus_solo_old");
  assert.equal(calls.find((c) => c[0] === "checkout")[1].metadata.interval, "year");
});

test("solo checkout: in-app payment (elements) returns to /abo", async () => {
  const { deps, calls } = makeDeps();
  const r = await checkout({ token: "tok-student", body: { plan: "solo", interval: "year", ui: "elements" } }, deps);
  assert.deepEqual(r, { status: 200, body: { clientSecret: "cs_solo_secret_x" } });
  const e = calls.find((c) => c[0] === "elements")[1];
  assert.equal(e.returnUrl, "https://wendapply.test/abo?billing=success&session_id={CHECKOUT_SESSION_ID}");
  assert.equal(e.metadata.owner_type, "user");
});

test("solo checkout: only students – parent 403 solo_parent_use_family, teacher 403 solo_students_only; no Stripe call", async () => {
  const { deps, calls } = makeDeps();
  assert.deepEqual(await checkout({ token: "tok-parent", body: { plan: "solo", interval: "month" } }, deps), { status: 403, body: { error: "solo_parent_use_family" } });
  assert.deepEqual(await checkout({ token: "tok-teacher", body: { plan: "solo", interval: "month" } }, deps), { status: 403, body: { error: "solo_students_only" } });
  assert.equal(calls.filter((c) => ["price", "customer", "checkout", "elements"].includes(c[0])).length, 0);
});

test("solo checkout: blocked account → 403 account_blocked (G11), portal still opens to cancel", async () => {
  const { deps, calls } = makeDeps();
  deps.db.blocked = { [STUDENT.id]: true };
  deps.db.customers[STUDENT.id] = "cus_solo_own";
  assert.deepEqual(await checkout({ token: "tok-student", body: { plan: "solo", interval: "month" } }, deps), { status: 403, body: { error: "account_blocked" } });
  assert.equal(calls.filter((c) => ["price", "customer", "checkout"].includes(c[0])).length, 0);
  assert.equal((await portal({ token: "tok-student", body: { owner: "me" } }, deps)).status, 200);
});

test("solo checkout: 409 already_subscribed with coveredBy solo / family / school", async () => {
  for (const cov of ["solo", "family", "school"]) {
    const { deps, calls } = makeDeps();
    deps.db.covered[STUDENT.id] = cov;
    assert.deepEqual(await checkout({ token: "tok-student", body: { plan: "solo", interval: "month" } }, deps), { status: 409, body: { error: "already_subscribed", coveredBy: cov } });
    assert.equal(calls.filter((c) => ["price", "customer", "checkout"].includes(c[0])).length, 0, cov);
  }
  // Paid seconds ago, webhook not mirrored yet: Stripe says the customer already has an open subscription.
  const { deps } = makeDeps();
  deps.db.customers[STUDENT.id] = "cus_solo_old";
  deps.stripe.hasOpenStripeSubscription = async () => true;
  assert.deepEqual(await checkout({ token: "tok-student", body: { plan: "solo" } }, deps), { status: 409, body: { error: "already_subscribed" } });
});

test("solo checkout: validation – no foreign owner, no invoice, interval, auth", async () => {
  const { deps, calls } = makeDeps();
  const t = "tok-student";
  assert.equal((await checkout({ token: t, body: { plan: "solo", familyId: FAMILY } }, deps)).body.error, "invalid_owner");
  assert.equal((await checkout({ token: t, body: { plan: "solo", schoolId: SCHOOL } }, deps)).body.error, "invalid_owner");
  assert.equal((await checkout({ token: t, body: { plan: "solo", owner: OTHER.id } }, deps)).body.error, "invalid_owner");
  assert.equal((await checkout({ token: t, body: { plan: "solo", payment: "invoice" } }, deps)).body.error, "invoice_not_allowed");
  assert.equal((await checkout({ token: t, body: { plan: "solo", interval: "week" } }, deps)).body.error, "invalid_interval");
  assert.deepEqual(await checkout({ token: null, body: { plan: "solo" } }, deps), { status: 401, body: { error: "unauthenticated" } });
  assert.deepEqual(await checkout({ token: "tok-bad", body: { plan: "solo" } }, deps), { status: 401, body: { error: "unauthenticated" } });
  assert.equal(calls.length, 0, "nothing reaches the DB or Stripe before validation + auth pass");
  // A family / school body can never buy solo, and solo cannot be bought for a family.
  assert.equal((await checkout({ token: "tok-parent", body: { plan: "family", owner: "me" } }, deps)).body.error, "invalid_owner");
  // Flag off / not configured
  assert.equal((await checkout({ token: t, body: { plan: "solo" } }, makeDeps({ enabled: false }).deps)).status, 503);
  assert.equal((await checkout({ token: t, body: { plan: "solo" } }, makeDeps({ configured: false }).deps)).body.error, "billing_not_configured");
});

// ---------------------------------------------------------------- portal / status / session
test("portal owner=me: only the caller's own customer; none → 404; return to /abo?billing=portal", async () => {
  const { deps, calls } = makeDeps();
  deps.db.customers[STUDENT.id] = "cus_solo_own";
  deps.db.customers[OTHER.id] = "cus_solo_other";
  const r = await portal({ token: "tok-student", body: { owner: "me" } }, deps);
  assert.deepEqual(r, { status: 200, body: { url: "https://billing.stripe.test/p/solo" } });
  assert.deepEqual(calls.find((c) => c[0] === "portal")[1], { customer: "cus_solo_own", returnUrl: "https://wendapply.test/abo?billing=portal" });
  assert.equal(portalReturnUrl("https://x.test", { kind: "user", id: STUDENT.id }), "https://x.test/abo?billing=portal");
  assert.deepEqual(await portal({ token: "tok-parent", body: { owner: "me" } }, deps), { status: 404, body: { error: "no_customer" } });
  assert.deepEqual(await portal({ token: null, body: { owner: "me" } }, deps), { status: 401, body: { error: "unauthenticated" } });
  // `owner: "me"` together with a familyId is not "me": the family path with its parent check applies.
  assert.equal(wantsOwnBilling({ owner: "me", familyId: FAMILY }), false);
  assert.equal(wantsOwnBilling({ owner: "me" }), true);
  assert.equal(wantsOwnBilling({ owner: "you" }), false);
  // authorizeOwner for a user owner: only that user.
  assert.equal((await authorizeOwner("tok-other", { kind: "user", id: STUDENT.id }, deps.auth)).ok, false);
  assert.equal((await authorizeOwner("tok-student", { kind: "user", id: STUDENT.id }, deps.auth)).ok, true);
});

test("status owner=me: caller's solo status mapped, with the caller's token; none → nulls; 401 without token", async () => {
  const { deps, calls } = makeDeps();
  deps.db.userStatusRow = (uid) => ({
    user_id: uid, plan: "solo", state: "active", subscription_status: "active", interval: "month", current_period_end: "2026-12-17T10:00:00.000Z",
    valid_until: "2026-12-17", grace_until: null, cancel_at_period_end: true, collection_method: "charge_automatically", latest_invoice_status: "paid", has_customer: true,
  });
  const r = await status({ token: "tok-student", query: new URLSearchParams({ owner: "me" }) }, deps);
  assert.deepEqual(r, { status: 200, body: {
    enabled: true, owner: "me", plan: "solo", status: "active", interval: "month", studentLimit: 1, validUntil: "2026-12-17", graceUntil: null,
    cancelAtPeriodEnd: true, source: "stripe", subscriptionStatus: "active", collectionMethod: "charge_automatically", latestInvoiceStatus: "paid",
    currentPeriodEnd: "2026-12-17T10:00:00.000Z", hasCustomer: true, studentsUsed: null,
  } });
  assert.deepEqual(calls.find((c) => c[0] === "userStatus"), ["userStatus", STUDENT.id, "tok-student"]);
  assert.equal(userStatusBody(null).plan, null);
  assert.equal(userStatusBody(null).hasCustomer, false);
  assert.equal(userStatusBody(null).studentLimit, null);
  assert.equal((await status({ token: null, query: new URLSearchParams({ owner: "me" }) }, deps)).status, 401);
  assert.equal((await status({ token: "tok-student", query: new URLSearchParams({ owner: "me" }) }, makeDeps({ enabled: false }).deps)).status, 503);
});

test("checkout session (in-app return): solo session readable by its buyer only", async () => {
  const { deps } = makeDeps();
  const id = "cs_test_SoloSession0001";
  deps.stripe.sessions = { [id]: { status: "complete", paymentStatus: "paid", metadata: { app: "wendapply", plan_id: "solo", interval: "month", owner_type: "user", user_id: STUDENT.id } } };
  const q = new URLSearchParams({ id });
  assert.deepEqual(await checkoutSession({ token: "tok-student", query: q }, deps), { status: 200, body: { status: "complete", paymentStatus: "paid", plan: "solo", interval: "month", owner: "me" } });
  assert.deepEqual(await checkoutSession({ token: "tok-other", query: q }, deps), { status: 404, body: { error: "session_not_found" } });
  assert.deepEqual(await checkoutSession({ token: "tok-parent", query: q }, deps), { status: 404, body: { error: "session_not_found" } });
});

// ---------------------------------------------------------------- webhook
const SECRET = "whsec_unit_test_only_not_a_real_secret";
const NOW = Math.floor(Date.now() / 1000);
const soloSub = (over = {}) => ({
  id: "sub_Solo1", object: "subscription", customer: "cus_Solo1", status: "active", cancel_at_period_end: false,
  collection_method: "charge_automatically", latest_invoice: null,
  metadata: { app: "wendapply", plan_id: "solo", interval: "month", owner_type: "user", user_id: STUDENT.id },
  items: { data: [{ id: "si_s", price: { id: "price_s", lookup_key: "wendapply_solo_monthly_chf" }, current_period_start: NOW, current_period_end: NOW + 30 * 86400 }] },
  ...over,
});
let n = 0;
const event = (type, object) => ({ id: `evt_Solo${++n}`, object: "event", type, created: NOW + n, api_version: STRIPE_API_VERSION, data: { object } });
function hookDeps({ subscriptions = {}, db = createMemoryBillingDb() } = {}) {
  const logs = [];
  return {
    db, logs, log: (m, x) => logs.push([m, x]),
    stripe: { async retrieveSubscription(id) { const s = subscriptions[id]; if (!s) throw Object.assign(new Error("missing"), { statusCode: 404 }); return s; } },
  };
}
const signed = (payload) => Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
const run = (evt, d, header) => {
  const rawBody = JSON.stringify(evt);
  return processWebhook({ rawBody, signature: header === undefined ? signed(rawBody) : header, secret: SECRET, verify: verifyStripeEvent }, d);
};

test("webhook: solo lookup keys (month + year) map to billing_apply_user_subscription with the owner from metadata", async () => {
  for (const key of ["wendapply_solo_monthly_chf", "wendapply_solo_yearly_chf"]) {
    const s = soloSub({ items: { data: [{ id: "si", price: { id: "p", lookup_key: key }, current_period_start: NOW, current_period_end: NOW + 86400 }] }, metadata: { app: "wendapply", owner_type: "user", user_id: STUDENT.id } });
    assert.equal(planOfSubscription(s), "solo", key);
  }
  const d = hookDeps({ subscriptions: { sub_Solo1: soloSub() } });
  const r = await run(event("customer.subscription.created", soloSub()), d);
  assert.equal(r.status, 200);
  assert.equal(r.body.kind, "applied");
  assert.equal(r.body.licenceStatus, null, "no licence row for solo");
  assert.equal(d.db.state.calls.length, 0, "never billing_apply_subscription");
  const p = d.db.state.userCalls[0];
  assert.equal(p.p_plan_id, "solo");
  assert.equal(p.p_user_id, STUDENT.id);
  assert.equal(p.p_stripe_customer_id, "cus_Solo1");
  assert.equal(p.p_status, "active");
  assert.equal("p_school_id" in p || "p_family_id" in p, false);
  assert.equal(p.p_current_period_end, new Date((NOW + 30 * 86400) * 1000).toISOString());
});

test("webhook: checkout.session.completed hint carries owner_type; duplicate and stale events", async () => {
  const s = soloSub({ metadata: { app: "wendapply", plan_id: "solo" } }); // subscription without owner metadata
  const d = hookDeps({ subscriptions: { sub_Solo1: s } });
  const session = { id: "cs_test_x", object: "checkout.session", mode: "subscription", subscription: "sub_Solo1", client_reference_id: STUDENT.id, metadata: { app: "wendapply", plan_id: "solo", owner_type: "user", user_id: STUDENT.id } };
  const evt = event("checkout.session.completed", session);
  assert.equal((await run(evt, d)).body.kind, "applied");
  assert.equal(d.db.state.userCalls[0].p_user_id, STUDENT.id);
  assert.equal((await run(evt, d)).body.kind, "duplicate");
  // Later events without owner metadata still apply (the customer is known).
  const later = event("customer.subscription.updated", soloSub({ status: "past_due", metadata: {} }));
  d.stripe.retrieveSubscription = async () => soloSub({ status: "past_due", metadata: {} });
  assert.equal((await run(later, d)).body.kind, "applied");
  assert.equal(d.db.state.userSubscriptions.get("sub_Solo1").p_status, "past_due");
  // An older event arriving late is skipped.
  const old = { ...event("customer.subscription.updated", soloSub({ status: "canceled" })), created: NOW - 1000 };
  d.stripe.retrieveSubscription = async () => soloSub({ status: "canceled" });
  const r = await run(old, d);
  assert.equal(r.body.kind, "skipped");
  assert.equal(r.body.reason, "stale_event");
});

test("webhook: user_id alone (buyer of a school/family plan) never makes a subscription personal; mismatches are acknowledged", async () => {
  // Solo price, metadata user_id but no owner_type → p_user_id null → unknown customer → BILLING_OWNER_REQUIRED (permanent, 200 skipped)
  const s = soloSub({ metadata: { app: "wendapply", user_id: STUDENT.id } });
  assert.equal(userSubscriptionParams(s, { id: "evt_a", type: "x", created: NOW }).p_user_id, null);
  const d = hookDeps({ subscriptions: { sub_Solo1: s } });
  const r = await run(event("customer.subscription.created", s), d);
  assert.equal(r.status, 200);
  assert.equal(r.body.kind, "skipped");
  assert.equal(r.body.reason, "BILLING_OWNER_REQUIRED");
  // Solo price on a family subscription (Dashboard switch): ignored, never re-owned.
  const fam = soloSub({ metadata: { app: "wendapply", family_id: FAMILY, user_id: PARENT.id } });
  assert.deepEqual(userSubscriptionParams(fam, { id: "evt_b", type: "x", created: NOW }), { error: "plan_owner_mismatch" });
  const d2 = hookDeps({ subscriptions: { sub_Solo1: fam } });
  const r2 = await run(event("customer.subscription.updated", fam), d2);
  assert.deepEqual([r2.status, r2.body.kind, r2.body.reason], [200, "ignored", "plan_owner_mismatch"]);
  // Family price on a personal subscription: the org writer is not called either.
  const moved = soloSub({ items: { data: [{ id: "si", price: { id: "p", lookup_key: "wendapply_family_yearly_chf" }, current_period_start: NOW, current_period_end: NOW + 86400 }] } });
  assert.deepEqual(subscriptionParams(moved, { id: "evt_c", type: "x", created: NOW }), { error: "plan_owner_mismatch" });
  // A school / family subscription is still mapped by subscriptionParams (solo goes elsewhere).
  assert.deepEqual(subscriptionParams(soloSub(), { id: "evt_d", type: "x", created: NOW }), { error: "solo_plan" });
  // Owner mismatch from the DB (customer belongs to someone else) is permanent → 200 skipped.
  const d3 = hookDeps({ subscriptions: { sub_Solo1: soloSub() } });
  d3.db.applyUserSubscription = async () => { throw new Error("BILLING_OWNER_MISMATCH"); };
  const r3 = await run(event("customer.subscription.updated", soloSub()), d3);
  assert.deepEqual([r3.status, r3.body.reason], [200, "BILLING_OWNER_MISMATCH"]);
  // Transient DB failure → 500 (Stripe retries).
  const d4 = hookDeps({ subscriptions: { sub_Solo1: soloSub() } });
  d4.db.applyUserSubscription = async () => { throw new Error("connection reset"); };
  assert.equal((await run(event("customer.subscription.updated", soloSub()), d4)).status, 500);
});

test("webhook: signature check unchanged for solo events (bad / missing signature → 400, nothing applied)", async () => {
  const d = hookDeps({ subscriptions: { sub_Solo1: soloSub() } });
  const evt = event("customer.subscription.created", soloSub());
  assert.deepEqual((await run(evt, d, "t=1,v1=deadbeef")).body, { error: "invalid_signature" });
  assert.deepEqual((await run(evt, d, null)), { status: 400, body: { error: "missing_signature" } });
  const raw = JSON.stringify(evt);
  const tampered = raw.replace(STUDENT.id, OTHER.id);
  assert.equal((await processWebhook({ rawBody: tampered, signature: signed(raw), secret: SECRET, verify: verifyStripeEvent }, d)).status, 400);
  assert.equal(d.db.state.userCalls?.length ?? 0, 0);
  // handled directly (already verified) it applies
  assert.equal((await handleStripeEvent(evt, d)).kind, "applied");
});
