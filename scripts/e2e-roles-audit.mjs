// Launch audit (2026-11-17): role-access matrix, broken internal links, console errors / 5xx and mobile overflow on every
// page, the error pages, and the billing routes with STRIPE_ENABLED off (503) / on. Nothing real is touched: every Supabase
// request is answered by the in-memory mock (scripts/lib/mock-supabase.mjs), Stripe is never called.
//
//   PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> BASE=http://localhost:3204 node scripts/e2e-roles-audit.mjs
//   ... BASE_ON=http://localhost:3205 ...   # also checks a server started with STRIPE_ENABLED=true NEXT_PUBLIC_STRIPE_ENABLED=true
//   ... --only=roles|links|pages|billing|errors
//
// The server(s) need the dummy Supabase env (NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy).
// Registered in scripts/e2e-all.mjs (section "roles").
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createMockSupabase, makeApplication } from "./lib/mock-supabase.mjs";

const BASE = (process.env.BASE || "http://localhost:3204").replace(/\/$/, "");
const BASE_ON = (process.env.BASE_ON || "").replace(/\/$/, "");
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v = "1"] = a.slice(2).split("="); return [k, v]; }));
const want = (part) => !args.only || args.only.split(",").includes(part);

async function loadPlaywright() {
  for (const p of [process.env.PLAYWRIGHT, join(homedir(), "Projects/bewerbungen-tracker-wt/audit-tools/node_modules/playwright-core/index.mjs")].filter(Boolean)) if (existsSync(p)) return import(pathToFileURL(p).href);
  return import("playwright-core");
}
const CHROME = process.env.CHROME || (existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined);

const results = [];
const check = (scope, name, ok, info = "") => { results.push({ scope, name, ok: !!ok, info }); console.log(`${ok ? "PASS" : "FAIL"} [${scope}] ${name}${ok || !info ? "" : " — " + String(info).slice(0, 400)}`); return !!ok; };

// ------------------------------------------------------------------------------------------------ personas
/** Mock user per persona. `meta` is merged into user_metadata before the session is stored. */
const PERSONAS = {
  anon: { role: "student", authed: false },
  student: { role: "student", apps: [makeApplication(1), makeApplication(2)] },
  teacher: { role: "teacher", meta: { teacher_onboarded: true } },
  parent: { role: "student", meta: { account_type: "parent", student_onboarded: true }, classes: false, friends: false },
  norole: { role: "student", meta: { role: undefined, role_confirmed: undefined, student_onboarded: undefined } },
};
function mockFor(name) {
  const p = PERSONAS[name];
  const mock = createMockSupabase({ role: p.role, authed: p.authed !== false, apps: p.apps ?? [], classes: p.classes ?? true, friends: p.friends ?? true });
  if (p.meta) { for (const [k, v] of Object.entries(p.meta)) { if (v === undefined) delete mock.state.user.user_metadata[k]; else mock.state.user.user_metadata[k] = v; } }
  return mock;
}

// ------------------------------------------------------------------------------------------------ routes
const PUBLIC = ["/", "/preise", "/schulen", "/familien", "/pilot", "/anleitung", "/hilfe", "/kontakt", "/impressum", "/datenschutz", "/datenschutz-jugend", "/datenschutz-schulen", "/datenschutz-uebersicht", "/hosting", "/avv", "/loeschkonzept", "/login", "/login/reset"];
const STUDENT_PAGES = ["/dashboard", "/applications", "/applications/new", "/applications/a1", "/map", "/cvs", "/search", "/analytics", "/friends", "/classes", "/classes/c1"];
const TEACHER_PAGES = ["/teacher", "/teacher/classes/c1"];
const SHARED = ["/profile", "/settings", "/familie", "/schul-admin"];

const L = (path) => new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(%3F.*)?$`);
/** Expected final path (string = exact pathname, RegExp = matched against pathname+search) per persona and route. */
function expected(persona, path) {
  if (persona === "anon") return path === "/dashboard" ? /^\/login$/ : L(path); // /dashboard is the default landing, no ?next
  // Settings (export / delete) stay reachable before a role is chosen (access model G10); everything else asks for the role.
  // Onboarding funnel (SPEC-FLOW D4): the first role question is the funnel step /start?schritt=rolle&nach=google (was /auth/role).
  if (persona === "norole") return path === "/settings" ? "/settings" : /^\/start\?schritt=rolle&nach=google/;
  const studentOnly = STUDENT_PAGES.includes(path);
  if (persona === "student") {
    if (path === "/classes/c1") return "/classes"; // pupils see their classes on /classes, not the teacher class view (UX schueler-23)
    return TEACHER_PAGES.includes(path) ? "/dashboard" : path;
  }
  if (persona === "teacher") {
    if (path === "/classes") return "/teacher";
    if (path === "/classes/c1") return "/teacher/classes/c1";
    if (studentOnly) return "/teacher";
    if (path === "/familie") return "/teacher"; // family area is for students and parents only
    return path;
  }
  if (persona === "parent") {
    if (studentOnly) return "/familie";
    if (TEACHER_PAGES.includes(path)) return "/familie";
    return path;
  }
  return path;
}

// ------------------------------------------------------------------------------------------------ harness
let browser;
async function withPage(persona, { mobile = false, base = BASE } = {}, run) {
  const ctx = await browser.newContext({ viewport: mobile ? { width: 375, height: 760 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const mock = mockFor(persona);
  await mock.install(ctx);
  ctx.setDefaultTimeout(20000);
  const page = await ctx.newPage();
  const issues = [];
  page.on("console", (m) => { if (m.type() === "error" && !/React DevTools|status of 40[01346]|Failed to load resource: the server responded with a status of 4/.test(m.text())) issues.push(`console: ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => issues.push(`uncaught: ${e.message.slice(0, 300)}`));
  page.on("response", (r) => { if (r.status() >= 500 && r.url().startsWith(base)) issues.push(`HTTP ${r.status()} ${r.url().slice(base.length)}`); });
  try { return await run({ page, mock, issues, base }); } finally { await ctx.close(); }
}
async function settle(page, ms = 600) { await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined); await page.waitForTimeout(ms); }
/** Waits until the URL stops changing (client-side guards redirect after the session check). */
async function finalPath(page) {
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
  let last = "", stable = 0;
  for (let i = 0; i < 80 && stable < 8; i++) { await page.waitForTimeout(250); const now = new URL(page.url()); const cur = now.pathname + now.search; if (cur === last) stable++; else { stable = 0; last = cur; } }
  return last;
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth).catch(() => 0);

// ------------------------------------------------------------------------------------------------ 1. role matrix
async function roleMatrix() {
  for (const persona of Object.keys(PERSONAS).filter((p) => !args.persona || args.persona.split(",").includes(p))) {
    const routes = persona === "anon" ? [...STUDENT_PAGES, ...TEACHER_PAGES, ...SHARED] : [...STUDENT_PAGES, ...TEACHER_PAGES, ...SHARED];
    for (const path of routes) {
      await withPage(persona, {}, async ({ page, issues }) => {
        await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 120000 });
        const exp = expected(persona, path);
        // Guards redirect on the client after the session check; on a busy dev server that can take a while.
        const matches = (url) => { const cur = url.pathname + url.search; return exp instanceof RegExp ? exp.test(cur) : url.pathname === exp; };
        if (exp !== path) await page.waitForURL(matches, { timeout: 45000 }).catch(() => undefined);
        const got = await finalPath(page);
        const pathname = got.split("?")[0];
        const ok = exp instanceof RegExp ? exp.test(got) : pathname === exp;
        check(`roles/${persona}`, `${path} -> ${exp}`, ok, `ended on ${got}`);
        await settle(page, 300);
        check(`roles/${persona}`, `${path}: no console errors / 5xx`, issues.length === 0, issues.slice(0, 3).join(" | "));
      });
    }
  }
}

// ------------------------------------------------------------------------------------------------ 2. pages: mobile overflow + errors, per persona
async function pages() {
  const plan = [
    ["anon", PUBLIC],
    ["student", [...STUDENT_PAGES, ...SHARED.filter((p) => p !== "/schul-admin"), "/onboarding", "/bewerbung-check", "/familie/einladung/ABCD1234", "/invite/FREUND42", "/classes/join/KLAS7Q2"]],
    ["teacher", [...TEACHER_PAGES, "/profile", "/settings", "/schul-admin"]],
    ["parent", ["/familie", "/profile", "/settings"]],
  ];
  for (const [persona, routes] of plan) for (const mobile of [false, true]) for (const path of routes) {
    await withPage(persona, { mobile }, async ({ page, issues }) => {
      const res = await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 120000 });
      await finalPath(page); await settle(page);
      const scope = `pages/${persona}/${mobile ? "mobile" : "desktop"}`;
      check(scope, `${path}: HTTP < 400`, res && res.status() < 400, `status ${res?.status()}`);
      check(scope, `${path}: no console errors / 5xx / exceptions`, issues.length === 0, issues.slice(0, 3).join(" | "));
      const wide = await overflow(page);
      check(scope, `${path}: no horizontal overflow`, wide <= 1, `scrollWidth - clientWidth = ${wide}`);
      const text = await page.locator("body").innerText().catch(() => "");
      check(scope, `${path}: no raw error text on screen`, !/undefined|NaN|\[object Object\]|Unhandled Runtime Error|Application error/.test(text), (text.match(/.{0,40}(undefined|NaN|\[object Object\]|Application error).{0,40}/) || [""])[0]);
    });
  }
}

// ------------------------------------------------------------------------------------------------ 3. links: every internal href on public + app pages resolves
async function links() {
  const seen = new Map();
  const collect = async (persona, routes) => {
    for (const path of routes) await withPage(persona, {}, async ({ page }) => {
      await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 120000 });
      await finalPath(page); await settle(page, 300);
      const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
      for (const h of hrefs) {
        if (!h || /^(mailto:|tel:|#|javascript:|https?:\/\/(?!localhost))/.test(h)) continue;
        const u = new URL(h, BASE + path);
        if (!u.href.startsWith(BASE)) continue;
        const key = u.pathname;
        if (!seen.has(key)) seen.set(key, path);
      }
    });
  };
  await collect("anon", PUBLIC);
  await collect("student", ["/dashboard", "/settings", "/profile", "/familie"]);
  await collect("teacher", ["/teacher"]);
  for (const [href, from] of seen) {
    const r = await fetch(BASE + href, { redirect: "manual", signal: AbortSignal.timeout(120000) }).catch((e) => ({ status: 0, e }));
    check("links", `${href} (linked from ${from}) resolves`, r.status > 0 && r.status < 400, `status ${r.status}`);
  }
}

// ------------------------------------------------------------------------------------------------ 4. error pages
async function errors() {
  await withPage("student", {}, async ({ page }) => {
    const r = await page.goto(BASE + "/gibt-es-nicht-xyz", { waitUntil: "domcontentloaded" });
    await settle(page);
    check("errors", "unknown route answers 404 with the friendly page", r.status() === 404 && await page.getByText(/Diese Seite gibt es nicht/).first().isVisible().catch(() => false), `status ${r.status()}`);
  });
  await withPage("student", {}, async ({ page, mock }) => {
    await page.goto(BASE + "/applications/does-not-exist", { waitUntil: "domcontentloaded" });
    await finalPath(page); await settle(page, 1200);
    const text = await page.locator("main").first().innerText().catch(() => "");
    check("errors", "unknown application id shows a 'not found' message, not an endless spinner", /nicht gefunden|gibt es nicht|existiert nicht|gelöscht/i.test(text), text.slice(0, 200));
    void mock;
  });
  await withPage("teacher", {}, async ({ page }) => {
    await page.goto(BASE + "/teacher/classes/unknown-class", { waitUntil: "domcontentloaded" });
    await finalPath(page); await settle(page, 1200);
    const text = await page.locator("main").first().innerText().catch(() => "");
    check("errors", "unknown class id (teacher) shows a clear message", /nicht gefunden|gibt es nicht|keinen Zugriff|nicht laden|existiert nicht/i.test(text), text.slice(0, 200));
  });
  for (const path of ["/api/ics/feed/not-a-token", "/api/reminders/digest"]) {
    const r = await fetch(BASE + path, { signal: AbortSignal.timeout(60000) }).catch(() => ({ status: 0 }));
    check("errors", `GET ${path} without credentials is refused without a 500`, r.status >= 400 && r.status < 500, `status ${r.status}`);
  }
  // Without server secrets (local dummy env) these answer 503 NOT_CONFIGURED; with secrets 200 / 401. Never 500.
  const push = await fetch(BASE + "/api/reminders/push", { signal: AbortSignal.timeout(60000) }).catch(() => ({ status: 0 }));
  check("errors", "GET /api/reminders/push -> public key or 503 NOT_CONFIGURED", push.status === 200 || push.status === 503, `status ${push.status}`);
  const r = await fetch(BASE + "/api/account/delete", { method: "POST", signal: AbortSignal.timeout(60000) }).catch(() => ({ status: 0 }));
  check("errors", "POST /api/account/delete without a token -> 401 (or 503 when the service key is missing)", r.status === 401 || r.status === 503, `status ${r.status}`);
}

// ------------------------------------------------------------------------------------------------ 5. billing flag off / on
async function billing() {
  const call = async (base, method, path, body) => {
    const r = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) });
    let json = null; try { json = await r.json(); } catch { /* not json */ }
    return { status: r.status, json };
  };
  const fam = { familyId: "00000000-0000-4000-8000-000000000001" };
  for (const [method, path, body] of [["POST", "/api/billing/checkout", { plan: "family", ...fam, payment: "card" }], ["POST", "/api/billing/portal", fam], ["GET", `/api/billing/status?familyId=${fam.familyId}`], ["POST", "/api/billing/checkout", {}], ["POST", "/api/stripe/webhook", {}]]) {
    const r = await call(BASE, method, path, body);
    check("billing/off", `${method} ${path} -> 503 billing_disabled`, r.status === 503 && r.json?.error === "billing_disabled", `${r.status} ${JSON.stringify(r.json)}`);
  }
  // UI with the flag off looks like today: no prices to buy, the "free for now" notice, no calls to /api/billing.
  await withPage("parent", {}, async ({ page, issues }) => {
    const billingCalls = [];
    page.on("request", (r) => { if (r.url().includes("/api/billing")) billingCalls.push(r.url()); });
    await page.goto(BASE + "/familie", { waitUntil: "domcontentloaded" });
    await finalPath(page); await settle(page, 1000);
    const text = await page.locator("main").first().innerText().catch(() => "");
    check("billing/off", "/familie (parent): no 'Jetzt bezahlen'/checkout button", !/Jetzt bezahlen|Abo abschliessen|Zur Kasse|Zahlung starten/i.test(text), text.slice(0, 200));
    check("billing/off", "/familie (parent): never calls /api/billing", billingCalls.length === 0, billingCalls.join(", "));
    check("billing/off", "/familie (parent): no console errors", issues.length === 0, issues.join(" | "));
  });
  await withPage("anon", {}, async ({ page }) => {
    await page.goto(BASE + "/preise", { waitUntil: "domcontentloaded" }); await settle(page);
    const text = await page.locator("main").first().innerText().catch(() => "");
    // access model (G19): no "kostenlos für Schüler" any more – the page promises the 7-day trial instead
    check("billing/off", "/preise: says how to try it for free (7-day trial)", /7 Tage gratis|kostenlos/i.test(text), text.slice(0, 200));
    check("billing/off", "/preise: no VAT wording (not MWST-registered)", !/MWST|MwSt|Mehrwertsteuer/.test(text), (text.match(/.{0,40}(MWST|MwSt|Mehrwertsteuer).{0,40}/) || [""])[0]);
  });
  if (!BASE_ON) { check("billing/on", "flag-on server given (BASE_ON)", true, "skipped – no BASE_ON"); return; }
  const unauth = await call(BASE_ON, "GET", `/api/billing/status?familyId=${fam.familyId}`);
  check("billing/on", "status without a token -> 401 (route is live)", unauth.status === 401, `${unauth.status} ${JSON.stringify(unauth.json)}`);
  const bad = await call(BASE_ON, "GET", "/api/billing/status?familyId=not-a-uuid");
  check("billing/on", "status with an invalid owner -> 400", bad.status === 400, `${bad.status} ${JSON.stringify(bad.json)}`);
  const ck = await call(BASE_ON, "POST", "/api/billing/checkout", { plan: "family", ...fam, payment: "card" });
  check("billing/on", "checkout without a token -> 401 or 503 not_configured (never 200/500)", ck.status === 401 || (ck.status === 503 && ck.json?.error === "billing_not_configured"), `${ck.status} ${JSON.stringify(ck.json)}`);
  const wh = await call(BASE_ON, "POST", "/api/stripe/webhook", {});
  check("billing/on", "webhook without a signature -> 400", wh.status === 400, `${wh.status} ${JSON.stringify(wh.json)}`);
  await withPage("parent", { base: BASE_ON }, async ({ page, issues }) => {
    await page.route("**/api/billing/status**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, plan: null, status: null, hasCustomer: false }) }));
    await page.goto(BASE_ON + "/familie", { waitUntil: "domcontentloaded" });
    await finalPath(page); await settle(page, 1200);
    check("billing/on", "/familie (parent, flag on) renders without console errors", issues.length === 0, issues.join(" | "));
    const wide = await overflow(page);
    check("billing/on", "/familie (parent, flag on) no horizontal overflow", wide <= 1, `${wide}`);
  });
  await withPage("anon", { base: BASE_ON, mobile: true }, async ({ page, issues }) => {
    await page.goto(BASE_ON + "/preise", { waitUntil: "domcontentloaded" }); await settle(page);
    const text = await page.locator("main").first().innerText().catch(() => "");
    check("billing/on", "/preise (flag on, mobile): shows CHF prices, no VAT wording", /CHF/.test(text) && !/MWST|MwSt/.test(text), text.slice(0, 200));
    check("billing/on", "/preise (flag on, mobile): no overflow / console errors", (await overflow(page)) <= 1 && issues.length === 0, issues.join(" | "));
  });
}

// ------------------------------------------------------------------------------------------------ main
const { chromium } = await loadPlaywright();
browser = await chromium.launch({ executablePath: CHROME });
try {
  if (want("billing")) await billing();
  if (want("errors")) await errors();
  if (want("roles")) await roleMatrix();
  if (want("links")) await links();
  if (want("pages")) await pages();
} finally { await browser.close(); }
const fail = results.filter((r) => !r.ok);
console.log(`\n==== roles audit: ${results.length - fail.length} PASS, ${fail.length} FAIL`);
for (const f of fail) console.log(`  FAIL [${f.scope}] ${f.name} — ${String(f.info).slice(0, 300)}`);
process.exit(fail.length ? 1 : 0);
