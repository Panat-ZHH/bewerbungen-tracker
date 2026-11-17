// Student side of the family flow (BILLING-FLOW-SPEC §3.2, §3.3, AC-S1..S9, AC-G1/G3/G4) in BOTH flag states.
// Nothing real is touched: Supabase is the in-memory stub (scripts/ux-v2-stub.mjs) with a stateful family backend, and every
// /api/billing/* request is recorded (the student must never call it).
//
//   PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> node scripts/family-student-flow-e2e.mjs            # both flags
//   ... node scripts/family-student-flow-e2e.mjs --flag=on                                                       # one state
//   BASE_ON=http://localhost:3302 BASE_OFF=http://localhost:3301 ...   # reuse running dev servers (dummy Supabase env!)
//
// Viewports: 390x844 dark (mobile) and 1280x800 light (desktop). Screenshots: $OUT (default screenshots/family-student/).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { installStub, launch, newCtx } from "./ux-v2-stub.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v = "1"] = a.slice(2).split("="); return [k, v]; }));
const OUT = (process.env.OUT || `${homedir()}/Projects/bewerbungen-tracker-wt/screenshots/family-student/`).replace(/\/?$/, "/");
mkdirSync(OUT, { recursive: true });
const SUPA = "http://localhost:54321";
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
const axePath = process.env.AXE || join(ROOT, "node_modules/axe-core/axe.min.js");
const axeSrc = existsSync(axePath) ? readFileSync(axePath, "utf8") : null;
const inDays = (d) => new Date(Date.now() + d * 864e5).toISOString();
const FORBIDDEN_ON = /bald verfügbar|Zugang anfragen|Warteliste|noch nicht freigeschaltet|Online-Bezahlung folgt/i;

const results = [];
const problems = [];
let scope = "";
const check = (ok, text, info = "") => { results.push({ ok: !!ok, text: `[${scope}] ${text}` }); console.log(ok ? "PASS" : "FAIL", `[${scope}]`, text, ok ? "" : info); };

// ---------------------------------------------------------------- dev server
const freePort = () => new Promise((resolve) => { const s = createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const reachable = async (url) => { try { return (await fetch(url + "/login", { signal: AbortSignal.timeout(60000) })).status < 500; } catch { return false; } };
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

// ---------------------------------------------------------------- stateful family backend (student = "me")
function familyBackend(me, { birthYear = 2010, planState = null, startWithOwnFamily = false } = {}) {
  const db = { family: null, birthYear, invites: [] };
  const member = (user_id, display_name, role, consent_status = "not_required") => ({ user_id, display_name, role, status: "active", consent_status, share_settings: { progress: true, applications: false, village: true, documents: false } });
  const plan = () => (planState ? { plan_type: "family", status: planState === "expired" ? "active" : planState, state: planState, seats_parents: 1, seats_children: 1 } : null);
  const ownFamily = () => { db.family = { id: "own", name: "Meine Familie", members: [member(me.id, me.name, "child")], plan: null }; };
  if (startWithOwnFamily) { ownFamily(); db.invites.push({ code: "ELTE6789", direction: "child_invites_parent", expires_at: inDays(6) }); }
  const view = () => db.family && {
    family: { id: db.family.id, name: db.family.name }, my_role: "child",
    members: db.family.members, plan: db.family.plan, invites: db.family.id === "own" ? db.invites : [],
  };
  const err = (message) => ({ __error: message });
  const rpc = {
    class_my_classes: [],
    family_get_my: () => view(),
    account_set_type: (b) => { if (b.p_birth_year) db.birthYear = b.p_birth_year; return { account_type: b.p_type }; },
    family_create_invite: (b) => {
      if (!db.birthYear) return err("BIRTH_YEAR_REQUIRED");
      if (!db.family) ownFamily();
      const inv = { code: "ELTE6789", direction: b.p_direction, expires_at: inDays(7) };
      db.invites = [inv];
      return { code: inv.code, expires_at: inv.expires_at };
    },
    family_join: (b) => {
      if (!db.birthYear) return err("BIRTH_YEAR_REQUIRED");
      if (b.p_code !== "ABCD1234") return err("INVITE_INVALID");
      if (db.family) return err("ALREADY_IN_FAMILY");
      db.family = { id: "f2", name: "Familie Meier", members: [member("p9", "Sandra Meier", "parent"), member(me.id, me.name, "child", "pending")], plan: plan() };
      return { family_id: "f2", role: "child" };
    },
    family_leave: () => { db.family = null; db.invites = []; return null; },
    family_set_share: () => null,
    family_export_my_data: () => ({}),
  };
  /** The parent opens the link: they join the student's own family. */
  const parentJoins = () => { db.family.members.push(member("p9", "Sandra Meier", "parent")); db.family.plan = plan(); db.invites = []; };
  return { db, rpc, parentJoins };
}

async function actor(browser, { meta, rpc, vp, authed = true }) {
  const ctx = await newCtx(browser, vp);
  const state = await installStub(ctx, { role: "student", authed, rpc });
  const billing = [];
  await ctx.route("**/api/billing/**", (route) => { billing.push(route.request().url()); return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "forbidden" }) }); });
  if (authed) {
    const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "lina@beispiel.ch", user_metadata: { ...meta }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
    const session = { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user };
    await ctx.addInitScript((s) => localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)), session);
    await ctx.route(`${SUPA}/auth/v1/user*`, async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      if (req.method() === "PUT") { let b = {}; try { b = req.postDataJSON() || {}; } catch { /* none */ } Object.assign(user.user_metadata, b.data || {}); }
      return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(user) });
    });
  }
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`[${scope}] pageerror ${e.message.slice(0, 200)}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|status of 4\d\d|status of 5\d\d|React DevTools/.test(m.text())) problems.push(`[${scope}] console ${m.text().slice(0, 200)}`); });
  return { ctx, page, state, billing };
}
const visible = (page, text, timeout = 30000) => page.getByText(text).locator("visible=true").first().waitFor({ timeout }).then(() => true, () => false);
const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.png`, fullPage: true }).catch(() => {});
const calls = (state, name) => state.calls.filter((c) => c.rpc === name);
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const primaries = (page) => page.locator("[data-primary-action]").locator("visible=true").count();
const mainText = (page) => page.locator("main").innerText().catch(() => "");
async function axe(page, selector) {
  if (!axeSrc) return;
  await page.addScriptTag({ content: axeSrc });
  const v = await page.evaluate(async (sel) => (await window.axe.run(sel, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((x) => `${x.id} x${x.nodes.length} ${x.nodes[0]?.target?.join(" ")}`), selector);
  check(v.length === 0, `axe: no WCAG A/AA violations in ${selector}`, v.join(" | "));
}
async function textRules(page, online, what) {
  const t = await mainText(page);
  check(!t.includes("ß"), `${what}: no sharp s`);
  if (online) check(!FORBIDDEN_ON.test(t), `${what}: no flag-off wording while online payment is on`, (t.match(FORBIDDEN_ON) || [])[0]);
}

const META = { role: "student", role_confirmed: true, student_onboarded: true, onboarding_tour_done: true, account_type: "independent_student", birth_year: 2010 };
const VIEWPORTS = [{ key: "mobile-dark", vp: { w: 390, h: 844, dark: true } }, { key: "desktop-light", vp: { w: 1280, h: 800 } }];
const flags = args.flag ? [args.flag] : ["on", "off"];
const browser = await launch();

for (const flag of flags) {
  const online = flag === "on";
  const server = await startServer(flag);
  const BASE = server.base;
  try {
    for (const { key, vp } of VIEWPORTS) {
      // ------------------------------------------------ AC-S1 / S2: connect -> wait -> parent joins
      scope = `${flag} ${key} connect`;
      {
        const be = familyBackend({ id: "u1", name: "Lina Meier" });
        const { ctx, page, state, billing } = await actor(browser, { meta: META, rpc: be.rpc, vp });
        await page.goto(`${BASE}/familie`, { waitUntil: "domcontentloaded" });
        check(await visible(page, "Deine Eltern verbinden", 120000), "AC-S1 card 'Deine Eltern verbinden'");
        check(await page.locator("[data-student-step=connect]").count() === 1, "AC-S1 data-student-step=connect");
        check(await primaries(page) === 1, "AC-G3 exactly one primary action", String(await primaries(page)));
        check(await page.getByRole("button", { name: "Eltern einladen" }).isVisible(), "AC-S1 primary 'Eltern einladen'");
        const toggle = page.getByRole("button", { name: "Du hast schon einen Code von deinen Eltern?" });
        check(await toggle.isVisible() && (await toggle.getAttribute("aria-expanded")) === "false", "AC-S1 join form collapsed");
        check(!(await page.getByLabel("Code von deinen Eltern").count()), "AC-S1 code input hidden");
        check(!/CHF|Familienpaket buchen/.test(await mainText(page)), "AC-S1 no price, no plan card");
        await textRules(page, online, "connect");
        if (key === "mobile-dark") await axe(page, "[data-testid=student-connect]");
        await shot(page, `${flag}-${key}-1-connect`);

        await page.getByRole("button", { name: "Eltern einladen" }).click();
        check(await visible(page, "ELTE 6789"), "AC-S2 code shown");
        const link = await page.getByTestId("invite-link").innerText();
        check(/\/familie\/einladung\/ELTE6789\?fuer=eltern$/.test(link), "AC-S2 link carries ?fuer=eltern", link);
        check(await page.locator("[data-student-step=wait]").count() === 1 && await page.locator("[data-invite-waiting]").isVisible(), "AC-S2 wait state + waiting text");
        check(await page.getByRole("button", { name: /Link teilen|Link kopieren/ }).first().isVisible(), "AC-S2 'Link teilen' or 'Link kopieren'");
        check(await page.getByRole("button", { name: "Code kopieren" }).isVisible(), "AC-S2 'Code kopieren'");
        check(await primaries(page) === 1, "AC-G3 one primary while waiting", String(await primaries(page)));
        check(calls(state, "family_create_invite").at(-1)?.body.p_direction === "child_invites_parent", "invite direction child_invites_parent");
        await textRules(page, online, "wait");
        if (key === "mobile-dark") await axe(page, "[data-testid=student-connect]");
        check(await noOverflow(page), "no horizontal overflow");
        await shot(page, `${flag}-${key}-2-wait`);

        // reload: the open invite comes back from family_get_my (no new code)
        const before = calls(state, "family_create_invite").length;
        await page.reload({ waitUntil: "domcontentloaded" });
        check(await visible(page, "ELTE 6789", 90000), "reload: the open link is shown again");
        check(calls(state, "family_create_invite").length === before, "reload: no new invite RPC");

        // parent opens the link -> picked up on window focus (the 15 s timer does the same without focus)
        be.parentJoins();
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        check(await visible(page, "Eltern in deiner Familie: Sandra Meier", 30000), "parent joined: child view after auto refresh");
        check(await page.locator("[data-student-step=joined]").count() === 1, "data-student-step=joined");
        check(!(await page.locator("[data-student-step=connect], [data-student-step=wait]").count()), "connect card gone once a parent is connected");
        if (online) {
          check(await visible(page, "Das Familienpaket bucht ein Elternteil. Für dich bleibt WendApply kostenlos."), "AC-S4 plan none: neutral line");
          check(await page.locator("[data-billing-state=child]").count() === 1, "plan line data-billing-state=child");
        }
        await textRules(page, online, "joined");
        check(billing.length === 0, "AC-S5 the student never calls /api/billing/*", billing.join(", "));
        await shot(page, `${flag}-${key}-3-joined`);
        if (key === "mobile-dark") {
          await page.getByRole("button", { name: "Mehr" }).click();
          check(await page.getByRole("dialog").getByRole("link", { name: "Familie" }).isVisible(), "AC-S6 'Familie' under 'Mehr' (private student)");
        }
        await ctx.close();
      }

      // ------------------------------------------------ AC-S3: birth-year gate
      scope = `${flag} ${key} birth-year`;
      {
        const be = familyBackend({ id: "u1", name: "Lina Meier" }, { birthYear: null });
        const { ctx, page, state } = await actor(browser, { meta: { ...META, account_type: undefined, birth_year: undefined }, rpc: be.rpc, vp });
        await page.goto(`${BASE}/familie`, { waitUntil: "domcontentloaded" });
        check(await visible(page, "Deine Eltern verbinden", 120000), "card shown");
        await page.getByRole("button", { name: "Eltern einladen" }).click();
        check(await page.locator("[data-birth-gate]").waitFor({ timeout: 20000 }).then(() => true, () => false), "AC-S3 birth gate shown on BIRTH_YEAR_REQUIRED");
        check(await primaries(page) === 1, "AC-G3 one primary in the gate");
        if (key === "mobile-dark") await axe(page, "[data-birth-gate]");
        await shot(page, `${flag}-${key}-4-birth-gate`);
        await page.getByLabel("Jahrgang").selectOption("2011");
        await page.getByRole("button", { name: "Speichern und weiter" }).click();
        check(await visible(page, "ELTE 6789"), "AC-S3 original action retried automatically: code shown");
        check(calls(state, "account_set_type").some((c) => c.body.p_birth_year === 2011), "AC-S3 account_set_type with p_birth_year 2011", JSON.stringify(calls(state, "account_set_type")));
        await ctx.close();
      }

      // ------------------------------------------------ AC-S9: own empty family, then a parent's code -> switch
      scope = `${flag} ${key} switch`;
      {
        const be = familyBackend({ id: "u1", name: "Lina Meier" }, { startWithOwnFamily: true, planState: "active" });
        const { ctx, page, state } = await actor(browser, { meta: META, rpc: be.rpc, vp });
        await page.goto(`${BASE}/familie`, { waitUntil: "domcontentloaded" });
        check(await visible(page, "ELTE 6789", 120000), "own family without parent: the open link is shown");
        await page.getByRole("button", { name: "Du hast schon einen Code von deinen Eltern?" }).click();
        await page.getByLabel("Code von deinen Eltern").fill("abcd 1234");
        await page.getByRole("button", { name: "Familie beitreten" }).click();
        check(await page.getByRole("dialog").getByText("Der Familie deiner Eltern beitreten?").isVisible().catch(() => false) || await visible(page, "Der Familie deiner Eltern beitreten?", 10000), "AC-S9 switch modal");
        await shot(page, `${flag}-${key}-5-switch`);
        await page.getByRole("dialog").getByRole("button", { name: "Ja, beitreten" }).click();
        check(await visible(page, "Eltern in deiner Familie: Sandra Meier", 30000), "AC-S9 joined the parents' family");
        const order = state.calls.filter((c) => c.rpc === "family_leave" || c.rpc === "family_join").map((c) => c.rpc);
        check(order.slice(-2).join(">") === "family_leave>family_join", "AC-S9 family_leave then family_join", order.join(">"));
        check(await visible(page, "Deine Eltern müssen zuerst zustimmen"), "under 16: consent notice");
        if (online) {
          check(await page.locator("[data-billing-state=child]").getByText("Aktiv", { exact: true }).isVisible(), "AC-S4 plan active: badge 'Aktiv'");
          check(await visible(page, "Familienpaket aktiv"), "AC-S4 plan active: 'Familienpaket aktiv'");
        }
        await textRules(page, online, "after switch");
        await shot(page, `${flag}-${key}-6-child-active`);
        await ctx.close();
      }
    }

    // ------------------------------------------------ AC-S4: ended plan -> no payment wording at all
    scope = `${flag} plan expired`;
    if (online) {
      const be = familyBackend({ id: "u1", name: "Lina Meier" }, { planState: "expired" });
      const { ctx, page } = await actor(browser, { meta: META, rpc: be.rpc, vp: { w: 390, h: 844 } });
      await page.goto(`${BASE}/familie/einladung/abcd1234?fuer=kind`, { waitUntil: "domcontentloaded" });
      check(await visible(page, "Deine Eltern haben dich eingeladen", 120000), "invite link (student): join is the primary card");
      check(await page.getByLabel("Code von deinen Eltern").first().inputValue() === "ABCD 1234", "code prefilled");
      check(await primaries(page) === 1, "AC-G3 one primary in invite context");
      await page.getByRole("button", { name: "Familie beitreten" }).first().click();
      check(await visible(page, "Eltern in deiner Familie: Sandra Meier", 30000), "joined");
      const t = await page.locator("[data-billing-state=child]").innerText();
      check(!/Abgelaufen|Zahlung|Karte|überfällig|Aktiv/.test(t) && /kostenlos/.test(t), "AC-S4 expired plan: neutral line only", t);
      await ctx.close();
    }

    // ------------------------------------------------ AC-S6: school student (in a class) sees "Familie"
    scope = `${flag} school student nav`;
    {
      const { ctx, page } = await actor(browser, { meta: { role: "student", role_confirmed: true, student_onboarded: true, onboarding_tour_done: true }, rpc: { class_my_classes: [{ class_id: "c1", name: "Sek 3a", school_year: "2026/27", teacher_name: "Herr Keller", share_applications: true, joined_at: inDays(-50) }], family_get_my: null }, vp: { w: 1280, h: 800 } });
      await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
      check(await page.getByRole("link", { name: "Familie" }).first().waitFor({ timeout: 120000 }).then(() => true, () => false), "AC-S6 'Familie' nav for a student in a class");
      await ctx.close();
    }

    // ------------------------------------------------ AC-S8 / P7: logged out -> login keeps next, role preselect + hint
    for (const [fuer, role, hint] of [["eltern", "Elternteil", "Dein Kind hat dich eingeladen"], ["kind", "Schüler:in privat", "Deine Eltern haben dich eingeladen"]]) {
      scope = `${flag} logged-out fuer=${fuer}`;
      const { ctx, page } = await actor(browser, { authed: false, rpc: {}, vp: { w: 390, h: 844 } });
      await page.goto(`${BASE}/familie/einladung/ABCD1234?fuer=${fuer}`, { waitUntil: "domcontentloaded" });
      await page.waitForURL(/\/login/, { timeout: 120000 }).catch(() => {});
      const next = new URL(page.url()).searchParams.get("next");
      check(next === `/familie/einladung/ABCD1234?fuer=${fuer}`, "login keeps the full next (query included)", page.url());
      check(await visible(page, hint, 60000), `hint '${hint}'`);
      const pending = await page.evaluate(() => localStorage.getItem("pendingInviteCode"));
      check(/"kind":"family"/.test(pending ?? "") && /ABCD1234/.test(pending ?? ""), "family invite stored for after the e-mail confirmation", pending);
      for (let i = 0; i < 20 && !(await page.getByText("Ich bin", { exact: true }).count()); i++) { await page.getByRole("button", { name: "Konto erstellen" }).first().click(); await page.waitForTimeout(1000); }
      check(await page.locator("input[name=role]:checked").evaluate((el) => el.closest("label")?.innerText ?? "").then((t) => t.includes(role)), `signup role '${role}' preselected`);
      // signUp sends emailRedirectTo with the next path
      const bodies = [];
      await ctx.route(`${SUPA}/auth/v1/signup*`, (route) => { if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors }); bodies.push(route.request().url()); try { bodies.push(JSON.stringify(route.request().postDataJSON())); } catch { /* none */ } return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ id: "new", email: "neu@beispiel.ch", user_metadata: {}, app_metadata: {}, aud: "authenticated", created_at: "2026-01-01T00:00:00Z" }) }); });
      if (fuer === "kind") await page.getByLabel("Jahrgang").selectOption("2010");
      await page.getByLabel("E-Mail-Adresse").fill("neu@beispiel.ch");
      await page.getByLabel("Passwort", { exact: true }).fill("geheim123!");
      await page.getByLabel("Passwort wiederholen").fill("geheim123!");
      await page.getByRole("button", { name: "Konto erstellen" }).last().click();
      check(await visible(page, "Fast geschafft"), "signup sent");
      const sent = decodeURIComponent(decodeURIComponent(bodies.join(" "))); // redirect_to is encoded twice (query in a query)
      check(sent.includes("/auth/callback?next=/familie/einladung/ABCD1234?fuer="), "signUp emailRedirectTo = /auth/callback?next=<invite>", sent.slice(0, 300));
      await shot(page, `${flag}-login-${fuer}`);
      await ctx.close();
    }
  } finally {
    await server.stop();
  }
}

await browser.close();
const failed = results.filter((r) => !r.ok);
for (const p of problems) console.log("PROBLEM", p);
console.log(`\n${results.length - failed.length}/${results.length} checks passed, ${problems.length} page problems. Screenshots: ${OUT}`);
writeFileSync(`${OUT}results.json`, JSON.stringify({ results, problems }, null, 2));
process.exit(failed.length || problems.length ? 1 : 0);
