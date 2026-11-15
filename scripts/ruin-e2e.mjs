// Headless check of the burnt house (rejected application) against a stubbed Supabase (nothing real is touched).
// Usage: start `next dev -p 3158` with NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy, then
//   PLAYWRIGHT=<path to playwright-core/index.mjs> CHROME=<chrome binary> node scripts/ruin-e2e.mjs
const { chromium } = await import(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || "http://localhost:3158";
const OUT = process.env.OUT || "docs/shop-v2/shots/ruin/";
const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "s@x.ch", user_metadata: { role: "student" }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user };
const statuses = ["rejected", "offer", "applied", "interview", "withdrawn", "saved"];
const companies = ["Kantonalbank", "Swisscom", "Migros", "SBB", "Post", "Coop"];
const makeApps = (first) => statuses.map((status, i) => ({ id: "a" + i, user_id: "u1", company: companies[i], position: "Kaufmann/-frau EFZ", location: "Zürich", status: i === 0 ? first : status, category: "kv", currency: "CHF", deadline: null, created_at: `2026-09-0${i + 1}`, updated_at: "2026-10-01", notes: "", job_url: "" }));
const failures = [];
const check = (ok, message) => { console.log(ok ? "  ok  " : "  FAIL", message); if (!ok) failures.push(message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run(name, vp, { reduced = false } = {}) {
  const mobile = vp.w < 700;
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: mobile, isMobile: mobile, reducedMotion: reduced ? "reduce" : "no-preference", deviceScaleFactor: 2 });
  await ctx.addInitScript((s) => { localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)); localStorage.setItem("wendapply:palace-seen:a1", "1"); }, session);
  const db = { apps: makeApps("rejected") };
  await ctx.route("**://localhost:54321/**", async (route) => {
    const url = new URL(route.request().url()); const method = route.request().method(); const p = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "content-range": "0-0/*" }, body: JSON.stringify(body) });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (p.startsWith("/auth/v1/user")) return json(user);
    if (p.startsWith("/auth/v1/token")) return json(session);
    if (p === "/rest/v1/applications") return json(db.apps);
    if (p.startsWith("/rest/v1/rpc/")) {
      const rpc = p.split("/").pop();
      if (rpc === "map_shop_state") return json({ balance: 500, earned: 500, rewardCount: 6, items: [], layouts: [] });
      if (rpc === "map_islands_state") return json({ unlocked: 1 });
      return json([]);
    }
    return json([]);
  });
  ctx.setDefaultTimeout(180000);
  const page = await ctx.newPage(); const logs = [];
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message.slice(0, 200)));
  console.log(name);
  await page.goto(BASE + "/map"); await page.waitForSelector("canvas", { timeout: 120000 });
  const host = page.locator("[role=region]").first();
  await page.waitForFunction(() => document.querySelector("[role=region]")?.__map?.house("a0"), null, { timeout: 60000 });
  await sleep(2500);
  await page.screenshot({ path: `${OUT}${name}-1-village.png`, timeout: 180000 });
  // Zoom in on the ruin with the wheel (desktop) so the details are visible.
  const at = await host.evaluate((h) => { const p = h.__map.house("a0"); return h.__map.project(p.x, p.z); });
  if (!mobile) { await page.mouse.move(at.x, at.y); for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -240); await sleep(250); } await sleep(1500); }
  const near = await host.evaluate((h) => { const p = h.__map.house("a0"); return h.__map.project(p.x, p.z); });
  const clipSize = mobile ? 300 : 520;
  const clip = { x: Math.max(0, near.x - clipSize / 2), y: Math.max(0, near.y - clipSize * 0.7), width: clipSize, height: clipSize };
  await page.screenshot({ path: `${OUT}${name}-2-ruin-close.png`, clip, timeout: 180000 });
  if (!reduced) { await sleep(700); await page.screenshot({ path: `${OUT}${name}-3-ruin-close-later.png`, clip, timeout: 180000 }); }
  const label = await page.locator("[data-building=a0]").innerText().catch(() => "");
  check(label.includes("Kantonalbank"), "ruin keeps its readable company label: " + JSON.stringify(label));
  // Status changes away from Absage → normal house again (purely data-driven).
  db.apps = makeApps("interview");
  await page.reload(); await page.waitForSelector("canvas");
  await page.waitForFunction(() => document.querySelector("[role=region]")?.__map?.house("a0"), null, { timeout: 60000 });
  await sleep(2500);
  const back = await host.evaluate((h) => { const p = h.__map.house("a0"); return h.__map.project(p.x, p.z); });
  await page.screenshot({ path: `${OUT}${name}-4-status-back-house.png`, clip: { ...clip, x: Math.max(0, back.x - clipSize / 2), y: Math.max(0, back.y - clipSize * 0.7) }, timeout: 180000 });
  check(logs.length === 0, "no page errors " + JSON.stringify(logs.slice(0, 3)));
  await browser.close();
}
await run("1280", { w: 1280, h: 800 });
await run("375", { w: 375, h: 812 });
await run("375-reduced", { w: 375, h: 812 }, { reduced: true });
if (failures.length) { console.log("FAILED:", failures); process.exit(1); }
console.log("all ruin checks passed");
