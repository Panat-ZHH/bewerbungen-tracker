// Access model UI e2e per role (docs/access/SPEC.md §1, §6, §7, §8; FINDINGS 1; FLOW-ANALYSIS G1–G23).
// Nothing real is contacted: Supabase is the stateful mock (scripts/lib/mock-supabase.mjs) + my_access() per scenario,
// /api/billing/* is mocked in the browser, Google OAuth is simulated (authorize → /auth/callback?code=…).
//
//   node scripts/access-e2e.mjs                         # spawns `next dev` on a free port with the mock Supabase URL
//   BASE=http://localhost:3471 node scripts/access-e2e.mjs   # dev server started with
//      NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy NEXT_PUBLIC_STRIPE_ENABLED=true
//   ONLY=A1,D1 …   run some scenarios;  SHOTS=0 skips the desktop/mobile × light/dark screenshots
// Screenshots: OUT (default ~/Projects/bewerbungen-tracker-wt/_access/ui-shots/<scenario>-<viewport>-<scheme>.png)
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createMockSupabase, SUPABASE_URL } from "./lib/mock-supabase.mjs";
import { ANSWERS, advance, fillKonto, primary, slugOf, waitPath, walk } from "./onb-driver.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const pwPath = [process.env.PLAYWRIGHT, join(homedir(), "Projects/bewerbungen-tracker-wt/audit-tools/node_modules/playwright-core/index.mjs")].find((p) => p && existsSync(p));
const { chromium } = await import(pwPath ? pathToFileURL(pwPath).href : "playwright-core");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = (process.env.OUT || join(homedir(), "Projects/bewerbungen-tracker-wt/_access/ui-shots")).replace(/\/$/, "");
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
const SHOTS = process.env.SHOTS !== "0";
mkdirSync(OUT, { recursive: true });

const freePort = () => new Promise((res) => { const s = createServer().listen(0, () => { const { port } = s.address(); s.close(() => res(port)); }); });
const reachable = (u) => fetch(u).then((r) => r.status < 500, () => false);
let server;
let BASE = process.env.BASE;
if (!BASE || !(await reachable(`${BASE}/login`))) {
  const port = await freePort();
  server = spawn("npx", ["next", "dev", "--webpack", "-p", String(port)], { cwd: ROOT, stdio: "ignore", env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "dummy", NEXT_PUBLIC_STRIPE_ENABLED: "true" } });
  BASE = `http://localhost:${port}`;
  for (let i = 0; i < 180 && !(await reachable(`${BASE}/login`)); i++) await new Promise((r) => setTimeout(r, 1000));
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
const json = (route, status, body) => route.fulfill({ status, headers: CORS, contentType: "application/json", body: JSON.stringify(body) });
/** AccessInfo (lib/access/types.ts) with enforcement on. */
const A = (o = {}) => ({ has_access: true, state: "active", reason: "none", role: "student", account_type: null, trial_ends_at: null, trial_days_left: null, grace_until: null, grant_until: null, subscription: null, school: null, blocked: false, enforced: true, expired_reason: null, family_pending: false, ...o });
const TRIAL = (o = {}) => A({ state: "trial", reason: "trial", trial_days_left: 7, trial_ends_at: new Date(Date.now() + 7 * 864e5).toISOString(), ...o });
const EXPIRED = (o = {}) => A({ has_access: false, state: "expired", trial_days_left: 0, expired_reason: "trial_ended", ...o });
const VARIANTS = [["desktop", { width: 1280, height: 800 }, "light"], ["desktop", { width: 1280, height: 800 }, "dark"], ["mobile", { width: 390, height: 844 }, "light"], ["mobile", { width: 390, height: 844 }, "dark"]];

const browser = await chromium.launch({ executablePath: CHROME });
const results = [];
let scope = "";
const check = (ok, text, info = "") => { results.push({ ok: !!ok, scope, text }); console.log(ok ? "PASS" : "FAIL", `[${scope}]`, text, ok ? "" : info); };
const vis = (page, sel, timeout = 30000) => page.locator(sel).first().waitFor({ timeout }).then(() => true, () => false);
const none = async (page, sel, settle = 2500) => { await page.waitForTimeout(settle); return (await page.locator(sel).count()) === 0; };

/** One browser context with the mock, my_access() = st.access (number = HTTP error like 404 PGRST202). */
async function open({ role = "student", access = A(), meta, authed = true, fresh = false, viewport = { width: 1280, height: 800 }, scheme = "light", extra } = {}) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
  const mock = createMockSupabase({ role, authed });
  if (meta) mock.state.user.user_metadata = meta;
  await mock.install(ctx);
  const st = { access, checkout: [], funnel: [], signups: [], accountType: null, funnelDone: false };
  if (fresh) {
    // A brand-new account (sign-up scenarios): no class yet, created when GoTrue hands out the first session.
    mock.state.memberships = [];
    await ctx.route(`${SUPABASE_URL}/auth/v1/token**`, (r) => { mock.state.user.created_at = new Date().toISOString(); return r.fallback(); });
    await ctx.route(`${SUPABASE_URL}/auth/v1/signup**`, (r) => { const b = r.request().postDataJSON() ?? {}; st.signups.push({ email: b.email, data: b.data, redirect: new URL(r.request().url()).searchParams.get("redirect_to") }); return r.fallback(); });
    // What the OAuth return found in storage, before the app consumed it (wa_pending_signup «used once»).
    await ctx.addInitScript(() => { if (location.pathname === "/auth/callback") { const v = localStorage.getItem("wa_pending_signup") ?? sessionStorage.getItem("wa_pending_signup"); if (v) sessionStorage.setItem("e2e_pending_at_callback", v); } });
  }
  // funnel_apply like the server (supabase/migrations/20261119100000_onboarding_funnel.sql): once per new account (< 14 days,
  // not done yet); p_answers or the metadata copy; staff → set_my_role('teacher'); student/parent → account_set_type(parent |
  // school_student when in a class | independent_student); established teacher roles are never changed.
  await ctx.route(`${SUPABASE_URL}/rest/v1/rpc/funnel_apply`, (r) => {
    const body = r.request().postDataJSON() ?? {};
    st.funnel.push(body);
    const user = mock.state.user;
    const roleOf = () => (mock.state.role === "teacher" ? "teacher" : st.accountType === "parent" ? "parent" : "student");
    const a = body.p_answers ?? user.user_metadata?.wa_funnel ?? null;
    if (st.funnelDone) return json(r, 200, { applied: false, reason: "already_done", role: roleOf() });
    if (!user.created_at || Date.now() - Date.parse(user.created_at) > 14 * 864e5) return json(r, 200, { applied: false, reason: "not_new", role: roleOf() });
    if (!a) return json(r, 200, { applied: false, reason: "no_answers", role: roleOf() });
    if (!["student", "parent", "staff"].includes(a.role)) return json(r, 400, { code: "P0001", message: "INVALID_FUNNEL", details: "role", hint: null });
    if (a.role === "staff") mock.state.role = "teacher";
    else if (mock.state.role !== "teacher") st.accountType = a.role === "parent" ? "parent" : mock.state.memberships.length ? "school_student" : "independent_student";
    st.funnelDone = true;
    return json(r, 200, { applied: true, role: roleOf(), role_mismatch: false, under_16: Number.isInteger(a.birthYear) && new Date().getFullYear() - a.birthYear - 1 < 16 });
  });
  await ctx.route(`${SUPABASE_URL}/rest/v1/rpc/my_access`, (r) => typeof st.access === "number" ? json(r, st.access, { code: "PGRST202", message: "Could not find the function public.my_access" }) : json(r, 200, st.access));
  await ctx.route(`${SUPABASE_URL}/rest/v1/rpc/paywall_probe`, (r) => json(r, 400, { code: "P0001", message: "PAYWALL", details: null, hint: null }));
  // Restrictive RLS policy of the backend (20261118020000_access_guards.sql): PostgREST answers 403 / 42501 naming the policy.
  await ctx.route(`${SUPABASE_URL}/rest/v1/rls_gate_probe**`, (r) => json(r, 403, { code: "42501", message: 'new row violates row-level security policy "access gate insert" for table "applications"', details: null, hint: null }));
  // Like GoTrue: back to redirect_to (keeps ?next=) with a one-time code.
  await ctx.route(`${SUPABASE_URL}/auth/v1/authorize**`, (r) => {
    const back = new URL(new URL(r.request().url()).searchParams.get("redirect_to") || `${BASE}/auth/callback`);
    back.searchParams.set("code", "e2e-code");
    return r.fulfill({ status: 302, headers: { location: back.href } });
  });
  await ctx.route("**/api/billing/checkout", async (r) => { st.checkout.push(r.request().postDataJSON()); return json(r, 200, { url: `${BASE}/abo?billing=success&session_id=cs_test_1` }); });
  await ctx.route("**/api/billing/portal", (r) => json(r, 200, { url: `${BASE}/abo?billing=portal` }));
  await ctx.route("**/api/billing/status**", (r) => json(r, 200, { enabled: true, plan: null, status: null }));
  if (extra) await extra(ctx, mock, st);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`  [${scope}] pageerror:`, e.message.slice(0, 200)));
  return { ctx, page, mock, st };
}

/** Screenshots of `path` in desktop/mobile × light/dark, waiting for `sel`. */
async function shots(name, path, opts, sel) {
  if (!SHOTS) return;
  for (const [vp, viewport, scheme] of VARIANTS) {
    const { ctx, page } = await open({ ...opts, viewport, scheme });
    await page.goto(`${BASE}${path}`);
    if (sel) await vis(page, sel, 45000);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${name}-${vp}-${scheme}.png`, fullPage: true });
    await ctx.close();
  }
}

/**
 * Sign-up = the funnel (SPEC-FLOW D3; /login is login only). Walks `/start[?next=…]` as `role` up to «konto», ticks the
 * consent and clicks «Mit Google weiter» (OAuth simulated: authorize → /auth/callback?code=…). Returns the visited paths
 * from the click on (the OAuth return, the saving screen and the landing).
 */
async function funnelGoogle(page, role, answers, { start = "/start", until = "konto", beforeKonto } = {}) {
  if (!page.url().includes("/start")) await page.goto(`${BASE}${start}`);
  await walk(page, role, answers, until);
  if (beforeKonto) await beforeKonto();
  if (slugOf(page) !== "konto") await walk(page, role, answers, "konto");
  if (slugOf(page) !== "konto") throw new Error(`funnel did not reach «konto» (${page.url()})`);
  await page.getByRole("checkbox", { name: /Datenschutz/ }).first().check({ force: true });
  const seen = [];
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) seen.push(new URL(f.url()).pathname); });
  await page.getByRole("button", { name: /Mit Google weiter/ }).first().click();
  return seen;
}
/** wa_pending_signup as the OAuth return found it (recorded by an init script before the app runs) and as it is now. */
async function pendingSignup(page) {
  return page.evaluate(() => ({
    atReturn: sessionStorage.getItem("e2e_pending_at_callback"),
    now: localStorage.getItem("wa_pending_signup") ?? sessionStorage.getItem("wa_pending_signup"),
  }));
}
const ROLE_PICKER = "Wie nutzt du WendApply?";
const OLD_PICKER = (seen) => !seen.includes("/auth/role");
/** Funnel answers that reached the server (funnel_apply with the local copy, or the metadata copy). */
const sentAnswers = (st) => st.funnel.map((b) => b.p_answers).filter(Boolean);

const scenarios = {
  // ------------------------------------------------------------ A: sign-up keeps the role (FINDINGS 1, G5) and invite links (G17, G18)
  // Since the onboarding release the sign-up is the funnel /start: the role is chosen there once, carried through Google
  // (wa_pending_signup + the local funnel copy) and saved by funnel_apply right after the OAuth return.
  async A1() {
    const { ctx, page, mock, st } = await open({ authed: false, meta: {}, fresh: true, access: TRIAL({ account_type: "parent" }) });
    const seen = await funnelGoogle(page, "parent", ANSWERS.parent);
    await page.waitForURL(/\/familie/, { timeout: 60000 }).catch(() => {});
    check(page.url().includes("/familie"), `Google parent lands on /familie (${page.url()})`);
    check(OLD_PICKER(seen) && !seen.includes("/onboarding") && await none(page, `text=${ROLE_PICKER}`, 300), `role picker never shown (${seen.join(" > ")})`);
    check(!seen.includes("/start"), `role not asked again after the OAuth return (no /start?nach=google) (${seen.join(" > ")})`);
    const meta = mock.state.user.user_metadata;
    check(meta.role === "student" && meta.account_type === "parent" && meta.role_confirmed === true, `role + account_type stored (${JSON.stringify(meta)})`);
    check(sentAnswers(st).some((a) => a.role === "parent") && st.accountType === "parent", `server stored the parent role (funnel_apply role=parent → account_type ${st.accountType})`);
    check(st.funnel.length === 1, `funnel_apply called once (${st.funnel.length})`);
    check(await vis(page, '[data-testid="trial-banner"]'), "trial banner on /familie");
    // eltern-02: on /familie the plan card (#abo) is on the same page, so the banner carries no action of its own.
    check(await page.locator('[data-testid="trial-banner"] a').count() === 0, "parent banner on /familie: no own action (eltern-02)");
    const pending = await pendingSignup(page);
    check(pending.atReturn !== null && pending.now === null, `wa_pending_signup used once (at return ${pending.atReturn}, now ${pending.now})`);
    await ctx.close();
  },
  async A2() {
    const { ctx, page, mock, st } = await open({ authed: false, meta: {}, fresh: true, access: TRIAL({ account_type: "independent_student" }) });
    const year = new Date().getFullYear() - 15;
    await page.goto(`${BASE}/start`);
    await walk(page, "student", ANSWERS.student, "jahrgang");
    // The birth year is required before the funnel goes on (and so before «Mit Google weiter» exists).
    await page.locator("h1").first().waitFor({ timeout: 15000 });
    await primary(page).click();
    check(await vis(page, "text=Wähl dein Geburtsjahr.", 5000) && slugOf(page) === "jahrgang", "Google blocked until Jahrgang is chosen");
    const seen = await funnelGoogle(page, "student", { ...ANSWERS.student, birthYear: year });
    await page.waitForURL((u) => u.pathname === "/dashboard", { timeout: 60000 }).catch(() => {});
    // The old /onboarding wizard is retired (SPEC-FLOW D7): the product tour starts on the dashboard.
    check(new URL(page.url()).pathname === "/dashboard", `Google private student → /dashboard (tour) (${page.url()})`);
    check(OLD_PICKER(seen) && !seen.includes("/start") && !seen.includes("/onboarding/klasse"), `no role picker, no second question (${seen.join(" > ")})`);
    const sent = sentAnswers(st).find((a) => a.role === "student");
    check(sent?.birthYear === year && st.accountType === "independent_student", `account_type + birth_year kept (sent ${JSON.stringify(sent && { role: sent.role, birthYear: sent.birthYear })}, account_type ${st.accountType})`);
    check(mock.state.user.user_metadata.role === "student" && mock.state.user.user_metadata.role_confirmed === true, `role confirmed (${JSON.stringify(mock.state.user.user_metadata)})`);
    const pending = await pendingSignup(page);
    check(pending.atReturn !== null && pending.now === null, "wa_pending_signup used once");
    await ctx.close();
  },
  async A3() {
    const { ctx, page, mock, st } = await open({ authed: false, meta: {}, fresh: true, access: A({ has_access: false, state: "licence_required", role: "teacher" }) });
    const seen = await funnelGoogle(page, "staff", ANSWERS.staff);
    await page.waitForURL(/\/schullizenz/, { timeout: 60000 }).catch(() => {});
    check(page.url().includes("/schullizenz"), `Google teacher without licence → /schullizenz (${page.url()})`);
    check(OLD_PICKER(seen) && !seen.includes("/start"), `no role picker (${seen.join(" > ")})`);
    check(sentAnswers(st).some((a) => a.role === "staff") && mock.state.role === "teacher", "set_my_role(teacher) via funnel_apply(staff)");
    check(mock.state.user.user_metadata.role === "teacher", `teacher role in the metadata (${JSON.stringify(mock.state.user.user_metadata)})`);
    check(await vis(page, '[data-testid="licence-gate"]'), "licence gate shown");
    await ctx.close();
  },
  async A4() {
    // Class invite link while logged out (G18): /classes/join/<code> → /login → funnel with Schüler:in preset + the code prefilled.
    const { ctx, page, st } = await open({ authed: false, meta: {}, fresh: true, access: TRIAL() });
    await page.goto(`${BASE}/classes/join/KLAS7Q2`);
    check(await waitPath(page, /^\/start\?next=%2Fclasses%2Fjoin%2FKLAS7Q2/, 60000), `class invite → funnel with next (${page.url()})`);
    await walk(page, "student", ANSWERS.student, "rolle");
    check(await page.locator('[data-testid="funnel-role"] input[value="student"]').isChecked().catch(() => false), "role preset from the link: Schüler:in");
    await walk(page, "student", ANSWERS.student, "schule");
    check(await page.locator("#funnel-class-code").inputValue().catch(() => "") === "KLAS7Q2", "class code prefilled from the link");
    const seen = await funnelGoogle(page, "student", ANSWERS.student);
    await page.waitForURL(/\/classes\/join\/KLAS7Q2/, { timeout: 60000 }).catch(() => {});
    check(page.url().includes("/classes/join/KLAS7Q2"), `Google school student → class join first (${page.url()})`);
    check(OLD_PICKER(seen) && !seen.includes("/onboarding/klasse"), `no role picker, class code not asked again (${seen.join(" > ")})`);
    check(sentAnswers(st).some((a) => a.role === "student") && !JSON.stringify(st.funnel).includes("KLAS7Q2"), "funnel_apply(student) without the transient class code");
    // The existing join form (G8 consent): real name if the class needs it, age band, then «Klasse beitreten».
    await page.getByRole("button", { name: "Klasse beitreten" }).waitFor({ timeout: 30000 });
    if (await page.locator("#join-first").isVisible().catch(() => false)) { await page.locator("#join-first").fill("Lena"); await page.locator("#join-last").fill("Muster"); }
    await page.locator("label", { hasText: "Unter 16" }).first().click();
    await page.getByRole("button", { name: "Klasse beitreten" }).click();
    await page.getByRole("link", { name: "Weiter" }).or(page.getByRole("button", { name: "Weiter" })).first().click({ timeout: 30000 }).catch(() => {});
    await page.waitForURL((u) => u.pathname === "/dashboard", { timeout: 30000 }).catch(() => {});
    check(new URL(page.url()).pathname === "/dashboard", `joined → /dashboard (tour) (${page.url()})`);
    await ctx.close();
  },
  async A5() {
    const next = "/familie/einladung/ABCD1234?fuer=kind";
    const { ctx, page, mock, st } = await open({ authed: false, meta: {}, fresh: true, access: TRIAL({ account_type: "independent_student" }) });
    await page.goto(`${BASE}/login?next=${encodeURIComponent(next)}`);
    check(await waitPath(page, /^\/start\?/, 30000) && new URL(page.url()).searchParams.get("next") === next, `invite link → sign-up funnel with next (G18) (${page.url()})`);
    await walk(page, "student", ANSWERS.student, "rolle");
    check(await page.locator('[data-testid="funnel-role"] input[value="student"]').isChecked().catch(() => false), "role preset from the link: Schüler:in (fuer=kind)");
    let hint = false;
    const seen = await funnelGoogle(page, "student", ANSWERS.student, {
      until: "dabei",
      beforeKonto: async () => {
        hint = await vis(page, '[data-testid="funnel-family-invited"]', 15000);
        await advance(page, "dabei");
      },
    });
    check(hint, "invite hint shown («Du trittst nach dem Start der Familie bei …») (G18)");
    await page.waitForURL((u) => u.pathname.startsWith("/familie/einladung"), { timeout: 60000 }).catch(() => {});
    check(page.url().includes("/familie/einladung/ABCD1234"), `invite first, before the tour (G17) (${page.url()})`);
    check(OLD_PICKER(seen) && !seen.includes("/start"), `no role picker for invite signups (${seen.join(" > ")})`);
    check(st.accountType === "independent_student" && mock.state.user.user_metadata.role_confirmed === true, `invite preset applied (private student, ${st.accountType})`);
    await ctx.close();
  },
  async A6() {
    // Parent invite link + e-mail sign-up: role preset Elternteil, hint on «kind», the role and next travel with the sign-up.
    const next = "/familie/einladung/ABCD1234";
    const { ctx, page, st } = await open({ authed: false, meta: {}, fresh: true, access: TRIAL({ account_type: "parent" }) });
    await page.goto(`${BASE}/login?next=${encodeURIComponent(next)}`);
    check(await waitPath(page, /^\/start\?/, 30000) && new URL(page.url()).searchParams.get("next") === next, `parent invite link → funnel with next (${page.url()})`);
    await walk(page, "parent", ANSWERS.parent, "rolle");
    check(await page.locator('[data-testid="funnel-role"] input[value="parent"]').isChecked().catch(() => false), "role preset from the link: Elternteil");
    await walk(page, "parent", ANSWERS.parent, "kind");
    check(await vis(page, '[data-testid="funnel-kid-invited"]', 15000), "invite hint shown on «kind» (G18)");
    await advance(page, "kind");
    await walk(page, "parent", ANSWERS.parent, "konto");
    const seen = [];
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) seen.push(new URL(f.url()).pathname); });
    await fillKonto(page, "probe-onb-parent@wendapply-probe.invalid");
    await page.waitForURL(/\/start\/bestaetigen/, { timeout: 30000 }).catch(() => {});
    check(page.url().includes("/start/bestaetigen"), `e-mail sign-up → confirm screen (${page.url()})`);
    const su = st.signups.at(-1);
    check(su?.data?.role === "student" && su?.data?.account_type === "parent" && su?.data?.wa_funnel?.role === "parent", `sign-up metadata carries the role (${JSON.stringify(su?.data && { role: su.data.role, account_type: su.data.account_type, funnel: su.data.wa_funnel?.role })})`);
    const redirect = su?.redirect ? new URL(su.redirect) : null;
    check(redirect?.pathname === "/auth/callback" && redirect.searchParams.get("next") === next, `confirmation link returns to the invite (${su?.redirect})`);
    check(OLD_PICKER(seen), "no role picker");
    await ctx.close();
  },
  // ------------------------------------------------------------ B/C: banners
  async B1() {
    const opts = { meta: { role: "student", account_type: "parent", role_confirmed: true }, access: TRIAL({ account_type: "parent", trial_days_left: 7 }) };
    const { ctx, page } = await open(opts);
    await page.goto(`${BASE}/familie`);
    check(await vis(page, '[data-testid="trial-banner"]', 60000), "parent trial banner on /familie");
    check(await page.getByText("Gratis-Testwoche: noch 7 Tage").isVisible().catch(() => false), "text 'Gratis-Testwoche: noch 7 Tage'");
    await ctx.close();
    await shots("parent-trial", "/familie", opts, '[data-testid="trial-banner"]');
  },
  async C1() {
    const opts = { access: TRIAL({ trial_days_left: 3, account_type: "independent_student" }) };
    const { ctx, page } = await open(opts);
    await page.goto(`${BASE}/dashboard`);
    check(await vis(page, '[data-testid="trial-banner"]', 60000), "student trial banner on /dashboard");
    check(await page.getByText("Gratis-Testwoche: noch 3 Tage").isVisible().catch(() => false), "days left shown");
    check(await page.locator('[data-testid="trial-banner"] a[href="/abo"]').count() === 1, "'Abo wählen' → /abo");
    await ctx.close();
    await shots("student-trial", "/dashboard", opts, '[data-testid="trial-banner"]');
  },
  async C2() {
    const opts = { access: A({ reason: "school_licence", school: { id: "s1", name: "Sek Wil", valid_until: "2027-07-31" } }) };
    const { ctx, page } = await open(opts);
    await page.goto(`${BASE}/dashboard`);
    await page.waitForTimeout(5000);
    check(await none(page, '[data-testid="trial-banner"],[data-testid="paywall"]'), "school-licensed: no banner, no paywall");
    check(!/CHF/.test(await page.locator("main").innerText()), "school-licensed: no prices on /dashboard");
    await page.goto(`${BASE}/abo`);
    check(await vis(page, '[data-testid="abo-licensed"]'), "/abo: 'Zugang über deine Schule'");
    check(!/CHF/.test(await page.locator("main").innerText()), "school-licensed: no prices on /abo");
    await ctx.close();
    await shots("student-licensed", "/abo", opts, '[data-testid="abo-licensed"]');
  },
  // ------------------------------------------------------------ D: paywall + allow-list
  async D1() {
    const opts = { access: EXPIRED({ account_type: "independent_student" }) };
    const { ctx, page } = await open(opts);
    for (const p of ["/dashboard", "/applications", "/map", "/cvs", "/profile"]) {
      await page.goto(`${BASE}${p}`);
      check(await vis(page, '[data-testid="paywall"]', 60000), `paywall on ${p}`);
    }
    check(await page.getByText("Klassencode eingeben").isVisible(), "paywall offers the class code (G1)");
    check(await page.getByText("Rolle ändern").isVisible(), "paywall offers 'Falsche Rolle gewählt?' (G7)");
    for (const [p, sel] of [["/settings", '[data-testid="section-my-data"]'], ["/abo", '[data-testid="abo-plan-solo"]'], ["/classes", "main"], ["/familie", "main"]]) {
      await page.goto(`${BASE}${p}`);
      check(await vis(page, sel, 45000) && await none(page, '[data-testid="paywall"]'), `no paywall on ${p}`);
    }
    for (const p of ["/kontakt", "/hilfe", "/datenschutz"]) {
      await page.goto(`${BASE}${p}`);
      check(await none(page, '[data-testid="paywall"]', 1500), `no paywall on public ${p}`);
    }
    await ctx.close();
    await shots("student-paywall", "/dashboard", opts, '[data-testid="paywall"]');
  },
  async D2() {
    const opts = { meta: { role: "student", account_type: "parent", role_confirmed: true }, access: EXPIRED({ account_type: "parent" }) };
    const { ctx, page } = await open(opts);
    await page.goto(`${BASE}/familie`);
    await page.waitForTimeout(5000);
    check(await none(page, '[data-testid="paywall"]'), "expired parent: /familie open (create, invite, pay)");
    await page.goto(`${BASE}/dashboard`);
    await page.waitForURL(/\/familie/, { timeout: 30000 }).catch(() => {});
    check(page.url().includes("/familie"), "parent /dashboard → /familie");
    await page.goto(`${BASE}/profile`);
    check(await vis(page, '[data-testid="paywall"]', 45000), "expired parent: paywall on /profile");
    check(await page.getByText("Familienpaket wählen").first().isVisible(), "parent paywall: 'Familienpaket wählen'");
    await ctx.close();
    await shots("parent-paywall", "/profile", opts, '[data-testid="paywall"]');
  },
  async D3() {
    const opts = { access: EXPIRED({ expired_reason: "family_pending", family_pending: true, account_type: "independent_student" }) };
    const { ctx, page } = await open(opts);
    await page.goto(`${BASE}/dashboard`);
    check(await vis(page, '[data-testid="paywall"]', 60000), "family pending: paywall");
    check(!/CHF/.test(await page.locator('[data-testid="paywall"]').innerText()), "family pending: no prices (G14)");
    await ctx.close();
  },
  // ------------------------------------------------------------ E/F: switch off / not deployed
  async E1() {
    const { ctx, page } = await open({ access: EXPIRED({ enforced: false }) });
    await page.goto(`${BASE}/dashboard`);
    check(await none(page, '[data-testid="paywall"],[data-testid="trial-banner"],[data-testid="grace-banner"]', 7000), "enforced=false: no paywall, no banner");
    await ctx.close();
  },
  async F1() {
    const { ctx, page } = await open({ access: 404 });
    await page.goto(`${BASE}/applications`);
    check(await none(page, '[data-testid="paywall"],[data-testid="trial-banner"]', 7000), "my_access missing (PGRST202): app works, no access UI");
    check(await vis(page, "main h1"), "page content rendered");
    await ctx.close();
  },
  // ------------------------------------------------------------ G: grace
  async G1() {
    const opts = { access: A({ state: "grace", reason: "grace", grace_until: new Date(Date.now() + 5 * 864e5).toISOString(), subscription: { plan: "solo", status: "past_due", interval: "month", current_period_end: new Date().toISOString(), cancel_at_period_end: false } }) };
    const { ctx, page } = await open(opts);
    await page.goto(`${BASE}/dashboard`);
    check(await vis(page, '[data-testid="grace-banner"]', 60000), "grace banner");
    check(await page.getByText("Zahlung fehlgeschlagen").isVisible(), "'Zahlung fehlgeschlagen'");
    await ctx.close();
    await shots("student-grace", "/dashboard", opts, '[data-testid="grace-banner"]');
  },
  // ------------------------------------------------------------ H: teachers, school admins
  async H1() {
    const opts = { role: "teacher", access: A({ has_access: false, state: "licence_required", role: "teacher" }) };
    const { ctx, page } = await open(opts);
    for (const p of ["/teacher", "/teacher/onboarding"]) {
      await page.goto(`${BASE}${p}`);
      await page.waitForURL(/schullizenz/, { timeout: 60000 }).catch(() => {});
      check(page.url().includes("/schullizenz"), `${p} → /schullizenz (${page.url()})`);
    }
    check(await vis(page, '[data-testid="licence-gate"]'), "licence gate");
    check(await page.getByText("support@wendapply.ch").first().isVisible(), "support@wendapply.ch shown");
    // lehrperson-07: «Support schreiben» (mailto) + «Für Schulen» replace the /kontakt link.
    check(await page.locator('[data-testid="licence-gate"] a[href^="mailto:support@wendapply.ch"]', { hasText: "Support schreiben" }).count() > 0, "«Support schreiben» mailto link");
    check(await page.locator('[data-testid="licence-gate"] a[href="/schulen"]', { hasText: "Für Schulen" }).count() > 0, "«Für Schulen» link");
    check(await page.getByText("lehrer@beispiel.ch").first().isVisible(), "own login e-mail shown for the school admin");
    check(await none(page, '[data-testid="trial-banner"]', 500), "teachers: no trial banner");
    await page.goto(`${BASE}/abo`);
    check(await vis(page, '[data-testid="abo-staff"]'), "/abo for teachers: no plans");
    await ctx.close();
    await shots("teacher-licence", "/schullizenz", opts, '[data-testid="licence-gate"]');
  },
  async H2() {
    const { ctx, page } = await open({ role: "teacher", meta: { role: "teacher", teacher_onboarded: true, full_name: "Herr Keller" }, access: A({ role: "teacher", reason: "school_licence", school: { id: "s1", name: "Sek Wil", valid_until: null } }) });
    await page.goto(`${BASE}/teacher`);
    await page.waitForTimeout(6000);
    check(new URL(page.url()).pathname.startsWith("/teacher"), `licensed teacher stays on /teacher (${page.url()})`);
    check(await none(page, '[data-testid="licence-gate"],[data-testid="trial-banner"]', 500), "no gate, no banner");
    await ctx.close();
  },
  async H3() {
    const { ctx, page } = await open({ access: TRIAL() });
    await page.goto(`${BASE}/schul-admin`);
    await page.waitForURL((u) => !u.pathname.startsWith("/schul-admin"), { timeout: 60000 }).catch(() => {});
    check(!page.url().includes("/schul-admin"), `student on /schul-admin → home (${page.url()}) (G21)`);
    await ctx.close();
  },
  async H4() {
    const { ctx, page } = await open({ meta: { role: "student", role_confirmed: true }, access: A({ role: "school_admin", has_access: false, state: "licence_required" }) });
    await page.goto(`${BASE}/dashboard`);
    await page.waitForURL(/schul-admin/, { timeout: 60000 }).catch(() => {});
    check(page.url().includes("/schul-admin"), `school admin → /schul-admin (G6) (${page.url()})`);
    check(await none(page, '[data-testid="licence-gate"],[data-testid="paywall"]'), "school admin keeps /schul-admin without licence");
    await ctx.close();
  },
  // ------------------------------------------------------------ I: blocked
  async I1() {
    const opts = { access: A({ has_access: false, state: "blocked", blocked: true }) };
    const { ctx, page } = await open(opts);
    await page.goto(`${BASE}/dashboard`);
    check(await vis(page, '[data-testid="blocked-page"]', 60000), "blocked page");
    check(await page.getByText("Konto gesperrt").first().isVisible(), "'Konto gesperrt'");
    await page.goto(`${BASE}/settings`);
    check(await vis(page, '[data-testid="section-my-data"]', 45000) && await none(page, '[data-testid="blocked-page"]'), "blocked: /settings (export, delete) reachable (G11)");
    await ctx.close();
    await shots("blocked", "/dashboard", opts, '[data-testid="blocked-page"]');
  },
  // ------------------------------------------------------------ J: PAYWALL error mid-session
  async J1() {
    const { ctx, page, st } = await open({ access: TRIAL({ trial_days_left: 0 }) });
    await page.goto(`${BASE}/dashboard`);
    check(await vis(page, '[data-testid="trial-banner"]', 60000), "trial (last day) first");
    check(await page.getByText("heute letzter Tag").isVisible(), "'heute letzter Tag'");
    st.access = EXPIRED();
    await page.evaluate((u) => fetch(`${u}/rest/v1/rpc/paywall_probe`, { method: "POST" }), SUPABASE_URL);
    check(await vis(page, '[data-testid="paywall"]', 15000), "server answers PAYWALL → paywall without reload");
    await ctx.close();
  },
  async J2() {
    const { ctx, page, st } = await open({ access: TRIAL({ trial_days_left: 0 }) });
    await page.goto(`${BASE}/dashboard`);
    check(await vis(page, '[data-testid="trial-banner"]', 60000), "trial (last day) first");
    st.access = EXPIRED();
    await page.evaluate((u) => fetch(`${u}/rest/v1/rls_gate_probe`, { method: "POST", body: "{}" }), SUPABASE_URL);
    check(await vis(page, '[data-testid="paywall"]', 15000), "RLS 'access gate' refusal (403/42501) → paywall without reload");
    await ctx.close();
  },
  // ------------------------------------------------------------ K: /abo
  async K1() {
    const opts = { access: TRIAL({ account_type: "independent_student", trial_days_left: 4 }) };
    const { ctx, page, st } = await open(opts);
    await page.goto(`${BASE}/abo`);
    check(await vis(page, '[data-testid="abo-plan-solo"]', 60000), "student: Einzelabo");
    const text = await page.locator('[data-testid="abo-plan-solo"]').innerText();
    check(/CHF 4\.90/.test(text) && /CHF 49/.test(text), "CHF 4.90 / CHF 49");
    check(await page.locator('[data-testid="abo-plan-family"]').count() === 1, "family alternative shown");
    check(await none(page, '[data-testid="trial-banner"]', 300), "no trial banner on /abo itself");
    await page.locator("label", { hasText: "Monatlich" }).click();
    st.access = A({ reason: "subscription", subscription: { plan: "solo", status: "active", interval: "month", current_period_end: new Date(Date.now() + 30 * 864e5).toISOString(), cancel_at_period_end: false } });
    await page.getByRole("button", { name: "Einzelabo buchen" }).click();
    await page.waitForURL(/\/abo$/, { timeout: 30000 }).catch(() => {});
    check(st.checkout[0]?.plan === "solo" && st.checkout[0]?.interval === "month" && st.checkout[0]?.owner === "me", `checkout body ${JSON.stringify(st.checkout[0])}`);
    check(await vis(page, "text=Die Zahlung ist eingegangen"), "return: success message");
    check(await vis(page, '[data-testid="abo-solo-active"]', 20000), "return: my_access re-read → Einzelabo aktiv");
    await ctx.close();
    await shots("abo-student", "/abo", opts, '[data-testid="abo-plan-solo"]');
  },
  async K2() {
    const opts = { meta: { role: "student", account_type: "parent", role_confirmed: true }, access: TRIAL({ account_type: "parent" }) };
    const { ctx, page } = await open(opts);
    await page.goto(`${BASE}/abo`);
    check(await vis(page, '[data-testid="abo-plan-family"]', 60000), "parent: Familienpaket");
    check(await page.locator('[data-testid="abo-plan-solo"]').count() === 0, "parent: no Einzelabo");
    check(/CHF 7\.90/.test(await page.locator('[data-testid="abo-plan-family"]').innerText()), "CHF 7.90");
    await ctx.close();
    await shots("abo-parent", "/abo", opts, '[data-testid="abo-plan-family"]');
  },
  async K3() {
    const { ctx, page } = await open({ access: A({ reason: "school_licence", subscription: { plan: "solo", status: "active", interval: "year", current_period_end: null, cancel_at_period_end: false } }) });
    await page.goto(`${BASE}/abo`);
    check(await vis(page, '[data-testid="abo-pays-twice"]', 60000), "school licence + own Einzelabo: 'Einzelabo kündigen' (G15)");
    await ctx.close();
  },
};

try {
  for (const [name, fn] of Object.entries(scenarios)) {
    if (ONLY && !ONLY.has(name)) continue;
    scope = name;
    try { await fn(); } catch (e) { check(false, `crashed: ${e.message.split("\n")[0]}`); }
  }
} finally {
  await browser.close();
  if (server) server.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? `, FAILED:\n${failed.map((f) => ` - [${f.scope}] ${f.text}`).join("\n")}` : ""}`);
process.exit(failed.length ? 1 : 0);
