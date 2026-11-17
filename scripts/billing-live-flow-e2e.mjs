// LIVE end-to-end run of the family + billing flow against the Netlify preview (Stripe TEST MODE only).
// Real Supabase (bhwreehwirrloxagyypi), real Stripe sandbox Checkout + customer portal, real webhook on the preview.
//
//   PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome binary> node --experimental-strip-types scripts/billing-live-flow-e2e.mjs
//   PHASE=cleanup node --experimental-strip-types scripts/billing-live-flow-e2e.mjs   # only delete the test data in /tmp state
//
// Secrets: the Supabase service key is fetched at runtime via `sb privat projects api-keys` and the Stripe key is read
// is used by the logged-in Stripe CLI (sandbox). Neither is ever printed or written to disk. Refuses to run unless Stripe answers in test mode.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
if (/^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? "")) throw new Error("Live key detected – test mode only.");

const BASE = process.env.BASE || "https://stripe-preview--bewerbungen-pawat.netlify.app";
const REF = "bhwreehwirrloxagyypi";
const SB_URL = `https://${REF}.supabase.co`;
const SHOTS = join(ROOT, "docs/billing/screenshots/flow-2026-11-16");
const STATE = process.env.STATE || "/tmp/wendapply-live-e2e-state.json";
const PASSWORD = "E2e-Test-" + Math.random().toString(36).slice(2, 10) + "!";
mkdirSync(SHOTS, { recursive: true });

function serviceKey() {
  const out = execFileSync(join(homedir(), "JARVIS/bin/sb"), ["privat", "projects", "api-keys", "--project-ref", REF, "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const keys = JSON.parse(out.slice(out.indexOf("["), out.lastIndexOf("]") + 1));
  const k = keys.find((x) => x.name === "service_role")?.api_key;
  if (!k) throw new Error("service_role key not found");
  return k;
}
const SERVICE = serviceKey();
const adminHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
async function sb(path, init = {}) {
  const r = await fetch(SB_URL + path, { ...init, headers: { ...adminHeaders, ...(init.headers || {}) } });
  const text = await r.text();
  let body; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: r.status, body };
}
async function findUser(email) {
  for (let page = 1; page <= 50; page++) {
    const r = await sb(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = r.body?.users ?? [];
    const u = users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (u) return u;
    if (users.length < 200) return null;
  }
  return null;
}

// Stripe via the logged-in Stripe CLI (sandbox account, test mode). Keys stay inside the CLI / keychain.
function stripeCli(args) {
  const out = execFileSync("stripe", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const j = JSON.parse(out.slice(out.indexOf("{")));
  if (j?.error) throw new Error(`stripe ${args[0]} ${args[1]}: ${j.error.message}`);
  return j;
}
const stripe = {
  balance: { retrieve: async () => stripeCli(["balance", "retrieve"]) },
  customers: {
    search: async ({ query }) => stripeCli(["customers", "search", "--query", query]),
    list: async ({ email, limit }) => stripeCli(["customers", "list", "--email", email, "--limit", String(limit)]),
    retrieve: async (id) => stripeCli(["customers", "retrieve", id]),
    del: async (id) => stripeCli(["customers", "delete", id, "--confirm"]),
  },
  subscriptions: {
    list: async ({ customer, limit = 20 }) => stripeCli(["subscriptions", "list", "--customer", customer, "--status", "all", "--limit", String(limit)]),
    retrieve: async (id) => stripeCli(["subscriptions", "retrieve", id]),
    cancel: async (id) => stripeCli(["subscriptions", "cancel", id, "--confirm"]),
  },
};
if ((await stripe.balance.retrieve()).livemode !== false) throw new Error("Stripe answered in LIVE mode – aborting.");

const loadState = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {});
const saveState = (s) => writeFileSync(STATE, JSON.stringify(s, null, 2));
const state = loadState();

// ---------- cleanup ----------
async function cleanup() {
  const s = loadState();
  const log = [];
  const familyIds = new Set(s.familyIds ?? []);
  for (const email of [s.parentEmail, s.studentEmail].filter(Boolean)) {
    const u = await findUser(email);
    if (!u) { log.push(`user ${email}: already gone`); continue; }
    const fam = await sb(`/rest/v1/family_members?user_id=eq.${u.id}&select=family_id`);
    for (const row of Array.isArray(fam.body) ? fam.body : []) familyIds.add(row.family_id);
    const fam2 = await sb(`/rest/v1/families?created_by=eq.${u.id}&select=id`);
    for (const row of Array.isArray(fam2.body) ? fam2.body : []) familyIds.add(row.id);
  }
  // Stripe: every test customer tagged with one of our family ids, or with our e-mails.
  const custIds = new Set();
  for (const fid of familyIds) {
    const res = await stripe.customers.search({ query: `metadata['family_id']:'${fid}'` }).catch(() => ({ data: [] }));
    res.data.forEach((c) => custIds.add(c.id));
  }
  for (const id of s.customerIds ?? []) custIds.add(id);
  for (const fid of familyIds) {
    const r = await sb(`/rest/v1/billing_customers?family_id=eq.${fid}&select=stripe_customer_id`);
    for (const row of Array.isArray(r.body) ? r.body : []) custIds.add(row.stripe_customer_id);
  }
  for (const email of [s.parentEmail, s.studentEmail].filter(Boolean)) {
    const res = await stripe.customers.list({ email, limit: 10 });
    res.data.forEach((c) => custIds.add(c.id));
  }
  for (const id of custIds) {
    const c = await stripe.customers.retrieve(id);
    if (c.livemode) throw new Error("live customer?!");
    const subs = await stripe.subscriptions.list({ customer: id, status: "all", limit: 20 });
    for (const sub of subs.data) if (!["canceled", "incomplete_expired"].includes(sub.status)) { await stripe.subscriptions.cancel(sub.id); log.push(`stripe sub ${sub.id} canceled`); }
    await stripe.customers.del(id);
    log.push(`stripe customer ${id} deleted`);
  }
  for (const fid of familyIds) {
    for (const t of ["billing_subscriptions", "billing_customers", "school_licences"]) {
      const r = await sb(`/rest/v1/${t}?family_id=eq.${fid}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
      if (r.status < 300) log.push(`${t} family ${fid}: ${Array.isArray(r.body) ? r.body.length : 0} rows deleted`);
      else log.push(`${t} family ${fid}: ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
    }
    const r = await sb(`/rest/v1/families?id=eq.${fid}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
    log.push(`family ${fid}: ${r.status} (${Array.isArray(r.body) ? r.body.length : "?"} deleted)`);
  }
  for (const email of [s.parentEmail, s.studentEmail].filter(Boolean)) {
    const u = await findUser(email);
    if (!u) continue;
    const r = await sb(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
    log.push(`user ${email}: delete ${r.status}`);
    if (r.status >= 300) log.push(`  ${JSON.stringify(r.body).slice(0, 200)}`);
  }
  for (const email of [s.parentEmail, s.studentEmail].filter(Boolean)) log.push(`verify ${email}: ${(await findUser(email)) ? "STILL EXISTS" : "gone"}`);
  console.log(log.join("\n"));
  return log;
}
if (process.env.PHASE === "cleanup") { await cleanup(); process.exit(0); }

// ---------- checks ----------
const results = [];
const ok = (id, name, pass, detail = "") => {
  results.push({ id, name, pass: !!pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  [${id}] ${name}${detail ? `  – ${detail}` : ""}`);
};
const FORBIDDEN = /bald verfügbar|Zugang anfragen|Warteliste|noch nicht freigeschaltet|Online-Bezahlung folgt/i;
const forbiddenHits = [];
const esszettHits = [];
const primaryIssues = [];
const noPrimary = [];
const consoleErrors = [];
let shotN = 0;
async function shot(page, name, { familie = page.url().includes("/familie") } = {}) {
  await page.waitForTimeout(400);
  const file = `${String(++shotN).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: join(SHOTS, file), fullPage: true });
  if (page.url().startsWith(BASE)) {
    const text = await page.evaluate(() => document.body.innerText).catch(() => "");
    const m = FORBIDDEN.exec(text);
    if (m) forbiddenHits.push(`${file}: "${m[0]}"`);
    if (/ß/.test(text)) esszettHits.push(file);
    if (familie) {
      const loading = await page.locator("[data-family-state=loading]").count();
      const n = await page.locator("[data-primary-action]:visible").count();
      if (!loading && n > 1) primaryIssues.push(`${file}: ${n} primary`);
      if (!loading && n === 0) noPrimary.push(file);
    }
  }
  console.log(`  shot ${file}  (${page.url().replace(/session_id=[^&]+/, "session_id=…")})`);
  return file;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { chromium } = await import(process.env.PLAYWRIGHT);
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true });
const desktop = { locale: "de-CH", viewport: { width: 1280, height: 800 }, colorScheme: "light" };
const mobileDark = { locale: "de-CH", viewport: { width: 390, height: 844 }, colorScheme: "dark", isMobile: true, hasTouch: true };

function watch(page, label, billingCalls) {
  page.on("console", (m) => { if (m.type() === "error" && page.url().startsWith(BASE)) consoleErrors.push(`${label}: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => consoleErrors.push(`${label} pageerror: ${String(e).slice(0, 200)}`));
  if (billingCalls) page.on("request", (r) => { if (r.url().includes("/api/billing/")) billingCalls.push(r.url()); });
}

async function signup(page, email, role, birthYear, tag) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Konto erstellen", exact: true }).click();
  await page.locator(`input[name=role][value=${role}]`).check({ force: true });
  if (birthYear) await page.locator("#signup-birth-year").selectOption(String(birthYear));
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.fill("#confirm-password", PASSWORD);
  await shot(page, `${tag}-signup-form`);
  await page.getByRole("button", { name: /Konto erstellen/ }).last().click();
  await page.waitForSelector(".status, [role=status], [role=alert]", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, `${tag}-signup-done`);
  const text = await page.evaluate(() => document.body.innerText);
  return /Fast geschafft/.test(text) ? "confirm" : page.url().includes("/login") ? "unknown" : "session";
}
async function confirmUser(email) {
  const u = await findUser(email);
  if (!u) return null;
  if (!u.email_confirmed_at) await sb(`/auth/v1/admin/users/${u.id}`, { method: "PUT", body: JSON.stringify({ email_confirm: true }) });
  return u;
}
async function login(page, email, tag) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: /^Anmelden/ }).last().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot(page, `${tag}-after-login`, { familie: false });
  return new URL(page.url()).pathname;
}
async function gotoFamilie(page, qs = "") {
  await page.goto(`${BASE}/familie${qs}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-family-state]:not([data-family-state=loading])", { timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
}
async function famState(page) { return page.locator("[data-family-state]").first().getAttribute("data-family-state"); }

async function openCheckout(page, interval) {
  if (interval === "month") await page.getByLabel(/monat/i).first().check({ force: true }).catch(() => {});
  const buy = page.getByRole("button", { name: /Familienpaket (wieder )?buchen/ }).first();
  await buy.click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 45_000 });
  await page.waitForSelector("#cardNumber, #payment-method-accordion-item-title-card, [data-testid=card-accordion-item]", { timeout: 60_000 });
  if (!(await page.locator("#cardNumber").isVisible().catch(() => false))) {
    const radio = page.locator("#payment-method-accordion-item-title-card, [data-testid=card-accordion-item] input[type=radio]").first();
    if (await radio.count()) await radio.check({ force: true }).catch(() => radio.click({ force: true }));
    else await page.getByText("Karte", { exact: true }).first().click();
    await page.waitForSelector("#cardNumber", { state: "visible", timeout: 30_000 });
  }
}
async function fillCard(page, number) {
  const email = page.locator("#email");
  if (await email.isVisible().catch(() => false) && await email.isEditable().catch(() => false) && !(await email.inputValue())) await email.fill(state.parentEmail);
  await page.fill("#cardNumber", number);
  await page.fill("#cardExpiry", "12 / 34");
  await page.fill("#cardCvc", "123");
  const name = page.locator("#billingName");
  if (await name.isVisible().catch(() => false)) await name.fill("E2E Elternteil");
  const country = page.locator("#billingCountry");
  if (await country.count()) await country.selectOption("CH").catch(() => {});
  for (const [sel, val] of [["#billingAddressLine1", "Teststrasse 1"], ["#billingPostalCode", "8000"], ["#billingLocality", "Zürich"]]) {
    const f = page.locator(sel);
    if (await f.count() && await f.isVisible()) await f.fill(val);
  }
  const link = page.locator("#enableStripePass");
  if (await link.count() && await link.isChecked().catch(() => false)) await link.uncheck().catch(() => {});
}

// ================= RUN =================
const ts = Date.now();
state.parentEmail = `wendapply-e2e-parent-${ts}@example.com`;
state.studentEmail = `wendapply-e2e-student-${ts}@example.com`;
state.familyIds = [];
saveState(state);
console.log(`parent ${state.parentEmail}\nstudent ${state.studentEmail}`);

const studentBilling = [];
const pCtx = await browser.newContext(desktop);
const sCtx = await browser.newContext(desktop);
const P = await pCtx.newPage(); watch(P, "parent");
const S = await sCtx.newPage(); watch(S, "student", studentBilling);

let fatal = null;
try {
  // ---- 1. Signup + confirm + login ----
  const pSign = await signup(P, state.parentEmail, "parent", null, "parent");
  ok("F1", "Parent signup via /login (role Elternteil)", pSign !== "unknown", pSign);
  const pu = await confirmUser(state.parentEmail);
  ok("F1", "Parent confirmed via Supabase admin API", !!pu, pu?.user_metadata?.account_type ?? "");
  const pLand = await login(P, state.parentEmail, "parent");
  ok("F2", "Parent login lands on /familie (no student onboarding)", pLand.startsWith("/familie"), pLand);

  const sSign = await signup(S, state.studentEmail, "independent", 2012, "student");
  ok("F1", "Student signup (Schüler:in privat, Jahrgang 2012)", sSign !== "unknown", sSign);
  const su = await confirmUser(state.studentEmail);
  ok("F1", "Student confirmed via admin API", !!su);
  const sLand = await login(S, state.studentEmail, "student");
  ok("F3", "Student login lands on onboarding/dashboard", /onboarding|dashboard/.test(sLand), sLand);
  if (sLand.includes("onboarding")) {
    // Walk the 5-step tour to "Fertig" and use the parents link (AC-S7), like scripts/onboarding-tour-e2e.mjs.
    try {
      await S.getByRole("button", { name: /Los geht/ }).click();
      await S.getByLabel("Vorname").fill("Mia");
      await S.getByRole("button", { name: "Weiter", exact: true }).click();
      await S.getByRole("button", { name: "Weiter", exact: true }).click();
      await shot(S, "student-onboarding-profile", { familie: false });
      await S.getByRole("button", { name: /Speichern & weiter/ }).click();
      await S.getByRole("button", { name: "Mache ich später" }).click();
      await S.getByRole("heading", { name: /KI-Check/ }).waitFor();
      await S.getByRole("button", { name: /^Später/ }).click();
      await S.getByTestId("tour-family-link").waitFor({ timeout: 15_000 });
    } catch (e) { console.log("  tour walk:", String(e).split("\n")[0]); }
    await shot(S, "student-onboarding-fertig", { familie: false });
    const tl = S.getByTestId("tour-family-link");
    ok("AC-S7", "Tour step 'Fertig' shows 'Eltern verbinden (freiwillig)' → /familie", await tl.count() > 0 && /Eltern verbinden \(freiwillig\)/.test(await tl.innerText()));
    if (await tl.count()) { await tl.click(); await S.waitForURL(/\/familie/, { timeout: 20_000 }).catch(() => {}); ok("AC-S7", "Tour link opens /familie", S.url().includes("/familie"), S.url().replace(BASE, "")); }
  }

  // ---- 2. Parent start + create family ----
  await gotoFamilie(P);
  await shot(P, "parent-familie-start");
  ok("AC-P1", "Parent start: state parent-start, step family=current", (await famState(P)) === "parent-start" && await P.locator("[data-step=family][data-state=current]").count() === 1, await famState(P));
  ok("AC-P1", "Parent start: no buy button / price before family", await P.getByRole("button", { name: /Familienpaket.*buchen/ }).count() === 0);
  await P.locator("[data-primary-action]").first().click(); // Familie erstellen (empty name)
  await P.waitForSelector("[data-step=family][data-state=done]", { timeout: 20_000 });
  await P.waitForLoadState("networkidle").catch(() => {});
  await shot(P, "parent-family-created");
  ok("AC-P2", "Family created, step1 done text 'Familie «Meine Familie» erstellt'", /Familie «Meine Familie» erstellt/.test(await P.evaluate(() => document.body.innerText)));
  ok("AC-P2", "Step child=current, primary 'Code für mein Kind erstellen'", /Code für mein Kind erstellen/.test(await P.locator("[data-primary-action]").first().innerText()));
  const famRow = await sb(`/rest/v1/family_members?user_id=eq.${pu.id}&select=family_id`);
  const familyId = famRow.body?.[0]?.family_id;
  if (familyId) { state.familyIds.push(familyId); saveState(state); }
  ok("F4", "Family row exists in Supabase", !!familyId, familyId ?? "");

  // ---- 3. Invite code ----
  await P.locator("[data-primary-action]").first().click();
  await P.waitForSelector("[data-testid=invite-code]", { timeout: 20_000 });
  const code = (await P.locator("[data-testid=invite-code]").first().innerText()).replace(/\s+/g, "");
  await shot(P, "parent-invite-code");
  ok("AC-P3", "Invite code shown with 'Gültig bis' and waiting text", /^[A-Z0-9]{8}$/.test(code) && /Gültig bis/.test(await P.evaluate(() => document.body.innerText)) && await P.locator("[data-invite-waiting]").count() > 0, code);
  await P.reload({ waitUntil: "networkidle" });
  await P.waitForSelector("[data-testid=invite-code]", { timeout: 20_000 }).catch(() => {});
  const codeAfter = (await P.locator("[data-testid=invite-code]").first().innerText().catch(() => "")).replace(/\s+/g, "");
  ok("AC-P3", "Same open code shown after reload", codeAfter === code, codeAfter);

  // ---- 4. Student joins with code ----
  await gotoFamilie(S);
  await shot(S, "student-familie-start");
  ok("AC-S1", "Student start: data-student-step=connect, primary 'Eltern einladen'", await S.locator("[data-student-step=connect]").count() > 0 && /Eltern einladen/.test(await S.locator("[data-primary-action]").first().innerText().catch(() => "")));
  ok("AC-S1", "Student start: no price / plan card", !/CHF/.test(await S.evaluate(() => document.body.innerText)));
  await S.getByTestId("join-toggle").click();
  const joinForm = S.getByTestId("join-form");
  await joinForm.locator("input").first().fill(code);
  await shot(S, "student-join-code");
  await joinForm.getByRole("button").last().click();
  await S.waitForSelector("[data-family-state=child]", { timeout: 20_000 });
  await S.waitForLoadState("networkidle").catch(() => {});
  await shot(S, "student-joined");
  ok("F5", "Student joined parent's family with the code", (await famState(S)) === "child");
  ok("AC-S4", "Student, no plan: child.planNone text, no badge", /Das Familienpaket bucht ein Elternteil/.test(await S.evaluate(() => document.body.innerText)));

  // ---- 5. Parent sees child (auto refresh) + consent ----
  const t0 = Date.now();
  await P.waitForSelector("[data-step=child][data-state=attention], [data-step=child][data-state=done]", { timeout: 40_000 }).catch(() => {});
  const autoMs = Date.now() - t0;
  const childStep = await P.locator("[data-step=child]").first().getAttribute("data-state").catch(() => null);
  ok("AC-P4", "Parent page picks up the joined child without reload", childStep === "attention" || childStep === "done", `${childStep} after ${Math.round(autoMs / 1000)} s`);
  await shot(P, "parent-child-joined-consent");
  if (childStep === "attention") {
    ok("AC-P5", "Under-16 child: primary 'Zustimmung geben'", /Zustimmung geben/.test(await P.locator("[data-primary-action]").first().innerText()));
    await P.locator("[data-primary-action]").first().click();
    await P.getByRole("dialog").waitFor();
    await shot(P, "parent-consent-modal", { familie: false });
    await P.getByRole("button", { name: "Ja, ich stimme zu" }).click();
    await P.waitForSelector("[data-step=plan][data-state=current]", { timeout: 20_000 }).catch(() => {});
  }
  await P.waitForLoadState("networkidle").catch(() => {});
  await shot(P, "parent-step3-plan");
  ok("AC-P5", "After consent: step plan=current", await P.locator("[data-step=plan][data-state=current]").count() === 1);
  const yearlyChecked = await P.locator("input[type=radio][value=year]").first().isChecked().catch(() => null);
  const primTxt = await P.locator("[data-primary-action]").first().innerText().catch(() => "");
  ok("AC-P6", "Yearly preselected, button 'Familienpaket buchen · CHF 79 pro Jahr', 'Spare CHF 15.80'", yearlyChecked !== false && /Familienpaket buchen.*CHF 79/.test(primTxt) && /Spare CHF 15.80/.test(await P.evaluate(() => document.body.innerText)), `${yearlyChecked} / ${primTxt.replace(/\s+/g, " ")}`);
  const mctx = await browser.newContext({ ...mobileDark, storageState: await pCtx.storageState() });
  const PM = await mctx.newPage(); watch(PM, "parent-mobile");
  await gotoFamilie(PM); await shot(PM, "parent-step3-plan-mobile-dark");

  // ---- 6. Checkout: cancel via back link ----
  await openCheckout(P, "year");
  await shot(P, "stripe-checkout-opened");
  const checkoutText = await P.evaluate(() => document.body.innerText);
  ok("F6", "Stripe Checkout shows Familienpaket CHF 79 / Jahr (test mode)", /79/.test(checkoutText) && /(Test|Sandbox)/i.test(checkoutText));
  const back = P.locator('a[href*="billing=cancel"]').first();
  if (await back.count()) await back.click(); else await P.goBack();
  await P.waitForURL((u) => u.toString().startsWith(BASE), { timeout: 30_000 });
  await P.waitForSelector("[data-billing-return=cancel]", { timeout: 20_000 }).catch(() => {});
  await shot(P, "checkout-canceled-return");
  ok("AC-P8", "Back from Checkout → 'Bezahlung abgebrochen', params removed, plan still current", await P.locator("[data-billing-return=cancel]").count() > 0 && !P.url().includes("billing=") && await P.locator("[data-step=plan][data-state=current]").count() === 1, P.url());

  // ---- 7. Checkout: declined card, then 4242 ----
  await openCheckout(P, "year");
  await fillCard(P, "4000 0000 0000 0002");
  await P.locator(".SubmitButton, button[type=submit]").first().click();
  const declined = await P.waitForFunction(() => /abgelehnt|declined/i.test(document.body.innerText), null, { timeout: 45_000 }).then(() => true).catch(() => false);
  await shot(P, "stripe-card-declined");
  ok("F7", "Declined card 4000 0000 0000 0002 shows an error and stays on Checkout", declined && P.url().includes("checkout.stripe.com"));
  await fillCard(P, "4242 4242 4242 4242");
  await shot(P, "stripe-card-4242-filled");
  await P.locator(".SubmitButton, button[type=submit]").first().click();
  await P.waitForURL((u) => u.toString().startsWith(BASE), { timeout: 90_000 });
  const retUrl = P.url();
  ok("F8", "4242 payment redirects back to /familie?billing=success", /\/familie\?billing=success/.test(retUrl), retUrl.replace(/session_id=[^&]+/, "session_id=…"));
  // Watch the page: buy button must never appear while activating.
  let buySeen = false; let activatingSeen = false;
  const tPay = Date.now();
  let activeSeen = false;
  while (Date.now() - tPay < 60_000) {
    if (await P.getByRole("button", { name: /Familienpaket (wieder )?buchen/ }).count()) buySeen = true;
    if (await P.locator("[data-billing-return=activating]").count()) { if (!activatingSeen) await shot(P, "return-activating"); activatingSeen = true; }
    if (await P.locator("[data-billing-return=active], [data-billing-state=active]").count()) { activeSeen = true; break; }
    await sleep(500);
  }
  await P.waitForLoadState("networkidle").catch(() => {});
  await shot(P, "return-active");
  ok("AC-P9", "Return shows activating notice, then active (webhook)", activeSeen, `activating seen: ${activatingSeen}, ${Math.round((Date.now() - tPay) / 1000)} s`);
  ok("AC-P9", "No buy button visible while activating", !buySeen);
  ok("AC-P9", "Stepper collapsed to 'Alles eingerichtet', 'Abo verwalten' visible", /Alles eingerichtet/.test(await P.evaluate(() => document.body.innerText)) && await P.getByRole("button", { name: "Abo verwalten" }).count() > 0);
  const lic = familyId ? await sb(`/rest/v1/school_licences?family_id=eq.${familyId}&select=status,plan_type`) : { body: [] };
  ok("F9", "DB licence row for the family is active", lic.body?.[0]?.status === "active", JSON.stringify(lic.body));
  const bc = familyId ? await sb(`/rest/v1/billing_customers?family_id=eq.${familyId}&select=stripe_customer_id`) : { body: [] };
  const custId = bc.body?.[0]?.stripe_customer_id;
  if (custId) { state.customerIds = [custId]; saveState(state); }
  const subs = custId ? await stripe.subscriptions.list({ customer: custId, status: "all" }) : { data: [] };
  ok("F9", "Exactly one active Stripe test subscription (no double purchase)", subs.data.filter((x) => x.status === "active").length === 1, subs.data.map((x) => `${x.id} ${x.status}`).join(", "));
  await gotoFamilie(PM); await shot(PM, "parent-active-mobile-dark");

  // ---- 8. Student sees unlocked state ----
  await gotoFamilie(S);
  await shot(S, "student-plan-active");
  ok("AC-S4", "Student sees 'Familienpaket aktiv'", /Familienpaket aktiv/.test(await S.evaluate(() => document.body.innerText)));
  const smctx = await browser.newContext({ ...mobileDark, storageState: await sCtx.storageState() });
  const SM = await smctx.newPage(); watch(SM, "student-mobile", studentBilling);
  await gotoFamilie(SM); await shot(SM, "student-plan-active-mobile-dark");

  // ---- 9. Abo & Rechnung → portal → cancel ----
  await gotoFamilie(P);
  const abo = P.locator("#abo");
  if (await abo.count()) await abo.scrollIntoViewIfNeeded();
  await shot(P, "parent-abo-rechnung");
  await P.getByRole("button", { name: "Abo verwalten" }).first().click();
  await P.waitForURL(/billing\.stripe\.com/, { timeout: 45_000 });
  await P.waitForLoadState("networkidle").catch(() => {});
  await shot(P, "stripe-portal");
  ok("F10", "'Abo verwalten' opens the Stripe customer portal", P.url().includes("billing.stripe.com"));
  const cancelBtn = P.locator('[data-test="cancel-subscription"], a:has-text("Abo kündigen"), a:has-text("Cancel subscription"), button:has-text("kündigen"), a:has-text("kündigen")').first();
  await cancelBtn.click();
  await P.waitForLoadState("networkidle").catch(() => {});
  await shot(P, "stripe-portal-cancel-confirm");
  await P.locator('[data-testid="confirm"], button:has-text("Abo kündigen"), button:has-text("Cancel subscription"), button:has-text("Kündigen")').last().click();
  await P.waitForTimeout(4000);
  const skip = P.locator('button:has-text("Überspringen"), button:has-text("Skip"), button:has-text("No thanks")').first();
  if (await skip.count()) await skip.click().catch(() => {});
  await P.waitForTimeout(2000);
  await shot(P, "stripe-portal-canceled");
  const subAfter = subs.data[0] ? await stripe.subscriptions.retrieve(subs.data[0].id) : null;
  ok("F11", "Subscription set to cancel at period end in Stripe", !!subAfter?.cancel_at_period_end || !!subAfter?.cancel_at || subAfter?.status === "canceled", `${subAfter?.status} cancel_at_period_end=${subAfter?.cancel_at_period_end} cancel_at=${subAfter?.cancel_at ? new Date(subAfter.cancel_at * 1000).toISOString().slice(0, 10) : null}`);
  const ret = P.locator('a[href*="/familie"], [data-testid="return-to-business-link"]').first();
  if (await ret.count()) await ret.click(); else await P.goto(`${BASE}/familie?billing=portal`);
  await P.waitForURL((u) => u.toString().startsWith(BASE), { timeout: 30_000 });
  const portalRet = P.url();
  let canceling = false;
  for (let i = 0; i < 20 && !canceling; i++) {
    await sleep(3000);
    if (i > 0 && i % 4 === 0) await gotoFamilie(P);
    canceling = await P.locator("[data-billing-state=canceling]").count() > 0;
  }
  await shot(P, "parent-after-portal-canceling");
  const bodyTxt = await P.evaluate(() => document.body.innerText);
  ok("AC-P12", "After portal cancel: state canceling, badge 'Gekündigt', 'läuft noch bis', 'Abo verlängern', no buy button", canceling && /Gekündigt/.test(bodyTxt) && /läuft noch bis/i.test(bodyTxt) && /Abo verlängern/.test(bodyTxt) && await P.getByRole("button", { name: /Familienpaket (wieder )?buchen/ }).count() === 0, portalRet.replace(BASE, ""));
  await gotoFamilie(PM); await shot(PM, "parent-canceling-mobile-dark");
  await gotoFamilie(S); await shot(S, "student-after-parent-cancel");
  ok("AC-S4", "Student still sees neutral text after cancel (no payment wording)", !/Gekündigt|Zahlung|Karte/.test(await S.locator("[data-billing-state=child]").first().innerText().catch(() => "")));

  // ---- 10. Public pages ----
  for (const [path, name] of [["/preise", "preise"], ["/familien", "familien"]]) {
    await P.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await shot(P, `public-${name}`, { familie: false });
  }
} catch (e) {
  fatal = e;
  console.log("FATAL", e?.stack ?? e);
  for (const [pg, n] of [[P, "parent"], [S, "student"]]) await pg.screenshot({ path: join(SHOTS, `zz-fatal-${n}.png`), fullPage: true }).catch(() => {});
}

ok("AC-G1", "'Bald verfügbar' & co. never rendered (all screenshots)", forbiddenHits.length === 0, forbiddenHits.join("; "));
ok("AC-G4", "No ß in rendered text", esszettHits.length === 0, esszettHits.join(", "));
ok("AC-G3", "Never more than one primary action on a /familie screen", primaryIssues.length === 0, primaryIssues.join("; "));
ok("AC-G3b", "Screens with no primary action (waiting/done/child states – info only)", true, noPrimary.join(", ") || "none");
ok("AC-S5", "Student never calls /api/billing/*", studentBilling.length === 0, studentBilling.join(", "));
ok("G-console", "No console errors on the app pages", consoleErrors.length === 0, consoleErrors.slice(0, 8).join(" | "));

writeFileSync(join(SHOTS, "results.json"), JSON.stringify({ base: BASE, ranAt: new Date().toISOString(), fatal: fatal ? String(fatal) : null, results, consoleErrors }, null, 2));
await browser.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed${fatal ? " (aborted early)" : ""}`);
if (process.env.KEEP !== "1") { console.log("\n--- cleanup ---"); await cleanup(); }
process.exit(failed || fatal ? 1 : 0);
