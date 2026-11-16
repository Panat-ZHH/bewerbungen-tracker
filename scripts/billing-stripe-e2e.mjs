// End-to-end billing run against the Stripe SANDBOX (test mode only) – no Supabase involved.
// Drives the real API logic (lib/billing/api.ts) + the real Stripe adapter (lib/billing/stripe.ts) with a fake auth
// (always "admin/parent") and an in-memory customer store, pays the hosted Checkout page with test card 4242 in a
// real browser, and checks that the webhook (dev server with BILLING_DB=memory + `stripe listen`) applied the events.
//
// Prereqs (see docs/billing/README.md):
//   .env.local with a TEST key (sk_test_… or CLI token + STRIPE_ACCOUNT_ID) and STRIPE_WEBHOOK_SECRET from `stripe listen --print-secret`
//   STRIPE_ENABLED=true NEXT_PUBLIC_STRIPE_ENABLED=true BILLING_DB=memory npx next dev -p 3100
//   stripe listen --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed --forward-to localhost:3100/api/stripe/webhook
//   PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome binary> DEV_LOG=<dev server log> node --experimental-strip-types scripts/billing-stripe-e2e.mjs
// Never prints keys. Refuses to run with a live key.
import { readFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
if (/^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? "")) throw new Error("Live key detected – this script is test mode only.");

const { checkout, portal } = await import("../lib/billing/api.ts");
const { apiStripe, getStripe } = await import("../lib/billing/stripe.ts");

const BASE = process.env.BASE || "http://localhost:3100";
const DEV_LOG = process.env.DEV_LOG || "/tmp/stripe-merge-dev.log";
const SHOTS = join(ROOT, "docs/billing/screenshots");
mkdirSync(SHOTS, { recursive: true });
const stripe = getStripe();
// The CLI's OAuth token has no sk_test_ prefix, so ask Stripe itself: abort unless the account answers in test mode.
if ((await stripe.balance.retrieve()).livemode !== false) throw new Error("Stripe answered in LIVE mode – aborting (test mode only).");
const results = [];
const ok = (name, pass, detail = "") => { results.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  – ${detail}` : ""}`); };

const customers = new Map();
function deps() {
  return {
    enabled: true, configured: true, liveMode: false, baseUrl: BASE,
    auth: { getUser: async () => ({ id: "00000000-0000-4000-8000-0000000e2e01", email: "e2e-billing@example.com" }), isSchoolAdmin: async () => true, isFamilyParent: async () => true },
    stripe: {
      ...apiStripe(stripe),
      async createCustomer(p) {
        const id = await apiStripe(stripe).createCustomer({ ...p, metadata: { ...p.metadata, test: "stripe-merge-e2e" } });
        customers.set(p.metadata.school_id ?? p.metadata.family_id, id);
        return id;
      },
    },
    db: {
      findCustomerId: async (o) => customers.get(o.id) ?? null,
      hasOpenSubscription: async () => false,
      ownerName: async (o) => (o.kind === "school" ? "E2E Testschule" : "E2E Testfamilie"),
      status: async () => null,
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForLog(pattern, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const lines = readFileSync(DEV_LOG, "utf8").split("\n").filter((l) => l.includes("stripe webhook") && pattern.test(l));
    if (lines.length) return lines;
    await sleep(1000);
  }
  return [];
}

const { chromium } = await import(process.env.PLAYWRIGHT);
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true });

async function payCheckout(url, label) {
  const page = await browser.newPage({ locale: "de-CH", viewport: { width: 1200, height: 1000 } });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  // Checkout shows payment methods as radio rows (Karte / Klarna …) – pick "Karte" so the card fields appear.
  await page.waitForSelector("#cardNumber, #payment-method-accordion-item-title-card, [data-testid=card-accordion-item]", { timeout: 60_000 });
  if (!(await page.locator("#cardNumber").isVisible().catch(() => false))) {
    const radio = page.locator("#payment-method-accordion-item-title-card, [data-testid=card-accordion-item] input[type=radio]").first();
    if (await radio.count()) await radio.check({ force: true }).catch(() => radio.click({ force: true }));
    else await page.getByText("Karte", { exact: true }).first().click();
    await page.waitForSelector("#cardNumber", { state: "visible", timeout: 30_000 });
  }
  const email = page.locator("#email");
  if (await email.isVisible().catch(() => false) && await email.isEditable().catch(() => false) && !(await email.inputValue())) await email.fill("e2e-billing@example.com");
  await page.fill("#cardNumber", "4242 4242 4242 4242");
  await page.fill("#cardExpiry", "12 / 34");
  await page.fill("#cardCvc", "123");
  await page.fill("#billingName", "E2E Test");
  const country = page.locator("#billingCountry");
  if (await country.count()) await country.selectOption("CH").catch(() => {});
  for (const [sel, val] of [["#billingAddressLine1", "Teststrasse 1"], ["#billingPostalCode", "8000"], ["#billingLocality", "Zürich"]]) {
    const f = page.locator(sel);
    if (await f.count() && await f.isVisible()) await f.fill(val);
  }
  // Link "save my info" would ask for a phone number – make sure it is off.
  const link = page.locator("#enableStripePass");
  if (await link.count() && await link.isChecked().catch(() => false)) await link.uncheck().catch(() => {});
  await page.screenshot({ path: join(SHOTS, `stripe-checkout-${label}.png`) });
  await page.locator(".SubmitButton, button[type=submit]").first().click();
  await page.waitForURL((u) => u.toString().startsWith(BASE), { timeout: 90_000 }).catch(() => {});
  const final = page.url();
  if (!final.startsWith(BASE)) await page.screenshot({ path: join(SHOTS, `stripe-checkout-${label}-stuck.png`) });
  await page.close();
  return final;
}

try {
  // 1) School, card (Starter) – Checkout with 4242
  const school = randomUUID();
  const r1 = await checkout({ token: "t", body: { plan: "starter", schoolId: school, payment: "card" } }, deps());
  ok("school card: API returns Checkout URL", r1.status === 200 && /^https:\/\/checkout\.stripe\.com\//.test(String(r1.body.url)), `status ${r1.status}`);
  if (r1.status === 200) {
    const back = await payCheckout(r1.body.url, "school-starter");
    ok("school card: 4242 paid, redirected to /schul-admin?billing=success", back.includes("/schul-admin?billing=success"), back.replace(/session_id=[^&]+/, "session_id=…"));
    const subs = await stripe.subscriptions.list({ customer: customers.get(school), limit: 1 });
    const sub = subs.data[0];
    ok("school card: Stripe subscription active, metadata plan/school", sub?.status === "active" && sub.metadata.plan_id === "starter" && sub.metadata.school_id === school, `${sub?.id} ${sub?.status}`);
    const lines = sub ? await waitForLog(new RegExp(`${sub.id}.*applied|applied.*${sub.id}`)) : [];
    const types = new Set(lines.map((l) => /"type":"([^"]+)"/.exec(l)?.[1]));
    ok("school card: webhook applied (checkout.session.completed + subscription)", types.has("checkout.session.completed") || types.has("customer.subscription.created"), [...types].join(", "));
    const lic = lines.some((l) => /"licenceStatus":"active"/.test(l));
    ok("school card: licence active", lic);

    // 4) Portal for that school
    const p = await portal({ token: "t", body: { schoolId: school } }, deps());
    ok("portal: URL for the school customer", p.status === 200 && /^https:\/\/billing\.stripe\.com\//.test(String(p.body.url)), `status ${p.status}`);
  }

  // 2) School, invoice (Professional) – send_invoice, 30 days, then paid out of band
  const school2 = randomUUID();
  const r2 = await checkout({ token: "t", body: { plan: "professional", schoolId: school2, payment: "invoice" } }, deps());
  ok("school invoice: hosted invoice URL", r2.status === 200 && r2.body.invoice === true && /^https:\/\/invoice\.stripe\.com\//.test(String(r2.body.url)), `status ${r2.status}`);
  const sub2 = (await stripe.subscriptions.list({ customer: customers.get(school2), limit: 1 })).data[0];
  const inv = sub2 && (await stripe.invoices.retrieve(typeof sub2.latest_invoice === "string" ? sub2.latest_invoice : sub2.latest_invoice.id));
  const dueDays = inv?.due_date ? Math.round((inv.due_date - inv.created) / 86400) : null;
  ok("school invoice: send_invoice, open, due in 30 days, CHF 1490", sub2?.collection_method === "send_invoice" && inv?.status === "open" && dueDays === 30 && inv.amount_due === 149000 && inv.currency === "chf", `${inv?.status} due ${dueDays}d amount ${inv?.amount_due}`);
  ok("school invoice: webhook applied subscription.created (licence active)", (await waitForLog(new RegExp(`customer.subscription.created.*applied.*${sub2?.id}.*"licenceStatus":"active"`))).length > 0);
  if (inv) {
    await stripe.invoices.pay(inv.id, { paid_out_of_band: true });
    ok("school invoice: paid (out of band) → invoice.paid applied", (await waitForLog(new RegExp(`invoice.paid.*applied.*${sub2.id}|invoice.paid.*${sub2.id}.*applied`))).length > 0);
  }

  // 3) Family, card, monthly CHF 7.90 (yearly CHF 79 checked below)
  const family = randomUUID();
  const r3 = await checkout({ token: "t", body: { plan: "family", familyId: family, payment: "card", interval: "month" } }, deps());
  ok("family card: API returns Checkout URL", r3.status === 200 && /^https:\/\/checkout\.stripe\.com\//.test(String(r3.body.url)), `status ${r3.status}`);
  const r3b = await checkout({ token: "t", body: { plan: "family", familyId: family, payment: "invoice" } }, deps());
  ok("family invoice refused (card only)", r3b.status === 400 && r3b.body.error === "invoice_not_allowed");
  if (r3.status === 200) {
    const back = await payCheckout(r3.body.url, "family");
    ok("family card: 4242 paid, redirected to /familie?billing=success", back.includes("/familie?billing=success"), back.replace(/session_id=[^&]+/, "session_id=…"));
    const sub3 = (await stripe.subscriptions.list({ customer: customers.get(family), limit: 1 })).data[0];
    ok("family card: subscription active with family_id", sub3?.status === "active" && sub3.metadata.family_id === family, `${sub3?.id} ${sub3?.status}`);
    const p3 = sub3?.items.data[0]?.price;
    ok("family card: monthly price CHF 7.90", p3?.unit_amount === 790 && p3?.recurring?.interval === "month" && p3?.lookup_key === "wendapply_family_monthly_chf", `${p3?.unit_amount} ${p3?.recurring?.interval}`);
    ok("family card: webhook applied", (await waitForLog(new RegExp(`${sub3?.id}.*applied|applied.*${sub3?.id}`))).length > 0);
  }

  // Family yearly: Checkout session uses the CHF 79 price
  const r5 = await checkout({ token: "t", body: { plan: "family", familyId: randomUUID(), payment: "card", interval: "year" } }, deps());
  ok("family yearly: API returns Checkout URL", r5.status === 200 && /^https:\/\/checkout\.stripe\.com\//.test(String(r5.body.url)), `status ${r5.status}`);
  const [yearly] = (await stripe.prices.list({ lookup_keys: ["wendapply_family_yearly_chf"] })).data;
  ok("family yearly price is CHF 79 per year", yearly?.unit_amount === 7900 && yearly?.recurring?.interval === "year", `${yearly?.unit_amount}`);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
