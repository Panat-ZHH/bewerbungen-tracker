// Integration check of map + houses + islands + Zusage against a stubbed Supabase (nothing real is touched).
// Start `next dev --webpack -p 3187` with dummy env, then:
//   PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome binary> BASE=http://localhost:3187 node scripts/map-integration-e2e.mjs
const { chromium } = await import(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || "http://localhost:3187";
const OUT = process.env.OUT || `${process.env.HOME}/Projects/bewerbungen-tracker-wt/screenshots/map/`;
const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "s@x.ch", user_metadata: { role: "student" }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user };
const sts = ["saved", "preparing", "applied", "interview", "offer", "rejected", "applied", "applied"];
const apps = Array.from({ length: 8 }, (_, i) => ({ id: "a" + i, user_id: "u1", company: "Firma " + i, position: "Job", location: "Bern", status: sts[i], category: "software", currency: "CHF", deadline: null, created_at: `2026-09-0${i + 1}`, updated_at: "2026-10-01", notes: "", job_url: "" }));
const results = [];
const check = (name, ok, info = "") => { results.push({ name, ok: !!ok, info }); console.log(ok ? "PASS" : "FAIL", name, info); };

async function run(name, vp) {
  const mobile = vp.w < 700;
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: mobile, isMobile: mobile });
  await ctx.addInitScript((s) => { if (!localStorage.getItem("sb-localhost-auth-token")) localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)); }, session);
  const st = { balance: 3500, earned: 3500, rewardCount: 35, items: [], layouts: [] };
  const db = { unlocked: 1, calls: [] };
  const price = { road: 20, flowers: 30, tree: 40, bench: 50, fountain: 150, amusement_park: 500 };
  await ctx.route("**://localhost:54321/**", async (route) => {
    const url = new URL(route.request().url()); const method = route.request().method(); const p = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "content-range": "0-0/*" }, body: JSON.stringify(body) });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (p.startsWith("/auth/v1/user")) return json(user);
    if (p.startsWith("/auth/v1/token")) return json(session);
    if (p === "/rest/v1/applications") return json(apps);
    if (p.startsWith("/rest/v1/rpc/")) {
      const rpc = p.split("/").pop(); let b = {}; try { b = route.request().postDataJSON() || {}; } catch {}
      db.calls.push([rpc, b]);
      if (rpc === "map_shop_state") return json(st);
      if (rpc === "map_shop_buy") { st.balance -= price[b.p_item_type]; st.items.push({ id: b.p_request_id, itemType: b.p_item_type, x: null, z: null, rotation: 0, createdAt: "2026-11-04" }); return json(st); }
      if (rpc === "map_shop_place") { const it = st.items.find((i) => i.id === b.p_item_id); it.x = b.p_x ?? null; it.z = b.p_z ?? null; it.rotation = b.p_rotation ?? 0; return json(st); }
      if (rpc === "map_move_object") { st.layouts = st.layouts.filter((l) => l.id !== b.p_object_id); st.layouts.push({ id: b.p_object_id, x: b.p_x, z: b.p_z, rotation: b.p_rotation }); return json(st); }
      if (rpc === "map_islands_state") return json({ unlocked: db.unlocked });
      if (rpc === "map_island_unlock") { const pr = { 2: 600, 3: 1500, 4: 3000 }[b.p_island_no]; if (b.p_island_no === db.unlocked + 1 && st.balance >= pr) { st.balance -= pr; db.unlocked++; } return json({ unlocked: db.unlocked }); }
      return json([]);
    }
    return json([]);
  });
  ctx.setDefaultTimeout(90000);
  const page = await ctx.newPage(); const logs = [];
  page.on("console", (m) => { if (m.type() === "error") logs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message.slice(0, 200)));
  const shot = (n) => page.screenshot({ path: `${OUT}final-${name}-${n}.png`, timeout: 120000 });
  const load = async () => { await page.goto(BASE + "/map"); await page.waitForSelector("[data-map-renderer]", { timeout: 90000 }); await page.waitForTimeout(2500); };
  const tools = () => page.locator('[aria-label="Gegenstand platzieren"]');
  const openItem = async () => {
    const item = page.getByRole("button", { name: /Zierbaum #1/ }).locator("visible=true");
    if (!(await item.count()) && mobile) { await page.getByRole("button", { name: /^Shop/ }).click(); await page.waitForTimeout(500); }
    await item.first().click(); await page.waitForTimeout(300);
  };
  const confirm = async () => { const b = tools().locator("button", { hasText: "Platzieren" }); const ok = await b.isEnabled(); if (ok) { await b.click(); await page.waitForTimeout(800); } return ok; };
  const hostLoc = () => page.locator("[role=region]").first();
  try {
    await load(); await shot("1-map");
    check(`${name}: map renders`, await page.locator("[data-map-renderer]").count() > 0, await page.getAttribute("[data-map-renderer]", "data-map-renderer"));
    // buy + place tree by click
    if (mobile) await page.getByRole("button", { name: /^Shop/ }).click();
    await page.getByRole("button", { name: /Zierbaum kaufen/ }).click(); await page.waitForTimeout(1000);
    await page.waitForTimeout(500); const box = await hostLoc().boundingBox();
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5); await page.waitForTimeout(500);
    check(`${name}: click-to-place sets a position`, /\d/.test(await tools().innerText()), (await tools().innerText()).replace(/\n/g, " "));
    await page.getByLabel("Position X").fill("6"); await page.getByLabel("Position Z").fill("-4"); await page.waitForTimeout(400);
    check(`${name}: tree placed on island 1`, await confirm() && st.items[0]?.x !== null, JSON.stringify(st.items[0]));
    await shot("2-tree-placed");
    // house move via dialog
    if (mobile) { await page.keyboard.press("Escape"); await page.waitForTimeout(500); }
    await page.locator('[data-building="a1"]').click(); await page.waitForTimeout(500);
    await page.getByRole("button", { name: /Haus verschieben/ }).first().click(); await page.waitForTimeout(600);
    await page.getByLabel("Position X").fill("20"); await page.getByLabel("Position Z").fill("2"); await page.waitForTimeout(400);
    check(`${name}: house moved`, await confirm() && st.layouts.length === 1, JSON.stringify(st.layouts));
    // remove (Einlagern) tree
    await openItem();
    // on phones the same action also exists behind the shop sheet; the sheet copy is last in the DOM
    await page.getByRole("button", { name: /Einlagern/ }).locator("visible=true").last().click(); await page.waitForTimeout(800);
    check(`${name}: item stored (removed from map)`, st.items[0].x === null);
    // unlock island 2
    if (mobile) { await page.keyboard.press("Escape"); await page.waitForTimeout(500); }
    const btn = page.getByRole("button", { name: /Insel freischalten|Noch \d+ Punkte/ });
    check(`${name}: unlock button enabled`, await btn.isEnabled(), await btn.innerText());
    await btn.click(); await page.waitForTimeout(700); await shot("3-unlock-animation");
    await page.waitForTimeout(3800); await shot("4-island2-bridge");
    check(`${name}: island 2 unlocked`, db.unlocked === 2 && st.balance === 2860, `unlocked=${db.unlocked} balance=${st.balance}`);
    // place tree on island 2
    await openItem();
    await page.getByRole("button", { name: /Platzieren/ }).locator("visible=true").last().click(); await page.waitForTimeout(600);
    await page.getByLabel("Position X").fill("45"); await page.getByLabel("Position Z").fill("2"); await page.waitForTimeout(400);
    const placedOk = await confirm();
    check(`${name}: item placed on new island`, placedOk && st.items[0].x === 45, JSON.stringify(st.items[0])); await shot("5-island2-item");
    // bridge cell rejected
    await openItem();
    await page.getByRole("button", { name: /Verschieben/ }).locator("visible=true").last().click(); await page.waitForTimeout(600);
    await page.getByLabel("Position X").fill("35"); await page.getByLabel("Position Z").fill("9"); await page.waitForTimeout(400);
    const bridgeBtn = tools().locator("button", { hasText: "Platzieren" });
    check(`${name}: bridge cell not placeable`, !(await bridgeBtn.isEnabled()));
    await page.getByRole("button", { name: "Platzierung abbrechen" }).click();
    // reload persistence
    await load(); await shot("6-after-reload");
    const prog = await page.locator("[data-testid=island-progress]").innerText();
    check(`${name}: reload keeps island + switcher`, (await page.getByRole("group", { name: "Insel wählen" }).innerText()).includes("Ostinsel"), prog.replace(/\s+/g, " "));
    await page.getByRole("button", { name: /Heimatinsel/ }).click(); await page.waitForTimeout(1800); await shot("7-home");
    await page.getByRole("button", { name: /Ostinsel/ }).click(); await page.waitForTimeout(1800);
    // Zusage in UI
    const mapText = await page.locator("body").innerText();
    check(`${name}: map text uses Zusage, no Angebot`, /Zusage/.test(mapText) && !/Angebot/.test(mapText));
    for (const route of ["/applications", "/dashboard", "/analytics"]) {
      await page.goto(BASE + route); await page.waitForTimeout(2500);
      const t = await page.locator("body").innerText();
      check(`${name}: ${route} shows Zusage, no Angebot`, /Zusage/.test(t) && !/Angebot/.test(t));
      if (route === "/applications") await shot("8-applications"); if (route === "/analytics") await shot("9-analytics");
    }
  } catch (e) { check(`${name}: script error`, false, String(e.stack).split("\n").slice(0, 4).join(" | ")); await shot("error").catch(() => {}); }
  const real = logs.filter((l) => !/favicon|Failed to load resource.*(404|400)/.test(l));
  check(`${name}: no console errors`, real.length === 0, JSON.stringify(real.slice(0, 4)));
  await browser.close();
}
if (process.env.ONLY !== "mobile") await run("desktop", { w: 1440, h: 900 });
if (process.env.ONLY !== "desktop") await run("mobile", { w: 390, h: 844 });
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
