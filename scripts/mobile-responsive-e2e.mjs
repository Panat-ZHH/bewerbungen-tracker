#!/usr/bin/env node
// Responsive regression check for WendApply: every route x role on real device emulation (WebKit iPhones/iPad + landscape,
// Chromium Pixel/Galaxy/Tab + plain widths 320-1024), light + dark, root text size 130 % / 200 %. Per page it checks horizontal
// overflow, controls covered by the fixed bottom nav, panels/sheets reaching behind the nav, unreachable (off-screen) controls,
// dialogs larger than the viewport, tap targets, input font-size (< 16px = iOS zoom), viewport meta, content under the nav at
// the page end. Exits 1 when any ERROR-level issue is found (see ERROR_KINDS in scripts/mobile-lib.mjs).
//
//   npm run test:mobile                                   # full matrix against BASE (default http://localhost:3235)
//   npm run test:mobile -- --quick                        # 4 devices, key pages (~5 min)
//   node scripts/mobile-responsive-e2e.mjs --devices=iphone-se,pixel-7 --personas=schueler --pages=map-item,map-placement
//   node scripts/mobile-responsive-e2e.mjs --users=none   # public pages only, no live users
//
// Options: --base=URL --devices=a,b|--quick --personas=a,b --pages=a,b --themes=light,dark --all-dark --all-scale --no-scale
//          --users=setup(default)|reuse|none (setup creates throwaway users and ALWAYS deletes them in finally{}; reuse reads
//          the state file of `node scripts/mobile-users.mjs setup`) --concurrency=4 --label=name --out=<dir for report/json/shots>
//          --shots=0 (no screenshots) --shotdir=<dir> --findings=<dir> (write <OWNER>.md per owner) --no-fail (always exit 0)
// Env: PLAYWRIGHT (playwright-core >= 1.65 index.mjs; WebKit build webkit-2388), CHROME (Chrome binary for Chromium).
// Live role pages use the production Supabase project with throwaway users `probe-rel-mobile-*@wendapply-probe.invalid`
// (see scripts/mobile-users.mjs). Never run it against production URLs with --users=setup unless you mean it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildMatrix, PERSONAS, QUICK_PAGES, variantsFor, modeOf, fillPath, parseList, auditExpression, aggregate, markdownReport,
  matrixTable, ownerMarkdown, severityOf, SHOT_DEVICES,
} from "./mobile-lib.mjs";
import { setupUsers, cleanupUsers, DEFAULT_STATE } from "./mobile-users.mjs";

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v = "1"] = a.slice(2).split("="); return [k, v]; }));
const BASE = (args.base || process.env.BASE || "http://localhost:3235").replace(/\/$/, "");
const LABEL = args.label || "run";
const OUT = args.out || join(homedir(), "Projects/bewerbungen-tracker-wt/_mobile/runs", LABEL);
const SHOTS = args.shots !== "0";
const CONC = Number(args.concurrency || 4);
const USERS = args.users || "setup";
mkdirSync(OUT, { recursive: true });

async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT, join(homedir(), "JARVIS/browser-profiles/node_modules/playwright-core/index.mjs"), join(homedir(), "Projects/bewerbungen-tracker-wt/audit-tools/node_modules/playwright-core/index.mjs")].filter(Boolean);
  for (const p of candidates) if (existsSync(p)) return import(pathToFileURL(p).href);
  return import("playwright-core");
}
const CHROME = process.env.CHROME || (existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ------------------------------------------------------------------------------------------------ selection
const pw = await loadPlaywright();
let devices = buildMatrix(pw.devices, { quick: !!args.quick, only: parseList(args.devices) });
const themes = parseList(args.themes) || ["light", "dark"];
const onlyPersonas = parseList(args.personas), onlyPages = parseList(args.pages);
let personas = PERSONAS.filter((p) => !onlyPersonas || onlyPersonas.includes(p.key) || onlyPersonas.includes(p.role));
if (USERS === "none") personas = personas.filter((p) => !p.user && !p.needsUsers);
personas = personas.map((p) => ({ ...p, pages: p.pages.filter(([name]) => (!onlyPages || onlyPages.includes(name)) && (!args.quick || (QUICK_PAGES[p.role] || []).includes(name))) })).filter((p) => p.pages.length);
if (!devices.length || !personas.length) { console.error("nothing selected"); process.exit(2); }

// ------------------------------------------------------------------------------------------------ in-page helpers
async function settle(page, ms = 600) {
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]:not([data-map-fullscreen] *), .animate-pulse, .skeleton, [data-skeleton]'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(ms);
}
const visibleButton = (page, name) => page.getByRole("button", { name }).locator("visible=true");
async function clickFirst(page, locators, waitMs = 15000) {
  // the app may still be hydrating on a loaded machine: wait until one of the candidates is visible
  const any = locators.slice(1).reduce((acc, l) => acc.or(l), locators[0]).first();
  await any.waitFor({ state: "visible", timeout: waitMs }).catch(() => {});
  for (const loc of locators) { const l = loc.first(); if (await l.isVisible().catch(() => false)) { await l.click({ timeout: 8000 }); return true; } }
  return false;
}
/** Scripted interactions before the audit. Returns null or an error message. */
const FLOWS = {
  async mehr(page, dev) {
    const ok = dev.mobile
      ? await clickFirst(page, [page.locator('nav[aria-label="Hauptmenü mobil"]').getByRole("button", { name: /Mehr/ }), page.locator('nav[aria-label="Hauptmenü mobil"]').getByText("Mehr", { exact: true })])
      : await clickFirst(page, [page.getByRole("button", { name: "Konto und mehr" })]);
    if (!ok) return "no 'Mehr' / 'Konto und mehr' button";
    await page.waitForTimeout(500);
    return (await page.locator('[role=dialog]').locator("visible=true").count()) ? null : "Mehr sheet did not open";
  },
  async edit(page) { return (await clickFirst(page, [visibleButton(page, /^Bearbeiten$/)])) ? (await page.waitForTimeout(500), null) : "no 'Bearbeiten' button"; },
  async "map-search"(page) { return (await clickFirst(page, [page.locator("button[aria-expanded]").and(page.getByRole("button", { name: /^Suche/ }))])) ? (await page.waitForTimeout(600), null) : "no 'Suche' chip on the map"; },
  async "map-shop"(page) {
    await page.waitForFunction(() => !document.querySelector('[data-map-fullscreen] [role=status]'), null, { timeout: 15000 }).catch(() => {});
    if (!(await clickFirst(page, [page.locator("button[aria-expanded]").and(page.getByRole("button", { name: /^Laden$/ })), visibleButton(page, /^Laden$/)]))) return "no 'Laden' button on the map";
    await page.waitForTimeout(900);
    return null;
  },
  async "map-item"(page, dev) {
    const e = await FLOWS["map-shop"](page, dev); if (e) return e;
    const item = page.getByRole("button", { name: /Sport-Roller Limette #1/ }).locator("visible=true").first();
    await item.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
    if (!(await item.isVisible().catch(() => false))) return "inventory item 'Sport-Roller Limette #1' not visible in the shop";
    await item.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(700);
    return null;
  },
  /** A placed item selected (Panat's screenshot: "Sport-Roller Limette" panel with Verschieben / Einlagern). */
  async "map-selected"(page, dev) {
    const e = await FLOWS["map-shop"](page, dev); if (e) return e;
    const item = page.getByRole("button", { name: /Sport-Roller Limette #2/ }).locator("visible=true").first();
    await item.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
    if (!(await item.isVisible().catch(() => false))) return "placed item 'Sport-Roller Limette #2' not visible in the inventory";
    await item.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await clickFirst(page, [visibleButton(page, /^Laden schliessen$/)], 3000);
    await page.waitForTimeout(800);
    return (await page.locator('[aria-label="Ausgewählter Gegenstand"]').locator("visible=true").count()) ? null : "selected-item panel did not appear after closing the shop";
  },
  async "map-placement"(page, dev) {
    const e = await FLOWS["map-item"](page, dev); if (e) return e;
    const place = visibleButton(page, /^Platzieren$/);
    if (!(await place.count())) return "no visible 'Platzieren' button after selecting the item";
    await place.last().click({ timeout: 5000 }).catch((err) => { throw new Error("'Platzieren' not clickable: " + String(err.message).split("\n")[0]); });
    await page.waitForTimeout(900);
    return (await page.locator('[aria-label="Gegenstand platzieren"]').count()) ? null : "placement tools did not appear";
  },
};

// ------------------------------------------------------------------------------------------------ users + login
let S = null;
const needUsers = personas.some((p) => p.user || p.needsUsers);
const storage = new Map();
async function login(browser, userKey, attempt = 1) {
  if (storage.has(userKey)) return storage.get(userKey);
  try { return await loginOnce(browser, userKey); }
  catch (e) { if (attempt >= 3) throw e; log(`login ${userKey} failed (${String(e.message).split("\n")[0]}), retry ${attempt}`); return login(browser, userKey, attempt + 1); }
}
async function loginOnce(browser, userKey) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 800 }, locale: "de-CH" });
  const p = await ctx.newPage();
  try {
    await p.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 60000 });
    await settle(p, 300);
    if (/Konto erstellen/.test(await p.locator('form button[type="submit"]').first().innerText().catch(() => ""))) { await p.getByRole("button", { name: "Anmelden", exact: true }).last().click().catch(() => {}); await p.waitForTimeout(300); }
    await p.fill('input[type="email"]', S.users[userKey].email); await p.fill('input[type="password"]', S.pw);
    await p.locator('form button[type="submit"]').first().click();
    await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90000 });
    await settle(p, 300);
    const st = await ctx.storageState();
    storage.set(userKey, st);
    return st;
  } finally { await ctx.close(); }
}

// ------------------------------------------------------------------------------------------------ run
const results = [];
const started = new Date().toISOString();
const shotRoot = args.shotdir || join(OUT, "shots");
let browsers = {};
let exitCode = 0;
try {
  if (needUsers) {
    if (USERS === "reuse") { S = JSON.parse(readFileSync(args.state || DEFAULT_STATE, "utf8")); log("reusing users", S.stamp); }
    else { log("creating throwaway users ..."); S = await setupUsers({ stateFile: args.state || DEFAULT_STATE, log: (...a) => log("  setup", ...a) }); }
  }
  browsers.chromium = await pw.chromium.launch({ executablePath: CHROME, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  if (devices.some((d) => d.browser === "webkit")) browsers.webkit = await pw.webkit.launch();
  for (const p of personas) if (p.user) { await login(browsers.chromium, p.user); log("logged in", p.user); }

  // one group = device x variant x persona (one browser context, pages in sequence)
  const groups = [];
  for (const dev of devices) for (const v of variantsFor(dev.id, { themes, allDark: !!args["all-dark"], allScale: !!args["all-scale"], scales: args["no-scale"] ? [] : undefined })) for (const p of personas) groups.push({ dev, v, p });
  const total = groups.reduce((n, g) => n + g.p.pages.length, 0);
  log(`${devices.length} devices, ${personas.length} personas, ${groups.length} contexts, ${total} page audits, concurrency ${CONC}, base ${BASE}`);
  let done = 0;
  async function runGroup({ dev, v, p }) {
    const browser = browsers[dev.browser];
    const mode = modeOf(v);
    const ctx = await browser.newContext({ ...dev.options, colorScheme: v.theme, locale: "de-CH", timezoneId: "Europe/Zurich", reducedMotion: "reduce", storageState: p.user ? storage.get(p.user) : undefined });
    if (v.scale !== 100) await ctx.addInitScript((scale) => { const add = () => { const st = document.createElement("style"); st.textContent = `html{font-size:${scale}% !important;-webkit-text-size-adjust:${scale}% !important;text-size-adjust:${scale}% !important}`; (document.head || document.documentElement).appendChild(st); }; if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add); else add(); }, v.scale);
    // Production CSP contains `upgrade-insecure-requests`; WebKit (unlike Chromium) also upgrades http://localhost, so every
    // CSS/font/JS request of a local `next start` fails with a TLS error. Drop only that directive for plain-http targets.
    if (dev.browser === "webkit" && BASE.startsWith("http://")) await ctx.route("**/*", async (route) => {
      if (route.request().resourceType() !== "document") return route.continue();
      try {
        const resp = await route.fetch({ maxRedirects: 0 });
        const headers = { ...resp.headers() };
        for (const k of Object.keys(headers)) if (/^content-security-policy/i.test(k)) headers[k] = headers[k].replace(/upgrade-insecure-requests;?\s*/gi, "");
        return route.fulfill({ response: resp, headers });
      } catch { return route.continue(); }
    });
    const page = await ctx.newPage();
    if (dev.safeArea && dev.browser === "chromium") {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: dev.safeArea }).catch((e) => log("safe-area emulation unavailable:", e.message));
      if (dev.standalone) await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "display-mode", value: "standalone" }] }).catch(() => {});
    }
    const pageErrors = [];
    // fetches aborted by our own navigation/reload are not app errors
    page.on("pageerror", (e) => { const m = String(e.message).split("\n")[0].slice(0, 200); if (!/access control checks|Load failed|Failed to fetch|NetworkError|aborted/i.test(m)) pageErrors.push(m); });
    for (const [name, rawPath, flow] of p.pages) {
      const path = fillPath(rawPath, S?.vars);
      const r = { device: dev.id, browser: dev.browser, persona: p.key, role: p.role, page: name, path, mode, issues: [] };
      pageErrors.length = 0;
      try {
        if (path.includes("{")) throw new Error("missing setup variable for " + rawPath);
        const resp = await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 60000 });
        r.status = resp?.status();
        if (flow && path.startsWith("/map")) {
          // map panels remember open/collapsed state in localStorage; start every scripted map flow from a clean UI state
          await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (!k.startsWith("sb-")) localStorage.removeItem(k); sessionStorage.clear(); }).catch(() => {});
          await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
        }
        await settle(page);
        r.finalPath = new URL(page.url()).pathname;
        if (p.user && r.finalPath.startsWith("/login")) r.issues.push({ kind: "redirected", sel: "document", msg: `redirected to ${r.finalPath} (session lost?)` });
        if (flow) {
          let err;
          try { err = await FLOWS[flow](page, dev); } catch (e) { const lines = String(e.message).split("\n"); err = [lines[0], lines.find((l) => /intercepts pointer events|not enabled|not visible|outside of the viewport/.test(l))].filter(Boolean).join(" — ").replace(/\s+/g, " ").slice(0, 400); }
          if (err) r.issues.push({ kind: "flow-failed", sel: `flow:${flow}`, msg: err });
          await settle(page, 400);
        }
        const audit = await page.evaluate(auditExpression({ mobile: dev.mobile, maxOverlap: 200 }));
        r.metrics = audit.metrics; r.issues.push(...audit.issues);
        if (pageErrors.length) r.issues.push({ kind: "page-error", sel: "window", msg: `uncaught: ${[...new Set(pageErrors)].slice(0, 2).join(" | ")}` });
        if (SHOTS && SHOT_DEVICES.includes(dev.id)) {
          const dir = join(shotRoot, p.key); mkdirSync(dir, { recursive: true });
          r.shot = join(dir, `${name}__${dev.id}_${mode}.jpg`);
          await page.screenshot({ path: r.shot, type: "jpeg", quality: 62, scale: "css", timeout: 20000 }).catch(() => { r.shot = undefined; });
        }
      } catch (e) {
        r.error = String(e.message).split("\n")[0].slice(0, 300);
        r.issues.push({ kind: "page-error", sel: "navigation", msg: r.error });
      }
      results.push(r);
      done++;
      const errs = r.issues.filter((i) => severityOf(i) === "error").length;
      if (errs || done % 25 === 0) log(`[${done}/${total}] ${dev.id} ${mode} ${p.key}/${name}: ${errs} errors${errs ? " — " + r.issues.filter((i) => severityOf(i) === "error").map((i) => i.kind).join(",") : ""}`);
    }
    await ctx.close();
  }
  const queue = [...groups];
  await Promise.all(Array.from({ length: Math.min(CONC, queue.length) }, async () => { while (queue.length) { const g = queue.shift(); try { await runGroup(g); } catch (e) { log("context failed", g.dev.id, g.p.key, String(e.message).split("\n")[0]); for (const [name, rawPath] of g.p.pages) results.push({ device: g.dev.id, persona: g.p.key, role: g.p.role, page: name, path: fillPath(rawPath, S?.vars), mode: modeOf(g.v), error: String(e.message).slice(0, 200), issues: [{ kind: "page-error", sel: "context", msg: String(e.message).split("\n")[0].slice(0, 200) }] }); } } }));

  // ---------------------------------------------------------------------------------------------- report
  const finished = new Date().toISOString();
  const aggregated = aggregate(results);
  const anon = (s) => (S ? String(s).split(S.stamp).join("<stamp>") : s);
  writeFileSync(join(OUT, "results.json"), anon(JSON.stringify({ base: BASE, label: LABEL, started, finished, devices: devices.map((d) => ({ id: d.id, label: d.label, browser: d.browser, viewport: d.options.viewport })), results, aggregated }, null, 1)));
  const extra = ["## Per page × device (error count; · clean, – not run, ! navigation error; modes light/dark/text-scale merged per device)", "", matrixTable(results, devices)].join("\n");
  writeFileSync(join(OUT, "REPORT.md"), anon(markdownReport({ title: `Mobile responsive check — ${LABEL}`, base: BASE, started, finished, devices, results, aggregated, extra })));
  if (args.findings) { mkdirSync(args.findings, { recursive: true }); for (const o of ["VILLAGE", "SHELL", "ROLES", "PUBLIC"]) writeFileSync(join(args.findings, `${o}.md`), anon(ownerMarkdown(o, aggregated, { title: LABEL, base: BASE, shotsDir: shotRoot }))); }
  const errorRows = aggregated.filter((a) => a.severity === "error");
  log(`DONE ${results.length} audits: ${errorRows.length} distinct errors, ${aggregated.length - errorRows.length} warnings. Report: ${join(OUT, "REPORT.md")}`);
  if (errorRows.length && !args["no-fail"]) exitCode = 1;
} catch (e) {
  console.error("FATAL", e?.stack || e);
  exitCode = 2;
} finally {
  for (const b of Object.values(browsers)) await b.close().catch(() => {});
  if (needUsers && USERS === "setup") {
    try { const left = await cleanupUsers({ stateFile: args.state || DEFAULT_STATE }); log("throwaway users left:", left.users, JSON.stringify(left)); if (left.users) exitCode = exitCode || 3; }
    catch (e) { console.error("CLEANUP FAILED — run `node scripts/mobile-users.mjs cleanup`:", e.message); exitCode = 3; }
  }
}
process.exit(exitCode);
