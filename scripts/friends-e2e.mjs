// Headless check of the friends page against a stubbed Supabase (nothing real is touched).
// Usage: `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy next dev --webpack -p 3108`, then
//   PLAYWRIGHT=<path to playwright-core/index.mjs> CHROME=<chrome binary> node scripts/friends-e2e.mjs
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || "http://localhost:3108";
const OUT = process.env.OUT || `${process.env.HOME}/Projects/bewerbungen-tracker-wt/screenshots/friends/`;
mkdirSync(OUT, { recursive: true });
const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "anna@x.ch", user_metadata: { full_name: "Anna Keller", role: "student" }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user };
const conn = (id, state, name) => ({ id, other_user_id: "o" + id, display_name: name, avatar_seed: "x", role: "student", state, created_at: "2026-11-01T10:00:00Z" });

async function run(name, vp, dark) {
  const mobile = vp.w < 700;
  const browser = await chromium.launch({ executablePath: process.env.CHROME });
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: mobile, isMobile: mobile, colorScheme: dark ? "dark" : "light" });
  await ctx.addInitScript(([s, d]) => { localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)); if (d) localStorage.setItem("wendapply-theme", "dark"); }, [session, dark]);
  const flags = { companies: false, outcomes: false, writes: [] };
  await ctx.route("**://localhost:54321/**", async (route) => {
    const req = route.request(); const p = new URL(req.url()).pathname; const method = req.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "content-range": "0-0/*" }, body: JSON.stringify(body) });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (p.startsWith("/auth/v1/user")) return json(user);
    if (p.startsWith("/auth/v1/token")) return json(session);
    if (p === "/rest/v1/rpc/social_list") return json([conn("1", "friend", "Finn Graf"), conn("2", "incoming", "Ben Meier"), conn("3", "outgoing", "Eva Huber")]);
    if (p === "/rest/v1/rpc/social_my_profile") return json([{ user_id: "u1", role: "student", display_name: "Anna Keller", avatar_seed: "a", invite_code: "ABC12345", share_with_friends: true, email: "anna@x.ch" }]);
    if (p === "/rest/v1/rpc/social_friends_overview") return json([{ user_id: "o1", display_name: "Finn Graf", avatar_seed: "x", shared: true, total: 4, status_counts: { applied: 3, interview: 1 }, map_points_earned: 400, map_items: 2 }]);
    if (p === "/rest/v1/rpc/social_get_share_companies") return json(flags.companies);
    if (p === "/rest/v1/rpc/social_get_share_outcomes") return json(flags.outcomes);
    if (p === "/rest/v1/rpc/social_set_share_outcomes") { flags.outcomes = req.postDataJSON().p_share; flags.writes.push("outcomes"); return json(flags.outcomes); }
    if (p === "/rest/v1/rpc/social_set_share_companies") { flags.companies = req.postDataJSON().p_share; flags.writes.push("companies"); return json(flags.companies); }
    return json([]);
  });
  ctx.setDefaultTimeout(60000);
  const page = await ctx.newPage(); const logs = [];
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message.slice(0, 200)));
  await page.goto(BASE + "/friends");
  await page.getByRole("heading", { name: "Anfragen" }).waitFor();
  // requests before progress before code
  const y = async (loc) => (await loc.boundingBox()).y;
  const yReq = await y(page.getByRole("heading", { name: "Anfragen" }));
  const yFriends = await y(page.getByRole("heading", { name: /Deine Freunde/ }));
  const yCode = await y(page.getByText("Dein Einladungscode"));
  assert.ok(yReq < yFriends && yReq < yCode, "requests come first");
  if (mobile) assert.ok(yFriends < yCode, `mobile: friends/progress ${yFriends} before code ${yCode}`);
  // no ranking / points; defaults off
  const body = await page.locator("main").innerText();
  assert.doesNotMatch(body, /Platz \d|Map-Punkte|Punkte/);
  assert.equal(await page.getByRole("switch", { name: "Firmennamen auf der Karte zeigen" }).getAttribute("aria-checked"), "false");
  assert.equal(await page.getByRole("switch", { name: "Zusagen und Absagen zeigen" }).getAttribute("aria-checked"), "false");
  // sharing options
  await page.getByRole("link", { name: "WhatsApp" }).waitFor();
  assert.match(await page.getByRole("link", { name: "WhatsApp" }).getAttribute("href"), /^https:\/\/wa\.me\/\?text=.*invite%2FABC12345/);
  await page.getByRole("button", { name: "QR-Code" }).click();
  await page.getByRole("img", { name: /QR-Code für deinen Einladungslink/ }).waitFor();
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
  await page.getByRole("switch", { name: "Zusagen und Absagen zeigen" }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Zusagen und Absagen zeigen"]')?.getAttribute("aria-checked") === "true");
  assert.deepEqual(flags.writes, ["outcomes"]);
  assert.deepEqual(logs, []);
  await browser.close();
}
await run("desktop-light", { w: 1440, h: 900 }, false);
await run("desktop-dark", { w: 1440, h: 900 }, true);
await run("mobile-light", { w: 390, h: 844 }, false);
await run("mobile-dark", { w: 390, h: 844 }, true);
console.log("friends e2e ok");
