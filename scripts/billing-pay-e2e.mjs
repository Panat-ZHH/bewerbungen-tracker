// Payments E2E against the REAL server code (payments audit 2026-11-17). Unlike billing-inapp-e2e.mjs (which mocks
// /api/billing in the browser), here the browser talks to the real Next routes, which talk to Stripe TEST mode; the
// Stripe CLI forwards the resulting events to the real /api/stripe/webhook route (raw body + signature). Supabase is a
// local fake HTTP server (FAKE_SUPA) that implements exactly the calls the billing code makes and keeps the subscription
// mirror in memory via lib/billing/memory-db.ts – so the plan only becomes "active" when the VERIFIED WEBHOOK says so.
//
// Covers: in-app payment 4242 (yearly) and 3DS (4000002760003184) -> webhook -> active; declined card (no
// subscription); double checkout (older session expired, 409 after paying); portal (own customer only); bad/missing
// signature -> 400; foreign `stripe trigger` events acknowledged; immediate cancel -> access ends.
//
//   PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> STRIPE_PK_FILE=<file with pk_test_…> \
//   STRIPE_KEY_FILE=<file with the Stripe CLI access token or sk_test_…> STRIPE_ACCOUNT=<acct_… for an OAuth token> \
//   node --experimental-strip-types scripts/billing-pay-e2e.mjs
// The key files are read, never printed. Live keys / live mode are refused.
import { execFile, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer as createHttp } from "node:http";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { installStub, newCtx as stubCtx } from "./ux-v2-stub.mjs";
import { createMemoryBillingDb } from "../lib/billing/memory-db.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = (process.env.OUT || join(ROOT, "docs/billing/screenshots/pay-e2e")).replace(/\/?$/, "/");
mkdirSync(OUT, { recursive: true });
const SUPA = "http://localhost:54321"; // inlined into the client; the browser's calls are intercepted, the server's hit FAKE_SUPA
const PK = readFileSync(process.env.STRIPE_PK_FILE, "utf8").trim();
const SK = readFileSync(process.env.STRIPE_KEY_FILE, "utf8").trim();
if (!/^pk_test_/.test(PK)) throw new Error("test publishable key required");
if (/^(sk|rk)_live_/.test(SK)) throw new Error("live secret key refused");
const ACCOUNT = process.env.STRIPE_ACCOUNT || "";
const USER = { id: "00000000-0000-4000-8000-00000000e2e1", email: "e2e-pay@example.com" };
const FAM = { pay: "00000000-0000-4000-8000-00000000fa01", tds: "00000000-0000-4000-8000-00000000fa02", decl: "00000000-0000-4000-8000-00000000fa03", dbl: "00000000-0000-4000-8000-00000000fa04" };
const FOREIGN_FAMILY = "00000000-0000-4000-8000-00000000fa99";
const day = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

const results = []; const problems = [];
let scope = "";
const check = (ok, text, info = "") => { results.push({ ok: !!ok, text: `[${scope}] ${text}` }); console.log(ok ? "PASS" : "FAIL", `[${scope}]`, text, ok ? "" : String(info).slice(0, 400)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 60000, step = 1000) { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(step); } return null; }

// ---------------------------------------------------------------- Stripe CLI (test mode only)
const run = promisify(execFile);
async function stripe(...args) {
  const { stdout } = await run("stripe", args, { maxBuffer: 1 << 24 });
  const j = JSON.parse(stdout.slice(stdout.indexOf("{")));
  if (j.error) throw new Error(`stripe: ${j.error.message}`);
  if (j.livemode) throw new Error("live mode refused");
  return j;
}

// ---------------------------------------------------------------- fake Supabase (server side only)
const mem = createMemoryBillingDb();
const customers = []; // { stripe_customer_id, family_id, school_id }
const supaCalls = [];
function statusFor(familyId) {
  const subs = [...mem.state.subscriptions.values()].filter((s) => s.p_family_id === familyId);
  const sub = subs.at(-1);
  const hasCustomer = customers.some((c) => c.family_id === familyId);
  if (!sub || sub.p_status === "incomplete") return { family_id: familyId, plan: null, state: null, licence_status: null, source: null, has_customer: hasCustomer };
  const end = sub.p_current_period_end;
  let licence = ["active", "trialing", "past_due", "canceled"].includes(sub.p_status) ? "active" : "expired";
  if (licence === "active" && end && new Date(end) < new Date()) licence = "expired";
  return {
    family_id: familyId, plan: "family", state: licence, licence_status: licence, source: "stripe", student_limit: 1, valid_until: end?.slice(0, 10) ?? null,
    subscription_status: sub.p_status, cancel_at_period_end: sub.p_cancel_at_period_end, current_period_end: end, collection_method: sub.p_collection_method,
    latest_invoice_status: sub.p_latest_invoice_status, has_customer: hasCustomer,
  };
}
function startFakeSupabase(port) {
  const server = createHttp(async (req, res) => {
    const url = new URL(req.url, "http://x"); const p = url.pathname;
    let raw = ""; for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : {};
    const send = (b, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
    const object = (req.headers.accept || "").includes("vnd.pgrst.object");
    const rows = (list) => (object ? send(list[0] ?? null) : send(list));
    const eq = (k) => (url.searchParams.get(k) || "").replace(/^eq\./, "");
    supaCalls.push(`${req.method} ${p}`);
    if (p === "/auth/v1/user") return (req.headers.authorization === "Bearer a.b.c" ? send({ id: USER.id, aud: "authenticated", role: "authenticated", email: USER.email }) : send({ msg: "invalid" }, 401));
    if (p === "/rest/v1/rpc/is_family_parent") return send(Object.values(FAM).includes(body.p_family_id));
    if (p === "/rest/v1/rpc/is_school_admin") return send(false);
    if (p === "/rest/v1/rpc/billing_status_for_family") return send(statusFor(body.p_family_id));
    if (p === "/rest/v1/rpc/billing_apply_subscription") {
      try { return send(await mem.applySubscription(body)); } catch (e) { return send({ code: "P0001", message: e.message }, 400); }
    }
    if (p === "/rest/v1/stripe_events") {
      if (req.method === "GET") { const e = mem.state.events.get(eq("id")); return rows(e ? [{ processed_at: e.processedAt }] : []); }
      for (const r of [].concat(body)) await mem.markEventProcessed(r.id, r.type);
      return send([], 201);
    }
    if (p === "/rest/v1/billing_customers") {
      if (req.method === "GET") return rows(customers.filter((c) => c.family_id === eq("family_id")).slice().reverse());
      for (const r of [].concat(body)) if (!customers.some((c) => c.stripe_customer_id === r.stripe_customer_id)) customers.push(r);
      return send([], 201);
    }
    if (p === "/rest/v1/billing_subscriptions") {
      const open = ["active", "trialing", "past_due", "unpaid", "paused"];
      return rows([...mem.state.subscriptions.values()].filter((s) => s.p_family_id === eq("family_id") && open.includes(s.p_status)).map((s) => ({ id: s.p_stripe_subscription_id })));
    }
    if (p === "/rest/v1/families") return rows([{ name: "Familie E2E" }]);
    return send({ message: `fake supabase: unhandled ${req.method} ${p}` }, 404);
  });
  return new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", () => resolve(server)); });
}

// ---------------------------------------------------------------- servers
const freePort = () => new Promise((resolve) => { const s = createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
let nextLog = "";
async function startNext(port, supaPort, whsec) {
  const child = spawn("npx", ["next", "dev", "-p", String(port)], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${supaPort}`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "dummy", SUPABASE_SERVICE_ROLE_KEY: "dummy-service",
      NEXT_PUBLIC_STRIPE_ENABLED: "true", STRIPE_ENABLED: "true", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: PK, STRIPE_SECRET_KEY: SK, STRIPE_ACCOUNT_ID: ACCOUNT,
      STRIPE_WEBHOOK_SECRET: whsec, BILLING_DB: "", APP_URL: `http://localhost:${port}`, STRIPE_PORTAL_CONFIGURATION_ID: "",
    },
  });
  child.stdout.on("data", (d) => { nextLog += d; }); child.stderr.on("data", (d) => { nextLog += d; });
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 180; i++) { try { if ((await fetch(`${base}/preise`, { signal: AbortSignal.timeout(60000) })).status < 500) break; } catch { /* starting */ } await sleep(1000); }
  return { base, stop: () => new Promise((r) => { child.once("exit", r); child.kill("SIGTERM"); setTimeout(r, 5000); }) };
}

// The NEXT_PUBLIC_SUPABASE_URL above is the fake server for BOTH sides; the browser's calls to it are intercepted.
async function actor(browser, base, familyId, supaUrl) {
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
  const ctx = await stubCtx(browser, { w: 1280, h: 900, userAgent: UA });
  await ctx.addInitScript(() => { try { localStorage.setItem("wendapply-install-hint-dismissed", "1"); localStorage.setItem("wendapply-tour-done", "1"); } catch { /* none */ } });
  const member = (user_id, display_name, role) => ({ user_id, display_name, role, status: "active", consent_status: "not_required", share_settings: { progress: true, applications: false, village: true, documents: false } });
  const rpc = {
    class_my_classes: [],
    family_get_my: { family: { id: familyId, name: "Familie E2E" }, my_role: "parent", members: [member(USER.id, "Eva E2E", "parent"), member("x2", "Kim E2E", "child")], plan: null },
    family_child_overview: { child: { display_name: "Kim E2E" }, consent_status: "granted", progress: { total: 1, status_counts: { applied: 1 }, last_activity: day(-1) }, village: { islands: 1, items: 1, points_earned: 10 } },
  };
  await installStub(ctx, { role: "student", rpc });
  // ux-v2-stub intercepts http://localhost:54321; our client is built with the fake URL -> forward those to the stub too.
  const user = { id: USER.id, aud: "authenticated", role: "authenticated", email: USER.email, user_metadata: { role: "student", account_type: "parent", account_type_synced: true }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const session = { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user };
  await ctx.addInitScript((s) => { for (const k of ["sb-localhost-auth-token", "sb-127-auth-token"]) localStorage.setItem(k, JSON.stringify(s)); }, session);
  await ctx.route(`${supaUrl}/**`, async (route) => {
    const req = route.request(); const u = new URL(req.url());
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (u.pathname.startsWith("/auth/v1/user")) return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(user) });
    if (u.pathname.startsWith("/rest/v1/rpc/")) {
      const name = u.pathname.split("/").pop();
      if (name in rpc) return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(rpc[name]) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", headers: { ...cors, "content-range": "0-0/*" }, body: "[]" });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`[${scope}] pageerror ${e.message.slice(0, 200)}`));
  return { ctx, page };
}

const paymentFrame = (page) => page.frameLocator("[data-payment-element] iframe").first();
async function waitReady(page) { await page.locator('[data-pay-state="ready"]').waitFor({ timeout: 90000 }); await page.waitForTimeout(800); }
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
const api = (base, path, init = {}) => fetch(`${base}${path}`, { ...init, headers: { authorization: "Bearer a.b.c", "content-type": "application/json", ...(init.headers || {}) } })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const subOf = (familyId) => [...mem.state.subscriptions.values()].find((s) => s.p_family_id === familyId);

setTimeout(() => { console.log("WATCHDOG: aborting after 14 min"); process.exit(2); }, 14 * 60_000).unref();
const supaPort = await freePort();
const supa = await startFakeSupabase(supaPort);
const supaUrl = `http://127.0.0.1:${supaPort}`;
const port = await freePort();
const listenArgs = ["listen", "--forward-to", `localhost:${port}/api/stripe/webhook`, "--events",
  "checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed"];
const whsec = (await run("stripe", ["listen", "--print-secret"])).stdout.trim();
if (!/^whsec_/.test(whsec)) throw new Error("stripe listen --print-secret failed");
const listener = spawn("stripe", listenArgs, { stdio: ["ignore", "pipe", "pipe"] });
let listenLog = ""; listener.stdout.on("data", (d) => { listenLog += d; }); listener.stderr.on("data", (d) => { listenLog += d; });
console.log(`Starting next dev on ${port} (fake Supabase on ${supaPort}) …`);
const server = await startNext(port, supaPort, whsec);
await until(() => /Ready!/.test(listenLog), 30000, 500);
const { chromium } = await import(process.env.PLAYWRIGHT);
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: !process.env.HEADED, args: ["--disable-blink-features=AutomationControlled"] });
const createdCustomers = () => customers.map((c) => c.stripe_customer_id);
try {
  // ------------------------------------------------ webhook hardening
  scope = "webhook";
  {
    const bad = await fetch(`${server.base}/api/stripe/webhook`, { method: "POST", body: JSON.stringify({ id: "evt_fake", type: "customer.subscription.updated" }), headers: { "stripe-signature": "t=1,v1=deadbeef" } });
    check(bad.status === 400, "bad signature -> 400", bad.status);
    const none = await fetch(`${server.base}/api/stripe/webhook`, { method: "POST", body: "{}" });
    check(none.status === 400, "missing signature -> 400", none.status);
    const unauth = await fetch(`${server.base}/api/billing/checkout`, { method: "POST", body: JSON.stringify({ plan: "family", familyId: FAM.pay }) });
    check(unauth.status === 401, "checkout without token -> 401", unauth.status);
    const foreign = await api(server.base, "/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "family", familyId: FOREIGN_FAMILY }) });
    check(foreign.status === 403, "checkout for a family I'm not parent of -> 403", JSON.stringify(foreign));
    const amount = await api(server.base, "/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "family", familyId: FAM.dbl, amount: 1, price: "price_x", unit_amount: 1, ui: "elements" }) });
    check(amount.status === 200 && amount.body?.clientSecret, "client-supplied amount/price fields are ignored (server price by lookup key)", JSON.stringify(amount));
    if (amount.body?.clientSecret) {
      const cs = await stripe("checkout", "sessions", "retrieve", amount.body.clientSecret.split("_secret_")[0], "--expand", "line_items");
      check(cs.amount_total === 7900 && cs.currency === "chf", "session amount = CHF 79.00 from the catalogue", `${cs.amount_total} ${cs.currency}`);
      check(cs.return_url?.startsWith(`${server.base}/familie/bezahlen/fertig?session_id=`), "return_url on the allowlisted origin", cs.return_url);
      // double checkout: a second session expires the first
      const second = await api(server.base, "/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "family", familyId: FAM.dbl, interval: "month", ui: "elements" }) });
      const first = await stripe("checkout", "sessions", "retrieve", cs.id);
      check(second.status === 200 && first.status === "expired", "double checkout: the older open session is expired", `${second.status} ${first.status}`);
      check(customers.filter((c) => c.family_id === FAM.dbl).length === 1, "double checkout: one Stripe customer per family");
    }
    const hosted = await api(server.base, "/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "family", familyId: FAM.dbl, interval: "year" }) });
    check(hosted.status === 200 && /^https:\/\/checkout\.stripe\.com\//.test(hosted.body?.url ?? ""), "hosted Checkout fallback still works", JSON.stringify(hosted).slice(0, 200));
  }

  // ------------------------------------------------ in-app 4242 (yearly) -> webhook -> active
  scope = "pay 4242";
  {
    const { ctx, page } = await actor(browser, server.base, FAM.pay, supaUrl);
    await page.goto(`${server.base}/familie/bezahlen?familie=${FAM.pay}&interval=year`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    check((await page.locator("[data-pay-amount]").innerText()).includes("79.00"), "summary CHF 79.00");
    check(!/MWST/i.test(await page.locator("main").innerText()), "no MWST wording on the pay page");
    await fillCard(page, "4242424242424242");
    await page.waitForTimeout(600);
    await page.locator("[data-pay-button]").click();
    await page.waitForURL(/\/familie\/bezahlen\/fertig\?session_id=cs_test_/, { timeout: 90000 });
    await page.locator('[data-pay-return="active"]').waitFor({ timeout: 90000 }).catch(() => {});
    check(await page.locator('[data-pay-return="active"]').isVisible(), "return page shows the plan active (status from the webhook mirror)");
    await page.screenshot({ path: `${OUT}pay-4242-active.png`, fullPage: true });
    const sub = subOf(FAM.pay);
    check(sub?.p_status === "active" && sub?.p_plan_id === "family", "webhook applied: family subscription active", JSON.stringify(sub));
    check(/checkout\.session\.completed/.test(listenLog) && /\[200\]/.test(listenLog), "stripe listen delivered checkout.session.completed with 200");
    await ctx.close();
    // Already subscribed: a new checkout is refused (DB mirror and Stripe both know the subscription).
    const again = await api(server.base, "/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "family", familyId: FAM.pay, ui: "elements" }) });
    check(again.status === 409 && again.body?.error === "already_subscribed", "second checkout after paying -> 409", JSON.stringify(again));
    const portal = await api(server.base, "/api/billing/portal", { method: "POST", body: JSON.stringify({ familyId: FAM.pay }) });
    check(portal.status === 200 && /^https:\/\/billing\.stripe\.com\//.test(portal.body?.url ?? ""), "portal session for the own customer", JSON.stringify(portal).slice(0, 200));
    const portalForeign = await api(server.base, "/api/billing/portal", { method: "POST", body: JSON.stringify({ familyId: FOREIGN_FAMILY }) });
    check(portalForeign.status === 403, "portal for a foreign family -> 403", portalForeign.status);
    // Immediate cancel (like a refund + cancel in the Dashboard) -> deleted event -> access ends now.
    if (sub) {
      await stripe("subscriptions", "cancel", sub.p_stripe_subscription_id, "--confirm");
      const ended = await until(() => subOf(FAM.pay)?.p_status === "canceled", 60000);
      check(ended, "immediate cancel: webhook mirrors canceled");
      const st = await api(server.base, `/api/billing/status?familyId=${FAM.pay}`);
      check(st.body?.status === "expired", "immediate cancel: access ended (ended_at, not the paid period end)", JSON.stringify(st.body));
    }
  }

  // ------------------------------------------------ 3DS
  scope = "3ds";
  {
    const { ctx, page } = await actor(browser, server.base, FAM.tds, supaUrl);
    await page.goto(`${server.base}/familie/bezahlen?familie=${FAM.tds}&interval=month`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await fillCard(page, "4000002760003184");
    await page.waitForTimeout(500);
    await page.locator("[data-pay-button]").click();
    let done = false;
    for (let i = 0; i < 45 && !done; i++) {
      await page.waitForTimeout(1000);
      for (const frame of page.frames()) {
        const btn = frame.locator('#test-source-authorize-3ds, button:has-text("Complete"), button:has-text("Abschliessen"), button:has-text("Abschließen")');
        if (await btn.count().catch(() => 0)) { await btn.first().click().catch(() => {}); done = true; break; }
      }
    }
    check(done, "3DS challenge shown and completed");
    await page.waitForURL(/\/familie\/bezahlen\/fertig/, { timeout: 90000 }).catch(() => {});
    await page.locator('[data-pay-return="active"]').waitFor({ timeout: 90000 }).catch(() => {});
    check(await page.locator('[data-pay-return="active"]').isVisible(), "3DS: plan active after the webhook");
    check(subOf(FAM.tds)?.p_status === "active", "3DS: webhook applied the monthly subscription", JSON.stringify(subOf(FAM.tds)));
    await ctx.close();
  }

  // ------------------------------------------------ declined
  scope = "declined";
  {
    const { ctx, page } = await actor(browser, server.base, FAM.decl, supaUrl);
    await page.goto(`${server.base}/familie/bezahlen?familie=${FAM.decl}&interval=year`, { waitUntil: "domcontentloaded" });
    await waitReady(page);
    await fillCard(page, "4000000000000002");
    await page.waitForTimeout(500);
    await page.locator("[data-pay-button]").click();
    const err = page.locator('[role="alert"]').filter({ hasText: /abgelehnt/ });
    await err.waitFor({ timeout: 60000 }).catch(() => {});
    check(await err.isVisible(), "declined: German error, stays on the page");
    await sleep(4000);
    check(!subOf(FAM.decl), "declined: no subscription / no access");
    await ctx.close();
  }

  // ------------------------------------------------ foreign events (stripe trigger fixtures have no WendApply metadata)
  scope = "trigger";
  {
    const before = (nextLog.match(/stripe webhook/g) || []).length;
    await run("stripe", ["trigger", "customer.subscription.created"], { maxBuffer: 1 << 24 }).catch((e) => problems.push(`trigger: ${e.message.slice(0, 120)}`));
    const handled = await until(() => (nextLog.match(/stripe webhook/g) || []).length > before, 60000);
    check(handled && !/\[500\]/.test(listenLog), "foreign subscription events are acknowledged (no 500 / retry storm)");
  }
} finally {
  await browser.close().catch(() => {});
  for (const c of createdCustomers()) await stripe("customers", "delete", c, "--confirm").catch(() => {});
  listener.kill("SIGTERM");
  await server.stop();
  supa.close();
  writeFileSync(`${OUT}run.log`, `${listenLog.replace(/whsec_[A-Za-z0-9]+/g, "whsec_…")}\n----- next\n${nextLog.split("\n").filter((l) => /stripe webhook|billing/.test(l)).join("\n")}\n`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${problems.length ? `, ${problems.length} page problems` : ""}`);
for (const p of problems) console.log("  ", p);
process.exit(failed.length ? 1 : 0);
