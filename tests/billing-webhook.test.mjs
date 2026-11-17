// Stripe webhook logic (lib/billing/webhook.ts) without network: signature check with the real Stripe SDK and a
// test secret, every handled event type -> the expected billing_apply_subscription call, duplicates, unknown events,
// permanent vs transient DB errors, and an end-to-end run against the real SQL function on PGlite.
import assert from "node:assert/strict";
import { test, before } from "node:test";
import { readFileSync } from "node:fs";
import Stripe from "stripe";
import { processWebhook, handleStripeEvent, subscriptionParams, subscriptionIdOfInvoice, planOfSubscription, HANDLED_EVENTS } from "../lib/billing/webhook.ts";
import { verifyStripeEvent, STRIPE_API_VERSION } from "../lib/billing/stripe.ts";
import { createMemoryBillingDb } from "../lib/billing/memory-db.ts";
import { setupTeacherDb } from "./helpers/teacher-db.mjs";

const SECRET = "whsec_unit_test_only_not_a_real_secret";
const SCHOOL = "00000000-0000-4000-8000-000000002001";
const FAMILY = "00000000-0000-4000-8000-000000002002";
const USER = "00000000-0000-4000-8000-000000002003";
const NOW = Math.floor(Date.now() / 1000);

const sub = (over = {}) => ({
  id: "sub_test1", object: "subscription", customer: "cus_test1", status: "active", cancel_at_period_end: false,
  collection_method: "charge_automatically", latest_invoice: null,
  metadata: { app: "wendapply", plan_id: "starter", school_id: SCHOOL, user_id: USER },
  items: { data: [{ id: "si_1", price: { id: "price_1", lookup_key: "wendapply_starter_yearly_chf" }, current_period_start: NOW, current_period_end: NOW + 365 * 86400 }] },
  ...over,
});
let n = 0;
const event = (type, object, over = {}) => ({ id: `evt_Test${++n}`, object: "event", type, created: NOW + n, api_version: STRIPE_API_VERSION, data: { object }, ...over });

function deps({ subscriptions = {}, db = createMemoryBillingDb() } = {}) {
  const logs = [];
  return {
    db, logs,
    // Unknown ids answer like Stripe (404 resource_missing): subscription events then fall back to the payload snapshot.
    stripe: { async retrieveSubscription(id) { const s = subscriptions[id]; if (!s) throw Object.assign(new Error(`No such subscription: '${id}'`), { statusCode: 404, code: "resource_missing" }); return s; } },
    log: (m, x) => logs.push([m, x]),
  };
}
const signed = (payload, secret = SECRET) => Stripe.webhooks.generateTestHeaderString({ payload, secret });
const run = (evt, d, { secret = SECRET, header } = {}) => {
  const rawBody = JSON.stringify(evt);
  return processWebhook({ rawBody, signature: header === undefined ? signed(rawBody) : header, secret, verify: verifyStripeEvent }, d);
};

test("pinned API version matches the installed SDK default", async () => {
  const src = readFileSync(new URL("../node_modules/stripe/esm/apiVersion.js", import.meta.url), "utf8");
  assert.equal(STRIPE_API_VERSION, /ApiVersion = '([^']+)'/.exec(src)?.[1]);
});

test("signature: valid passes, invalid / wrong secret / missing / tampered body are 400, no secret is 503", async () => {
  const d = deps();
  const evt = event("customer.subscription.updated", sub());
  assert.equal((await run(evt, d)).status, 200);
  assert.deepEqual((await run(evt, d, { header: "t=1,v1=deadbeef" })).body, { error: "invalid_signature" });
  assert.equal((await run(event("customer.subscription.updated", sub()), d, { header: signed("{}", "whsec_other") })).status, 400);
  assert.deepEqual((await run(evt, d, { header: null })), { status: 400, body: { error: "missing_signature" } });
  const raw = JSON.stringify(evt);
  const header = signed(raw);
  const tampered = raw.replace('"active"', '"canceled"');
  assert.equal((await processWebhook({ rawBody: tampered, signature: header, secret: SECRET, verify: verifyStripeEvent }, d)).status, 400);
  assert.equal((await run(evt, d, { secret: "" })).status, 503);
  // only the first, valid call reached the DB
  assert.equal(d.db.state.calls.length, 1);
});

test("old signature timestamp (replay) is rejected", async () => {
  const d = deps();
  const raw = JSON.stringify(event("customer.subscription.updated", sub()));
  const header = Stripe.webhooks.generateTestHeaderString({ payload: raw, secret: SECRET, timestamp: NOW - 3600 });
  assert.equal((await processWebhook({ rawBody: raw, signature: header, secret: SECRET, verify: verifyStripeEvent }, d)).status, 400);
});

test("customer.subscription.created/updated/deleted -> full state to billing_apply_subscription", async () => {
  for (const [type, status] of [["customer.subscription.created", "active"], ["customer.subscription.updated", "past_due"], ["customer.subscription.deleted", "canceled"]]) {
    const d = deps();
    const evt = event(type, sub({ status, cancel_at_period_end: type.endsWith("updated") }));
    const res = await run(evt, d);
    assert.equal(res.status, 200, type);
    assert.equal(res.body.kind, "applied");
    const [call] = d.db.state.calls;
    assert.deepEqual(call, {
      p_stripe_customer_id: "cus_test1", p_stripe_subscription_id: "sub_test1", p_plan_id: "starter", p_status: status,
      p_current_period_start: new Date(NOW * 1000).toISOString(), p_current_period_end: new Date((NOW + 365 * 86400) * 1000).toISOString(),
      p_cancel_at_period_end: type.endsWith("updated"), p_collection_method: "charge_automatically", p_latest_invoice_status: null,
      p_school_id: SCHOOL, p_family_id: null, p_created_by: USER, p_student_limit: null,
      p_event_id: evt.id, p_event_type: type, p_event_created: new Date(evt.created * 1000).toISOString(),
    });
  }
});

test("checkout.session.completed retrieves the subscription and takes the owner from the session", async () => {
  const s = sub({ id: "sub_fam", metadata: {}, items: { data: [{ price: { lookup_key: "wendapply_family_yearly_chf" }, current_period_start: NOW, current_period_end: NOW + 1000 }] } });
  const d = deps({ subscriptions: { sub_fam: s } });
  const session = { id: "cs_1", object: "checkout.session", mode: "subscription", subscription: "sub_fam", client_reference_id: USER, metadata: { family_id: FAMILY, school_id: SCHOOL } };
  const res = await run(event("checkout.session.completed", session), d);
  assert.equal(res.body.kind, "applied");
  const [call] = d.db.state.calls;
  assert.equal(call.p_plan_id, "family");
  assert.equal(call.p_family_id, FAMILY);
  assert.equal(call.p_school_id, null, "family plans never get a school owner");
  assert.equal(call.p_created_by, USER);
  // payment-mode sessions are acknowledged and recorded, no DB apply
  const d2 = deps();
  const r2 = await run(event("checkout.session.completed", { id: "cs_2", mode: "payment", subscription: null, metadata: {} }), d2);
  assert.deepEqual([r2.status, r2.body.kind, d2.db.state.calls.length], [200, "ignored", 0]);
});

test("invoice.paid / invoice.payment_failed -> subscription retrieved, latest invoice status passed", async () => {
  for (const [type, invStatus, expected] of [["invoice.paid", "paid", "paid"], ["invoice.payment_failed", "open", "open"]]) {
    const d = deps({ subscriptions: { sub_inv: sub({ id: "sub_inv", collection_method: "send_invoice", status: type === "invoice.paid" ? "active" : "past_due" }) } });
    const invoice = { id: "in_1", object: "invoice", status: invStatus, parent: { type: "subscription_details", subscription_details: { subscription: "sub_inv", metadata: {} } } };
    const res = await run(event(type, invoice), d);
    assert.equal(res.body.kind, "applied", type);
    const [call] = d.db.state.calls;
    assert.equal(call.p_latest_invoice_status, expected);
    assert.equal(call.p_collection_method, "send_invoice");
    assert.equal(call.p_stripe_subscription_id, "sub_inv");
  }
  // one-off invoice without a subscription: ignored
  const d = deps();
  const r = await run(event("invoice.paid", { id: "in_2", status: "paid", parent: null }), d);
  assert.deepEqual([r.body.kind, r.body.reason, d.db.state.calls.length], ["ignored", "invoice_without_subscription", 0]);
});

test("duplicate event: second delivery is not applied again", async () => {
  const d = deps();
  const evt = event("customer.subscription.updated", sub());
  assert.equal((await run(evt, d)).body.kind, "applied");
  const again = await run(evt, d);
  assert.deepEqual([again.status, again.body.kind], [200, "duplicate"]);
  assert.equal(d.db.state.calls.length, 1);
});

test("ordering: every event applies the CURRENT subscription; older events are stale and never overwrite newer state", async () => {
  const current = sub({ status: "active", latest_invoice: { id: "in_o", object: "invoice", status: "paid" } });
  const d = deps({ subscriptions: { sub_test1: current } });
  // invoice.paid (fresh retrieve) is applied first ...
  const paid = event("invoice.paid", { id: "in_o", status: "paid", parent: { subscription_details: { subscription: "sub_test1" } } }, { created: NOW + 100 });
  assert.equal((await run(paid, d)).body.kind, "applied");
  assert.equal(d.db.state.calls.at(-1).p_event_created, new Date((NOW + 100) * 1000).toISOString());
  // ... then an OLDER subscription.updated (past_due snapshot from before the payment) arrives late: rejected, not applied.
  const older = event("customer.subscription.updated", sub({ status: "past_due" }), { created: NOW + 20 });
  const o = await run(older, d);
  assert.deepEqual([o.status, o.body.kind, o.body.reason], [200, "skipped", "stale_event"]);
  assert.equal(d.db.state.subscriptions.get("sub_test1").p_status, "active", "late past_due snapshot must not win");
  // A newer subscription.updated applies the retrieved state (not its payload), incl. the expanded invoice status.
  const newer = event("customer.subscription.updated", sub({ status: "past_due" }), { created: NOW + 200 });
  assert.equal((await run(newer, d)).body.kind, "applied");
  assert.deepEqual([d.db.state.calls.at(-1).p_status, d.db.state.calls.at(-1).p_latest_invoice_status], ["active", "paid"]);
  // Retrieval errors other than 404 are transient (500, Stripe retries); 404 falls back to the snapshot.
  const broken = deps({ subscriptions: {} });
  broken.stripe.retrieveSubscription = async () => { throw Object.assign(new Error("rate limited"), { statusCode: 429 }); };
  assert.equal((await run(event("customer.subscription.updated", sub()), broken)).status, 500);
});

test("canceled with ended_at before the period end (immediate cancel / refund) ends access at ended_at", () => {
  const ended = NOW + 5 * 86400;
  const p = subscriptionParams(sub({ status: "canceled", ended_at: ended }), { id: "evt_C1", type: "customer.subscription.deleted", created: NOW });
  assert.equal(p.p_current_period_end, new Date(ended * 1000).toISOString());
  // cancel at period end: ended_at == period end, unchanged
  const q = subscriptionParams(sub({ status: "canceled", ended_at: NOW + 365 * 86400 }), { id: "evt_C2", type: "customer.subscription.deleted", created: NOW });
  assert.equal(q.p_current_period_end, new Date((NOW + 365 * 86400) * 1000).toISOString());
  // ended_at is ignored for non-canceled states
  const r = subscriptionParams(sub({ status: "active", ended_at: ended }), { id: "evt_C3", type: "customer.subscription.updated", created: NOW });
  assert.equal(r.p_current_period_end, new Date((NOW + 365 * 86400) * 1000).toISOString());
});

test("unhandled event types and foreign subscriptions are acknowledged (200) and recorded", async () => {
  const d = deps();
  const r = await run(event("customer.created", { id: "cus_x" }), d);
  assert.deepEqual([r.status, r.body.kind], [200, "ignored"]);
  // a `stripe trigger` fixture: no lookup key, no plan metadata
  const foreign = sub({ metadata: {}, items: { data: [{ price: { lookup_key: null }, current_period_start: NOW, current_period_end: NOW + 10 }] } });
  const evt = event("customer.subscription.updated", foreign);
  const r2 = await run(evt, d);
  assert.deepEqual([r2.status, r2.body.kind, r2.body.reason], [200, "ignored", "unknown_plan"]);
  assert.equal(d.db.state.calls.length, 0);
  assert.equal(await d.db.isEventProcessed(evt.id), true);
  assert.equal(HANDLED_EVENTS.length, 6);
});

test("permanent DB errors -> 200 + recorded; transient errors -> 500 and the event stays unprocessed", async () => {
  const marked = [];
  const failing = (message) => ({
    async isEventProcessed() { return false; },
    async markEventProcessed(id) { marked.push(id); },
    async applySubscription() { throw new Error(message); },
  });
  const d1 = deps({ db: failing("BILLING_OWNER_REQUIRED") });
  const e1 = event("customer.subscription.updated", sub({ metadata: { plan_id: "starter" } }));
  const r1 = await run(e1, d1);
  assert.deepEqual([r1.status, r1.body.kind, r1.body.reason], [200, "skipped", "BILLING_OWNER_REQUIRED"]);
  assert.deepEqual(marked, [e1.id]);
  const d2 = deps({ db: failing("fetch failed") });
  const r2 = await run(event("customer.subscription.updated", sub()), d2);
  assert.deepEqual(r2, { status: 500, body: { error: "processing_failed" } });
  assert.equal(marked.length, 1);
  // Stripe retrieve failing (network) is transient too
  const d3 = deps();
  const r3 = await run(event("invoice.paid", { id: "in_9", status: "paid", parent: { subscription_details: { subscription: "sub_missing" } } }), d3);
  assert.equal(r3.status, 500);
});

test("portal cancel via cancel_at (API 2026-10-28) counts as cancel_at_period_end; a plain renewing sub does not", () => {
  const evt = { id: "evt_cancel_at", type: "customer.subscription.updated", created: NOW };
  const p = (over) => subscriptionParams(sub({ cancel_at: null, ...over }), evt).p_cancel_at_period_end;
  assert.equal(p({ cancel_at_period_end: false, cancel_at: NOW + 365 * 86400 }), true, "portal sets cancel_at only");
  assert.equal(p({ cancel_at_period_end: true }), true, "legacy flag still works");
  assert.equal(p({}), false, "renewing subscription");
  assert.equal(p({ status: "canceled", cancel_at: NOW }), false, "already ended: not 'canceling'");
});

test("mapping helpers: plan by lookup key beats metadata, individual student limit, legacy invoice.subscription", () => {
  assert.equal(planOfSubscription(sub({ metadata: { plan_id: "enterprise" } })), "starter");
  assert.equal(planOfSubscription(sub({ items: { data: [{ price: { lookup_key: "other" } }] }, metadata: { plan_id: "individual" } })), "individual");
  assert.equal(planOfSubscription(sub({ items: { data: [{ price: { lookup_key: "wendapply_family_monthly_chf" } }] }, metadata: {} })), "family", "monthly family price maps to the family plan");
  assert.equal(planOfSubscription(sub({ items: { data: [] }, metadata: { plan_id: "pilot" } })), null, "pilot is never paid");
  const p = subscriptionParams(sub({ items: { data: [] }, metadata: { plan_id: "individual", school_id: SCHOOL, student_limit: "450" } }), { id: "evt_x", type: "t", created: NOW });
  assert.equal(p.p_student_limit, 450);
  assert.equal(subscriptionIdOfInvoice({ subscription: "sub_legacy" }), "sub_legacy");
  assert.equal(subscriptionIdOfInvoice({ parent: { subscription_details: { subscription: { id: "sub_obj" } } } }), "sub_obj");
  const bad = subscriptionParams(sub({ metadata: { school_id: "not-a-uuid", plan_id: "starter" } }), { id: "e", type: "t", created: NOW });
  assert.equal(bad.p_school_id, null, "non-UUID owner metadata is dropped");
});

// ---------- end to end: webhook -> real billing_apply_subscription on PGlite ----------
let ctx, schoolId;
before(async () => {
  ctx = await setupTeacherDb({ seed: false });
  await ctx.admin("create role service_role");
  await ctx.apply("20261116200000_billing_stripe.sql");
  await ctx.apply("20261117100000_billing_hardening.sql");
  await ctx.admin(`insert into auth.users values ('${USER}','admin@webhook.ch','{"full_name":"Admin"}')`);
  schoolId = (await ctx.admin("select public.platform_create_school('Webhook Schule') as id"))[0].id;
});

/** BillingDb over PGlite, like lib/billing/server.ts does over supabase-js (service role = superuser, auth.uid() null). */
const pgliteDb = () => ({
  async isEventProcessed(id) { await ctx.as(null); return (await ctx.admin("select 1 from public.stripe_events where id=$1 and processed_at is not null", [id])).length > 0; },
  async markEventProcessed(id, type) { await ctx.as(null); await ctx.admin("insert into public.stripe_events (id, type, processed_at) values ($1,$2,now()) on conflict (id) do update set processed_at = now()", [id, type]); },
  async applySubscription(params) {
    await ctx.as(null);
    const names = Object.keys(params);
    try {
      return (await ctx.admin(`select public.billing_apply_subscription(${names.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`, Object.values(params)))[0].r;
    } catch (e) { throw new Error(e.message); }
  },
});

test("end to end on PGlite: checkout -> licence active, invoice failed, cancel, duplicate", async () => {
  const s = sub({ id: "sub_e2e", customer: "cus_e2e", metadata: { plan_id: "professional", school_id: schoolId, user_id: USER },
    items: { data: [{ price: { lookup_key: "wendapply_professional_yearly_chf" }, current_period_start: NOW, current_period_end: NOW + 365 * 86400 }] } });
  const d = deps({ subscriptions: { sub_e2e: s }, db: pgliteDb() });
  const session = { id: "cs_e2e", mode: "subscription", subscription: "sub_e2e", client_reference_id: USER, metadata: { school_id: schoolId, user_id: USER } };
  const first = event("checkout.session.completed", session);
  const firstRes = await run(first, d);
  assert.equal(firstRes.body.kind, "applied", JSON.stringify([firstRes, d.logs]));
  const lic = async () => (await ctx.admin("select package, status, source, student_limit from public.school_licences where stripe_subscription_id='sub_e2e'"))[0];
  assert.deepEqual(await lic(), { package: "professional", status: "active", source: "stripe", student_limit: 300 });
  assert.equal((await run(first, d)).body.kind, "duplicate");

  d.stripe = { async retrieveSubscription() { return { ...s, status: "past_due" }; } };
  const failed = await run(event("invoice.payment_failed", { id: "in_e2e", status: "open", parent: { subscription_details: { subscription: "sub_e2e" } } }), d);
  assert.equal(failed.body.kind, "applied");
  const row = (await ctx.admin("select status, latest_invoice_status from public.billing_subscriptions where stripe_subscription_id='sub_e2e'"))[0];
  assert.deepEqual(row, { status: "past_due", latest_invoice_status: "open" });
  assert.equal((await lic()).status, "active", "past_due keeps access during the grace period");

  d.stripe = { async retrieveSubscription() { return { ...s, status: "canceled" }; } };
  const del = await run(event("customer.subscription.deleted", { ...s, status: "canceled" }), d);
  assert.equal(del.body.kind, "applied");
  assert.equal((await ctx.admin("select status from public.billing_subscriptions where stripe_subscription_id='sub_e2e'"))[0].status, "canceled");
  const events = await ctx.admin("select count(*)::int as n from public.stripe_events where processed_at is not null");
  assert.equal(events[0].n, 3);
});

test("handleStripeEvent is usable without the HTTP wrapper", async () => {
  const d = deps();
  const out = await handleStripeEvent(event("customer.subscription.updated", sub()), d);
  assert.equal(out.kind, "applied");
});
