// Screenshot set for the "Sticker-Heft" redesign: every main screen in light + dark at 390px and 1280px
// (stubbed Supabase + stubbed job search, nothing real is touched).
// Usage: PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome binary> BASE=http://localhost:3101 OUT=<dir>/ [ONLY=login,dorf] node scripts/redesign-shots.mjs
import { mkdirSync } from "node:fs";
import { createMockSupabase, makeApplication } from "./lib/mock-supabase.mjs";
import { installJobsearchStub } from "./lib/jobsearch-stub.mjs";
const { chromium } = await import(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || "http://localhost:3101";
const OUT = (process.env.OUT || `${process.env.HOME}/Projects/bewerbungen-tracker-wt/shots-redesign/`).replace(/\/?$/, "/");
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
mkdirSync(OUT, { recursive: true });

const STATUSES = ["interview", "applied", "preparing", "saved", "rejected", "offer", "applied", "saved"];
const filled = () => Array.from({ length: 8 }, (_, i) => makeApplication(i + 1, { status: STATUSES[i], company: ["Swisscom", "UBS", "Migros", "Google", "Post", "ZKB", "SBB", "Roche"][i], position: ["Applikationsentwickler:in EFZ", "Kaufmann/-frau EFZ", "Informatikerin EFZ", "Mediamatiker:in EFZ", "Logistiker:in EFZ", "Kaufmann/-frau EFZ", "Polymechaniker:in EFZ", "Laborant:in EFZ"][i] }));
const profile = { full_name: "Panat Ruangsri", location: "Zürich", target_roles: ["Informatiker EFZ"], skills: [], bio: "" };
const SIZES = [{ name: "390", width: 390, height: 844, mobile: true }, { name: "1280", width: 1280, height: 800, mobile: false }];

const settle = async (page, ms = 900) => { await page.waitForLoadState("networkidle").catch(() => {}); await page.waitForTimeout(ms); };
const waitMap = async (page) => { await page.waitForSelector("[data-map-fullscreen] canvas, [data-map-fullscreen] [data-map-renderer]", { timeout: 120000 }); await page.waitForTimeout(2500); };
const search = async (page) => {
  const box = page.getByRole("combobox", { name: "Beruf oder Stelle suchen" });
  await box.waitFor({ timeout: 120000 });
  await box.fill("Informatiker"); await box.press("Enter");
  await page.locator('section[aria-label="Suchergebnisse"] ol > li').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(700);
};

const ORT = "/search?q=Informatiker&k=a&l=Winterthur";
const results = async (page) => { await page.locator('section[aria-label="Suchergebnisse"] ol > li').first().waitFor({ timeout: 120000 }); await page.waitForTimeout(700); };
const openFilter = async (page, size) => {
  if (size.mobile) { await page.getByRole("button", { name: /^Filter( \(\d+\))?$/ }).click(); await page.getByRole("dialog", { name: "Filter" }).waitFor(); }
  else await page.getByRole("complementary", { name: "Filter" }).scrollIntoViewIfNeeded();
};
const suggest = async (page, size, text, wait = true) => {
  await openFilter(page, size);
  const field = page.locator(size.mobile ? "#m-loc" : "#d-loc");
  await field.click(); await field.press("ControlOrMeta+a"); await field.pressSequentially(text, { delay: 40 });
  if (wait) await page.locator(".location-autocomplete__list:not([hidden]) .location-autocomplete__option").first().waitFor({ timeout: 30000 });
};

/** name, path, mock options, optional prepare(page, size), fullPage (default true) */
const SHOTS = [
  { name: "01-login", path: "/login", mock: { authed: false } },
  { name: "02-dashboard-neu", path: "/dashboard", mock: { apps: [], profile } },
  { name: "03-dashboard-mit-daten", path: "/dashboard", mock: { apps: filled(), profile } },
  { name: "04-suche", path: "/search", mock: { apps: [], profile }, prepare: search },
  { name: "05-filter-dialog", path: "/search", mock: { apps: [], profile }, fullPage: false, prepare: async (page, size) => {
    await search(page);
    if (size.mobile) { await page.getByRole("button", { name: /^Filter( \(\d+\))?$/ }).click(); await page.getByRole("dialog", { name: "Filter" }).waitFor(); }
    else await page.getByRole("complementary", { name: "Filter" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
  } },
  { name: "06-bewerbungen", path: "/applications", mock: { apps: filled(), profile } },
  { name: "07-bewerbung-detail", path: "/applications/a1", mock: { apps: filled(), profile } },
  { name: "08-dorf", path: "/map", mock: { apps: filled(), profile }, fullPage: false, prepare: waitMap },
  { name: "09-freunde", path: "/friends", mock: { apps: filled(), profile } },
  { name: "10-mehr-menue", path: "/dashboard", mock: { apps: filled(), profile }, fullPage: false, only: "390", prepare: async (page) => { await page.getByRole("button", { name: "Mehr" }).click(); await page.getByRole("dialog", { name: "Mehr" }).waitFor(); await page.waitForTimeout(500); } },
  { name: "11-profil", path: "/profile", mock: { apps: filled(), profile } },
  { name: "12-einstellungen", path: "/settings", mock: { apps: filled(), profile } },
  { name: "13-klassen", path: "/classes", mock: { role: "student", apps: filled(), profile } },
  { name: "14-landing", path: "/", mock: { authed: false } },
  // Ort-Suche: results with distance stickers, the open suggestion list (second option active), loading spinner, unknown place, Impressum source line
  { name: "15-ort-treffer", path: ORT, mock: { apps: [], profile }, prepare: results },
  { name: "16-ort-vorschlaege", path: ORT, mock: { apps: [], profile }, fullPage: false, prepare: async (page, size) => { await results(page); await suggest(page, size, "Wint"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.waitForTimeout(300); } },
  { name: "17-ort-laedt", path: ORT, mock: { apps: [], profile }, fullPage: false, prepare: async (page, size) => { await results(page); await page.route("**/api/places**", async (route) => { await new Promise((r) => setTimeout(r, 6000)); await route.continue().catch(() => {}); }); await suggest(page, size, "Us", false); await page.waitForTimeout(600); } },
  { name: "18-ort-unbekannt", path: "/search?q=Informatiker&k=a&l=nirgendwo", mock: { apps: [], profile }, prepare: async (page) => { await page.getByText(/kennen wir leider nicht/).first().waitFor({ timeout: 120000 }); await page.waitForTimeout(500); } },
  { name: "19-ort-filter-dialog", path: ORT, mock: { apps: [], profile }, fullPage: false, prepare: async (page, size) => { await results(page); await openFilter(page, size); await page.waitForTimeout(500); } },
  { name: "20-impressum", path: "/impressum", mock: { authed: false } },
];

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const log = [];
const jobs = [];
for (const theme of ["light", "dark"]) for (const size of SIZES) for (const shot of SHOTS) {
  if (ONLY && !ONLY.some((key) => shot.name.includes(key))) continue;
  if (shot.only && shot.only !== size.name) continue;
  jobs.push(async () => {
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: size.mobile, isMobile: size.mobile, colorScheme: theme, deviceScaleFactor: size.mobile ? 2 : 1, reducedMotion: "no-preference" });
    await ctx.addInitScript((value) => localStorage.setItem("wendapply-theme", value), theme);
    await createMockSupabase(shot.mock).install(ctx);
    ctx.setDefaultTimeout(120000);
    const page = await ctx.newPage();
    await installJobsearchStub(page);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message.slice(0, 160)));
    const file = `${OUT}${shot.name}-${size.name}-${theme}.png`;
    try {
      await page.goto(BASE + shot.path, { waitUntil: "load" });
      if (shot.prepare) await shot.prepare(page, size); else await settle(page);
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      const fullPage = shot.fullPage !== false;
      // Mobile full-page shots: grow the viewport to the document (max 3000px) instead of Chrome's stitched capture,
      // so the fixed tab bar sits at the bottom and long lists are not tiled.
      if (fullPage && size.mobile) {
        const height = await page.evaluate(() => document.scrollingElement.scrollHeight);
        await page.setViewportSize({ width: size.width, height: Math.min(Math.max(height, size.height), 3000) });
        await page.waitForTimeout(400);
        await page.screenshot({ path: file, timeout: 120000 });
      } else await page.screenshot({ path: file, fullPage, timeout: 120000 });
      log.push(`${shot.name} ${size.name} ${theme} overflowX=${overflow}${errors.length ? " ERR " + errors[0] : ""}`);
    } catch (error) { log.push(`${shot.name} ${size.name} ${theme} FAILED ${String(error.message).slice(0, 140)}`); }
    await ctx.close();
  });
}
const CONC = Number(process.env.CONC || 2);
let next = 0;
await Promise.all(Array.from({ length: CONC }, async () => { while (next < jobs.length) await jobs[next++](); }));
await browser.close();
console.log(log.sort().join("\n"));
