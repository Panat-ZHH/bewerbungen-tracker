// Screenshots of /bewerbung-check (empty form, filled form, loading, result, prefilled from an application, error)
// at 375 and 1280 px, light + dark. Supabase is mocked (scripts/lib/mock-supabase.mjs), the AI review runs in preview mode.
// Usage:
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy NEXT_PUBLIC_AI_REVIEW_MOCK=1 npx next dev --webpack -p 3207 &
//   PLAYWRIGHT=/Users/panat.ruangsri/Projects/bewerbungen-tracker-wt/audit-tools/node_modules/playwright-core/index.mjs \
//   CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" BASE=http://localhost:3207 \
//   OUT=/Users/panat.ruangsri/Projects/bewerbungen-tracker-wt/screenshots/ai-review/ node tests/ai-review-ui-shots.mjs
import { mkdirSync } from "node:fs";
import { createMockSupabase, makeApplication } from "../scripts/lib/mock-supabase.mjs";
const { chromium } = await import(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || "http://localhost:3207";
const OUT = (process.env.OUT || "/Users/panat.ruangsri/Projects/bewerbungen-tracker-wt/screenshots/ai-review/").replace(/\/?$/, "/");
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
mkdirSync(OUT, { recursive: true });

const profile = { full_name: "Lena Müller", location: "Zürich", target_roles: [], skills: [], bio: "" };
const apps = [makeApplication(1, { company: "Migros", position: "Detailhandelsfachfrau EFZ", status: "preparing", job_description: "Du berätst unsere Kundinnen und Kunden freundlich und hilfst beim Warenauftritt." })];
const SIZES = [{ name: "375", width: 375, height: 812, mobile: true }, { name: "1280", width: 1280, height: 800, mobile: false }];
const letter = { name: "Motivationsschreiben.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 Sehr geehrte Frau Muster") };

const ready = (page) => page.getByRole("button", { name: "Bewerbung checken" }).waitFor({ timeout: 120000 });
const fill = async (page) => {
  await ready(page);
  await page.locator('input[type="file"]').setInputFiles(letter);
  await page.getByLabel("Firma").fill("Migros");
  await page.getByLabel("Beruf / Lehrstelle").fill("Detailhandelsfachfrau EFZ");
  await page.getByRole("checkbox").check();
};
const submit = async (page) => { await fill(page); await page.getByRole("button", { name: "Bewerbung checken" }).click(); };

const SHOTS = [
  { name: "01-leer", prepare: ready },
  { name: "02-ausgefuellt", prepare: fill },
  { name: "03-fehler", prepare: async (page) => { await ready(page); await page.getByRole("button", { name: "Bewerbung checken" }).click(); await page.waitForTimeout(300); } },
  { name: "04-laedt", fullPage: false, prepare: async (page) => { await submit(page); await page.getByTestId("ai-review-loading").waitFor(); await page.waitForTimeout(500); } },
  { name: "05-ergebnis", prepare: async (page) => { await submit(page); await page.getByTestId("ai-review-result").waitFor(); await page.getByTestId("ai-review-history").locator("li").first().waitFor(); await page.waitForTimeout(800); } },
  { name: "06-aus-bewerbung", path: "/bewerbung-check?application=a1", prepare: async (page) => { await ready(page); await page.getByText("Schon ausgefüllt").waitFor(); await page.waitForTimeout(300); } },
  { name: "07-detail-link", path: "/applications/a1", prepare: async (page) => { await page.getByTestId("ai-review-link").waitFor({ timeout: 120000 }); await page.waitForTimeout(500); } },
  { name: "08-dokumente", path: "/cvs", prepare: async (page) => { await page.getByText("Bewerbung checken lassen").waitFor({ timeout: 120000 }); await page.waitForTimeout(500); } },
];

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const log = [];
for (const theme of ["light", "dark"]) for (const size of SIZES) for (const shot of SHOTS) {
  if (ONLY && !ONLY.some((key) => shot.name.includes(key))) continue;
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: size.mobile, isMobile: size.mobile, colorScheme: theme, deviceScaleFactor: size.mobile ? 2 : 1 });
  await ctx.addInitScript((value) => localStorage.setItem("wendapply-theme", value), theme);
  await createMockSupabase({ apps, profile }).install(ctx);
  ctx.setDefaultTimeout(60000);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message.slice(0, 160)));
  const file = `${OUT}${shot.name}-${size.name}-${theme}.png`;
  try {
    await page.goto(BASE + (shot.path ?? "/bewerbung-check"), { waitUntil: "load" });
    await shot.prepare(page);
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
    // small touch targets (< 44 px) among visible buttons/links/inputs inside main
    const small = await page.evaluate(() => [...document.querySelectorAll("main button, main a, main input[type=checkbox]")]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; })
      .filter((el) => { const r = el.getBoundingClientRect(); return el.type === "checkbox" ? r.height < 24 : r.height < 44; })
      .map((el) => `${el.tagName.toLowerCase()}:${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}(${Math.round(el.getBoundingClientRect().height)})`));
    const fullPage = shot.fullPage !== false;
    if (fullPage && size.mobile) {
      const height = await page.evaluate(() => document.scrollingElement.scrollHeight);
      await page.setViewportSize({ width: size.width, height: Math.min(Math.max(height, size.height), 4000) });
      await page.waitForTimeout(300);
      await page.screenshot({ path: file });
    } else await page.screenshot({ path: file, fullPage });
    log.push(`${shot.name} ${size.name} ${theme} overflowX=${overflow}${small.length && size.mobile ? ` small=${small.join(",")}` : ""}${errors.length ? " ERR " + errors[0] : ""}`);
  } catch (error) { log.push(`${shot.name} ${size.name} ${theme} FAILED ${String(error.message).slice(0, 200)}`); }
  await ctx.close();
}
await browser.close();
console.log(log.join("\n"));
