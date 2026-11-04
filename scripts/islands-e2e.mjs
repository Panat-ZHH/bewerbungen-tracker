// Headless check of the islands feature against a stubbed Supabase (nothing real is touched).
// Usage: start `next dev --webpack -p 3142` with dummy env (NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321), then
//   PLAYWRIGHT=<path to playwright-core/index.mjs> CHROME=<chrome binary> node scripts/islands-e2e.mjs
const { chromium } = await import(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || "http://localhost:3142";
const OUT = process.env.OUT || `${process.env.HOME}/Projects/bewerbungen-tracker-wt/screenshots/map/`;
const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "s@x.ch", user_metadata: { role: "student" }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user };
const apps = Array.from({ length: 5 }, (_, i) => ({ id: "a" + i, user_id: "u1", company: "Firma " + i, position: "Job", location: "Bern", status: ["applied", "interview", "offer", "saved", "preparing"][i], category: "software", currency: "CHF", deadline: null, created_at: `2026-09-0${i + 1}`, updated_at: "2026-10-01", notes: "", job_url: "" }));

async function run(name, vp, balance) {
  const mobile = vp.w < 700;
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: mobile, isMobile: mobile });
  await ctx.addInitScript((s) => localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)), session);
  const st = { balance, earned: balance, rewardCount: balance / 100, items: [], layouts: [] };
  const db = { unlocked: 1, calls: [] };
  await ctx.route("**://localhost:54321/**", async (route) => {
    const url = new URL(route.request().url()); const method = route.request().method(); const p = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "content-range": "0-0/*" }, body: JSON.stringify(body) });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (p.startsWith("/auth/v1/user")) return json(user);
    if (p.startsWith("/auth/v1/token")) return json(session);
    if (p === "/rest/v1/applications") return json(apps);
    if (p.startsWith("/rest/v1/rpc/")) {
      const rpc = p.split("/").pop(); let body = {}; try { body = route.request().postDataJSON() || {}; } catch {}
      db.calls.push([rpc, body]);
      if (rpc === "map_shop_state") return json(st);
      if (rpc === "map_islands_state") return json({ unlocked: db.unlocked });
      if (rpc === "map_island_unlock") { const price = { 2: 600, 3: 1500, 4: 3000 }[body.p_island_no]; if (body.p_island_no === db.unlocked + 1 && st.balance >= price) { st.balance -= price; db.unlocked++; } return json({ unlocked: db.unlocked }); }
      return json([]);
    }
    return json([]);
  });
  ctx.setDefaultTimeout(180000);
  const page = await ctx.newPage(); const logs = [];
  page.on("console", (msg) => { if (msg.type() === "error") logs.push(msg.text().slice(0, 200)); });
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message.slice(0, 200)));
  await page.goto(BASE + "/map"); await page.waitForSelector("[data-map-renderer], canvas", { timeout: 90000 }); await page.waitForTimeout(2500);
  const shot = (n) => page.screenshot({ path: `${OUT}islands-${name}-${n}.png`, timeout: 180000 });
  await shot("1-before");
  const progress = await page.locator("[data-testid=island-progress]").innerText();
  const button = page.getByRole("button", { name: /Insel freischalten|Noch \d+ Punkte/ });
  const label = await button.innerText(); const disabled = await button.isDisabled();
  console.log(name, "progress:", progress.replace(/\s+/g, " "), "| button:", label, "| disabled:", disabled);
  if (!disabled) {
    await button.click(); await page.waitForTimeout(700); await shot("2-unlock-animation");
    await page.waitForTimeout(3800); await shot("3-new-island-bridge");
    console.log(name, "unlocked in db:", db.unlocked, "balance:", st.balance, "switcher:", await page.getByRole("group", { name: "Insel wählen" }).innerText());
    await page.getByRole("button", { name: /Heimatinsel/ }).click(); await page.waitForTimeout(2000); await shot("4-back-home");
    await page.getByRole("button", { name: /Ostinsel/ }).click(); await page.waitForTimeout(2000);
  }
  console.log(name, "console errors:", logs.slice(0, 5));
  await browser.close();
}
await run("desktop-poor", { w: 1440, h: 900 }, 300);
await run("desktop", { w: 1440, h: 900 }, 1000);
await run("mobile", { w: 390, h: 844 }, 1000);
