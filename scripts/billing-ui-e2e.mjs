// End-to-end flows + screenshots for the billing UI in BOTH flag states (NEXT_PUBLIC_STRIPE_ENABLED off / on).
// Nothing real is touched: Supabase is the in-memory stub (scripts/ux-v2-stub.mjs) and /api/billing/* is mocked per test,
// so this runs without the stripe-api routes, without Stripe and without keys.
//
//   PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> node scripts/billing-ui-e2e.mjs            # both states
//   ... node scripts/billing-ui-e2e.mjs --flag=on                                                      # one state
//   BASE_OFF=http://localhost:3301 BASE_ON=http://localhost:3302 ...   # reuse running dev servers instead of spawning
//
// A dev server per state is spawned (sequentially, `next dev --webpack`) with the dummy Supabase env and the flag set.
// Screenshots: docs/billing/screenshots/ (OUT to override). Axe (wcag2a/aa) runs on the billing sections if AXE or
// node_modules/axe-core is available.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { installStub, launch, newCtx } from "./ux-v2-stub.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v = "1"] = a.slice(2).split("="); return [k, v]; }));
const OUT = (process.env.OUT || join(ROOT, "docs/billing/screenshots")).replace(/\/?$/, "/");
mkdirSync(OUT, { recursive: true });
const SUPA = "http://localhost:54321";
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
const axePath = process.env.AXE || join(ROOT, "node_modules/axe-core/axe.min.js");
const axeSrc = existsSync(axePath) ? readFileSync(axePath, "utf8") : null;
const FREE = "WendApply ist aktuell kostenlos. Online-Bezahlung folgt.";
const day = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

const results = [];
const problems = [];
let scope = "";
const check = (ok, text, info = "") => { results.push({ ok: !!ok, text: `[${scope}] ${text}` }); console.log(ok ? "PASS" : "FAIL", `[${scope}]`, text, ok ? "" : info); };
const visible = (page, text, timeout = 30000) => page.getByText(text).locator("visible=true").first().waitFor({ timeout }).then(() => true, () => false);
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// ---------------------------------------------------------------- dev servers
const freePort = () => new Promise((resolve) => { const s = createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const reachable = async (url) => { try { return (await fetch(url + "/preise", { signal: AbortSignal.timeout(60000) })).status < 500; } catch { return false; } };
async function startServer(flag) {
  const given = flag === "on" ? process.env.BASE_ON : process.env.BASE_OFF;
  if (given) return { base: given, stop: () => {} };
  const port = await freePort();
  console.log(`Starting a dev server (flag ${flag}) on port ${port} ...`);
  const child = spawn("npx", ["next", "dev", "--webpack", "-p", String(port)], {
    cwd: ROOT, stdio: "ignore",
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: SUPA, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "dummy", NEXT_PUBLIC_STRIPE_ENABLED: flag === "on" ? "true" : "false", STRIPE_ENABLED: flag === "on" ? "true" : "false" },
  });
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 180; i++) { if (await reachable(base)) break; await new Promise((r) => setTimeout(r, 1000)); }
  return { base, stop: () => new Promise((r) => { child.once("exit", r); child.kill("SIGTERM"); setTimeout(r, 5000); }) };
}

// ---------------------------------------------------------------- fixtures
const SCHOOL_ID = "11111111-1111-4111-8111-111111111111";
const FAMILY_ID = "22222222-2222-4222-8222-222222222222";
const licence = { package: "pilot", status: "pilot", state: "pilot", student_limit: 60, students_used: 41, seats_left: 19, pilot_start: day(-18), pilot_end: day(12), days_left: 12 };
const schoolRpc = {
  class_list_mine: [], teacher_dashboard: { totals: {}, classes: [], deadlines: [] },
  school_admin_my_schools: [{ school_id: SCHOOL_ID, name: "Sekundarschule Seefeld", canton_or_state: "ZH", country: "CH", licence }],
  school_admin_overview: { school: { id: SCHOOL_ID, name: "Sekundarschule Seefeld", canton_or_state: "ZH", country: "CH" }, licence, totals: { classes: 2, teachers: 2, students: 41 },
    classes: [{ id: "c1", name: "Sek 3a", school_year: "2026/27", archived: false, teacher_name: "Frau Keller", students: 22, students_sharing: 18, suppressed: false, students_with_application: 15, students_placed: 6 }],
    teachers: [{ teacher_id: "t1", display_name: "Frau Keller", classes: 1 }] },
};
const member = (user_id, display_name, role) => ({ user_id, display_name, role, status: "active", consent_status: "not_required", share_settings: { progress: true, applications: false, village: true, documents: false } });
const familyRpc = (role) => ({
  class_my_classes: [],
  family_get_my: { family: { id: FAMILY_ID, name: "Familie Meier" }, my_role: role, members: [member("u1", role === "parent" ? "Sandra Meier" : "Lina Meier", role), member("x2", role === "parent" ? "Lina Meier" : "Sandra Meier", role === "parent" ? "child" : "parent")], plan: { plan_type: "family", status: "trial", seats_parents: 1, seats_children: 1, trial_ends_at: day(14) } },
  family_child_overview: { child: { display_name: "Lina Meier" }, consent_status: "granted", progress: { total: 4, status_counts: { applied: 3, interview: 1 }, last_activity: day(-1) }, village: { islands: 2, items: 3, points_earned: 120 } },
  family_create_invite: { code: "KIND2345", expires_at: day(7) },
});

/** Mocked billing API. `status` per owner kind: object (200), number (error status), "subscribed". Records every call. */
async function mockBilling(ctx, { status = {}, checkout = null } = {}) {
  const calls = [];
  await ctx.route("**/api/billing/**", async (route) => {
    const req = route.request(); const url = new URL(req.url()); let body = null; try { body = req.postDataJSON(); } catch { /* none */ }
    calls.push({ path: url.pathname, method: req.method(), query: url.search, body, auth: req.headers().authorization ?? null });
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
    if (url.pathname === "/api/billing/status") {
      const kind = url.searchParams.has("schoolId") ? "school" : "family";
      const s = status[kind] ?? { enabled: true, plan: null, status: null, source: null };
      if (s === 404) return route.fulfill({ status: 404, contentType: "text/html", body: "<!doctype html><title>404</title>" }); // route not deployed yet
      return typeof s === "number" ? json({ error: s === 503 ? "billing_disabled" : "boom" }, s) : json(s);
    }
    if (url.pathname === "/api/billing/checkout") return checkout ? checkout(body, json) : json({ error: "billing_disabled" }, 503);
    if (url.pathname === "/api/billing/portal") return json({ url: `${url.origin}/schul-admin?portal=1` });
    return json({ error: "not_found" }, 404);
  });
  return calls;
}

async function actor(base, { role = "teacher", rpc, vp, meta, billing }) {
  const ctx = await newCtx(browser, vp);
  await ctx.addInitScript(() => { try { localStorage.setItem("wendapply-install-hint-dismissed", "1"); localStorage.setItem("wendapply-tour-done", "1"); } catch { /* none */ } });
  // hide the Next.js dev badge in screenshots
  await ctx.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = "nextjs-portal{display:none!important}"; document.head.appendChild(st); }));
  const state = await installStub(ctx, { role, rpc });
  if (meta) {
    const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "familie@beispiel.ch", user_metadata: meta, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
    await ctx.addInitScript((s) => localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)), { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user });
    await ctx.route(`${SUPA}/auth/v1/user*`, (route) => route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers: cors }) : route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(user) }));
  }
  const calls = await mockBilling(ctx, billing);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`[${scope}] pageerror ${e.message.slice(0, 200)}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|status of [45]\d\d|React DevTools|Download the React/.test(m.text())) problems.push(`[${scope}] console ${m.text().slice(0, 200)}`); });
  return { ctx, page, state, calls, base };
}

async function axe(page, selector) {
  if (!axeSrc) return;
  await page.addScriptTag({ content: axeSrc });
  const v = await page.evaluate(async (sel) => (await window.axe.run(sel, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((x) => `${x.id} x${x.nodes.length} ${x.nodes[0]?.target?.join(" ")}`), selector);
  check(v.length === 0, `axe: no WCAG A/AA violations in ${selector}`, v.join(" | "));
}
async function elementShot(page, selector, name) {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  await el.screenshot({ path: `${OUT}${name}.png` }).catch((e) => problems.push(`[${scope}] screenshot ${name}: ${e.message.slice(0, 120)}`));
}

// ---------------------------------------------------------------- flows per flag state
const VIEWPORTS = [{ key: "desktop-light", vp: { w: 1280, h: 900 } }, { key: "mobile-dark", vp: { w: 375, h: 812, dark: true } }];

async function runState(flag, base) {
  const on = flag === "on";
  for (const { key, vp } of VIEWPORTS) {
    // ------------------------------------------------ /preise
    scope = `preise ${flag} ${key}`;
    {
      const { ctx, page } = await actor(base, { role: "student", rpc: {}, vp });
      await page.goto(`${base}/preise`, { waitUntil: "networkidle" });
      const notice = page.locator("[data-billing-notice]");
      check(await notice.getAttribute("data-billing-notice") === flag, `flag state rendered (${flag})`);
      check(!(await page.getByText(/MWST/).first().isVisible().catch(() => false)), "no VAT wording on prices");
      check(await page.getByRole("link", { name: /Offerte für Professional anfragen/ }).isVisible(), "offer flow is still there");
      const online = await page.getByRole("link", { name: "Professional online abschliessen" }).count();
      if (on) {
        check(online === 1, "online button per school package");
        check(await page.getByRole("link", { name: "Professional online abschliessen" }).getAttribute("href") === "/schul-admin?plan=professional#abo", "online button leads to /schul-admin with the plan");
        check(await page.getByRole("link", { name: "Monatlich buchen" }).getAttribute("href") === "/familie?plan=family&interval=month#abo", "family monthly button leads to /familie");
        check(await page.getByRole("link", { name: "Jährlich buchen" }).getAttribute("href") === "/familie?plan=family&interval=year#abo", "family yearly button leads to /familie");
      } else {
        check(online === 0, "no online buttons while off");
        check(await visible(page, FREE, 5000), "honest 'aktuell kostenlos' note");
        check(await page.getByRole("link", { name: "Zugang anfragen" }).first().getAttribute("href") === "/familien#warteliste", "family: Zugang anfragen flow");
        check(await page.locator("[data-price-placeholder]").count() === 0, "no 'Preis folgt' placeholder any more");
      }
      check(await page.locator("[data-family-price]").textContent().then((t) => t.includes("CHF 7.90")), "family price CHF 7.90 per month from plans.ts");
      check(await noOverflow(page), "no horizontal overflow");
      if (key === "desktop-light") await axe(page, "main");
      await page.screenshot({ path: `${OUT}preise-${flag}-${key}.png`, fullPage: key === "desktop-light" });
      await ctx.close();
    }

    // ------------------------------------------------ /schul-admin "Abo & Rechnung"
    scope = `schul-admin ${flag} ${key}`;
    {
      let lastCheckout = null;
      const { ctx, page, calls } = await actor(base, { role: "teacher", rpc: schoolRpc, vp, billing: { checkout: (body, json) => { lastCheckout = body; return json({ url: null, invoice: true }); } } });
      await page.goto(`${base}/schul-admin?plan=enterprise#abo`, { waitUntil: "domcontentloaded" });
      check(await visible(page, "Abo & Rechnung", 90000), "'Abo & Rechnung' section is shown");
      const section = page.locator("#abo");
      check(await section.getAttribute("data-billing-enabled") === flag, `section in state ${flag}`);
      if (on) {
        check(await visible(page, "Zahlungsart"), "plan + payment choice shown (no subscription yet)");
        check(await page.getByRole("radio", { name: /Enterprise/ }).isChecked(), "?plan=enterprise preselects the plan");
        check(!(await page.getByText(/MWST/).first().isVisible().catch(() => false)), "no VAT wording in the picker");
        const st = calls.find((c) => c.path === "/api/billing/status");
        check(st && st.query.includes(`schoolId=${SCHOOL_ID}`) && st.auth === "Bearer a.b.c", "status is loaded with schoolId and the bearer token", JSON.stringify(st));
        await elementShot(page, "#abo", `schul-admin-billing-${flag}-${key}`);
        if (key === "desktop-light") await axe(page, "#abo");
        await page.getByRole("radio", { name: /Rechnung/ }).check();
        await page.getByRole("button", { name: /per Rechnung bestellen/ }).click();
        check(await visible(page, "Rechnung angefordert"), "invoice: confirmation shown");
        check(lastCheckout && lastCheckout.plan === "enterprise" && lastCheckout.payment === "invoice" && lastCheckout.schoolId === SCHOOL_ID, "invoice: POST /api/billing/checkout with plan, schoolId, payment=invoice", JSON.stringify(lastCheckout));
      } else {
        check(await visible(page, FREE, 5000), "honest 'aktuell kostenlos' note");
        check(await section.getByRole("link", { name: "Kontakt aufnehmen" }).isVisible(), "contact flow instead of a buy button");
        check(await section.getByRole("button").count() === 0, "no buttons (no dead buy button)");
        check(calls.length === 0, "no billing API calls while off", JSON.stringify(calls));
        check(await visible(page, "Paketwechsel über Kontakt", 5000), "licence card keeps 'Paketwechsel über Kontakt'");
        await elementShot(page, "#abo", `schul-admin-billing-${flag}-${key}`);
        if (key === "desktop-light") await axe(page, "#abo");
      }
      check(await noOverflow(page), "no horizontal overflow");
      await ctx.close();
    }

    // ------------------------------------------------ /familie plan card (parent)
    scope = `familie ${flag} ${key}`;
    {
      let lastCheckout = null;
      const { ctx, page, calls } = await actor(base, { role: "student", rpc: familyRpc("parent"), vp, meta: { role: "student", account_type: "parent", account_type_synced: true }, billing: { checkout: (body, json) => { lastCheckout = body; return json({ url: `${base}/familie?billing=success&session_id=cs_test_x` }); } } });
      await page.goto(`${base}/familie`, { waitUntil: "domcontentloaded" });
      check(await visible(page, "Familienpaket", 90000), "plan card is shown");
      const card = page.locator("#abo");
      check(await card.getAttribute("data-billing-enabled") === flag, `plan card in state ${flag}`);
      if (on) {
        check(await visible(page, "Sichere Bezahlung mit Karte über Stripe"), "family: card only (Stripe note), no invoice choice");
        check(await card.getByRole("radio").count() === 2, "only the monthly/yearly radios, no payment radio for families");
        check(await card.getByRole("radio", { name: /Jährlich/ }).isChecked(), "yearly preselected");
        await card.getByRole("radio", { name: /Monatlich/ }).check();
        await elementShot(page, "#abo", `familie-plan-${flag}-${key}`);
        if (key === "desktop-light") await axe(page, "#abo");
        await card.locator("[data-primary-action]").click();
        await page.waitForURL(/billing=success|\/familie$/, { timeout: 60000 }).catch(() => {});
        check(lastCheckout && lastCheckout.plan === "family" && lastCheckout.familyId === FAMILY_ID && lastCheckout.payment === "card" && lastCheckout.interval === "month", "monthly card checkout with familyId", JSON.stringify(lastCheckout));
        check(await visible(page, "Danke! Wir schalten dein Familienpaket frei", 60000), "?billing=success shows the activating message (top of page)");
        check(await card.getByRole("button", { name: /Familienpaket buchen/ }).count() === 0, "no buy button while the package is being activated");
        check(!page.url().includes("billing="), "return params are removed from the URL", page.url());
        if (key === "desktop-light") await elementShot(page, "[data-billing-return]", `familie-plan-on-return-success`);
      } else {
        check(await visible(page, "Bezahlung bald verfügbar", 5000), "'Bezahlung bald verfügbar' stays");
        check(await visible(page, FREE, 5000), "honest 'aktuell kostenlos' note");
        await card.getByRole("button", { name: "Zugang anfragen" }).click();
        check(await page.getByRole("dialog").getByText("Zugang anfragen").first().isVisible(), "Zugang anfragen opens the request form");
        await page.keyboard.press("Escape");
        check(calls.length === 0, "no billing API calls while off", JSON.stringify(calls));
        await elementShot(page, "#abo", `familie-plan-${flag}-${key}`);
        if (key === "desktop-light") await axe(page, "#abo");
      }
      check(await noOverflow(page), "no horizontal overflow");
      await ctx.close();
    }
  }

  if (on) {
    // child: sees the plan, cannot buy, no status call
    scope = "familie on child";
    {
      const { ctx, page, calls } = await actor(base, { role: "student", rpc: familyRpc("child"), vp: { w: 1280, h: 900 }, meta: { role: "student", account_type: "independent_student", account_type_synced: true } });
      await page.goto(`${base}/familie`, { waitUntil: "domcontentloaded" });
      check(await visible(page, "Familienpaket aktiv", 90000), "child (trial plan) sees the neutral 'Familienpaket aktiv' line instead of a buy button (S8)");
      check(!(await page.evaluate(() => document.body.innerText)).includes("CHF"), "child sees no prices");
      check(await page.getByRole("button", { name: /Familienpaket buchen/ }).count() === 0, "no buy button for children");
      check(calls.length === 0, "no billing API calls for children");
      await ctx.close();
    }
    // server flag off / route missing (503/404): friendly message, retry + contact, no crash
    for (const code of [503, 404]) {
      scope = `schul-admin on api-${code}`;
      const { ctx, page } = await actor(base, { role: "teacher", rpc: schoolRpc, vp: { w: 1280, h: 900 }, billing: { status: { school: code } } });
      await page.goto(`${base}/schul-admin`, { waitUntil: "domcontentloaded" });
      check(await visible(page, "Die Online-Bezahlung ist noch nicht freigeschaltet", 90000), `${code}: friendly 'noch nicht freigeschaltet' message`);
      check(await page.locator("#abo").getByRole("link", { name: "Kontakt aufnehmen" }).isVisible(), `${code}: contact link offered`);
      if (code === 503) await elementShot(page, "#abo", "schul-admin-billing-on-api-503");
      await ctx.close();
    }
    // subscribed: status + "Abo verwalten" (portal)
    scope = "schul-admin on subscribed";
    {
      const sub = { enabled: true, plan: "professional", status: "active", studentLimit: 300, validUntil: day(300), cancelAtPeriodEnd: false, source: "stripe", subscriptionStatus: "active", collectionMethod: "send_invoice", latestInvoiceStatus: "open" };
      const { ctx, page, calls } = await actor(base, { role: "teacher", rpc: schoolRpc, vp: { w: 1280, h: 900 }, billing: { status: { school: sub } } });
      await page.goto(`${base}/schul-admin?billing=cancel`, { waitUntil: "domcontentloaded" });
      check(await visible(page, "Abo verwalten", 90000), "subscription: 'Abo verwalten' shown");
      check(await visible(page, "Bezahlung abgebrochen"), "?billing=cancel shows the cancel message");
      check(await visible(page, "Die Rechnung ist offen"), "open invoice hint");
      await elementShot(page, "#abo", "schul-admin-billing-on-subscribed");
      await page.getByRole("button", { name: "Abo verwalten" }).click();
      await page.waitForURL(/portal=1/, { timeout: 60000 }).catch(() => {});
      check(calls.some((c) => c.path === "/api/billing/portal" && c.body?.schoolId === SCHOOL_ID), "portal is requested for the school");
      check(page.url().includes("portal=1"), "redirects to the portal URL", page.url());
      await ctx.close();
    }
  }
}

const browser = await launch();
try {
  for (const flag of args.flag ? [args.flag] : ["off", "on"]) {
    const server = await startServer(flag);
    try { await runState(flag, server.base); } finally { await server.stop(); }
  }
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${problems.length ? `, ${problems.length} page problem(s)` : ""}`);
for (const p of problems) console.log("PROBLEM", p);
process.exitCode = failed.length || problems.length ? 1 : 0;
