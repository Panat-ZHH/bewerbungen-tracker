// Headless-Chrome e2e for the platform admin dashboard (/admin, docs/access/ADMIN.md). Nothing real is contacted:
// Supabase auth (session, user, MFA factors / challenge / verify) and the admin API (/api/admin/*) are answered by a
// stateful in-browser mock. The real API logic is covered by tests/admin-api.test.mjs; this checks the UI flows.
//
//   PLAYWRIGHT=<…/playwright-core/index.mjs> CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/admin-e2e.mjs
//   BASE=http://localhost:3210 node scripts/admin-e2e.mjs   # use a running dev server (NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321)
//
// Screenshots (desktop + mobile, light + dark): OUT (default ~/Projects/bewerbungen-tracker-wt/_access/admin-shots/).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = (process.env.OUT || join(homedir(), "Projects/bewerbungen-tracker-wt/_access/admin-shots")).replace(/\/?$/, "/");
mkdirSync(OUT, { recursive: true });
const SUPA = "http://localhost:54321";

async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT, join(homedir(), "Projects/bewerbungen-tracker-wt/audit-tools/node_modules/playwright-core/index.mjs")].filter(Boolean);
  for (const p of candidates) if (existsSync(p)) return import(pathToFileURL(p).href);
  return import("playwright-core");
}
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const freePort = () => new Promise((resolve) => { const s = createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const reachable = async (url) => { try { const r = await fetch(url + "/login", { signal: AbortSignal.timeout(8000) }); return r.status < 500; } catch { return false; } };

let devServer;
async function resolveBase() {
  if (process.env.BASE) { if (await reachable(process.env.BASE)) return process.env.BASE; throw new Error(`BASE ${process.env.BASE} not reachable`); }
  const port = await freePort();
  console.log(`Starting a dev server on port ${port} (dummy Supabase env) ...`);
  devServer = spawn("npx", ["next", "dev", "--webpack", "-p", String(port)], {
    cwd: ROOT, stdio: "ignore",
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: SUPA, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "dummy", SUPABASE_SERVICE_ROLE_KEY: "", STRIPE_SECRET_KEY: "" },
  });
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 180; i++) { if (await reachable(base)) return base; await new Promise((r) => setTimeout(r, 1000)); }
  throw new Error("dev server did not start in time");
}

// ------------------------------------------------------------------------------------------------ fixtures
const iso = (days) => new Date(Date.now() + days * 864e5).toISOString();
const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = (aal) => `${b64({ alg: "HS256" })}.${b64({ sub: ADMIN_ID, aal, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;

function people() {
  const mk = (i, over) => ({
    id: `22222222-2222-4222-8222-2222222222${String(i).padStart(2, "0")}`, email: `person${i}@beispiel.ch`, name: `Person ${i}`, role: "student",
    account_type: "independent_student", schools: [], created_at: iso(-i), last_sign_in_at: iso(-i / 2), trial_ends_at: iso(7 - i),
    free_access_until: null, blocked: false, access_state: i < 7 ? "trial" : "expired", access_reason: i < 7 ? "trial" : "none", subscription: null, mfa: false, ...over,
  });
  return [
    mk(1, { email: "lena.mueller@beispiel.ch", name: "Lena Müller" }),
    mk(2, { role: "parent", account_type: "parent", name: "Andrea Keller", access_state: "active", access_reason: "family_subscription",
      subscription: { id: "sub_1Abc", customer: "cus_1Abc", plan_id: "family", status: "active", current_period_end: iso(25), cancel_at_period_end: false, owner: "family", stripe_url: "https://dashboard.stripe.com/test/subscriptions/sub_1Abc", customer_url: "https://dashboard.stripe.com/test/customers/cus_1Abc" } }),
    mk(3, { role: "teacher", account_type: null, name: "Herr Brunner", trial_ends_at: null, access_state: "licence_required", access_reason: "none" }),
    mk(4, { role: "student", account_type: "school_student", schools: [{ id: "55555555-5555-4555-8555-555555555501", name: "Sek Wiesendangen", via: "class" }], trial_ends_at: null, access_state: "active", access_reason: "school_licence" }),
    mk(9, { email: "gesperrt@beispiel.ch", name: "Gesperrte Person", blocked: true, access_state: "blocked", access_reason: "none" }),
    mk(12, { free_access_until: iso(60), access_state: "active", access_reason: "grant" }),
  ];
}

function createMock() {
  const state = {
    aal: "aal1", factors: [], users: people(), audit: [], admin: true, apiCalls: [], families: {},
    schools: [{ id: "55555555-5555-4555-8555-555555555501", name: "Sek Wiesendangen", canton_or_state: "ZH", country: "CH", created_at: iso(-90),
      licence: { id: "66666666-6666-4666-8666-666666666601", package: "starter", status: "active", state: "active", student_limit: 100, pilot_start: null, pilot_end: null, valid_from: iso(-90).slice(0, 10), valid_until: iso(275).slice(0, 10), billing_interval: "yearly", notes: null, created_at: iso(-90) },
      students: 42, admins: 1, teachers: 2 }],
  };
  const user = () => ({ id: ADMIN_ID, aud: "authenticated", role: "authenticated", email: "admin@beispiel.ch", user_metadata: { role: "teacher" }, app_metadata: {}, created_at: iso(-300), factors: state.factors });
  const session = () => ({ access_token: token(state.aal), refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: user() });
  const log = (action, target_user = null, target_school = null, details = {}) => state.audit.unshift({ id: state.audit.length + 1, at: new Date().toISOString(), admin_id: ADMIN_ID, admin_email: "admin@beispiel.ch", action, target_user, target_school, details, ip: "127.0.0.1" });

  async function supabase(route) {
    const req = route.request();
    const url = new URL(req.url());
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const reply = (status, body) => route.fulfill({ status, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(body) });
    const p = url.pathname;
    if (p === "/auth/v1/user") return reply(200, user());
    if (p === "/auth/v1/token") return reply(200, session());
    if (p === "/auth/v1/logout") return route.fulfill({ status: 204, headers: cors });
    if (p === "/auth/v1/factors" && req.method() === "POST") {
      const f = { id: `f${state.factors.length + 1}`, type: "totp", factor_type: "totp", status: "unverified", friendly_name: "WendApply Admin", created_at: iso(0), updated_at: iso(0) };
      state.factors.push(f);
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><rect width='160' height='160' fill='white'/><rect x='20' y='20' width='40' height='40'/><rect x='100' y='20' width='40' height='40'/><rect x='20' y='100' width='40' height='40'/><rect x='80' y='80' width='20' height='20'/></svg>`;
      return reply(200, { id: f.id, type: "totp", friendly_name: f.friendly_name, totp: { qr_code: svg, secret: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/WendApply:admin" } });
    }
    let m;
    if ((m = /^\/auth\/v1\/factors\/([^/]+)$/.exec(p)) && req.method() === "DELETE") { state.factors = state.factors.filter((f) => f.id !== m[1]); return reply(200, { id: m[1] }); }
    if ((m = /^\/auth\/v1\/factors\/([^/]+)\/challenge$/.exec(p))) return reply(200, { id: "ch1", type: "totp", expires_at: Math.floor(Date.now() / 1000) + 300 });
    if ((m = /^\/auth\/v1\/factors\/([^/]+)\/verify$/.exec(p))) {
      const body = JSON.parse(req.postData() || "{}");
      if (body.code !== "123456") return reply(422, { code: "mfa_verification_failed", error_code: "mfa_verification_failed", msg: "Invalid TOTP code entered", message: "Invalid TOTP code entered" });
      state.factors = state.factors.map((f) => (f.id === m[1] ? { ...f, status: "verified" } : f));
      state.aal = "aal2";
      return reply(200, session());
    }
    if (p.startsWith("/rest/v1/rpc/")) return reply(200, null);
    if (p.startsWith("/rest/v1/")) return reply(200, []);
    return reply(200, {});
  }

  // Shape of public.admin_family_status() (supabase/migrations/20261120100000_admin_family_grant.sql).
  function familyStatus(u) {
    const stripe = u.subscription?.owner === "family";
    const f = state.families[u.id] ?? (stripe ? { name: "Familie Keller", licence: { id: "77777777-7777-4777-8777-777777777700", status: "active", state: "active", source: "stripe",
      valid_from: iso(-5).slice(0, 10), valid_until: iso(25).slice(0, 10), seats_parents: 1, seats_children: 1, assigned_by: "stripe", notes: null, created_at: iso(-5), manual: false } } : null);
    const eligible = u.role !== "teacher" && u.role !== "school_admin";
    const manualActive = Boolean(f?.licence?.manual && f.licence.status === "active");
    const kind = u.access_reason === "family_subscription" ? (stripe ? "family_stripe" : "family_manual") : u.access_reason === "school_licence" ? "school"
      : u.access_reason === "grant" ? "grant" : u.access_reason === "trial" ? "trial" : u.access_reason === "subscription" ? "solo" : "none";
    return {
      user_id: u.id, plan_kind: kind, access_state: u.access_state, access_reason: u.access_reason, eligible, stripe_managed: stripe,
      family: f ? { id: "fam-1", name: f.name, created_at: iso(-5), my_role: u.role === "parent" ? "parent" : "child", my_status: "active" } : null,
      members: f ? [
        { user_id: u.id, email: u.email, role: u.role === "parent" ? "parent" : "child", status: "active", consent_status: "not_required", joined_at: iso(-5) },
        ...(stripe || manualActive ? [{ user_id: "99999999-9999-4999-8999-999999999901", email: "kind.keller@beispiel.ch", role: "child", status: "pending", consent_status: "pending", joined_at: iso(-1) }] : []),
      ] : [],
      licence: f?.licence ?? null, manual_licence_id: manualActive ? f.licence.id : null,
      can_grant: eligible && !stripe, can_revoke: manualActive && !stripe,
    };
  }

  async function adminApi(route) {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname.replace(/^\/api\/admin/, "");
    const reply = (status, body) => route.fulfill({ status, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body) });
    const auth = req.headers().authorization ?? "";
    state.apiCalls.push({ method: req.method(), path: p, query: url.search, auth: auth.slice(0, 7), cookie: Boolean(req.headers().cookie && /sb-/.test(req.headers().cookie)) });
    if (!auth.startsWith("Bearer ")) return reply(401, { error: "unauthenticated" });
    if (!state.admin) return reply(404, { error: "not_found" });
    const claims = JSON.parse(Buffer.from(auth.slice(7).split(".")[1], "base64url").toString());
    if (claims.aal !== "aal2") return reply(403, { error: "mfa_required" });
    const body = req.method() === "POST" || req.method() === "DELETE" ? JSON.parse(req.postData() || "{}") : null;
    if (body && body.confirm !== true) return reply(400, { error: "invalid_input", field: "confirm" });

    if (p === "/me") return reply(200, { user_id: ADMIN_ID, email: "admin@beispiel.ch", aal: "aal2" });
    if (p === "/users") {
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const st = url.searchParams.get("state") ?? "all";
      const sub = url.searchParams.get("sub") ?? "all";
      const items = state.users.filter((u) => (!q || u.email.includes(q) || u.name.toLowerCase().includes(q))
        && (st === "all" || (st === "blocked" && u.blocked) || (st === "grant" && (u.free_access_until || u.free_access_forever)) || (st === "grant_forever" && u.free_access_forever) || (st === "trial" && u.access_state === "trial") || (st === "trial_over" && u.access_state === "expired"))
        && (sub === "all" || (sub === "active" && u.subscription?.status === "active") || (sub === "none" && !u.subscription)));
      return reply(200, { items, total: items.length, page: 1, page_size: 50 });
    }
    let m;
    if ((m = /^\/users\/([^/]+)\/family$/.exec(p))) {
      const u = state.users.find((x) => x.id === m[1]);
      if (!u) return reply(404, { error: "not_found" });
      if (req.method() === "GET") return reply(200, familyStatus(u));
      const f = state.families[u.id];
      if (req.method() === "POST") {
        if (u.role === "teacher") return reply(409, { error: "conflict", reason: "family_not_eligible" });
        if (u.subscription?.owner === "family") return reply(409, { error: "conflict", reason: "stripe_managed" });
        if (body.seats_children > 20 || body.seats_children < 1) return reply(400, { error: "invalid_input", field: "seats_children" });
        const lic = { id: "77777777-7777-4777-8777-777777777701", status: "active", state: "active", source: "manual", valid_from: iso(0).slice(0, 10),
          valid_until: body.until ?? null, seats_parents: body.seats_parents, seats_children: body.seats_children, assigned_by: `admin:${ADMIN_ID}`,
          notes: body.note ?? null, created_at: iso(0), manual: true };
        const before = f?.licence ?? null;
        state.families[u.id] = { name: f?.name ?? "Familie", licence: lic };
        u.access_state = "active"; u.access_reason = "family_subscription";
        log("family_grant", u.id, null, { before, after: { status: "active", valid_until: lic.valid_until, seats_parents: lic.seats_parents, seats_children: lic.seats_children }, note: body.note ?? null });
        return reply(200, { ok: true, family: { family_id: "fam-new", licence_id: lic.id, status: "active", valid_until: lic.valid_until } });
      }
      if (req.method() === "DELETE") {
        if (!f?.licence || f.licence.status !== "active") return reply(409, { error: "conflict", reason: "family_not_granted" });
        f.licence = { ...f.licence, status: "cancelled", state: "cancelled" };
        u.access_state = "expired"; u.access_reason = "none";
        log("family_revoke", u.id, null, { before: { status: "active" }, after: { status: "cancelled" }, note: body.note ?? null });
        return reply(200, { ok: true, status: "cancelled" });
      }
    }
    if ((m = /^\/users\/([^/]+)$/.exec(p))) {
      const u = state.users.find((x) => x.id === m[1]);
      if (!u) return reply(404, { error: "not_found" });
      if (req.method() === "GET") {
        return reply(200, { ...u, access: { has_access: !u.blocked, state: u.access_state, reason: u.access_reason, role: u.role === "parent" ? "parent" : u.role, account_type: u.account_type, trial_ends_at: u.trial_ends_at, trial_days_left: 3, grace_until: null, grant_until: u.free_access_until, subscription: null, school: null, blocked: u.blocked, enforced: true },
          account_access: { user_id: u.id, trial_started_at: u.created_at, trial_ends_at: u.trial_ends_at, free_access_until: u.free_access_until, free_access_note: null, blocked_at: u.blocked ? iso(-1) : null, blocked_reason: u.blocked ? "Test" : null },
          subscriptions: u.subscription ? [u.subscription] : [], families: u.role === "parent" ? [{ id: "fam1", name: "Familie Keller", role: "parent", status: "active" }] : [], classes: [], platform_admin: false,
          audit: state.audit.filter((a) => a.target_user === u.id) });
      }
      const a = body.action;
      if (a === "extend_trial") u.trial_ends_at = iso(Number(body.days));
      else if (a === "set_trial") u.trial_ends_at = `${body.trial_ends_at}T23:59:59.000Z`;
      else if (a === "grant_access") {
        u.free_access_forever = body.forever === true;
        u.free_access_until = body.forever === true ? null : `${body.until}T23:59:59.000Z`;
        u.access_state = "active"; u.access_reason = "grant";
      } else if (a === "revoke_access") { u.free_access_until = null; u.free_access_forever = false; }
      else if (a === "block" || a === "soft_delete") {
        if (a === "soft_delete" && String(body.confirm_email).toLowerCase() !== u.email) return reply(400, { error: "invalid_input", field: "confirm_email" });
        if (a === "block" && !body.reason) return reply(400, { error: "invalid_input", field: "reason" });
        u.blocked = true; u.access_state = "blocked";
      } else if (a === "unblock") { u.blocked = false; u.access_state = "trial"; }
      else if (a === "delete_account") {
        if (!u.blocked) return reply(409, { error: "conflict", reason: "not_blocked" });
        if (String(body.confirm_text).toLowerCase() !== u.email) return reply(400, { error: "invalid_input", field: "confirm_text" });
        log(`user.${a}`, u.id, null, {});
        state.users = state.users.filter((x) => x !== u);
        return reply(200, { ok: true, deleted: true });
      } else return reply(400, { error: "invalid_input", field: "action" });
      log(`user.${a}`, u.id, null, { before: {}, after: body });
      return reply(200, { ok: true, account_access: {} });
    }
    if (p === "/signups") {
      const days = Number(url.searchParams.get("days") ?? 7);
      const by_day = Array.from({ length: days }, (_, i) => ({ day: iso(i - days + 1).slice(0, 10), count: (i * 7) % 5 }));
      return reply(200, { days, total: by_day.reduce((s, d) => s + d.count, 0), by_day, users: state.users.slice(0, 4) });
    }
    if (p === "/schools") {
      if (req.method() === "POST") {
        const s = { id: `55555555-5555-4555-8555-5555555555${String(state.schools.length + 1).padStart(2, "0")}`, name: body.name, canton_or_state: body.canton_or_state ?? "", country: body.country ?? "CH", created_at: iso(0), licence: null, students: 0, admins: 0, teachers: 0 };
        state.schools.push(s);
        log("school.create.done", null, s.id, { after: body });
        return reply(200, { ok: true, school_id: s.id });
      }
      return reply(200, { items: state.schools });
    }
    if ((m = /^\/schools\/([^/]+)$/.exec(p))) {
      const s = state.schools.find((x) => x.id === m[1]);
      if (!s) return reply(404, { error: "not_found" });
      if (req.method() === "GET") {
        return reply(200, { ...s, licences: s.licence ? [s.licence] : [], admin_users: [{ user_id: "a1", email: "schulleitung@beispiel.ch", name: "Frau Meier", created_at: iso(-80) }],
          teacher_users: [{ user_id: "t1", email: "lehrer@beispiel.ch", name: "Herr Brunner", created_at: iso(-70) }],
          classes: [{ id: "c1", name: "3a", teacher_id: "t1", archived: false, students: 21 }], audit: state.audit.filter((a) => a.target_school === s.id) });
      }
      if (body.action === "assign_licence") {
        s.licence = { id: "66666666-6666-4666-8666-666666666699", package: body.package, status: body.status ?? "active", state: "active", student_limit: body.student_limit ?? 100, pilot_start: null, pilot_end: null, valid_from: body.start ?? iso(0).slice(0, 10), valid_until: body.end ?? iso(364).slice(0, 10), billing_interval: body.billing_interval ?? "yearly", notes: body.notes ?? null, created_at: iso(0) };
      }
      if (body.action === "grant_access") s.free_access = { forever: body.forever === true, until: body.forever ? null : `${body.until}T23:59:59.000Z`, note: body.note ?? null, granted_by: ADMIN_ID, granted_at: iso(0) };
      if (body.action === "revoke_access") s.free_access = null;
      if (body.action === "add_teacher" && body.email === "niemand@beispiel.ch") return reply(409, { error: "conflict", reason: "user_not_found" });
      log(`school.${body.action}`, null, s.id, { after: body });
      return reply(200, { ok: true });
    }
    if (p === "/audit") return reply(200, { items: state.audit, total: state.audit.length, page: 1, page_size: 50 });
    return reply(404, { error: "not_found" });
  }

  return {
    state,
    async install(context, { authed = true } = {}) {
      if (authed) await context.addInitScript((s) => { localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)); }, session());
      await context.route(`${SUPA}/**`, supabase);
      await context.route("**/api/admin/**", adminApi);
    },
  };
}

// ------------------------------------------------------------------------------------------------ runner
const results = [];
const ONLY = process.env.ONLY ?? "";
async function step(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  try { await fn(); results.push(["PASS", name]); console.log(`PASS ${name}`); }
  catch (e) { results.push(["FAIL", name, e.message.split("\n")[0]]); console.log(`FAIL ${name}: ${e.message.split("\n")[0]}`); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const PROFILES = {
  desktop: { viewport: { width: 1360, height: 900 } },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop1280: { viewport: { width: 1280, height: 900 } },
};
// Family package screenshots (390 light, 1280 dark …): FAMILY_OUT (default ~/Projects/bewerbungen-tracker-wt/_onboarding/family-shots/).
const FAMILY_OUT = (process.env.FAMILY_OUT || join(homedir(), "Projects/bewerbungen-tracker-wt/_onboarding/family-shots")).replace(/\/?$/, "/");

async function main() {
  const { chromium } = await loadPlaywright();
  const base = await resolveBase();
  const browser = await chromium.launch({ executablePath: existsSync(CHROME) ? CHROME : undefined, headless: true });
  const tid = (page, id) => page.locator(`[data-testid="${id}"]`);
  const ctx = async (profile, theme, mockOpts = {}) => {
    const context = await browser.newContext({ ...PROFILES[profile], colorScheme: theme, locale: "de-CH" });
    await context.addInitScript((t) => { localStorage.setItem("wendapply-theme", t); }, theme);
    const mock = createMock();
    if (mockOpts.admin === false) mock.state.admin = false;
    if (mockOpts.aal2) { mock.state.aal = "aal2"; mock.state.factors = [{ id: "f1", factor_type: "totp", status: "verified", friendly_name: "WendApply Admin" }]; }
    if (mockOpts.verifiedFactor) mock.state.factors = [{ id: "f1", factor_type: "totp", status: "verified", friendly_name: "WendApply Admin" }];
    await mock.install(context, { authed: mockOpts.authed !== false });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    return { context, page, mock, errors };
  };
  // The side panel is fixed to the viewport: capture just the viewport while it is open.
  const shot = async (page, name) => page.screenshot({ path: `${OUT}${name}.png`, fullPage: !(await page.locator('[data-testid="admin-panel"]').count()), animations: "disabled" });

  await step("logged out → login prompt, noindex meta", async () => {
    const { context, page } = await ctx("desktop", "light", { authed: false });
    await page.goto(`${base}/admin`);
    await tid(page, "admin-login-prompt").waitFor({ timeout: 60000 });
    const robots = await page.locator('meta[name="robots"]').first().getAttribute("content");
    assert(/noindex/.test(robots ?? ""), `robots meta: ${robots}`);
    await shot(page, "login-prompt-desktop-light");
    await context.close();
  });

  await step("non-admin → not-found look (404 from API)", async () => {
    const { context, page } = await ctx("desktop", "light", { admin: false });
    await page.goto(`${base}/admin`);
    await tid(page, "admin-not-found").waitFor({ timeout: 30000 });
    assert(!(await tid(page, "admin-dashboard").count()), "dashboard must not render");
    await shot(page, "not-admin-desktop-light");
    await context.close();
  });

  await step("MFA enrolment: QR + secret, wrong code refused, right code → dashboard", async () => {
    const { context, page, mock } = await ctx("desktop", "light");
    await page.goto(`${base}/admin`);
    await tid(page, "admin-mfa").waitFor({ timeout: 30000 });
    await tid(page, "admin-mfa-qr").waitFor();
    await shot(page, "mfa-enrol-desktop-light");
    await tid(page, "admin-mfa-code").fill("000000");
    await tid(page, "admin-mfa-submit").click();
    await page.waitForTimeout(800);
    assert(!(await tid(page, "admin-dashboard").count()), "wrong code must not open the dashboard");
    await tid(page, "admin-mfa-code").fill("123456");
    await tid(page, "admin-mfa-submit").click();
    await tid(page, "admin-dashboard").waitFor({ timeout: 15000 });
    assert(mock.state.aal === "aal2", "verified");
    assert(mock.state.apiCalls.every((c) => c.auth === "Bearer " && !c.cookie), "bearer only, no cookies");
    await context.close();
  });

  await step("MFA verification with an existing factor (no QR)", async () => {
    const { context, page } = await ctx("mobile", "light", { verifiedFactor: true });
    await page.goto(`${base}/admin`);
    await tid(page, "admin-mfa").waitFor({ timeout: 30000 });
    assert(!(await tid(page, "admin-mfa-qr").count()), "no QR for an enrolled admin");
    await shot(page, "mfa-verify-mobile-light");
    await tid(page, "admin-mfa-code").fill("123456");
    await tid(page, "admin-mfa-submit").click();
    await tid(page, "admin-dashboard").waitFor({ timeout: 15000 });
    await context.close();
  });

  for (const profile of ["desktop", "mobile"]) for (const theme of ["light", "dark"]) {
    const tag = `${profile}-${theme}`;
    await step(`dashboard tabs + actions (${tag})`, async () => {
      const { context, page, mock, errors } = await ctx(profile, theme, { aal2: true });
      await page.goto(`${base}/admin`);
      await tid(page, "admin-dashboard").waitFor({ timeout: 30000 });
      await tid(page, "admin-user-row").first().waitFor();
      assert((await tid(page, "admin-user-row").count()) === 6, "6 people listed");
      await page.waitForFunction(() => document.querySelector('[data-testid="admin-stat-total-value"]')?.textContent === "6", null, { timeout: 10000 });
      assert((await tid(page, "admin-stat-paying-value").textContent()) === "1", "1 paying");
      assert((await tid(page, "admin-stat-schools-value").textContent()) === "1", "1 school");
      const statuses = await page.locator('[data-testid="admin-user-row"] [data-testid="admin-status-badge"]:visible').evaluateAll((els) => els.map((e) => e.textContent));
      for (const want of ["Trial", "Zahlend", "Gesperrt", "Lizenz fehlt"]) assert(statuses.includes(want), `status ${want} in ${statuses.join(",")}`);
      await shot(page, `users-${tag}`);

      // Filter chips and the number tiles use the same filters.
      await tid(page, "admin-chip-blocked").click();
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="admin-user-row"]').length === 1, null, { timeout: 5000 });
      await tid(page, "admin-stat-paying").click();
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="admin-user-row"]').length === 1 && document.querySelector('[data-testid="admin-chip-paying"]')?.getAttribute("aria-pressed") === "true", null, { timeout: 5000 });
      await tid(page, "admin-stat-newWeek").click();
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="admin-user-row"]').length === 4, null, { timeout: 5000 });
      await tid(page, "admin-chip-all").click();
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="admin-user-row"]').length === 6, null, { timeout: 5000 });

      await tid(page, "admin-search").fill("lena");
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="admin-user-row"]').length === 1, null, { timeout: 5000 });
      if (profile === "desktop") {
        // Keyboard: the row's button opens the panel with Enter, Esc closes it and focus goes back.
        await tid(page, "admin-user-open").first().focus();
        await page.keyboard.press("Enter");
        await tid(page, "admin-panel").waitFor();
        await tid(page, "admin-action-extend_trial").waitFor();
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => !document.querySelector('[data-testid="admin-panel"]'), null, { timeout: 5000 });
        assert(await page.evaluate(() => document.activeElement?.getAttribute("data-testid") === "admin-user-open"), "focus back on the row");
      }
      await tid(page, "admin-user-row").first().click();
      await tid(page, "admin-panel").waitFor();
      await tid(page, "admin-user-detail").waitFor();
      await tid(page, "admin-action-extend_trial").waitFor();
      await shot(page, `user-detail-${tag}`);

      // Extend trial with confirmation.
      await tid(page, "admin-action-extend_trial").click();
      await tid(page, "admin-confirm-modal").waitFor();
      const days = page.locator('[data-testid="admin-confirm-modal"] input[type="number"]');
      if (await days.count()) await days.first().fill("14");
      if (profile === "desktop" && theme === "light") await shot(page, `confirm-${tag}`);
      await tid(page, "admin-confirm-submit").click();
      await page.waitForFunction(() => !document.querySelector('[data-testid="admin-confirm-modal"]'), null, { timeout: 5000 });
      assert(await tid(page, "admin-panel").count(), "panel stays open after the confirmation");
      const last = mock.state.audit[0];
      assert(last?.action === "user.extend_trial", `audit: ${last?.action}`);

      // Esc in a confirmation closes only the confirmation, not the panel.
      await tid(page, "admin-action-grant_access").click();
      await tid(page, "admin-confirm-modal").waitFor();
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector('[data-testid="admin-confirm-modal"]'), null, { timeout: 5000 });
      assert(await tid(page, "admin-panel").count(), "Esc in the dialog keeps the panel");

      // Free access without end date ("Gratis unbefristet") with confirmation (preselected).
      await tid(page, "admin-action-grant_access").click();
      await tid(page, "admin-confirm-modal").waitFor();
      await tid(page, "admin-free-forever").waitFor();
      assert((await tid(page, "admin-free-forever").getAttribute("aria-pressed")) === "true", "unbefristet preselected");
      if (profile === "desktop") await shot(page, `grant-forever-${tag}`);
      await tid(page, "admin-confirm-submit").click();
      await page.waitForFunction(() => !document.querySelector('[data-testid="admin-confirm-modal"]'), null, { timeout: 5000 });
      assert(mock.state.audit[0].action === "user.grant_access" && mock.state.audit[0].details.after.forever === true, `audit: ${mock.state.audit[0].action}`);
      await page.waitForFunction(() => (document.querySelector('[data-testid="admin-user-detail"]')?.textContent ?? "").includes("Gratis unbefristet"), null, { timeout: 5000 });
      await tid(page, "admin-action-revoke_access").waitFor();

      // Lizenz zuweisen = add to a school (existing school action add_teacher), with confirmation.
      // Students are never turned into teachers: the dialog explains and sends nothing.
      const before = mock.state.apiCalls.length;
      await tid(page, "admin-action-assign_school").click();
      await tid(page, "admin-confirm-modal").waitFor();
      await tid(page, "admin-confirm-submit").click();
      await page.waitForFunction(() => /Klasse/.test(document.querySelector('[data-testid="admin-confirm-modal"]')?.textContent ?? ""), null, { timeout: 5000 });
      assert(!mock.state.apiCalls.slice(before).some((c) => c.method === "POST"), "no POST for a student");
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector('[data-testid="admin-confirm-modal"]'), null, { timeout: 5000 });

      // Block needs a reason.
      await tid(page, "admin-action-block").click();
      await tid(page, "admin-confirm-modal").waitFor();
      await tid(page, "admin-confirm-submit").click();
      await page.waitForFunction(() => /Grund/.test(document.querySelector('[data-testid="admin-confirm-modal"]')?.textContent ?? ""), null, { timeout: 5000 });
      assert(await tid(page, "admin-confirm-modal").count(), "no reason → stays open");
      const reason = page.locator('[data-testid="admin-confirm-modal"] textarea, [data-testid="admin-confirm-modal"] input[type="text"]').first();
      await reason.fill("Test-Sperre");
      await tid(page, "admin-confirm-submit").click();
      await page.waitForFunction(() => !document.querySelector('[data-testid="admin-confirm-modal"]'), null, { timeout: 5000 });
      assert(mock.state.audit[0].action === "user.block", `audit: ${mock.state.audit[0].action}`);
      await tid(page, "admin-action-unblock").waitFor({ timeout: 5000 });
      // After blocking, the final delete is offered under "Weitere Aktionen"; it needs the e-mail typed.
      await page.locator('[data-testid="admin-more-actions"] summary').click();
      await tid(page, "admin-action-delete_account").waitFor({ timeout: 5000 });
      await tid(page, "admin-panel-close").click();
      await page.waitForFunction(() => !document.querySelector('[data-testid="admin-panel"]'), null, { timeout: 5000 });
      await tid(page, "admin-search").fill("");

      await tid(page, "admin-tab-schools").click();
      await tid(page, "admin-school-row").first().waitFor();
      await shot(page, `schools-${tag}`);
      await tid(page, "admin-school-row").first().locator("button").click();
      await tid(page, "admin-school-detail").waitFor();
      await page.waitForFunction(() => (document.querySelector('[data-testid="admin-school-detail"]')?.textContent ?? "").includes("schulleitung@beispiel.ch"), null, { timeout: 10000 });
      await shot(page, `school-detail-${tag}`);
      // Whole school free, no end date.
      await tid(page, "admin-action-grant_access").click();
      await tid(page, "admin-confirm-modal").waitFor();
      await tid(page, "admin-free-forever").waitFor();
      await tid(page, "admin-confirm-submit").click();
      await page.waitForFunction(() => !document.querySelector('[data-testid="admin-confirm-modal"]'), null, { timeout: 5000 });
      assert(mock.state.audit[0].action === "school.grant_access", `audit: ${mock.state.audit[0].action}`);
      await page.waitForFunction(() => (document.querySelector('[data-testid="admin-school-free"]')?.textContent ?? "").includes("Gratis (unbefristet)"), null, { timeout: 5000 });
      if (profile === "desktop") await shot(page, `school-free-${tag}`);
      await tid(page, "admin-action-revoke_access").waitFor();
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector('[data-testid="admin-panel"]'), null, { timeout: 5000 });

      await tid(page, "admin-tab-audit").click();
      await tid(page, "admin-audit-row").first().waitFor();
      const auditText = await tid(page, "admin-audit-row").first().textContent();
      assert(/Gratis-Zugang|Schule gratis/.test(auditText ?? ""), `audit in words: ${auditText}`);
      await shot(page, `audit-${tag}`);
      await tid(page, "admin-audit-action").selectOption("block");
      await page.waitForTimeout(300);
      assert(mock.state.apiCalls.some((c) => c.path === "/audit" && new URLSearchParams(c.query).get("action") === "block"), "audit filter sent as action=block");

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(overflow <= 1, `horizontal overflow ${overflow}px`);
      assert(errors.length === 0, `page errors: ${errors.join(" | ")}`);
      assert(mock.state.apiCalls.every((c) => c.auth === "Bearer "), "every admin API call carries the bearer token");
      await context.close();
    });
  }

  await step("Lizenz zuweisen for a teacher → existing school action add_teacher, confirmed", async () => {
    const { context, page, mock } = await ctx("desktop", "light", { aal2: true });
    await page.goto(`${base}/admin`);
    await tid(page, "admin-user-row").first().waitFor({ timeout: 30000 });
    await tid(page, "admin-search").fill("brunner");
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="admin-user-row"]').length === 1, null, { timeout: 5000 });
    await tid(page, "admin-user-row").first().click();
    await tid(page, "admin-action-assign_school").click();
    await tid(page, "admin-confirm-modal").waitFor();
    await page.locator("#f-school").waitFor();
    await shot(page, "assign-licence-desktop-light");
    await tid(page, "admin-confirm-submit").click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="admin-confirm-modal"]'), null, { timeout: 5000 });
    assert(mock.state.audit[0].action === "school.add_teacher", `audit: ${mock.state.audit[0].action}`);
    await context.close();
  });

  await step("empty search + API error states", async () => {
    const { context, page, mock } = await ctx("mobile", "light", { aal2: true });
    await page.goto(`${base}/admin`);
    await tid(page, "admin-user-row").first().waitFor({ timeout: 30000 });
    await tid(page, "admin-search").fill("niemandhier");
    await page.getByText("Niemand gefunden").waitFor({ timeout: 5000 });
    await shot(page, "empty-mobile-light");
    await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="admin-user-row"]').length === 6, null, { timeout: 5000 });
    await context.route((u) => u.pathname === "/api/admin/users", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "failed" }) }));
    await tid(page, "admin-chip-trial").click();
    await page.getByRole("button", { name: "Nochmals laden" }).waitFor({ timeout: 5000 });
    await shot(page, "error-mobile-light");
    assert(mock.state.apiCalls.length > 0, "calls made");
    await context.close();
  });

  await step("school: create school + assign licence with confirmation", async () => {
    const { context, page, mock } = await ctx("desktop", "light", { aal2: true });
    await page.goto(`${base}/admin`);
    await tid(page, "admin-dashboard").waitFor({ timeout: 30000 });
    await tid(page, "admin-tab-schools").click();
    await tid(page, "admin-school-create").click();
    await tid(page, "admin-confirm-modal").waitFor();
    await page.locator('[data-testid="admin-confirm-modal"] input').first().fill("Sek Testdorf");
    await tid(page, "admin-confirm-submit").click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="admin-school-row"]').length === 2, null, { timeout: 5000 });
    assert(mock.state.audit[0].action === "school.create.done", "school created");
    await context.close();
  });

  for (const [profile, theme] of [["mobile", "light"], ["desktop1280", "dark"], ["mobile", "dark"], ["desktop1280", "light"]]) {
    const tag = `${profile === "mobile" ? "390" : "1280"}-${theme}`;
    await step(`family package: grant + revoke (${tag})`, async () => {
      mkdirSync(FAMILY_OUT, { recursive: true });
      const fshot = async (page, name) => page.screenshot({ path: `${FAMILY_OUT}${name}-${tag}.png`, animations: "disabled" });
      const { context, page, mock, errors } = await ctx(profile, theme, { aal2: true });
      await page.goto(`${base}/admin`);
      await tid(page, "admin-user-row").first().waitFor({ timeout: 60000 });
      // search by e-mail (existing users-tab search)
      await tid(page, "admin-search").fill("lena.mueller@");
      await page.waitForFunction(() => { const r = document.querySelectorAll('[data-testid="admin-user-row"]'); return r.length === 1 && /lena\.mueller@/.test(r[0].textContent ?? ""); }, null, { timeout: 5000 });
      await tid(page, "admin-user-row").first().click();
      const section = tid(page, "admin-family-pack");
      await tid(page, "admin-family-plan").waitFor({ timeout: 10000 });
      assert((await tid(page, "admin-family-plan").getAttribute("data-kind")) === "trial", "plan before: trial");
      assert(!(await tid(page, "admin-family-revoke").count()), "no revoke without grant");
      await tid(page, "admin-family-grant").scrollIntoViewIfNeeded();
      await fshot(page, "01-before");
      await tid(page, "admin-family-grant").click();
      await tid(page, "admin-confirm-modal").waitFor();
      assert((await page.getByRole("group", { name: "Dauer" }).count()) === 1, "duration group labelled");
      assert(await page.getByLabel("Plätze Kinder").count(), "seats input labelled");
      await tid(page, "admin-family-duration-3").click();
      assert((await tid(page, "admin-family-duration-3").getAttribute("aria-pressed")) === "true", "preset pressed");
      await page.getByLabel("Plätze Kinder").fill("3");
      await page.getByLabel("Notiz (optional)").fill("Panu und Familie, Test");
      const summary = await tid(page, "admin-family-summary").textContent();
      assert(/Zugang bis und mit \d{2}\.\d{2}\.\d{4}/.test(summary ?? ""), `summary: ${summary}`);
      await fshot(page, "02-grant-dialog");
      await tid(page, "admin-confirm-submit").click();
      await page.waitForFunction(() => !document.querySelector('[data-testid="admin-confirm-modal"]'), null, { timeout: 5000 });
      const g = mock.state.apiCalls.find((c) => c.method === "POST" && c.path.endsWith("/family"));
      assert(g && g.auth === "Bearer " && !g.cookie, "grant via bearer, no cookie");
      assert(mock.state.audit[0].action === "family_grant" && mock.state.audit[0].details.after.seats_children === 3, `audit: ${mock.state.audit[0]?.action}`);
      await page.waitForFunction(() => document.querySelector('[data-testid="admin-family-plan"]')?.getAttribute("data-kind") === "family_manual", null, { timeout: 5000 });
      assert((await tid(page, "admin-family-members").locator("li").count()) === 2, "members listed");
      const licText = await tid(page, "admin-family-licence").textContent();
      assert(/Aktiv/.test(licText) && /vom Admin/.test(licText), `licence: ${licText}`);
      await section.scrollIntoViewIfNeeded();
      await fshot(page, "03-granted");
      // revoke with confirm dialog + note
      await tid(page, "admin-family-revoke").click();
      await tid(page, "admin-confirm-modal").waitFor();
      await page.getByLabel("Notiz (optional)").fill("Test vorbei");
      await fshot(page, "04-revoke-dialog");
      await tid(page, "admin-confirm-submit").click();
      await page.waitForFunction(() => !document.querySelector('[data-testid="admin-confirm-modal"]'), null, { timeout: 5000 });
      assert(mock.state.audit[0].action === "family_revoke" && mock.state.audit[0].details.note === "Test vorbei", "revoke audited");
      await page.waitForFunction(() => /Entzogen/.test(document.querySelector('[data-testid="admin-family-licence"]')?.textContent ?? ""), null, { timeout: 5000 });
      // no horizontal overflow (390 px) in the panel
      const overflow = await page.evaluate(() => [...document.querySelectorAll('[data-testid="admin-family-pack"] *')].some((el) => el.getBoundingClientRect().right > window.innerWidth + 1));
      assert(!overflow, "family section overflows horizontally");
      // Stripe-managed family: info, no buttons
      await tid(page, "admin-panel-close").click();
      await tid(page, "admin-panel").waitFor({ state: "detached", timeout: 5000 });
      await tid(page, "admin-search").fill("person2@");
      await page.waitForFunction(() => { const r = document.querySelectorAll('[data-testid="admin-user-row"]'); return r.length === 1 && /person2@/.test(r[0].textContent ?? ""); }, null, { timeout: 5000 });
      await tid(page, "admin-user-row").first().click();
      try {
        await page.waitForFunction(() => document.querySelector('[data-testid="admin-family-plan"]')?.getAttribute("data-kind") === "family_stripe", null, { timeout: 10000 });
      } catch (e) { await fshot(page, "zz-failure"); throw e; }
      assert(!(await tid(page, "admin-family-grant").count()) && !(await tid(page, "admin-family-revoke").count()), "no buttons for Stripe family");
      await section.scrollIntoViewIfNeeded();
      await fshot(page, "05-stripe-managed");
      assert(errors.length === 0, `page errors: ${errors.join(" | ")}`);
      await context.close();
    });
  }

  await browser.close();
  devServer?.kill("SIGTERM");
  const failed = results.filter((r) => r[0] === "FAIL");
  console.log(`\n${results.length - failed.length}/${results.length} passed. Screenshots: ${OUT}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); devServer?.kill("SIGTERM"); process.exit(1); });
