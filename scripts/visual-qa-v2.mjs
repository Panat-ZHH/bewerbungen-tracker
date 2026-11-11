// Visual QA screenshots (stubbed Supabase, nothing real is touched).
// Usage: PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome binary> [BASE=http://localhost:3206] [ONLY=route,route] [WIDTHS=320,375] [THEMES=light] node scripts/visual-qa-v2.mjs
// Output: $OUT/<route>-<width>-<light|dark>.png (default ~/Projects/bewerbungen-tracker-wt/screenshots/v2/final/)
import { createMockSupabase, makeApplication } from "./lib/mock-supabase.mjs";
import { mkdirSync } from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || "http://localhost:3206";
const OUT = process.env.OUT || `${process.env.HOME}/Projects/bewerbungen-tracker-wt/screenshots/v2/final/`;
mkdirSync(OUT, { recursive: true });
const HEIGHT = { 320: 640, 375: 812, 390: 844, 393: 852, 430: 932, 768: 1024, 1280: 800, 1920: 1080 };
const WIDTHS = (process.env.WIDTHS || "320,375,393,430,768,1280").split(",").map(Number);
const THEMES = (process.env.THEMES || "light,dark").split(",");
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const filled = () => Array.from({ length: 8 }, (_, i) => makeApplication(i + 1, { company: ["Swisscom", "UBS", "Migros", "Google", "Post", "ZKB", "SBB", "Roche"][i], position: ["Applikationsentwickler:in EFZ", "Praktikum Finanzen", "Informatikerin EFZ", "Software Engineering Intern", "Mediamatikerin", "Kaufmann/-frau EFZ", "Lokführer:in", "Laborant:in"][i], notes: "Rückruf am Donnerstag." }));
const CV = [{ id: "cv1", user_id: "u1", name: "Technik", type: "developer", status: "Ready", description: "Aktueller Lebenslauf", updated_at: "2026-10-01", file_name: "cv.pdf", storage_path: "u1/cv1/cv.pdf", file_type: "application/pdf", file_size: 1000 }, { id: "cv2", user_id: "u1", name: "Allgemein", type: "other", status: "Draft", description: "", updated_at: "2026-10-01", file_name: null, storage_path: null, file_type: null, file_size: null }];
const profile = { full_name: "Lena Müller", location: "Bern", target_roles: ["Informatikerin EFZ"], skills: ["React", "TypeScript"], bio: "Ich suche eine Lehrstelle." };

/** name, path, mock options, optional action(page), kind ("page" = fullPage shot, "map" = viewport + WebGL) */
const ROUTES = [
  { name: "login", path: "/login", mock: { authed: false } },
  { name: "dashboard-empty", path: "/dashboard", mock: { apps: [] } },
  { name: "dashboard-filled", path: "/dashboard", mock: { apps: filled(), cvs: CV, profile } },
  { name: "applications", path: "/applications", mock: { apps: filled() } },
  { name: "applications-new", path: "/applications/new", mock: { apps: filled() } },
  { name: "applications-edit", path: "/applications/a1", mock: { apps: filled() } },
  { name: "friends", path: "/friends", mock: { apps: filled() } },
  { name: "friend-island", path: "/friends/mock-friend", mock: { apps: filled() }, kind: "map" },
  { name: "classes-student", path: "/classes", mock: { role: "student", apps: filled() } },
  { name: "classes-teacher", path: "/classes", mock: { role: "teacher" } },
  { name: "profile", path: "/profile", mock: { apps: filled(), profile } },
  { name: "settings", path: "/settings", mock: { apps: filled() } },
  { name: "search", path: "/search", mock: { apps: filled() } },
  { name: "analytics", path: "/analytics", mock: { apps: filled() } },
  { name: "cvs", path: "/cvs", mock: { apps: filled(), cvs: CV } },
  { name: "404", path: "/diese-seite-gibt-es-nicht", mock: { apps: [] } },
];

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

async function open(w, h, dark, mockOpts) {
  const mobile = w < 768 || h < 500;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile, colorScheme: dark ? "dark" : "light", deviceScaleFactor: mobile ? 2 : 1 });
  await ctx.addInitScript(([theme]) => {
    localStorage.setItem("wendapply-theme", theme);
    const fake = new EventTarget();
    Object.assign(fake, { height: innerHeight, width: innerWidth, offsetTop: 0, offsetLeft: 0, scale: 1 });
    Object.defineProperty(window, "visualViewport", { value: fake, configurable: true });
    window.__keyboard = (px, pan = 0) => { fake.height = innerHeight - px - pan; fake.offsetTop = pan; fake.dispatchEvent(new Event("resize")); fake.dispatchEvent(new Event("scroll")); };
  }, [dark ? "dark" : "light"]);
  const mock = createMockSupabase(mockOpts);
  await mock.install(ctx);
  ctx.setDefaultTimeout(120000);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  return { ctx, page, errors };
}

const tag = (dark) => (dark ? "dark" : "light");
const waitMap = async (page) => { await page.waitForSelector("[data-map-fullscreen] canvas, [data-map-fullscreen] [data-map-renderer]", { timeout: 120000 }); await page.waitForTimeout(2500); };
const log = [];

async function shootPage(r, w, dark) {
  const h = HEIGHT[w];
  const { ctx, page, errors } = await open(w, h, dark, r.mock);
  try {
    await page.goto(BASE + r.path, { waitUntil: "load" });
    if (r.kind === "map") await waitMap(page); else { await page.waitForLoadState("networkidle").catch(() => {}); await page.waitForTimeout(900); }
    const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await page.screenshot({ path: `${OUT}${r.name}-${w}-${tag(dark)}.png`, timeout: 120000 });
    if (r.kind !== "map") {
      // full-page variant for judging below-the-fold content; the fixed tab bar would float mid-page, so hide it
      await page.addStyleTag({ content: 'nav[aria-label="Hauptmenü mobil"]{display:none!important}' });
      await page.screenshot({ path: `${OUT}${r.name}-${w}-${tag(dark)}-full.png`, fullPage: true, timeout: 120000 });
    }
    log.push(`${r.name} ${w} ${tag(dark)} overflowX=${overflow}${errors.length ? " ERR " + errors[0] : ""}`);
  } catch (e) { log.push(`${r.name} ${w} ${tag(dark)} FAILED ${e.message.slice(0, 120)}`); }
  await ctx.close();
}

async function shootMap(w, h, dark, label) {
  const { ctx, page, errors } = await open(w, h, dark, { apps: filled(), shop: { items: [{ id: "i1", itemType: "tree", x: null, z: null, rotation: 0, createdAt: "2026-10-01" }] } });
  const shot = (s) => page.screenshot({ path: `${OUT}map-${s}-${label}-${tag(dark)}.png`, timeout: 120000 });
  try {
    await page.goto(BASE + "/map", { waitUntil: "load" });
    await waitMap(page);
    await shot("1-collapsed");
    const chips = page.locator("button[data-open]");
    await chips.nth(0).click(); await page.waitForTimeout(400); await shot("2-island-panel"); await page.keyboard.press("Escape");
    await chips.nth(1).click(); await page.waitForTimeout(400); await shot("3-search"); await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Firma 1: .*Gebäudedetails/ }).click({ force: true, timeout: 20000 }).catch(() => page.evaluate(() => document.querySelector("[data-building]")?.click()));
    if (await page.locator('[data-sheet="application"]').waitFor({ timeout: 8000 }).then(() => true, () => false)) { await page.waitForTimeout(500); await shot("4-selected-sheet"); await page.keyboard.press("Escape"); }
    await page.getByRole("button", { name: "Shop" }).click(); await page.locator('[data-sheet="shop"]').waitFor(); await page.waitForTimeout(400); await shot("5-shop");
    await page.getByRole("button", { name: /Dein Inventar|Baum/ }).first().click().catch(() => {});
    await page.getByRole("button", { name: /Platzieren/ }).first().click({ timeout: 6000 }).catch(() => {});
    const x = page.getByLabel("Position X");
    if (await x.count()) { await page.waitForTimeout(500); await x.focus(); await page.evaluate((px) => window.__keyboard(px), Math.round(h * 0.42)); await page.waitForTimeout(500); await shot("6-keyboard"); }
    else {
      // Placement tools are not reachable with this stub: simulate the keyboard on the search field instead.
      await page.getByRole("button", { name: "Shop" }).click().catch(() => {});
      await chips.nth(1).click(); const si = page.getByPlaceholder("Firma, Stelle oder Ort"); await si.focus();
      await page.evaluate((px) => window.__keyboard(px), Math.round(h * 0.4)); await page.waitForTimeout(500); await shot("6-keyboard");
    }
    log.push(`map ${label} ${tag(dark)} ok${errors.length ? " ERR " + errors[0] : ""}`);
  } catch (e) { log.push(`map ${label} ${tag(dark)} FAILED ${e.message.slice(0, 120)}`); }
  await ctx.close();
}

const jobs = [];
for (const dark of THEMES.map((t) => t === "dark")) {
  for (const r of ROUTES) { if (ONLY && !ONLY.includes(r.name)) continue; for (const w of WIDTHS) jobs.push(() => shootPage(r, w, dark)); }
  if (!ONLY || ONLY.includes("map")) {
    for (const w of [...WIDTHS, 1920]) jobs.push(() => shootMap(w, HEIGHT[w], dark, String(w)));
    jobs.push(() => shootMap(844, 390, dark, "844x390"));
  }
}
const CONC = Number(process.env.CONC || 3);
let next = 0;
await Promise.all(Array.from({ length: CONC }, async () => { while (next < jobs.length) await jobs[next++](); }));
await browser.close();
console.log(log.sort().join("\n"));
