// In-app payment E2E (local): real Stripe test-mode Checkout Sessions (ui_mode "elements") rendered in /familie/bezahlen,
// paid in headless Chrome with test cards. Supabase is the in-memory stub; /api/billing/* is mocked in the browser and
// backed by the Stripe CLI (test mode, sandbox), so no app secrets are needed. Covers: button → pay page, interval switch,
// look (screenshots light/dark, desktop/mobile), 4242 success → return page → active plan, declined card, 3DS challenge.
//
//   PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> STRIPE_PK_FILE=<file with pk_test_…> node scripts/billing-inapp-e2e.mjs
//   BASE=http://localhost:3400 … reuses a running dev server (started with the same env as below).
import { execFile, spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { installStub, newCtx as stubCtx } from "./ux-v2-stub.mjs";

// Stripe runs an invisible hCaptcha on confirm(); the "HeadlessChrome" user agent / automation flag gets a challenge that
// never resolves. A normal Chrome fingerprint passes like a real visitor (test mode only).
async function launch() {
  const { chromium } = await import(process.env.PLAYWRIGHT);
  return chromium.launch({ executablePath: process.env.CHROME, headless: process.env.HEADED ? false : true, args: ["--disable-blink-features=AutomationControlled"] });
}
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const newCtx = (browser, opts) => stubCtx(browser, { userAgent: UA, ...opts });

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = (process.env.OUT || join(ROOT, "docs/billing/screenshots/in-app")).replace(/\/?$/, "/");
mkdirSync(OUT, { recursive: true });
const SUPA = "http://localhost:54321";
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
const PK = readFileSync(process.env.STRIPE_PK_FILE, "utf8").trim();
if (!/^pk_test_/.test(PK)) throw new Error("test publishable key required");
const FAMILY_ID = "22222222-2222-4222-8222-222222222222";
const day = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

const results = []; const problems = [];
const want = (name) => !process.env.ONLY || process.env.ONLY.split(",").includes(name);
let scope = "";
const check = (ok, text, info = "") => { results.push({ ok: !!ok, text: `[${scope}] ${text}` }); console.log(ok ? "PASS" : "FAIL", `[${scope}]`, text, ok ? "" : info); };

// ---------------------------------------------------------------- Stripe CLI (test mode only)
const run = promisify(execFile);
async function stripe(...args) {
  const { stdout } = await run("stripe", args, { maxBuffer: 1 << 24 });
  const j = JSON.parse(stdout.slice(stdout.indexOf("{")));
  if (j.error) throw new Error(`stripe: ${j.error.message}`);
  if (j.livemode) throw new Error("live mode refused");
  return j;
}
const price = {};
async function priceFor(interval) {
  const key = interval === "month" ? "wendapply_family_monthly_chf" : "wendapply_family_yearly_chf";
  return (price[key] ??= (await stripe("prices", "list", "--lookup-keys", key, "-d", "active=true")).data[0].id);
}

// ---------------------------------------------------------------- dev server
const freePort = () => new Promise((resolve) => { const s = createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
async function startServer() {
  if (process.env.BASE) return { base: process.env.BASE, stop: () => {} };
  const port = await freePort();
  console.log(`Starting next dev on ${port} …`);
  const child = spawn("npx", ["next", "dev", "-p", String(port)], {
    cwd: ROOT, stdio: "ignore",
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: SUPA, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "dummy", NEXT_PUBLIC_STRIPE_ENABLED: "true", STRIPE_ENABLED: "true", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: PK },
  });
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 180; i++) { try { if ((await fetch(`${base}/preise`, { signal: AbortSignal.timeout(60000) })).status < 500) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 1000)); }
  return { base, stop: () => new Promise((r) => { child.once("exit", r); child.kill("SIGTERM"); setTimeout(r, 5000); }) };
}

// ---------------------------------------------------------------- fixtures
const member = (user_id, display_name, role) => ({ user_id, display_name, role, status: "active", consent_status: "not_required", share_settings: { progress: true, applications: false, village: true, documents: false } });
const familyRpc = {
  class_my_classes: [],
  family_get_my: { family: { id: FAMILY_ID, name: "Familie Meier" }, my_role: "parent", members: [member("u1", "Sandra Meier", "parent"), member("x2", "Lina Meier", "child")], plan: null },
  family_child_overview: { child: { display_name: "Lina Meier" }, consent_status: "granted", progress: { total: 4, status_counts: { applied: 3, interview: 1 }, last_activity: day(-1) }, village: { islands: 2, items: 3, points_earned: 120 } },
  family_create_invite: { code: "KIND2345", expires_at: day(7) },
};

async function actor(browser, vp, customer) {
  const ctx = await newCtx(browser, vp);
  await ctx.addInitScript(() => { try { localStorage.setItem("wendapply-install-hint-dismissed", "1"); localStorage.setItem("wendapply-tour-done", "1"); } catch { /* none */ } });
  await ctx.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = "nextjs-portal{display:none!important}"; document.head.appendChild(st); }));
  await installStub(ctx, { role: "student", rpc: familyRpc });
  const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "familie@beispiel.ch", user_metadata: { role: "student", account_type: "parent", account_type_synced: true }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await ctx.addInitScript((s) => localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)), { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user });
  await ctx.route(`${SUPA}/auth/v1/user*`, (route) => route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers: cors }) : route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(user) }));
  // Billing API backed by real Stripe test sessions.
  const billing = { paid: false, sessions: [], checkoutBodies: [] };
  await ctx.route("**/api/billing/**", async (route) => {
    const req = route.request(); const url = new URL(req.url()); let body = null; try { body = req.postDataJSON(); } catch { /* none */ }
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
    try {
      if (url.pathname === "/api/billing/status") {
        return json(billing.paid
          ? { enabled: true, plan: "family", status: "active", source: "stripe", subscriptionStatus: "active", collectionMethod: "charge_automatically", validUntil: day(365), cancelAtPeriodEnd: false }
          : { enabled: true, plan: null, status: null, source: null });
      }
      if (url.pathname === "/api/billing/checkout") {
        billing.checkoutBodies.push(body);
        if (body?.ui !== "elements") return json({ error: "expected elements" }, 400);
        const meta = { app: "wendapply", plan_id: "family", interval: body.interval, family_id: FAMILY_ID, user_id: "u1" };
        const s = await stripe("checkout", "sessions", "create", "-d", "ui_mode=elements", "-d", "mode=subscription", "-d", `customer=${customer}`,
          "-d", `line_items[0][price]=${await priceFor(body.interval)}`, "-d", "line_items[0][quantity]=1",
          "-d", `return_url=${url.origin}/familie/bezahlen/fertig?session_id={CHECKOUT_SESSION_ID}`, "-d", "billing_address_collection=auto",
          "-d", "customer_update[name]=auto", "-d", "customer_update[address]=auto", "-d", "managed_payments[enabled]=false",
          ...Object.entries(meta).flatMap(([k, v]) => ["-d", `metadata[${k}]=${v}`]), ...Object.entries(meta).flatMap(([k, v]) => ["-d", `subscription_data[metadata][${k}]=${v}`]));
        billing.sessions.push(s.id);
        return json({ clientSecret: s.client_secret });
      }
      if (url.pathname === "/api/billing/session") {
        const s = await stripe("checkout", "sessions", "retrieve", url.searchParams.get("id"));
        if (s.status === "complete") billing.paid = true; // stands in for the webhook
        return json({ status: s.status, paymentStatus: s.payment_status, plan: "family", interval: s.metadata.interval, familyId: FAMILY_ID });
      }
      return json({ error: "not_found" }, 404);
    } catch (e) { console.log("mock error", e.message); return json({ error: "billing_failed" }, 500); }
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`[${scope}] pageerror ${e.message.slice(0, 200)}`));
  page.on("console", (m) => { if (process.env.DEBUG && ["error", "warning"].includes(m.type()) && !/React DevTools|Download the React|favicon|Content Security Policy|HTTPS|not activated|register/.test(m.text())) console.log(`  console.${m.type()} [${scope}]`, m.text().slice(0, 300)); });
  return { ctx, page, billing };
}

const paymentFrame = (page) => page.frameLocator('[data-payment-element] iframe').first();
async function waitReady(page) { await page.locator('[data-pay-state="ready"]').waitFor({ timeout: 60000 }); await page.waitForTimeout(800); }
async function fillCard(page, number) {
  const f = paymentFrame(page);
  await f.locator('input[name="number"]').fill(number);
  await f.locator('input[name="expiry"]').fill("12 / 34");
  await f.locator('input[name="cvc"]').fill("123");
  const country = f.locator('select[name="country"]');
  if (await country.count()) await country.selectOption("CH").catch(() => {});
  const zip = f.locator('input[name="postalCode"]');
  if (await zip.count() && await zip.isVisible()) await zip.fill("8000");
}
async function shot(page, name, full = true) { await page.screenshot({ path: `${OUT}${name}.png`, fullPage: full }); }

setTimeout(() => { console.log("WATCHDOG: aborting after 9 min"); process.exit(2); }, 9 * 60_000).unref();
const server = await startServer();
const browser = await launch();
const customer = (await stripe("customers", "create", "-d", "email=e2e-inapp@example.com", "-d", "name=E2E In-App", "-d", "metadata[app]=wendapply-e2e")).id;
try {
  // ------------------------------------------------ desktop light: button → pay page → monthly → 4242 → active
  scope = "desktop light";
  if (want("desktop")) {
    const { ctx, page, billing } = await actor(browser, { w: 1280, h: 900 }, customer);
    await page.goto(`${server.base}/familie`, { waitUntil: "domcontentloaded" });
    const buy = page.getByRole("button", { name: /Familienpaket buchen/ });
    await buy.waitFor({ timeout: 90000 });
    await buy.click();
    await page.waitForURL(/\/familie\/bezahlen\?familie=/, { timeout: 30000 });
    check(new URL(page.url()).searchParams.get("interval") === "year", "Familienpaket buchen opens /familie/bezahlen (yearly default)");
    await waitReady(page);
    check(billing.checkoutBodies[0]?.ui === "elements" && billing.checkoutBodies[0]?.familyId === FAMILY_ID, "checkout asked for an in-app session", JSON.stringify(billing.checkoutBodies[0]));
    check((await page.locator("[data-pay-amount]").innerText()).includes("79.00"), "summary shows CHF 79.00 yearly");
    check(await page.locator("[data-pay-button]").isDisabled(), "pay button disabled until the form is complete");
    check(!(await page.content()).includes("Bald verfügbar"), "no 'Bald verfügbar'");
    const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    check(/Instrument Sans/.test(font), "app font on the page", font);
    await shot(page, "pay-desktop-light");
    await page.getByLabel(/Monatlich/).check();
    await waitReady(page);
    check((await page.locator("[data-pay-amount]").innerText()).includes("7.90"), "monthly switch: CHF 7.90 and a new session", String(billing.sessions.length));
    check(billing.sessions.length >= 2, "interval switch created a new session (dev StrictMode may add one)", String(billing.sessions.length));
    await fillCard(page, "4242424242424242");
    await page.waitForTimeout(600);
    check(!(await page.locator("[data-pay-button]").isDisabled()), "pay button enabled when the form is complete");
    check((await page.locator("[data-pay-button]").innerText()).includes("Jetzt bezahlen · CHF 7.90"), "own pay button with amount");
    await shot(page, "pay-desktop-light-filled");
    await page.locator("[data-pay-button]").click();
    await page.waitForURL(/\/familie\/bezahlen\/fertig\?session_id=cs_test_/, { timeout: 60000 });
    check(true, "4242: redirected to the return page");
    await page.locator('[data-pay-return="active"]').waitFor({ timeout: 60000 });
    check(await page.getByText("Dein Familienpaket ist aktiv").isVisible(), "return page: plan active");
    check(await page.getByText(/Monatlich · CHF 7.90 pro Monat/).isVisible(), "return page: monthly CHF 7.90");
    await shot(page, "return-active-desktop-light");
    await ctx.close();
  }

  // ------------------------------------------------ declined card
  scope = "declined";
  if (want("declined")) {
    const { ctx, page } = await actor(browser, { w: 1280, h: 900 }, customer);
    await page.goto(`${server.base}/familie/bezahlen?familie=${FAMILY_ID}&interval=year`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await fillCard(page, "4000000000000002");
    await page.waitForTimeout(500);
    await page.locator("[data-pay-button]").click();
    const err = page.locator('[role="alert"]').filter({ hasText: /abgelehnt/ });
    await err.waitFor({ timeout: 60000 }).catch(() => {});
    check(await err.isVisible(), "declined card: German error, stays on the page");
    check(/\/familie\/bezahlen\?/.test(page.url()), "declined card: no redirect");
    await shot(page, "pay-declined");
    await ctx.close();
  }

  // ------------------------------------------------ 3DS (SCA) challenge
  scope = "3ds";
  if (want("3ds")) {
    const { ctx, page } = await actor(browser, { w: 1280, h: 900 }, customer);
    await page.goto(`${server.base}/familie/bezahlen?familie=${FAMILY_ID}&interval=year`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await fillCard(page, "4000002760003184");
    await page.waitForTimeout(500);
    await page.locator("[data-pay-button]").click();
    // Stripe's 3DS test modal: nested iframes with a "Complete" button.
    let done = false;
    for (let i = 0; i < 40 && !done; i++) {
      await page.waitForTimeout(1000);
      for (const frame of page.frames()) {
        const btn = frame.locator('#test-source-authorize-3ds, button:has-text("Complete"), button:has-text("Abschliessen"), button:has-text("Abschließen")');
        if (await btn.count().catch(() => 0)) { if (i === 0 || !done) await shot(page, "pay-3ds-challenge", false); await btn.first().click().catch(() => {}); done = true; break; }
      }
    }
    check(done, "3DS: challenge shown and completed");
    await page.waitForURL(/\/familie\/bezahlen\/fertig/, { timeout: 60000 }).catch(() => {});
    await page.locator('[data-pay-return="active"]').waitFor({ timeout: 60000 }).catch(() => {});
    check(await page.locator('[data-pay-return="active"]').isVisible(), "3DS: payment confirmed, plan active");
    await ctx.close();
  }

  // ------------------------------------------------ mobile dark look
  scope = "mobile dark";
  if (want("look")) {
    const { ctx, page } = await actor(browser, { w: 390, h: 844, dark: true }, customer);
    await page.goto(`${server.base}/familie/bezahlen?familie=${FAMILY_ID}&interval=year`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no horizontal overflow on mobile");
    await shot(page, "pay-mobile-dark");
    await fillCard(page, "4242424242424242");
    await page.waitForTimeout(500);
    await shot(page, "pay-mobile-dark-filled");
    await ctx.close();
  }
  scope = "desktop dark";
  if (want("look")) {
    const { ctx, page } = await actor(browser, { w: 1280, h: 900, dark: true }, customer);
    await page.goto(`${server.base}/familie/bezahlen?familie=${FAMILY_ID}&interval=month`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await shot(page, "pay-desktop-dark");
    await ctx.close();
  }
} finally {
  await browser.close();
  await stripe("customers", "delete", customer, "--confirm").catch(() => {});
  await server.stop();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${problems.length ? `, ${problems.length} page problems` : ""}`);
for (const p of problems) console.log("  ", p);
process.exit(failed.length ? 1 : 0);
