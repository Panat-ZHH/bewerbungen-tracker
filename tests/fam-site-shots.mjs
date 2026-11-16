// Screenshots + axe check + horizontal-overflow check for the public Familien page (+ Preise, Hilfe) (no login, no Supabase needed).
// Usage: PLAYWRIGHT=/path/to/playwright-core/index.mjs AXE=/path/to/axe-core/axe.min.js CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" BASE=http://localhost:3477 node tests/b2b-site-shots.mjs
import { mkdirSync, readFileSync } from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || "http://localhost:3477";
const OUT = process.env.OUT || new URL("../docs/family/shots/", import.meta.url).pathname;
const axeSrc = process.env.AXE ? readFileSync(process.env.AXE, "utf8") : null;
mkdirSync(OUT, { recursive: true });

const pages = [["familien", "/familien"], ["preise", "/preise"], ["hilfe", "/hilfe"]];
const views = [["mobile", { width: 375, height: 812 }], ["desktop", { width: 1366, height: 900 }]];
const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true });
let problems = 0;
for (const theme of ["light", "dark"]) {
  for (const [vname, viewport] of views) {
    const ctx = await browser.newContext({ viewport, colorScheme: theme, deviceScaleFactor: 1, serviceWorkers: "block" });
    await ctx.addInitScript((t) => { try { localStorage.setItem("wendapply-theme", t); localStorage.setItem("wendapply-install-hint-dismissed", "1"); } catch {} }, theme);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const [name, path] of pages) {
      await page.goto(BASE + path, { waitUntil: "networkidle" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) { problems++; console.log(`OVERFLOW ${theme} ${vname} ${path}: ${overflow}px`); }
      // clipped content (overflow-x-clip hides real overflow from scrollWidth): text elements whose box ends past the viewport
      const clipped = await page.evaluate(() => [...document.querySelectorAll("main h1, main h2, main h3, main p, main li, main a, main th, main td")]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1 && !el.closest("[role=region]"); })
        .slice(0, 3).map((el) => `${el.tagName} "${el.textContent.trim().slice(0, 40)}"`));
      if (clipped.length) { problems++; console.log(`CLIPPED ${theme} ${vname} ${path}:`, clipped); }
      // only one theme+viewport per page goes into the repo to keep it small; desktop light full page + mobile light/dark top
      const full = vname === "desktop" && theme === "light";
      if (full || vname === "mobile") await page.screenshot({ path: `${OUT}${name}-${vname}-${theme}.png`, fullPage: full || theme === "light" });
      if (axeSrc && vname === "desktop") {
        await page.addScriptTag({ content: axeSrc });
        const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0]?.target?.join(" ") })));
        for (const v of res) { problems++; console.log(`AXE ${theme} ${path}: ${v.id} (${v.impact}) x${v.n} e.g. ${v.sample}`); }
      }
    }
    if (errors.length) { problems += errors.length; console.log(`JS errors ${theme} ${vname}:`, errors); }
    await ctx.close();
  }
}
await browser.close();
console.log(problems ? `${problems} problem(s)` : "OK: no overflow, no axe violations, no JS errors");
process.exitCode = problems ? 1 : 0;
