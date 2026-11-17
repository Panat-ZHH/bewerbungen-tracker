// Calm-design audit: screenshots + rendered "loudness" counts of the logged-in app, against the Supabase stub (nothing real is touched).
// Start the dev server with the stub URL first:
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=stub npx next dev -p 3201
// Run: PLAYWRIGHT=… CHROME=… OUT=<dir> node scripts/design-calm-audit.mjs   → <dir>/*.png + <dir>/counts.json
import { mkdirSync, writeFileSync } from "node:fs";
import { BASE, installStub, launch, newCtx } from "./ux-v2-stub.mjs";

const OUT = process.env.OUT || "/tmp/design-calm-audit";
mkdirSync(OUT, { recursive: true });

const SCREENS = [
  ["dashboard", "/dashboard", "student"],
  ["search", "/search", "student"],
  ["applications", "/applications", "student"],
  ["application-new", "/applications/new", "student"],
  ["application-detail", "/applications/a1", "student"],
  ["cvs", "/cvs", "student"],
  ["friends", "/friends", "student"],
  ["classes", "/classes", "student"],
  ["analytics", "/analytics", "student"],
  ["profile", "/profile", "student"],
  ["settings", "/settings", "student"],
  ["familie", "/familie", "student"],
  ["teacher", "/teacher", "teacher"],
  ["teacher-class", "/teacher/classes/c1", "teacher"],
];
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const VIEWPORTS = [["mobile", 390, 844], ["desktop", 1280, 860]];

/** Runs in the page: counts what makes a screen loud. */
function measure() {
  const probe = document.createElement("span");
  document.body.appendChild(probe);
  const rgb = (v) => { probe.style.color = `var(${v})`; return getComputedStyle(probe).color; };
  const ink = rgb("--ink"), fill = rgb("--outline-fill");
  const accents = { sun: rgb("--sun"), coral: rgb("--coral"), mint: rgb("--mint"), brand: rgb("--brand") };
  probe.remove();
  const out = { hardShadows: 0, inkOutlines: 0, accentFills: 0, accentKinds: [], primaryButtons: 0, h1: document.querySelectorAll("main h1").length };
  const kinds = new Set();
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest("canvas, svg, [aria-hidden='true'], .sr-only")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none") continue;
    if (s.boxShadow !== "none" && s.boxShadow.split(/,(?![^(]*\))/).some((part) => !/inset/.test(part) && /(-?\d+(\.\d+)?)px (-?\d+(\.\d+)?)px 0px/.test(part) && !/ 0px 0px 0px/.test(part.replace(/rgba?\([^)]*\)/, "")))) out.hardShadows++;
    const sides = ["Top", "Right", "Bottom", "Left"].filter((side) => parseFloat(s[`border${side}Width`]) >= 1 && [ink, fill].includes(s[`border${side}Color`]) && s[`border${side}Style`] !== "none");
    if (sides.length >= 3) out.inkOutlines++;
    const accent = Object.entries(accents).find(([, c]) => s.backgroundColor === c);
    if (accent) { out.accentFills++; kinds.add(accent[0]); }
    if ((el.tagName === "BUTTON" || el.tagName === "A") && el.closest("main") && (accent?.[0] === "brand" || accent?.[0] === "sun")) out.primaryButtons++;
  }
  out.accentKinds = [...kinds].sort();
  return out;
}

const browser = await launch();
const results = {};
try {
  for (const [name, path, role] of SCREENS) {
    if (ONLY && !ONLY.includes(name)) continue;
    for (const [vp, w, h] of VIEWPORTS) {
      for (const dark of vp === "mobile" && process.env.DARK ? [false, true] : [false]) {
        const ctx = await newCtx(browser, { w, h, dark });
        await installStub(ctx, { role });
        const page = await ctx.newPage();
        try {
          await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
          await page.waitForSelector("main#main", { timeout: 45000 });
          await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
          await page.waitForTimeout(900);
          const key = `${name}-${vp}${dark ? "-dark" : ""}`;
          results[key] = { path, ...(await page.evaluate(measure)) };
          await page.screenshot({ path: `${OUT}/${key}.png`, fullPage: true });
          console.log(key, JSON.stringify(results[key]));
        } catch (error) {
          console.log(name, vp, "FAILED", error.message.split("\n")[0]);
        } finally { await ctx.close(); }
      }
    }
  }
} finally { await browser.close(); }
writeFileSync(`${OUT}/counts.json`, JSON.stringify(results, null, 2));
