// PWA QA for WendApply (see docs/pwa/QA.md). Usage: node scripts/pwa-qa.mjs <baseUrl> <outDir>
// Needs playwright-core (not a project dependency: install it in a temp folder and run from there) and Google Chrome.
import { chromium } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.argv[2] || "http://localhost:3193";
const OUT = process.argv[3] || "/tmp/pwa-qa-tools/out";
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (name, pass, detail = "") => { results.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " – " + detail : ""}`); };

function pngSize(buf) { return buf.slice(1, 4).toString() === "PNG" ? `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}` : null; }

// (a) manifest + icons
const man = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
ok("manifest: name/start_url/display/scope", !!(man.name && man.start_url && man.display === "standalone" && man.scope), `${man.name}, ${man.start_url}, ${man.display}`);
const iconTargets = [
  ...man.icons.map((i) => ({ src: i.src, want: i.sizes, purpose: i.purpose })),
  { src: "/icons/apple-touch-icon.png", want: "180x180", purpose: "apple-touch" },
];
for (const t of iconTargets) {
  const r = await fetch(BASE + t.src);
  const size = pngSize(Buffer.from(await r.arrayBuffer()));
  ok(`icon ${t.src} (${t.purpose})`, r.status === 200 && size === t.want, `HTTP ${r.status}, ${size}`);
}
ok("manifest has maskable icon", man.icons.some((i) => i.purpose?.includes("maskable")));

// (e) push handlers in sw.js
const sw = await (await fetch(`${BASE}/sw.js`)).text();
ok("sw.js has push + notificationclick handlers", sw.includes('addEventListener("push"') && sw.includes('addEventListener("notificationclick"'));

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pwa-qa-"));
const ctx = await chromium.launchPersistentContext(userDataDir, { channel: "chrome", headless: true, viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
const page = ctx.pages()[0] || (await ctx.newPage());
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`${page.url()}: ${m.text()}`); });
page.on("pageerror", (e) => consoleErrors.push(`${page.url()}: pageerror ${e.message}`));

// (c) SW registers
await page.goto(`${BASE}/anleitung`, { waitUntil: "networkidle" });
ok("/anleitung public (no login redirect)", new URL(page.url()).pathname === "/anleitung", page.url());
const reg = await page.evaluate(async () => { const r = await Promise.race([navigator.serviceWorker.ready, new Promise((res) => setTimeout(() => res(null), 15000))]); return r ? { scope: r.scope, active: !!r.active } : null; });
ok("service worker registers and activates", !!reg?.active, JSON.stringify(reg));
await page.reload({ waitUntil: "networkidle" });
ok("SW controls /anleitung", await page.evaluate(() => !!navigator.serviceWorker.controller));

// (b) installability
const cdp = await ctx.newCDPSession(page);
for (const p of ["/", "/anleitung"]) {
  await page.goto(BASE + p, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  ok(`installability errors on ${p}`, installabilityErrors.length === 0, JSON.stringify(installabilityErrors));
}

await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
const dashUrl = page.url();
ok("SW controls /dashboard", await page.evaluate(() => !!navigator.serviceWorker.controller), `landed on ${dashUrl}`);

// visit a few pages so the page cache has entries, then go offline
for (const p of ["/anleitung", "/"]) await page.goto(BASE + p, { waitUntil: "networkidle" });
await ctx.setOffline(true);
await page.goto(`${BASE}/anleitung`, { waitUntil: "domcontentloaded" }).catch((e) => e);
const offAnl = await page.evaluate(() => ({ title: document.title, h1: document.querySelector("h1")?.textContent || "" }));
ok("offline reload /anleitung serves cached page", /anleitung|WendApply/i.test(offAnl.title + offAnl.h1) && !/offline/i.test(offAnl.title), JSON.stringify(offAnl));
await page.goto(`${BASE}/impressum`, { waitUntil: "domcontentloaded" }).catch((e) => e);
const offNew = await page.evaluate(() => ({ title: document.title, text: document.body.innerText.slice(0, 120) }));
ok("offline uncached page shows offline.html", /offline/i.test(offNew.title + offNew.text), JSON.stringify(offNew));
await ctx.setOffline(false);

// (d) cache contents
await page.goto(`${BASE}/anleitung`, { waitUntil: "networkidle" });
const cacheDump = await page.evaluate(async () => { const out = {}; for (const n of await caches.keys()) out[n] = (await (await caches.open(n)).keys()).map((r) => r.url); return out; });
fs.writeFileSync(path.join(OUT, "cache-dump.json"), JSON.stringify(cacheDump, null, 2));
const all = Object.values(cacheDump).flat();
const bad = all.filter((u) => /supabase\.co/.test(u) || /\/api\//.test(new URL(u).pathname) || /^\/auth\//.test(new URL(u).pathname));
ok("caches contain no *.supabase.co, /api/, /auth/ entries", bad.length === 0, `${all.length} entries in ${Object.keys(cacheDump).length} caches${bad.length ? "; bad: " + bad.join(", ") : ""}`);
await ctx.close();

// (f) responsive light/dark
const b = await chromium.launch({ channel: "chrome", headless: true });
for (const width of [375, 1280]) for (const scheme of ["light", "dark"]) {
  const c = await b.newContext({ viewport: { width, height: width < 600 ? 812 : 900 }, colorScheme: scheme, serviceWorkers: "block" });
  const pg = await c.newPage();
  const errs = [];
  pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  pg.on("pageerror", (e) => errs.push(e.message));
  await pg.goto(`${BASE}/anleitung`, { waitUntil: "networkidle" });
  const info = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, theme: document.documentElement.getAttribute("data-theme") || "light", path: location.pathname }));
  await pg.screenshot({ path: path.join(OUT, `anleitung-${width}-${scheme}.png`) });
  ok(`/anleitung ${width}px ${scheme}: no overflow, no console errors`, info.sw <= info.iw && errs.length === 0 && info.path === "/anleitung" && (scheme === "light" || info.theme === "dark"), `scrollWidth ${info.sw}/${info.iw}, theme ${info.theme}${errs.length ? ", errors: " + errs.join(" | ") : ""}`);
  await c.close();
}
await b.close();

ok("no console errors during SW/offline flow (excluding expected offline net errors)", consoleErrors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to load resource|Failed to fetch/i.test(e)).length === 0, consoleErrors.slice(0, 5).join(" | "));
fs.writeFileSync(path.join(OUT, "qa-results.json"), JSON.stringify({ base: BASE, date: new Date().toISOString(), results }, null, 2));
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
