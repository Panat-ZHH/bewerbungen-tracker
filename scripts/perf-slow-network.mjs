// Slow-network waterfall measurement for the logged-in pages (reel "test on a slow network", 2026-11-18).
//
//   npm run perf:slow                                 # builds if needed, runs `next start` on PORT (default 3417)
//   BASE_URL=https://wendapply.ch npm run perf:slow   # measure a deployed site instead
//
// Env: RUNS (default 3), PROFILES (comma list of none,fast4g,slow; default all), PAGES (comma list of keys, default all),
//      TAG (output name, default "local"), OUT_DIR (default ./perf-out), PLAYWRIGHT (path to playwright-core/index.mjs),
//      CHROME (browser binary), PROBE_PREFIX (default probe-reel-wf), SR_ENV (file with SR=<service role key>, default ~/.config/alfred/tmp/wendapply-sr.env)
//      or SUPABASE_SERVICE_ROLE_KEY. Supabase URL / publishable key come from .env.local or the environment.
//
// Two throwaway LIVE probe users are created through the admin API (probe-reel-wf-<stamp>-s / -t @wendapply-test.invalid):
// a trial student with 12 sample applications and a teacher (temporary free access, one class the student joined). Both are
// deleted at the end (the result JSON records the 404 lookups). No secrets are printed or written.
//
// Per page and profile (CDP Network.emulateNetworkConditions): time-to-ready (URL settled, no skeleton / spinner /
// aria-busy / loading text, <main> present) and every Supabase / /api request with start + end. "Depth" = the longest chain
// of requests where each one only started after the previous one had finished (1 = everything parallel).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const fileEnv = (file) => (existsSync(file) ? Object.fromEntries(readFileSync(file, "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])) : {});
const local = fileEnv(path.join(ROOT, ".env.local"));
const srFile = fileEnv(process.env.SR_ENV || `${homedir()}/.config/alfred/tmp/wendapply-sr.env`);
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL || local.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || local.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || srFile.ANON;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY || srFile.SR;

const RUNS = Number(process.env.RUNS || 3);
const TAG = process.env.TAG || "local";
const OUT_DIR = path.resolve(process.env.OUT_DIR || path.join(ROOT, "perf-out"));
const PORT = Number(process.env.PORT || 3417);
let BASE = (process.env.BASE_URL || "").replace(/\/$/, "");
const PW_PATH = process.env.PLAYWRIGHT || [path.join(ROOT, "node_modules/playwright-core/index.mjs"), `${homedir()}/Projects/bewerbungen-tracker-wt/audit-tools/node_modules/playwright-core/index.mjs`].find(existsSync);
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** Throughput in bytes/s (CDP unit). */
export const PROFILES = {
  none: null,
  fast4g: { offline: false, latency: 150, downloadThroughput: (9_000_000 / 8), uploadThroughput: (9_000_000 / 8) },
  slow: { offline: false, latency: 400, downloadThroughput: (400_000 / 8), uploadThroughput: (400_000 / 8) },
};
const profileKeys = (process.env.PROFILES || "none,fast4g,slow").split(",").map((s) => s.trim()).filter((k) => k in PROFILES);

/** Longest chain of strictly sequential requests (B starts after A ended). Pure, exported for the unit test. */
export function waterfall(requests, slackMs = 2) {
  const reqs = requests.filter((r) => typeof r.end === "number").slice().sort((a, b) => a.start - b.start);
  const depth = new Map(); const prev = new Map();
  for (const r of reqs) {
    let best = 0; let from = null;
    for (const q of reqs) { if (q !== r && q.end <= r.start + slackMs && (depth.get(q) ?? 0) > best) { best = depth.get(q); from = q; } }
    depth.set(r, best + 1); prev.set(r, from);
  }
  let last = null; for (const r of reqs) if (!last || depth.get(r) > depth.get(last)) last = r;
  const chain = []; for (let r = last; r; r = prev.get(r)) chain.unshift(r.name);
  return { depth: last ? depth.get(last) : 0, chain };
}
export const median = (a) => { const s = a.filter((x) => typeof x === "number").sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

function shortName(url) {
  const u = new URL(url);
  if (u.origin === SB) {
    const p = u.pathname.replace("/rest/v1/rpc/", "rpc:").replace("/rest/v1/", "").replace("/auth/v1/", "auth:").replace("/storage/v1/", "storage:");
    return p.startsWith("storage:") ? p.split("/").slice(0, 3).join("/") : p;
  }
  return u.pathname;
}
const isData = (url) => (!!SB && url.startsWith(SB)) || /\/api\//.test(new URL(url).pathname);

// ------------------------------------------------------------------ probe users (admin API, service role)
const srH = { apikey: SR, Authorization: `Bearer ${SR}`, "content-type": "application/json" };
const admin = (p, opts = {}) => fetch(`${SB}/auth/v1/admin${p}`, { ...opts, headers: srH }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const rest = (p, opts = {}) => fetch(`${SB}/rest/v1${p}`, { ...opts, headers: { ...srH, Prefer: "return=minimal", ...(opts.headers || {}) } }).then(async (r) => ({ status: r.status, text: await r.text() }));
async function tokenFor(email, password) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  const j = await r.json(); if (!j.access_token) throw new Error(`password login failed (${r.status})`); return j.access_token;
}
const rpcAs = (token, fn, body) => fetch(`${SB}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const stamp = Date.now().toString(36);
const PW = `Probe-${stamp}-xY9!`;
const PREFIX = /^probe-[a-z0-9-]+$/.test(process.env.PROBE_PREFIX || "") ? process.env.PROBE_PREFIX : "probe-reel-wf"; // throwaway users only
const probes = { student: { email: `${PREFIX}-${stamp}-s@wendapply-test.invalid` }, teacher: { email: `${PREFIX}-${stamp}-t@wendapply-test.invalid` } };

async function createProbes() {
  const s = await admin("/users", { method: "POST", body: JSON.stringify({ email: probes.student.email, password: PW, email_confirm: true, user_metadata: { role: "student", role_confirmed: true, account_type: "independent_student", birth_year: 2009, student_onboarded: true, onboarding_tour_done: true } }) });
  if (s.status >= 300) throw new Error(`create student ${s.status}`);
  probes.student.id = s.body.id;
  const t = await admin("/users", { method: "POST", body: JSON.stringify({ email: probes.teacher.email, password: PW, email_confirm: true, user_metadata: { role: "teacher", role_confirmed: true, teacher_onboarded: true, onboarding_tour_done: true } }) });
  if (t.status >= 300) throw new Error(`create teacher ${t.status}`);
  probes.teacher.id = t.body.id;
  const sid = probes.student.id;
  const statuses = ["saved", "preparing", "applied", "interview", "rejected"];
  const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const rows = Array.from({ length: 12 }, (_, i) => ({ user_id: sid, id: `${sid}-app-${i}`, company: `Probe AG ${i}`, position: "Informatiker EFZ", category: "Informatik", status: statuses[i % 5], created_at: day(20 - i), updated_at: day(10 - (i % 10)), location: "Zürich" }));
  await rest("/applications", { method: "POST", body: JSON.stringify(rows) });
  const now = new Date().toISOString();
  await rest(`/profiles?user_id=eq.${sid}`, { method: "PATCH", body: JSON.stringify({ onboarding_tour_completed_at: now, onboarding_completed_at: now }) });
  // Teacher: role, temporary free access (staff never get a trial; the row goes with the user), one class the student joins.
  const tTok = await tokenFor(probes.teacher.email, PW);
  const role = await rpcAs(tTok, "set_my_role", { p_role: "teacher" });
  const acc = await rest(`/account_access?user_id=eq.${probes.teacher.id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ free_access_until: new Date(Date.now() + 3 * 3600e3).toISOString(), free_access_note: "probe-reel-wf measurement" }) });
  if (acc.text === "[]") await rest("/account_access", { method: "POST", body: JSON.stringify({ user_id: probes.teacher.id, trial_started_at: now, trial_ends_at: now, free_access_until: new Date(Date.now() + 3 * 3600e3).toISOString(), free_access_note: "probe-reel-wf measurement" }) });
  const cls = await rpcAs(tTok, "class_create", { p_name: "Probe Klasse", p_school_year: "2026/27" });
  const c = Array.isArray(cls.body) ? cls.body[0] : null;
  if (!c?.id) throw new Error(`class_create ${cls.status} role ${role.status}`);
  probes.classId = c.id;
  const sTok = await tokenFor(probes.student.email, PW);
  const join = await rpcAs(sTok, "class_join", { p_code: c.join_code });
  if (join.status >= 300) throw new Error(`class_join ${join.status}`);
}

async function deleteProbes() {
  const out = {};
  for (const [k, p] of Object.entries(probes)) {
    if (!p?.id) continue;
    if (k === "student") await rest(`/applications?user_id=eq.${p.id}`, { method: "DELETE" });
    const d = await admin(`/users/${p.id}`, { method: "DELETE" });
    const after = (await admin(`/users/${p.id}`)).status;
    out[k] = { deleted: d.status, lookupAfter: after, gone: after === 404 };
  }
  return out;
}

// ------------------------------------------------------------------ local server
async function startServer() {
  if (!existsSync(path.join(ROOT, ".next/BUILD_ID")) || process.env.BUILD === "1") {
    console.log("next build …");
    await new Promise((res, rej) => spawn("npx", ["next", "build"], { cwd: ROOT, stdio: "inherit" }).on("exit", (c) => (c === 0 ? res() : rej(new Error(`build ${c}`)))));
  }
  const child = spawn("npx", ["next", "start", "-p", String(PORT)], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"], detached: true });
  BASE = `http://localhost:${PORT}`;
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${BASE}/login`)).ok) return child; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error("next start did not come up");
}

// ------------------------------------------------------------------ measurement
async function waitReady(page, extra, timeout) {
  const t0 = Date.now();
  const ok = await page.waitForFunction((ex) => {
    if (document.querySelector('[aria-busy="true"], .skeleton, .spinner, .animate-pulse')) return false;
    const text = document.body?.innerText ?? "";
    if (/Einen Moment bitte|wird geladen|Lädt …|Laden …/.test(text)) return false;
    if (!document.querySelector("main")) return false;
    if (ex === "canvas" && !document.querySelector("canvas")) return false;
    return true;
  }, extra, { timeout, polling: 50 }).then(() => true).catch(() => false);
  return { ms: Date.now() - t0, ok };
}

async function main() {
  if (!SB || !ANON || !SR) throw new Error("Missing Supabase URL / publishable key / service role key (see header).");
  if (!PW_PATH) throw new Error("playwright-core not found: set PLAYWRIGHT=<…/playwright-core/index.mjs>");
  const { chromium } = await import(PW_PATH);
  let server = null;
  const out = { tag: TAG, at: new Date().toISOString(), runs: RUNS, profiles: Object.fromEntries(profileKeys.map((k) => [k, PROFILES[k]])), results: {}, cleanup: null };
  const browser = await chromium.launch({ headless: true, executablePath: existsSync(CHROME) ? CHROME : undefined });
  try {
    if (!BASE) server = await startServer();
    out.base = BASE;
    await createProbes();
    const PAGES = [
      { key: "dashboard", path: "/dashboard", who: "student" },
      { key: "applications", path: "/applications", who: "student" },
      { key: "cvs", path: "/cvs", who: "student" },
      { key: "map", path: "/map", who: "student", extra: "canvas" },
      { key: "familie", path: "/familie", who: "student" },
      { key: "classes", path: "/classes", who: "student" },
      { key: "teacher", path: "/teacher", who: "teacher" },
      { key: "teacher-class", path: `/teacher/classes/${probes.classId}`, who: "teacher" },
      { key: "teacher-student", path: `/teacher/classes/${probes.classId}/students/${probes.student.id}`, who: "teacher" },
    ].filter((p) => !process.env.PAGES || process.env.PAGES.split(",").includes(p.key));

    // One real UI login per role (no throttling) → storage state with the Supabase session.
    const states = {};
    for (const who of ["student", "teacher"]) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const p = await ctx.newPage();
      await p.goto(`${BASE}/login`, { waitUntil: "load" });
      await p.fill('input[type="email"]', probes[who].email); await p.fill('input[type="password"]', PW);
      await p.locator('form button[type="submit"]').first().click();
      await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }).catch(() => null);
      await waitReady(p, undefined, 30000);
      states[who] = await ctx.storageState();
      out[`landed_${who}`] = new URL(p.url()).pathname;
      await ctx.close();
    }

    for (const prof of profileKeys) {
      out.results[prof] = {};
      for (const pg of PAGES) {
        const runs = [];
        for (let r = 0; r < RUNS; r++) {
          const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: states[pg.who] });
          const page = await ctx.newPage();
          if (PROFILES[prof]) { const cdp = await ctx.newCDPSession(page); await cdp.send("Network.enable"); await cdp.send("Network.emulateNetworkConditions", PROFILES[prof]); }
          const reqs = new Map(); let t0 = 0;
          page.on("request", (q) => { if (isData(q.url())) reqs.set(q, { name: `${q.method() === "GET" ? "" : q.method() + " "}${shortName(q.url())}`, start: Date.now() - t0 }); });
          const done = (q) => { const x = reqs.get(q); if (x && x.end === undefined) x.end = Date.now() - t0; };
          page.on("requestfinished", done); page.on("requestfailed", done);
          t0 = Date.now();
          await page.goto(BASE + pg.path, { waitUntil: "commit", timeout: 120000 }).catch(() => null);
          const ready = await waitReady(page, pg.extra, prof === "slow" ? 120000 : 45000);
          const readyMs = Date.now() - t0;
          await page.waitForTimeout(prof === "slow" ? 4000 : 1500); // late requests (badges, notifications) still count
          const list = [...reqs.values()].sort((a, b) => a.start - b.start);
          const beforeReady = list.filter((x) => x.start <= readyMs);
          const wf = waterfall(beforeReady);
          runs.push({ readyMs, ready: ready.ok, landed: new URL(page.url()).pathname, requests: list.length, requestsBeforeReady: beforeReady.length, depth: wf.depth, chain: wf.chain, list: r === 0 ? list : undefined });
          await ctx.close();
        }
        const res = { readyMedian: median(runs.map((x) => x.readyMs)), requestsMedian: median(runs.map((x) => x.requests)), depthMedian: median(runs.map((x) => x.depth)), allReady: runs.every((x) => x.ready), landed: runs[0].landed, runs };
        out.results[prof][pg.key] = res;
        console.log(`${prof.padEnd(6)} ${pg.key.padEnd(16)} ready ${runs.map((x) => x.readyMs).join("/")} ms  req ${runs.map((x) => x.requests).join("/")}  depth ${runs.map((x) => x.depth).join("/")}  ${res.allReady ? "" : "NOT-READY "}${res.landed}`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
    out.cleanup = await deleteProbes().catch((e) => ({ error: String(e?.message || e) }));
    console.log("cleanup", JSON.stringify(out.cleanup));
    if (server) { try { process.kill(-server.pid); } catch { /* gone */ } }
    mkdirSync(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, `perf-slow-${TAG}.json`);
    writeFileSync(file, JSON.stringify(out, null, 2));
    writeFileSync(path.join(OUT_DIR, `perf-slow-${TAG}.md`), table(out));
    console.log(table(out)); console.log("written", file);
  }
}

export function table(out) {
  const lines = [`| Page | ${Object.keys(out.results).map((p) => `${p} ready ms / req / depth`).join(" | ")} |`, `|---|${Object.keys(out.results).map(() => "---").join("|")}|`];
  const pages = [...new Set(Object.values(out.results).flatMap((r) => Object.keys(r)))];
  for (const pg of pages) lines.push(`| ${pg} | ${Object.values(out.results).map((r) => (r[pg] ? `${r[pg].readyMedian}${r[pg].allReady ? "" : "*"} / ${r[pg].requestsMedian} / ${r[pg].depthMedian}` : "–")).join(" | ")} |`);
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((e) => { console.error(e?.message || e); process.exitCode = 1; });
}
