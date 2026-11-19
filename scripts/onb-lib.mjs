// Shared harness for the onboarding e2e (scripts/onb-e2e.mjs), Lighthouse (scripts/onb-lighthouse.mjs) and the unit tests
// (tests/onb-e2e-lib.test.mjs). Nothing real is touched: every request to http://localhost:54321 is answered by the generic
// stateful mock (scripts/lib/mock-supabase.mjs) plus an onboarding layer registered on top of it (auth signUp / PKCE / resend /
// OAuth authorize, funnel_apply, tour_state_set, product_tour_state, weekly_goal_set, my_access).
// One `OnbWorld` can be installed into several browser contexts: that is how «confirm the e-mail in another browser» is tested.
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { connect as netConnect } from "node:net";
import { createMockSupabase, SUPABASE_URL } from "./lib/mock-supabase.mjs";

export { SUPABASE_URL };
export const FUNNEL_KEY = "wendapply.funnel.v1";
export const FUNNEL_CONFIRM_KEY = "wendapply.funnel.confirm";
export const AUTH_KEY = "sb-localhost-auth-token";

// ------------------------------------------------------------------------------------------------ spec constants (SPEC-FLOW)
/** Step slugs per role path (SPEC-FLOW §1.1). */
export const PATHS = {
  student: ["weg", "rolle", "name", "jahrgang", "schule", "ort", "beruf", "wochenziel", "hilfe", "dabei", "plan", "konto"],
  parent: ["weg", "rolle", "name", "begleiten", "kind", "plan", "konto"],
  staff: ["weg", "rolle", "zugang", "konto"],
};
export const ROLE_LABEL = { student: "Schüler:in", parent: "Elternteil", staff: "Lehrperson oder Schule" };
export const HELP_STUDENT = ["lebenslauf", "brief", "schnuppern", "ueberblick", "eltern"];
export const HELP_PARENT = ["ueberblick", "fristen", "dokumente", "ermutigen"];
/** Keys allowed in the server payload (SPEC-DATA §2.2 FunnelPayloadV1). */
export const PAYLOAD_KEYS = ["v", "role", "skipped", "firstName", "birthYear", "schoolLevel", "canton", "place", "professions", "unsure", "startYear", "weeklyGoal", "help"];
/** Transient answers that must never reach the server (SPEC-DATA §2.1 «not stored»). */
export const TRANSIENT_KEYS = ["classCode", "inviteCode", "family", "parentKid", "staffAccess", "step", "next", "startedAt", "updatedAt"];
/** Keys of other roles that must not be in a parent / staff payload. */
export const STUDENT_ONLY = ["birthYear", "schoolLevel", "canton", "place", "professions", "unsure", "startYear", "weeklyGoal"];
export const TOURS = ["schueler", "eltern", "lehrperson", "schule"];

/**
 * Checks a funnel payload the way the e2e expects the client to send it (shape only; the real rules live in funnel_apply).
 * Returns a list of problems (empty = fine).
 */
export function payloadProblems(p, expect = {}) {
  const out = [];
  if (!p || typeof p !== "object" || Array.isArray(p)) return ["payload missing or not an object"];
  for (const k of Object.keys(p)) if (!PAYLOAD_KEYS.includes(k)) out.push(`unexpected key ${k}`);
  for (const k of TRANSIENT_KEYS) if (k in p) out.push(`transient key ${k} sent`);
  if (p.v !== 1) out.push(`v=${p.v}`);
  if (!["student", "parent", "staff"].includes(p.role)) out.push(`role=${p.role}`);
  if (p.role && p.role !== "student") for (const k of STUDENT_ONLY) if (p[k] !== undefined && p[k] !== null && !(Array.isArray(p[k]) && !p[k].length)) out.push(`${p.role} payload carries ${k}`);
  for (const k of ["email", "password", "mail"]) if (JSON.stringify(p).toLowerCase().includes(`"${k}`)) out.push(`contains ${k}`);
  if (p.help && p.help.some((h) => !(p.role === "parent" ? HELP_PARENT : HELP_STUDENT).includes(h))) out.push(`help enum ${p.help}`);
  if (p.professions && p.professions.length > 3) out.push("more than 3 professions");
  if (p.weeklyGoal !== undefined && !(Number.isInteger(p.weeklyGoal) && p.weeklyGoal >= 1 && p.weeklyGoal <= 10)) out.push(`weeklyGoal ${p.weeklyGoal}`);
  for (const [k, v] of Object.entries(expect)) if (JSON.stringify(p[k]) !== JSON.stringify(v)) out.push(`${k}: expected ${JSON.stringify(v)} got ${JSON.stringify(p[k])}`);
  return out;
}

/** True if any captured request (url + body) before the account exists leaks one of the secrets (PII before consent). */
export function piiLeaks(requests, needles, { allow = [/\/api\/places\?/] } = {}) {
  const hits = [];
  for (const r of requests) {
    if (allow.some((re) => re.test(r.url))) continue;
    const hay = `${decodeURIComponent(r.url)} ${r.body || ""}`.toLowerCase();
    for (const n of needles) if (n && hay.includes(String(n).toLowerCase())) hits.push(`${r.method} ${r.url.slice(0, 120)} contains «${n}»`);
  }
  return hits;
}

/** Median of numbers (ignores null/NaN). */
export function median(values) {
  const v = values.filter((x) => typeof x === "number" && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Lighthouse comparison rows: { page, metric, base, head, delta, worse } – `worse` uses per-metric tolerances. */
export function compareLighthouse(base, head, tol = { perf: 5, a11y: 0, bp: 0, seo: 0, lcp: 0.5, tbt: 100, cls: 0.05 }) {
  const rows = [];
  const higherBetter = { perf: true, a11y: true, bp: true, seo: true, lcp: false, tbt: false, cls: false };
  for (const page of Object.keys(head)) for (const metric of Object.keys(higherBetter)) {
    const b = base?.[page]?.[metric] ?? null, h = head[page]?.[metric] ?? null;
    const delta = b === null || h === null ? null : +(h - b).toFixed(3);
    const worse = delta === null ? false : higherBetter[metric] ? delta < -tol[metric] : delta > tol[metric];
    rows.push({ page, metric, base: b, head: h, delta, worse });
  }
  return rows;
}

/** Markdown results table: rows { id, area, device, status: PASS|FAIL|SKIP|BLOCKED, info }. */
export function resultsTable(rows) {
  const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 300);
  const lines = ["| # | Case | Device | Result | Notes |", "|---|---|---|---|---|"];
  rows.forEach((r, i) => lines.push(`| ${i + 1} | ${esc(r.id)} | ${esc(r.device)} | ${r.status} | ${esc(r.info)} |`));
  const count = (s) => rows.filter((r) => r.status === s).length;
  lines.push("", `Totals: ${count("PASS")} pass · ${count("FAIL")} fail · ${count("BLOCKED")} blocked · ${count("SKIP")} skip (of ${rows.length}).`);
  return lines.join("\n");
}

/** Probe user e-mail for the live smoke (BRIEF hard rule). */
export const probeEmail = (role, stamp) => `probe-onb-${role}-${stamp}@wendapply-probe.invalid`;
export const isProbeEmail = (e) => /^probe-onb-[a-z]+-[a-z0-9]+(-[a-z0-9]+)?@wendapply-probe\.invalid$/.test(String(e));

// ------------------------------------------------------------------------------------------------ environment
export async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT, join(homedir(), "JARVIS/browser-profiles/node_modules/playwright-core/index.mjs"), join(homedir(), "Projects/bewerbungen-tracker-wt/audit-tools/node_modules/playwright-core/index.mjs")].filter(Boolean);
  for (const p of candidates) if (existsSync(p)) return import(pathToFileURL(p).href);
  return import("playwright-core");
}
export function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (existsSync(mac)) return mac;
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  if (existsSync(cache)) for (const dir of readdirSync(cache).filter((d) => d.startsWith("chromium-"))) {
    const base = join(cache, dir, "chrome-mac-arm64");
    if (existsSync(base)) for (const app of readdirSync(base)) { const bin = join(base, app, "Contents/MacOS", app.replace(/\.app$/, "")); if (existsSync(bin)) return bin; }
  }
  return undefined;
}
/** Devices of the brief: iPhone 15 (WebKit), Pixel 7 (Chromium), desktop 1280 (Chromium). */
export function devices(registry) {
  const strip = (d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== "defaultBrowserType"));
  return [
    { id: "iphone15", browser: "webkit", phone: true, options: strip(registry["iPhone 15"]) },
    { id: "pixel7", browser: "chromium", phone: true, options: strip(registry["Pixel 7"]) },
    { id: "desktop1280", browser: "chromium", phone: false, options: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
  ];
}
export const RESPONSIVE_WIDTHS = [320, 360, 375, 390, 768, 1024, 1280];

const portOpen = (port) => new Promise((res) => { const sock = netConnect({ port, host: "127.0.0.1" }); sock.once("connect", () => { sock.destroy(); res(true); }); sock.once("error", () => res(false)); sock.setTimeout(2000, () => { sock.destroy(); res(false); }); });
const reachable = async (url) => { try { const r = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: "manual" }); return r.status < 500; } catch { return false; } };
/** Billing-off dev server with the dummy Supabase env (same as scripts/e2e-all.mjs). Reuses a running one on `port`. */
export async function startDevServer({ root, port = 3245, env = {}, log = console.log } = {}) {
  const base = `http://localhost:${port}`;
  if (await reachable(`${base}/login`)) { log(`reusing server ${base}`); return { base, stop() {} }; }
  // A busy dev server can miss the 8 s probe: never spawn a second `next dev` on a port that is already listening.
  if (await portOpen(port)) { log(`port ${port} busy – waiting for the running server`); for (let i = 0; i < 120; i++) { if (await reachable(`${base}/login`)) return { base, stop() {} }; await new Promise((r) => setTimeout(r, 1000)); } throw new Error(`port ${port} is taken by an unresponsive process`); }
  log(`starting next dev on ${port} (dummy Supabase, billing off) …`);
  const child = spawn("npx", ["next", "dev", "--webpack", "-p", String(port)], { cwd: root, stdio: "ignore", env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "dummy", NEXT_PUBLIC_AVATAR_LOCAL: "1", STRIPE_ENABLED: "false", NEXT_PUBLIC_STRIPE_ENABLED: "false", NEXT_TELEMETRY_DISABLED: "1", ...env } });
  for (let i = 0; i < 180; i++) { if (await reachable(`${base}/login`)) return { base, stop: () => { try { child.kill("SIGTERM"); } catch { /* gone */ } } }; await new Promise((r) => setTimeout(r, 1000)); }
  child.kill("SIGTERM");
  throw new Error("dev server did not start in time");
}

// ------------------------------------------------------------------------------------------------ access fixtures
export const ACCESS = (o = {}) => ({ has_access: true, state: "active", reason: "none", role: "student", account_type: null, trial_ends_at: null, trial_days_left: null, grace_until: null, grant_until: null, subscription: null, school: null, blocked: false, enforced: true, expired_reason: null, family_pending: false, ...o });
export const TRIAL = (o = {}) => ACCESS({ state: "trial", reason: "trial", trial_days_left: 7, trial_ends_at: new Date(Date.now() + 7 * 864e5).toISOString(), ...o });
export const EXPIRED = (o = {}) => ACCESS({ has_access: false, state: "expired", trial_days_left: 0, expired_reason: "trial_ended", ...o });

// ------------------------------------------------------------------------------------------------ the stub world
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*" };
const uid = () => `u-${Math.random().toString(36).slice(2, 10)}`;

/**
 * A shared backend for one scenario. `existing` = accounts that already exist ({email, password, role, accountType, createdDaysAgo,
 * funnelDone, profile}). `confirm` = true → signUp returns no session (production); false → autoconfirm (session at once).
 */
export function createOnbWorld({ existing = [], confirm = true, access = TRIAL(), base = "http://localhost:3245", failApply = false } = {}) {
  const mock = createMockSupabase({ role: "student", authed: false, friends: false, classes: false });
  const world = {
    mock, base, confirm, access, failApply,
    users: [], // { id, email, password, confirmed, created_at, user_metadata, role, obfuscated? }
    profiles: new Map(), // userId -> profile row
    tour: new Map(), // `${userId}:${tour}` -> { status, version, last_step }
    log: [], // { kind, name, body, at, ctx }
    signups: [], resends: [], authorize: [],
    current: null, // user that the mock's `state.user` mirrors (last authenticated)
  };
  const now = () => new Date().toISOString();
  function addUser({ email, password = "Sicher-Passwort-2026", role = "student", accountType = null, createdDaysAgo = 0, confirmed = true, funnelDone = false, meta = {}, profile = {} }) {
    const u = { id: uid(), email, password, confirmed, created_at: new Date(Date.now() - createdDaysAgo * 864e5).toISOString(), user_metadata: { ...(role ? { role } : {}), ...(accountType ? { account_type: accountType } : {}), ...meta }, role, accountType };
    world.users.push(u);
    world.profiles.set(u.id, { id: `profile-${u.id}`, user_id: u.id, email, first_name: profile.first_name ?? "", last_name: "", weekly_goal: null, help_wishes: [], funnel_completed_at: funnelDone ? now() : null, onboarding_completed_at: funnelDone ? now() : null, ...profile });
    return u;
  }
  for (const e of existing) addUser(e);
  world.addUser = addUser;
  const authUser = (u) => ({ id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: u.confirmed ? u.created_at : null, user_metadata: u.user_metadata, app_metadata: { provider: u.provider || "email" }, identities: [{ provider: u.provider || "email" }], created_at: u.created_at });
  const sessionFor = (u) => ({ access_token: `tok.${u.id}.x`, refresh_token: `r-${u.id}`, token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user: authUser(u) });
  /** Point the generic mock at `u` (it serves tables/RPCs for one user at a time). */
  function become(u) {
    world.current = u;
    Object.assign(mock.state.user, authUser(u)); mock.state.user.user_metadata = u.user_metadata;
    mock.state.authed = true; mock.state.role = u.role === "teacher" ? "teacher" : "student";
    mock.state.profiles = [world.profiles.get(u.id)].filter(Boolean);
  }
  const fromToken = (auth) => { const m = /tok\.([^.]+)\./.exec(auth || ""); return m ? world.users.find((u) => u.id === m[1]) : null; };
  world.sessionFor = sessionFor;
  world.userByEmail = (e) => world.users.find((u) => u.email === e && !u.obfuscated);
  world.calls = (name) => world.log.filter((c) => c.name === name);
  world.profileOf = (e) => { const u = world.userByEmail(e); return u ? world.profiles.get(u.id) : null; };
  world.tourOf = (e, tour) => { const u = world.userByEmail(e); return u ? world.tour.get(`${u.id}:${tour}`) ?? null : null; };
  /** Confirmation link GoTrue would send (same-browser exchange works only where the PKCE verifier is). */
  // Like GoTrue: verify, then redirect to the sign-up's emailRedirectTo (keeps ?next= / &quelle=email) with ?code=.
  world.confirmLink = (next) => {
    const su = world.signups.at(-1);
    const u = new URL(su?.redirect || `${base}/auth/callback`, base);
    if (next) u.searchParams.set("next", next);
    u.searchParams.set("code", `confirm-${su?.userId || "x"}`);
    return u.href;
  };

  function funnelApply(u, body) {
    const p = body?.p_answers ?? body?.answers ?? (body && "v" in body ? body : null);
    const answers = u.user_metadata.wa_funnel ?? p ?? null; // migration 20261119110000: the account's own copy wins (QA-ONB M1)
    const prof = world.profiles.get(u.id) || addProfile(u);
    const serverRole = u.role === "teacher" ? "teacher" : (u.user_metadata.account_type === "parent" ? "parent" : "student");
    if (world.failApply) return { __error: "INVALID_FUNNEL", status: 400 };
    if (!answers) return { applied: false, reason: "no_answers", role: serverRole };
    if (prof.funnel_completed_at || prof.onboarding_completed_at) return { applied: false, reason: "already_done", role: serverRole };
    if (Date.now() - Date.parse(u.created_at) > 14 * 864e5) return { applied: false, reason: "not_new", role: serverRole };
    const role = answers.role === "staff" ? "teacher" : answers.role;
    const mismatch = (u.role === "teacher" && role !== "teacher");
    Object.assign(prof, { first_name: answers.firstName ?? prof.first_name, funnel_completed_at: now(), funnel_version: 1 });
    if (!mismatch) {
      if (answers.role === "student") Object.assign(prof, { birth_year: answers.birthYear ?? null, school_level: answers.schoolLevel ?? null, canton: answers.canton ?? null, location: answers.place ?? null, desired_professions: answers.professions ?? [], desired_start_year: answers.startYear ?? null, weekly_goal: answers.weeklyGoal ?? null, help_wishes: answers.help ?? [] });
      if (answers.role === "parent") Object.assign(prof, { help_wishes: answers.help ?? [] });
      if (answers.role === "staff") { u.role = "teacher"; u.user_metadata.role = "teacher"; }
      if (answers.role === "parent") { u.accountType = "parent"; u.user_metadata.account_type = "parent"; }
    }
    const finalRole = u.role === "teacher" ? "teacher" : answers.role === "parent" && !mismatch ? "parent" : serverRole;
    return { applied: true, role: finalRole, role_mismatch: mismatch, under_16: !!answers.birthYear && new Date().getFullYear() - answers.birthYear < 16 };
  }
  function addProfile(u) { const p = { id: `profile-${u.id}`, user_id: u.id, email: u.email, first_name: "", last_name: "", weekly_goal: null, help_wishes: [], funnel_completed_at: null, onboarding_completed_at: null }; world.profiles.set(u.id, p); return p; }
  function tourSet(u, b) {
    const vals = Object.values(b || {});
    const tour = vals.find((v) => TOURS.includes(v)) ?? b?.p_tour;
    const status = vals.find((v) => v === "completed" || v === "skipped") ?? b?.p_status;
    const version = b?.p_version ?? 1;
    if (!TOURS.includes(tour) || !["completed", "skipped"].includes(status)) return { __error: "INVALID_TOUR", status: 400 };
    world.tour.set(`${u.id}:${tour}`, { user_id: u.id, tour, status, version, last_step: b?.p_step ?? b?.p_last_step ?? null, updated_at: now() });
    return null;
  }

  /** Installs into one browser context. `tag` names the context in the log ("A", "B" …). `session` = pre-logged-in user. */
  world.install = async (ctx, { tag = "A", session = null } = {}) => {
    if (session) await ctx.addInitScript(([k, s]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(s)); }, [AUTH_KEY, sessionFor(session)]);
    await mock.install(ctx);
    await ctx.route(`${SUPABASE_URL}/**`, async (route) => {
      const req = route.request(); const url = new URL(req.url()); const p = url.pathname; const m = req.method();
      const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { ...CORS, "content-range": "0-0/*" }, body: b === null || b === undefined ? "" : JSON.stringify(b) });
      if (m === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
      let body = {}; try { body = req.postDataJSON() ?? {}; } catch { body = {}; }
      const who = fromToken(req.headers()["authorization"]);
      if (who && who !== world.current) become(who);
      // ---- auth
      if (p === "/auth/v1/signup") {
        const existingUser = world.userByEmail(body.email);
        world.signups.push({ ctx: tag, email: body.email, data: body.data, redirect: url.searchParams.get("redirect_to"), existing: !!existingUser, userId: null });
        if (existingUser) { // GoTrue: obfuscated fake user, no mail, no session
          const fake = { id: uid(), aud: "authenticated", role: "authenticated", email: body.email, user_metadata: {}, app_metadata: {}, identities: [], created_at: now(), confirmation_sent_at: now() };
          return json(fake);
        }
        const u = addUser({ email: body.email, password: body.password, role: body.data?.role === "teacher" ? "teacher" : "student", accountType: body.data?.account_type ?? null, confirmed: !world.confirm, meta: body.data || {} });
        world.signups.at(-1).userId = u.id;
        if (!world.confirm) { become(u); return json(sessionFor(u)); }
        return json({ ...authUser(u), confirmation_sent_at: now() });
      }
      if (p === "/auth/v1/resend") { world.resends.push({ ctx: tag, ...body, redirect: url.searchParams.get("redirect_to") }); return json({}); }
      if (p === "/auth/v1/authorize") {
        const redirect = url.searchParams.get("redirect_to") || `${base}/auth/callback`;
        world.authorize.push({ ctx: tag, provider: url.searchParams.get("provider"), redirect });
        const back = new URL(redirect); back.searchParams.set("code", "google-" + (world.googleAs || "new"));
        // WebKit refuses route.fulfill with a 3xx → a tiny page that replaces itself (same effect as GoTrue's 302 to the callback).
        return route.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><meta http-equiv="refresh" content="0;url=${back.href.replace(/"/g, "&quot;")}"><script>location.replace(${JSON.stringify(back.href)})</script>` });
      }
      if (p === "/auth/v1/token") {
        const grant = url.searchParams.get("grant_type");
        world.log.push({ kind: "auth", name: `token:${grant}`, body: grant === "password" ? { email: body.email } : { code: body.auth_code }, ctx: tag, at: Date.now() });
        if (grant === "password") {
          const u = world.userByEmail(body.email);
          if (!u || u.password !== body.password) return json({ code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }, 400);
          if (!u.confirmed) return json({ code: 400, error_code: "email_not_confirmed", msg: "Email not confirmed" }, 400);
          become(u); return json(sessionFor(u));
        }
        if (grant === "pkce") {
          const code = String(body.auth_code || "");
          let u = null;
          if (code.startsWith("confirm-")) { u = world.users.find((x) => x.id === code.slice(8)); if (u) u.confirmed = true; }
          if (code.startsWith("google-")) {
            const as = code.slice(7);
            u = as === "new" ? addUser({ email: `google-${Date.now()}@beispiel.ch`, role: null, meta: {} }) /* real Google sign-ups carry no role */ : world.userByEmail(as);
            if (u) u.provider = "google";
          }
          if (!u) return json({ code: 400, error_code: "bad_code_verifier", msg: "invalid flow state" }, 400);
          become(u); return json(sessionFor(u));
        }
        if (grant === "refresh_token") { const u = world.current; return u ? json(sessionFor(u)) : json({ msg: "no" }, 400); }
        return route.fallback();
      }
      if (p === "/auth/v1/user") {
        const u = who || world.current;
        if (!u) return json({ code: 401, msg: "Auth session missing!" }, 401);
        if (m === "PUT" && body?.data) { for (const [k, v] of Object.entries(body.data)) { if (v === null) delete u.user_metadata[k]; else u.user_metadata[k] = v; } if (body.data.role === "teacher" || body.data.role === "student") u.role = body.data.role; world.log.push({ kind: "auth", name: "updateUser", body: body.data, ctx: tag, at: Date.now() }); }
        become(u);
        return json(authUser(u));
      }
      if (p === "/auth/v1/logout") { world.current = null; mock.state.authed = false; return route.fulfill({ status: 204, headers: CORS }); }
      // ---- rpc
      if (p.startsWith("/rest/v1/rpc/")) {
        const name = p.split("/").pop();
        world.log.push({ kind: "rpc", name, body, ctx: tag, at: Date.now(), user: who?.email });
        const u = who || world.current;
        if (name === "my_access") return json(typeof world.access === "function" ? world.access(u) : world.access);
        if (name === "funnel_apply") { if (!u) return json({ code: "42501", message: "not authenticated" }, 401); const r = funnelApply(u, body); world.log.at(-1).result = r; return r?.__error ? json({ code: "P0001", message: r.__error, details: "role" }, r.status) : json(r); }
        if (name === "tour_state_set") { if (!u) return json({ code: "42501", message: "not authenticated" }, 401); const r = tourSet(u, body); return r?.__error ? json({ code: "P0001", message: r.__error }, 400) : json(r); }
        if (name === "weekly_goal_set") { if (u) world.profiles.get(u.id).weekly_goal = body.p_goal ?? Object.values(body)[0]; return json(null); }
        return route.fallback();
      }
      if (p === "/rest/v1/product_tour_state") {
        const u = who || world.current;
        const rows = u ? [...world.tour.values()].filter((r) => r.user_id === u.id && (!url.searchParams.get("tour") || url.searchParams.get("tour") === `eq.${r.tour}`)) : [];
        const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
        if (m !== "GET") return json({ code: "42501", message: "permission denied for table product_tour_state" }, 403);
        return single ? (rows[0] ? json(rows[0]) : json({ code: "PGRST116", message: "no rows" }, 406)) : json(rows);
      }
      if (p === "/rest/v1/profiles" && who) become(who);
      return route.fallback();
    });
  };
  return world;
}

// ------------------------------------------------------------------------------------------------ in-page audits (serialisable)
/** Horizontal overflow in px (0 = fine). */
export const overflowX = (page) => page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
/** Visible interactive elements smaller than 44 px in either dimension (inline links inside running text excluded). */
export const smallTargets = (page, min = 44) => page.evaluate((min) => {
  const out = [];
  const els = document.querySelectorAll('button, [role="button"], [role="radio"], [role="checkbox"], a[href], input:not([type="hidden"]), select, label:has(input[type="radio"]), label:has(input[type="checkbox"])');
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || el.closest('[aria-hidden="true"]')) continue;
    if ((el.tagName === "INPUT" && (el.type === "radio" || el.type === "checkbox")) && el.closest("label")) continue; // the label is the target
    if (el.tagName === "INPUT" && (el.type === "radio" || el.type === "checkbox") && (r.width < 2 || cs.opacity === "0")) continue; // visually hidden
    if (el.tagName === "A" && cs.display === "inline" && el.closest("p, li, small, span")) continue; // WCAG 2.5.8 inline exception
    if (el.closest(".sr-only, [data-skip-link]") || el.matches('a[href="#main"], a[href="#inhalt"]')) continue;
    if (r.height < min || r.width < min) out.push(`${el.tagName.toLowerCase()}«${(el.getAttribute("aria-label") || el.textContent || el.name || "").trim().slice(0, 30)}» ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  return out;
}, min);
