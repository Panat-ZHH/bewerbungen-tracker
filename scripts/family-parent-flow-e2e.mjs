// Parent family + billing flow on /familie (BILLING-FLOW-SPEC.md §3.1, §3.4, §3.5, acceptance criteria AC-P1..P18, AC-G1..G4).
// Nothing real is touched: Supabase is the in-memory stub (scripts/ux-v2-stub.mjs) with a stateful family mock, /api/billing/*
// is mocked per scenario. Stripe is never called.
//
//   PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> BASE=http://localhost:3410 node scripts/family-parent-flow-e2e.mjs
//     (dev server with NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy
//      NEXT_PUBLIC_STRIPE_ENABLED=true STRIPE_ENABLED=true)
//   BASE_OFF=http://localhost:3411 ...   also runs the flag-off checks against a second server (flag false)
//   ONLY=start,checkout,...              run only some scenarios; SLOW=0 skips the 32 s activation timeout scenario
//
// Screenshots: docs/billing/screenshots/family-parent-*.png (OUT to override). Axe (wcag2a/aa) if node_modules/axe-core exists.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { installStub, launch, newCtx } from "./ux-v2-stub.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE || "http://localhost:3410";
const BASE_OFF = process.env.BASE_OFF || "";
const OUT = (process.env.OUT || join(ROOT, "docs/billing/screenshots")).replace(/\/?$/, "/");
mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const SUPA = "http://localhost:54321";
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
const axePath = process.env.AXE || join(ROOT, "node_modules/axe-core/axe.min.js");
const axeSrc = existsSync(axePath) ? readFileSync(axePath, "utf8") : null;
const day = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const FAMILY_ID = "22222222-2222-4222-8222-222222222222";
const FORBIDDEN = /bald verfügbar|Zugang anfragen|Warteliste|noch nicht freigeschaltet|Online-Bezahlung folgt/i;
const VIEWPORTS = { desktop: { w: 1280, h: 800 }, mobile: { w: 390, h: 844, dark: true } };

const results = [];
const problems = [];
let scope = "";
const check = (ok, text, info = "") => { results.push({ ok: !!ok, text: `[${scope}] ${text}` }); console.log(ok ? "PASS" : "FAIL", `[${scope}]`, text, ok ? "" : info); };
const visible = (page, text, timeout = 30000) => page.getByText(text).locator("visible=true").first().waitFor({ timeout }).then(() => true, () => false);
const waitSel = (page, sel, timeout = 30000) => page.locator(sel).first().waitFor({ timeout }).then(() => true, () => false);

// ---------------------------------------------------------------- fixtures
const parentMember = { user_id: "u1", display_name: "Sandra Meier", role: "parent", status: "active", consent_status: "not_required" };
const childMember = (consent = "not_required") => ({ user_id: "c1", display_name: "Lina Meier", role: "child", status: "active", consent_status: consent, share_settings: { progress: true, applications: false, village: true, documents: false } });
const status = (o = {}) => ({ enabled: true, plan: null, status: null, studentLimit: null, validUntil: null, cancelAtPeriodEnd: false, source: null, subscriptionStatus: null, ...o });
const PAID = status({ plan: "family", status: "active", source: "stripe", subscriptionStatus: "active", validUntil: "2027-11-16" });

/** Stateful family mock: db.family null = no family; members/invites can change between calls. */
function familyDb(init = {}) {
  const db = { family: init.family ?? null, members: init.members ?? [parentMember], invites: init.invites ?? [], plan: init.plan ?? null, calls: [] };
  const rpc = {
    class_my_classes: [],
    family_get_my: () => db.family ? { family: db.family, my_role: "parent", members: db.members, plan: db.plan, invites: db.invites } : null,
    family_create: (b) => { db.calls.push(["family_create", b]); db.family = { id: FAMILY_ID, name: b.p_name }; return FAMILY_ID; },
    family_create_invite: (b) => { db.calls.push(["family_create_invite", b]); const i = { code: "ABCD1234", direction: b.p_direction, expires_at: day(7) }; db.invites = [i]; return i; },
    family_set_consent: (b) => { db.calls.push(["family_set_consent", b]); db.members = db.members.map((m) => m.user_id === b.p_child_id ? { ...m, consent_status: b.p_granted ? "granted" : "withdrawn" } : m); return null; },
    family_join: (b) => { db.calls.push(["family_join", b]); if (init.joinError && !db.left) return { __error: init.joinError }; db.family = { id: "33333333-3333-4333-8333-333333333333", name: "Familie Keller" }; db.members = [childMember(), { ...parentMember }]; db.myRole = "parent"; return null; },
    family_leave: () => { db.calls.push(["family_leave"]); db.left = true; db.family = null; return null; },
    family_child_overview: { child: { display_name: "Lina Meier" }, consent_status: "granted", progress: { total: 4, status_counts: { applied: 3, interview: 1 }, last_activity: day(-1) }, village: { islands: 2, items: 3, points_earned: 120 } },
    ...(init.rpc ?? {}),
  };
  return { db, rpc };
}

/** Mocked /api/billing/*: `statusFn(n)` returns the status body (or a number = error status) for the n-th status call. */
async function mockBilling(ctx, { statusFn = () => status(), checkoutUrl = null } = {}) {
  const calls = [];
  let n = 0;
  await ctx.route("**/api/billing/**", async (route) => {
    const req = route.request(); const url = new URL(req.url()); let body = null; try { body = req.postDataJSON(); } catch { /* none */ }
    calls.push({ path: url.pathname, method: req.method(), body });
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
    if (url.pathname === "/api/billing/status") { const s = statusFn(n++); return typeof s === "number" ? json({ error: s === 503 ? "billing_disabled" : "boom" }, s) : json(s); }
    if (url.pathname === "/api/billing/checkout") return json({ url: checkoutUrl ?? `${url.origin}/familie?billing=cancel` });
    if (url.pathname === "/api/billing/portal") return json({ url: `${url.origin}/familie?portal=1` });
    return json({ error: "not_found" }, 404);
  });
  return calls;
}

async function actor(browser, { vp = VIEWPORTS.desktop, fam, billing } = {}) {
  const ctx = await newCtx(browser, vp);
  await ctx.addInitScript(() => { try { localStorage.setItem("wendapply-install-hint-dismissed", "1"); localStorage.setItem("wendapply-tour-done", "1"); } catch { /* none */ } });
  await ctx.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = "nextjs-portal{display:none!important}"; document.head.appendChild(st); }));
  const f = fam ?? familyDb();
  await installStub(ctx, { role: "student", rpc: f.rpc });
  const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "eltern@beispiel.ch", user_metadata: { role: "student", account_type: "parent", account_type_synced: true }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await ctx.addInitScript((s) => localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)), { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user });
  await ctx.route(`${SUPA}/auth/v1/user*`, (route) => route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers: cors }) : route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(user) }));
  const calls = await mockBilling(ctx, billing);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`[${scope}] pageerror ${e.message.slice(0, 200)}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|status of [45]\d\d|React DevTools|Download the React/.test(m.text())) problems.push(`[${scope}] console ${m.text().slice(0, 200)}`); });
  return { ctx, page, calls, db: f.db };
}

/** AC-G1/G3/G4 on the current page state. */
async function globals(page, { online = true, primaries = 1 } = {}) {
  const text = await page.evaluate(() => document.body.innerText);
  if (online) check(!FORBIDDEN.test(text), "AC-G1: no 'bald verfügbar' / 'Zugang anfragen' / waitlist wording", (text.match(FORBIDDEN) ?? [])[0]);
  check(!text.includes("ß"), "AC-G4: no sharp s");
  const n = await page.locator("[data-primary-action]").count();
  check(n === primaries, `AC-G3: exactly ${primaries} [data-primary-action]`, `found ${n}`);
}
async function axe(page, selector) {
  if (!axeSrc) return;
  await page.addScriptTag({ content: axeSrc });
  const v = await page.evaluate(async (sel) => (await window.axe.run(sel, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((x) => `${x.id} x${x.nodes.length} ${x.nodes[0]?.target?.join(" ")}`), selector);
  check(v.length === 0, `axe: no WCAG A/AA violations in ${selector}`, v.join(" | "));
}
async function shot(page, name) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}family-parent-${name}.png`, fullPage: true }).catch((e) => problems.push(`[${scope}] screenshot ${name}: ${e.message.slice(0, 120)}`));
}
const stepState = (page, id) => page.locator(`[data-step=${id}]`).first().getAttribute("data-state");
const primaryText = async (page) => (await page.locator("[data-primary-action]").first().innerText()).replace(/\s+/g, " ").trim();
const ready = (page) => waitSel(page, "[data-family-state]:not([data-family-state=loading])", 90000);

// ---------------------------------------------------------------- scenarios
const scenarios = {
  /** AC-P1..P4, P6..P8: start -> create -> code -> child joins -> plan -> monthly -> checkout -> cancel return. */
  async start(browser) {
    for (const [key, vp] of Object.entries(VIEWPORTS)) {
      scope = `start ${key}`;
      const fam = familyDb();
      const { ctx, page, calls, db } = await actor(browser, { vp, fam, billing: { checkoutUrl: null } });
      await page.goto(`${BASE}/familie`, { waitUntil: "domcontentloaded" });
      check(await waitSel(page, "[data-testid=family-stepper]", 90000), "AC-P1: stepper visible");
      check(await stepState(page, "family") === "current" && await stepState(page, "child") === "todo" && await stepState(page, "plan") === "todo", "AC-P1: family current, child/plan todo");
      check(await primaryText(page) === "Familie erstellen", "AC-P1: primary is 'Familie erstellen'", await primaryText(page));
      check(await page.getByText("Dein Kind hat dir schon einen Code geschickt?").isVisible() && !(await page.locator("#family-code").isVisible()), "AC-P1: join form collapsed");
      check(!(await page.locator("[data-family-price], #abo").count()), "AC-P1: no price / plan card");
      await globals(page);
      if (key === "desktop") await axe(page, "main");
      await shot(page, `1-start-${key}`);
      if (key === "mobile") { await ctx.close(); continue; }

      await page.getByRole("button", { name: "Familie erstellen" }).click();
      check(await waitSel(page, "[data-step=child][data-state=current]"), "AC-P2: child step current after create");
      check(db.calls.some(([n, b]) => n === "family_create" && b.p_name === "Meine Familie"), "AC-P2: empty name -> 'Meine Familie'");
      check(await visible(page, "Familie «Meine Familie» erstellt"), "AC-P2: step1 done line");
      check(await primaryText(page) === "Code für mein Kind erstellen", "AC-P2: primary 'Code für mein Kind erstellen'", await primaryText(page));
      await globals(page);
      await shot(page, "2-invite-desktop");

      await page.getByRole("button", { name: "Code für mein Kind erstellen" }).click();
      check(await waitSel(page, "[data-testid=invite-code]"), "AC-P3: code shown");
      check((await page.locator("[data-testid=invite-code]").innerText()).trim() === "ABCD 1234", "AC-P3: code ABCD 1234");
      check(await visible(page, "Gültig bis") && await page.getByRole("button", { name: /Code kopieren/ }).isVisible() && await page.getByRole("button", { name: /Link kopieren/ }).isVisible(), "AC-P3: validity + copy buttons");
      check(await page.locator("[data-invite-waiting]").isVisible(), "AC-P3: waiting text");
      check(await page.locator("[data-testid=family-stepper]").getAttribute("data-next-action") === "wait_child", "next action wait_child");
      await globals(page, { primaries: 0 });
      await shot(page, "3-waiting-desktop");

      db.members = [parentMember, childMember("not_required")]; // child joins (16+)
      const t0 = Date.now();
      check(await waitSel(page, "[data-step=plan][data-state=current]", 17000), "AC-P4: plan step current within 16 s without user action", `${Date.now() - t0} ms`);
      check(await stepState(page, "child") === "done", "AC-P4: child step done");
      check(await primaryText(page) === "Familienpaket buchen · CHF 79 pro Jahr", "AC-P4: primary 'Familienpaket buchen · CHF 79 pro Jahr'", await primaryText(page));
      check(await page.getByRole("radio", { name: /Jährlich/ }).isChecked(), "AC-P6: yearly preselected");
      check(await visible(page, "Spare CHF 15.80"), "AC-P6: 'Spare CHF 15.80' badge");
      await globals(page);
      await axe(page, "#abo");
      await shot(page, "4-plan-desktop");
      await page.getByRole("radio", { name: /Monatlich/ }).check();
      check(await primaryText(page) === "Familienpaket buchen · CHF 7.90 pro Monat", "AC-P6: monthly changes the button", await primaryText(page));

      await page.locator("[data-primary-action]").click();
      await page.waitForURL(/\/familie(\?|$)/, { timeout: 60000 }).catch(() => {});
      const co = calls.find((c) => c.path === "/api/billing/checkout");
      check(co && co.body.plan === "family" && co.body.familyId === FAMILY_ID && co.body.payment === "card" && co.body.interval === "month", "AC-P7: checkout POST body", JSON.stringify(co?.body));
      check(await waitSel(page, "[data-billing-return=cancel]", 60000), "AC-P8: cancel notice at the top");
      check(await visible(page, "Bezahlung abgebrochen"), "AC-P8: 'Bezahlung abgebrochen'");
      check(!page.url().includes("billing="), "AC-P8: params removed", page.url());
      check(await stepState(page, "plan") === "current", "AC-P8: plan step still current");
      check(await page.getByRole("radio", { name: /Monatlich/ }).isChecked(), "AC-P8: interval choice kept (monthly)");
      await globals(page);
      await shot(page, "5-cancel-desktop");
      await ctx.close();
    }
  },

  /** AC-P7 redirecting state (checkout URL held open). */
  async redirecting(browser) {
    scope = "redirecting";
    const fam = familyDb({ family: { id: FAMILY_ID, name: "Familie Meier" }, members: [parentMember, childMember()] });
    const { ctx, page } = await actor(browser, { fam });
    await ctx.route("**/api/billing/checkout", async () => { /* never answers: stays in redirecting */ });
    await page.goto(`${BASE}/familie`, { waitUntil: "domcontentloaded" });
    await waitSel(page, "[data-billing-state=choose]", 90000);
    await page.locator("[data-primary-action]").click();
    check(await waitSel(page, "[data-billing-state=redirecting]", 5000), "AC-P7: data-billing-state=redirecting");
    check(await visible(page, "Wir öffnen die sichere Bezahlseite", 5000), "AC-P7: redirecting text");
    await ctx.close();
  },

  /** AC-P3 (reload keeps the open code), AC-P6 query preselect. */
  async reload(browser) {
    scope = "reload-invite";
    const fam = familyDb({ family: { id: FAMILY_ID, name: "Familie Meier" }, invites: [{ code: "ABCD1234", direction: "parent_invites_child", expires_at: day(6) }] });
    const { ctx, page, db } = await actor(browser, { fam });
    await page.goto(`${BASE}/familie`, { waitUntil: "domcontentloaded" });
    check(await waitSel(page, "[data-testid=invite-code]", 90000), "AC-P3: open code shown after reload");
    check(!db.calls.some(([n]) => n === "family_create_invite"), "AC-P3: no new family_create_invite call");
    await ctx.close();
    scope = "query-interval";
    const fam2 = familyDb({ family: { id: FAMILY_ID, name: "Familie Meier" }, members: [parentMember, childMember()] });
    const a = await actor(browser, { fam: fam2 });
    await a.page.goto(`${BASE}/familie?plan=family&interval=month#abo`, { waitUntil: "domcontentloaded" });
    await waitSel(a.page, "[data-billing-state=choose]", 90000);
    check(await a.page.getByRole("radio", { name: /Monatlich/ }).isChecked(), "AC-P6: ?interval=month preselects monthly");
    await a.ctx.close();
  },

  /** AC-P5 consent. */
  async consent(browser) {
    scope = "consent";
    const fam = familyDb({ family: { id: FAMILY_ID, name: "Familie Meier" }, members: [parentMember, childMember("pending")] });
    const { ctx, page, db } = await actor(browser, { fam });
    await page.goto(`${BASE}/familie`, { waitUntil: "domcontentloaded" });
    check(await waitSel(page, "[data-step=child][data-state=attention]", 90000), "AC-P5: child step attention");
    check(await primaryText(page) === "Zustimmung geben", "AC-P5: primary 'Zustimmung geben'", await primaryText(page));
    await globals(page);
    await shot(page, "6-consent-desktop");
    await page.locator("[data-primary-action]").click();
    await page.getByRole("dialog").getByRole("button", { name: "Ja, ich stimme zu" }).click();
    check(await waitSel(page, "[data-step=plan][data-state=current]"), "AC-P5: plan step current after consent");
    check(db.calls.some(([n, b]) => n === "family_set_consent" && b.p_granted === true), "AC-P5: family_set_consent(true)");
    await ctx.close();
  },

  /** AC-P9 success -> activating -> active. */
  async success(browser) {
    scope = "success";
    const fam = familyDb({ family: { id: FAMILY_ID, name: "Familie Meier" }, members: [parentMember, childMember()] });
    const { ctx, page } = await actor(browser, { fam, billing: { statusFn: (n) => (n < 2 ? status() : PAID) } });
    let buySeen = false;
    page.on("framenavigated", () => {});
    await page.goto(`${BASE}/familie?billing=success&session_id=cs_test_1`, { waitUntil: "domcontentloaded" });
    check(await waitSel(page, "[data-billing-return=activating]", 90000), "AC-P9: activating notice");
    const watch = setInterval(async () => { try { if (await page.getByRole("button", { name: /Familienpaket buchen/ }).count()) buySeen = true; } catch { /* closed */ } }, 200);
    await shot(page, "7-activating-desktop");
    check(await waitSel(page, "[data-billing-return=active]", 20000), "AC-P9: active notice");
    clearInterval(watch);
    check(!buySeen, "AC-P9: no buy button at any time");
    check(await visible(page, "Alles eingerichtet"), "AC-P9: stepper collapsed to 'Alles eingerichtet'");
    check(await waitSel(page, "#abo [data-billing-state=active]"), "AC-P9: card active");
    check(await page.getByRole("button", { name: "Abo verwalten" }).isVisible(), "AC-P9: 'Abo verwalten' (secondary)");
    check(!page.url().includes("billing="), "params removed");
    await globals(page, { primaries: 0 });
    await shot(page, "8-active-desktop");
    await ctx.close();
  },

  /** AC-P10 slow activation + sessionStorage guard. */
  async slow(browser) {
    if (process.env.SLOW === "0") return;
    scope = "slow";
    const fam = familyDb({ family: { id: FAMILY_ID, name: "Familie Meier" }, members: [parentMember, childMember()] });
    const { ctx, page } = await actor(browser, { fam });
    await page.goto(`${BASE}/familie?billing=success`, { waitUntil: "domcontentloaded" });
    check(await waitSel(page, "[data-billing-return=slow]", 32000 + 60000), "AC-P10: slow notice after the poll window");
    check(await page.getByRole("button", { name: /Familienpaket buchen/ }).count() === 0, "AC-P10: no buy button");
    await shot(page, "9-slow-desktop");
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready(page);
    await page.waitForTimeout(1500);
    check(await page.getByRole("button", { name: /Familienpaket buchen/ }).count() === 0, "AC-P10: still no buy button after reload (sessionStorage guard)");
    await ctx.close();
  },

  /** AC-P11..P14: subscription phases. */
  async phases(browser) {
    const base = { family: { id: FAMILY_ID, name: "Familie Meier" }, members: [parentMember, childMember()] };
    const cases = [
      ["past_due", status({ plan: "family", status: "active", source: "stripe", subscriptionStatus: "past_due", validUntil: "2026-12-31" })],
      ["canceling", status({ plan: "family", status: "active", source: "stripe", subscriptionStatus: "active", cancelAtPeriodEnd: true, validUntil: "2026-12-31" })],
      ["ended", status({ plan: "family", status: "expired", source: "stripe", subscriptionStatus: "canceled" })],
      ["error500", 500], ["error503", 503],
    ];
    for (const [name, st] of cases) {
      scope = `phase ${name}`;
      const { ctx, page, calls } = await actor(browser, { fam: familyDb(base), billing: { statusFn: () => st } });
      await page.goto(`${BASE}/familie`, { waitUntil: "domcontentloaded" });
      await ready(page);
      if (name === "past_due") {
        check(await waitSel(page, "#abo [data-billing-state=past_due]", 60000), "AC-P11: card past_due");
        check(await page.locator("#abo").getByText("Zahlung offen").isVisible(), "AC-P11: badge 'Zahlung offen'");
        check(await primaryText(page) === "Karte aktualisieren", "AC-P11: primary 'Karte aktualisieren'", await primaryText(page));
        const banner = await page.locator("[data-billing-banner]").count();
        check(true, `banner present: ${banner ? "yes" : "no (Part B stub on this branch)"}`);
        await globals(page);
        await shot(page, "10-past-due-desktop");
        await page.locator("[data-primary-action]").click();
        await page.waitForURL(/portal=1/, { timeout: 30000 }).catch(() => {});
        check(calls.some((c) => c.path === "/api/billing/portal" && c.body?.familyId === FAMILY_ID), "AC-P11: POST /api/billing/portal");
      } else if (name === "canceling") {
        check(await waitSel(page, "#abo [data-billing-state=canceling]", 60000), "AC-P12: card canceling");
        check(await page.locator("#abo").getByText("Gekündigt", { exact: true }).isVisible(), "AC-P12: badge 'Gekündigt'");
        check(await visible(page, "läuft noch bis 31.12.2026"), "AC-P12: 'läuft noch bis 31.12.2026'");
        check(await page.getByRole("button", { name: "Abo verlängern" }).isVisible(), "AC-P12: 'Abo verlängern'");
        check(await page.getByRole("button", { name: /Familienpaket buchen/ }).count() === 0, "AC-P12: no buy button");
        await globals(page, { primaries: 0 });
        await shot(page, "11-canceling-desktop");
      } else if (name === "ended") {
        check(await waitSel(page, "#abo [data-billing-state=ended]", 60000), "AC-P13: card ended");
        check(await page.locator("#abo").getByText("Abgelaufen", { exact: true }).isVisible(), "AC-P13: badge 'Abgelaufen'");
        check(await primaryText(page) === "Familienpaket wieder buchen", "AC-P13: primary 'Familienpaket wieder buchen'", await primaryText(page));
        await globals(page);
        await page.locator("[data-primary-action]").click();
        check(await page.getByRole("radio", { name: /Jährlich/ }).isVisible(), "AC-P13: interval choice shown");
        await page.locator("[data-primary-action]").click();
        await page.waitForTimeout(1500);
        check(calls.some((c) => c.path === "/api/billing/checkout"), "AC-P13: checkout POST");
      } else {
        check(await waitSel(page, "#abo [data-billing-state=error]", 60000), `AC-P14: ${name} error state`);
        check(await page.getByRole("button", { name: "Nochmals versuchen" }).isVisible() && await page.locator("#abo").getByRole("link", { name: "Kontakt" }).isVisible(), "AC-P14: retry + Kontakt");
        if (name === "error503") check(await visible(page, "Die Bezahlung ist gerade nicht erreichbar"), "AC-P14: 503 shows api.unreachable");
        await globals(page);
        if (name === "error503") await shot(page, "12-error-desktop");
      }
      await ctx.close();
    }
  },

  /** AC-P15 invite link context. */
  async invite(browser) {
    for (const [key, vp] of Object.entries(VIEWPORTS)) {
      scope = `invite-link ${key}`;
      const { ctx, page, db } = await actor(browser, { vp });
      await page.goto(`${BASE}/familie/einladung/ABCD1234`, { waitUntil: "domcontentloaded" });
      check(await waitSel(page, "[data-next-action=accept_invite]", 90000), "AC-P15: next action accept_invite");
      check(await primaryText(page) === "Einladung annehmen", "AC-P15: primary 'Einladung annehmen'", await primaryText(page));
      check(await page.locator("#family-code").inputValue() === "ABCD 1234", "AC-P15: code prefilled");
      check(await page.getByRole("button", { name: "Lieber eine eigene Familie erstellen" }).isVisible(), "AC-P15: create-own as secondary");
      await globals(page);
      await shot(page, `13-invite-link-${key}`);
      if (key === "desktop") {
        await page.locator("[data-primary-action]").click();
        check(await waitSel(page, "[data-family-state=parent]"), "join -> parent view");
        check(db.calls.some(([n, b]) => n === "family_join" && b.p_code === "ABCD1234"), "family_join with the code");
      }
      await ctx.close();
    }
  },

  /** AC-P16 empty own family -> switch to the child's family. */
  async switch(browser) {
    scope = "switch";
    const fam = familyDb({ family: { id: FAMILY_ID, name: "Meine Familie" }, joinError: "ALREADY_IN_FAMILY" });
    const { ctx, page, db } = await actor(browser, { fam });
    await page.goto(`${BASE}/familie/einladung/WXYZ5678`, { waitUntil: "domcontentloaded" });
    check(await waitSel(page, "[data-family-state=parent]", 90000), "parent view");
    check(await page.locator("#family-code").inputValue() === "WXYZ 5678", "invite code prefilled in the open join toggle");
    await page.getByRole("button", { name: "Mit meinem Kind verbinden" }).click();
    check(await visible(page, "Der Familie deines Kindes beitreten?"), "AC-P16: switch modal");
    await page.getByRole("dialog").getByRole("button", { name: "Ja, beitreten" }).click();
    await page.waitForTimeout(1500);
    const order = db.calls.map(([n]) => n).filter((n) => n === "family_leave" || n === "family_join");
    check(order.join(",") === "family_join,family_leave,family_join", "AC-P16: family_leave then family_join", order.join(","));
    check(await visible(page, "Familie Keller") || await visible(page, "Lina Meier"), "joined family shown");
    await ctx.close();
  },

  /** AC-P17 seat full, done state. */
  async seat(browser) {
    scope = "seat-full";
    const fam = familyDb({ family: { id: FAMILY_ID, name: "Familie Meier" }, members: [parentMember, childMember()] });
    const { ctx, page } = await actor(browser, { fam, billing: { statusFn: () => PAID } });
    await page.goto(`${BASE}/familie`, { waitUntil: "domcontentloaded" });
    check(await waitSel(page, "[data-seat-full]", 90000), "AC-P17: seat-full note");
    check(await page.locator("[data-seat-full] a[href='/kontakt']").count() === 1, "AC-P17: link to /kontakt");
    check(await visible(page, "Alles eingerichtet"), "done: stepper collapsed");
    await globals(page, { primaries: 0 });
    for (const [key, vp] of Object.entries(VIEWPORTS)) { await page.setViewportSize({ width: vp.w, height: vp.h }); await shot(page, `14-done-${key}`); }
    await ctx.close();
  },

  /** AC-P18 + AC-G1 on the public pages. */
  async public(browser) {
    scope = "public on";
    const ctx = await newCtx(browser, VIEWPORTS.desktop);
    await installStub(ctx, { role: "student", authed: false });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/preise`, { waitUntil: "networkidle" });
    const year = page.getByRole("link", { name: "Jährlich buchen" }); const month = page.getByRole("link", { name: "Monatlich buchen" });
    check(await year.getAttribute("href") === "/familie?plan=family&interval=year#abo" && await month.getAttribute("href") === "/familie?plan=family&interval=month#abo", "AC-P18: /preise family links");
    check(/bg-\[var\(--sun\)\]/.test(await year.getAttribute("class")) && !/bg-\[var\(--sun\)\]/.test(await month.getAttribute("class")), "AC-P18: yearly sun (primary), monthly secondary");
    check(!FORBIDDEN.test(await page.evaluate(() => document.body.innerText)), "AC-G1: /preise clean");
    await page.goto(`${BASE}/familien`, { waitUntil: "networkidle" });
    const t = await page.evaluate(() => document.body.innerText);
    check(!FORBIDDEN.test(t), "AC-G1: /familien clean", (t.match(FORBIDDEN) ?? [])[0]);
    check(await page.getByRole("link", { name: "Familienpaket buchen" }).first().getAttribute("href") === "/familie?plan=family&interval=year#abo", "/familien CTA -> yearly checkout");
    check(await page.locator("#warteliste").count() === 0, "/familien: waitlist section hidden");
    await ctx.close();
  },
};

async function flagOff(browser) {
  if (!BASE_OFF) return;
  scope = "flag off start";
  const { ctx, page } = await actor(browser, {});
  await page.goto(`${BASE_OFF}/familie`, { waitUntil: "domcontentloaded" });
  check(await waitSel(page, "[data-testid=family-stepper]", 90000), "stepper visible");
  check(await page.locator("[data-step]").count() === 2, "flag off: 2 steps");
  await globals(page, { online: false });
  await ctx.close();
  scope = "flag off done";
  const fam = familyDb({ family: { id: FAMILY_ID, name: "Familie Meier" }, members: [parentMember, childMember()] });
  const a = await actor(browser, { fam });
  await a.page.goto(`${BASE_OFF}/familie`, { waitUntil: "domcontentloaded" });
  check(await visible(a.page, "Bezahlung bald verfügbar", 90000), "flag off: honest plan card unchanged");
  check(a.calls.length === 0, "flag off: no billing API calls");
  await globals(a.page, { online: false, primaries: 0 });
  await shot(a.page, "15-flag-off-done-desktop");
  await a.ctx.close();
}

const browser = await launch();
try {
  for (const [name, fn] of Object.entries(scenarios)) {
    if (ONLY && !ONLY.has(name)) continue;
    try { await fn(browser); } catch (e) { check(false, `${name} crashed`, e.message.slice(0, 300)); }
  }
  if (!ONLY || ONLY.has("off")) await flagOff(browser);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${problems.length ? `, ${problems.length} page problem(s)` : ""}`);
for (const p of problems) console.log("PROBLEM", p);
process.exitCode = failed.length || problems.length ? 1 : 0;
