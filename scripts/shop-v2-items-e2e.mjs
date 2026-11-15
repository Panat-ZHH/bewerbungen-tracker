// Shop v2 (cars + e-scooters) check against a stubbed Supabase (nothing real is touched).
// Start `next dev -p 3191` with NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 and a dummy key, then:
//   PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome binary> BASE=http://localhost:3191 node scripts/shop-v2-items-e2e.mjs
const { chromium } = await import(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || "http://localhost:3191";
const OUT = process.env.OUT || "docs/shop-v2/shots/shop-items/";
const { shopCatalog } = await import("../lib/map-shop.ts");
const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "s@x.ch", user_metadata: { role: "student" }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user };
const apps = Array.from({ length: 3 }, (_, i) => ({ id: "a" + i, user_id: "u1", company: "Firma " + i, position: "Job", location: "Bern", status: "applied", category: "software", currency: "CHF", deadline: null, created_at: `2026-09-0${i + 1}`, updated_at: "2026-10-01", notes: "", job_url: "" }));
const oldTypes = ["road", "flowers", "tree", "bench", "fountain", "amusement_park"];
const results = [];
const check = (name, ok, info = "") => { results.push({ name, ok: !!ok, info }); console.log(ok ? "PASS" : "FAIL", name, info); };

/** catalogue: "full" (migration applied), "old" (only the 6 original rows), "unreadable" (select fails → buy decides). */
async function context(browser, vp, { catalogue = "full", items = [], balance = 3500, applications = apps } = {}) {
  const mobile = vp.w < 700;
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: mobile, isMobile: mobile });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("sb-localhost-auth-token")) localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)); }, session);
  const st = { balance, earned: balance, rewardCount: balance / 100, items, layouts: [] };
  const known = catalogue === "full" ? Object.keys(shopCatalog) : oldTypes;
  const calls = [];
  await ctx.route("**://localhost:54321/**", async (route) => {
    const url = new URL(route.request().url()); const method = route.request().method(); const p = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "content-range": "0-0/*" }, body: JSON.stringify(body) });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (p.startsWith("/auth/v1/user")) return json(user);
    if (p.startsWith("/auth/v1/token")) return json(session);
    if (p === "/rest/v1/applications") return json(applications);
    if (p === "/rest/v1/map_shop_catalog") return catalogue === "unreadable" ? json({ code: "42501", message: "permission denied" }, 403) : json(known.map((item_type) => ({ item_type })));
    if (p.startsWith("/rest/v1/rpc/")) {
      const rpc = p.split("/").pop(); let b = {}; try { b = route.request().postDataJSON() || {}; } catch {}
      calls.push([rpc, b]);
      if (rpc === "map_shop_state") return json(st);
      if (rpc === "map_shop_buy") {
        if (!known.includes(b.p_item_type)) return json({ code: "P0001", message: "INVALID_ITEM", details: null, hint: null }, 400);
        st.balance -= shopCatalog[b.p_item_type].price; st.items.push({ id: b.p_request_id, itemType: b.p_item_type, x: null, z: null, rotation: 0, createdAt: "2026-11-15" }); return json(st);
      }
      if (rpc === "map_shop_place") { const it = st.items.find((i) => i.id === b.p_item_id); it.x = b.p_x ?? null; it.z = b.p_z ?? null; it.rotation = b.p_rotation ?? 0; return json(st); }
      if (rpc === "map_islands_state") return json({ unlocked: 1 });
      return json([]);
    }
    return json([]);
  });
  ctx.setDefaultTimeout(90000);
  const page = await ctx.newPage(); const logs = [];
  page.on("console", (m) => { if (m.type() === "error") logs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message.slice(0, 200)));
  await page.goto(BASE + "/map"); await page.waitForSelector("[data-map-renderer]", { timeout: 90000 }); await page.waitForTimeout(2500);
  const openShop = async () => { await page.locator("button", { has: page.locator("svg.lucide-shopping-bag") }).first().click(); await page.waitForTimeout(600); };
  return { ctx, page, st, calls, logs, mobile, openShop };
}

const tools = (page) => page.locator('[aria-label="Gegenstand platzieren"]');
async function confirm(page) { const b = tools(page).locator("button", { hasText: "Platzieren" }); const ok = await b.isEnabled(); if (ok) { await b.click(); await page.waitForTimeout(800); } return ok; }

async function run(name, vp) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const shot = (page, n) => page.screenshot({ path: `${OUT}${name}-${n}.png`, timeout: 120000 });
  try {
    // 1. buy flow: tabs, rarity, buy + place + rotate + move a car, buy + place a scooter
    {
      const { ctx, page, st, logs, openShop } = await context(browser, vp);
      try {
        await openShop();
        const tabs = page.getByRole("group", { name: "Kategorie" });
        check(`${name}: category chips`, /Alle[\s\S]*Deko[\s\S]*Park[\s\S]*Autos[\s\S]*E-Roller/.test(await tabs.innerText()), (await tabs.innerText()).replace(/\s+/g, " "));
        await tabs.getByRole("button", { name: /Autos/ }).click(); await page.waitForTimeout(800);
        const names = await page.locator("[data-item] h3").allInnerTexts();
        check(`${name}: Autos tab lists 8 cars sorted by price`, names.length === 8 && names[0].startsWith("Porsche") && names[7].startsWith("Bugatti"), names.join(", "));
        check(`${name}: car previews rendered`, await page.locator('[data-item^="car_"] img').count() === 8);
        check(`${name}: rarity badges`, /Legendär/i.test(await page.locator('[data-item="car_bugatti"]').innerText()));
        await shot(page, "1-shop-autos");
        await page.getByRole("button", { name: /Ferrari-Sportwagen kaufen/ }).click(); await page.waitForTimeout(1000);
        check(`${name}: Ferrari bought, server price deducted`, st.balance === 1900 && st.items[0]?.itemType === "car_ferrari", `balance=${st.balance}`);
        await page.getByLabel("Position X").fill("20"); await page.getByLabel("Position Z").fill("0"); await page.waitForTimeout(300);
        await page.getByRole("button", { name: "Um 90 Grad drehen" }).click(); await page.waitForTimeout(300);
        check(`${name}: Ferrari placed rotated`, await confirm(page) && st.items[0].x === 20 && st.items[0].rotation === 1, JSON.stringify(st.items[0]));
        await shot(page, "2-ferrari-placed");
        if (!(await tabs.isVisible())) await openShop();
        await tabs.getByRole("button", { name: /E-Roller/ }).click(); await page.waitForTimeout(500);
        await shot(page, "3-shop-e-roller");
        await page.getByRole("button", { name: /Retro-E-Moped Himmelblau kaufen/ }).click(); await page.waitForTimeout(1000);
        await page.getByLabel("Position X").fill("22"); await page.getByLabel("Position Z").fill("0"); await page.waitForTimeout(300);
        check(`${name}: scooter placed`, await confirm(page) && st.items[1]?.x === 22, JSON.stringify(st.items[1]));
        // move the car (same flow as a drag drop: map_shop_place with a new position)
        const item = page.getByRole("button", { name: /Ferrari-Sportwagen #1/ }).locator("visible=true");
        if (!(await item.count())) await openShop();
        await item.first().click(); await page.waitForTimeout(300);
        await page.getByRole("button", { name: /Verschieben/ }).locator("visible=true").last().click(); await page.waitForTimeout(500);
        await page.getByLabel("Position X").fill("24"); await page.getByLabel("Position Z").fill("2"); await page.waitForTimeout(300);
        await page.getByRole("button", { name: "Um 90 Grad drehen" }).click(); await page.waitForTimeout(300);
        check(`${name}: car moved + rotated back`, await confirm(page) && st.items[0].x === 24 && st.items[0].rotation === 2, JSON.stringify(st.items[0]));
        const real = logs.filter((l) => !/favicon|Failed to load resource.*(404|400)/.test(l));
        check(`${name}: no console errors (buy flow)`, real.length === 0, JSON.stringify(real.slice(0, 4)));
      } finally { await ctx.close(); }
    }
    // 2. showroom: every new vehicle placed, for a visual check of the 3D models on the map
    {
      const cars = Object.keys(shopCatalog).filter((t) => t.startsWith("car_"));
      const scooters = Object.keys(shopCatalog).filter((t) => t.startsWith("scooter_"));
      const items = [
        ...cars.map((t, i) => ({ id: `c${i}`, itemType: t, x: (i % 4) * 3, z: i < 4 ? 0 : 1, rotation: 0, createdAt: "" })),
        ...scooters.map((t, i) => ({ id: `s${i}`, itemType: t, x: i, z: 5, rotation: 0, createdAt: "" })),
      ];
      const { ctx, page, logs } = await context(browser, vp, { items, applications: [apps[0]] });
      try {
        for (let i = 0; i < 2; i++) { const zoom = page.getByRole("button", { name: "Vergrössern" }); if (await zoom.isVisible().catch(() => false) && await zoom.isEnabled()) { await zoom.click(); await page.waitForTimeout(300); } }
        await page.waitForTimeout(1200);
        await shot(page, "4-showroom");
        const real = logs.filter((l) => !/favicon|Failed to load resource.*(404|400)/.test(l));
        check(`${name}: showroom renders without errors`, real.length === 0, JSON.stringify(real.slice(0, 4)));
      } finally { await ctx.close(); }
    }
    // 3. migration not applied yet: catalogue shows "Bald", and an unreadable catalogue falls back to the friendly buy error
    {
      const { ctx, page, openShop } = await context(browser, vp, { catalogue: "old" });
      try {
        await openShop();
        await page.getByRole("group", { name: "Kategorie" }).getByRole("button", { name: /Autos/ }).click(); await page.waitForTimeout(500);
        check(`${name}: cars marked 'Bald' before migration`, await page.getByRole("button", { name: /bald erhältlich/ }).count() === 8);
        await shot(page, "5-before-migration");
      } finally { await ctx.close(); }
    }
    {
      const { ctx, page, st, calls, openShop } = await context(browser, vp, { catalogue: "unreadable" });
      try {
        await openShop();
        await page.getByRole("group", { name: "Kategorie" }).getByRole("button", { name: /E-Roller/ }).click(); await page.waitForTimeout(500);
        await page.getByRole("button", { name: /Stadt-Roller Mint kaufen/ }).click(); await page.waitForTimeout(1000);
        const alert = await page.getByTestId("shop-hint").locator("visible=true").first().innerText().catch(() => "");
        check(`${name}: unknown item → friendly message, no points lost`, alert.includes("Dieses Modell ist bald erhältlich.") && st.balance === 3500 && calls.some(([rpc]) => rpc === "map_shop_buy"), alert);
        check(`${name}: item then shows 'Bald'`, await page.getByRole("button", { name: /Stadt-Roller Mint: bald erhältlich/ }).count() >= 1);
        await shot(page, "6-buy-fallback");
      } finally { await ctx.close(); }
    }
  } catch (e) { check(`${name}: script error`, false, String(e.stack).split("\n").slice(0, 4).join(" | ")); }
  await browser.close();
}
if (process.env.ONLY !== "mobile") await run("desktop-1280", { w: 1280, h: 800 });
if (process.env.ONLY !== "desktop") await run("mobile-375", { w: 375, h: 812 });
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
