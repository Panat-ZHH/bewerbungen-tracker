// Unit + source-contract tests for the billing UI (components/billing, /preise, /schul-admin "Abo & Rechnung", /familie plan card)
// in BOTH flag states. Browser flows + screenshots: scripts/billing-ui-e2e.mjs.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { PLANS, formatChf } from "../lib/billing/plans.ts";
import {
  FREE_NOTICE, PAYMENT_LABEL, RETURN_MESSAGE, onlinePaymentEnabled, schoolPlans, familyPlan, isPurchasable, paymentOptions,
  priceText, seatsText, buyHref, readBillingStatus, hasSubscription, billingStatusLabel, billingHint, billingErrorMessage,
  readBillingReturn, stripBillingParams, checkoutBody, ownerQuery, intervalPriceText, savingText, termText, billingIntervals,
} from "../components/billing/logic.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const BILLING_FILES = readdirSync(new URL("../components/billing/", import.meta.url)).map((f) => `components/billing/${f}`);
const PARENT_FILES = ["components/family/plan-card.tsx", "components/family/parent-view.tsx", "components/family/parent-start.tsx", "components/family/family-stepper.tsx", "components/family/parent-steps.ts", "components/family/family-view.tsx", "app/familien/page.tsx"];
const SCHOOL = "11111111-1111-4111-8111-111111111111";
const FAMILY = "22222222-2222-4222-8222-222222222222";

function withFlag(value, fn) {
  const before = process.env.NEXT_PUBLIC_STRIPE_ENABLED;
  if (value === undefined) delete process.env.NEXT_PUBLIC_STRIPE_ENABLED; else process.env.NEXT_PUBLIC_STRIPE_ENABLED = value;
  try { return fn(); } finally { if (before === undefined) delete process.env.NEXT_PUBLIC_STRIPE_ENABLED; else process.env.NEXT_PUBLIC_STRIPE_ENABLED = before; }
}

test("flag: off by default and for anything but 'true'", () => {
  for (const v of [undefined, "", "false", "1", "TRUE", "yes"]) assert.equal(withFlag(v, onlinePaymentEnabled), false, String(v));
  assert.equal(withFlag("true", onlinePaymentEnabled), true);
});

test("honest copy while off; no VAT wording anywhere (not MWST-registered, decided 2026-11-16)", () => {
  assert.equal(FREE_NOTICE, "Neue Konten testen WendApply 7 Tage gratis. Die Online-Bezahlung ist gerade nicht verfügbar, schreib uns über die Kontaktseite.");
  for (const f of [...BILLING_FILES, ...PARENT_FILES, "app/preise/page.tsx", "app/familien/page.tsx", "app/hilfe/page.tsx", "components/public/marketing.ts", "lib/family-copy.ts"]) {
    assert.doesNotMatch(read(f), /MWST|MwSt|VAT_NOTE|vatNote/, f);
  }
});

test("plans and prices come from lib/billing/plans.ts", () => {
  assert.deepEqual(schoolPlans().map((p) => p.id), ["starter", "professional", "enterprise"]);
  for (const p of schoolPlans()) assert.equal(priceText(p), `${formatChf(PLANS[p.id].priceChfPerYear)} pro Jahr`);
  assert.equal(priceText(PLANS.professional), "CHF 1'490 pro Jahr");
  assert.equal(priceText(PLANS.individual), "Preis auf Anfrage");
  assert.equal(priceText(PLANS.pilot), "Kostenlos");
  assert.equal(familyPlan(), PLANS.family);
  assert.equal(seatsText(PLANS.family), "1 Schüleraccount + 1 Elternaccount");
  // family: CHF 7.90 per month or CHF 79 per year, no VAT (decided 2026-11-16)
  assert.equal(priceText(PLANS.family), "CHF 7.90 pro Monat oder CHF 79 pro Jahr");
  assert.equal(intervalPriceText(PLANS.family, "month"), "CHF 7.90 pro Monat");
  assert.equal(intervalPriceText(PLANS.family, "year"), "CHF 79 pro Jahr");
  assert.equal(savingText(PLANS.family), "CHF 15.80 günstiger als 12 Monatszahlungen");
  assert.equal(savingText(PLANS.starter), null);
  assert.deepEqual(billingIntervals(PLANS.family), ["year", "month"]);
  assert.match(termText("month"), /Monatsabo/);
  assert.match(termText("year"), /Jahresabo/);
  assert.equal(seatsText(PLANS.starter), `bis ${PLANS.starter.studentLimit} Schülerinnen und Schüler`);
  // no hard-coded CHF amounts in the billing components / pages (all through formatChf / PLANS)
  for (const f of [...BILLING_FILES, ...PARENT_FILES]) assert.doesNotMatch(read(f), /CHF\s?\d/, f);
});

test("payment: schools card or invoice, families card only", () => {
  assert.deepEqual(paymentOptions(PLANS.starter), ["card", "invoice"]);
  assert.deepEqual(paymentOptions(PLANS.family), ["card"]);
  assert.deepEqual(paymentOptions({ ...PLANS.starter, invoiceAllowed: false }), ["card"]);
  assert.match(PAYMENT_LABEL.invoice.text, /30 Tagen/);
  assert.deepEqual(checkoutBody({ kind: "school", id: SCHOOL }, "starter", "invoice"), { plan: "starter", schoolId: SCHOOL, payment: "invoice", interval: "year" });
  assert.deepEqual(checkoutBody({ kind: "family", id: FAMILY }, "family", "invoice"), { plan: "family", familyId: FAMILY, payment: "card", interval: "year" }, "families never invoice");
  assert.deepEqual(checkoutBody({ kind: "family", id: FAMILY }, "family", "card", "month"), { plan: "family", familyId: FAMILY, payment: "card", interval: "month" });
  assert.equal(ownerQuery({ kind: "school", id: SCHOOL }), `schoolId=${SCHOOL}`);
  assert.equal(ownerQuery({ kind: "family", id: FAMILY }), `familyId=${FAMILY}`);
});

test("purchasable plans and /preise links", () => {
  assert.equal(isPurchasable("starter", "school"), true);
  assert.equal(isPurchasable("family", "school"), false);
  assert.equal(isPurchasable("family", "family"), true);
  for (const id of ["pilot", "individual", "x", null, "__proto__"]) assert.equal(isPurchasable(id, "school"), false, String(id));
  assert.equal(buyHref("professional"), "/schul-admin?plan=professional#abo");
  assert.equal(buyHref("family"), "/familie?plan=family#abo");
  assert.equal(buyHref("family", "month"), "/familie?plan=family&interval=month#abo");
  assert.equal(buyHref("family", "year"), "/familie?plan=family&interval=year#abo");
  assert.equal(buyHref("starter", "month"), "/schul-admin?plan=starter#abo", "schools: no monthly price");
  // integration acc-backend × acc-ui: the Einzelabo is bought by the student on /abo, never on /schul-admin
  assert.equal(buyHref("solo"), "/abo");
  assert.equal(buyHref("solo", "month"), "/abo?interval=month");
});

test("status payload: tolerant normaliser, labels, hints", () => {
  assert.equal(readBillingStatus(null), null);
  assert.equal(readBillingStatus([]), null);
  const s = readBillingStatus({ enabled: true, plan: "professional", status: "active", studentLimit: 300, validUntil: "2027-11-16", cancelAtPeriodEnd: false, source: "stripe", subscriptionStatus: "active", collectionMethod: "send_invoice", latestInvoiceStatus: "open" });
  assert.equal(s.plan, "professional");
  assert.equal(hasSubscription(s), true);
  assert.deepEqual(billingStatusLabel(s), { label: "Aktiv", tone: "success" });
  assert.match(billingHint(s), /Rechnung ist offen/);
  assert.equal(readBillingStatus({ plan: "gold", studentLimit: "9" }).plan, null);
  const none = readBillingStatus({ enabled: true, plan: null, status: null, source: null });
  assert.equal(hasSubscription(none), false);
  assert.deepEqual(billingStatusLabel(none), { label: "Kein Abo", tone: "neutral" });
  assert.equal(hasSubscription(readBillingStatus({ source: "pilot", status: "pilot" })), false, "a pilot licence is not a subscription");
  assert.equal(hasSubscription(readBillingStatus({ subscriptionStatus: "canceled" })), false);
  assert.match(billingHint(readBillingStatus({ cancelAtPeriodEnd: true })), /gekündigt/);
  assert.equal(billingStatusLabel(readBillingStatus({ subscriptionStatus: "past_due" })).tone, "warning");
});

test("API errors: 503/404 (flag off on the server or route missing) get a friendly text, no raw codes", () => {
  const off = billingErrorMessage(503, "billing_disabled");
  assert.match(off, /noch nicht freigeschaltet/);
  assert.equal(billingErrorMessage(404, null), off, "missing route = same friendly text");
  assert.match(billingErrorMessage(503, "price_not_found"), /Kontaktseite/);
  assert.match(billingErrorMessage(409, "already_subscribed"), /Abo verwalten/);
  assert.match(billingErrorMessage(403, "forbidden"), /Schuladministration/);
  assert.match(billingErrorMessage(401, "unauthenticated"), /neu an/);
  assert.match(billingErrorMessage(0), /Internetverbindung/);
  for (const [st, code] of [[500, "boom"], [502, "checkout_failed"], [400, "invalid_plan"], [404, "no_customer"]]) assert.doesNotMatch(billingErrorMessage(st, code), /_/, `${st} ${code}`);
});

test("return pages: ?billing=success|cancel", () => {
  assert.equal(readBillingReturn("?billing=success&session_id=cs_test_1"), "success");
  assert.equal(readBillingReturn("?billing=cancel"), "cancel");
  assert.equal(readBillingReturn("?billing=evil"), null);
  assert.equal(readBillingReturn(""), null);
  assert.equal(stripBillingParams("?billing=success&session_id=cs_1&plan=starter"), "?plan=starter");
  assert.equal(stripBillingParams("?billing=cancel"), "");
  assert.match(RETURN_MESSAGE.success.title, /Danke/);
  assert.match(RETURN_MESSAGE.cancel.text, /nichts belastet/);
});

// ------------------------------------------------------------ source contracts (both flag states are rendered from the same source)
test("/preise: flag off keeps offer + Zugang-anfragen flows and the honest note; flag on adds online buttons", () => {
  const p = read("app/preise/page.tsx");
  assert.match(p, /const online = onlinePaymentEnabled\(\)/);
  assert.match(p, /FREE_NOTICE/);
  assert.match(p, /Offerte anfragen/, "offer button stays in both states");
  assert.match(p, /online\s*\?\s*<div[\s\S]*?<ButtonLink href=\{buyHref\("family", "year"\)\} variant="sun"[\s\S]*?<ButtonLink href=\{buyHref\("family", "month"\)\} variant="secondary"[\s\S]*?:\s*<ButtonLink href="\/familien#warteliste"/, "family: yearly (primary) + monthly buy when on, Zugang anfragen when off");
  assert.match(p, /\{online && <ButtonLink href=\{buyHref\(p\.id\)\}/, "school online button only when on");
  assert.match(p, /pro Jahr<\/span>/);
  assert.doesNotMatch(p, /Mehrwertsteuer dazukommt/);
});

test("/schul-admin: 'Abo & Rechnung' per school; contact flow when off", () => {
  const a = read("components/b2b/school-admin.tsx");
  assert.match(a, /<BillingCard schoolId=\{school\.id\} anchor=\{first\} \/>/);
  const c = read("components/billing/billing-card.tsx");
  assert.match(c, /Abo &amp; Rechnung/);
  assert.match(c, /!enabled \? \(\s*<BillingOffNotice>[\s\S]*?href="\/kontakt"/, "off: honest note + contact, no buy button");
  assert.match(c, /id=\{anchor \? "abo" : undefined\}/);
  assert.match(c, /<BillingReturnNotice onSuccess=\{reload\} \/>/);
  assert.match(c, /Abo verwalten/);
});

test("/familie plan card: Zugang anfragen when off; phase-driven card for parents and neutral line for children when on", () => {
  const pc = read("components/family/plan-card.tsx");
  assert.match(pc, /if \(online && isParent && billing && familyId\)/, "parents: card follows the billing phase");
  assert.match(pc, /<FamilyPlanBody familyId=\{familyId\} billing=\{billing\} current=\{current\} open=\{open\} \/>/);
  assert.match(pc, /if \(online && !isParent\)[\s\S]*?FAMILY_COPY\.child\.planActive : FAMILY_COPY\.child\.planNone/, "children: no prices, no payment problems (S8)");
  assert.match(pc, /Zugang anfragen/);
  assert.match(pc, /\{FREE_NOTICE\}/);
  assert.match(pc, /\{!online && <RequestAccessModal/, "the waitlist modal only exists while off");
  assert.doesNotMatch(pc, /BillingReturnNotice/, "the family return notice lives at the top of the page, not in the card");
  const pv = read("components/family/parent-view.tsx");
  assert.match(pv, /useFamilyBilling\(family\.id, online, onChanged\)/);
  assert.match(pv, /<FamilyReturnNotice billing=\{billing\} \/>/);
  assert.match(pv, /<BillingBanner phase=\{phase\} onFix=\{fixPayment\} \/>/);
  assert.match(pv, /familyId=\{family\.id\} isParent/);
  assert.doesNotMatch(read("components/family/child-view.tsx"), /isParent/, "children never get the buy button");
  const c = read("components/billing/billing-card.tsx");
  assert.match(c, /export function FamilyBilling[\s\S]*?if \(!enabled\) return null;/);
  assert.match(c, /if \(!isParent\) return/);
  assert.match(c, /CHECKOUT_PENDING_KEY = "wa_checkout_pending"/, "sessionStorage guard against a second purchase");
  assert.match(c, /POLL_MS = 2000/);
  assert.match(c, /POLL_TRIES = 15/);
  assert.match(c, /if \(billing\.activationPending\)[\s\S]*?data-billing-state=\{billing\.ret === "slow" \? "activation-slow" : "activating"\}/, "no buy button while activating");
});

test("API usage follows the contract; payment code stays in components/billing", () => {
  const api = read("components/billing/api.ts");
  assert.match(api, /\/api\/billing\/status\?/);
  assert.match(api, /"\/api\/billing\/checkout", \{ method: "POST"/);
  assert.match(api, /"\/api\/billing\/portal", \{ method: "POST"/);
  assert.match(api, /authorization: `Bearer \$\{token\}`/);
  assert.doesNotMatch(api, /sk_(test|live)|whsec_|service_role/i);
  for (const f of [...BILLING_FILES, ...PARENT_FILES, "lib/family-copy.ts"]) { const s = read(f); assert.ok(!s.includes("ß"), `${f}: Swiss spelling`); assert.doesNotMatch(s, /\bprice_[A-Za-z0-9]{8,}/, `${f}: no hard-coded price IDs`); }
});
