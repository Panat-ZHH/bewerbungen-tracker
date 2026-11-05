// Headless check of the friend-request badge against a stubbed Supabase (nothing real is touched).
// Usage: `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy next dev --webpack -p 3193`, then
//   PLAYWRIGHT=<path to playwright-core/index.mjs> CHROME=<chrome binary> node scripts/friend-badge-e2e.mjs
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || "http://localhost:3193";
const OUT = process.env.OUT || `${process.env.HOME}/Projects/bewerbungen-tracker-wt/screenshots/friend-badge/`;
const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "anna@x.ch", user_metadata: { full_name: "Anna Keller", role: "student" }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user };
const conn = (id, state, name) => ({ id, other_user_id: "o" + id, display_name: name, avatar_seed: "x", role: "student", state, created_at: "2026-11-01T10:00:00Z" });

async function run(name, vp, dark) {
  const mobile = vp.w < 700;
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: mobile, isMobile: mobile, colorScheme: dark ? "dark" : "light" });
  await ctx.addInitScript(([s, d]) => { localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)); if (d) localStorage.setItem("wendapply-theme", "dark"); }, [session, dark]);
  const db = { list: [conn("1", "incoming", "Ben Meier"), conn("2", "incoming", "Cara Frei"), conn("3", "incoming", "Dino Rossi"), conn("4", "outgoing", "Eva Huber"), conn("5", "friend", "Finn Graf")], calls: 0 };
  await ctx.route("**://localhost:54321/**", async (route) => {
    const req = route.request(); const p = new URL(req.url()).pathname; const method = req.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "content-range": "0-0/*" }, body: JSON.stringify(body) });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (p.startsWith("/auth/v1/user")) return json(user);
    if (p.startsWith("/auth/v1/token")) return json(session);
    if (p === "/rest/v1/rpc/social_list") { db.calls++; return json(db.list); }
    if (p === "/rest/v1/rpc/social_my_profile") return json([{ user_id: "u1", role: "student", display_name: "Anna Keller", avatar_seed: "a", invite_code: "ABC123", share_with_friends: true, email: "anna@x.ch" }]);
    if (p === "/rest/v1/rpc/social_respond_request") { const b = req.postDataJSON(); const c = db.list.find((x) => x.id === b.p_request_id); if (b.p_accept) c.state = "friend"; else db.list = db.list.filter((x) => x !== c); return json(b.p_accept ? "accepted" : "declined"); }
    return json([]);
  });
  ctx.setDefaultTimeout(60000);
  const page = await ctx.newPage(); const logs = [];
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message.slice(0, 200)));
  const badge = () => page.locator(mobile ? "nav[aria-label='Hauptmenü mobil'] [data-testid=friend-request-badge]" : "nav[aria-label='Hauptmenü'] [data-testid=friend-request-badge]");
  const text = async () => ((await badge().count()) ? (await badge().innerText()).trim() : "");

  await page.goto(BASE + "/applications");
  await badge().waitFor();
  assert.equal(await text(), "3", "3 incoming only (outgoing/friend excluded)");
  assert.equal(await badge().getAttribute("aria-label"), "3 offene Freundschaftsanfragen");
  await page.screenshot({ path: `${OUT}${name}-1-badge.png` });

  // touch target + layout: tab bar items >= 44px, no horizontal overflow
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, "horizontal overflow " + overflow);
  if (mobile) for (const a of await page.locator("nav[aria-label='Hauptmenü mobil'] a, nav[aria-label='Hauptmenü mobil'] button").all()) { const b = await a.boundingBox(); assert.ok(b.width >= 44 && b.height >= 44, `touch target ${b.width}x${b.height}`); }
  else { const link = page.locator("nav[aria-label='Hauptmenü'] a[href='/friends']"); const b = await link.boundingBox(); assert.ok(b.height >= 36 && b.width >= 36); }

  // badge contrast
  const [fg, bg] = await badge().evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
  const lum = (c) => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05);
  assert.ok(ratio >= 4.5, "contrast " + ratio);

  // accept on the friends page -> badge drops immediately, decline -> 1, then none
  await page.goto(BASE + "/friends");
  await page.getByRole("button", { name: "Annehmen" }).first().waitFor();
  await page.screenshot({ path: `${OUT}${name}-2-friends.png` });
  await page.getByRole("button", { name: "Annehmen" }).first().click();
  await page.waitForFunction(() => document.querySelector("[data-testid=friend-request-badge]")?.getAttribute("aria-label") === "2 offene Freundschaftsanfragen");
  await page.getByRole("button", { name: "Ablehnen" }).first().click();
  await page.waitForFunction(() => document.querySelector("[data-testid=friend-request-badge]")?.getAttribute("aria-label") === "1 offene Freundschaftsanfrage");
  assert.equal(await text(), "1");

  // external change shows up after the tab regains focus
  db.list.push(conn("6", "incoming", "Gina Roth"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => document.querySelector("[data-testid=friend-request-badge]")?.textContent?.trim() === "2");
  // 9+ and 0
  for (let i = 10; i < 22; i++) db.list.push(conn(String(i), "incoming", "User " + i));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => document.querySelector("[data-testid=friend-request-badge]")?.textContent?.trim() === "9+");
  await page.screenshot({ path: `${OUT}${name}-3-9plus.png` });
  db.list = db.list.filter((c) => c.state !== "incoming");
  await page.goto(BASE + "/dashboard"); // route change reloads
  await page.waitForFunction(() => !document.querySelector("[data-testid=friend-request-badge]"), null, { timeout: 15000 });
  assert.equal(await badge().count(), 0, "no badge at 0");
  assert.deepEqual(logs, []);
  console.log(name, "ok, contrast", ratio.toFixed(2), "list calls", db.calls);
  await browser.close();
}
await run("m320-light", { w: 320, h: 640 }, false);
await run("m390-dark", { w: 390, h: 844 }, true);
await run("m430-light", { w: 430, h: 932 }, false);
await run("desktop-light", { w: 1280, h: 800 }, false);
await run("desktop-dark", { w: 1280, h: 800 }, true);
await run("md-light", { w: 820, h: 800 }, false);
