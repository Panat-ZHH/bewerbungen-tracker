// Visual QA for /search: desktop 1280 and mobile 375 screenshots (stubbed API + mock Supabase) -> ~/Projects/bewerbungen-tracker-wt/screenshots/jobsearch/
// Run: BASE=http://localhost:3204 node scripts/jobsearch-visual-qa.mjs   (BASE must be a dev/prod server built with the dummy Supabase env)
// Env: PLAYWRIGHT (path to playwright-core/index.mjs), CHROME, OUT. Also reports horizontal overflow and tap targets < 36px.
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createMockSupabase } from "./lib/mock-supabase.mjs";
import { installJobsearchStub } from "./lib/jobsearch-stub.mjs";

const BASE = process.env.BASE || "http://localhost:3204";
const OUT = (process.env.OUT || join(homedir(), "Projects/bewerbungen-tracker-wt/screenshots/jobsearch")).replace(/\/?$/, "/");
mkdirSync(OUT, { recursive: true });
const pw = [process.env.PLAYWRIGHT, join(homedir(), "Projects/bewerbungen-tracker-wt/audit-tools/node_modules/playwright-core/index.mjs")].filter(Boolean).find(existsSync);
const { chromium } = pw ? await import(pathToFileURL(pw).href) : await import("playwright-core");
const chrome = process.env.CHROME || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);

const PROFILES = [{ name: "desktop", width: 1280, height: 900, mobile: false }, { name: "mobile", width: 375, height: 812, mobile: true }];
const browser = await chromium.launch({ executablePath: chrome });
const problems = [];
for (const theme of ["light", "dark"]) for (const p of PROFILES) {
  const ctx = await browser.newContext({ viewport: { width: p.width, height: p.height }, isMobile: p.mobile, hasTouch: p.mobile, deviceScaleFactor: p.mobile ? 2 : 1, colorScheme: theme });
  await ctx.addInitScript((th) => localStorage.setItem("wendapply-theme", th), theme);
  await createMockSupabase({ apps: [] }).install(ctx);
  const page = await ctx.newPage();
  await installJobsearchStub(page);
  const tag = `${p.name}-${theme}`;
  const shot = (name, full = false) => page.screenshot({ path: `${OUT}${tag}-${name}.png`, fullPage: full });
  const audit = async (label) => {
    const r = await page.evaluate(() => {
      const d = document.documentElement;
      const small = [...document.querySelectorAll("button, a[href], input, select")].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 2 && b.height > 2 && (b.height < 36 || b.width < 36) && getComputedStyle(el).visibility !== "hidden" && !el.closest("[aria-hidden=true]") && el.type !== "range" && el.type !== "checkbox"; }).map((el) => `${el.tagName.toLowerCase()}:${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
      return { overflow: d.scrollWidth - d.clientWidth, small: small.slice(0, 8) };
    });
    if (r.overflow > 1) problems.push(`${tag} ${label}: horizontal overflow ${r.overflow}px`);
    if (r.small.length) problems.push(`${tag} ${label}: small tap targets ${r.small.join(", ")}`);
  };
  const box = page.getByRole("combobox", { name: "Beruf oder Stelle suchen" });
  await page.goto(`${BASE}/search`, { waitUntil: "domcontentloaded" });
  await box.waitFor({ timeout: 120000 });
  await page.waitForTimeout(800);
  await shot("1-start"); await audit("start");
  await box.fill("Informatiker"); await page.waitForTimeout(300);
  await shot("2-suggestions");
  await box.press("Enter");
  await page.locator('section[aria-label="Suchergebnisse"] ol > li').first().waitFor();
  await page.waitForTimeout(600);
  await shot("3-results"); await shot("3-results-full", true); await audit("results");
  if (p.mobile) {
    await page.getByRole("button", { name: /^Filter( \(\d+\))?$/ }).click();
    await page.getByRole("dialog", { name: "Filter" }).waitFor();
    await page.waitForTimeout(400);
    await shot("4-filter-sheet"); await audit("filter sheet");
    await page.getByRole("dialog", { name: "Filter" }).getByRole("button", { name: /^ZH\b/ }).first().click();
    await page.getByRole("dialog", { name: "Filter" }).getByRole("button", { name: /Fertig|Treffer anzeigen/ }).click();
  } else {
    await page.getByRole("complementary", { name: "Filter" }).getByRole("button", { name: /^ZH\b/ }).first().click();
  }
  await page.waitForTimeout(500);
  await shot("5-filtered-chips"); await audit("filtered");
  await page.getByRole("button", { name: /^Gespeicherte Suchen/ }).click();
  await page.waitForTimeout(400);
  await shot("6-presets"); await audit("presets");
  await page.keyboard.press("Escape");
  await box.fill("zzzz"); await box.press("Enter");
  await page.getByText(/Keine passenden Anzeigen/).waitFor();
  await shot("7-empty"); await audit("empty");
  await box.fill("fehler"); await box.press("Enter");
  await page.getByText(/etwas länger/).first().waitFor();
  await shot("8-error"); await audit("error");
  await ctx.close();
}
await browser.close();
console.log(`screenshots -> ${OUT}`);
if (problems.length) { console.log("PROBLEMS:\n" + problems.join("\n")); process.exit(1); }
console.log("no layout problems detected");
