// In-app payment (Checkout Session ui_mode "elements" + Payment Element on /familie/bezahlen): API branch, session
// endpoint authorisation, client helpers, Appearance theme built from the app tokens, and source contracts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { checkout, checkoutSession, IN_APP_RETURN_PATH } from "../lib/billing/api.ts";
import { inAppPaymentEnabled, payPageHref, readPayParams, readReturnSession, payAmountText, paymentErrorMessage, familyPlan } from "../components/billing/logic.ts";
import { stripeAppearance, stripeFonts } from "../components/billing/stripe-appearance.ts";

const SCHOOL = "00000000-0000-4000-8000-000000003001";
const FAMILY = "00000000-0000-4000-8000-000000003002";
const OTHER_FAMILY = "00000000-0000-4000-8000-000000003008";
const PARENT = { id: "00000000-0000-4000-8000-000000003004", email: "parent@familie.ch" };
const ADMIN = { id: "00000000-0000-4000-8000-000000003003", email: "admin@schule.ch" };
const SESSION = "cs_test_a1B2c3D4e5F6g7H8i9";

function makeDeps(sessions = {}) {
  const calls = [];
  const tokens = { "tok-parent": PARENT, "tok-admin": ADMIN };
  return {
    calls,
    deps: {
      enabled: true, configured: true, liveMode: false, baseUrl: "https://wendapply.test",
      auth: {
        async getUser(t) { return tokens[t] ?? null; },
        async isSchoolAdmin(t, id) { return t === "tok-admin" && id === SCHOOL; },
        async isFamilyParent(t, id) { return t === "tok-parent" && id === FAMILY; },
      },
      stripe: {
        async priceIdForLookupKey(key) { return `price_for_${key}`; },
        async createCustomer() { return "cus_new"; },
        async createCheckoutSession(p) { calls.push(["hosted", p]); return { url: "https://checkout.stripe.test/c/pay/cs_1" }; },
        async createElementsSession(p) { calls.push(["elements", p]); return { clientSecret: `${SESSION}_secret_xyz` }; },
        async retrieveCheckoutSession(id) { calls.push(["retrieve", id]); return sessions[id] ?? null; },
        async createInvoiceSubscription() { throw new Error("not used"); },
        async createPortalSession() { throw new Error("not used"); },
      },
      db: { async findCustomerId() { return null; }, async hasOpenSubscription() { return false; }, async ownerName() { return "Familie Test"; }, async status() { return null; } },
    },
  };
}

test("checkout ui=elements (family, card): client secret, same metadata, return URL into the app", async () => {
  const { deps, calls } = makeDeps();
  const r = await checkout({ token: "tok-parent", body: { plan: "family", familyId: FAMILY, payment: "card", interval: "month", ui: "elements" } }, deps);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { clientSecret: `${SESSION}_secret_xyz` });
  const [kind, p] = calls[0];
  assert.equal(kind, "elements");
  assert.equal(p.price, "price_for_wendapply_family_monthly_chf");
  assert.deepEqual(p.metadata, { app: "wendapply", plan_id: "family", interval: "month", family_id: FAMILY, user_id: PARENT.id });
  assert.equal(p.returnUrl, `https://wendapply.test${IN_APP_RETURN_PATH}?session_id={CHECKOUT_SESSION_ID}`);
  assert.equal(IN_APP_RETURN_PATH, "/familie/bezahlen/fertig");
});

test("checkout ui: default hosted, unknown ui 400, elements refused for schools", async () => {
  const { deps, calls } = makeDeps();
  const hosted = await checkout({ token: "tok-parent", body: { plan: "family", familyId: FAMILY } }, deps);
  assert.ok(hosted.body.url, "hosted fallback still returns a URL");
  assert.equal(calls[0][0], "hosted");
  assert.deepEqual((await checkout({ token: "tok-parent", body: { plan: "family", familyId: FAMILY, ui: "iframe" } }, deps)).body, { error: "invalid_ui" });
  assert.deepEqual((await checkout({ token: "tok-admin", body: { plan: "starter", schoolId: SCHOOL, payment: "card", ui: "elements" } }, deps)).body, { error: "invalid_ui" });
  assert.equal((await checkout({ token: null, body: { plan: "family", familyId: FAMILY, ui: "elements" } }, deps)).status, 401);
});

test("session endpoint: owner only, never confirms foreign sessions, flag off 503", async () => {
  const meta = { app: "wendapply", plan_id: "family", interval: "year", family_id: FAMILY, user_id: PARENT.id };
  const { deps } = makeDeps({
    [SESSION]: { status: "complete", paymentStatus: "paid", metadata: meta },
    cs_test_otherFamily0001: { status: "complete", paymentStatus: "paid", metadata: { ...meta, family_id: OTHER_FAMILY } },
    cs_test_notWendapply001: { status: "complete", paymentStatus: "paid", metadata: { app: "else", family_id: FAMILY } },
  });
  const q = (id) => new URLSearchParams({ id });
  assert.deepEqual(await checkoutSession({ token: "tok-parent", query: q(SESSION) }, deps), { status: 200, body: { status: "complete", paymentStatus: "paid", plan: "family", interval: "year", familyId: FAMILY } });
  assert.equal((await checkoutSession({ token: null, query: q(SESSION) }, deps)).status, 401);
  assert.equal((await checkoutSession({ token: "tok-parent", query: q("cs_test_otherFamily0001") }, deps)).status, 404);
  assert.equal((await checkoutSession({ token: "tok-admin", query: q(SESSION) }, deps)).status, 404, "other roles get 404, not 403");
  assert.equal((await checkoutSession({ token: "tok-parent", query: q("cs_test_notWendapply001") }, deps)).status, 404);
  assert.equal((await checkoutSession({ token: "tok-parent", query: q("cs_test_unknown00000001") }, deps)).status, 404);
  for (const bad of ["", "pi_123", "cs_test_../x", "cs_live_short"]) assert.equal((await checkoutSession({ token: "tok-parent", query: q(bad) }, deps)).status, 400, bad);
  const off = makeDeps(); off.deps.enabled = false;
  assert.equal((await checkoutSession({ token: "tok-parent", query: q(SESSION) }, off.deps)).status, 503);
});

test("client helpers: flag needs ON + publishable key, hosted fallback flag, links and params", () => {
  assert.equal(inAppPaymentEnabled({ enabled: true, publishableKey: "pk_test_abc" }), true);
  assert.equal(inAppPaymentEnabled({ enabled: false, publishableKey: "pk_test_abc" }), false);
  assert.equal(inAppPaymentEnabled({ enabled: true, publishableKey: "" }), false);
  assert.equal(inAppPaymentEnabled({ enabled: true, publishableKey: "sk_test_abc" }), false, "never a secret key");
  assert.equal(inAppPaymentEnabled({ enabled: true, publishableKey: "pk_test_abc", ui: "hosted" }), false);
  assert.equal(payPageHref(FAMILY, "month"), `/familie/bezahlen?familie=${FAMILY}&interval=month`);
  assert.deepEqual(readPayParams(`?familie=${FAMILY}&interval=month`), { familyId: FAMILY, interval: "month" });
  assert.deepEqual(readPayParams("?familie=<script>&interval=x"), { familyId: null, interval: "year" });
  assert.equal(readReturnSession(`?session_id=${SESSION}`), SESSION);
  assert.equal(readReturnSession("?session_id=evil"), null);
  assert.equal(payAmountText(familyPlan(), "month"), "CHF 7.90");
  assert.equal(payAmountText(familyPlan(), "year"), "CHF 79.00");
});

test("payment errors are German, Swiss spelling, never raw Stripe text", () => {
  const msgs = [
    paymentErrorMessage({ code: "paymentFailed", declineCode: "generic_decline" }),
    paymentErrorMessage({ code: "paymentFailed", declineCode: "insufficient_funds" }),
    paymentErrorMessage({ code: "paymentFailed", declineCode: "authentication_required" }),
    paymentErrorMessage({ code: "paymentFailed", declineCode: null, message: "Your card was declined." }),
    paymentErrorMessage(null),
  ];
  for (const m of msgs) { assert.ok(!/declined|card was/i.test(m), m); assert.ok(!m.includes("ß"), m); }
  assert.match(msgs[0], /abgelehnt/);
});

test("Appearance: app tokens (fonts, colours, radius, ink contour, hard offset shadow) in light and dark", () => {
  const light = { "--brand": "#385cfc", "--ink": "#16140f", "--field-bg": "#ffffff", "--field-border": "#16140f", "--outline": "#16140f", "--shadow-ink": "#16140f", "--sun": "#ffd23f", "--border-w": "1.5px", "--radius-lg": "10px" };
  const a = stripeAppearance((n) => light[n] ?? "");
  assert.match(a.variables.fontFamily, /Instrument Sans/);
  assert.equal(a.variables.colorPrimary, "#385cfc");
  assert.equal(a.variables.borderRadius, "10px");
  assert.equal(a.rules[".Input"].border, "1.5px solid #16140f");
  assert.equal(a.rules[".Input:focus"].boxShadow, "3px 3px 0 #385cfc");
  assert.equal(a.rules[".Tab"].boxShadow, "2px 2px 0 #16140f");
  assert.equal(a.rules[".Tab--selected"].backgroundColor, "#ffd23f");
  for (const v of [...Object.values(a.variables), ...Object.values(a.rules).flatMap((r) => Object.values(r))]) assert.ok(!String(v).includes("var("), `resolved value: ${v}`);
  const dark = stripeAppearance((n) => ({ "--field-bg": "#1b1a14", "--ink": "#f6f0e3", "--field-border": "#8f8877" })[n] ?? "");
  assert.equal(dark.variables.colorBackground, "#1b1a14");
  assert.equal(dark.rules[".Input"].border, "1.5px solid #8f8877");
  assert.equal(stripeFonts("https://x.test")[0].src, 'url(https://x.test/fonts/instrument-sans-latin.woff2) format("woff2")');
});

test("source contracts: pages, publishable key only, hosted fallback kept, font CORS", () => {
  const page = readFileSync(new URL("../components/billing/in-app-checkout.tsx", import.meta.url), "utf8");
  assert.match(page, /initCheckoutElementsSdk/);
  assert.match(page, /NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/);
  assert.ok(!/STRIPE_SECRET_KEY|sk_(test|live)_/.test(page), "no secret key in client code");
  assert.match(page, /confirm\(\{ redirect: "if_required" \}\)/, "3DS in the modal, redirects only when needed; no returnUrl (would hang, the session has it)");
  assert.ok(!page.includes("ß"));
  const card = readFileSync(new URL("../components/billing/billing-card.tsx", import.meta.url), "utf8");
  assert.match(card, /inAppPaymentEnabled\(\)/);
  assert.match(card, /startCheckout\(owner, plan, payment, interval\)/, "hosted checkout stays as fallback");
  assert.match(readFileSync(new URL("../next.config.ts", import.meta.url), "utf8"), /\/fonts\/:file\*/);
  readFileSync(new URL("../app/familie/bezahlen/page.tsx", import.meta.url));
  readFileSync(new URL("../app/familie/bezahlen/fertig/page.tsx", import.meta.url));
  readFileSync(new URL("../app/api/billing/session/route.ts", import.meta.url));
  readFileSync(new URL("../public/fonts/instrument-sans-latin.woff2", import.meta.url));
});
