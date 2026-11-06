// Headless check of the read-only friend island against a stubbed Supabase (nothing real is touched).
// Usage: start `next dev --webpack -p 3177` with dummy env (NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321), then
//   PLAYWRIGHT=<path to playwright-core/index.mjs> CHROME=<chrome binary> node scripts/friend-island-e2e.mjs
const { chromium } = await import(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || "http://localhost:3177";
const OUT = process.env.OUT || `${process.env.HOME}/Projects/bewerbungen-tracker-wt/screenshots/friend-island/`;
const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "s@x.ch", user_metadata: { role: "student" }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user };
const FRIEND = "22222222-2222-2222-2222-222222222222";
const STRANGER = "99999999-9999-9999-9999-999999999999";
const statuses = ["offer", "interview", "applied", "preparing", "rejected", "saved", "final_interview"];
const island = { userId: FRIEND, displayName: "Mia Muster", islands: 2, applications: statuses.map((status, i) => ({ id: `h000${i + 1}`, status, createdAt: `2026-10-0${i + 1}`, company: ["Swisscom", "UBS", "SBB", "Google Zürich", "Migros", "Zühlke", "Roche"][i] })), items: [{ id: "i1", itemType: "tree", x: 8, z: 12, rotation: 0, createdAt: "2026-10-01" }, { id: "i2", itemType: "fountain", x: 10, z: 12, rotation: 0, createdAt: "2026-10-02" }], layouts: [] };
let failures = 0;
const check = (ok, text) => { console.log(ok ? "PASS" : "FAIL", text); if (!ok) failures++; };

async function run(name, vp, dark) {
  const mobile = vp.w < 700;
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: mobile, isMobile: mobile, colorScheme: dark ? "dark" : "light" });
  await ctx.addInitScript((s) => { localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)); }, session);
  const calls = [];
  await ctx.route("**://localhost:54321/**", async (route) => {
    const req = route.request(); const p = new URL(req.url()).pathname; const method = req.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "content-range": "0-0/*" }, body: JSON.stringify(body) });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (p.startsWith("/auth/v1/user")) return json(user);
    if (p.startsWith("/auth/v1/token")) return json(session);
    if (p.startsWith("/storage/")) return json([]);
    if (p.startsWith("/rest/v1/rpc/")) {
      const rpc = p.split("/").pop(); let body = {}; try { body = req.postDataJSON() || {}; } catch {}
      calls.push({ method, rpc, body });
      if (rpc === "map_friend_island") return body.p_friend_id === FRIEND ? json(island) : json({ code: "P0001", message: "NOT_FRIENDS" }, 400);
      if (rpc === "social_my_profile") return json([{ user_id: "u1", role: "student", display_name: "Ich", avatar_seed: "x", invite_code: "ABC", share_with_friends: true, email: null }]);
      if (rpc === "social_list") return json([{ id: "f1", other_user_id: FRIEND, display_name: "Mia Muster", avatar_seed: "m", role: "student", state: "friend", created_at: "2026-10-01T00:00:00Z" }]);
      if (rpc === "social_friends_overview") return json([{ user_id: FRIEND, display_name: "Mia Muster", avatar_seed: "m", shared: true, total: 7, status_counts: { offer: 1 }, map_points_earned: 700, map_items: 2 }]);
      return json([]);
    }
    calls.push({ method, rest: p });
    return json([]);
  });
  ctx.setDefaultTimeout(120000);
  const page = await ctx.newPage(); const logs = [];
  page.on("console", (msg) => { if (msg.type() === "error") logs.push(msg.text().slice(0, 200)); });
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message.slice(0, 200)));
  if (dark) await page.addInitScript(() => localStorage.setItem("theme", "dark"));

  // Friends list -> click the NAME
  await page.goto(BASE + "/friends"); 
  const link = page.getByRole("link", { name: "Mia Muster" });
  await link.waitFor();
  await link.click();
  await page.waitForURL(`**/friends/${FRIEND}`);
  await page.waitForSelector("[data-map-renderer], canvas", { timeout: 90000 }); await page.waitForTimeout(2500);
  check(await page.getByRole("heading", { name: "Insel von Mia Muster" }).isVisible(), `${name}: header 'Insel von Mia Muster'`);
  check(await page.getByText("Nur ansehen").first().isVisible(), `${name}: 'Nur ansehen' badge`);
  check(await page.getByRole("link", { name: /Zurück zu Freunden/ }).isVisible(), `${name}: back button`);
  check(await page.getByRole("button", { name: /Bewerbung|Shop|Verschieben|Löschen|Speichern|Platzieren/ }).count() === 0, `${name}: no edit buttons`);
  const body = await page.locator("body").innerText();
  const labels = await page.locator("[data-building] strong").allInnerTexts();
  const expected = ["Swisscom", "UBS", "SBB", "Google Zürich", "Migros", "Zühlke", "Roche"]; const shown = labels.filter(Boolean); // narrow viewports hide off-screen labels
  check(shown.length >= 3 && shown.every((l) => expected.includes(l)) && (mobile || shown.length === 7) && !/Haus 1/.test(body), `${name}: company names shown on the houses (${labels.join(", ")})`);
  await page.screenshot({ path: `${OUT}${name}-1-view.png`, timeout: 120000 });

  // Attempt to drag a house / item and use edit keys: nothing may be sent
  const before = calls.length;
  const host = page.getByRole("region", { name: "3D-Bewerbungsdorf" });
  const box = await host.boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  if (mobile) {
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    await touch("touchStart", cx, cy); await page.waitForTimeout(700); await touch("touchMove", cx + 80, cy + 40); await touch("touchMove", cx + 120, cy + 60); await touch("touchEnd", cx + 120, cy + 60);
  } else {
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 80, cy + 40, { steps: 8 }); await page.mouse.move(cx + 140, cy + 70, { steps: 8 });
    check(await host.getAttribute("data-drag-state") === null, `${name}: no drag ghost while dragging`);
    await page.mouse.up();
  }
  await host.focus(); for (const key of ["ArrowLeft", "Enter", "Delete", "Control+z"]) await page.keyboard.press(key);
  await page.waitForTimeout(800);
  const extra = calls.slice(before).filter((c) => c.rpc !== "social_list"); // badge polling is read-only and unrelated to the map
  check(extra.length === 0, `${name}: drag + keyboard attempt sent no requests (${JSON.stringify(extra)})`);
  check(!calls.some((c) => c.method !== "GET" && c.rest) , `${name}: no REST writes`);
  check(!calls.some((c) => /map_shop|map_move|map_island_unlock|place/.test(c.rpc || "")), `${name}: no mutating RPC called`);
  check(calls.filter((c) => c.rpc === "map_friend_island").length >= 1 && calls.every((c) => !c.rpc || /^(map_friend_island|social_|map_islands_state)/.test(c.rpc)), `${name}: only read RPCs used`);
  await page.screenshot({ path: `${OUT}${name}-2-after-drag-attempt.png`, timeout: 120000 });
  await page.getByRole("button", { name: /Nachtansicht/ }).click(); await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}${name}-3-night.png`, timeout: 120000 });

  // Error state: stranger
  await page.goto(`${BASE}/friends/${STRANGER}`);
  await page.getByText(/nur ansehen, wenn ihr befreundet seid/).waitFor();
  await page.screenshot({ path: `${OUT}${name}-4-not-friends.png`, timeout: 120000 });
  check(true, `${name}: stranger gets German error`);
  console.log(name, "console errors:", logs.filter((l) => !/40[0-9]|Failed to load resource/.test(l)).slice(0, 4));
  await browser.close();
}
await run("desktop", { w: 1440, h: 900 }, false);
await run("mobile", { w: 390, h: 844 }, false);
await run("desktop-dark", { w: 1280, h: 800 }, true);
console.log(failures ? `${failures} FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
