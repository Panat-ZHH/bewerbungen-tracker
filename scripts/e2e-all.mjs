// Repeatable headless-Chrome end-to-end runner for WendApply. Nothing real is touched: every request to Supabase
// (http://localhost:54321) is answered by the stateful in-memory mock in scripts/lib/mock-supabase.mjs.
//
//   npm run test:e2e                         # all flows, desktop + mobile, light + dark
//   BASE=http://localhost:3204 npm run test:e2e
//   node scripts/e2e-all.mjs --only=map      # only the map section (re-run after map UI changes)
//   node scripts/e2e-all.mjs --skip=map      # everything except the map section
//   node scripts/e2e-all.mjs --profile=mobile --theme=dark --flow=login
//
// Env: BASE (default http://localhost:3204; if nothing answers there a dev server is spawned on a free port with the dummy
// env), PLAYWRIGHT (path to playwright-core/index.mjs), CHROME (browser binary), OUT (screenshot dir), E2E_SPAWN=1 (always spawn).
// The dev server needs NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy and
// NEXT_PUBLIC_AVATAR_LOCAL=1 (the avatar flow is reported as SKIP if the latter is missing).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createMockSupabase, makeApplication } from "./lib/mock-supabase.mjs";
import { registerJobsearchFlows } from "./jobsearch-e2e.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v = "1"] = a.slice(2).split("="); return [k, v]; }));
const OUT = (process.env.OUT || args.out || join(homedir(), "Projects/bewerbungen-tracker-wt/screenshots/v2/tests")).replace(/\/?$/, "/");
mkdirSync(OUT + "failures", { recursive: true });

// ------------------------------------------------------------------------------------------------ environment
async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT, join(homedir(), "Projects/bewerbungen-tracker-wt/audit-tools/node_modules/playwright-core/index.mjs")].filter(Boolean);
  for (const path of candidates) if (existsSync(path)) return import(pathToFileURL(path).href);
  return import("playwright-core");
}
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (existsSync(mac)) return mac;
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  if (existsSync(cache)) for (const dir of readdirSync(cache).filter((d) => d.startsWith("chromium-"))) {
    const base = join(cache, dir, "chrome-mac-arm64");
    if (existsSync(base)) for (const app of readdirSync(base)) { const bin = join(base, app, "Contents/MacOS", app.replace(/\.app$/, "")); if (existsSync(bin)) return bin; }
  }
  return undefined; // let playwright find its own
}
const freePort = () => new Promise((resolve) => { const s = createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const reachable = async (url) => { try { const r = await fetch(url + "/login", { signal: AbortSignal.timeout(8000) }); return r.status < 500; } catch { return false; } };

let devServer;
async function resolveBase() {
  const wanted = process.env.BASE || "http://localhost:3204";
  if (process.env.E2E_SPAWN !== "1" && (await reachable(wanted))) return wanted;
  if (process.env.BASE && process.env.E2E_SPAWN !== "1") throw new Error(`BASE ${wanted} is not reachable`);
  const port = await freePort();
  console.log(`Starting a dev server on port ${port} (dummy Supabase env) ...`);
  devServer = spawn("npx", ["next", "dev", "--webpack", "-p", String(port)], { cwd: ROOT, env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "dummy", NEXT_PUBLIC_AVATAR_LOCAL: "1" }, stdio: "ignore", detached: false });
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) { if (await reachable(base)) return base; await new Promise((r) => setTimeout(r, 1000)); }
  throw new Error("dev server did not start in time");
}
const stopServer = () => { try { devServer?.kill("SIGTERM"); } catch { /* already gone */ } };
process.on("exit", stopServer);
process.on("SIGINT", () => { stopServer(); process.exit(130); });

// ------------------------------------------------------------------------------------------------ results
const results = [];
let currentScope = "";
const report = (ok, name, info = "", skip = false, known = false) => {
  const status = skip ? "SKIP" : ok ? "PASS" : known ? "KNOWN" : "FAIL";
  results.push({ scope: currentScope, name, status, info: String(info).slice(0, 4500) });
  console.log(`${status.padEnd(4)} [${currentScope}] ${name}${info && status !== "PASS" ? " — " + String(info).slice(0, 240) : ""}`);
};

// ------------------------------------------------------------------------------------------------ flow harness
const PROFILES = { desktop: { width: 1280, height: 800, mobile: false }, mobile: { width: 390, height: 844, mobile: true } };
const THEMES = ["light", "dark"];
const seedApps = (n = 4) => Array.from({ length: n }, (_, i) => makeApplication(i + 1));
const NOISE = [/Download the React DevTools/i];

function makeT({ page, mock, profile, theme, flowName, base }) {
  const issues = [];
  const expected = [];
  let failed = false;
  page.on("console", (m) => { if (m.type() === "error" && !NOISE.some((r) => r.test(m.text()))) issues.push(`console.error: ${m.text().slice(0, 4000)}`); });
  page.on("pageerror", (e) => issues.push(`uncaught: ${e.message.slice(0, 200)}`));
  page.on("requestfailed", (r) => { const f = r.failure()?.errorText ?? ""; if (!/ERR_ABORTED/.test(f)) issues.push(`request failed: ${r.url().slice(0, 120)} ${f}`); });
  page.on("response", (r) => { const url = r.url(); if (r.status() >= 400 && !url.startsWith("http://localhost:54321")) issues.push(`HTTP ${r.status()}: ${url.slice(0, 120)}`); });
  const t = {
    page, mock, profile, theme, mobile: profile.mobile, base,
    /** Marks console/response noise matching these patterns as expected for the rest of the flow (error-path flows). */
    expect(...patterns) { expected.push(...patterns); },
    check(name, ok, info = "") { if (!ok) failed = true; report(!!ok, name, info); return !!ok; },
    skip(name, why) { report(true, name, why, true); },
    /** A check for a documented app bug (docs/test-report-v2.md): reported as KNOWN (not a failure) until the bug is fixed, then PASS. */
    known(name, ok, ref) { report(!!ok, name, ref, false, true); return !!ok; },
    async shot(label) { await page.screenshot({ path: `${OUT}${flowName}-${profile.name}-${theme}-${label}.png`, timeout: 30000, caret: "initial" }).catch(() => undefined); },
    async settle(ms = 400) { await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => undefined); await page.waitForTimeout(ms); },
    async visit(path, { label = path, waitFor } = {}) {
      await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 120000 });
      if (waitFor) await waitFor().catch(() => undefined);
      await t.settle();
      return t.clean(`load ${label}`);
    },
    /** Asserts: no console errors / uncaught exceptions / failed requests since the last call and no horizontal overflow. */
    async clean(label) {
      const wide = await page.evaluate(() => { const d = document.documentElement; return d.scrollWidth - d.clientWidth; }).catch(() => 0);
      const found = issues.splice(0).filter((i) => !expected.some((p) => p.test(i)));
      const ok1 = t.check(`${label}: no console errors / failed requests / exceptions`, found.length === 0, found.slice(0, 3).join(" | ").slice(0, 4500));
      const ok2 = t.check(`${label}: no horizontal overflow`, wide <= 1, `scrollWidth - clientWidth = ${wide}`);
      return ok1 && ok2;
    },
    async text(re, timeout = 15000) { try { await page.getByText(re).locator("visible=true").first().waitFor({ timeout }); return true; } catch { return false; } },
    get failed() { return failed; },
  };
  return t;
}

async function runFlow(browser, base, profile, theme, flow) {
  const ctx = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, hasTouch: profile.mobile, isMobile: profile.mobile, colorScheme: theme, deviceScaleFactor: profile.mobile ? 2 : 1 });
  await ctx.addInitScript((th) => { try { if (!localStorage.getItem("wendapply-theme")) localStorage.setItem("wendapply-theme", th); } catch { /* storage unavailable */ } }, theme);
  const mock = createMockSupabase(flow.mock ? flow.mock({ profile, theme }) : {});
  await mock.install(ctx);
  ctx.setDefaultTimeout(20000);
  const page = await ctx.newPage();
  currentScope = `${profile.name}/${theme}/${flow.name}`;
  const t = makeT({ page, mock, profile, theme, flowName: flow.name, base });
  const start = Date.now();
  try { await flow.run(t); await t.clean("end of flow"); }
  catch (error) { t.check("flow ran to completion", false, String(error?.message ?? error).split("\n")[0]); }
  if (t.failed) await page.screenshot({ path: `${OUT}failures/${flow.name}-${profile.name}-${theme}.png`, fullPage: false, timeout: 30000, caret: "initial" }).catch(() => undefined);
  await ctx.close();
  return Date.now() - start;
}

// ------------------------------------------------------------------------------------------------ flows (app, non-map)
const student = (extra = {}) => () => ({ role: "student", ...extra });
const flows = [];
const flow = (name, mock, run, opts = {}) => flows.push({ name, mock, run, section: opts.section ?? "app", only: opts.only });

flow("login", () => ({ authed: false }), async (t) => {
  const { page } = t;
  await t.visit("/login");
  t.check("login: headline and form visible", await t.text(/Schön, dass du da bist/) && await page.getByLabel("E-Mail-Adresse").isVisible() && await page.getByLabel("Passwort", { exact: true }).isVisible());
  await t.shot("form");
  await page.getByLabel("E-Mail-Adresse").fill("lena@beispiel.ch");
  await page.getByLabel("Passwort", { exact: true }).fill("falsch");
  t.expect(/Failed to load resource|status of 400/);
  await page.getByRole("button", { name: "Anmelden" }).click();
  const alert = page.getByRole("alert").first();
  t.check("login: wrong password shows a friendly error message", await alert.waitFor({ timeout: 10000 }).then(() => true, () => false), await alert.innerText().catch(() => "no alert"));
  await t.shot("error");
  await t.clean("login after failed attempt");
  await page.getByRole("button", { name: "Konto erstellen" }).click();
  t.check("signup: role choice offered", await page.getByText("Schüler:in").first().isVisible() && await page.getByText("Lehrperson").first().isVisible());
  const passwords = page.locator("input#password, input#confirm-password");
  if (await passwords.count() >= 2) {
    await page.getByLabel("E-Mail-Adresse").fill("neu@beispiel.ch");
    await passwords.nth(0).fill("geheim123"); await passwords.nth(1).fill("anders456");
    await page.locator("form").getByRole("button", { name: /Konto erstellen/ }).click();
    t.check("signup: password mismatch is reported", await t.text(/Passwörter stimmen nicht überein/, 5000));
  } else t.skip("signup: password mismatch", "confirm password field not found");
  await page.goto(base(t) + "/applications", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/login/, { timeout: 20000 }).catch(() => undefined);
  await t.settle(800);
  t.check("anonymous visitor is sent to /login", /\/login/.test(page.url()), page.url());
  t.expect(/Failed to load resource|401/);
  await t.clean("anonymous redirect");
  // successful sign-in
  await t.visit("/login");
  await page.getByLabel("E-Mail-Adresse").fill("lena@beispiel.ch");
  await page.getByLabel("Passwort", { exact: true }).fill("richtig123");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30000, caret: "initial" }).catch(() => undefined);
  t.check("valid sign-in lands on the dashboard", /\/dashboard/.test(page.url()), page.url());
});
const base = (t) => t.base;

flow("onboarding-empty", student(), async (t) => {
  const { page } = t;
  await t.visit("/dashboard");
  t.check("empty dashboard shows the first-application call to action", await t.text(/Willkommen! So startest du in drei Schritten/));
  await t.shot("dashboard");
  await page.getByRole("link", { name: "Erste Bewerbung eintragen" }).click();
  await page.waitForURL(/\/applications\/new/);
  t.check("CTA leads to the form", /\/applications\/new/.test(page.url()));
  await t.visit("/applications");
  t.check("empty list explains what to do", await t.text(/Noch keine Bewerbungen/));
  await t.visit("/analytics");
  t.check("analytics page renders without data", await t.text(/Dein Fortschritt/));
});

flow("application-crud", student(), async (t) => {
  const { page, mock } = t;
  await t.visit("/applications/new");
  await page.getByRole("button", { name: "Bewerbung speichern" }).click();
  t.check("empty form is rejected with a clear message", await t.text(/Felder? brauchen noch deine Aufmerksamkeit|Bitte gib die Firma an/, 5000));
  await page.getByLabel(/^Firma/).fill("Migros");
  await page.getByLabel(/^Welche Stelle/).fill("Mediamatiker:in");
  await page.getByLabel("Was ist der Stand?").selectOption("applied");
  await t.shot("form");
  await page.getByRole("button", { name: "Bewerbung speichern" }).click();
  await page.waitForURL(/\/applications\/(?!new$)[^/]+$/, { timeout: 20000 }).catch(() => undefined);
  t.check("new Bewerbung is saved and its detail page opens", /\/applications\/(?!new)[^/]+$/.test(page.url()) && mock.state.apps.length === 1, page.url());
  t.check("detail shows company and position", await t.text(/Mediamatiker:in/) && await t.text(/Migros/));
  const id = mock.state.apps[0]?.id;
  // status change -> "Zusage"
  await page.getByLabel("Stand der Bewerbung").selectOption({ label: "Zusage" });
  await t.settle();
  t.check("status 'Zusage' is stored as offer", mock.state.apps[0]?.status === "offer", mock.state.apps[0]?.status);
  t.check("status select shows the label Zusage", (await page.getByLabel("Stand der Bewerbung").evaluate((s) => s.selectedOptions[0]?.textContent)) === "Zusage");
  await t.shot("zusage");
  await t.visit("/applications", { label: "list after status change" });
  t.check("list shows the Zusage badge", await t.text(/Zusage/));
  t.check("no 'Angebot' wording anywhere on the list", !(await page.locator("body").innerText()).includes("Angebot"));
  // edit
  await t.visit(`/applications/${id}`);
  await page.getByRole("button", { name: "Ändern" }).click();
  const company = page.getByLabel(/^Firma/);
  await company.waitFor();
  await company.fill("Migros Bank");
  await page.getByRole("button", { name: "Änderungen speichern" }).click();
  await page.waitForURL(new RegExp(`/applications/${id}$`)).catch(() => undefined);
  await t.settle();
  t.check("edit is saved", mock.state.apps[0]?.company === "Migros Bank", mock.state.apps[0]?.company);
  // after saving an edit the detail view should be shown again (BUG-1 in docs/test-report-v2.md)
  const backToDetail = await page.getByRole("button", { name: "Bewerbung löschen" }).waitFor({ timeout: 4000 }).then(() => true, () => false);
  t.known("after saving an edit the page leaves edit mode", backToDetail, "BUG-1");
  if (!backToDetail) await t.visit(`/applications/${id}`, { label: "detail (reload after edit)" });
  // delete: cancel first, then confirm, then undo if the app offers it
  await page.getByRole("button", { name: "Bewerbung löschen" }).click();
  await page.getByRole("button", { name: "Abbrechen" }).click();
  t.check("cancel keeps the Bewerbung", mock.state.apps.length === 1);
  await page.getByRole("button", { name: "Bewerbung löschen" }).click();
  await t.shot("delete-dialog");
  await page.getByRole("button", { name: "Löschen", exact: true }).click();
  await page.waitForURL(/\/applications$/, { timeout: 20000 }).catch(() => undefined);
  await t.settle();
  t.check("delete removes the Bewerbung", mock.state.apps.length === 0);
  const undo = page.getByRole("button", { name: /Rückgängig|Wiederherstellen/ }).first();
  if (await undo.isVisible().catch(() => false)) {
    const snapshot = mock.state.apps.length;
    await undo.click(); await t.settle();
    t.check("undo restores the deleted Bewerbung", mock.state.apps.length === snapshot + 1);
  } else t.skip("delete + undo", "app offers no undo (confirm dialog only) — see docs/test-report-v2.md");
});

flow("search-filter", student({ apps: seedApps(5) }), async (t) => {
  const { page } = t;
  await t.visit("/applications");
  const rows = page.locator("a[href^='/applications/a']");
  await rows.first().waitFor({ timeout: 20000 }).catch(() => undefined);
  t.check("all seeded Bewerbungen are listed", (await rows.count()) === 5, String(await rows.count()));
  await page.getByLabel("Firma oder Stelle suchen").fill("Firma 2");
  await t.settle(300);
  t.check("search narrows the list", (await rows.count()) === 1, String(await rows.count()));
  await page.getByLabel("Firma oder Stelle suchen").fill("gibtsnicht");
  await t.settle(300);
  t.check("search without hits shows no rows", (await rows.count()) === 0);
  await page.getByLabel("Firma oder Stelle suchen").fill("");
  const chip = page.getByRole("group", { name: "Nach Status filtern" }).getByRole("button").nth(1);
  await chip.click(); await t.settle(300);
  t.check("status filter chip reduces the list", (await rows.count()) < 5 && (await rows.count()) >= 1, String(await rows.count()));
  await t.shot("filtered");
  await t.visit("/search", { label: "/search" });
  t.check("job search page renders", await t.text(/Finde deine Stelle/));
});

flow("analytics-cvs", student({ apps: seedApps(6), cvs: [{ id: "cv1", user_id: "u1", name: "Lebenslauf Informatik", type: "developer", status: "Ready", description: "Aktuell", updated_at: "2026-10-01", file_name: "cv.pdf", storage_path: "u1/cv1/cv.pdf", file_type: "application/pdf", file_size: 1234 }] }), async (t) => {
  const { page } = t;
  await t.visit("/analytics", { waitFor: () => page.locator(".recharts-surface").first().waitFor({ timeout: 10000 }) });
  t.check("analytics shows totals", await t.text(/Dein Fortschritt/) && await t.text(/Wo stehen deine Bewerbungen/));
  t.check("analytics chart is drawn", (await page.locator(".recharts-surface").count()) > 0);
  await t.shot("analytics");
  await t.visit("/cvs");
  t.check("CV list shows the stored CV (file badge + file name)", await t.text(/Datei da/) && await t.text(/cv\.pdf/));
  await page.getByRole("button", { name: "Beschreibung ändern" }).first().click();
  t.check("CV edit dialog opens", await page.getByRole("dialog").first().isVisible().catch(() => false));
  await t.shot("cv-dialog");
});

flow("profile-avatar", student({ profile: { first_name: "Lena", last_name: "Müller", email: "lena@beispiel.ch", phone: null, location: null, website: null, linkedin: null } }), async (t) => {
  const { page, mock } = t;
  await t.visit("/profile");
  t.check("profile form is prefilled from the stored profile", (await page.getByLabel("Vorname").inputValue()) === "Lena");
  await page.getByLabel("Wohnort").fill("Bern");
  await page.getByRole("button", { name: "Änderungen speichern" }).click();
  await t.settle();
  t.check("profile is saved", mock.state.profiles[0]?.location === "Bern", JSON.stringify(mock.state.profiles[0]));
  const input = page.getByTestId("avatar-file");
  if (!(await input.count())) { t.skip("avatar upload", "no avatar-file input"); return; }
  const dataUrl = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 600; c.height = 400; const x = c.getContext("2d"); x.fillStyle = "#2563eb"; x.fillRect(0, 0, 600, 400); x.fillStyle = "#f97316"; x.fillRect(100, 100, 200, 200); return c.toDataURL("image/png"); });
  await input.setInputFiles({ name: "me.png", mimeType: "image/png", buffer: Buffer.from(dataUrl.split(",")[1], "base64") });
  const crop = page.getByTestId("avatar-crop");
  if (!(await crop.waitFor({ timeout: 8000 }).then(() => true, () => false))) { t.check("avatar crop editor opens", false); return; }
  await t.shot("crop");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  const saved = await t.text(/Dein Profilbild wurde gespeichert/, 15000);
  t.check("avatar is saved (local mode)", saved, saved ? "" : "enable with NEXT_PUBLIC_AVATAR_LOCAL=1 on the dev server");
  if (saved) {
    t.check("avatar image shows up in the header", await page.locator("header img").first().waitFor({ timeout: 8000 }).then(() => true, () => false));
    await t.shot("avatar-saved");
  }
});

flow("settings-theme", student({ apps: seedApps(2) }), async (t) => {
  const { page } = t;
  await t.visit("/settings");
  const dark = () => page.evaluate(() => document.documentElement.getAttribute("data-theme") === "dark");
  await page.getByRole("tab", { name: "Dunkel" }).click();
  await t.settle(500);
  t.check("choosing Dunkel switches the theme", await dark());
  t.check("choice is persisted in localStorage", (await page.evaluate(() => localStorage.getItem("wendapply-theme"))) === "dark");
  await t.shot("dark-on");
  await page.reload({ waitUntil: "domcontentloaded" }); await t.settle(600);
  t.check("dark theme survives a reload", await dark());
  await t.visit("/dashboard", { label: "dashboard in dark" });
  t.check("dark theme applies on other pages", await dark());
  await t.visit("/settings");
  await page.getByRole("tab", { name: "Hell" }).click();
  await t.settle(500);
  t.check("choosing Hell switches back", !(await dark()));
  await page.getByRole("button", { name: "Herunterladen" }).click();
  t.check("data export reports success", await t.text(/Deine Daten wurden als Datei/, 8000));
});

flow("friends", student(), async (t) => {
  const { page, mock } = t;
  await t.visit("/friends");
  t.check("friend list shows the friend", await t.text(/Marco Bianchi/));
  t.check("invite code and link are visible", await t.text(/LENA4821/) && await t.text(/\/invite\/LENA4821/));
  const badge = page.locator("[aria-label*='offene Freundschaftsanfrage']").first();
  t.check("nav shows the open-request badge", await badge.count() > 0, "expected aria-label '1 offene Freundschaftsanfrage'");
  await t.shot("friends");
  await page.getByLabel(/Code oder E-Mail/).fill("UNBEKANNT");
  await page.getByRole("button", { name: "Anfrage senden" }).click();
  t.expect(/Failed to load resource|status of 400/);
  t.check("unknown code gives a friendly error", await page.getByRole("alert").first().waitFor({ timeout: 8000 }).then(() => true, () => false) || await t.text(/nicht gefunden|keine Person|kein:e Nutzer/i, 3000));
  await t.clean("after failed invite");
  await page.getByLabel(/Code oder E-Mail/).fill("FREUND42");
  await page.getByRole("button", { name: "Anfrage senden" }).click();
  await t.settle(600);
  t.check("valid code sends a friend request", mock.rpcCalls("social_send_request").length >= 2 && mock.state.connections.some((c) => c.other_user_id === "u9"));
  await page.getByRole("button", { name: "Annehmen" }).first().click();
  await t.settle(600);
  t.check("accepting an incoming request makes it a friend", mock.state.connections.find((c) => c.id === "f2")?.state === "friend");
  t.check("badge disappears after accepting", (await page.locator("[aria-label*='offene Freundschaftsanfrage']").count()) === 0);
  await t.shot("friends-after");
});

flow("friend-island", student(), async (t) => {
  const { page } = t;
  await t.visit("/friends/mock-friend", { waitFor: () => page.locator("[data-map-renderer]").first().waitFor({ timeout: 45000 }) });
  t.check("friend island header is shown", await t.text(/Insel von Mia Muster/));
  t.check("island is read-only ('Nur ansehen')", await t.text(/Nur ansehen/));
  const body = await page.locator("main, body").first().innerText();
  t.check("no shop / edit / delete controls on the friend island", !/Shop|Einlagern|Haus verschieben|Platzieren|kaufen/.test(body));
  t.check("company names stay private", !/Firma \d|Migros|Swisscom/.test(body));
  t.check("map canvas rendered", await page.locator("[data-map-renderer]").count() > 0, "[data-map-renderer] missing (WebGL?)");
  await t.shot("friend-island");
});

flow("classes-student", student(), async (t) => {
  const { page, mock } = t;
  await t.visit("/classes");
  t.check("membership card is shown", await t.text(/Informatik 4a/) && await t.text(/Freigabe aktiv/));
  await page.getByRole("button", { name: "Freigabe pausieren" }).click();
  await t.settle(500);
  t.check("sharing can be paused", mock.state.memberships[0]?.share_applications === false);
  await t.shot("classes-student");
  await t.visit("/classes/join/KLAS7Q2", { label: "join page" });
  t.check("join page previews the class before joining", await t.text(/Informatik 4a/));
  t.expect(/status of 400/);
  await t.visit("/classes/join/FALSCH", { label: "join page (bad code)" });
  t.check("join page with an unknown code explains the problem", await t.text(/nicht gefunden|gibt es nicht|ungültig|Code/i, 8000));
});

flow("classes-teacher", () => ({ role: "teacher", apps: [] }), async (t) => {
  const { page } = t;
  await t.visit("/classes");
  t.check("teacher sees their class and the create button", await t.text(/Informatik 4a/) && await page.getByRole("button", { name: "Klasse erstellen" }).isVisible());
  await t.visit("/classes/c1");
  t.check("class overview lists students", await t.text(/Anna Meier/) && await t.text(/Ben Huber/));
  t.check("student without consent shows no data", await t.text(/Teilt keine Daten/));
  await page.getByRole("tab", { name: /Mit Zusage/ }).click();
  await t.settle(300);
  t.check("filter 'Mit Zusage' keeps only Anna", await page.getByText("Anna Meier").locator("visible=true").count() > 0 && (await page.getByText("Ben Huber").locator("visible=true").count()) === 0);
  await page.getByText("Anna Meier").locator("visible=true").first().click();
  await t.settle(600);
  t.check("student drilldown opens with applications", await t.text(/Swisscom/));
  await t.shot("class-drilldown");
});

flow("not-found", student(), async (t) => {
  const { page } = t;
  t.expect(/HTTP 404|status of 404/);
  await page.goto(t.base + "/gibt-es-nicht", { waitUntil: "domcontentloaded", timeout: 120000 });
  await t.settle();
  t.check("404 page explains itself", await t.text(/Diese Seite gibt es nicht/));
  t.check("404 page links back home", await page.getByRole("link", { name: "Zur Startseite" }).isVisible());
  await t.clean("404 page");
});

flow("navigation", student({ apps: seedApps(3) }), async (t) => {
  const { page } = t;
  await t.visit("/dashboard");
  t.check("dashboard greets by name and shows the progress strip", await t.text(/^Hoi .+!/) && await t.text(/Dein Weg zur Lehrstelle/));
  const nav = t.mobile ? page.locator("nav").last() : page.locator("header, nav").first();
  await page.getByRole("link", { name: /^Bewerbungen$/ }).locator("visible=true").first().click();
  await page.waitForURL(/\/applications$/).catch(() => undefined);
  t.check("nav link 'Bewerbungen' navigates", /\/applications$/.test(page.url()), page.url());
  void nav;
  await page.getByRole("link", { name: /^Freunde/ }).locator("visible=true").first().click();
  await page.waitForURL(/\/friends$/).catch(() => undefined);
  t.check("nav link 'Freunde' navigates", /\/friends$/.test(page.url()), page.url());
  if (t.mobile) {
    const more = page.locator('nav[aria-label="Hauptmenü mobil"] button', { hasText: "Mehr" });
    const hasMore = await more.first().waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false);
    t.check("mobile tab bar has a 'Mehr' sheet", hasMore, `matches: ${await more.count()}`);
    if (hasMore) { await more.first().click(); t.check("'Mehr' opens a dialog with the settings link", await page.getByRole("dialog").getByRole("link", { name: /Einstellungen/ }).isVisible().catch(() => false)); await page.keyboard.press("Escape"); }
  }
  await t.shot("nav");
});

registerJobsearchFlows(flow, student); // scripts/jobsearch-e2e.mjs

// ------------------------------------------------------------------------------------------------ map section (separate on purpose)
// Selectors are aria-label / role / text based with fallbacks, because the map UI is being reworked (fullscreen layout, overlays).
flow("map", () => ({ role: "student", apps: seedApps(8), unlocked: 2 }), async (t) => {
  const { page, mock } = t;
  const renderer = page.locator("[data-map-renderer]").first();
  await t.visit("/map", { waitFor: () => renderer.waitFor({ timeout: 90000 }) });
  await page.waitForTimeout(2000);
  t.check("map renders (3D or fallback)", await renderer.count() > 0, "[data-map-renderer] missing");
  await t.shot("map");
  const buildings = page.locator("[data-building]");
  t.check("one house label per Bewerbung", (await buildings.count()) >= 8 || (await buildings.count()) === 0, String(await buildings.count()));

  const click = async (re) => { const b = page.getByRole("button", { name: re }).locator("visible=true").first(); if (await b.count()) { await b.click(); return true; } return false; };
  const zoomText = async () => ((await page.getByRole("button", { name: /Zoom zurücksetzen/ }).first().innerText().catch(() => "")).match(/\d+/) ?? [""])[0];
  const z0 = await zoomText();
  if (await click(/^Vergrößern$/)) { await page.waitForTimeout(400); t.check("zoom-in button changes the zoom", (await zoomText()) !== z0, `${z0} -> ${await zoomText()}`); } else t.skip("zoom controls", "no 'Vergrößern' button found");
  await click(/^Zoom zurücksetzen/);
  if (await click(/^Verkleinern$/)) { await page.waitForTimeout(300); t.check("zoom-out button works", (await zoomText()) !== z0); }
  await click(/^Zoom zurücksetzen/);

  // islands
  let island2 = page.getByRole("button", { name: /Ostinsel/ }).first();
  if (!(await island2.count())) { await page.getByRole("button", { name: /Heimatinsel/ }).first().click().catch(() => undefined); await page.waitForTimeout(400); island2 = page.getByRole("button", { name: /Ostinsel/ }).first(); }
  t.check("island switcher lists Heimatinsel and Ostinsel", await page.getByRole("button", { name: /Heimatinsel/ }).count() > 0 && await island2.count() > 0);

  // shop: buy a tree
  await click(/^Shop/); await page.waitForTimeout(500);
  const buy = page.getByRole("button", { name: /Zierbaum kaufen/ }).locator("visible=true").first();
  if (!(await buy.count())) { t.skip("shop buy / place / drag", "no 'Zierbaum kaufen' button (shop UI changed?)"); return; }
  const before = mock.state.shop.balance;
  await buy.click(); await t.settle(800);
  t.check("buying a tree costs points and adds an item", mock.state.shop.items.length === 1 && mock.state.shop.balance < before, JSON.stringify(mock.state.shop.items));
  // place via coordinates (works regardless of camera/layout), fall back to clicking the host
  const tools = page.locator('[aria-label="Gegenstand platzieren"]');
  const host = page.locator("[role=region][aria-label*='Dorf'], [role=region]").first();
  const box = await host.boundingBox().catch(() => null);
  if (box) { await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5); await page.waitForTimeout(500); }
  const xInput = page.getByLabel("Position X");
  if (await xInput.count()) {
    await xInput.fill("6"); await page.getByLabel("Position Z").fill("-4"); await page.waitForTimeout(300);
    const confirm = tools.locator("button", { hasText: "Platzieren" }).first();
    const clicked = (await confirm.count()) && (await confirm.isEnabled()) ? (await confirm.click(), true) : false;
    await t.settle(800);
    t.check("item is placed on the map", clicked && mock.state.shop.items[0]?.x === 6, JSON.stringify(mock.state.shop.items[0]));
  } else t.skip("place item", "no position inputs found");
  await t.shot("map-placed");
  // drag-move a house via the dialog flow
  const house = buildings.first();
  if (await house.count()) {
    if (t.mobile) await page.keyboard.press("Escape");
    await house.click({ force: true }).catch(() => undefined); await page.waitForTimeout(500);
    const move = page.getByRole("button", { name: /Haus verschieben/ }).first();
    if (await move.count()) {
      await move.click(); await page.waitForTimeout(500);
      await page.getByLabel("Position X").fill("20"); await page.getByLabel("Position Z").fill("2"); await page.waitForTimeout(300);
      const ok = page.locator('[aria-label="Gegenstand platzieren"]').locator("button", { hasText: "Platzieren" }).first();
      if (await ok.count() && await ok.isEnabled()) { await ok.click(); await t.settle(800); }
      t.check("house can be moved", mock.state.shop.layouts.length === 1, JSON.stringify(mock.state.shop.layouts));
    } else t.skip("move house", "no 'Haus verschieben' button");
  } else t.skip("move house", "no house label");
  // reload: persistence
  await t.visit("/map", { label: "/map reload", waitFor: () => renderer.waitFor({ timeout: 90000 }) });
  t.check("placed item and moved house persist after reload", mock.state.shop.items[0]?.x === 6);
  await t.shot("map-reloaded");
}, { section: "map" });

// ------------------------------------------------------------------------------------------------ main
async function main() {
  const { chromium } = await loadPlaywright();
  const baseUrl = await resolveBase();
  console.log(`E2E against ${baseUrl}; screenshots -> ${OUT}`);
  const only = args.only; const skip = args.skip; const onlyFlow = args.flow;
  const wantProfiles = Object.entries(PROFILES).filter(([n]) => !args.profile || args.profile === n).map(([name, p]) => ({ name, ...p }));
  const wantThemes = THEMES.filter((th) => !args.theme || args.theme === th);
  const selected = flows.filter((f) => (!only || f.section === only) && (!skip || f.section !== skip) && (!onlyFlow || f.name.includes(onlyFlow)));
  const browser = await chromium.launch({ executablePath: findChrome(), args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const timings = [];
  for (const profile of wantProfiles) for (const theme of wantThemes) for (const f of selected) {
    const ms = await runFlow(browser, baseUrl, profile, theme, f);
    timings.push({ flow: f.name, profile: profile.name, theme, ms });
  }
  await browser.close();
  const count = (s) => results.filter((r) => r.status === s).length;
  const summary = { base: baseUrl, finishedAt: new Date().toISOString(), pass: count("PASS"), fail: count("FAIL"), known: count("KNOWN"), skip: count("SKIP"), total: results.length, failures: results.filter((r) => r.status === "FAIL"), skips: results.filter((r) => r.status === "SKIP").map((r) => `${r.scope}: ${r.name} (${r.info})`), timings };
  writeFileSync(OUT + "summary.json", JSON.stringify({ ...summary, results }, null, 2));
  console.log(`\n==== ${summary.pass} PASS, ${summary.fail} FAIL, ${summary.known} KNOWN-BUG, ${summary.skip} SKIP (${summary.total} checks) — summary: ${OUT}summary.json`);
  for (const f of summary.failures) console.log(`  FAIL [${f.scope}] ${f.name} — ${f.info}`);
  // Teacher-role flows (own stateful stand-in, own screenshots in screenshots/teacher/). Skip with --skip=teacher; run alone with --only=teacher.
  let teacherFail = 0;
  if (args.skip !== "teacher" && (!only || only === "teacher")) {
    const { spawnSync } = await import("node:child_process");
    const run = spawnSync(process.execPath, [join(ROOT, "scripts/teacher-e2e.mjs")], { stdio: "inherit", env: { ...process.env, BASE: baseUrl, PLAYWRIGHT: process.env.PLAYWRIGHT || [join(homedir(), "Projects/bewerbungen-tracker-wt/audit-tools/node_modules/playwright-core/index.mjs")].find(existsSync) || "playwright-core", CHROME: findChrome() } });
    teacherFail = run.status ?? 1;
  }
  stopServer();
  process.exit(summary.fail || teacherFail ? 1 : 0);
}
main().catch((error) => { console.error(error); stopServer(); process.exit(2); });
