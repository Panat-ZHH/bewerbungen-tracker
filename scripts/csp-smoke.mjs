// CSP smoke test (security audit 2026-11-17): loads public pages of a running build and fails on any
// Content-Security-Policy violation, so the new headers (lib/security-headers.ts) never silently break the app.
// Usage: npm run build && npx next start -p 3917, then
//   PLAYWRIGHT=<path to playwright-core/index.mjs> CHROME=<chrome binary> BASE=http://localhost:3917 node scripts/csp-smoke.mjs
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || "http://localhost:3917";
const PAGES = ["/", "/preise", "/familien", "/schulen", "/login", "/familie", "/dashboard", "/bewerbung-check", "/anleitung", "/datenschutz", "/impressum", "/hilfe"];

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const problems = [];
try {
  for (const path of PAGES) {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP-VIOLATION ${e.violatedDirective} ${e.blockedURI}`));
    });
    page.on("console", (m) => { if (/CSP-VIOLATION|Content Security Policy/i.test(m.text())) problems.push(`${path}: ${m.text()}`); });
    const res = await page.goto(BASE + path, { waitUntil: "networkidle" });
    assert.ok(res && res.status() < 500, `${path} -> ${res?.status()}`);
    assert.ok(res.headers()["content-security-policy"], `${path} has no CSP header`);
    assert.equal(res.headers()["x-frame-options"], "DENY");
    const hydrated = await page.evaluate(() => document.querySelectorAll("script").length > 0 && document.body.innerText.trim().length > 0);
    assert.ok(hydrated, `${path} rendered nothing`);
    await page.close();
    console.log(`ok ${path}`);
  }
} finally {
  await browser.close();
}
assert.deepEqual(problems, [], `CSP violations:\n${problems.join("\n")}`);
console.log(`CSP smoke: ${PAGES.length} pages, 0 violations`);
