// Mobile village / placement e2e (phones + tablet, portrait + landscape, light + dark) with real touch input.
// WebKit for iPhone/iPad, Chromium for Android; every context is isMobile + hasTouch.
//
// Runs against a STUBBED, stateful Supabase (route interception of http://localhost:54321): a mock pupil with 600 points.
// No real user, no network to production. The stub keeps its state per browser context, so «persists after reload»
// means: the app sent the right RPC and shows the server state again after a full page reload.
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy npx next dev --webpack -p 3231
//   PLAYWRIGHT=<playwright-core/index.mjs whose browsers are installed> BASE=http://localhost:3231 node scripts/mobile-village-e2e.mjs
// Env:
//   MODE=test|flow|panels|shots|views|all (default all; views = friend island, read-only map)   flow = touch flow + layout assertions, panels = one-panel-at-a-time
//                                        + 44px select + palace card (320px and phones), test = flow + panels, shots = screenshots
//   SHOTS=<dir>                          screenshot folder (default ../_mobile/shots/village/after next to this worktree)
//   THEMES=light,dark                    flow themes (default both)
//   DEVICES=iphone-se,pixel-7,…          subset (ids below)   ORIENT=portrait|landscape|both (default both)
//   PLAYWRIGHT_WEBKIT=<playwright-core>  optional separate playwright-core for WebKit
// Exit code 1 when a check fails.
//
// Touch input used: page.touchscreen.tap (real touch events in both engines) for every tap;
// drags / pinch / two-finger pan: Chromium = CDP Input.dispatchTouchEvent (real touch pipeline incl. touch-action),
// WebKit = synthetic touch PointerEvents dispatched at the map (Playwright has no multi-touch API for WebKit).
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const defaultPw = resolve(here, "../../audit-tools/node_modules/playwright-core/index.mjs");
const pwChromium = await import(pathToFileURL(process.env.PLAYWRIGHT || defaultPw).href);
const pwWebkit = process.env.PLAYWRIGHT_WEBKIT ? await import(pathToFileURL(process.env.PLAYWRIGHT_WEBKIT).href) : pwChromium;
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE || "http://localhost:3231";
const MODE = process.env.MODE || "all";
const ORIENT = process.env.ORIENT || "both";
const SHOTS = (process.env.SHOTS || resolve(here, "../../_mobile/shots/village/after")).replace(/\/$/, "");
mkdirSync(SHOTS, { recursive: true });

// CSS viewport sizes as Playwright's device list has them (browser chrome already subtracted); Galaxy S23 = 360x780.
const DEVICES = [
  { id: "iphone-se", engine: "webkit", w: 375, h: 667 },
  { id: "iphone-15", engine: "webkit", w: 393, h: 659 },
  { id: "iphone-15-pro-max", engine: "webkit", w: 430, h: 739 },
  { id: "ipad", engine: "webkit", w: 810, h: 1080 },
  { id: "pixel-7", engine: "chromium", w: 412, h: 839 },
  { id: "galaxy-s23", engine: "chromium", w: 360, h: 780 },
].filter((d) => !process.env.DEVICES || process.env.DEVICES.split(",").includes(d.id));
const ORIENTS = ORIENT === "both" ? ["portrait", "landscape"] : [ORIENT];
const THEMES = (process.env.THEMES || "light,dark").split(",").map((t) => t === "dark");
const size = (d, o) => (o === "portrait" ? { width: d.w, height: d.h } : { width: d.h, height: d.w });

const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "s@x.ch", user_metadata: { role: "student" }, app_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "a.b.c", refresh_token: "r", token_type: "bearer", expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user };
const statuses = ["applied", "interview", "saved", "preparing", "rejected", "applied"];
const apps = statuses.map((status, i) => ({ id: "a" + i, user_id: "u1", company: "Firma " + i, position: "Lehrstelle " + i, location: "Bern", status, category: "software", currency: "CHF", deadline: null, created_at: `2026-09-0${i + 1}`, updated_at: "2026-10-01", notes: "", job_url: "" }));

let failures = 0;
let passes = 0;
const check = (ok, text, info = "") => { console.log(ok ? "PASS" : "FAIL", text, ok ? "" : info); if (ok) passes++; else failures++; return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browsers = {};
async function browserFor(engine) {
  if (!browsers[engine]) browsers[engine] = engine === "webkit" ? await pwWebkit.webkit.launch() : await pwChromium.chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  return browsers[engine];
}

async function waitMap(page) {
  await page.waitForSelector("[data-map-fullscreen] [data-map-renderer]", { timeout: 240000 });
  await page.waitForFunction(() => document.querySelector("[role=region][aria-label='3D-Bewerbungsdorf']")?.__map, null, { timeout: 60000 });
  // dev-only Next.js indicator (bottom-left) must not cover the tab bar / actions in hit tests; re-added after every reload
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await sleep(2000);
}

async function open(device, orient, dark, { extraApps = [], viewport: forced, path = "/map" } = {}) {
  const browser = await browserFor(device.engine);
  const viewport = forced ?? size(device, orient);
  const ctx = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: viewport.width <= 640 ? 2 : 1, colorScheme: dark ? "dark" : "light" });
  await ctx.addInitScript(([s, theme]) => {
    localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s));
    localStorage.setItem("wendapply-theme", theme);
  }, [session, dark ? "dark" : "light"]);
  const st = { balance: 600, earned: 600, rewardCount: 6, items: [], layouts: [] };
  await ctx.route("**://localhost:54321/**", async (route) => {
    const req = route.request(); const p = new URL(req.url()).pathname; const method = req.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "content-range": "0-0/*" }, body: JSON.stringify(body) });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (p.startsWith("/auth/v1/user")) return json(user);
    if (p.startsWith("/auth/v1/token")) return json(session);
    if (p.startsWith("/storage/")) return json([]);
    if (p === "/rest/v1/applications") return json([...apps, ...extraApps]);
    if (p === "/rest/v1/map_shop_catalog") return json([]);
    if (p.startsWith("/rest/v1/rpc/")) {
      const rpc = p.split("/").pop(); let b = {}; try { b = req.postDataJSON() || {}; } catch { /* no body */ }
      if (rpc === "map_shop_state") return json(st);
      if (rpc === "map_shop_buy") { st.balance -= 120; if (!st.items.some((i) => i.id === b.p_request_id)) st.items.push({ id: b.p_request_id, itemType: b.p_item_type, x: null, z: null, rotation: 0, createdAt: "2026-11-18" }); return json(st); }
      if (rpc === "map_shop_place") { const it = st.items.find((i) => i.id === b.p_item_id); Object.assign(it, { x: b.p_x ?? null, z: b.p_z ?? null, rotation: b.p_rotation ?? 0 }); return json(st); }
      if (rpc === "map_move_object") { st.layouts = st.layouts.filter((l) => l.id !== b.p_object_id); st.layouts.push({ id: b.p_object_id, x: b.p_x, z: b.p_z, rotation: b.p_rotation }); return json(st); }
      if (rpc === "map_islands_state") return json({ unlocked: 1 });
      if (rpc === "my_access") return json({ has_access: true, state: "active", reason: "none", role: "student", enforced: false, blocked: false });
      return json([]);
    }
    return json([]);
  });
  ctx.setDefaultTimeout(60000);
  const page = await ctx.newPage();
  const logs = [];
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message.slice(0, 200)));
  await page.goto(BASE + path);
  await waitMap(page);
  // hide the Next.js dev indicator so it does not cover the tab bar in screenshots / hit tests
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  return { ctx, page, st, logs };
}

const host = (page) => page.locator("[role=region][aria-label='3D-Bewerbungsdorf']");
const project = (page, x, z) => host(page).evaluate((h, [a, b]) => h.__map.project(a, b), [x, z]);
async function tap(page, locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("not visible: " + locator);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await sleep(450);
}
const tools = (page) => page.locator('[aria-label="Gegenstand platzieren"]');
const selectedTools = (page) => page.locator('[aria-label="Ausgewählter Gegenstand"]');
const action = (scope, name) => scope.getByRole("button", { name: new RegExp(`^${name}`) });

/** Layout facts of a panel: bottom nav, stage, overflow and every control (visible = inside the viewport, not under the nav, not covered). */
async function layout(page, selector) {
  return page.evaluate((sel) => {
    const nav = document.querySelector('nav[aria-label="Hauptmenü mobil"]');
    const nr = nav?.getBoundingClientRect();
    const ns = nav && getComputedStyle(nav);
    // shell contract: the bar slides out (translateY + visibility:hidden) while html[data-hide-bottom-nav] is set
    const navShown = !!nav && ns.display !== "none" && ns.visibility !== "hidden" && nr.height > 0 && nr.top < innerHeight - 1;
    const stage = document.querySelector("[data-map-fullscreen]").getBoundingClientRect();
    const root = sel ? document.querySelector(sel) : null;
    const rb = root?.getBoundingClientRect();
    const box = (r) => ({ t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right) });
    const controls = root ? [...root.querySelectorAll("button")].filter((el) => getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0).map((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { name: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 28), t: r.top, b: r.bottom, l: r.left, r: r.right, w: r.width, h: r.height, covered: !(hit && (hit === el || el.contains(hit))), by: hit && !(hit === el || el.contains(hit)) ? (hit.tagName + "." + String(hit.className?.baseVal ?? hit.className ?? "") + "[" + (hit.getAttribute("aria-label") ?? hit.textContent?.trim().slice(0, 20) ?? "") + "]").slice(0, 90) : undefined, grip: el.getAttribute("aria-expanded") !== null && !el.textContent.trim() };
    }) : [];
    return {
      ih: innerHeight, iw: innerWidth, sw: document.scrollingElement.scrollWidth, sh: document.scrollingElement.scrollHeight, scrollY, scrollX,
      navShown, nav: navShown ? box(nr) : null, hideFlag: document.documentElement.dataset.hideBottomNav ?? null,
      stage: box(stage), root: rb ? box(rb) : null, controls,
    };
  }, selector);
}
const intersects = (a, b) => !!a && !!b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

function checkPanel(name, m, required) {
  const phone = m.iw < 768;
  check(!!m.root, `${name}: panel rendered`);
  check(!intersects(m.root, m.nav), `${name}: panel does not intersect the bottom nav`, JSON.stringify({ panel: m.root, nav: m.nav }));
  check(m.root && m.root.b <= m.ih + 0.5 && m.root.t >= -0.5, `${name}: panel inside the viewport`, JSON.stringify({ panel: m.root, ih: m.ih }));
  if (phone && m.ih > m.iw) check(!m.navShown && m.hideFlag === "true", `${name}: bottom nav hidden while the panel is open (phone)`, JSON.stringify({ navShown: m.navShown, flag: m.hideFlag }));
  const limit = m.navShown ? Math.min(m.ih, m.nav.t) : m.ih;
  for (const label of required) {
    const c = m.controls.find((x) => x.name.startsWith(label));
    check(!!c && c.t >= -0.5 && c.l >= -0.5 && c.r <= m.iw + 0.5 && c.b <= limit + 0.5 && !c.covered, `${name}: «${label}» visible`, JSON.stringify(c));
    check(!!c && c.w >= 44 && c.h >= 44, `${name}: «${label}» >= 44px`, JSON.stringify(c && { w: c.w, h: c.h }));
  }
  const small = m.controls.filter((c) => !c.grip && (c.w < 44 || c.h < 44));
  check(small.length === 0, `${name}: every button in the panel >= 44px`, JSON.stringify(small));
  check(m.sw <= m.iw + 1, `${name}: no horizontal overflow (${m.sw} <= ${m.iw})`);
  check(m.sh <= m.ih + 1 && m.scrollY === 0, `${name}: no page scroll`, JSON.stringify({ sh: m.sh, ih: m.ih, y: m.scrollY }));
  const floor = m.navShown ? m.nav.t : m.ih;
  check(Math.abs(m.stage.b - floor) <= 2, `${name}: map fills down to the nav / screen edge (no empty strip)`, JSON.stringify({ stageB: m.stage.b, floor }));
}

/** Free 1x1 cell near the current ghost whose screen point is on the open map (not under a panel / top bar). */
async function tapFreeTile(page, avoid) {
  const panel = await tools(page).boundingBox();
  const vp = page.viewportSize();
  const base = await page.evaluate(() => ({ x: Number(document.querySelector('input[aria-label="Position X"]')?.value), z: Number(document.querySelector('input[aria-label="Position Z"]')?.value) }));
  for (const [dx, dz] of [[2, 0], [0, -2], [-2, 0], [2, -2], [-2, -2], [3, 1], [-3, 1], [1, -3], [4, 0], [0, -4], [-4, 0], [1, 2], [-1, 2]]) {
    const target = { x: base.x + dx, z: base.z + dz };
    if (avoid && avoid.x === target.x && avoid.z === target.z) continue;
    const p = await project(page, target.x + 0.5, target.z + 0.5);
    if (p.y < 70 || p.x < 20 || p.x > vp.width - 70 || p.y > vp.height - 10) continue;
    if (panel && p.x > panel.x - 10 && p.x < panel.x + panel.width + 10 && p.y > panel.y - 10) continue;
    const covered = await page.evaluate(([x, y]) => !document.elementFromPoint(x, y)?.closest("[role=region][aria-label='3D-Bewerbungsdorf']"), [p.x, p.y]);
    if (covered) continue;
    await page.touchscreen.tap(p.x, p.y);
    // poll: under load the software renderer can take a few seconds to handle the tap
    const moved = await page.waitForFunction(([tx, tz]) => Number(document.querySelector('input[aria-label="Position X"]')?.value) === tx && Number(document.querySelector('input[aria-label="Position Z"]')?.value) === tz, [target.x, target.z], { timeout: 4000 }).then(() => true, () => false);
    if (moved && await action(tools(page), "Platzieren").isEnabled()) return target;
  }
  return null;
}

/** Touch gesture: CDP touch events in Chromium (real input pipeline), synthetic touch PointerEvents in WebKit. */
async function touchGesture(page, engine, tracks, { holdMs = 0, steps = 8, stepMs = 25 } = {}) {
  if (engine === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    const at = (i) => tracks.map((t, id) => ({ x: t.from.x + (t.to.x - t.from.x) * i / steps, y: t.from.y + (t.to.y - t.from.y) * i / steps, id, radiusX: 4, radiusY: 4, force: 1 }));
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(0) });
    if (holdMs) await sleep(holdMs);
    for (let i = 1; i <= steps; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(i) }); await sleep(stepMs); }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    return;
  }
  await host(page).evaluate(async (h, [tracks, holdMs, steps, stepMs]) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const fire = (type, t, i, id) => {
      const x = t.from.x + (t.to.x - t.from.x) * i / steps; const y = t.from.y + (t.to.y - t.from.y) * i / steps;
      const target = type === "pointerdown" ? (document.elementFromPoint(x, y) ?? h) : h;
      target.dispatchEvent(new PointerEvent(type, { pointerId: 100 + id, pointerType: "touch", isPrimary: id === 0, clientX: x, clientY: y, button: type === "pointermove" ? -1 : 0, buttons: type === "pointerup" ? 0 : 1, bubbles: true, cancelable: true, composed: true }));
    };
    tracks.forEach((t, id) => fire("pointerdown", t, 0, id));
    if (holdMs) await wait(holdMs);
    for (let i = 1; i <= steps; i++) { tracks.forEach((t, id) => fire("pointermove", t, i, id)); await wait(stepMs); }
    tracks.forEach((t, id) => fire("pointerup", t, steps, id));
  }, [tracks, holdMs, steps, stepMs]);
}

const onTile = (page, item) => host(page).evaluate((h, [x, z]) => { const p = h.__map.project(x + 0.5, z + 0.5); return h.__map.movableAt(p.x, p.y); }, [item.x, item.z]);

async function shots(device, orient, dark) {
  const name = `${device.id}-${orient}-${dark ? "dark" : "light"}`;
  const { ctx, page, logs } = await open(device, orient, dark);
  await page.screenshot({ type: "jpeg", quality: 80, path: `${SHOTS}/${name}-0-map.jpg` });
  await tap(page, page.getByRole("button", { name: "Laden", exact: true }));
  await sleep(700);
  await page.screenshot({ type: "jpeg", quality: 80, path: `${SHOTS}/${name}-1-shop.jpg` });
  const buy = page.locator('[data-item="scooter_sport_lime"] button');
  await buy.scrollIntoViewIfNeeded();
  await tap(page, buy);
  await tools(page).waitFor({ timeout: 20000 }).catch(() => {});
  await sleep(1200);
  await page.screenshot({ type: "jpeg", quality: 80, path: `${SHOTS}/${name}-2-placing.jpg` });
  const place = tools(page).getByRole("button", { name: /Platzieren/ });
  if (await place.count()) await tap(page, place.first());
  await sleep(1200);
  await page.screenshot({ type: "jpeg", quality: 80, path: `${SHOTS}/${name}-3-selected.jpg` });
  console.log("SHOT", name, logs.length ? JSON.stringify(logs.slice(0, 2)) : "");
  await ctx.close();
}

async function flow(device, orient, dark = false) {
  const N = `${device.id} ${orient} ${dark ? "dark" : "light"}`;
  const phone = size(device, orient).width < 768;
  const { ctx, page, st, logs } = await open(device, orient, dark);
  const start = await layout(page, null);
  check(start.navShown === phone, `${N}: bottom nav ${phone ? "visible" : "absent"} on the plain map`);
  check(start.sw <= start.iw + 1, `${N}: plain map has no horizontal overflow`);
  if (start.navShown) check(Math.abs(start.stage.b - start.nav.t) <= 2, `${N}: map ends exactly at the nav (no strip, nothing under it)`, JSON.stringify({ stage: start.stage, nav: start.nav }));

  // 1. shop sheet by touch
  await tap(page, page.getByRole("button", { name: "Laden", exact: true }));
  await page.locator('[data-sheet="shop"]').waitFor();
  await sleep(500);
  const shop = await layout(page, '[data-sheet="shop"]');
  check(!intersects(shop.root, shop.nav), `${N}: shop sheet does not intersect the bottom nav`, JSON.stringify({ sheet: shop.root, nav: shop.nav }));
  check(shop.root.b <= shop.ih + 0.5, `${N}: shop sheet inside the viewport`, JSON.stringify(shop.root));
  if (phone && orient === "portrait") check(!shop.navShown, `${N}: bottom nav hidden while the shop sheet is open`);

  // 2. buy -> placement tools, all five actions
  const buy = page.locator('[data-item="scooter_sport_lime"] button');
  await buy.scrollIntoViewIfNeeded();
  await tap(page, buy);
  await tools(page).waitFor({ timeout: 20000 });
  await sleep(1000);
  checkPanel(`${N} placing (new item)`, await layout(page, '[aria-label="Gegenstand platzieren"]'), ["Drehen", "Verschieben", "Entfernen", "Abbrechen", "Platzieren"]);
  const item = st.items.at(-1);
  check(item && item.itemType === "scooter_sport_lime" && item.x === null, `${N}: bought item is in the inventory (not placed yet)`);

  // 3. Drehen; tap a tile -> ghost moves there (a free tile for the turned item); Platzieren
  await tap(page, action(tools(page), "Drehen"));
  const target = await tapFreeTile(page);
  check(target !== null, `${N}: tapping a free tile moves the ghost there`, JSON.stringify(target));
  // after a turn + tile tap, the five actions must still be on screen (landscape phones once scrolled «Platzieren» away)
  checkPanel(`${N} placing (after tap + turn)`, await layout(page, '[aria-label="Gegenstand platzieren"]'), ["Drehen", "Verschieben", "Entfernen", "Abbrechen", "Platzieren"]);
  await tap(page, action(tools(page), "Platzieren"));
  await sleep(900);
  check(target && item.x === target.x && item.z === target.z && item.rotation === 1, `${N}: placed + turned on the tapped tile (server state)`, JSON.stringify(item));
  if (await selectedTools(page).isVisible()) checkPanel(`${N} selected item`, await layout(page, '[aria-label="Ausgewählter Gegenstand"]'), ["Drehen", "Verschieben", "Entfernen", "Abbrechen"]);

  // 4. reload -> persisted
  await page.reload(); await waitMap(page);
  check(await onTile(page, item), `${N}: after reload the item stands on its tile`);

  // 5. long-press + drag moves it; persisted after reload
  const prev = { x: item.x, z: item.z };
  const dragInfo = [];
  for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [3, 2]]) {
    const from = await project(page, item.x + 0.5, item.z + 0.5);
    const to = await project(page, item.x + dx + 0.5, item.z + dz + 0.5);
    const vp = page.viewportSize();
    if (to.x < 20 || to.x > vp.width - 60 || to.y < 70 || to.y > vp.height - 20) continue;
    const under = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + "." + (e.getAttribute("class") || "").slice(0, 20) : null; }, [from.x, from.y]);
    await touchGesture(page, device.engine, [{ from, to }], { holdMs: 650, steps: 10, stepMs: 30 });
    await sleep(1300);
    const msg = await page.locator('[aria-label="Verschieben"] [role=status]').textContent().catch(() => null);
    dragInfo.push({ dx, dz, under, msg });
    if (item.x !== prev.x || item.z !== prev.z) break;
  }
  check(item.x !== prev.x || item.z !== prev.z, `${N}: long-press drag moved the item`, JSON.stringify({ prev, now: { x: item.x, z: item.z }, dragInfo }));
  await page.reload(); await waitMap(page);
  check(await onTile(page, item), `${N}: dragged position persisted after reload`);

  // 6. tap item -> Verschieben -> all five actions (Entfernen now enabled) -> simulated keyboard + rotation -> tap tile -> Platzieren
  const at = await project(page, item.x + 0.5, item.z + 0.5);
  await page.touchscreen.tap(at.x, at.y);
  await selectedTools(page).waitFor({ timeout: 8000 }).catch(() => {});
  check(await selectedTools(page).isVisible(), `${N}: tapping the item selects it`);
  await tap(page, action(selectedTools(page), "Verschieben"));
  await tools(page).waitFor();
  await sleep(700);
  const moving = await layout(page, '[aria-label="Gegenstand platzieren"]');
  checkPanel(`${N} moving (placed item)`, moving, ["Drehen", "Verschieben", "Entfernen", "Abbrechen", "Platzieren"]);
  check(await action(tools(page), "Entfernen").isEnabled(), `${N}: «Entfernen» enabled for a placed item`);
  if (phone) {
    // handle: swipe up shows the X/Z fields (touch drag on the grip); then a smaller viewport simulates the on-screen keyboard
    const grip = await tools(page).locator("button[aria-expanded]").first().boundingBox();
    if (device.engine === "chromium") {
      if (process.env.DEBUG) await page.evaluate(() => { window.__ev = []; const g = document.querySelector('[aria-label="Gegenstand platzieren"] button[aria-expanded]'); for (const t of ["pointerdown", "pointerup", "pointercancel", "click"]) g.addEventListener(t, (e) => window.__ev.push(t + " " + Math.round(e.clientY) + " " + e.target.tagName)); });
      await touchGesture(page, "chromium", [{ from: { x: grip.x + grip.width / 2, y: grip.y + 12 }, to: { x: grip.x + grip.width / 2, y: grip.y - 40 } }], { steps: 6 });
      await sleep(500);
      if (process.env.DEBUG) console.log("grip events", await page.evaluate(() => window.__ev), JSON.stringify(grip), await tools(page).locator("button[aria-expanded]").first().getAttribute("aria-expanded"));
      check(await page.locator('input[aria-label="Position X"]').isVisible(), `${N}: swiping the drag handle up opens the position fields`);
    } else {
      await tap(page, tools(page).locator("button[aria-expanded]").first());
      check(await page.locator('input[aria-label="Position X"]').isVisible(), `${N}: tapping the drag handle opens the position fields`);
    }
    const vp = page.viewportSize();
    await page.setViewportSize({ width: vp.width, height: Math.round(vp.height * 0.55) });
    await sleep(900);
    const kb = await layout(page, '[aria-label="Gegenstand platzieren"]');
    check(kb.root.b <= kb.ih + 0.5 && kb.root.t >= 0, `${N}: with the keyboard-sized viewport the panel stays on screen`, JSON.stringify({ panel: kb.root, ih: kb.ih }));
    const canvas = await host(page).evaluate((h) => { const c = h.querySelector("canvas, svg[data-map-renderer]"); const a = h.getBoundingClientRect(); const b = c.getBoundingClientRect(); return { hh: a.height, ch: b.height, hw: a.width, cw: b.width }; });
    check(Math.abs(canvas.hh - canvas.ch) <= 2 && Math.abs(canvas.hw - canvas.cw) <= 2, `${N}: canvas follows the smaller viewport`, JSON.stringify(canvas));
    await page.setViewportSize(vp);
    await sleep(900);
    await tap(page, tools(page).locator("button[aria-expanded]").first());
  }
  const old = { x: item.x, z: item.z };
  const next = await tapFreeTile(page, old);
  await tap(page, action(tools(page), "Platzieren"));
  await sleep(900);
  check(next && item.x === next.x && item.z === next.z, `${N}: «Verschieben» + tap + «Platzieren» moves the item`, JSON.stringify({ next, item }));

  // 7. Entfernen -> back in the inventory, persisted
  const again = await project(page, item.x + 0.5, item.z + 0.5);
  await page.touchscreen.tap(again.x, again.y);
  await selectedTools(page).waitFor({ timeout: 8000 }).catch(() => {});
  await tap(page, action(selectedTools(page), "Entfernen"));
  await sleep(900);
  check(item.x === null && item.z === null, `${N}: «Entfernen» puts the item back into the inventory`);
  await page.reload(); await waitMap(page);
  await tap(page, page.getByRole("button", { name: "Laden", exact: true }));
  check(await page.locator('[data-sheet="shop"]').getByText("Im Inventar").first().isVisible(), `${N}: after reload the item is listed «Im Inventar»`);
  await tap(page, page.getByRole("button", { name: "Laden schliessen" }));
  await sleep(600);
  const closed = await layout(page, null);
  check(closed.navShown === phone, `${N}: bottom nav back after closing the sheet`);
  check(closed.hideFlag === null, `${N}: data-hide-bottom-nav removed after closing`);

  // 8. camera: pinch zoom, two-finger pan, one-finger pan; the page itself never scrolls or zooms
  const hb = await host(page).boundingBox();
  // a centre point whose surroundings hit the bare map (no house label / chip under the fingers)
  const c = await page.evaluate(([x0, y0, w, h]) => {
    const bare = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && !e.closest("button, a, [role=dialog], [role=group]") && !!e.closest("[role=region][aria-label='3D-Bewerbungsdorf']"); };
    for (const fy of [0.45, 0.4, 0.5, 0.35, 0.55]) for (const fx of [0.5, 0.45, 0.55]) {
      const x = x0 + w * fx; const y = y0 + h * fy;
      if ([[0, 0], [-110, 0], [110, 0], [-60, 40], [40, -30], [-30, 30], [110, -30]].every(([dx, dy]) => bare(x + dx, y + dy))) return { x, y };
    }
    return { x: x0 + w / 2, y: y0 + h * 0.45 };
  }, [hb.x, hb.y, hb.width, hb.height]);
  const cam = () => host(page).evaluate((h) => h.__map.camera());
  const z0 = (await cam()).zoom;
  await touchGesture(page, device.engine, [{ from: { x: c.x - 40, y: c.y }, to: { x: c.x - 110, y: c.y } }, { from: { x: c.x + 40, y: c.y }, to: { x: c.x + 110, y: c.y } }], { steps: 10, stepMs: 30 });
  await sleep(900);
  const z1 = (await cam()).zoom;
  check(z1 > z0 + 0.05, `${N}: pinch-out zooms the map (${z0.toFixed(2)} -> ${z1.toFixed(2)})`);
  const c0 = await cam();
  await touchGesture(page, device.engine, [{ from: { x: c.x - 30, y: c.y + 30 }, to: { x: c.x + 50, y: c.y - 30 } }, { from: { x: c.x + 30, y: c.y + 30 }, to: { x: c.x + 110, y: c.y - 30 } }], { steps: 10, stepMs: 25 });
  await sleep(900);
  const c1 = await cam();
  check(Math.hypot(c1.x - c0.x, c1.z - c0.z) > 0.3, `${N}: two-finger pan moves the camera`, JSON.stringify({ c0, c1 }));
  // opposite direction to the two-finger pan: that one can end on the camera's pan limit (Chromium: always, same spot)
  await touchGesture(page, device.engine, [{ from: { x: c.x + 40, y: c.y - 30 }, to: { x: c.x - 60, y: c.y + 40 } }], { steps: 10, stepMs: 20 });
  await sleep(900);
  const c2 = await cam();
  check(Math.hypot(c2.x - c1.x, c2.z - c1.z) > 0.3, `${N}: one-finger pan moves the camera`, JSON.stringify({ c1, c2 }));
  const scroll = await page.evaluate(() => ({ y: scrollY, x: scrollX, scale: visualViewport?.scale ?? 1, selection: String(getSelection() ?? "") }));
  check(scroll.y === 0 && scroll.x === 0 && Math.abs(scroll.scale - 1) < 0.01, `${N}: gestures did not scroll or zoom the page`, JSON.stringify(scroll));
  check(scroll.selection === "", `${N}: no text got selected by the gestures`, JSON.stringify(scroll.selection));
  const css = await host(page).evaluate((h) => { const s = getComputedStyle(h); const st = getComputedStyle(document.querySelector("[data-map-fullscreen]")); return { ta: s.touchAction, us: s.webkitUserSelect || s.userSelect, callout: s.webkitTouchCallout ?? "n/a", stageUs: st.webkitUserSelect || st.userSelect, ob: getComputedStyle(document.documentElement).overscrollBehaviorY, obx: getComputedStyle(document.documentElement).overscrollBehaviorX }; });
  check(css.ta === "none" && css.us === "none" && css.stageUs === "none" && css.ob === "none" && css.obx === "none", `${N}: touch-action none, no text selection, no pull-to-refresh / swipe navigation`, JSON.stringify(css));

  // 9. orientation change: the canvas follows, nothing overflows
  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await sleep(1300);
  const rot = await layout(page, null);
  const canvas = await host(page).evaluate((h) => { const c = h.querySelector("canvas, svg[data-map-renderer]"); const a = h.getBoundingClientRect(); const b = c.getBoundingClientRect(); return { hh: a.height, ch: b.height, hw: a.width, cw: b.width }; });
  check(Math.abs(canvas.hw - rot.iw) <= 2 && Math.abs(canvas.cw - canvas.hw) <= 2 && Math.abs(canvas.ch - canvas.hh) <= 2, `${N}: after rotating, the canvas fills the new width`, JSON.stringify({ canvas, iw: rot.iw }));
  check(rot.sw <= rot.iw + 1, `${N}: after rotating, no horizontal overflow`);
  check(logs.length === 0, `${N}: no page errors`, JSON.stringify(logs.slice(0, 3)));
  await ctx.close();
}

/**
 * One map panel at a time on phones (tester finding, w320): Suche -> Laden -> buy (placement) -> Abbrechen -> Suche.
 * Also: the map search select is >= 44px, and the palace celebration card never covers the item / placement panel.
 */
async function exclusive(device, viewport) {
  const N = `${device.id} ${viewport.width}x${viewport.height} panels`;
  const palaceApp = { ...apps[0], id: "p1", company: "Palast AG", status: "offer", created_at: "2026-08-01" };
  const { ctx, page, logs } = await open(device, "portrait", false, { extraApps: [palaceApp], viewport });
  const palace = page.getByTestId("palace-celebration");
  check(await palace.isVisible(), `${N}: palace celebration shows on the plain map`);
  const search = page.locator('[data-map-panel="search"]');
  await tap(page, page.locator("button[aria-expanded]", { hasText: "Suche" }).first());
  check(await search.isVisible(), `${N}: «Suche» opens its panel`);
  check(!(await palace.isVisible()), `${N}: palace card steps aside while «Suche» is open`);
  const sel = await search.locator("select").boundingBox();
  check(!!sel && Math.round(sel.height) >= 44, `${N}: status select >= 44px (subpixel-rounded)`, JSON.stringify(sel));
  await tap(page, page.getByRole("button", { name: "Laden", exact: true }));
  await page.locator('[data-sheet="shop"]').waitFor();
  check(!(await search.isVisible()), `${N}: opening «Laden» closes «Suche»`);
  const buy = page.locator('[data-item="scooter_sport_lime"] button');
  await buy.scrollIntoViewIfNeeded();
  await tap(page, buy);
  await tools(page).waitFor({ timeout: 20000 });
  await sleep(600);
  const open1 = await page.evaluate(() => [...document.querySelectorAll("[data-map-panel]")].map((e) => e.getAttribute("data-map-panel")));
  check(open1.length === 1 && open1[0] === "placement", `${N}: while placing only the placement panel is open`, JSON.stringify(open1));
  check(!(await palace.isVisible()), `${N}: palace card hidden while placing`);
  const target = await tapFreeTile(page);
  check(target !== null, `${N}: tile tapped`);
  await tap(page, action(tools(page), "Platzieren"));
  await sleep(900);
  const after = await page.evaluate(() => [...document.querySelectorAll("[data-map-panel]")].map((e) => e.getAttribute("data-map-panel")));
  check(after.length <= 1, `${N}: after placing at most one panel is open`, JSON.stringify(after));
  if (await selectedTools(page).isVisible()) {
    const pr = (await palace.isVisible()) ? await palace.boundingBox() : null; const tr = await selectedTools(page).boundingBox();
    check(!pr || !(pr.x < tr.x + tr.width && pr.x + pr.width > tr.x && pr.y < tr.y + tr.height && pr.y + pr.height > tr.y), `${N}: palace card does not cover the selected-item panel`, JSON.stringify({ pr, tr }));
  }
  await tap(page, page.locator("button[aria-expanded]", { hasText: "Suche" }).first());
  await sleep(500);
  const open2 = await page.evaluate(() => [...document.querySelectorAll("[data-map-panel]")].map((e) => e.getAttribute("data-map-panel")));
  check(open2.length === 1 && open2[0] === "search", `${N}: opening «Suche» closes shop / item panels`, JSON.stringify(open2));
  await tap(page, page.locator("button[aria-expanded]", { hasText: "Suche" }).first());
  await sleep(500);
  const m = await layout(page, null);
  check(m.sw <= m.iw + 1, `${N}: no horizontal overflow`);
  check(logs.length === 0, `${N}: no page errors`, JSON.stringify(logs.slice(0, 3)));
  await ctx.close();
}

/** Friend island (/friends/mock-*, read-only, dev mock data when Supabase is stubbed): same fullscreen map chrome, no placement. */
async function friendIsland(device, orient, dark) {
  const N = `${device.id} ${orient} ${dark ? "dark" : "light"} friend island`;
  const phone = size(device, orient).width < 768;
  const { ctx, page, logs } = await open(device, orient, dark, { path: "/friends/mock-1" });
  await page.waitForSelector("text=Mia Muster", { timeout: 60000 }).catch(() => {});
  const m = await layout(page, "[data-map-fullscreen]");
  check(m.navShown === phone, `${N}: bottom nav ${phone ? "visible" : "absent"}`);
  check(m.sw <= m.iw + 1, `${N}: no horizontal overflow (${m.sw} <= ${m.iw})`);
  check(m.sh <= m.ih + 1 && m.scrollY === 0, `${N}: no page scroll`, JSON.stringify({ sh: m.sh, ih: m.ih, y: m.scrollY }));
  if (m.navShown) check(Math.abs(m.stage.b - m.nav.t) <= 2, `${N}: map ends exactly at the nav (no strip)`, JSON.stringify({ stage: m.stage, nav: m.nav }));
  const floor = m.navShown ? m.nav.t : m.ih;
  const bad = m.controls.filter((c) => !c.grip && (c.w < 44 || c.h < 44 || c.b > floor + 0.5 || c.r > m.iw + 0.5 || c.l < -0.5 || c.covered));
  check(m.controls.length > 0 && bad.length === 0, `${N}: every map control >= 44px, on screen and not under the nav (${m.controls.length})`, JSON.stringify(bad.slice(0, 4)));
  const edit = await page.getByRole("button", { name: /^(Laden|Inventar|Platzieren)$/ }).count();
  check(edit === 0, `${N}: read-only (no shop / inventory / placement buttons)`);
  check(logs.length === 0, `${N}: no page errors`, JSON.stringify(logs.slice(0, 3)));
  await page.screenshot({ type: "jpeg", quality: 80, path: `${SHOTS}/${device.id}-${orient}-${dark ? "dark" : "light"}-4-friend-island.jpg` });
  await ctx.close();
}

try {
  const run = (part) => MODE === "all" || MODE === part || (MODE === "test" && (part === "flow" || part === "panels"));
  if (run("panels")) {
    const small = [{ id: "w320", engine: "webkit" }, { id: "w320", engine: "chromium" }];
    for (const d of [...small.map((x) => ({ ...x, viewport: { width: 320, height: 568 } })), ...DEVICES.filter((d) => d.id !== "ipad").map((d) => ({ ...d, viewport: size(d, "portrait") }))]) {
      try { await exclusive(d, d.viewport); } catch (error) { check(false, `${d.id} ${d.engine} panels: crashed`, String(error).slice(0, 300)); }
    }
  }
  if (run("shots")) for (const device of DEVICES) for (const orient of ORIENTS) for (const dark of [false, true]) await shots(device, orient, dark);
  if (run("flow")) for (const device of DEVICES) for (const orient of ORIENTS) for (const dark of THEMES) {
    try { await flow(device, orient, dark); } catch (error) { check(false, `${device.id} ${orient} ${dark ? "dark" : "light"}: flow crashed`, String(error).slice(0, 300)); }
  }
  if (run("views")) for (const device of DEVICES) for (const orient of ORIENTS) for (const dark of THEMES) {
    try { await friendIsland(device, orient, dark); } catch (error) { check(false, `${device.id} ${orient}: friend island crashed`, String(error).slice(0, 300)); }
  }
} finally {
  for (const b of Object.values(browsers)) await b.close();
}
console.log(`${passes} passed, ${failures} failed`);
console.log(failures ? `${failures} FAILED` : "ALL PASSED");
process.exit(failures ? 1 : 0);
