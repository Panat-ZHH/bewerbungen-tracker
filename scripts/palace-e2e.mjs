// Headless check of the palace (shop-v2) against a stubbed Supabase (nothing real is touched).
// Usage: start `next dev -p 3157` with NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy, then
//   PLAYWRIGHT=<path to playwright-core/index.mjs> CHROME=<chrome binary> node scripts/palace-e2e.mjs
const { chromium } = await import(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || "http://localhost:3157";
const OUT = process.env.OUT || "docs/shop-v2/shots/palace/";
const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "s@x.ch", user_metadata: { role: "student" }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user };
const statuses = ["offer", "applied", "interview", "saved", "final_interview"];
const companies = ["Kantonalbank", "Swisscom", "Migros", "SBB", "Post"];
const makeApps = (first) => statuses.map((status, i) => ({ id: "a" + i, user_id: "u1", company: companies[i], position: "Kaufmann/-frau EFZ", location: "Zürich", status: i === 0 ? first : status, category: "kv", currency: "CHF", deadline: null, created_at: `2026-09-0${i + 1}`, updated_at: "2026-10-01", notes: "", job_url: "" }));
const failures = [];
const check = (ok, message) => { console.log(ok ? "  ok  " : "  FAIL", message); if (!ok) failures.push(message); };

async function run(name, vp, { reduced = false } = {}) {
  const mobile = vp.w < 700;
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: mobile, isMobile: mobile, reducedMotion: reduced ? "reduce" : "no-preference" });
  await ctx.addInitScript((s) => localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)), session);
  const db = { apps: makeApps("offer") };
  await ctx.route("**://localhost:54321/**", async (route) => {
    const url = new URL(route.request().url()); const method = route.request().method(); const p = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "content-range": "0-0/*" }, body: JSON.stringify(body) });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (p.startsWith("/auth/v1/user")) return json(user);
    if (p.startsWith("/auth/v1/token")) return json(session);
    if (p === "/rest/v1/applications") return json(db.apps);
    if (p.startsWith("/rest/v1/rpc/")) {
      const rpc = p.split("/").pop();
      if (rpc === "map_shop_state") return json({ balance: 500, earned: 500, rewardCount: 5, items: [], layouts: [] });
      if (rpc === "map_islands_state") return json({ unlocked: 1 });
      return json([]);
    }
    return json([]);
  });
  ctx.setDefaultTimeout(180000);
  const page = await ctx.newPage(); const logs = [];
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message.slice(0, 200)));
  const shot = (n) => page.screenshot({ path: `${OUT}${name}-${n}.png`, timeout: 180000 });
  console.log(name);
  await page.goto(BASE + "/map"); await page.waitForSelector("canvas", { timeout: 120000 });
  const overlay = page.getByTestId("palace-celebration");
  await overlay.waitFor({ timeout: 60000 });
  if (!reduced) await shot("1-camera-on-palace");
  await page.waitForTimeout(2200);
  await shot(reduced ? "1-celebration-reduced-motion" : "2-celebration");
  check((await overlay.innerText()).includes("Zusage! Dein Haus ist jetzt ein Palast."), "overlay text");
  check(await page.locator("[aria-live=polite]").filter({ has: overlay }).count() === 1, "overlay inside aria-live polite region");
  if (reduced) {
    const animation = await page.locator("[data-testid=palace-celebration] i").first().evaluate((el) => getComputedStyle(el).animationName);
    check(animation === "none", "no confetti animation with reduced motion");
  }
  await page.getByRole("button", { name: "Super, weiter" }).click();
  check(await overlay.count() === 0, "dismiss closes the overlay");
  check(await page.evaluate(() => localStorage.getItem("wendapply:palace-seen:a0")) === "1", "seen flag stored");
  await page.waitForTimeout(800);
  await shot(reduced ? "2-palace-reduced-motion" : "3-palace");
  // Reload: celebration does not come back.
  await page.reload(); await page.waitForSelector("canvas"); await page.waitForTimeout(3000);
  check(await overlay.count() === 0, "no second celebration after reload");
  if (!reduced) {
    // Status switched back to Bewerbungsgespräch: the palace becomes a normal house again.
    db.apps = makeApps("interview");
    await page.getByRole("button", { name: /Aktualisieren|Neu laden/ }).first().click().catch(async () => { await page.reload(); });
    await page.waitForTimeout(3000);
    const label = await page.locator("[data-building=a0]").innerText();
    check(!/Zusage/.test(label), "label no longer shows Zusage");
    check(await overlay.count() === 0, "no overlay after status change");
    await shot("4-status-back-house");
  }
  check(logs.length === 0, "no page errors " + JSON.stringify(logs.slice(0, 3)));
  await browser.close();
}
await run("1280", { w: 1280, h: 800 });
await run("375", { w: 375, h: 812 });
await run("375-reduced", { w: 375, h: 812 }, { reduced: true });
if (failures.length) { console.log("FAILED:", failures); process.exit(1); }
console.log("all palace checks passed");
