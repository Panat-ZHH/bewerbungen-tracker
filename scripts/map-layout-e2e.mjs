// Repeatable layout check of the fullscreen map against a stubbed Supabase (nothing real is touched).
// Usage: start `next dev --webpack -p 3203` with dummy env (NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321), then
//   PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome binary> [QUICK=1] [BASE=http://localhost:3203] node scripts/map-layout-e2e.mjs
// Per viewport (320..1920 + landscape phones) and theme it asserts: no page scroll, navbar visible and not overlapped, overlays inside
// the viewport, 44px targets, collapsed overlays leave the map centre free, sheets <= 45dvh, Esc closes, state remembered, keyboard
// (visualViewport override) keeps sheet + inputs visible, friend island uses the same layout, no console errors.
const { chromium } = await import(process.env.PLAYWRIGHT);
const BASE = process.env.BASE || "http://localhost:3203";
const OUT = process.env.OUT || `${process.env.HOME}/Projects/bewerbungen-tracker-wt/screenshots/v2/map-layout/`;
const { mkdirSync } = await import("node:fs");
mkdirSync(OUT, { recursive: true });
const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "s@x.ch", user_metadata: { role: "student" }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user };
const FRIEND = "22222222-2222-2222-2222-222222222222";
const statuses = ["applied", "interview", "offer", "saved", "preparing", "rejected"];
const apps = Array.from({ length: 6 }, (_, i) => ({ id: "a" + i, user_id: "u1", company: "Firma " + i, position: "Entwickler " + i, location: "Bern", status: statuses[i], category: "software", currency: "CHF", deadline: null, created_at: `2026-09-0${i + 1}`, updated_at: "2026-10-01", notes: "Notiz " + i, job_url: "" }));
const friendIsland = { userId: FRIEND, displayName: "Mia Muster", islands: 2, applications: statuses.map((status, i) => ({ id: `h000${i + 1}`, status, createdAt: `2026-10-0${i + 1}` })), items: [], layouts: [] };
const mobileViewports = [[320, 568], [375, 667], [393, 852], [430, 932]];
const desktopViewports = [[768, 1024], [1024, 768], [1280, 800], [1920, 1080]];
const landscape = [[667, 375], [844, 390]];
const matrix = process.env.QUICK
  ? [[375, 667, false], [393, 852, true], [844, 390, false], [768, 1024, false], [1280, 800, true]]
  : [...mobileViewports, ...desktopViewports, ...landscape].map(([w, h]) => [w, h, false]).concat([[375, 667, true], [1280, 800, true], [844, 390, true]]);

let failures = 0;
const check = (ok, text) => { console.log(ok ? "PASS" : "FAIL", text); if (!ok) failures++; };

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

async function newPage(w, h, dark) {
  const mobile = w < 768 || h < 500;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile, colorScheme: dark ? "dark" : "light" });
  await ctx.addInitScript(([s, theme]) => {
    localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s));
    localStorage.setItem("wendapply-theme", theme);
    // Fake visual viewport so a keyboard can be simulated in desktop Chrome.
    const fake = new EventTarget();
    Object.assign(fake, { height: innerHeight, width: innerWidth, offsetTop: 0, offsetLeft: 0, scale: 1 });
    Object.defineProperty(window, "visualViewport", { value: fake, configurable: true });
    window.__keyboard = (px, pan = 0) => { fake.height = innerHeight - px - pan; fake.offsetTop = pan; fake.dispatchEvent(new Event("resize")); fake.dispatchEvent(new Event("scroll")); };
  }, [session, dark ? "dark" : "light"]);
  const st = { balance: 300, earned: 300, rewardCount: 3, items: [{ id: "i1", itemType: "tree", x: null, z: null, rotation: 0, createdAt: "2026-10-01" }], layouts: [] };
  await ctx.route("**://localhost:54321/**", async (route) => {
    const req = route.request(); const p = new URL(req.url()).pathname; const method = req.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "content-range": "0-0/*" }, body: JSON.stringify(body) });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (p.startsWith("/auth/v1/user")) return json(user);
    if (p.startsWith("/auth/v1/token")) return json(session);
    if (p.startsWith("/storage/")) return json([]);
    if (p === "/rest/v1/applications") return json(apps);
    if (p.startsWith("/rest/v1/rpc/")) {
      const rpc = p.split("/").pop();
      if (rpc === "map_shop_state") return json(st);
      if (rpc === "map_islands_state") return json({ unlocked: 1 });
      if (rpc === "map_friend_island") return json(friendIsland);
      if (rpc === "social_my_profile") return json([{ user_id: "u1", role: "student", display_name: "Ich", avatar_seed: "x", invite_code: "ABC", share_with_friends: true, email: null }]);
      return json([]);
    }
    return json([]);
  });
  ctx.setDefaultTimeout(120000);
  const page = await ctx.newPage();
  const logs = [];
  page.on("console", (m) => { if (m.type() === "error" && !/40[0-9]|Failed to load resource|WebGL|GPU stall/.test(m.text())) logs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message.slice(0, 200)));
  return { ctx, page, logs, mobile };
}

/** Rects of all visible interactive overlay controls + their sizes. */
const overlayControls = () => {
  const stage = document.querySelector("[data-map-fullscreen]");
  const overlays = stage.children[1];
  const out = [];
  for (const el of overlays.querySelectorAll("button, a, input, select")) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === "hidden") continue;
    if (el.closest("[hidden]")) continue;
    const clipped = r.width <= 2 && r.height <= 2; // visually hidden helpers
    if (clipped) continue;
    out.push({ name: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30), tag: el.tagName, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height });
  }
  return out;
};


async function metrics(page, phone) {
  return page.evaluate((phone) => {
    const doc = document.scrollingElement;
    const stage = document.querySelector("[data-map-fullscreen]").getBoundingClientRect();
    const nav = phone ? document.querySelector('nav[aria-label="Hauptmenü mobil"]') : document.querySelector("header");
    const nr = nav.getBoundingClientRect();
    const navVisible = getComputedStyle(nav).display !== "none" && nr.width > 0 && nr.height > 0 && nr.bottom <= innerHeight + 1 && nr.top >= -1;
    return { sh: doc.scrollHeight, sw: doc.scrollWidth, ih: innerHeight, iw: innerWidth, stage: { l: stage.left, t: stage.top, r: stage.right, b: stage.bottom, w: stage.width, h: stage.height }, nav: { t: nr.top, b: nr.bottom, l: nr.left, r: nr.right }, navVisible, htmlOverflow: getComputedStyle(document.documentElement).overflow, headerHidden: !phone || getComputedStyle(document.querySelector("header")).display === "none" };
  }, phone);
}

async function runMap(w, h, dark) {
  const name = `${w}x${h}${dark ? "-dark" : ""}`;
  const { ctx, page, logs, mobile } = await newPage(w, h, dark);
  const phone = w < 768;
  await page.goto(BASE + "/map");
  await page.waitForSelector("[data-map-fullscreen] canvas, [data-map-fullscreen] [data-map-renderer]", { timeout: 120000 });
  await page.waitForTimeout(2500);
  const m = await metrics(page, phone);
  check(m.sh <= m.ih + 1 && m.sw <= m.iw, `${name}: no page scroll (scrollHeight ${m.sh} <= ${m.ih}, scrollWidth ${m.sw} <= ${m.iw})`);
  check(m.htmlOverflow === "hidden", `${name}: html overflow hidden`);
  check(m.navVisible, `${name}: navbar visible (${phone ? "bottom tab bar" : "header"})`);
  check(!phone || m.headerHidden, `${name}: header hidden on phones`);
  check(phone ? m.stage.b <= m.nav.t + 1 && m.stage.t <= 1 : m.stage.t >= m.nav.b - 1 && m.stage.b >= m.ih - 1, `${name}: stage fills the space and does not overlap the navbar`);
  check(Math.abs(m.stage.w - m.iw) <= 1, `${name}: stage spans the full width`);

  const controls = await page.evaluate(overlayControls);
  const inside = controls.filter((c) => c.l < -0.5 || c.t < -0.5 || c.r > m.iw + 0.5 || c.b > m.ih + 0.5);
  check(inside.length === 0, `${name}: all ${controls.length} overlay controls inside viewport ${JSON.stringify(inside.map((c) => c.name))}`);
  const small = controls.filter((c) => c.tag !== "INPUT" && (c.w < 43.5 || c.h < 43.5));
  check(small.length === 0, `${name}: 44px touch targets ${JSON.stringify(small.map((c) => `${c.name} ${Math.round(c.w)}x${Math.round(c.h)}`))}`);
  const centre = { l: m.stage.w * 0.3, t: m.stage.t + m.stage.h * 0.3, r: m.stage.w * 0.7, b: m.stage.t + m.stage.h * 0.7 };
  const overlap = controls.filter((c) => Math.min(c.r, centre.r) - Math.max(c.l, centre.l) > 0 && Math.min(c.b, centre.b) - Math.max(c.t, centre.t) > 0);
  check(overlap.length === 0, `${name}: collapsed overlays leave the map centre free ${JSON.stringify(overlap.map((c) => c.name))}`);
  await page.screenshot({ path: `${OUT}map-${name}-1-collapsed.png`, timeout: 120000 });

  // chips expand / collapse (aria-expanded), Esc closes, only one panel at a time
  const island = page.locator("button[data-open]").nth(0);
  await island.click();
  check(await island.getAttribute("aria-expanded") === "true", `${name}: island chip expands (aria-expanded)`);
  await page.waitForTimeout(400);
  const panel = await page.getByRole("group", { name: "Inseln" }).boundingBox();
  check(panel && panel.x >= -0.5 && panel.y >= -0.5 && panel.x + panel.width <= w + 0.5 && panel.y + panel.height <= h + 0.5, `${name}: island panel inside viewport`);
  await page.screenshot({ path: `${OUT}map-${name}-2-island-panel.png`, timeout: 120000 });
  await page.keyboard.press("Escape");
  check(await island.getAttribute("aria-expanded") === "false", `${name}: Esc closes island panel`);
  const search = page.locator("button[data-open]").nth(1);
  await search.click();
  const input = page.getByPlaceholder("Firma, Stelle oder Ort");
  check(await input.isVisible() && (await input.boundingBox()).height >= 43.5, `${name}: search input visible, 44px high`);
  await page.screenshot({ path: `${OUT}map-${name}-3-search.png`, timeout: 120000 });
  await page.keyboard.press("Escape");
  check(await search.getAttribute("aria-expanded") === "false", `${name}: Esc closes search panel`);

  // zoom controls respond
  const zoomBefore = await page.getByRole("button", { name: /^Zoom zurücksetzen/ }).innerText();
  await page.getByRole("button", { name: "Vergrößern" }).click();
  // The camera animates and reports its zoom throttled: poll until the readout changes.
  let zoomAfter = zoomBefore;
  for (let i = 0; i < 20 && zoomAfter === zoomBefore; i++) { await page.waitForTimeout(150); zoomAfter = await page.getByRole("button", { name: /^Zoom zurücksetzen/ }).innerText(); }
  check(zoomBefore !== zoomAfter, `${name}: zoom button changes zoom (${zoomBefore} -> ${zoomAfter})`);
  await page.getByRole("button", { name: "Zoom zurücksetzen, aktuell 120 Prozent" }).click();

  // selected-item sheet
  await page.getByRole("button", { name: /Firma 0: .*Gebäudedetails/ }).click({ force: true, timeout: 20000 }).catch(async () => { await page.evaluate(() => document.querySelector("[data-building]")?.click()); });
  const sheet = page.locator('[data-sheet="application"]');
  await sheet.waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  const sb = await sheet.boundingBox();
  check(sb.x >= -0.5 && sb.y >= 0 && sb.x + sb.width <= w + 0.5 && sb.y + sb.height <= m.stage.b + 0.5, `${name}: selection sheet inside the stage`);
  if (phone) check(sb.height <= h * 0.45 + 2, `${name}: bottom sheet <= 45dvh (${Math.round(sb.height)} <= ${Math.round(h * 0.45)})`);
  else check(sb.width <= 420 && sb.x <= 24, `${name}: sheet is a side card (${Math.round(sb.width)}px wide)`);
  await page.screenshot({ path: `${OUT}map-${name}-4-sheet.png`, timeout: 120000 });
  const toggle = sheet.getByRole("button", { name: /einklappen|ausklappen/ });
  await toggle.click();
  check(await toggle.getAttribute("aria-expanded") === "false", `${name}: sheet collapses (aria-expanded=false)`);
  const collapsedBox = await sheet.boundingBox();
  check(collapsedBox.height < sb.height && collapsedBox.height <= 90, `${name}: collapsed sheet is just the header (${Math.round(collapsedBox.height)}px)`);
  const stored = await page.evaluate(() => localStorage.getItem("wendapply.map.overlay.sheet.application.collapsed"));
  check(stored === "1", `${name}: collapsed state remembered in localStorage`);
  await toggle.click();
  await page.keyboard.press("Escape");
  await sheet.waitFor({ state: "detached", timeout: 5000 }).then(() => check(true, `${name}: Esc closes the sheet`), () => check(false, `${name}: Esc closes the sheet`));

  // keyboard simulation with a text field inside the dock (placement X input)
  await page.getByRole("button", { name: "Shop" }).click();
  const shopSheet = page.locator('[data-sheet="shop"]');
  await shopSheet.waitFor();
  await page.screenshot({ path: `${OUT}map-${name}-5-shop.png`, timeout: 120000 });
  const sbShop = await shopSheet.boundingBox();
  check(sbShop.y + sbShop.height <= m.stage.b + 0.5 && sbShop.x >= -0.5 && sbShop.x + sbShop.width <= w + 0.5, `${name}: shop sheet inside the stage`);
  await shopSheet.getByRole("button", { name: /Dein Inventar|Baum/ }).first().click().catch(() => {});
  await shopSheet.getByRole("button", { name: /Platzieren/ }).first().click({ timeout: 8000 }).catch(() => {});
  const xInput = page.getByLabel("Position X");
  if (await xInput.count()) {
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}map-${name}-6-placement.png`, timeout: 120000 });
    const tools = await page.locator('[aria-label="Gegenstand platzieren"]').boundingBox();
    check(tools.y + tools.height <= m.stage.b + 0.5, `${name}: placement toolbar sits above the navbar`);
    const keyboard = Math.round(h * 0.42);
    await xInput.focus();
    await page.evaluate((px) => window.__keyboard(px), keyboard);
    await page.waitForTimeout(600);
    const ib = await xInput.boundingBox();
    check(ib.y >= 0 && ib.y + ib.height <= h - keyboard + 1, `${name}: X input stays above a ${keyboard}px keyboard (bottom ${Math.round(ib.y + ib.height)} <= ${h - keyboard})`);
    await page.screenshot({ path: `${OUT}map-${name}-7-keyboard-placement.png`, timeout: 120000 });
    await page.evaluate(() => window.__keyboard(0));
    await page.getByRole("button", { name: "Platzierung abbrechen" }).click();
  } else {
    console.log("INFO", `${name}: placement tools not reachable in this stub, keyboard check on search instead`);
  }
  // keyboard + search panel (top) and iOS pan
  await search.click();
  const si = page.getByPlaceholder("Firma, Stelle oder Ort");
  await si.focus();
  await page.evaluate((px) => window.__keyboard(px, 0), Math.round(h * 0.4));
  await page.waitForTimeout(500);
  const sib = await si.boundingBox();
  check(sib.y >= 0 && sib.y + sib.height <= h * 0.6 + 1, `${name}: search input visible with keyboard open`);
  await page.evaluate(() => window.__keyboard(0));
  const after = await metrics(page, phone);
  check(after.sh <= after.ih + 1, `${name}: still no page scroll after keyboard`);
  const wheelBefore = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 400);
  check(await page.evaluate(() => scrollY) === wheelBefore, `${name}: wheel does not scroll the page`);
  check(logs.length === 0, `${name}: no console errors ${JSON.stringify(logs.slice(0, 3))}`);
  await ctx.close();
}

async function runFriend(w, h, dark) {
  const name = `friend-${w}x${h}${dark ? "-dark" : ""}`;
  const { ctx, page, logs } = await newPage(w, h, dark);
  const phone = w < 768;
  await page.goto(`${BASE}/friends/${FRIEND}`);
  await page.waitForSelector("[data-map-fullscreen] canvas, [data-map-fullscreen] [data-map-renderer]", { timeout: 120000 });
  await page.waitForTimeout(2500);
  const m = await metrics(page, phone);
  check(m.sh <= m.ih + 1 && m.sw <= m.iw, `${name}: no page scroll`);
  check(m.navVisible, `${name}: navbar visible`);
  check(await page.getByRole("link", { name: /Zurück zu Freunden/ }).isVisible(), `${name}: back button`);
  check(await page.getByRole("group", { name: "Nur ansehen" }).isVisible(), `${name}: 'Nur ansehen' badge`);
  check(await page.getByRole("button", { name: /Mia Muster/ }).isVisible(), `${name}: name chip`);
  check(await page.getByRole("button", { name: /Shop|Verschieben|Platzieren|Speichern/ }).count() === 0, `${name}: no edit tools`);
  check(await page.getByRole("button", { name: /Inseln/ }).isVisible(), `${name}: island switcher chip (2 islands)`);
  const controls = await page.evaluate(overlayControls);
  check(controls.every((c) => c.l >= -0.5 && c.t >= -0.5 && c.r <= m.iw + 0.5 && c.b <= m.ih + 0.5), `${name}: overlays inside viewport`);
  check(controls.filter((c) => c.tag !== "INPUT" && (c.w < 43.5 || c.h < 43.5)).length === 0, `${name}: 44px targets`);
  await page.screenshot({ path: `${OUT}${name}-1.png`, timeout: 120000 });
  await page.getByRole("button", { name: /Mia Muster/ }).click();
  await page.screenshot({ path: `${OUT}${name}-2-info.png`, timeout: 120000 });
  check(logs.length === 0, `${name}: no console errors ${JSON.stringify(logs.slice(0, 3))}`);
  await ctx.close();
}

for (const [w, h, dark] of matrix) await runMap(w, h, dark);
for (const [w, h, dark] of (process.env.QUICK ? [[393, 852, false], [1280, 800, true]] : [[375, 667, false], [844, 390, false], [1280, 800, true]])) await runFriend(w, h, dark);
await browser.close();
console.log(failures ? `${failures} FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
