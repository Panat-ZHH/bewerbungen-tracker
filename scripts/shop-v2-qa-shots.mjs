// QA screenshots + layout measurements for shop v2 (cars, e-scooters, palace) against a stubbed Supabase (nothing real is touched).
// Start the app with NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy (next dev or build + start), then:
//   PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome binary> BASE=http://localhost:3291 node scripts/shop-v2-qa-shots.mjs
// Writes PNGs to docs/shop-v2/shots/qa/ and a JSON with measurements (touch targets, text overflow, console errors).
import { writeFileSync, mkdirSync } from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || "http://localhost:3291";
const OUT = process.env.OUT || "docs/shop-v2/shots/qa/";
mkdirSync(OUT, { recursive: true });
const { shopCatalog } = await import("../lib/map-shop.ts");
const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "s@x.ch", user_metadata: { role: "student" }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user };
const app = (i, status, company = "Firma " + i) => ({ id: "a" + i, user_id: "u1", company, position: "Kaufmann/-frau EFZ", location: "Zürich", status, category: "kv", currency: "CHF", deadline: null, created_at: `2026-09-0${i + 1}`, updated_at: "2026-10-01", notes: "", job_url: "" });
const cars = Object.keys(shopCatalog).filter((t) => t.startsWith("car_"));
const scooters = Object.keys(shopCatalog).filter((t) => t.startsWith("scooter_"));
const showroom = [
  ...cars.map((t, i) => ({ id: `c${i}`, itemType: t, x: -9 + (i % 4) * 3, z: i < 4 ? -3 : -1, rotation: 0, createdAt: "" })),
  ...scooters.map((t, i) => ({ id: `s${i}`, itemType: t, x: -10 + i * 2, z: 1, rotation: 0, createdAt: "" })),
];
const report = { measurements: {}, errors: {} };
const viewports = { 375: { w: 375, h: 812 }, 768: { w: 768, h: 1024 }, 1280: { w: 1280, h: 800 } };

async function open(browser, vpKey, { dark = false, reduced = false, noTouch = false, items = [], db = { apps: [app(0, "applied"), app(1, "interview"), app(2, "saved")] } } = {}) {
  const vp = viewports[vpKey]; const mobile = vp.w < 700;
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: !noTouch && vp.w < 1000, isMobile: !noTouch && mobile, colorScheme: dark ? "dark" : "light", reducedMotion: reduced ? "reduce" : "no-preference" });
  await ctx.addInitScript(([s, d]) => { localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)); if (d) localStorage.setItem("theme", "dark"); }, [session, dark]);
  const st = { balance: 6000, earned: 6000, rewardCount: 60, items: structuredClone(items), layouts: [] };
  await ctx.route("**://localhost:54321/**", async (route) => {
    const url = new URL(route.request().url()); const method = route.request().method(); const p = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "content-range": "0-0/*" }, body: JSON.stringify(body) });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (p.startsWith("/auth/v1/user")) return json(user);
    if (p.startsWith("/auth/v1/token")) return json(session);
    if (p === "/rest/v1/applications") return json(db.apps);
    if (p === "/rest/v1/map_shop_catalog") return json(Object.keys(shopCatalog).map((item_type) => ({ item_type })));
    if (p.startsWith("/rest/v1/rpc/")) {
      const rpc = p.split("/").pop();
      if (rpc === "map_shop_state") return json(st);
      if (rpc === "map_islands_state") return json({ unlocked: 1 });
      return json([]);
    }
    return json([]);
  });
  ctx.setDefaultTimeout(120000);
  const page = await ctx.newPage(); const logs = [];
  page.on("console", (m) => { if (m.type() === "error") logs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message.slice(0, 200)));
  await page.goto(BASE + "/map"); await page.waitForSelector("[data-map-renderer]", { timeout: 120000 }); await page.waitForTimeout(3000);
  const shot = (n) => page.screenshot({ path: `${OUT}${n}.png`, timeout: 180000 });
  const openShop = async () => { await page.locator("button", { has: page.locator("svg.lucide-shopping-bag") }).first().click(); await page.waitForTimeout(700); };
  return { ctx, page, logs, shot, openShop, db, mobile };
}

/** Zoom in n steps (with no applications the camera starts on the empty first island, where the showroom is placed). */
async function focus(page, x, z, zoomSteps) {
  const host = page.locator("[data-map-renderer]").first();
  const box = await host.boundingBox();
  for (let i = 0; i < zoomSteps; i++) { const b = page.getByRole("button", { name: "Vergrössern" }); if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(350); } }
  await page.waitForTimeout(800);
}

async function measureShop(page, key) {
  report.measurements[key] = await page.evaluate(() => {
    const shop = document.querySelector('[aria-labelledby="map-shop-title"]');
    if (!shop) return { missing: true };
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const small = [...shop.querySelectorAll("button")].filter(vis).map((b) => { const r = b.getBoundingClientRect(); return { label: (b.getAttribute("aria-label") || b.innerText).trim().slice(0, 50), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((b) => b.w < 44 || b.h < 44);
    const overflow = [...shop.querySelectorAll("h3, button, [class*=rarity], [class*=price]")].filter(vis).filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.innerText.trim().slice(0, 40));
    const r = shop.getBoundingClientRect();
    const list = shop.querySelector("[data-item]")?.parentElement?.getBoundingClientRect();
    return { panel: { top: Math.round(r.top), height: Math.round(r.height), width: Math.round(r.width) }, listVisibleHeight: list ? Math.round(Math.min(list.bottom, r.bottom) - Math.max(list.top, r.top)) : null, smallTargets: small, textOverflow: overflow, pageOverflowX: document.documentElement.scrollWidth > window.innerWidth };
  });
}

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const done = async (key, o) => { report.errors[key] = o.logs.filter((l) => !/favicon|Failed to load resource.*(404|400)/.test(l)); await o.ctx.close(); console.log("done", key, report.errors[key].length, "errors"); };
try {
  const only = process.env.ONLY;
  // 1. Shop: Autos + E-Roller at 3 widths, light and dark
  if (!only || only === "shop") for (const vp of ["375", "768", "1280"]) for (const dark of [false, true]) {
    const tag = `shop-${vp}${dark ? "-dark" : ""}`;
    const o = await open(browser, vp, { dark });
    await o.openShop();
    const tabs = o.page.getByRole("group", { name: "Kategorie" });
    await o.shot(`${tag}-1-alle`);
    await tabs.getByRole("button", { name: /Autos/ }).click(); await o.page.waitForTimeout(800);
    await measureShop(o.page, tag + "-autos");
    await o.shot(`${tag}-2-autos`);
    // scroll the list to the legendary cars
    await o.page.locator('[data-item="car_bugatti"]').scrollIntoViewIfNeeded(); await o.page.waitForTimeout(400);
    await o.shot(`${tag}-3-autos-legendaer`);
    await tabs.getByRole("button", { name: /E-Roller/ }).click(); await o.page.waitForTimeout(800);
    await measureShop(o.page, tag + "-scooter");
    await o.shot(`${tag}-4-e-roller`);
    await done(tag, o);
  }
  // 2. Placed cars + scooters on the map (close-up)
  if (!only || only === "placed") for (const vp of ["375", "768", "1280"]) for (const dark of vp === "768" ? [false] : [false, true]) {
    const tag = `placed-${vp}${dark ? "-dark" : ""}`;
    // mouse drag pans the camera only without touch emulation (layout is identical at the same width)
    const o = await open(browser, vp, { dark, noTouch: true, items: showroom, db: { apps: [] } });
    await focus(o.page, -4, -1, vp === "375" ? 2 : 3);
    await o.shot(`${tag}-showroom`);
    await done(tag, o);
  }
  // 3. Palace: 768 light + 1280 dark (375/1280 light + reduced motion are covered by scripts/palace-e2e.mjs)
  if (!only || only === "palace") for (const [vp, dark] of [["768", false], ["1280", true], ["375", true]]) {
    const tag = `palace-${vp}${dark ? "-dark" : ""}`;
    const db = { apps: [app(0, "offer", "Kantonalbank"), app(1, "applied", "Swisscom"), app(2, "interview", "Migros")] };
    const o = await open(browser, vp, { dark, db });
    await o.page.waitForTimeout(2500);
    await o.shot(`${tag}-1-celebration`);
    const btn = o.page.getByRole("button", { name: /Super, weiter/ });
    const r = await btn.boundingBox().catch(() => null);
    report.measurements[tag + "-celebration-button"] = r && { w: Math.round(r.width), h: Math.round(r.height) };
    if (r) { await btn.click(); await o.page.waitForTimeout(800); }
    await o.shot(`${tag}-2-palace`);
    db.apps[0].status = "interview";
    await o.page.reload(); await o.page.waitForSelector("[data-map-renderer]"); await o.page.waitForTimeout(3500);
    await o.shot(`${tag}-3-back-to-house`);
    await done(tag, o);
  }
} finally {
  await browser.close();
  if (!process.env.ONLY) writeFileSync(`${OUT}qa-measurements.json`, JSON.stringify(report, null, 2));
}
